import { ROW_COLUMNS, reconcileStats, rowDigest, sha256, stableJson } from './prepare.js';

export function assertPrepared(prepared) {
  if (stableJson(prepared.manifest) !== prepared.manifestJson || sha256(prepared.manifestJson) !== prepared.importId || prepared.importId !== prepared.manifestSha256 ||
      rowDigest(prepared.rows) !== prepared.manifest.canonicalSha256 || stableJson(reconcileStats(prepared.rows)) !== stableJson(prepared.manifest.reconciliation)) {
    throw new Error('Prepared import integrity check failed');
  }
}

export function stagingCommands(prepared) {
  assertPrepared(prepared);
  const m = prepared.manifest;
  return [
    {
      sql: `INSERT INTO audit_history_imports (import_id, source_project, manifest_json, manifest_sha256,
        backup_sha256, canonical_sha256, expected_rows, first_source_at, last_source_at, legacy_end_exclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(import_id) DO NOTHING`,
      params: [prepared.importId, m.sourceProject, prepared.manifestJson, prepared.manifestSha256,
        m.backupSha256, m.canonicalSha256, m.reconciliation.rows, m.reconciliation.firstSourceAt,
        m.reconciliation.lastSourceAt, m.legacyEndExclusive],
    },
    ...prepared.rows.map(row => ({
      sql: `INSERT INTO audit_history_events (import_id, ${ROW_COLUMNS.join(', ')})
        VALUES (${Array(ROW_COLUMNS.length + 1).fill('?').join(', ')}) ON CONFLICT(import_id, source_id) DO NOTHING`,
      params: [prepared.importId, ...ROW_COLUMNS.map(key => row[key])],
    })),
  ];
}

async function readImport(db, prepared) {
  const state = await db.prepare('SELECT * FROM audit_history_imports WHERE import_id = ?').bind(prepared.importId).first();
  if (!state || state.manifest_json !== prepared.manifestJson || state.manifest_sha256 !== prepared.manifestSha256) throw new Error('Stored import manifest mismatch');
  return state;
}

async function checkLiveBoundary(db, prepared) {
  const liveStart = await db.prepare('SELECT started_at FROM audit_collection WHERE id = 1').first('started_at');
  if (liveStart && liveStart < prepared.manifest.legacyEndExclusive) throw new Error('Legacy boundary overlaps live collection');
}

export async function stageImport(db, prepared, batchSize = 50) {
  const commands = stagingCommands(prepared);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('Invalid import batch size');
  await checkLiveBoundary(db, prepared);
  const statement = command => db.prepare(command.sql).bind(...command.params);
  await statement(commands[0]).run();
  const state = await readImport(db, prepared);
  if (['verifying', 'verified'].includes(state.state)) return state.state;
  if (state.state !== 'staging') throw new Error('Import has been revoked or failed; review a new snapshot');
  // Each bounded batch is atomic. Interrupted runs remain invisible to reports;
  // retrying the same source IDs resumes safely without replacing existing rows.
  for (let index = 1; index < commands.length; index += batchSize) {
    await db.batch(commands.slice(index, index + batchSize).map(statement));
  }
  return 'staging';
}

export function verificationReceipt(prepared, rows, now = new Date()) {
  assertPrepared(prepared);
  const stats = reconcileStats(rows);
  const digest = rowDigest(rows);
  if (rows.length !== new Set(rows.map(row => row.source_id)).size || digest !== prepared.manifest.canonicalSha256 ||
      stableJson(stats) !== stableJson(prepared.manifest.reconciliation)) throw new Error('D1 read-back reconciliation mismatch');
  return {
    format: 'asciilens-history-receipt-v1', importId: prepared.importId,
    manifestSha256: prepared.manifestSha256, backupSha256: prepared.manifest.backupSha256,
    canonicalSha256: digest, rowCount: rows.length, reconciliation: stats,
    verifiedAt: now.toISOString(), sourceDeletionApproved: false,
  };
}

export function publicationCommand(prepared, receipt) {
  if (receipt.importId !== prepared.importId || receipt.manifestSha256 !== prepared.manifestSha256 ||
      receipt.canonicalSha256 !== prepared.manifest.canonicalSha256 || receipt.backupSha256 !== prepared.manifest.backupSha256 ||
      stableJson(receipt.reconciliation) !== stableJson(prepared.manifest.reconciliation) || receipt.sourceDeletionApproved !== false) throw new Error('Invalid history receipt');
  return {
    sql: `UPDATE audit_history_imports SET state = 'verified', verified_at = ?, receipt_json = ?
      WHERE import_id = ? AND state = 'verifying' AND manifest_sha256 = ?`,
    params: [receipt.verifiedAt, stableJson(receipt), prepared.importId, prepared.manifestSha256],
  };
}

export async function verifyImport(db, prepared, now = new Date()) {
  assertPrepared(prepared);
  await checkLiveBoundary(db, prepared);
  let state = await readImport(db, prepared);
  if (!['staging', 'verifying', 'verified'].includes(state.state)) throw new Error('Import cannot be verified in this state');
  // Triggers freeze the snapshot before paged reads, preventing a write/read race.
  // Interrupted verification can be retried; no partial snapshot is published.
  await db.prepare("UPDATE audit_history_imports SET state = 'verifying' WHERE import_id = ? AND state = 'staging'").bind(prepared.importId).run();
  const rows = [];
  let after = '';
  while (true) {
    const page = await db.prepare(`SELECT ${ROW_COLUMNS.join(', ')} FROM audit_history_events
      WHERE import_id = ? AND source_id > ? ORDER BY source_id LIMIT 500`).bind(prepared.importId, after).all();
    rows.push(...page.results);
    if (page.results.length < 500) break;
    after = page.results.at(-1).source_id;
  }
  let receipt;
  try {
    receipt = verificationReceipt(prepared, rows, now);
  } catch (error) {
    await db.prepare("UPDATE audit_history_imports SET state = 'failed' WHERE import_id = ? AND state = 'verifying'").bind(prepared.importId).run();
    throw error;
  }
  state = await readImport(db, prepared);
  if (state.state === 'verified') return JSON.parse(state.receipt_json);
  const command = publicationCommand(prepared, receipt);
  await db.batch([db.prepare(command.sql).bind(...command.params)]);
  state = await readImport(db, prepared);
  if (state.state !== 'verified' || state.receipt_json !== stableJson(receipt)) throw new Error('History publication was not confirmed');
  return JSON.parse(state.receipt_json);
}

export async function revokeImport(db, importId) {
  await db.prepare("UPDATE audit_history_imports SET state = 'rolled_back' WHERE import_id = ? AND state != 'rolled_back'").bind(importId).run();
  const state = await db.prepare('SELECT state FROM audit_history_imports WHERE import_id = ?').bind(importId).first('state');
  if (state !== 'rolled_back') throw new Error('History revocation was not confirmed');
  // No DELETE: rows, provenance and receipts remain available for investigation.
}

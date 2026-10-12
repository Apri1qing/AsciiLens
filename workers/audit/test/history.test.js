import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyMigration, localHistoryDatabase } from '../history/local-db.js';
import { prepareImport, ROW_COLUMNS, sha256, sourceTimestamp } from '../history/prepare.js';
import { publicationCommand, revokeImport, stageImport, stagingCommands, verificationReceipt, verifyImport } from '../history/importer.js';
import { run } from '../history/cli.js';
import { auditWindowForRange } from '../../../shared/audit.js';
import { readSummary } from '../storage.js';

const now = new Date('2026-10-12T03:00:00Z');
function fixture() {
  const rows = [
    { id: '9007199254740993', created_at: '2026-10-10T23:59:59.999999+08:00', event_name: 'page_view', session_id: 'a' },
    { id: '2', created_at: '2026-10-10T16:00:00.000001Z', event_name: 'page_view', session_id: 'a' },
    { id: '3', created_at: '2026-10-11T10:00:00Z', event_name: 'image_upload', session_id: 'b', path: '/?private=1', referrer: 'https://example.com/private?secret=1', image: 'data:private', metadata: { file_type: 'image/png', file_size_bucket: '<500kb', source: 'upload', filename: 'private.png' } },
    { id: '4', created_at: '2026-10-11T15:59:59.999999Z', event_name: 'export_png', session_id: 'b', metadata: { mode: 'full', color_mode: 'mono', selection_count: 1 } },
    { id: '5', created_at: '2026-10-11T15:59:59.999998Z', event_name: 'selection_create', session_id: 'a', metadata: { shape_type: 'rect' } },
    { id: '6', created_at: '2026-10-11T15:59:59.999999Z', event_name: 'export_png_failed', session_id: 'b', metadata: { reason: 'private.png export failed' } },
  ];
  const backup = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const manifest = {
    format: 'asciilens-history-v1', sourceProject: 'ivpegtwknknqlpmglreh', sourceTable: 'public.audit_events', scope: 'all_rows',
    backupSha256: sha256(backup), snapshotAt: '2026-10-12T00:00:00Z', legacyEndExclusive: '2026-10-11T16:00:00Z',
    // Independent expected source evidence, not computed by the import code.
    reconciliation: {
      rows: 6, sessions: 2,
      events: { page_view: 2, image_upload: 1, export_png: 1, selection_create: 1, export_png_failed: 1 },
      firstSourceAt: '2026-10-10T15:59:59.999999Z', lastSourceAt: '2026-10-11T15:59:59.999999Z',
      days: {
        '2026-10-10': { rows: 1, sessions: 1, events: { page_view: 1 } },
        '2026-10-11': { rows: 5, sessions: 2, events: { page_view: 1, image_upload: 1, export_png: 1, selection_create: 1, export_png_failed: 1 } },
      },
    },
  };
  return { rows, backup, manifest, prepared: prepareImport(backup, manifest, now) };
}

async function setup(t) {
  const local = await localHistoryDatabase();
  t.after(() => local.mf.dispose());
  return local;
}

async function execute(db, commands) {
  return db.batch(commands.map(command => db.prepare(command.sql).bind(...command.params)));
}

test('backup normalization preserves bigint IDs and exact microseconds, strips private fields', () => {
  const { prepared } = fixture();
  const first = prepared.rows[0];
  assert.equal(first.source_id, '9007199254740993');
  assert.equal(first.source_created_at, '2026-10-10T15:59:59.999999Z');
  assert.equal(first.created_at, '2026-10-10T15:59:59.999Z');
  assert.equal(prepared.rows[2].path, '/');
  assert.equal(prepared.rows[2].referrer, 'example.com');
  assert.ok(!JSON.stringify(prepared.rows).includes('private'));
  assert.equal(JSON.parse(prepared.rows[5].metadata).reason, 'unknown');
  assert.equal(prepared.manifest.reconciliation.rows, 6);
  assert.deepEqual(Object.keys(first), ROW_COLUMNS);
  assert.equal(sourceTimestamp('2026-10-10 23:59:59.999999+08').exact, first.source_created_at);
  for (const value of ['2026-02-30T00:00:00Z', '2026-10-12T00:00:00', '2026-10-12T00:00:60Z', '2026-10-12T00:00:00+15:00']) assert.throws(() => sourceTimestamp(value));
});

test('preparation rejects wrong checksums, source identities, duplicate IDs, lossy IDs, future or overlap rows and source-stat mismatches', () => {
  const { backup, manifest, rows } = fixture();
  for (const change of [
    { backupSha256: '0'.repeat(64) }, { sourceProject: 'wrong' }, { scope: 'filtered_subset' },
    { snapshotAt: '2027-01-01T00:00:00Z' }, { legacyEndExclusive: '2026-10-11T10:00:00Z' },
    { reconciliation: { ...manifest.reconciliation, rows: 5 } },
    { reconciliation: { ...manifest.reconciliation, sessions: 3 } },
    { reconciliation: { ...manifest.reconciliation, firstSourceAt: '2026-10-10T15:59:59.999000Z' } },
    { reconciliation: { ...manifest.reconciliation, days: {} } },
  ]) assert.throws(() => prepareImport(backup, { ...manifest, ...change }, now));
  for (const altered of [[...rows, rows[0]], [{ ...rows[0], id: Number('9007199254740993') }], [{ ...rows[0], event_name: 'INVALID' }]]) {
    const bytes = Buffer.from(altered.map(row => JSON.stringify(row)).join('\n'));
    assert.throws(() => prepareImport(bytes, { ...manifest, backupSha256: sha256(bytes) }, now));
  }
});

test('0002 upgrades an existing 0001 database without changing live rows, marker or the disabled-history path', async t => {
  const { db, mf } = await localHistoryDatabase({ history: false });
  t.after(() => mf.dispose());
  const liveAt = '2026-10-12T01:00:00.000Z';
  await db.batch([
    db.prepare("INSERT INTO audit_events (created_at, event_name, session_id) VALUES (?, 'page_view', 'live')").bind(liveAt),
    db.prepare('INSERT INTO audit_collection (id, started_at) VALUES (1, ?)').bind(liveAt),
  ]);
  const before = await readSummary(db, auditWindowForRange('today', now), now);
  await applyMigration(db, '0002_history.sql');
  assert.deepEqual(await readSummary(db, auditWindowForRange('today', now), now), before);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_history_events').first('n'), 0);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_history_imports').first('n'), 0);
});

test('staging is resumable/idempotent, invisible before verification, and cannot advance by a state flip', async t => {
  const { db } = await setup(t);
  const { prepared } = fixture();
  const commands = stagingCommands(prepared);
  await execute(db, commands.slice(0, 3)); // Simulate an interrupted operator batch.
  await stageImport(db, prepared, 2);
  await stageImport(db, prepared, 2);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_history_events').first('n'), 6);
  const summary = await readSummary(db, auditWindowForRange('7d', now), now, true);
  assert.equal(summary.totals.events, 0);
  assert.equal(summary.coverage.history.status, 'unverified');
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_collection').first('n'), 0);
  await assert.rejects(db.prepare("UPDATE audit_history_imports SET state = 'verified'").run());
  await db.prepare("UPDATE audit_history_imports SET state = 'verifying'").run();
  await assert.rejects(db.prepare("UPDATE audit_history_imports SET state = 'verified', verified_at = '2026-10-12T03:00:00.000Z', receipt_json = '{}'").run());
  await assert.rejects(db.prepare("UPDATE audit_history_events SET path = '/forged'").run());
  await assert.rejects(db.prepare('DELETE FROM audit_history_events').run());
  const receipt = await verifyImport(db, prepared, now);
  assert.equal(receipt.rowCount, 6);
  assert.equal(receipt.sourceDeletionApproved, false);
  assert.equal(receipt.canonicalSha256, prepared.manifest.canonicalSha256);
  assert.equal(await stageImport(db, prepared), 'verified');
  assert.deepEqual(await verifyImport(db, prepared, now), receipt);
});

test('read-back digest detects a changed allowed field even when counts and time ranges match', async t => {
  const { db } = await setup(t);
  const { prepared } = fixture();
  const commands = stagingCommands(prepared);
  commands[1].params[1 + ROW_COLUMNS.indexOf('path')] = '/wrong';
  await execute(db, commands);
  await assert.rejects(verifyImport(db, prepared, now), /read-back reconciliation/u);
  assert.equal(await db.prepare('SELECT state FROM audit_history_imports').first('state'), 'failed');
  assert.equal((await readSummary(db, auditWindowForRange('7d', now), now, true)).totals.events, 0);
});

test('an incomplete source copy fails reconciliation and an erroneous chunk rolls back atomically', async t => {
  const { db } = await setup(t);
  const { prepared } = fixture();
  const commands = stagingCommands(prepared);
  await execute(db, commands.slice(0, 1));
  await assert.rejects(execute(db, [commands[1], { sql: 'INSERT INTO nonexistent_table VALUES (?)', params: [1] }]));
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_history_events').first('n'), 0);
  await execute(db, commands.slice(1, 3));
  await assert.rejects(verifyImport(db, prepared, now), /read-back reconciliation/u);
  assert.equal(await db.prepare('SELECT state FROM audit_history_imports').first('state'), 'failed');
});

test('history/live summaries preserve Shanghai boundaries, original collection start, and distinguish history status', async t => {
  const { db, mf } = await setup(t);
  const { prepared } = fixture();
  const liveAt = '2026-10-12T01:00:00.000Z';
  await db.batch([
    db.prepare("INSERT INTO audit_events (created_at, event_name, session_id) VALUES (?, 'page_view', 'live')").bind(liveAt),
    db.prepare('INSERT INTO audit_collection (id, started_at) VALUES (1, ?)').bind(liveAt),
  ]);
  await stageImport(db, prepared);
  await verifyImport(db, prepared, now);
  for (const [range, count] of [['yesterday', 5], ['today', 1], ['7d', 7]]) {
    const summary = await readSummary(db, auditWindowForRange(range, now), now, true);
    assert.equal(summary.totals.events, count);
    assert.equal(summary.coverage.collectionStartedAt, liveAt);
    assert.equal(summary.coverage.live.collectionStartedAt, liveAt);
    assert.equal(summary.coverage.history.status, 'verified_snapshot');
    assert.equal(summary.coverage.history.legacyEndExclusive, '2026-10-11T16:00:00.000Z');
    assert.equal(summary.coverage.statusScope, 'live_collection_only');
  }
  const daily = await readSummary(db, auditWindowForRange('yesterday', now), now, true);
  assert.deepEqual(daily.totals, { events: 5, pageViews: 1, sessions: 2, uploads: 1, exports: 1, selectionsCreated: 1 });
  assert.deepEqual(daily.uploadTypes, [['image/png', 1]]);
  assert.deepEqual(daily.uploadSizeBuckets, [['<500kb', 1]]);
  assert.deepEqual(daily.topEvents.map(([name]) => name), ['page_view', 'image_upload', 'selection_create', 'export_png', 'export_png_failed']);
  const disabled = await readSummary(db, auditWindowForRange('7d', now), now);
  assert.equal(disabled.totals.events, 1);
  assert.equal(disabled.coverage.historicalData, 'not_checked');
  assert.equal(disabled.coverage.history.status, 'disabled');
  const response = await mf.dispatchFetch('https://test.local/api/audit/summary?range=7d', { headers: { Authorization: 'Bearer local-history-test-only' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).summary.coverage.history.status, 'verified_snapshot');
});

test('legacy/live overlap is rejected both before staging and at atomic publication', async t => {
  const { db } = await setup(t);
  const { prepared } = fixture();
  await db.prepare('INSERT INTO audit_collection (id, started_at) VALUES (1, ?)').bind('2026-10-11T10:00:00.000Z').run();
  await assert.rejects(stageImport(db, prepared), /overlaps/u);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_history_imports').first('n'), 0);
  // Exercise the database guard independently of the operator's preflight.
  await execute(db, stagingCommands(prepared));
  await db.prepare("UPDATE audit_history_imports SET state = 'verifying'").run();
  await assert.rejects(verifyImport(db, prepared, now), /overlaps/u);
  await assert.rejects(execute(db, [publicationCommand(prepared, verificationReceipt(prepared, prepared.rows, now))]), /History reconciliation/u);
});

test('only one snapshot per source can be active; revocation hides history without deleting it or live rows', async t => {
  const { db } = await setup(t);
  const { prepared, backup, manifest } = fixture();
  await stageImport(db, prepared);
  await verifyImport(db, prepared, now);
  const reordered = Buffer.from(backup.toString().trim().split('\n').reverse().join('\n'));
  const second = prepareImport(reordered, { ...manifest, backupSha256: sha256(reordered) }, now);
  await stageImport(db, second);
  await assert.rejects(verifyImport(db, second, now));
  assert.equal((await readSummary(db, auditWindowForRange('7d', now), now, true)).totals.events, 6);
  await revokeImport(db, prepared.importId);
  assert.equal((await readSummary(db, auditWindowForRange('7d', now), now, true)).totals.events, 0);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_history_events').first('n'), 12);
  await verifyImport(db, second, now);
  assert.equal((await readSummary(db, auditWindowForRange('7d', now), now, true)).totals.events, 6);
});

test('empty full-source snapshots require evidence and a receipt, without inventing earlier coverage', async t => {
  const { db } = await setup(t);
  const { manifest } = fixture();
  const backup = Buffer.from('');
  const prepared = prepareImport(backup, { ...manifest, backupSha256: sha256(backup), reconciliation: { rows: 0, sessions: 0, events: {}, firstSourceAt: null, lastSourceAt: null, days: {} } }, now);
  await stageImport(db, prepared);
  const receipt = await verifyImport(db, prepared, now);
  assert.equal(receipt.rowCount, 0);
  const summary = await readSummary(db, auditWindowForRange('7d', now), now, true);
  assert.equal(summary.coverage.history.status, 'verified_snapshot');
  assert.equal(summary.coverage.history.firstRecordedAt, null);
  assert.equal(summary.coverage.collectionStartedAt, null);
  assert.equal(summary.coverage.status, 'not_started');
  assert.throws(() => publicationCommand(prepared, { ...receipt, sourceDeletionApproved: true }));
});

test('offline CLI rehearses restore in disposable D1, creates private files and never approves production/deletion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asciilens-history-fixture-'));
  const { backup, manifest } = fixture();
  const backupPath = join(dir, 'synthetic.ndjson');
  const manifestPath = join(dir, 'synthetic-manifest.json');
  const output = join(dir, 'private-output');
  await writeFile(backupPath, backup, { mode: 0o600 });
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  const result = await run(['rehearse', backupPath, manifestPath, output]);
  assert.equal(result.productionImportConfirmed, false);
  assert.equal(result.sourceDeletionApproved, false);
  assert.equal((await stat(output)).mode & 0o777, 0o700);
  assert.equal((await stat(join(output, 'plan.json'))).mode & 0o777, 0o600);
  const receipt = JSON.parse(await readFile(join(output, 'LOCAL-REHEARSAL-ONLY.json'), 'utf8'));
  assert.equal(receipt.environment, 'ephemeral_local_D1');
  assert.equal(receipt.rowCount, 6);
  await assert.rejects(run(['prepare', backupPath, manifestPath, output]));
  await assert.rejects(run(['rehearse', backupPath, manifestPath, join(dir, 'remote'), '--remote']));
});

test('source/destination reconciliation is uncapped even when the public report truncates at 10,000', async t => {
  const { db } = await setup(t);
  const { manifest } = fixture();
  const rows = Array.from({ length: 10001 }, (_, index) => ({ id: String(index + 1), created_at: '2026-10-11T10:00:00Z', event_name: 'page_view', session_id: 'one' }));
  const backup = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n'));
  const prepared = prepareImport(backup, { ...manifest, backupSha256: sha256(backup), reconciliation: {
    rows: 10001, sessions: 1, events: { page_view: 10001 }, firstSourceAt: '2026-10-11T10:00:00.000000Z', lastSourceAt: '2026-10-11T10:00:00.000000Z',
    days: { '2026-10-11': { rows: 10001, sessions: 1, events: { page_view: 10001 } } },
  } }, now);
  await execute(db, stagingCommands(prepared).slice(0, 1));
  // Bulk fixtures are created solely in this disposable local D1.
  await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < 10001)
    INSERT INTO audit_history_events (import_id, ${ROW_COLUMNS.join(', ')})
    SELECT ?, CAST(x AS TEXT), '2026-10-11T10:00:00.000000Z', '2026-10-11T10:00:00.000Z',
      'page_view', 'one', '/', '', '', NULL, NULL, '', '{}' FROM n`).bind(prepared.importId).run();
  const receipt = await verifyImport(db, prepared, now);
  assert.equal(receipt.rowCount, 10001);
  assert.equal(receipt.reconciliation.events.page_view, 10001);
  const summary = await readSummary(db, auditWindowForRange('7d', now), now, true);
  assert.equal(summary.totals.events, 10000);
  assert.equal(summary.truncated, true);
  assert.equal(summary.coverage.history.importedRows, 10001);
});

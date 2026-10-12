import { createHash } from 'node:crypto';
import { sanitizeAuditEvent } from '../../../shared/audit-event.js';
import { formatShanghaiDate } from '../../../shared/audit.js';

export const SOURCE_PROJECT = 'ivpegtwknknqlpmglreh';
export const ROW_COLUMNS = ['source_id', 'source_created_at', 'created_at', 'event_name', 'session_id', 'path', 'referrer', 'locale', 'viewport_width', 'viewport_height', 'user_agent', 'metadata'];

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

// Preserve PostgreSQL microseconds and timezone meaning; only the separate
// reporting timestamp is floored to milliseconds (Shanghai windows use midnight).
export function sourceTimestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/u.exec(value);
  requireValue(match, 'Invalid source timestamp');
  const [, year, month, day, hour, minute, second, fraction = '', zone] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const local = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
  requireValue(Number.isFinite(local.getTime()) &&
    stableJson([local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()]) === stableJson(parts), 'Invalid source timestamp');
  let offset = 0;
  if (zone !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    const hours = Number(digits.slice(0, 2));
    const minutes = Number(digits.slice(2));
    requireValue(hours <= 14 && minutes < 60 && (hours < 14 || minutes === 0), 'Invalid source timezone');
    offset = (zone[0] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60000;
  }
  const utc = new Date(local.getTime() - offset).toISOString();
  requireValue(utc.length === 24, 'Source timestamp is outside the supported year range');
  const micros = fraction.padEnd(6, '0');
  return { exact: `${utc.slice(0, 19)}.${micros}Z`, millis: `${utc.slice(0, 19)}.${micros.slice(0, 3)}Z` };
}

function sourceId(value) {
  const id = Number.isSafeInteger(value) ? String(value) : value;
  requireValue(typeof id === 'string' && /^[1-9]\d{0,18}$/u.test(id) && BigInt(id) <= 9223372036854775807n, 'Source ID must be a lossless positive bigint string');
  return id;
}

export function normalizeSourceRow(row) {
  requireValue(row && typeof row === 'object' && !Array.isArray(row), 'Invalid source row');
  const timestamp = sourceTimestamp(row.created_at);
  const event = sanitizeAuditEvent({
    eventName: row.event_name, sessionId: row.session_id, path: row.path,
    referrer: row.referrer, locale: row.locale,
    viewport: { width: row.viewport_width, height: row.viewport_height }, metadata: row.metadata,
  }, row.user_agent);
  requireValue(event && event.eventName === row.event_name, 'Invalid source event name');
  return {
    source_id: sourceId(row.id), source_created_at: timestamp.exact, created_at: timestamp.millis,
    event_name: event.eventName, session_id: event.sessionId, path: event.path,
    referrer: event.referrer, locale: event.locale,
    viewport_width: event.viewport.width, viewport_height: event.viewport.height,
    user_agent: event.userAgent, metadata: stableJson(event.metadata),
  };
}

export function rowDigest(rows) {
  const hash = createHash('sha256');
  for (const row of [...rows].sort((a, b) => a.source_id < b.source_id ? -1 : a.source_id > b.source_id ? 1 : 0)) {
    hash.update(stableJson(Object.fromEntries(ROW_COLUMNS.map(key => [key, row[key]]))));
    hash.update('\n');
  }
  return hash.digest('hex');
}

// Uncapped source reconciliation, independent of the public 10,000-row summary.
// Export this evidence from the same immutable source snapshot, not from a
// paginated public summary or by copying values from the importer's output.
export function reconcileStats(rows) {
  function counters(items) {
    const events = Object.create(null);
    for (const row of items) events[row.event_name] = (events[row.event_name] || 0) + 1;
    return { rows: items.length, sessions: new Set(items.map(row => row.session_id).filter(Boolean)).size, events };
  }
  const byDay = new Map();
  for (const row of rows) {
    const day = formatShanghaiDate(new Date(row.created_at));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(row);
  }
  const times = rows.map(row => row.source_created_at).sort();
  return {
    ...counters(rows), firstSourceAt: times[0] || null, lastSourceAt: times.at(-1) || null,
    days: Object.fromEntries([...byDay].sort().map(([day, items]) => [day, counters(items)])),
  };
}

export function prepareImport(backup, manifest, now = new Date()) {
  requireValue(Buffer.isBuffer(backup), 'Backup must be exact NDJSON file bytes');
  requireValue(backup.length <= 128 * 1024 * 1024, 'Backup exceeds the reviewed 128 MiB offline limit');
  requireValue(manifest?.format === 'asciilens-history-v1' && manifest.sourceProject === SOURCE_PROJECT && manifest.sourceTable === 'public.audit_events' && manifest.scope === 'all_rows', 'Wrong source or incomplete snapshot scope');
  requireValue(/^[a-f0-9]{64}$/u.test(manifest.backupSha256) && sha256(backup) === manifest.backupSha256, 'Backup checksum mismatch');
  const snapshot = sourceTimestamp(manifest.snapshotAt);
  const boundary = sourceTimestamp(manifest.legacyEndExclusive);
  const nowExact = sourceTimestamp(now.toISOString()).exact;
  requireValue(boundary.exact.endsWith('000Z') && snapshot.exact <= nowExact && boundary.exact <= nowExact, 'Snapshot/cutover must be past timestamps with millisecond cutover precision');
  const rows = [];
  const ids = new Set();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(backup);
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let row;
    try { row = normalizeSourceRow(JSON.parse(line)); } catch { throw new Error(`Invalid source row at line ${index + 1}`); }
    requireValue(!ids.has(row.source_id), 'Duplicate source ID in backup');
    requireValue(row.source_created_at < boundary.exact && row.source_created_at <= snapshot.exact, 'Source row exceeds snapshot or legacy boundary');
    ids.add(row.source_id);
    rows.push(row);
  }
  requireValue(stableJson(reconcileStats(rows)) === stableJson(manifest.reconciliation), 'Source count/time/daily summary reconciliation mismatch');
  const safeManifest = {
    format: 'asciilens-history-v1', sourceProject: SOURCE_PROJECT, sourceTable: 'public.audit_events', scope: 'all_rows',
    backupSha256: manifest.backupSha256, snapshotAt: snapshot.exact, legacyEndExclusive: boundary.millis,
    reconciliation: reconcileStats(rows), canonicalSha256: rowDigest(rows),
  };
  const manifestJson = stableJson(safeManifest);
  return { importId: sha256(manifestJson), manifest: safeManifest, manifestJson, manifestSha256: sha256(manifestJson), rows };
}

import { AUDIT_EVENT_LIMIT, buildUsageSummary } from '../../shared/audit.js';
import { historyCoverage, VERIFIED_HISTORY } from './history/summary.js';

export async function storeEvent(db, event) {
  await db.batch([
    db.prepare(`INSERT INTO audit_events
      (event_name, session_id, path, referrer, locale, viewport_width, viewport_height, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      event.eventName, event.sessionId, event.path, event.referrer, event.locale,
      event.viewport.width, event.viewport.height, event.userAgent, JSON.stringify(event.metadata),
    ),
    db.prepare(`INSERT OR IGNORE INTO audit_collection (id, started_at)
      SELECT 1, created_at FROM audit_events ORDER BY created_at, id LIMIT 1`),
  ]);
}

export function buildCoverage(startedAt, start, end, now = new Date()) {
  const collectionStart = startedAt ? new Date(startedAt) : null;
  const knownStart = collectionStart && Number.isFinite(collectionStart.getTime());
  const observedEnd = new Date(Math.min(end.getTime(), now.getTime()));
  const hasCoverage = knownStart && collectionStart < end && collectionStart <= observedEnd && observedEnd >= start;
  const status = !knownStart ? 'not_started'
    : !hasCoverage ? 'unavailable'
      : collectionStart > start ? 'partial' : 'covered';
  const observedStart = hasCoverage
    ? new Date(Math.max(start.getTime(), collectionStart.getTime())).toISOString() : null;
  return {
    source: 'cloudflare_d1',
    collectionStartedAt: knownStart ? collectionStart.toISOString() : null,
    historicalData: 'not_imported',
    historicalUsage: 'unknown',
    status,
    observedStart,
    observedEnd: observedStart ? observedEnd.toISOString() : null,
    ongoing: end > now,
    note: 'Counts cover recorded D1 events only. Earlier Supabase history is unavailable and has not been imported; missing history is unknown, not zero. Coverage does not guarantee delivery of every browser event.',
  };
}

export async function readSummary(db, { range, start, end }, now = new Date(), includeHistory = false) {
  // One transaction gives the rows and collection marker the same snapshot.
  // Read one extra row so exactly 10,000 events is not falsely marked truncated.
  const query = includeHistory
    ? `SELECT event_name, session_id, path, metadata, created_at FROM (
      SELECT event_name, session_id, path, metadata, created_at,
        substr(created_at, 1, 23) || '000Z' AS sort_at, 0 AS source_order, id AS live_id, '' AS sort_id
      FROM audit_events WHERE created_at >= ?1 AND created_at < ?2
      UNION ALL
      SELECT event_name, session_id, path, metadata, created_at,
        source_created_at AS sort_at, 1 AS source_order, 0 AS live_id, source_id AS sort_id
      FROM audit_history_events WHERE created_at >= ?1 AND created_at < ?2
        AND import_id IN (SELECT import_id FROM audit_history_imports WHERE ${VERIFIED_HISTORY})
    ) ORDER BY sort_at, source_order, live_id, sort_id LIMIT ?3`
    : `SELECT event_name, session_id, path, metadata, created_at
      FROM audit_events WHERE created_at >= ? AND created_at < ?
      ORDER BY created_at, id LIMIT ?`;
  const statements = [
    db.prepare(query).bind(start.toISOString(), end.toISOString(), AUDIT_EVENT_LIMIT + 1),
    db.prepare('SELECT started_at FROM audit_collection WHERE id = 1'),
  ];
  if (includeHistory) statements.push(db.prepare(`SELECT *, (${VERIFIED_HISTORY}) AS eligible FROM audit_history_imports`));
  const [rows, collection, imports] = await db.batch(statements);
  const events = rows.results.map(row => ({ ...row, metadata: JSON.parse(row.metadata) }));
  const coverage = buildCoverage(collection.results[0]?.started_at, start, end, now);
  if (includeHistory) {
    const history = historyCoverage(imports.results);
    coverage.live = { status: coverage.status, collectionStartedAt: coverage.collectionStartedAt, observedStart: coverage.observedStart, observedEnd: coverage.observedEnd, ongoing: coverage.ongoing };
    coverage.history = history;
    coverage.historicalData = history.status;
    coverage.historicalUsage = history.usage;
    coverage.statusScope = 'live_collection_only';
    coverage.note = 'Totals combine live events and verified historical snapshots only. The top-level status and collectionStartedAt describe live collection; inspect history separately. Unverified history and gaps remain unknown, not zero.';
  } else {
    coverage.historicalData = 'not_checked';
    coverage.history = { status: 'disabled', includedInTotals: false, usage: 'unknown' };
    coverage.note = 'Live D1 events only. Historical lookup is disabled, so import state is not checked. Earlier usage and collection gaps remain unknown, not zero.';
  }
  return {
    ...buildUsageSummary(events, start, end, range),
    coverage,
  };
}

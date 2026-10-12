import { AUDIT_EVENT_LIMIT, buildUsageSummary } from '../../shared/audit.js';

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

export async function readSummary(db, { range, start, end }, now = new Date()) {
  // One transaction gives the rows and collection marker the same snapshot.
  // Read one extra row so exactly 10,000 events is not falsely marked truncated.
  const [rows, collection] = await db.batch([
    db.prepare(`SELECT event_name, session_id, path, metadata, created_at
      FROM audit_events WHERE created_at >= ? AND created_at < ?
      ORDER BY created_at, id LIMIT ?`).bind(start.toISOString(), end.toISOString(), AUDIT_EVENT_LIMIT + 1),
    db.prepare('SELECT started_at FROM audit_collection WHERE id = 1'),
  ]);
  const events = rows.results.map(row => ({ ...row, metadata: JSON.parse(row.metadata) }));
  return {
    ...buildUsageSummary(events, start, end, range),
    coverage: buildCoverage(collection.results[0]?.started_at, start, end, now),
  };
}

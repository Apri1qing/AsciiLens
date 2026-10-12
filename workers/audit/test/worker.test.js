import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import worker from '../index.js';
import { auditWindowForRange } from '../../../shared/audit.js';
import { readSummary, storeEvent } from '../storage.js';
import { sanitizeAuditEvent } from '../../../shared/audit-event.js';
import eventHandler from '../../../api/audit/event.js';
import summaryHandler from '../../../api/audit/summary.js';

const proxyToken = 'local-test-proxy-only';
const readToken = 'local-test-read-only';
const schema = await readFile(new URL('../migrations/0001_audit.sql', import.meta.url), 'utf8');

async function setup(t, { migrate = true } = {}) {
  const mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    modulesRoot: fileURLToPath(new URL('../../../', import.meta.url)),
    scriptPath: fileURLToPath(new URL('../index.js', import.meta.url)),
    compatibilityDate: '2026-07-30',
    bindings: { AUDIT_PROXY_TOKEN: proxyToken },
    d1Databases: { AUDIT_DB: 'asciilens-ephemeral-test-only' },
    cf: false,
    telemetry: { enabled: false },
    outboundService() { throw new Error('Outbound network is forbidden in audit tests'); },
    // No persistence path: each test owns a fresh temporary D1 instance.
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('AUDIT_DB');
  if (migrate) {
    const statements = schema.replace(/^--.*$/gmu, '').split(';').map(sql => sql.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  const request = (path, options = {}) => mf.dispatchFetch(`https://audit.test${path}`, {
    ...options, headers: { Authorization: `Bearer ${proxyToken}`, ...options.headers },
  });
  return { mf, db, request };
}

test('Worker requires transport secret, restricts methods/routes and exposes no CORS', async t => {
  const { request, db } = await setup(t);
  for (const token of ['', `Bearer ${readToken}`, 'Bearer incorrect']) {
    const response = await request('/api/audit/summary', { headers: { Authorization: token } });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal((await request('/api/audit/event', { method: 'POST', headers: { Authorization: '' }, body: '{"eventName":"page_view"}' })).status, 401);
  const method = await request('/api/audit/event');
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('Allow'), 'POST');
  assert.equal((await request('/api/audit/summary', { method: 'OPTIONS' })).status, 405);
  assert.equal((await request('/raw-events')).status, 404);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM audit_events').first('count'), 0);
});

test('empty D1 reports unknown historical coverage, never an imported or complete history', async t => {
  const { request } = await setup(t);
  const response = await request('/api/audit/summary?range=7d');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const { summary } = await response.json();
  assert.equal(summary.coverage.status, 'not_started');
  assert.equal(summary.coverage.collectionStartedAt, null);
  assert.equal(summary.coverage.historicalData, 'not_checked');
  assert.equal(summary.coverage.history.status, 'disabled');
  assert.equal(summary.coverage.historicalUsage, 'unknown');
  assert.equal(summary.totals.events, 0);
  assert.equal(summary.window.range, '7d');
});

test('Worker stores sanitized events with server timestamps and an atomic persistent coverage marker', async t => {
  const { request, db } = await setup(t);
  const payload = {
    eventName: 'image_upload', sessionId: "session'); DROP TABLE audit_events; --", path: '/?private=value',
    referrer: 'https://example.com/private?value=secret', userAgent: 'browser agent',
    viewport: { width: 390, height: 844 }, locale: 'zh-CN', created_at: '2000-01-01T00:00:00Z',
    image: 'data:image/png;base64,private', ip: '192.0.2.1',
    metadata: { source: 'replace', file_type: 'image/png', file_size_bucket: '<500kb', filename: 'private.png' },
  };
  const response = await request('/api/audit/event', { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  const row = await db.prepare('SELECT * FROM audit_events').first();
  assert.equal(row.path, '/');
  assert.equal(row.referrer, 'example.com');
  assert.equal(row.session_id, payload.sessionId);
  assert.equal(row.user_agent, 'browser agent');
  assert.ok(new Date(row.created_at).getTime() > new Date('2026-01-01T00:00:00Z').getTime());
  assert.deepEqual(JSON.parse(row.metadata), { source: 'replace', file_type: 'image/png', file_size_bucket: '<500kb' });
  assert.ok(!JSON.stringify(row).includes('private'));
  const startedAt = await db.prepare('SELECT started_at FROM audit_collection').first('started_at');
  assert.equal(startedAt, row.created_at);
  assert.equal((await request('/api/audit/event', { method: 'POST', body: '{"eventName":"export_png"}' })).status, 202);
  assert.equal(await db.prepare('SELECT started_at FROM audit_collection').first('started_at'), startedAt);
  const result = await (await request('/api/audit/summary?range=today')).json();
  assert.equal(result.summary.totals.events, 2);
  assert.equal(result.summary.totals.uploads, 1);
  assert.equal(result.summary.totals.exports, 1);
  assert.equal(result.summary.coverage.historicalUsage, 'unknown');
  assert.equal(result.summary.coverage.collectionStartedAt, startedAt);
  assert.equal(result.summary.coverage.status, 'partial');
  assert.ok(!JSON.stringify(result).includes(payload.sessionId));
});

test('invalid JSON, scalar bodies and oversized streams never create rows or coverage markers', async t => {
  const { request, db } = await setup(t);
  for (const body of ['{', 'null', '[]', '42', '"text"', '{"eventName":"bad name"}']) {
    assert.equal((await request('/api/audit/event', { method: 'POST', body })).status, 400);
  }
  assert.equal((await request('/api/audit/event', { method: 'POST', body: 'x'.repeat(17000) })).status, 413);
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('x'.repeat(9000)));
    controller.enqueue(new TextEncoder().encode('x'.repeat(9000)));
    controller.close();
  } });
  const streamed = await worker.fetch(new Request('https://audit.test/api/audit/event', {
    method: 'POST', headers: { Authorization: `Bearer ${proxyToken}` }, body: stream, duplex: 'half',
  }), { AUDIT_DB: db, AUDIT_PROXY_TOKEN: proxyToken });
  assert.equal(streamed.status, 413);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM audit_events').first('count'), 0);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM audit_collection').first('count'), 0);
});

test('unmigrated storage and missing bindings fail safely, without empty success summaries', async t => {
  const { request } = await setup(t, { migrate: false });
  const event = await request('/api/audit/event', { method: 'POST', body: '{"eventName":"page_view"}' });
  assert.equal(event.status, 500);
  assert.deepEqual(await event.json(), { error: 'Failed to store audit event' });
  const summary = await request('/api/audit/summary');
  assert.equal(summary.status, 500);
  assert.deepEqual(await summary.json(), { error: 'Failed to fetch audit summary' });
  for (const env of [{}, { AUDIT_PROXY_TOKEN: proxyToken }]) {
    assert.equal((await worker.fetch(new Request('https://audit.test/api/audit/summary', {
      headers: { Authorization: `Bearer ${proxyToken}` },
    }), env)).status, 503);
  }
});

test('D1 transaction rolls back an event if coverage metadata cannot be saved', async t => {
  const { db } = await setup(t, { migrate: false });
  // Intentionally create only the event table in this disposable local database.
  const firstStatement = schema.replace(/^--.*$/gmu, '').split(';')[0];
  await db.prepare(firstStatement).run();
  await assert.rejects(storeEvent(db, sanitizeAuditEvent({ eventName: 'page_view' }, 'test')));
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM audit_events').first('count'), 0);
});

test('D1 half-open Shanghai windows include boundaries correctly for today/yesterday/7d', async t => {
  const { db } = await setup(t);
  const now = new Date('2026-10-12T03:00:00Z');
  const timestamps = [
    '2026-10-05T15:59:59.999Z', // before 7d
    '2026-10-05T16:00:00.000Z', // 7d start
    '2026-10-10T16:00:00.000Z', // yesterday start
    '2026-10-11T15:59:59.999Z', // yesterday end - 1ms
    '2026-10-11T16:00:00.000Z', // today start
    '2026-10-12T15:59:59.999Z', // today end - 1ms (fixture only)
    '2026-10-12T16:00:00.000Z', // excluded end
  ];
  await db.batch(timestamps.map(timestamp => db.prepare('INSERT INTO audit_events (event_name, created_at) VALUES (?, ?)').bind('page_view', timestamp)));
  await db.prepare('INSERT INTO audit_collection (id, started_at) VALUES (1, ?)').bind(timestamps[0]).run();
  for (const [range, count] of [['today', 2], ['yesterday', 2], ['7d', 5]]) {
    const summary = await readSummary(db, auditWindowForRange(range, now), now);
    assert.equal(summary.totals.events, count);
    assert.equal(summary.window.timezone, 'Asia/Shanghai');
    assert.equal(summary.coverage.status, 'covered');
  }
});

test('D1 bounded reads signal truncation only when rows were actually omitted', async t => {
  const { db } = await setup(t);
  await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10000)
    INSERT INTO audit_events (event_name, created_at, session_id)
    SELECT 'page_view', '2026-10-12T00:00:00.000Z', 'one-session' FROM n`).run();
  const now = new Date('2026-10-12T03:00:00Z');
  const window = auditWindowForRange('today', now);
  let summary = await readSummary(db, window, now);
  assert.equal(summary.totals.events, 10000);
  assert.equal(summary.truncated, false);
  await db.prepare("INSERT INTO audit_events (event_name, created_at) VALUES ('export_png', '2026-10-12T01:00:00.000Z')").run();
  summary = await readSummary(db, window, now);
  assert.equal(summary.totals.events, 10000);
  assert.equal(summary.truncated, true);
});

test('Vercel handlers and Worker complete the public contract through an entirely local D1', async t => {
  const { mf } = await setup(t);
  process.env.AUDIT_WORKER_URL = 'https://asciilens-audit.test-only.workers.dev';
  process.env.AUDIT_PROXY_TOKEN = proxyToken;
  process.env.AUDIT_READ_TOKEN = readToken;
  process.env.VERCEL_ENV = 'production'; // Inert fixture; fetch is intercepted below.
  t.after(() => {
    for (const key of ['AUDIT_WORKER_URL', 'AUDIT_PROXY_TOKEN', 'AUDIT_READ_TOKEN', 'VERCEL_ENV']) delete process.env[key];
  });
  t.mock.method(globalThis, 'fetch', (url, init) => mf.dispatchFetch(url, init));
  async function call(handler, req) {
    const res = { setHeader() {}, end(body) { this.body = body; } };
    await handler(req, res);
    return res;
  }
  const write = await call(eventHandler, { method: 'POST', headers: { 'user-agent': 'local-test-browser' }, body: { eventName: 'page_view', sessionId: 'local-test-session', path: '/' } });
  assert.equal(write.statusCode, 202);
  const read = await call(summaryHandler, { method: 'GET', headers: { authorization: `Bearer ${readToken}` }, query: { range: 'today' } });
  assert.equal(read.statusCode, 200);
  const { summary } = JSON.parse(read.body);
  assert.equal(summary.totals.pageViews, 1);
  assert.equal(summary.totals.sessions, 1);
  assert.equal(summary.coverage.historicalUsage, 'unknown');
  assert.ok(summary.coverage.collectionStartedAt);
});

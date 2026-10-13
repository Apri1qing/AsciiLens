import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test, { beforeEach, afterEach, mock } from 'node:test';
import eventHandler from '../../api/audit/event.js';
import summaryHandler from '../../api/audit/summary.js';
import { readJsonBody } from '../../server/audit-utils.js';

const testReadToken = 'local-test-read-only';
const testProxyToken = 'local-test-proxy-only';
let fetchMock;

beforeEach(() => {
  // Set only inert test values. Never load .env files or inspect existing secrets.
  for (const key of ['AUDIT_READ_TOKEN', 'AUDIT_PROXY_TOKEN', 'AUDIT_WORKER_URL', 'VERCEL_ENV']) delete process.env[key];
  fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected outbound request'); });
});
afterEach(() => mock.restoreAll());

function configure() {
  process.env.AUDIT_READ_TOKEN = testReadToken;
  process.env.AUDIT_PROXY_TOKEN = testProxyToken;
  process.env.AUDIT_WORKER_URL = 'https://asciilens-audit.test-only.workers.dev';
}

async function call(handler, req = {}) {
  const res = { headers: {}, statusCode: 0, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(body) { this.body = body; } };
  await handler({ method: 'POST', headers: {}, body: {}, ...req }, res);
  return { ...res, json: res.body ? JSON.parse(res.body) : null };
}

const summaryFixture = { ok: true, summary: { window: { range: 'today' }, totals: { events: 0 }, coverage: { historicalData: 'not_imported' } } };

test('methods, malformed JSON, nulls and invalid names are rejected without outbound requests', async () => {
  assert.equal((await call(eventHandler, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(summaryHandler)).statusCode, 405);
  for (const body of ['{', 'null', '[]', '"text"', '{}', '{"eventName":"unsafe name"}']) {
    assert.equal((await call(eventHandler, { body })).statusCode, 400);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('body size limit applies to parsed bodies, strings, buffers and streams', async () => {
  for (const body of [{ eventName: 'page_view', padding: 'x'.repeat(17000) }, 'x'.repeat(17000), Buffer.alloc(17000)]) {
    assert.equal((await call(eventHandler, { body })).statusCode, 413);
  }
  const req = Readable.from(['{"padding":"', 'x'.repeat(17000), '"}']);
  req.headers = {};
  await assert.rejects(readJsonBody(req), { statusCode: 413 });
  const valid = Readable.from(['{"eventName":', '"page_view"}']);
  valid.headers = {};
  assert.deepEqual(await readJsonBody(valid), { eventName: 'page_view' });
});

test('unconfigured and preview analytics retain no-op behavior; summary is unavailable', async () => {
  assert.equal((await call(eventHandler, { body: { eventName: 'page_view' } })).statusCode, 204);
  configure();
  delete process.env.AUDIT_PROXY_TOKEN;
  assert.equal((await call(summaryHandler, { method: 'GET', headers: { authorization: `Bearer ${testReadToken}` } })).statusCode, 503);
  configure();
  process.env.VERCEL_ENV = 'preview';
  assert.equal((await call(eventHandler, { body: { eventName: 'page_view' } })).statusCode, 204);
  assert.equal((await call(summaryHandler, { method: 'GET', headers: { authorization: `Bearer ${testReadToken}` } })).statusCode, 503);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('summary requires the existing read bearer before any upstream access', async () => {
  configure();
  for (const authorization of [undefined, `Bearer ${testProxyToken}`, 'Bearer wrong', 'bearer local-test-read-only', ['bad']]) {
    assert.equal((await call(summaryHandler, { method: 'GET', headers: { authorization } })).statusCode, 401);
  }
  delete process.env.AUDIT_READ_TOKEN;
  assert.equal((await call(summaryHandler, { method: 'GET', headers: { authorization: `Bearer ${testReadToken}` } })).statusCode, 401);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('proxy forwards only sanitized event fields and its own secret, with redirect/timeout guards', async () => {
  configure();
  fetchMock.mock.mockImplementation(async () => Response.json({ ok: true }, { status: 202 }));
  const res = await call(eventHandler, {
    headers: { 'user-agent': 'browser agent', authorization: 'browser-secret', cookie: 'private', 'x-forwarded-for': '192.0.2.1' },
    body: { eventName: 'page_view', userAgent: 'forged', path: '/?secret=private', ip: '192.0.2.1', metadata: { filename: 'private.png' } },
  });
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.json, { ok: true });
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://asciilens-audit.test-only.workers.dev/api/audit/event');
  assert.deepEqual(options.headers, { 'Content-Type': 'application/json', Authorization: `Bearer ${testProxyToken}` });
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(JSON.parse(options.body).userAgent, 'browser agent');
  assert.equal(JSON.parse(options.body).path, '/');
  for (const value of ['192.0.2.1', 'private.png', 'browser-secret', 'forged']) assert.ok(!options.body.includes(value));
});

test('summary query contract survives and caller authorization is never forwarded', async () => {
  configure();
  fetchMock.mock.mockImplementation(async () => Response.json(summaryFixture));
  for (const [query, url, expected] of [
    [{ range: 'today' }, '/', 'today'],
    [{ range: ['7d', 'today'] }, '/', '7d'],
    [undefined, '/api/audit/summary?range=yesterday', 'yesterday'],
    [{ range: '7d&raw=true' }, '/', 'yesterday'],
  ]) {
    const res = await call(summaryHandler, { method: 'GET', query, url, headers: { authorization: `Bearer ${testReadToken}` } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, summaryFixture);
    assert.equal(res.headers['cache-control'], 'no-store');
    const [target, options] = fetchMock.mock.calls.at(-1).arguments;
    assert.ok(target.endsWith(`?range=${expected}`));
    assert.equal(options.headers.Authorization, `Bearer ${testProxyToken}`);
    assert.ok(!JSON.stringify(options.headers).includes(testReadToken));
  }
});

test('unsafe upstream URLs fail closed without sending a secret', async () => {
  configure();
  for (const url of ['http://audit.test.workers.dev', 'https://example.com', 'https://audit.test.workers.dev.evil.example', 'https://user:pass@audit.test.workers.dev', 'https://audit.test.workers.dev/path', 'https://audit.test.workers.dev?token=x', 'https://audit.test.workers.dev#x', 'https://audit.test.workers.dev:123']) {
    process.env.AUDIT_WORKER_URL = url;
    assert.equal((await call(eventHandler, { body: { eventName: 'page_view' } })).statusCode, 204);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('upstream errors, redirects, outages and invalid responses never leak details or retry writes', async () => {
  configure();
  for (const response of [
    () => new Response('sensitive upstream details', { status: 503 }),
    () => new Response('redirect details', { status: 302, headers: { Location: 'https://example.com' } }),
    () => new Response('not-json'),
    () => Response.json({ ok: false }),
    () => { throw new Error('sensitive network details'); },
  ]) {
    fetchMock.mock.mockImplementation(response);
    const count = fetchMock.mock.callCount();
    const res = await call(eventHandler, { body: { eventName: 'page_view' } });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.json, { error: 'Failed to store audit event' });
    assert.equal(fetchMock.mock.callCount(), count + 1);
  }
  fetchMock.mock.mockImplementation(() => Response.json({ ok: true }));
  const res = await call(summaryHandler, { method: 'GET', headers: { authorization: `Bearer ${testReadToken}` } });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json, { error: 'Failed to fetch audit summary' });
});

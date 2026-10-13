import { auditWindowForRange } from '../../shared/audit.js';
import { assertBodySize, sanitizeAuditEvent } from '../../shared/audit-event.js';
import { readSummary, storeEvent } from './storage.js';

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

async function authorized(request, token) {
  const header = request.headers.get('Authorization');
  if (!token || !header) return false;
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(header)),
    crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${token}`)),
  ]);
  const a = new Uint8Array(actual);
  const b = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function readBody(request) {
  assertBodySize(Number(request.headers.get('Content-Length')) || 0);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let raw = '';
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      assertBodySize(length);
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw || '{}');
  } finally {
    await reader.cancel();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isEvent = url.pathname === '/api/audit/event';
    const isSummary = url.pathname === '/api/audit/summary';
    if (!isEvent && !isSummary) return json(404, { error: 'Not found' });
    const method = isEvent ? 'POST' : 'GET';
    if (request.method !== method) return json(405, { error: 'Method not allowed' }, { Allow: method });
    if (!env.AUDIT_PROXY_TOKEN) return json(503, { error: 'Audit storage is not configured' });
    if (!await authorized(request, env.AUDIT_PROXY_TOKEN)) return json(401, { error: 'Unauthorized' });
    if (!env.AUDIT_DB) return json(503, { error: 'Audit storage is not configured' });

    if (isEvent) {
      let payload;
      try {
        payload = await readBody(request);
      } catch (error) {
        return json(error.statusCode === 413 ? 413 : 400, {
          error: error.statusCode === 413 ? 'Payload too large' : 'Invalid JSON payload',
        });
      }
      const event = sanitizeAuditEvent(payload, payload?.userAgent);
      if (!event) return json(400, { error: 'Invalid event name' });
      try {
        await storeEvent(env.AUDIT_DB, event);
        return json(202, { ok: true });
      } catch {
        return json(500, { error: 'Failed to store audit event' });
      }
    }

    try {
      const now = new Date();
      const window = auditWindowForRange(url.searchParams.get('range') || 'yesterday', now);
      const summary = await readSummary(env.AUDIT_DB, window, now, env.AUDIT_HISTORY_ENABLED === 'true');
      return json(200, { ok: true, summary });
    } catch {
      return json(500, { error: 'Failed to fetch audit summary' });
    }
  },
};

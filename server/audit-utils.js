import { timingSafeEqual } from 'node:crypto';
import { assertBodySize } from '../shared/audit-event.js';

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  assertBodySize(Number(req.headers?.['content-length']) || 0);
  if (req.body !== undefined && !Buffer.isBuffer(req.body)) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    assertBodySize(Buffer.byteLength(raw));
    return JSON.parse(raw || '{}');
  }
  if (Buffer.isBuffer(req.body)) {
    assertBodySize(req.body.length);
    return JSON.parse(req.body.toString('utf8') || '{}');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    assertBodySize(length);
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw || '{}');
}

export function isAuditReadAuthorized(req) {
  const token = process.env.AUDIT_READ_TOKEN;
  const header = req.headers.authorization;
  if (!token || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function workerOrigin() {
  // Preview deployments must not pollute production even if env vars are inherited.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return null;
  if (!process.env.AUDIT_WORKER_URL || !process.env.AUDIT_PROXY_TOKEN) return null;
  try {
    const url = new URL(process.env.AUDIT_WORKER_URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev') ||
        url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAuditStorageConfigured() {
  return Boolean(workerOrigin());
}

export async function auditWorkerFetch(path, options = {}) {
  const origin = workerOrigin();
  if (!origin) throw new Error('Audit storage is not configured');
  // Fixed paths are supplied by the handlers. Do not forward incoming headers,
  // cookies, IPs or the public summary read token to Cloudflare.
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AUDIT_PROXY_TOKEN}`,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Audit storage request failed');
  const result = await response.json();
  if (result?.ok !== true) throw new Error('Invalid audit storage response');
  return result;
}

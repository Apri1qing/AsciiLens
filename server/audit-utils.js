const MAX_METADATA_KEYS = 24;
const MAX_STRING_LENGTH = 180;
const SUPABASE_LIMIT = 10000;

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function supabaseHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

export async function supabaseFetch(path, options = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase audit storage is not configured');
  }

  const baseUrl = process.env.SUPABASE_URL.replace(/\/$/u, '');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${text}`);
  }

  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

export function sanitizeText(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function sanitizeEventName(value) {
  const eventName = sanitizeText(value, 64);
  if (!/^[a-z0-9_.:-]+$/u.test(eventName)) return '';
  return eventName;
}

export function sanitizeMetadata(value, depth = 0) {
  if (depth > 2) return undefined;
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20)
      .map(item => sanitizeMetadata(item, depth + 1))
      .filter(item => item !== undefined);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_METADATA_KEYS)
        .map(([key, nested]) => [sanitizeText(key, 64), sanitizeMetadata(nested, depth + 1)])
        .filter(([key, nested]) => key && nested !== undefined),
    );
  }

  return undefined;
}

function shanghaiDayStart(now, dayOffset = 0) {
  const offsetMs = 8 * 60 * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);
  const startLocal = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + dayOffset,
    0,
    0,
    0,
  );

  return new Date(startLocal - offsetMs);
}

export function shanghaiDayWindow(now = new Date(), daysAgo = 1) {
  return {
    start: shanghaiDayStart(now, -daysAgo),
    end: shanghaiDayStart(now, -daysAgo + 1),
  };
}

export function auditWindowForRange(range = 'yesterday', now = new Date()) {
  const normalizedRange = ['today', 'yesterday', '7d'].includes(range) ? range : 'yesterday';

  if (normalizedRange === 'today') {
    return {
      range: normalizedRange,
      start: shanghaiDayStart(now),
      end: shanghaiDayStart(now, 1),
    };
  }

  if (normalizedRange === '7d') {
    return {
      range: normalizedRange,
      start: shanghaiDayStart(now, -6),
      end: shanghaiDayStart(now, 1),
    };
  }

  return {
    range: normalizedRange,
    start: shanghaiDayStart(now, -1),
    end: shanghaiDayStart(now),
  };
}

export function formatShanghaiDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function countBy(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topEntries(counts, max = 6) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
}

export async function fetchAuditEvents(start, end) {
  const params = new URLSearchParams({
    select: 'event_name,session_id,path,metadata,created_at',
    created_at: `gte.${start.toISOString()}`,
    order: 'created_at.asc',
    limit: String(SUPABASE_LIMIT),
  });
  params.append('created_at', `lt.${end.toISOString()}`);
  return supabaseFetch(`/rest/v1/audit_events?${params.toString()}`);
}

export function buildUsageSummary(events, start, end, range = 'yesterday') {
  const byEvent = countBy(events, event => event.event_name);
  const uniqueSessions = new Set(events.map(event => event.session_id).filter(Boolean));
  const uploads = events.filter(event => event.event_name === 'image_upload');
  const exports = events.filter(event => event.event_name === 'export_png');
  const selections = events.filter(event => event.event_name === 'selection_create');

  return {
    window: {
      range,
      start: start.toISOString(),
      end: end.toISOString(),
      date: formatShanghaiDate(start),
      timezone: 'Asia/Shanghai',
    },
    totals: {
      events: events.length,
      pageViews: byEvent.page_view || 0,
      sessions: uniqueSessions.size,
      uploads: uploads.length,
      exports: exports.length,
      selectionsCreated: selections.length,
    },
    topEvents: topEntries(byEvent),
    topPages: topEntries(countBy(events, event => event.path)),
    uploadTypes: topEntries(countBy(uploads, event => event.metadata?.file_type)),
    uploadSizeBuckets: topEntries(countBy(uploads, event => event.metadata?.file_size_bucket)),
    renderModes: topEntries(countBy(events.filter(event => event.event_name === 'render_mode_change'), event => event.metadata?.mode)),
    truncated: events.length >= SUPABASE_LIMIT,
  };
}

export function isAuditReadAuthorized(req) {
  const token = process.env.AUDIT_READ_TOKEN;
  if (!token) return false;
  return req.headers.authorization === `Bearer ${token}`;
}

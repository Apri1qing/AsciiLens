import {
  auditWindowForRange,
  buildUsageSummary,
  fetchAuditEvents,
  isAuditReadAuthorized,
  isSupabaseConfigured,
  sendJson,
} from '../../server/audit-utils.js';

function queryValue(req, key) {
  if (req.query?.[key]) {
    return Array.isArray(req.query[key]) ? req.query[key][0] : req.query[key];
  }

  const url = new URL(req.url || '/', 'https://asciilens.local');
  return url.searchParams.get(key);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!isAuditReadAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  if (!isSupabaseConfigured()) {
    return sendJson(res, 503, { error: 'Supabase audit storage is not configured' });
  }

  const { range, start, end } = auditWindowForRange(queryValue(req, 'range') || 'yesterday');

  try {
    const events = await fetchAuditEvents(start, end);
    const summary = buildUsageSummary(events, start, end, range);
    return sendJson(res, 200, {
      ok: true,
      summary,
    });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Failed to fetch audit summary' });
  }
}

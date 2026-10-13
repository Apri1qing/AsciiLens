import {
  auditWorkerFetch,
  isAuditReadAuthorized,
  isAuditStorageConfigured,
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

  if (!isAuditStorageConfigured()) {
    return sendJson(res, 503, { error: 'Audit storage is not configured' });
  }

  const value = queryValue(req, 'range');
  const range = ['today', 'yesterday', '7d'].includes(value) ? value : 'yesterday';

  try {
    const { summary } = await auditWorkerFetch(`/api/audit/summary?range=${range}`);
    if (!summary?.window || !summary?.totals || !summary?.coverage) throw new Error('Invalid summary');
    return sendJson(res, 200, {
      ok: true,
      summary,
    });
  } catch {
    return sendJson(res, 500, { error: 'Failed to fetch audit summary' });
  }
}

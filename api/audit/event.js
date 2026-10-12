import {
  auditWorkerFetch,
  isAuditStorageConfigured,
  readJsonBody,
  sendJson,
} from '../../server/audit-utils.js';
import { sanitizeAuditEvent } from '../../shared/audit-event.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, error.statusCode === 413 ? 413 : 400, {
      error: error.statusCode === 413 ? 'Payload too large' : 'Invalid JSON payload',
    });
  }

  const event = sanitizeAuditEvent(payload, req.headers['user-agent']);
  if (!event) return sendJson(res, 400, { error: 'Invalid event name' });

  if (!isAuditStorageConfigured()) {
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }

  try {
    await auditWorkerFetch('/api/audit/event', {
      method: 'POST',
      body: JSON.stringify(event),
    });
    return sendJson(res, 202, { ok: true });
  } catch {
    return sendJson(res, 500, { error: 'Failed to store audit event' });
  }
}

import {
  isSupabaseConfigured,
  readJsonBody,
  sanitizeEventName,
  sanitizeMetadata,
  sanitizeText,
  sendJson,
  supabaseFetch,
} from '../../server/audit-utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!isSupabaseConfigured()) {
    res.statusCode = 204;
    return res.end();
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON payload' });
  }

  const eventName = sanitizeEventName(payload.eventName);
  if (!eventName) return sendJson(res, 400, { error: 'Invalid event name' });

  const row = {
    event_name: eventName,
    session_id: sanitizeText(payload.sessionId, 96),
    path: sanitizeText(payload.path || '/', 180),
    referrer: sanitizeText(payload.referrer, 180),
    locale: sanitizeText(payload.locale, 32),
    viewport_width: Number.isFinite(payload.viewport?.width) ? Math.round(payload.viewport.width) : null,
    viewport_height: Number.isFinite(payload.viewport?.height) ? Math.round(payload.viewport.height) : null,
    user_agent: sanitizeText(req.headers['user-agent'], 320),
    metadata: sanitizeMetadata(payload.metadata) || {},
  };

  try {
    await supabaseFetch('/rest/v1/audit_events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    return sendJson(res, 202, { ok: true });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Failed to store audit event' });
  }
}

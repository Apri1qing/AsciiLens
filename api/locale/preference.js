import { languageFromAcceptLanguage } from '../../src/lib/locale-preference.js';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const preference = languageFromAcceptLanguage(req.headers['accept-language']);
  return sendJson(res, 200, preference);
}

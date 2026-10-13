import { MAX_AUDIT_BODY_BYTES } from './audit.js';

export function sanitizeText(value, maxLength = 180) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function sanitizeEventName(value) {
  const name = sanitizeText(value, 64);
  return /^[a-z0-9_.:-]+$/u.test(name) ? name : '';
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : undefined;
}

// Only the metadata emitted by the editor is accepted. Free-form error messages
// can contain filenames/URLs, so unfamiliar export errors become "unknown".
function sanitizeMetadata(eventName, metadata) {
  const value = metadata && typeof metadata === 'object' ? metadata : {};
  const modes = ['overlay', 'full'];
  const shapes = ['rect', 'circle', 'freehand'];
  let result = {};
  switch (eventName) {
    case 'image_upload':
      result = {
        source: pick(value.source, ['upload', 'replace']),
        file_type: typeof value.file_type === 'string' && /^image\/[a-z0-9.+-]{1,64}$/iu.test(value.file_type)
          ? value.file_type : 'unknown',
        file_size_bucket: pick(value.file_size_bucket, ['<500kb', '500kb-2mb', '2mb-8mb', '8mb+']),
      };
      break;
    case 'render_mode_change':
      result = { mode: pick(value.mode, modes) };
      break;
    case 'selection_create':
      result = { shape_type: pick(value.shape_type, shapes) };
      break;
    case 'selection_tool_change':
      result = { shape_mode: pick(value.shape_mode, shapes) };
      break;
    case 'export_png':
      result = {
        mode: pick(value.mode, modes),
        color_mode: pick(value.color_mode, ['original', 'mono', 'lime', 'white', 'green', 'neon', 'cyan', 'coral']),
        selection_count: Number.isSafeInteger(value.selection_count) && value.selection_count >= 0
          ? value.selection_count : undefined,
      };
      break;
    case 'export_png_failed':
      result = { reason: pick(value.reason, ['missing_canvas', 'empty_canvas', 'blob_export_failed', 'export_failed']) || 'unknown' };
      break;
  }
  return Object.fromEntries(Object.entries(result).filter(([, item]) => item !== undefined));
}

function pathOnly(value) {
  const path = sanitizeText(value, 2048);
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  return path.split(/[?#]/u)[0].slice(0, 180) || '/';
}

function referrerHost(value) {
  const referrer = sanitizeText(value, 2048);
  if (!referrer) return '';
  try {
    const url = new URL(referrer.includes('://') ? referrer : `https://${referrer}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.host.slice(0, 180) : '';
  } catch {
    return '';
  }
}

function viewportDimension(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100000 ? Math.round(value) : null;
}

// Keep the public camelCase contract through the proxy. userAgent is supplied
// by Vercel from the request header, never trusted from the browser JSON body.
export function sanitizeAuditEvent(payload, userAgent) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const eventName = sanitizeEventName(payload.eventName);
  if (!eventName) return null;
  return {
    eventName,
    sessionId: sanitizeText(payload.sessionId, 96),
    path: pathOnly(payload.path),
    referrer: referrerHost(payload.referrer),
    locale: sanitizeText(payload.locale, 32),
    viewport: {
      width: viewportDimension(payload.viewport?.width),
      height: viewportDimension(payload.viewport?.height),
    },
    userAgent: sanitizeText(userAgent, 320),
    metadata: sanitizeMetadata(eventName, payload.metadata),
  };
}

export function assertBodySize(byteLength) {
  if (byteLength > MAX_AUDIT_BODY_BYTES) {
    const error = new Error('Audit payload too large');
    error.statusCode = 413;
    throw error;
  }
}

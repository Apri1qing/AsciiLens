const AUDIT_ENDPOINT = '/api/audit/event';
const SESSION_KEY = 'asciilens_audit_session';

function createSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = createSessionId();
    window.localStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return createSessionId();
  }
}

function safeReferrerHost() {
  if (!document.referrer) return '';
  try {
    return new URL(document.referrer).host;
  } catch {
    return '';
  }
}

function compactMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, value]),
  );
}

export function fileAuditMetadata(file) {
  if (!file) return {};
  const size = file.size || 0;
  const sizeBucket = size < 500_000
    ? '<500kb'
    : size < 2_000_000
      ? '500kb-2mb'
      : size < 8_000_000
        ? '2mb-8mb'
        : '8mb+';

  return {
    file_type: file.type || 'unknown',
    file_size_bucket: sizeBucket,
  };
}

export function trackAuditEvent(eventName, metadata = {}) {
  if (typeof window === 'undefined') return;

  const payload = {
    eventName,
    sessionId: getSessionId(),
    path: window.location.pathname || '/',
    referrer: safeReferrerHost(),
    locale: navigator.language || '',
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    metadata: compactMetadata(metadata),
  };

  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(AUDIT_ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (sent) return;
    }

    fetch(AUDIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never interrupt image editing.
  }
}

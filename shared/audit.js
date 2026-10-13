export const AUDIT_EVENT_LIMIT = 10000;
export const MAX_AUDIT_BODY_BYTES = 16 * 1024;

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
  }, Object.create(null));
}

function topEntries(counts, max = 6) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
}

export function buildUsageSummary(rows, start, end, range = 'yesterday') {
  const events = rows.slice(0, AUDIT_EVENT_LIMIT);
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
    truncated: rows.length > AUDIT_EVENT_LIMIT,
  };
}

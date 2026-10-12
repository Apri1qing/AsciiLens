import assert from 'node:assert/strict';
import test from 'node:test';
import { auditWindowForRange, buildUsageSummary } from '../../shared/audit.js';
import { sanitizeAuditEvent } from '../../shared/audit-event.js';
import { buildCoverage } from '../../workers/audit/storage.js';

for (const [instant, range, start, end] of [
  ['2026-10-12T15:59:59.999Z', 'today', '2026-10-11T16:00:00.000Z', '2026-10-12T16:00:00.000Z'],
  ['2026-10-12T16:00:00.000Z', 'today', '2026-10-12T16:00:00.000Z', '2026-10-13T16:00:00.000Z'],
  ['2026-10-12T16:00:00.000Z', 'yesterday', '2026-10-11T16:00:00.000Z', '2026-10-12T16:00:00.000Z'],
  ['2026-01-01T01:00:00.000Z', '7d', '2025-12-25T16:00:00.000Z', '2026-01-01T16:00:00.000Z'],
  ['2024-03-01T00:00:00.000Z', 'yesterday', '2024-02-28T16:00:00.000Z', '2024-02-29T16:00:00.000Z'],
]) {
  test(`Shanghai ${range} window at ${instant}`, () => {
    const result = auditWindowForRange(range, new Date(instant));
    assert.equal(result.start.toISOString(), start);
    assert.equal(result.end.toISOString(), end);
  });
}

test('unknown ranges still default to yesterday', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  assert.deepEqual(auditWindowForRange('all', now), auditWindowForRange('yesterday', now));
});

test('summary retains the existing counters, tuple lists, session and export-attempt semantics', () => {
  const window = auditWindowForRange('today', new Date('2026-10-12T01:00:00Z'));
  const events = [
    { event_name: 'page_view', session_id: 'a', path: '/' },
    { event_name: 'page_view', session_id: 'b', path: '/' },
    { event_name: 'image_upload', session_id: 'a', path: '/', metadata: { file_type: 'image/png', file_size_bucket: '<500kb' } },
    { event_name: 'image_upload', session_id: '', path: '/', metadata: { source: 'replace', file_type: 'image/jpeg', file_size_bucket: '8mb+' } },
    { event_name: 'export_png', session_id: 'a', path: '/' },
    { event_name: 'export_png_failed', session_id: 'a', path: '/' },
    { event_name: 'selection_create', session_id: 'a', path: '/' },
    { event_name: 'selection_delete', session_id: 'a', path: '/' },
    { event_name: 'render_mode_change', session_id: 'b', path: '/', metadata: { mode: 'full' } },
  ];
  const summary = buildUsageSummary(events, window.start, window.end, 'today');
  assert.deepEqual(summary.totals, { events: 9, pageViews: 2, sessions: 2, uploads: 2, exports: 1, selectionsCreated: 1 });
  assert.equal(summary.window.date, '2026-10-12');
  assert.equal(summary.window.timezone, 'Asia/Shanghai');
  assert.deepEqual(summary.topPages, [['/', 9]]);
  assert.deepEqual(summary.uploadTypes, [['image/png', 1], ['image/jpeg', 1]]);
  assert.deepEqual(summary.uploadSizeBuckets, [['<500kb', 1], ['8mb+', 1]]);
  assert.deepEqual(summary.renderModes, [['full', 1]]);
  assert.deepEqual(summary.topEvents[0], ['page_view', 2]);
  assert.equal(summary.truncated, false);
});

test('cap is bounded and truncation reflects omitted rows', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  const rows = Array.from({ length: 10001 }, () => ({ event_name: 'page_view', session_id: 'a', path: '/' }));
  assert.equal(buildUsageSummary(rows.slice(1), now, now).truncated, false);
  const summary = buildUsageSummary(rows, now, now);
  assert.equal(summary.totals.events, 10000);
  assert.equal(summary.truncated, true);
});

test('valid prototype-like event names cannot corrupt counters', () => {
  const now = new Date();
  const summary = buildUsageSummary([{ event_name: 'constructor', path: '__proto__' }], now, now);
  assert.deepEqual(summary.topEvents, [['constructor', 1]]);
  assert.deepEqual(summary.topPages, [['__proto__', 1]]);
});

test('event boundary drops private fields and URL query strings, preserves supported metadata', () => {
  const event = sanitizeAuditEvent({
    eventName: ' image_upload ', sessionId: 'anonymous', path: '/?email=private#fragment',
    referrer: 'https://example.com/private?email=private', locale: 'zh-CN',
    viewport: { width: 390.4, height: -1 }, userAgent: 'untrusted',
    ip: '192.0.2.1', filename: 'private.png', image: 'data:image/png;base64,private',
    created_at: '2000-01-01T00:00:00Z',
    metadata: { source: 'replace', file_type: 'image/png', file_size_bucket: '500kb-2mb', filename: 'private.png', image: 'private', nested: { ip: 'private' } },
  }, 'browser agent');
  assert.deepEqual(event, {
    eventName: 'image_upload', sessionId: 'anonymous', path: '/', referrer: 'example.com', locale: 'zh-CN',
    viewport: { width: 390, height: null }, userAgent: 'browser agent',
    metadata: { source: 'replace', file_type: 'image/png', file_size_bucket: '500kb-2mb' },
  });
});

test('all editor metadata is preserved, free-form error details are omitted', () => {
  for (const [eventName, metadata] of [
    ['render_mode_change', { mode: 'full' }],
    ['selection_create', { shape_type: 'freehand' }],
    ['selection_tool_change', { shape_mode: 'circle' }],
    ['export_png', { mode: 'overlay', color_mode: 'mono', selection_count: 3 }],
    ['export_png_failed', { reason: 'blob_export_failed' }],
  ]) assert.deepEqual(sanitizeAuditEvent({ eventName, metadata }).metadata, metadata);
  assert.deepEqual(sanitizeAuditEvent({ eventName: 'export_png_failed', metadata: { reason: 'private-file.png failed at https://example.com/private' } }).metadata, { reason: 'unknown' });
  assert.deepEqual(sanitizeAuditEvent({ eventName: 'page_view', metadata: { image: 'private' } }).metadata, {});
  assert.equal(sanitizeAuditEvent(null), null);
  assert.equal(sanitizeAuditEvent([]), null);
  assert.equal(sanitizeAuditEvent({ eventName: '<script>' }), null);
});

test('coverage distinguishes unstarted, unavailable, partial and covered data without claiming imported history', () => {
  const start = new Date('2026-10-11T16:00:00Z');
  const end = new Date('2026-10-12T16:00:00Z');
  const now = new Date('2026-10-12T06:00:00Z');
  assert.equal(buildCoverage(null, start, end, now).status, 'not_started');
  assert.equal(buildCoverage('2026-10-13T00:00:00Z', start, end, now).status, 'unavailable');
  const partial = buildCoverage('2026-10-12T02:00:00Z', start, end, now);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.historicalData, 'not_imported');
  assert.equal(partial.historicalUsage, 'unknown');
  assert.equal(partial.observedStart, '2026-10-12T02:00:00.000Z');
  assert.equal(partial.observedEnd, now.toISOString());
  assert.equal(partial.ongoing, true);
  assert.equal(buildCoverage(start.toISOString(), start, end, now).status, 'covered');
  assert.equal(buildCoverage(now.toISOString(), start, end, now).status, 'partial');
  assert.equal(buildCoverage(end.toISOString(), start, end, end).status, 'unavailable');
});

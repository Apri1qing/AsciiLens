-- REFERENCE ONLY. Run later in the user's approved, read-only source export
-- session, against ivpegtwknknqlpmglreh. Do not run while the project is paused.
-- The NDJSON export and this result must share ONE REPEATABLE READ snapshot.
-- This is all rows, with no REST row-limit, date filter or public-summary cap.
WITH source AS (
  SELECT event_name, session_id, created_at,
    to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS day
  FROM public.audit_events
), event_counts AS (
  SELECT event_name, count(*) AS n FROM source GROUP BY event_name
), daily_events AS (
  SELECT day, event_name, count(*) AS n FROM source GROUP BY day, event_name
), days AS (
  SELECT day, count(*) AS n, count(DISTINCT nullif(session_id, '')) AS sessions,
    (SELECT jsonb_object_agg(event_name, n) FROM daily_events e WHERE e.day = s.day) AS events
  FROM source s GROUP BY day
)
SELECT jsonb_build_object(
  'rows', count(*),
  'sessions', count(DISTINCT nullif(session_id, '')),
  'events', coalesce((SELECT jsonb_object_agg(event_name, n) FROM event_counts), '{}'::jsonb),
  'firstSourceAt', to_char(min(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'lastSourceAt', to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'days', coalesce((SELECT jsonb_object_agg(day, jsonb_build_object('rows', n, 'sessions', sessions, 'events', events)) FROM days), '{}'::jsonb)
) AS reconciliation
FROM source;

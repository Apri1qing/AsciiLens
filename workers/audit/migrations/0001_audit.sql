CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event_name TEXT NOT NULL CHECK (
    length(event_name) BETWEEN 1 AND 64 AND event_name NOT GLOB '*[^a-z0-9_.:-]*'
  ),
  session_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '/',
  referrer TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT '',
  viewport_width INTEGER,
  viewport_height INTEGER,
  user_agent TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata) = 'object')
);

CREATE INDEX audit_events_created_at_idx ON audit_events (created_at, id);

-- Recorded atomically with the first real event, never seeded at migration time.
-- Kept separately so a future retention policy cannot silently move the start.
CREATE TABLE audit_collection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TEXT NOT NULL
);

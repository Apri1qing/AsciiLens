-- Additive only: the original Worker and 0001 schema remain usable.
CREATE TABLE audit_history_imports (
  import_id TEXT PRIMARY KEY,
  source_project TEXT NOT NULL CHECK (source_project = 'ivpegtwknknqlpmglreh'),
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256) = 64),
  backup_sha256 TEXT NOT NULL CHECK (length(backup_sha256) = 64),
  canonical_sha256 TEXT NOT NULL CHECK (length(canonical_sha256) = 64),
  expected_rows INTEGER NOT NULL CHECK (expected_rows >= 0),
  first_source_at TEXT,
  last_source_at TEXT,
  legacy_end_exclusive TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'staging' CHECK (state IN ('staging', 'verifying', 'verified', 'failed', 'rolled_back')),
  verified_at TEXT,
  receipt_json TEXT CHECK (receipt_json IS NULL OR json_valid(receipt_json))
);

CREATE UNIQUE INDEX audit_history_one_verified_source
  ON audit_history_imports (source_project) WHERE state = 'verified';

CREATE TABLE audit_history_events (
  import_id TEXT NOT NULL REFERENCES audit_history_imports(import_id),
  source_id TEXT NOT NULL,
  source_created_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT NOT NULL,
  locale TEXT NOT NULL,
  viewport_width INTEGER,
  viewport_height INTEGER,
  user_agent TEXT NOT NULL,
  metadata TEXT NOT NULL CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
  PRIMARY KEY (import_id, source_id)
);
CREATE INDEX audit_history_created_at_idx ON audit_history_events (created_at, import_id, source_id);

CREATE TRIGGER audit_history_new_import_guard BEFORE INSERT ON audit_history_imports
WHEN NEW.state != 'staging' OR NEW.receipt_json IS NOT NULL OR NEW.verified_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'New imports must start unverified'); END;

-- Prevent changes after the verification snapshot is frozen, including deletion.
CREATE TRIGGER audit_history_insert_guard BEFORE INSERT ON audit_history_events
WHEN COALESCE((SELECT state FROM audit_history_imports WHERE import_id = NEW.import_id), '') != 'staging'
BEGIN SELECT RAISE(ABORT, 'History snapshot is frozen'); END;
CREATE TRIGGER audit_history_update_guard BEFORE UPDATE ON audit_history_events
BEGIN SELECT RAISE(ABORT, 'History rows are immutable; reconcile or revoke the batch'); END;
CREATE TRIGGER audit_history_delete_guard BEFORE DELETE ON audit_history_events
BEGIN SELECT RAISE(ABORT, 'History rows must be retained for rollback evidence'); END;
CREATE TRIGGER audit_history_manifest_guard BEFORE UPDATE ON audit_history_imports
WHEN NEW.import_id != OLD.import_id OR NEW.source_project != OLD.source_project
  OR NEW.manifest_json != OLD.manifest_json OR NEW.manifest_sha256 != OLD.manifest_sha256
  OR NEW.backup_sha256 != OLD.backup_sha256 OR NEW.canonical_sha256 != OLD.canonical_sha256
  OR NEW.expected_rows != OLD.expected_rows OR NEW.first_source_at IS NOT OLD.first_source_at
  OR NEW.last_source_at IS NOT OLD.last_source_at OR NEW.legacy_end_exclusive != OLD.legacy_end_exclusive
BEGIN SELECT RAISE(ABORT, 'History manifest is immutable'); END;
CREATE TRIGGER audit_history_state_guard BEFORE UPDATE OF state ON audit_history_imports
WHEN NOT (
  NEW.state = OLD.state
  OR (OLD.state = 'staging' AND NEW.state IN ('verifying', 'rolled_back'))
  OR (OLD.state = 'verifying' AND NEW.state IN ('verified', 'failed', 'rolled_back'))
  OR (OLD.state IN ('verified', 'failed') AND NEW.state = 'rolled_back')
)
BEGIN SELECT RAISE(ABORT, 'Invalid history state transition'); END;

-- A state flip alone is insufficient. A trusted verifier must supply a matching
-- read-back receipt, and database cardinality/range must still match at commit.
CREATE TRIGGER audit_history_publish_guard BEFORE UPDATE ON audit_history_imports
WHEN NEW.state = 'verified' AND (
  OLD.state != 'verifying' OR NEW.verified_at IS NULL OR NEW.receipt_json IS NULL
  OR json_extract(NEW.receipt_json, '$.format') IS NOT 'asciilens-history-receipt-v1'
  OR json_extract(NEW.receipt_json, '$.importId') IS NOT NEW.import_id
  OR json_extract(NEW.receipt_json, '$.sourceDeletionApproved') IS NOT 0
  OR json_extract(NEW.receipt_json, '$.manifestSha256') IS NOT NEW.manifest_sha256
  OR json_extract(NEW.receipt_json, '$.backupSha256') IS NOT NEW.backup_sha256
  OR json_extract(NEW.receipt_json, '$.canonicalSha256') IS NOT NEW.canonical_sha256
  OR json_extract(NEW.receipt_json, '$.rowCount') IS NOT NEW.expected_rows
  OR json_extract(NEW.receipt_json, '$.reconciliation') IS NOT json_extract(NEW.manifest_json, '$.reconciliation')
  OR json_extract(NEW.receipt_json, '$.verifiedAt') IS NOT NEW.verified_at
  OR (SELECT COUNT(*) FROM audit_history_events WHERE import_id = NEW.import_id) != NEW.expected_rows
  OR (SELECT MIN(source_created_at) FROM audit_history_events WHERE import_id = NEW.import_id) IS NOT NEW.first_source_at
  OR (SELECT MAX(source_created_at) FROM audit_history_events WHERE import_id = NEW.import_id) IS NOT NEW.last_source_at
  OR EXISTS (SELECT 1 FROM audit_collection WHERE started_at < NEW.legacy_end_exclusive)
)
BEGIN SELECT RAISE(ABORT, 'History reconciliation is required'); END;

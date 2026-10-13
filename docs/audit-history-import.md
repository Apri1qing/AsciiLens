# Historical audit import and eventual source deletion

Status: offline implementation and rehearsal only. The old Supabase project `ivpegtwknknqlpmglreh` is paused, and recovering it is blocked by the existing free active-project limit. No source data has been obtained, imported or verified. The user's instruction is **import first, then delete**; permanent deletion still needs the parent's final confirmation after evidence is available. No source deletion command or endpoint is provided.

## Keep the reviewed collection release independent

The already-reviewed `3d76db6` Worker and schema `0001_audit.sql` remain deployable. The parent reports an existing D1 named `asciilens-audit`, ID `6109cf6f-9565-458a-8fea-2900199ff2e4`, with the two original tables empty; Worker `https://asciilens-audit.hyqapril.workers.dev` is bound to `AUDIT_DB`. These are handoff facts, not production checks performed by the import task. Its secret/acceptance/Vercel cutover were still pending at that handoff. Do not recreate these resources or change the independently recorded deployment commit `00f7512b68c18e22cfa2bfc887722dba601a8e8f` without review.

The import follow-up is additive:

- `0002_history.sql` adds `audit_history_imports`, `audit_history_events`, indexes and guards. It does not alter, backfill, clear or drop either original table.
- A separate history table prevents imports from backdating `audit_collection.started_at`, colliding with new integer IDs, or entering reports before verification.
- `AUDIT_HISTORY_ENABLED=true` is an optional, non-secret Worker variable. Leave it unset for the existing collection deployment. The new Worker can still run against `0001` only when history lookup is disabled. Enabling it before applying `0002` fails the summary instead of pretending there is no history.
- Before applying `0002` in production, confirm the exact account/database and inspect its migration ledger read-only. If the original schema was applied directly through the console, `d1_migrations` may not record `0001`; do **not** blindly run all pending migrations and recreate the existing tables. Apply only the reviewed `0002_history.sql` to that existing D1 in an authorized session, or reconcile the ledger through a separately reviewed step. Do not modify `0001` to hide a schema mismatch.
- Do not enable history or change the deployed Worker during this offline task. Resource IDs and the original deployment config are not changed by this follow-up.

## Input contract and backup custody

Later, when source access is possible through an authorized path, freeze old audit writers and obtain **all** `public.audit_events` rows plus independent reconciliation evidence from one consistent PostgreSQL `REPEATABLE READ, READ ONLY` snapshot. Verify the project identity in that session. Never use the old capped summary endpoint as an export. A partial REST page is not a complete backup. Do not resume another project, pause Umee/`umee-staging`, upgrade a plan or acquire new persistent credentials to obtain this data without separate approval.

The export is UTF-8 NDJSON, one row per line, with explicit allowed source columns: `id`, `created_at`, `event_name`, `session_id`, `path`, `referrer`, `locale`, `viewport_width`, `viewport_height`, `user_agent`, `metadata`. Export bigint IDs as decimal **strings**; do not round them through JavaScript numbers. Use a timezone-qualified timestamp, up to PostgreSQL's six fractional digits. A raw backup may contain unwanted legacy metadata; keep it in the user's encrypted private custody, not in Git, chat, task logs or the Cloudflare upload. The importer discards all non-allowlisted fields and applies the same event-specific metadata, path and referrer filtering as new collection.

Retain two independently verified copies of the approved source export/manifest in user-controlled backup locations. Compute SHA-256 over exact file bytes, verify the copies after transfer, and retain the export procedure and snapshot identity. `history/source-reconciliation.sql` is a read-only **reference** for uncapped source totals, exact first/last timestamps, all event counts and distinct sessions, globally and per Shanghai day. It is not executed by the tooling. Generate this evidence inside the same source snapshot, independently of the importer. Counts for `page_view`, `image_upload`, `export_png`, `export_png_failed`, selections and every other event remain individually checkable.

The companion source manifest has this structure (placeholders must be replaced by actual evidence, never guessed):

```json
{
  "format": "asciilens-history-v1",
  "sourceProject": "ivpegtwknknqlpmglreh",
  "sourceTable": "public.audit_events",
  "scope": "all_rows",
  "backupSha256": "<64 lowercase hex characters from the approved export>",
  "snapshotAt": "<source snapshot time with timezone>",
  "legacyEndExclusive": "<approved cutover timestamp, millisecond precision>",
  "reconciliation": {
    "rows": 0,
    "sessions": 0,
    "events": {},
    "firstSourceAt": null,
    "lastSourceAt": null,
    "days": {}
  }
}
```

The zeros above illustrate the schema, not the inaccessible source's contents. Only a independently evidenced empty snapshot may use zero counts. Each nonempty `days` entry has `{ rows, sessions, events }` under a `YYYY-MM-DD` key. `firstSourceAt`/`lastSourceAt` must be UTC strings with exactly six fractional digits. A checksum proves file integrity, **not source authenticity or completeness by itself**; the independently obtained source evidence and operator-verified identity supply that context.

All source rows must precede `legacyEndExclusive` and must not postdate the snapshot. The cutover must not be in the future or overlap the first live D1 event. Reject overlaps rather than guessing whether a historical row duplicates a new event. The importer does not silently discard a post-cutover row from an allegedly complete backup: resolve the source/export scope before proceeding. A later source write invalidates the deletion evidence and requires a new frozen export/reconciliation.

## Offline preparation and restore rehearsal

Node 22+ and the Worker package dependencies are sufficient. No network auth or `.env` files are read by the CLI, and it accepts no `--remote` mode:

```bash
npm --prefix workers/audit run history:prepare -- /private/source.ndjson /private/source-manifest.json /private/new-preparation-directory
npm --prefix workers/audit run history:rehearse -- /private/source.ndjson /private/source-manifest.json /private/new-rehearsal-directory
```

The preparation validates exact backup bytes, source identity/scope, IDs, timestamps, row uniqueness, source totals/ranges and daily counters; applies the privacy whitelist; then fingerprints all retained fields in a deterministic ID order. The reviewed memory limit is 128 MiB per backup (4 MiB per manifest); larger inputs require a separately reviewed streaming implementation. Unexpected changes to session IDs or other fields that alter independent counters stop the import for review.

Outputs are a sanitized `plan.json` and parameterized `staging-batches.json`; files are mode `0600` inside a new `0700` directory. Existing output directories are refused. Keep them outside Git; `audit-history-private/` is also ignored. The rehearsal restores to a fresh, disposable local D1 using both real migrations and the real importer/verifier. Its receipt is explicitly `LOCAL-REHEARSAL-ONLY.json`, with `productionImportConfirmed: false` and `sourceDeletionApproved: false`. A local rehearsal is not proof of a remote import.

Only sanitized rows reach the destination. Original source ID and canonical UTC microsecond timestamp are retained as `source_id`/`source_created_at`. A separate millisecond timestamp supports the unchanged Shanghai day-window queries; flooring within a millisecond cannot shift a midnight boundary. Exact source timestamps remain available for full-fidelity reconciliation. Unknown free-form metadata and filenames are not copied.

## Approved destination execution and verification

The reusable operator API is `stageImport(db, prepared)`, `verifyImport(db, prepared)`, and `revokeImport(db, importId)` in `history/importer.js`. It takes an already-authorized D1 database binding/adapter with `prepare`, `bind`, `first`, `all`, `run` and **transactional** `batch` semantics. This task deliberately provides no remote-authentication adapter, public import route, platform token, cron or automatic remote execution. Connect it to the exact approved D1 in the future authorized operator environment; the local CLI is not a production executor. Do not replay a rehearsal receipt or hand-set a state flag to substitute for executing the verifier against the actual destination.

1. Confirm the source export/backup evidence, exact destination account and D1 ID, reviewed follow-up commit, and approved one-time operator access. Apply only the missing `0002` schema as described above. Verify that existing live data and its marker are unchanged.
2. Stage the prepared snapshot. The import ID is derived from its canonical manifest. `(import_id, source_id)` is unique, and writes use parameterized inserts without replacing existing rows. Each batch of at most 50 inserts is atomic. A stopped upload stays invisible; rerunning the same preparation through `stageImport` resumes idempotently. A conflicting existing row is detected during verification, not overwritten.
3. Freeze the batch by entering `verifying`. Database guards forbid changes to the manifest or staged rows and prevent insert/update/delete races during the verifier's paged read-back. A transport failure in verification can be retried; a content mismatch marks the batch `failed` and it stays excluded.
4. Read back **every** destination row, with no 10,000-event report cap. Recompute the deterministic all-field SHA-256 and compare it with the sanitized backup, then compare uncapped counts, microsecond range, per-event counts and Shanghai daily event/session counts with independent source evidence. Retained metadata/path/user-agent differences also change the all-field digest, even if counters happen to match.
5. Publish only by committing the verifier's receipt (manifest/backup/canonical hashes, row count, full reconciliation, timestamp) and the state transition. D1 also checks current cardinality/range and overlap at this commit. A plain `state='verified'` or `history_imported=true` is insufficient. At most one verified snapshot of this source can be active; alternate snapshots must be reviewed and the previous batch revoked before replacement.
6. Enable the reviewed history-aware Worker with `AUDIT_HISTORY_ENABLED=true` only after schema and verification are ready. Verify authorized aggregate reads and their coverage metadata. Keep the normal summary bearer contract unchanged. Record destination identity, Worker version, database receipt and backup hashes in the parent handoff; repeat the full destination verification in a fresh read-only phase before any destructive proposal.

The database guards protect routine mistakes and state-only claims. They are not a security boundary against an administrator who can forge receipts, disable triggers or replace the database. Account/backup provenance and final operator review remain necessary; no software flag authorizes source deletion.

## Reporting contract and rollback

With history disabled, the new Worker returns `historicalData: "not_checked"` and `history.status: "disabled"`, with unknown history and live-only totals. This avoids falsely claiming “not imported” if the operator deliberately disables lookup after an import. It still works with the original two-table schema.

With history enabled, only batches that have a matching verified receipt contribute to the existing summary counters and rankings. `history.status` is `not_imported`, `unverified` (with staging/verifying/failed/rolled_back states), or `verified_snapshot`. The latter includes imported row count, source snapshot time, original first/last times, cutover, verification time and hashes. It asserts correspondence to that supplied snapshot, not complete historical product usage.

`collectionStartedAt`, `status` and the new `coverage.live` object always describe **new live collection**; `statusScope: "live_collection_only"` makes this explicit. Historical coverage is separate under `coverage.history`. Do not backdate the new collection start, infer events before the first historical record, fill an interval between the legacy boundary and live start with zeros, or compute growth against an unknown interval. The public summary's 10,000-event cap and `truncated` flag apply to the combined rows; use the uncapped verification receipt for import reconciliation.

`revokeImport` changes only that batch's state to `rolled_back`. Subsequent reports exclude it immediately; rows, provenance and receipt remain retained, and live events/collection start are unchanged. To hide all history without a schema change, an authorized operator can disable history lookup and redeploy the appropriate reviewed Worker. Keep the source backups. A failed or revoked immutable batch is not repaired by manually toggling flags: review a new source snapshot/preparation and verify it independently. No cleanup or retention deletion is performed automatically.

## Gate before asking for permanent source deletion

Prepare a concrete deletion review **only after** actual source access and destination import succeed. Supply all of the following to the parent:

- Exact source project/resource identity and inventory. Deleting a project affects more than `audit_events`; confirm whether any other database, Auth, Storage, functions or consumers exist and how they are backed up or retained. Do not assume the request covers unrelated data.
- Evidence old writers are stopped, the final source snapshot covers all required rows, and a final source count/range/fingerprint check detects no writes after export.
- Two retained backup copies with matching SHA-256, documented private custody and a successful restoration rehearsal; include source and sanitized-export checksums and the privacy mapping.
- Actual destination ID, reviewed commit/Worker version, verified import receipt, exact row/time/per-event/daily comparisons, metadata digest match, and rollback/restore instructions. A local-only receipt, empty new D1 or successful schema application does not satisfy this gate.
- History-aware aggregate checks, known gaps and remaining limitations, plus confirmation all consumers use the new backend and no dependency still needs the old project.
- The exact irreversible deletion proposed, what remains in backups, and the parent's/user's **final explicit confirmation at that time**.

Until then, preserve the paused source. This repository contains no source deletion automation, paid upgrade flow, credential extraction or permission expansion. The recovery quota blocker remains unresolved; do not pause other projects to work around it.

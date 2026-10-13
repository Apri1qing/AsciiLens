# AsciiLens Usage Audit

AsciiLens records anonymous product-usage events and exposes a token-protected, aggregate-only summary API. Image-to-ASCII processing remains entirely in the browser.

This implementation replaces the Supabase runtime dependency with Cloudflare Worker + D1. **Code readiness is not production cutover.** Deployment requires the account/resource/security approval and user-entered secrets in [the migration runbook](audit-cloudflare-migration.md).

The separate [historical import and deletion runbook](audit-history-import.md) describes the optional follow-up. It does not block the reviewed live-collection release. No historical source data has yet been obtained or imported.

## Architecture and credentials

```text
Browser ── POST /api/audit/event ──> Vercel ── private proxy bearer ──> Worker ──> D1
Agent   ── GET /api/audit/summary ─> Vercel ── private proxy bearer ──> Worker ──> D1
           existing read bearer
```

The browser and agents keep the existing URLs on `https://asciilens.indieapril.fun`. Vercel implements the proxy in the existing functions, rather than a public rewrite. The browser never calls the Worker directly, so no CORS, custom domain or DNS changes are needed. The Worker uses its default HTTPS `workers.dev` address.

| Setting | Location | Purpose |
| --- | --- | --- |
| `AUDIT_READ_TOKEN` | Existing Vercel server environment only | Existing public summary authorization; unchanged and never sent to Cloudflare |
| `AUDIT_WORKER_URL` | Vercel Production only | Non-secret HTTPS Worker origin, with no path, query or credentials |
| `AUDIT_PROXY_TOKEN` | Vercel Production and Cloudflare Worker Secret | New service credential authorizing event writes and aggregate reads at this Worker only |
| `AUDIT_DB` | Worker D1 binding | Runtime database access without a Cloudflare API token |

The new proxy token is **not** a Cloudflare account/API token. The user must approve and securely enter it at both providers. Do not generate it in an agent run, copy an existing secret, put it into `VITE_*`, chat, a command argument, a config file or Git. This change does not automatically create credentials or expand persistent platform permissions. The existing network-provided summary credential must not be used for Cloudflare authentication.

Worker requests require the proxy secret for both routes. The public read token cannot directly read the Worker. Vercel sends only sanitized JSON and the proxy authorization; it does not forward client IP headers, cookies, the caller's authorization, or arbitrary incoming headers. Redirects are refused and upstream calls time out after five seconds. Writes are not automatically retried because a timeout may follow a successful commit.

Missing/invalid proxy configuration retains the existing event `204` no-op behavior and summary `503` behavior. Vercel Preview/Development deployments always disable this backend even if variables are inherited. Worker-side missing configuration, missing migrations and D1 failures fail closed. API responses use `Cache-Control: no-store`; provider error details are not logged or returned by application code.

## Event and privacy contract

The public event shape remains `{ eventName, sessionId, path, referrer, locale, viewport, metadata }`. Names retain the existing lowercase `a-z`, digits, `_ . : -` validation. Unknown valid event names are counted, with no metadata. Server timestamping remains authoritative. Input is bounded to 16 KiB.

The current editor events and their allowed metadata are:

| Event | Metadata |
| --- | --- |
| `page_view`, `new_image_picker_open`, `selection_delete`, `reset_effects` | None |
| `image_upload` | `source` (`upload`/`replace`), image MIME `file_type`, coarse `file_size_bucket` |
| `render_mode_change` | `mode` (`overlay`/`full`) |
| `selection_create` | `shape_type` (`rect`/`circle`/`freehand`) |
| `selection_tool_change` | `shape_mode` with the same shape values |
| `export_png` | `mode`, `color_mode`, nonnegative integer `selection_count` |
| `export_png_failed` | Known error code `reason`; arbitrary exception messages become `unknown` |

File-size buckets remain `<500kb`, `500kb-2mb`, `2mb-8mb`, `8mb+`. `export_png` counts an export attempt, just as before; a later `export_png_failed` does not subtract it. `sessions` counts distinct nonempty anonymous IDs in the window, using the existing browser localStorage identifier, not an inactivity-based session definition.

Stored context remains browser locale, viewport dimensions, path, referrer host and user agent. Query strings/fragments are stripped from paths; full referrers are reduced to hosts. Unknown metadata, image data, file names, client timestamps, IP fields and other extra payload fields are discarded at both boundaries. Free-form metadata from custom callers is deliberately no longer persisted. Browser rendering and event emission code are unchanged.

Application storage contains no image contents, file names, IP columns or raw referrer URLs. Cloudflare only receives requests from Vercel. Providers may still process transport metadata independently; this change does not claim control of all provider infrastructure logs. Worker observability is disabled in the committed config, and application code logs no payloads, credentials or upstream errors.

## Summary API

`GET /api/audit/summary` still requires `Authorization: Bearer <AUDIT_READ_TOKEN>` on Vercel. It returns `{ "ok": true, "summary": ... }`, retaining `window`, `totals`, `topEvents`, `topPages`, `uploadTypes`, `uploadSizeBuckets`, `renderModes` and `truncated`.

- `yesterday` (default, including unknown ranges): previous Asia/Shanghai calendar day.
- `today`: current Asia/Shanghai calendar day.
- `7d`: current day plus the previous six days, not a rolling 168-hour window.
- Windows are inclusive at the start and exclusive at the end.
- At most the first 10,000 ordered events are aggregated. One extra row detects whether rows were omitted. `truncated: true` means **all counts and rankings are partial**, not exact totals. Exactly 10,000 rows now correctly returns `false`.

The additive `summary.coverage` object is mandatory for interpreting reports:

```json
{
  "source": "cloudflare_d1",
  "collectionStartedAt": null,
  "historicalData": "not_checked",
  "historicalUsage": "unknown",
  "status": "not_started",
  "observedStart": null,
  "observedEnd": null,
  "ongoing": true,
  "history": { "status": "disabled", "includedInTotals": false, "usage": "unknown" },
  "note": "Live D1 events only. Historical lookup is disabled, so import state is not checked. Earlier usage and collection gaps remain unknown, not zero."
}
```

`collectionStartedAt` is set atomically with the first successfully stored real event. It is a conservative coverage boundary, not the migration-file execution time. The marker survives later writes and is separate from the events table. No event is seeded to establish it.

With optional historical lookup enabled, `coverage.live` and `coverage.history` report live collection and verified imported snapshots separately. The original `status` and `collectionStartedAt` still refer to live collection (`statusScope: "live_collection_only"`); they are not backdated by an import. Only frozen, reconciled historical rows with a matching verification receipt join the existing counters. Disabled lookup reports `not_checked`, not an unverified claim that data was or was not imported. See the import runbook for states, known gaps and rollback.

| `coverage.status` | Meaning for the requested window |
| --- | --- |
| `not_started` | No collection marker exists; coverage and earlier usage are unknown |
| `unavailable` | Collection has not reached the observable portion of this window (or starts at/after its exclusive end); historical usage is unknown |
| `partial` | Collection begins inside the requested window; only the post-start part can be reported |
| `covered` | Collection started by the window's start; counts still describe recorded events only |

`observedStart`/`observedEnd` give the covered part up to the time of the query. `ongoing` identifies an unfinished calendar window. `covered` does not prove complete delivery: browser beacons are best effort, and outages can cause gaps. Reports must state the coverage start and **must not describe zeros for unavailable periods as zero usage or calculate growth against unknown history**. Old consumers can still parse the existing fields but must adopt `coverage` before making historical comparisons.

The paused Supabase project `ivpegtwknknqlpmglreh` remains untouched. Its old rows were not read, imported, deleted or verified; their values remain unknown. No resume, keepalive, paid upgrade, destructive migration or fallback to Supabase is implemented.

## Local verification

Use Node 22+ (validated with Node 24). Install the existing app and isolated Worker tooling dependencies:

```bash
npm ci
npm --prefix workers/audit ci
npm run test:audit
npm run lint
npm run build
npm --prefix workers/audit run check
```

`test:audit` combines Node tests with isolated Miniflare/workerd D1 tests. Each integration test creates disposable local state, uses literal test-only credentials, disables external Worker fetches, and never loads production `.env` files or a Cloudflare account. The proxy-to-Worker integration test intercepts `fetch` and dispatches directly to the local runtime. The Miniflare 4 test dependency is pinned to a stable release; Wrangler's separately pinned CLI has its own transitive Miniflare dependency.

`check` is `wrangler deploy --dry-run`: it builds the Worker bundle without publishing. For an interactive local database, `npm --prefix workers/audit run db:local` applies schema only, and `npm --prefix workers/audit run dev` starts a local Worker. Supply a manually chosen **local-only** dummy `AUDIT_PROXY_TOKEN` in the ignored `workers/audit/.dev.vars` file if needed; never reuse production credentials. Keep `--local`; never use `--remote` for test fixtures.

Production acceptance uses authorized read-only summaries and passive observation of natural usage. Do not post synthetic events to production. Scheduling stays outside AsciiLens; this migration adds no cron jobs or messaging automation.

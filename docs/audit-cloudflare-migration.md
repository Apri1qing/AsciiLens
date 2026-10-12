# Worker + D1 migration runbook

Status: implementation prepared for review; production cutover is pending parent confirmation. The public site is on Vercel at `https://asciilens.indieapril.fun`. This runbook changes only AsciiLens audit storage. Do not touch Umee, pause `umee-staging`, alter DNS, delete old domains/databases, or upgrade a plan.

## Proposed minimum resources and approvals

| Item | Proposed configuration | Required before production |
| --- | --- | --- |
| Cloudflare account | User-selected account with existing Workers/D1 access | Confirm the non-secret account ID and available free capacity; no new persistent agent permissions |
| Worker | `asciilens-audit`, default `workers.dev` endpoint, no custom routes, preview URLs disabled | Confirm name and account; no DNS change |
| D1 | `asciilens-audit`, binding `AUDIT_DB`, new empty database, default placement | Confirm name, ID and placement; Shanghai is a reporting timezone, not a storage-location claim |
| Worker Secret | New `AUDIT_PROXY_TOKEN`, restricted in purpose to these two audit routes | Explicit approval for this new credential; user securely enters the same value into Cloudflare and Vercel, without sharing it in chat |
| Vercel Production | New `AUDIT_WORKER_URL` and Secret `AUDIT_PROXY_TOKEN` | Confirm the approved Worker origin and Production-only scope; leave existing `AUDIT_READ_TOKEN` in place |
| Deployment | Reviewed branch/PR commit, Worker first and Vercel cutover second | Complete checks, parent approval of exact resources/security configuration, then deployment authorization |

The proxy token grants event-write and aggregate-read access to this Worker. It cannot manage a Cloudflare account or expose raw rows through the implemented API. The existing summary token retains its public read-only contract and stays solely on Vercel. A Worker direct from the browser would add a cross-origin interface and complicate protecting the origin; the selected Vercel proxy avoids that and costs one server-to-server hop per request.

Do not ask the user to paste secrets into the assistant. Do not read, export, echo or migrate existing secret values. A Cloudflare login in a separate console does not authorize creating an agent API token. Prefer actions in the user's already-authorized account session. If CLI access needs a new API token or OAuth grant, stop and present the exact requested scopes, account scope and duration to the parent first; account-wide Workers/D1 write permission must not be treated as scoped to this single app. Never reuse the network secret supplied for the old statistics API.

No resource is auto-created by this repository. `wrangler.jsonc` has an explicit all-zero D1 ID placeholder (rather than an absent ID that a CLI could provision automatically). Replace it only with the approved new database ID. `remote: false` isolates local development; it is not a production deployment lock. There is no production deploy npm script or new GitHub Actions workflow.

## Preparation without account access

1. Preserve the worktree; fetch `main` without resetting or pulling over local changes. Work on a separate branch.
2. Run the commands in [audit.md](audit.md#local-verification). Retain the commit SHA and pass/fail evidence.
3. Review schema `workers/audit/migrations/0001_audit.sql`. It creates the two new D1 tables and an index only; there is no Supabase command and no data import/cleanup.
4. Keep all fabricated events inside disposable Miniflare D1. The local migration command creates schema but no event or coverage marker.
5. Prepare a draft PR; do not merge an unreviewed change. Vercel Preview audit endpoints return event `204` and authorized summary `503` even if production settings are inherited.

For sandboxed tooling, cache and logs can be directed to allowed temporary paths without reading real credential stores:

```bash
npm_config_cache=/tmp/asciilens-npm-cache npm --prefix workers/audit ci
XDG_CONFIG_HOME=/tmp/asciilens-wrangler-config WRANGLER_LOG_PATH=/tmp/asciilens-wrangler-logs WRANGLER_SEND_METRICS=false CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npm --prefix workers/audit run check
```

This changes local config/cache locations only, not network routing, proxies or authentication. Retain all environment network restrictions. Dependency installation needs the package registry; the tests themselves use local state and mock outbound calls.

## Approved deployment sequence — do not run before confirmation

1. Confirm the exact account, free capacity, Worker/database names and placement, the new proxy-secret arrangement, the target commit and the release window. If free capacity is insufficient, stop; no paid upgrade is authorized.
2. In that account, create the approved empty D1 and record its non-secret ID. Update the binding's placeholder. Do not reuse a Umee or other existing database. Apply `0001_audit.sql` to **that new D1 only**, using the Cloudflare console or an already-authorized Wrangler session. With authorized CLI access, the explicit command is `wrangler d1 migrations apply asciilens-audit --remote --config workers/audit/wrangler.jsonc`; verify the account and database ID immediately before it. This is schema setup, not an import of historical data.
3. Deploy the reviewed Worker bundle with binding `AUDIT_DB`, default `workers.dev`, no custom domain/routes, no cron, disabled preview URLs and disabled observability. The user securely enters `AUDIT_PROXY_TOKEN` in the Worker Secret UI. An unconfigured Worker refuses requests. Do not enable logs that include headers or payloads. No `AUDIT_READ_TOKEN` or Supabase secret is copied to Cloudflare.
4. Verify only reads: the unauthenticated Worker summary returns `401` once configured; an authorized service request returns the summary with `coverage.status: not_started`. Use the user's authorized secure tooling; do not request or print the proxy secret. The database must still contain zero events and no collection marker. Never submit a test event.
5. The user securely enters the same new proxy secret in Vercel **Production**, and sets `AUDIT_WORKER_URL` to the approved HTTPS Worker origin. Keep `AUDIT_READ_TOKEN` unchanged. Do not set any `VITE_*` secret or configure production storage for Preview. Existing Supabase variables are unused by the new code; no secret removal or rotation is part of this release.
6. After PR review and the parent's deployment confirmation, release the reviewed Vercel commit. Environment changes apply to the resulting deployment; they do not alter already-built deployments. Keep the current site hostname. Do not push/merge `main` or deploy production before that approval.
7. Verify the public summary rejects missing/wrong authorization and accepts the existing bearer contract for `today`, `yesterday`, `7d`. Check `Asia/Shanghai`, no-store responses and `coverage`. Do not load the interactive site solely to generate analytics or send synthetic events. Observe natural real traffic and read its aggregate summary later. A `not_started` status before real use is expected.
8. Record Worker version, D1 ID, Vercel deployment, reviewed commit and the actual `collectionStartedAt` from a read-only summary. Report earlier periods as unknown, and mark partial or truncated totals explicitly. Never report “historical migration completed.”

CLI invocations above are instructions for an approved session, not actions executed by the preparation task. No new platform tokens are created or transferred automatically.

## Rollback and outages

If Worker/D1 is unavailable, event storage returns an error and the browser editor continues operating. Summaries return an error instead of successful zero counts. No automatic retries, buffering, dual writes, Supabase fallback or keepalive requests are added. This preserves the existing best-effort collection model; missed events are not reconstructed.

To stop the new backend without affecting the editor, an authorized operator can remove/disable its new Vercel proxy configuration and redeploy the reviewed app: valid events return `204`, summaries `503`. Keep D1 and the old Supabase project intact. A rollback to an older Vercel deployment may resume calls to the paused Supabase backend; choose that only with an explicit understanding of the analytics outage. Neither rollback restores unknown historical usage. Re-enabling after a gap does not make that gap complete; reports must identify any known interruption.

There is no retention/deletion policy added in this migration. Monitor free quotas with existing provider tooling; any paid plan, automated cleanup, new persistent permission or additional DNS change needs separate approval.

## References

The binding and migration workflow follow [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/). Writes and reads use [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) and transactional batches. Secret storage and Worker configuration follow [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and [environment secret guidance](https://developers.cloudflare.com/workers/wrangler/environments/). These references support implementation details; account access, capacity and deployment completion still require actual confirmation.

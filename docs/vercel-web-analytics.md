# AsciiLens Vercel Web Analytics

Status: **code integration only**. Dashboard activation is handled by the coordinator. Custom audit collection remains live until production Web Analytics collection is confirmed.

Production host: `https://asciilens.online`  
Vercel project: `asciilens` (`prj_illrJwq5e4QuWHezUbp79UYWuBzq`)

This change does not deploy, merge, enable the dashboard, or delete Worker/D1 resources.

## Sequencing

1. **This PR:** add the standard `@vercel/analytics` `inject()` call so the production bundle can load `/_vercel/insights/script.js`. Keep every audit beacon, proxy, Worker, and D1 path unchanged.
2. **Coordinator:** enable Web Analytics in the Vercel project dashboard. The CLI `vercel project web-analytics` path is interactive and is not run here.
3. **After merge + dashboard enablement:** confirm production collection (script `200`, visits visible in the dashboard / official API). Do not treat local `vite preview` as collection proof; the insights script is served by Vercel only when WA is enabled.
4. **Second PR, only after that confirmation:** remove active audit *calls* from the editor.
5. **Last:** delete the audit proxy, Worker, D1, env vars, and leftover docs/tests. No infrastructure deletion is authorized by this document.

Ribbon is out of scope. Do not change Ribbon.

## What this integration does

AsciiLens is a Vite + React SPA. The official non-Next path is a single client-side call:

```js
import { inject } from '@vercel/analytics'

inject()
```

That is the only application change besides this document, tests, and the dependency. It is called once from `src/main.jsx`.

Intentionally omitted:

- `track()` custom behavior events
- `pageview()` / `disableAutoTrack` virtual-page overrides
- `beforeSend` rewriting
- UTM or channel tracking
- Speed Insights
- hostname allowlists or EdgeOne-specific guards

Default `inject()` auto-tracks pageviews. The editor is a single `/` studio route; React Router 404s still count as ordinary pageviews, not product-behavior events.

## Current production baseline (read-only, 2026-11-05)

Observed against `https://asciilens.online` before this PR:

| Probe | Result |
| --- | --- |
| `GET /_vercel/insights/script.js` | `404` `x-vercel-error: NOT_FOUND` |
| `GET /_vercel/insights/view` | `404` |
| Production JS bundle `/assets/index-DXbGjgss.js` | contains `/api/audit/event`; does **not** contain `/_vercel/insights` or `@vercel/analytics` |
| Official WA query API without auth | `403` missing token (expected). Authenticated `400` “not enabled” was previously reported by the coordinator |

Until the dashboard is enabled, a correctly injected client still cannot collect. After enablement and a production deploy of this integration, the same script URL should return `200` and visits should appear in the project Analytics view.

## Existing custom audit integration (keep until later PRs)

Browser events still go to the same-origin Vercel proxy, which forwards to Cloudflare Worker + D1. Public URLs stay on the Vercel app; the browser never calls the Worker directly.

```text
Browser ── POST /api/audit/event ──> Vercel ── AUDIT_PROXY_TOKEN ──> Worker ──> D1
Agent   ── GET /api/audit/summary ─> Vercel ── AUDIT_READ_TOKEN
                                         └── AUDIT_PROXY_TOKEN ──> Worker ──> D1
```

Credentials live only in Vercel/Cloudflare project settings. Do not copy them into source, logs, or PRs.

| Name | Where | Role |
| --- | --- | --- |
| `AUDIT_READ_TOKEN` | Vercel server env | Public summary bearer |
| `AUDIT_WORKER_URL` | Vercel Production | `https://*.workers.dev` origin, no path/credentials |
| `AUDIT_PROXY_TOKEN` | Vercel Production + Worker secret | Proxy-to-Worker auth |
| `AUDIT_DB` | Worker D1 binding | Runtime storage |

Preview/Development deployments already no-op event writes (`204`) and return summary `503` even if env vars are inherited.

### Client calls (do not remove in this PR)

| Location | Events |
| --- | --- |
| `src/lib/audit.js` | `trackAuditEvent` → `POST /api/audit/event` via `sendBeacon`/`fetch` |
| `src/pages/Studio.jsx` | `page_view`, `image_upload`, `new_image_picker_open`, `render_mode_change`, `selection_create`, `selection_delete`, `reset_effects`, `selection_tool_change` |
| `src/components/studio/EditorPanel.jsx` | `export_png`, `export_png_failed` |

### Proxy, shared, Worker, tests, docs

| Path | Role |
| --- | --- |
| `api/audit/event.js` | Vercel function; sanitizes and proxies writes |
| `api/audit/summary.js` | Vercel function; token-gated aggregate read |
| `server/audit-utils.js` | Body limits, bearer compare, Worker fetch guards |
| `shared/audit.js`, `shared/audit-event.js` | Windowing, summary shape, sanitization |
| `workers/audit/index.js` | Worker routes |
| `workers/audit/storage.js` | D1 reads/writes |
| `workers/audit/wrangler.jsonc` | Worker `asciilens-audit`, D1 `asciilens-audit` / `AUDIT_DB` |
| `workers/audit/migrations/0001_audit.sql` | Live tables |
| `workers/audit/migrations/0002_history.sql` | Optional history tables |
| `workers/audit/history/*` | Offline import tooling |
| `tests/audit/*.test.js` | Proxy and summary unit tests |
| `workers/audit/test/*.js` | Miniflare Worker/D1 tests |
| `docs/audit.md` | Current audit contract |
| `docs/audit-cloudflare-migration.md` | Worker/D1 cutover runbook |
| `docs/audit-history-import.md` | Historical import runbook |

Recorded editor event names (`page_view`, `image_upload`, `export_png`, …) are **audit** events. They are not sent to Vercel Web Analytics.

## Proposed follow-up removal scope

Do not start these until production WA collection is confirmed.

### Second PR — stop audit *calls* only

- Remove `trackAuditEvent(...)` from `src/pages/Studio.jsx` and `src/components/studio/EditorPanel.jsx`.
- Delete `src/lib/audit.js` after it has no callers.
- Leave proxy, Worker, D1, summary API, and env vars running so historical/live audit reads still work during the overlap.
- Re-run editor smoke (upload, render, export). Product behavior must stay intact.

### Last PR / operator steps — infrastructure deletion

Code (after agents no longer depend on `GET /api/audit/summary`):

- `api/audit/event.js`, `api/audit/summary.js`
- `server/audit-utils.js`
- `shared/audit.js`, `shared/audit-event.js`
- `workers/audit/**`
- `tests/audit/**`
- `docs/audit.md`, `docs/audit-cloudflare-migration.md`, `docs/audit-history-import.md`
- README Usage Audit section and `npm run test:audit`

Operator-only, still not authorized here:

- Vercel env: `AUDIT_READ_TOKEN`, `AUDIT_WORKER_URL`, `AUDIT_PROXY_TOKEN`
- Cloudflare Worker `asciilens-audit`
- D1 `asciilens-audit`
- Worker secret `AUDIT_PROXY_TOKEN`

Agents that currently poll `/api/audit/summary` need the Vercel dashboard or official Web Analytics API before the summary proxy is deleted.

## Integration considerations

- **Dashboard enablement is required.** Code without dashboard enablement still 404s the insights script. Dashboard enablement without this client still has no collector in the production bundle.
- **Vercel-only script.** `/_vercel/insights/script.js` is served by Vercel. EdgeOne or other hosts will 404 the script; that is expected and must not be patched with custom loaders.
- **Preview vs production.** Worker proxy already ignores non-production `VERCEL_ENV`. Web Analytics preview collection is a dashboard setting, not an app flag.
- **No secrets in the client.** `@vercel/analytics` uses the platform script. Audit tokens stay server-side.
- **SSO.** `*.vercel.app` preview URLs may be SSO-protected; custom domains `asciilens.online` / `www.asciilens.online` are the public collection surface.
- **Do not post synthetic production events** to either WA or `/api/audit/event`. Confirm collection from natural traffic and dashboard/API reads.

## Local verification

```bash
npm ci
npm run test:audit
npm run test:analytics
npm run lint
npm run build
npm run test:analytics
```

The second `test:analytics` pass asserts the production bundle contains `/_vercel/insights` **and** `/api/audit/event`.

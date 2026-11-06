# AsciiLens Vercel Web Analytics

Status: **production collection confirmed.** AsciiLens sends pageviews through standard Vercel Web Analytics only. The custom audit pipeline is removed from the application.

Production host: `https://asciilens.online`  
Vercel project: `asciilens` (`prj_illrJwq5e4QuWHezUbp79UYWuBzq`)

This change does not deploy, enable or disable dashboard settings, or delete live Cloudflare Worker/D1 resources.

## Current collector

AsciiLens is a Vite + React SPA. The official non-Next path is a single client-side call:

```js
import { inject } from '@vercel/analytics'

inject()
```

It is called once from `src/main.jsx`. Default `inject()` auto-tracks pageviews. The editor is a single `/` studio route; React Router 404s still count as ordinary pageviews, not product-behavior events.

Intentionally omitted:

- `track()` custom behavior events
- `pageview()` / `disableAutoTrack` virtual-page overrides
- `beforeSend` rewriting
- UTM or channel tracking
- Speed Insights
- hostname allowlists or EdgeOne-specific guards
- a replacement for the removed custom audit tracker

## Production collection evidence

Official Vercel Web Analytics API, Fri Nov 6, 2026, 12:45 AM America/New_York (EST):

| Metric | Value |
| --- | --- |
| Visitors | 2 |
| Pageviews | 2 |
| Path | `/` |

Collection is live on Vercel-hosted production. Local `vite preview` is not collection proof; `/_vercel/insights/script.js` is served by Vercel only when Web Analytics is enabled.

## Removed custom audit pipeline

The previous Worker + D1 audit path is no longer part of the app:

- No `trackAuditEvent` beacons from Studio or EditorPanel
- No `src/lib/audit.js`
- No Vercel routes at `/api/audit/event` or `/api/audit/summary`
- No production code reads `AUDIT_WORKER_URL` or calls Worker `asciilens-audit`

Live Cloudflare resources are **not** deleted by this change. A later operator step can remove:

- Vercel env: `AUDIT_READ_TOKEN`, `AUDIT_WORKER_URL`, `AUDIT_PROXY_TOKEN`
- Cloudflare Worker `asciilens-audit`
- D1 `asciilens-audit`
- Worker secret `AUDIT_PROXY_TOKEN`

Do not treat leftover env vars or an idle Worker as an active application dependency.

## Integration considerations

- **Vercel-only script.** `/_vercel/insights/script.js` is served by Vercel. EdgeOne or other hosts will 404 the script; that is expected and must not be patched with custom loaders.
- **Preview vs production.** Web Analytics preview collection is a dashboard setting, not an app flag.
- **No secrets in the client.** `@vercel/analytics` uses the platform script.
- **SSO.** `*.vercel.app` preview URLs may be SSO-protected; custom domains `asciilens.online` / `www.asciilens.online` are the public collection surface.
- **Do not post synthetic production events** to Web Analytics. Confirm collection from natural traffic and dashboard/API reads.

## Local verification

```bash
npm ci
npm run test:analytics
npm run lint
npm run build
npm run test:analytics
```

The second `test:analytics` pass asserts the production bundle contains `/_vercel/insights` and does **not** contain `/api/audit/event`.

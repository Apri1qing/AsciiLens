# ASCII LENS

ASCII LENS is a Vite + React app for turning images into stylized ASCII artwork.

## Public URL

https://asciilens.indieapril.fun/

## Usage Audit

AsciiLens can record anonymous usage events and expose a token-protected summary API for agents through a Vercel same-origin proxy and Cloudflare Worker + D1. See [docs/audit.md](docs/audit.md).

## Web Analytics

AsciiLens uses standard Vercel Web Analytics for automatic pageviews on Vercel-hosted production. Custom audit collection stays in place until production WA collection is confirmed. See [docs/vercel-web-analytics.md](docs/vercel-web-analytics.md).

## Development

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

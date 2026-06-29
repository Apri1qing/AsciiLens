---
name: acidlens-deploy
description: Deploy AcidLens to Vercel and Tencent EdgeOne Pages, verify GitHub-triggered deployments, and run manual production releases. Use when the user asks to deploy, redeploy, bind GitHub, check Vercel or EdgeOne deployment status, configure EdgeOne API token, or document the AcidLens release workflow.
---

# AcidLens Deploy

## Quick Start

Use this skill only inside `/Users/april/Documents/personal/AcidLens`.

1. Inspect the worktree before deploying:

```bash
git status --short
```

2. Run the local quality gates:

```bash
npm run lint
npm run build
```

3. Deploy through the right path:

- Vercel: push `main` when GitHub auto deployment is desired, or use Vercel CLI for a manual production deploy if requested.
- EdgeOne: use direct upload with `--area overseas`; do not rely on the default area.

Read [references/deployment.md](references/deployment.md) before changing deployment settings, GitHub Actions, domains, or EdgeOne project configuration.

## Vercel

The project is already linked to Vercel via `.vercel/project.json`. Vercel deploys from GitHub on pushes to `main`.

For a manual deploy, prefer:

```bash
npm run build
npx vercel deploy --prod
```

After deployment, report the production URL and whether the deploy was GitHub-triggered or CLI-triggered.

## EdgeOne

EdgeOne GitHub import was unreliable in the console for this project, so the repeatable path is CLI direct upload.

Use `.env.local` for the local API token:

```bash
EDGEONE_API_TOKEN=...
```

Never echo the token. Load it locally and deploy to the overseas area:

```bash
set -a
source .env.local
set +a
npm run build
npx edgeone pages deploy ./dist -n asciilens -a overseas -t "$EDGEONE_API_TOKEN"
```

Always include `-a overseas`. Without it, the CLI defaults to `global`, which is not the desired international deployment target for AcidLens.

## Verification

After every deployment:

- Capture the provider, deployment id or URL, and area.
- For EdgeOne, confirm the CLI output says `Production environment, overseas area`.
- If a bare EdgeOne URL returns `401 Authorization Required` with `eo_time missing`, report that the CLI URL is protected or temporary and check the EdgeOne Pages console/domain settings.
- Do not create or update GitHub Actions workflows unless the user explicitly asks for automation files.

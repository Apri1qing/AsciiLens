# AcidLens Deployment Reference

## Known Project State

- Workspace: `/Users/april/Documents/personal/AcidLens`
- GitHub repository: `Apri1qing/AsciiLens`
- Main branch: `main`
- Vercel production URL: `https://asciilens.vercel.app`
- Vercel project name: `asciilens`
- Vercel project id: `prj_illrJwq5e4QuWHezUbp79UYWuBzq`
- EdgeOne project name: `asciilens`
- EdgeOne project id: `pages-1kj0a3lx11zo`
- EdgeOne desired area: `overseas`

## Preflight

Run these before deployment unless the user is only asking for status:

```bash
git status --short
npm run lint
npm run build
```

Respect unrelated dirty files. If the worktree contains changes that are not part of the deployment task, do not revert them.

## Vercel Deployment

Vercel is linked to GitHub and should auto deploy when `main` is pushed. Prefer this path when the code has just been committed and pushed.

Useful checks:

```bash
git remote -v
git branch --show-current
npx vercel ls
```

Manual production deploy:

```bash
npm run build
npx vercel deploy --prod
```

Report the resulting URL and whether it is production.

## EdgeOne Deployment

The EdgeOne console GitHub import flow previously failed to show/select the repository even after the GitHub app was installed. The reliable deployment path is direct upload through the EdgeOne CLI.

The EdgeOne API token may be stored locally in `.env.local` as:

```bash
EDGEONE_API_TOKEN=...
```

`.env.local` is ignored by git in this repo. Do not print the token value in terminal output or final answers.

Deploy command:

```bash
set -a
source .env.local
set +a
npm run build
npx edgeone pages deploy ./dist -n asciilens -a overseas -t "$EDGEONE_API_TOKEN"
```

Important details:

- `edgeone pages deploy` defaults to `--area global`.
- AcidLens should use `--area overseas`.
- The CLI says `Production environment, overseas area` when the area is correct.
- The EdgeOne project may be direct-upload type; CLI docs say an existing project must be direct upload type to use this deployment path.

Recent successful EdgeOne deployment evidence:

```text
Project ID: pages-1kj0a3lx11zo
Deployment ID: e9nxz18hms
Area: overseas
```

## GitHub Automation Option

If the user explicitly asks to add automation, create a GitHub Actions workflow that:

1. Runs on push to `main`.
2. Installs dependencies with `npm ci`.
3. Runs `npm run lint` and `npm run build`.
4. Deploys `./dist` with `npx edgeone pages deploy ./dist -n asciilens -a overseas -t "$EDGEONE_API_TOKEN"`.

Required GitHub secret:

```text
EDGEONE_API_TOKEN
```

Do not add the workflow proactively if the user only asks to deploy manually or inspect EdgeOne connectivity.

## Troubleshooting

- `Invalid EDGEONE_PAGES_API_TOKEN`: token is not a valid EdgeOne Pages API token or belongs to the wrong site/account.
- `Login failed. Please try again.` after `edgeone login`: browser login callback failed; use API token direct upload instead.
- Bare `https://asciilens.edgeone.cool` returns `401` and `eo_time missing`: the returned CLI URL includes temporary access parameters; check EdgeOne Pages domain/public access settings before assuming the deploy failed.
- EdgeOne console uses different paths for China/global accounts. Verify the CLI output area rather than relying only on the console domain.

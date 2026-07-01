# Cloudflare Operations

PXLBLZ-IDE's Cloudflare Pages deployment is the production cloud workspace. It
uses GitHub OAuth for identity and Cloudflare D1 for personal patterns, custom
maps, last-active state, demo overrides, and controller push metadata. No
IndexedDB-to-D1 migration is performed; the cloud workspace starts clean for each
signed-in user.

## Required Configuration

`wrangler.jsonc` is the source-controlled Pages Functions configuration. The
production binding is:

- `PXLBLZ_DB` -> D1 database `pxlblz-ide`

The production build expects:

- `VITE_BASE_PATH=/`
- `VITE_PERSONAL_CONTENT_PROVIDER=remote-api`

Secrets and operator-specific values are managed in Cloudflare Pages:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`
- `GITHUB_ALLOWED_LOGINS` or `GITHUB_ALLOWED_IDS` when access should be owner-only
- `GITHUB_OAUTH_REDIRECT_URI` only when overriding the default callback URL

## Deploy And Verify

Before a production deploy:

```bash
npm test
npm run build
VITE_BASE_PATH=/ npm run build
```

For a local Cloudflare runtime check against Wrangler's local D1 store:

```bash
cp .dev.vars.example .dev.vars
npm run cf:build
npm run db:migrate:local
npm run cf:dev:local
```

Then open `http://localhost:8788`. Fill `.dev.vars` with a localhost GitHub
OAuth app to test the sign-in loop, or run `npm run cf:session` and attach the
printed `pxlblz_session` cookie to local API smoke requests.

After deploy, open the Pages URL and smoke-test:

1. Visit `/api/d1/health`; expect `{"ok":true,"schemaVersion":"1"}`.
2. Visit `/api/me`; signed out should report unauthenticated or 401.
3. Click **Sign in**, complete GitHub OAuth, and confirm `/api/me` reports the
   GitHub user.
4. Create, edit, reload, and delete a personal pattern.
5. Create, edit, reload, and delete a custom map.
6. Select a personal pattern, reload, and confirm last-active restore.
7. Change a demo preview control, reload, and confirm the override survives.
8. Push or fake controller metadata when hardware is available, then confirm
   `/api/controller-metadata/controller-bindings` and
   `/api/controller-metadata/controller-program-labels` retain values for the
   signed-in session.

Signed-out production users see the GitHub sign-in affordance and the app falls
back to browser-local IndexedDB for authoring until a session exists.

## Inspect D1 Data

Run read-only checks with Wrangler:

```bash
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT id, github_login FROM users;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, id, name, updated_at FROM personal_patterns ORDER BY updated_at DESC LIMIT 20;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, id, name, updated_at FROM personal_maps ORDER BY updated_at DESC LIMIT 20;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, key, updated_at FROM personal_settings;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, key, updated_at FROM controller_metadata;"
```

Avoid editing rows by hand unless there is already an export.

## Export And Restore

Take an operator-owned SQL export before risky changes:

```bash
mkdir -p backups
npx wrangler d1 export pxlblz-ide --remote --output backups/pxlblz-ide-$(date +%Y-%m-%d).sql
```

For a dry-run restore, import into a fresh D1 database first:

```bash
npx wrangler d1 create pxlblz-ide-restore-test
npx wrangler d1 execute pxlblz-ide-restore-test --remote --file backups/pxlblz-ide-YYYY-MM-DD.sql
```

Restoring over production should be treated as a manual incident response step:
pause writes if practical, take a fresh export, restore the chosen SQL export,
then rerun the production smoke checklist. Prefer restoring to a new database and
switching the `PXLBLZ_DB` binding only after inspection.

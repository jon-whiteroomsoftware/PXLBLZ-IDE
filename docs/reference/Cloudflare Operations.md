# Cloudflare Operations

PXLBLZ-IDE's Cloudflare Pages deployment is the production cloud workspace. It
uses GitHub or Google OAuth for identity and Cloudflare D1 for personal
Patterns, custom maps, personal Mixins, personal Libraries, Shows, durable Controller profiles,
last-active state, demo overrides, controller push metadata, and controller map
fingerprints. No browser-local-to-D1 migration is performed; the cloud
workspace starts clean for each signed-in user.

## Required Configuration

`wrangler.jsonc` is the source-controlled Pages Functions configuration. The
production binding is:

- `PXLBLZ_DB` -> D1 database `pxlblz-ide`

The production build expects:

- `VITE_BASE_PATH=/`
- `VITE_GA_MEASUREMENT_ID=<Google Analytics measurement id>` from the dedicated
  GA4 property for the Cloudflare v2 deployment when production analytics should
  be enabled

Secrets and operator-specific values are managed in Cloudflare Pages:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `GITHUB_ALLOWED_LOGINS`, `GITHUB_ALLOWED_IDS`, `GOOGLE_ALLOWED_EMAILS`, and
  `GOOGLE_ALLOWED_IDS` only as the transition gate before D1 beta access is
  activated
- `GITHUB_OAUTH_REDIRECT_URI` only when overriding the default callback URL
- `GOOGLE_OAUTH_REDIRECT_URI` only when overriding the default callback URL
- `VITE_GA_MEASUREMENT_ID` as a Pages build variable, not a secret, when
  analytics are enabled. Use the Cloudflare/v2 GA4 property id here; the legacy
  GitHub Pages or marketing property id should not be reused for this deployment.

GitHub OAuth must allow the `read:user user:email` scopes so the callback can
store a verified primary email when GitHub exposes one. Google OAuth must allow
`openid email profile`.

## Beta Access

The temporary beta gate is stored in D1 and managed through one npm command:

```bash
npm run beta-access -- list --remote
npm run beta-access -- add friend@example.com --label "Friend" --remote
npm run beta-access -- disable friend@example.com --remote
npm run beta-access -- remove friend@example.com --remote
```

Omit `--remote` to operate on the local D1. Production mutations print the
exact target and change, require typing `yes`, and read the row back after the
write. Automation may supply `--yes`; interactive use should keep the
confirmation. Repeating an already-satisfied command is a verified no-op.

Migration 20 starts in `legacy` mode with no implicitly granted users. The
first `add` changes `beta_access_mode` to `d1` permanently; removing the final
row does not reactivate the environment allowlists. In D1 mode, OAuth requires
an active entry matching a provider-verified email or an already-linked active
user. `disable` preserves the audit row while revoking access; `remove` deletes
it. Both take effect on the next authenticated API request, including requests
made with an existing session cookie.

## Analytics

The app has a production-only Google Analytics integration. It is inert in local
Vite dev, Vitest, and builds without `VITE_GA_MEASUREMENT_ID`. When that build
variable is present in a production Pages build, the client loads `gtag.js` with
automatic page views disabled and sends:

- per-route `page_view` events with the route path and coarse route title
  (`gallery`, `pattern-detail`, `studio:patterns`, `studio:maps`, etc.);
- `send_to_controller` when the enabled editor **Send to Controller** action is
  clicked, with mode (`run`/`save`) and non-PII controller/pattern context;
- `catalog_clone` when a built-in pattern is cloned into the signed-in Studio
  workspace;
- entity-creation events when durable rows are created:
  `pattern_created`, `map_created`, `mixin_created`, `library_created`,
  `show_created`, and
  `controller_profile_created`;
- `sign_in` when the app sends the user into the OAuth flow.

View these in Google Analytics under **Reports → Engagement → Pages and screens**
for page views, and **Reports → Engagement → Events** or **Admin → Events** for
custom events. The integration does not send personal content source, account
identity, controller IP address, or OAuth profile data.

Only the runtime analytics module loads `gtag.js`; Vite does not inject a
build-time GA snippet. This avoids double-counted page views and keeps
`send_page_view: false` under test.

Use D1 for current-state aggregate checks that do not fit GA's event model:

```bash
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT 'patterns' AS entity, COUNT(*) AS total, COUNT(DISTINCT user_id) AS users_with_any FROM personal_patterns UNION ALL SELECT 'maps', COUNT(*), COUNT(DISTINCT user_id) FROM personal_maps UNION ALL SELECT 'mixins', COUNT(*), COUNT(DISTINCT user_id) FROM personal_mixins UNION ALL SELECT 'libraries', COUNT(*), COUNT(DISTINCT user_id) FROM personal_libraries UNION ALL SELECT 'shows', COUNT(*), COUNT(DISTINCT user_id) FROM personal_shows UNION ALL SELECT 'controller_profiles', COUNT(*), COUNT(DISTINCT user_id) FROM controller_profiles;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT COUNT(*) AS total_users FROM users;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT COUNT(DISTINCT user_id) AS users_with_controller_profiles FROM controller_profiles;"
```

Deferred analytics work: GA4 Measurement Protocol server-side events if
ad-blocker loss makes client numbers untrustworthy, and any daily snapshot table
or Looker Studio dashboard.

## Deploy And Verify

Before a production deploy:

```bash
npm test
npm run build
VITE_BASE_PATH=/ npm run build
```

The stable local Cloudflare runtime belongs to the reviewed-main checkout:

```bash
cp .dev.vars.example .dev.vars
npm run dev:main
```

This keeps Vite on `5174`, Wrangler on `8788`, and the shared local D1 in the
main checkout's `.wrangler/state`. The command applies pending migrations,
provisions synthetic local identities, and starts missing services without
replacing healthy listeners. Fill the main checkout's `.dev.vars` with
localhost GitHub and/or Google OAuth apps to test the browser sign-in loop.

Issue work reserves a discoverable runtime with `npm run dev:issue`; most UI
work uses `--profile shared` and proxies to main's Wrangler and D1. Functions,
migrations, authentication, and changed API contracts use
`--profile isolated`, which receives a migrated issue-specific D1 and Wrangler.
See `docs/agents/dev-runtime.md` for commands, port ranges, identity isolation,
and cleanup. Run `npm run dev:main` after landing or pulling a migration. If the
shared store is behind the code, authenticated Studio screens can report
misleading remote-provider 500 errors on personal-content endpoints.

The authenticated Playwright tier seeds four signed synthetic worker users and
cleans each worker's personal-content resources through only that worker's
session before and after every test. It never invokes OAuth or reads a
persistent development or personal account:

```bash
npm run test:e2e:auth-smoke  # fast create/edit/reload persistence path
npm run test:e2e:shows       # deeper clip, transition, automation, and routing flows
```

Both commands reserve an isolated Vite/Wrangler pair from the managed runtime
registry, create an explicit temporary D1 store, apply migrations and seed the
synthetic users before server startup, then release the reservation and store.
Parallel runs cannot collide with the persistent 5174/8788 pair or active issue
runtimes. The commands require `SESSION_SECRET` in the main checkout's
`.dev.vars`; OAuth client credentials are not required.

After deploy, open the Pages URL and smoke-test:

1. Visit `/api/d1/health`; expect `{"ok":true,"schemaVersion":"20"}` for the
   current migration set. This is the latest value written to `schema_meta`, not
   a count of migration files.
2. Visit `/api/me`; signed out should report `{ "authenticated": false }`.
3. Click **Sign in**, complete GitHub OAuth, and confirm `/api/me` reports the
   GitHub user and one connected identity.
4. Link Google from the account menu and confirm `/api/me` reports both
   identities on the same `user.id`.
5. In a fresh session, sign in with a Google account whose verified email already
   belongs to a verified identity and confirm personal content stays under the
   existing `user.id`.
6. Disconnect one login and confirm the final remaining login cannot be removed.
7. Create, edit, reload, and delete a personal pattern.
8. Create, edit, reload, and delete a custom map.
9. Create, edit, reload, and delete a personal Mixin.
10. Create, edit, reload, rename, and delete a personal Library.
11. Create, edit, reload, and delete one Installation Show and one Portable
    Show; confirm each retains its output contract after reload.
12. Connect a Controller when hardware is available and confirm a stable-id
   connection creates or refreshes a Controller profile.
13. Select a personal pattern, reload, and confirm last-active restore.
14. Change a demo preview control, reload, and confirm the override survives.
15. Push or fake controller metadata when hardware is available, then confirm
   `/api/controller-metadata/controller-bindings` and
   `/api/controller-metadata/controller-program-labels` retain values for the
   signed-in session.

Signed-out production users see the Studio sign-in affordance and remain in
non-durable demo mode until a session exists.

## Inspect D1 Data

Run read-only checks with Wrangler:

```bash
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT id, display_name, updated_at FROM users;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT provider, provider_user_id, user_id, handle, email_verified FROM identities;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, id, name, updated_at FROM personal_patterns ORDER BY updated_at DESC LIMIT 20;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, id, name, updated_at FROM personal_maps ORDER BY updated_at DESC LIMIT 20;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, id, name, kind, updated_at FROM personal_mixins ORDER BY updated_at DESC LIMIT 20;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, id, name, updated_at FROM personal_libraries ORDER BY updated_at DESC LIMIT 20;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, id, name, output_contract_json, updated_at FROM personal_shows ORDER BY updated_at DESC LIMIT 20;"
npx wrangler d1 execute pxlblz-ide --remote --command "SELECT user_id, id, name, device_id, last_seen_ip, updated_at FROM controller_profiles ORDER BY updated_at DESC LIMIT 20;"
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

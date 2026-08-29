# Pages to Workers migration

PXLBLZ-IDE moves from Cloudflare Pages to a Cloudflare Worker with static
assets, and local development moves from the two-process Vite + `wrangler
pages dev` pair to the Cloudflare Vite plugin running workerd inside Vite.
The app code, the D1 database, the domain, OAuth apps, sessions, and the MV3
extension are untouched; what changes is how the API is packaged, how the dev
runtime is hosted, and how deploys happen. The migration runs side by side
with the live Pages project until a verified Worker exists, and the cutover
is a reversible custom-domain move.

Why now: Pages is in maintenance while Cloudflare's investment goes to
Workers, and the `wrangler pages dev` process is the component behind the
recurring local wedge (#895). Migrating before the public announcement means
the wobble window lands while the audience is friends and family, and the
retired process takes its failure class with it.

## Target architecture

One Worker serves everything. Its fetch handler routes `/api/*` to the same
handler logic that runs today, and every other request falls through to the
static assets build of the React app.

- **Worker entry** (`src/worker/`): a small explicit router replaces Pages'
  file-convention routing. The ~20 route modules under `functions/api/` move
  to `src/worker/routes/` essentially unchanged — each is already a thin
  `onRequest*` shim over pure logic in `src/cloudflare/` — and a route table
  registers them. The single `_middleware.ts` (a try/catch that maps
  resource-protection errors) becomes a wrapper around dispatch.
- **Config** (`wrangler.jsonc`): `main` plus an `assets` block replace
  `pages_build_output_dir`. Two settings must replicate Pages behavior
  exactly: `not_found_handling: "single-page-application"` (deep links such
  as `/p/oasis` depend on the SPA fallback) and `run_worker_first: ["/api/*"]`
  (API requests must never be answered by asset matching). The D1 binding,
  vars, and `compatibility_date` carry over verbatim. During the transition
  the Workers config lives in `wrangler.workers.jsonc` selected with
  `--config`, because one file cannot describe both a Pages project and a
  Worker; the cutover slice renames it into place.
- **Local dev**: `@cloudflare/vite-plugin` in `vite.config.ts` runs the
  Worker (and local D1) inside the Vite process. The `/api` proxy block
  disappears; the dev-only `/__identity` and `/__capture` Vite plugins are
  unaffected. Each runtime becomes one process instead of a Vite/Wrangler
  pair.
- **Deploy**: Workers Builds provides the same push-to-main auto-deploy the
  Pages git integration does today, with preview URLs. Connecting the repo,
  moving env vars and secrets, and moving the custom domain are dashboard
  steps the cutover wizard walks through.

## What does not change

- **D1.** The Worker binds the same `database_id`; no data moves, and
  `migrations/` plus the `db:migrate` commands work as they do now.
- **Auth.** Sessions are domain-scoped cookies and OAuth callbacks derive
  from the request origin, so nothing changes at cutover. The one limitation
  is during side-by-side verification: the preview Worker's `workers.dev`
  origin is not a registered OAuth callback, so sign-in flows verify on the
  real domain at cutover (or earlier by temporarily registering the preview
  callback — the wizard offers both).
- **The v1 site**, the extension, and hardware-bound Pattern behavior.

## Slices

Each slice lands independently through the reviewed-main workflow; the Pages
site keeps serving production until the final slice.

1. **Worker entry, router, and routes** — pure code, no config or tooling
   changes. Router unit tests plus the moved route modules' existing tests.
2. **Workers config and headless verification** — `wrangler.workers.jsonc`;
   `wrangler dev --config` serves the built app end to end against local D1;
   scripted smoke of SPA fallback, deep links, `/api` precedence, and 404s.
3. **Vite plugin local dev** — the developer-facing runtime becomes one
   process; `/__identity`, `/__capture`, and `npm run render` verified. This
   slice proves the plugin against Vite 8 early, since that compatibility is
   the plan's main version risk.
4. **Dev-runtime coordinator on single-process runtimes** — `dev:main`,
   `dev:issue`, `dev:status`, `dev:release` manage one process per runtime;
   registry, ports, logs, and docs updated. The #895 keepalive and watchdog
   carry over until the last `wrangler pages dev` disappears, then retire.
5. **Playwright on the new topology** — public and authenticated configs
   spawn the single-process server; full `test:e2e`, `test:e2e:auth-smoke`,
   and `test:e2e:shows` runs are the gate evidence.
6. **Deploy and cutover** — a wizard walks the dashboard steps: connect
   Workers Builds, set env vars and secrets, deploy, verify on the preview
   URL, move the custom domain, confirm, and keep the Pages project as a
   rollback target for a couple of weeks. Then the Pages config and docs
   references retire.

Slices 1–2 and 3–5 can proceed as two stacks; slice 6 waits for everything
and for an explicit go.

## Risks

- **Routing fidelity** is the main regression surface: SPA fallback, deep
  links, 404 behavior, and `/api` precedence. The existing smoke suite pins
  all of these, and slice 2 adds the same checks against the Worker before
  any tooling depends on it.
- **Vite plugin compatibility with Vite 8** is assumed, not yet proven;
  slice 3 fails fast if the plugin lags, and slices 1–2 are useful without
  it (plain `wrangler dev` also serves the Worker).
- **Tooling churn** touches what every agent and the push gate run through.
  Slices 4–5 are sequenced after the Worker itself is proven so coordinator
  changes never debug two new things at once.
- **Cutover** is minutes and reversible: the domain moves back to the intact
  Pages project if anything looks wrong.

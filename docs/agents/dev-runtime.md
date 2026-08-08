# Managed local runtime

PXLBLZ-IDE uses one stable reviewed-main runtime and allocates discoverable
issue runtimes from a repository-wide registry. The registry lives under the
common Git directory, so all worktrees see the same reservations without
committing machine-local state.

## Runtime profiles

The stable main checkout owns Vite `5174`, Wrangler `8788`, and the shared local
D1 store in its `.wrangler/state`. `npm run dev:main` applies pending migrations,
provisions local synthetic identities, and starts either persistent service
when it is absent. It refuses to replace an occupied but unhealthy port.

Most issue work uses the shared profile:

```bash
npm run dev:issue -- \
  --issue 627 \
  --description "managed local runtime" \
  --profile shared
```

The command reserves a Vite port in `5175-5199`, proxies `/api` to the shared
Wrangler on `8788`, and provisions a unique local user in the shared D1. Use
this profile for UI and product work whose Functions and schema contract already
exists on main.

Use the isolated profile when the issue changes Pages Functions, migrations,
authentication, or another API contract that is not on main:

```bash
npm run dev:issue -- \
  --issue 628 \
  --description "change personal pattern API" \
  --profile isolated
```

The command reserves a Vite port in `5200-5299` and a Wrangler port in
`8789-8888`, applies migrations to an issue-specific D1 store, builds the
worktree, and starts both services. The profile must be explicit so a task
cannot silently test against the wrong API or database.

The successful command prints the URL, API target, local identity, and canonical
task title:

```text
Task title: 627:5175 - managed local runtime
```

Rename the Codex or Claude task to that exact shape so the running build is
discoverable without interrupting the agent.

### Worktree prerequisites

Run `dev:issue` **from inside the worktree** it is meant to serve. The command
roots Vite at `process.cwd()`, so running it from the shared checkout silently
serves main's code while appearing to serve the branch under test.

A fresh worktree has no `node_modules`. Run `npm ci` inside it before anything
else, or Vitest fails to load `vite.config.ts` and the failure looks unrelated to
the missing install.

## Status, authentication, and cleanup

Use the registry instead of guessing ports:

```bash
npm run dev:status
npm run dev:status -- --json
```

Generate a signed localhost session for the assigned synthetic identity with:

```bash
npm run dev:session -- --issue 627
npm run dev:session -- --issue 627 --json
```

The JSON form is suitable for a separate automated browser context. Agents must
not overwrite the user's Chrome cookies or rely on a personal OAuth session.
Real OAuth remains available on the fixed Wrangler callback port `8788` when a
human needs to exercise the provider loop.

`.dev.vars` remains canonical in the main checkout. The coordinator links each
worktree to that ignored file; it never copies secrets into worktrees or the
registry.

Release only the current issue runtime when work finishes:

```bash
npm run dev:release -- --issue 627
```

Release checks listener ownership before sending a signal. It refuses to stop a
port that now belongs to another process. Never release or stop the stable main
pair during ordinary task cleanup.

## Playwright suites

Authenticated suites reserve an isolated Vite/Wrangler pair from the same
registry, use an explicit temporary D1 persistence directory, migrate and seed
that store before startup, and release it after the run:

```bash
npm run test:e2e:auth-smoke
npm run test:e2e:shows
```

The public suite reserves a shared-profile UI port from the registry and
starts a candidate-owned dev server, because the stable main pair on `5174`
would otherwise be silently reused and test old main instead of the worktree
under test (#746). Its global setup verifies the served worktree through the
dev-only `/__identity` endpoint and fails closed on any mismatch:

```bash
npm run test:e2e
```

This keeps parallel test runs away from main, issue runtimes, and each other.
The wrapper owns port selection; do not set fixed Playwright ports manually.
To run the public suite against a managed issue runtime that already serves
the same worktree, set `PLAYWRIGHT_STUDIO_URL` to that runtime's URL.

## Recovery rules

- Run `npm run dev:main` after landing or pulling a migration. It is idempotent
  and updates the shared schema without replacing healthy persistent services.
- Re-run the same `dev:issue` command to recover a stopped service under an
  existing assignment.
- If a task crashed, inspect `npm run dev:status` before releasing its
  reservation. Registry locks recover automatically when their owner exits.
- Logs and isolated D1 state live under `.git/pxlblz/dev-runtime/v1/` in the
  repository's common Git directory.

### A hanging dev:issue is usually a wedged main Wrangler

`npm run dev:issue` sitting silent for minutes generally means the main Wrangler
on `8788` is wedged: the port still accepts TCP but never answers `/api/me`, and
its log under `.git/pxlblz/dev-runtime/v1/logs/` typically ends in a failed
esbuild rebuild. The coordinator's health probe is a `fetch` with no timeout, so
it waits rather than reporting.

`npm run dev:status` will not reveal this. It reports "API listening" from port
occupancy alone and does not make an HTTP request. Probe the API directly:

```bash
curl -s -m 3 http://localhost:8788/api/me
```

The UI can answer in milliseconds while the API behind it is dead. To recover,
`kill -9` the Wrangler trio (`wrangler.js`, its Pages child, and `workerd`), run
`npm run dev:main` from the stable checkout to rebuild and restart the pair, then
re-run the `dev:issue` command — it completes in seconds once `8788` is healthy.

Treat any dev-runtime command exceeding about 30 seconds as a signal to probe
rather than keep waiting, and run these commands unsandboxed: the sandbox cannot
reach host localhost, so a sandboxed failure proves nothing about service health.
Never pipe a possibly-hanging command through `tail`, which hides all output
until the command finishes.

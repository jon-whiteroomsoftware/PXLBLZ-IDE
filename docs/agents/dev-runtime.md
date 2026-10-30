# Managed local runtime

PXLBLZ-IDE uses one stable reviewed-main runtime and allocates discoverable
issue runtimes from a repository-wide registry. The registry lives under the
common Git directory, so all worktrees see the same reservations without
committing machine-local state.

## Runtime profiles

The stable main checkout owns Vite `5174` and the shared local D1 store in
its `.wrangler/state`. Since #900 the main runtime is one worker-dev process:
the Cloudflare Vite plugin serves the Worker (from `wrangler.jsonc`)
and local D1 inside the Vite process, so UI and `/api` share the single port.
`npm run dev:main` applies pending migrations, provisions local synthetic
identities, and starts that process when it is absent.

Managed main `5174` and every shared or isolated issue listener bind all IPv4
interfaces (`0.0.0.0`). Previews live at
`http://Agent-Mini.local:<port>/PXLBLZ-IDE/`; localhost still works. Health checks
and proxy traffic stay on localhost.

Existing healthy runtimes adopt this binding only after an owner-coordinated
restart. Status URLs advertise the preview location; they do not prove an old
listener's binding. Main's first adoption restart belongs to the eng lead after
landing #1208; developers must not stop it.

A bare `npm run dev` is the same single-process shape for ad-hoc use, reading
`.dev.vars` and persisting to the checkout's `.wrangler/state` — the same
database `npm run db:migrate:local` targets. Setting `VITE_API_PROXY_TARGET`
selects the proxy topology instead; shared issue runtimes and the Playwright
wrappers use it. The plugin never loads for Vitest, `vite build`, or
`vite preview`.

Most issue work uses the shared profile:

```bash
npm run dev:issue -- \
  --issue 627 \
  --description "managed local runtime" \
  --profile shared
```

The command reserves a Vite port in `5175-5199`, proxies `/api` to the stable
main single-process server on `5174`, and provisions a unique local user in
the shared D1. Use this profile for UI and product work whose API and schema
contract already exists on main.

Use the isolated profile when the issue changes the Worker API, migrations,
authentication, or another API contract that is not on main:

```bash
npm run dev:issue -- \
  --issue 628 \
  --description "change personal pattern API" \
  --profile isolated
```

The command reserves a Vite port in `5200-5299`, applies migrations and
identity seeds to an issue-specific D1 store, and starts one worker-dev Vite
process serving that worktree's UI and Worker against it (no separate API
port, no worktree build). The profile must be explicit so a task cannot
silently test against the wrong API or database.

The successful command prints the URL, API target, local identity, and canonical
task title:

```text
Task title: 627:5175 - managed local runtime
```

Rename the Codex or Claude task to that exact shape so the running build is
discoverable without interrupting the agent.

### Worktree prerequisites

Run `npm run preflight -- worktree` before the first edit in a new worktree.
It exits 1 in the shared checkout (git dir equals the common dir) and 0 in a
linked worktree; substantive work never starts in the shared checkout. Before
starting any server outside the registry, `npm run preflight -- port <n>`
names the process already listening on that port and exits 1, so the second
server never wedges the first. Never kill the listener it names; allocate
another port.

Run `dev:issue` **from inside the worktree** it is meant to serve. The command
roots Vite at `process.cwd()`, so running it from the shared checkout silently
serves main's code while appearing to serve the branch under test.

A fresh worktree has no `node_modules`. Run `npm ci` inside it before anything
else, or Vitest fails to load `vite.config.ts` and the failure looks unrelated to
the missing install.

`package.json#allowScripts` records which dependency install scripts npm may
run (npm 11.21+, #1190). `esbuild` and `workerd` are approved, pinned to their
exact versions; their postinstalls hard-link the platform binary into place and
download it when the optional platform package is missing. `msw` and
`fsevents` are denied: msw's postinstall only copies a service worker when
`package.json#msw.workerDirectory` exists, which this repo does not set, and
fsevents ships a prebuilt binary with no script, flagged only by the lockfile's
`hasInstallScript`. A clean `npm ci` prints no `install-scripts` warning. After
a dependency bump, npm 11.21 still runs an unreviewed script but warns again,
because a pin no longer matches; that is intended. Review the new version
with `npm install-scripts ls`, then re-approve it with
`npm install-scripts approve <pkg>`, which rewrites the pin. The root
`prepare` script (husky) is never gated.

## Status, authentication, and cleanup

Use the registry instead of guessing ports:

```bash
npm run dev:status
npm run dev:status -- --json
```

Generate a signed session for the assigned synthetic identity with:

```bash
npm run dev:session -- --issue 627
npm run dev:session -- --issue 627 --json
```

The JSON form includes `user`, the legacy localhost `cookie`, and `cookies` for
both `localhost` and `agent-mini.local`, in that order. Both cookies use the same
session token and attributes. Install them in a separate automated browser context:

```ts
await context.addCookies(session.cookies)
```

Existing callers can continue using `session.cookie`. Agents must
not overwrite the user's Chrome cookies or rely on a personal OAuth session.
Real OAuth remains available on the stable main origin (`5174`) when a human
needs to exercise the provider loop.

LAN app UI, API, and dev sign-in are supported. Agent OAuth onboarding remains
same-machine on its configured localhost origin because the existing validator
admits HTTP loopback origins only. #1208 does not change that security policy.

`.dev.vars` remains canonical in the main checkout. The coordinator links each
worktree to that ignored file; it never copies secrets into worktrees or the
registry.

Release only the current issue runtime when work finishes:

```bash
npm run dev:release -- --issue 627
```

Release checks listener ownership before sending a signal. It refuses to stop a
port that now belongs to another process. Never release or stop the stable main
runtime during ordinary task cleanup.

## Playwright suites

Authenticated suites reserve an isolated port from the registry and start one
worker-dev Vite process (#901) serving the candidate's UI, its Worker, and a
temporary D1 store the wrapper migrates and seeds before startup and removes
after the run:

```bash
npm run test:e2e:auth-smoke
npm run test:e2e:shows
```

The public suite reserves a shared-profile UI port from the registry and
starts a hermetic candidate-owned single-process server against its own
throwaway migrated D1 (#901) — the push gate does not depend on the stable
main runtime being healthy, and the stable `5174` server is never silently
reused to test old main instead of the worktree under test (#746). Its global
setup verifies the served worktree through the dev-only `/__identity`
endpoint and fails closed on any mismatch:

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

### The wedged main runtime: cause, prevention, recovery (#895, #900)

A wedged runtime means the port still accepts TCP but never answers
`/api/me`. Under the retired two-process topology the classic cause was
upstream: since wrangler 4.86 every wrangler invocation sweeps
`.wrangler/tmp/*` entries whose mtime is older than 24 hours
(workers-sdk#13930), and a live server's bundle dir only refreshed its mtime
on rebuild — the next unrelated wrangler command deleted it and workerd hung
every request. The single-process runtime embeds the same wrangler machinery,
so the defenses remain:

- **Prevention.** `dev:main`, `dev:status`, and `dev:issue` refresh the mtimes
  of the main checkout's `.wrangler/tmp/*` directories on every run, keeping a
  live server permanently outside the sweep window.
- **Detection.** Health probes are bounded (3s). `npm run dev:status` reports
  the main API as `wedged` when the port listens but does not answer, and a
  shared-profile `dev:issue` fails fast with the same diagnosis and names
  `npm run dev:main` instead of hanging.
- **Recovery.** `npm run dev:main` recovers unattended: it verifies every
  `5174` listener — and every member of each process group it would signal —
  is this repository's runtime (vite, wrangler, workerd, or the esbuild
  service, by path-normalized executable/script command), terminates those
  groups (SIGTERM, then SIGKILL), and restarts the single process. Wedged
  means transport silence only: a server that answers `/api/me` with 5xx
  errors is alive and is never terminated (`dev:status` reports it as
  `erroring`). Recovery still refuses, with the offending commands in the
  error, when any process is not provably ours — that case stays manual.

If a wedge is suspected anyway, probe directly:

```bash
curl -s -m 3 http://localhost:5174/api/me
```

Run `npm run dev:main` to recover, then re-run the `dev:issue` command — it
completes in seconds once the main runtime is healthy.

Treat any dev-runtime command exceeding about 30 seconds as a signal to probe
rather than keep waiting, and run these commands unsandboxed: the sandbox cannot
reach host localhost, so a sandboxed failure proves nothing about service health.
Never pipe a possibly-hanging command through `tail`, which hides all output
until the command finishes.

Before reporting GitHub authentication or the network as a blocker, run
`npm run preflight -- blocker gh-auth --host` (or `blocker network --host`)
from an elevated, unsandboxed shell. `SANDBOX-LOCAL` and `INDETERMINATE`
(exit 3) are never host verdicts; only `HOST OK` and `HOST FAILURE` are.

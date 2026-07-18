# PXLBLZ-IDE Agent Guide

PXLBLZ-IDE is a browser IDE for authoring, previewing, composing, and sending
Pixelblaze Patterns. Keep this file short and operational; use the linked domain
and reference docs for current product and architecture detail.

## Start here

- Read `CONTEXT.md` for canonical domain language.
- Read the relevant part of `docs/reference/PXLBLZ Technical Reference.md`
  before changing architecture or behavior.
- Use `docs/reference/PXLBLZ Feature Guide.md` for current user-visible behavior.
- Use `docs/reference/Pixelblaze Ecosystem Primer.md` and
  `docs/reference/Understanding Maps.md` for Pixelblaze platform semantics.
- Use `docs/plans/` only for forward-looking designs and open decisions.
- Ask before editing `README.md`; it is the public entry point for the published
  v1 release and intentionally changes on a different cadence.

## Architecture map

- `src/engine/`: pure TypeScript for parsers, transforms, compilers, models,
  geometry, protocol logic, preview runtime, and renderer support. Keep React
  imports out.
- `src/components/` and `src/App.tsx`: thin React surfaces. Render state,
  delegate events, and call engine/store operations; do not reimplement rules.
- `src/store/`: Zustand application state and orchestration. Stores may call
  providers and pure engine functions; reusable transformations stay in the
  engine.
- `src/engine/bundle.ts`, `passEngine.ts`, `fxEmit.ts`, `preview.ts`, and
  `renderer.ts`: Pattern artifact and preview pipeline.
- `src/engine/layout.ts`, `src/engine/maps/`, and `src/pixelblaze/stock/maps/`:
  map baking, normalization, sample/position layout, and stock geometry.
- `src/engine/ControllerProvider.ts`, `PixelblazeConnection.ts`, and
  `ExtensionControllerProvider.ts`: transport seam, device protocol, and relay.
  The MV3 extension lives in `extension/`.
- `src/engine/showModel.ts`, `showCompiler.ts`, `fastReplay.ts`, and
  `showTimelineViewport.ts`: Show domain rules, compilation, deterministic seek,
  and timeline geometry.
- `src/cloudflare/`, `functions/api/`, and `migrations/`: authentication,
  user-scoped Pages Functions, D1 persistence, and schema history.
- `src/docs/catalog.ts`: repository Markdown exposed by the in-app docs route.

Preserve these invariants:

- Hardware-bound Patterns remain plain Pixelblaze code. Preview metadata,
  Precise-mode re-emits, viewport state, and visual settings never leak into a
  push unless an explicit authored transform generates code.
- Fast preview uses float64; Precise preview emulates 16.16 behavior. Accepted
  firmware divergences are documented and measured, not silently claimed away.
- Map `sample` coordinates and preview `pos` geometry are separate concerns.
- Personal content is durable in authenticated D1 storage. Local storage holds
  only small session/device preferences, not a second workspace.
- A Show saves choreography but compiles into one portable Pixelblaze Pattern.
- Pattern execution is main-thread `new Function()` plus rAF. Valid source can
  still freeze the tab with an infinite loop.

## Development and verification

### Concurrent work and landing

- Keep the shared checkout on `main`; work there unless concurrent edits require
  isolation.
- Use a temporary local worktree branch for concurrent work. Do not push it or
  ask the user to manage it unless a PR was explicitly requested.
- The coordinating agent owns the whole lifecycle. A child agent hands back a
  verified commit; the coordinator lands it on `main`.
- Work done in a worktree is not complete until its verified commit is reachable
  from the shared local `main`. If local landing must wait, report it as awaiting
  landing; do not leave finished work only on an isolated branch.
- Pushing `main` is a separate publication step. Batch pushes a couple of times
  per day, or push when the user asks, needs hosting, or requests a published
  handoff. Do not push after every issue merely to mark the work complete.
- After landing locally, remove the worktree and delete its local branch. Delete
  a remote branch only if one was explicitly created. Finish by verifying that
  shared local `main` contains the commit and that no abandoned worktrees or
  branches remain.

Keep Vite on `5174` and Wrangler on `8788` running between tasks. If either is
absent or unreachable, start it; never stop these servers when finishing a task.
Run `npm run check:node` before starting them and activate a `package.json`
supported Node version instead of macOS's system Node when it fails.

Codex's command sandbox may be unable to reach host localhost even while these
services are healthy. A sandboxed `curl` refusal is not evidence that a server
stopped: recheck outside the network sandbox or verify port ownership before
reporting or restarting either service.

The sandbox may also be unable to read macOS Keychain-backed credentials. If a
sandboxed `gh auth status`, Claude, or other CLI auth check reports logged out,
recheck outside the sandbox before asking the user to authenticate again. A
successful authenticated operation outside the sandbox is stronger evidence
than the sandboxed status result.

```bash
npm run dev                 # only when the persistent server is absent
npm run lint
npm run test:staged         # staged/colocated tests plus high-risk invariants
npm test                    # full Vitest suite
npm run build
npm run test:e2e
npm run check:playwright
npx vitest run path/to/test.ts
npm run db:migrate:local
npm run db:migrate:remote
```

The pre-commit hook runs lint, colocated tests for staged code, and conservative
invariant suites for compiler, persistence, resource-ledger, artifact-contract,
and test-infrastructure changes. The pre-push hook owns the one comprehensive
publication gate: the full Vitest suite followed by the Playwright smoke suite. Do
not manually repeat the full suite immediately before a push unless diagnosing
a failure. See `docs/agents/verification.md` for the gate model.

Use TDD for behavior changes: fail, implement, refactor. Concentrate coverage
on pure engine logic; keep component tests light and add Playwright coverage
for cross-layer flows.

When D1 migrations change, apply both local and remote migrations. If local
Studio personal-content requests return misleading remote-provider 500 errors,
check the local D1 schema first.

## Browser and visual checks

- Use the Codex in-app browser first for UI work, then repo Playwright. If the
  dedicated in-app-browser skill is absent, bootstrap `scripts/browser-client.mjs`
  from an installed browser plugin, list browsers, and select the entry whose
  type is `iab`; absence from the skill catalogue is not proof the browser is
  unavailable.
- Run `npm run check:playwright` before claiming Chromium is missing. Use the
  repo package through `npx playwright`, `npm run test:e2e`, or CommonJS
  resolution from the workspace; Codex.app's bundled package may expect a
  different browser revision.
- Use `http://localhost:5174/PXLBLZ-IDE/?capture` for preview screenshots. The WebGL loop
  keeps pages busy and ordinary canvas readback may be stale or empty.
- Under `?capture`, call `window.__pxlblz.setPreview(patch)` and then
  `window.__pxlblz.capture(name)`. Captures are written to
  `/tmp/pxlblz-captures/` by the dev-only sink.
- Check desktop and narrow-window behavior, console errors, keyboard flow, and
  relevant accessibility basics for substantial UI changes.

## Search, issues, and documentation

- Start open-ended code exploration with Morph Warp Grip
  (`mcp__morph_mcp.codebase_search`). Use `rg` for exact literals, known files,
  and narrow verification.
- Use GitHub Issues as implementation state. Follow
  `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and the
  `issue-workflow` skill for claiming, progress, review state, and commits.
- GitHub CLI credentials are stored in macOS Keychain. A sandboxed
  `gh auth status` may falsely report an invalid token when Keychain access is
  denied. Re-run the same read-only check outside the sandbox before asking the
  user to authenticate; only an unsandboxed failure is evidence that login is
  actually stale.
- Use `docs/agents/domain.md` when preparing issues, plans, or architectural
  work. Name concepts exactly as `CONTEXT.md` defines them.
- Use `doc-sweep` after feature or issue completion. Keep current truth in
  `docs/reference/`, future intent in `docs/plans/`, vocabulary in `CONTEXT.md`,
  and executable progress in issues.
- Keep `CLAUDE.md` as a symlink to this file unless genuinely Claude-specific
  guidance is required.

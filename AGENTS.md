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
- Use `docs/reference/Pixelblaze device behaviour notes.md` for firmware
  behaviours proven on hardware that fail silently: map/pixelCount matching,
  the lit tail after a count reduction, drifted live control values, the preview
  JPEG format, and cloud discovery.
- Use `docs/agents/stock-content.md` before touching the stock Pattern or Show
  catalogue, or the Show visual toolkit; those edits fan out across census and
  capacity suites.
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
  and timeline geometry. `showRoutingRepresentation.ts` owns routing
  representation and decode emission; `showMemberLowering.ts` owns
  Pattern-member lowering; `showMemberBindingPolicy.ts` owns the per-member
  placement binding policy.
- `src/cloudflare/`, `functions/api/`, and `migrations/`: authentication,
  user-scoped Pages Functions, D1 persistence, and schema history.
- `src/docs/catalog.ts`: repository Markdown exposed by the in-app docs route.
  Diagram SVGs in `docs/images/` follow `docs/agents/diagram-style.md`.

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

- Use the `reviewed-main-workflow` skill for every substantive slice, candidate
  review, landing, and push.
- Keep the shared checkout clean and on `main`; implement every substantive
  slice in a temporary worktree under `~/src/worktrees/`.
- Implementation is concurrent, but review and landing are serialized. Rebase
  before review, then land the exact approved tip immediately with
  `git merge --ff-only`; never rewrite or cherry-pick approved commits.
- The Playwright suites run automatically only at push time (#638), and pushes
  batch several agents' landings — a push-time e2e failure taxes whichever
  agent happens to push, not the agent who broke it. Before requesting review
  for a slice that touches a gate-covered surface, run the affected suite in
  full from the worktree and record which suites ran in the issue's Tests
  section: Show editor, timeline, Zones, or Show persistence →
  `npm run test:e2e:shows`; authentication, sessions, or personal content →
  `npm run test:e2e:auth-smoke`; app shell or Pattern Studio surfaces →
  `npm run test:e2e`. Run the whole affected suite, not one test — several
  known failures only reproduce under full-suite timing (#672). State the
  result as an `X-E2E:` trailer on the slice's final commit (for example
  `X-E2E: test:e2e:shows 52/52`), placed before `X-Authored-Model:`; the
  candidate reviewer reads trailers in the range, not the issue, and emits a
  P3 advisory when a gate-covered surface changes without one.
- Keep dependent work stacked until its reviewed base lands. The coordinating
  agent owns approval, landing, issue updates, and worktree cleanup.
- Work done in a worktree is not complete until its verified commit is reachable
  from the shared local `main`. If local landing must wait, report it as awaiting
  landing; do not leave finished work only on an isolated branch.
- Pushing `main` is a separate publication step, and it is a production deploy:
  the Cloudflare Pages project (`pxlblz-ide`, the v2 site) is git-integrated and
  auto-builds every push to `main`. Pages env vars and secrets also take effect
  on that next auto-deploy. Only the legacy v1 GitHub Pages site is exempt (its
  workflow is manual and pinned to `v1-maintenance`). Batch pushes a couple of
  times per day, or push when the user asks, needs hosting, or requests a
  published handoff. Do not push after every issue merely to mark the work
  complete.
- After landing locally, remove the worktree and delete its local branch. Delete
  a remote branch only if one was explicitly created. Finish by verifying that
  shared local `main` contains the commit and that no abandoned worktrees or
  branches remain.

Use the managed local runtime described in `docs/agents/dev-runtime.md`. The
stable reviewed-main checkout owns Vite `5174`, Wrangler `8788`, and the shared
local D1. Run `npm run dev:main` to migrate, provision, and recover that pair;
never stop it during ordinary task cleanup.

Every issue runtime must declare its isolation boundary:

```bash
npm run dev:issue -- --issue <number> --description "<short description>" --profile shared
npm run dev:issue -- --issue <number> --description "<short description>" --profile isolated
```

Use `shared` for UI work compatible with main's Functions and schema. Use
`isolated` for Functions, migrations, authentication, or a changed API
contract. Rename the task to the command's printed
`<issue>:<port> - <description>` title. Use `npm run dev:status` for discovery,
`npm run dev:session -- --issue <number>` for that task's synthetic local user,
and `npm run dev:release -- --issue <number>` before removing its worktree.
Agents use separate browser contexts and never replace the user's Chrome
cookies. The main checkout's ignored `.dev.vars` is canonical; do not copy
secrets into worktrees.

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
npm run dev:main            # migrate/provision/recover persistent main
npm run dev:issue -- --issue <number> --description "<description>" --profile <shared|isolated>
npm run dev:status
npm run dev:release -- --issue <number>
npm run lint
npx tsc -b --pretty false   # TypeScript project check
npm run test:staged         # staged/colocated tests plus high-risk invariants
npm test                    # full Vitest suite
npm run test:mutation:show-authoring # targeted Show authoring fault-sensitivity check
npm run review:candidate -- <base> <tip> [--test-design <json>]
npm run review:status -- [<base> <tip>]
npm run review:push         # verify exact approvals for outgoing refs
npm run build
npm run test:e2e
npm run check:playwright
npx vitest run path/to/test.ts
npm run db:migrate:local
npm run db:migrate:remote
```

Pre-commit runs lint, conditional full-project typecheck, focused tests, and
mapped invariants. Candidate review records clean approval for an exact-range
pass. P2/P3-only findings preserve non-terminal advisory coverage and require
only an exact corrective review; P0/P1 findings require a new full-range
review. Pre-push requires a contiguous chain ending in clean approval instead
of repeating review, then runs full Vitest and Playwright once. See
`docs/agents/verification.md` for the mechanism and privacy boundary.

End every agent-authored commit message with an `X-Authored-Model:` trailer
naming the exact model id (for example `X-Authored-Model: claude-fable-5` or
`X-Authored-Model: gpt-5.6-sol`), after any other trailers. Candidate review
routes to the opposite model family based on this trailer (#637): commits
without it are unsignalled, receive the default reviewer order, and can never
claim cross-family coverage on their receipts. When the counterpart family's
reviewer is unavailable, the gate falls back to a same-family review and
records the downgrade on the receipt; it never blocks on the missing
counterpart and never records the downgrade silently.

Use TDD for behavior changes: fail, implement, refactor. Concentrate coverage
on pure engine logic; keep component tests light and add Playwright coverage
for cross-layer flows.

Use targeted mutation qualification after changing a high-risk transformation
engine or strengthening its shared contract. It is deliberate evidence for
fault sensitivity, not a universal test requirement or part of the fast commit
hook. See `docs/agents/verification.md` for the current qualified scope and
cadence.

When D1 migrations change, apply both local and remote migrations. If local
Studio personal-content requests return misleading remote-provider 500 errors,
check the local D1 schema first.

## Browser and visual checks

- Read `docs/agents/browser-verification.md` before debugging a failed capture.
  It covers the preview-canvas selector trap, the wedged-extension signature, and
  driving the UI without a screenshot. Hardware work is in
  `docs/agents/hardware-bench.md`; agent roles and the Pixelblaze design skills
  are in `docs/agents/collaboration.md`.
- Use the Codex in-app browser first for UI work, then repo Playwright. A missing
  in-app-browser skill entry is never sufficient reason to switch tools. Before
  any fallback, bootstrap `scripts/browser-client.mjs` from an installed Browser
  or Chrome plugin through the Node REPL, list browser backends, and probe the
  entry whose type is `iab`. If the Browser plugin itself is missing, inspect
  `codex plugin list --available --json` and restore `browser@openai-bundled`.
  Fall back only after two or three focused bootstrap probes fail. Before using
  Chrome, standalone Playwright, Computer Use, or another browser mechanism,
  tell the user that the in-app browser failed, the concrete failure observed,
  which fallback will be used, and its speed or fidelity tradeoff. Successful
  `agent.browsers.get("iab")` discovery means the in-app browser is available
  even if the skill catalogue omitted it.
- Run `npm run check:playwright` before claiming Chromium is missing. Use the
  repo package through `npx playwright`, `npm run test:e2e`, or CommonJS
  resolution from the workspace; Codex.app's bundled package may expect a
  different browser revision.
- Use `http://localhost:5174/PXLBLZ-IDE/?capture` for preview screenshots. The WebGL loop
  keeps pages busy and ordinary canvas readback may be stale or empty.
- Under `?capture`, call `window.__pxlblz.setPreview(patch)` and then
  `window.__pxlblz.capture(name)`. Captures are written to
  `/tmp/pxlblz-captures/` by the dev-only sink.
- `npm run render -- (--demo <Name> | --file <pattern.js>) [--seconds N]`
  renders a deterministic headless pattern video through the same sink
  (`scripts/render-pattern.ts`, #576): fixed-timestep frames from pattern t=0,
  assembled into an mp4 when `ffmpeg` is on PATH, else kept as PNGs.
- Check desktop and narrow-window behavior, console errors, keyboard flow, and
  relevant accessibility basics for substantial UI changes.

## Search, issues, and documentation

- Start open-ended code exploration with Morph Warp Grip
  (`codebase_search`). Use `github_codebase_search` for public upstream
  repositories and dependency investigations. These MCP tools may be lazily
  loaded; successful host tool discovery means they are available. Use `rg`
  for exact literals, known files, and narrow verification.
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

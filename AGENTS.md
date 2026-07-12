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

Use the long-lived Vite server at `http://localhost:5174/`. Do not restart it
casually; report an unavailable server before starting one. Local authenticated
Studio calls proxy through Wrangler on port `8788`.

Codex's command sandbox may be unable to reach host localhost even while these
services are healthy. A sandboxed `curl` refusal is not evidence that a server
stopped: recheck outside the network sandbox or verify port ownership before
reporting or restarting either service.

```bash
npm run dev                 # only when the persistent server is absent
npm run lint
npm test
npm run build
npm run test:e2e
npm run check:playwright
npx vitest run path/to/test.ts
npm run db:migrate:local
npm run db:migrate:remote
```

The pre-commit hook runs lint and the full Vitest suite. Use TDD for behavior
changes: fail, implement, refactor. Concentrate coverage on pure engine logic;
keep component tests light and add Playwright coverage for cross-layer flows.

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
- Use `http://localhost:5174/?capture` for preview screenshots. The WebGL loop
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
- Use `docs/agents/domain.md` when preparing issues, plans, or architectural
  work. Name concepts exactly as `CONTEXT.md` defines them.
- Use `doc-sweep` after feature or issue completion. Keep current truth in
  `docs/reference/`, future intent in `docs/plans/`, vocabulary in `CONTEXT.md`,
  and executable progress in issues.
- Keep `CLAUDE.md` as a symlink to this file unless genuinely Claude-specific
  guidance is required.

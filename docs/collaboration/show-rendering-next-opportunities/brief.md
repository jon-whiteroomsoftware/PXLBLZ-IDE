# Shared Brief: show-rendering-next-opportunities-task

## Objective

Identify and rank the next generalizable opportunities to make compiled PXLBLZ
Shows faster, smaller, or able to combine more Patterns on Pixelblaze hardware.
The result should help ordinary authors build rich 30-60-second Shows with
several Patterns, Effects, and Transitions. This run produces research and
design artifacts only, not implementation.

## Source task

- Primary task: `docs/plans/archive/show-rendering-next-opportunities-task.md`
- Completed epic: GitHub #511 and its delivery issues #512-#520, #525, #527,
  and #528
- Completed design and full numbered ledger:
  `docs/plans/archive/show-render-target-cache-planner.md`
- Current behavior: `CONTEXT.md`,
  `docs/reference/PXLBLZ Technical Reference.md`, and
  `docs/reference/PXLBLZ Feature Guide.md`

## Existing constraints

- Preserve the 2,000-pixel compiled-Show ceiling, exact Fast/Precise behavior,
  deterministic seek, artifact eligibility gates, and ordinary export/Run/Save
  path.
- Preserve the distinction between exact compiler optimizations and explicit
  authored approximations such as snapshot/live Crossfade.
- Work within one Pixelblaze render entry point, a 10,240-word array pool,
  three fixed full-output arena planes, permanent arrays, and one-pass
  per-physical-pixel firmware execution.
- Treat array words, source bytes, Controller bytecode, persistent globals,
  live stack, symbols, renderer evaluations, and FPS as independent axes.
- Treat Controller FPS as authoritative. Operation counts and browser timing
  may motivate a probe but cannot qualify a production default.
- Do not implement production code, create implementation tickets, enlarge the
  supported output envelope, or assume GPU passes, threads, freed arrays, or
  unbudgeted full-output storage.

## Relevant repository context

- `docs/plans/archive/show-rendering-next-opportunities-task.md` contains the factual
  completed results, constraints, questions, and expected opportunity format.
- `docs/plans/archive/show-render-target-cache-planner.md` contains the complete
  benchmark ledger, known boundaries, hardware matrix, and implemented design.
- `CONTEXT.md` defines the canonical Show rendering vocabulary.
- `docs/reference/PXLBLZ Technical Reference.md` describes the current
  compiler, resource ledger, render-target arena, planner, and emitters.
- `src/engine/showCompiler.ts` contains compiler analysis and source emission.
- `src/engine/showRenderTargetPlanner.ts` contains candidate selection,
  lifetimes, conflicts, and plane assignments.
- `src/engine/showVmResourceLedger.ts` contains hardware eligibility accounting.
- `test/perf-harness/` contains software and Controller benchmark fixtures,
  including successful and rejected candidates.

## Deliverable expectations

Each independent proposal should provide a ranked opportunity map. For every
leading candidate, state the repeated cost or authoring limitation, visual
contract, compatibility and invalidation boundary, expected tradeoffs on every
resource axis, supporting evidence, cheapest falsifying prototype, Controller
benchmark, rejection criteria, and interactions with the shipped passes.

Separate immediate research spikes from longer-term architecture. Include
instrumentation that would reduce uncertainty. Preserve failed or neutral
candidates as evidence and avoid presenting speculative FPS as measured fact.

## Open questions

- Where does compiled Show time still go after routing specialization,
  invariant hoisting, output sharing, scalar fields, keyed composition, and
  snapshot/live Crossfade?
- Which remaining repeated work can be removed or shared within the one-pass
  execution model?
- When does memory-for-computation win, and when do replay, indexing,
  invalidation, code-size, or symbol costs dominate?
- Can generated representation or scheduling reduce both bytecode and runtime
  dispatch?
- Which mechanisms generalize across varied Patterns, maps, Effects,
  Transitions, and Zone layouts?
- Which inexpensive visual affordances become practical at the compiler-owned
  composition boundary?

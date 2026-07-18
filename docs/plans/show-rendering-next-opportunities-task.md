# Show rendering: next optimization opportunities

Status: research complete; implementation not authorized
Date: 2026-07-17

The independent Fable xhigh and Codex proposals, comparison, and recommended
research sequence are in
`docs/collaboration/show-rendering-next-opportunities/`. The final design keeps
future candidates behind kill-tests and human decisions; it does not create a
new implementation epic or ticket set.

## Objective

Identify and rank the next generalizable ways to make compiled PXLBLZ Shows
faster, smaller, or able to combine more Patterns on Pixelblaze hardware. The
result should distinguish repeatable platform improvements from show-specific
tuning and should favor mechanisms that help ordinary authors build rich
30-60-second Shows with several Patterns, Effects, and Transitions.

This is a design and research task. It does not authorize production-code
changes or promise that a candidate will ship.

## Completed foundation

The render-target epic established and measured these current facts:

- compiled Shows support at most 2,000 output pixels;
- every generated Show owns three reusable full-output 16.16 planes, costing
  6,012 of the Pixelblaze VM's 10,240 array words at 2,000 pixels;
- the remaining 4,228 array words belong to the whole Show;
- the compiler accounts for arrays, persistent globals, stack paths, symbols,
  source bytes, bytecode, and renderer evaluations separately;
- exact physical routing and capture specialization improved Redline's exact
  reference from 2.358 to 2.928 FPS;
- frame-invariant hoisting brought the exact reference to 3.037 FPS;
- sharing compatible Pattern output improved a five-surface fixture from 4.554
  to 8.729 FPS;
- exact scalar-field reuse improved a five-surface fixture from 2.161 to 3.115
  FPS;
- content-aware key composition improved a 90%-opaque keyed overlay from 2.801
  to 4.480 FPS;
- snapshot/live Crossfade improved Redline's transition median from 1.810 to
  3.197 FPS by intentionally freezing the outgoing visual;
- shared Motion transition kernels cut a repeated-transition artifact's source
  by 37.5% and bytecode by 36.3% without changing runtime FPS;
- exact transformed-coordinate caching avoided estimated arithmetic but made
  2,000-pixel Redline 6.43% slower, so it remains diagnostic-only;
- a five-Pattern, 36-second acceptance Show fits and runs through the ordinary
  artifact path at the 2,000-pixel ceiling;
- a 4,000-pixel direct Redline build is retained only as unsupported stress
  evidence.

The complete numbered ledger and qualification context are in
`docs/plans/archive/show-render-target-cache-planner.md`.

## Governing constraints

- A Show compiles into one portable Pixelblaze Pattern with one firmware render
  entry point. Generated code may define multiple internal render functions.
- Ordinary composition should evaluate no more than one live Pattern renderer
  per output pixel. More expensive authored policies must be explicit.
- Exact optimizations must preserve Fast and Precise checksums and required
  renderer side effects. Approximation is allowed only as an authored visual
  policy with clear semantics.
- Pixelblaze invokes rendering once per physical pixel. A proposal cannot
  assume GPU-style arbitrary prepasses, random-access current-frame rendering,
  freed arrays, threads, or screen-sized temporary allocations outside the
  resource ledger.
- The three render-target planes are a fixed shared arena, not separate storage
  for every role. Overlapping roles compete for them.
- Hardware FPS is authoritative. Static operation counts and browser preview
  timing are hypotheses until a Controller matrix confirms them.
- Source, bytecode, VM words, persistent globals, live stack, and output FPS are
  independent resource axes; improving one does not prove improvement in
  another.
- Hardware eligibility and user-visible diagnostics must remain conservative
  when the compiler cannot prove size, lifetime, compatibility, or exactness.
- Proposed work should preserve the 2,000-pixel output contract and the current
  artifact, preview, seek, export, Run, and Save behavior.

## Research questions

1. Where does compiled Show time still go after the completed exact passes?
2. Which repeated work can be removed, shared, specialized, scheduled, or
   replaced by an explicit visual policy within the existing one-pass runtime?
3. When should memory replace computation, and when do replay, indexing,
   emitted code, or invalidation costs make that exchange lose?
4. Which mechanisms scale across many Patterns, Effects, Transitions, maps, and
   Zone layouts rather than benefiting one fixture?
5. Can generated representation or scheduling reduce both artifact size and
   runtime dispatch cost?
6. Which high-payoff visual affordances become cheap once the compiler owns the
   arena and content-aware composition boundary?
7. What additional instrumentation would most reduce uncertainty before the
   next implementation ticket is filed?

## Expected result

Produce a ranked opportunity map. For every leading candidate, state:

- the repeated cost or authoring limitation it attacks;
- the exact or intentionally approximate visual contract;
- the compatible consumer envelope and invalidation boundary;
- expected CPU, memory, source, bytecode, global, and stack tradeoffs;
- the cheapest falsifying prototype and Controller benchmark;
- the evidence supporting the expected payoff;
- important rejection criteria and interactions with shipped optimizations.

Separate immediate research spikes from longer-term architecture. Preserve
failed or neutral ideas as evidence so future work does not repeat them without
a materially different hardware profile or mechanism.

## Relevant repository context

- `CONTEXT.md` defines Show, resource-ledger, render-target, planner, field,
  output-reuse, key-composition, and Crossfade terminology.
- `docs/reference/PXLBLZ Technical Reference.md` describes the as-built
  compiler, arena, planner, emitters, and resource gates.
- `docs/reference/PXLBLZ Feature Guide.md` describes the author-visible output
  contract and compile-cost disclosures.
- `docs/plans/archive/show-render-target-cache-planner.md` contains the completed
  design, benchmark matrix, cumulative ledger, issue map, and known boundaries.
- `src/engine/showCompiler.ts` is the generated-Show compiler and emitter.
- `src/engine/showRenderTargetPlanner.ts` owns plane selection and lifetimes.
- `src/engine/showVmResourceLedger.ts` accounts for VM eligibility.
- `test/perf-harness/` contains software and Controller performance harnesses.

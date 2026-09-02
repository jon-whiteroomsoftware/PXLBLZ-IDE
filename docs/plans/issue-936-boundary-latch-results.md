# #936 — Boundary-latched decode for index-routed Shows

Wave-5 epic #923, candidate 3 in the advisory. Measured 2026-09-01 on the
bench pb32 (firmware 3.67, native serial, profile stamped
`native-serial (assumed)`). Spike: `test/perf-harness/issue936.ts`; ladder:
`issue936-latch-ladder.json`; build: `emitSharedPhysicalCutSceneRender` in
`src/engine/showCompiler.ts`, `boundaryLatchedDecode` (default on);
qualification: `src/engine/showCompilerBoundaryLatch.test.ts`.

## Verdict

**Shipped, exact, +13.3% median FPS on Redline at both 256 and 500 px.**
The whole win is the decode latch; the two refinements the issue named
measured at or below zero and were left out.

## Ladder (Redline, A/B x2 per count, 6 s samples)

| variant | 256 px | 500 px | bytecode |
|---|---:|---:|---:|
| exact (per-pixel decode) | 18.011 FPS | 9.251 FPS | 10,938 B |
| latched decode, original column/row formulas, arms grouped by body | **+13.31%** | **+13.30%** | 10,322 B |
| latched decode, original 18-arm chain kept per pixel | +13.14% | +13.06% | 11,298 B |
| latched decode, counter-based column/row | +12.65% | +12.60% | 10,370 B |

- The arm-chain collapse (the render-kernel candidate wave 1 measured
  flat at 2,000 px) is worth ~0.2 points once the decode is latched; the
  build keeps the plan chain and latches the plan index.
- Counters for the zone column and row (`col + 1`, wrap at the width)
  cost more than the `%`, `floor`, and division they replace — two global
  writes and a compare per pixel — so the formulas stay.
- Both sizes sit inside Redline's first zone (800 px), so the zone chain
  itself contributes one comparison here; the latched work is the table
  read, the placement key and flag, the configuration block, and the
  per-pixel `var` decode (~25 us/pixel at 18 FPS x 256 px = 3.3 ms of a
  55 ms frame... the frame is member-bound, so 13% is the machinery's
  whole share).

## What the build does

When the shared physical cut-scene dispatcher has literal zone ranges and
interned plans, the render entry opens with
`if (index == 0 || index == next) { ... }` that re-derives the route id,
the local-index base (`start - localOffset`), the zone's pixel count and
dimensions, the next boundary, the plan from the scene table, and — when
the plan/route key changed — the plan's configuration block. The per-pixel
path is `local = index - base`, the two coordinate formulas, and the plan
chain of render bodies. Everything else in the artifact is untouched;
transition arms are not on this path (#520).

Declines, each with a summary reason: `no-shared-cut-dispatcher` (36 stock
Shows: coordinate routing, transitions, spans), `non-interned-plans` (302
and the Overture remix: property tracks or reuse groups), and the two
shapes the catalogue never produces (`no-literal-ranges`,
`configuration-reads-local`).

## The order contract, now load-bearing

The latch is exact only when every frame renders index 0 first and the
rest ascending. The firmware does (#560 kill-test) and the preview does
(`renderer.ts`); the fast-replay seek path renders whole frames in order.
`showCompilerBoundaryLatch.test.ts` proves both directions: checksum
parity in Fast and Precise across all 40 stock Shows (five frames each,
scene changes included), and a deliberately shuffled render order **must**
diverge from the exact artifact — silently tolerating it would mean the
falsifier is broken. The 301 curriculum test used to sample a handful of
pixels out of order; it now renders full ascending frames and reads its
samples from the sweep. Any future consumer that renders pixels
individually (a picker, a probe) must render from index 0.

## Predictive dispatch for Portable Shows: not built

The issue's second rewrite (test the previous pixel's zone predicate
first) was not spiked: #924 measured Portable zones at 12–14% machinery
and the coordinate-predicate chain is 3–4 comparisons per pixel (#908
census), so the ceiling is a few percent and the first-pixel miss costs a
comparison. Recorded as not-pursued under the ≤500 px scope, reopenable
with a probe.

## Limits kept

- `render(index)` vs `render2D` export: #924's dispatch probe measured
  identical medians, so Installation Shows keep `render2D`.
- No emitter change outside the shared cut-scene dispatcher; vintages pin
  the latch off.

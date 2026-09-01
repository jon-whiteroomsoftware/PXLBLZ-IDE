# Controller performance wave 5: the pixel path, the dial, and the wire

Status: proposed candidates, experiments not yet run
Date: 2026-09-01
Baseline: pb32 "Burner bag", firmware 3.67, native-serial output profile
Author: Claude Fable 5.1 (fresh eyes; no hardware run in this session — every
size below is priced from `test/perf-harness/costs.md` and
`show-runtime-costs.md`, never measured)

Four waves are closed and the #914 spike declared the member-Pattern pass
family mined out. This advisory argues two things. First, the generated
per-pixel path still carries priced, exact, universal waste that no wave
looked at as a *whole*: the waves optimized idioms inside the path, and
nobody re-attributed the path after they landed. Second, the #913 ladder
quietly changed the shape of the problem: at 2,000 pixels the K=4 hold
sits 1.6 ms above the 60.4 ms wire floor. Past K=2 on native serial there
is nothing left for a compiler to buy, so the "run very complex Patterns"
goal is now a three-lever problem — pixel-path cost, an authored quality
dial that reaches the member's inner loops, and the output profile — and
the dial has to be designed as one control, not accreted as options.

Each candidate names its premise, evidence, priced ceiling (with the
dilution caveat: a ceiling is per-pixel work removed, and it matters only as
a fraction of the whole frame), the experiment that validates or kills it,
and the position it takes on the dial. Recorded negatives that stay closed
are listed at the end, including one this advisory closes by reading the
probe rather than the table.

## Scope decision (2026-09-01, Jon)

This round targets the installed base: **at most ~500 pixels, native serial
output, no Output Expander.** Jon has expander builds queued for when his
health allows; every candidate here gets re-run and re-tuned for large
installations then. Consequences for the candidates below:

- The wire is not the constraint. At 256 px it is ~7.7 ms and at 500 px
  ~15 ms, while the heavy stock Patterns run at 0.2–10 FPS there. Frames
  under 500 px are member-bound, so the K>2 hold stops, hold-and-lerp, and
  the 2D block hold are all measurable on the current bench now. The
  "unmeasurable above K=2" caveat in fact 1 is a 2,000 px statement.
- Candidate 12 (the expander) is deferred to the large-installation round;
  only its `render` vs `render2D` dispatch probe stays, folded into 13.
- Candidates 1–4 keep their percentages: per-pixel machinery and the wire
  both scale with N, and the per-frame fixed cost measures ~0.2 ms at
  256 px (hsv-steady at 256 px is within 0.2 ms of the 2,000 px frame
  scaled down), so nothing new appears at small N.
- Member-side candidates (5, 10, 11) gain weight; the target frame is the
  member's inner loop.
- The rate cap (~124.5 FPS) hides wins on light content at 256 px; the
  fixtures for this round are heavy members (PhantomStar, ZippyZaps,
  Caustics), not the wave-2 light ones.

Epic #923 and its children (#924–#936) sit in the v1.9 Release milestone.

## New facts established while writing this (2026-09-01)

1. **The hold ladder is floor-bound above K=2.** `issue913-hold-ladder.json`
   at 2,000 px: baseline 157.9 ms/frame, K=2 101.4, K=4 62.0, K=8 60.4. The
   render share is ~97 ms; K=2 removes 56 of it; K=4 removes all but 1.6 ms.
   On native serial the dial's upper stops cannot buy speed; they can only
   buy back quality at the same cost (candidate 7).
2. **Per-pixel frame constants survived wave 4.** A census of all 40
   compiled stock Shows (`render2D` bodies only): 189 `ceil(sqrt(...))`
   sites and 169 `floor(pixelCount * ...)` sites, in 35 of 40 artifacts.
   Wave 4 (#905) hoisted the pixelCount-only form; these depend on a
   placement property that *may* animate (`__pxlblz_c`, a split position),
   so they were left per pixel. They are per-frame constants. Priced on
   the taken path: one `ceil(sqrt(max(1, floor(pixelCount*c))))` ≈ 11.5×
   mul plus three more `max(1, floor(pixelCount*c))` ≈ 4× each — roughly
   20 us/pixel ≈ 40 ms/frame at 2,000 px.
3. **The per-pixel call chain is five user calls deep.** Redline's steady
   path: `render2D` → `__pxlblz_s(index,x,y)` (3.4 us) → `__pxlblz_aq(index,
   x,y)` (3.4) → member helper `(x,y)` (2.9) → emit `__pxlblz_ar(r,g,b)`
   (3.4) → back → `__pxlblz_r()` (1.9) → native `rgb`. ~15 us/pixel of
   pure call boundary ≈ 30 ms/frame at 2,000 px, ~9% of Redline's 328 ms.
4. **Local and global writes cost the same.** The table's "persistent
   global write −0.0×" is measured against a *local-write* baseline
   (`profiler.js` fn 36 vs 37), so a global write is ~1.47 us like a local
   write, not free. Two consequences: "move temporaries to globals" is
   dead on arrival (closed below), and every eliminated assignment is worth
   1.47 us. The 40 artifacts declare 2,036 `var`s inside `render2D` bodies.
5. **The preview renders in ascending index order** (`renderer.ts:390`),
   and the firmware was kill-tested ascending with total coverage (#560).
   Order-dependent exact rewrites are therefore representable in both.
6. **Global-read cost is zero; literal-vs-global is a tie** (#907). Any
   rewrite that trades a computed local for a per-frame global read is
   free on the read side; only the write side is priced.

## Audit findings in the current generated output

Shapes seen in the artifacts this session (`compileShowForArtifact` over
`STOCK_SHOWS`, stageDimension 2):

- **Route decode on every pixel.** Installation Shows walk an index-range
  `if/else if` chain (5 comparisons for Redline's 5 zones), assign 5 locals
  in the taken arm, then recompute `o = (b % y)/(y-1)` and
  `p = floor(b / y)/(B-1)` with two ternary guards, a `%`, a `floor`, two
  divisions and two more local writes; then a table read `__pxlblz_aC[...]`
  and a placement dispatch chain `if (d == 0) ... else if (d == 7)`. The
  zone and placement of pixel i equal those of pixel i−1 except at zone
  boundaries. Priced: ~30–40 us/pixel before any member work.
- **Portable Shows decode by coordinate predicate, then synthesize a
  square-fill local index from the coordinates** every pixel:
  `min(max(1, floor(pixelCount*c)) − 1, floor(e*a)*a + floor(d*a))` with
  `a = ceil(sqrt(max(1, floor(pixelCount*c))))` — the fact-2 sites.
- **Wrapper indirection is uniform.** Placement wrapper, member wrapper,
  emit sink and paint helper are separate functions on every steady
  pixel, although #520's helper-isolation rule protects *transition
  bodies* only.
- **Temporaries are single-use.** Most generated `var`s are read once
  (`var __pxlblz_r; ... __pxlblz_r = __pxlblz_h; ... rgb(__pxlblz_r, ...)`
  is three writes that could be zero).

## Ordered candidates

Ordered by expected value = priced ceiling × probability × breadth, over
experiment cost. Candidates 1–5 are exact and universal; 6–10 are the dial;
11–13 are the wire and the measurement infrastructure.

### 1. Per-frame hoisting of property-dependent route constants

Premise: an expression whose only non-literal inputs are `pixelCount` and
placement properties is invariant across a frame even when the property
animates; recompute it once in `beforeRender` (or in the property-ramp
update, which already runs per frame) and read the global per pixel.
Evidence: fact 2 (189 + 169 sites, 35/40 Shows). Exact by construction
(same operations, same order, once). Ceiling ~20 us/pixel on the taken path
of Portable routed Shows ≈ 40 ms/frame at 2,000 px. Experiment: hand-hoist
`stock-show-105-portable-zones` and `stock-show-reference-aperture-shapes`,
run the #555 paired ladder; then extend `showFrameInvariantHoisting` /
#905's generated-code dedupe with a "property-invariant" class. Dial: none
(always on).

### 2. Flatten the steady-state wrapper chain

Premise: the per-pixel call boundary is the priced cost (#532); the
#520 safety boundary covers generated transition bodies, not steady
placement wrappers. Inline the placement wrapper into the dispatcher arm,
turn the emit sink into direct global writes inside the member's sink, and
fold the zero-arg paint helper into the arm. Evidence: fact 3. Exact.
Ceiling ~10–15 us/pixel on every routed Show ≈ 20–30 ms/frame at 2,000 px.
Risk: bytecode growth where one wrapper serves many arms (measure with the
#906 oracle) and the #520 activation failure mode — keep transition arms in
helpers, verify activation at 256/1,000/2,000 as #520 did. Experiment: hand-
flatten Redline's steady path, paired ladder inside a hold phase.

### 3. Boundary-latched decode for index-routed Shows

Premise: with proven ascending order (fact 5), the zone, local-index base,
zone dimensions, placement id, and the placement's callee change only at
zone boundaries and scene changes. Emit `if (index == __next) { advance }`
plus `b = index − __base` and the two coordinate expressions; move every
decode assignment into the boundary block; select the arm's callee once per
boundary into a function-valued *scalar* (calls through a function-valued
var cost the same as direct calls per #556 — this is a different premise
from #572, which added a hop; here the call already exists). Row/column
coordinates can also step per row (one division per row, one per pixel)
while staying exact if the per-pixel column division is kept and only the
row term is latched. Evidence: audit finding 1; fact 5. Exact given the
order contract; the frame's first pixel resets the latch, and a pixel-count
change invalidates it. Ceiling ~25–30 us/pixel on Installation Shows ≈
50–60 ms/frame at 2,000 px. Experiment: hand-edit Redline, paired ladder;
kill-test the latch under the browser seek path and `?capture`.

For coordinate-routed (Portable) Shows the same idea degrades to
**predictive dispatch**: test the previous pixel's zone predicate first and
fall back to the full chain on a miss. Exact regardless of order (the
predicates are mutually exclusive and total), ~one range check per pixel
instead of a chain; ceiling ~3–8 us/pixel.

### 4. Single-use temporary elimination in generated per-pixel code

Premise: each assignment costs ~1.47 us (fact 4) and most generated
temporaries are read exactly once; forward-substituting a pure single-use
local into its use site removes the write without changing any operation
or its order. #907 priced statement fusion statically as a winner (−3
words) and never probed or built it. Evidence: 2,036 `var`s in `render2D`
bodies; audit finding 4. Exact. Ceiling 5–10 writes/pixel ≈ 7–15 ms/frame
at 2,000 px on every Show. Experiment: hardware probe of `var a = f(x); g(a)`
vs `g(f(x))` first (one row for the cost table), then a rewrite over
generated arms only (members keep their authored shape).

### 5. Unroll static-trip-count per-pixel loops

Premise: loop machinery — compare, branch, `i = i + 1` (add + local write)
— is ~4 us per iteration, and the #914 Rule-A detector already finds
literal-bound loops (trip 2–128) in render-reachable code. Unrolling
replaces the induction variable with literals (a static tie) and deletes
the machinery; every operation and its order is unchanged. Evidence: #909's
7.32 vs 0.68 us/element gap is mostly this machinery; 36 of 101 stock
Patterns loop, 21 inside a render function. Exact. Ceiling: ~4 us × trip
count per pixel — large on light-bodied loops (ring/voice loops: a 10-ring
loop ≈ 40 us/pixel), small on heavy-bodied ones (PhantomStar's ~170 us/step
raymarch: ~2%). Bytecode grows by trip × body; gate on the #906 oracle
against the 68,384-byte scale. Experiment: one probe row (8-iteration loop
vs unrolled, `beforeRender`), then hand-unroll IridescentFibers' 10-layer
loop and NeonSquircles' 20-ring loop for a paired ladder. Dial: none.

### 6. The performance dial: one control, five levers

Premise: the levers below already exist or are proposed as separate
options; users will not compose them, and an "auto" needs a single scalar.
Proposal: a Controller-profile **Performance** setting with stops, honored
by the preview with a session override (the #913 design), stamped on the
push. Suggested mapping — to be tuned by eye:

| stop | hold | interpolation | member quality | transitions | math |
|---|---|---|---|---|---|
| Exact | off | — | 1.0 | authored | checksum-exact |
| Display-exact | off | — | 1.0 | authored | display-exact (cand. 9) |
| Smooth ×2 | K=2 | lerp (cand. 7) | 1.0 | hold K=2 | display-exact |
| Fast | K=2 | lerp | 0.7 | hold K=4 | perceptual (cand. 10) |
| Fastest | K=4 | lerp | 0.5 | hold K=4 | perceptual |
| Auto | governed (cand. 8) | lerp | governed | governed | display-exact |

Every stop is disclosed on the control panel as pushed; Auto reports the
stop it is currently at. This is a product decision — decide with Jon
before building any of 7–10 as a standalone option.

### 7. Hold, evolved: interpolate, dither, and go 2D

Premise: the #913 hold replicates the anchor; at K=4 that is the artifact
Jon saw. Three cheaper-than-render refinements, all authored and disclosed:

- **Hold-and-lerp.** At an anchor, evaluate the member at the *next*
  anchor's coordinates (the compiler synthesizes coordinates from the index
  for Installation Shows, so lookahead is free) and emit linear blends for
  the K−1 pixels between the previous and next anchors: ~3 mul + 3 writes
  per held pixel (~7 us) instead of a replay (~3 us) or a render. Same
  evaluation count as the hold; visibly smoother, especially at K=4. Fact 1
  says the K=4 stop costs nothing extra on native serial at 2,000 px.
- **Alternating-parity anchors.** Shift the anchor phase by one each
  frame (`(index + frame) % K`). Free. Trades static pixelation for a
  half-rate shimmer; at ≥20 FPS it reads as resolution, at 3 FPS as
  flicker — a stop on the dial, not a default.
- **2D block hold on proven row-major placements.** Anchor every K-th
  column *and* row: 1/K² evaluations. The previous anchor row's RGB fits in
  one arena plane at K≥2 (3·N/K words), so it sidesteps #718's contention
  census; bilinear replay costs ~12 reads + lerps ≈ 20 us/pixel, so it
  pays only for members above ~60 us/pixel — exactly the "very complex
  Pattern" case. Eligibility is the #913 row-major proof.
- **Compose with Rolling Refresh.** Hold ×2 over a four-slice refresh
  evaluates 1/8 of the pixels per frame with max age 3 — never measured as
  a pair.

Experiment: extend `applySpatialHold` in `test/perf-harness/issue913.ts`
with the lerp and parity variants, re-run the ladder, render contact sheets
for the same four videos Jon judged last time.

### 8. Frame-time governor (the "Auto" stop)

Premise: `beforeRender(delta)` sees the frame time; a target FPS on the
Controller profile plus hysteresis picks K ∈ {1, 2, 4} and the member
quality scalar per frame, the way game engines scale resolution. Cost: one
global compare per frame and the existing per-pixel hold gate. Scene-aware
variant: degrade only inside transition windows (the only 2N-cost phases,
and where the eye is on the blend), restore on the hold. Universal;
disclosed as "Auto · currently ×2" on the panel. Experiment: build on
candidate 7's harness with a synthetic load ramp; verify no oscillation and
that seek/preview reproduce the same decisions from the same deltas
(preview delta is deterministic under `?capture`).

### 9. Display-exact as a qualification tier

Premise: the checksum gate rejects a class of strength reductions that are
invisible after 8-bit quantization — `pow(x, k)` → repeated multiply
(8.4× → k−1), reciprocal multiply for repeated division, `hypot` for
hand-rolled lengths — because they drift the Precise checksum by a ULP.
Define **display-exact**: identical 8-bit RGB for every pixel of the drift
window in both modes (the drift tool already computes max channel delta;
gate on max = 0). Emission passes and stock-Pattern edits can then ship
under that tier without a human visual gate. Evidence: the guide's
Kishimisu reciprocal step and the #266 `hypot` library change were exactly
this trade, argued case by case. Breadth: 16 stock Patterns call `pow`.
Experiment: none needed on hardware; it is a policy plus a test helper.

### 10. Approximate-transcendental substitution (perceptual tier)

Premise: `exp` (12.6×) and `pow` (8.4×) dominate shader ports, and the
guide's measured lossy wins (fastTanh +22%, polynomial glow +3–4%) were
hand-applied per Pattern. A compiler pass with a bounded-domain rational or
polynomial for `exp(−x)`, `tanh`, `asin/acos`, and `pow(x, non-integer)`
generalizes them, priced by the drift tool and gated by the dial's
perceptual stop. Not exact; never on below the Fast stop. Breadth: 16 +
4 stock Patterns; every future ShaderToy port. Experiment: one approximation
per built-in in a probe Pattern, cost row plus drift, then Jon's eye on the
three worst-drift catalogue Patterns.

### 11. Member quality convention, and a `@quality` loop annotation

Premise: the only lever that reaches structurally unhoistable work (raymarch
steps, octaves, voronoi cells, ring counts) is the trip count, and
PhantomStar already exports a `quality` scalar for exactly this. Make it a
convention: a Pattern that exports `quality` receives the dial's member
quality; a loop annotated `// @quality` has its literal bound scaled by the
compiler (min 1) when the dial is below Exact. Sweep the heavy stock
Patterns once by hand (`voronoiDist` 9 → `voronoiDist5`, fbm 4 → 3 are
already in the libraries as separate helpers — the convention selects
between them). Lossy, authored, disclosed. Experiment: PhantomStar,
Caustics, PlasmaNebula at quality 0.5/0.7 — paired FPS plus contact sheets.

### 12. The wire, priced honestly

Premise: fact 1. For held Shows at 2,000 px on native serial, the frame is
97% wire. The two levers that move that floor are the deferred #912 Output
Expander profile (rendering overlaps transmission; parallel lanes) and a
clocked LED family (APA102/SK9822/HD108 at a configurable data clock — the
same 2,000 pixels ship in single-digit milliseconds). Neither is a compiler
change; both are Controller-profile declarations the harness already
stamps (#567). Recommendation: buy the $19 expander before the next lossy
round, because every lossy stop above ×2 is currently unmeasurable on the
bench. Also probe whether exporting `render(index)` instead of
`render2D(index, x, y)` for Installation Shows (which ignore the firmware's
x/y) trims the firmware's per-pixel map lookup and argument push — a
30-minute trivial-Pattern ladder.

### 13. Re-attribute before building

Premise: #531's ladder (trivial-output / constant-members / capture-elided /
full) is the only instrument that says how much of a frame is Show
machinery versus member work, and it last ran before waves 2–4. Candidates
1–4 are worth building in proportion to the machinery share that remains;
candidates 7–11 in proportion to the member share. Run it on the five #555
fixtures plus two Portable Shows first; it is one harness invocation. Add
the three missing cost-table rows the exact candidates depend on: loop
iteration overhead, single-use local vs fused expression, and `render` vs
`render2D` dispatch.

## Suggested sequence (≤500 px round)

1. Candidate 13 at 256 and 500 px on heavy fixtures, plus the three missing
   probe rows (loop iteration, fused expression vs single-use local,
   `render` vs `render2D` dispatch) — half a day, decides the
   machinery-versus-member split.
2. Candidate 6's dial design decision with Jon, then candidate 7's lerp and
   parity variants on the existing #913 harness with contact sheets at
   256 px — the cheapest visual win, and the one that reaches heavy
   Patterns directly.
3. Candidates 1, 2, 4 as three small exact slices in that order, each with
   a hand-edited fixture as its first experiment and a `false`-able option
   for vintages, per wave-4 practice.
4. Candidates 5, 11, 9, 10 as member-side work: unrolling, the `quality`
   convention, the display-exact tier, then the transcendental pass.
5. Candidate 8 (the Auto stop) once 7 has a measured ladder to govern.
6. Candidate 3 last: it is Installation-shaped, and most of its audience is
   the large-installation round.

## What stays closed

No new premise for: transformed-coordinate caching (#528), zone-math
strength reduction (#563; candidate 9 reopens only the reciprocal form and
only under a display-exact gate), raw-bit peepholes (#564), function-valued
*sink* rebinding (#572 — candidate 3 rebinds a callee that is already a
call, not a flag branch), mirror within-frame reuse (#560), lazy position
memoization and index tabling as passes (#914), `frac` hue wrap (#907),
preview-stream tax (#911), packed routing re-price (#908), a fourth plane
(#718 — candidate 7's row buffer fits inside one existing plane), and
firmware chasing (3.70 is bugfix-only).

**Closed here without hardware:** "move per-pixel temporaries to persistent
globals because global writes are free." Fact 4: the table's zero is
relative to a local-write baseline; the writes cost the same. Only removing
an assignment pays (candidate 4).

## Evidence index

Session census artifacts (not committed): compiled `render2D` bodies of all
40 stock Shows via `compileShowForArtifact`, idiom counts by `grep -F` over
`export function render2D` to end of file. Repo:
`test/perf-harness/issue913-hold-ladder.json`, `profiler.js` (fn 31–37),
`show-runtime-costs.md`, `costs.md`, `issue907-static-verdicts.md`,
`docs/plans/issue-914-member-pass-spike-results.md`,
`docs/plans/archive/issue-531-show-frame-attribution-results.md`,
`src/engine/renderer.ts:390`, `src/engine/showHelperInlining.ts`,
`src/engine/showCompiler.ts` (the `ceil(sqrt(` emission sites at 5511, 6517,
6559, 6643, 6719, 9402, 9428).

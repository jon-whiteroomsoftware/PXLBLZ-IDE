# Controller performance wave 4: optimize the generated code itself

Status: proposed candidates, experiments not yet run
Date: 2026-08-28
Baseline: pb32 "Burner bag", firmware 3.67, native-serial output profile

Three optimization waves and the #715–#720 byte program are closed, and the
program declared itself out of runway. This advisory argues the runway moved
rather than ended. Two facts open a seam that none of the prior waves touched:
the device compiler performs no optimization at all, and our own optimizer has
never analysed the code the Show compiler generates. Everything the emitter
writes — identity blends, duplicate route decodes, per-pixel constants —
executes on the Controller exactly as written. An audit of all 40 compiled
stock Shows found priced waste in the per-pixel path on the same order as the
2,000-pixel wire floor.

Every candidate below names its premise, its evidence, its expected size, and
the experiment that would validate or kill it. None repeats a recorded
negative without a materially new premise; the negatives that stay closed are
listed at the end. Issues: epic #903; each candidate heading below names its
issue.

## New platform facts (research round, 2026-08-28)

Facts from Ben Hencke ("wizard") or official Electromage sources unless noted.

1. **The device compiler does not optimize.** Asked whether it collapses
   constant expressions: "Optimizing compiler? What fun would that leave
   us?!?" ([forum 4009](https://forum.electromage.com/t/how-to-parse-hex-codes/4009/7)).
   Corroborated by his advice that precomputing `PI/2` into a variable gains
   "a small bit of performance" ([forum 445](https://forum.electromage.com/t/atan2-y-x-bug/445/6)) —
   impossible under constant folding. No CSE, no dead-code elimination, no
   inlining. Whatever source we deliver is the program the VM runs.
2. **Bytecode is a stack machine at roughly 0.35 µs per word.** Community
   disassembly of v3.67 output (the [pbz](https://github.com/tarekrached/pbz)
   project ships golden fixtures pinned to our firmware) shows inline literal
   words (LSB-tagged, 16.15 precision), compile-time global slots, and one
   free-standing POP word per expression statement. Calibration: `a = bar`
   is 3 words at Ben's measured 1.04 µs/assignment; the model predicts his
   array-access numbers within noise.
3. **Native array helpers beat interpreted loops 2–3×.** "On v3 these array
   helpers are 2-3x faster than a `for(...)` loop"
   ([forum 806](https://forum.electromage.com/t/input-needed-functions-wishlist/806/31));
   "`mutate` is used here for speed, it's faster than a `for` loop"
   ([forum 1891](https://forum.electromage.com/t/using-beforerender-to-generate-an-array-of-hsv-values-for-supersampling/1891)).
   Callbacks cannot close over locals — they read globals and their own
   parameters only. Our harness has never priced them.
4. **`render(index, x)` supplies `x = index/pixelCount` free.** Dropping that
   one division took the stock rainbow from 464 to 535 FPS (+15%)
   ([forum 1251](https://forum.electromage.com/t/identifying-a-bottleneck-low-fps/1251));
   v3.66 added 1D pixel maps feeding the same argument.
5. **`sendUpdates` is per-connection since v3.16.** A client can suppress the
   preview-frame stream on its own socket while stats (including FPS) keep
   arriving on every socket. The editor's save flow needs preview frames
   enabled, so any quiet mode must re-arm before save. The FPS cost of the
   stream has never been measured; Ben's benchmarking discipline disables it
   ("reduce overhead of UI slightly").
6. **Native serial output does not overlap rendering; the Output Expander
   does.** Measured by Ben: 2,500 trivial pixels run 138.45 FPS with no LEDs,
   12.09 FPS on direct WS2812 ("rendering is stalled until data transmission
   is complete"), while the expander path buffers to the UART and renders in
   parallel ([forum 1919](https://forum.electromage.com/t/programming-for-io-expander/1919)).
   Every FPS gate we have shipped was qualified native-serial only.
7. **Firmware 3.70 (2026-08-22) is a pure bugfix release.** Five sync/playlist
   fixes, nothing touching the VM, math, arrays, output drivers, or
   WebSocket/preview ([release notes](https://forum.electromage.com/t/release-v3-70-bugfixes-for-sync-groups-and-more/4746)).
   3.68/3.69 were never published. All 3.67 measurements remain valid.
8. **No faster hardware exists.** The only new SKU (Pico+) is the same ESP32
   at the same 48K px/s average. Controllers are sold out at Electromage as
   of August 2026; the bench pb32 is not casually replaceable.
9. **Short-circuit behavior of `&&`/`||` is publicly unknown.** Only the
   value-carrying semantics are documented. Cheaply testable (fact 2 gives a
   static oracle; a side-effect probe gives a dynamic one).

## Audit findings in our own generated output

From reading the compiled artifacts of all 40 stock Shows plus the wave-2
fixtures, priced with the measured op-cost tables
(`test/perf-harness/costs.md`, `show-runtime-costs.md`):

- **Identity blend arithmetic.** Static-opacity-1 placements emit
  `M = z * (1) + M * (1 - (1))` per channel plus three dead local
  initializations: 666 such lines across 36 of 40 stock Shows. Priced
  ceiling ~14 µs/pixel ≈ 28 ms/frame at 2,000 px — the same order as the
  60.4 ms wire floor. A direct-assignment path exists but its gate
  (`routedStackHasEndpointOptimization`) never fires for plain opaque stacks.
- **Duplicate route decode in transition arms.** The from/to arms of a
  same-zone transition each recompute the identical route index and zone
  coordinates: ~8.8 µs/pixel for the whole transition window
  (~17.6 ms/frame at 2,000 px).
- **Per-pixel frame constants.** `var side = ceil(sqrt(pixelCount))` is
  emitted inside the per-pixel body at seven call sites (twice per transition
  arm), ~4.1 µs each. Tautological route guards on single full-Stage zones
  cost ~4.5 µs.
- **Small idioms at scale.** `h - floor(h)` instead of `frac(h)` at 77 sites
  (0.86 µs each); the shared HSV fallback chain computes both `q` and `t`
  when one is always dead (~6 µs); colour-effect posterize blends through
  identity coefficients when `q == 1` (~7.2 µs) where a branch is measured
  3.5 µs cheaper than the arithmetic select (#556).

The existing passes (#513/#566 hoisting, #565 inlining) analyse authored
member source only (`showMemberLowering.ts`); every prior win inside
generated code was a hand-built special case (#558, #561, #562, #571).

## Ordered candidates

Ordered by expected value: estimated gain × probability × breadth, over
experiment cost.

### 1. Constant folding and algebraic simplification for generated code (#904)

Fold `x * (1)`, `x * (0)`, `+ 0`, `1 - (1)`, and dead local initializations
in generated per-pixel arms, starting with the identity blend. Exact by
construction. Experiment: a 30-minute #556-style probe pricing the identity
blend against direct assignment, then one hand-folded fixture through the
paired issue555 ladder, then the general pass gated on Fast/Precise checksum
parity and stock-catalogue byte census.

### 2. Extend hoisting and CSE to generated Show code (#905)

Run the generated arms through the same frame-invariance and subexpression
analysis members get: deduplicate route decode across transition arms, hoist
`ceil(sqrt(pixelCount))`, elide tautological guards. Experiment: hand-edit
one transition-arm artifact and measure paired FPS inside the transition
window (transition medians are an established metric), then generalize.

### 3. Static bytecode word-count oracle (#906)

We already run the Controller's compiler headless (`fetchControllerCompiler`);
pbz proves its output is mechanically disassemblable with fixtures pinned to
v3.67. A word-count differ prices any emission idiom without hardware — an
experiment-velocity multiplier for every candidate here, and the tool that
settles fact 9 statically.

### 4. Emission idiom sweep priced by the oracle (#907)

Statement fusion (one POP word per statement), dead initializer removal,
`frac(h)` for `h - floor(h)`, colour-effect endpoint branches, dead-lane
elimination in the shared HSV chain, literal-vs-global emission rules.
Each idiom is priced statically first, confirmed with one hardware probe,
then taught to the emitter where it pays.

### 5. Fourth plane / packed RGB (#718, already open)

New premise since #718 was filed: the #715 odd-guard 2×15 packing is
arithmetic, not bitwise, so it escapes the #564 integer-coercion negative
that killed packed representations. The spike's demanded contention census
from a real stock Show still applies unchanged.

### 6. Re-price the packed-routing gate under literal encoding (#908)

`PACKED_MIN_EXPECTED_COMPARISONS = 13` was calibrated at 20 B/element; #715
measured array literals at 4.25 B/element and named the consequence: "the
FPS gate, not the byte gate, becomes the binding constraint." Re-run the
pricing and flip any range-branch decisions that now qualify.

### 7. Price native array helpers; evaluate buffered-frame lowering (#909)

Price `mutate`/`forEach` against `for` on the device (unpriced axis, fact 3).
If the 2–3× holds, lower eligible generated loops, then evaluate the larger
shape: per-frame plane fills via `mutate` with a trivial replay `render`,
the compiled analogue of Ben's buffered-KITT example (115 vs 73 FPS).

### 8. Free `x` coordinate for 1D routed Shows (#910)

Emit `render(index, x)` and consume the free normalized coordinate instead
of synthesizing it from `index` with divisions. Ceiling +15% on a trivial
pattern; realistic gains smaller under dilution. Requires checking Precise
parity and eligibility breadth across the catalogue.

### 9. Preview-stream tax and quiet-connection playback (#911)

Measure FPS with `sendUpdates` on and off at fixed pixel counts. If the tax
is real, add a playback mode that suppresses preview frames on the IDE's
socket during installation playback and benchmarking, re-arming before any
save (fact 5's trap).

### 10. Output Expander profile re-qualification (#912)

Fact 6 changes the cost model's shape: with rendering overlapped by
transmission, compute savings below the transmit floor vanish and the floor
itself drops per lane. The #528 negative names "a different output profile"
as its own reopener, and the declared-profile machinery (#567) already
stamps every measurement. Requires purchasing and wiring an expander
(in stock, $19, unlike the controllers).

### 11. Spatial sample-and-hold as an authored policy (#913)

The deferred C4 idea's platform precondition is now proven rather than
assumed: the #560 kill-test showed strictly ascending render order with
total coverage. Evaluate one sample per K contiguous pixels on proven
1D/row-major placements — the spatial sibling of the shipped four-slice
Rolling Refresh (+20%). Authored, disclosed, and human-review gated; the
result is deliberate pixelation, never an inferred optimization.

### 12. Automate the hand-proven member-Pattern moves (#914)

The optimization guide's hand-applied wins — loop-index-only tabling
(+25.3% NeonSquircles), lazy position-only memoization (+37.6% PulseLoom),
palette specialization (+66.3% AuroraSphere) — as compiler passes over
member source. Index tabling is exact when operands are tabled rather than
products; memoization is exact but words-hungry and ledger-gated. The
largest compiler surgery here, last despite the headline percentages.

## What stays closed

No new premise exists for: coordinate-plane caching (#528, except under
candidate 10's profile change), zone-math strength reduction (#563), raw-bit
peepholes (#564 — candidate 5's packing is arithmetic and does not touch
them), function-valued sink rebinding (#572), and mirror within-frame reuse
(#560). Firmware chasing is dead until a release after 3.70 touches the VM.

## Evidence index

Repo: `docs/reference/Show Rendering Optimization Results.md` (ledger and
negatives), `docs/guides/Inside the Show compiler.md`,
`docs/guides/Optimizing Pixelblaze patterns.md`,
`docs/plans/issue-715-packed-data-pricing-results.md`,
`docs/plans/issue-720-device-validation-results.md`,
`test/perf-harness/costs.md`, `test/perf-harness/show-runtime-costs.md`,
`docs/collaboration/show-rendering-next-opportunities/` (deferred ideas and
falsifiers).

External: forum threads linked inline above; all Ben Hencke statements
verified against forum.electromage.com in August 2026.

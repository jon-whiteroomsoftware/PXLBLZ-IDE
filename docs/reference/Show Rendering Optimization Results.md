# Show Rendering Optimization Results

Status: as-built reference
Date: 2026-07-20

This is the evidence ledger: exact numbers, fixtures, and qualification
envelopes. For the narrative version — what these optimizations are and why
the winners won — see `docs/guides/Inside the Show compiler.md`.

## Result

The Show rendering program established a supported 2,000-pixel output envelope,
reserved one reusable three-plane render target, and qualified a set of exact
and authored optimizations on a firmware-3.67 pb32 Controller. The exact
Redline reference improved from 2.358 to 3.037 FPS (+28.8%). Larger fixture-
specific gains came from avoiding whole Pattern evaluations: compatible output
reuse improved 91.7%, content-aware key composition improved 59.9%, and scalar-
field reuse improved 44.1%. Snapshot/live Crossfade intentionally changes the
visual contract and improved Redline's transition median by 76.7%.
The first scalar-field Effect, Vignette, improved 26.6% at the 2,000-pixel
ceiling while adding no VM words.

The evidence-led next wave is also complete. Authored Freeze improved its heavy
backdrop fixture by about 46%; exact three-layer coverage composition reached a
121.98% gain at full coverage; field/shading decomposition reached about 110%
with five consumers; and four-slice Refresh gained about 20% while preserving a
bounded three-frame pixel age. Table-driven Show scores reduced three long
reference artifacts by 74.6-86.2%, and Restart lifetime coloring reduced the
Property Animation artifact by 22.56%. Trails shipped as a zero-additional-word
visual affordance with its measured 35-37% native-serial FPS cost disclosed.

The program also established a negative boundary. Exact transformed-coordinate
caching looked profitable in an abstract operation model but slowed 2,000-pixel
Redline by 6.43% while increasing source and bytecode. It remains available as
a diagnostic counterfactual and is disabled in production.

Every FPS number in this document is bounded by the physical output floor of
its declared output profile (#567). On native serial output the measured
trivial-output floor is 60.353 ms/frame at 2,000 pixels - a ~16.6 FPS ceiling
no compiler pass can move. Output Expander / Pro Output Expander parallel
lanes and clocked LED families change that floor; the device protocol cannot
report which is wired, so Controller profiles carry a user declaration and
every harness report stamps it (absent declarations stamp `native-serial
(assumed)`). Qualified numbers name their profile - the Trails 35-37% cost is
native-serial-only by explicit disclosure - and measurements under different
declared profiles are separate qualification envelopes, never averaged.

The completed design and full evidence ledger are archived in
`docs/plans/archive/show-render-target-cache-planner.md`. Current compiler and
product behavior remains authoritative in `CONTEXT.md`,
`docs/reference/PXLBLZ Technical Reference.md`, and
`docs/reference/PXLBLZ Feature Guide.md`.

## Supported resource contract

Compiled Shows support at most 2,000 output pixels. Every generated Show owns
three full-output 16.16 arrays:

```text
renderTargetWords(N) = 3 * (N + 4)
renderTargetWords(2000) = 6,012
remainingWords(2000) = 10,240 - 6,012 = 4,228
```

The 4,228 residual words belong to the complete Show, not to each Pattern.
Member arrays, packed routing, plan tables, and auxiliary caches all compete
for the same VM pool. Persistent globals, longest live stack path, symbol
pressure, source bytes, Controller bytecode, and renderer evaluations are
reported on separate axes because no one axis predicts another reliably.

The same three physical planes change typed roles through a deterministic
lifetime plan:

| Role | Planes | Current use |
| --- | ---: | --- |
| `stage-rgb` | 0/1/2 | snapshot/live Crossfade and compatible Pattern-output reuse |
| `sample-xy` | 0/1 | measured diagnostic only; production disabled |
| `scalar-field` | 0 | exact reusable Dissolve geometry and static full-Stage Vignette |
| `previous-rgb` | 0/1/2 | Show output Trails, suspended while a required Transition snapshot owns the planes |

One role assignment does not allocate another buffer. There is no fourth
compiler-owned full-output plane, and two full RGB buffers do not fit the
2,000-pixel VM contract.

## What shipped

### Exact routing and frame work

The compiler short-circuits mutually exclusive physical ranges, removes unused
capture paths, specializes identity wrappers, and hoists proven frame-invariant
Pattern expressions out of per-pixel rendering. These exact passes moved the
Redline reference from 2.358 to 3.037 FPS. Property-specialized render-kernel
dispatch remains measured-neutral on the qualified Controller profile and is
not treated as an FPS win.

### Whole-Show resource eligibility

The compile-time ledger counts array elements plus four-word headers, member and
generated ownership, persistent globals, artifact bytes, and proven stack
paths. An unbounded allocation or exhausted resource axis blocks artifact
actions with an owner-specific repair while preview remains available.

At the 2,000-pixel ceiling, 55 of 59 bundled Patterns fit beside the mandatory
arena individually. A ten-member median-pattern fixture reached 185 persistent
globals and 40,738 artifact bytes, demonstrating that globals and activation
bytes can bind before local stack or array memory.

### Shared Motion representation

Equivalent routed Motion environments and transition families share generated
kernels without merging Pattern instances or authored boundary state. The
Motion Transitions Show retained 21 Scenes and 20 boundaries while compiling
three Pattern instances. Source fell 37.5% and Controller bytecode 37.2%; FPS
was unchanged. This is a capacity win.

### Table-driven Show score

Compatible repeated single-zone 2D Shows now carry choreography as a compact
five-word-per-boundary score and emit each unique Pattern instance, Scene stack,
and Transition kernel once. Wipe and Mix, Shape Reveal, and Easing reduce
historical source from 177,411, 114,452, and 135,908 bytes to 26,174, 29,059,
and 18,689 bytes: 85.2%, 74.6%, and 86.2% total reductions. Against equivalent
current three-instance unrolled artifacts, Controller bytecode falls 78.9%,
66.6%, and 78.5%.

The score adds 134, 79, and 104 VM words respectively and uses no render-target
planes. All selected artifacts activated on pb32 firmware 3.67 at 256, 1,000,
and 2,000 pixels; the unrolled Wipe artifact did not activate at 1,000 or 2,000
within 15 seconds. Fast and Precise boundary output matches. Paired FPS results
are runtime-neutral, so the production claim is a large execution,
transport/storage, and activation-capacity win, not a throughput win.

### Shared generated Effect kernels

Compatible repeated animated Scale Effects share one generated matrix-update
body while retaining member-owned clocks, private state, Controls, parameters,
and final matrices. The two-member boundary saves 624 Controller-bytecode bytes
and six globals; the ten-member fixture saves 6,480 bytecode bytes and 54
globals. Fast and Precise output are exact, VM words and per-pixel branches are
unchanged, and measured FPS is neutral. Production selects the shared form for
every compatible group of at least two members.

### Snapshot/live Crossfade

New or explicitly selected snapshot/live boundaries capture the complete
outgoing Stage composite and render the incoming side live. Existing persisted
Crossfades without a policy retain live/live behavior. The outgoing Pattern's
pixels freeze by authored policy; this is not described as exact continuation.

On 2,000-pixel Redline, median transition throughput improved from 1.810 to
3.197 FPS (+76.7%). On the five-Pattern acceptance Show, snapshot/live improved
58.1% over exact live/live and 70.2% over the unoptimized baseline.

### Lifetime-aware plane planning

Candidates declare stored value, plane count, half-open lifetime, invalidators,
exactness, setup/replay cost, reuse, and conflicts. Required authored policies
rank first, exact optional candidates rank before approximate candidates, and
stable ids make selection deterministic. Rejected candidates retain direct
behavior and a reason. Emitters use planner assignments and cannot allocate
untracked field arrays.

### Compatible Pattern-output reuse

A render-pure Pattern instance evaluated over the same local sample domain can
produce one exact RGB output and serve several compatible physical placements.
The compatibility identity includes source, instance, clock, controls,
properties, coordinates, sample count, renderer, and pre-cache Effects.

The five-surface fixture rendered one 400-sample output for five 400-pixel Zones,
avoiding 1,600 of 2,000 Pattern evaluations per frame. Median throughput rose
from 4.554 to 8.729 FPS (+91.7%) with no array allocation beyond the arena.

### Scalar visual fields

An exact scalar producer can fill one plane once and serve compatible consumers
until its declared invalidation boundary. The first production producer is the
frame-stable coherent-noise geometry used by spatial Dissolve. Transition
progress and edge policy remain live consumers.

The five-surface fixture removed an estimated 96,000 operations per cached
frame and improved from 2.161 to 3.115 FPS (+44.1%). The first active frame
remains exact and later frames replay the ready field.

Vignette is the first authorable scalar-field Effect. It evaluates a radial
Stage-coordinate matte from center, aspect, radius, softness, and amount. A
static full-Stage member computes the exact inline result while filling plane 0
on its first frame and reads the field on later frames. Animated properties,
routed or partial evaluation, multiple Vignettes on one member, unavailable
arena, and overlapping higher-priority ownership remain exact inline fallbacks.

On pb32 firmware 3.67, inline-to-replay median throughput improved from 50.271
to 63.524 FPS at 256 pixels (+26.36%), 12.968 to 16.409 at 1,000 (+26.54%),
and 6.494 to 8.219 at 2,000 (+26.58%). The selected artifact adds 219 compact
source bytes and 112 Controller-bytecode bytes but no VM words. Fast and Precise
fill/replay output match.

### Show output Trails

Trails applies after the complete Show composite. Each linear-RGB channel emits

```text
max(live, previous * retention)
```

and writes that result into the existing three-plane arena for the next frame.
The first complete traversal seeds history. Required Transition snapshots
temporarily own the same planes, so Trails suspends and clears across those
boundaries, then reseeds. Browser seeking advances exact Pattern state while
bypassing feedback reads and writes, then seeds only the destination frame;
ordinary preview and Controller playback remain continuous.

On pb32 firmware 3.67 native serial output, Live-to-Trails median throughput
changed from 124.502 to 80.437 FPS at 256 pixels (-35.39%), 32.951 to 20.833 at
1,000 (-36.77%), and 16.569 to 10.436 at 2,000 (-37.01%). Trails adds 405
compact-source bytes and 236 Controller-bytecode bytes but no VM words. This is
the measured cost of an authored visual affordance, not an optimization claim.
The protocol cannot identify or switch an expander/parallel profile, so the
native serial result is the only qualified output profile.

### Content-aware luma and chroma keys

A keyed upper layer renders first, derives alpha, and evaluates the lower source
only for holes and feather pixels. Exact cost is `N + U`, where `U` is the
output-dependent uncovered set. A 90%-opaque black-key overlay improved from
2.801 to 4.480 FPS (+59.9%) while reducing source and bytecode and allocating no
new arrays.

### Three-layer coverage-directed composition

An eligible three-layer keyed stack now evaluates from top to bottom and stops
when accumulated alpha reaches one. Exact cost is `N + U1 + U2`; feather pixels
continue through every layer required for the exact blend. Render-mutating,
unknown, repeated-instance, and unsupported-depth stacks retain ordinary
composition. Exact zero-weight render-pure layers are omitted, stateful calls
are retained, and exact full weight bypasses unnecessary blend arithmetic.

At 2,000 pixels on pb32 firmware 3.67, median throughput changed by -2.27%,
+16.71%, +41.38%, +100.74%, and +121.98% at 0%, 25%, 50%, 90%, and 100%
coverage. The 90%-coverage result held at every target size: 14.423 -> 28.942
FPS at 256 pixels, 3.704 -> 7.435 at 1,000, and 1.852 -> 3.717 at 2,000.
The selected artifact adds 401 compact-source bytes and 48 Controller-bytecode
bytes but no VM words. Five-layer artifacts remain byte-for-byte unchanged and
measured neutral. Fast and Precise replay match across the complete coverage and
depth matrix.

### Five-Pattern qualification

The 36-second acceptance Show combines five stock Pattern instances, five
physical Zones, four Scenes, Continue, post-color Effects, a static spatial
Effect, snapshot/live Crossfade, and scalar-field Dissolve. It uses 6,012 VM
words, 170 of 256 persistent globals, and 51,511 source bytes.

Routed transition bodies remain isolated in generated helper functions. An
inlined artifact failed on hardware when snapshot state and a later scalar
field coexisted; helper isolation activated reliably, preserved output, and
reduced selected source. This is a firmware-safety boundary, not cosmetic code
organization.

## What did not become a production optimization

### Exact transformed-coordinate replay

The diagnostic candidate caches transformed X/Y for static 2D routed Scenes.
It matched Fast and Precise output, reused existing planes, and avoided an
estimated 16,600 operations per cached Redline frame. It nevertheless changed
source from 19,435 to 29,360 bytes, bytecode from 11,810 to 16,938 bytes, and
median 2,000-pixel throughput from 3.008 to 2.814 FPS (-6.43%) in both paired
passes. Results at 256 and 1,000 pixels were mixed. Production therefore keeps
direct coordinate evaluation.

### Property-specialized render kernels

Removing generated dispatch branches changed representation but did not produce
a stable pb32 runtime gain. The candidate remains hardware-profile gated. A
smaller artifact or abstract branch count is not reported as faster.

### A 4,000-pixel support promise

Direct 4,000-pixel Redline measured 1.864 median FPS in the final stress probe.
It remains historical evidence only. Generated Show artifact actions enforce
the 2,000-pixel ceiling, and the architecture does not drop the arena to create
an unsupported alternate product contract.

## Closed cumulative ledger

| Step | Slice | Primary measured result |
| ---: | --- | --- |
| 00 | unspecialized Redline reference | 2.358 FPS baseline |
| 01 | #514 resource envelope | no render change |
| 02 | #512 routing/capture specialization | 2.358 -> 2.928 FPS (+24.2%) |
| 03 | #513 frame-invariant hoisting | exact reference to 3.037 FPS (+28.8% cumulative) |
| 04 | #515 three-plane arena | 6,012 words; 0.0% FPS change |
| 05 | #525 shared Motion kernels | source -37.5%, bytecode -37.2%, FPS unchanged |
| 06 | #516 snapshot/live Crossfade | 1.810 -> 3.197 FPS (+76.7%), authored freeze |
| 07 | #517 cache planner | compile-time structure; output unchanged |
| 08 | #518 compatible output reuse | 4.554 -> 8.729 FPS (+91.7%) |
| 09 | #519 scalar fields | 2.161 -> 3.115 FPS (+44.1%) |
| 10 | #520 acceptance Show | 1.000 -> 1.076 exact -> 1.702 snapshot/live FPS |
| 11 | #527 content keys | 2.801 -> 4.480 FPS (+59.9%) |
| 12 | #528 coordinate diagnostic | 3.008 -> 2.814 FPS (-6.43%); disabled |
| 13 | #538 shared generated Effect kernels | 10 members: source -12,552 B, bytecode -6,480 B, globals -54; FPS neutral |

The archived plan retains exact source, bytecode, VM, mean/median, parity, and
restoration details for every line.

### Next-wave measured additions

| Step | Slice | Primary measured result |
| ---: | --- | --- |
| 00 | #532 native operation costs | RGB replay threshold counted at 12.093 us/pixel for one reuse and 3.927 us/pixel long-lived |
| 01 | #531 frame-time attribution | Redline 336.476 ms/frame = 60.353 output + 142.547 Show + 133.576 Pattern work |
| 02 | #536 Restart liveness | 15.07% weighted globals reclaimable, but no over-limit reference crosses below 256; declined |
| 03 | #538 shared generated Effect kernels | 10 members: source -12,552 B, bytecode -6,480 B, globals -54; FPS neutral |
| 04 | #533 authored Freeze at entry | median FPS +45.55% / +46.02% / +46.07% at 256 / 1,000 / 2,000 pixels; zero additional VM words |
| 05 | #534 three-layer coverage composition | 90% coverage median FPS +100.67% / +100.74% / +100.74% at 256 / 1,000 / 2,000 pixels; zero additional VM words |
| 06 | #539 Vignette scalar field | median FPS +26.36% / +26.54% / +26.58% at 256 / 1,000 / 2,000 pixels; zero additional VM words |
| 07 | #542 table-driven Show score | Wipe / Shape / Easing source -85.2% / -74.6% / -86.2%; Controller bytecode -78.9% / -66.6% / -78.5%; runtime neutral |
| 08 | #546 Restart Pattern slots | Property Animation instances 17 -> 8; source -22.56%, bytecode -18.02%; runtime neutral |
| 09 | #540 Pattern field/shading decomposition | five consumers: median FPS +110.19% / +110.67% / +109.87% at 256 / 1,000 / 2,000 pixels |
| 10 | #535 whole-frame Refresh diagnostic | 1,000 ms median FPS +43.40% / +37.88% / +29.32%; periodic capture pacing remained visible |
| 11 | #535 four-slice Rolling Refresh | median FPS +20.09% / +20.19% / +20.20%; maximum pixel age 3 frames; accepted for production |
| 12 | #537 Show output Trails | median FPS cost -35.39% / -36.77% / -37.01%; zero additional VM words; authored visual affordance |

The closed next-wave ledger, including exact fixture and restoration facts,
lives in `docs/plans/archive/show-rendering-next-wave-measurement-ledger.md`.

### Wave-2 measured additions (#554, measurement complete 2026-07-20)

| Step | Slice | Primary measured result |
| ---: | --- | --- |
| 00 | #555 wave-2 baselines | five fixtures at 256/1,000/2,000 px; HSV steady state 191.833 ms/frame at 2,000 px |
| 01 | #556 op-cost round two | native hsv() only 0.374 us/call over native rgb(); function-value rebinding free; ternary beats arithmetic select by ~3.5 us |
| 02 | #569 run-length packed routing | Pattern Prism source -34.3%, Controller bytecode -43.1%; identical table contents; capacity axis |
| 03 | #557 steady-state direct color sinks | median FPS +68.83% / +69.61% / +68.60% at 256/1,000/2,000 px on the HSV steady-state fixture; ineligible fixtures byte-identical; named ~0.1x16.16-LSB Precise/hardware conversion divergence on steady HSV frames |
| 04 | #558 color-effect coefficient hoisting | effect-tax fixture +13.62/+12.87/+13.48% median FPS; exact; 13/19 stock Shows byte-identical |
| 05 | #562 capture-prologue assignment reduction | mirror fixture +1.0-1.1% at all sizes; exact branch-free mirror coefficients; shouldMaterialize cost rule |
| 06 | #561 pixelCount constant-write hoisting | hsv-steady +2.1%, acceptance +1.4-1.6% with bytecode -432 B; exact |
| 07 | #566 inline pure call-subtree hoisting | exact extension of #513 to inline time()/wave() subtrees; fixture-set result neutral (audience under-represented); 7 stock Shows gain hoists |
| 08 | #564 fixed-point peepholes | **recorded negative**: floor/frac price below a same-shape multiply (#556), and fw 3.67 bitwise ops integer-coerce operands so the raw-bits identities are invalid |
| 09 | #559 per-member HSV capture chain | conversion 39.6 -> 22.9 us/call (probe); effect-tax +10.7-11.2%, acceptance +6.2-6.6%, mirror +3.2% median FPS; bit-exact |
| 10 | #560 Mirror within-frame reuse | **recorded negative**: render-order kill-test PASSED (ascending, total coverage), but a mirror reversal is a permutation with no within-frame redundancy for single placements; twin stacks are the only paying shape (owner-declined) |
| 11 | #568 trig-layout packed routing (diagnostic) | **priced verdict, no build**: chain arithmetic favors a table (~14 us/pixel) but fw 3.67 integer-coercing bit ops cap single-plane packing at 6-bit coordinates; profile-dependent, quantization-limited |
| 12 | #563 zone-coordinate strength reduction | **recorded negative**: modulo is free vs a multiply, floor-feeding reciprocals step whole rows, outer reciprocals err ~WIDTH/2 LSBs (exact only for power-of-two divisors) |
| 13 | #571 placement-prologue rebinding elimination | effect-tax +14.27/+14.29/+14.91% median FPS at 256/1,000/2,000 px, bytecode -800 B; prologue-free fixtures byte-identical; fixes the #562 transition-pair mirror divergence; exact |
| 14 | #572 function-valued sink rebinding | **recorded negative**: the extra user-call hop (~1.9-3.4 us) exceeds the ~1.5 us flag branch it removes; hsv-steady -3.82/-3.92/-3.91% median FPS, +116 B; flag build stays default, `functionValuedSinkRebinding: true` reproduces the measurement |
| 15 | #573 packed-routing re-pricing | run-length pricing (128 + 80 B/loop-run + 20 B/short element, measured) with a 4,096-word RAM cap and a 13-comparison depth gate; deep 2,000 px interleave newly qualifies at +197% FPS (3.361 -> 10.0) and -371 ms activation; shallow contiguous splits stay branches (measured -34% packed); stock catalogue byte-identical |
| 16 | #565 tiny pure helper inlining | 10/13 Redline inside() sites inlined (call boundary 1.9-3.4 us each, #532); redline @2,000 px 3.030 -> 3.162 FPS (+4.4%, within the fixture's phrase-cycling noise envelope; direction consistent); other fixtures byte-identical; exact by construction |

Wave-2 slice ledgers with full axes live as comments on #554.

### Wave-4 measured additions (epic #903)

Wave 4 targets the generated code itself; the advisory with the full
candidate map is `docs/plans/controller-performance-wave4-advisory.md`.

| Step | Slice | Primary measured result |
| ---: | --- | --- |
| 00 | #904 identity-blend fold | probe: one emitted blend line 3.441 us/pixel over direct assignment, the full three-channel block with dead inits 13.898 us/pixel (17.2x mul); hand-fold ladder: five-pattern acceptance **+8.45/+6.92/+5.50%** median FPS at 256/1,000/2,000 px, hsv-steady and effect-tax neutral (their blends sit on the #557-bypassed capture path); emitter takes the direct form for a stack's statically opaque unmasked **first contributor** (accumulator provably zero, so the fold is exact in 16.16 and in Fast float64 including non-finite values) and bares dead accumulator initializers; later opaque layers keep the blend outside the endpoint context because Fast float64 must propagate a non-finite lower-layer accumulator through `t * 0`; every blend the ladder measured was a first-contributor site, so the restriction costs none of the measured win; `identityBlendFold: false` reproduces pre-fold emission for vintages |

| 01 | #905 per-pixel dedupe | hand-dedup ladder on a transition-dominated fixture (1 s holds, 8 s live/live crossfades, ~84% of the loop in the arm): **+4.49/+4.40/+4.57%** median FPS at 256/1,000/2,000 px, bytecode -368 B, steady phases unchanged; emitter now shares one route decode and coordinate pair across a same-domain transition (identical zone ranges give an identical local-index mapping) and writes member RGB straight to the wrapper globals for a single direct placement (the #904-folded accumulators were pure pass-throughs); scoping fact recorded for future generated-code rewriting: mangled names are REUSED across generated helpers, so renames must stay inside the enclosing block; `perPixelDedup: false` reproduces the dual-decode emission |
| 02 | #907 emission idiom sweep | static verdicts via the #906 oracle plus paired hardware probes; **shipped**: shared-HSV-chain lane scoping — each sector computes only its own q/t lane, matching the #559 specialized shape (eager form measured 6.660 us/call slower; +44 source bytes, the #559-style bytes-for-FPS trade; `hsvSharedChainLaneScoping: false` for vintages). **Recorded negatives**: hue-wrap `frac(h)` substitution is NOT exact — fw 3.67 `frac` truncates toward zero while `h - floor(h)` floors, diverging for negative hue, and the wrap sites cannot prove h >= 0; posterize endpoint branch wins -5.856 us/iter on identity frames but pays the ~1.5 us branch on active frames, and stock content runs effects active — declined as unconditional emission, remains a candidate gated on animated amounts; literal-vs-global is a static tie. **Method rule**: the static oracle misprices control flow pessimistically (the branch was a +4-word static loser and a runtime winner) — a static loss never kills a family without a runtime probe |

| 03 | #909 array-helper pricing | verified paired probes (512-element passes, witness slots proven identical between forms): for-loop write fill 7.320 us/element vs `mutate` 0.684 (**10.7x**), for-loop read accumulate 5.800 vs `forEach` 1.280 (**4.5x**), native `sum()` below measurement noise — far beyond the forum's "2-3x"; callbacks see globals and own parameters only (no closures), and helpers always visit every element. Stage-2 verdict: no eligible per-frame generated `for` loops remain in current emission (the #717 scheduler scan is an early-exit `while`; table init runs once at activation), so no lowering ships. Stage-3 verdict: the pricing justifies a mutate-fill buffered-frame design spike, folded into #718's plane planning |

| 04 | #908 packed-routing re-price | **verified already complete**: #717 slice 1 made the chooser the emitter, so the packed byte estimate prices exactly what `emitIntegerDataTable` will produce (literal ~4.25 B/element, pinned in showDataTableEmission.test.ts) — the 20 B/element assumption the #715 doc flagged was consumed before this issue was picked up. The 13-comparison depth gate is a runtime break-even (17.3 us/pixel packed overhead, issue573-depth-negative.json) that literal pricing does not move. Catalogue census: 36 stock Shows route by coordinate predicates, 4 by range branches with max 3-4 comparisons/pixel — no decision can flip at any byte price; zero packed selections today, and the deep-interleave shape that pays (+197%, #573) remains correctly gated |
| 05 | #911 preview-stream tax | **closed question, no product change**: the device streams type-5 preview frames only to a client that sends `sendUpdates: true` — zero frames observed on closed, idle, and updates-off sockets — and the IDE never requests them, so its connections are already quiet by default. Measured tax with a compute-bound Pattern (Caustics): ~0.36% median FPS at 256 px (8.152 -> 8.123) and ~0.29% at 2,000 px with the stream on; an idle extra socket costs ~0.2%; rate-capped and wire-floor-bound states measure 0.00% (both ceilings hide any delta — the whole-frame model's dilution warning in action). Stream cadence: throttled to ~25 frames/s at the firmware cap, one per render frame below it (issue911-preview-tax.json) |

| 06 | #718 fourth plane / packed RGB | **resolved: keep three planes** — the contention census across all 40 stock Shows and five fixtures (45 artifacts, 8 plane candidates) found zero contention-class rejections; the lifetime-aware planner time-shares the arena for everything shipped (the acceptance Show's snapshot and scalar field occupy disjoint lifetimes). The FPS ladder is moot by the issue's own non-synthetic requirement. `issue718.test.ts` asserts the zero as a living falsifier: a real collision fails the suite with the evidence already collected, and only that reopens the question. Premises recorded for a reopening: packed RGB escapes #564 via the #715 arithmetic encoding (8-bit snapshot fits one plane, display-equivalent), and #909's mutate pricing makes fills ~10x cheaper (`docs/plans/issue-718-plane-contention-results.md`) |
| 07 | #910 free x for 1D Shows | **recorded no-build**: the eligibility census across all 40 stock Shows finds zero artifacts compiled to `render(index)` and zero generated divisions by pixelCount — the catalogue is entirely 2D, and zone-local coordinates derive from zone-local indices where the firmware's global `x = index / pixelCount` would be wrong, so the compiler has nothing to substitute. Ben's measured +15% (forum 1251) stands as authored-Pattern advice and now lives in the optimization guide; a future 1D full-stage Show class would make this a one-line emission change with the parity gate the issue specified |
| 08 | #914 member auto-passes | **recorded decline, both passes**: detection rules for index tabling and lazy position memoization built and ground-truthed against the pre-optimization hand-move sources (recall) and shipped versions (precision), with three classifier extensions forced by real code (kill-position copy-prop, out-var classification, interprocedural purity). Paired hardware killed the naive opportunity: single-`atan2` memos lost 12.9/5.5%, an 11x-mul op-chain memo lost 7.3% — the lazy read path runs ~7x mul, so only exp/pow-class subtrees pay, and per-frame coordinate transforms (`rotate()` in beforeRender) disqualify position caching outright. After #916, the census has **zero** eligible memo or tabling sites: IridescentFibers' former table site measured **+5.3%** bit-exact and shipped as a direct Pattern edit, not a pass. The 18 Patterns outside the tool's modeled subset (function tables, particle handles, arrow callbacks) remain unanalyzed. The decline rests on the measured economics, not the count: only exp/pow-class position-pure subtrees clear the ~7x-mul read path, and the strongest single-call site ever measured bought +2.5% — a qualifying site anywhere would warrant a Kishimisu-style hand edit, never a compiler pass. Census artifact and archived tool per `docs/plans/issue-914-member-pass-spike-results.md`; re-running it is a deliberate step in any future build proposal. Breakeven model and exactness traps added to the optimization guide |

Raw wave-4 slice data: `test/perf-harness/issue904-blend-probe.json`,
`issue904-fold-ladder.json`, `issue905-dedup-ladder.json`,
`issue907-static-verdicts.md`, `issue907-idiom-probe.json`,
`issue909-array-probe.json`, `issue911-preview-tax.json`,
`issue914-eligibility-census.json`, and `issue914-transform-pairs.json`.

### Wave-5 measured additions (epic #923)

Wave 5 targets the installed base (at most ~500 px, native serial, no
expander); the advisory with the candidate map and scope decision is
`docs/plans/controller-performance-wave5-advisory.md`. Every row is
measured at 256 and 500 px on the bench pb32 (firmware 3.67, declared
profile absent, stamped `native-serial (assumed)`).

| Step | Slice | Primary measured result |
| ---: | --- | --- |
| 00 | #924 attribution at 256/500 px | heavy members alone (ZippyZaps, Caustics, Kishimisu) are **95-97% member work**; single-zone Show machinery is ~16 us/pixel (4.1 / 8.2 ms); choreographed Shows with light members are machinery-bound (Redline 36%, aperture-shapes 19%, Portable zones 12-14%, five-Pattern acceptance 62-67%). Cost rows: `i++` loop machinery **2.90 us/iteration**, `i = i + 1` idiom **4.6 us/iteration**, single-use local **1.47 us**. `render` vs `render2D` vs `render3D` trivial dispatch: identical medians at 256/500/2,000 px (8.032/15.348/60.353 ms) - **closed, no build** (`docs/plans/issue-924-attribution-results.md`) |
| 01 | #928 generated frame-constant hoist | census: 286 per-pixel `ceil(sqrt(...))` / `floor(pixelCount * ...)` sites across 35 of 40 stock Shows (133 the plain `pixelCount` form wave 4 never reached, the rest split-position dependent); the pass hoists maximal pure built-in subtrees of per-pixel code whose free identifiers are frame-stable into per-frame globals refreshed at the end of `beforeRender`, and the catalogue census drops to **zero**. Paired ladder (`issue928-hoist-ladder.json`): Portable zones **+3.35 / +3.06%**, aperture-shapes **+1.98 / +1.88%**, zone-layouts stripes-grid **+1.91 / +1.45%** median FPS at 256 / 500 px; bytecode -0.3% to +0.3%; +2 to +11 persistent globals; index-routed Installation Shows byte-identical (literal zone sizes). Fast and Precise checksums identical across all 40 stock Shows; `generatedFrameConstantHoisting: false` reproduces pre-pass emission for vintages |

| 02 | #929 generated wrapper inlining | trivial generated wrappers (pass-through renderCapture, emit, clear, control binders) folded into per-pixel call sites when every argument is a plain name; transition helpers stay verbatim (#520 boundary); byte gate keeps the wrapper form with `wrapperInlining.reason = 'artifact-budget'` when only the inlined form would cross the activation scale; three review rounds hardened the substitution rules (no argument re-read after body writes or completed user calls, self-argument wrappers stay, copied references keep their target). Paired ladder (`issue929-inline-ladder.json`): hsv-steady **+7.49 / +7.58%**, effect-tax **+1.33 / +1.64%** at 256 / 500 px; Redline, Portable zones, and the acceptance Show neutral; census 425 -> 314 emit/clear call sites |
| 03 | #931 member loop rewrites | `i = i + 1` loop updates become `i++` (1.7 us/iteration) and render-reachable loops with a literal or never-written-constant bound (trip <= 16, no control flow, no induction writes, no closure observing the index, 16.16-safe range) unroll with the index as a literal, under an 8 KB growth allowance and a byte-budget fallback (`loopRewrites.reason = 'artifact-byte-budget'`). Paired ladder at 256 px (`issue931-unroll-ladder.json`): IridescentFibers **+6.35%**, NeonSquircles **+9.74%**, PulseLoom **+9.62%**, ShaderShowcase **+4.51%** (unrolled); Kishimisu **+1.42%**, ZippyZaps **+0.85%** (idiom only). Bug found on the bench: the Controller compiler has no comma expression - later loop copies emit one statement per declarator, and an offline device-compiler acceptance test now guards every pass |
| 04 | #930 single-use temporary elimination | **parked after three blocked review rounds** (non-convergence rule): a general forward substitution in generated arms kept sprouting semantic corner cases (argument re-reads, function-scoped `var`, callee positions, array aliases, branch evaluation counts). Measured before parking: hsv-steady +5.99 / +6.14%, effect-tax +1.98% at 256 px, others under 1%, Redline byte-identical (`issue930-temporaries-ladder.json` on the parked branch). Reopen only as the narrow generated-arm shape it was built for |
| 05 | #937 spatial hold-and-lerp (compile option, off by default) | built from the #926 spike at Jon's direction, lerp only, no UI; the final dispatcher renders one stride ahead at every anchor and blends between anchors; eligible only where the dispatcher synthesizes coordinates from the index (4 of 40 stock Shows; the 36 coordinate-routed Portable Shows decline with `spatialHold.reason = 'coordinate-routed'`). Paired ladder at 256 px (`issue937-lerp-ladder.json`, direct sinks off in every row because the latch captures RGB): ZippyZaps **+78.7% / +227.3%** and Caustics **+78.0% / +225.7%** median FPS at x2 / x4; the light hsv-steady member +6.8% / +53.7% over its direct-sink-off baseline, which is itself below the production direct-sink build (54.5 vs 70.8 FPS) — the option pays for heavy members, not light ones. Anchors equal the baseline sample in Fast and Precise; every wrapped artifact carries exactly one native paint |

Raw wave-5 slice data: `test/perf-harness/issue924-attribution.json`,
`issue924-probe-rows.md`, `issue928-hoist-ladder.json`, `issue929-inline-ladder.json`,
`issue931-unroll-ladder.json`, `issue937-lerp-ladder.json`.

## General rules established by the evidence

1. Remove dead work before caching it.
2. Count renderer evaluations before counting arithmetic operations.
3. Cache an expensive stable producer, not cheap coordinate math.
4. Treat array traffic and generated code shape as real costs.
5. Separate exact sharing from authored snapshots and other approximations.
6. Keep memory, bytecode, globals, stack, and FPS as independent budgets.
7. Use one arena with explicit lifetimes; permanent one-Scene arrays are still
   permanent allocations.
8. Preserve a direct counterfactual and require paired Controller evidence.
9. Report negative results so a later agent needs a materially different
   premise before repeating them.
10. Represent repeated choreography as data selecting interned machinery; do
    not duplicate machinery to encode time.

## Closed next-wave opportunity map

An independent Fable xhigh and Codex design round evaluated the next runway.
The shared brief, independent proposals, comparison, and final recommendation
live in `docs/collaboration/show-rendering-next-opportunities/`.

The round resolved the recommended sequence as follows:

1. native operation-cost profiling and fixture-level hardware ablation are complete;
2. Freeze and four-slice Refresh are shipped authored policies;
3. exact three-layer coverage-directed composition is shipped, while unsupported depths retain ordinary composition;
4. Vignette is the first qualified scalar-field Effect and the Pattern field/shading contract has a measured diagnostic;
5. Trails is shipped with its qualified 35-37% native-serial FPS cost;
6. Restart global liveness was rejected by its gate, while shared generated kernels and exact Restart lifetime slots shipped as capacity work;
7. direct emission, generalized state vectors, packed routing/RGB, and spatial hold remain unapproved ideas that require a materially new falsifier.

The program has no remaining implementation slice. The final design preserves
visual contracts, kill-tests, benchmark gates, and deferred ideas as evidence;
none is active scope for this closed program.

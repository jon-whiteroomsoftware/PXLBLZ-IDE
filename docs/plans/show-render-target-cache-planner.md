# Show render target and cache planner

Status: proposed technical design
Date: 2026-07-17

PXLBLZ-IDE will make 2,000 pixels the supported output ceiling for compiled
Shows and reserve one full-resolution, three-plane render target inside every
generated Show artifact. The Show compiler will use that fixed memory arena to
materialize RGB output, transformed coordinates, or scalar fields when reuse
costs less than recomputation. Ordinary composition will continue to evaluate
at most one live Pattern per output pixel; expensive live/live policies remain
explicit rather than hiding a second renderer behind friendly UI.

This design turns spare Pixelblaze Pattern memory into a predictable compiler
resource. It does not require Patterns to know about Scenes, Zones, Effects, or
the render target. The compiler owns allocation, capture, replay, invalidation,
and cost disclosure while the authored Show remains choreography.

## Product contract

The supported compiled-Show envelope is:

- at most 2,000 output pixels;
- one compiler-owned render target with three 2,000-element planes;
- no more than 10,240 total Pixelblaze VM array words, including array
  overhead, member Pattern arrays, routing tables, plan tables, and generated
  caches;
- no more than 256 persistent global variables after Pattern isolation and Show
  code generation;
- no more than 256 simultaneously live stack variables along any runtime call
  path the compiler can prove;
- no more than the measured 68,384-byte Controller activation budget;
- one live Pattern renderer per output pixel in ordinary steady state and in
  recommended transitions;
- explicit disclosure whenever an authored policy requires more than one
  renderer per pixel.

An Installation contract may not exceed 2,000 saved output pixels. A Portable
2D contract remains resolution-independent as authored, but preview, export,
Run, and Save enforce a 2,000-pixel runtime ceiling. Sending a Portable Show to
a Controller configured above that ceiling is blocked with an actionable
diagnostic rather than allocating undersized arrays or silently reducing the
output.

Existing Shows above 2,000 pixels remain readable and editable. Generated
inspection remains available, but artifact actions are blocked until the output
contract is reduced to the supported envelope. Redline now exercises the exact
2,000-pixel ceiling as the built-in production reference. Its earlier 4,000-pixel
measurements remain historical engineering evidence, not an active fixture.

Show duration is not part of this limit. A 30-second and a 60-second Show with
the same active complexity have the same per-frame cost; duration primarily
changes scheduler and plan-table size.

## Why 2,000 pixels

Pixelblaze V3 documents 10,240 array elements per Pattern. Firmware 3.67 reports
the same pool through its live `mem` status value, and direct activation probes
show four words of overhead for each additional array. A three-plane render
target therefore reserves:

```text
renderTargetWords(N) = 3 * (N + 4)
renderTargetWords(2000) = 6,012
remainingWords(2000) = 10,240 - 6,012 = 4,228
```

The residual 4,228 words are a whole-Show budget, not a per-Pattern allowance.
Five procedural Patterns with scalar state fit comfortably; a single Pattern
that allocates several pixel-sized arrays may not. The compiler must prove the
complete allocation before it promises a runnable artifact.

The render target is uncompressed 16.16 storage. Each plane can hold one color
channel or one arbitrary scalar field without packing, quantization, or bitwise
decode cost. Packed RGB remains a future representation candidate when a plan
needs another simultaneous pixel-sized cache, but it is not required for the
base contract.

## Hardware evidence

The design rests on Controller measurements rather than emulator timing alone.
The emulator remains useful for operation counts and deterministic visual
comparison; Controller FPS is authoritative for native operation and output
cost.

### VM memory

The exact 4,000-pixel Redline artifact on a pb32 Controller running firmware
3.67 used 88 VM words and left 10,152 free. Adding one unused 4,000-element
array consumed 4,004 more words; adding a second consumed another 4,004. This
confirms both the live pool and per-array overhead used by the budget formula.

### RGB render-target operations at 2,000 pixels

The following sources were activated sequentially on the same Controller and
restored afterward:

| Operation | Mean FPS | Mean frame time |
| --- | ---: | ---: |
| Trivial `rgb(0, 0, 0)` output | 16.57 | 60.35 ms |
| Direct gradient arithmetic | 16.57 | 60.35 ms |
| Three array reads and RGB output | 16.57 | 60.33 ms |
| Three writes, three reads, and RGB output | 16.57 | 60.35 ms |
| Three cached reads plus outgoing/incoming blend arithmetic | 16.57 | 60.35 ms |

On this serial LED configuration, uncompressed RGB capture, replay, and simple
compositing remain under the physical output floor. Faster APA102 output or
parallel expanders may expose costs hidden here, so the hardware matrix must
retain multiple output profiles before automatic materialization becomes a
universal default.

### Redline compiler counterfactuals at 4,000 pixels

| Candidate | Mean FPS | Change from baseline | Visual contract |
| --- | ---: | ---: | --- |
| Current compiled Show | 1.183 | - | exact baseline |
| Frame-invariant Pattern arithmetic hoisted | 1.254 | +6.0% | exact |
| Disjoint physical routing short-circuited | 1.397 | +18.1% | exact |
| Routing and hoisting combined | 1.502 | +27.0% | exact |
| Combined plus active-Scene X/Y cache | 1.551 | +31.1% | exact |
| Separate hero/target Pattern members | 1.367 | +15.6% | intentionally changed |

The exact candidates matched fixed-point frame checksums at nine representative
times across the 60-second score. The two-plane cache improved the combined
candidate by 3.2%; its stronger minimum FPS suggests that cache value grows with
longer stable Scenes and more expensive sample transforms. The larger result is
that exact compiler work should land before caching: memory cannot compensate
for avoidable branches and repeated arithmetic.

## Render-target model

The compiler allocates three global arrays once. The arrays form a render-target
arena whose interpretation changes only at compiler-proven lifetime boundaries:

```text
Pattern member evaluation
        |
        v
sample transform -> captured RGB -> post-color Effects -> transition composite
        |                |                  |                    |
        +----------------+------------------+--------------------+
                         optional materialization
                         into planes 0, 1, and 2
```

A render-target assignment names:

- the value stored in each plane;
- the producer and consumers;
- the cache key and semantic dependencies;
- the first frame in which every element is valid;
- the event that invalidates it;
- whether replay is exact or an authored approximation;
- the expected renderer or operation count avoided;
- the VM words and generated bytecode required.

The initial roles are:

| Role | Planes | Typical lifetime | Primary use |
| --- | ---: | --- | --- |
| `stage-rgb` | 3 | frame, hold, or transition | snapshot crossfade, frozen output, replay |
| `sample-xy` | 2 | Scene or stable Effect epoch | transformed local coordinates |
| `scalar-field` | 1 | map, Scene, or property epoch | mask, distance, region, static texture |
| `previous-rgb` | 3 | one presented frame | feedback and temporal Effects |

Roles may reuse the same planes when their lifetimes do not overlap. A plan that
needs `stage-rgb` and `sample-xy` simultaneously must either choose the more
valuable cache, use residual member-array budget for the smaller cache, select a
packed representation proven on hardware, or keep one value computed. The
planner never assumes more physical planes than the artifact allocates.

## Cache correctness and invalidation

The planner groups dependencies into four lifetimes.

### Map lifetime

Physical ownership, dense local index, and immutable normalized coordinates are
valid until pixel count, map identity, Zone Layout, or routing topology changes.
Installation Shows can often prove these values statically. Portable Shows may
depend on runtime coordinates and must retain the 2,000-pixel ceiling.

### Scene lifetime

Static placement transforms, selected render kernels, and fixed Effect
parameters are valid until the active Scene, placement plan, routing layout, or
relevant property value changes. A Scene cache rebuilds during its first full
pixel traversal and becomes readable only after the last element is written.

### Frame lifetime

Live Pattern RGB depends on member time, controls, private state, sample, and
render-side mutation. It may be reused by equivalent consumers during the same
frame, but it cannot be carried into another frame under an exact policy unless
the compiler proves those dependencies unchanged.

### Snapshot lifetime

An explicitly captured visual may remain valid across a hold or Transition even
while the original Pattern would have continued changing. Snapshot replay is an
authored visual policy, not an exact optimization. The compiler and UI must name
that distinction.

Every cache uses a generation or readiness state. Partially initialized arrays
are never read as complete output. Deterministic seek either reconstructs the
same cache state from Show start or treats the cache as derived state and
rebuilds it before presenting the target frame.

## Transition semantics

Legacy live/live Crossfade evaluates outgoing and incoming Pattern renderers
throughout the transition window and reports cost `2N`. Newly authored
Crossfades now default to snapshot/live:

1. The final complete outgoing composite is captured into `stage-rgb`.
2. The Transition freezes that visual snapshot.
3. The incoming member continues under its authored clock and entry behavior.
4. Each transition pixel reads outgoing RGB, evaluates the incoming member once,
   and blends them.
5. At completion, the target returns to ordinary one-renderer output and the
   arena becomes available for another role.

At a measured 2 FPS and 2,000 pixels, a simple linear cost model separates about
60 ms of output from about 440 ms of Pattern/composition work. Two equally
expensive live renderers would produce roughly 1.06 FPS; snapshot/live keeps the
incoming evaluation near 2 FPS, an estimated 1.88x transition improvement.

The authored model must distinguish:

- **Snapshot crossfade**: recommended; outgoing pixels freeze at the boundary;
  cost `N + R`, where `R` is render-target replay and blend work under the output
  floor in the measured configuration.
- **Live crossfade**: expensive; outgoing and incoming visuals continue; cost
  `2N`.

Existing persisted crossfades retain live/live semantics when the new policy is
absent. Newly created crossfades default to snapshot/live, and the UI makes the
frozen outgoing behavior explicit. Pattern-instance
clock and lifecycle behavior remain separate from whether its pixels are
rendered; the design must not claim exact state continuity for a Pattern whose
`render` side effects are skipped under a snapshot policy.

Fade through color, hard wipes, stable dither, and hard spatial reveals already
retain one renderer per pixel and do not need RGB materialization for cost.
True feather blends and full-blend Motion remain candidates only where a cached
source actually replaces an evaluation.

## Pattern and Effect compatibility

Materialization is Pattern-agnostic at the RGB boundary, but reuse compatibility
depends on where Effects sit relative to that boundary.

| Operation | Cache placement | Reuse rule |
| --- | --- | --- |
| Brightness, Opacity, tint, palette, color grading | before post-color Effect | same member RGB can feed several cheap consumers |
| Translate, rotate, scale, shear, Wrap | after sample transform or through `sample-xy` | different transforms require different cache keys |
| Static mask, glyph, distance, region | scalar field | reuse until geometry or controlling property changes |
| Blur, trails, feedback | previous RGB | enables a new Effect; does not inherently reduce evaluation cost |
| Repeated placement | member RGB or scalar field | exact only when member, sample, clock, controls, and pre-cache Effects match |

Several placements of one Pattern instance already share source and state. The
new planner may also share evaluation output, but only when their requested
samples are equivalent. A placement with a different affine transform is a
different producer unless the compiler deliberately renders a canonical field
and applies a documented resampling policy.

Patterns may mutate private state inside `render`. Exact memoization must still
perform every semantically required renderer call or prove that one result is a
shared call rather than a skipped call. Snapshot policies may skip outgoing
calls because their approximation is explicit. Compiler diagnostics must not
describe a snapshot or decimated result as exact continuation.

## Compiler architecture

The work extends the existing `compileShow()` pipeline:

```text
normalized Show recipe
  -> alpha-renamed Pattern members
  -> resolved routing layouts and routed Scene sequence
  -> interned placement render plans
  -> semantic render plan and dependency analysis       (new)
  -> resource ledger and cache candidates                (new)
  -> render-target plane assignment                       (new)
  -> specialized source emission
  -> generated-symbol compaction
  -> fixed-point artifact and compile summary
```

The semantic render plan is compiler-internal. It does not become another saved
Show representation. It names Pattern evaluation, sample transforms, captured
RGB, post-color Effects, transitions, and output so optimization decisions no
longer depend on matching emitted source text.

### Resource ledger

The ledger counts independently:

- render-target elements and array headers;
- member Pattern array literals and `array()` allocations;
- generated plan, routing, and cache arrays;
- member and generated persistent global variables;
- top-level function declarations and total emitted symbol count;
- parameters and local variables per function, plus the longest statically
  reachable live call path;
- delivered source and measured/estimated bytecode;
- steady and worst renderer evaluations per pixel.

Literal arrays and constant-size `array()` calls are exact. `array(pixelCount)`
uses the contract count. A dynamic allocation whose upper bound cannot be proven
blocks buffered artifact output with an actionable Pattern-level diagnostic.
Preview remains available. The compiler must not rely on live Controller `mem`
telemetry to prove a portable artifact; telemetry is a verification aid, not a
build input.

Global state accumulates across isolated Pattern members. A repeated Pattern
instance receives another private set only when the compiled semantics require
independent state. Stack state behaves differently: local declarations in ten
inactive renderers do not occupy ten simultaneous frames. The stack ledger
therefore reports per-function frame width and the maximum reachable call-path
sum rather than adding every local declaration in the artifact.

Direct, non-recursive call paths are statically provable. Recursion or another
unbounded call shape is reported as unproven and must not be presented as a
guaranteed fit. Top-level function and identifier counts remain a separate
symbol-pressure diagnostic until hardware probes establish whether the firmware
imposes a lower symbol-table ceiling than its documented global-variable and
activation budgets.

The current 2,048-element packed-routing policy becomes one consumer of the
whole-Show ledger rather than an independent allowance. Formula routing remains
preferred when it is cheaper, but spare render-target capacity may be assigned
to routing or coordinates when measured recomputation cost warrants it.

### Exact optimization passes

Caching follows three exact passes that already produced larger Redline gains:

1. Emit mutually exclusive physical ranges as short-circuit routing instead of
   testing every disjoint candidate.
2. Remove unused capture work and specialize identity/sample/output wrappers.
3. Hoist expressions whose dependencies are frame-constant into a generated
   post-`beforeRender` update. Property-specialized render kernels remain a
   measured candidate: smaller source and bytecode did not produce a stable
   pb32 runtime gain, so production retains baseline dispatch.

The final artifact may define any number of internal render functions. One
exported `render`, `render2D`, or `render3D` remains the firmware entry point and
dispatches to the selected internal kernel. Shared Pattern instances retain one
clock, controls, and private state unless authored semantics require independent
instances.

### Cache selection

Each candidate exposes:

```text
benefit = avoidedEvaluations * rendererCost
        + avoidedOperations * operationCost
        - rebuildCost
        - replayCost
        - invalidationCost
```

The first implementation may use conservative structural rules rather than
pretend to know arbitrary Pattern cost. Hardware profiles and emitted operation
counts can refine the model later. A cache remains opt-in or diagnostic-only
until the benchmark matrix shows a repeatable benefit and exact candidates pass
fixed-point equivalence.

## Compile summary and user experience

The compile summary will add a memory and materialization section:

- supported output ceiling and current output count;
- reserved render-target words;
- member, routing, plan, and auxiliary cache words;
- remaining VM words;
- persistent globals used and remaining;
- maximum proven live stack slots and unproven call paths;
- top-level functions and emitted symbol count;
- active render-target role by Scene or Transition;
- exact versus snapshot materializations;
- steady and worst live renderers per pixel;
- estimated or measured evaluations avoided;
- artifact byte budget and warnings.

The ordinary author sees a concise status such as **Buffered crossfade - one
live Pattern per pixel**. Advanced compiled cost exposes the ledger and plan.
Failures name the owner and remedy: reduce output count, replace an array-heavy
Pattern, choose a one-renderer Transition, simplify routing, or remove a cache-
dependent Effect.

The author never manages arrays or cache invalidation. Generated code remains
inspectable and carries stable semantic names through metadata even after
compiler-owned symbol compaction.

## Verification strategy

Every slice follows test-first implementation around pure planner and emitter
logic. Hardware is the final performance authority.

### Automated correctness

- resource-ledger tests for literal, `pixelCount`, generated, and unbounded
  allocations;
- global-variable, function-symbol, function-frame, call-path, and recursive
  call diagnostics;
- 1D and 2D render-target capture/replay equivalence;
- Fast and Precise checksum comparison for every exact optimization;
- Scene, routing, property, Effect, and seek invalidation tests;
- Pattern `render` side-effect fixtures;
- snapshot/live and live/live transition semantics;
- legacy Show migration and artifact-action gates;
- generated source parse, fixed-point emission, and byte-budget checks;
- UI compile-summary and actionable-error coverage.

### Benchmark matrix

Run at 256, 1,000, and 2,000 supported pixels, with Redline as the 2,000-pixel
outer-limit composition:

- trivial output floor;
- three-plane capture, replay, write/read, and blend;
- one, two, and five Pattern instances under hard ownership;
- snapshot/live and live/live crossfade;
- repeated compatible and incompatible placements;
- static and animated affine Effects;
- scalar-field and coordinate-cache candidates;
- an array-heavy member Pattern near the residual budget;
- serial WS281X and at least one faster/parallel output profile when available.

Each result records source bytes, Controller bytecode, VM words, mean/min/max
FPS, frame time, cache rebuild frequency, and visual checksum or declared
snapshot difference. Hardware scripts preserve and restore pixel count, map,
and active Pattern in `finally`.

### Residual-headroom gate

The 6,012-word reservation is exact, but the conclusion that 4,228 residual
words are broadly sufficient is still an inference. Before arena implementation,
the resource-ledger slice runs a no-emission census over repository stock
Patterns, representative saved Shows, array-heavy fixtures, and the five-Pattern
acceptance composition at 2,000 pixels. It records member-array words, persistent
globals, function and identifier symbols, maximum proven stack use, generated
overhead, remaining headroom, and rejection reason for each case.

The census is a decision gate rather than an after-the-fact benchmark. If a
representative supported composition fails solely because of the mandatory
reservation, arena implementation pauses for human review of the invariant,
support envelope, or representation. One successful acceptance Show is not
treated as evidence that the residual budget generalizes.

### Initial library census

The first static census covers 59 bundled Patterns at a 2,000-pixel contract.
Forty-two allocate no arrays. Fifty-five fit beside the mandatory render target;
the four exceptions each allocate three to five full-pixel planes. The median
Pattern declares 10 persistent globals, while the 90th percentile declares 21
and the largest declares 31. Estimated longest direct call paths are much
smaller: median 15 stack slots, 90th percentile 28, and maximum 44.

A compiler-level fixture using the median-size, array-free `ClockworkIris`
Pattern shows how composition scales after member isolation and orchestration:

| Pattern members | Artifact bytes | Persistent globals | Top-level functions | Total top-level symbols | Largest function frame |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 8,625 | 41 | 28 | 69 | 18 |
| 5 | 20,652 | 95 | 64 | 159 | 18 |
| 10 | 40,738 | 185 | 124 | 309 | 18 |

Ten median members consume about 60% of the measured activation-byte budget and
72% of the documented global-variable budget. Their local-frame requirement
does not grow with member count because only the active call path is live. The
total-symbol column is diagnostic rather than a claimed firmware limit.

Redline reinforces the same distinction. Its authored Pattern has 11 persistent
globals and an estimated 23-slot direct call path. The current compiled artifact
contains two isolated members, 42 persistent globals, 23 top-level functions,
an 18-slot largest function frame, and 18,889 artifact bytes. One authored
Pattern identity therefore does not by itself describe compiled resource use;
the planner must measure the emitted artifact.

### Product acceptance fixture

A representative 30-60 second Show must contain five Pattern instances,
multiple Zones and Scenes, ordinary post-color Effects, at least one static
spatial Effect, a snapshot crossfade, a one-renderer spatial transition, and a
continued instance. At 2,000 pixels it must:

- fit the VM and bytecode ledgers;
- evaluate one live renderer per pixel outside explicitly expensive windows;
- preserve deterministic Fast/Precise preview and seek;
- compile, export, Run, and Save through the ordinary artifact path;
- keep compiler composition overhead close to the same active member Patterns
  without Show choreography;
- explain every selected cache and expensive fallback in Advanced compiled
  cost.

No plan can guarantee a specific FPS for arbitrary user Pattern math. The
platform guarantee is bounded composition overhead, honest resource accounting,
and a cheap default path for common multi-Pattern choreography.

## Delivery sequence

The work should land as tracer-bullet slices rather than one compiler rewrite.

1. Establish the 2,000-pixel support envelope and whole-Show VM ledger through
   preview, compile summary, artifact gates, and documentation.
2. Land exact routing short-circuiting, capture specialization, dead-work
   removal, and Redline regression benchmarks.
3. Add frame-invariant analysis and property-specialized internal render kernels
   behind measured bytecode tradeoffs.
4. Allocate the three-plane arena, expose typed read/write roles and resource
   diagnostics, and preserve output without changing transition semantics.
5. Share exact routed Motion transition environments and family kernels so
   large repeated-transition Shows fit before the buffered scheduler changes.
6. Add explicit snapshot/live crossfade end to end while preserving legacy
   live/live behavior.
7. Introduce render-target roles, lifetimes, invalidation, and plane assignment
   as a pure cache planner. **Shipped in #517.**
8. Reuse compatible Pattern output across multiple consumers and placements.
   **Shipped in #518.**
9. Add Scene-lifetime coordinate and scalar-field caching with measured
   selection rules.
10. Validate the five-Pattern acceptance Show, faster output profiles, rollout
   defaults, and as-built documentation.

Each slice must leave generated artifacts runnable and keep direct non-buffered
emission available until the new path clears its correctness and hardware gates.

## Cumulative performance ledger

Every completed slice appends one log line. Controller FPS is the authority;
the ledger separates a slice's incremental change from the accumulated change
since the first 2,000-pixel Redline measurement. A compile-time-only slice keeps
the prior measured result without claiming a new hardware benchmark.

```text
00 start · Redline unspecialized counterfactual · 2.358 FPS · cumulative baseline
01 #514 resource envelope and VM ledger · no render-loop change; 2.358 FPS reference retained · incremental 0% expected, not independently remeasured · cumulative 0%
02 #512 routing and capture specialization · 2.358 -> 2.928 FPS · incremental +24.2% · cumulative +24.2%
03 #513 frame-invariant hoisting · paired 2,000 px mean 2.987 -> 3.037 FPS (3 runs) · incremental +1.7% · cumulative reference 2.358 -> 3.037 FPS, +28.8%
04 #515 physical three-plane arena · 6,012 words allocated; paired 2,000 px median 3.127 -> 3.127 FPS · incremental 0.0% measured · cumulative reference 2.358 -> 3.037 FPS, +28.8% retained
05 #525 shared Motion transition kernels · source 108,033 -> 67,552 B (-37.5%); bytecode 59,202 -> 37,722 B (-36.3%); paired 2,000 px median 0.665 -> 0.665 FPS · incremental 0.0% measured · cumulative Redline reference 2.358 -> 3.037 FPS, +28.8% retained
06 #516 snapshot/live crossfade · paired Redline Machine 2,000 px median 1.810 -> 3.197 FPS · incremental +76.7% (mean +66.2%) · intentional frozen-outgoing visual policy; arena 6,012 words unchanged, +1 persistent global · cumulative exact Redline reference 2.358 -> 3.037 FPS, +28.8% retained
07 #517 lifetime-aware cache planner · paired Redline source unchanged at live/live 15,421 B and snapshot/live 15,627 B; arena 6,012 words and generated render loops unchanged · incremental 0.0% expected, compile-time planner not hardware remeasured · cumulative exact Redline reference 2.358 -> 3.037 FPS, +28.8% retained; snapshot/live median 3.197 FPS retained
08 #518 compatible Pattern-output reuse · paired five-surface 2,000 px median 4.554 -> 8.729 FPS · incremental +91.7% (mean +71.0%); exact 400-sample local output reused across 5 physical Zones, 1,600 Pattern evaluations/frame avoided, arena 6,012 words unchanged · cumulative exact Redline reference 2.358 -> 3.037 FPS, +28.8% retained; snapshot/live median 3.197 FPS retained
09 #519 scalar visual-field caching · paired Redline-derived five-surface 2,000 px median 2.161 -> 3.115 FPS · incremental +44.1% (mean +34.2%); exact coherent-noise field removes 96,000 estimated operations/cached frame, source 23,284 -> 24,311 B, bytecode 12,922 -> 13,274 B, arena 6,012 words unchanged · cumulative exact Redline reference 2.358 -> 3.037 FPS, +28.8% retained; snapshot/live median 3.197 FPS retained
```

Later slices append `10` here and repeat the new line in the #511
coordination update. If a slice intentionally changes the visual contract, its
line names that contract and does not compare it as an exact replacement.

## Issue map

The approved delivery slices are filed under the coordination epic:

- [#511 - Build the 2,000-pixel Show render target and cache planner](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/511)
  coordinates the program and final acceptance.
- [#514 - Enforce the output envelope and whole-Show VM ledger](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/514)
  establishes the resource contract.
- [#512 - Short-circuit physical routing and specialize capture paths](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/512)
  removes exact dead work in the current emitter.
- [#513 - Hoist frame invariants and emit specialized render kernels](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/513)
  removes repeated frame and property work.
- [#515 - Reserve the three-plane Show render-target arena](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/515)
  provides bounded reusable storage after #514.
- [#525 - Deduplicate routed Show transition code](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/525)
  shares exact Motion environments and kernels before scheduler buffering.
- [#516 - Ship snapshot/live crossfade](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/516)
  spends the arena on the first user-visible buffered policy.
- [#517 - Select roles with a lifetime-aware cache planner](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/517)
  generalizes plane assignment and diagnostics.
- [#518 - Reuse compatible Pattern output](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/518)
  shares exact output across placements and consumers.
- [#519 - Cache scalar visual fields](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/519)
  generalizes repeated geometry and Effect work. **Implemented locally; awaiting landing.**
- [#520 - Qualify the five-Pattern acceptance Show](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/520)
  is the human release gate for production defaults.

Implementation progress and the current cumulative performance ledger are
tracked on #511. Individual issue state remains authoritative for ownership and
review readiness.

## Risks and boundaries

### Render-side Pattern state

Skipping a renderer can skip private state mutation. Exact sharing proves that
one semantic evaluation has multiple consumers; snapshot policies explicitly
accept frozen outgoing pixels. The compiler does not infer purity from visual
similarity.

### One-pass firmware execution

Pixelblaze invokes the exported renderer once per physical pixel. Current-frame
materialization cannot assume a GPU-style arbitrary prepass. Plans must use
prior-frame snapshots, ordered/lazy production with proven keys, or an explicit
generated loop whose total work is included in the cost model.

### Permanent arrays

Pixelblaze arrays cannot be freed. The arena is allocated once and reused by
role; auxiliary arrays remain charged for the artifact lifetime even if only one
Scene uses them.

### Faster output hardware

The 2,000-pixel RGB benchmark is wire-bound on the measured serial output.
Parallel and high-speed output can make capture and replay visible. Automatic
selection remains hardware-profile-aware where the Controller exposes enough
configuration, and conservative otherwise.

### Code-size exchange

Specialized render kernels trade dispatch shape and bytecode against branch
removal. The planner keeps VM words and artifact bytes independent, and a
hardware profile must demonstrate a repeatable CPU win before production emits
the candidate. Smaller bytecode alone is insufficient.

### Support-envelope migration

The 2,000-pixel ceiling intentionally narrows the currently compilable
Installation space. The product must explain that contract clearly and retain
the earlier 4,000-pixel measurements as historical engineering evidence rather
than presenting them as a supported production promise.

## Decisions requiring review

The technical direction is coherent, but three product decisions should be
confirmed before their implementation issues become AFK-ready:

1. Existing crossfades without an explicit evaluation policy retain live/live
   semantics; new crossfades default to snapshot/live.
2. Existing Shows above 2,000 pixels remain editable but block artifact actions;
   no unsupported best-effort push bypass is offered in the primary UI.
3. The three-plane reservation is mandatory for every compiled Show, even when
   the current plan chooses direct rendering and never materializes RGB.

## Documentation impact

Implementation updates current truth only as slices ship:

- `CONTEXT.md`: defines the shipped output ceiling, render target, render-target
  plan, snapshot/live Crossfade, and shared Pattern output; add field terms as later slices ship.
- `docs/reference/PXLBLZ Technical Reference.md`: documents the shipped resource
  ledger, arena emission, planner, Crossfade policies, and exact 1D output reuse;
  coordinate/field cache emitters remain future.
- `docs/reference/PXLBLZ Feature Guide.md`: explains the shipped output limit,
  Crossfade choices, output-reuse disclosure, compile-cost disclosure, and
  blocked-artifact remedies.
- archived hardware reports: retain raw Controller evidence and restoration
  details.

This plan remains the durable forward-looking source until the corresponding
reference sections ship.

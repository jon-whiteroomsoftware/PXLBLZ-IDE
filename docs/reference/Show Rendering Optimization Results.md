# Show Rendering Optimization Results

Status: as-built reference
Date: 2026-07-17

## Result

The Show rendering program established a supported 2,000-pixel output envelope,
reserved one reusable three-plane render target, and qualified a set of exact
and authored optimizations on a firmware-3.67 pb32 Controller. The exact
Redline reference improved from 2.358 to 3.037 FPS (+28.8%). Larger fixture-
specific gains came from avoiding whole Pattern evaluations: compatible output
reuse improved 91.7%, content-aware key composition improved 59.9%, and scalar-
field reuse improved 44.1%. Snapshot/live Crossfade intentionally changes the
visual contract and improved Redline's transition median by 76.7%.

The program also established a negative boundary. Exact transformed-coordinate
caching looked profitable in an abstract operation model but slowed 2,000-pixel
Redline by 6.43% while increasing source and bytecode. It remains available as
a diagnostic counterfactual and is disabled in production.

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
| `scalar-field` | 0 | exact reusable Dissolve geometry |
| `previous-rgb` | 0/1/2 | reserved contract; no production producer yet |

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
three Pattern instances. Source fell 37.5% and Controller bytecode 36.3%; FPS
was unchanged. This is a capacity win.

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

### Content-aware luma and chroma keys

A keyed upper layer renders first, derives alpha, and evaluates the lower source
only for holes and feather pixels. Exact cost is `N + U`, where `U` is the
output-dependent uncovered set. A 90%-opaque black-key overlay improved from
2.801 to 4.480 FPS (+59.9%) while reducing source and bytecode and allocating no
new arrays.

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
| 05 | #525 shared Motion kernels | source -37.5%, bytecode -36.3%, FPS unchanged |
| 06 | #516 snapshot/live Crossfade | 1.810 -> 3.197 FPS (+76.7%), authored freeze |
| 07 | #517 cache planner | compile-time structure; output unchanged |
| 08 | #518 compatible output reuse | 4.554 -> 8.729 FPS (+91.7%) |
| 09 | #519 scalar fields | 2.161 -> 3.115 FPS (+44.1%) |
| 10 | #520 acceptance Show | 1.000 -> 1.076 exact -> 1.702 snapshot/live FPS |
| 11 | #527 content keys | 2.801 -> 4.480 FPS (+59.9%) |
| 12 | #528 coordinate diagnostic | 3.008 -> 2.814 FPS (-6.43%); disabled |

The archived plan retains exact source, bytecode, VM, mean/median, parity, and
restoration details for every line.

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

## Further opportunity map

An independent Fable xhigh and Codex design round evaluated the next runway.
The shared brief, independent proposals, comparison, and final recommendation
live in `docs/collaboration/show-rendering-next-opportunities/`.

The recommended order is:

1. native operation-cost profiling and fixture-level hardware ablation;
2. authored Freeze and Refresh clip policies;
3. exact coverage-directed layer composition;
4. scalar-field Effects and a census for Pattern field/coverage/shading roles;
5. `previous-rgb` Trails and Decay as a cheap visual affordance;
6. Restart-instance global liveness and shared generated-kernel capacity work;
7. direct emission, state vectors, packed routing/RGB, or spatial hold only
   after their inexpensive falsifiers identify a real target.

This list is research direction, not approved implementation scope. The final
design records the visual contracts, kill-tests, benchmark gates, deferred
ideas, and decisions that require human review.

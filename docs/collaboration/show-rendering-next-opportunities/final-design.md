# Final design: Show rendering optimization runway

Status: completed design record; conditional follow-ups are not active scope
Date: 2026-07-19

## Governing conclusion

The next large Show-rendering wins should replace whole Pattern evaluations,
not cache cheap arithmetic. The three-plane arena is valuable, but hardware
evidence now defines its boundary:

- exact compatible Pattern-output reuse nearly doubled the five-surface
  fixture;
- an exact scalar field improved its fixture by 44.1%;
- content-aware composition improved a mostly opaque overlay by 59.9%;
- snapshot/live Crossfade improved Redline's transition by 76.7%;
- exact coordinate replay slowed 2,000-pixel Redline by 6.43%.

Memory wins when it removes an expensive renderer or producer. It loses when
array access, indexing, invalidation, and generated code replace work that the
Pixelblaze VM already performs cheaply.

This design ordered the completed research program by evidence and kill cost.
Its conditional follow-ups remain evidence, not authorized implementation or a
new epic.

## Recommended sequence

### Stage 0: make performance attributable

Two short instrumentation spikes come first.

**Native micro-cost profile.** Extend the Controller profiler to measure array,
persistent-global, and local reads/writes; function calls; global branches;
generated HSV conversion; and relevant bit operations. Record results by
firmware and output profile. These values calibrate cache break-even without
pretending they replace paired artifacts.

**Fixture ablation attribution.** Compile Redline, the five-Pattern acceptance
Show, and the output/field/key fixtures with controlled counterfactuals:
constant member bodies, intact routing with capture wrappers removed, intact
composition, full artifact, and trivial output. Pairwise Controller deltas
attribute milliseconds to authored Pattern math, routing/composition,
capture/replay, and the output floor.

Success means the system can explain why #528 lost and can identify which
component dominates each reference fixture. If attribution remains unstable,
future automatic cache selection stays conservative and profile-specific.

### Stage 1: remove whole evaluations

#### Explicit Freeze and Refresh clip policies

Add a clip evaluation policy beside entry behavior:

- **Live** evaluates every presented frame and remains the exact default.
- **Freeze at entry** captures once and replays for the active lifetime.
- **Refresh** captures at an authored cadence and holds pixels between updates.

Freeze reuses the snapshot/live state machine at Scene or clip lifetime. Whole-
frame Refresh should be the first cadence experiment because its semantics and
readiness are simple, even though refresh frames may be bursty. Rolling Refresh
is a separate follow-up that updates a pixel stride each frame; it ships only
if hardware pacing and human visual review accept staggered pixel age.

The policy is an authored approximation. The compile summary names capture,
replay, invalidation, plane conflicts, clock behavior, and whether the selected
plan fell back to Live. It never describes held pixels as exact continuation.

Cheapest falsifier: a hand-written heavy backdrop plus cheap live overlay at
256, 1,000, and 2,000 pixels. Compare Live, Freeze, whole-frame Refresh, and
rolling Refresh before adding saved-model or UI work.

#### Coverage-directed composition

Grow the current keyed pair in exact vertical slices:

1. skip render-pure members during frame intervals where opacity or blend weight
   is exactly zero; bypass blending at exactly one;
2. compose a three-layer keyed stack top-down and stop once accumulated alpha
   reaches one;
3. qualify five-layer stacks and authored analytic coverage.

The exact cost becomes the top layer plus each successively uncovered region.
Feathered pixels still render every source required for the blend. Unknown or
stateful coverage retains ordinary composition. No buffer is required.

Cheapest falsifier: extend the #527 fixture across 0%, 25%, 50%, 90%, and 100%
coverage, then add three and five layers. Report output-dependent renderer
counts with FPS rather than one abstract average.

### Stage 2: make fields an authoring primitive

#### Scalar-field Effect family

Add exact static or property-epoch field producers for vignettes, linear/radial
gradients, regions, glyphs, and masks. Each producer uses the existing scalar
contract, planner, first-frame fill, inline fallback, and checksum gate. Cheap
producers remain inline when calibrated replay cost is higher.

This is both an optimization and a visual affordance: an author can shape a
Pattern spatially without rewriting it.

#### Pattern field/coverage/shading contract

Before designing a public contract, census built-in and representative
community Patterns for a repeated shape:

- expensive scalar geometry, iteration, noise, or distance;
- cheap palette/shading logic;
- optional exact coverage or empty/opaque decision;
- controls that affect the field versus shading only.

If incidence is meaningful, prototype one authored Pattern with a field
producer and two shading functions. Compatible variants share `G` while
retaining independent shading `S`, changing `k(G + S)` toward
`G + kS + capture/replay`. The first contract permits one render-pure scalar
field, explicit dependencies, and stateless shading. Compiler-inferred program
slicing and multi-channel fields remain out of scope.

The same field can support color variants and coverage-directed composition.
A fractal escape/distance value, for example, can color the upper Pattern and
decide where a lower Pattern is visible without recomputing iteration.

### Stage 3: spend the architecture on cheap visuals

#### `previous-rgb` Trails and Decay

Activate the already-declared `previous-rgb` arena role as an ordered Effect.
The next frame blends live RGB with the prior presented frame under an authored
decay rule, then writes the new composite back. This is a new visual, not a
speed claim.

Issue #537 shipped the recommended policy. A required Transition snapshot wins
and suspends/clears Trails with compile disclosure. Browser seeking advances
exact Pattern state but clears feedback until the destination frame. On the
qualified pb32/3.67 native serial profile, Trails costs 35-37% median FPS versus
an arena-matched Live artifact while adding zero VM words. The protocol cannot
identify or switch expander/parallel topology, so no faster-profile result is
claimed.

Cheapest falsifier: one hand-written three-plane feedback Pattern on the
current Controller plus the fastest available output profile. Measure both
frame cost and preview seek time over long Effect lifetimes.

### Stage 4: fit more Pattern instances

#### Restart-instance global liveness reuse

Run a compile-only census before emitter work. Private scalar state for a
Restart-only instance is dead outside its active lifetime and may share slots
with a non-overlapping Restart instance if entry reinitialization is exact.
Continue instances and unproved state remain isolated.

Proceed only if representative Shows reclaim at least 15% of member globals or
move materially below the 256-global ceiling. Verification includes loop entry,
seek, Restart initialization, and mixed Continue/Restart artifacts. This pass
should not change the active render loop.

#### Shared generated kernels

Intern repeated Effect stacks, adaptation wrappers, property-track shapes, and
stack compositors using the same “parameterize structure, preserve instance
state” principle that cut Motion source and bytecode. Select by emitted and
measured bytecode; do not claim FPS without hardware evidence.

Issue #538 shipped the first narrow family: repeated animated Scale Effect
updates share one parameterized body while member state remains independent.
The 2/5/10-member hardware matrix qualified it as a capacity win; broader
Effect stacks, adaptation wrappers, and stack compositors remain future work.

#### Deferred state-vector virtualization

One Pattern body plus indexed instance state can greatly reduce source and
persistent globals but may slow every active scalar access and consumes array
words. Reopen it only if liveness reuse and kernel interning leave real
byte/global blockers. Its falsifier is a 2/5/10-instance array-free Pattern
pair measuring source, bytecode, globals, VM words, and FPS.

## Conditional follow-ups

### Steady-state direct emission

After native call/global costs are known, test bypassing capture/output wrappers
when a phase has no cache consumer, key alpha, brightness adaptation, or color
Effect. This is an exact single-digit-percent candidate. It dies if the paired
2,000-pixel gain is not repeatable or if specialized bodies erase bytecode
headroom.

### Packed irregular-routing lookup

One 2,000-element plane-sized table can encode route/local-index or plan tokens
for highly irregular physical layouts, but permanently costs 2,004 words.
Compare it only against layouts with many disjoint ranges. Contiguous routing
retains the shipped short-circuit arithmetic.

### Packed RGB

Quantized RGB in one 16.16 plane could permit simultaneous roles, but adds
pack/unpack cost and an approximate post-blend contract. Do not prototype until
a plan census finds representative collisions where the existing three planes
block a high-value authored policy.

### Topology-qualified spatial sample-and-hold

A contiguous 1D or proven row-major placement may deliberately reuse one RGB
sample over a block of physical pixels. This could divide renderer calls by the
block width without a framebuffer, but produces visible pixelation and does not
generalize to arbitrary maps. Treat it as a later authored visual/performance
policy, never an inferred optimization.

## Planner and disclosure rules

Every candidate declares:

- stored value and physical role;
- producer, consumers, and semantic dependencies;
- half-open lifetime and invalidators;
- exact or authored-approximate contract;
- setup, refresh, replay, and fallback cost;
- source, bytecode, VM-word, global, and stack exchange;
- conflicts with selected arena roles;
- evidence profile and qualification state.

The author never manages plane numbers. Exact rejection keeps direct behavior.
An authored policy that cannot obtain its required planes falls back only under
an explicitly documented rule and reports that fallback in ordinary compile
status.

Cost reporting must separate axes and evidence levels:

- **measured** Controller FPS/bytecode/VM values;
- **counted** renderer calls, accesses, and emitted bytes;
- **estimated** calibrated costs;
- **authored** visual differences.

Output-dependent composition reports worst and coverage-dependent evaluations.
No generic “optimized” badge substitutes for the actual exchange.

## Benchmark gate

Each research candidate follows the same progression:

1. cheapest hand-written or compile-only kill-test;
2. exact Fast/Precise parity or named approximation captures;
3. paired software artifact/resource report;
4. reversible Controller matrix at 256, 1,000, and 2,000 pixels;
5. faster/parallel output profile when replay or feedback is material;
6. visual review for Freeze/Refresh, Trails, key feathering, or spatial hold;
7. conservative production default only after a repeatable win in its declared
   envelope.

Failed candidates remain in the measurement ledger with their hardware profile
and emitter shape so they are not retried without a materially different
premise.

## Decisions resolved after this design

1. Trails suspends and clears for a required Transition snapshot; preview seeks
   clear feedback only at the destination while preserving exact Pattern state.
2. Rolling Refresh ships only as the reviewed four-slice policy. Whole-frame
   cadence and other slice counts remain diagnostics.
3. The Pattern field/shading census found 7 of 62 credible exact producers; the
   qualified diagnostic and its explicit contract remain the implementation
   basis rather than compiler-inferred slicing.
4. Restart global liveness failed the proposed 15%/eligibility gate and did not
   change the production emitter.

## Explicit non-decisions

- No new implementation epic or ticket set is authorized by this document.
- No candidate changes the 2,000-pixel compiled-Show ceiling.
- No second full RGB framebuffer is assumed.
- No automatic temporal or spatial approximation is inferred from visuals.
- No exact coordinate cache is enabled on the current pb32 profile.
- No FPS number in a proposal becomes a product claim until the Controller
  harness records it.

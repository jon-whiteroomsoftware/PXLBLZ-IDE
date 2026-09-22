# Additive v2 compile-preparation contract

`prepareShowV2ForCompile` resolves authored v2 choreography into the existing
portable Show recipe. Runtime members come from effective Clip uses, including
materialized Group children. A retained Pattern-instance payload, binding or
animation track does not create an executing member by itself.

## Retained animation with no Clip users

Preparation validates the complete persisted record before deriving a transient
Group projection. It validates that projection before applying the compile-only
track filter. Only `instance-control` and `instance-time-scale` tracks whose
runtime has **zero effective Clip uses in the complete Show** are omitted from
that transient context. Persisted payloads, slots, bindings, local/top-level
tracks and keys stay byte-identical and remain available for later edits.

Every effective Clip counts regardless of opacity, evaluation visibility or
start time. The filter never selects a currently active subset or rewrites
activation, values, curves or lifecycle. Execution still begins at the runtime's
first contribution; an animation track alone does not create silent pre-roll.
Preparation retains its existing exact-source requirements for all authored and
materialized Pattern instances. Missing references, malformed timing and
overlapping effective animation owners refuse before filtering can hide them.
No compiler emitter or source dependency policy changes at this seam.

## Held presentation ownership in global sections

Global-section lowering keeps one placement owner for each contiguous run of
equal held View, presentation, blink and Effects. It uses the existing normalized,
canonical `placementPresentationSignature`; opacity, transform and aperture do
not establish a new presentation cache. A presentation that recurs after another
run starts a new owner. Layout and property-derived boundaries inside an unchanged
run link later sections to that run's root, preserving Freeze/Strobe cadence and
cached images.

A single-run Clip retains its existing placement IDs, logical links and emitted
bytes. Divergent run roots and all their descendant IDs are reserved against the
complete effective Clip placement domain before emission. Collision suffixes are
deterministic. One Clip/section identity map drives both placement emission and
Clip-property target projection; it never changes persisted IDs or runtime IDs.
Separate presentation owners still share one Pattern runtime/private state, and
only authored true-entry Restart events reset that state.

Participant Transition lowering and legacy logical-placement validation are
unchanged. Global whole-output contributions retain their existing endpoints and
property curve projection. This adapter does not widen existing Strobe eligibility
or Freeze overlap capacity. Supported cases are admitted through public
preparation before delivered-output assertions; unsupported independent preimages
cannot establish a ready-to-refused adapter regression.

## Evidence

[Preparation tests](../../../src/engine/showUnusedInstanceTrackPreparationV2.test.ts)
reopen both the Show and delivered `.epe`, compile ordinary unused instances and
orphaned Group default animation, and compare Fast/Fidelity output against an
independently authored record with no unconsumed animation. The represented
runtime cast contains only effective Clip users; compiler-owned empty routing
members remain outside that product cast. Complete persisted graphs stay exact.

An invisible future-use fixture shares the same first contribution and animation
schedule with its visible oracle. Their control/clock states remain equal. Its
prepared recipe and reopened source digests match an independently run `dc9d3735`
public-adapter baseline; deliberate future compiler changes must requalify those
fixture digests. Invalid persisted and materialized-owner partitions still refuse.
The five scoped semantic faults cover bypassed filtering, retained unused
time-scale tracks, visibility/current-time filtering and invalid-preimage
laundering. Group replacement remains a separate edit owner.

[Held presentation tests](../../../src/engine/showHeldAppearancePreparationV2.test.ts)
compare actual reopened native EPE Fast/Precise frames and nonempty exported state
with independently authored adjacent Clips sharing one runtime. They cover
Freeze/Strobe interior boundaries, recurring presentations, held Effect/mode
changes, nonlinear Clip animation, materialized held Groups, whole-output windows
and placement/property identity collisions. Uniform and participant Transition
recipe/source/EPE digests remain exact against the `f3db7122` public adapter.
Sequential replay and fresh cold reopening do not prove snapshot restore. The
[checkpoint reproduction](../evidence/issue-1038-held-appearance/snapshot-reproduction.md)
records a pre-existing `getRuntimeState` ReferenceError on both independently
authored and byte-identical formerly admitted sources; checkpoint repair is
separate integration work.

## Property-track activation beside a participant Transition

A Clip- or instance-targeted Property track whose activation is not exactly
`[0, showEndMs)` lowers into derived compiler sections, with or without a
participant-scope Transition. Layout split-position and Show repeat-scale targets
keep their own scalar channels and never take part in this sectioning.

Section boundaries in the participant route are Show start and end, every
non-Layout, non-repeat track's activation edges, and held appearance key times
after the first. Layout occurrence starts deliberately are **not** boundaries:
routing keeps its existing global recipe. A record whose Clip and instance
tracks all cover the whole Show therefore has exactly one section and keeps the
single-section emission and generated bytes it had before.

Per intersected section the owner clips the activation to the section, retains
keys and `curveSegment` descriptors exactly under half-open evaluation (the
right key owns the boundary), holds first and last values outside the key range
but inside activation, and emits nothing for a section the activation does not
intersect. A track that a Clip target does not reach in a section is omitted
there. A shared instance track maps once per section, not once per consuming
Clip. Transient section track and keyframe identities stay collision-safe and
never rewrite persisted identities.

Each participant Transition rides inside the single section that owns its whole
window, because the legacy composition lowerer requires both participant
placements in one derived Scene. When a section boundary would fall at or inside
a participant Transition window `[outgoing end, incoming start]`, preparation
refuses `unsupported-transition-property-track` and names the Transition and its
window. That refusal is the one shape the existing compiler cannot represent:
placing the boundary at the window edge instead would move the authored
activation, which §6 forbids. Splitting a participant Transition across derived
Scenes remains outside this owner and outside #1038.

The two former consequences are resolved. Global Insert Time at `p = 0` now
prepares: the full-Show activation it shifts off zero becomes a two-section
lowering whose first section is the new blank leading time. A positive ordinary
Transition beside materialized Group instance-control animation also prepares,
with the Group occurrences' activations supplying the section boundaries.

### Evidence

[Section activation tests](../../../src/engine/showSectionActivationPreparationV2.test.ts)
compare reopened `.epe` frames and exported state, in Fast and Precise, against
independently authored legacy records whose Scene-scoped tracks express the same
activation: an instance-control track, a Clip-targeted track, an activation
clipped across a boundary another track introduces, a shared instance track
consumed by two Clips in different sections, and both refusal partitions. A
retained `curveSegment` case additionally measures the kernel against the v2
evaluator and against the re-normalized two-point restatement §6 forbids
(0.5375 versus 0.4625 at the probe), because the legacy Scene-scoped keyframe
has no retained-curve descriptor and cannot express that interval.
`src/store/showV2IntegratedInsertSequence.test.ts` drives the `p = 0` partition
through real admission, and
`src/store/showV2IntegratedGroupHoldSequence.test.ts` runs the §4
shared-animation conflict with its internal Group Transition present.

## Whole-output Transitions at time zero, and lowering as a closed net

A whole-output Transition attaches after the derived section that ends at its
start. At `startMs = 0` no section can end there, because the predecessor is not
an authored section at all: it is the compiler-owned Empty, the same black
source that already renders the empty side of every mid-Show one-sided boundary.
Preparation emits that Empty as an explicit zero-duration hold ahead of the
derived scenes and attaches the boundary after it, rather than searching for a
predecessor that by definition does not exist. Section derivation, placement
identity and track splitting are unchanged; the hold carries no Clips, and its
scene identity is transient, minted inside lowering and never persisted. To the
user this is a Show that opens by fading in from black, which the v1 pipeline
compiles today.

`prepareShowV2ForCompile` refuses; it does not throw. Any record that domain
validation admits but lowering cannot represent returns a typed refusal naming
the offending path, whatever produced the record. A lowering error escaping as
an exception is a fail-closed violation independent of any one shape: the caller
cannot distinguish it from a crash, and a refusal the editor can render is the
only outcome the compile seam is allowed to produce.

### Evidence

[Boundary conversion tests](../../../src/engine/showV2BoundaryConversion.test.ts)
carry the time-zero case end to end — a v1 Show with a zero-duration opening
Scene, an empty Zone and a boundary crossfade converts, validates, round-trips
through the codec, prepares `ready`, and compiles to bytes identical to v1's,
with frame and exported-state parity at sampled times in both Fast and Precise.

The refusal net itself is unpinned, and deliberately so stated rather than
claimed: the time-zero boundary was the only shape known to reach a lowering
throw, and this slice removes it. The remaining throws sit behind typed
refusals that already reject the same conditions earlier, so no record is
currently known to exercise the net. It is a backstop against a future
lowering path, not a tested route, and the next slice that finds a reachable
shape should pin it.

### Converted boundaries promote only when the lowering would refuse them

The Property owner and the Layout occurrence owner promote participant-scope
converted Scene-boundary Transitions only when the edited Show would otherwise
be refused by the participant-window rule or by the multiple-Layout-occurrence
rule (more than one occurrence with a participant Transition), the state the
converter itself never produces: every participant-scope Transition promotes
together
or none does, so a Show never holds mixed scopes. A boundary a Clip spans, a
Transition carrying ramps, and every Layer Transition are never eligible; any
of those leaves the edit unpromoted and refused exactly as before, a named
limitation rather than a regression. Nothing ever demotes. A promoted boundary
behaves as the converter's whole-output boundaries do, and since #1068's
provenance keying both keep the converted-boundary repair on Clip edits. See
P1-P9 in
`src/engine/showPropertyEditsV2.test.ts` and P11 in
`src/engine/showBoundaryScopeV2.test.ts`, and the promoted Layout Duplicate
cases in `src/engine/showConvertedBoundaryRepairV2.test.ts`.

## Global Layout switches with participant Transitions

The [Layout/Transition preparation contract](show-v2-layout-transition-preparation.md)
defines the formerly refused multiple-occurrence participant route. Its global
routing switches and occurrence scalar baselines use existing recipe channels
independently of the unchanged placement schedule. Previously admitted routes
and byte parity remain exact; the direct legacy-shaped API fails closed for
this richer prepared-only result.

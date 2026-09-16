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

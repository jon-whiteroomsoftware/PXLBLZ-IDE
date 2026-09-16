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

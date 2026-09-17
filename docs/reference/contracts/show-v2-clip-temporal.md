# Additive v2 Clip temporal transactions

`editShowClipTemporalV2(record, intent)` owns ordinary authored Clip Move, Trim,
Extend, Split and re-placement through existing Transition, Group and repeated
Layout topologies.
The canonical [Scene retirement specification](../../plans/scene-retirement-specification.md)
§§5/6/9 governs. Group children remain definition-local authoring: their materialized
IDs supply validation, identity and sharing inputs, never a persisted edit target.
This pure owner does not adopt state, create history, save, or expose UI.

## One preimage, one candidate

Move translates the full explicit connected component rigidly, preserving all
Transition identities, settings, durations and relative positions. Appearance and
Clip-owned numeric activation/key times follow each moved owner once. An instance
track follows only a sole effective preimage Clip user; Group users count and shared
tracks stay global even when every ordinary user moves. Layouts, Group definitions,
occurrences/holds, Show tracks, Markers and Show End stay fixed.

Trim contains a positive retained interval; Extend contains the old interval.
Incoming duration changes by the leading delta while its outgoing end stays fixed.
Trailing delta ripples connected successors without changing Transition duration.
Both edges transform one private candidate from one preimage. Zero incoming duration
uses Reset: remove that carrier and move its incoming/downstream closure earlier by
its duration. Negative duration, directed cycles, inconsistent common contributor
windows, collisions, availability loss and compiler placement restrictions refuse.
Appearance and numeric retention use the existing held/exact-curve owners; discarded
keys are never restored by extension.

Trim/Extend accept optional `propertyRampProjections` of the existing
`ShowTransitionRampProjectionV2` format only when their leading edge invokes zero
Reset with explicit ramps. Every existing ramp requires a complete caller identity,
end-value and activation-end plan. Missing, extra, wrong-partition, blank or colliding
plans refuse atomically. Freshness includes materialized Group tracks/keys. Projection
happens before carrier removal and the new independent tracks retain their preimage
global times through Reset and any simultaneous trailing ripple. No IDs are generated
for this explicit projection operation.

Split requires an interior safe millisecond and a caller-supplied fresh effective
right Clip ID. Left retains identity, incoming endpoints and Restart. Right shares
its runtime and uses Continue; outgoing participant endpoints, whole-output outgoing
contributors and outgoing Clip-ramp targets retarget right. Clip tracks partition
exactly and use collision-safe existing fresh-piece identities reserved against the
complete effective Group projection. Instance tracks remain one global owner.
Definitions, bindings, payloads, held Group time and unrelated tracks remain exact.

Complete candidate structure, Layout contribution coverage (including pre-roll and
outgoing extension), and shared RL08–RL10 placement validation decide admission.
An adapter refusal is not a compiler limit. No operation extends Show End implicitly.

## Re-placement

`replace-placement` names one ordinary Clip and at least one destination field:
`zoneId`, `layerId` and an optional `startMs`. It preserves the v1 `move_clip`
Layer change that canonical §5 keeps as an obligation. Omitted fields keep their
current value, an already-satisfied destination is unchanged, and any other field,
a blank Zone/Layer identity or a non-safe-integer start refuses `invalid-intent`.

The destination Zone must exist and the destination Layer must belong to it, or
`missing-target` refuses naming both. A Clip that is a participant endpoint of any
Transition refuses `invalid-topology` naming those Transitions when its Zone or
Layer changes: a participant pair joins exact endpoints on one Zone and Layer, so
the counterpart would be detached. Nothing is detached, retargeted or stubbed;
Reset those Transitions explicitly first. A whole-output contributor set is named
by exact time rather than routing, so a whole-output contributor may change its
destination while its Transition record stays exact.

A start change translates the full explicit connected component rigidly through the
same owner as Move, so Clip-owned appearance keys and Clip Property tracks follow
each moved Clip once, a sole-effective-user instance track follows it, and shared
instance, Layout and Show tracks stay fixed. No runtime is created, removed or
rebound, and no Transition duration or setting changes.

One candidate then validates completely: `invalid-result` covers ordinary and
materialized Group occupancy on the destination Layer, where exact half-open
adjacency is accepted; `zone-unavailable` covers the destination Zone across the
Clip's complete contribution interval, including incoming Transition pre-roll and
outgoing extension; `compiler-ineligible` covers the shared RL08–RL10 placement
restrictions. Refusal returns the original record identity with empty affected
collections. A change reports the Clip, and the appearance and Property keys only
a start change actually moved; Layer records are untouched and are not reported.

## Result ownership

Change returns a complete unaliased replacement and every §9 affected collection.
No-op/refusal returns original record identity and empty affected collections.
Transition IDs report implicit window timing changes even if their record fields did
not change. Removed tracks/keys and removed Reset carriers are reported. Nested key
arrays contain one raw persisted ID per affected owner key, preserving repeated
strings; `affectedClipIds` and `affectedTrackIds` identify those owner collections.
No timestamp or persisted source-contribution override is introduced.

## Existing scalar recipe integration

Preparation maps non-held Show repeat-scale tracks through the existing sample
Property recipe channel, independently of generated section boundaries. A shared
pure scalar mapper retains exact descriptors, half-open activation, held first/last
values, original baseline cuts and baseline restoration. Positive baseline carriers
that overlap authored activation refuse; exact adjacency is accepted. The existing
held full-Show path and previously admitted source bytes stay unchanged.

The sample emitter reads retained `curveSegment` with the same original-kernel formula
as routing. Its non-descriptor emitted string path is byte-identical. In-range source
2→4 quadratic descriptors, activation/endpoint holds, restore and loop are qualified
in reopened Fast/Precise artifacts. Jon accepted edit-local refusal for out-of-range repeat animation on 2026-09-16.
Actual hold/restriction/projection edits require complete source values within 1–8,
including retained base/base+delta and exact easing extrema. Boundary 1/8 is admitted;
retained inside samples cannot hide outside source coefficients. Insert Time and
zero Reset projection refuse atomically, preserving original records and empty
affected collections. Existing decode/playback, unaffected and whole-source-shift
edits retain their admission; no global validator range restriction is introduced.
A hold checks the kernel it splits, including its complete retained source. Exact-key,
before-first and after-last holds check the constant held value. Earlier untouched
and later whole-shifted kernels retain existing playback even when their source is
outside that range.
The reusable pure range predicate solves Back and Bezier derivative extrema; it
never samples or approximates endpoint equality.
No emitter range, compiler source domain, RL08–RL10 or schema is widened.

## Consumer evidence

[Temporal tests](../../../src/engine/showClipTemporalV2.test.ts) compare reopened
Fast/Fidelity artifacts against independently authored two-edge and Split choreography,
including state/PRNG, Restart ownership, explicit Reset projections and complete
atomic refusal/result checks. Exact numeric boundary ±1ms checks remain. Separate
repeated Layout fixtures prove fixed routing and availability; their existing Layer
Transition global-scalar preparation refusal is recorded rather than generalized.

[Repeat-scale tests](../../../src/engine/showRepeatScaleLoweringV2.test.ts) and
[sample descriptor tests](../../../src/engine/showCompilerSampleCurve.test.ts) use
independent arithmetic, exact selected displayed8-bit samples and exported state.
Precise arithmetic uses binary-exact125ms steps and a five-Q16 sample bound; this is
not an arbitrary-millisecond exact-state claim. The47-record parity corpus and closed
v1 schema gate remain unchanged. Named semantic faults and qualification are in the
[test design](../evidence/issue-1038-clip-temporal/test-design.json).

[Re-placement tests](../../../src/engine/showClipReplacePlacementV2.test.ts) compare
reopened records and reopened `.epe` Fast/Precise output and state against an
independently authored record already placed at the destination, and prove the
cross-Zone case lights another Zone than the preimage. Each refusal partition
asserts the typed code, original record identity and empty affected collections.

`editShowClipV2` delegates Move/Trim/Extend/Split/re-placement to this pure temporal owner,
including optional explicit `propertyRampProjections` on trim/extend. Identity,
duplicate and Replace branches retain their owners. Full temporal affected
collections pass through unchanged; absent-Zone preimages refuse full availability
validation before edits.

## Contribution Split and scalar restoration qualification

Split partitions Clip-owned animation over the existing complete contribution
interval, including incoming pre-roll on the left and outgoing extension on the
right. It reuses the availability owner's exact participant/whole-output timing;
nominal Clip rectangles are not the animation bounds. A track wholly in the
incoming window remains unchanged; one wholly in the outgoing window retargets
right without losing activation or its source curve.

At the exclusive scalar activation end, a retained baseline ramp or cut starting
at that exact instant supplies both the boundary value and future evaluation.
The adapter adds no later same-time restoration cut to suppress that carrier.
When no baseline starts there, ordinary restoration still applies.

Positive-Transition Clip tracks spanning contribution windows can already refuse
public preparation: participant section-scoped activation evidence or whole-output
legacy-section key bounds. The contribution repair proves reopened public-owner
storage/evaluator preservation and unchanged typed refusal for those preimages;
it does not claim compiled playback for this unadmitted adapter partition.
Previously admitted connected Split artifacts and scalar Fast/Precise output
retain their separate consumer qualification. No lowerer/compiler widening occurs.

Reset projection ramp indices must be nonnegative safe integers smaller than
the selected Transition ramp count. Temporal admission and direct projection
check this before any indexed array access; strings and other malformed numeric
forms refuse atomically. Valid complete reordered plans retain caller identities.

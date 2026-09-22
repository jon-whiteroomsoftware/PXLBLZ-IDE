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
complete effective Group projection. The right half's appearance keys are re-derived from the right Clip ID as `<rightClipId>:appearance:<n>`, numbered from 1 in retained order exactly as conversion mints them; the left half keeps its appearance-key ids with its identity. Instance tracks remain one global owner.
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
`missing-target` refuses naming both. A Clip that is a participant endpoint of one
or more Transitions detaches exactly those participant Transitions when its Zone
or Layer changes through a drag surface, which grants the detach permission on
its re-placement intent, symmetric in `from` and `to`: natively authored and
converted Layer joins disappear and the Clip lands where it was dropped while
the former join partners stay, matching the v1 drag. The agent command
withholds that permission, so the same Zone or Layer change through
`update_clips` refuses `invalid-topology` with no write, matching v1's command
path: reset those Transitions explicitly first. A Transition in that set carrying
`origin: 'converted-boundary-transition'` with one outgoing and one incoming Clip is timeline
structure rather than a gap between placements, so the same transaction also
commits its cut-and-reclaim repair: the boundary record leaves, the downstream
side moves earlier by the boundary duration, Show End shrinks by the same
duration, and the owning Layout occurrence absorbs the reclaim exactly as the
resize path does. An explicit startMs names post-repair coordinates: the
relocated Clip is excluded from that relative shift and lands exactly at the
requested start. The straddle rule does not apply to it, because that rule
exists to stop a shift cutting a Clip across the window end and nothing shifts
a relocated Clip; a destination collision is caught by record validation with
an accurate overlap message. Without an explicit start the Clip keeps its preimage
position and rides the reclaim with the downstream side. A repair the commit
cannot absorb — content spanning the reclaimed window end in its preimage
interval, a window outside one Layout occurrence, or an owning occurrence that
cannot cover the reclaim —
refuses the whole edit atomically as `invalid-result` with the original record
identity. A Transition in that set
that carries `propertyRamps` refuses `unsupported-property-carrier` instead;
Reset it with an explicit projection plan first. Nothing is retargeted or
stubbed. A whole-output contributor set is named by exact time rather than
routing, so a native or ramp-carrying whole-output contributor may change
its destination while its Transition record stays exact. A converted Scene
boundary at whole-output scope is instead attached exactly as its
participant form: with the detach permission it is detached and repaired,
and without it the re-placement refuses `invalid-topology` (#1068).

A start change translates the full explicit connected component rigidly through the
same owner as Move, so Clip-owned appearance keys and Clip Property tracks follow
each moved Clip once, a sole-effective-user instance track follows it, and shared
instance, Layout and Show tracks stay fixed. No runtime is created, removed or
rebound, and no Transition duration or setting changes.

One candidate then validates completely: `invalid-result` covers ordinary and
materialized Group occupancy on the destination Layer, where exact half-open
adjacency is accepted; `zone-unavailable` covers the destination Zone across the
Clip's post-detach contribution interval — detached incoming pre-roll and outgoing
extension leave with their Transitions, so only the Clip's own interval decides;
`compiler-ineligible` covers the shared RL08–RL10 placement
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

## Converted Scene-boundary repair (#1068)

A converted Scene-boundary Transition is a v1 scene edge wearing a
participant-scope junction shape. Growing it like a native crossfade invents
choreography v1 never had, so a meeting-edge edit repairs it inside the same
accepted edit instead. `convertedBoundaryRepairSpecV2` fires only on provenance
plus exact structure: the Transition carries
`origin: 'converted-boundary-transition'` and names exactly one outgoing and one
incoming existing Clip, either as its one participant (on that participant's Zone
and Layer) or as a whole-output window starting at the outgoing Clip's end; it
holds no `propertyRamps`; and the junction is exact
(`from.end + durationMs == to.start`). Scope does not select the path: the #1068
promotion rewrites a participant boundary to whole-output when the lowering needs
it, and the repair must survive that. Native Transitions, converted Layer
Transitions, multi-contributor boundaries and whole-output boundaries still
carrying ramps keep the existing grow/shift behaviour on every entry point; a
participant-scope carrier that still holds ramps reports `ramp-carrier` and
every resize or plan-less reset refuses `unsupported-property-carrier` until an
explicit projection plan clears it.

A Trim/Extend that moves the meeting edge always commits the repair: the Clip is
retimed in preimage coordinates first, then `commitConvertedBoundaryRepairsV2`
drops the boundary record, moves the boundary's downstream side (the
transition-connected closure of the destination plus every Clip at or after the
window end) earlier by the boundary duration, lowers Show End by the same
duration, shortens the Layout occurrence that owns the reclaimed window, moves
every later occurrence earlier by the same duration to keep coverage exact,
shifts converted Scene labels and Group occurrences at or after the window end
earlier by the same duration, and carries Layout-owned tracks of shifted
occurrences along. A Show-scoped `show-repeat-scale` track, which no Clip owns,
is retimed with the loop: its keys after the window move earlier by the boundary
duration, an activation reaching past the window shortens by the same duration,
and a key inside the reclaimed window refuses the edit. A window that is not
inside one occurrence, or an owning
occurrence that cannot cover the reclaim, refuses the whole edit atomically.
Extending into the boundary refuses `invalid-topology` on all four entry points
(temporal Trim/Extend, `resize-leading`, `resize-trailing`); reset the Transition
explicitly first. An edge with no meeting boundary never consults the repair, so
far-edge trims keep the junction and Show End exact.

Time-anchored record inventory for the reclaim. The commit moves exactly the
content whose Show-time anchor moved, mirroring what v1 does to the same window
when its connected resize reclaims it (`resizeShowConnectedClipInShowAtGlobalTime`
shifts the downstream chain and shortens its loop while Scene starts follow):
ordinary Clips at or after the window end shift with their appearance keys,
Clip- and sole-instance-owned Property tracks, and whole-output windows whose
endpoints all move, while participant Transition windows follow their endpoint
Clips with no record of their own. Converted Scene labels
(`origin: 'converted-scene-label'`) at or after the window end shift: they
materialize v1 Scene starts, which the reclaim moves, and the Scene-2 label sits
exactly at the window end on every converted Show. Authored Markers (including
absorbed chapter guides) stay: v1 global guides never move under any edit,
including this reclaim. Group occurrences at or after the window end shift
`startMs` and `trackActivation.startMs` together and re-verify the Layout
association: v1 anchors the same content Scene-locally, so it rides the moving
Scene start, while Holds and definition content stay definition-local. Layout
occurrences keep coverage exact (the owner absorbs with a fixed start, later
ones move rigidly); `incomingTransfer` rides its occurrence start and
`incomingSwitch` provenance is inert. Layout-owned Property tracks of shifted
occurrences move with their occurrence; tracks of the absorbing owner stay, and
a window that no longer fits refuses at validation. Shared-instance tracks,
Pattern instances, Layers, definitions and routing stay: no Show-time anchor
moved. Show-scoped `show-repeat-scale` tracks are retimed with the loop as
described above. A Group occurrence starting exactly at the window end is
unrepresentable while the boundary lives (RL09 forbids unrelated content
starting at or inside a Layer Transition window), so the boundary-inclusive
shift rule mirrors the Clip rule while its equality arm stays uninhabited.

One repair never invents room: a Clip or Group occurrence spanning the reclaimed
window end, a tail
occurrence that cannot absorb the reclaim, a projected activation stranded beyond
the reclaimed Show End, broken Layout availability or compiler placement refuse
the whole edit atomically. The planner mirrors the Clip- and Group-span guards
and the Layout-absorption guard so a gesture the owner would refuse never paints
a preview; ramp carriers, Layout availability and compiler placement stay
owner-side, exactly as for every other connected gesture. `reset-to-cut` with a fitting projection plan projects
first and then commits the same reclaim. Clip deletion commits no repair:
survivors keep exact times and Show End keeps its value; only the orphan boundary
record leaves, with deleted-anchored projections dropped per the transition-route
contract. One accepted edit is one history entry and one save with exact Undo and
Redo. Direct duration edits (`resize-transition`) with a nonzero duration on a
ready boundary keep the generic shift semantics; they are outside the #1068 gaps
and do not reclaim. Setting the duration to 0 routes through `reset-to-cut` and
commits the same cut-and-reclaim as a detach-away resize (a carrier that still
holds Property ramps refuses without an explicit projection plan first). Both
routes report every occurrence the repair touched: shortened plus shifted Layout
occurrences, shifted converted labels, and shifted Group occurrences (temporal
`affectedLayoutOccurrenceIds` / `affectedMarkerIds` /
`affectedGroupOccurrenceIds`, and the same three collections on the transition
result).

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

[Boundary repair tests](../../../src/engine/showConvertedBoundaryRepairV2.test.ts) prove
the v1 counterexample exactly (requested scene-local offset, Cut, shortened
loop), one-edit admission with exact Undo and Redo through
[boundary admission tests](../../../src/store/showV2BoundaryRepairAdmission.test.ts),
non-firing where the junction survives, native/layer grow preservation,
ramp-carrier refusals, deleted-anchor projection drops beside survivor-anchored
retention, and Fast/Fidelity frame equality against both independently authored
choreography and the v1 repair.

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

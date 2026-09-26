# Scene retirement design

> Historical planning record. The current design and worker contract is the
> [Scene-free Show implementation specification](scene-retirement-specification.md).
> Read that document for implementation; superseded proposals and provisional gates
> below are retained solely as provenance.

> **Status: provisional definition for #1033.** This plan records policy already
> accepted in #1032, a concrete record shape for the #1034 tracer, and decisions
> that still require compiler evidence and Jon's acceptance. It describes no
> shipped composition schema or behavior.

## Measured tracer status (2026-09-15)

The additive #1034 tracer now converts and compiles all 47 inventoried records.
The [final evidence and restriction ledger](show-v2-tracer-evidence.md) records
actual supported/refused partitions, resource differences and matrix ownership.
The [accepted authoring decisions](show-v2-accepted-authoring.md) supersede the
historical provisional choices below, especially appearance editing, default
instance sharing and Restart clock. Production v2 adoption remains separate.

The implemented preservation representation adds explicit whole-output contributor
sets for legacy composite boundaries, half-open track activation including incoming
pre-roll/outgoing contribution, Layout transfer easing and timing, and explicit
Group runtime bindings. Default Group bindings share; migration records the private
identities that existing v1 occurrences already own. No compiler internals changed.

## Outcome and limits

The Scene-free record makes the objects authors manipulate the objects the Show
stores. Clips occupy global time on stable Layers and Zones. Visual Transitions
join explicit Clip endpoints. Zone Layout occurrences, Show End, property
tracks, Groups, and Markers own their own time instead of borrowing a hidden
Scene partition.

The provisional schema lives in
[`schemas/show-record-v2.provisional.schema.json`](../../schemas/show-record-v2.provisional.schema.json).
It gives #1034 a concrete input for conversion and lowering experiments. The additive v2 validator/codec uses
that file; production importer, store, editor and compiler paths do not. A successful structural validation against the draft therefore says
nothing about production admission or compiler support.

This definition preserves the existing compiler API and generated hardware
contract as the first approach. If #1034 finds that exact preservation needs a
compiler change, it must report the smallest counterexample, the affected
contract, and bounded alternatives before implementation continues.

## Decision register

The table retains the original experiment questions as design provenance. The
accepted-authoring document and measured evidence above take precedence where
subsequent decisions or implementation supersede them. A tracer choice does not
become product policy through use in a test fixture.

| ID | Status | Decision or question | Authority / next evidence |
| --- | --- | --- | --- |
| A1 | Accepted | Retire persisted authored Scenes, flat cells, Scene-local composition containers, and `afterSceneId` ownership from the normal v2 record. Compiler-derived sections may remain. | #1032, accepted 2026-09-14 |
| A2 | Accepted | Preserve the current Transition interaction model through migration. Do not add one-sided stubs, a general detach-on-move policy, or automatic reattachment. Preserve current source-qualified manual differences rather than broadening them. | #1032; baseline below |
| A3 | Accepted | Show End is the only loop-length authority. Pattern private time and Group-local time remain distinct clocks. | #1032 |
| A4 | Accepted | Explicit edit intent and a preimage produce one atomic candidate. Edit owners perform named cascades; validation checks and never repairs the candidate. | #1032 and current command/admission contracts |
| A5 | Accepted | Layout occurrences own routing intervals, routing values, and incoming transfers. Repeated occurrences may reference the same definition. Property animation alone does not create an occurrence. | #1032 |
| A6 | Accepted | Repeat scale remains separate from Layout split position and Stage Map geometry; it must not require a fictitious Layout change. | #1032 and `CONTEXT.md` “Show sample remapping” |
| A7 | Accepted | Named Markers carry chapters without owning time. A Marker may remain beyond Show End. | #1032 and current marker contract |
| P1 | Provisional for tracer | A v2 Show is one versioned record containing stable definitions plus a `composition` object. `composition.showEndMs` owns the loop; all ordinary authored timeline positions are global safe-integer milliseconds. | Test in #1034; approve at G0 |
| P2 | Provisional for tracer | Layers are Show-wide, Zone-owned records. Rank `0` is the bottom Layer; larger ranks render above it. Empty Layers persist. A Clip stores both `zoneId` and `layerId`. | Test conversion of current per-Scene Layer IDs in #1034; approve at G2 |
| P3 | Experimental for tracer | One ordinary Clip has one stable ID and no persisted logical-segment records. A Clip-owned `appearance.keys` timeline holds complete appearance values at global times; each value holds until the next key. Uniform Clips have one key at Clip start. Contiguous v1 logical segments with divergent appearance map their boundary values to keys on the same Clip. Keys own no duration, instance, Zone, Layer, entry policy, or choreography interval. | F-DIVERGENT is feasible in #1034; Jon still decides the production representation at G3 |
| P4 | Provisional for tracer | A Transition has stable identity and one or more two-sided participant pairs. Each pair joins two Clips on one Zone and Layer. Several simultaneous junctions may remain separate Transition records; a v1 shared boundary may retain several pairs on one record. | Transition matrix in #1034; approve at G1 |
| P5 | Provisional for tracer | Incoming contribution occupies the Transition window before the destination Clip's nominal start. The participant endpoints determine that window; a Transition does not change either Clip's nominal interval. | Matched-time compiler evidence in #1034; approve at G1 |
| P6 | Provisional for tracer | Property tracks store global keyframe time. Placement-owned tracks follow their Clip on move. An instance-owned track follows a moved Clip only while that Clip is the instance's sole user; shared-instance tracks stay at their authored global times. Layout and Show targets stay fixed. | Current owner baseline plus move/trim/split sequences in #1034; approve at G4 |
| P7 | Provisional for tracer | `restart` remains explicit Clip-entry policy. Conversion refuses a restart whose shared instance has another active user at the same entry because restarting shared private state has no unambiguous current meaning. | Shared-state lifecycle matrix in #1034; approve at G5 |
| P8 | Provisional for tracer | Group definitions keep local time and local Layer IDs. Each occurrence maps every used definition Layer to an explicit destination Layer ID. Occurrence Pattern runtimes remain private to that occurrence while preserving sharing inside the definition. | Group materialization and collision matrix in #1034; approve at G6 |
| P9 | Provisional for tracer | A v1 Scene name becomes a dormant-capable Marker at the Scene's global start unless an equivalent Marker already preserves that label and time. Structural Scene IDs and duration fields otherwise retire after their time contribution is projected. | Stock/file inventory in #1034; approve at G7 |
| P10 | Provisional for tracer | The exact repeat-scale owner is `composition.sampleRemap.repeatScale`, with animation targeted by `show-repeat-scale`. | Compiler and routing comparison in #1034; approve at G0/G4 |
| P11 | Provisional for tracer | Show-loop lifecycle is explicit: `continuous` preserves the existing compiler path with `deterministicLoopReset` omitted, while `deterministic-loop` requests the existing reset behavior. Flat Shows and unstamped v1 compositions convert to `continuous`; stamped compositions remain `deterministic-loop`. Clip entry policy remains a separate lifecycle axis. | Exact two-loop lifecycle comparison in #1034; approve at G0/G5 |
| P12 | Provisional for tracer | Clip sampling is explicit: `independent` preserves the current flat single-Zone default that evaluates routed domains independently; `span` and `repeat` retain their current meanings. This is output behavior, not source-origin metadata. | Exact routed-coordinate samples in #1034; approve at G0/G6 |
| P13 | Provisional for tracer | A zero-duration v1 boundary Cut with no visual, property, routing, or referenced-identity payload retires with the hidden Scene boundary after exact timing/output accounting. Carrier payloads first move to their explicit v2 owners. The schema may still admit an explicit v2 Cut for the unresolved direct-authoring/Reset policy; conversion does not synthesize one merely to preserve compiler structure. | Plain/carrier Cut fixtures in #1034; approve at G0/G1 |
| P14 | Provisional source-preservation shape | Every contributing property track owns an explicit half-open activation interval independently of its keyframe range. `activeDurationMs` is positive. Composition tracks use global `activeStartMs`/`activeDurationMs`; Group-definition tracks interpret the same fields in definition-local time. Source contribution bounds define activation; endpoint keys define interpolation and held values only inside it. A source track with no contribution emits no v2 track and receives an explicit retirement report. | Cut and whole-output positive-Transition activation proved in #1034; see measured evidence |

The evidence gates stop dependent production work:

| Gate | Required answer | Evidence owner |
| --- | --- | --- |
| G0 | Jon accepts the final v2 record shape and any field-name changes. | #1033 plan updated from #1034 report |
| G1 | Exact Transition participant scope, same/different-Zone scheduling, incoming contribution, and simultaneous-junction policy. | T01–T16, L07–L09 |
| G2 | Deterministic conversion from Scene-local Layer identity/order/name into stable Zone-owned Layers, including empty Layers and Group shells. | Y01–Y08, G01–G06 |
| G3 | Jon accepts or rejects the experimentally feasible appearance-key representation. #1034 must prove divergent opacity, Transform, and Aperture plus source-defined Effect-track activation without restoring persisted logical segments. Authored-key creation/edit identity remains a product decision. | C08–C12, A01–A10, P01–P06 |
| G4 | Global-storage edit policies for move, trim, split, Insert Time, and property ramps. | A01–A14, E01–E12 |
| G5 | Continue/Restart semantics when one Pattern instance has several Clip users, including gaps and simultaneous users. | S01–S10 |
| G6 | Group Layer binding, materialized collisions, and behavior at a Layout switch. | G01–G12, L10–L12 |
| G7 | Scene-name conversion and chapter-marker visibility do not introduce unwanted authoring clutter or lose intentional labels. | C03–C05, R04 |

## Provisional v2 model

The model separates stable definitions from timed occurrences. Definitions say
what can be used; the composition says when and where it is used.

### Record envelope

`ShowRecordV2` retains Show identity, name, Zones, Zone Layout definitions,
Controller and Stage references, output contract, output Effects, import
provenance, and the update ordering stamp. It replaces the v1 `scenes`, `cells`,
`routingLayouts`, and boundary `transitions` fields with `zoneLayouts` and one
Scene-free `composition`.

The `version: 2` discriminant means composition-record version 2. It must not be
confused with references to the repository's “V2 editor,” which name the current
application lineage rather than this schema.

### Identity, ownership, time, and deletion

| Entity | Stable identity | Time | Owner / references | Deletion rule |
| --- | --- | --- | --- | --- |
| Show | `ShowRecordV2.id` | `composition.showEndMs` bounds one loop under the explicit `executionModel` | Owns every entity in the record | Existing store/delete admission remains authoritative |
| Zone | `zone.id` | None | Show-owned semantic output subset | Refuse while any Layer, Clip, Layout definition, or occurrence references it |
| Zone Layout definition | `zoneLayout.id` | None | Show-owned routing definition | Refuse while an occurrence references it |
| Layout occurrence | `layoutOccurrence.id` | Global `startMs`, positive `durationMs` | References one definition; owns static routing parameters and optional incoming transfer | Deleting it requires a replacement that leaves `[0, showEndMs)` covered exactly once |
| Layer | `layer.id` | Show lifetime | Owned by one Zone; `rank` defines bottom-to-top order | Refuse while a Clip or Group binding references it; empty Layers otherwise persist |
| Pattern instance | `patternInstance.id` | Private clock; no authored interval | Show-owned runtime identity referenced by Clips | Remove only when no direct Clip or definition references it and no instance track targets it |
| Clip | `clip.id` | Global half-open `[startMs, startMs + durationMs)`; owns global appearance-key times | References one instance, Zone, and Layer; owns placement and presentation appearance | Remove attached Transition participant pairs, appearance keys, and placement tracks atomically; remove a now-orphaned instance and its tracks only under the existing last-user rule |
| Transition | `transition.id` | Derived common window from participant endpoints plus `durationMs` | Owns visual kind/configuration and incoming ramp starts; participant pairs reference Clips | Delete only through explicit Clip/Transition intent; v2 Cut identity policy remains G1 |
| Property track | `track.id` | Explicit half-open activation plus keyframe times; global in composition, definition-local in a Group | Typed target references its value owner; the track owns its activation | Delete explicitly or with its target owner; orphan targets invalidate the candidate |
| Marker | `marker.id` | Global `timeMs`, including beyond Show End | Show-owned narrative guide | Delete explicitly; Show End changes do not delete it |
| Group definition | `groupDefinition.id` | Definition-local | Owns local instances, Layers, Clips, Transitions, and tracks | Refuse while occurrences reference it unless the same intent removes them |
| Group occurrence | `groupOccurrence.id` | Global `startMs`; extent derives from definition | References definition, Zone, and explicit local-to-global Layer bindings | Remove only the occurrence; remove definition only when its last occurrence is gone under explicit owner policy |
| Output Effect | `outputEffect.id` | Show lifetime/runtime history | Show-owned ordered post-composition effect | Existing explicit stack edit semantics |

All authored IDs are non-empty strings and unique in their entity collection.
All global and local times are nonnegative safe integers; durations are positive
safe integers except Transition Cuts, whose duration is zero. The composition
must fit inside Show End except for dormant Markers. Same-Layer ordinary Clip
intervals do not overlap. A positive Transition occupies the exact gap between
each pair's outgoing end and incoming start.

### Layers and Clips

One stable Layer record replaces the current collection of corresponding
Scene-local Layer records. `rank` is unique within a Zone. Conversion builds an
explicit source map from every v1 Scene/Zone/Layer ID or Main slot to its v2
Layer ID. Current Layer Transitions resolve sameness by Scene, Zone, and overlay
ordinal even though each Layer also has a stable ID. The converter therefore
refuses an ambiguous ID/ordinal mapping, including divergent names, until G2
chooses a policy; it does not pick whichever Layer happens to occur first.

A Clip stores its nominal interval once. Transition contribution may render it
outside that interval only through an explicit participant. Appearance stays
on the Clip through ordered `appearance.keys`. Each key has a stable ID, global
`timeMs`, and a complete appearance value. The first key is at Clip start; keys
are strictly increasing inside the Clip interval; a value holds through the
next key or Clip end. A converted source placement ID seeds a deterministic,
collision-free key ID and the conversion report records that mapping. The
stable identity requirement is explicit for the experiment, while creation,
merge, trim, and split semantics for authored keys remain a G3/G4 decision.

Each complete appearance value contains `opacity`, `view`, `presentation`,
`blink`, `transform`, `aperture`, and ordered `effects`. `zoneSampleMode`
remains a Clip field with `independent`, `span`, and `repeat` values. A
single-Zone flat cell with omitted `zoneMode` maps to `independent`; a
multi-Zone flat cell with omitted or explicit `span` maps to `span`; explicit
`repeat` maps to `repeat`; and a v1 composition placement maps to `span`.
`independent` records the current routed-coordinate behavior rather than a flat
source tag. `entryPolicy` also remains a Clip field and records Continue or
Restart rather than deriving it from a Layout boundary.

Appearance keys are a value timeline, not logical Clip segments: they have no
duration, Pattern instance, Zone, Layer, source interval, Transition endpoint,
or runtime identity. Lowering may partition one Clip into transient compiler
placements only where an appearance key changes. Existing typed property tracks
evaluate after the held appearance value and override their targeted field.
#1034 first proves the bounded F-DIVERGENT fixture for opacity, Transform, and
Aperture with no Effect track. P14 separately preserves an Effect track only
across its source-owned activation interval. A future edit that removes or
replaces a targeted Effect during that active interval remains a product
decision; valid v1 migration does not invent that edit policy.

The schema names the current persisted `viewport` object `aperture` because its
domain meaning is Clip Viewport Aperture. This is P1 record-shape vocabulary and
cannot enter production before G0.

### Transitions and contribution

A Transition participant is two-sided in this migration. Both Clips must be in
the same Zone and Layer, and every participant on one Transition must resolve to
the same time window. A multi-participant record means the source authored one
shared visual event. Independent simultaneous junctions use independent records
even when lowering later shares a compiler kernel.

For a participant `A -> B` with duration `d`, the provisional invariant is:

```text
transition.start = A.start + A.duration
transition.end   = transition.start + d = B.start
```

The outgoing and incoming render contributions during that window come from the
Transition policy. Pattern clocks follow Pattern-instance lifecycle; skipped
pixel evaluation, snapshot/live capture, and visibility do not silently stop a
clock. One-sided participants remain optional #1045 research and are absent from
the provisional schema.

The implemented tracer also preserves a legacy composite boundary with explicit
`wholeOutput` start time and complete outgoing/incoming Clip-ID sets, without
inventing Layer pairings for unequal topologies. Mixed whole-output/participant
scope and independent overlapping positive windows remain ineligible. A Layout
transfer at a visual boundary starts at the outgoing hold end; later switches
include intervening visual durations in their global time. An edge strictly
inside a visual window, or at its end without an emitted compiler hold owner,
remains refused. See the measured scope fixtures.

The schema provisionally admits an explicit zero-duration Cut for direct v2
authoring experiments, but conversion does not create one for every v1
boundary. A plain v1 boundary Cut is hidden Scene structure when it has no
visual, property, routing, or persisted identity reference. The converter uses
its zero-duration boundary to calculate time, reports its ID as
`retired-structural-cut`, proves exact output, and emits no authored v2
Transition. A Cut with property or routing carriers first maps each carrier to
its explicit track or Layout occurrence owner. An unknown payload or identity
reference refuses conversion.

Current edit owners still differ: resetting a Layer Transition removes its
persisted endpoint record and ripples the downstream chain earlier by its
duration, while resetting a visual boundary can retain the boundary ID and
easing as it clears visual settings and ramps. Whether direct v2 Cut authoring
needs persistent identity remains a G1 decision; structural v1 Cut retirement
does not answer it.

### Layout occurrences and sample remapping

Layout occurrences cover `[0, showEndMs)` without overlaps or gaps. An
occurrence references a Zone Layout definition, owns its static routing
parameters such as split position, and may own one `incomingTransfer` from its
predecessor. Reusing one definition in nonadjacent intervals creates distinct
occurrence IDs.

The active definition determines Zone availability. P3 Clips may cross an
occurrence boundary only when their Zone exists on both sides and #1034 proves
equivalent local sampling and lifecycle. A disappearance/reappearance is not
silently bridged. The converter refuses it pending G1/G5 unless explicit Clips
and lifecycle can preserve the source.

`composition.sampleRemap.repeatScale` is the static Show-level target. A global
property track may animate it without creating or splitting a Layout occurrence.
The target does not change Stage Map geometry, Zone ownership, or split
position.

### Property animation and edit policies

Static values remain on their owning entities. A property track exists only for
authored animation. It owns `activeStartMs` and positive `activeDurationMs`, an
explicit half-open interval independent of keyframe first/last times. Keyframe
evaluation holds the first or last value across the rest of that interval; the
track has no effect outside it. Composition tracks store activation and keys in
global time. Group-definition tracks store both in definition-local time.
Materialization projects the complete local interval and keys together.
Source contribution owns the interval. Key endpoints own the curve and held
values within it; they never extend or shorten activation. A source track with
an empty contribution interval does not become a zero-duration v2 track. The
converter omits it and reports its source ID/path as
`retired-no-contribution-property-track`.

The target union keeps the current seven numeric families and adds separate
Layout-occurrence split-position and Show repeat-scale targets. An Effect target
must resolve to the same Effect identity, kind, and parameter in every held
appearance span with nonempty overlap against activation. An Effect absent at
the exact exclusive end is outside activation and valid; held appearance then
governs. This follows the current application order in
[`showCompiler.ts`](../../src/engine/showCompiler.ts) and prevents a track from
leaking when an Effect disappears and later returns. The provisional schema
does not add discrete animation of Aperture shape, edge, enabled state, or
presentation.

Conversion derives activation from the actual source contribution owner, never
from keyframe extrema. The first bounded Cut case maps placement and instance
tracks to the source Scene contribution interval after globalizing its start.
Positive Transition participants can contribute outside a nominal Clip
rectangle and retain source-local clock behavior. #1034 proves the exact
dual-contribution interval for its accepted whole-output boundary form. Other
unproved activation/section combinations still refuse rather than substituting
the Clip rectangle, a retired Scene label, or a Marker.

Pure owners apply these provisional cascades before validation:

| Intent | Cascade before validation |
| --- | --- |
| Move plain Clip | Shift the Clip and its appearance keys by the same delta. Shift placement-track activation and keys by the same delta. Shift instance-track activation and keys only if the instance has one Clip user. Keep Show/Layout targets fixed. |
| Move connected Clip | Move the complete connected chain rigidly under the current exact owner. Preserve Transition IDs, participants, durations, settings, relative offsets, Zone, and Layer. The existing source-qualified manual Layer-change exception remains separate. |
| Resize trailing edge | Change the Clip end and move connected successors as the current owner requires. Preserve unrelated Clips. Refuse when endpoint or capacity invariants cannot hold, or while an appearance-key trim would change held appearance under the unproved G4 rule. |
| Resize leading edge | Keep the requested end/start contract, adjust the incoming Transition duration only where the current owner does, and shift affected Clip-owned keys consistently. Source-qualified manual Cut conversion remains separate. |
| Trim | Keep the Clip ID and instance. Keep keys inside the retained contribution domain; boundary sampling and any key insertion needed for exact curve preservation are an evidence question at G4. Until proved, refuse a trim that would change a curve. |
| Split | Mint one new Clip ID, preserve Pattern-instance sharing, seed the right Clip with the held appearance at the split, divide appearance keys plus track activation and keyframes with exact sampled boundary values, and retarget outgoing endpoints to the right Clip. Incoming endpoints remain on the left. Refuse until #1034 proves the complete curve rule. |
| Insert Time | Shift every entity beginning at or after the insertion point. Split crossing Clips only when the v2 split rule is proved; shift Markers plus global activation and keys at/after the point. Do not infer a Scene or Layout occurrence. Refuse nonlinear crossing curves until exact preservation is proved. |
| Delete Clip | Remove its participant pairs and placement tracks. Apply the existing explicit time-preserving boundary conversion where eligible. Never leave a one-sided stub or remember a removed Transition for later reattachment. |
| Replace Pattern | Require explicit instance scope matching the current inspector owner; do not infer a single-Clip edit when several Clips share that instance. Preserve Clip identity. Remove incompatible controls/tracks only after authoritative dependency inspection. Transition stability remains a required #1034 row rather than an assumed guarantee. |
| Reset Transition to Cut | Delegate according to source form: current Layer reset removes the positive endpoint record and ripples its downstream chain; current boundary reset retains its boundary identity/easing while clearing visual/ramp payload. The proposed explicit v2 Cut identity is decided at G1. |
| Set Show End | Clamp to visible content end or refuse; never delete meaningful content, Layout routing, Groups, tracks, or visual Transitions implicitly. Markers may remain beyond it. |

The conservative “refuse until proved” entries belong to the #1034 tracer. They
are not proposed permanent product restrictions.

### Pattern-instance lifecycle

Several Clips may reference one Pattern instance and therefore one private
state, clock, control set, and evaluation policy. `continue` exposes that same
runtime across gaps and placements. `restart` resets it at the Clip entry. The
provisional validator accepts restart only when that entry has no other active
user. #1034 must compare continuous playback, seek reconstruction, and repeated
loops before G5.

Group definitions own a local instance graph. Each occurrence materializes a
fresh occurrence-local runtime graph, matching current behavior. Duplicating a
linked occurrence shares choreography, not private Pattern state.

### Groups

A Group definition uses local safe-integer time and stable local Layers instead
of numeric offsets. A Group occurrence supplies one explicit binding for every
local Layer used by the definition. This replaces the current `baseLayer +
layerOffset` calculation and prevents an insertion or reorder from retargeting
children by accident.

Materialization composes occurrence start and translation with local Clip time
and placement. It prefixes or otherwise maps all local entity IDs into unique
runtime identities without changing the authored definition. A collision with
ordinary Clips on a bound destination Layer invalidates the candidate. Crossing
a Layout boundary remains refused until G6 defines Zone availability and
sampling.

## v1 field disposition

This inventory follows the persisted TypeScript record in
[`personalContentRecords.ts`](../../src/engine/personalContentRecords.ts) and
the current generated schema in
[`show-record.schema.json`](../../schemas/show-record.schema.json). “Report”
means the converter emits the mapping or refusal in its conversion result; it
does not add provenance debris to the authored v2 record.

### Show envelope and Scene partition

| v1 field | Current owner | v2 disposition |
| --- | --- | --- |
| `ShowRecord.id`, `name`, `updatedAt` | Show | Preserve exactly. |
| `scenes[].id` | Hidden Scene | Retire after references are converted; report source Scene to global-time and Marker mappings. |
| `scenes[].name` | Hidden Scene label | Provisional P9: convert to a Marker at the Scene start unless an equivalent Marker exists; report every conversion. |
| `scenes[].durationMs` | Hidden Scene | Sum with ordered boundary durations to derive global offsets; retire as ownership after `showEndMs` and all occurrences are built. |
| `scenes[].routingTargets.splitPosition` | Scene-wide routing target | Move the static destination value to the corresponding Layout occurrence; convert boundary ramps to a typed occurrence track. |
| `scenes[].sampleTargets.repeatScale` | Scene-wide sample target | Fold into Show-level `sampleRemap.repeatScale` plus a global repeat-scale track. Do not create Layout occurrences. |
| `zones[]` fields `id`, `name`, `nominalPixelCount`, `color`, `icon` | Zone | Preserve field-for-field. |
| `routingLayouts[]` fields `id`, `name`, `zones`, `logical` | Routing Layout definition | Preserve field-for-field as `zoneLayouts[]`; nested `zoneId`, physical `ranges.start/end`, and the complete logical routing union remain owned by the definition. |
| `targetControllerProfileId`, `stageMapId`, `outputContract` | Show output/delivery | Preserve field-for-field. |
| `outputEffects[]` and every Effect field | Show | Preserve ordered records field-for-field. |
| `importMetadata.kind`, `originalShowId`, `appVersion`, `exportedAt`, `importedAt` | Show provenance | Preserve field-for-field. Conversion adds no fabricated external provenance. |

### Flat compatibility cells

A flat v1 record is a supported conversion source. The converter may call the
current flat-to-`ShowCompositionV1` projector as a transient adapter so that it
reuses the existing Scene offsets, instance continuity, and source lookup
rules. That intermediate graph is evidence inside conversion only: the v2
record persists the mapped v2 entities and never embeds or points back to a v1
Show or composition snapshot. Pattern references remain references to their
authoritative dependencies; conversion reports their exact source mapping and
does not copy Pattern source into a Scene-free state container.

| v1 field | v2 disposition |
| --- | --- |
| `cells[].id` | Retire after reporting its generated instance/Clip mapping. Reuse as a Clip ID only when unambiguous and collision-free. |
| `zoneId`, `sceneId`, `sceneSpan` | Resolve to one global interval and one Zone. Scene references retire. |
| `zoneSpan`, `zoneMode` | Preserve routed-coordinate behavior as `zoneSampleMode`: a one-Zone omitted mode becomes `independent`; a multi-Zone omitted/`span` becomes `span`; explicit `repeat` becomes `repeat`. A multi-Zone span expands only with explicit reported Clip mappings and proved output; otherwise conversion refuses. |
| `pattern`, `patternName` | Create/reference a Pattern instance with the same values. |
| `adaptations.timeScale`, `timeOffsetMs`, `lightShutter`, `steppedClock` | Move to Pattern-instance time. Preserve `rateHz`, `duty`, `phase`, `clockBehavior`, and `stepMs` exactly. |
| `adaptations.mirror`, `phase`, `brightness` | Move to Clip `view`, field-for-field. |
| `restartOnEntry` | Move to Clip `entryPolicy`. Missing/false becomes Continue; true becomes Restart subject to P7. |
| `evaluationPolicy` | Move to the Pattern instance. Conflicting policies among shared users refuse. |
| `presentation` (`live`; `freeze`; `strobe.cadenceMs`) | Move to Clip, preserving the union exactly. |
| `blink.rateHz`, `duty`, `phase` | Move to Clip Blink exactly. |
| `controlTargets` | Move to the Pattern instance. Conflicting values among shared users refuse. |
| `transform` | Move to Clip Transform; preserve all five fields. |
| `viewport` | Rename provisionally to `aperture`; preserve `enabled`, frame `x/y/width/height`, `aperture`, `edge`, `feather`, `rotation`, `invert`, `ringWidth`, `cornerRadius`, `crossWidth`, `starPoints`, `starInner`, `crescentOffset`, and `polygonSides`. |
| `effects[]` | Move to Clip unchanged and in authored order. Every `id`, `kind`, and kind-specific field remains exact. |

The Effect payload preserved by the final row includes: opacity `opacity`;
brightness `brightness`; hue `turns`; saturation `saturation`; contrast
`contrast`; invert `amount`; threshold `threshold/amount`; luma key
`target/tolerance/softness`; chroma key `color/tolerance/softness`; posterize
`levels/amount`; vignette `amount/radius/softness/centerX/centerY/aspect`;
color-map `amount/shadowR/shadowG/shadowB/highlightR/highlightG/highlightB`;
translate, rotate, scale, and shear axes/turns; ripple
`amount/frequency/phase/centerX/centerY`; swirl and bulge
`amount/radius/centerX/centerY`; pixelate `amount/columns/rows`; kaleidoscope
`amount/segments/rotation/centerX/centerY`; and Wrap's identity-only payload.

### Composition sidecar

| v1 field | Current owner | v2 disposition |
| --- | --- | --- |
| `composition.version` | Sidecar shape | Replace with composition version 2. |
| `executionModel` | Composition | Preserve Show-loop lifecycle explicitly. Missing becomes v2 `continuous`, which omits the existing compiler recipe's `deterministicLoopReset`; `deterministic-loop` remains `deterministic-loop`. This does not change Clip `entryPolicy`. |
| `patternInstances[]` | Composition | Preserve `id`, `pattern`, `patternName`, `evaluationPolicy`, time fields, shutter/stepped-clock fields, and `controlTargets`. |
| `composition.scenes[].sceneId` | Scene-local container | Retire after adding the Scene's global offset to placements and keyframes. |
| `composition.scenes[].zones[].zoneId` | Scene/Zone container | Move to each Clip and its stable Layer owner. |
| `main[]` | Implicit bottom Layer | Move placements to an explicit rank-0 Layer. |
| `overlays[].id`, `name`, array position | Scene-local Layer | Map to one stable Zone-owned Layer ID, name, and rank. Preserve empties; refuse unresolved divergence. |
| placement `id`, `logicalClipId` | Scene-local placement / projected Clip | Collapse contiguous logical segments into one stable Clip ID; retire segment identity after reporting its appearance-key mapping. `logicalClipId` selects the visible Clip identity where present. Source placement IDs seed deterministic appearance-key IDs. |
| placement `instanceId`, `startMs`, `durationMs` | Placement | Preserve the instance reference; convert local starts to global time; combine only contiguous segments proved to have the same Clip, instance, Zone, and Layer ownership. A gap or ownership change is not appearance divergence and still refuses or expands with an explicit report. |
| placement `opacity`, `view`, `presentation`, `blink`, `transform`, `viewport`, `effects` | Placement appearance | Store each distinct boundary value as a complete Clip `appearance.keys[].value`, renaming `viewport` to `aperture`. Uniform appearance produces one start key. Effects remain ordered full values; validate an Effect track only over appearance spans intersecting its P14 activation. |
| `markers[].id`, `timeMs`, `name`, `color` | Show | Preserve exactly; time is already global and may exceed Show End. |
| `composition.durationMs` | Composition | Preserve as `showEndMs`; where absent, derive current loop duration and report derivation. |
| `composition.transitions[]` | Layer junction | Convert each positive Transition to one v2 participant. Preserve `id`, endpoints, kind, duration, easing, and every visual field. Explicit v2 Cut materialization is provisional G1 policy, not current Layer storage behavior. |
| `propertyTracks[]` | Scene or Group definition | Preserve contributing track/keyframe IDs, target, values, easing, and order. For composition tracks, add the owning Scene's global offset to keyframe time and store that source contribution as global `activeStartMs`/positive `activeDurationMs`. Group-definition activation and keys remain local. Rewrite placement/instance IDs through the conversion map. A source track with no contribution retires with an explicit source ID/path report; positive-Transition contribution mapping refuses until its full source interval is proved. |
| `groupDefinitions[]` | Composition | Preserve identity/name/local instances, Clips, Transitions, tracks, and local timing. Convert `layerOffset` to a stable definition Layer reference. |
| `groupOccurrences[]` | Composition | Preserve `id`, `definitionId`, globalized `startMs`, `zoneId`, and `translationX/Y`; replace `sceneId` and numeric `baseLayer` with explicit Layer bindings. |

The current property target union maps as follows: `instance-time-scale` and
`instance-control.exportName` retain instance ownership; `placement-opacity`,
`placement-view.property`, `placement-transform.property`,
`placement-viewport.property`, and `placement-effect.effectId/effectKind/
parameterId` retarget from placement ID to Clip ID. Every keyframe preserves
`id`, numeric `value`, and structured `easing`; its Scene-local `timeMs` becomes
global. Keyframe extrema never replace the explicit activation interval because
the current evaluator holds endpoint values outside that range.

### Boundary Transitions

Positive visual v1 boundary records convert to v2 Transition records. A plain
Cut follows P13 and retires after its zero-duration timing and output are
accounted. A Cut carrying routing, property, or sample changes first moves those
values to Layout occurrences, incoming transfers, or global property tracks;
the conversion report must account for every source path before the Cut ID can
retire. `afterSceneId` always retires after resolving a global boundary.

Every visual payload field is preserved when its kind owns it:
`crossfadePolicy`, `color`, `direction`, `wipeVariant`, `wipeMode`,
`orientation`, `count`, `phase`, `clockwise`, `edgePolicy`, `dissolveVariant`,
`seed`, `blockSize`, `softness`, `feather`, `centerX`, `centerY`,
`featherPolicy`, `shape`, `scale`, `rotation`, `spin`, `ringWidth`,
`revealMode`, `aspect`, `cornerRadius`, `crossWidth`, `starPoints`, `starInner`,
`crescentOffset`, `polygonSides`, `motionVariant`, `anchorX`, `anchorY`,
`contentScale`, `spinDirection`, and `addressPolicy`. `durationMs` and structured
`easing` remain exact.

`layoutId` and `routingDirection` move to the destination occurrence's incoming
transfer. `propertyTransitions.timeScale`, `brightness`, `controls`,
`transform`, and `effects` become Transition-owned ramp starts targeting the
converted destination instance or Clip. `routing.splitPosition` targets the
destination Layout occurrence. `sample.repeatScale` targets the Show sample
remap. Every `fromByCellId` entry must resolve; no first-entry selection is
allowed.

## Current Transition behavior baseline

The baseline distinguishes domain owners. Equal-looking editor gestures and
commands do not currently promise identical behavior outside their explicitly
shared owner.

| Behavior | Current contract to preserve | Owning source |
| --- | --- | --- |
| Connected move | Canonical exact move moves the complete chain rigidly on its existing Zone/Layer, preserving durations, relative offsets, Transition IDs/settings, and global time. It refuses incompatible destinations rather than detaching. | [`showExactClipMove.ts`](../../src/engine/showExactClipMove.ts), [`show-command-semantics.md`](../reference/contracts/show-command-semantics.md#internal-exact-clip-move) |
| Manual move difference | Existing manual drag may detach when changing Layer and may remove a broken visual Scene-boundary Transition. This source-qualified behavior stays separate; migration adds no general detach policy. | [`show-command-semantics.md`](../reference/contracts/show-command-semantics.md#internal-exact-clip-move) |
| Trailing-edge resize | Exact resize retains the requested Clip ID/range, preserves Transition IDs/settings, moves connected successors when required, and leaves unrelated Clips fixed. Capacity/topology failures refuse. | [`showExactClipResize.ts`](../../src/engine/showExactClipResize.ts) |
| Leading-edge resize | Exact fixed-end resize may adjust incoming Transition duration and reports it. Current manual code has two qualified legacy exceptions: reducing an incoming Transition to zero and breaking a visual Scene-boundary junction to Cut. | [`show-command-semantics.md`](../reference/contracts/show-command-semantics.md#manual-resize-commits) |
| Delete connected Clip | The shared owner removes all logical segments, placement tracks, and attached Layer Transitions. It removes an instance and instance tracks only for the last user. An otherwise unused outer boundary becomes a same-ID Cut; its duration becomes editable destination-local time. Destination-local placements, keys, and Groups shift so global Clip ranges, Markers, later Scenes, and Show End stay fixed. Pattern private time does not shift. | [`showClipDeletion.ts`](../../src/engine/showClipDeletion.ts), [`showClipDeletionBoundaryEligibility.ts`](../../src/engine/showClipDeletionBoundaryEligibility.ts) |
| Delete then re-add | Policy A2 forbids automatic reattachment, and `add_clip` does not declare Transition writes. No direct delete/re-add regression currently proves the complete behavior, so `TR-DELETE-READD-NO-GHOST` is required evidence. | [`showCommands/clips.ts`](../../src/engine/showCommands/clips.ts), deletion owner, A2 |
| Replace Pattern | The current inspector edits the Pattern instance, so all placements referencing it change. Authoritative metadata prunes unsupported instance controls/tracks; placement tracks remain; source changes clear `executionModel`. There is no canonical Show command and no connected-Transition regression, so Clip versus shared-instance intent and Transition stability remain open. | [`showClipInspectorModel.ts`](../../src/engine/showClipInspectorModel.ts) |
| Reset to Cut | The Layer owner removes the positive Transition and shifts its downstream chain earlier by exactly its duration. The boundary owner can retain a same-ID Cut and easing while clearing visual settings/ramps. Explicit v2 Cut identity across both forms is provisional. | [`showCommands/layerTransitions.ts`](../../src/engine/showCommands/layerTransitions.ts), [`showModel.ts`](../../src/engine/showModel.ts) |

## Pure edit and admission boundaries

The v2 edit seam is a pure function over one immutable preimage:

```ts
evaluateShowCompositionV2Edit(preimage, explicitIntent, context)
  -> { status: 'accepted', candidate, changes }
   | { status: 'noop', candidate: preimage, changes: [] }
   | { status: 'refused', issues, candidate?: never }
```

The caller runs boundaries in this order:

1. **Structural decoding** checks the request and record syntax. The draft JSON
   Schema describes the provisional record only.
2. **Edit ownership** resolves explicit targets, clones the preimage, and applies
   the named cascade for that intent.
3. **Domain integrity** validates complete identity, references, time, overlap,
   Transition endpoints, Layout coverage, Group bindings, and property targets.
   It never attaches, detaches, deletes, shifts, clamps, normalizes, or repairs.
4. **Dependency availability** checks authoritative Pattern, Library, Map, and
   metadata inputs when the operation needs them.
5. **Compiler eligibility** answers whether preview/export/hardware compilation
   supports the valid record. A valid composition may still be ineligible.
6. **Revision and admission** bind an eligible completed candidate to the
   captured editor session, Show ID, revision, and immutable operation identity.
7. **Adoption, history, and persistence** publish one accepted candidate once.
   One operation produces at most one history entry and one save settlement.

This preserves the current separation in
[`show-command-semantics.md`](../reference/contracts/show-command-semantics.md),
[`show-state-history-persistence.md`](../reference/contracts/show-state-history-persistence.md),
and
[`agent-candidate-application.md`](../reference/contracts/agent-candidate-application.md).
Those references describe shipped v1 behavior until implementing children land
accepted v2 clauses.

## Restriction ledger

The [completed measured ledger](show-v2-tracer-evidence.md#measured-restriction-ledger)
supersedes the initial dispositions below and links their positive/negative proof. The ledger was re-verified against the post-#1042 code on 2026-09-26 (#1043); see the [Handoff to #1045](show-v2-tracer-evidence.md#handoff-to-1045).

#1034 owns the measured ledger. Each row must name the current enforcing source,
smallest positive and negative fixtures, consumer evidence, current scope,
classification, and residual. The classification vocabulary is closed:
`removed-by-model`, `supported-or-safely-narrowed`, `requires-compiler-work`, or
`intentional-domain-rule`.

| ID | Rule | Initial disposition | Current source / question |
| --- | --- | --- | --- |
| RL01 | Invalid/duplicate identity, unsafe time, missing reference | Intentional domain rule | `showCompositionModel.ts` validators |
| RL02 | Same-Layer/Zone ordinary Clip overlap | Intentional domain rule | `validateShowComposition` |
| RL03 | Hidden Scene boundary blocks direct edits | Removed by model | Scene slicing in composition owners |
| RL04 | Scene-only duplicate, animation, or Insert Time refusals | Removed by model where the underlying global rule is proved | `showTimelineAuthoring.ts`, command contract |
| RL05 | Removed Transition duration remains invisible reserved time | Removed by model; duration becomes editable blank time under the existing deletion policy | `showBoundaryTransitionTimeRepair.ts` |
| RL06 | Clip crosses a Layout switch | Requires evidence; accept only with Zone/sampling/lifecycle proof | v1 Scene ownership and lowerer |
| RL07 | Group crosses a Layout switch | Requires evidence and G6 | `showGroupModel.ts` currently materializes into one Scene/Zone |
| RL08 | Fade/Motion affects unrelated continuing content | Keep correctness guard; narrow only with compiler proof | `showCompositionLowering.ts` scheduling |
| RL09 | Unrelated Clip edge inside a Transition | Keep where scheduler requires; distinguish another Zone/independent render target | `resolveLocalLayerTransitions` |
| RL10 | Overlapping positive Transitions | Keep where physical render-target conflict exists; do not infer one authorial group | `resolveLocalLayerTransitions` and render-target plan |
| RL11 | All simultaneous junctions share one visual effect | Reject as a permanent rule; test separate-Zone and shared-source cases | G1 |
| RL12 | Multi-Zone flat cell becomes one v2 Clip | Unsupported by one-Zone Clip identity; converter must report expansion or refusal | C06–C07 |
| RL13 | Divergent logical-segment appearance previously required one static Clip value | Experimental appearance keys remove the restriction only where exact transient lowering is proved; gaps and ownership changes remain separate restrictions | C08–C12, P01–P06 |
| RL14 | Restart shared instance while another user is active | Refuse under P7 pending G5 | S06–S08 |
| RL15 | Every v1 boundary Cut must become an authored v2 Transition | Removed for plain structural Cuts under P13; preserve carrier semantics in their explicit owners and refuse unaccounted identity/payload | T01, C01–C05, R01–R02 |
| RL16 | A property track is active from its first through last keyframe, or anywhere its target identity appears | Reject: activation is a separate source-owned half-open interval under P14; validate target identity only over intersecting appearance spans | A01–A10, C08–C12 |

## Consolidated proof matrix

The [executed proof mapping](show-v2-tracer-evidence.md#consolidated-proof-mapping)
separates #1034 preservation evidence from later authoring/adoption rows.

The stable consumer boundaries are: a reopened v2 Show artifact; the recipe and
compiled Pattern produced through the ordinary importer/compiler path; matched
Fast and Precise frames and lifecycle state; and one adopted editor candidate
with observable history/save behavior. Type guards and generated source text are
diagnostics unless a row explicitly names exact source equality.

For changed-source comparisons, run continuous playback at a declared 16 ms
deterministic harness timestep, splitting a step when needed to land exactly on
a named millisecond probe, and sample every frame needed by the lifecycle assertion.
Always retain each Transition or interval midpoint plus `start-1`, `start`,
`start+1`, `end-1`, `end`, and `end+1` milliseconds when those points are inside
the loop. Compare continuous playback, seek from Show start to the same probes,
and the first frame of two repeated loops. Midpoints and fixed-timestep traces
prevent equal endpoints from hiding a changed easing curve or a missed
once-per-frame state advance. The initial numerical gate is maximum absolute
Fast-mode channel error `<= 1e-9` and exact Precise 16.16 output words. Any wider
tolerance or excluded state requires a named row, measured bound, cause, and
Jon's acceptance before it counts as proof.

Every accepted-edit row asserts immutable input, a complete valid candidate,
correct projection/rendering, and preserved dependent references. Every refusal
row asserts identical prior state, no candidate/adoption/history/save side
effect, and an observable reason.

| Rows | Partition and representative cases | Oracle |
| --- | --- | --- |
| D01–D05 | Version, required fields, unknown fields, unsafe/noninteger time, malformed typed union | Structural refusal; unchanged bytes |
| Y01–Y08 | Stable Layer IDs/names/order/empty Layers; Main; overlay reorder; different Zones; Group-created shell | Reopened record plus full identity/reference graph |
| E01–E04 | Plain move; connected move; manual Layer-change exception; occupied/out-of-range refusal | Candidate projection and unchanged-refusal oracle |
| E05–E08 | Leading/trailing resize, zero-duration source-qualified manual Cut, capacity refusal | Exact global ranges, Transition identities/settings, history count |
| E09–E12 | Delete, delete/re-add, Replace Pattern direct/shared/Group, Reset to Cut | No ghost resurrection; dependency and shared-scope receipts; reopened artifact |
| T01–T08 | Cut, crossfade snapshot/live and live/live, Fade, Wipe, Dither, Dissolve variants, Portal, Motion | Matched-time Fast/Precise pixels and lifecycle state |
| T09–T12 | One/multiple participants; same/different Zones; unrelated continuing content; entering/leaving content | Complete Stage composite and scheduler/resource summary |
| T13–T16 | Overlapping windows; independent simultaneous junctions; alpha/source-over; Layout transfer at boundary | Accepted/refused classification plus compiled output |
| A01–A05 | Each seven current target families; zero pause; two/interior/many keys; easing variants; activation wider than keys | Target projection, explicit activation, endpoint/interior samples, held endpoints |
| A06–A10 | Cut-owned activation; Effect disappears/reappears outside activation; incoming pre-roll; outgoing contribution; global move follow, trim, split | Track identity, half-open activation, complete curves, matched state/output or typed unproved-Transition refusal |
| A11–A14 | Insert Time before/inside/after curve; nonlinear crossing; Show/Layout targets fixed | Exact key/global positions or atomic refusal |
| S01–S05 | Shared instance across Zones/Layers, gap continuity, advancing once per frame, Freeze/Strobe/Blink, evaluation policies | Exported lifecycle counters in continuous/seek playback |
| S06–S10 | Restart sole/shared/simultaneous, loop reset, Trails, instance orphan cleanup | Private state and complete output over two loops |
| L01–L06 | No/one/repeated Layout definitions; same/different occurrence; split parameter; repeat scale without Layout split | Reopened occurrence graph and routed pixel ownership |
| L07–L12 | Zero/nonzero transfer; visual Transition at transfer; Zone disappears/reappears; Clip/Group crosses switch | Routing/output/lifecycle or explicit refusal with residual |
| G01–G06 | Local Layers, explicit bindings, empty destination Layer, materialized collision, duplicate linked occurrence, Make Unique | Materialized graph and occurrence-private runtime IDs |
| G07–G12 | Group Transitions/tracks, translation, Insert Time, Layout crossing, ungroup, delete final occurrence | Reopened artifact and complete projected choreography |
| C01–C05 | Flat-only/composition v1; explicit/legacy Show End; Scene labels/Markers; ordinary Scene spans | Conversion report accounts for every source path |
| C06–C12 | Independent/span/repeat routed coordinates; Multi-Zone/zone-span; divergent Layer metadata; opacity/Transform/Aperture divergence; property-only carriers | Exact routed-coordinate samples or explicit converted mapping/refusal; F-DIVERGENT additionally requires one Clip, stable appearance-key mapping, and exact boundary/interior lowering |
| C13–C16 | Unknown/malformed references; unsupported dependency; continuous/deterministic lifecycle mapping; unknown extension | Exact lifecycle mapping or fail closed with unchanged input and enumerated residual |
| P01–P06 | Exact recipe/source/summary cases; legitimate changed lowering; Fast/Precise; seek/continuous; repeated loops; resource limits | Named equality or bounded semantic comparison |
| R01–R06 | v1 import, v2 export/reopen, save/reopen, Undo/Redo, stale/duplicate admission, failed persistence recovery | Ordinary consumer paths, one adoption/history/save boundary |

The #1034 fixtures and report use these stable case names inside the broader
row families:

- `TR-MOVE-SAME-LAYER-RIGID`, `TR-MOVE-CROSS-LAYER-MANUAL-CUT`,
  `TR-MOVE-CROSS-LAYER-CANONICAL-REFUSE`, and
  `TR-MOVE-BOUNDARY-COLLAPSE-GLOBAL-DELTA`;
- `TR-RESIZE-LEADING-ADJUST`, `TR-RESIZE-LEADING-ZERO-MANUAL-CUT`,
  `TR-RESIZE-TRAILING-RIPPLE`, and
  `TR-RESIZE-BOUNDARY-CANONICAL-REFUSE`;
- `TR-RESET-CUT-RIPPLE`, `TR-DELETE-ATTACHED`,
  `TR-DELETE-BOUNDARY-GLOBAL-PRESERVE`,
  `TR-DELETE-PROPERTY-CARRIER-RETAIN`, `TR-DELETE-SHARED-STATE-REFUSE`,
  and `TR-DELETE-READD-NO-GHOST`;
- `TR-REPLACE-PATTERN-SHARED-INSTANCE`,
  `TR-REPLACE-PATTERN-METADATA-PRUNE`, and
  `TR-REPLACE-PATTERN-TRANSITION-STABLE` (currently unproved);
- `CONV-DIVERGENT-APPEARANCE-EXACT`,
  `CONV-PROPERTY-CARRIER-WITHOUT-VISUAL-JUNCTION`,
  `LAYER-STABLE-ID-EMPTY-REORDER`, `TRANSITION-SAME-ZONE-SPAN`,
  `TRANSITION-DIFFERENT-ZONE-COINCIDENT-CUT`,
  `TRANSITION-BOUNDARY-INSIDE-REFUSE`, and `TRANSITION-OVERLAP-REFUSE`;
- `STATE-INCOMING-PREROLL`, `STATE-SHARED-INSTANCE-ONCE-PER-FRAME`,
  `STATE-GAP-CONTINUITY`, `STATE-LOOP-RESET`,
  `GROUP-TWO-OCCURRENCE-PRIVATE-ISOLATION`,
  `GROUP-LAYOUT-CROSSING-REFUSE`, and `LAYOUT-ZONE-DISAPPEAR-READD`.

The bounded second experiment uses `F-DIVERGENT`, lifted from
[`showTimelineClipAppearanceRepartition.test.ts`](../../src/engine/showTimelineClipAppearanceRepartition.test.ts):
two contiguous placements share one `logicalClipId` and instance but differ in
opacity, Transform, and Aperture. The conversion succeeds only if the reopened
v2 artifact has one ordinary Clip, ordered stable appearance keys at the exact
global source starts, and complete values equal to each source placement. The
unchanged compiler path must then match the v1 recipe, visible output, and
observable lifecycle at each segment interior and at `boundary-1`, `boundary`,
`boundary+1`, and `end-1`, with the input immutable. This first proof excludes
Effect-target tracks; P14 adds their source-defined activation oracle.

`F-TRACK-ACTIVATION` uses three consecutive 500 ms Cut intervals on one logical
Clip. The first appearance owns brightness Effect `gain` and a linear track from
`1` at 0 ms to `0.25` at 500 ms, active on `[0, 500)`. The second appearance
omits `gain`; the third re-adds it statically at `0.5`. A white source must yield
`0.625` at 250 ms, approximately `0.2515` at 499 ms, identity `1` at 500 and
750 ms, and `0.5` at 1000 and 1250 ms in Fast and Precise under the declared
tolerance. Reopen equality, immutable v1 input, and exact activation fields are
part of the oracle. This behavior follows endpoint holding in
[`showPropertyAnimation.ts`](../../src/engine/showPropertyAnimation.ts), source
activation in
[`showCompositionLowering.ts`](../../src/engine/showCompositionLowering.ts),
and inactive-Effect identity assignment in
[`showCompiler.ts`](../../src/engine/showCompiler.ts). The corresponding
positive-Transition activation fixture remains required before that source
partition converts.

The corpus inventory pins every stock Show source commit and every agent
baseline fixture hash. Stock source currently contains 40 records, and the
agent baseline contains seven source-pinned fixtures; #1034 must obtain those
counts through the repository census rather than hard-code them into conversion
logic. Jon confirmed on 2026-09-14 that no personal authored Show exports exist,
so that corpus category is unavailable and does not block the stock/synthetic
tracer. Synthetic authenticated exports remain useful fixtures but do not
substitute for a personal-export compatibility claim. Every available item
receives `converted` or `refused` plus reasons. An unexplained allowlist is a
failed inventory.

## Child traceability

| Issue | Plan sections consumed or updated | Required matrix rows |
| --- | --- | --- |
| #1034 tracer | Provisional model, v1 disposition, restriction ledger, proof matrix | Execute D, T, C, P, S, L, G and semantic E/A feasibility rows within its additive limits; reopen tracer artifacts under R01–R02. Inventory R03–R06 as deferred production admission/history/save rows for #1044/#1039 rather than wiring them here. |
| #1035 Transition owner | Transitions/contribution, edit policies, pure boundaries | E01–E12, T01–T16 |
| #1044 real-route pilot | Record envelope, pure boundaries, contract drafts | D01–D05, E01–E12, R02–R06 |
| #1036 Layout/Show End | Layout occurrences/sample remap, entity deletion | L01–L12, A11–A14 |
| #1037 animation/time | Property animation, Pattern lifecycle | A01–A14, S01–S10 |
| #1038 full authoring port | Layers/Clips, Groups, edit policies | Y01–Y08, E01–E12, G01–G12 |
| #1040 stock preparation | v1 disposition, corpus inventory | C01–C12, P01–P06, R01–R04 |
| #1041 command/MCP preparation | Pure boundaries and draft contract clauses | D01–D05, E01–E12, R05–R06 |
| #1039 cutover/migration | Entire accepted model and conversion report | C01–C16, P01–P06, R01–R06 |
| #1042 legacy removal | Retired-field rows and final inventory | C01–C16, R01–R04 |
| #1043 reference sweep | Accepted vocabulary and contract clauses | Evidence links from every implemented family |
| #1045 Transition UX decision | Current baseline and G1 results | E01–E12, T01–T16 |

## Draft contract and vocabulary changes

These clauses remain proposals in this plan until their implementing children
land. Current reference documents stay truthful in the meantime.

### Show command semantics

- Replace Scene/overlay-index addressing with stable Clip, Layer, Zone,
  Transition, Layout-occurrence, Group, Marker, and property-track IDs.
- State that each command evaluates one explicit intent against an immutable
  preimage; its owner applies the named cascade, then v2 domain validation checks
  the complete candidate without repair.
- Preserve current no-op/refusal distinctions, atomic transactions, one final
  candidate, and no evaluation-time preview or persistence side effects.
- Record exact move/resize/delete/Replace/Reset policies only after their matrix
  rows pass. Keep source-qualified manual differences explicit.

### Show state, history, and persistence

- Admit v2 only through the same session, Show-ID, document-revision, and
  operation-identity checks as current whole-Show candidates.
- Normalize only representational defaults that cannot express edit intent.
  Do not synthesize or delete Transitions, shift time, repair references, or
  choose a Layer during adoption/hydration.
- Preserve one adopted candidate, one history entry, and one personal save
  settlement. Stock drafts remain session-only until explicit save-as.
- During additive migration, v1 and v2 rows remain explicitly discriminated;
  rollback retains original personal rows until every migrated row is verified.

### Agent candidate application

- The candidate envelope declares its composition-record version. Structural
  schema success is followed by domain, dependency, compiler, and captured-
  revision checks; none substitutes for another.
- Candidate changes name stable v2 entity IDs and permitted owner cascades.
  Observed diffs do not grant permission to mutate unrelated entities.
- A conversion refusal or compiler-ineligible valid candidate remains a refusal
  with typed reasons. The adapter cannot drop fields, flatten divergence, or
  route around an admission failure.

### Future vocabulary

After production cutover, `CONTEXT.md` can define Show as a Scene-free
composition; Layer as a stable Zone-owned identity; Layout occurrence as a
global routing interval; and Transition as an explicit two-sided junction or
accepted participant scope. The as-built references may retain “compiler
section” for derived scheduling. They should reserve “Scene” for the isolated
v1 import adapter and historical explanation.

No current glossary or reference change is part of #1033. #1043 performs the
final vocabulary sweep after the behaviors and schemas are real.

## Design-gate handoff

#1034 may implement only the additive tracer types, converter, lowerer, corpus
harness, and evidence needed to answer G0–G7. It may report unsupported records.
It must not weaken a guard, wire v2 into production, invent automatic repair, or
interpret this draft as Jon's acceptance of P1–P14.

Before #1035 or #1044 starts, the plan must replace each provisional row with an
accepted decision or an explicit bounded unsupported source domain, link the
committed #1034 evidence, and record Jon's decision. That is the required design
discussion stop after the first two tickets.

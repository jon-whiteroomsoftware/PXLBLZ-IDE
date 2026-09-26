# Show command semantics

The Show command registry in
[`src/engine/showCommandsV2/`](../../../src/engine/showCommandsV2/registry.ts)
defines edits over `ShowRecordV2` for callers of `applyShowCommandV2` and
`runShowCommandV2Transaction`. A command returns a candidate Show or a typed
refusal; the caller owns adoption, history, and persistence. This agreement
covers the registry, not every direct engine mutation or editor gesture.

MCP applies commands through `applyPrivateCommand` in
[the private executor](../../../src/engine/agentPrivateExecutor.ts), which
refuses any record that is not v2 with `unsupported-schema-version`. The v1
registry is retired; see
[differences from the retired v1 registry](#differences-from-the-retired-v1-registry).

Command evaluation has no live preview or Controller publication side effects.
Only the adopted final candidate enters the editor's [preview and delivery
publication policy](show-state-history-persistence.md#preview-and-delivery-publication).

## Agreement

- Commands preserve their input record on acceptance and refusal. Callers use
  the returned record rather than expecting an in-place edit.
- Registry names and each descriptor's fields define the invocation interface.
  Unknown commands and missing, mistyped, or unknown arguments produce typed
  issues. Domain refusal carries a reason; optional remedies and candidates
  help the caller recover. Descriptor schemas own invocation shape; the
  [generated coverage report](../show-command-coverage.md) owns the inventory.
- A valid, already-satisfied request is a no-op: it returns the original record
  with zero changes and no timestamp. A no-op step contributes no change and
  does not abort its containing batch
  ([`registry.ts:366-371`](../../../src/engine/showCommandsV2/registry.ts));
  only a refusal aborts a transaction.
- Clip, marker, and transition ids identify existing targets. Moving or resizing a Clip retains its
  identity; creation and removal follow their command's semantics. Names,
  selection, and timeline positions do not replace those ids. Overlay layers
  are addressed by index; each descriptor defines the target convention.
- A transaction evaluates commands in order against successive candidate
  records. The first refusal returns its zero-based step and issues, without
  returning a partially accepted record. Earlier successful steps do not
  mutate the caller's original record.
- A successful transaction returns one candidate and its accumulated changes.
  Persisting that candidate once is the caller's responsibility and is what
  gives the batch one editor history entry. Evaluation itself writes no store
  or durable state. An empty transaction returns the original record.

## Limits callers must preserve

The registry validates invocation shape and delegates domain acceptance to the
command. It does not establish a universal final-document validation pass or
hardware delivery readiness. Each command still applies its own preconditions
inside a transaction; a batch cannot assume every temporarily invalid
intermediate state is permitted.

The descriptor's `touches` paths describe possible writes. They are not a read
set or a proof that two commands commute. This interface supplies no document
revision comparison, concurrent merge, cancellation, or persistence guarantee.
See [Show state, history, and persistence](show-state-history-persistence.md)
for adoption and save behavior.

### Bounded final-state bulk exception

`create_clips`, `create_layers`, and `update_clips` use the versioned
[Clip and Layer authoring vocabulary](../agent-clip-layer-authoring.md). Each
command forms one private candidate and validates only its final arrangement;
ordinary command transactions retain their sequential validation contract.
This bounded exception permits ordinary Clip swaps, rotations, combined
move/resize, and cross-Layer exchange without publishing or validating a
temporary collision. Every target and destination Layer resolves against the
same original snapshot, and payload order cannot choose the result.
Projected overlay indices map to stable authored Layer IDs in every covered
Scene. A Group-only implicit Layer shell is not a direct Clip owner and refuses
as unsupported topology instead of retargeting an adjacent authored Layer.

The operation remains all-or-nothing through caller adoption. Exact timing
does not clamp, ripple, extend Show End, or cross a visual Transition window.
Unsupported Group, connected Transition, segmented-presentation, and animation
ownership topologies refuse explicitly. Property application uses existing
inspector normalization and metadata admission; shared-instance leaf writes
coalesce by canonical requested meaning and conflicts report every input path.
The 128-item bound is part of the generated schema and refuses rather than
truncating.

One successful bulk command returns at most one aggregate change. Its details
carry input mappings, direct and linked logical Clip IDs, final destination and
timing, distinct changed paths, and per-input status. A valid full no-op returns
the original record and no change, so callers create no activity, timestamp,
history, adoption, or save entry.

## Exact timeline markers

`add_marker`, `update_marker` and `remove_marker` share
[one marker owner](../../../src/engine/showMarkersV2.ts) with the
manual callbacks and legacy timeline helper entrypoints. There is no separate
move command: `update_marker` moves a Marker through its `at_ms` field.
Structured `at_ms`
values are nonnegative safe integers; fractional, nonfinite, negative and unsafe
values refuse before any rounding or clamping. Times beyond Show End remain
supported. Marker edits preserve every unrelated authored record and reference,
including composition ordering. Only the marker collection is sorted by time
then id; removing its final member leaves an empty collection.

Missing targets, duplicate marker identities and empty structured updates
refuse. A valid same-value update returns the original record and zero
changes, without a timestamp, adoption, history entry or save. Input and marker
identity validation precede that result. Name and color remain optional strings
with no new color restriction. `role` is the one nullable public input: it
accepts `chapter`, and `null` clears the chapter role.

Manual controls retain their existing time conversion and rounding, generated
names and colors, name trimming, and explicit undefined name clearing. The
manual adapter converts time before exact evaluation; the editor skips saving
successful no-ops. Marker edits do not normalize the whole composition: that
would change unrelated authored ordering. Legacy marker helpers forward to the
shared owner rather than retaining another mutation implementation.

The diagnostic adapter
derives schemas from the canonical descriptors and retains diagnostic ID
minting. Existing whole-Show admission and final authoring validation remain
responsible for the candidate; markers acquire no narrow concurrency authority.
[Engine tests](../../../src/engine/showMarkersV2.test.ts),
adapter tests and
[the evidence packet](../evidence/issue-951-exact-markers/README.md) record
preservation, protocol, history and browser qualification.

## Internal exact Clip resize

`resizeShowClipExactly` accepts a resolved logical Clip id and safe integer global
milliseconds: exactly one duration or end time, with an optional start time.
It returns a changed composition, a valid already-satisfied no-op, or a typed
refusal. All outcomes preserve the supplied Show and composition. A no-op
requires a valid composition and supported target before checking the requested
range; an unchanged low-level engine result is never sufficient evidence.

The operation selects ordinary or Layer-Transition-connected resize centrally.
Accepted results retain the named Clip's exact requested range and logical id,
including supported spans across Scenes. Connected successors move as required
by the existing authoring engine; unrelated Clips remain fixed. The result
reports changed and moved logical Clip ids. Fixed-start requests beyond the
same-Layer neighbor or Show-end capacity refuse with that range, accounting for
the downstream chain. Other engine constraints can also refuse an arrangement.

Transitions retain their identities and visual settings. Explicit leading-edge
resize that keeps the Clip's end fixed may adjust incoming Transition duration;
the result reports its previous and new duration. Segment endpoint references
follow the logical Clip when Scene coverage changes. Group-owned Clips,
Transition removal, and edits that would remove a visual Scene-boundary
Transition refuse. The manual exceptions below do not broaden the agent operation.
Resize retains each surviving physical segment's authored static opacity,
Transform and Viewport/Aperture at its source-global Scene ownership. Trimming
within a segment and extending that same segment inside its Scene retain its
record. Growth into a new Scene is supported for a uniform presentation; a
divergent logical Clip refuses when no source segment owns the new Scene.

The registry `resize_clip` descriptor owns `clip_id`, exactly one safe-integer
`duration_ms`/`end_ms`, and optional safe-integer `start_ms`. The diagnostic
adapter derives its argument leaves from this definition and delegates raw
validation and evaluation to the registry. Both return exact/no-op/refused
outcomes; capacity refusals carry `availableRange`. Changed results include the
actual target range, changed/moved logical Clip ids and Transition duration
adjustments. No duplicate overlap or time-conversion policy lives in either
adapter. The historical `resize_connected_clip` diagnostic spelling is retired;
`resize_clip` owns connected Clip resizing through the same semantic owner.

Boundary comparison normalizes both the original and planned Show through the
same existing Transition normalizer, so materializing an implicit Cut does not
falsely count as visual Transition removal. The returned Show retains every
original authored Transition, including explicit Cut identity and easing.

The operation requires a valid input composition. Registry transactions and
private grammar sessions accept no-op before/after a changed step. Wholly no-op
private work creates no history entry or candidate. The existing valid-intermediate
move-B then resize-A sequence is qualified. The separate private two-Clip
qualification below permits its retained pair to overlap; arbitrary temporarily
invalid intermediates remain outside the contract. Broad diagnostic requests retain whole-Show
admission rather than the internal qualified Layer guard.

## Private two-Clip rearrangement

An explicit diagnostic transaction may retain two distinct plain Clips on the
same Scene, Zone and Layer, including Main or an overlay, and move them through
a temporary mutual overlap. The first overlapping move requires a valid composed
input and fixes both participant identities for the rest of that transaction.
Only moves of those two Clips can subsequently mutate it, even after overlap resolves.
Commit, validation, reads and rollback remain available.

Every step retains Clip IDs, durations, instance bindings and ownership, uses
safe integer global starts within the original Scene, and reuses ordinary
placement and keyframe movement. Shared-instance tracks keep their ordinary
ownership rule. All intersecting pairs are checked; a third Clip enclosed by a
long participant is still a collision. Segmented Clips, connected Transitions,
owner changes and Group occurrences in the participants' Scene/Zone refuse.
Groups outside that ownership remain unchanged.

The capability belongs to private transaction state. Ordinary moves remain
strict, and both pending completion and commit validate the raw final composition
without overlap permission before document preparation. Unresolved overlap
cannot be normalized into success. The [candidate contract](agent-candidate-application.md#private-two-clip-rearrangement)
owns delivery and the consumer tests
cover complete records, history, refusal and private lifecycle behavior.

## Logical Clip splitting (#951)

`split_clip(clip_id, at_ms)` and manual **Split at playhead** share
`splitShowClipAtGlobalTime`. Global milliseconds retain `Math.round` execution:
a fractional request must round inside one existing Scene segment. Exact Clip
edges, exact internal Scene boundaries (including Cut), hidden Transition gaps,
missing/malformed owners, Group children and fresh-ID collisions refuse without
changing the input. This operation does not split Groups.

The left logical Clip keeps its identity; a caller-local fresh ID identifies the
right Clip. Both retain their original Pattern-instance linkage, settings and
shared instance animation. Placement curves are copied with derived IDs onto
the applicable halves, not cropped or resampled. Incoming Transitions remain on
the left root; outgoing endpoints reference the final right segment. Transition
IDs, duration, easing and other visual parameters remain unchanged.
Each split segment copies the source-global physical segment it intersects. A
split inside one physical segment therefore gives both adjacent halves that
segment's exact authored opacity, Transform and Viewport/Aperture, while physical
segments on either side keep their own records.

The split changes only the target placements, their placement tracks and attached
Transition endpoint references. Unrelated Scene/Layer ordering, Groups, markers
and other authored values survive without whole-composition normalization. The
store and file importer retain their separate normalization boundaries. Receipts
name both Clip IDs, the actual rounded split time and changed Transition endpoints;
`touches` includes those endpoint writes. The diagnostic adapter derives its
schema and outcome from the canonical descriptor, while retaining its local
fresh-ID policy.

Owner tests,
adapter/export tests
and [MCP tests](../../../src/agent-harness/test/grammarMcp.e2e.test.ts) qualify
complete records, refusal, parity, split-then-edit/move and export/Undo/Redo.


## Logical Clip duplication (#951)

`duplicate_clip(clip_id, start_ms, zone_id?, layer_id?, independent?)` and
manual **Clone** share the duplication owner in `showClipsV2`. Manual Clone
places the copy immediately after the source Clip, on its Zone and Layer, with
the same duration; the command places it at `start_ms`, defaulting Zone and
Layer to the source's. The copy shares the source Pattern instance, minting no
runtime of its own, and carries the source's entry policy. Manual Clone always
shares; the command shares unless `independent: true` is supplied, which then
gives the copy a fresh Pattern instance with copied controls and instance
tracks. Clip-owned property tracks and appearance keys are copied in
either mode, with fresh identities and times shifted by the copy's offset.
Original curves remain unchanged.

Free tails, internal Cuts and supported multi-Scene spans retain their existing
semantics. Multi-Scene placement animation, and independent multi-Scene instance
animation, remain unsupported. Occupied/protected/out-of-Show tails, full Scene
Transition-gap crossings, Group children, invalid owners and identity collisions
refuse atomically. Every accepted result validates without normalizing unrelated
authored records. Existing Transition identities and parameters, Groups, ordering,
explicit empty collections and surviving shared users remain unchanged; no
attached Transition is copied.
For a divergent static presentation, each copied Scene slice must map by the
copy's global offset to exactly one complete source physical segment, and every
distinct source presentation must remain represented. Otherwise duplication
refuses atomically; it never flattens the copy to its root segment.

The diagnostic adapter derives its invocation schema and receipt from the
canonical descriptor, while preserving diagnostic ID minting. Manual destination
drag uses the same bounded copy primitive with an explicit destination; it is a
separate duplicate-and-move composition, not tail equivalence. Store/file
normalization and whole-Show admission retain their existing ownership.
Owner tests and
adapter/import tests
cover full records, linkage, refusal and copy-then-edit/move. The `DC951` browser
case covers one adoption/save, actual export/import, Undo and stale/duplicate
response handling; it does not qualify paid inference or new concurrency scope.

## Descriptor adapters and parity

The descriptor adapter derives diagnostic fields, validation, descriptions, touches and outcome translation. Family registration retains existing identity factories and the private move wrapper. The historical `resize_connected_clip` diagnostic spelling is retired; `resize_clip` handles connected Clips through its existing owner.

Normalization belongs at the store/file boundary. Command owners preserve
unrelated authored fields and order. Layer Transition insertion, resizing and
reset, connected resizing, and their shared timeline helpers return validated
authored drafts. Moved entities retain required destination insertion order and
logical roots omit their segment-only identity field; existing siblings are not
sorted. `moveShowConnectedClipAtGlobalTime` still normalizes its output as existing
behavior outside this migration. Split's `restoreOrder` remains in place.

The golden-run oracle
checks existing id-bearing entities independently of nested entities and excludes
the Show envelope. Unnamed entity-owned fields and relative sibling order must
remain equal. Permissions come from request/receipt identities and explicit
preimage ownership: logical Clip segments, their placement/sole-instance tracks,
attached Transitions, affected timeline positions and layout occurrence members.
Deleting a permitted parent permits disappearance of its nested references.
Observed diffs and descriptor touch patterns never grant identity permissions.
Focused fault cases qualify unrelated values, nested keyframes, deletion,
undefined-field materialization and ordering, including a child insertion that
must not authorize changing its parent track's target.

The shared parity rows
compare complete canonical, diagnostic and existing manual-owner results before
normalization, preserve raw inputs, and reopen exported Shows. Stable importer
inputs account for legacy entry defaults and implicit Cuts; owner parity is
checked separately on the original authored fixtures. Refusal partitions and
private service/transaction sequences remain in the same test file.

Add Clip, make Pattern independent, rejoin Pattern instance, Insert Time and
Set Show End use that same descriptor adapter. Timeline receipts retain stable targets: `at-<rounded milliseconds>`
for Insert Time and `show-end` for Set Show End. The latter includes `before`
and `after` duration values reflecting the actual clamped result, plus removed
Scene ids and whether authored content clamped the request. Add and independence retain
caller-local fresh IDs. Fresh instances take their former lexical insertion
position on ordered input without reordering existing siblings. Add preserves
optional-field presence through the validated authored-edit helper. Rejoin
removes the source instance and its tracks only when the last user leaves,
including preserving unrelated explicitly empty track arrays.

Insert Time and Set Show End validate their results without whole-composition
normalization. Insertion orders newly created hold keys within the affected
curve and places each fresh split half beside its source; unrelated track and
instance order remain authored. Set Show End may remove one or more trailing
Scenes only when every removed Scene is composition-empty and every removed
Boundary is an ordinary Cut. It removes those Scenes and their flat compatibility
cells together, clamps a retained flat cell only when its span crossed the removed
suffix, and leaves Pattern instances, Markers and other unrelated authored fields
unchanged. Every retained Scene keeps a positive safe-integer duration.

A request that would remove meaningful visual choreography, routing, a Group
occurrence, Scene-local track, placement, routing target or sample target refuses
atomically with `unsupported-topology` and blocker ids. Visual-boundary refusals
explain that the user may explicitly reset that Boundary to Cut; other blockers
receive remedies for their own owner. Existing millisecond rounding, authored-
content clamping, Transition/Group refusal and Show End no-change behavior remain.
The shared rows cover manual/canonical/diagnostic parity and identity collisions;
`AC951`, `IC951`, `RJ951`, `IT951` and `SE951` in the existing admission table
cover saved records, file reopen, Undo and stale/duplicate delivery.

## Scene property tracks and keyframes

`add_property_track`, `edit_property_keyframes`, `add_keyframe`,
`update_keyframe`, `delete_keyframe` and `delete_property_track` share their
descriptors and pure animation owners with the diagnostic and production MCP
adapters. `move_keyframe` is retired; a time-only `update_keyframe` preserves
the keyframe's value, easing and identity. A valid already-satisfied update
returns no changes after owner validation.

Track targets retain all seven persisted kinds: instance time scale and control;
placement opacity, view, transform, viewport and Effect parameter. Short target
names resolve `opacity`, view brightness/phase, each Transform and Viewport
scalar, `effect`, `time-scale`, and `control` from a single-Scene ordinary Clip
into that same union. Effect selectors must resolve the exact placed Effect and
one numeric animatable parameter. Control selectors require both an existing
authored control target and a slider in exact captured Pattern source; they never
seed either. Selectors valid for one shortcut refuse on other shortcuts and on
persisted targets. Group and multi-Scene Clips refuse. Explicit `scene_id`
retains instance-target Scene choice; a placement target cannot name a different
Scene. The existing dependency admission policy still governs commit.

Track creation accepts exactly one constant Scene-endpoint seed or an array of
at least two strict `{ time_ms, value, easing? }` entries. Times are checked in
the owning Scene's Show-global range before rounding, convert once into
Scene-local milliseconds, and sort once; Scene endpoints are inclusive and
post-rounding collisions refuse. Easing accepts legacy presets or any structured
curve admitted by `validateShowEasing`, then normalizes once. Values pass through
the engine target constraint without clamping. Receipts retain fresh string
identities, ownership target, ownership, global keys, legacy curve names, lossless
`structuredEasing`, and evaluated samples. Instance receipts also identify the
instance and affected logical Clips in that Scene.

`edit_property_keyframes(track_id, edits)` accepts one to 128 strict entries.
Adds require global time and value and may name easing; updates require an entry
key ID and at least one of time, value, or easing; deletes accept only an entry
key ID. Unknown or null fields refuse with the edit index. Update/delete IDs all
resolve against the command-entry track and each may occur once; generated add
IDs cannot be referenced inside the same request.

The pure batch owner constructs one final key set from the preimage, then sorts
and validates the candidate once. It therefore permits time swaps and
delete/add replacement at one time without exposing a temporarily invalid
track. The final track retains its ID, target, Scene and at least two distinct
keys; orphan targets, invalid dependency metadata, times, values, easing, or
collisions refuse the whole request. An equivalent normalized update-only set
returns the original Show identity, zero changes, and no timestamp after domain
validation. Any add/delete remains a change. One track-targeted receipt reports
before/after counts, persisted target and ownership, ordered per-input results,
generated IDs, normalized global values and easing, and deleted IDs.

The single-key commands remain available. Keyframe deletion retains the two-key
minimum; deleting a track removes automation without changing its default.

Animation edits preserve raw optional fields and unrelated track order. Only
changed keyframes are sorted; a new track takes its lexical insertion position
without sorting existing siblings. The shared parity and golden tables cover
seven target kinds, every shortcut, raw preservation, pure owners and actual
Show-file reopen. Admission rows `APT953`, `AK953`, `UK953`, `DK953` and
`DPT953` continue to exercise the single-key bridge surface; the multi-key
production admission flow covers creation, atomic revision, one save/history
entry, Undo/Redo, stale/duplicate rejection, reopened source, and compiled
endpoint/interior behavior.

## Clip Effect commands (#953)

The five Clip Effect descriptors and diagnostic operations use the same inspector
and stack helpers. The finite 22-kind toolkit/schema is authoritative. Toolkit
parameter IDs and already-supported persisted-field aliases remain accepted;
unknown names and identity patches refuse. Structured numbers must be finite and
within their declared parameter bounds. Valid integer-like counts retain existing
rounding. Color strings retain the existing color parser/conversion; raw color-map
RGB components remain precise numeric inputs rather than passing through display
hex conversion. This is a finite compatibility mapping, not arbitrary patching.

Update preserves Effect identity and stack order. Duplicate inserts a fresh
identity immediately after its source without copying animation references.
Move accepts exactly one step direction or same-stage relative target with an
optional before/after edge; cross-stage targets refuse. Satisfied updates and
stage-edge or already-satisfied moves return the unchanged record with no changes.
Removal prunes matching Effect animation through the existing inspector owner;
other Effect identities, tracks and explicitly empty unrelated collections remain
authored. Shared parity rows cover Main and overlay stacks, all declared numeric
domains, colors, copies, ordering and reopened animation references. The existing
admission table contains AE953/UE953/DE953/ME953/RE953 for live consumer acceptance.

## Show metadata, output requirements and Layout occurrences

The #954 family shares canonical descriptors with the diagnostic adapter.
`rename_show` trims a nonempty name. `update_zone` permits only the existing
Zone id plus name, nominal pixel count and color; names trim and remain distinct,
counts must be finite and positive before rounding, and routing and Clips remain
unchanged. Valid already-satisfied metadata, profile, output-contract and Trails
requests return the original record with zero changes and no timestamp.

`set_stage_map(stage_map_id)` is an agent-only independent staging preference.
It does not change the output contract or target controller profile.
`set_target_controller_profile(profile_id)` remains a distinct profile-only
command. The retained experimental diagnostic `set_stage_map` input may include
`target_controller_profile_id`; that spelling evaluates the two independent
owners atomically and returns their individual receipts. Invalid profile input
discards the provisional map result. Production commands expose no combined alias.
The manual portable-reference control remains a different combined action:
`set_output_contract` follows that owner by aligning the Stage map with the
selected contract map. Its Installation branch remains agent-only. Missing or
null `map_id` clears the contract map; pixel counts remain positive integers.

`set_output_trails` requires at least one of `enabled` and `retention`. Omitted
`enabled` preserves the current enabled state, so retention-only while disabled
is a successful no-op. Enabling retains the current retention or uses the
existing default; finite retention clamps to [0, 1]. These commands edit Show
requirements only and never request a Controller provider or send to hardware.
Production authoring validation keeps missing maps and incomplete/incompatible
output requirements editable. File dependency and delivery checks remain separate;
a missing custom map still prevents file export, and Installation coverage or
Portable compatibility still blocks delivery.

`add_layout_interval` inserts an existing Layout occurrence, retaining finite
millisecond rounding; the manual Add menu's extra Layout-copy step remains
separate. `duplicate_layout_interval` retains the linked Layout identity; its
optional content copy retains the existing copied Pattern-instance behavior.
`make_layout_interval_unique` copies that occurrence's Layout and physical or
logical Zones, remapping occurrence references without making Patterns independent.
Existing unsupported boundary and multipart-Clip refusals remain in the owner.

The existing command goldens,
shared full-record parity,
and `RN954`, `SM954`, `CP954`, `UZ954`, `OC954`, `OT954`, `AI954`, `DI954`, `UI954`
[admission rows](../../../e2e/agent-baseline.auth.spec.ts) cover the finite surface.

## Differences from the retired v1 registry

The [coverage report](../show-command-coverage.md) carries the complete v2
catalogue, the v1 to v2 name map, the retired addressing table and the
refusal-code map.

Every MCP connection, bound or not, exposes the v2 catalogue (#1042). The
registered mutation tools, the server instructions, the schema and reference
resources, and the `list_commands` reply all describe that same vocabulary, so
a name a caller discovers is always a name it can call. `list_commands` reports
each descriptor's own `description`, `fields` and `exactlyOne`/`atLeastOne`/
`atMostOne` groups, including their typed nested field kinds.

A command sequence over a v2 record adopts through the store's v2
candidate-delivery admission, not through a second writer; see
[agent candidate application](agent-candidate-application.md#version-2-records-1039)
for the admission order and what a refusal leaves behind.

The agreement differs from v1 in five ways, and a descriptor census in
[`census.test.ts`](../../../src/engine/showCommandsV2/census.test.ts) enforces
each of them.

**Identity addressing only.** Every command takes stable identities from
`read_show`: `clip_id`, `layer_id`, `instance_id`, `transition_id`,
`interval_id`, `track_id`, `keyframe_id`, `marker_id`, `effect_id`,
`group_occurrence_id`. A derived Cut junction is addressed by its
`(from_clip_id, to_clip_id)` pair. `scene_id`, `layer: "main" | index`,
`overlay_layer_index`, the `at_ms` / `after_clip_id` Boundary lookup and
`target_clip_id` on rejoin all retire with no runtime alias. Layer stacking is
authored by `rank`, `above_layer_id` or `below_layer_id`; index words retire.

**A uniform no-op.** v1 validated some already-satisfied requests and refused
others. For every v2 command, an already-satisfied valid request
returns `unchanged` with zero changes, creates no history, timestamp or save,
and does not abort its containing batch. No v2 command refuses because the
desired state already exists; setting the current Show End is a no-op, not a
refusal. Only a genuinely invalid or refused request aborts a transaction.

**Fully typed inputs.** There is no `json` field kind. Closed sets are enums,
numeric ranges carry schema bounds rather than only descriptions, `null` is
accepted only where the field documents clearing, and bulk arrays carry 1 to
128 items. The Effect and Aperture shape parameters are compact records
validated by the appearance owner, with their names and ranges published in the
[versioned authoring reference](../../../src/engine/showCommandsV2/authoringReference.ts).

**One affected-entity vocabulary.** A changed command reports the same fourteen
collections in `changes[].details` — `clips`, `instances`, `transitions`,
`tracks`, `layoutDefinitions`, `layoutIntervals`, `groupDefinitions`,
`groupOccurrences`, `layers`, `markers`, `appearanceKeys`, `propertyKeys`,
`removed` and `discardedControlTargets` — translated from the owner's own
result without invention, widening or loss. Requested scope is the command
input; affected scope is this.

**Owner-backed refusals.** A command never restates a domain rule. It resolves
identities, mints the fresh identities its owner requires (a pure owner never
allocates identity), and passes the owner's typed refusal code through. Every
catalogue row now reaches a landed owner capability, so the catalogue
emits no `unsupported` code and the refusal-code map no longer publishes one.
The two rows that previously refused that way are landed: the Marker
`role: chapter` argument goes to the Marker owner, which authors and clears the
role, and a `update_clips` Zone or Layer change goes to the Clip temporal owner's
re-placement intent, whose routing, occupancy, contribution-availability and
participant-Transition refusals pass through with their own codes
(`missing-target`, `invalid-result`, `zone-unavailable`, `invalid-topology`).

# Show command semantics

The Show command registry defines edits for callers of `applyShowCommand` and
`runShowCommandTransaction`. A command returns a candidate Show or a typed
refusal; the caller owns adoption, history, and persistence. This agreement
covers the registry, not every direct engine mutation or editor gesture.

This document describes the v1 registry, which is what production MCP exposes.
The prepared v2 catalogue is a separate registry with its own agreement; see
[the prepared v2 catalogue](#the-prepared-v2-catalogue) below. Nothing in this
document changes until the coordinated cutover in #1039.

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
- An unchanged engine identity result alone is a typed refusal, not success.
  `resize_clip`, `move_clip`, `move_marker` and `update_marker` separately validate an already-satisfied request and return
  the original record with zero changes and no timestamp. Metadata/output setters also validate and accept already-satisfied requests. Other
  commands explicitly refuse no change, such as setting the current Show End. Such a step aborts its containing batch; replay is not guaranteed to
  succeed merely because the desired state already exists.
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

## Ownership and evidence

[Registry types and evaluation](../../../src/engine/showCommands/registry.ts)
own this interface; the imported command families own operation semantics.
[Registry tests](../../../src/engine/showCommands/registry.test.ts) exercise
input validation, representative immutable edits and refusals, ordered batches,
and failure without partial mutation.
[Command tests](../../../src/engine/showCommands/commands.test.ts) exercise
individual outcomes, including retained Clip target ids for move and resize.
These are executable examples, not exhaustive proof over every possible Show.

## Exact timeline markers

`add_marker`, `move_marker`, `update_marker` and `remove_marker` share
[one marker owner](../../../src/engine/showExactTimelineMarker.ts) with the
manual callbacks and legacy timeline helper entrypoints. Structured `at_ms`
values are nonnegative safe integers; fractional, nonfinite, negative and unsafe
values refuse before any rounding or clamping. Times beyond Show End remain
supported. Marker edits preserve every unrelated authored record and reference,
including composition ordering. Only the marker collection is sorted by time
then id; removing its final member omits the collection.

Missing targets, duplicate marker identities and empty structured updates
refuse. A valid same-value move or update returns the original record and zero
changes, without a timestamp, adoption, history entry or save. Input and marker
identity validation precede that result. Name and color remain optional strings;
no nullable public input or new color restriction is introduced.

Manual controls retain their existing time conversion and rounding, generated
names and colors, name trimming, and explicit undefined name clearing. The
manual adapter converts time before exact evaluation; the editor skips saving
successful no-ops. Marker edits do not normalize the whole composition: that
would change unrelated authored ordering. Legacy marker helpers forward to the
shared owner rather than retaining another mutation implementation.

The [diagnostic adapter](../../../src/agent-harness/grammar/operations/descriptorAdapter.ts)
derives schemas from the canonical descriptors and retains diagnostic ID
minting. Existing whole-Show admission and final authoring validation remain
responsible for the candidate; markers acquire no narrow concurrency authority.
[Engine tests](../../../src/engine/showExactTimelineMarker.test.ts),
[adapter tests](../../../src/agent-harness/test/commandParity.test.ts) and
[the evidence packet](../evidence/issue-951-exact-markers/README.md) record
preservation, protocol, history and browser qualification.

## Internal exact Clip move

`move_clip(clip_id, start_ms?, zone_id?, layer?)` moves the named logical Clip
to an exact safe integer global millisecond, Zone, or Layer. Callers give at
least one of the three destination fields. The optional Layer is `main` or a
nonnegative safe integer overlay index. Every omitted field retains its current
private-candidate value, including Start. Both the registry and diagnostic MCP
schema expose this finite union; neither exposes `move_connected_clip` as a
callable alias. A changed receipt reports the actual projected Zone, Layer,
Start, End, and Duration after acceptance.

The shared owner selects ordinary or Transition-connected movement. Plain Clips
can change Zone and Layer and repartition across supported internal Scene Cuts.
A connected chain moves rigidly on its existing Zone and Layer, retaining every
logical Clip's duration, relative offset and Transition settings. Segment endpoint
references may change when Scene repartitioning requires it. Placement animation
and sole-user instance animation follow their existing engine ownership rules;
shared instance animation retains shared ownership. Unrelated Clips never ripple.
Static opacity, Transform and Viewport/Aperture differences move by the same
global offset as their source physical segments. The move is supported only when
each destination Scene slice can retain one complete authored presentation and
every distinct source presentation remains represented. A destination Scene that
would merge two divergent pieces, or a destination Transition gap that would hide
one, refuses atomically instead of selecting a replacement presentation.

Invalid targets or times, occupied destinations, out-of-Show chains, Group-owned
Clips and incompatible connected destinations refuse without a candidate. The
owner validates the input before recognizing a no-op. After engine refusal,
projected whole-chain bounds and target-Layer intersections supply
`outside-timeline` or `occupied` diagnostics with a remedy and the blocking
Clip identity. Other unsupported failures retain typed domain refusal. Ordinary movement cannot
detach a Transition or break a visual Scene-boundary junction. Normalized implicit
Cut materialization is not visual loss. Explicit reset-to-Cut followed by move is
an independently supported disconnect sequence.

Existing manual drag behavior can detach a Clip when changing Layer and remove
broken visual Scene-boundary Transitions. Those manual-only behaviors remain in
the existing callbacks; this owner does not replace them. Supported ordinary
moves are paired against the same manual engine. The diagnostic adapter uses
whole-Show admission and the existing one-adoption history/save policy; move has
no narrow current-state dependency admission in this slice. The separately
qualified private pair transaction below retains its scoped overlap capability.

[Exact move owner](../../../src/engine/showExactClipMove.ts),
[owner fixtures](../../../src/engine/showExactClipMove.test.ts),
[adapter fixtures](../../../src/agent-harness/test/commandParity.test.ts) and the
real editor `M951` sequence in
[the browser baseline](../../../e2e/agent-baseline.auth.spec.ts) cover these forms.
The diagnostic schema derives from the canonical descriptor and retains no
ordinary geometry implementation; its explicit private-pair path remains separate.

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

### Manual resize commits

Ordinary pointer and composition-inspector duration commits use
`resizeShowClipManually`, which delegates to the exact owner. Start-only inspector
edits remain connected move operations; other inspector properties and Group
isolation retain their existing owners. The inspector refuses excess duration.
Pointer feedback may bound a fixed-start end resize to the exact owner's reported
capacity; release submits that painted integer extent again, never the preview
composition. A 12000 ms pointer request can paint and commit 8000 ms while the
same 12000 ms exact inspector/agent request refuses.

Only two source-qualified manual Transition exceptions use legacy Show
canonicalization: a fixed-end leading-edge edit reducing an incoming Layer Transition
to zero, and a resize breaking a visual Scene-boundary junction into a Cut.
The exact owner tags these specific refusals; invalid sources, unknown targets,
Group ownership, other topology failures and capacity refusals do not trigger
that path. Group children remain editable through their separate isolation
inspector. Boundary-to-Cut edits collapse boundary time and therefore remain
outside exact global-range equivalence with agent requests.

A malformed historical cross-Scene Layer Transition is rejected by the real
Show-file importer, with a repaired-record positive control. Its legacy engine
repair remains a diagnostic, not an accepted source for the shared operation.
A separate valid-source multi-Scene fixture proves endpoint retargeting and
complete manual/canonical record parity.

Pointer release conservatively refuses if the captured Show, composition or
current saved/draft identity changed. It does not replay independent metadata
edits. Accepted changes retain the editor's Pattern-slot persistence wrapper and
ordinary store history/save recovery; no-op, refusal and cancellation save nothing.
This semantic convergence does not migrate manual callbacks to agent admission
or qualify Layer-independent model context, arbitrary private batches or live
active-input waiting. [Manual proof](../evidence/issue-950-resize/manual.md)
records the finite consumer cases.

[Adapter/session/artifact and route evidence](../evidence/issue-950-resize/README.md)
records the bounded qualifications and residuals.

[Exact resize owner](../../../src/engine/showExactClipResize.ts) delegates to the
existing timeline and Layer Transition engines.
[Exact resize tests](../../../src/engine/showExactClipResize.test.ts) qualify
complete compositions, projected ranges, retained identities, connected timing,
immutable refusals, Main/overlay bounds, logical Scene spans and supported no-op
classification. These pure cases supply no adoption or browser evidence.

### Diagnostic move-then-resize qualification

The finite move-B-then-resize-A batch uses the private grammar transaction and
conservative whole-Show editor admission. The exact resize owner receives a valid
intermediate record after the move; its valid-input precondition is unchanged.
No partial candidate escapes a declared refusal, incomplete completion or failed
final validation. A refused operation may still be repaired within the existing
private transaction; refusal is not a permanent taint on later corrected work.
The [candidate contract](agent-candidate-application.md#bounded-mixed-batches)
and [consumer evidence](../evidence/issue-950-resize/mixed-batch.md) bound this
qualification. Other grammar commands and arbitrary temporary invalidity remain
outside it.

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
owns delivery and the [consumer tests](../../../src/agent-harness/test/privateClipRearrangement.test.ts)
cover complete records, history, refusal and private lifecycle behavior.

## Overlay Layer creation (#951)

`add_overlay_layer(zone_id)` inserts a fresh empty Layer at overlay index zero
in every composition Scene. Its name is Layer N, where N is the target Zone's
maximum realized overlay count plus one. Before insertion, the Group owner
realizes any implicit Layer shells needed by target-Zone occurrences, using the
same IDs, names and ordinal rules as Group materialization. Existing Layer IDs,
memberships and all unrelated authored content keep their ordering and values.
Group ordinal addressing is bottom-based, so inserting above those shells
preserves resolved Layer identities without rewriting Group definitions or
occurrences. Other Zones are not realized as a side effect.

The existing `addShowOverlayLayerAcrossTimeline` helper is the sole mutation
owner for the manual Add menu, canonical descriptor and descriptor-derived
diagnostic adapter. Callers mint their own fresh per-Scene IDs: manual and
canonical callers retain UUIDs, diagnostic callers retain deterministic IDs.
The owner requires an exact one-to-one Scene mapping, nonempty unique fresh
Layer IDs, existing Scene/Zone owners and a valid composition before mutation.
Invalid mappings and collisions, including implicit shell identities, refuse
atomically without a timestamp change.
The operation does not normalize unrelated composition content.

Each new invocation creates a Layer. Duplicate response delivery is governed
by existing request admission, which prevents a second adoption/save. A manual
Layer insertion invalidates a pending whole-Show request, so an old overlay
index cannot silently retarget after insertion. No narrow admission is granted.

[Focused fixtures](../../../src/engine/showCommands/overlayLayer.test.ts),
[adapter parity](../../../src/agent-harness/test/commandParity.test.ts)
and [consumer evidence](../evidence/issue-951-overlay-layer/README.md) qualify
the creation boundary.

## Overlay Layer addressing, reorder, and removal (#1012–#1014)

Overlay Layer indices are zero-based and front-to-back: index zero is topmost;
Main remains below every overlay. Repeated `add_overlay_layer` calls insert at
zero and shift the earlier new Layer down. Its receipt states the accepted Zone
and `layer: 0`.

`add_clip` targets Main when both Layer fields are omitted. New callers use
`layer`, whose value is `main` or a nonnegative safe integer overlay index;
`overlay_layer_index` remains a compatibility spelling. Supplying both spellings
refuses even when their values agree. Its changed receipt reports the accepted
Zone, Layer, Start, End, Duration, and Pattern-instance identity, so clamping or
Show extension cannot leave the caller reasoning from its request alone.

`reorder_overlay_layer(zone_id, layer_index, target_index)` moves one complete
explicit Layer across every Scene. `target_index` is the final index after
removal and reinsertion. The operation preserves each Layer object, Clip,
identity, setting, and reference. Its receipt identifies the selected Layer in
each Scene and maps every old index to its new index. A validated same-index
request succeeds without a timestamp change.

`remove_overlay_layer(zone_id, layer_index)` removes exactly the requested
explicit Layer across every Scene only when it is empty in all of them. A
nonempty request refuses with `layer-not-empty` and the deduplicated logical Clip
identities that must move or be removed first. Its receipt identifies the
removed Layer in each Scene and maps the removed index to `null` while compacting
surviving indices.

Whole-Layer reorder and removal deliberately cover a finite topology. The Show
must have at least one valid composition Scene; the target Zone must have an
explicit row and the same explicit overlay count in every Scene; and no Group
occurrence may use that Zone. Groups in other Zones are preserved. Sparse
stacks and target-Zone Groups refuse atomically. Transactions resolve every
numeric index against the preceding private candidate, while editor admission
and request replay protection prevent an old or duplicate request from silently
retargeting a shifted Layer.

[Whole-Layer owner fixtures](../../../src/engine/showOverlayLayerAuthoring.test.ts)
prove stack permutations, empty-only removal, compositing output, topology
partitions, and preservation. [Command fixtures](../../../src/engine/showCommands/layers.test.ts)
cover Layer-addressed Clip sequences, rollback, receipts, canonical/diagnostic
parity, and `.pxlshow` reopen.

## Logical Clip removal (#951, #1023)

`remove_clip(clip_id)` removes every Scene segment of a direct logical Clip,
its placement-owned tracks and attached Layer Transitions. Pattern instances
used by those segments and their instance-owned tracks are removed only when
no surviving direct Clip uses the instance. Unrelated pre-existing orphan
instances and tracks remain unchanged. Removing an instance forfeits the
cast-bound deterministic-loop stamp; shared-instance removal retains it.

The whole-Show owner also examines visual Scene boundaries touched by the
deleted Clip's original physical segments. It retains a boundary when the
post-delete Show still has a Layer junction, incoming destination content, or
property-transition carrier anywhere across its Zones and Layers. When none of
those dependencies remains, a supported positive-duration visual boundary is
replaced by the same stable-id Cut while its duration becomes ordinary time in
the destination Scene. Destination-local direct placements, Scene-local
Property keyframes, and Group occurrences move forward by that duration;
Pattern-instance private time does not. Existing global Clip ranges, markers,
later Scene starts, routing events, and explicit Show End therefore stay fixed.

Missing targets, Group children, malformed composition owners and removal of
the last logical Clip refuse. A compound boundary repair also refuses
atomically when its finite preservation domain cannot cover a direct Pattern
instance shared across the boundary, output feedback state, ambiguous ownership,
or malformed timing. Surviving identities, ranges,
settings, Layer order, Groups and routing remain unchanged. The owner validates
its complete result without normalizing unrelated authored content. Refusal
returns the exact original Show, so callers create no adoption, history, or
save entry. Dependency refusals retain their precise engine reason as the
command issue code and name the affected Boundary Transition and related IDs;
the last-Clip refusal keeps its existing code and remedy.

The canonical descriptor supplies the diagnostic invocation schema and touch
inventory. Ordinary manual deletion and confirmed connected deletion call the
same validated whole-Show owner, `deleteShowClipInShow`, which composes
`deleteShowClipWithLayerTransitions` with boundary eligibility and the explicit
time-preserving conversion. Before manual deletion, an editor viewing a flat
Show projects it to the canonical composition with resolved Pattern sources and
adopts the repaired whole Show in the same save and history entry. Missing
sources refuse deletion instead of guessing projection metadata. The legacy
store `removeClip` helper remains a flat-model compatibility operation and is
not a manual deletion owner. The existing connected confirmation remains the
manual consent surface. Adoption, one-save history, and whole-Show revision
admission retain their existing owners.

The explicit conversion can repair a known affected saved boundary by stable
Transition ID, but hydration, import, and save do not guess which historical
zero-junction effects were unwanted. Automatic classification of those
already-saved records remains outside this contract; there is no blanket
legacy normalization.

[Removal evidence](../evidence/issue-951-remove-clip/README.md) records the
original logical-removal qualification. The #1023 engine, command, playback,
component, export, and authenticated browser fixtures qualify the bounded
boundary-time repair. Group deletion and other Clip commands remain outside
this slice.

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

[Owner tests](../../../src/engine/showCommands/splitClip.test.ts),
[adapter/export tests](../../../src/agent-harness/test/commandParity.test.ts)
and [MCP tests](../../../src/agent-harness/test/grammarMcp.e2e.test.ts) qualify
complete records, refusal, parity, split-then-edit/move and export/Undo/Redo.


## Logical Clip duplication (#951)

`duplicate_clip(clip_id, linked?)` and manual **Clone** share the duplication
owner in `showTimelineClipAuthoring`. The copy begins immediately after the
source's complete logical span, with the same duration and Layer. Manual Clone
and omitted/false linkage create an independent Pattern instance; true linkage
shares the existing instance. Independent copies retain settings, clone supported
instance animation and invalidate the cast-bound deterministic-loop proof.
Linked copies retain the cast and proof. Supported placement animation is copied
in either mode, with fresh derived track/keyframe identities and shifted local
Scene time. Original curves remain unchanged.

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
[Owner tests](../../../src/engine/showCommands/duplicateClip.test.ts) and
[adapter/import tests](../../../src/agent-harness/test/commandParity.test.ts)
cover full records, linkage, refusal and copy-then-edit/move. The `DC951` browser
case covers one adoption/save, actual export/import, Undo and stale/duplicate
response handling; it does not qualify paid inference or new concurrency scope.

## Boundary command family (#952)

`set_boundary_transition`, `set_boundary_transition_timing`,
`update_boundary_transition_parameter` and `set_boundary_layout` share one
resolver and the generic descriptor adapter. Each request supplies exactly one
stable `transition_id`, `at_ms`, or `after_clip_id`. A stable ID addresses the
shared Scene Boundary identity across Zones. Time or preceding-Clip references
must resolve one projected junction; multiple Zone/Layer matches refuse instead
of selecting the first. Within-Scene Layer junctions remain separate targets.

A same-kind setter request preserves custom settings, including easing; an
explicit `variant` selects the existing presentation defaults, with an optional
rounded duration override. Direct kind changes retain the existing normalizer's
kind defaults and authored crossfade policy. Cut resets visual parameters and
property ramps while retaining Boundary identity and easing. A direct non-Cut
kind request from Cut requires positive duration; an explicit variant can supply
its duration default. Timing accepts duration, easing, or both; zero/negative
durations refuse and easing can be a supported preset or validated structured
curve. Parameter edits retain the finite persisted variant fields and typed
presentation conversion, including duration, geometry, color and easing. Existing
owner clamping remains in effect; no arbitrary property assignment is exposed.

The three visual commands delegate to the existing Boundary owner. It now
normalizes only the targeted transition, preserving unrelated raw entities and
sibling order. `set_boundary_layout` is an agent-only exact routing-owner setter:
set, replace, or clear a switch with an existing Layout ID or null. It preserves
visual Boundary state and Layout definitions. Valid already-satisfied requests
return the original record with no changes; invalid requests still refuse before
no-op handling. Old diagnostic junction spellings have no duplicate definitions.

[Shared parity cases](../../../src/agent-harness/test/commandParity.test.ts)
cover every existing visual kind/variant, actual manual delegates, file reopen,
selector ambiguity, raw preservation, and private no-op/refused transactions.
The four `BT952`/`BTT952`/`BTP952`/`BL952`
[admission rows](../../../e2e/agent-baseline.auth.spec.ts) cover the real scripted
bridge, one adoption/save, full-record export/reopen, Undo and stale/duplicate
responses. They qualify deterministic tool execution, not paid model inference.

## Layer Transition commands

`insert_layer_transition`, `resize_layer_transition` and
`reset_layer_transition_to_cut` share canonical descriptors with the diagnostic
adapter. Insertion applies preset defaults before explicit rounded duration and
easing. Resizing retains the owner's extent limits; zero resets to Cut and a
valid unchanged duration is a no-op. Invalid compositions still refuse before
no-op handling. Endpoint shifts retain their existing track and intrinsic timing
rules. When those shifts affect a Boundary, `canonicalizeBoundaryAfterShift`
retains its existing Cut-reset behavior.

The shared parity table covers Main and overlay Layers, the variant catalogue,
raw unrelated-field preservation, refusals, rollback and Undo. Its generated
artifact sequence reopens both Show and compiled Pattern exports. The existing
admission table's `ILT952`, `RLT952`, `RLC952` and `CCR952` rows exercise insertion,
resizing, Cut reset and connected Clip resizing through the real bridge.

## Descriptor adapters and parity

The [descriptor adapter](../../../src/agent-harness/grammar/operations/descriptorAdapter.ts) derives diagnostic fields, validation, descriptions, touches and outcome translation. Family registration retains existing identity factories and the private move wrapper. The historical `resize_connected_clip` diagnostic spelling is retired; `resize_clip` handles connected Clips through its existing owner.

Normalization belongs at the store/file boundary. Command owners preserve
unrelated authored fields and order. Layer Transition insertion, resizing and
reset, connected resizing, and their shared timeline helpers return validated
authored drafts. Moved entities retain required destination insertion order and
logical roots omit their segment-only identity field; existing siblings are not
sorted. `moveShowConnectedClipAtGlobalTime` still normalizes its output as existing
behavior outside this migration. Split's `restoreOrder` remains in place.

The [golden-run oracle](../../../src/engine/showCommands/commands.test.ts)
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

The [shared parity rows](../../../src/agent-harness/test/commandParity.test.ts)
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

## Clip property commands (#953, #1011, #1017)

`set_clip_view`, `set_clip_control_target`, `set_clip_time` and
`set_clip_evaluation` delegate to the existing Clip inspector owner through the
same descriptor adapter. View edits affect the logical Clip's placements;
controls, time and evaluation affect its shared Pattern instance. Making the
Pattern independent remains the explicit Clip-only preparation. These commands
do not restart playback, move timeline positions or change Show duration.

`set_clip_aperture`, `set_clip_opacity` and `set_clip_transform` use that same
placement owner for the static fields shown by the Clip inspector. A command
targets every physical segment of one logical Clip. Omitted Aperture and
Transform fields merge with each segment's own current value, so permitted
per-segment differences survive. This exception is limited to opacity,
Transform and Viewport/Aperture: a logical Clip with different Pattern
ownership, Layer/Zone topology, View values, Effects, or presentation state
still refuses before any field changes.
Later split, resize, move and duplicate operations retain those independent
records when the resulting Scene slices can represent them exactly. The
structural operation refuses atomically when a destination Scene or Transition
gap would require choosing or dropping one divergent presentation.

Opacity accepts finite values from 0 through 1. Transform accepts normalized
position from -4 through 4, rotation from -8 through 8 turns, and scale from
0.01 through 8. Aperture accepts enabled state; normalized frame X/Y from -4
through 4 and Width/Height from 0.01 through 8; all fourteen silhouettes; Hard,
Soft or Dither edge; optional feather from 0.001 through 1; silhouette rotation
from -1 through 1 turn; invert; and the bounded parameter owned by Ring,
Rounded box, Cross, Star, Crescent or Regular polygon. A shape parameter is
valid only when every affected segment's effective silhouette owns it. Changing
shape drops obsolete shape-owned fields instead of retaining state that could
later revive.

Nullable Aperture overrides clear back to their automatic defaults. Disabling
an Aperture retains its authored frame and style, and re-enabling restores them.
Transform and Aperture remain independent: the fixed mask evaluates Zone
coordinates while Content position, rotation and scale change the Pattern
sample behind it. Main opacity fades toward black; overlay opacity remains the
source-over weight against lower Layers. Existing property tracks are retained.
Receipts report the changed physical placements, exact static before/after
values, and any requested properties that currently have animation tracks.
Validated no-ops preserve the original record and timestamp.

Structured requests refuse values outside phase/brightness/control target 0–1,
time scale 0–4 and time offset 0–60000 ms, naming the supported range. Valid
fractional millisecond offsets retain existing rounding and report the resulting
integer offset. Omitted fields remain authored; already-satisfied requests return
the original record with no changes. Clearing an absent target is a no-op.

Control setting requires captured actual Pattern source declaring the slider,
using the existing metadata parser. Missing source and unknown or removed sliders
refuse, including otherwise-satisfied requests. The manual inspector and command
share shallow changed-target validation; unchanged legacy targets remain intact.
Existing captured/current authoring dependency validation remains authoritative,
including its pre-existing missing-dependency policy. Metadata is execution
context, never model-authored arguments. Clearing a target also removes its
matching automation tracks through the existing owner.

Pattern replacement requires authoritative bundled destination slider metadata.
Unavailable source or a failed dependency bundle refuses the direct Clip, Group
Clip, or Pattern-slot replacement without changing authored controls or tracks.
A successfully inspected Pattern with no sliders remains authoritative empty
metadata and deliberately removes incompatible controls and their tracks.

Shared goldens, raw untouched-field checks and canonical/diagnostic/manual parity
cover this family with existing fixtures. Static inspector commands additionally
compile reopened, divergent logical segments and sample their independent mask,
Transform and opacity output. `V953`, `C953`, `T953` and `E953` use the common
live admission table for durable saves, actual file reopen, Undo, stale refusal
and duplicate delivery; the static inspector batch uses the same private
admission and one-history/one-save boundary.

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

The existing [command goldens](../../../src/engine/showCommands/commands.test.ts),
[shared full-record parity](../../../src/agent-harness/test/commandParity.test.ts),
and `RN954`, `SM954`, `CP954`, `UZ954`, `OC954`, `OT954`, `AI954`, `DI954`, `UI954`
[admission rows](../../../e2e/agent-baseline.auth.spec.ts) cover the finite surface.

## The prepared v2 catalogue

`applyShowCommandV2` and `runShowCommandV2Transaction` in
[`src/engine/showCommandsV2/`](../../../src/engine/showCommandsV2/registry.ts)
are the prepared v2 registry over `ShowRecordV2` and the v2 engine owners. They
are not activated: `agentMcpRouting` exposes them only under its explicit
`catalogue: 'v2'` option, and production keeps the v1 registry above until the
coordinated cutover in #1039. The [coverage report](../show-command-coverage.md)
carries the complete catalogue, the v1 to v2 name map, the retired addressing
table and the refusal-code map.

One connection exposes exactly one catalogue. The registered mutation tools,
the server instructions, the schema and reference resources, and the
`list_commands` reply all describe that same vocabulary, so a name a caller
discovers is always a name it can call. `list_commands` reports each
descriptor's own `description`, `fields` and `exactlyOne`/`atLeastOne`/
`atMostOne` groups; under `catalogue: 'v2'` those are the v2 descriptors,
including their typed nested field kinds. Selecting a catalogue never mixes
the two (#1039).

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

**A uniform no-op.** This supersedes the per-command exceptions in the
Agreement above. For every v2 command, an already-satisfied valid request
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
catalogue row now reaches a landed owner capability, so the prepared catalogue
emits no `unsupported` code and the refusal-code map no longer publishes one.
The two rows that previously refused that way are landed: the Marker
`role: chapter` argument goes to the Marker owner, which authors and clears the
role, and a `update_clips` Zone or Layer change goes to the Clip temporal owner's
re-placement intent, whose routing, occupancy, contribution-availability and
participant-Transition refusals pass through with their own codes
(`missing-target`, `invalid-result`, `zone-unavailable`, `invalid-topology`).

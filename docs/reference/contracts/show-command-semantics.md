# Show command semantics

The Show command registry defines edits for callers of `applyShowCommand` and
`runShowCommandTransaction`. A command returns a candidate Show or a typed
refusal; the caller owns adoption, history, and persistence. This agreement
covers the registry, not every direct engine mutation or editor gesture.

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
  the original record with zero changes and no timestamp. Some
  commands also explicitly refuse no change, such as renaming to the current
  name. Such a step aborts its containing batch; replay is not guaranteed to
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

`move_clip(clip_id, start_ms, zone_id?, layer?)` moves the named logical Clip
exactly in safe integer global milliseconds. The optional Layer is `main` or a
nonnegative safe integer overlay index. Omitted destination fields retain the
current Zone and Layer. Both the registry and diagnostic MCP schema expose this
finite union; neither exposes `move_connected_clip` as a callable alias.

The shared owner selects ordinary or Transition-connected movement. Plain Clips
can change Zone and Layer and repartition across supported internal Scene Cuts.
A connected chain moves rigidly on its existing Zone and Layer, retaining every
logical Clip's duration, relative offset and Transition settings. Segment endpoint
references may change when Scene repartitioning requires it. Placement animation
and sole-user instance animation follow their existing engine ownership rules;
shared instance animation retains shared ownership. Unrelated Clips never ripple.

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

The registry `resize_clip` descriptor owns `clip_id`, exactly one safe-integer
`duration_ms`/`end_ms`, and optional safe-integer `start_ms`. The diagnostic
adapter derives its argument leaves from this definition and delegates raw
validation and evaluation to the registry. Both return exact/no-op/refused
outcomes; capacity refusals carry `availableRange`. Changed results include the
actual target range, changed/moved logical Clip ids and Transition duration
adjustments. No duplicate overlap or time-conversion policy lives in either
adapter. The diagnostic `resize_connected_clip` spelling is historical
compatibility through the same owner, not a production alias.

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
this boundary. Layer removal/reorder, Group creation and add_clip migration
remain outside this slice.

## Logical Clip removal (#951)

`remove_clip(clip_id)` removes every Scene segment of a direct logical Clip,
its placement-owned tracks and attached Layer Transitions. Pattern instances
used by those segments and their instance-owned tracks are removed only when
no surviving direct Clip uses the instance. Unrelated pre-existing orphan
instances and tracks remain unchanged. Removing an instance forfeits the
cast-bound deterministic-loop stamp; shared-instance removal retains it.

Missing targets, Group children, malformed composition owners and removal of
the last logical Clip refuse. Surviving identities, ranges, settings, Layer
order, Groups and routing remain unchanged. The owner validates its complete
result without normalizing unrelated authored content.

The canonical descriptor supplies the diagnostic invocation schema and touch
inventory. Ordinary manual deletion and confirmed connected deletion call the
same validated owner, `deleteShowClipWithLayerTransitions`, which delegates to
the logical placement deletion in `showCompositionModel`. The existing connected
confirmation remains the manual consent surface. Adoption, one-save history,
and whole-Show revision admission retain their existing owners.

[Removal evidence](../evidence/issue-951-remove-clip/README.md) records complete
output, dependency preservation, protocol and browser checks. Group deletion,
other Clip commands and narrow candidate admission remain outside this slice.

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

## Descriptor adapters and parity

The [descriptor adapter](../../../src/agent-harness/grammar/operations/descriptorAdapter.ts) derives diagnostic fields, validation, descriptions, touches and outcome translation. Family registration retains existing identity factories; the private move wrapper and historical diagnostic resize spelling keep their existing scope.

Normalization belongs at the store/file boundary. Command owners preserve
unrelated authored fields and order rather than normalizing the whole composition.
Existing delegated helpers `replaceLogicalClipGlobalSpan`, `moveShowClip` and
`resizeShowClipAtGlobalTime` in `showTimelineClipAuthoring.ts`, plus Layer-transition
insertion, resizing and reset owners in `showLayerTransitionAuthoring.ts`, still
normalize composition output. These remain existing behavior. Split's
`restoreOrder` remains in place; migrating these residual families is separate
from the five-operation Slice B.

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
and `after` duration values reflecting the actual clamped result. Add and independence retain
caller-local fresh IDs. Fresh instances take their former lexical insertion
position on ordered input without reordering existing siblings. Add preserves
optional-field presence through the validated authored-edit helper. Rejoin
removes the source instance and its tracks only when the last user leaves,
including preserving unrelated explicitly empty track arrays.

Insert Time and Set Show End validate their results without whole-composition
normalization. Insertion orders newly created hold keys within the affected
curve and places each fresh split half beside its source; unrelated track and
instance order remain authored. Existing millisecond rounding, duration clamping,
Transition/Group refusal and Show End no-change refusal remain unchanged.
The shared rows cover manual/canonical/diagnostic parity and identity collisions;
`AC951`, `IC951`, `RJ951`, `IT951` and `SE951` in the existing admission table
cover saved records, file reopen, Undo and stale/duplicate delivery.

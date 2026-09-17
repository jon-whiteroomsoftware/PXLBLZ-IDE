# Additive v2 Group edit contract

`makeShowGroupUniqueV2` makes one linked Group occurrence structurally unique.
It receives an immutable v2 record, the selected occurrence ID and a complete
caller-supplied identity plan. The plan names the new Group definition and maps
every definition-local Pattern instance, Layer, Clip, Transition, Property track,
appearance key and Property key to a fresh nonblank ID. Missing, extraneous,
duplicate, blank or already-owned IDs refuse before a candidate is exposed.

`moveShowGroupOccurrenceV2` and `duplicateShowGroupOccurrenceV2` edit one
occurrence shell without changing its Group definition or creating a runtime.
Both receive a complete caller-supplied placement: start, Layout occurrence,
Zone, one destination binding for every definition Layer, and both translation
coordinates. Duplicate also requires one fresh nonblank occurrence ID. The owner
never infers a destination or allocates an identity.

The changed result contains a complete unaliased record and affected collections
for Clips, Pattern instances, Transitions, tracks, Layouts, Groups, Layers,
Markers, appearance keys, Property keys, hoisted instances, removed IDs and
discarded controls. This operation leaves unrelated collections empty. Refusal
and no-op return the original record identity and empty affected collections.
Make Unique on an occurrence whose definition already has one user is a no-op.

## Lossless ordinary selection creation

`createShowGroupFromSelectionV2` in `showGroupCreationV2.ts` takes explicit
ordinary same-Zone Clip IDs, the complete internal Transition selection, a fresh
definition and occurrence identity, name, the first-selected-start origin, and
complete caller-supplied local identity maps. Initial placement retains the
original destination Layers, zero translation and empty holds. Each distinct
selected runtime contributes one definition slot explicitly bound to the SAME
authoritative top-level runtime. Templates are copies, not new runtimes.

Instance-, Layout- and Show-owned tracks stay global exactly once; selected
Clip-owned tracks, appearance and keys subtract only the origin. Values, easing,
retained descriptors, Effect IDs and Restart policies stay exact. Keys retain
owner-scoped uniqueness; unrelated owners may reuse raw IDs. Identity maps must
be complete, closed, nonblank and fresh for the cloned owner. Materialized IDs
must also pass complete candidate validation.

Jon accepted atomic refusal for any selection the existing format cannot
represent losslessly. Activation outside the selected local duration, partial
chains, existing Group children, whole-output/multi-participant Transitions and
Transition ramps refuse without edits/history/save. A single-Layer pair with
both endpoints selected and no ramps maps its complete settings/duration/easing.
No crop, pairwise rewrite, GC, hoist, source coalescing, schema or compiler
expansion is introduced. Full persisted/materialized/Layout and shared RL08–RL10
validation run before a changed result escapes. Source-dependent final
preparation remains outside this pure owner.

The affected result names removed ordinary owners and added definition-local
owners, the new definition/occurrence, and every affected nested raw key ID.
Repeated key strings in distinct owners remain repeated. Original authoritative
instances/global tracks and unrelated definitions/occurrences remain unchanged.
Refusal returns the exact input record and empty affected collections.

## Runtime authority

The edit resolves every selected definition slot before cloning. The effective
runtime ID never changes:

- An explicit binding to `composition.patternInstances` reads that top-level
  record as authoritative. A stale definition-slot source, controls, clock or
  evaluation policy is not a second writer.
- An unbound slot uses the stable `group:[definitionId,slotId]` runtime ID. If no
  top-level record owns that ID, Make Unique hoists the slot payload under the
  same ID and binds the cloned slot to it. Hoisting persists one record and does
  not mint another runtime.
- Existing unbound occurrences resolve a hoisted top-level record as authority.
  Multiple definition-slot claims for an otherwise unowned runtime must be
  byte-compatible; incompatible claims refuse during materialization and import.

`groupRuntimeBindings` exposes the resolved occurrence, slot, runtime ID,
authority kind and authoritative payload. `materializeShowGroupsV2` consumes the
same resolution, so validation, edit planning and compilation cannot choose
different payload writers.

## Structural clone

The cloned definition remaps all internal Clip-to-instance, Clip-to-Layer,
Transition endpoint and Property target references. The selected occurrence keeps
its ID, Layout association, Zone, start, translations, destination Layer IDs,
track activation and complete hold list. Its local binding keys and Group Layer
keys follow the new definition IDs; every runtime binding value stays unchanged.
The old definition and all other occurrences remain byte-for-byte unchanged.
Make Unique never collects definitions or instances and never copies animation
into an ordinary owner.

## Move and linked duplicate

Move preserves the selected occurrence ID, definition, runtime bindings, holds,
and all definition-local choreography. It replaces only the complete placement.
When the occurrence owns an explicit global `trackActivation`, the operation
shifts its start by the placement delta and preserves its duration. Using the
complete materialized preimage, Move also shifts persisted top-level instance
control/time-scale tracks whose runtime has exactly one effective Clip user,
and that Clip belongs to the moved occurrence. Activation and key times shift
once by the placement delta; duration, key IDs, values and retained curve
descriptors remain unchanged. Future and invisible users count as sharing.
Multi-user, unused-binding and unrelated runtime tracks remain fixed; definition-
local animation moves through materialization without a second translation.
An exact complete-placement match is
an unchanged result with the original record identity.

Linked duplicate copies the occurrence shell under the supplied fresh ID. It
shares the same definition and effective runtime bindings, deep-copies holds and
Layer bindings, and shifts an owned `trackActivation` by the same placement
delta. It creates no Pattern instance, definition, Clip, Transition, Property
track, or runtime owner. Occurrence-qualified materialized identities derive
from the supplied occurrence ID.

Both operations validate the preimage, explicit placement, complete materialized
record, and public Layout-availability projection before exposing a candidate.
This owns collision, Show End, Layout coverage, Transition attachment, and
effective instance-target track conflicts. Exact half-open track adjacency is
accepted; overlapping owners of one effective runtime target refuse. Restart
events remain transient: move shifts the first-contribution event, duplicate
adds an event on the same runtime, and simultaneous events use the existing
coalescing rule. A hold extends choreography without creating another event.
Move and linked duplicate also run the shared RL08–RL10 Transition-placement
check after materializing all Groups. A materialized child entering an ordinary
or definition-local positive Transition window, or a placement creating
independent overlapping positive windows, refuses atomically as
compiler-ineligible.

Changed results contain the persisted occurrence ID in
`affectedGroupOccurrenceIds`. Move additionally reports shifted top-level track
IDs in `affectedTrackIds` and their owner-scoped key IDs in
`affectedPropertyKeyIds`, preserving repeated raw key strings across tracks.
All other affected collections remain empty; duplicate never reports or copies
global tracks. Invalid shifted activation/key times, full candidate ownership,
Layout and placement restrictions refuse atomically with no affected IDs.
Transient materialized child IDs are recomputable and are not reported as
persisted edits.

## Selected-occurrence Ungroup

`ungroupShowGroupOccurrenceV2` removes one occurrence shell and persists that
occurrence's existing materialized Clips, Transitions, Property tracks and
nested keys as ordinary v2 owners. It selects exact occurrence-plus-local IDs;
it never uses a prefix match or remints the materializer's deterministic IDs.
Occurrence holds, translation, Layer bindings, track activation and local time
are fully baked into the persisted projection. Restart remains the projected
Clip's entry policy and continues to derive transiently at first contribution.

Ungroup preserves every effective runtime ID. A selected runtime that already
has a top-level authoritative Pattern-instance record reuses it unchanged. A
missing top-level authority is hoisted once from `groupRuntimeBindings` under
the same runtime ID; this adds a persisted record without creating a runtime.
Other occurrence and definition records remain byte-identical. Ungroup retains
an unused Group definition and every existing top-level instance because
definition and instance collection are separate explicit policies.

The changed result reports every newly persisted Clip, Transition, track and
nested key, the removed occurrence, and only newly hoisted instance records.
Appearance and Property key identities are owner-scoped by the v2 schema. Their
flat affected arrays therefore contain one raw persisted ID per affected nested
key and preserve repeated strings when distinct Clip or track owners use the same
key ID; the corresponding affected Clip/track arrays identify the owner
collections. `removedIds` contains the occurrence ID. Hold records are consumed
into projected time and keys rather than reported as independently addressable
removed owners.

Complete record and Layout-availability validation run before the candidate is
returned. Invalid preimages, missing occurrences, materialized identity
collisions, Transition detachment, Layout/Show End errors and effective
instance-track conflicts refuse atomically with the original record and empty
affected collections. Compile eligibility remains an explicit
`prepareShowV2ForCompile` concern; Ungroup does not widen compiler APIs.

## Selected-occurrence deletion

`deleteShowGroupOccurrenceV2` takes exactly `{ kind: 'delete-occurrence',
occurrenceId }`. It removes that exact persisted occurrence shell without
matching ID prefixes, moving surviving content or collecting definitions,
Pattern-instance payloads, authored tracks, nested keys, Layers, Layouts or
Markers. The selected definition becomes dormant when its last occurrence is
removed. Explicit bindings keep their existing authority rules; deletion never
hoists or manufactures a runtime.
Existing IDs use the validator's nonempty-string domain and remain exact;
whitespace is not trimmed or normalized during target selection.

Complete preimage/result record and Layout validation and the shared materialized
RL08–RL10 placement check enforce references, timing and effective ownership.
Invalid intents/preimages and missing or already removed IDs refuse with original
record identity and empty affected collections. Changed results are unaliased;
only `affectedGroupOccurrenceIds` and `removedIds` contain the removed shell ID.
Transient materialized children, hold keys and Restart events are recomputable
contributions rather than separately removed persisted owners.

Canonical §9 permits final-content deletion to leave a structurally valid,
editable/saveable empty Show. No placeholder or general compiler-refusal bypass
is added. Reopened persistence and zero effective Clip count prove the pure
empty result; the landed `isValidatedEmptyShowV2` route capability makes preview
and export unavailable until content is added. Public preparation's existing
behavior is preserved rather than forced to refuse. Deletion does not own store
history, save or capability rendering.

[Deletion tests](../../../src/engine/showGroupDeletionV2.test.ts) compare nonempty
reopened Fast/Fidelity artifacts against an independently authored surviving
schedule. Removing a shared runtime's animation/Restart contributor can change
its surviving playback; this is intentional, and the oracle retains the actual
surviving schedule rather than asserting all output stays unchanged. An
independent surviving runtime separately proves exact unchanged output. Tests
also cover holds, linked/explicit/default authority, dormant slots/unused authored
tracks, duplicate/delete, Make Unique/delete, exact IDs and full empty reopening
followed by reuse of the retained definition.

## Evidence and limits

[Selection creation tests](../../../src/engine/showGroupCreationV2.test.ts) prove
lossless local references, owner-scoped explicit identities, atomic representation
refusals, global owner preservation, native Fast/Precise sharing and Restart,
retained local curves and held lifecycle interoperability. The
[test-design packet](../evidence/issue-1038-group-create/test-design.json) records
independent oracles and five named semantic faults. Its inherited section-arithmetic
witness is separate from exact grouping playback proof.

[Group identity tests](../../../src/engine/showGroupEditsV2.test.ts) reopen the
candidate, inspect every mapped reference and affected collection, prove top-level
authority and one-time default hoisting for bound, unbound and mixed slots, reject
identity-plan and incompatible-claim partitions atomically, and replay reopened
Fast and Fidelity artifacts across held and Restart boundaries. Existing
[Group tests](../../../src/engine/showV2Groups.test.ts) prove the authority change
through the ordinary materialization and compile-preparation seams.

The same tests reopen move, duplicate and Ungroup results, derive exact held child and
Restart times, exercise Layout and effective-track refusals, and compare an
independently authored oracle with generated Fast and Fidelity `.epe` output and
replay state. Group placement tests force ordinary and materialized Transition
window conflicts and confirm the same refusals through
`prepareShowV2ForCompile`; this edit owner does not widen the compiler.

This owner covers Make Unique, occurrence move, linked duplicate and
selected-occurrence Ungroup and deletion. Global Insert Time and Layer authoring
have their own owners ([timeline edits](show-v2-timeline-edits.md),
`showLayersV2.ts`). Route adoption is landed:
`admitShowV2PilotGroupOccurrenceEdit` and `ShowV2GroupOccurrenceEditor` drive
these five operations through the closed prepared-edit admission path
([occurrence adoption](show-v2-group-occurrence-adoption.md)). These operations do
not impose definition deletion or garbage-collection policy.

Definition-local Clip Pattern replacement has its own pure owner and
[replacement contract](show-v2-group-replacement.md).

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
An occurrence whose definition already has one user is a no-op.

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
shifts its start by the placement delta and preserves its duration. It does not
shift unrelated top-level instance tracks. An exact complete-placement match is
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

Changed results contain only the persisted occurrence ID in
`affectedGroupOccurrenceIds`; all other affected collections remain empty.
Transient materialized child IDs are recomputable and are not reported as
persisted edits.

## Evidence and limits

[Group identity tests](../../../src/engine/showGroupEditsV2.test.ts) reopen the
candidate, inspect every mapped reference and affected collection, prove top-level
authority and one-time default hoisting for bound, unbound and mixed slots, reject
identity-plan and incompatible-claim partitions atomically, and replay reopened
Fast and Fidelity artifacts across held and Restart boundaries. Existing
[Group tests](../../../src/engine/showV2Groups.test.ts) prove the authority change
through the ordinary materialization and compile-preparation seams.

The same tests reopen move and duplicate results, derive exact held child and
Restart times, exercise Layout and effective-track refusals, and compare an
independently authored oracle with generated Fast and Fidelity `.epe` output and
replay state. Compile eligibility remains explicit through
`prepareShowV2ForCompile`; this edit owner does not widen the compiler.

This owner covers Make Unique, occurrence move, and linked duplicate. Group
delete and ungroup, global Insert Time, Layer authoring, UI and store adoption
remain separate #1038 owners. These operations do not impose deletion or garbage
collection policy.

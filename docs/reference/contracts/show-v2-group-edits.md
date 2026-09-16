# Additive v2 Group identity edit contract

`makeShowGroupUniqueV2` makes one linked Group occurrence structurally unique.
It receives an immutable v2 record, the selected occurrence ID and a complete
caller-supplied identity plan. The plan names the new Group definition and maps
every definition-local Pattern instance, Layer, Clip, Transition, Property track,
appearance key and Property key to a fresh nonblank ID. Missing, extraneous,
duplicate, blank or already-owned IDs refuse before a candidate is exposed.

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

## Evidence and limits

[Group identity tests](../../../src/engine/showGroupEditsV2.test.ts) reopen the
candidate, inspect every mapped reference and affected collection, prove top-level
authority and one-time default hoisting for bound, unbound and mixed slots, reject
identity-plan and incompatible-claim partitions atomically, and replay reopened
Fast and Fidelity artifacts across held and Restart boundaries. Existing
[Group tests](../../../src/engine/showV2Groups.test.ts) prove the authority change
through the ordinary materialization and compile-preparation seams.

This slice owns Make Unique only. Group move, duplicate, delete and ungroup,
global Insert Time, Layer authoring, UI and store adoption remain separate #1038
owners.

# Additive v2 Layout occurrence edit contract

`editShowLayoutIntervalsV2(record, intent)` owns immutable Layout occurrence,
routing-transfer and Show End edits for the provisional v2 engine. It is not
connected to production commands, editor history, persistence or export. Those
adapters remain pending coordinated v2 adoption.

## Result and ownership boundary

A changed result contains a complete unaliased record and the affected Layout
occurrence, Layout definition, Group occurrence and track identities. Refusal or
no-op returns the input record by reference and empty affected sets. The owner
does not change timestamps, Clips, Pattern instances, Marker records, stores or
providers.

The accepted intents are:

- Insert a fresh occurrence at a strict interior time, splitting coverage without
  moving content.
- Append a fresh occurrence and extend Show End by its positive duration.
- Move a noninitial switch while keeping its right boundary and all unrelated
  authored times fixed.
- Select an existing Layout definition or replace occurrence routing parameters.
- Add, edit or remove one positive incoming transfer owned by its destination.
- Make a repeated Layout definition unique by cloning only the definition. Zone
  identities and content remain shared.
- Remove an occurrence without owned track or transfer data, extending its
  predecessor or promoting the next occurrence to zero.
- Set Show End exactly when no protected authored interval crosses the new end.

Every accepted result covers `[0, showEndMs)` exactly with positive occurrences.
Group `layoutOccurrenceId` is recomputed from its start time after a boundary
edit. A neighboring transfer source is rebound to the newly adjacent occurrence.
Occurrence split-position tracks retain their global times; an edit that would
move activation outside the occurrence refuses.

## Routing transfers and availability

A stored incoming transfer is positive, starts at its destination occurrence,
references the immediately preceding occurrence and fits both adjacent occurrence
durations and Show End. A zero-duration switch has no transfer object.

`validateClipLayoutAvailabilityV2(record, clipIds?)` is the shared read-only
oracle for Clip edits. It checks the complete contribution interval, including
incoming and outgoing Layer or whole-output Transition windows, against every
intersected Layout occurrence. It returns structured entity, Zone, contribution
and failing Layout identities. `validateShowLayoutAvailabilityV2(record)` adds
materialized Group children. Layouts with neither logical routing nor physical
ranges use the record's nominal Zone set, matching the existing v2 conversion
fallback.

A Clip or Group may span any number of switches when its Zone exists throughout
the complete contribution interval. Lowering may create transient sections but
preserves the authored Clip, runtime and sampling identities. An unavailable
Zone refuses; the owner never reroutes or restarts content implicitly.

The v1 adapter omits source placements that contributed no pixels because their
Zone was absent, and emits a distinct `--layout-N` Clip when that Zone returns.
The Clip keeps the same Pattern instance with Continue entry. Lowering recognizes
only those adapter-owned segment IDs and reconstructs a transient unrouted carrier
for the silent gap, preserving the original runtime clock and routed `pixelCount`
without putting an unavailable-Zone Clip in the v2 record. The pinned showcase
artifacts retain byte-identical generated source and Fast/Precise output and state;
their intermediate recipe objects differ because the v2 record now expresses the
absence explicitly.

## Show End protection

Extension lengthens only the final Layout occurrence. Shortening protects Clip
and materialized Group contribution ends, Property-track activation, timed
transfer windows and transfer/track data on removed occurrences. Empty plain
occurrences starting at or after the new end are removed, and the retained final
occurrence is truncated. Markers remain unchanged beyond Show End. The caller's
ordinary snapshot history supplies Undo; this pure owner does not create history.

## Evidence and limits

[Owner tests](../../../src/engine/showLayoutIntervalsV2.test.ts) cover immutable
accepted/refused results, half-open lookup, occurrence insertion/move/removal,
definition uniqueness, transfer rebinding, track protection, Group spanning,
Transition contribution bounds, codec reopen and exact Show End changes. A
spanning Clip compiles and executes in Fast and Precise modes with one continuous
runtime across the switch. The combined
[Layout/Transition tests](../../../src/engine/showV2MixedLayout.test.ts) run the
owner at visual-window start, interior and end partitions and distinguish an
accepted domain edit from the current bounded compiler-adapter refusal.

Group occurrence-local holds are owned by #1038. This owner consumes materialized
Group contribution, so hold-aware duration and child projection must receive the
same availability checks when that representation lands. Production Undo/Redo,
provider readback, `.pxlshow`/`.epe` route proof and UI remain integration work.

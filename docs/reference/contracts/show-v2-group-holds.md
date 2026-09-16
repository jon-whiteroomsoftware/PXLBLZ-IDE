# Additive v2 Group occurrence hold contract

A persisted `ShowGroupOccurrenceV2` owns a required `holds` array. Each hold has
a nonblank occurrence-local ID, a safe-integer `localTimeMs` strictly inside the
shared definition duration, and a positive safe-integer `durationMs`. Hold IDs
are unique within the occurrence and positions are stored in strictly increasing
order. Validation rejects invalid order, boundaries and checked-duration overflow;
it does not normalize the authored bytes.

`groupDuration(definition)` remains the definition-local duration. The derived
occurrence duration is that value plus every hold duration. This extended interval
participates in Show End, collision and every intersected Layout availability
check.

## Half-open projection

For occurrence start `s`, local boundary `x` and holds `(h, d)`:

```text
before(x) = s + x + sum(d where h < x)
after(x)  = s + x + sum(d where h <= x)
```

A child end uses `before`; a child start uses `after`; a child strictly spanning
a hold keeps one identity and extends through it. Property activation follows the
same convention. Appearance and Property values use the original right-boundary
value throughout `[before(h), after(h))`; the original outgoing curve resumes at
`after(h)` with its retained nonlinear descriptor. Authored keys retain their IDs
at their mapped authored times. Derived hold/resume keys use deterministic,
collision-checked occurrence-qualified IDs.

Materialization preserves the Group definition, runtime bindings and shared
runtime identity. It derives Restart once at the mapped first contribution; held
time does not add a Restart event. A hold strictly inside an internal positive
Transition refuses. Holds at either endpoint map the complete unchanged-duration
window and then fail current exact participant attachment validation; a hold
strictly before the window shifts both participant boundaries together and keeps
the Transition valid.

The exact Property time transform lives in
`showPropertyTrackTimeMappingV2.ts`. `insertTimeInShowPropertyTracksV2` retains
its public signature and delegates to that acyclic kernel; Group materialization
uses the same kernel rather than approximating curves independently.

## Evidence and limits

[Group tests](../../../src/engine/showV2Groups.test.ts) cover endpoint/spanning
mapping, multiple holds, appearance and nonlinear Property retention, internal
Transition attachment, effective conflicts, Layout availability, Show End,
Restart and runtime identity. They reopen persisted v2 and generated `.epe`
artifacts, then compare Fast and Fidelity frames and state with an independently
authored ordinary-v2 record. [Codec tests](../../../src/engine/showCompositionV2.test.ts)
cover required storage, identity, ordering, boundary, duration and overflow
partitions. [Property time tests](../../../src/engine/showPropertyTrackTimeMappingV2.test.ts)
cover an exact discontinuous last key and authored-key identity retention.

This slice supplies representation and materialization. The
[Group edit contract](show-v2-group-edits.md) owns Make Unique plus occurrence
move and linked duplicate on this representation. `showLayersV2.ts` owns pure
Layer add, rename, reorder and explicit reassignment/removal, with its proof in
[the Layer test design](../evidence/issue-1038-layers/test-design.json). The Group
edit owner persists exact held projections during selected-occurrence Ungroup.
Global Insert Time, Group delete, and production UI/store adoption remain later
#1038 owners; the landed route pilot consumes holds through the existing
v2 codec and compile-preparation seams rather than redefining them.

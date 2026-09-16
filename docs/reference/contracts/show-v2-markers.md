# Show v2 Markers

Canonical authority is [the Scene-retirement specification](../../plans/scene-retirement-specification.md)
§§8–9. `editShowMarkerV2(record, intent)` owns exact general Marker add, move,
update and remove. The Marker remains `{ id, timeMs, name?, color? }`; chapter
role/projection belongs to #1040.

Intent contains only its named fields. Add supplies a complete explicit Marker;
move supplies identity and exact time; update supplies identity and a nonempty
patch of time/name/color; remove supplies identity. Reject unsupported operations,
fields, missing identity, duplicate add identity, missing target and invalid values.
Time is a nonnegative safe integer; it may exceed Show End. IDs remain exact
nonempty strings, and names/colors may be empty strings. Explicit `undefined`
clears optional name/color; it cannot clear required time or identity. The operation
never clamps times, creates IDs, removes dormant guides or changes playback.

Changed records are complete and unaliased, validated and ordered by `(timeMs,id)`.
The ID tie-breaker uses exact UTF-16 code-unit lexical order, independent of host
locale, with no Unicode normalization. Canonically equivalent but distinct IDs
remain distinct and yield the same stored order regardless of insertion order.
Only the Marker array changes; `updatedAt`, choreography, runtime identities and
payloads stay exact. The v2 array remains present when the last Marker is removed.
Equal-time Markers retain distinct identities. An update/move with identical
result returns `unchanged` with the original record identity, including optional
clearing of an already absent field. Empty patches are invalid intent. Refusals
return the original record identity and no affected entities; validators never
repair the preimage.

Results use the existing §9 affected collection vocabulary. Changed operations
report the selected ID in `affectedMarkerIds`; removal also reports it in
`removedIds`. Every other collection stays empty. No-op/refusal collections all
stay empty. Adoption owns clocks, history, save and revision checks.

[Owner tests](../../../src/engine/showMarkersV2.test.ts) serialize/reopen records,
assert exact unaffected content and unaliasing, and prepare the existing compiler
with trusted Libraries. Fixed-provenance `.epe` exports reopen with unchanged
source and run identical Fast/Precise frames and state across boundaries and loop.
[Test design](../evidence/issue-1038-markers/test-design.json) records partitions,
sequences and focused fault-sensitive oracles. The owner does not change schema,
compiler, Set Show End, UI/store or the production v1 Marker path.

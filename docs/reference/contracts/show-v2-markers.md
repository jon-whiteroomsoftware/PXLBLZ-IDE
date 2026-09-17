# Show v2 Markers

Canonical authority is [the Scene-retirement specification](../../plans/scene-retirement-specification.md)
§§8–9. `editShowMarkerV2(record, intent)` owns exact general Marker add, move,
update and remove. The v2 Marker is `{ id, timeMs, name?, color?, role? }`, where
`role` is the single enumerated narrative value `chapter` (§3 delta 7). The v1
Marker is unchanged and carries no role.

Intent contains only its named fields. Add supplies a complete explicit Marker;
move supplies identity and exact time; update supplies identity and a nonempty
patch of time/name/color/role; remove supplies identity. Reject unsupported operations,
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

## Chapter role and projection

`role: 'chapter'` marks a Marker as a narrative chapter. It owns no time
partition, playback trigger or Clip ownership: compiled output, recipes and
runtime state are identical with and without it. The TypeScript `ShowMarkerV2`,
the provisional v2 schema, the tracer codec and the domain validator carry the
role together; the schema admits `chapter` alone, so an unknown role is a codec
refusal rather than a silently stripped field. Export and reopen through a v2
`.pxlshow` bundle preserve the role exactly.

V1 conversion marks every former Scene label as a chapter at its original global
start. When a pre-existing Marker already has that exact name and time, the
chapter is absorbed into it: identity, time, name and color stay exactly as
authored and only the role is promoted, so no duplicate guide appears and the
source accounting still maps those leaves to that Marker. Every other Marker
stays general-purpose, including one at the same time with a different name.

`showChaptersV2(record)` in [`showChaptersV2.ts`](../../../src/engine/showChaptersV2.ts)
is the Gallery, reading-card, Live and v2 pilot timeline projection. It selects `role: 'chapter'`
Markers only, orders them by `(timeMs, id)` with the same exact UTF-16
code-unit tie-break the Marker owner stores, and derives each chapter's span
from the next chapter start, clamped to Show End. Equal-time chapters remain
separate selectable entries with zero-length leading spans; a dormant chapter
beyond Show End projects a zero span. A time with no chapter yields no chapter —
`showChapterIndexAtV2` returns `-1` before the first start and never synthesizes
a label. At an exact equal-time start it resolves to the last such chapter in
projection order, so the current selection is deterministic without merging
identities.

`galleryShowChapters(show)` applies that projection to the prepared native v2
stock record behind a Gallery Show. The Gallery band and the public reading card
print no Scene count, the reading card's arc is the chapter list with each span
derived from the next chapter start, and the Live preview captions the chapter
the loop is inside. The v2 pilot's Marker panel shows the same projection
read-only. Playback, compilation and stored Gallery keyframes still run on the
pinned legacy v1 record; #1039 owns activation. Both catalogues therefore ship
until #1042 retires the legacy builder, which costs a measured 96.0 kB
minified / 16.8 kB gzipped in the production bundle. Prepared Feature Guide wording
for the vocabulary is held in
[chapter wording](../../plans/show-v2-chapter-wording.md) and is unpublished.

The general Marker owner authors the role explicitly. `add` accepts an optional
`role` on the complete Marker and `update` accepts it in the patch, where explicit
`undefined` clears it exactly as it clears `name` and `color`. `chapter` is the
only admitted value, so any other role is `invalid-intent` and returns the
original record rather than storing an unknown value. Promotion and clearing
change the role alone: identity, time, name and color stay exactly as authored,
and `move` and `remove` still preserve an existing role. A role is never inferred,
so a general alignment Marker becomes a chapter only when an author or the v1
conversion says so. This supersedes the earlier rule that the general owner could
not author a role, which #1040 landed before the #1041 command carried the field.

Results use the existing §9 affected collection vocabulary. Changed operations
report the selected ID in `affectedMarkerIds`; removal also reports it in
`removedIds`. Every other collection stays empty. No-op/refusal collections all
stay empty. Adoption owns clocks, history, save and revision checks.

[Chapter tests](../../../src/engine/showChaptersV2.test.ts) cover the no-chapter,
converted Scene label, absorbed same-name/time Marker, general Marker and
equal-time partitions, the codec refusal, the `.pxlshow` round trip and identical
compiled output. [Native catalogue tests](../../../src/pixelblaze/stock/showsV2.test.ts)
assert every stock Show's chapters reproduce its legacy Scene arc, and
[the pilot route spec](../../../e2e/show-v2-chapters.auth.spec.ts) drives
absorption, role preservation and the saved-byte round trip in a real browser.
[Test design](../evidence/issue-1040-native-stock/test-design.json)
records their partitions and fault-sensitivity checks.
[Owner tests](../../../src/engine/showMarkersV2.test.ts) serialize/reopen records,
assert exact unaffected content and unaliasing, and prepare the existing compiler
with trusted Libraries. Fixed-provenance `.epe` exports reopen with unchanged
source and run identical Fast/Precise frames and state across boundaries and loop.
[Test design](../evidence/issue-1038-markers/test-design.json) records partitions,
sequences and focused fault-sensitive oracles. The owner does not change schema,
compiler, Set Show End, UI/store or the production v1 Marker path.

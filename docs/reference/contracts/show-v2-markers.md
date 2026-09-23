# Show v2 Markers

Canonical authority is [the Scene-retirement specification](../../plans/scene-retirement-specification.md)
§§8–9. `editShowMarkerV2(record, intent)` owns exact general Marker add, move,
update and remove. The v2 Marker is `{ id, timeMs, name?, color?, role?, origin? }`, where
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

## Conversion provenance and editor visibility

The existing editor is to preserve the visible Marker set when a Show converts
from v1. A chapter Marker newly created from a former Scene label carries
`origin: 'converted-scene-label'`. An authored Marker that coincides with a Scene
label (same name and time) is never absorbed into it: conversion mints the label
beside it, and the authored Marker keeps its identity, color, role and editor
visibility unchanged (#1068 ruling 1a). The origin is explicit conversion provenance, never
inferred from a Marker ID, name, time or chapter role.

The field exists so the existing editor can omit exactly these Markers from its
timeline. The filter itself lives in the existing-editor connection
(`src/engine/showEditorTimelinePresentation.ts`) and lands with that candidate of
#1065, together with its proof: as of the record change that adds the field,
nothing filters on it and every Marker is still projected. Chapter consumers
continue to select by `role: 'chapter'`, including converted Scene labels.
Provenance has no timing, ownership, compilation or playback meaning. Native
Markers and records without origin remain visible by default; an older v2 record
without provenance cannot be classified retroactively from a naming heuristic.
Reconversion from an available v1 source supplies the distinction reliably.

`converted-scene-label` is the sole admitted origin value. The record schema,
codec and `.pxlshow` round trip preserve it and refuse unknown origin values.
General Marker commands do not author conversion provenance: their accepted
intent fields remain unchanged, while edits, history and persistence preserve
origin on an existing Marker. No editor control or text is added for provenance.

This narrow contract extension was approved by Jon for #1065 after paired browser
inspection showed converted Scene labels that the original editor did not draw.
Required proof distinguishes newly created chapter Markers, authored Markers
that coincide with a Scene label, authored IDs resembling conversion IDs, missing provenance, and unknown
origin values, as well as unchanged chapter output and compiled playback. The
timeline omission is proved by the existing-editor connection candidate that
implements it.

## Chapter role and projection

`role: 'chapter'` marks a Marker as a narrative chapter. It owns no time
partition, playback trigger or Clip ownership: compiled output, recipes and
runtime state are identical with and without it. The TypeScript `ShowMarkerV2`,
the provisional v2 schema, the tracer codec and the domain validator carry the
role together; the schema admits `chapter` alone, so an unknown role is a codec
refusal rather than a silently stripped field. Export and reopen through a v2
`.pxlshow` bundle preserve the role exactly.

V1 conversion marks every former Scene label as a chapter at its original global
start, always as a newly minted Marker with conversion provenance. A pre-existing
Marker with that exact name and time is left exactly as authored, role included,
and its source leaves map to it unchanged. v1 has two things at such a start, a
derived Scene start that moves under a boundary reclaim and an authored Marker
that does not, and one v2 Marker cannot be both; the boundary repair moves only
the minted label (#1068 ruling 1a). Every authored Marker stays general-purpose.

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
converted Scene label, coinciding authored Marker, general Marker and
equal-time partitions, the codec refusal, the `.pxlshow` round trip and identical
compiled output. [Native catalogue tests](../../../src/pixelblaze/stock/showsV2.test.ts)
assert every stock Show's chapters reproduce its legacy Scene arc.
[Test design](../evidence/issue-1040-native-stock/test-design.json)
records their partitions and fault-sensitivity checks.
[Owner tests](../../../src/engine/showMarkersV2.test.ts) serialize/reopen records,
assert exact unaffected content and unaliasing, and prepare the existing compiler
with trusted Libraries. Fixed-provenance `.epe` exports reopen with unchanged
source and run identical Fast/Precise frames and state across boundaries and loop.
[Test design](../evidence/issue-1038-markers/test-design.json) records partitions,
sequences and focused fault-sensitive oracles. The owner does not change schema,
compiler, Set Show End, UI/store or the production v1 Marker path.

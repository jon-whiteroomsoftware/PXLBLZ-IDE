# Additive v2 Layout occurrence edit contract

`editShowLayoutIntervalsV2(record, intent)` owns immutable Layout occurrence,
routing-transfer and Show End edits for the provisional v2 engine. Production v1
commands, editor history, persistence and export still do not call it. Its landed
consumers are `admitShowV2PilotLayoutOccurrenceEdit` and
`admitShowV2PilotSetShowEnd` on the gated `?show-v2-editor=1` route (removed by #1067 Stage 1)
([occurrence adoption](show-v2-layout-occurrence-adoption.md)); coordinated
production adoption remains #1039's work.

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
- Duplicate one occurrence immediately after itself, empty or with its content.

A changed result also reports the affected Marker and Transition identities.
Every accepted result covers `[0, showEndMs)` exactly with positive occurrences.
Group `layoutOccurrenceId` is recomputed from its start time after a boundary
edit. A neighboring transfer source is rebound to the newly adjacent occurrence.
Occurrence split-position tracks retain their global times; an edit that would
move activation outside the occurrence refuses.

## Routing transfers and availability

A stored incoming transfer is positive, starts at its destination occurrence,
references the immediately preceding occurrence and fits both adjacent occurrence
durations and Show End. A zero-duration switch has no transfer object.

### Converted zero-duration switch provenance

That execution invariant is unchanged, so an occurrence may instead carry the
inert sibling `incomingSwitch` described in
[conversion provenance](show-v2-conversion-provenance.md). It owns no content,
so this owner's outcomes are unchanged by its presence:

- No intent authors, edits or clears it.
- Setting a timed transfer on its occurrence discards it; authored content
  supersedes a description of a boundary that no longer exists.
- Occurrence removal still refuses only for real timed transfers and owned
  tracks. A removed occurrence takes its own provenance with it, and a switch
  whose described boundary is gone - source occurrence removed, an occurrence
  inserted between, or its identity taken by an authored transfer - is
  discarded rather than rebound to a relationship the author never made.
- Discarding provenance reports no affected entity. The same edit on the same
  record without the metadata returns the same status, the same affected sets,
  and the same record once the metadata is stripped.

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
The visible Clip keeps the same Pattern instance with Continue entry. A wholly
unrouted placement is recorded as `retired-silent-runtime-use`; conversion emits
no hidden activation or carrier for it. This explicit compatibility exception
can change later Pattern state and output when the old silent placement advanced
a runtime before its first visible use. The parity report measures those changes,
accounts for every pinned showcase, and keeps unaffected recipe, source, output
and state comparisons exact.

An occurrence-owned `layout-split-position` Property track lowers directly into
the routed scalar recipe. Lowering retains any nonlinear `curveSegment`, suppresses
the base zero-duration assignment during authored activation and restores the
occurrence baseline at the exclusive activation end. Overlapping authored tracks
or an overlap with an existing positive routing ramp refuse before compilation.
The direct composition lowerer refuses this target because only
`prepareShowV2ForCompile` attaches the transient routed scalar recipe.

## Occurrence duplication

`{ kind: 'duplicate', occurrenceId, newOccurrenceId, content? }` inserts one fresh
occurrence of the same Layout definition, duration and routing parameters
immediately after the source occurrence. Show End grows by the source duration.
Every authored Clip, Property track, Marker, whole-output Transition window,
Group occurrence and Layout occurrence starting at or after the source end moves
later by exactly that duration, once. Content inside the source interval keeps its
authored times. The new occurrence owns no incoming transfer; a following
occurrence's transfer rebinds to it and is revalidated against both durations.

Content that crosses the duplicated boundary refuses with
`boundary-crossing-content`: a Clip, Property track or Group occurrence strictly
spanning the source end, a whole-output window strictly spanning it, a Transition
whose endpoint Clips fall on both sides, or a Layout transfer strictly spanning it.
Duplication never extends, splits, holds or reroutes crossing content.

Omitting `content` duplicates an empty span. Supplying it copies the Clips wholly
inside the interval with their appearance keys, their Clip-owned Property tracks
and keyframes, the Transitions whose participants are all copied Clips, and the
Group occurrences starting inside, each shifted by the source duration. The copies
keep their source `instanceId`, `entryPolicy`, sampling and Group definition and
runtime bindings, so duplication mints no Pattern runtime. `idsBySourceId` must
name exactly the copied source identities and map each to a fresh, unique,
unowned identity; anything else refuses with `invalid-intent` before any change.
A copied Transition carrying `propertyRamps` refuses with
`unsupported-content-copy`; project those ramps into tracks first.

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
runtime across the switch. The
[duplication tests](../../../src/engine/showLayoutIntervalDuplicateV2.test.ts)
cover the empty and content partitions, single-shift later content, unchanged
Pattern instances, exact identity-plan refusals and every boundary-crossing
refusal, reopening each accepted record through the codec. The combined
[Layout/Transition tests](../../../src/engine/showV2MixedLayout.test.ts) run the
owner at visual-window start, interior and end partitions and distinguish an
accepted domain edit from a bounded compiler-adapter refusal. The
[v2 lowering tests](../../../src/engine/showCompositionLoweringV2.test.ts) compile
an occurrence split-position track with a retained nonlinear segment and compare
Fast and Fidelity frames with the public Property evaluator.

Group occurrence-local holds are defined by the
[Group hold contract](show-v2-group-holds.md). This owner consumes their
materialized contribution, so extended occurrence duration and child projection
receive the same complete availability checks. The native opt-in
[Layout occurrence inspector](show-v2-layout-occurrence-adoption.md) adopts existing
definition selection, switch move/removal and Make Unique through checked history,
provider readback and native artifact reopening. Production activation remains
outside this additive owner.

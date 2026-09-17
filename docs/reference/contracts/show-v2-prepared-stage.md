# Prepared v2 Stage preview

The gated v2 editor route captures one native v2 preparation bundle through
`captureShowStageEditV2`; the compatible `prepareShowStageV2` wrapper returns
the existing preparation result. Qualified immutable editing inputs remain
available independently of source readiness, as described in
[checked prepared recovery](show-v2-prepared-recovery.md). The bundle binds the unaliased record snapshot and its
digest/stamp, trusted Pattern/Library inputs, selected map dimension and pixel
context, exact public preparation recipe/provenance, compiled artifact and Stage
presentation. Original record/dependency references identify the capture only;
playback never rereads them as semantic data. Preparation produces ready, a
structurally validated empty result without runtime, or an actual refusal.

The Stage map a record names is resolved once, by
[`showV2StageMap.ts`](../../../src/store/showV2StageMap.ts), for the route's
capture and for both admissions. Since #1039 gave the editor a Stage map
chooser, an accepted edit can move `stageMapId` from inside this route as well
as from an agent's candidate: both admissions re-resolve the newly named map
before preparing the candidate, and refuse a map that is gone, empty or at a
dimension the Stage does not support. Recovery is refusal and an unchanged
record, never preparation against another map's geometry, so the preview and the
compiled artifact always describe the map the Show names.

`ShowStagePreview` accepts an explicit `prepared-v2` discriminated input. Its
Show identity, artifact, layout and duration come from that bundle atomically.
It reuses the existing renderer, replay, transport, seek, checkpoints, prewarm,
fidelity, camera and capture paths. It does not fabricate a legacy Show, call
legacy preview compilation, defer independently selected fields, or substitute
a diagnostic Pattern. Record/dependency replacement, navigation and unmount
retire pending reconstruction through the existing generation checks. Published
observations use the captured digest/stamp belonging to the accepted artifact.

Presentation uses the native Layout occurrence active at the presented time
rather than the first definition in the array or a frozen initial mask.
`showStagePresentationV2` derives one ordered presentation window per Layout
occurrence, covering `[0, showEndMs)` half-open: the window owns that
occurrence's Zone/pixel projection, its authored Zone guide rectangles, and its
global interval. Repeated Layout definitions with equal split positions share
one projection instance. A positive incoming Layout transfer adds a leading
blending window whose projection unions destination over source ownership, so
routed output stays visible while the transfer runs. Preparation builds the
occurrence-at-zero projection through the same owner, so the published
presentation layout is unchanged. Occurrence granularity is deliberate: the
mask follows authored Layout switches, not split-position animation inside one
occurrence, which keeps each authored occurrence's initial split position.

`ShowStagePreview` masks each prepared frame through the window owning that
frame's own elapsed playback time, wrapped at Show End exactly like the
transport position, and drives the Zone solo rows, unstaged-pixel note and
Zone outline overlay from the window active at the transport position. Solo
state stays valid across a switch: a Zone the active Layout does not route
reads as off stage and contributes no pixels. This is presentation only. The
compiled artifact, replay runtime, seek, checkpoint, prewarm and capture paths,
transport state, published digest/stamp and generated hardware output are
untouched; a Zone-complete Layout with no solo paints the compiler frame
itself. The Selected Clip outline stays a legacy-only control because its
focus seam is Scene-derived. No default route cutover occurs.

Consumer tests reopen authored bytes and generated source through their
importers, preserve held nonlinear values and shared full Restart state in
Fast/Precise, inspect real renderer input across a later Layout, and deliver
late real replay completions after record/dimension/navigation/unmount changes.
Pure window tests cover occurrence order and coverage, half-open ownership
before/at/after a switch, Show End wrap, transfer blending, guide derivation,
repeated Layouts, logical split reprojection and unmapped strips. Component
tests assert that solo and guide toggles leave compilation and runtime identity
unchanged while the presented frame follows the active occurrence. Fine
authored boundaries remain separate from existing 60Hz runtime step
association: a binary-safe later-window interior frame proves mask behavior.

The ready bundle owns recursively frozen data-only Pattern, Map, Library and
profile snapshots alongside its frozen authored record. These assets feed both
preparation and [native artifact qualification](show-v2-native-artifact-qualification.md).
Original references remain eligibility tokens only. Marker admission and advanced
edit admission retain their separate narrower contracts. Empty content remains editable/saveable
with preview/export unavailable until content is added. No compiler, schema,
runtime-domain or Controller delivery expansion is introduced.

The committed authenticated Stage flow hydrates a synthetic 31-second Show with
a held repeat curve, shared Restart and changing physical Layout, then uses the
existing transport capture in both fidelities and checks narrow playback access.
A second committed flow hydrates two Zones whose Layout occurrences swap the
Stage halves, solos one Zone, plays across the switch, and watches that Zone's
guide and isolation follow it while no preview publication, save or exported
artifact changes.
Prepared Group and Layout-split consumer tests retain their native animation
through codec and generated-source reopen. Browser proof records the actual
committed UI source identity; isolated synthetic contexts preserve user cookies.

The prepared map path intentionally retains the existing Stage mapping from
`point.pos ?? point.sample` into both display and runtime channels. This slice
preserves legacy Stage behavior; it does not establish general sample/position
independence. `maps/types.ts`, `maps/sourceMap.ts`, `resolveLayout.test.ts` and
`shim.test.ts` define and test that wider distinction. A coordinate correction
remains separate parity work.

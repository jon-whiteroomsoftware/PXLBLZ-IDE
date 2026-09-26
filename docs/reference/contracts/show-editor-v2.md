# Show editor on v2

The one `ShowEditor` edits a v2 record when the routed Show has v2 backing. “V2 backing” means the editor reads a `ShowRecordV2` pilot, projects it into the existing timeline and inspector surfaces, and submits its edits through v2 admission. The route passes the same record version to the agent binding; a stored v1 row still uses the v1 record and its v1 owners until operator conversion. See `src/App.tsx:888-951`, `src/components/ShowEditor.tsx:1211-1220`, and `src/agent/editorAdmission.ts:110-123`.

The [Scene-retirement specification](../../plans/scene-retirement-specification.md) owns the domain contract. This document records the editor wiring at `9f44d558`. The [state, history and persistence contract](show-state-history-persistence.md) owns save semantics.

## The view model

`ShowTimelineViewModel` is the description consumed by the timeline, strip, ruler, Layout lane and Marker surfaces. `projectShowTimelineV2` builds it from a v2 record; its `recordVersion` is 2 and renderers do not use it as a compatibility switch. The view has no Scene identity. See `projectShowTimelineV2` in `src/engine/showTimelineViewModelV2.ts`.

| Field | Meaning |
| --- | --- |
| `showEndMs` | Show End; percentage geometry uses this loop length. |
| `rows`, `rows[].layers` and `rows[].groups` | Zone identity and counts, with stable Layer and Group identities. Rank zero is the bottom Layer; `layerIndex` is the top-to-bottom draw order. |
| `layers[].items` | Clip uses, including materialized Group Clips, with global interval, Pattern instance, entry policy, appearance, Group occurrence and diagnostics. |
| `layers[].junctions` and `transitions` | Derived boundaries and authored Transitions, including Layer participants or whole-output contributors. |
| `layoutIntervals` | Layout occurrences with definition identity, Zone ids, interval, parameters and optional incoming transfer. |
| `markers` | Markers, including the optional chapter role. |
| `propertyTracks` and `items[].appearanceKeys` | Authored Property tracks and held-appearance keys. |
| `structuralTimesMs` | Snap candidates in first-appearance order. |

The projection supplies the authored Property tracks and held-appearance keys directly. A renderer draws only what the projection supplies. See `projectShowTimelineV2` in `src/engine/showTimelineViewModelV2.ts`.

Editor selection is a `ShowSelection` in `src/store/showEditorViewStore.ts`; `showSelectionKey` in `src/components/ShowEditor.tsx` supplies stable DOM and store keys. The selection vocabulary addresses Clips, Transitions, Zones, Zone Layouts, Group occurrences, Group Clips and the Show.

## The projection

`projectShowTimelineV2(record)` reads a v2 record immutably. It orders Layers by rank, materializes Group Clip uses, derives Cut junctions, projects authored Transitions and whole-output participants, and includes Layout occurrences, Markers and Property tracks. It allocates no record identity. See `projectShowTimelineV2` in `src/engine/showTimelineViewModelV2.ts`.

### Legacy sidecars

Removed in #1042: the v1 projection carried Scene-local facts in explicit `legacy` fields (item placement and Scene ids, a stored v1 boundary Cut id, and Layout interval Scene ids). The v2 projection never populated those fields and nothing consumes them.

### Measured differences between the two views

The pinned parity corpus correlates v1 and converted v2 views through conversion identity mappings. Its four accepted differences are retired silent runtime uses, Scene labels represented as chapter Markers, Layout scalar carriers split into occurrences, and whole-output boundaries narrowed to participant pairs. The parity test names these causes and fails on an unclassified difference. See `src/engine/showTimelineViewModelParity.test.ts:1-80`.

### Rules the view enforces

- A Cut is the absence of an authored Transition at exact adjacency. A derived Cut has `scope: 'derived-cut'` and no Transition id; a 1 ms gap has no junction. See `src/engine/showTimelineViewModelV2.ts:38-80` and `src/engine/showTransitionsV2.ts:1-90`.
- A whole-output Transition names all contributors in its window, not merely one adjacent Layer pair. See `src/engine/showTimelineViewModelV2.ts:40-53`.
- Projection does not adopt a record or allocate authored identity. See `projectShowTimelineV2` in `src/engine/showTimelineViewModelV2.ts`.

## The v2 workspace

The workspace receives the v2 timeline, time columns, Transition, Layout, Zone Map and Property-lane projections plus the v2 gesture callbacks. A stored v1 row is not opened (see below); nothing reads the removed v1 projection.

## Which record backs the open editor

`ShowEditor` is the routed editor. Since #1039, v2 is the production path for fresh Shows, stored v2 rows and `.pxlshow` imports of either version. A stored v2 row or native v2 built-in supplies its backing. Since #1042 Phase 1b a stored v1 row is neither converted on read nor opened: the Worker refuses the v1 list and v1 writes with 410 `show-v1-retired`, and the row waits in D1 for the operator conversion (`npm run show:v2-migrate`, #1105). See `src/App.tsx` (`v2EditorShowId`, `activeShow`) and `src/worker/routes/shows/showV1Retired.ts`.

| Routed Show | Editor backing |
| --- | --- |
| Stored v2 row | Its v2 pilot, loaded through `openShowV2Pilot` (`src/App.tsx:894-905`; `src/store/showStore.ts:1127-1152`). |
| Built-in Show | Its native v2 catalogue record, cloned into a session-only lesson draft. `loadShows` retains that draft and its history across a workspace reload (`src/store/showStore.ts:785-800`; `src/store/showStore.ts:1097-1115`). |
| Unconverted stored v1 row | None. The row is not listed or opened; its route shows the ordinary "Show not found" message until the operator conversion in specification §10 rewrites it (#1105). The v1 editor branches that remain in `ShowEditor` are unreachable from the UI and are deleted in #1042 Phase 2. |

The route supplies `recordVersion={activeShowV2Pilot ? 2 : 1}`; version 1 remains only for a built-in Show with no native v2 record. The agent admission binding declares that version, reads the corresponding record, and reports it through `read_show`; its commands therefore follow the editor backing. See `src/App.tsx:945-951`, `src/agent/editorAdmission.ts:100-123`, and `src/agent/editorAdmission.ts:267-272`.

An id with no stored v2 row and no native v2 built-in is not opened. There is no preview parameter.

## Edit doors

A v2 gesture plans against the current prepared capture, then its admission checks the record and adopts one accepted replacement. The table names the door the existing editor calls, not a second editor surface. The admission functions live in `src/store/showV2PreparedEditAdmission.ts:220-981`; the agent uses `src/agent/editorAdmission.ts:110-123`.

| Editor surface or gesture | V2 admission door or owner | Notes |
| --- | --- | --- |
| Timeline drag, move, trim, extend, split and duplicate | `commitV2ClipTemporal`, `commitV2ClipSharing`, or `commitV2TransitionResize` | The gesture planner selects the door; Clone and Option-drag share the linked-duplicate owner (`src/components/ShowEditor.tsx:1808-1862`, `src/components/ShowEditor.tsx:6838-6905`). |
| Clip inspector fields | `commitV2ClipInspectorPatch` → temporal, appearance, instance-properties, entry-policy or replacement admission | Start and Duration reuse gesture planners; one patch chooses one owner (`src/components/ShowEditor.tsx:2322-2417`). |
| Transition inspector and palette | `commitV2BoundaryTransitionChanges`, `commitV2BoundaryPaletteApply`, `commitV2BoundaryTransitionRemove` → transition-edit admission | Settings, Crossfade source, palette Apply and reset-to-Cut use the authored Transition owner (`src/components/ShowEditor.tsx:2423-2460`, `src/components/ShowEditor.tsx:2555-2564`). |
| Transition resize | `commitV2TransitionResize` | Inspector Duration and connected Clip timing use the resize owner (`src/components/ShowEditor.tsx:1952-1967`, `src/components/ShowEditor.tsx:2427-2438`). |
| Clip delete | `requestDeleteClipV2` → `commitV2ClipDelete` | A connected deletion first asks for confirmation; a refusal calls `reportBlockedDelete` (`src/components/ShowEditor.tsx:2608-2641`). |
| Group occurrence and Group Clip edits | `requestV2GroupOccurrenceEdit` → group-occurrence admission; Group Clip Pattern replacement uses group-replacement admission | Duplicate, unique, ungroup, delete and child edits pass the Group owner (`src/components/ShowEditor.tsx:2148-2189`, `src/components/ShowEditor.tsx:2642-2693`). |
| Markers | `commitV2MarkerEdit` | Add, move, update and remove submit Marker intents (`src/components/ShowEditor.tsx:1867-1882`, `src/components/ShowEditor.tsx:4408-4502`). |
| Show metadata | Header rename → `renameShowV2Pilot` and the `rename_show` command owner; target controller and output settings → `commitV2ShowMetadata` / `commitV2ShowMetadataEdit` → show-metadata admission | Rename joins the open Show’s history and save queue; target controller, output contract, Stage map, portable reference and Trails use prepared admission (`src/App.tsx:1433-1445`, `src/store/showStore.ts:1177-1185`, `src/components/ShowEditor.tsx:2271-2286`, `src/components/ShowEditor.tsx:4660-4718`). |
| Zones and Zone Layouts | `commitV2ZonePlan` → Zone, Layout-definition or Show-metadata admission; `commitV2LayoutPlan` → Layout-occurrence admission | Zone Map, spatial selection, definition settings and interval operations select their respective owners (`src/components/ShowEditor.tsx:1986-1994`, `src/components/ShowEditor.tsx:2591-2607`, `src/components/ShowEditor.tsx:4511-4578`). |
| Pixelblaze agent candidate | `createAgentEditorAdmission` | The binding declares record version and capture; candidate admission shares the editor revision and save owner (`src/agent/editorAdmission.ts:100-123`, `src/store/showV2CandidateAdmission.ts:163-220`). |

The #1069 loss dialogs require confirmation before Replace Pattern, a cross-Layer or cross-Zone move that removes connected Transitions, unticking a control target, or overwriting multiple held segments. Their confirm functions are `confirmV2Replacement`, `confirmV2ClipMove`, `confirmV2ControlRemoval`, and `confirmV2HeldSegmentOverwrite`; each re-reads or replans against the current capture before admission. Cancellation writes nothing. See `src/components/ShowEditor.tsx:2190-2247`, `src/components/ShowEditor.tsx:6885-6920`, and `src/components/ShowEditor.tsx:4018-4048`.

Refusal feedback depends on the surface. Clip delete puts a short red label on the Clip and a screen-reader status in the timeline; `reportBlockedDelete` supplies both (`src/components/ShowEditor.tsx:1386-1395`, `src/components/ShowEditor.tsx:4125-4135`, `src/components/ShowEditor.tsx:9016-9231`). The Transition add control exposes its disabled reason, and its palette shows an Apply error at the junction (`src/components/ShowEditor.tsx:7665-7725`, `src/components/ShowEditor.tsx:5098-5144`). Insert Time shows its disabled reason beside the control (`src/components/ShowEditor.tsx:7808-7816`). A refused Clip drag clears its preview and sets the drop effect to `none` (`src/components/ShowEditor.tsx:6760-6796`). Three planner paths still return without presenting the refusal reason: Clip inspector patches (`src/components/ShowEditor.tsx:2358`), boundary Transition settings (`src/components/ShowEditor.tsx:2441`), and Group occurrence edits (`src/components/ShowEditor.tsx:2647`). [#1098](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1098) tracks these against specification §10.

## Saves

The store adopts an accepted v2 replacement optimistically, adds one history step, then serializes personal saves per Show through `queueShowPersistence`. A failed save rolls back to the durable baseline and records a retryable failure. Lesson drafts adopt in memory without a provider write. The app's `beforeunload` guard warns while a Show save is queued or in flight. See `src/store/showStore.ts:476-535`, `src/store/showReplacementPolicy.ts:6-45`, `src/App.tsx:1163-1173`, and [Show state, history and persistence](show-state-history-persistence.md).

## Divergences from v1

The [Scene-retirement specification §10, “Accepted divergences from v1”](../../plans/scene-retirement-specification.md) is the list.

## What remains

[#1067](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1067) items 2 and 4 still affect this contract, as do [#1042](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1042) (v1 removal), [#1043](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1043) (docs sweep), and [#1097](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1097) (walkthrough feedback).

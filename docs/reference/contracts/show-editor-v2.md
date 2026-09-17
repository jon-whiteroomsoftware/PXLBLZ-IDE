# Show editor on v2

Canonical authority is [the Scene-retirement specification](../../plans/scene-retirement-specification.md)
§3 (record and identity), §5 (Cut as absence and whole-output scope), §8 (Layers,
Layout occurrences, Markers, Show End) and §10 (no mixed window), and issue
#1056. This describes what is landed after slices 1-3: one version-agnostic
timeline view model, both projections into it, the v1 container consuming it, a
v2 rendering on the ordinary route whose ordinary Clips are directly manipulable
through the landed v2 owners, and the Clip inspector beside it. The Transition
palette, Layout lane and property lanes are not landed.

## The view model

[`showTimelineViewModel.ts`](../../../src/engine/showTimelineViewModel.ts) defines
`ShowTimelineViewModel`: the single description every timeline surface reads.

| Field | Meaning |
| --- | --- |
| `recordVersion` | Which record shape produced this view. It is provenance, never a compatibility switch inside a renderer. |
| `showEndMs` | Show End. All percentage geometry divides by this one value. |
| `rows` | Zone rows: identity, name, colour, nominal and resolved pixel counts, `composed`, ordered `layers` and `groups`. |
| `rows[].layers` | Stable Layer identity, name and `rank` (zero is the bottom Layer), plus `layerIndex`, the row's top-to-bottom draw order. |
| `layers[].items` | Clip uses, including materialized Group Clip uses: stable id, global `startMs`/`durationMs`/`endMs`, Pattern instance identity and name, entry policy, held appearance at the item's start, `groupOccurrenceId`, diagnostics. |
| `layers[].junctions` | Drawn boundaries between adjacent items: `scope` is `layer`, `whole-output` or `derived-cut`, with the window and the owning Transition id. |
| `transitions` | Authored Transitions with their window and either explicit Layer participant pairs or explicit whole-output contributor sets. |
| `layoutIntervals` | Layout occurrences: occurrence identity, definition identity and name, Zone ids, interval, routing `parameters`, optional `incomingTransfer`. |
| `markers` | Markers with the optional `chapter` role. |
| `structuralTimesMs` | Snap candidates in first-appearance order. |

Each row, layer, item, junction, Layout occurrence and Marker carries a
`selection` from `ShowTimelineSelection`, and `showTimelineSelectionKey` renders
it as the stable DOM and store key. The vocabulary addresses Clips, Groups, Group
Clips, Layers, Transitions, derived Cuts, Layout occurrences, Markers, Zones and
the Show itself by their own identity. No selection names a `ShowCell` inside a
`ShowScene`.

### Rules the view enforces

- A Cut is the absence of a Transition at exact adjacency. A junction whose kind
  is `cut` always has `scope: 'derived-cut'` and `transitionId: null`, and never
  appears in `transitions`. A stored zero-duration v1 Cut record is read as that
  absence; its identity survives only in the junction's `legacy` sidecar. A 1 ms
  gap is blank time and draws no junction.
- A whole-output Transition owns every item whose contribution meets its window,
  not only the pairs that happen to be adjacent on one Layer.
- Building the view allocates no identity, writes no store and leaves both
  records byte-identical.

### Legacy sidecars

The view carries no Scene. Where a v1 surface still resolves a Scene concept, the
value lives in an explicitly named `legacy` field that a v2 projection never
populates:

| Sidecar | Holds | Owed to |
| --- | --- | --- |
| `items[].legacy` | `sceneId`, `startSceneId`, `endSceneId`, placement kind and ids, `logicalClipId`, `segmentIds`, `localStartMs` | the v1 container's own gesture code |
| `junctions[].legacy.boundaryTransitionId` | the stored v1 Cut record a derived junction resolves through | slice 4 (Transition authoring) |
| `layoutIntervals[].legacy.sceneIds` | the internal Scene owners of a v1 occurrence | slice 4 (Layout lane) |

Adding Scenes to the view model instead of a sidecar is prohibited.

## The two projections

`fromShowTimelineProjection` builds the view from projections the caller already
computed - `projectShowTimeline`, `projectShowStrip`,
`projectShowUnifiedTimeline`, `projectShowLayoutIntervals` and the composition's
Markers. `projectShowTimelineViewModel(show, composition)` is the record-level
convenience; the composition argument is the sidecar the route resolved, which
for a flat record is the projected one, not a persisted one.

[`projectShowTimelineV2(record)`](../../../src/engine/showTimelineViewModelV2.ts)
builds the same view from a `ShowRecordV2`: Layers by rank, Clips and Group Clip
uses from `materializeShowGroupsV2`, Cut junctions from
`projectShowTransitionJunctionsV2`, Transitions with their participants or
`wholeOutput` sets, Layout occurrences with their own parameters and transfer,
and Markers with their role.

### Measured differences between the two views

All 47 pinned corpus records project equivalently, correlated by the conversion
report's own identity mappings. Four differences are measured and each has a
named cause; a fifth would fail
[`showTimelineViewModelParity.test.ts`](../../../src/engine/showTimelineViewModelParity.test.ts).

| Cause | What differs | Why |
| --- | --- | --- |
| `retired-silent-runtime-use` | five v1 items have no v2 counterpart, across three stock Layout showcases | §2's accepted conversion exception; each retired placement is named in the conversion report |
| `scene-label-chapter-marker` | 228 v2 Markers the v1 view does not have | §8: former Scene labels become chapter Markers; an absorbed Marker keeps its id and colour |
| `layout-scalar-carrier-occurrence` | two v1 occurrences each become several v2 occurrences | §8: a v1 Scene-owned `routingTargets` carrier becomes an explicit v2 occurrence per parameter value, partitioning the same interval under the same definition |
| `whole-output-narrowed-to-participant-pair` | 80 v1 whole-output boundaries become v2 Layer participant pairs | §5: conversion narrows a Show-wide boundary to a participant pair exactly when it joins one Clip pair with no global carrier |

## The v1 container

`ShowTimelineWorkspace` derives its Zone rows, Layer counts, Show End, Layout
intervals, Markers and structural snap candidates from the view model. Rendering
is byte-identical to the pre-refactor behaviour, asserted for all 47 corpus
records by
[`ShowTimelineV1Fingerprint.test.tsx`](../../../src/components/ShowTimelineV1Fingerprint.test.tsx),
which hashes the serialized v1 view model and the rendered markup of the timeline
toolbar, ruler and grid. Regenerate that baseline only for a deliberate,
explained v1 rendering change.

These v1 seams are unchanged and are slice obligations, not view-model gaps:

- the per-Scene CSS grid template, the Layout lane's `sceneIds` addressing and
  `showRoutingTransitionAfter`, and the sample-repeat lane (slice 4);
- the per-Clip gesture code, which still consumes
  `ShowUnifiedTimelineClipProjection` and the store's v1 mutators; the v2 surface
  never touches it, and the v1 route behaves exactly as before;
- property lanes, which the view model does not carry (slice 5).

`ShowClipEntityDetail` and its `ShowClipInspectorValue`/`onPatch` contract remain
the v1 inspector, unchanged. Its patch shape carries whole component values and
no held-key identity, so it cannot express what the v2 appearance owner requires
(one scope, one selected-time key identity plan, and only the dirty fields). The
v2 inspector below composes the landed v2 models instead, and reuses the v1 leaf
that does fit a v2 record: `ShowPatternInstanceControls`.

## The version gate

The ordinary route renders a `ShowRecordV2` behind a dev-only
`?show-v2-editor=1` opt-in. `ShowEditorV2ReadOnly` resolves the record through
the existing `openShowV2Pilot` store path, captures it with
`captureShowStageEditV2`, projects it with `projectShowTimelineV2`, and renders
`ShowStagePreview kind="prepared-v2"` beside one of two timeline surfaces:

| Surface | When | What it offers |
| --- | --- | --- |
| `ShowTimelineGestureSurface` | the capture prepares (`ready` or `empty`) | the lanes below plus direct manipulation of ordinary Clips |
| `ShowTimelineReadOnlySurface` | the capture is `refused` | the lanes below, every item a focusable `aria-disabled` element |

A refused capture is read-only because the closed admission refuses every edit
on it with `unsupported-pilot-record`; drawing controls that cannot act would
misstate the record's condition. Both surfaces draw the ruler, the Zone Layouts
lane and the Marker lane from
[`ShowTimelineLanes.tsx`](../../../src/components/ShowTimelineLanes.tsx), whose
items stay inert until slices 4-5 own them, and both state their condition in
one status line. Neither surface registers an agent binding, so no command can
reach a v2 record and §10's forbidden mixed window stays closed.

`?show-v2-pilot=1` still renders `ShowV2RoutePilot` and takes precedence. Without
either flag the ordinary editor renders a v1 record exactly as before. The route's
missing-Show guard stands aside for both opt-ins, because a converted row leaves
the v1 list until #1039 couples them.

The route lays the workspace and the Clip inspector side by side above 1024 px
and stacks them below it. Both read the one prepared capture
[`useShowV2EditCapture`](../../../src/components/useShowV2EditCapture.ts) owns:
the timeline gestures and the inspector plan against the same captured record,
dependencies and provider, so one stale-edit predicate governs both.

The component and its file keep slice 1's `ShowEditorV2ReadOnly` name until
slice 6 retires the opt-in and renames the route surface; renaming it earlier
would collide with every concurrent slice mounting into it.

## Gesture adapters

[`showTimelineGesturesV2.ts`](../../../src/engine/showTimelineGesturesV2.ts) is
the pure seam between what the pointer or the keyboard did and what the landed
owners are asked to do. `ShowTimelineGestureV2` is the vocabulary; each member
becomes exactly one owner intent, submitted through one closed-admission
wrapper, producing one candidate and one history entry.

| Gesture | Intent | Owner and admission wrapper |
| --- | --- | --- |
| drag or nudge inside one Layer | `move` | `editShowClipTemporalV2` / `admitShowV2PilotClipTemporal` |
| drag onto another Layer of the Zone | `replace-placement` | the same |
| trailing edge later / earlier | `extend` / `trim` with the Clip's own start | the same |
| leading edge earlier / later | `extend` / `trim` with the Clip's own end | the same |
| split at a time | `split` with one fresh Clip identity | the same |
| Alt-drag or `D` | `duplicate` | `editShowClipV2` / `admitShowV2PilotClipSharingEdit` |
| `Delete` | `delete-clip` | `editShowTransitionV2` / `admitShowV2PilotClipDelete` |

Rules the adapter holds to:

- **The owners decide the edit.** A rigid connected move is `editShowClipTemporalV2`'s
  own traversal of the Transition-connected component; the adapter emits one
  `move` and never shifts a neighbour itself. A trailing resize ripples its
  connected successors, and a leading resize that closes its incoming window
  delegates to Reset, both inside the owner.
- **Identity is allocated once, at submission, and never before a gesture that
  cannot change the record.** A split takes its right Clip from
  `allocateShowClipTimingIdsV2`; a duplicate takes its complete identity plan
  from `createShowV2LinkedDuplicateIntent`; a leading resize that closes a ramp
  carrier, and a delete that removes one, take their projections from
  `planShowV2TransitionRampProjections` and `planShowV2ClipDeleteRampProjections`.
  An out-of-bounds split time, an unknown Clip, a Group Clip use or a
  destination outside Show End is refused with the allocator untouched.
- **Duplication is linked.** The copy consumes the source's effective Pattern
  instance and no gesture mints a runtime (specification §4). Making a copy
  independent is the inspector's explicit Make Pattern Independent, a second
  authored decision with its own candidate; no gesture performs both.
- **Cut is exact adjacency.** Snapping and collision feedback are pixel
  affordances only: `resolveShowTimelineClipDropV2` and
  `resolveShowTimelineEdgeDropV2` reuse the landed viewport helpers and the
  view's `structuralTimesMs`, and the times they produce are whole milliseconds
  the owners compare exactly. A drop one millisecond off a neighbour is blank
  time, not a Cut.
- **The moved body is the component.** Drop feedback clamps and collision-tests
  the whole connected component, so a chain stops when its earliest member
  reaches zero or its latest reaches Show End. A duplicate and a cross-Layer
  re-placement carry the dragged Clip alone (`carry: 'clip'`), matching the
  owners: `replace-placement` refuses to detach a Transition endpoint.

## The gesture surface

`ShowTimelineGestureSurface` draws the view model and emits gestures. Ordinary
Clips render as a `<button>` body with two edge handles; a Group Clip use stays
an inert `aria-disabled` element, because its occurrence owns it (slice 5).

| Input | Gesture |
| --- | --- |
| drag the body | move; hold Alt mid-drag for raw milliseconds |
| Alt-press then drag | linked duplicate |
| drag an edge handle | leading or trailing resize |
| double-click the body | split at the pointer time |
| `←` / `→` on the body | move one drop-grid step, `Shift` for 100 ms |
| `←` / `→` on an edge handle | move that edge one step |
| `S` / `D` / `Delete` | split at the midpoint / duplicate after the Clip / delete |
| `Escape` during a drag | cancel, submitting nothing |
| `⌘Z` / `⇧⌘Z`, or the history controls | Undo / Redo |

A live drag draws `[data-show-drop-preview]`, marked
`data-show-drop-collides="true"` when the dropped body would overlap content it
is not carrying. Keyboard focus follows a Clip a split or a duplicate created.

[`useShowV2TimelineGestures`](../../../src/components/useShowV2TimelineGestures.ts)
owns the submission: it plans the gesture, admits it, and reports the outcome in
the existing pilot status vocabulary - the owner's message on a refusal,
`"Clip is unchanged."` on a no-op, `"Clip saved."`, `"Clip sharing saved."`,
`"Clip deleted."`, `"Undo saved."`, `"Nothing to redo."`, `"Save failed: …"`.
It carries the pilot's stale/provider/dependency guards unchanged: a refusal or
no-op leaves the record identical with no history entry, timestamp or provider
write, a failed save rolls back through the store's existing recovery, and a
completion that is no longer current is discarded rather than displayed. Undo
and Redo run through `undoShowV2Pilot` / `redoShowV2Pilot`.

## The Clip inspector

[`ShowClipInspectorV2`](../../../src/components/ShowClipInspectorV2.tsx) renders
beside the timeline on the same gated route. It holds no record: it
reads the prepared capture
[`useShowV2EditCapture`](../../../src/components/useShowV2EditCapture.ts) pins,
and re-reads it after every adoption.

| Section | Model that plans it | Admission wrapper |
| --- | --- | --- |
| Clip identity, placement, entry policy | `buildShowClipInspectorModelV2` | none; read only |
| Clip start, duration, end, in exact ms | `ShowClipTemporalIntentV2` | `admitShowV2PilotClipTemporal` |
| Pattern instance, Make Pattern Independent, Rejoin | `createShowV2IndependentIntent`, `createShowV2RejoinIntent` | `admitShowV2PilotClipSharingEdit` |
| Replace Pattern | `createShowV2ClipReplacementIntent`, `previewShowV2ClipReplacement` | `admitShowV2PilotClipReplacementEdit` |
| Appearance and Effects | `showV2AppearanceEditorModel` | `admitShowV2PilotAppearanceEdit` |
| Create Group, Group occurrence actions, Replace Group Pattern | `showV2GroupCreationEditorModel`, `showV2GroupOccurrenceEditorModel`, `showV2GroupReplacementEditorModel` | `admitShowV2PilotCreateGroup`, `admitShowV2PilotGroupOccurrenceEdit`, `admitShowV2PilotGroupReplacementEdit` |

Rules the inspector holds to:

- **Selection is view-model identity.** A `clip` selection names an authored
  ordinary Clip. A `group` selection resolves to that occurrence's first
  materialized Group Clip use and is inspected, not edited: the ordinary Clip
  owners do not accept a materialized child, so the timing, Replace and
  appearance sections are absent and the Group sections stand in their place.
  The panel selects from its own Clip list until a caller passes a selection.
- **Sharing is counted over effective uses.** The Pattern instance panel counts
  and lists ordinary Clips and every materialized Group Clip use (section 4), so
  a Clip whose only other users are invisible Group uses still reads as shared.
  Rejoin offers explicit existing instances only, never the Clip's own.
- **Replacement confirms its loss.** `previewShowV2ClipReplacement` reports the
  instance-control tracks and control values a replacement would discard;
  the inspector confirms them before adopting and a cancelled confirmation
  adopts nothing (section 6). The pilot route keeps its unconfirmed control:
  `requireLossConfirmation` is opt-in.
- **One edit, one history entry.** Every section adopts through the closed
  admission, so a refusal returns the original record identity and writes no
  history, save or timestamp. Undo and Redo settle through the same save queue.
- **No new owner semantics.** The entry policy is shown and never written here:
  no landed pure owner or `admitShowV2Pilot*` wrapper sets `clip.entryPolicy`
  on an existing Clip. The only landed writer is the command layer's
  `update_clips`, which belongs to #1041. The stutter control is likewise
  omitted (`steppedClockEditable={false}`) because no v2 owner edits a Pattern
  instance clock.

## What remains

Slices 4, 5 and 6 of #1056 own Transition and Layout authoring, animation and
Markers, and the remaining route content, after which `?show-v2-pilot=1` and
`?show-v2-editor=1` both retire. Until then a v2 record on the ordinary route can
be read, previewed, traversed, dragged in its Clip timing, sharing and deletion,
and edited through the Clip inspector; the store mutators, executor, admission
and MCP surfaces remain v1-typed. Editing a Clip's entry policy on this route
needs an owner decision that slice 3 deliberately did not take.

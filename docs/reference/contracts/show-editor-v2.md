# Show editor on v2

Canonical authority is [the Scene-retirement specification](../../plans/scene-retirement-specification.md)
§3 (record and identity), §4 (shared animation and Restart), §5 (Transition edit
contract, Cut as absence and whole-output scope), §6 (retained curves), §7
(Insert Time and Group-local holds), §8 (Layers, Layout occurrences, Markers,
Show End), §9 (pure edit and adoption boundary) and §10 (no mixed window), and
issue #1056. This describes what is landed after slices 1-5: one
version-agnostic timeline view model, both projections into it, the v1 container
consuming it, a v2 rendering on the ordinary route whose ordinary Clips are
directly manipulable through the landed v2 owners, the Clip inspector beside it,
Transition authoring plus the Zone Layout lane's own operations beneath it, the
animation and Group lanes under the timeline, and the Show inspector that edits
Property tracks, Markers, Show End and Insert Time.

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
| `propertyTracks` | Optional. Authored Property tracks: owner, target, activation and keys, each key carrying its authored easing, its retained `curveSegment` and a `retainedCurve` flag. |
| `layers[].items[].appearanceKeys` | Optional. Every authored held-appearance key in that Clip, earliest first. |
| `structuralTimesMs` | Snap candidates in first-appearance order. |

The two optional collections are absent from a v1 projection, and absence means
this projection resolves none - never a version test inside a renderer. A v1
Property track is Scene-local and a v1 placement carries one held value with no
key identity, so resolving either into global identity is conversion work
(#1035/#1037), not projection; the v1 surfaces keep their own property lanes.
Because both are omitted rather than emptied, the v1 fingerprint baseline is
byte-identical and was not regenerated.

`ShowTimelineSelection` gained `{ kind: 'property-track', trackId }` for the
animation lanes. No v1 projection produces it.

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
| `junctions[].legacy.boundaryTransitionId` | the stored v1 Cut record a derived junction resolves through | the v1 container only; the v2 authoring path reads neither sidecar |
| `layoutIntervals[].legacy.sceneIds` | the internal Scene owners of a v1 occurrence | the v1 container only |

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

- the per-Scene CSS grid template, the v1 Layout lane's `sceneIds` addressing,
  `showRoutingTransitionAfter`, `showBoundaryClipIdentity` and the sample-repeat
  lane. The v2 path replaces none of them in place: it addresses Layout
  occurrences and boundaries by the view model's own identities instead, so
  those v1 branches keep serving the v1 record until #1042 retires it;
- the per-Clip gesture code, which still consumes
  `ShowUnifiedTimelineClipProjection` and the store's v1 mutators; the v2 surface
  never touches it, and the v1 route behaves exactly as before;
- the v1 property lanes, which still read `showPropertyLaneProjection` and its
  Scene-local tracks rather than the view model's v2-only `propertyTracks`.

`ShowClipEntityDetail` and its `ShowClipInspectorValue`/`onPatch` contract remain
the v1 inspector, unchanged. Its patch shape carries whole component values and
no held-key identity, so it cannot express what the v2 appearance owner requires
(one scope, one selected-time key identity plan, and only the dirty fields). The
v2 inspector below composes the landed v2 models instead, and reuses the v1 leaf
that does fit a v2 record: `ShowPatternInstanceControls`, stutter row included
now that a v2 owner writes the instance clock.

## The version gate

[`showV2RouteGate.ts`](../../../src/engine/showV2RouteGate.ts) answers two
questions, and every consumer that must move together asks it rather than
reading a flag of its own.

**Is v2 the ordinary Show path at all?** `isShowV2RouteEnabled`.
`SHOW_V2_ROUTE_DEFAULT` is `true` since #1039, so the answer is yes
unconditionally: a fresh Show is authored as a `ShowRecordV2`, the Show list
reads stored v2 documents beside whatever is still v1, and `.pxlshow` import
accepts a version-2 bundle. Ordinary v1 import survives beside it, and a v1
file still imports as a v1 row.

**Which editor holds this routed Show?** `opensOnShowV2Route`, answered per
record:

| Routed Show | Editor | Commands |
| --- | --- | --- |
| a stored version-2 document | `ShowEditorV2Route` | the v2 catalogue |
| a row storage still holds as v1 | the v1 `ShowEditor` | the v1 catalogue |
| a built-in Show (no stored document) | the v1 `ShowEditor` | the v1 catalogue |

The second row is the transition state, and it is deliberate: specification
section 10 forbids migrating a row on read as firmly as it forbids a window
where the editor holds v2 while commands assume v1. Nothing in the application
converts a stored row; `npm run show:v2-migrate` does, with the preserved
original and the per-row readback the runbook requires. Until it has run, a
user opening an unconverted Show sees exactly the editor they saw before, the
Shows rail marks that row `v1` while it is selected, and the agent binding that
editor registers declares version 1, so its commands match it. After it has
run, the same URL opens the v2 route and `read_show` answers v2.

`?show-v2-editor=1` remains as what it always was in substance: a
development-only preview of an unconverted row on the v2 editor. It converts in
memory for the open session and writes nothing, and a production build ignores
it however the URL is written. `e2e/show-editor-v2-route.auth.spec.ts` proves
both states on the production URL with no query flag at all.

`ShowEditorV2Route` resolves the record through
the existing `openShowV2Pilot` store path, captures it with
`captureShowStageEditV2`, projects it with `projectShowTimelineV2`, and renders
`ShowStagePreview kind="prepared-v2"` beside one of two timeline surfaces:

| Surface | When | What it offers |
| --- | --- | --- |
| `ShowTimelineGestureSurface` | the capture prepares (`ready` or `empty`) | the lanes below plus direct manipulation of ordinary Clips |
| `ShowTimelineReadOnlySurface` | the capture is `refused` | the lanes below, every item a focusable `aria-disabled` element |

Both surfaces draw the route's Undo and Redo, because history belongs to the
record rather than to the gestures: a refused capture offers no Clip gesture,
but the inspectors that do not read the prepared Stage still edit it, and those
edits stay undoable.

`ShowV2AnimationLanes` draws directly under whichever surface renders, and
`ShowEditorV2TransitionLayoutPanel` mounts beneath those, on the same capture, so
Transition and Layout authoring is offered wherever the timeline is. A refused
capture is read-only because the closed admission refuses every edit on it with
`unsupported-pilot-record`; drawing controls that cannot act would misstate the
record's condition, so the panel's own controls refuse for the same reason. Both
surfaces draw the ruler, the Zone Layouts lane and the Marker lane from
[`ShowTimelineLanes.tsx`](../../../src/components/ShowTimelineLanes.tsx), whose
items stay inert - slice 4 authors Layout occurrences and Transitions from the
panel below rather than from the lanes themselves, and slice 5 edits Markers from
the Show inspector - and both state their condition in one status line. Neither
surface registers an agent binding, so no command can reach a v2 record and §10's
forbidden mixed window stays closed.

Without the gate the ordinary editor renders a v1 record exactly as before. The
route's missing-Show guard stands aside for the gated route, because a converted
row is absent from the v1 list until #1039 couples them.

The route lays a header - the Show name, its `v2` badge and the transport -
above the timeline column - the surface, the animation lanes and the authoring
panel - and the Stage preview in the workspace, with the Clip inspector, the
Show inspector and the Show summary and delivery panel in the side panel beside
them above 1024 px, stacked below it. Each of the three keeps the height it draws and the column scrolls when they
exceed it: the workspace caps the column at half the editor however much the
route asks for, and a surface squeezed by the lanes below it scrolls its Zone
rows out of sight, where a Clip is neither visible nor droppable. Every editable
surface reads the one prepared capture
[`useShowV2EditCapture`](../../../src/components/useShowV2EditCapture.ts) owns:
the timeline gestures, the Transition and Layout panel and both inspectors plan
against the same captured record, dependencies and provider, so one stale-edit
predicate governs all of them.

Slice 6 renamed the component and its file from slice 1's
`ShowEditorV2ReadOnly`, once no concurrent slice was still mounting into it.

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

## The visible window

Both surfaces and the shared lanes draw a visible window rather than the whole
Show (#1039). The window is a `ShowTimelineViewport` -
[the same engine model the v1 workspace uses](../../../src/engine/showTimelineViewport.ts):
total, start, duration and a minimum duration that caps zoom at 16x.
[`useShowTimelineViewport`](../../../src/components/useShowTimelineViewport.ts)
holds it beside the surface, and
[`showTimelineGeometry`](../../../src/components/ShowTimelineLanes.tsx) turns it
into the CSS percentages every lane positions with.

It is presentation state, and nothing about it reaches a record: zoom, pan and
the toggles below submit no gesture, create no history entry, write no
timestamp and save nothing. Nothing about it is persisted either; the window
opens fitted to the Show.

| Property | Behavior |
| --- | --- |
| Mapping | `timeToViewportPercent` and `durationToViewportPercent`, unclamped. Content that starts before the window or ends after it draws past the lane edge, where the lane clips it, so the visible part keeps its true position and width. |
| Names | A Clip or Layout occurrence that begins before the window keeps its true left edge, and `showTimelineLabelInset` follows its name in, so a long covering band is never unlabelled. |
| Pointer | One pixel is one window millisecond per pixel. A drag, an edge drag and a double-click split all name a time in the window. |
| Drop resolvers | Both receive the window's real `visibleDurationMs` and the measured lane `visibleWidthPx`, so magnetism and the drop grid follow the ruler ticks the author can see. |
| Zoom independence | The intent a gesture submits is the authored time, so the same target time produces the same owner intent at any zoom. Zoom changes only how finely a pointer can name a time. |
| Keyboard nudges | Deliberately zoom independent: `←`/`→` on a Clip or an edge move one drop-grid step at any zoom, resolved in a fixed frame. |
| Ruler | Tick steps come from the window, and only the window's ticks are mounted. The lane publishes the window as `data-show-visible-start-ms` and `data-show-visible-duration-ms`. |
| Playhead | Drawn at its time in the window; a position outside it is clipped rather than resting on the edge and claiming a time it is not at. |
| Show End | Drawn at its own time rather than pinned to the lane's right edge. |
| A changed Show End | `reconcileShowTimelineViewport` rescales the window around the playhead and keeps the author's magnification, as the v1 workspace does. |

[`ShowTimelineViewControls`](../../../src/components/ShowTimelineViewControls.tsx)
is the control cluster, in both surfaces' header row and reachable by keyboard
at 390 px. It mounts the v1 workspace's own
[`ShowTimelineNavigator`](../../../src/components/ShowTimelineNavigator.tsx) -
extracted from `ShowEditor` unchanged, and still the v1 toolbar's zoom control -
so the whole-Show strip, the draggable window thumb, its edge handles, the
keyboard pan and zoom (`←`/`→` on the thumb pans 5%, on an edge handle resizes
it) and the zoom percentage are one implementation on both routes. Beside it are
Fit to Show and the toggles below. The controls stay live on the read-only
surface: a Show that cannot be edited can still be read closely.

### Toggles

| Toggle | v2 meaning | State |
| --- | --- | --- |
| Snap to boundaries | The v1 Magnet. On, a drag magnetizes to the drawn structural times; off, nothing attracts. The drop grid is separate and always applies, and `Alt` remains the per-gesture escape to raw milliseconds. | `showEditorSessionStore.snapEnabled`, shared with the v1 route and persisted |
| Markers | The v1 Marker control, with its meaning intact: hidden Markers also stop being snap targets. | `markersVisible` / `markerSnapEnabled`, shared and persisted |
| Zone Layouts lane | Draws or hides the Layout occurrence lane. The v1 workspace derives that lane's visibility from the record instead; v2 always has the lane, so the author owns it. | `timelineLanes.zoneLayouts`, session only |
| Transition junctions | Draws or hides each Transition window and derived Cut on its Layer. | `timelineLanes.junctions`, session only |

The surface composes the snap candidates the way the v1 toolbar does: the
transport playhead always, the view's `structuralTimesMs` while the Magnet is
on, and Marker times while Markers are shown. They reach the resolvers as
`structuralTimesMs` on the drop inputs; omitting that field keeps every boundary
the view draws.

The Marker, Clip-edge and Show-End candidates are memoized on the view, but the
playhead is read per pointer sample from a ref a transport subscription keeps
current, because it is the one candidate that moves while the surface stays
mounted. A seek or a running transport therefore magnetizes to the playhead
where it is drawn now, and a position the transport has left attracts nothing.
A transport bound to another Show contributes no playhead candidate at all.

These v1 controls have no v2 meaning and are intentionally absent:

| v1 control | Why it is absent |
| --- | --- |
| Zones rail (`PanelLeft`) | The v1 workspace hides its Zone rail behind a toggle because the rail is a fixed column of the timeline grid. This surface names each Zone in its own row header, so there is no rail to open or close. |
| Stage diagnostics: Zone outlines, Selected Clip outline, other-Zone guides | Not timeline controls. They belong to `ShowStagePreview`, which this route already mounts, so they are reached there rather than duplicated here. |
| Property and held-appearance lanes | Drawn by `ShowV2AnimationLanes` beneath the timeline, from the authored tracks; the v1 workspace derives them the same way and offers no toggle either. Those lanes do not yet follow the window - see [What remains](#what-remains). |

A dormant Marker lies beyond Show End, so no window can contain it. It draws at
the Show End mark, where the v1 timeline draws it, and its label states the time
it is really at.

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
| Clip identity and placement | `buildShowClipInspectorModelV2` | none; read only |
| Entry policy (Continue / Restart) | `buildShowClipInspectorModelV2` | `admitShowV2PilotClipEntryPolicy` |
| Pattern instance values: animation speed, evaluation policy, declared sliders, stutter | `buildShowClipInspectorModelV2`'s `instanceValues` | `admitShowV2PilotInstanceProperties` |
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
- **One writer per authored field.** The Continue/Restart control and the
  Pattern instance values call the same owners the command layer calls, so a
  route write and an `update_clips` write cannot diverge (see below).

## The two single-writer seams slice 5 added

Slice 3 recorded that no exported owner wrote an existing Clip's `entryPolicy`
and that no admission wrapper wrote a Pattern instance's values. Both are now
one owner with two callers.

| Authored field | Pure owner | Command caller | Editor caller |
| --- | --- | --- | --- |
| `clip.entryPolicy` | `showClipsV2`'s `set-entry-policy` intent | `update_clips`'s `writeClipFlags` | `admitShowV2PilotClipEntryPolicy` |
| `patternInstances[*]` controls, clock, evaluation policy | `writeShowInstancePropertiesV2` in [`showInstancePropertiesV2.ts`](../../../src/engine/showInstancePropertiesV2.ts) | `update_clips.instance_properties` | `admitShowV2PilotInstanceProperties` |

- `set-entry-policy` changes one Clip, cascades nothing, reports that Clip
  alone, and refuses an unknown Clip or an unsupported policy (section 4). The
  derived reset event follows from Clip identity and first contribution, so the
  flag needs no second persisted list.
- The Pattern instance owner moved out of the command package into
  `src/engine/`, so the store no longer imports a command module. It writes only
  the requested fields, validates one complete candidate, and reports every
  effective Clip on the runtime, which is what the inspector warns about before
  the edit. Its `stepped_clock` key restores the v1 stutter row on the v2 route;
  the `update_clips` descriptor does not expose that key yet, so only the editor
  supplies it today (#1041 owns the command grammar).

## Animation lanes and the Group lane

[`ShowV2AnimationLanes`](../../../src/components/ShowV2AnimationLanes.tsx) draws
under the timeline surface from
[`buildShowV2AnimationLanes`](../../../src/engine/showV2AnimationLaneModel.ts):

- one lane per Property track, with its activation band, key dots and an SVG
  polyline whose samples come from the shared key evaluator. A key carrying a
  retained `curveSegment` is drawn **from that descriptor**, never re-normalized
  to a straight line between the retained endpoints - equal endpoint values can
  enclose a nonconstant interior (section 6). A retained key is marked, and the
  lane's `data-show-lane-retained-keys` counts them;
- a Show-owned track's lane spans global Show time; a Group-definition track's
  lane spans its own definition-local activation and says so
  (`alignedToShowTime: false`);
- one tick per authored held-appearance key for every Clip with more than one;
- one band per Group occurrence, labelled with its local children, selecting the
  occurrence for the Clip inspector's Group sections.

Clicking a lane reports a `property-track` selection, which selects the same
track in the Show inspector.

## The Show inspector

[`ShowEditorV2ShowInspector`](../../../src/components/ShowEditorV2ShowInspector.tsx)
sits below the Clip inspector in the same scroll container.

| Section | Model that plans it | Admission wrapper |
| --- | --- | --- |
| Set Show End, global Insert Time | `ShowV2ShowTimingEditor` | `admitShowV2PilotSetShowEnd`, `admitShowV2PilotInsertTime` |
| Property tracks and keys | `showV2PropertyEditorModel` | `admitShowV2PilotPropertyEdit` |
| Markers, including the chapter role | `showMarkerRouteModel`, `showChaptersV2` | `admitShowV2PilotMarkerEdit` |

Both timing edits are exact. Set Show End refuses an invalid shortening rather
than cutting or clamping content, and extending stretches the final Layout
coverage only. Insert Time at `p` shifts later content, Markers included,
extends a crossing Clip, and turns a crossing Group occurrence into a local hold
at the mapped local time while later occurrences only move; `p = 0` extends the
first Layout occurrence and adds no hold. An insertion strictly inside a visual
Transition or a timed Layout transfer is refused with the owner's own message
and writes nothing.

The side panel is one scroll container (`show-editor-v2-side-panel`), bounded in
height and scrolling only vertically, so its lower sections and its status line
are reachable by ordinary scrolling at 1440 px and at 390 px.

## Transition authoring and the Zone Layout lane

[`ShowEditorV2TransitionLayoutPanel`](../../../src/components/ShowEditorV2TransitionLayoutPanel.tsx)
authors what the Clip gesture seam does not: Transitions at the boundaries the
view model drew, and the Zone Layout occurrences beneath them. It reads the same
view model and the same capture as the timeline and the inspector,
plans one explicit intent per action with a pure editor model, and submits it
through the closed admission in `src/store/showV2PreparedEditAdmission.ts`. It
writes no record itself, allocates identity only through the caller-supplied
generator, and reports an owner's refusal verbatim.

### Boundaries

`showV2BoundaryOptions(view)` lists every drawn junction in timeline order and
addresses it by `showTimelineSelectionKey`. A `derived-cut` junction also carries
the junction key `showV2TransitionJunctionKey` builds - the boundary time, Zone,
Layer and the two Clip identities - which is exactly the key
`planShowV2TransitionEdit` resolves. A key that names no exact adjacency finds no
junction and refuses; storage equality has no tolerance.

| Selection | Offer | Owner |
| --- | --- | --- |
| derived Cut | Insert: kind and variant from the full catalogue, duration in seconds | `planShowV2TransitionEdit` `insert` through `admitShowV2PilotTransitionEdit` |
| Transition | Change kind, crossfade policy, every catalogue parameter but duration | `planShowV2TransitionEdit` `settings` / `parameter`, same admission |
| Transition | Duration | `admitShowV2PilotTransitionResize`, which applies the delta once to the incoming and downstream affected set |
| Transition | Reset to Cut | `planShowV2TransitionEdit` `reset`, which plans the landed ramp projections when the Transition carries any |

The palette is the v1 `ShowLayerTransitionPalette` with its new `fullCatalogue`
opt-in: the v1 Layer palette withholds Fade and Motion, while the v2 owner
decides their eligibility itself and returns RL08 in its own words, so the v2
surface offers them and shows the refusal. Parameters are the v1
`ShowTransitionParameters`, now typed against `ShowTransitionSettingsCarrier` so
one control set reads a v1 boundary record or a `ShowTransitionV2`; `durationMs`
is omitted there because the resize owner holds it. The selected Transition's
X-ray is the v1 `ShowTransitionXrayPictogram`, widened the same way.

A whole-output Transition from conversion is selectable and editable by its own
identity - kind, parameters, duration and Reset - and the panel never creates
one: Insert offers only the derived Cut junctions the view model drew.

### The Zone Layout lane

`buildShowV2LayoutEditorModel` adds `previousOccurrenceId`, `splitCapable`,
`splitPosition` and `incomingTransfer` to the pilot's occurrence rows, and
`planShowV2LayoutEdit` gained three requests beyond the pilot's four. Every
request names no identity; the planner allocates exactly what the owner requires
and refuses a blank, duplicate or already-owned one.

| Action | Intent | Identity the planner allocates |
| --- | --- | --- |
| Layout | `select-layout` | none |
| Switch | `move` | none |
| Split position | `set-parameters` | none, and it is offered only where the definition partitions the Stage |
| Make Layout Unique | `make-unique` | one Layout definition id |
| Duplicate | `duplicate` with a content plan | one occurrence id plus one per identity `showLayoutDuplicateSourceIdsV2` enumerates |
| Remove | `remove` | none; the predecessor extends |
| Transfer | `set-transfer` | one transfer id, or `null` to clear; a zero duration clears |

`admitShowV2PilotLayoutOccurrenceEdit` accepts those three further intents with
the same exact-field validation, so a malformed duplicate plan, an unknown
transfer direction or a foreign `set-show-end` still refuses with `invalid-intent`
and zero writes. The owner keeps its own protections: a switch move that would
crop an owned split-position track refuses `owned-track-out-of-bounds`, removing
an occurrence with a meaningful transfer or track refuses
`meaningful-occurrence-data`, and a content duplicate whose interval is crossed
refuses `boundary-crossing-content`.

### History and the capture

The panel renders no history control of its own: slice 2's timeline above owns
Undo and Redo over `showV2Histories`, and one admitted Transition or Layout edit
leaves exactly one entry there for it to undo. `useShowV2EditCapture` builds the
one prepared-edit capture the route submits and answers the two staleness
questions every adapter must ask before it reports an outcome, so a refusal, a
superseded save and a save failure each reach the right surface or none.

## The transport

[`ShowEditorV2Transport`](../../../src/components/ShowEditorV2Transport.tsx) is
the route's play, pause, return-to-start and playhead readout. The Stage preview
owns playback itself; this asks the transport store for a position exactly as
the v1 controls do, and the ruler draws the playhead from the same store,
subscribing to the position in its own leaf so playback repaints a hairline
rather than the whole timeline.

It carries the v1 route's keyboard seek: `Space` toggles playback through the
shared studio claim, `A` returns to the Show start, and `←`/`→` seek five
seconds. The arrows belong to a focused Clip first - the timeline surface
cancels the event it handles, and a cancelled event never also seeks.

## The Show summary, artifacts and delivery

[`ShowEditorV2DeliveryPanel`](../../../src/components/ShowEditorV2DeliveryPanel.tsx)
closes the route with what a Show is and what it delivers. It reads the same
prepared capture everything else does, so the summary, the gauge, the `.epe` a
Controller receives and the `.epe` a download writes all describe one compiled
Show.

| Section | What it reads | Owner |
| --- | --- | --- |
| Show summary | `buildShowV2RouteSummary` | derived, never stored |
| Artifact gauge and inventory | `buildShowV2RouteArtifacts` | `buildShowEpeExportV2` plus `buildDeliveredShowSourceInventory`, drawn by the v1 `ShowArtifactInventoryBody` |
| Export `.pxlshow` | `buildShowFileBundle` (v2 overload) then `serializeShowFileBundle` | the landed file bundle |
| Export `.epe` | the same artifacts with a fresh program id and preview image | `buildShowEpeExportV2` |
| Reopen artifacts | `qualifyShowV2PilotArtifacts` | reopens both through their own importers |
| Reload saved v2 | `reloadShowV2Pilot` | the store's provider read |
| Send to Controller | `useShowV2ControllerDelivery` | `prepareShowControllerArtifact`, published to the Controller panel's own action row |

[`showV2RouteDelivery.ts`](../../../src/engine/showV2RouteDelivery.ts) is the
pure part. It refuses rather than describing bytes nothing can deliver: an empty
Show, an invalid record, or an export the `.epe` importer does not reopen with
the compiled Show in it. `describeShowArtifactPatternsV2` is the v2 counterpart
of the v1 describer - it counts Pattern instances and their effective Clip uses,
ordinary Clips and materialized Group Clip uses alike (section 4), rather than
Scene cells.

Send to Controller prepares against the connected Controller's observed map and
firmware through `buildShowControllerCompatibilityContext`, which came out of the
v1 editor unchanged so both routes compare the same way, and re-measures the
prepared source because preparation can append a renderer adapter. A delivery
whose Controller session changed between preparation and confirmation is refused
rather than sent, and a save carries the preview image the firmware shows.

Each command publishes its outcome only while the capture it read is still the
route's own and it is still the newest such command; `Reload saved v2`, which
replaces the record itself, asks only the second question.

The action row reads a standing successful push as "sent" and gates both Run and
Save while it stands, so the route releases a successful result 3.5 s after it
lands, exactly as the v1 editor does; a failed result stays until its notice is
dismissed, and a result belonging to another artifact is left alone
(`ShowV2ControllerDeliveryCompletion.test.tsx`).

## Adding a Clip

The gesture seam moves, resizes, splits, duplicates and deletes Clips;
[`ShowV2AddClipEditor`](../../../src/components/ShowV2AddClipEditor.tsx) in the
Clip inspector is where a Clip that did not exist comes from, and it is the
surface section 4 requires for the explicit runtime choice: adding a Pattern
reuses its sole existing instance, several independent instances require an
explicit selection, and a Pattern with none makes its first instance as explicit
placement setup. Identity is allocated once, at submission, by
`allocateShowClipTimingIdsV2`.

## The Show list, fresh Shows and import

Behind the same gate the Shows rail lists the stored v2 rows beside the v1 ones
(`showV2Rows`, filled from `listShowDocumentsV2`), a new Show is authored
natively as v2 by
[`createShowV2WithOutputContract`](../../../src/engine/showCreationV2.ts), and a
version-2 `.pxlshow` imports through `parseShowFileBundle({ acceptV2: true })`
and `planShowImportV2` / `applyShowImportPlanV2` with its Libraries. A version-1
file keeps its own planner, here and after activation. The fresh v2 Show is the
current two-Clip two-sided Crossfade shape: its Stage comes from the v1 builder
and it compiles to exactly what a fresh v1 Show compiles to, differing only in
its own identities and in carrying no chapter Markers, because a native Show has
no Scene labels to project (section 8).
[`show-state-history-persistence.md`](show-state-history-persistence.md) owns
the store rules for all three.

A stored v2 row is an ordinary personal Show in that list (#1039): it renames,
duplicates and trashes with the same row actions a v1 row offers.

| Rail action | v2 owner | Behavior |
| --- | --- | --- |
| Rename | `renameShow`, dispatching to the v2 row owner | an open Show renames through `renameShowV2Pilot`, so the edit joins its history and save queue; a listed row that is not open is replaced in place and never becomes a working copy |
| Duplicate | `duplicateShowV2Row` | copies the open working record when there is one, otherwise the stored bytes, under a fresh id and a name free across both collections, then opens the copy |
| Empty Trash | `removeShow` | one `deleteShow` by id serves both versions; the row, its working copy, its history and any save failure are forgotten together |

The persisted rail organization is keyed by Show id across both stored versions,
so every reconciliation passes `personalShowIds(...)` - the startup hydration
load as well as each mutation. Reconciling against the v1 ids alone prunes every
surviving v2 row from the organization, which is what emptying the Shows Trash
and, on every page load, the startup load used to do; the startup case also
persisted the pruned organization, after which the rail's id-sync effect
re-appended each v2 row at the root (`PatternList.test.tsx`, "the Shows rail
with stored v2 rows"). Every accepted v2 replacement also patches the matching
`showV2Rows` entry, so a rename is visible in the list without a workspace
reload, and a rolled-back save restores the durable name with the record.

## Surfaces the v1 editor has and this route does not

Named here because #1039 made this route the production editor for every
converted Show, and specification section 1 forbids narrowing accepted
behavior silently. Each of these is reachable on the v1 `ShowEditor` for a row
still stored as v1, and has no counterpart here:

| Surface | What the v1 editor offers | v2 domain owner that exists |
| --- | --- | --- |
| Show output summary and Show properties | the contract kind, pixel count, output or reference map, and editing them | `set_output_contract` |
| Show stage | choosing the Stage Map | `set_stage_map` |
| Zone Map | adding, removing and renaming Zones | `update_zone` |
| Zone Layout definition | routing mode and operator for a Layout definition (the panel here edits occurrences, not definitions) | - |
| Show Trails | enabling output trails and their retention | `set_output_trails` |
| Show actions menu | View code, Download .epe from the header (the delivery panel exports both artifacts) | - |

The commands exist for most of them, so this is a missing editor surface
rather than a missing capability, and an agent can still author them. It is
what a converted Show loses until that surface lands, and it is why
`e2e/shows.auth.spec.ts` now seeds version-1 rows explicitly for the tests that
cover these: those tests describe live behavior for unconverted rows, not a
creation flow that still produces one.

## What remains

`ShowV2RoutePilot` and `?show-v2-pilot=1` are retired, and #1039 flipped
`SHOW_V2_ROUTE_DEFAULT`, so this is the production Show editor. The store's v1
mutators remain v1-typed and #1042 retires them with the rest of the v1
authoring owners. The animation lanes report a selection and draw but accept no
drag. The table above lists the surfaces still to build.

The agent binding is no longer among them. The route now mounts the shared
agent editor lifecycle, declaring version 2 and handing the admission the same
prepared capture `useShowV2EditCapture` owns, so an agent command sequence and
a manual edit are checked against one Stage preparation and adopted by one
writer. `read_show` therefore answers v2 for this record, and the executor,
the editor admission and both command catalogues follow that declaration; see
[agent candidate application](agent-candidate-application.md#version-2-records-1039).
The binding registers no field-activity scope, so a v2 candidate never waits on
active input the way a v1 candidate does while the author is typing.

The v1 timeline's zoom, snap and diagnostic toggles landed with #1039 and are
described under [The visible window](#the-visible-window). Renaming and
duplicating a v2 row from the Shows rail landed with #1039 too.

One gap remains in that window: `ShowV2AnimationLanes` - the Property lanes, the
held-appearance keys and the Group occurrence bands drawn beneath the timeline -
still maps every time across the whole Show, so a zoomed timeline no longer
lines up with the lanes under it. The lanes read their own geometry from the
view model's precomputed fractions and are mounted by `ShowEditorV2Route`, so
carrying the window into them is its own slice.

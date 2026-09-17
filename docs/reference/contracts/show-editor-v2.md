# Show editor on v2

Canonical authority is [the Scene-retirement specification](../../plans/scene-retirement-specification.md)
§3 (record and identity), §5 (Cut as absence and whole-output scope), §8 (Layers,
Layout occurrences, Markers, Show End) and §10 (no mixed window), and issue
#1056. This describes what is landed after slice 1: one version-agnostic timeline
view model, both projections into it, the v1 container consuming it, and a
read-only v2 rendering on the ordinary route. Editing a v2 record on that route
is not landed.

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
| `items[].legacy` | `sceneId`, `startSceneId`, `endSceneId`, placement kind and ids, `logicalClipId`, `segmentIds`, `localStartMs` | slice 2 (gesture adapters) |
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
  `ShowUnifiedTimelineClipProjection` and the store's v1 mutators (slice 2);
- the Clip inspector and its satellites (slice 3);
- property lanes, which the view model does not carry (slice 5).

## The version gate

The ordinary route renders a `ShowRecordV2` read-only behind a dev-only
`?show-v2-editor=1` opt-in. `ShowEditorV2ReadOnly` resolves the record through
the existing `openShowV2Pilot` store path, projects it with
`projectShowTimelineV2`, and renders `ShowTimelineReadOnlySurface` plus
`ShowStagePreview kind="prepared-v2"` over `captureShowStageEditV2`.

`?show-v2-pilot=1` still renders `ShowV2RoutePilot` and takes precedence. Without
either flag the ordinary editor renders a v1 record exactly as before. The route's
missing-Show guard stands aside for both opt-ins, because a converted row leaves
the v1 list until #1039 couples them.

`ShowTimelineReadOnlySurface` draws only from the view model. It holds no record,
takes no callbacks that change one, and offers no control that can: every item is
a focusable `aria-disabled` element, so keyboard traversal reaches each Clip,
Layout occurrence and Marker while nothing is actionable. One status line states
the condition. The surface registers no agent binding, so no command can reach a
v2 record and §10's forbidden mixed window stays closed.

## What remains

Slices 2-6 of #1056 own gesture adapters, the Clip inspector, Transition and
Layout authoring, animation and Markers, and the remaining route content, after
which `?show-v2-pilot=1` and `?show-v2-editor=1` both retire. Until then a v2
record on the ordinary route can be read, previewed and traversed, but not edited,
and the store mutators, executor, admission and MCP surfaces remain v1-typed.

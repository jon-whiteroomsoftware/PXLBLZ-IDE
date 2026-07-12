# Issue #430 - Show timeline lifecycle audit

The Show timeline supports a complete scene-by-zone authoring loop. A user can
create a Show, alter its scene structure, delete and place clips, compose holds
and zone spans, author transitions and automation, preview the result, and send
the canonical generated artifact to a Controller. The grid deliberately does
not implement freeform clip dragging.

## Action matrix

| Area | Command | Status and owning path | Verification |
| --- | --- | --- | --- |
| Show | Create, rename, delete | Supported by the Shows rail and `showStore` persistence | Store and route tests |
| Scene | Select, rename, change duration | Supported by scene header and Properties | Component and model tests |
| Scene | Add, duplicate, delete | Supported; delete confirms because it can remove or shorten several clips | Component, model, and persistence tests |
| Timeline | Play, pause, seek, split | Supported; split rejects transition windows and fragments under one second | Component, replay, model, and compiler tests |
| Timeline | Zoom, pan, fit, resize visible range | Supported as editor-only viewport state | Component and pure viewport tests |
| Clip | Select and replace source Pattern | Supported in Properties | Component and model tests |
| Clip | Delete and place | Supported. Delete leaves an explicit empty slot; Pattern choice creates and selects a fresh clip | Model, store, component, and authenticated browser tests |
| Clip | Move or reorder by dragging | Intentionally outside the scene-by-zone grid model. Delete and place is the supported relocation path | Product boundary documented |
| Clip | Hold across scenes | Supported by `sceneSpan` | Model, component, and compiler tests |
| Clip | Span or repeat across zones | Supported by `zoneSpan` and `zoneMode` | Model, component, and compiler tests |
| Clip | Compose a hold and zone span | Supported as one rectangular footprint; every intersecting clip is removed | Reciprocal model tests and component test |
| Clip | Mirror, phase, brightness, time scale | Supported as non-destructive adaptations | Model, component, and compiler tests |
| Clip | Start offset, stepped clock, light shutter | Supported under advanced clip controls | Store, component, and compiler tests |
| Clip | Continue or Restart on entry | Supported after split or at an existing boundary | Model, component, and compiler tests |
| Transition | Select, change kind, duration, easing, or delete | Supported for every boundary. Delete restores the explicit cut form | Model and component tests |
| Transition | Crossfade, wipe, dither, portal | Supported with reported renderer cost | Compiler execution and component tests |
| Automation | Time, brightness, public Pattern slider | Supported as destination targets plus boundary-owned curves | Model, component, and compiler tests |
| Zone | Add, rename, change nominal count, delete | Supported; deletion shrinks or re-anchors surviving spans | Model and component tests |
| Routing | Add, duplicate, edit, remove layout; switch at boundary | Supported with named layouts and range parsing | Model, component, and compiler tests |
| Stage | Choose map, inspect coverage, solo zone | Supported in Show setup and Stage preview | Component and preview tests |
| Artifact | Inspect, export EPE, Run, Save | One canonical generated Show source feeds every path; Controller adaptation is explicit | Unit/component tests; live Controller delivery remains a bench check |

## Repairs made during the audit

Deleting a clip previously created an uneditable hole. Empty timeline slots now
have a persistent add affordance and a Properties inspector that places a
personal or built-in Pattern through the model and persistence store.

Hold and zone-span growth previously cleared conflicts on only one axis. A clip
could therefore overlap another clip after composing both operations. Both
commands now use rectangular intersection, and zone deletion mirrors scene
deletion by shrinking or re-anchoring a surviving span.

## Browser evidence

An authenticated localhost pass created a temporary Show, deleted its first
clip, placed `TestPattern2D` into the empty slot, observed the compiled artifact
update, and split the timeline into a third scene. The temporary Show was deleted
after the pass. No existing Show was modified.

# Human feedback: Fable Round 1 global view

This checkpoint records the first review of Fable's global Show Timeline. The
Scene-local Fable view has not yet been reviewed.

## Decisions and useful contributions

Reject the stable bottom Entity Detail Panel as the primary property surface.
It is less space-efficient and less proximate than the anchored modeless panel.
Do not add larger row modes merely for reassurance; the compact expert baseline
is preferred.

Fable contributes one important automation idea: show the actual property value
and change shape in the lane. Replace text-only target cells with a thin
property-scaled sparkline. For common normalized properties, the line directly
shows zero-to-one motion; other domains such as time scale, translation, or
rotation use their own declared range and baseline. Keyframes remain visible on
the curve, and the selected point or playhead sample exposes a precise numeric
value.

Whether the bottom compilation/status readout should collapse remains open and
is separate from the rejected property dock.

## Scene, placement, and zone ownership

The fixture and both mock families make a Scene column and Pattern placement
look too equivalent. They are orthogonal:

- a Scene is a semantic, Show-wide time passage spanning every zone;
- a zone is a stable routing and scheduling row;
- a Pattern placement occupies time within one or more zones; and
- Scene-local composition may contain many back-to-back or overlapping
  placements, Effects, and keyframes inside one Scene.

Property lanes must nest under their typed owner, usually a Pattern placement,
instead of reading as permanent Scene-by-zone state. A Scene boundary supplies
global structure and may own a Transition or routing switch; it does not own
every Pattern property visible beneath it.

In the current coarse model, a cell may span multiple Scene columns with one
static adaptation value. A boundary ramp targets the destination cell. The UI
must not imply that every Scene automatically creates a new brightness or
opacity value for each zone.

## Realistic density requirement

The current fixture contains too much empty zone time and therefore understates
the real problem. Plausible Shows may have continuous occupancy, back-to-back
placements, many internal events, routing switches, and overlapping overlays.
The next design round needs at least:

- one long, low-zone Show with dense local activity;
- one short Show with approximately twelve zones and near-continuous occupancy;
- one Scene with many rapid base placements, overlays, Effects, and keyframes;
  and
- repeated routing-layout switches.

The design must remain legible when nearly every horizontal pixel represents
authored content. Empty space must not be the mechanism that makes it work.

## Open question exposed by the review

The medium Scene overview becomes more important once Scenes and placements are
drawn honestly. It must summarize the internal placement rhythm of the whole
Scene across zones without looking like a single clip or becoming an embedded
Scene editor.

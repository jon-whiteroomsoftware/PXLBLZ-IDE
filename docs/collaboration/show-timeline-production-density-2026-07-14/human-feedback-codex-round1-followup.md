# Human feedback: Codex Round 1 follow-up

This checkpoint preserves decisions and clarifications made after reviewing the
first Codex feedback summary. It remains prior to the Fable review.

## Confirmed direction

- Make the left library explicitly collapsible to recover horizontal Timeline
  space. Keep restoration obvious; do not cover it or silently discard it.
- Keep the Stage fixed in the ordinary Show workspace and specialize its modes.
  Defer a detachable top-level Stage.
- Explore the three-resolution Scene model holistically so later complexity does
  not force an incompatible retrofit.
- Treat the medium Scene representation as a non-authoring overview in its first
  design pass. It may support wayfinding, selection, opening Scene detail, and
  snap references, but changing Scene-local content requires the full Scene
  editor. This is a provisional bright line that must earn its pixels in use.
- Anchor the Entity Detail Panel visibly to its selected entity and distinguish
  editable controls from read-only facts.

## Medium Scene overview

The overview should expose internal time beats and Pattern activity while the
global Timeline remains visible. At useful widths it may show cut and keyframe
notches, activity shading, and recognizable Pattern segments. At extreme zoom,
those details must collapse into a compact complexity signal rather than trying
to draw twenty events in a few pixels.

Hidden internal beats may become temporary snap guides during a drag or focused
alignment operation. Permanently rendering every hidden beat would create noise
and imply editability the overview does not provide.

## Zone-preview interaction

Zone visualization is an explicit mode, not an accidental hover effect. A
Show/Hide Zones control should originate from the zone or routing context. Once
enabled, the Stage displays the active routing layout as colored, labeled
regions; hover may then cross-highlight a region and its Timeline row. The same
control and Escape should dismiss the mode. The active visualization follows
routing switches at the playhead.

## Reusable zoning model

Do not introduce named groups of zone identities. The existing reusable unit is
a named **routing layout**:

- zones retain stable identities such as Left, Center, Right, and Entry;
- a routing layout stores how each zone maps onto the Stage or physical pixel
  ranges;
- layouts can be duplicated, edited, named for a passage such as Intro or
  Dramatic, and reused by multiple boundary switches; and
- switching back selects the earlier layout id rather than recreating its
  zoning.

The Stage map remains the coordinate or pixel surface. Individual zones do not
each own an independent map; each routing layout owns the collection of
per-zone assignments over that shared Stage. This keeps a zone's Pattern lane
stable while its routed pixels or geometry change.

A routing switch should be a selectable Timeline entity at a Scene boundary.
The current headless model already represents it as a boundary Transition of
kind `routing`, so the UI needs to expose an existing domain event rather than
invent a second switching model.

## Automation correction

The Codex mock drew opacity keyframes outside the owning PortalBloom placement.
That has no intended semantic meaning and caused the reasonable impression that
the lane belonged to the zone. Treat it as a mock defect. Placement-owned
keyframes must remain inside the placement's local time range. A boundary-owned
ramp may occupy a Transition region, but it must be drawn and labeled as a
different owner.

Additional keyframes may be added inside the placement. Extending animation
beyond it requires extending the placement or authoring another placement and
track; the lane does not silently continue as zone state.

## Status before Fable review

The Codex family is strong enough to refine. The remaining open work is to
prototype the medium Scene overview, explicit zone-preview mode, collapsible
library, corrected automation geometry, and clearer Entity Detail Panel
affordances. No comparison verdict has been made.

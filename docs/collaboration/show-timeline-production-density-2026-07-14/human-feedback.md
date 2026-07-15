# Human feedback after Round 1

Round 1 produced two useful proposals, but the preferred direction is not an
even compromise between them. The compact Codex global and Scene-local grammar
is the stronger foundation. Fable contributes several valuable representations,
especially hierarchical Scene-local lanes, Effect spans, and value-bearing
automation curves. Round 2 should combine those strengths only where the
result remains coherent, dense, and faithful to the Show model.

The design is a specialist IDE. Horizontal Timeline space is unusually
valuable, authored content may be extremely dense, and every persistent pixel
must earn its keep. Approachability matters, but it does not justify oversized
rows, a distant property surface, or decorative whitespace.

## Stable application frame

The ordinary Show workspace retains the same three-pane application frame and
the same Stage location in both scopes. Scene-local editing replaces the
Timeline's time domain in place; it does not introduce a separate application
route or a different Stage representation.

The left library should be explicitly collapsible with an obvious restoration
control. Do not silently remove it at an arbitrary breakpoint. The Stage stays
fixed and gains specialized modes before the design considers moving or
detaching it. A detachable Stage is deferred.

The global and Scene-local views should retain the same transport, viewport,
selection, disclosure, and entity-detail grammar. The current compact transport
row, dedicated Transition track, and close visual transfer between scopes are
strong.

## Color is semantic

Do not assign persistent colors merely to distinguish zones. Zone identity is
already communicated by stable row position, label, and routing context, so
zone colors spend a scarce channel without adding enough information.

Use restrained secondary colors to distinguish semantic classes or behavior:
Pattern placements, Effects, automation, Transitions, routing events, selection,
warnings, and continuation state. The color becomes a cross-surface binding:
the same accent can connect a Timeline span, list item, icon or badge, Entity
Detail Panel, and related Stage affordance even when those representations are
far apart. Fable's colored Effect spans are a strong example. The palette should
remain subtle enough that selection and errors keep clear priority, and color
must reinforce rather than replace labels, shape, and position.

## Property editing and automation

Use the anchored modeless **Entity Detail Panel**, not Fable's stable bottom
property dock. One panel transfers between selections and attaches visibly to
its owner with a stem, aligned edge, or leader. It flips above or below according
to available space. Editable controls must read differently from quieter
read-only identity, context, and cost facts. Pinning may deliberately break the
anchor; free repositioning remains a future feature.

Property lanes belong to their typed owner, usually a Pattern placement, and
remain bounded by that owner's time range. Draw a thin property-scaled sparkline
or curve in the lane so the user can see change shape and approximate values.
Normalized properties use a zero-to-one range; other properties declare their
own range and baseline. Diamonds mark actual authored keys or fixed change
points, and selection or the playhead reveals the precise numeric value.

The Codex opacity keys drawn outside PortalBloom were a mock defect. A
boundary-owned ramp may occupy a Transition region, but it needs distinct
ownership and presentation.

## Scene-local hierarchy

Fable's clearest contribution is the vertical Scene-local hierarchy: a zone or
placement row selectively reveals Effect spans, overlays, and automation lanes
directly beneath the owning content. The Effect lane is particularly strong. It
maps which Effect is active over time while the Entity Detail Panel edits the
ordered stack and parameters.

Use compact expert rows rather than Fable's 36/48-pixel density modes. Vertical
space is spent only through explicit, task-relevant disclosure. Realistic
fixtures must demonstrate rapid cuts, overlapping placements, several Effect
spans, overlays, and multiple animated properties without relying on empty
space.

## Boundary Transitions in Scene-local scope

Animations and Effects owned by a placement or Scene-local composition remain
editable inside Scene-local scope. A Transition between Scenes is different: the
boundary owns it, even though its visible interval overlaps content in the
incoming and outgoing Scenes.

Scene-local scope should therefore expose compact, read-only incoming and
outgoing Transition lanes near the top of the Timeline. Their spans use actual
local-time geometry, so an incoming four-second crossfade occupies the first
four seconds while the new Scene's placements, Effects, and automation remain
fully active underneath it. The outgoing Transition appears at the other end in
the same way. Selecting either representation may identify the boundary and
offer a direct route back to the global boundary editor, but Scene-local scope
must not imply that the Scene owns or edits it.

## Three Scene resolutions

Continue exploring three levels of Scene representation:

1. A collapsed global Scene shows a compact internal-event silhouette or
   complexity signal.
2. A medium read-only overview supports wayfinding, internal beats, Pattern
   rhythm, cross-Scene alignment, and temporary snap references while retaining
   global context.
3. The full Scene-local editor authors rapid cuts, overlays, Effects, and exact
   keyframes.

The medium representation must not become a second embedded editor. At extreme
zoom, internal details collapse into density or complexity rather than drawing
twenty false controls into a few pixels. Hidden internal beats may appear as
temporary snap guides during an alignment gesture.

## Zone and routing visualization

Zones retain stable identities. Named routing layouts remap those identities to
physical ranges or Stage geometry, and boundary routing switches select an
existing layout. Do not introduce named groups of unrelated zone identities.

The Stage should offer an explicit Show/Hide Zones mode initiated from the zone
or routing context. While enabled, it colors and labels the routing layout active
at the playhead; Stage regions and Timeline rows may cross-highlight. The same
control and Escape dismiss it. Previewing unrelated or future zone sets is
extra-credit work and is deferred.

## Scene boundaries and continuing Patterns

A Scene is a Show-wide semantic passage, a zone is a stable scheduling row, and
a Pattern placement occupies time within one or more zones. The UI must not make
Scenes and placements look like equivalent objects.

When one Pattern continues visibly across a Scene boundary, global scope may
present the adjacent placements as one joined run, but a subtle seam or
continuation cue must preserve Scene ownership. Under the proposed composition
model, the Show owns the continuing Pattern instance while each Scene owns its
bounded placement. Opening the later Scene shows a local segment labeled
"continues from previous Scene." Placement edits affect only that Scene's
segment; instance-level state and clock continue unless the user chooses
Restart Here or Make Independent.

## Representative fixtures

Round 2 must use fixtures that obey actual model and compiler constraints. Each
visible span needs a named owner; every semantic boundary must state whether
Pattern state continues or restarts and what, if anything, changes visibly.
Include:

- one long, low-zone Show with dense local activity;
- one short Show with approximately twelve zones and near-continuous occupancy;
- one Scene with rapid base placements, overlays, Effects, keyframes, and both
  incoming and outgoing boundary Transition spans;
- repeated routing-layout switches;
- a visually silent Scene boundary with continuing Pattern state; and
- an active boundary caused by routing, property, placement, or source changes.

## Open human gates after Round 2

- Does the miniature Show navigator in Scene-local scope earn its persistent
  height, and what interaction should it support?
- What exact information makes the medium Scene overview useful without making
  it look editable?
- Should the compilation/status readout collapse? This is separate from the
  rejected property dock.
- How should incoming and outgoing boundary Transition lanes behave when their
  durations consume most or all of a short Scene?

## Human verdict after the semantic-zoom study

The ordinary Timeline zoom is approved. Continuous zoom keeps the selected
Scene anchored, expands its geometry symmetrically, and spreads the existing
read-only X-ray signal so internal beats become legible and useful as snap
references. This behavior is ready to specify for implementation.

The final design uses a stable-height explicit X-ray. Progressive X-ray's
40-to-64-pixel threshold added labels but consumed sixty percent more vertical
space without adding proportionate information. Focus Bridge communicated
Scene detail well, but automatically replacing the X-ray with a 164-pixel local
lens made zoom perform an unexpected scope change.

Retain Focus Bridge's dense read-only detail as an explicit Scene inspector.
An inspect or magnify action on the stable X-ray opens one temporary modeless
layer for the selected Scene. It preserves global alignment, shows local ruler,
cuts, Effects, automation shape, and boundary context, and offers `Open Scene`
for full authoring. It never opens merely because zoom crossed a threshold.
Only one inspector is open at a time; Escape or clicking away dismisses it.

The production toolbar has three spatial regions. Transport and time remain on
the left, continuous zoom and its numerical readout remain centered, and
commands remain on the right. Play/Pause is the primary transport action and
precedes the smaller Go to start action. The centered zoom group reads as
minus, slider, plus, and current multiplier. Fit belongs with right-side
commands alongside Split, Clone, and Snap.

The time readout remains on one line until the Timeline header is genuinely
narrow. Its compact state is designed rather than wrapped: current and total
duration use the same precision and alignment, with current time bright and
total duration subdued. Responsive priority first shortens the zoom slider,
then converts commands to icon-first controls, and only then stacks time.

Initial selection is single-owner only. Clicking an entity selects it and
opens its anchored Entity Detail Panel; selecting another transfers the panel;
empty space or Escape clears it. Drag selection, multi-select, grouped movement,
and general copy/paste are deferred. Select is the pointer's default behavior,
and Space-drag is a gesture with transient cursor feedback rather than a
persistent toolbar item.

Clone earns a first-release toolbar action without requiring general
copy/paste. It duplicates the selected cloneable entity immediately after the
original and ripples later content forward. Split remains enabled only when the
playhead intersects the selected clip. Both actions may share duplication
machinery but keep distinct user semantics.

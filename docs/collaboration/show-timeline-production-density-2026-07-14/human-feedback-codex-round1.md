# Human feedback: Codex Round 1

This checkpoint records the user's review of the Codex global Show Timeline and
an initial pass over its Scene-local scope. The Fable proposal has not yet been
reviewed. This is evidence for the later cross-revision, not a final stakeholder
verdict.

## Overall assessment

The denser design is substantially easier to understand than the current Show
editor and feels less complicated despite exposing more capability. The global
and Scene-local scopes transfer well because they preserve the same Timeline
grammar and application frame. The design is strong enough to refine rather
than restart.

## What is working

- The transport and viewport toolbar is organized clearly. Play, Snap, Select,
  and temporary Space-drag read as one coherent editing row.
- Transitions are much easier to find and understand in a labeled, dedicated
  track with clear boundary geometry.
- Compact primary rows leave room for selectively disclosed automation without
  making the Timeline feel crowded.
- User-controlled vertical disclosure is promising. Automation lanes show how
  the editor can spend vertical space on the current task instead of displaying
  every possible property.
- Entering Scene-local scope is clear, and the close resemblance to the global
  Timeline is a major strength.
- The current scope bar gives the Show navigator proportionate space and may be
  preferable to moving it into top-level application navigation.

## Horizontal and vertical scaling

Horizontal authoring space is especially valuable and must be treated as a
first-class resource. Show shapes may vary from long, low-zone arrangements to
short, twelve-zone arrangements; the design cannot assume that complexity grows
on only one axis.

The library's disappearance at a narrow prototype breakpoint is not yet an
approved production rule. Explore explicit pane collapse and restoration rather
than silent removal. Keep the Stage in its stable right-side location by
default. A detachable Stage may benefit multi-monitor work later, but it does
not create space on a single maximized display and must not be required by the
core layout.

The Stage should specialize before it moves. In particular, it should support a
zone-routing visualization mode in addition to rendered Pattern output.

## Three useful Scene resolutions

The two current scopes leave room for a middle representation:

1. The collapsed global Scene remains a structural object but exposes a compact
   event silhouette: keyframe or cut notches, shaded activity, and snap targets.
2. A medium-detail Scene overview reveals enough internal timing to align events
   with other Scenes or zones while retaining global context. It should avoid
   becoming a second full editor embedded in every Scene.
3. Scene-local scope remains the full editor for rapid cuts, overlays, Effects,
   and exact keyframe work.

The middle level needs evidence. Its first purpose is cross-Scene alignment and
orientation, not unrestricted local editing.

## Zone and routing visualization

Add a Stage mode that colors and labels zones for the routing layout active at
the playhead. Selection and hover should synchronize between the Stage overlay
and zone rows. The control belongs near the zone or routing context and may
reuse the existing map-preview interaction vocabulary.

Current model truth constrains the design:

- `ShowRecord.zones` is one stable list of logical zone identities.
- Each routing layout remaps those same zone ids to different physical ranges or
  normalized geometry.
- A routing switch selects a destination layout at a Scene boundary without
  restarting Pattern state.
- Adding or removing a zone updates every routing layout; the current model does
  not switch between unrelated zone sets with different identities or counts.

Therefore Left, Center, Right, and Entry remain one zone-row group while layout
switches remap them. The UI needs an explicit active-layout identity and routing
switch representation, not duplicate zone-row groups. Supporting time-varying
zone sets would be a separate model expansion.

## Automation ownership and rendering

An automation lane belongs to its selected Pattern placement or other typed
target, not permanently to the containing zone. Its time span is bounded by its
owner. A later Pattern placement in the same zone has its own static value or
animation.

The current global model stores cell-owned values and boundary-owned ramps;
Scene-local V2 adds placement-owned keyframe tracks. The UI must distinguish a
continuous interpolated curve from fixed or held keyframes. If the authored
value oscillates, the lane should render the curve; diamonds mark actual
keyframes or fixed change points rather than decorative inflections.

## Entity Detail Panel

Use **Entity Detail Panel** as the product term. Its anchored presentation is a
mode, not a separate entity type.

The current mock places the panel near the selection but does not visibly anchor
it. The simple production version should attach it closely to the selected
entity with a stem, leader, aligned edge, or equally unambiguous relationship;
it should choose above or below according to available space. Selecting another
entity transfers the one open panel. Pinning may deliberately break the anchor
for sustained work. Free repositioning remains the separate future palette
idea.

The mock also fails to distinguish editable controls from read-only identity,
context, and cost facts. Editable values need recognizable control affordances;
read-only facts should be quieter and explicitly non-interactive. The panel is
an editor, not merely a readout.

## Open design questions for revision

- What exact information and editing authority belong in the medium-detail
  Scene overview?
- How does the global Scene silhouette expose snap points without becoming
  visual noise when zoomed out?
- Which panes collapse automatically, which collapse only by user action, and
  how is restoration kept obvious?
- Where does the Stage's Pattern/zone-routing mode switch live, and how does it
  represent layout changes at the playhead?
- How should authored curves, held values, and boundary ramps differ visually?
- Should the Show navigator remain in the scope bar or join the application
  toolbar after real motion and resizing are tested?

No Fable comparison or final property-surface decision has been made yet.

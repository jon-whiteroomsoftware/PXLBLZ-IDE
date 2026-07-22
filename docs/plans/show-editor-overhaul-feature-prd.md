# Show Editor overhaul feature PRD

Status: Proposed specification for UX review. This document defines the next
Show authoring model and UX direction. It does not yet authorize implementation.

The overhaul replaces the Scene-shaped Show editor with one direct timeline of
Clips, layers, Transitions, Zones, Groups, Markers, and Property animation. It
preserves the existing PXLBLZ visual language and the measured compiler,
preview, artifact, output-contract, Effect, routing, and delivery capabilities
unless a later implementation spike proves that a specific contract must
change.

This is a standalone feature PRD. The current PXLBLZ v2 release plan and
completed Scene-composition design remain unchanged as records of the shipped
system. Their Scene-centered UX is superseded for this overhaul rather than
incrementally extended.

## Problem Statement

The current Show editor produces excellent rendered Shows but makes them
unnecessarily difficult to build. A Scene is an obligatory structural object
between the Show and its Clips even when the ordinary case is one Pattern
occupying one interval. Authors must navigate among the global timeline, Scene
X-ray, Super Detail, and Scene-local editor, then remember which level owns each
property. The same choreography is represented at several levels, so ordinary
work requires too many clicks and the interface teaches a hierarchy that the
compiled Pixelblaze artifact does not need.

The editor also hides useful continuity behind that hierarchy. Pattern runtime
identity, Clip placement, Transition time, Zone routing, and reusable structure
are related but distinct concepts. The current model often makes authors infer
those distinctions from Scene boundaries or compatibility behavior instead of
showing them directly.

PXLBLZ does not need the scale accommodations of a professional video editor.
A complex Show is expected to contain tens of Clips, not hundreds or thousands,
and normally only one to three layers per Zone. The product can therefore keep
the complete authoring model on one screen, expose powerful behavior through a
small set of direct primitives, and avoid nested timelines or specialized
sub-editors.

The overhaul must make the basic case immediately obvious without preventing
serious hobbyists from discovering placement viewports, linked Pattern
instances, reusable Groups, multi-Zone choreography, precise timing, Effects,
Transitions, and Property animation. Advanced capability should appear as a
deeper explanation of the basic model, not as a second model that invalidates
what the author first learned.

## Solution

The Show editor becomes one proportional timeline whose editable entities are
Clips. A Clip places one Pattern runtime instance in one Zone, on one layer, for
one time interval. Layers permit simultaneous composition; Transitions occupy
their actual time between connected Clips; blank time is valid; and an explicit
Show End controls the loop boundary.

Scenes disappear completely from the authoring and persistence model. The
Scene header, Scene X-ray, Super Detail, Scene-local editor, Scene navigation,
and dedicated Transition lane disappear with them. The timeline ruler moves
directly above the editable tracks, and a compact Show Navigator replaces the
redundant zoom slider by combining pan, zoom, position, and whole-Show context.

The model separates runtime, placement, topology, and reusable choreography:

- a **Clip** owns when, where, and how a Pattern appears;
- a **Pattern instance** owns the running Pattern, including private state,
  clock, seed, exported Controls, and stateful simulation policy;
- a **Zone Layout definition** owns one reusable output topology;
- a **Zone Layout occurrence** uses that topology for one Show interval; and
- a **Group definition** owns reusable choreography instantiated by one or more
  Zone-local **Group occurrences**.

Ordinary added and duplicated Clips receive independent Pattern instances that
start at local time zero when they first contribute. Splitting is the one
automatic sharing operation: both fragments retain the original instance so
the split is a semantic and visual no-op. Further synchronization is explicit.

Progressive disclosure governs spatial, topology, and reuse complexity. Every
Clip first shows only X, Y, Width, Height, and Rotation. These values transform
the Pattern coordinate field over the complete Zone without clipping. An
optional **Clip Viewport** adds a second independently editable
X/Y/Width/Height rectangle and clips the Clip's contribution. A one-Zone Show
exposes no Zone apparatus until the author opens it. Multi-Zone Layout
occurrences may expand into complete Zone/layer stacks, collapse into summaries,
or focus one Zone while retaining a thin Zone picker.

Zone Layout occurrences form consecutive timeline slabs. A hard boundary may
replace four Zone stacks with one, then later restore three different stacks;
the ruler, playhead, Markers, Navigator, and Show End remain global. Layouts may
be created ad hoc, named for reuse, copied as independent topology, or duplicated
with their complete choreography. Moving Split and Soft Split remain two-Zone
Portable Layout operators whose Split Position may animate inside an occurrence.
Progressive handoff between arbitrary Layouts remains representable in the data
model but is not authored in the initial overhaul.

The existing compiler remains responsible for lowering this authoring model to
one ordinary Pixelblaze Pattern, disclosing generated cost, and selecting exact
optimizations. The PRD defines observable time, state, color, and routing
semantics. It does not require wasteful execution when the compiler can prove a
cheaper equivalent.

## Product principles

1. **No Scene object.** A Show contains Clips directly. No required container
   stands between the timeline and the ordinary one-Pattern interval.
2. **One editor.** The timeline, Stage, Zones, layers, Transitions, Property
   animation, Groups, and inspectors remain in one workspace. Group isolation
   changes editability, not timeline semantics.
3. **Simple first, powerful later.** The basic case hides Zones, viewports,
   linked instances, and Group definitions until the author invokes them.
4. **The simple model remains true.** Enabling an advanced feature causes no
   visual jump and reveals an additional degree of control rather than
   converting the content into another representation.
5. **Time occupies time.** Clips, Transitions, and blank intervals consume the
   exact timeline duration they represent.
6. **Blank time is valid.** Dead air adds no authored filler and may occur
   before, between, or after Clips.
7. **Structure never overwrites content.** Dragging, insertion, duplication,
   and resizing either find a valid result, stop at an obstruction, or expose a
   separate explicit structural command.
8. **Sharing is intentional.** Ordinary creation restarts. Split preserves
   identity. Every other shared Pattern instance or linked Group is explicit.
9. **One owner per property.** Every saved value belongs to the Clip placement,
   Pattern instance, Group occurrence, Zone Layout definition or occurrence,
   Zone, Layer, Transition, or Show - never two.
10. **Bright lines beat hidden flexibility.** The first release may reject a
    rare ambiguous operation instead of inferring a surprising result.
11. **All edits are semantic undo steps.** Continuous pointer preview commits
    one reversible operation. Undo and redo replace modal apply/cancel flows
    wherever a draft is not intrinsically required.
12. **The Stage shows the playhead.** The Stage previews the complete Show at
    the current playhead and never invents a second preview time.
13. **Multi-selection manipulates structure, not properties.** It supports
    move, delete, duplicate, and Group creation without becoming a bulk editor.
14. **Preserve the visual language.** Reuse the current palette, density,
    Stage, timeline styling, catalogue, Effect controls, and proven primitives.
    Replace organization and interaction structure, not the product's identity.
15. **Optional information yields to authoring.** Filmstrips and other derived
    aids consume leftover computation and attention; they never delay or
    destabilize direct manipulation.
16. **Compiler optimizations preserve semantics.** Caching, conditional
   rendering, instance-slot reuse, score tables, and render-target planning may
   change execution work but not observable Pattern time, state, routing, or
   output.
17. **A distant shared edit is never silent.** Editing a reused named Zone
    Layout or linked Group definition exposes its use count and affected
    offscreen occurrences before committing.
18. **Snap, connection, and reuse are different.** Optional snapping aligns
    otherwise independent entities. A non-Cut Transition creates an inseparable
    structural connection. Groups and named Layouts provide explicit reuse.

## Conceptual model

### Show

A Show owns one immutable Portable or Installation output contract, an explicit
duration, Zone Layout definitions and occurrences, Pattern instances, Clips,
Layers, Transitions, Groups, Markers, Property animation, Show output Effects,
and editor-independent choreography. Show time begins at zero and ends at the
explicit Show End. Loop wrap restores every logical Pattern instance and
history-bearing Show Effect to its authored initial state.

### Zone Layout definition

A Zone Layout definition is reusable output topology. It owns stable identity,
an optional name, its Zone definitions, and either exact Installation pixel
membership or one complete Portable routing operator and its static parameters.
An unnamed definition supports ad hoc authoring; naming makes the same topology
available to later occurrences. A shared edit requires explicit all-uses scope.
Make Layout Unique clones the definition and its Zones with new stable ids.

### Zone Layout occurrence

A Zone Layout occurrence selects one definition for one interval between hard
Layout boundaries. It owns that interval's Zone/layer stacks and its
occurrence-local Layout automation. Occurrences may have different Zone counts
and variable expanded heights. Reusing a named definition creates empty
choreography; Duplicate Layout Interval also copies the interval's complete
timeline content at the same relative offsets.

For a two-Zone Portable Split or Soft Split definition, the occurrence owns the
static Split Position and its Property animation. The definition supplies the
topology and default, normally `0.5`. Other routing parameters remain static in
the initial overhaul.

### Zone

A Zone is a named semantic subset owned by one Zone Layout definition. It owns
stable identity, name, optional icon, and optional identifying color. Every Clip
and Group occurrence belongs to exactly one Zone; Pattern instances and Group
definitions may be reused across Zones.

An Installation Layout assigns every physical pixel identity under a fixed map
and count. A Portable Layout's one set-level operator derives complete ownership
in normalized Stage space. Individual Zones never own independent overlapping
routing rules. Patterns remain unaware of Zones.

### Layer

A Zone track inside one Layout occurrence contains an ordered stack of Layers.
The top visible Layer renders in front. Clips on one Layer may leave gaps but
cannot overlap **in time**. Clips on different Layers may overlap in time and
space. Layer creation is explicit; dragging never silently creates one.

The first Layer starts with boundary snapping enabled. Additional Layers start
with snapping disabled. Authors may toggle snapping per Layer; snapping never
creates structural attachment. A Layer owns only order, snapping preference,
and its Clips. Layers are unnamed organizing lanes; they do not own Effects,
animation, or other presentation properties. Collapse is editor presentation
state.

### Pattern instance

A Pattern instance is one logical running Pattern: source identity, private
state, virtual clock, seed, exported Controls, time rate, start offset, and
stateful simulation values. Several Clips may expose one instance through
different placements, Clip Viewports, Effects, Layers, or Zones.

An instance has one continuous semantic history. If explicitly shared Clips
leave a visibility gap, the instance clock and state advance through that gap.
The compiler may avoid hidden pixel work only when it preserves the state that
must be observable later. Generic time rate is non-negative; arbitrary stateful
Patterns do not support reverse playback.

### Clip

A Clip is a placement of one Pattern instance in one Zone and layer over one
time interval. It owns timeline start and duration; Zone and layer; spatial
placement; optional Clip Viewport; Mirror, Hue phase, Brightness, Opacity,
ordered Effects; presentation policies; and animation of Clip-owned values.

The Clip rectangle on the timeline represents its ordinary established
interval. A connected Transition may cause its Pattern instance to contribute
before or after that rectangle.

### Clip Viewport

A Clip Viewport is an optional, axis-aligned clipping rectangle owned by one
Clip. When present, it is independently positioned and sized in the same
normalized Zone coordinate system as the Clip's Content rectangle. This term is
deliberately qualified: it is unrelated to the existing preview **Viewport** or
camera, which controls only how the Stage is drawn and never reaches Pattern
coordinates or hardware output.

### Transition

A Transition is a stable time-bearing entity between two Clips on the same
Zone and layer. A Cut is the zero-duration Transition and retains a compact,
clickable boundary affordance. A non-Cut Transition creates a mandatory
structural connection between both Clips. The transitive set joined by non-Cut
Transitions is a **transition-connected sequence**: it moves as one object and
cannot be pulled apart by disabling Layer snapping.

### Group definition

A Group definition is Zone-agnostic reusable choreography. It owns child Clips,
relative time and Layer offsets, complete internal Transitions, Effects,
Property animation, and internal Pattern-instance definitions and sharing
topology. It may span Layers but cannot contain another Group, a partial
non-Cut Transition connection, a Zone Layout boundary, a global Marker, or a
Show output Effect.

### Group occurrence

A Group occurrence places one Group definition at a Show time, in one Zone and
Layout occurrence, on one base Layer, with optional X/Y translation and
occurrence-local X/Y animation. Every occurrence materializes fresh Pattern
runtime instances by default while preserving the definition's internal sharing
graph. Occurrences in different Zones may reuse one definition; no occurrence
may span a Zone Layout boundary.

### Marker

A Marker is a Show-owned guide at one time. It aligns content but changes no
value. Markers span all Zones and layers, may carry a name and color, and never
belong to a Clip, Group, Zone, or layer.

### Keyframe

A Keyframe belongs to one animated property and never changes that property's
owner. Clip-owned keyframes use Clip-local time; Pattern-instance keyframes use
instance time; Group-occurrence keyframes use occurrence-local time; Split
Position keyframes use Zone-Layout-occurrence time; Show output automation uses
absolute Show time. A keyframe may snap to a Marker but is never itself a global
alignment guide.

## User Stories

1. As a first-time Show author, I want to add a Pattern directly to a timeline,
   so that I can produce a useful Show without learning Scenes.
2. As a first-time author, I want the default Clip to fill its Zone and start at
   local Pattern time zero, so that the initial result is predictable.
3. As an author using one Zone, I want Zone machinery hidden, so that the
   simplest Show contains no unexplained routing concepts.
4. As an author, I want every advanced mode to begin as a visual no-op, so that
   discovering capability never damages my current result.
5. As an author, I want blank time to be valid, so that pauses require no filler
   Pattern and add no generated content.
6. As an author, I want to drag and resize Clips directly, so that ordinary
   timing work needs no dialog.
7. As a precise author, I want seconds with decimal fractions, so that I can
   enter `4`, `4.2`, or `4.023` without converting to milliseconds.
8. As a precise author, I want millisecond resolution, so that I can align
   choreography to video frames or external events.
9. As an author, I want very short Clips, so that flashes and accents are valid
   without arbitrary one-second restrictions.
10. As an author, I want short Clips to remain selectable at ordinary zoom, so
    that truthful duration does not make interaction impossible.
11. As an author, I want the playhead and Stage preview to agree, so that the
    output I see is always the output at the time I am editing.
12. As an author, I want a Cut boundary to remain clickable, so that I can turn
    it into a visual Transition later.
13. As an author, I want a Transition to consume visible timeline time, so that
    its duration is literal rather than hidden overlap metadata.
14. As an author, I want both connected Patterns to run during a Transition, so
    that their state after the Transition is temporally correct.
15. As an author, I want Transition duration independent of Clip duration, so
    that a long transition into a very short accent remains valid.
16. As an author, I want Transition growth to push the Transition-connected
    material to its right, so that it never steals time from neighboring Clips.
17. As an author, I want growth to stop at unrelated content, so that editing
    never overwrites a carefully arranged timeline.
18. As an author, I want Insert Time as an explicit operation, so that I can
    create room across the complete Show intentionally.
19. As an author, I want adding at the playhead to explain the valid insertion
    choices, so that the editor remains useful in empty space and inside Clips.
20. As an author, I want unavailable insertion choices shown with reasons, so
    that I learn the model instead of wondering where commands went.
21. As an author, I want splitting a Clip to preserve its exact output, clock,
    and state, so that Split is a safe structural operation.
22. As an author, I want to apply different placement Effects to split
    fragments, so that a split can change presentation without restarting the
    Pattern.
23. As an author, I want a time-rate change after a split to continue smoothly,
    so that slowing a running Pattern does not jump.
24. As an author, I want ordinary duplicates to restart independently, so that
    repeated appearances begin at zero unless I request synchronization.
25. As an advanced author, I want to link Clips to one Pattern instance, so that
    several placements can share clock, state, seed, and Controls.
26. As an advanced author, I want Make Independent, so that one linked
    appearance can deliberately diverge.
27. As an author, I want linked instances to continue through visibility gaps,
    so that “same running Pattern” has one literal meaning.
28. As an author, I want Clip placement separate from Pattern state, so that one
    running Pattern can appear differently in several places.
29. As a novice, I want to see only X, Y, Width, Height, and Rotation, so that
    ordinary spatial placement feels natural.
30. As an author, I want normalized placement values displayed as percentages,
    so that placement remains portable and understandable.
31. As an advanced author, I want values outside `0..1`, so that overscan and
    offscreen motion are possible.
32. As an author, I want rotation around the Clip center, so that rotation is
    predictable without a pivot editor.
33. As an author, I want to enable a viewport only when I need one, so that
    clipping complexity stays hidden by default.
34. As an author, I want enabling a viewport to preserve the current image, so
    that advanced editing begins safely.
35. As an author, I want Content and Clip Viewport to use the same normalized Zone
    coordinate system, so that I can align them exactly.
36. As an author, I want to animate Content inside a stationary Viewport, so
    that pans, zooms, reveals, and moving windows are first-class choreography.
37. As an author, I want disabling and re-enabling a Viewport to preserve its
    values, so that experimentation is reversible.
38. As an author, I want Fit, Fill, Match, and Center to be convenience actions,
    so that they calculate explicit values instead of creating persistent modes.
39. As an author, I want Pattern output outside a Clip Viewport to reveal lower
    layers, so that viewports participate naturally in composition.
40. As an author, I want Luma Key and Chroma Key to reveal lower layers, so that
    content-key composition remains available in the new editor.
41. As an author, I want Opacity separate from Brightness, so that fading a
    layer and dimming its emitted color remain different operations.
42. As an author, I want an empty final composite to be black, so that dead air
    has a deterministic hardware result.
43. As an author, I want to create layers explicitly, so that the editor never
    invents compositing structure in response to pointer drift.
44. As an author, I want to drag a Clip between existing layers and Zones, so
    that placement can change without recreation.
45. As an author, I want destination collisions to block rather than overwrite,
    so that vertical movement is safe.
46. As an author, I want all Zones under one ruler when expanded, so that
    cross-Zone timing remains explicit.
47. As an author, I want to collapse Zones independently, so that I can edit one
    or two Zone stacks without losing the timing context of the others.
48. As an author, I want each collapsed Zone to retain a time-accurate miniature
    of its Layers and events, so that collapsed complexity never becomes
    invisible.
49. As an author, I want to choose an optional Zone icon, so that a meaningful
    mnemonic survives when the Zone name no longer fits.
50. As an Installation author, I want adding a Zone to transfer pixel ownership
    from existing Zones, so that ordinary subdivision stays valid throughout.
51. As an Installation author, I want exact coverage diagnostics, so that gaps,
    overlap, and out-of-range pixels cannot produce an invalid artifact.
52. As a Portable author, I want normalized spatial routing, so that the Show
    adapts to compatible 2D maps and pixel counts.
53. As a Portable author, I want routing shapes visualized before I need to
    understand their formulas, so that Checker, Rings, Wave, Pinwheel, and Split
    behavior can be learned spatially.
54. As an author, I want to share Pattern instances across Zones explicitly, so
    that separate Zone placements can remain synchronized without being grouped.
55. As an author, I want marquee selection, so that several timeline entities
    can be gathered quickly.
56. As an author, I want live selection feedback while drawing the marquee, so
    that the selected set is predictable.
57. As an author, I want to refine a marquee selection, so that an approximate
    gesture can become an exact Group membership set.
58. As an author, I want transition-connected content auto-selected as a unit,
    so that the editor leads me toward structurally valid Groups.
59. As an author, I want a manually broken selection honored and explained, so
    that the editor does not silently reselect something I removed.
60. As an author, I want multi-selection limited to structural actions, so that
    I never confront confusing mixed-value property controls.
61. As an author, I want to Group Clips across layers within one Zone, so that a
    treatment can move and repeat without losing relative timing.
62. As an author, I want duplicated Groups linked by default, so that editing
    their shared choreography updates every occurrence.
63. As an author, I want duplicated Groups to receive fresh Pattern instances,
    so that structural reuse does not silently synchronize runtime state.
64. As an author, I want Make Unique to preserve the Group while breaking its
    definition link, so that one occurrence can evolve independently.
65. As an author, I want Ungroup to leave ordinary Clips behind, so that the
    container can be removed without deleting its content.
66. As an author, I want Group isolation in the same timeline, so that editing a
    reusable treatment does not open a differently behaving sub-editor.
67. As an author, I want unrelated content dimmed and ineditable during Group
    isolation, so that the active scope is obvious without becoming modal.
68. As an author, I want a Group occurrence to vary in time, base layer, and X/Y
    translation, so that linked structure can be reused in practical places.
69. As an author, I want global Markers, so that unrelated Clips, Zones, and
    keyframes can align to a common event.
70. As an author, I want to drag a Marker from the ruler, so that creating guides
    feels like Photoshop, Word, and other ruler-based tools.
71. As an author, I want to hide Marker visuals independently from Marker
    snapping, so that guides can remain useful without visual noise.
72. As an author, I want Insert Time to move later Markers, so that global
    alignment survives structural time insertion.
73. As an author, I want out-of-range Markers and keyframes preserved, so that
    shortening content or Show End does not silently destroy authored work.
74. As an author, I want an explicit draggable Show End, so that loop duration
    may include intentional trailing blank time.
75. As an author, I want Show End snapping, so that removing trailing dead air
    is one easy drag to the final content boundary.
76. As an author, I want content to extend Show End automatically, so that the
    boundary never blocks ordinary creation.
77. As an author, I want deletion never to shorten the Show automatically, so
    that removing content does not change loop timing unexpectedly.
78. As an author, I want a compact Show Navigator, so that one control handles
    overview, pan, zoom, and visible-range resizing.
79. As an author, I want the ruler immediately above the tracks, so that time,
    playhead, Markers, and content share one direct spatial relationship.
80. As an author, I want compact modeless Entity Details, so that inspecting or
    editing a Clip does not obscure the timeline.
81. As an author, I want to pin one Entity Detail while opening a transient
    Detail for another entity, so that comparison remains explicit and ordinary
    clicks do not accumulate panels.
82. As a keyboard user, I want fast transport, traversal, inspector, and undo
    commands, so that repeated authoring does not require pointer travel.
83. As an author, I want optional Clip filmstrips, so that Pattern phase,
    restart, continuity, and Transition pre-roll are visible on the timeline.
84. As an author, I want filmstrips to appear progressively during idle time, so
    that they never compete with dragging, scrolling, playback, or thought.
85. As an author, I want compiler cost disclosure to remain exact, so that
    expressive layering never hides hardware limits.
86. As an author, I want the same preview, export, EPE, Run, Save, and Controller
    paths, so that the overhaul improves authoring without weakening delivery.
87. As an existing user, I want the current PXLBLZ visual language preserved,
    so that the overhaul feels like a better version of the same product.
88. As an author, I want hard Zone Layout changes on the timeline, so that one
    interval can use four Zones, the next one Zone, and a later interval three.
89. As an author, I want to build a Zone Layout ad hoc and name it only when it
    proves reusable, so that topology does not require advance administration.
90. As an author, I want every shared Zone Layout edit to disclose its scope, so
    that an offscreen occurrence never changes silently.
91. As an author, I want Use Layout, Copy Previous Layout, and Duplicate Layout
    Interval to remain distinct, so that topology reuse never implies accidental
    choreography reuse.
92. As an author, I want to duplicate one Zone Track, so that I can echo the
    same choreography on another Zone at the same Show times.
93. As a Portable author, I want Split Position to animate within an exactly
    two-Zone Split Layout, so that a dynamic boundary remains ordinary property
    animation rather than a separate routing mode.
94. As an author, I want one Group definition reusable in different Zones and
    Layout intervals, so that rhythmic and spatial echoes do not require copy
    editing.
95. As an author, I want dragging any Clip in a Transition-connected sequence
    to move the complete sequence, so that a Transition can never become
    detached from either source.
96. As an author, I want Freeze to capture one frame for a Clip while its Pattern
    instance may continue elsewhere, so that presentation and runtime state stay
    distinct.
97. As an author, I want Strobe to capture and hold repeatedly at a chosen
    cadence, so that periodic sampling is different from a one-time Freeze.
98. As an author, I want Blink to gate Clip visibility without stopping Pattern
    time, so that visibility rhythm does not alter later Pattern state.
99. As an author, I want Stutter to advance a Pattern instance in clock steps,
    so that every Clip linked to that instance shares the same stepped time.
100. As an author, I want every Show loop to reset logical Pattern instances and
     presentation history deterministically, so that every pass renders the same
     choreography.
101. As an author, I want per-layer Transitions, so that one layer can transition
     while other overlapping layers continue their own composition.
102. As an author, I want linked Pattern instances and linked Group or Layout
     definitions to look and behave differently, so that time synchronization,
     structural reuse, and snapping are never conflated.
103. As an author, I want to append, insert, copy, or duplicate a Zone Layout
     interval, so that changing topology is as direct and predictable as
     inserting time.

## Implementation Decisions

### 1. Scene removal and workspace structure

- The saved authoring model will contain no Scene entity.
- Scene headers, X-rays, Super Detail, Scene-local authoring, Scene navigation,
  and dedicated Scene Transition rows will be removed.
- The center workspace will contain one toolbar with the compact Show Navigator
  embedded inside it, one sticky ruler, and the editable Zone/Layer stacks. No
  Active Layout strip or separate Navigator row consumes permanent height.
- The toolbar has three semantic clusters: transport and time, viewport
  navigation, and authoring commands. Responsive treatment may align these as
  left/center/right groups or place the first two together, but must preserve one
  row at normal desktop widths and must not present one undifferentiated run of
  buttons.
- The existing Stage remains mounted and shows the complete output at the
  current playhead in focused- and all-Zones modes.
- Group isolation is the only scoped edit mode. It uses the same timeline,
  ruler, playhead, drag grammar, and inspector components.
- The overhaul will reuse existing visual primitives where their behavior and
  accessibility remain correct. Scene-shaped containers will not dictate the
  replacement model merely to preserve code.

### 2. Timeline ruler, playhead, and Show Navigator

- The ruler is sticky and sits immediately above the editable tracks.
- Clicking or dragging the ruler seeks the playhead.
- Dragging outward from the ruler creates a Marker. The gesture must have an
  obvious cursor or handle affordance before the drag begins.
- The compact Show Navigator replaces the zoom slider. Its background depicts
  the complete Show; its window depicts the visible timeline range.
- Dragging the Navigator window pans. Dragging either edge changes the visible
  range. Clicking outside recenters. Fit shows the complete timeline.
- Fit changes only the viewport: it sets the visible range from Show time zero
  through Show End at the largest scale that fits. It never seeks or otherwise
  changes the playhead. The Fit affordance is a quiet icon adjacent to the
  Navigator and is disabled when the complete Show is already visible.
- The Navigator may show Show End, playhead, Markers, and a quiet aggregate of
  Clip/Transition occupancy without reproducing the complete timeline.
- Main-timeline wheel, trackpad, and keyboard zoom remain available.
- Navigator interaction must never create page-level horizontal overflow or
  mutate Show content.

### 3. Show duration and time representation

- Show time begins at `0` and has an explicit persisted duration.
- Show End is a prominent ruler handle and the deterministic loop boundary.
- Content moved or created beyond Show End extends the Show automatically.
- Deleting or moving content earlier never shortens the Show automatically.
- Dragging Show End lengthens or shortens blank tail time and always snaps
  to nearby Clip, Transition, and Group ending boundaries.
- Ordinary Show End dragging cannot silently truncate content. A destructive
  Trim Show command will own removal beyond a requested endpoint.
- The inspector accepts seconds and decimal fractions. Persistence and editing
  support millisecond resolution; the minimum nonzero Clip or Transition
  duration is `0.001s`.
- Very short timeline entities receive a minimum interactive display width at
  ordinary zoom. Their stored and numerically displayed durations remain exact.
- Every logical Pattern instance resets to its authored initial state at Show
  End. Shared instances reset once. Freeze and Strobe caches, Trails, and other
  history buffers also reset. This deterministic loop contract requires a
  bounded compiler/runtime spike because it differs from current behavior.

### 4. Clip creation and insertion

- Adding a Pattern creates a Clip and a fresh Pattern instance.
- A provisional ordinary Clip duration is five seconds. If Add at Playhead is
  invoked in a shorter empty gap, the Clip fills the available interval; in a
  larger gap it is capped at five seconds. The exact default remains a usability
  parameter to validate, not a domain invariant.
- At an empty playhead, Add here starts at the playhead and never overwrites the
  next Clip.
- Inside a Clip, Add at Playhead offers Split and insert, Add on layer above,
  and Add at next opening where legal.
- Unavailable choices remain visible, focusable, and accompanied by a concise
  reason.
- Insert Time is a separate global operation with exact location and duration.
  It affects every Zone and layer, splits every intersected Clip, and shifts all
  later Clips, Transitions, Groups, Markers, Layout boundaries, Show automation,
  and associated keyframes. Automation spanning the insertion receives a held
  value across the inserted interval; later keys shift by the inserted duration.
- Insert Time is unavailable inside a Transition because a Transition is an
  indivisible time object.
- An instance used only by shifted downstream content moves its clock origin
  with that content. An instance spanning the insertion point continues through
  the new gap.
- Insert Time cannot silently rewrite a shared Group definition. An occurrence
  intersected inside its bounds must first be made unique; the unique definition
  may then absorb the insertion if all resulting occurrences remain legal, or
  the author may Ungroup. This bright line preserves distant linked content.

### 5. Movement, collision, layers, and Zones

- Horizontal Clip dragging changes Show start time and preserves duration.
- Dragging never overwrites another Clip on the same layer.
- The drag clamps at an obstruction or may move deliberately to another existing
  layer to pass it.
- Vertical pointer drift remains lane-locked until deliberate hysteresis is
  crossed.
- A Clip may move to another Zone if the target layer and interval are legal.
  Its normalized placement, viewport, Effects, and Pattern-instance identity
  survive.
- A plus control explicitly creates layers. Dragging never creates one.
- Empty layers may disappear after save/reload. Layer identity exists to order
  content, not to preserve empty scaffolding.
- Global Insert Time, Show End, ruler, playhead, Navigator, and Markers are shared
  across all Zones.
- Boundary snapping is a per-Layer authoring aid. The first Layer begins with it
  enabled and later Layers begin with it disabled. Authors may toggle it at any
  time. Transition connections remain invariant even when snapping is disabled.

### 6. Clip resizing, splitting, and hidden keyframes

- Dragging a Clip edge changes duration and never resets or retimes its Pattern
  instance.
- Moving a Clip's left edge moves its Clip-owned keyframes with it.
- Keyframes after a shortened Clip remain persisted and inactive. Re-extending
  the Clip reveals and reactivates them.
- Split is valid wherever both resulting Clips meet the minimum duration and the
  playhead is not inside a Transition.
- Split creates two Clip placements that reference the same Pattern instance,
  preserves the exact frame on both sides, and inserts a Cut affordance.
- The right fragment continues the same Pattern clock. Split never resets it.
- Placement-owned Effects and animations may diverge after the split.
- An instance time-rate change after the split changes the shared instance from
  that boundary onward. Simultaneous linked appearances observe the same rate.
- Divergence limited to one appearance requires Make Independent.

### 7. Pattern-instance lifecycle and property ownership

The ownership matrix is normative:

| Clip placement owns | Pattern instance owns |
| --- | --- |
| Timeline start and duration | Pattern reference and executable source |
| Zone and layer | Private runtime state |
| X, Y, Width, Height, Rotation | Clock origin, rate, and time policy |
| Optional Viewport | Random seed |
| Mirror, Hue phase, Brightness, Opacity | Exported Pattern Control values |
| Effects and compositing | Stateful simulation and evaluation properties |
| Animation of Clip-owned properties | Animation of instance-owned Controls and time |

Ownership does not change when a property is animated:

| Owner | Properties | Initial animation policy and time base |
| --- | --- | --- |
| Show | Duration, output contract, Layout occurrences, global Markers, output Effects, deterministic seed/reset | Output Effect parameters and global Repeat Scale may animate in absolute Show time |
| Zone Layout definition | Zone ids, order, names, icons, color, Installation ownership or Portable routing configuration | Structural; not keyframeable |
| Zone Layout occurrence | Show interval, chosen definition, occurrence-owned routing values | Split Position may animate in occurrence-local time |
| Zone | Identity and presentation metadata within a Layout definition | Not keyframeable |
| Layer | Order, boundary-snapping setting, content | Not keyframeable |
| Group definition | Child Clips, relative time/Layer offsets, Effects, animation, complete Transitions, internal Pattern-instance topology | Child properties retain their normal local time bases |
| Group occurrence | Show start, Layout occurrence, Zone, base Layer, X/Y offset | X/Y may animate in occurrence-local time |
| Clip | Start, duration, Zone, Layer, Content, Viewport, presentation, Effects | X/Y/Width/Height/Rotation, Viewport rectangle, Brightness, Opacity, Hue phase, and numeric Effect parameters animate in Clip-local time |
| Pattern instance | Pattern reference, state, clock origin/rate/start offset, seed, Controls, Stutter | Numeric Controls and time policies animate in instance-local time |
| Transition | Kind, duration, easing, family parameters | Intrinsic progress only; no independent keyframe tracks initially |

Timeline start and duration, Zone and Layer placement, Viewport enablement,
Mirror, Pattern reference, Effect add/remove/type/order, seeds, Layout topology,
and Zone membership are discrete structural values and are not keyframeable in
the initial overhaul. The old model in which an incoming Transition also owns
unrelated property interpolation does not carry forward.

Property animation is presented as Clip-owned, time-aligned detail rails nested
beneath the owning Layer only when authored or explicitly disclosed. Empty
Layers reserve no Effect or property rows. One or two animated properties may
use comfortable sparkline height; additional lanes compress progressively while
preserving keyframe dots as the semantic anchors. Selecting or hovering a dense
lane may expand it temporarily, and an overflow disclosure may replace a stack
that would otherwise dominate the timeline. A collapsed Zone folds these rails
into its miniature Layer summaries instead of hiding their event times.

- Ordinary Add and Duplicate create independent instances starting at zero when
  they first contribute.
- Duplicate Linked or Use Same Instance explicitly reuses a Pattern instance.
- Duplicate Linked is available beside ordinary Duplicate. Use Same Instance
  opens an explicit compatible-instance chooser with names and use counts;
  Rejoin Shared Pattern never guesses the intended instance.
- Split preserves instance identity automatically because it must be a semantic
  no-op.
- Make Independent gives one Clip a fresh instance while retaining all Clip
  placement properties.
- Rejoin Shared Pattern is available when a compatible intended instance exists.
- Editing the Pattern reference or an instance-owned value affects every Clip
  using that instance. The UI must disclose the linked scope before committing
  a change that may surprise the author.
- A shared instance advances continuously through visibility gaps.
- Moving every Clip that exposes one instance by the same delta moves its clock
  origin. Moving only one linked Clip changes which part of the continuing
  instance that Clip exposes.
- The compiler may use physical runtime slots, replay, caching, or conditional
  work without merging logical identities.
- Generic Pattern time is non-negative and advances at a non-negative rate.
  Reverse playback is not supported in this overhaul.
- Pattern-instance clock animation is instance-local. Stutter is the named
  stepped-clock presentation and affects every Clip linked to that instance.
- Show looping resets all logical Pattern instances, including those shared by
  several Clips, to their authored initial state before the next pass.

### 8. Spatial placement and optional Clip Viewport

- A default Clip exposes only X, Y, Width, Height, and Rotation.
- Defaults are X `0`, Y `0`, Width `1`, Height `1`, Rotation `0`.
- The UI may display normalized values as percentages; persistence uses
  normalized Zone coordinates. Values outside `0..1` are legal.
- Without a viewport, the Pattern is evaluated across the complete Zone. The
  five values transform its coordinate field but introduce no clipping.
- Rotation is always around the center of the Clip's X/Y/Width/Height rectangle.
  The initial design has no custom pivot.
- Enable Viewport reveals a Clip Viewport: a second X/Y/Width/Height rectangle
  in the same Zone coordinate system. Its initial value is `0, 0, 1, 1`, making
  first enable a visual no-op.
- With a Clip Viewport enabled, output outside it is transparent and reveals
  lower layers. Content and Clip Viewport may move and resize independently.
- Content rotates around its own center while the Clip Viewport stays axis-aligned.
- Disabling a Clip Viewport preserves its rectangle for later re-enable.
- Clip Viewport X/Y/Width/Height may be animated. Viewport enablement is discrete
  and is not keyframeable initially.
- Before viewport enablement, the inspector labels fields simply X, Y, Width,
  Height, and Rotation. After enablement it qualifies two compact sections as
  Content and Viewport.
- Contain and Fill are not persisted modes. Fit Pattern to Viewport, Fill
  Viewport, Match Viewport, Center Pattern, and Reset may calculate explicit
  Content values as convenience commands.
- The compiler may skip Pattern pixel evaluation outside a Viewport only when it
  proves that doing so preserves renderer state. Stateful or unknown renderers
  retain calls when required for correctness.

### 9. Compositing and Effects

- Layer order is bottom to top; the top layer is visually in front.
- Clips in one layer cannot overlap in time. Clips in different layers may
  overlap in time and space.
- Ordinary composition uses source-over behavior with Clip Opacity.
- Brightness changes captured color and remains distinct from Opacity.
- A Clip without a Viewport contributes across its complete Zone. A Clip with a
  Viewport contributes alpha only inside the Viewport.
- A Zone with no contributing content renders black.
- Existing ordered Effects, Show output Effects, Luma Key, Chroma Key, Vignette,
  transforms, distortions, Wrap, evaluation policies, and cost disclosure remain
  available.
- Luma Key and Chroma Key derive alpha from the same Clip whose color they
  process. They are not a third-source matte relationship.
- General Luma Matte or Track Matte composition, where one Pattern selects
  between two other Pattern outputs without contributing color, is deferred.
- General blend modes are deferred. Likely later candidates include Add,
  Multiply, Screen, Difference, Lighten/Maximum, and Darken/Minimum.
- When several sources overlap, the compiler reports renderer pressure. Keying
  arithmetic is relatively cheap; additional Pattern evaluations dominate cost.

#### Presentation modes and capture order

- Freeze is a Clip presentation mode. It captures RGB once when the Clip enters
  and replays that frame while the underlying Pattern instance may continue.
- Strobe is a Clip presentation mode. It repeatedly captures RGB at an authored
  cadence and holds each capture until the next one.
- Blink is a Clip output gate. It periodically shows and hides the composed Clip
  while Pattern-instance time continues normally.
- Stutter is a Pattern-instance stepped-clock policy. Every linked Clip observes
  the same stepped time. It is not a Clip-only visual Effect.
- Freeze and Strobe are explicit presentation modes rather than ordinary
  reorderable Effects. Their caches consume runtime RGB storage and participate
  in the resource ledger. Resource conflicts block or disclose the feature; they
  never silently fall back to Live.
- One Pattern instance may feed a frozen or strobed Clip and a live Clip at the
  same Show time. The cached Clip replays RGB; the single instance clock and
  state continue for the live placement.
- The ordinary Freeze-then-resume workflow is Split, apply Freeze to the left
  fragment, and leave the right fragment Live. Because Split preserves the
  Pattern instance, the right fragment resumes its continuing live state without
  allocating another instance.
- A new independent Pattern instance at an authored time offset cannot promise
  to reconstruct arbitrary stateful frozen state.
- The normative render and capture order is:

  1. advance the logical Pattern instance;
  2. apply Content coordinate transforms and coordinate Effects;
  3. render Pattern color;
  4. apply Clip color Effects;
  5. capture or replay Freeze/Strobe RGB;
  6. apply Clip Viewport alpha, Luma/Chroma Key, Opacity, and Blink;
  7. compose the Layer stack; and
  8. apply Show output Effects.

  Spatial and color changes before capture are baked into held RGB. Viewport,
  keying, Opacity, and Blink remain live over that cache. Strobe observes an
  upstream change at its next capture; Freeze retains its entry capture. The UI
  must make held upstream animation legible rather than implying it is broken.

### 10. Transition time and editing algebra

- Every adjacent same-layer Clip boundary retains a selectable Cut affordance.
- Replacing a Cut with a non-Cut Transition inserts the Transition's duration
  between the two Clip rectangles and creates one Transition-connected sequence.
- A non-Cut Transition is inseparable from its two Clips. Adding another
  Transition extends the sequence. Dragging any connected Clip moves the entire
  sequence, regardless of that Layer's boundary-snapping setting.
- The outgoing instance continues through the complete Transition.
- An independent incoming instance starts at local time zero at Transition start.
  When its ordinary Clip interval begins, it has advanced by Transition duration.
- A previously running shared incoming instance does not restart; the Transition
  exposes its current state.
- The outgoing Clip stops contributing when the Transition ends unless the same
  instance is visible elsewhere.
- Transition duration does not borrow from either Clip and may exceed either
  Clip's ordinary duration.
- Changing the boundary at the right edge of Clip A changes A duration and moves
  the Transition plus connected material to its right.
- Changing the Transition's right boundary changes Transition duration and moves
  Clip B plus connected material to its right.
- Changing Clip B's right boundary changes B duration.
- These simple resizes change total sequence duration. A rolling edit that moves
  an internal boundary while preserving total sequence duration is deferred.
- Delete Transition and reducing its duration to zero both mean Reset to Cut;
  the clickable Cut affordance remains.
- Deleting a connected Clip warns that adjacent Transition entities will also
  disappear or reset to Cut. The deletion never leaves a detached Transition.
- Growth stops at unrelated same-layer content unless the author separately
  inserts time.
- Clicking Cut always opens the Transition chooser. Its initial duration is the
  smaller of the normal default and the free time after the connected right-hand
  sequence. When no time is available, non-Cut choices remain visible but
  disabled with a reason and an Insert Time action.
- The current compact live Transition preview artwork should be reused in the
  Transition object and catalogue where practical.
- Transitions are per Layer, not Stage-wide. Other Layers continue composing
  normally while one Layer transitions.
- The semantic baseline is live outgoing plus live incoming rendering through
  the Transition. A snapshot/live implementation is allowed only where compiler
  analysis proves identical observable behavior.
- The supported Layer Transition catalogue excludes Fade and coordinate-moving
  Motion families. Its selectors and linear blends operate at the same output
  coordinate, so a Clip that spans the complete Transition interval is
  identical on both sides and can be lifted through the existing whole-stack
  Transition path without changing the result. This avoids an unnecessary RGB
  render target while unrelated Layers continue composing normally.
- An unrelated Clip may not start or stop at either endpoint or inside a Layer
  Transition. Such a boundary would make the two endpoint stacks semantically
  different for a reason the Layer Transition does not own. Coordinate-moving
  Motion and simultaneous Layer Transitions remain deferred until their
  segmentation, compositing, resource formulas, and cost disclosure are
  explicitly designed.

### 11. Selection and refinement

- Dragging empty timeline space creates a marquee.
- Any visible intersection between the marquee and an entity selects it. There
  is no majority threshold or full-containment requirement.
- Marquee selection updates live while dragging.
- Selection supports replace, additive, and subtractive refinement. Exact
  modifier keys are assigned in the keyboard design pass.
- Non-Cut Transitions create mandatory structural connections. Initial marquee
  or additive selection computes the full connected closure across Transitions,
  Clips, and further Transitions.
- Auto-added entities use the ordinary selection highlight and may briefly pulse
  to explain the expansion.
- Subtractive refinement honors the removed entity. It does not immediately
  re-add the dependency. Make Group becomes disabled and the broken connection
  explains what must be selected.
- Cuts do not cause selection expansion.
- Multi-selection exposes only structural Move, Delete, Duplicate, and Make
  Group actions. It has no mixed-value property inspector or bulk property edit.
- One selected Clip exposes the complete Clip inspector. One selected Group
  exposes Group actions. A valid ungrouped selection enables Make Group.

### 12. Groups and linked structural reuse

- A Group definition is Zone-agnostic reusable choreography. A Group occurrence
  belongs to one Zone and one Zone Layout occurrence and may span several Layers.
- The same Group definition may be placed in different Zones and Zone Layout
  occurrences. A Group occurrence never crosses a Zone Layout boundary.
- Groups cannot nest.
- A Transition may belong to a Group only when both connected Clips belong to
  it. A Group boundary cannot cut through a non-Cut Transition chain.
- Effects and Property animation travel with their owning Clips. Global Markers
  never enter a Group.
- Ordinary duplicate of a Group creates an occurrence linked to the same Group
  definition. Definition edits update every linked occurrence after scope is
  disclosed.
- Each duplicated occurrence creates fresh Pattern runtime instances by default
  while preserving the definition's internal sharing graph. Two split children that
  share one instance remain shared with each other in the duplicate but do not
  share the original Group's runtime instance.
- Make Unique copies the Group definition for one occurrence while retaining the
  Group container.
- Ungroup removes the container and leaves ordinary timeline entities.
- Double-click enters Group isolation. Non-Group content dims to approximately
  25% opacity and becomes ineditable. Escape or double-clicking outside exits.
- Group isolation is modeless. Edits commit normally and Undo/Redo supplies
  reversal rather than an Apply/Cancel transaction.
- A Group definition stores child relative time and layer offsets, complete
  Transition chains, Clip Effects and animation, and its internal Pattern-instance
  definitions and sharing graph. It does not contain global Markers, Show Effects,
  nested Groups, partial Transition chains, or Zone Layout boundaries.
- A Group occurrence stores Show start, its destination Zone Layout occurrence
  and Zone, the destination base Layer, and normalized X/Y
  translation applied to child Content and Viewport coordinates.
- Group-occurrence Width, Height, Rotation, and Viewport are deferred because a
  multi-Clip, multi-layer Group has no unambiguous single spatial frame.
- Explicit Group placement may create missing destination Layers after previewing
  the footprint; pointer drift never creates Layers.
- A definition edit is accepted only if the revised footprint is legal in every
  occurrence. Otherwise the editor identifies each collision and offers Make
  Unique for the active occurrence.
- Ungroup affects one occurrence and leaves other occurrences linked to their
  definition. Delete removes only the selected occurrence.
- A collapsed Group occurrence uses one selectable segment on each occupied
  Layer, joined by a shared visual connector. It never places one click-catching
  rectangle over unrelated content on intermediate Layers.

### 13. Zone Layout intervals and progressive disclosure

- Every new Show begins with one Zone Layout occurrence containing one default
  Zone that owns the complete output.
- A hard Zone Layout boundary divides the Show into adjacent timeline intervals.
  Each interval may use a different Layout definition, Zone count, Zone order,
  and expanded timeline height. The ruler and playhead remain continuous.
- Nothing straddles a Zone Layout boundary. Clips, Transitions, and Group
  occurrences stop there. Continued Pattern state is expressed by a new Clip
  placement that explicitly shares the prior Pattern instance.
- With one Zone and the Zone workspace collapsed, the Zone Map and picker
  disappear completely. The Zones control remains available as the discovery
  path and expands the Zone workspace; it does not enable or disable routing.
- Expanding a one-Zone Show reveals the existing Full Stage Zone and Add Zone.
- The Zones control is compact and opens the current Layout's Zone Map as an
  overlay instead of inserting a permanent row. The current Layout name remains
  available in the timeline and the control's accessible label; it need not
  occupy toolbar width.
- A multi-Zone Layout normally shows every Zone stack under the shared ruler.
  Each Zone has an independent manual collapse state. `Focus Zone` is a
  convenience command that expands one Zone and collapses its siblings, not a
  separate editor mode.
- A one-Zone Layout has no collapse affordance and does not repeat a redundant
  Zone header when the Layout header already supplies identity.
- A collapsed Zone remains a time-accurate miniature timeline. It preserves one
  thin lane per Layer, Clip spans and identifying colors, Transition and Effect
  events, property-animation curves or keyframe dots, Markers, and snapping
  targets. Text appears only where space permits; hover, focus, and accessible
  labels expose suppressed identity and timing.
- Different intervals may therefore have different explicit heights, and
  ordinary vertical scrolling remains valid.
- Expanding or collapsing preserves playhead, zoom, Navigator range, selection,
  and timeline scroll position.
- The Stage always shows the complete all-Zone composite and may optionally
  highlight the focused Zone.
- Every Zone has a required name and optional user-selected icon. A curated icon
  registry supplies stable choices; no upload or automatic guessing is needed.
- Wide labels show icon plus full name and narrow labels may reduce to the icon.
  Hover, focus, and accessible labels always expose the full name.
- The Zone icon is presentation metadata and may appear in the picker, timeline
  header, expanded Zone list, Stage legend, and drag destination feedback.
- New topology may begin ad hoc and unnamed. The author may later name its Layout
  definition for reuse.
- Use Named Layout creates a new occurrence with the same topology and empty
  choreography. Copy Previous Layout creates an independent Layout definition
  initialized from the previous topology, also with empty choreography.
- Duplicate Zone Track copies one Zone's Layer stack and choreography to another
  Zone at the same Show times.
- Duplicate Layout Interval reuses the same Layout definition by default and
  copies interval duration plus complete choreography at relative offsets. It
  copies Layers, Clips, Transitions, keyframes, Effects, Group occurrences, and
  the internal Pattern-instance sharing topology. It creates fresh runtime
  Pattern instances by default and does not copy global Markers.
- Make Layout Unique clones the Layout definition and its Zone ids while
  preserving names, icons, colors, and routing configuration.
- Editing a named Layout occurrence offers Make Unique or Edit all N uses.
  Editing the named Layout catalogue explicitly edits the shared definition and
  keeps scope, use count, and affected occurrences visible. A distant offscreen
  occurrence never changes silently.
- Append Layout Interval is the primary end-of-Show creation path. Insert Layout
  Before or After is available at every existing Layout boundary.
- Insert Layout Interval at Playhead uses global Insert Time semantics. It adds
  the requested duration, splits every intersected Clip while preserving
  Pattern-instance identity, shifts all later content, places the chosen Layout
  in the new interval, and resumes the prior Layout afterward. It is unavailable
  inside a Transition and applies the same Make Unique/Ungroup rule to an
  intersected Group as Insert Time.
- Inserting inside an occurrence therefore creates entry and exit boundaries;
  appending at Show End creates only an entry boundary. The initial overhaul
  does not reinterpret populated downstream choreography as a different Layout
  from an arbitrary playhead.
- Insert Blank Layout, Use Named Layout, Copy Previous Layout, and Duplicate
  Layout Interval are variants of the same creation flow.
- Editor presentation has one active Layout context: the selected entity's
  occurrence when a selection exists, otherwise the playhead occurrence. The
  overlaid Zone Map follows this context without requiring an Active Layout
  strip; the Stage remains tied only to the playhead.
- Timeline height remains stable while panning horizontally. It may change only
  through explicit expand, collapse, focus, or Layer operations and is based on
  the tallest interval in the current display state.

### 14. Installation and Portable Zone behavior

- A Zone Layout definition owns complete topology. An Installation Layout owns
  an exact complete pixel assignment; a Portable Layout owns one ordered set of
  logical Zones and its routing operator.
- Installation Shows remain tied to one fixed map and pixel count. Within each
  Layout definition, each pixel belongs to exactly one Zone. Missing, overlapping,
  and out-of-range ownership remains artifact-blocking.
- Add Installation Zone is optimized for subdivision. Spatial selection transfers
  ownership from previous Zones atomically instead of creating overlapping
  independent range lists.
- Advanced exact range entry edits the complete Zone layout as a draft and
  commits atomically after validation.
- Portable Shows remain resolution-independent across compatible 2D mapped
  surfaces. Their authoring map and count are reference context, not target
  identity.
- Portable Zone ownership is derived from normalized Stage coordinates at
  runtime, never from physical indexes.
- The current logical operators include Full Stage, Grid, Stripes, Checker,
  Rings, Wave, Split, Soft Split, and Pinwheel. Rectangular Split or Grid should
  be the first and easiest authoring path.
- Portable routing shapes need direct visual explanation and eventual tutorials.
  The overhaul may simplify the initial catalogue because existing Shows are
  test content and migration compatibility is not a product constraint, but it
  must not accidentally claim that every Portable Zone is a rectangle while
  nonrectangular operators remain supported.
- A Clip remains one-Zone in both contracts. Explicit Pattern-instance sharing
  provides synchronized runtime state across Zone placements.
- Split and Soft Split are Portable Layout operators with exactly two Zones.
  They cannot be applied to two arbitrary Zones inside a larger Layout.
- A Split definition owns axis, default boundary, and Soft Split feather. Each
  Layout occurrence owns Split Position, which may be static or keyframed in a
  property track displayed above its two Zone stacks. “Moving Split” is Split
  with animated Split Position, not a separate routing mode.
- Arbitrary progressive handoff between different Layouts is deferred from the
  initial editor. The persisted model should not preclude a future boundary with
  duration, direction, and easing, and the current compiler capability must not
  be discarded accidentally.

### 15. Markers and Keyframes

- Dragging outward from the ruler creates a Marker at the release time.
- A Marker may be named, colored, dragged, positioned numerically, hidden, and
  used as a snap target.
- Marker visibility and Marker snapping are separate toggles.
- Moving a Marker never moves content.
- Insert Time shifts every Marker at or after the insertion point.
- Shortening Show End before a Marker retains it dormant beyond the boundary.
  Re-extending the Show reveals it.
- Keyframes are property-owned and visibly distinct from Markers.
- Clip-property keyframes move with the Clip. Instance-property keyframes move
  with the Pattern-instance clock origin.
- Group-occurrence X/Y keyframes move with that occurrence. Split Position
  keyframes remain local to their Zone Layout occurrence. Show output automation
  remains in absolute Show time.
- Keyframes can snap to Markers.
- Numeric properties use existing easing families where valid. Discrete values
  remain non-keyframeable until a specific transition policy exists.

### 16. Entity Details and property editing

- Selecting an entity opens or focuses its modeless Entity Detail.
- Existing summaries at the top of Entity Details should be preserved.
- Entity Details should behave like compact toolbars rather than heavyweight
  dialogs: minimal chrome, smaller form controls, reduced whitespace, and no
  mandatory close-button hunt.
- Pointer-down anywhere in the Show editor outside Entity Details closes every
  transient Entity Detail before the target action runs. Selection remains. A
  second click on the selected Clip therefore closes its open Detail; clicking
  another Clip replaces the transient Detail. A keyboard command toggles the
  detail for the selected or hovered entity.
- A completed click opens Details. Pointer-down followed by a drag does not open
  a new Detail. Any already open floating Details hide during direct timeline
  manipulation, retain their state, and reappear anchored to their entities when
  the gesture commits or cancels. Only the compact drag readout remains visible.
- A pinned Entity Detail may coexist with one transient Detail when screen space
  permits so authors can compare Clips. Unpinned Details do not accumulate.
  Details must not consume a dialog-scale width.
- Clip Details preserve a compact summary of all applied Effects. Add Effect
  opens the modeless Effects catalogue without discarding Detail state; applying
  a choice closes the catalogue and focuses the new Effect summary card.
- Escape should have one predictable priority among active editing, Group
  isolation, selection, and open details. “Close all open Entity Details” is a
  desired convenience but the exact priority order remains for interaction
  design.
- Exact time, position, duration, viewport, Effect, and Control values remain
  numerically editable in addition to direct manipulation.

### 17. Keyboard direction

- Space plays and pauses unless focus is inside an input that owns Space.
- `A` seeks to Show start. Home is not used because it is absent from many
  keyboards and is harder to discover.
- Tab and Shift+Tab are the leading candidates for deterministic next/previous
  Clip traversal with wraparound. The final accessibility pass must ensure that
  this does not break required focus traversal inside open inspectors.
- Left and Right Arrow are reserved for timeline navigation rather than Clip
  traversal; exact pan/seek increments remain to validate.
- Standard platform Undo, Redo, Cut, Copy, and Paste shortcuts remain standard.
- Escape exits Group isolation and participates in the final inspector/selection
  priority order.
- Exact shortcuts for Entity Detail toggle, Marker creation, frame-step seeking,
  and temporary boundary-snapping inversion remain to assign after the
  interaction model is prototyped.

### 18. Clip filmstrips

- Filmstrips are a desirable progressive enhancement, not a release dependency.
- A filmstrip samples the actual Clip result at several Show times rather than
  repeating one poster image.
- It reflects local Pattern time, shared-instance continuity, independent
  restart, time-rate changes, placement/Effect output, and Transition pre-roll.
- Split Clips should align seamlessly. Independent duplicates should visibly
  restart. Shared instances at the same Show time should show corresponding
  phase subject to their distinct Clip views.
- Filmstrips are derived cache data and are never saved in the Show or compiled
  artifact.
- The immediate Clip remains its normal color, icon, and label. After interaction
  settles, quiet reserved filmstrip slots may appear; one representative frame
  arrives first; additional frames and resolution trickle in later.
- Rendering pauses during pointer manipulation, scrolling, zooming, scrubbing,
  playback pressure, property editing, or dropped frames.
- Selected Clips receive priority, then visible Clips. Offscreen Clips receive
  no work. Stale jobs cancel when timing or output-affecting values change.
- Arrival uses a subtle fade without shimmer, spinners, layout shift, or repeated
  motion.

### 19. Existing components and visual direction

- This is not an aesthetic reset. The dark PXLBLZ palette, typography, density,
  icon language, Stage, transport, Clip styling, Effect catalogue, Transition
  artwork, compile disclosure, and compact control vocabulary remain the basis.
- The current Scene apparatus above the timeline is removed rather than restyled.
- The current X-ray's live Transition preview is an explicit asset to reuse.
- Timeline ruler, Navigator, Zone picker, layers, Clips, and Entity Details must
  form one hierarchy. Decorative headers will not replace removed Scene chrome.
- Leaf components and pure geometry/interaction engines should be reused or
  adapted. Large components whose props encode Scene ownership should be
  replaced rather than forcing the new model through compatibility adapters.

### 20. Architecture boundaries

Implementation should deepen framework-independent modules around a small set
of stable interfaces:

- a normalized Show document and validator;
- Clip, Transition, Group, Marker, Layer, Zone, Zone Layout definition, and Zone
  Layout occurrence edit algebra;
- Pattern-instance identity and time mapping;
- timeline geometry, snapping, collision, marquee closure, Navigator geometry,
  and minimum display widths;
- placement and Viewport coordinate transforms;
- Property ownership and keyframe projection;
- Installation ownership transfer, Portable routing validation, and Layout
  boundary projection;
- Freeze/Strobe capture scheduling and Blink/Stutter time/output policies;
- compiler lowering from the new document into existing optimized recipe and
  artifact paths; and
- derived filmstrip scheduling and cache invalidation.

React components should render these projections, delegate events, and commit
semantic operations. They should not duplicate collision, ownership, timing, or
selection rules.

### 21. Persistence and compiler boundary

- The new Show document should be versioned and saved atomically as one Show.
- Stable ids exist for entities that are selected, referenced, animated, linked,
  grouped, or targeted by undo. Ordinary scalar values remain inline.
- Pattern source is referenced rather than embedded in the Show document.
- Existing personal Shows are development fixtures rather than a compatibility
  commitment. A one-time best-effort conversion or explicit reset is acceptable
  if it keeps the new model materially simpler.
- The existing output contract remains immutable and authoritative.
- The generated artifact remains one ordinary Pixelblaze Pattern.
- Existing compiler specializations, score tables, member lowering, state-slot
  reuse, routing formulas, Effects, render-target arena, resource ledger,
  deterministic seek, EPE, Run, Save, and compatibility disclosure should be
  reused through a new lowering boundary.
- Checkpointing hidden Pattern state into the artifact is not part of this plan.
  Prior analysis found no expected size or compute win sufficient to justify it.
- The compiler may avoid Pattern work outside Viewports, behind opaque keyed
  coverage, or during hidden intervals only when its state analysis proves
  observable equivalence.
- Two engine changes are explicit parts of the overhaul rather than assumed UI
  reuse: per-Layer Transition lowering and deterministic Show-loop reset. Each
  begins with a bounded research spike and exact preview/compiler equivalence
  tests before the document schema is frozen.

## Testing Decisions

Tests should assert user-observable state transitions and generated semantics,
not React implementation details or private helper shape. Most coverage belongs
in pure edit, time, ownership, selection, and lowering modules. Components need
focused interaction tests; complete workflows need a smaller number of browser
tests and representative hardware/compiler fixtures.

### Pure model tests

1. Add, move, resize, split, duplicate, link, Make Independent, and delete Clip.
2. Same-layer temporal collision and cross-layer overlap.
3. Cross-Zone movement with normalized placement preservation.
4. Minimum duration and minimum display-width separation.
5. Show End automatic growth, manual shortening, snapping, and non-truncation.
6. Insert Time across empty space, Clips, Groups, Markers, and Pattern instances.
7. Insert Time refusal inside every Transition family.
8. Cut-to-Transition conversion and zero-duration restoration.
9. Transition duration independent from neighboring Clip duration.
10. Incoming and outgoing Pattern local time across a Transition.
11. Shared instance continuity across gaps and independent restart.
12. Moving all versus one linked Clip and the resulting clock mapping.
13. Property ownership conflicts across simultaneous linked placements.
14. Viewport first-enable no-op, disable/enable preservation, clipping, and
    animation.
15. Rotation around Clip center.
16. Marquee intersection and transition-connected closure.
17. Additive and subtractive selection refinement with Group validity reasons.
18. Group duplicate, linked edits, Make Unique, Ungroup, and internal instance
    topology.
19. Group Zone, nesting, and partial-Transition rejections.
20. Marker creation, movement, visibility, snapping, Insert Time, and dormant
    out-of-range preservation.
21. Clip and instance keyframe movement and hidden-keyframe restoration.
22. Zone collapsed/expanded state preservation.
23. Installation pixel-ownership transfer with exact coverage.
24. Portable logical routing validation and local-coordinate behavior.
25. Semantic undo/redo for every structural operation.
26. Hard Zone Layout boundaries with changing Zone counts and no straddling.
27. Named Layout reuse, Make Unique, explicit Edit all uses, Copy Previous, and
    Duplicate Layout Interval semantics.
28. Duplicate Zone Track and cross-Zone Group-definition reuse with fresh runtime
    Pattern instances.
29. Split Position animation in exactly two-Zone Portable Layouts.
30. Transition-connected sequence movement, resize algebra, Clip deletion, and
    Reset to Cut.
31. Freeze, Strobe, Blink, and Stutter ownership and timing.
32. Insert Time through Layout boundaries, Show automation, and linked Groups.

### Compiler and preview equivalence tests

1. Independent instance begins at zero at first contribution.
2. Incoming instance begins at Transition start and has advanced when its Clip
   interval begins.
3. Split produces identical frames before and after the edit.
4. Shared instance advances once per frame across multiple placements.
5. Shared instance continuity through a hidden gap.
6. Clip placement and Viewport affect sample/output without changing instance
   state ownership.
7. Viewport output is transparent outside the frame and black only after final
   empty composition.
8. Luma Key and Chroma Key preserve existing alpha and conditional-evaluation
   behavior.
9. Installation and Portable routing retain output-contract semantics.
10. Fast preview, deterministic seek, generated source, EPE, and Controller code
    use the same lowering.
11. Optimization selection changes cost but not exact output for qualified pure
    Patterns.
12. Stateful or unknown Patterns retain required calls.
13. Resource and active-renderer blockers remain actionable while preview stays
    available.
14. Per-Layer Transition composition leaves unrelated Layers semantically
    unchanged.
15. Every logical Pattern instance, Trails/history buffer, and Freeze/Strobe
    cache returns to authored initial state at Show loop.
16. Freeze/Strobe capture order matches preview, generated source, and resource
    accounting; Blink and Stutter affect only their declared owner.

### Component and browser tests

1. Ruler seeking, Marker drag-out, and Show End dragging.
2. Navigator pan, edge-resize zoom, recenter, Fit, keyboard focus, and no page
   overflow.
3. Clip direct manipulation, hysteresis, auto-scroll, collision feedback, and
   minimum-width hit targets.
4. Viewport enablement and Content/Viewport edit-mode distinction.
5. Marquee acquisition, live closure, refinement, and disabled Group reason.
6. Group isolation dimming, editability, Escape, and undo.
7. One-Zone hidden UI; overlaid Zone Map; independent multi-Zone collapse;
   Focus Zone convenience command; and all-Zones stacks.
8. Zone icon truncation, tooltip, keyboard label, and non-color identification.
9. Compact Entity Detail global click-away, selected-Clip toggle, pinned
   comparison, drag hide/restore, applied-Effects summary, catalogue handoff,
   and narrow-window behavior.
10. Filmstrip priority, cancellation, stable layout, and reduced-motion behavior.
11. Desktop and narrow-window timeline density.
12. Space, A, Tab traversal candidate, arrows, standard clipboard shortcuts,
    inputs, and inspector focus boundaries.
13. Preview output at playhead after each structural edit.
14. Console-error-free creation, save/reload, export, and Controller preflight.
15. Four-to-one-to-three Zone Layout intervals, variable stack heights, collapse,
    focus, vertical scroll, and playhead continuity.
16. Shared Layout edit scope, named Layout catalogue editing, Copy Previous,
    Duplicate Zone Track, and Duplicate Layout Interval.
17. Freeze/Strobe/Blink/Stutter controls, cache pressure disclosure, and held
    upstream-animation indication.

### Scenario audit before implementation completion

The complete common-action inventory must be replayed against the final model:
create, select, refine selection, move, align, snap, resize, split, insert,
duplicate, link, unlink, Group, reuse a Group definition across Zones, Make
Unique, Ungroup, transition, reset to Cut, change Zone, change Layer, create and
switch Zone Layouts, name/reuse/copy/duplicate Layouts, duplicate a Zone Track,
animate Split Position, animate owned properties, enable/disable a Clip
Viewport, Freeze, Strobe, Blink, Stutter, open/close/pin Details, copy/paste,
delete, undo/redo, seek, play, loop, shorten, extend, save/reload, compile,
export, Run, and Save. Each operation must name its target owner, collision
result, Pattern-instance result, keyframe result, shared-definition scope,
resource result, and undo result.

## Out of Scope

- Scene compatibility as a user-facing concept.
- Nested timelines, nested Groups, or recursive compositions.
- One Clip or Group spanning several Zones.
- One Group occurrence spanning several Zones or a Zone Layout boundary.
- Bulk property editing for multi-selection.
- Custom Group pivots, Group Width/Height/Rotation, or Group Viewports.
- Custom Clip rotation pivots.
- General blend-mode authoring in the initial overhaul.
- Third-source Luma Matte or Track Matte relationships.
- Arbitrary mask graphs or node-based compositing.
- Audio input simulation, beat detection, BPM timelines, or music-synchronized
  Shows. These remain separate later research.
- Checkpointing or serializing hidden Pattern runtime state into artifacts.
- Filmstrips as a release blocker.
- Aesthetic rebranding or wholesale component restyling.
- Preserving every development/test Show through migration.
- Increasing the measured 2,000-pixel output envelope without new hardware
  evidence.
- Reverse Pattern playback or negative Pattern time.
- Nested or composable Portable routing graphs.
- Arbitrary animated handoff between different Zone Layout definitions in the
  initial editor. The data model may reserve a future boundary representation.

## Open Decisions

The governing model is ready for UI design. These details remain intentionally
open for prototypes or implementation design rather than more abstract debate:

1. Exact default duration for a newly added Clip; five seconds is provisional.
2. Exact Delete versus ripple-delete command set and keyboard assignment.
3. Exact behavior when manually shrinking Show End across dormant Markers and
   keyframes in the eventual destructive Trim Show flow.
4. Exact keyframe partition/rebasing algebra for every nonlinear interpolation
   when splitting a Clip.
5. Exact Pattern-state semantics of Make Independent in the middle of a running
   stateful instance when seamless divergence cannot be reproduced cheaply.
6. Final Portable routing-shape catalogue and the tutorial/visualization system
   that makes nonrectangular operators understandable.
7. Exact keyboard shortcuts and Escape priority among input editing, inspectors,
   Group isolation, and selection.
8. Whether Tab owns Clip traversal globally or only when the timeline has focus.
9. Exact compact Entity Detail dimensions and multi-panel collision policy.
10. Exact visual treatment of auto-expanded selection and invalid Group
    candidates.
11. Exact Show Navigator occupancy summary and minimum useful width.
12. Exact filmstrip sampling density, cache lifetime, and idle budget.
13. Whether empty layers disappear immediately, on save, or only on reload.
14. Detailed persistence schema and lowering/migration sequence.
15. Exact interaction for Insert Time through a unique Group and the earliest
    release at which the editor may expand its definition instead of requiring
    Ungroup.
16. Exact collapsed-summary grammar for a Zone Layout interval with changing
    Zone counts, and the maximum practical expanded height before focused mode
    should be recommended.

## Further Notes

The overhaul is inspired by the economy of CapCut and Filmora rather than by
professional non-linear editors. iMovie remains useful evidence for specific
beginner affordances but is too restrictive as the governing comparison: blank
time, unlocked layering, precise placement, and explicit power are important to
PXLBLZ.

The strongest design move is removal, not addition. Eliminating Scenes removes
three redundant inspection/editing levels and lets the existing Stage,
Effects, Transitions, compiler, cost model, output contracts, and generated
artifacts become easier to reach. The optional Viewport, Zone workspace, linked
Pattern instance, and Group definition then add capability through progressive
disclosure without burdening the ordinary one-Clip Show.

The current rendered Shows already look excellent. Success means authors can
reach that output through a model they can predict, explain, and manipulate
without repeatedly asking which level owns the thing they are trying to change.

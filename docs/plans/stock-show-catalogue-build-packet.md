# Stock Show catalogue build packet

Status: approved curriculum direction; fixture redesign and human review remain.
The seventeen-lesson course below replaces the Scene-centric 13-Show packet.
Issue #363 owns implementation and publication.

Amended 2026-08-02 by live review: added **100 Getting Around** (a
navigation/tools tour before 101) and **207 Aperture Shapes and Edges** (the
shaped-aperture work from #591/#678/#679 postdates the original approval), and
replaced the reference-Showcase retention rule with a total rebuild under the
measured-casting doctrine. Build order for the remaining work: 301-303 first,
then 100 and 207, then the Showcase repartition, then fresh Redline review.

The previous packet is preserved as
[`archive/stock-show-catalogue-scene-editor-baseline.md`](archive/stock-show-catalogue-scene-editor-baseline.md).
Its fixture timings, source casting, test evidence, and note style remain useful
inputs, but its lesson sequence and user-facing Scene model are superseded.

## Outcome

The Built-in Show catalogue should teach one idea at a time through short,
editable examples, then demonstrate the larger visual range through separate
reference Showcases and finished scores. More short Shows are preferable to
fewer overloaded Shows: catalogue organization and search already absorb the
navigation cost, while Pixelblaze artifact limits constrain one Show more than
they constrain the number of Built-ins.

The catalogue has three jobs:

1. teach the concepts required to author a useful Show;
2. demonstrate what the editor and compiler can do with visually credible
   content; and
3. provide session-editable starting points that reset to a pristine Built-in.

The companion **Visual Effects Guide** explains mechanics. Each lesson makes one
mechanism concrete. A Show note supplies a short purpose, one **Notice**, exactly
two **Try this** actions, and one guide handoff; it is orientation, not a second
tutorial system.

## Governing course rules

### One lesson, one governing idea

Each lesson introduces one ownership distinction or authoring mechanism. A
supporting behavior may appear only when the learner already met it or when it
is necessary to make the governing idea visible. A lesson should not debut a
new Transition family, moving property, Zone topology, Effect stack, and busy
source Pattern in the same passage.

Most teaching Shows should run for 8-18 seconds and contain two to four passages.
The 106, 302, and finished-score capstones may run for 20-30 seconds when the
extra time creates an intelligible dramatic arc. Reference Showcases may be
longer only when they remain useful as a lookup instrument; split a reference
when a viewer must hold more than one question in mind.

### The unified editor is the curriculum

Authors work on one proportional timeline of direct Clips, Layers, Transitions,
Groups, Zones, Zone Layout intervals, Markers, and Property animation. No lesson
may tell the learner to open a Scene editor, inspect a Scene X-ray, or enter
Scene-local scope. Internal Scene and composition terms may appear only in
fixture implementation notes or tests where they name the persisted/compiler
representation.

Every lesson opens in the production editor. Built-in mutation creates a
session-only draft; Undo/Redo, **Try this**, and Reset operate on that draft
without creating or changing a personal D1 record. Reload and Reset restore the
catalogue fixture.

### Visual and editorial discipline

- Use calm, recognizable source Patterns until the learner can identify the
  mechanism without reading the note.
- Let each passage establish, change, and settle. Correct output must not look
  like an agitated rendering failure.
- Keep one dominant visual change per passage. Secondary motion may establish
  continuity but must not compete with the lesson.
- Prefer one reusable diagnostic source when comparing Effects, presentation
  modes, easing, or Property targets.
- Explain ownership in positive terms: Clip, Pattern instance, Transition,
  Group occurrence, Zone Layout, Show, and output contract.
- Preserve Pattern attribution and use only Built-in Pattern references unless
  the lesson explicitly teaches personal-content replacement through its
  session draft.

### Technical defaults

- Portable lessons use a 2D reference map and validate at contrasting square and
  wide resolutions. Their routing remains normalized and free of physical
  ranges.
- Installation lessons use a fixed map, exact pixel count, and complete
  non-overlapping physical coverage.
- The saved fixture uses whole-second landmarks where possible, while the model
  stores milliseconds and supports sub-second editing.
- Every Show compiles through the production artifact path, exports as an
  importable EPE, and reports its real resource and renderer cost.
- User-facing notes say **Clip**, **Layer**, **Transition**, **Zone**, and
  **Zone Layout** even when fixture construction uses internal compatibility
  Scenes.

## Approved curriculum

```text
Learn
  100 - Foundations
    100 Getting Around
    101 Clips, Cuts, and Blank Time
    102 Transitions and Values
    103 Clip Transform
    104 Effects and Ordering
    105 Portable Zones
    106 Built from Basics

  200 - Composition
    201 Layers and Property Animation
    202 Content and Clip Viewport
    203 Pattern Instance Lifecycle
    204 Presentation Modes
    205 Groups and Linked Reuse
    206 Changing Zone Layouts
    207 Aperture Shapes and Edges

  300 - Output and Delivery
    301 Installation Mapping
    302 Installation Composition
    303 Compile, Simplify, and Deliver
```

The 100 level opens with a tools tour, then teaches enough to create a
satisfying Portable Show. The 200 level explains simultaneous composition,
spatial apertures, runtime identity, presentation, structural reuse, and
changing topology. The 300 level introduces physical output and the publication
boundary. No level assumes the learner completed every later lesson before
authoring useful work.

## Learn 100: Foundations

### 100 Getting Around

**Governing idea.** The Show editor is a direct-manipulation surface. Transport,
timeline navigation, and Clip gestures — especially the modifier affordances
that are easy to miss — are how an author moves, before any composition concept
matters.

Use a calm pre-built Show whose content never competes with the tools: three or
four quiet Clips, one with a second Layer available so drag-between-Layers has
somewhere to go. The lesson is deliberately non-exhaustive; that restraint is
itself part of the course doctrine. It demonstrates the highest-leverage
gestures — play/pause and seek, zoom and pan, the Navigator, double-clicking an
empty Layer to place a Clip, Option-drag to duplicate, dragging between Layers,
Snap and its temporary Option reversal — and hands everything else to the
Keyboard Shortcuts reference. No new authoring concept is introduced; whatever
the learner breaks, Reset restores.

**Try this direction.** Double-click an empty stretch of Layer to place a Clip;
hold Option and drag an existing Clip to drop an independent duplicate.

**Acceptance focus.** A first-time visitor can play, move around a Show, and
rearrange Clips confidently without opening documentation, and knows where the
full shortcut reference lives.

This lesson's guide handoff targets the Keyboard Shortcuts document rather than
the Visual Effects Guide; the note mechanism must allow a per-lesson document
target.

### 101 Clips, Cuts, and Blank Time

**Governing idea.** A Clip directly occupies Show time on a Layer. A Cut is the
selectable zero-duration junction between adjacent Clips, while blank time is
valid and renders black.

Use two quiet, visually distinct Patterns on one full-surface Zone. Give the
timeline an intentional leading, middle, or tail gap and an explicit Show End.
The ruler, playhead, transport, Split, move, resize, Snap, Marker, and Reset may
appear as supporting tools, but no non-Cut Transition, Effect, additional Layer,
or Zone may compete with direct timing.

**Try this direction.** Split one Clip without changing the picture; move an edge
to create or remove blank time.

**Acceptance focus.** A new learner can identify each Clip interval, the Cut,
the gap, and Show End without opening Entity Details.

### 102 Transitions and Values

**Governing idea.** A Transition is a literal junction entity. The destination
owns its target value; the incoming junction owns the explicit start, duration,
and easing used to reach it.

Use three calm Clips and at most two clearly different Transition families.
Animate one legible property such as Brightness or Animation speed across one
junction. Sparklines should explain the value change without requiring a second
editing scope.

**Try this direction.** Shorten a Transition; change the destination value and
compare its ramp.

**Acceptance focus.** The learner can point to the Transition, destination
value, and Property ramp as three related but separately owned facts.

### 103 Clip Transform

**Governing idea.** Clip Transform is canonical placement geometry, separate
from the Pattern instance and separate from authored Effects.

Reuse one recognizable 2D Pattern across a small sequence that changes Position,
Rotation, Scale, and Mirror one concept at a time. Preserve the Pattern clock so
the same motion makes spatial changes easy to compare. Do not add Transform
Effects or a Clip Viewport.

**Try this direction.** Center an off-axis Clip; rotate or mirror one placement
without changing the source Pattern.

**Acceptance focus.** The learner understands that Clip Transform moves sampled
content without editing Pattern source or allocating another Pattern instance.

### 104 Effects and Ordering

**Governing idea.** Effects form one ordered Clip-owned pipeline after Pattern
rendering. Reordering operations may change the result.

Use one known source and a short sequence covering a spatial Effect, a
distortion, and a color/output Effect. Include one two-Effect stack whose order
is visibly meaningful. Avoid Clip Transform changes, Layers, keys, or a moving
Viewport so the Effect pipeline remains the only variable.

**Try this direction.** Reorder the two-Effect stack; set one Effect to its
neutral value and restore it.

**Acceptance focus.** The learner can distinguish the Pattern, the Clip, the
ordered Effect stack, and the compiler's Transform/Distort/Address/Color stages.

### 105 Portable Zones

**Governing idea.** Portable Zones assign normalized Stage regions without
depending on a particular LED count or wiring order.

Use two calm Patterns in a static, axis-aligned two-Zone layout. Each boundary
must be visually obvious on both square and wide maps. Keep Pattern instances
independent and omit Layout changes, Layers, and Effects.

**Try this direction.** Move the split position; replace one Zone's Pattern.

**Acceptance focus.** Zone ownership, Pattern identity, and map geometry remain
separate and aligned across compatible resolutions.

### 106 Built from Basics

**Governing idea.** A polished Portable Show can emerge from the five foundation
mechanisms without advanced composition.

Build a 20-30 second score using only direct Clips, literal Transitions, one or
two Property ramps, restrained Clip Transform, a small Effect vocabulary, and a
static Portable Zone Layout. Give the Show a clear establish-drive-resolve arc.

**Try this direction.** Remove one secondary treatment and judge whether the
piece improves; replace the final Transition.

**Acceptance focus.** The result succeeds first as LED artwork and remains
explainable entirely from lessons 101-105.

## Learn 200: Composition

### 201 Layers and Property Animation

**Governing idea.** Layers allow simultaneous Clip contributions; Property
animation changes an owned value without creating filler Clips.

Use one stable Main Clip and one sparse overlay. Animate overlay Opacity through
arrival, hold, and departure while both Pattern clocks continue. Keep Viewport,
keys, and Groups absent.

**Try this direction.** Change peak Opacity; move the overlay to another Layer
and compare ordering.

**Acceptance focus.** The learner can distinguish Layer order, Clip duration,
and the Opacity curve controlling contribution inside that interval.

### 202 Content and Clip Viewport

**Governing idea.** Content transforms the Pattern coordinate field; Clip
Viewport clips the Clip contribution with an independently positioned
axis-aligned aperture.

Use a lower Layer that makes uncovered pixels obvious. Move or scale Content
behind a stationary Viewport, then animate the Viewport while Content remains
stable. First enablement must preserve the current result.

**Try this direction.** Pan Content behind the frame; animate Viewport width or
position without changing Pattern time.

**Acceptance focus.** The learner predicts which pixels are sampled, which are
visible, and when the lower Layer appears.

### 203 Pattern Instance Lifecycle

**Governing idea.** A Pattern instance owns private state, clock, controls, and
instance-level animation independently of the Clips that present it.

Use a source with unmistakable phase or state. Show Split preserving continuity,
ordinary duplication restarting independently, two Clips sharing one instance,
Make Pattern Independent, and Rejoin Shared Pattern. Keep presentation modes
Live throughout.

**Try this direction.** Make one shared Clip independent; rejoin it and observe
the deliberate state handoff.

**Acceptance focus.** The learner can predict when motion continues, restarts,
or becomes shared without equating Clip identity with Pattern-instance identity.

### 204 Presentation Modes

**Governing idea.** Clip presentation changes how one placement exposes a
running Pattern. Live, Freeze, Strobe, and Blink remain Clip-owned; Stutter
quantizes the shared Pattern-instance clock.

Use one diagnostic source and short comparison passages. Make capture-versus-
visibility behavior obvious without adding unrelated Effects or routing.
Advanced evaluation policies such as Freeze at entry and Refresh belong in 303,
where their cost tradeoff can be explained.

**Try this direction.** Compare Freeze with Blink; link two Clips and apply
Stutter to expose its instance ownership.

**Acceptance focus.** Each mode is recognizable at normal playback speed, and
the learner distinguishes Clip presentation from Pattern-instance time.

### 205 Groups and Linked Reuse

**Governing idea.** A Group definition is reusable choreography; a Group
occurrence places it without sharing private Pattern state between uses.

Build one compact multi-Layer phrase, Group it, and place a linked duplicate.
The second occurrence should make a shared definition edit obvious while
preserving fresh occurrence-local Pattern instances. Make Unique, Ungroup, and
modeless isolation belong in the **Try this** flow rather than the base score.

**Try this direction.** Edit one linked definition; Make Unique and change only
one occurrence.

**Acceptance focus.** The learner can distinguish Group definition reuse,
occurrence placement, and Pattern-instance sharing.

### 206 Changing Zone Layouts

**Governing idea.** Sequential Zone Layout intervals can restate output topology
on the same ruler without resetting Pattern instances.

Use two or three intervals that progress from full surface to a simple split and
then to a clearly different arrangement. Continue at least one Pattern instance
across a boundary. One interval may animate a Moving or Soft Split position.
Insert Time, interval duplication, and Layout reuse may appear as supporting
operations.

**Try this direction.** Duplicate an interval with content; insert time before a
Layout boundary and observe the atomic shift.

**Acceptance focus.** Topology changes remain distinct from visual Transitions,
Pattern-instance lifecycle, and Stage maps.

### 207 Aperture Shapes and Edges

**Governing idea.** The Clip Viewport aperture has an authored silhouette
(Rectangle, Ellipse, Diamond, Ring, Rounded-box) and an edge treatment (Hard,
Soft, Stable Dither). Shape and edge are placement geometry owned by the Clip,
separate from Content and from authored Effects.

Reuse 202's construction: a lower Layer that makes uncovered pixels obvious,
one calm upper source. Change only the silhouette across two or three passages,
then hold one non-rectangular shape and compare edge treatments. Content,
Pattern time, and aperture position stay constant so the silhouette and edge
are the only variables. Numbered after 206 so the reviewed 202-206 sequence
keeps its order; pedagogically it follows directly from 202.

**Try this direction.** Change one Clip's aperture shape; switch its edge
between Soft and Stable Dither and compare the boundary at playback speed.

**Acceptance focus.** The learner can distinguish silhouette, edge treatment,
and aperture placement as three authored properties, and knows the full
shape-by-edge matrix lives in the Aperture Shapes reference.

## Learn 300: Output and Delivery

### 301 Installation Mapping

**Governing idea.** An Installation output contract fixes one map and pixel
count; physical Zone ranges must cover that output exactly once.

Use an interesting measured 2D map with two visually obvious physical groups.
Demonstrate named ranges, map-based LED selection, and exact overlap/gap/
out-of-range diagnostics without adding composition complexity.

**Try this direction.** Select one Zone on the map; create and repair a deliberate
coverage gap in the session draft.

**Acceptance focus.** The learner understands the difference between a Portable
logical predicate and Installation physical identity.

### 302 Installation Composition

**Governing idea.** A fixed installation can turn non-contiguous physical groups
into one decipherable performance using the same Clips, Layers, Transitions,
instances, and Effects learned earlier.

Build a 20-30 second score over several named physical groups. Reuse a restrained
subset of earlier mechanisms and preserve one visual role per group. Do not turn
the lesson into a compiler stress test.

**Try this direction.** Solo related physical groups; replace one Pattern while
preserving the routing contract.

**Acceptance focus.** The piece succeeds as artwork, maintains exact coverage,
and makes the physical grouping legible without reading raw ranges.

### 303 Compile, Simplify, and Deliver

**Governing idea.** A Show remains editable choreography but publishes as one
ordinary Pixelblaze Pattern whose cost, compatibility, and provenance are
measured from the generated artifact.

Use a compact Portable score with one optional expensive treatment. The lesson
should expose compile pressure, Show source inventory, selected/rejected
specializations, **Ways to slim this Show**, generated code, EPE export, Run,
and Save without requiring a connected Controller to understand the workflow.
Include Freeze at entry or Refresh only when the visual and cost tradeoff is
measurable and explicit.

**Try this direction.** Remove the expensive treatment and compare inventory;
export the EPE or inspect generated code.

**Acceptance focus.** The learner can separate saved choreography from the
generated Pattern and can act on a named output blocker or cost contributor.

## Showcases

Showcases are reference instruments or finished artworks, not prerequisites in
the numbered course. Keep each comparison short enough that the viewer can
attribute the change without memorizing a long matrix. A reference should
normally contain no more than six to eight comparison passages; split larger
families.

### Reference groups

**Effects**

- Transform and Address Effects
- Distortion Effects
- Color Adjustment Effects
- Compositing and Key Effects

The split replaces the old overloaded Color & Output matrix. Compositing and Key
Effects should cover Opacity, Luma Key, Chroma Key, and Vignette against an
appropriate lower source. Trails remains a Show output Effect and should appear
inside a finished score until the output-Effect family is large enough to
justify its own reference.

**Transitions**

- Blend and Fade Transitions
- Wipes
- Dissolves
- Shape Reveals
- Motion Transitions

This replaces the long combined Wipe and Mix reference. Each Show keeps source
Patterns and timing constant while one family changes.

**Animation**

- Property Animation
- Easing

**Placement**

- Aperture Shapes

The Aperture Shapes reference carries the full silhouette-by-edge matrix that
lesson 207 deliberately abbreviates: every supported silhouette at a
representative edge, then one held silhouette across Hard, Soft, and Stable
Dither, within the six-to-eight passage ceiling.

Property Animation should include representative Clip Transform and Viewport
targets in addition to scalar Pattern and routing values. Easing keeps one
motion and one duration constant.

**Finished scores**

- Redline Installation

Redline remains a long-form exception and requires fresh visual review against
the unified editor. Additional finished scores belong here only when they work
as LED art independently of the mechanism they demonstrate.

## Migration from the previous catalogue

| Previous item | Current disposition |
| --- | --- |
| 101 Clips and Crossfade | Rebuild as 101; move Crossfade teaching to 102. |
| 102 Transitions and Values | Rebuild as 102. |
| 103 Effects | Split its evidence between 103, 104, and Effect references. |
| 104 Portable Zones | Rebuild as 105. |
| 105 Built from Basics | Rebuild as 106. |
| 201 Scene-local Cuts | Retire as a lesson; direct sequencing belongs in 101. Preserve useful fixture/test evidence. |
| 202 Layers and Local Animation | Rebuild as 201 without Scene-local framing. |
| 203 Dynamic Zone Layouts | Rebuild as 206. |
| 204 Installation Mapping | Rebuild as 301. |
| 205 Installation Composition | Rebuild as 302. |
| Existing Transition, Property, Easing, and Effect references | Rebuild from scratch into the shorter reference groups above; no existing fixture is retained (2026-08-02 decision — none meets the passage ceiling or the measured-casting doctrine). |
| Redline Installation | Retain as a finished score pending fresh review. |

Lessons 202-205 and 303 are new fixture designs. Exact Pattern casting, passage
timing, and note copy remain part of #363 implementation rather than decisions
to inherit from the superseded packet.

## Implementation order

Work in complete, reviewable curriculum slices:

1. Update guide anchors and catalogue metadata for the approved hierarchy.
2. Rebuild 101-105, then build 106 only from their accepted vocabulary.
3. Rebuild 201, then add 202-206 one lesson at a time.
4. Rebuild 301-302 against a reviewed physical map.
5. Build 303 after the compiler-cost and delivery copy matches current artifact
   behavior.
6. Build 100 Getting Around and 207 Aperture Shapes and Edges after the 300
   level lands.
7. Rebuild every reference Showcase from scratch into the repartitioned
   families, including the new Aperture Shapes reference; no existing fixture
   is retained.
8. Review Redline and any other finished scores separately from curriculum
   acceptance.
9. Run the complete capture, automated, and human-review gates before
   publication.

Each slice includes its fixture, note, guide handoff, tests, desktop/narrow
captures, representative Stage frames, and normal-speed review. Do not implement
all fixtures first and defer visual review to the end.

## Acceptance criteria

- [ ] The Learn tree contains the approved seventeen lessons in the documented
  order and no user-facing Scene terminology.
- [ ] Most lessons run for 8-18 seconds and introduce one governing idea; every
  longer exception earns its duration through an intelligible arc.
- [ ] Learn 100 ends with a polished Portable Show using only 101-105 concepts.
- [ ] Learn 200 teaches Layers, Viewport, Pattern instances, presentation,
  Groups, and changing Zone Layouts as distinct mechanisms.
- [ ] Learn 300 distinguishes exact Installation identity from general artifact
  publication and delivery.
- [ ] Portable lessons run unchanged across contrasting compatible 2D maps and
  resolutions without physical-range assumptions.
- [ ] Installation lessons carry exact contracts and complete non-overlapping
  physical coverage.
- [ ] Every note contains a purpose, one Notice, exactly two Try-this actions,
  and a valid guide target.
- [ ] Built-in edits remain session-only; Undo/Redo and Reset work without
  creating personal records.
- [ ] Showcases hold source, timing, and unrelated properties constant so each
  comparison has one attributable variable.
- [ ] Every Show compiles, previews, exports, and reports current artifact cost
  through production paths.
- [ ] Names, notes, order, captures, choreography, energy, and normal-speed
  visual results receive explicit human approval before publication.

## Tests and review evidence

- Assert unique ids, names, paths, level/order values, note fields, and guide
  targets.
- Assert every Pattern reference resolves and every Show normalizes and
  compiles.
- Assert production EPE round-trip, output-contract metadata, cost disclosure,
  and no-write Built-in routing.
- Assert Portable compatibility on contrasting square and wide maps.
- Assert complete Installation coverage and map identity.
- Add time-sampled output assertions for later passages, routed Zones, Layers,
  presentation modes, Groups, and Layout changes.
- Test session draft, Undo/Redo, Reset, navigation, and reload behavior.
- Capture every lesson at Timeline Fit with the note open and closed, one
  representative Stage frame, and its governing change.
- Review normal-speed playback at desktop and narrow widths with no console
  errors or document-level overflow.

## Documentation impact

- `CONTEXT.md` owns canonical Built-in Show, Clip, Layer, Pattern instance,
  Group, Zone Layout, and output-contract language.
- The Feature Guide owns catalogue discovery and the shape of the learning path.
- The Visual Effects Guide owns companion explanations and stable heading
  targets.
- The Technical Reference owns Built-in metadata, session-draft, persistence,
  compiler, and artifact boundaries.
- This packet owns the current curriculum direction; issue #363 owns executable
  progress, exact fixture work, review evidence, and publication state.

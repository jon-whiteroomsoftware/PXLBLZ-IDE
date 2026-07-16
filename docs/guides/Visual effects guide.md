# Visual effects guide

This guide explains how to animate and combine visual material in a Show.
**Property animation** changes a saved number over time, an **Effect** changes
one Clip, and a **Transition** moves from one Scene to the next. They share
parameters and timing controls, but they own different parts of the Show.
Choosing the right class keeps the timeline readable and makes the compiled
cost predictable.

The fastest way to learn the system is to open **Shows > Built-in Shows** in
Studio. The Portable track teaches normalized logical layouts; the Installation
track teaches fixed physical groups and coverage. Each example is read-only, so
it can be inspected, played, exported, or sent without creating an undeletable
personal record.

![A production Show with three zones, compact property lanes, transitions, cost disclosure, and Stage coverage.](../screenshots/show-visual-toolkit-overview.png)

## The ownership rule

Start by asking what the change belongs to.

| Class | Owns | Lives in the editor | Use it when |
| --- | --- | --- | --- |
| Property animation | One numeric property and its incoming change | A compact property lane and the owning Entity Detail Panel | A saved value should move from the previous target to the next target |
| Effect | One clip and one visual source | The clip's **Effects** stack | The same source should be transformed, distorted, addressed, or recolored |
| Transition | The boundary between two Scenes | The **Transitions** lane and the boundary's Entity Detail Panel | The outgoing and incoming sources must exchange ownership over time |

This ownership is literal. A clip carries its Effects when it moves or is
cloned. A Scene boundary carries its Transition. The destination clip or Scene
carries a Property animation's target value, while the incoming boundary carries
the optional start, duration, and easing used to reach it.

If a change belongs inside an existing Scene, open that Scene's local editor.
Its Main lane carries mutually exclusive Clips, overlay lanes carry concurrent
Clips, and typed property tracks carry local keyframes. Use a global **Split**
when the change should remain visible and editable on the global timeline.

## Reading the timeline

The global timeline shows structure first. Clips occupy zone rows, Transitions
occupy their own boundary lane, and animated values appear as terse property
lanes. A sparkline shows the useful shape of a value even when small differences
would be invisible at literal scale. Its dots mark authored targets; edit exact
values and times in Entity Details rather than treating the tiny marks as drag
handles.

Open a Scene's **X-ray** to reveal its internal beats without changing timeline
height. The magnifier opens **Super Detail**, a read-only wayfinding view with
expanded boundary, placement, Effect, Property animation, and compiler facts.
Use it to understand or align a dense Scene; ordinary authoring remains in the
global timeline.

Selecting one Show entity opens one modeless **Entity Detail Panel** beside it.
Selecting another entity transfers the panel, and selecting the same owner again
closes it. This keeps values near the thing they describe without turning every
timeline row into a permanent form.

![The clip Entity Detail Panel groups one-source Effects by compiler stage and retains the surrounding timeline.](../screenshots/show-visual-toolkit-entity-detail.png)

## Choosing an Effect

Select a clip, open **Effects**, and choose **Add**. The palette is a fast picker,
not a second editing workspace. Search and family filters narrow the catalogue;
hover or keyboard focus reveals a description, a small animated mnemonic, and
the cost class. Hover never restarts or changes the Stage. Clicking applies the
Effect with default values, after which the clip's Entity Detail Panel owns the
exact controls.

The catalogue uses one consistent vocabulary:

- A **family** is the broad visual operation, such as Distort or Color & output.
- A **variant** is one member of that family, such as Ripple or Hue.
- A **preset** writes a named starting bundle into normal parameters. It is not
  a separate hidden implementation.
- A **parameter** is an editable value such as Amount, Radius, Rotation, or
  Opacity.

The applied stack reflects the compiler's real stages: **Transform**, **Distort**,
**Address**, then **Color & output**. Reordering works within a stage. It never
suggests that an output color operation can run before the Pattern renderer or
that Wrap can run before the complete coordinate transform.

Expand an Effect for exact values. Duplicate makes an independent copy; Remove
deletes only that Effect. Neutral values compile away where the operation allows
it. Animated Effect parameters use the same boundary-owned Property animation
mechanism as clip brightness or animation speed, provided adjacent clips retain
the same stable Effect identity and kind.

## Choosing a Transition

Select a boundary in the **Transitions** lane and choose **Change**. Search and
family filters cover Blend, Fade, Wipe, Dissolve, Shape reveal, and Motion.
Hover temporarily seeks the real Stage to the middle of that boundary so the
candidate uses the actual outgoing and incoming Patterns. Leaving the row or
closing the palette restores the saved Transition and playhead.

Clicking a variant applies its defaults. A preset such as **Quick**, **Smooth**,
**East**, **Black**, or **White** writes ordinary parameters that remain editable.
The boundary panel then exposes the legal fields for that variant:

- **Duration** is how long the boundary occupies Show time.
- **Easing** changes temporal progress - for example Linear, Sine in-out, Steps,
  Hold, Back, or a cubic Bezier curve.
- **Edge policy** decides how a spatial boundary treats pixels near its edge.
  Hard and stable dither select one source; Blend can evaluate both inside the
  feather band.
- Family parameters control direction, center, scale, feather, shape, seed,
  anchor, rotation, or other variant-specific geometry.

**Reset to cut** keeps the boundary entity but removes visual transition time.
A separate routing-layout marker at the same boundary remains separate.

## Property animation

Property animation is a change between saved targets, not another kind of
Effect. The destination owns the target. Its incoming boundary may own an
explicit start value, duration, and easing; otherwise the change inherits the
boundary timing.

The current editor exposes Animation speed, Brightness, active public Pattern
controls, moving split position, sample repeat scale, and compatible Effect
parameters. Several properties can change at one boundary without creating
several independent clocks. Enter exact values in Entity Details. A static
override stays in the Clip summary and Entity Details; it does not create a
flat, uninformative sparkline. The Timeline adds a compact sparkline only when
the value actually changes over time, where the curve supports recognition,
comparison, and alignment.

## Similar-looking operations

Several operations can produce a shrinking or fading picture, but they answer
different ownership questions.

| Operation | What actually happens | Choose it when |
| --- | --- | --- |
| Clip **Opacity** Effect | One captured source is multiplied toward the black Show background | One clip should become dimmer or disappear without introducing another source |
| **Fade > Through color** Transition | The outgoing source moves to a chosen color, then the incoming source moves out of that color | The boundary needs an intentional black, white, or custom-color beat |
| **Shape reveal > Shrink outgoing** | A spatial mask selects outgoing versus incoming pixels as the authored shape contracts | The old Scene should disappear through a recognizable geometric aperture |
| **Motion > Content shrink** | The outgoing content's coordinates scale toward an anchor while source ownership changes | The image itself should recede or collapse rather than merely being clipped by a shape |

Opacity is therefore not a crossfade. Shape shrink is not content shrink. The
first changes a mask; the second transforms the sampled content. Their names are
close because the pictures can rhyme, not because the compiler does the same
work.

## Cost: how many Pattern evaluations happen

The compact cost label and **Advanced compiled cost** describe the generated
artifact, not a generic warning attached to a menu item. Let `N` be the number
of output pixels and `E` the pixels inside a blended spatial edge.

- **One-source / parameter** work keeps one Pattern evaluation per pixel. Static
  Effects, Property animation, and Fade through color normally remain `N`.
- A **cheap selector** chooses outgoing or incoming for each pixel, so Wipes,
  stable dither, and hard shape edges also remain `N`.
- A **bounded blend** evaluates both sources only inside the feather band. Its
  work is `N + E`; a narrow edge can be much cheaper than a whole-frame blend.
- A **full two-renderer blend** evaluates outgoing and incoming across the active
  frame. Crossfade and full-blend Motion are `2N` during their transition window.

Effects can still add scalar, trigonometric, square-root, or address work around
that one Pattern evaluation. The advanced disclosure reports those operations,
generated memory, artifact bytes, pixel-count math, and compatibility warnings.
It is the place to compare two visually acceptable choices before sending a
dense Show to a Controller.

## Stock Show companion

The stock catalogue uses small executable examples rather than an embedded
tutorial system. Each Show note names the idea to notice and two safe changes to
try; the sections below explain the corresponding mechanism.

### Clips, Scenes, and boundaries

A Clip chooses a Pattern and its values for a span of time. A Scene groups the
Clips active during that span, while the boundary between Scenes owns the Cut,
Crossfade, Wipe, or other Transition that exchanges them.

### Transitions and Clip values

Transition geometry and Clip values remain separate even when they change over
the same interval. The destination Clip owns its saved brightness, speed, and
Pattern-control targets; the incoming boundary supplies interpolation timing.

### Clip Effects

Effects run after one Clip's Pattern renders. Their order is meaningful within
the compiler's Transform, Distort, Address, and Color & output stages, and the
Effect stack moves with its Clip.

### Portable Zones

Portable Zones divide normalized space, not fixed LED indexes. The same Show can
therefore adapt to another compatible 2D surface while each Zone retains an
independent Pattern instance and clock.

### Building a complete Show

Build an arc from a few legible decisions: establish structure, introduce one
dominant change at a time, then release it. More active Zones do not require
every Clip to change Pattern, Effect, value, and Transition simultaneously.

### Scene-local Main Clips

The Main lane is a mutually exclusive schedule inside one Scene. Its placements
may touch but not overlap, which makes local Cuts predictable and guarantees one
Main source at any instant the lane covers.

### Scene layers and local animation

Overlay lanes add concurrent Clips above Main. A placement's opacity and typed
property tracks control how it contributes during its own local interval; the
track cannot extend beyond the owning Scene.

### Dynamic Zone Layouts

Zone names express ownership and Zone Layouts express geometry. A boundary can
animate a parameter of the current layout or switch to another named layout
without changing which Patterns the Zones own.

### Installation output and physical ranges

An Installation output contract fixes both the map and LED count. Every active
routing layout must assign every output index exactly once, including when one
named Zone owns several non-contiguous ranges.

### Composing a fixed Installation

Use physical groupings that match how people perceive the object: pucks, rows,
arches, panels, or other units. Symmetry in Pattern choice and timing can make
an irregular measured map read as one intentional composition.

### Transform Effects

Translate, Rotate, Scale, and Shear alter the coordinates used to sample a
Pattern. Wrap applies after the complete transform when samples outside the
source domain should re-enter from the opposite edge.

### Distortion Effects

Ripple, Swirl, Bulge, Pixelate, and Kaleidoscope remap sample positions through
non-linear geometry. A diagnostic grid makes the center, radius, amount, and
orientation of that remap visible.

### Color and output Effects

Opacity, Brightness, Hue, Saturation, Contrast, Invert, Threshold, Posterize,
and Color map change rendered color without moving geometry. Use a known RGB
source when comparing operations that can look similar on a black background.

## A practical authoring loop

1. Build the Scene order and zone layout with Cuts.
2. Use Split where a new target must begin inside a Scene.
3. Add clip Effects and set exact parameters in Entity Details.
4. Add Property animation only where a value must change across a boundary.
5. Replace important Cuts with Transitions and preview their real boundaries.
6. Read the compiled cost at the pixel count you intend to run.
7. Inspect the generated code or export `.epe` when the Show is ready.

For the complete Show workflow, output-contract rules, routing, Stage preview,
keyboard controls, export, and Controller compatibility, continue with the
[PXLBLZ Feature Guide](../reference/PXLBLZ Feature Guide.md). The Technical
Reference owns compiler formulas and persisted schemas; this guide owns the
authoring model.

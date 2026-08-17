# Visual effects guide

This guide explains how to animate and combine visual material in a Show.
Three tools do that work, and they own different parts of the timeline:
**Property animation** changes a saved number over time, an **Effect** changes
one Clip, and a **Transition** exchanges two adjacent Clips. Choosing the
right one keeps the timeline readable and the compiled cost predictable.

The fastest way to learn is to open **Shows > Built-in Shows** in Studio:
**Learn** builds the model one example at a time, and **Showcases** collects
visual references you can pick apart. Built-ins use the real editor; changes
live in a session draft, and **Reset** or reload restores the shipped version.

![A production Show with five Zones, compact property bands, Transition junctions, cost disclosure, and Stage coverage.](../screenshots/show-visual-toolkit-overview.png)

## The ownership rule

Start by asking what the change belongs to.

| Class | Owns | Lives in the editor | Use it when |
| --- | --- | --- | --- |
| Property animation | One numeric property and its incoming change | A compact property lane and the owning Entity Detail Panel | A saved value should move from the previous target to the next target |
| Effect | One clip and one visual source | The clip's **Effects** stack | The same source should be transformed, distorted, addressed, or recolored |
| Transition | The junction between two Clips on one Layer | The junction affordance and its compact Details popover | The outgoing and incoming sources must exchange ownership over time |

The ownership is literal: a Clip carries its Effects when it moves or clones,
a junction carries its Transition, and a Property animation's target belongs
to the destination Clip while the incoming junction carries the start,
duration, and easing used to reach it.

Each Zone owns a stack of Layers. Clips on one Layer cannot overlap in time;
Clips on different Layers run concurrently. When a change must begin inside a
Clip, **Split** it — both halves keep sharing one Pattern instance, so the cut
is invisible until you make it mean something.

## Reading the timeline

Clips occupy Layer rows, Transition junctions sit between connected Clips,
and animated values appear as compact sparkline bands below their owner. The
sparkline shows the useful shape of a change; its dots mark authored targets.
Edit exact values in Details rather than dragging the tiny marks.

Selecting an entity opens a modeless **Details** popover attached to it, and
several can stay open for comparison. During a drag they hide, then reopen,
so they never obscure placement.

![A Clip's Entity Detail Panel: exact timing and brightness fields, tabbed Pattern/Place/Effects/Playback sections, Pattern controls, and instance sharing, all beside the surrounding timeline.](../screenshots/show-visual-toolkit-entity-detail.png)

## Choosing an Effect

Select a clip, open **Effects**, and choose **Add**. The palette is a fast
picker: search and family filters narrow the catalogue, hover shows a
description, an animated mnemonic, and the cost class, and clicking applies
defaults that the Entity Detail Panel then owns. The vocabulary is
consistent: a **family** is the broad operation (Distort, Color & output), a
**variant** is one member (Ripple, Hue), a **preset** writes named starting
values into ordinary parameters, and a **parameter** is an editable value.

The applied stack reflects the compiler's real stages — **Transform**,
**Distort**, **Address**, then **Color & output** — and reordering works
within a stage, never across them. Neutral values compile away where the
operation allows it, and animated Effect parameters use the same
boundary-owned mechanism as clip brightness, provided adjacent clips keep the
same Effect identity.

## Choosing a Transition

Select a boundary in the **Transitions** lane and choose **Change**. Search
covers the Blend, Fade, Wipe, Dissolve, Shape reveal, and Motion families,
and hovering a candidate seeks the real Stage to that boundary so you preview
it with the actual outgoing and incoming Patterns. Clicking applies defaults;
presets like **Quick** or **Black** write ordinary editable
parameters. The panel then exposes only that variant's legal fields:

- **Duration**: how long the boundary occupies Show time.
- **Easing**: how progress accelerates (Linear, Sine in-out, Steps, Hold,
  Back, or a cubic Bezier).
- **Edge policy**: what happens near a spatial edge. Hard and stable dither
  pick one source per pixel; Blend evaluates both inside the feather band.
- Family parameters: direction, center, scale, feather, shape, seed, anchor,
  rotation.

**Reset to cut** keeps the junction selectable but removes transition time.

## Property animation

Property animation is a change between saved targets, not another kind of
Effect. The destination owns the target; the incoming boundary may own an
explicit start, duration, and easing, or simply inherit the boundary timing.
Animation speed, Brightness, public Pattern controls, split position, sample
repeat scale, and compatible Effect parameters all animate this way, and
several can change at one boundary without creating separate clocks. The
timeline adds a sparkline only when a value actually changes over time; a
static override stays in the Clip summary instead of drawing a flat line.

## Similar-looking operations

Several operations can produce a shrinking or fading picture. They answer
different ownership questions:

| Operation | What actually happens | Choose it when |
| --- | --- | --- |
| Clip **Opacity** Effect | One captured source is multiplied toward the black Show background | One clip should become dimmer or disappear without introducing another source |
| **Fade > Through color** Transition | The outgoing source moves to a chosen color, then the incoming source moves out of that color | The boundary needs an intentional black, white, or custom-color beat |
| **Shape reveal > Shrink outgoing** | A spatial mask selects outgoing versus incoming pixels as the authored shape contracts | The outgoing Clip should disappear through a recognizable geometric aperture |
| **Motion > Content shrink** | The outgoing content's coordinates scale toward an anchor while source ownership changes | The image itself should recede or collapse rather than merely being clipped by a shape |

Opacity is not a crossfade, and shape shrink is not content shrink: the first
changes a mask, the second transforms the sampled content. The names are
close because the pictures rhyme, not because the compiler does the same work.

## Cost: how many Pattern evaluations happen

The expensive thing in a Show is asking a Pattern for a pixel, so cost is
mostly a question of how many renderers run. Let `N` be the output pixels and
`E` the pixels inside a blended spatial edge.

![Transition cost classes: one renderer per pixel, both renderers inside a feather band, or both renderers everywhere](../images/transition-cost-classes.svg)

- **One-source / parameter** work stays at one evaluation per pixel: static
  Effects, Property animation, and Fade through color remain `N`.
- A **cheap selector** picks outgoing or incoming per pixel: Wipes, stable
  dither, and hard shape edges also remain `N`.
- A **bounded blend** evaluates both sources only inside the feather band:
  `N + E`, and a narrow edge is much cheaper than a whole-frame blend.
- A **full two-renderer blend** pays `2N` for its whole window: Crossfade and
  full-blend Motion.

The Add Effect palette shows broad cost classes while you choose; the compile
bar and its source inventory price the finished artifact, including the maximum
number of creator Pattern copies running simultaneously and the Pattern color
calculations needed by the busiest LED.

## Built-in Show companion

The sections below explain the mechanism behind each Learn lesson and
Showcase reference. Each Show's note names the idea and two safe changes to
try.

### Clips, Cuts, and blank time

A Clip chooses a Pattern and its values for a span of time; a Layer orders
Clips that cannot overlap. The junction between adjacent Clips owns whatever
exchanges them — a Cut occupies no duration but stays selectable so it can
become something else. Time a Layer does not schedule renders black, and that
is an authoring choice, not a gap to repair: a Show can breathe between
phrases. Show End marks where the choreography stops.

### Clip Transform

Clip Transform is one Clip's placement geometry: Position, Rotation, Scale,
and Mirror. It changes where the Clip samples its Pattern without editing
source or allocating another instance, so two Clips sharing one instance can
hold different poses while one clock drives both. Transform applies before
the ordered Effect stack and stays distinct from it.

### Transitions and Clip values

Transition geometry and Clip values stay separate even when they change over
the same interval: the destination Clip owns its saved brightness, speed, and
control targets; the incoming boundary supplies the interpolation timing.

### Clip Effects

Effects run after one Clip's Pattern renders, in the compiler's Transform,
Distort, Address, and Color & output stages, and the stack moves with its
Clip.

### Portable Zones

Portable Zones divide normalized space, not fixed LED indexes, so the same
Show adapts to another compatible 2D surface while each Zone keeps an
independent Pattern instance and clock. The Zone Map authors the Zones
themselves (name, color, membership); the Layouts lane shows which Layout
routes them across each stretch of the ruler.

### Building a complete Show

Build an arc from a few legible decisions: establish structure, introduce one
dominant change at a time, then release it. Vary the junctions — using one
Transition everywhere hides that the choice exists, and where both sides
share a Pattern, a blend has nothing to show while a Dissolve or Wipe does.
End deliberately: give each Zone a release curve on the same schedule, take
it to zero rather than near it, and leave held black before Show End so the
Show finishes instead of stopping.

### Layers and property animation

One Layer is a mutually exclusive schedule; additional Layers composite above
it, and an overlay Clip's Opacity mixes with everything below. A Property
curve animates a value the Clip already owns (Opacity, brightness, a
Transform axis) without adding filler Clips. Curves carry any number of
keyframes — the diamond beside the owning field opens their editor, and each
segment owns its easing. Keyframes hidden by shortening a Clip are preserved,
so lengthening it restores the authored motion.

### Content and Clip Viewport

Content and the Clip Viewport are two different rectangles. Content is
placement geometry: it decides which part of the Pattern is sampled, and
moving it slides different material into view. The Viewport is an aperture:
it decides where on the Stage the Clip may draw at all, and pixels outside it
fall through to the Layer below. Enabling a Viewport frames the Clip's
current bounds, with a Soft edge by default. Both rectangles animate, and
they answer different questions: Content answers "which part of the Pattern,"
the Viewport answers "which part of the Stage."

### Pattern instance lifecycle

A Pattern instance owns private state, a clock, and control values; Clips
only present it. Splitting leaves both halves sharing one instance, so the
junction changes nothing on the Stage; an ordinary duplicate takes a fresh
instance that starts from the Pattern's beginning. An instance's clock runs
only while some Clip presents it, so rejoining a shared instance resumes
where it left off. **Make Pattern Independent** hands a Clip its own instance
with the same authored settings.

### Presentation modes

Presentation changes how one Clip exposes a running Pattern. **Live** shows
every frame; **Freeze** holds the arrival frame; **Strobe** re-captures on a
beat; **Blink** gates visibility. Under all four the instance's clock keeps
running, so when a Freeze ends the Pattern has moved on. **Stutter** is
different in kind: it quantizes the instance's own clock, so every Clip
sharing that instance snaps to the same beat.

### Groups and linked reuse

A Group definition is a reusable phrase of Clips, Layers, and curves with its
own local timeline; an occurrence places the phrase at a time, Zone, and
Layer. Occurrences stay linked — editing the definition changes all of them —
but each materializes fresh Pattern instances, so linked copies repeat the
moves without sharing state. **Make Unique** detaches one; **Ungroup**
dissolves the phrase.

### Aperture shapes and edges

The Viewport aperture has an authored silhouette from a sectioned catalogue —
Geometric, Icons, and Signature (the three cats) — and an edge treatment:
**Hard** cuts, **Soft** feathers, **Stable Dither** trades the ramp for a
fixed texture that survives LED quantization. A silhouette can rotate inside
its axis-aligned frame, and its Mode can flip from admitting the inside to
cutting the silhouette out. Soft is almost always right, especially when the
aperture or its Content moves — a travelling hard edge reads as a rendering
artifact. Shape and edge are placement geometry, exactly like the frame's
position: they change what the Clip may draw without touching Content,
Pattern time, or Effects.

### Changing Zone Layouts

Zone names express ownership; Zone Layouts express geometry. One ruler can
carry a sequence of Layout intervals (full surface, a split, rings) while
Zones keep their names and Pattern instances. Duplicated intervals stay
linked to their source until **Make Unique**. A Layout boundary re-routes
pixels rather than blending them — restating the topology in one atomic step
or sweeping the new geometry across the Stage — and no Pattern instance
restarts when it crosses one. That is what separates changing the Layout from
changing the content.

### Installation output and physical ranges

An Installation contract fixes both the map and LED count, and every active
routing layout must assign every output index exactly once — including when
one named Zone owns several non-contiguous ranges. **301 Installation
Mapping** stages this on the Proscenium arch, wired in the installer's walk
order, which is why its Columns Zone owns two ranges at opposite ends of the
index space: one physical role, two stretches of wire. Selecting a Zone's
pixels and editing its ranges are the same operation, and when coverage
breaks the diagnostics name the exact failure (gap, overlap, or out of range)
until the ranges cover the output exactly once again.

### Composing a fixed Installation

Use physical groupings that match how people perceive the object: pucks,
rows, arches, panels. **302 Installation Composition** plays the whole
Redline stage from one Pattern instance — one render, one clock, one compiled
machine — and lets geometry deal the first difference. Each passage then adds
one tier of voice: placement phase splits the satellites into a four-hue
family for the cost of one add per pixel, translate-under-wrap windows
stagger the frame, a mirrored and a posterized pair join, and two animated
invert pulses flash on scheduled beats. One tier per junction is what keeps a
physical score decipherable; when every group changes at once, correct output
reads as noise.

### Compile, simplify, and deliver

A Show stays editable choreography but publishes as one ordinary Pixelblaze
Pattern. The artifact inventory prices the generated code line by line, and
each Pattern row separates one compiled copy from the source generated for its
Show settings and placements. It also distinguishes configured uses, copies in
the delivered code, timeline placements, and copies active at once. **303
Compile, Simplify, and Deliver** carries one deliberately expensive treatment
so you can price it, remove it, and compare inventories without a heuristic
guess about what you should change.

### Ruthlessly engineered spectacle

**Redline Installation** treats a fixed Stage as five instruments: an
800-pixel hero panel and four 300-pixel targets, scored as 32 bars at
128 BPM. The scale comes from constraint — one shared Pattern instance
evaluates once per output pixel while affine Effects make the targets
counter-rotate, mirror, and answer one another; black provides negative
space, red carries pressure, white marks impact, cyan surfaces between beats.
It is an outer-limit production reference, not a promise that every
Controller can sustain the frame rate at the 2,000-pixel ceiling.

### Transform and Address Effects

Mirror flips the source before the other transforms; Translate, Rotate,
Scale, and Shear then alter the coordinates used to sample the Pattern, and
Wrap applies after the complete transform so samples outside the domain
re-enter from the opposite edge. The reference eases one affine stack's
values continuously between examples rather than switching frames.

### Distortion Effects

Ripple, Swirl, Bulge, Pixelate, and Kaleidoscope remap sample positions
through non-linear geometry. The stained-glass subject bends visibly under
each remap, so center, radius, amount, and orientation stay readable.

### Color Adjustment Effects

Brightness, Hue, Saturation, Contrast, Invert, Threshold, Posterize, and
Color map change rendered color without moving geometry. The reference
establishes the true colors on a long beat, then lets each adjustment
identify itself in one look.

### Compositing and Key Effects

Opacity, Luma Key, Chroma Key, and Vignette decide which of a Clip's pixels
reach the mix, so this reference runs a warm bed underneath keyed subjects.
Each Effect rides the subject that shows it best: grayscale Luma Rings carry
the opacities and Luma Key (the matte is the image itself), DoomFire carries
Chroma Key with its orange body carving out, and the Vignette closes the
whole frame toward black.

### Luma Sources

The Luma Patterns are grayscale key sources — endlessly tiling fields with
one shared control set, built to be keyed, tinted, and layered. The reference
shows each field bare, then brings it alive with a single animated property
chosen for its character: Stripes fattens its Width, Chevron breathes its
Fold, Rings pours through its Spacing, Spiral zooms its winding. The
Compositing and Key reference next door shows what keying these fields
unlocks.

### Blend and Fade Transition reference

Blends mix complete rendered images; fades pass through a color. The
reference runs the junction vocabulary in ascending drama: a bare Cut, one
Crossfade slow enough to study both worlds coexisting, then black and white
Fades at tempo.

### Wipe Transition reference

Wipes move a geometric selector across the junction. One eastward Linear Wipe
runs slow enough to study its edge; the other directions and the patterned
Wipes (split, doors, blinds, clock, checker, grid) pass as quick cuts.

### Dissolve Transition reference

Dissolves distribute the selector across pixels or regions instead of moving
one edge. The pixel dissolve is the slow exemplar; block, coherent-noise, and
soft-threshold differ only in the structure of what crumbles.

### Shape reveal Transition reference

Shape reveals move a signed-distance boundary across the Stage: the shape
defines the boundary, and reveal mode decides whether the incoming image
grows or the outgoing shrinks. Circle demonstrates both modes at study tempo;
the other geometric silhouettes alternate as quick cuts.

### Shape reveal figures reference

The figurative silhouettes — ring, star, crescent, polygon, cloud, and the
three cats, after one slow Heart — use the same construction: one study beat,
then quick cuts.

### Slide Transition reference

Cover, Reveal, and Push move rendered content rather than a selector edge:
Cover moves the incoming picture, Reveal the outgoing one, Push both. One
slow Cover establishes the model before the comparisons run as cuts.

### Zoom and Spin Transition reference

Content grow and Content shrink scale the picture inside its frame; Zoom
scales the frame itself and adds optional rotation. Content grow runs at
study tempo and the zoom and spin presets cut past.

### Property animation reference

Clip-owned tracks animate Pattern speed, a public control, placement
brightness and phase, overlay opacity, and an Effect parameter;
boundary-owned tracks animate the Zone split and sample repeat scale. The
sparklines identify each value's owner on the timeline.

### Easing reference

Easing changes when progress happens, not what the Transition does. Every
example uses the same eastward Wipe, Pattern pair, and duration; only the
curve changes, so acceleration, steps, holds, and overshoot compare directly.

### Aperture shapes reference

**Aperture Shapes: Geometric** holds one subject behind one frame and changes
exactly one thing per passage: each geometric silhouette feathered Soft, the
Rounded box at a wide radius (radius is shape, not edge), then the Ring
across Soft, Hard, and Stable Dither.

### Aperture icons and signature reference

**Aperture Icons & Signature** carries the figurative half over the same
construction, then the two controls the geometric reference leaves out: the
rotated Star (silhouette rotation inside a frame that never turns) and the
Cut-out Cloud (Mode inversion — same boundary, same feather, the silhouette
becomes the hole).

### Zone Layouts reference

Three sibling references hold the complete geometry vocabulary over voices
that never change. **Splits & Checker** hands one Stage to two voices four
ways, including the soft split — the one Layout that blends both neighbours
inside its feather band. **Stripes & Grid** deals four voices into bands and
a 2 × 2 grid, keeping one mostly-dark voice as negative space so the
partitions stay legible. **Radial** routes the pair through rings, a wave,
and a pinwheel; its swept entry into the rings is the one switch in the
family that travels rather than restating the topology in a step. No Pattern
instance restarts at any boundary.

Every reference Show uses its expanded header as a live guide: it names the
current example, explains what changes and what stays constant, and offers a
session-only **Try with Pattern** selector plus **Reset**. The Transition and
Easing references composite their subject over a dim Murmuration backdrop so
black source regions still explain spatial movement; Fades still reach their
named color because the Transition itself authors that field.

## A practical authoring loop

1. Build Clip order, Layers, and Zone Layout intervals with Cuts.
2. Use Split where a new target must begin inside a Clip.
3. Add clip Effects and set exact parameters in Entity Details.
4. Add Property animation only where a value must change across a boundary.
5. Replace important Cuts with Transitions and preview their real boundaries.
6. Read the compiled cost at the pixel count you intend to run.
7. Inspect the generated code or export `.epe` when the Show is ready.

For the complete Show workflow — output contracts, routing, Stage preview,
export, and Controller actions — continue with the
[PXLBLZ Feature Guide](../reference/PXLBLZ Feature Guide.md). For what the
compiler does with these choices, and why some of them are nearly free, read
[Inside the Show Compiler](Inside the Show compiler.md). The Technical
Reference owns compiler formulas and persisted schemas; this guide owns the
authoring model.

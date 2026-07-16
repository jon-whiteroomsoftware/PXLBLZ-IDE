# Stock Show catalogue build packet

Status: implementation-ready. The Show-note disclosure was approved on
2026-07-16.

Issue: #363

## Outcome

The first stock Show catalogue teaches the smallest useful Show vocabulary,
then demonstrates richer composition without turning the catalogue into an
embedded tutorial system. Ten curriculum Shows and three effect showcases give
people enough examples to learn from, copy, and modify.

The catalogue has three jobs:

1. Teach the concepts required to make a useful Show.
2. Demonstrate what the compiler and editor can do with believable content.
3. Supply starting points that users can clone into their own work.

The companion **Visual Effects Guide** explains mechanics. A Show note
orients the viewer, names the important thing to notice, suggests two small
experiments, and links to the relevant guide heading. The Show itself remains
the executable example.

## Catalogue structure

```text
Learn
  100 - Foundations
    101 Clips and Crossfade
    102 Transitions and Values
    103 Effects
    104 Portable Zones
    105 Built from Basics
  200 - Composition
    201 Scene-local Cuts
    202 Layers and Local Animation
    203 Dynamic Zone Layouts
    204 Installation Mapping
    205 Installation Composition
Showcases
  Transform Effects
  Distortion Effects
  Color and Output Effects
```

This hierarchy assumes #426 supplies a recursive entity tree. Catalogue size is
not a reason to omit useful examples. The same containment problem will occur
in user libraries.

## Shared fixture rules

### Technical defaults

- Foundation and portable composition Shows use a Portable 2D output contract,
  the `plane` reference map, and 2,000 Preview pixels unless a packet says
  otherwise.
- Installation Shows use the fixed 160-pixel `sunflower-pucks-2d` map. Its
  coordinate array is measured hardware geometry, not a scalable preview map.
- Every Pattern reference is a stock reference. A stock Show must compile
  without user-owned content.
- Pattern speed is deliberately conservative. Start between `0.25` and `0.55`
  unless the packet gives an exact control target.
- Scene and placement times are authored in whole seconds in the packet and
  stored as milliseconds in the model.
- Boundary Transitions remain boundary-owned entities. Scene-local animation
  stays in `composition.propertyTracks`.
- Main placements never overlap. Overlay placements may overlap Main and other
  overlay layers, but placements on the same overlay layer remain mutually
  exclusive.
- Showcase Scene boundaries use Cuts. The effect, not a Transition, must be the
  visible change under study.

### Visual budget

- Each passage gets one dominant visual change. A new Transition, a moving
  property, a new Zone arrangement, and a busy source Pattern do not all debut
  at the same instant.
- Energy comes from rhythm, contrast, and progression. Do not obtain it by
  simultaneously maximizing speed, distortion, color cycling, overlays, and
  Zone motion.
- Calm source Patterns establish structure. More detailed Patterns arrive only
  after the viewer can identify what the Show is teaching.
- A composition should still read when paused at an arbitrary frame.
- The Stage must use enough Preview pixels to make edges and spatial effects
  legible. Portable 2D fixtures therefore use 2,000 Preview pixels by default.

### Show note shape

Every note contains these fields:

- curriculum or showcase label;
- title;
- two-sentence purpose;
- one **Notice** statement;
- exactly two **Try this** actions;
- one guide target expressed as a document id plus heading slug.

Tutorial Shows open their note on first visit. The viewer may collapse it and
the choice persists per Show. Showcase notes default closed after the first
showcase has been opened. Notes are metadata owned by the stock catalogue, not
part of the compiled Pixelblaze artifact.

### Human-review capture set

Each Show needs four review captures before #363 is complete:

1. Timeline at Fit with the note open.
2. Timeline at Fit with the note closed.
3. Stage at one representative hold frame.
4. Stage during the most important Transition or animation.

Also verify playback from start to finish, deterministic seek at each Scene
boundary, Pause state, compiler success, artifact-size readout, and no console
errors. Installation Shows additionally need a Zone-overlay capture proving
their physical ranges.

## Learn 100: Foundations

### 101 Clips and Crossfade

**Purpose.** Establish the minimum useful Show: two Clips arranged in time and
one boundary-owned Crossfade. Nothing else competes for attention.

**Fixture**

- Scene holds: 16 seconds; timeline duration: 19 seconds including the
  Crossfade.
- Zone Layout: one Zone, `Main`, covering the complete Portable output.
- Scene `Water`, 0-8 seconds: `Caustics`, time scale `0.35`, controls
  `speed=0.30`, `density=0.36`, `sharpness=0.30`, `tint=0.52`.
- Scene `Mechanism`, 8-16 seconds: `ClockworkIris`, time scale `0.35`, controls
  `speed=0.28`, `aperture=0.58`, `teeth=0.45`, `color=0.10`.
- Boundary at 8 seconds: Crossfade, 3 seconds, sine in-out.
- No Effects, property transitions, local composition, or routing changes.

**Energy curve.** Slow organic drift becomes measured mechanical motion. The
Crossfade is easy to see because the Patterns differ in geometry and palette
without either being agitated.

**Note copy**

- Purpose: `Two Patterns become one timed composition. Each Clip owns what
  plays; the boundary between them owns how the picture changes.`
- Notice: `The Crossfade is a separate timeline entity, not a property hidden
  inside either Clip.`
- Try this: `Shorten the Crossfade from 3.0 s to 1.0 s.`
- Try this: `Replace Clockwork Iris with a Pattern that moves differently.`
- Guide: `show-visual-toolkit#clips-scenes-and-boundaries`.

**Acceptance focus.** A new viewer can identify two Clips, their durations, and
the Crossfade without opening a detail panel.

### 102 Transitions and Values

**Purpose.** Add Transition variety and show that a destination Clip can have a
different value from the Clip before it. This introduces value changes without
opening the Scene editor.

**Fixture**

- Duration: 21 seconds; three 7-second Scenes.
- `Sweep`: `EasedSweep`, time scale `0.40`, brightness `0.70`.
- `Compass`: `CompassRose`, time scale `0.32`, brightness `1.00`, controls
  `speed=0.30`, `points=0.42`, `sweep=0.62`, `hue=0.58`.
- `Bloom`: `TopographicBloom`, time scale `0.30`, brightness `0.82`, controls
  `speed=0.28`, `layers=0.82`, `spacing=0.48`, `color=0.30`.
- Sweep -> Compass: linear Wipe, left to right, 1.2 seconds, cubic in-out,
  dithered edge. Brightness transitions from `0.70` to `1.00` over the same
  boundary.
- Compass -> Bloom: Fade through `#10131a`, 1.4 seconds, sine in-out. Time scale
  transitions from `0.32` to `0.30`; the small change exists to make the
  property lane visible without producing a speed lurch.
- No Effects, Zones, or local composition.

**Energy curve.** A simple sweep establishes direction, the compass adds crisp
structure, and the bloom resolves into slower organic contours.

**Note copy**

- Purpose: `Boundaries can change the picture and interpolate Clip values at
  the same time. This Show uses two Transition families and two compact value
  ramps.`
- Notice: `Brightness and speed belong to the destination Clip; the boundary
  only describes how the old value reaches the new one.`
- Try this: `Reverse the Wipe direction.`
- Try this: `Change Bloom brightness to 0.45 and compare the ramp.`
- Guide: `show-visual-toolkit#transitions-and-clip-values`.

**Acceptance focus.** Sparkline lanes communicate the value changes without
requiring the detail panel, and the two boundary styles remain visually
distinct.

### 103 Effects

**Purpose.** Demonstrate that Effects alter one Clip after its Pattern renders.
The same diagnostic source stays in every Scene so the Effect is the only
meaningful variable.

**Fixture**

- Duration: 24 seconds; four 6-second Scenes.
- All Scenes use `TestPattern2D`, time scale `0.35`, brightness `0.90`.
- `Reference`: no Effects.
- `Frame`: Translate `x=0.12`, `y=-0.08`, then Scale `x=0.78`, `y=0.78`.
- `Ripple`: Ripple `amount=0.32`, `frequency=4.0`, `phase=0.0`, centered at
  `0.5, 0.5`.
- `Color`: Hue `turns=0.18`, then Contrast `contrast=0.72`.
- All boundaries: Cut.

**Energy curve.** The breathing diagnostic Pattern supplies gentle motion;
each Cut exposes one new class of post-render change.

**Note copy**

- Purpose: `Effects transform a Clip after its Pattern renders. Reusing one
  known Pattern makes operation order and spatial change easier to see.`
- Notice: `The Reference Scene and every effected Scene share the same Pattern.`
- Try this: `Swap the order of Translate and Scale.`
- Try this: `Set Ripple amount to zero, then bring it back gradually.`
- Guide: `show-visual-toolkit#clip-effects`.

**Acceptance focus.** The Effect activity row names active Effects, empty Effect
groups do not appear, and Test Pattern orientation remains recognizable.

### 104 Portable Zones

**Purpose.** Introduce two resolution-independent logical Zones and independent
Pattern instances. Keep routing static so the viewer learns ownership before
layout animation.

**Fixture**

- Duration: 16 seconds; two 8-second Scenes.
- Zone Layout `Side by side`: vertical Split at `0.50`.
- Zones: `Left` and `Right`, each with nominal 1,000 Preview pixels.
- `Separate`: Left `EasedSweep` at time scale `0.42`; Right `ClockworkIris` at
  time scale `0.30`, `aperture=0.62`, `color=0.10`.
- `Exchange`: Left `ClockworkIris` with the same targets; Right `EasedSweep`.
- Boundary: Crossfade, 1.2 seconds, sine in-out.
- No Effects or local composition.

**Energy curve.** The first Scene makes independence obvious; the exchange
proves that Zone identity and Pattern identity are separate.

**Note copy**

- Purpose: `Portable Zones divide a normalized surface without depending on a
  specific LED count. Each Zone can run its own Pattern instance and clock.`
- Notice: `The Zone overlay stays fixed while the two Patterns exchange sides.`
- Try this: `Turn off one Zone in the Stage preview.`
- Try this: `Move the Split from 0.50 to 0.35.`
- Guide: `show-visual-toolkit#portable-zones`.

**Acceptance focus.** Zone overlay and Pattern rendering align at 2,000 Preview
pixels, and toggling one Zone does not pause playback or resize the Stage.

### 105 Built from Basics

**Purpose.** Combine the 100-level vocabulary into a polished composition. It
is the first example intended to feel like a small performance rather than a
single UI lesson.

**Fixture**

- Reference map: `wide`; Preview pixels: 2,000.
- Duration: 30 seconds; three 10-second Scenes.
- Zone Layout `Three bands`: horizontal Stripes with Zones `Sky`, `Signal`, and
  `Ground`.
- `Gather`: Sky `Caustics` (`speed=0.25`), Signal `EasedSweep`, Ground
  `ClockworkIris` (`speed=0.24`). No Effects.
- `Drive`: Sky `NeonCircuitBoard` (`speed=0.30`, `density=0.10`), Signal
  `CompassRose` (`speed=0.26`, `sweep=0.72`), Ground `ShapeShifter`
  (`speed=0.24`, `shape=0.12`). Apply one shared Hue offset of `0.08` to the
  Signal Clip only.
- `Resolve`: Sky `TopographicBloom` (`speed=0.24`), Signal `EasedSweep`, Ground
  `Caustics` (`speed=0.22`). Apply Scale `0.88, 0.88` to Ground only.
- Gather -> Drive: directional Wipe, 1.4 seconds, left to right, cubic in-out.
- Drive -> Resolve: Crossfade, 2.0 seconds, sine in-out.
- Brightness targets by passage: `0.75 -> 1.00 -> 0.78`, interpolated during
  the two boundaries.
- No Scene-local composition; this Show uses only concepts from 101-104.

**Energy curve.** Establish, accelerate, then breathe. The middle passage is
the highest energy, but each band retains a different visual role.

**Note copy**

- Purpose: `A complete short Show can come from Clips, two Transitions, a few
  Effects, and one static Zone Layout. Complexity comes from sequencing simple
  decisions rather than maximizing every control.`
- Notice: `Each passage has one dominant change even though three Zones are
  active.`
- Try this: `Mute the Signal Zone and watch how the composition loses its beat.`
- Try this: `Replace the final Crossfade with a Wipe.`
- Guide: `show-visual-toolkit#building-a-complete-show`.

**Acceptance focus.** The Show feels energetic without visual noise and remains
legible at Fit with all three Zone rows expanded.

## Learn 200: Composition

### 201 Scene-local Cuts

**Purpose.** Show that one global Scene can contain a timed Main schedule. This
is the bridge from contiguous global Scenes to sub-Scene editing.

**Fixture**

- Duration: one 18-second Scene named `Three beats`.
- One Zone, `Main`.
- Scene composition Main placements:
  - `EasedSweep`, 0-6 seconds, time scale `0.42`.
  - `ClockworkIris`, 6-12 seconds, time scale `0.30`, `aperture=0.58`.
  - `Caustics`, 12-18 seconds, time scale `0.30`, `speed=0.26`.
- No overlay layers, property tracks, Effects, or global boundary Transition.
- Each placement uses its own Pattern instance and starts fresh.

**Energy curve.** Direction, structure, then drift. The Cuts are crisp enough
to make the Main lane's schedule obvious.

**Note copy**

- Purpose: `A Scene can contain its own sequence of Main Clips. The global
  timeline stays simple while the Scene editor carries the internal beats.`
- Notice: `The three local Clips are mutually exclusive and completely cover
  the Scene.`
- Try this: `Drag the second Cut one second earlier.`
- Try this: `Change the final Clip to continue its clock instead of restarting.`
- Guide: `show-visual-toolkit#scene-local-main-clips`.

**Acceptance focus.** The read-only Scene X-ray exposes all three internal Cuts,
and the Scene editor can scrub and play only this 18-second Scene.

### 202 Layers and Local Animation

**Purpose.** Add one overlay and one Scene-local property track. The example is
deliberately sparse so layering and opacity animation remain separable.

**Fixture**

- Duration: one 16-second Scene named `Signal over water`.
- Main placement: `Caustics`, 0-16 seconds, time scale `0.28`, `speed=0.24`,
  `sharpness=0.28`.
- Overlay layer `Signal`, visually above Main.
- Overlay placement: `SignalMandala`, 3-13 seconds, time scale `0.28`, placement
  opacity `0.0`, Scale `0.76, 0.76`, Hue `0.08`.
- Opacity track on the overlay placement:
  - 3.0 seconds: `0.0`, sine in-out.
  - 5.0 seconds: `0.72`, sine in-out.
  - 11.0 seconds: `0.72`, sine in-out.
  - 13.0 seconds: `0.0`, sine in-out.
- No second overlay and no global boundary Transition.

**Energy curve.** A stable background makes room for one centered signal to
arrive, hold, and leave.

**Note copy**

- Purpose: `Overlay layers let more than one Pattern contribute to a Scene.
  Local keyframes animate a typed property without creating more global Scenes.`
- Notice: `The overlay exists only from 3-13 seconds, while its opacity controls
  how it enters and leaves that interval.`
- Try this: `Raise the peak opacity from 0.72 to 1.0.`
- Try this: `Drag the overlay into a new layer and compare the stacking order.`
- Guide: `show-visual-toolkit#scene-layers-and-local-animation`.

**Acceptance focus.** The sparkline uses literal normalized height with inset
padding, the four points are easy to select, and the read-only X-ray preserves
their internal timing references.

### 203 Dynamic Zone Layouts

**Purpose.** Demonstrate that the same named Zones can use multiple layouts and
that layout parameters can move at a boundary.

**Fixture**

- Duration: 24 seconds; three 8-second Scenes.
- Zones: `A` and `B`, each nominally 1,000 Preview pixels.
- Layout `Vertical`: split on X. Layout `Horizontal`: split on Y.
- `Narrow A`: Vertical layout, split position `0.35`; A `ClockworkIris`, B
  `Caustics`.
- `Wide A`: Vertical layout, split position `0.65`; same Pattern instances
  continue. Animate split position from `0.35` to `0.65` for 1.8 seconds with
  sine in-out.
- `Turn`: switch to Horizontal layout at the second boundary; A
  `ClockworkIris`, B `Caustics` continue. Use an instantaneous routing boundary
  plus a 1.2-second Crossfade for the picture.
- No Clip Effects or local composition.

**Energy curve.** Content remains stable while the layout first breathes and
then changes axis.

**Note copy**

- Purpose: `Zone names describe ownership; Zone Layouts describe geometry. The
  same two Zones can move or adopt a different arrangement without replacing
  their Patterns.`
- Notice: `The first boundary animates one layout parameter; the second chooses
  another named layout.`
- Try this: `Change the first split targets to 0.20 and 0.80.`
- Try this: `Toggle the Zone overlay before the Horizontal switch.`
- Guide: `show-visual-toolkit#dynamic-zone-layouts`.

**Acceptance focus.** Zone overlays make both changes unambiguous, Pattern
clocks continue across boundaries, and no transient gap or double ownership
appears.

### 204 Installation Mapping

**Purpose.** Introduce fixed physical output, measured custom geometry, and
explicit LED ranges without adding composition complexity.

**Fixture**

- Installation output: `sunflower-pucks-2d`, exactly 160 pixels.
- Duration: one 14-second Scene named `Two banks`.
- Zones:
  - `Left bank`: range 0-79.
  - `Right bank`: range 80-159.
- Left bank: `EasedSweep`, time scale `0.38`.
- Right bank: `ClockworkIris`, time scale `0.28`, `aperture=0.62`, `color=0.10`.
- No Transition, Effects, local composition, or routing switch.

**Energy curve.** A directional sweep contrasts with a centered mechanical
Pattern, making the two physical banks immediately distinct.

**Note copy**

- Purpose: `An Installation Show promises one fixed map and LED count. Physical
  ranges assign measured LEDs to named Zones.`
- Notice: `The two 80-pixel banks come from the custom map's actual index order,
  not a normalized left/right split.`
- Try this: `Turn on the Zone overlay and compare it with the physical ranges.`
- Try this: `Solo the Right bank without pausing playback.`
- Guide: `show-visual-toolkit#installation-output-and-physical-ranges`.

**Acceptance focus.** Coverage health reports all 160 pixels exactly once, the
Zone block is visible because there are multiple Zones, and compilation retains
the fixed output contract.

### 205 Installation Composition

**Purpose.** Finish the curriculum with a production-shaped fixed installation:
non-contiguous physical groups, multiple Patterns, controlled Effects, and a
clear three-passage arc.

**Fixture**

- Installation output: `sunflower-pucks-2d`, exactly 160 pixels.
- Duration: 30 seconds; three 10-second Scenes.
- Four 40-pixel Zones, each spanning a pair of physical pucks:
  - `Top pair`: ranges 0-19 and 80-99.
  - `Upper middle`: ranges 20-39 and 100-119.
  - `Lower middle`: ranges 40-59 and 120-139.
  - `Bottom pair`: ranges 60-79 and 140-159.
- `Wake`: Top `EasedSweep`; Upper middle `Caustics`; Lower middle `Caustics`;
  Bottom `EasedSweep`. Time scales `0.35`, brightness `0.72`. No Effects.
- `Answer`: Top `CompassRose`; Upper middle `ClockworkIris`; Lower middle
  `ClockworkIris`; Bottom `CompassRose`. Time scales `0.30`, brightness `1.0`.
  Apply opposing Hue offsets `+0.08` and `-0.08` to the two middle Clips.
- `Settle`: Top `TopographicBloom`; Upper middle `Caustics`; Lower middle
  `Caustics`; Bottom `TopographicBloom`. Time scales `0.26`, brightness `0.78`.
  Apply Scale `0.86, 0.86` to Top and Bottom.
- Wake -> Answer: bottom-to-top Wipe, 1.5 seconds, cubic in-out, dither edge.
- Answer -> Settle: Crossfade, 2.0 seconds, sine in-out.
- Brightness transitions over both boundaries. No Scene-local overlays; the
  teaching focus is physical composition, not every available feature.

**Energy curve.** Symmetric wake, crisp call-and-response, soft release. Mirrored
Pattern choices make the irregular custom map feel intentional.

**Note copy**

- Purpose: `A fixed installation can group non-contiguous LEDs into meaningful
  physical units and choreograph them as one composition.`
- Notice: `Each row-pair Zone owns two separate index ranges while the compiler
  still guarantees complete, non-overlapping coverage.`
- Try this: `Solo one row pair and inspect its two physical ranges.`
- Try this: `Reverse the first Wipe direction.`
- Guide: `show-visual-toolkit#composing-a-fixed-installation`.

**Acceptance focus.** All eight pucks render, each Zone overlay outlines two
physical pucks, and the most energetic Scene remains readable at 160 pixels.

## Effect showcases

Showcases are references, not curriculum prerequisites. They deliberately use
`TestPattern2D` because its known corner colors, axes, and orbiting white marker
make spatial and color changes diagnosable. Each Scene uses time scale `0.35`,
brightness `0.90`, and a Cut boundary.

### Transform Effects

Duration: 30 seconds; six 5-second Scenes.

| Scene | Ordered Effects |
| --- | --- |
| Reference | none |
| Translate | Translate `x=0.18`, `y=-0.12` |
| Rotate | Rotate `turns=0.125` |
| Scale | Scale `x=0.68`, `y=0.82` |
| Shear | Shear `x=0.28`, `y=0.0` |
| Wrap | Translate `x=0.28`, `y=0.0`; Wrap |

Note purpose: `The same diagnostic Pattern passes through each affine Effect in
isolation. Cuts make before-and-after comparison immediate.`

Notice: `Wrap becomes useful after a transform moves samples outside the source
domain.`

Try this: `Change Rotate from 0.125 to 0.25 turns.` Try this: `Move Wrap before
Translate and compare the result.`

Guide: `show-visual-toolkit#transform-effects`.

### Distortion Effects

Duration: 30 seconds; six 5-second Scenes.

| Scene | Ordered Effects |
| --- | --- |
| Reference | none |
| Ripple | Ripple `amount=0.32`, `frequency=4`, `phase=0`, center `0.5,0.5` |
| Swirl | Swirl `amount=0.36`, `radius=0.72`, center `0.5,0.5` |
| Bulge | Bulge `amount=0.42`, `radius=0.58`, center `0.5,0.5` |
| Pixelate | Pixelate `amount=0.85`, `columns=12`, `rows=12` |
| Kaleidoscope | Kaleidoscope `amount=1`, `segments=6`, `rotation=0.0`, center `0.5,0.5` |

Note purpose: `Distortions remap where a Clip samples its Pattern. A known grid
reveals the shape, center, and strength of each remap.`

Notice: `The orbiting white marker makes temporal continuity visible even while
space is distorted.`

Try this: `Move the Swirl center to 0.25, 0.50.` Try this: `Reduce Kaleidoscope
segments from 6 to 3.`

Guide: `show-visual-toolkit#distortion-effects`.

### Color and Output Effects

Duration: 40 seconds; ten 4-second Scenes.

| Scene | Ordered Effects |
| --- | --- |
| Reference | none |
| Opacity | Opacity `0.45` |
| Brightness | Brightness `0.45` |
| Hue | Hue `turns=0.25` |
| Saturation | Saturation `0.25` |
| Contrast | Contrast `0.72` |
| Invert | Invert `amount=1.0` |
| Threshold | Threshold `threshold=0.52`, `amount=1.0` |
| Posterize | Posterize `levels=4`, `amount=1.0` |
| Color map | Color map `amount=1.0`, shadow `#130c2b`, highlight `#4fffe1` |

Note purpose: `Color and output Effects change a rendered Clip without changing
its geometry. Known RGB corners make each operation easier to identify.`

Notice: `Opacity and brightness look related on black, but opacity also matters
when the Clip is layered over another image.`

Try this: `Compare Opacity and Brightness over a temporary overlay.` Try this:
`Change Posterize from 4 levels to 2.`

Guide: `show-visual-toolkit#color-and-output-effects`.

## Implementation order

The work should remain shippable after each increment:

1. Add Show-note metadata and the approved disclosure treatment. Add guide
   heading anchors and link resolution.
2. Replace the six existing stock fixtures with 101-105. This establishes the
   naming, metadata, test helpers, and Portable fixture idiom.
3. Add 201 and 202 with Scene composition and property-track coverage.
4. Add 203 with layout-switch and routing-property coverage.
5. Add 204 and 205 with fixed-map and multi-range coverage.
6. Add the three effect showcases from a data-driven effect matrix.
7. Add catalogue hierarchy through #426 or, if #426 is not yet available,
   preserve explicit `collection`, `level`, and `order` metadata so the final
   tree requires no fixture rewrite.
8. Run the complete capture and human-review checklist.

## Automated coverage

At minimum, tests must prove:

- all stock ids, names, collection paths, and order values are unique;
- every Pattern reference resolves to a stock Pattern;
- every Show normalizes and compiles;
- Portable Shows declare a Portable 2D output contract and no fixed ranges;
- Installation Shows declare the 160-pixel fixed output contract and cover
  exactly 0-159 once per routing layout;
- every note has purpose, Notice, two Try-this actions, and a valid guide target;
- every Scene has at least one active Main Clip in every Zone;
- Main placements do not overlap and remain inside their Scene;
- property tracks have sorted, in-range keyframes and typed targets;
- showcase matrices cover every currently supported Effect kind exactly once,
  except `wrap`, which intentionally follows Translate;
- deterministic seek at every Scene boundary matches linear playback;
- every compiled artifact remains below the Pixelblaze per-pattern artifact
  limit shown by the editor.

## Approved Show-note disclosure

The approved treatment is Variant A with a complete collapsed state:

- A built-in tutorial opens with the full-width note directly below the Show
  header. Its placement makes ownership unambiguous and leaves enough width for
  readable prose and Try-this prompts.
- Collapsing the note removes the entire note row and returns all vertical space
  to the Timeline.
- A compact `101 Guide` control remains beside the Show identity in the existing
  top toolbar. It reopens the note without adding another row. The control uses
  the lesson number and `Guide`, not a generic `About` label that could be
  mistaken for application-wide help.
- Opening another built-in tutorial supplies that tutorial's note and starts
  expanded on first visit. Subsequent open/closed state persists per Show.

Variant B was rejected because its trigger and floating layer felt physically
detached from the Show. Variant C was rejected because it competes with the
library hierarchy, constrains the copy, and becomes unstable as different notes
change height.

Prototype URL:

`http://localhost:5174/PXLBLZ-IDE/?prototype=timeline-dual&study=show-notes&variant=A&round=final&scope=show&fixture=atrium`

This packet contains no remaining product-definition blocker to building the
initial catalogue.

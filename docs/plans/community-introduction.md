# Introducing PXLBLZ-IDE to the Pixelblaze community

PXLBLZ-IDE should be introduced by showing that existing Patterns have become
reusable material: they can be choreographed across time and physical space,
adapted to real hardware, and augmented with inputs and power behavior without
rewriting their source. **Shows are the centerpiece**, Controller-aware
augmentation is the second act, and the editor/preview/compiler work is the
evidence that none of this is a mockup.

This is a community introduction, not an advertising campaign. The useful form
is a concise first-person post surrounded by screenshots and short videos that
make each claim obvious before the prose explains it. It should have two clear
depths: the main post shows what became possible; an optional second section or
first author comment explains why the implementation is interesting.

## Two layers, in that order

**Layer 1 — what a person can make.** Lead with motion, zones, timing, Pattern
controls, hardware inputs, and visible power behavior. Use ordinary language.
The reader should understand why the project is exciting without knowing what
alpha-renaming, fixed-point emission, or routing representation means.

**Layer 2 — how it works.** Put this under **For the technically curious** at the
end of a forum post, or publish it as the first author comment where long posts
benefit from a clean main body. This is for the smaller audience who will care
deeply that Shows become ordinary Pixelblaze Patterns, seeking replays state,
transitions have different renderer costs, and hardware augmentation is
inspectable source generation rather than a parallel runtime.

Do not alternate between the layers paragraph by paragraph. The main post loses
momentum when every visual claim immediately pays an implementation tax, while
the technical material becomes more impressive when it can build one coherent
model of its own.

## The story in four beats

1. **This stopped being merely a nicer editor.** PXLBLZ v1 already had a good
   editor, hardware-faithful preview, reusable libraries, and tree-shaken
   Controller-ready output. Those remain foundations, not the headline.
2. **Patterns are now ingredients.** A Show composes existing Patterns across a
   timeline, zones, transitions, routing, and shared property automation, then
   compiles the result into one ordinary Pixelblaze Pattern.
3. **The installation can reshape the Pattern without forking it.** Controller
   profiles describe zones, hardware inputs, transforms, and power intent. The
   pass engine generates inspectable code around the original Pattern.
4. **Then reveal the machinery to readers who ask.** Fast/Precise preview, real
   map geometry, deterministic replay, Controller compilation, artifact
   inspection, and live telemetry explain why the visible results hold together.

The sentence worth repeating is:

> PXLBLZ turns a Pixelblaze Pattern from a finished object into reusable material.

## Long-form community post

### PXLBLZ-IDE stopped being just an editor

I have been rebuilding PXLBLZ-IDE over the last few weeks, and somewhere along
the way it stopped being “a nicer place to edit Pixelblaze Patterns.” That was
the first version: good Monaco editing, reusable libraries, tree-shaken output,
and a preview that could expose fixed-point problems before I walked over to the
hardware. Useful things. Still an editor.

The current version is much stranger and, I think, much more interesting.

The big idea is that an existing Pattern is no longer necessarily the finished
thing. It can be material. PXLBLZ can place it on a timeline, run it across one
or several zones, change the coordinate space it sees, automate its public
sliders, alter its private clock, transition it into another Pattern, and then
compile the entire result into one normal Pixelblaze Pattern that runs on the
Controller with no browser attached.

The centerpiece is **Shows**.

A Show has scenes, zone rows, Pattern cells, and real boundary objects between
scenes. A boundary can be a cut, crossfade, wipe, dither, spatial portal, or a
routing change. Time, brightness, and exported Pattern sliders all use the same
transition model: start value, destination value, duration, and easing.

That means I can let a Pattern run normally, ease its private time down to an
exact pause, hold it there, ramp one of its own sliders while it is frozen, then
bring time back or transition into something else. I can split the scene at any
point, continue the same hidden Pattern state across the split, or deliberately
restart it for a stutter. The timeline is proportional and zoomable, and seeking
rebuilds state by replaying the actual Pattern rather than showing an
approximation.

Zones are not just masks. A Pattern can see a zone as its own normalized canvas,
repeat across several physical ranges, span zones as one domain, or start at a
different time offset. Named routing layouts can reassign the same physical
pixels later in the Show without resetting Pattern state. A real 2D or 3D map can
be the Stage, so the preview is the installation rather than a row of anonymous
strips.

At the end I can preview the whole thing, inspect it, push it, or export it as one
Pattern. It is not a video being streamed from my desktop. I can close the
browser and the little Pixelblaze keeps running the Show by itself.

The same non-destructive idea now reaches into hardware.

A Controller profile can describe physical zones, potentiometers or buttons,
and power assumptions. A hardware input can drive a Pattern slider, function, or
variable without editing the original Pattern. That means the same shared
Pattern can remain clean while one physical installation gains a knob, a button,
or installation-specific brightness behavior.

Power management has also become something I can see and tune instead of a note
in a calculator. I can set a cap, watch recent and since-start output estimates,
see the estimated draw change with the Controller's live brightness and pixel
count, and adjust the running limit while watching the lights respond. It is
modeled output rather than an ammeter, and the Controller's own brightness limit
remains the final physical control.

There is a lot underneath this, but those are supporting systems. The thing I
most want to show is a Pattern being pushed far beyond its original shape
without the original source becoming a forked pile of installation-specific
edits.

I will post a few short videos because this is lighting software and paragraphs
have a fairly serious brightness limit. The first will be one Pattern moving
through time automation and several zones; the second will show a complete
transition/routing sequence on a mapped Stage; the third will use a physical
input and live power cap on a Controller.

PXLBLZ-IDE 2.0 is still in active development. The source is at
[github.com/jon-whiteroomsoftware/PXLBLZ-IDE](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE).
I will add the public v2 app link when this development line becomes the deployed
release.

## Technical follow-up / first author comment

### For the technically curious

The unusual part of Shows is that there is no Show runtime on the Controller.
PXLBLZ parses the member Patterns, alpha-renames their globals and functions,
isolates the state that must be independent, and generates an outer scheduler
and renderer. Compatible continued cells reuse one member and its private clock;
a Restart creates a new member identity. The output is flat, inspectable
Pixelblaze source compiled by the normal Controller compiler.

The transition labels also correspond to materially different execution
policies. A parameter ramp keeps one Pattern renderer active. A wipe or stable
dither advances both clocks when needed but chooses one renderer per pixel. A
crossfade evaluates two renderers during the transition window. A true feathered
portal evaluates both only inside the band. The compiler reports those policies
instead of collapsing them into one vague “transition cost.”

Seeking cannot assign an arbitrary timestamp because a Pattern may mutate globals
inside `beforeRender` or even `render`. PXLBLZ creates a fresh Fast runtime with
the Show seed and replays every fixed 60 Hz step from time zero, including
render-side mutation, while skipping intermediate paints. Replay yields in
cooperative chunks and newer seeks cancel older ones. There is deliberately no
checkpoint cache, downsampling, or approximate timestep in the first version.

Zones virtualize the Pattern's domain. The outer renderer maps physical pixel
ranges into zone-local index and `pixelCount`, optionally spans adjacent zones as
one canvas, or repeats the same member over separately normalized domains.
Named routing layouts can change those physical assignments at a boundary while
the member's time and state continue. The Stage is separate: it is the map used
to present and spatially operate on the installation, not another name for
routing.

Hardware augmentation uses the same general pass engine rather than editing
source or introducing a device-side plugin system. Ordered recipes can inject
frame work, intercept supported colour outputs, bind an input to a Pattern
target, or add an exact-dimensional renderer adapter. The generated source,
applied passes, call-site counts, warnings, and rough cost are inspectable. The
original Pattern remains the authored source of truth.

The preview has two numeric products from one bundle. Fast mode runs the flat
artifact with float64 math; Precise mode runs a 16.16 re-emit that models int32
wrapping, fixed-point multiplication/division, and quantized built-in boundaries.
Both use the same map and render-selection rules, while only plain Pixelblaze
source ever crosses to hardware.

Maps follow a similar separation. `sample` is the coordinate the Pattern sees;
`pos` is where the preview draws the LED. A generated physical geometry can
therefore stay fixed while Strand, Surface, or Spatial coordinate views change
the domain sampled by the Pattern. PXLBLZ does not pretend an invented preview
embedding was installed on the Controller.

This is the layer where generated-source screenshots, compiler summaries, and
small diagrams are useful. It should follow the Show videos, not precede them:
the implementation answers “how did that work?” after the reader has seen why
the answer matters.

## Compressed post

I have been rebuilding PXLBLZ-IDE, and it has stopped being merely a nicer
Pixelblaze editor. The new center of the project is **Shows**: existing Patterns
become timeline material that can run across zones, transition, pause their own
private time, automate exported sliders, change routing, and then compile into
one ordinary Pixelblaze Pattern that runs standalone on the Controller.

The same approach applies to hardware. Controller profiles can bind physical
inputs to Pattern sliders/functions/variables, inject brightness or duty-cap
behavior, and describe named multi-range zones without editing the original
Pattern. Every transform produces inspectable generated source. Live telemetry
shows modeled output duty and estimated draw without pretending the software is
an ammeter.

The older editor work is still underneath it: faithful preview, reusable
libraries and mixins, first-class maps, Controller push and read-back, and flat
Controller-ready artifacts. But the new idea is simpler:
**PXLBLZ turns a Pixelblaze Pattern from a finished object into reusable
material.**

[Short Show video]

Source: [github.com/jon-whiteroomsoftware/PXLBLZ-IDE](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE)

## Visual proof plan

Every visual should prove one idea. Prefer a 15–35 second screen recording with
the resulting lights or Stage visible over a tour of controls. Cursor movement
should be slow enough to follow; cuts should remove setup time, not cause time to
jump mysteriously.

| Order | Claim | Best proof | What must remain visible |
|---|---|---|---|
| 1 | Shows turn Patterns into material | Video: play one Show while its timeline crosses three scenes and two zones | Timeline, moving playhead, Stage, and one visibly continuous Pattern |
| 2 | Pattern time is an automatable property | Video: normal motion → eased slowdown → exact pause → restart, with the Time lane expanded | Time curve/values and lights in the same frame |
| 3 | Public Pattern controls can be choreographed | Video: automate a familiar Pattern’s exported slider without opening its source | Slider lane name, source Pattern identity, and resulting visual change |
| 4 | Zones virtualize space, not just visibility | Video: one Pattern repeats per zone, then spans the same zones as one canvas | Zone rows, Stage geometry, and the mode change |
| 5 | Transitions have distinct cost/appearance | Video: the same boundary as wipe, stable dither, crossfade, then portal | Transition inspector and Stage; use one pair of high-contrast Patterns |
| 6 | Routing can change without resetting Pattern state | Video: boundary marker moves semantic zones to different physical ranges | Routing lane/marker and a Pattern whose continuing motion makes state continuity obvious |
| 7 | Hardware can augment unmodified source | Split view/video: turn a physical potentiometer while a bound Pattern slider responds | Potentiometer, live Controller output, binding summary, unchanged source name |
| 8 | Power behavior is visible and adjustable | Video: lower the live duty cap while telemetry and physical brightness settle | Recent duty, estimated current, live cap, and LEDs |
| 9 · Layer 2 | Generated behavior is not magic | Screenshot pair: transform summary beside the relevant generated source | Applied passes, warnings, and the small generated section that implements the claim |
| 10 · Layer 2 | Maps separate physical geometry from Pattern space | Video: one generated geometry stays fixed while Strand, Surface, and Spatial coordinate views change the Pattern | Stable point positions, map/view selector, and visibly different sampling |

The strongest opening media is #1, not a hero screenshot of the editor. A
timeline screenshot proves that a timeline exists; a short video proves that it
controls light, time, state, and space together.

## Tone and claim discipline

- Write in first person. This is a maker showing another maker what got built,
  not a company announcing “industry-leading orchestration.”
- Use technical terms only after the visual gives them somewhere to land.
- Prefer “here is the Pattern running unchanged in three different roles” over
  “non-destructive compositing architecture.”
- State the surprising implementation fact: the Show becomes one ordinary
  Pixelblaze Pattern and runs without the browser—but save that explanation for
  the technical layer after the main post has shown the result.
- Avoid universal novelty claims that would require surveying every private
  Pixelblaze tool. The demonstrated capability is impressive without “world
  first.”
- Keep the honest boundaries. Power is estimated, arbitrary output aliases are
  not intercepted, negative Pattern time is not supported, and multi-Controller
  Show synchronization is not implemented.
- Give ElectroMage credit early when the audience is broader than the existing
  community. Pixelblaze supplies the unusually expressive small hardware runtime
  that makes this compilation strategy worthwhile.
- End with one link and one invitation: try it, inspect the generated Pattern,
  or show what installation you would want to build. Do not add a funnel.

## Before publishing

- Replace the development caveat with the actual release status.
- Add the deployed v2 app URL; do not point a v2 post at the stable v1 app.
- Record on a Show and physical installation chosen for legibility, not merely
  because it is the most complex available.
- Confirm every visible Pattern can be redistributed or shown with attribution.
- Tailor only the opening sentence and assumed vocabulary for each community;
  keep the demonstrated facts and media sequence consistent.

# Introducing PXLBLZ-IDE to the Pixelblaze community

PXLBLZ-IDE should be introduced by showing that existing Patterns have become
reusable ingredients: they can be choreographed across time and physical space,
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

> PXLBLZ lets finished Pixelblaze Patterns become ingredients in something larger.

## Long-form community post

### PXLBLZ-IDE stopped being just an editor

I have been rebuilding PXLBLZ-IDE over the last few weeks, and somewhere along
the way it stopped being “a nicer place to edit Pixelblaze Patterns.” That was
the first version: good Monaco editing, reusable libraries, tree-shaken output,
and a preview that could expose fixed-point problems before testing on hardware.
Useful things. Still an editor.

The current version is much stranger and much more interesting.

The big idea is that an existing Pattern is no longer necessarily the finished
thing. It can become an ingredient in something larger.

Take two ordinary Patterns. PXLBLZ folds both source files into a new third
Pattern. Each original renderer becomes a private function inside it, and a new
outer renderer decides which one should produce each LED—or calls both when a
true blend needs both colours. The Controller still receives and runs one
ordinary Pixelblaze Pattern.

Put a familiar video-editor-style timeline in front of that generated Pattern
and the two ingredients can take turns, overlap, or transition into one another
across the whole installation or within named zones. This is a **Show**, and it
is the centerpiece of the new PXLBLZ.

One LED strip can be divided into four named sections—four logical zones—and the
same Pattern repeated across all four without calculating four complete hidden
strips and combining them afterward. The shared Pattern advances once, each LED
receives the local coordinates of its own zone, and that LED is rendered once.
Many transitions are similarly selective: for a wipe, dithered edge, or
hard-edged portal, decide which Pattern owns this LED, then render only that one.
The image gets multiplied and rearranged; the expensive Pattern work usually
does not.

*Crossfade is the deliberately expensive exception: every LED needs the actual
colour from both Patterns so those colours can be mixed. When a textured blend
is acceptable, stable dithering is the clever alternative—it assigns each LED
to one Pattern or the other in a stable pattern, creating the impression of a
blend while still rendering only one Pattern per LED.*

A Show has scenes, zone rows, Pattern cells, and real boundary objects between
scenes. A boundary can be a cut, crossfade, wipe, dither, spatial portal, or a
routing change. Time, brightness, and exported Pattern sliders all use the same
transition model: start value, destination value, duration, and easing.

A Pattern can run normally while its private time eases down to an exact pause.
One of its own sliders can continue ramping while the Pattern is frozen; time can
then resume or the Show can transition into something else. A scene split can
preserve the motion cleanly or restart it for a deliberate stutter.

The editor uses a familiar video-editor-style timeline: scenes run left to right,
zones stack in rows, and a playhead makes it obvious where the Show is. Click or
drag to scrub, press play, and watch the Stage or physical lights follow.

Zones are not just masks. A Pattern can see a zone as its own normalized canvas,
repeat across several physical ranges, span zones as one domain, or start at a
different time offset. Named routing layouts can reassign the same physical
pixels later in the Show without resetting Pattern state. A real 2D or 3D map can
be the Stage, so the preview is the installation rather than a row of anonymous
strips.

The completed Show can be previewed, inspected, pushed, or exported as one
Pattern. No video is streamed from the desktop; close the browser and the little
Pixelblaze keeps running the Show by itself.

The same non-destructive idea now reaches into hardware.

A Controller profile can describe physical zones, potentiometers or buttons,
and power assumptions. A hardware input can drive a Pattern slider, function, or
variable without editing the original Pattern. That means the same shared
Pattern can remain clean while one physical installation gains a knob, a button,
or installation-specific brightness behavior.

Power management has also become something visible and tunable instead of a note
in a calculator. A cap can be set, recent and since-start output estimates can be
watched, and the estimated draw responds to the Controller's live brightness and
pixel count. Adjusting the running limit produces an immediate response in the
lights. It is modeled output rather than an ammeter, and the Controller's own
brightness limit remains the final physical control.

There is a lot underneath this, but those are supporting systems. The clearest
demonstration is a Pattern being pushed far beyond its original shape without
the original source becoming a forked pile of installation-specific edits.

A few short videos should carry the explanation because this is lighting
software and paragraphs have a fairly serious brightness limit. The first shows
one Pattern moving through time automation and several zones; the second shows a
complete transition/routing sequence on a mapped Stage; the third uses a
physical input and live power cap on a Controller.

PXLBLZ-IDE 2.0 is still in active development. The source is at
[github.com/jon-whiteroomsoftware/PXLBLZ-IDE](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE).
The public v2 app link belongs here when this development line becomes the
deployed release.

## Technical follow-up / first author comment

### For the technically curious

The unusual part of Shows is that there is no Show runtime on the Controller.
PXLBLZ parses the member Patterns, alpha-renames their globals and functions,
isolates the state that must be independent, and generates an outer scheduler
and renderer. Compatible continued cells reuse one member and its private clock;
a Restart creates a new member identity. The output is flat, inspectable
Pixelblaze source compiled by the normal Controller compiler.

For a concrete example, take a 400-pixel strip divided into four 100-pixel zones
using **Repeat per zone**. One compatible Pattern member receives one
`beforeRender` call. The scheduler maps each physical index into its zone's local
`0..99` index and local `pixelCount`, then calls the source renderer 400 times in
total—once per physical LED. It does not create four 400-pixel offscreen frames
and pay for 1,600 source renders. The additional work is the comparatively small
amount of routing and coordinate math needed to present each zone as its own
canvas.

This is not a cached bitmap: each LED still asks the Pattern for its own colour,
so spatial detail and animation remain correct. What gets shared is the Pattern
member, its state, and its once-per-frame setup—the sort of work that might
calculate an animation window, update time, or prepare other values used by
every pixel.

The transition labels also correspond to materially different execution
policies. A parameter ramp keeps one Pattern renderer active. A wipe or stable
dither advances both clocks when needed but chooses one renderer per pixel. A
crossfade evaluates two renderers during the transition window. A true feathered
portal renders almost every pixel once; only the narrow strip of pixels along
the moving transition edge renders both Patterns so their colours can blend.
The compiler reports those policies instead of collapsing them into one vague
“transition cost.”

The call counts make the distinction concrete. Across 1,000 pixels, a hard wipe,
hard portal, or stable dither performs about 1,000 source renders: one ownership
test and one chosen Pattern per pixel. A full crossfade deliberately performs
about 2,000. If a feathered portal's blend strip contains roughly 2% of the
installation, about 980 pixels render once and 20 render twice—roughly 1,020
source renders rather than 2,000. The actual fraction depends on the Stage
geometry and feather width, but the policy stays the same.

Crossfade is therefore the pessimal baseline for source-renderer work: `2N`
calls across `N` pixels. Stable dither is the workaround when its texture fits
the visual intent: distribute ownership across neighbouring pixels instead of
mixing two calculated colours at every pixel, preserving `N` source-renderer
calls.

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

Hardware augmentation leaves the authored Pattern unchanged and uses the same
general pass engine as the rest of PXLBLZ. Ordered recipes can inject frame work,
intercept supported colour outputs, bind an input to a Pattern target, or add an
exact-dimensional renderer adapter. The generated source, applied passes,
call-site counts, warnings, and rough cost are inspectable. The original Pattern
remains the authored source of truth.

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
become ingredients that can run across zones, transition, pause their own
private time, automate exported sliders, change routing, and then compile into
one ordinary Pixelblaze Pattern that runs standalone on the Controller.

The composition is deliberately selective. Repeating one Pattern across four
logical zones does not mean rendering four complete hidden frames; compatible
zones share the Pattern's state and frame setup, and each physical LED is
rendered in its local zone once. Most wipes and spatial transitions likewise
choose one Pattern per LED, reserving double rendering for an intentional
crossfade or the narrow blended edge of a feathered transition.

The same approach applies to hardware. Controller profiles can bind physical
inputs to Pattern sliders/functions/variables, inject brightness or duty-cap
behavior, and describe named multi-range zones without editing the original
Pattern. Every transform produces inspectable generated source. Live telemetry
shows modeled output duty and estimated draw without pretending the software is
an ammeter.

The older editor work is still underneath it: faithful preview, reusable
libraries and mixins, first-class maps, Controller push and read-back, and flat
Controller-ready artifacts. But the new idea is simpler:
**PXLBLZ lets finished Pixelblaze Patterns become ingredients in something
larger.**

[Short Show video]

Source: [github.com/jon-whiteroomsoftware/PXLBLZ-IDE](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE)

## Visual proof plan

Every visual should prove one idea. Prefer a 15–35 second screen recording with
the resulting lights or Stage visible over a tour of controls. Cursor movement
should be slow enough to follow; cuts should remove setup time, not cause time to
jump mysteriously.

| Order | Claim | Best proof | What must remain visible |
|---|---|---|---|
| 1 | Shows turn Patterns into ingredients | Video: play one Show while its timeline crosses three scenes and two zones | Timeline, moving playhead, Stage, and one visibly continuous Pattern |
| 2 | Pattern time is an automatable property | Video: normal motion → eased slowdown → exact pause → restart, with the Time lane expanded | Time curve/values and lights in the same frame |
| 3 | Public Pattern controls can be choreographed | Video: automate a familiar Pattern’s exported slider without opening its source | Slider lane name, source Pattern identity, and resulting visual change |
| 4 | Zones multiply a Pattern without naïve full-frame duplication | Video: one strip divided into four labeled zones; repeat one Pattern per zone, then span the same zones as one canvas | Zone rows, Stage geometry, mode change, and a restrained `one shared Pattern · one render per LED` annotation |
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

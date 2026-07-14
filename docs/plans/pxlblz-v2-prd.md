# PXLBLZ v2 — Remaining Product Work

This document is the forward-looking product plan for the current development
line. It deliberately excludes shipped behavior; the Feature Guide and Technical
Reference own current truth, while archived plans retain completed research and
implementation history.

The stable v1 release remains pinned by tag and maintenance branch. Mainline
reference docs describe current development. `README.md` is the public repository
entry point and must not be changed as routine documentation maintenance; any
edit requires explicit owner review first.

## 1. Current product position

The major v2 foundations are built:

- public Gallery and authenticated six-entity Studio;
- cloud personal content and multi-provider identity;
- Pattern, map, mixin, and library authoring;
- hardware-faithful Fast/Precise preview;
- optional multi-Controller connection through the Chrome extension;
- durable Controller profiles, inputs, bindings, transforms, zones, saved-program
  inventory, read-back, and import;
- first-class 1D/2D/3D maps, geometry families, coordinate views, and
  cross-dimensional renderer adaptation;
- one generated-artifact/pass-engine pipeline with provenance; and
- Show composition with a proportional timeline, transport, seeking, Split,
  Continue/Restart, boundary transitions, property automation, routing layouts,
  Stage preview, Controller push, and EPE export.

These are not roadmap items. Open implementation tickets for completed work may
remain open only as review state; they should not be read as unimplemented scope.

## 2. Review and issue-hygiene queue

Several completed arcs are intentionally open for human review rather than
future implementation:

- #413 and #415-#421 — Show timeline and accurate transport;
- #397 and #403-#406/#408 — routing, spatial effects, remapping, and their
  remaining physical visual/FPS checks;
- #434-#439 and #340 — Show output contracts, guided creation, Installation and
  Portable enforcement, artifact round-trip, legacy classification, keyboard
  flow, and spatial zone selection;
- #401/#402 — catalog Show artifacts and physical/visual review;
- #388 — map geometry/coordinate-space epic whose implementation children have
  landed; and
- hardware-facing items whose software is complete but whose final physical
  confirmation remains open.

Review should either close these issues or record a specific follow-up. Avoid
leaving completed epics looking like active dependency roots.

Known issue cleanup:

- #390 is superseded by #397/#398 and has no distinct remaining slice.
- #278 has no reliable original intent and needs clarification before work.
- #357 (README update) is owner-controlled and must not be picked up without
  explicit approval.
- #276, #296, #381, #382, and #384 need product triage before they enter
  sequencing.

## 3. Shows: next product step

The next Show product step is an expressive but inexpensive visual toolkit. It
must give authors the familiar breadth of a video editor without hiding the
Pixelblaze cost of producing each frame. The product should specify the full
destination now, then deliver it in three breadth-first passes. Each pass must
leave every major family usable before the next pass deepens the catalogue.
GitHub epic #442 and its child issues hold executable implementation state.

The paired educational progression in #363 begins after Pass 1. Those Shows
should exercise the real authoring, export, and Controller-check paths while the
toolkit is still small enough to teach. Passes 2 and 3 can enrich the same
progression; example content must not create a second authoring path.

The second Show implementation round remains software-complete and awaiting
human review. Its output-contract decisions and delivery history remain in the
[archived output-contract plan](archive/show-output-contracts.md).

## 4. Show visual language and product contract

### 4.1 Canonical terms

The product uses five distinct concepts:

- A **Pattern** is the raw pixel renderer. It produces color from coordinates,
  time, and exported controls.
- A **Property animation** changes one or more numeric properties over a
  duration. It is the motorized-console model: the same property an author can
  set manually can move over time. One animation has a shared duration and
  easing by default; an individual channel may override either when needed.
- An **Effect** changes one visual source. Effects can transform time,
  coordinates, color, opacity, or coverage. “Effect” is the user-facing term;
  narrower implementation names must not become competing product concepts.
- A **Transition** consumes the outgoing and incoming sources at a scene
  boundary. It owns boundary progress, easing, coverage or mixing, and its
  family parameters.
- **Routing** assigns mutually exclusive zones to Show content. Routing is not
  compositing, and stacked timeline rows must not imply that zones blend.

Property animation is the one general property-over-time mechanism. Render
speed, opacity, Pattern controls, and Effect parameters should all use it rather
than acquire separate automation systems. “Property automation” may remain an
internal or migration term, but new product copy should say “Property
animation.”

Opacity is a standard animatable property. On the current flat track it mixes a
source toward the Show background, black by default. If layered composition is
added later, the same property becomes that source's contribution weight; its
meaning must not need to change.

### 4.2 Transition representation

Every transition is described by the same dimensions:

1. **family** - cut, blend, wipe, dissolve, shape reveal, or motion;
2. **variant** - the structural sub-type, such as linear, split, or barn doors;
3. **preset** - a named starting configuration that writes ordinary parameters;
4. **parameters** - direction, center, scale, rotation, aspect, feather, color,
   block size, seed, or other family inputs;
5. **timing** - duration and temporal easing; and
6. **edge policy** - hard, stable dither, bounded feather, or full blend.

Presets must not create a growing set of special schema enums. North-to-south,
west-to-east, diagonals, and named stylistic versions of a transition are presets
over normal parameters. Authors can start from a familiar name and still reach
an exact result.

The implementation should share four primitives across families: normalized
boundary progress, easing evaluation, coverage/mask evaluation, and color
combination. Coordinate transforms form a fifth shared primitive for Effects and
motion transitions.

### 4.3 Easing

Easing is available wherever a normalized value changes over time: Property
animations, Transition progress, Effect parameters, opacity, render speed, and
motion. The common curve model supports:

- linear;
- quadratic, cubic, and sine curves with in, out, and in-out directions;
- CSS-compatible cubic Bezier curves and familiar named Bezier presets;
- steps and hold behavior; and
- back curves for controlled overshoot.

Bounce and elastic curves are Pass 3 candidates because their usefulness must
outweigh their generated code. Existing `ease-in`, `ease-out`, and
`ease-in-out` records retain their current quadratic appearance during migration.

Temporal easing is evaluated once per frame wherever possible. Spatial edge
profiles are a separate concept because they run per pixel: linear, smoothstep,
smootherstep, and stable dither. The UI may present both near a transition, but
the schema and cost report must not conflate them.

### 4.4 Effect families

The destination Effect catalogue is organized by what a single source changes:

- **time/playback** - render speed, phase/offset, hold, and bounded repeat;
- **coordinate/geometry** - translate, rotate, scale, shear, wrap, tile, mirror,
  and later kaleidoscope;
- **color/output** - opacity, brightness, hue, saturation, contrast, invert,
  threshold, posterize, and color remapping;
- **mask/gate** - crop, shape mask, strobe, deterministic density, decimation,
  and interlace; and
- **sample/history** - blur, trail, feedback, and glow only when sampling and
  retained-buffer costs are justified on real targets.

Translate, rotate, scale, and shear use one affine coordinate substrate. Wrap is
an address policy layered over transformed coordinates, not another affine
operation. Effects should compose as parameterized operations while the compiler
fuses cheap operations when that preserves authored semantics.

### 4.5 Transition catalogue

The full destination includes the following families and variants.

**Direct**

- Cut.

**Blend**

- Crossfade.
- Fade through black, white, or a custom color.
- Flash and color flash.
- Additive blend where output and hardware headroom make it useful.

**Wipe**

- Linear wipe at any angle, with cardinal and diagonal presets.
- Split and center-out/center-in.
- Barn doors.
- Horizontal or vertical blinds.
- Clock/radial wipe.
- Checker and grid wipe.

**Dissolve**

- Stable pixel dissolve.
- Block or chunky dissolve with adjustable cell size.
- Coherent-noise dissolve with seed and scale.
- Soft-threshold dissolve.

**Shape reveal / SDF**

- Circle, ellipse, box, rounded box, diamond, cross, ring, heart, star,
  crescent, and regular polygons with three through eight sides.
- Signature cat head, standing side-profile cat, and Bastet/Egyptian cat.
- Every viable shape supports **Grow Incoming** and **Shrink Outgoing**, plus
  center, scale, aspect, rotation, feather, edge policy, and easing.

Shape Shrink changes a mask while rendered pixels remain stationary. It is not
the same effect as Content Shrink, which scales image coordinates.

**Motion / transformed content**

- Cover, Reveal, Push, and Slide.
- Content Shrink and Content Grow.
- Zoom and Spin, including combined motion presets.

Color/light punctuation such as hue sweep, invert, threshold, and posterize can
be expressed as boundary presets over the shared color and mask primitives.
Ripple, swirl, stretch, bulge, pinch, pixelate, kaleidoscope, and glitch belong
to the later distortion set; they enter only when their professional-looking
form meets the cost budget.

### 4.6 User stories

1. **Animate a visible property.** As a Show author, I can animate any supported
   numeric Pattern or Effect property without learning a second timing system.
2. **Move properties together.** As a Show author, I can bind multiple
   properties to one duration and curve so coordinated motion is easy.
3. **Override one channel.** As an advanced author, I can give one property a
   different duration or easing without splitting the whole animation.
4. **Shape the motion.** As a Show author, I can choose in, out, or in-out easing
   from a useful curve set and preview the result immediately.
5. **Use one-source Effects.** As a Show author, I can add an Effect to a source
   and animate its ordinary parameters.
6. **Fade a source.** As a Show author, I can animate opacity to or from the Show
   background without constructing a two-source transition.
7. **Choose a boundary Transition.** As a Show author, I can attach a
   two-source Transition to a scene boundary and edit it as one object.
8. **Start with a known wipe.** As a Show author, I can choose cardinal or
   diagonal wipe presets, then set any direction I want.
9. **Control a dissolve.** As a Show author, I can choose smooth, pixel, or
   chunky character and adjust its scale and seed.
10. **Reveal with a shape.** As a Show author, I can grow the incoming source or
    shrink the outgoing source through the same SDF shape.
11. **Use signature shapes.** As a Show author, I can use cat-head, side-profile,
    and Bastet reveals that feel specific to PXLBLZ.
12. **Move content deliberately.** As a Show author, I can distinguish Cover,
    Reveal, Push, Slide, and content scaling by their preview and names.
13. **Wrap transformed pixels.** As a Show author, I can translate or rotate
    past an edge and choose wrap instead of exposing an empty border.
14. **See the practical cost.** As a Show author, I can see a traffic-light cost
    summary and the renderer math behind it for my current pixel count.
15. **Choose cheap or smooth.** As a performance-conscious author, I can switch
    an eligible transition among hard, dithered, bounded-feather, and full-blend
    policies without changing its geometry.
16. **Keep existing Shows looking right.** As an existing author, I can open a
    migrated Show and retain its current timing and transition appearance.
17. **Learn in stages.** As a new author, I can build useful Shows after Pass 1
    and encounter richer variants without the core concepts changing.

### 4.7 Deferred composition

Layered clips are extra credit, not a dependency of this toolkit. The preferred
future direction is a compact overlay lane nested beneath a zone or clip,
collapsed by default. An overlay would inherit routing and expose position,
scale, rotation, opacity, Effects, and z-order, then flatten before the boundary
Transition. This preserves the distinction between mutually exclusive zone rows
and composited sources. Do not add multi-source schema, editor layout, compiler
work, or cost promises for overlays during the three delivery passes.

### 4.8 Directions that still need evidence

Modulation sources beyond clip-relative progress remain later work: LFO, drift,
sample-and-hold, Show-wide buses, schedules, audio/FFT/beat, accelerometer, and
light. Audio and sensor behavior requires real hardware evidence.

A unified final-output pipeline could eventually fuse brightness, color,
calibration, and power work. It needs an explicit policy for `paint()` and
library abstractions before replacing current narrow intercept passes.

The durable authoring model remains the Show record edited through the timeline.
A fluent/Strudel-style composition DSL, geometric Pattern language, and
cross-Pattern routing remain later research.

## 5. Controller and hardware residuals

### Required physical validation

- #289 — analog potentiometer behavior after rewiring to an ADC1-safe input;
- #319 — sensor-pulse and night-scheduler mixins when suitable sensor/time
  hardware is available; and
- #336 — final zone-spanning/ramp behavior on representative hardware.

These are evidence gates around shipped software seams, not invitations to
redesign the pass engine or Show model.

### Product follow-ups

- Investigate the reported auto-reconnect-on-power-up problem (#386) through a
  disciplined reproduction before changing reconnect policy.
- Decide whether Controller-side automatic Pattern management (#387) is product
  scope or belongs in the Pixelblaze UI. Current behavior is intentionally
  read/import plus explicit Run/Save, not full playlist management.
- Complete anti-griefing/rate-limit policy for public API and D1 mutation paths
  (#407) before broader public exposure increases write volume.

## 6. Maps and geometry later directions

The coordinate-space overhaul is complete enough to use. Future additions
should be driven by Patterns or physical installations, not catalogue symmetry.

Candidates:

- Torus, Cone, Helix, or another generated Path/Surface with a real use case;
- Cylinder volume when an actual installation justifies its distribution and
  wiring rules;
- assisted fitting/unwrapping of imported point clouds, always explicit about
  axis, origin, topology, and seam; and
- manual renderer override only if multi-renderer Patterns become common enough
  that firmware preference is insufficient.

Do not infer topology or coordinate views from arbitrary imported coordinates.

## 7. Content, onboarding, and release work

### Content

- Begin the paired flagship and educational Show progressions (#363) after the
  first visual-toolkit pass. Both output contracts run through the real editor;
  each track should advance from one simple Show to examples that teach the new
  Effect and Transition vocabulary as later passes land.
- Add flagship Patterns (#382) only when they broaden the visual vocabulary or
  teach a reusable technique; raw count is not the goal.
- Create small example personal entities (#360) only if they clarify the
  personal/stock distinction without becoming undeletable seed clutter.

### Product polish

- About-page scope and location need triage (#296).
- Hover-icon work (#361) should follow one accessibility vocabulary and avoid
  replacing visible primary actions with mystery meat.
- Documentation visualization work should add diagrams only where a relationship
  is materially easier to understand than prose.

### Public entry point

The stable v1 README links intentionally target the `v1.0.0` documentation tag,
and the stable Pages deployment follows `v1-maintenance`. Mainline documentation
may continue evolving independently. Any README/public-cutover change is a
separate owner-approved action, not part of ordinary documentation cleanup.

## 8. Cost model requirements

The editor exposes cost at two levels. The default is a green/yellow/red summary
relative to the current target and pixel count. An advanced disclosure shows the
resource math that produced it. “Cheap” and “expensive” are summaries, not the
ground truth.

For a frame with `N` output pixels, `E` pixels inside a blended edge or overlap,
and `S` source samples per output pixel, common renderer costs are:

| Render policy | Approximate Pattern evaluations per frame | Meaning |
| --- | ---: | --- |
| Parameter-only change | `N` | Extra math is normally hoisted once per frame. |
| One-source coordinate or color Effect | `N` | One transformed source evaluation per output pixel. |
| Hard or stable-dither selector | `N` | Each pixel evaluates either outgoing or incoming, never both. |
| Bounded feather/overlap | `N + E` | Only edge pixels evaluate both sources. |
| Full crossfade/blend | `2N` | Every pixel evaluates both sources. |
| Multi-sample Effect | `S * N` | Blur-like work evaluates a source several times per pixel. |

The UI should substitute the current count, for example: “512 pixels: about
1,024 Pattern evaluations per frame.” When a formula depends on the longest
scanline, active coverage, or a bounded shape perimeter, the disclosure should
name that quantity rather than flatten it into Big-O notation.

The complete report keeps separate axes:

1. **CPU** - once-per-frame work, Pattern evaluations, per-sample math, and
   renderer count;
2. **memory** - scalar globals, array count/elements, and retained buffers;
3. **code size** - generated source, device bytecode, and control/export
   pressure;
4. **coverage** - active fraction or edge pixels for bounded work; and
5. **compatibility** - map dimension, topology, firmware, and Controller target.

Before-render hoisting receives explicit credit. Negative-cost Effects report the
Pattern work they avoid while acknowledging outer render and LED transport that
remain. Cost metadata must be derived from the compiled strategy, not maintained
as marketing copy beside it.

## 9. Delivery passes and verification

Keep each slice independently reviewable and leave the app shippable. Complete
the shared substrate and a representative of every major family before adding
catalogue depth.

### Pass 1 - substrate and useful breadth

- Establish the canonical Effect, Property animation, and Transition schema,
  including migration of existing easing names and boundary records.
- Add structured easing, shared progress/mask/affine primitives, edge policies,
  and compiled cost metadata with both summary and renderer-math UI.
- Make opacity, render speed, Pattern controls, and Effect parameters use the
  same Property animation path.
- Ship a usable representative set: Cut and Crossfade; fade through color;
  arbitrary-direction linear wipe; pixel and block dissolve; circle and box
  Grow Incoming/Shrink Outgoing; Push/Cover/Reveal; and basic translate, rotate,
  scale, shear, and wrap Effects.
- Begin #363 with small Shows that teach the Pass 1 vocabulary.

### Pass 2 - standard editor breadth and signature shapes

- Add split, barn-door, blinds, clock, checker, and grid wipe variants.
- Add coherent-noise and soft-threshold dissolves.
- Add the common SDF library, regular polygons, heart, star, crescent, cat head,
  side-profile cat, and Bastet, all through the shared shape contract.
- Add Content Shrink/Grow, Zoom, Spin, combined motion presets, and the common
  color/output Effects.
- Add custom cubic Bezier editing and the remaining standard curve presets.
- Extend #363 with examples that compare variants and cost policies.

### Pass 3 - professional polish and bounded experimentation

- Add color/light boundary presets and only those distortion Effects that remain
  professional and predictable within measured Pixelblaze budgets.
- Add Bounce/Elastic only if their value justifies generated code and UI weight.
- Tune presets, labels, thumbnails/previews, keyboard flow, accessibility, error
  handling, migration, and generated-code size.
- Fix toolkit bugs, run representative hardware/FPS checks, and finish the
  flagship Show progression before considering overlay lanes or other extra
  credit.

Pure engine tests cover easing, affine composition, masks, migration, renderer
selection, and cost formulas. Compiler tests cover generated source and semantic
equivalence. Component tests cover editing and summaries; Playwright covers the
authoring-to-preview-to-export path. Visual quality uses deterministic captures
and representative hardware because “looks professional” cannot be established
by unit tests alone.

Review and close software-complete issues in parallel, recording specific
follow-ups instead of retaining completed scope as roadmap work. Run unrelated
hardware validation (#289/#319/#336) when its physical setup is ready, and
continue independent rate-limiting/public-release work (#407).

Do not begin caching, downsampling, replay checkpoints, or worker infrastructure
for Show seeking without real editor evidence. The direct deterministic replay
path remains the baseline and fallback.

## 10. Design and evidence artifacts

- `docs/plans/show-timeline-overhaul-mockup.html` — canonical timeline design
  artifact; the current editor implements its proportional grid, headers,
  transport, automation lanes, and navigator direction.
- `docs/plans/shows-editor-overhaul-mockup.html` — earlier scene-strip baseline,
  retained for design history rather than current interaction authority.
- `docs/plans/archive/show-output-contracts.md` — completed second-round Show
  product contract, creation flow, validation model, and delivery slices.
- `docs/plans/show-output-contracts-mockup.html` — approved compact comparison
  and setup-flow artifact for the second-round New Show experience.
- `docs/plans/archive/` — completed hardware/performance research, catalog Show
  results, and replay decisions. Reference docs state the resulting rule; these
  reports retain the measurements.

## 11. Explicitly out of scope

- Automated GLSL-to-Pixelblaze translation.
- General Controller settings administration from PXLBLZ.
- Continuous synchronization of hardware controls into preview controls.
- Public publishing of personal Patterns.
- Multi-Controller synchronized Shows.
- A second Show animation/keyframe system beside Property animation.
- Layered clips, overlay lanes, and general multi-source composition during the
  three visual-toolkit passes.
- History buffers, multi-pass blur/glow/feedback, or other sampling-heavy Effects
  without measured target evidence.

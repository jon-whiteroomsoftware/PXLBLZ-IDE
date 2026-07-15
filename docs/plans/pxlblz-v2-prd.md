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

The headless Show visual toolkit is complete. Contract version 1 freezes 59
registered Property animation, Effect, and Transition variants against 104
deterministic fixtures, compiler and persistence parity, and representative
hardware evidence. The next Show product step is the evolved production UI:
visual discovery, applied Effect stacks, boundary Transition authoring, cost and
compatibility disclosure, and efficient reuse without hiding the Pixelblaze cost
of producing each frame. Expanded Property animation authoring is deferred; the
existing boundary-ramp contract remains supported but is not broadened through
this UI pass.

[`show-visual-toolkit-ui-design.md`](show-visual-toolkit-ui-design.md) owns the
focused interaction design. The comparative research remains in
[`show-editor-interaction-research-draft.md`](show-editor-interaction-research-draft.md).
[`show-scene-composition-design.md`](show-scene-composition-design.md) now owns
the exploratory destination for bounded in-Scene cuts, overlays, and Property
animation. It is not implementation-ready and does not expand #457's first UI
slice.
GitHub #457 remains the open UI umbrella. The production direction was approved
on 2026-07-14 and is recorded in
[`final-production-design.md`](../collaboration/show-timeline-production-density-2026-07-14/final-production-design.md).
Thin child issues now carry executable implementation state rather than turning
#457 into one multi-agent catch-all.

The paired educational progression in #363 begins after the production UI in
#457. Those Shows should teach the finished authoring, export, and
Controller-check paths rather than an interim interaction model. The
user-facing visual-toolkit guide in #460 follows the same UI and vocabulary.

The second Show implementation round remains software-complete and awaiting
human review. Its output-contract decisions and delivery history remain in the
[archived output-contract plan](archive/show-output-contracts.md).

### 3.1 Two independently releasable Show-editor increments

The main Show-editor release must be complete without Scene composition. It
ships the updated global Timeline, static Effect and Transition authoring,
single-owner selection, an anchored Entity Detail Panel, single-item magnetic
movement and insertion, Split, Clone, semantic undo, keyboard operation, and the
required fidelity and polish. Authors can build, preview, compile, export, and
send complete Shows through that release. Drag selection, multi-selection,
grouped movement, and general copy/paste remain a later interaction-efficiency
increment.

Scene composition is a later additive increment suitable for a dot release. It
adds an optional Open Scene workflow for local cuts, overlays, and expanded
Property-animation keyframes. Existing flat Shows, global Timeline semantics,
and the complete first-release workflow remain valid. The Scene-composition UI
reuses the shipped Stage, transport, catalogue, Inspector, commands, shortcuts,
snapping, zoom, and Timeline primitives rather than replacing the workspace.

The first increment reserves only inexpensive seams needed by the second:
stable authored identities, semantic undo transactions, a compact Scene-
complexity summary, an eventual Open Scene affordance, and engine commands that
do not assume every timing event is a top-level Scene. It does not ship an empty
Scene-detail shell, overlay persistence, or arbitrary keyframes.

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

### 4.7 Scene composition destination

Scene composition is not a dependency of the initial static Effect and
Transition UI, but it is now a deliberate V2 destination rather than unrelated
overlay extra credit. One optional detail level inside a semantic Scene owns
local base placements, overlay placements, and Property-animation keyframes.
The Show owns explicit Pattern instances so runtime state may Continue across
Scene boundaries. The compiler flattens each Scene before its top-level
Transition; recursive nested timelines remain outside the direction.

[`show-scene-composition-design.md`](show-scene-composition-design.md) owns the
model, editing algebra, release horizons, UI variants, and open evidence. Do not
add multi-source persistence or compiler work during the initial visual-toolkit
passes. Do preserve stable Effect identity, semantic undo, and ownership seams
that the later model requires.

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

### 4.9 Show-editor UI operating principles

PXLBLZ is a specialist IDE, not a sequence of approachable settings pages. The
Show editor optimizes for sustained expert use: high information density,
stable pane geometry, short pointer travel, keyboard fluency, and efficient
repeated edits. Initial approachability still matters, but it must come from
clear hierarchy, progressive disclosure, and consistent interaction—not from
giving every entity a large card or dedicated page.

The main Show workspace and future Scene-detail scope follow these rules:

- Preserve the existing IDE frame. The current right-hand Stage remains the
  default preview surface; Scene detail changes what it previews, not where the
  preview lives.
- Treat the Timeline as the primary Show-authoring surface. It receives the
  largest useful share of the workspace and must not become a vertically nested
  scroll region beneath a permanently enlarged Stage.
- Keep entity details compact. Prefer terse rows, two-column property grids,
  summaries, collapsible groups, and contextual disclosure over full-width
  stacked forms. A selected entity must not consume most of the workspace merely
  because it has many possible properties.
- Reuse interaction grammar across global and Scene-local editing: transport,
  playhead, zoom, snapping, selection, drag insertion, undo, catalogue, Entity
  Detail Panel, and keyboard commands. Later clipboard and multi-selection work
  must extend this grammar rather than introduce another one.
- Distinguish scope without inventing a second application. Breadcrumbs, ruler
  origin, lane vocabulary, and a restrained scope accent make Show time and
  Scene-local time unmistakable. Full-bleed Stage or Timeline layouts are
  optional focus modes, not defaults.
- Reveal complexity progressively. The global Timeline exposes Scenes, zones,
  and top-level Transitions. A Scene shows a compact internal-complexity summary
  until opened. Scene detail exposes placements; a property's keyframes appear
  only when that property or its authored lane is selected.
- Tolerate learnable expert interactions when they materially improve speed or
  density. Every pointer-only operation still needs a discoverable command and
  keyboard-accessible path.
- Preserve legibility while increasing density. Persistent information-bearing
  microcopy should normally render at 10-11 pixels; 9-pixel type is reserved
  for compact secondary labels with adequate contrast, and 8-pixel type for
  nonessential ornament or transient diagram annotation. Required text must not
  use the darkest gray tokens on black. Recover space through line-height,
  padding, abbreviation, and disclosure before shrinking or dimming text.
- Use color as a semantic binding across surfaces, not as redundant row
  decoration. A restrained class accent may connect a Timeline span, catalogue
  tile, icon, Entity Detail Panel, and Stage affordance. Labels, icons, shapes,
  indentation, and position remain sufficient without color.

### 4.10 Contextual inspection and Timeline navigation

The production global Show Timeline establishes the interaction grammar before
Scene detail. Scene-local editing later reuses its lane density, entity
selection, Inspector, transport, viewport navigation, and keyboard behavior.
Scene prototypes may test future pressure, but they must not silently define a
different primary Timeline.

Selected-entity properties use one contextual inspection surface at a time. A
click on a closed entity selects it and opens a compact Entity Detail Panel anchored
near that entity. Clicking the same entity again closes the Inspector while
leaving selection intact. Selecting another entity transfers the Inspector
rather than leaving several property views open across the Timeline. `Escape`
closes it, and a keyboard command toggles it for the focused or selected entity.
Pointer hover may supply the target as a convenience, but keyboard focus and
selection remain the reliable target model.

The Entity Detail Panel repeats the selected entity's Timeline icon, type
accent, and name. The first release has exactly one selection owner. Complicated
entities may disclose more content inside the same constrained panel, but the
Stage does not become property space. Stage visibility is an independent
workspace choice.

The default Entity Detail Panel is modeless and anchored near the selected
Timeline entity. It flips above or below according to available application
space and may render in the application's top overlay layer rather than being
clipped to the Timeline. Temporary overlap with the library or Stage is
acceptable when it preserves Timeline legibility. The Inspector must not move
authored lanes when it opens or closes.

The production property layout follows a shared rubric rather than one rigid
grid. Every entity begins with the same compact identity header and orders
groups from immediate timing and placement through visual parameters,
animation, compatibility, and cost. Individual entity types may use different
column counts when their controls demand it, but labels, value alignment, group
order, icons, and disclosure behavior remain learnable across the editor.
Density is not the absence of whitespace: whitespace separates concepts while
padding that carries no information is removed.

A detachable in-app floating palette remains a Feature Inbox option in #464.
It would let an author park the same Inspector over any application pane, but it
is not required for the first global-Timeline release or the first Scene-detail
design.

The default Timeline lane should be only as tall as its visible information and
hit targets require. The current 48-pixel Scene-study rows are not a production
dimension; the next global-Timeline study should test a roughly 28-32-pixel base
lane with expanded automation or rich-content lanes where necessary. Invisible
hit padding and explicit handles make short clips operable without making every
lane tall.

Automation summaries may be substantially terser than authored placement rows.
Several properties can stack as 8-10-pixel visual sparklines inside compact
selectable rows because the line's purpose is recognition: approximate value,
shape, and change timing. Authored times appear as roughly four-pixel round dots,
not handles. Selecting a property reveals exact time, value, and easing in the
Entity Detail Panel and may expand that property to a focused 22-pixel lane with
small selectable diamonds. Direct keyframe dragging and larger handles belong
in an explicit expanded curve editor. Visual weight therefore increases with
importance and edit authority; visual footprint and interaction footprint are
separate design budgets.

Global Show sparklines render saved placement targets and boundary-owned ramps;
their points select those existing owners and do not imply arbitrary freeform
keyframes. Scene-local sparklines may summarize actual placement-owned keys.
Both scopes provide exact numeric time and value entry after selection even when
snapping is enabled.

Viewport movement remains distinct from authored editing:

- dragging the playhead changes preview time;
- dragging an entity changes Show content and creates an undoable transaction;
- temporary Hand dragging pans the viewport without changing time or content;
- middle-button and trackpad gestures provide direct viewport navigation; and
- wheel, modified-wheel, and zoom gestures should follow familiar IDE and media-
  tool conventions.

Space toggles playback when focus is outside an editable control. A later
viewport-navigation refinement may use hold-Space plus drag as a temporary Hand
gesture, but that gesture is not persistent toolbar chrome and is not required
for the first implementation slice. Any implementation must suppress playback
when a pan begins and must never capture typing inside an input or code editor.

Scene-detail prototypes must preserve this frame while comparing genuinely
different scope and Inspector arrangements. Prototype review rejects a design
that wins only by moving or enlarging existing panes.

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
  evolved visual-toolkit UI in #457. Both output contracts run through the real
  editor; each track should advance from one simple Show to examples that teach
  the complete Effect, Property animation, and Transition vocabulary.
- Publish the visual-toolkit guide (#460) after #457 fixes the production UI and
  user-facing terminology. The guide teaches the classes and workflows; engine
  slices record only the technical contracts and evidence it will need.
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

## 9. Delivery waves and verification

Keep each slice independently reviewable and leave the app shippable. Production
UI decisions do not gate schema, compiler, preview, migration, cost, or catalogue
work. The UI begins only after the complete headless contract is stable.

### Waves 0-3 - completed headless contract and catalogue

- #443-#456 established structured easing; the registry and persistence seams;
  opacity, affine, output, and distortion Effects; Blend, Fade, Wipe, Dissolve,
  shape-reveal, and Motion Transitions; deterministic fixtures; and factual
  compiled cost.
- #452 and #456 completed human catalogue selection and representative hardware
  review. Side-profile cat and Bastet remain shipped but explicitly provisional.
- #459 froze runtime contract version 1 at fingerprint `f81bca37`: 59 variants,
  104 deterministic fixtures, 209 test files / 2,649 tests, and a 114-probe
  physical matrix with no compiler, activation, transport, or watchdog failure.

These issues are completed implementation history. New usability requirements
that change persistence or compiler behavior receive explicit versioned
follow-ups rather than reopening their acceptance criteria.

### Wave 4 - production interaction design and UI

- #457 owns the approved production interaction model over the real catalogue
  and a deliberately dense stress-case Show. Thin implementation issues own the
  production Timeline frame, Entity Detail Panel, visual discovery, Effect stacks,
  boundary Transition authoring, cost/compatibility disclosure,
  keyboard/accessibility behavior, and narrow layouts. Expanded Property
  animation authoring remains a later model-and-UI sequence after the current
  structural boundary semantics receive focused review.
- Small versioned prerequisites such as persistent Effect bypass and semantic
  Show undo remain follow-up slices rather than UI-only state.
- The main Show-editor increment is a complete release gate. Scene composition
  does not block it and begins implementation only after that editor is shipped
  and polished.
- #363 builds the flagship and educational Shows through that finished UI.
- #460 publishes the user-facing guide after the UI fixes the vocabulary and
  workflows.
- #458 should be reconsidered after design review as the overlay consumer of
  Scene composition, not implemented as an isolated nested lane.

Pure engine tests cover easing, affine composition, masks, migration, renderer
selection, descriptor validation, and cost formulas. Compiler tests cover
generated source and semantic equivalence. Deterministic captures and
representative hardware establish visual quality during Waves 1-3 because
“looks professional” cannot be established by unit tests alone. Component,
accessibility, and production Playwright authoring coverage begins with #457.

Review and close software-complete issues in parallel, recording specific
follow-ups instead of retaining completed scope as roadmap work. Run unrelated
hardware validation (#289/#319/#336) when its physical setup is ready, and
continue independent rate-limiting/public-release work (#407).

Do not begin caching, downsampling, replay checkpoints, or worker infrastructure
for Show seeking without real editor evidence. The direct deterministic replay
path remains the baseline and fallback.

## 10. Design and evidence artifacts

- `docs/plans/show-visual-toolkit-ui-design.md` - current production interaction
  design and stress-case prototype contract.
- `docs/plans/show-editor-interaction-research-draft.md` - comparative research
  behind the magnetic structural timeline and catalogue/inspector direction;
  retained as evidence rather than implementation authority.
- `docs/plans/show-scene-composition-design.md` - exploratory one-level Scene
  detail model, edit algebra, release horizons, and required evidence.
- `scripts/prototypes/show-scene-composition.ts` - interactive state-model
  exercise for split, duplicate, Continue/Restart, trim, and extend ownership.
- `src/components/ShowSceneCompositionPrototype.tsx` - three Scene-detail UI
  variants available through `?prototype=scene-composition&variant=A|B|C` in
  development. The first round demonstrated what not to change; the second
  round preserves the IDE frame and tests dense scope/Inspector arrangements.
  These variants are rejected/combined design history rather than production
  authority.
- `docs/collaboration/show-timeline-production-density-2026-07-14/final-production-design.md`
  - approved production authority for the global Timeline, compact registry
  palette, Entity Detail Panel, Scene X-ray, Super Detail bridge, and additive
  Scene-local scope.
- `src/components/ShowVisualToolkitPrototype.tsx` - registry-backed production
  interaction candidate available through `?prototype=visual-toolkit` in
  development. It is non-persistent and uses representative Stage/timeline
  content; the design document records which behaviors remain synthetic.
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
- Scene composition, overlay placements, and expanded keyframe authoring during
  the initial visual-toolkit passes; these remain the specified V2 destination.
- History buffers, multi-pass blur/glow/feedback, or other sampling-heavy Effects
  without measured target evidence.

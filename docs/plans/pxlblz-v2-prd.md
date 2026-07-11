# PXLBLZ v2 — Product Requirements (remaining work)

**Status, July 2026.** Most of v2 has shipped: the routing layer, the public
Gallery and pattern detail pages, the five-entity Studio rail, the Mixins
entity, Controller profiles with device-id identity, the generic pass engine,
hardware-control/power transforms, Shows v1, stage previews, artifact
provenance, analytics, and multi-provider auth (GitHub + Google with linking).
Shipped behavior is documented in the **PXLBLZ Technical Reference** and
**Feature Guide** (`docs/reference/`) and is no longer specified here. This
document now holds only what remains: Show maturity beyond the shipped v1, the
controller power & saved-program arc (§6), the map geometry and coordinate-space
arc (§7), unfinished corners of shipped surfaces, platform residuals, and open
questions.

Mockups for every v2 screen (approved July 2026) remain in
`pxlblz-v2-mockups.html` beside this document — still the visual reference for
the shipped Maps/Shows surfaces and deferred future Show states.

---

## 1. Shows residual arc

The shipped Show baseline is no longer specified here. In current code, Shows are
D1-backed personal content with a proportional timeline editor, show-local zones, optional
target Controller profile, per-show stage map, generated-source inspection,
Controller push, hold/restart semantics, adaptation ramps, crossfade,
wipe/dither route transitions, 2D spatial portal transitions, zone routing, zone spanning, per-zone preview
strips, spatial stage preview, and imported-controller-map stage support. See
the reference docs for exact behavior.

The remaining Show arc is about maturity: a proportional timeline and transport,
property automation, richer adaptation sources, more spatial authoring, better
cost honesty, and later DSL affordances. The durable
model remains:

- **Model**: **scenes** define shared time boundaries and target states across
  **zone tracks** (semantic names, resolved through the target Controller's zone
  map). Tracks hold **clips** (references to Patterns, never copies) with
  start/duration. A **transition** is its own boundary entity, selected and
  inspected separately from either neighboring scene; it owns type, duration,
  easing, and type-specific parameters while affecting the states on both sides.
  Transition types include cut, crossfade, wipe, dither, 2D spatial portal,
  property ramp, and future types. Per-clip **adaptations** (palette, mirror,
  phase offset, brightness envelope, and similar processing) never fork the
  source Pattern. An optional overlay track remains a later layer.
- **Zone map** (decided 2026-07-08): a Controller-profile mapping from
  semantic zone names to **lists of pixel-index ranges**. Zones are pure
  index arithmetic and are **hardware-independent** — no Output Expander
  required: a single serpentine panel can be sliced into software zones today
  (a column slice of the column-serpentine 16x16 panel is one contiguous
  range; a row band is several, which is why a zone is a *list* of ranges).
  Expander channels are just one *source* of ranges: the expander board is
  stateless and its channel config (startIndex/count) lives on the Pixelblaze
  as `/obconf.dat` (product doc: `docs/ElectroMage/Pixelblaze Output
  Expander.md`; binary format: pixelblaze-client `__decodeExpanderData`), so
  a later convenience import can derive zones from it without changing
  anything above the zone map. **Patterns stay zone-ignorant**: a pattern is
  a texture; placement lives in the zone map; zone awareness exists only at
  orchestration level (the Show).
- **Zone origins** (decided 2026-07-08): zones are deliberately lightweight —
  named index-range lists, trivially recreatable, **not** a shared first-class
  entity with referential integrity. They have two origins:
  **Controller zones** (durable: "this is how the box is physically set up" —
  the model above, per #317) and **show-local zones** (freestyle authoring: a
  Show owns its own zone rows — names, order, and a nominal size used only by
  the preview — so you can invent five or seventeen stages with no controller
  in sight). **Binding happens at compile/push, by name**: matched zones take
  their real pixel counts (zone-ignorant patterns plus route re-normalization
  mean choreography authored against a nominal 60 px zone lands correctly on
  a real 240 px zone); unmatched zones surface as bind-time warnings on the
  compile bar, alongside budget honesty. Convenience flows: starting a Show
  from a controller seeds its zone rows from that controller's map, and a
  freestyle Show can later save its zones to a controller. (A **preferred
  map** per Controller wants to exist for similar reasons — noted, parked.)
- **Dynamic zone routing layouts** (decided 2026-07-10, epic #397): a Show may
  own several named mappings from its semantic zone rows to physical
  pixel-index range lists. These **routing layouts** are distinct from the
  Stage Map (spatial coordinates) and from the Controller's default zone map.
  The shipped scene strip has a Show-wide routing lane: an instantaneous marker
  at a scene boundary selects another layout. The first layout is active at loop
  start; crossing a marker changes physical routing and each zone's local
  index/count without restarting Pattern clocks or state. The hard-switch
  tracer bullet (#398) retains one renderer per physical pixel. Progressive
  transfers (#403), parametric routing (#405), and coordinate remapping (#406)
  remain later layers. In the proportional timeline, routing markers project as
  zero-duration transition objects and progressive transfers extend the same
  entity rather than introducing another lane or inspector. The
  routing-representation spike (#400) keeps arbitrary range branches as the
  general default. Pattern Prism (#401) ships the first bounded packed lookup:
  high-run schedules switch only when the complete table is at most 2,048
  elements; the compile summary names the choice. Conservative formula
  recognition remains #408; detailed measurements live in the archived
  technical plan rather than this product document.
- **Editor direction** (revised 2026-07-11): the shipped v1 **scene strip** is
  the starting point for one canonical, zoomable proportional timeline rather
  than a permanent second view. Scenes remain explicit column headers; zones
  and their property lanes are explicit row headers. Proportional scene widths,
  a time ruler, persistent playhead, transport, first-class transition lane,
  nested automation curves, and a whole-Show navigator make the arrangement's
  real time geometry directly editable. The navigator thumb's width represents
  the visible fraction of the Show and therefore grows and shrinks with zoom.
  The approved interaction/design artifact is
  `docs/plans/show-timeline-overhaul-mockup.html`. The opening proportional
  timeline, transport, playhead, and accurate-seek slice shipped in #414;
  Split/entry semantics shipped in #415, the first-class transition lane shipped
  in #416, and automation lanes plus zoom shipped through #417-#420. A cell can
  span rows (**zone spanning**: adjacent zones act as one canvas — one
  domain — versus two independently re-normalized domains). A spanning cell
  may instead choose **Repeat per zone**, keeping one shared Pattern instance
  and clock while giving every covered zone its own local canvas. The shipped
  2026-07-09 scene-strip baseline remains captured in
  `docs/plans/shows-editor-overhaul-mockup.html`; the 2026-07-11 artifact above
  supersedes it only for the next authoring direction.
- **Continue vs restart at scene boundaries** (shipped #415): every
  destination scene cell owns a `restart on entry` boolean. It defaults off, so
  splitting a scene preserves the Pattern instance, private clock, accumulated
  state, and visual continuity across the new boundary. Turning it on starts a
  fresh instance/time base at that cell, making deliberate stutters and repeated
  starts easy to author. Geometry may still merge visually contiguous spans,
  but it is no longer the only way to express continuity. When adjacent cells
  continue the same Pattern, a transition on their boundary compiles to an
  **adaptation/property ramp** over one continuous instance — palette,
  brightness, mirror, phase, time scale, and exposed Pattern properties may
  interpolate while phase remains undisturbed. Same-Pattern transitions are
  therefore parameter-cheap and never open a two-renderer window.
- **First-class transition ownership** (shipped #416): a transition is
  not metadata hidden on the outgoing clip. It is a selectable boundary object
  that relates the states on both sides. Zero-duration cut/routing markers and
  duration-bearing property, route, crossfade, wipe, dither, and portal
  transitions share one lane, stable identity, selection model, and inspector.
  A transition's duration occupies visible Show time and its easing is explicit.
  The lossless migration preserves the shipped #397 routing representation and
  gives #403 progressive transfers plus #404 layout-aware transitions the same
  entity seam instead of another private lane or inspector.
- **Property transitions and automation** (shared system shipped #417/#418): the primitive
  is CSS-like: start value, target value, duration, and optional easing (linear
  when omitted). Scene/cell state owns target values; the boundary transition
  owns how the previous state reaches them. `timeScale` is the first complete
  property because the compiler/runtime contract already supports exact pause.
  The same mechanism then expands to Show adaptations and Pattern-exposed
  controls/exported variables. It does not mutate arbitrary private locals.
  Automation lanes are the editable projection of these values and transitions,
  not a separate animation engine; #405 parametric routing and #406 coordinate
  remapping must consume this shared property system.
  The first nested Time lane shows each scene target and each boundary's
  start-to-target ramp. The boundary inspector enables the ramp per destination
  zone, edits its explicit start, and edits the destination cell's target beside
  the shared duration/easing controls. Generated two-scene and sequence code use
  the same polynomial easing samples as the editor; continued same-Pattern
  scenes reuse one private clock through ramp, exact-zero dwell, and resume.
  #418 proves the descriptor is generic: Brightness uses the same destination
  targets, boundary-owned start maps, per-property duration/easing, compiler
  evaluator, persistence path, inspector vocabulary, and nested-lane projection.
  Multiple properties may run different curves on one continued Pattern member;
  the boundary window contains them and the compiler still invokes one renderer.
  #419 extends that same record to Pattern-exposed slider controls. Studio
  discovers only exported `sliderName(v)` functions, presents their public name,
  fixed `0..1` input domain, and saved-or-Studio-default position, then stores
  scene targets and boundary curves without exposing arbitrary locals. Generated
  members call the alpha-renamed slider once per frame before Pattern advance.
- **Timeline transport and accurate seeking** (shipped #414 after spike
  #412): clicking or dragging the ruler places the persistent playhead; Space
  toggles play/pause. #415 adds Split at a valid interior playhead position and
  preserves continuity by default. A seek rebuilds the requested preview state by replaying from Show
  start in the Fast renderer with deterministic random seed, fixed simulation
  steps, and the full selected Stage Map/pixel count. Intermediate frames run
  headlessly and only the target frame paints. The UI shows a short rebuilding
  state and newer seeks cancel stale work. This is accurate for deterministic
  Pattern state; wall-clock, network, and live sensor inputs remain outside the
  guarantee and must be identified honestly.
- **Zoom and whole-Show navigation** (shipped #420): explicit zoom in/out and
  Fit controls plus Ctrl/Command-wheel zoom preserve the playhead's Show time.
  One bounded viewport transform drives the proportional grid width, native
  timeline scroll, and a whole-Show navigator. Its draggable thumb is positioned
  by visible start time and sized by the visible fraction; left/right handles
  resize the range. Keyboard pan/resize and 1x–16x bounds keep all content
  reachable without introducing persisted editor state.
- **Replay optimization policy** (validated #421 on 2026-07-11): v1 ships the direct
  full-resolution replay above. Do not add checkpoints, frame/state caches,
  downsampling, representative-pixel replay, or worker infrastructure before
  observing the real editor. Cooperative yielding/cancellation is basic UI
  hygiene, not an approximation. Put optimization work at the end of the epic
  and activate it only when measured Show lengths, Pattern costs, or target
  installations make the direct path feel slow. The completed-stack rerun found
  63-186 ms for 15-second, 256-pixel cases and retained prompt cancellation
  opportunities even in the deliberately extreme 2,048-pixel tail. That stress
  matrix is not the typical product case. The original spike and final decision
  live in `docs/plans/archive/issue-412-fast-show-seek-replay-results.md` and
  `docs/plans/archive/issue-421-show-seek-replay-decision.md`.
- **Compilation**: a Show compiles to a single generated Pixelblaze pattern
  over alpha-renamed members. **Time-slicing is the default emission strategy**:
  steady-state runs only the active clip's `beforeRender`/render; both renderers
  evaluate only inside a crossfade window. Route transitions and routed zones
  are one-renderer-per-pixel paths in the shipped compiler.
- **Spatial portal transition** (shipped #383): a Show with a selected 2D Stage
  Map can expand a circular boundary from a configurable normalized center, or
  invert it to contract from the outside inward. A hard edge and stable-dither
  feather call exactly one Pattern renderer per pixel. Optional true blend calls
  both renderers only for pixels inside the bounded feather band, and is labeled
  honestly as the more expensive policy. The generated artifact exports
  `render2D(index, x, y)`: preview coordinates come from the selected Stage Map,
  while hardware coordinates come from the map configured on the Pixelblaze.
  Missing or non-2D stages are compile errors rather than silent 1D fallbacks.
  Scene Splice Showcase (#402) extends that path to a short looping sequence:
  repeated appearances of the same Pattern/adaptation pair share one isolated
  member instance, each scene hold advances only its visible member, and each
  portal window advances the outgoing and incoming members. This supports an
  outward reveal plus an inverted/off-center return without duplicating source
  Pattern state. The same sequence scheduler preserves mixed cut, crossfade,
  wipe, dither, and portal boundaries across later scene columns; changing one
  boundary's type never truncates the compiled Show. Show duration includes both
  holds and transition windows.
- **Adaptation cost tiers** (decided 2026-07-08): prefer transforming what a
  pattern *sees* over transforming what it *emits*, and prefer both over
  running multiple renderers. The intended ladder:
  1. **Parameter automation** (cheapest): drive exported vars / slider
     functions / named bindings once per frame from controller inputs,
     schedules, sensors, macro knobs, curves, or show state. This is the
     preferred home for pot/sensor/show modulation when a pattern exposes a
     useful lever.
  2. **Index/domain transforms** (cheap per pixel): route, reverse, mirror,
     tile/repeat, split one physical strip into virtual screens, phase/offset,
     ping-pong, and zone-local coordinate normalization. These remap `index`,
     virtual `pixelCount`, or map coordinates before the original renderer runs
     so an unmodified pattern can fill each zone as its whole world.
  3. **Color/palette adaptations** (cheap when source-level, moderate when
     output-level): hue/palette shift, desaturation, zone dimming, brightness
     envelopes, and night-mode styling. If a pattern exposes palette or
     saturation controls, bind them; otherwise an output wrapper may be needed.
  4. **Output interception** (visible per-output-call cost): power measurement,
     power limiting, and final color clamps wrap sinks such as `hsv`/`rgb`.
     These are valuable but opt-in/budget-visible.
  5. **Multi-render composition** (most expensive): two or more complete
     renderers should run together only for transition windows, overlays, or
     deliberate blends. The default steady-state path remains time-sliced.
- **Budget honesty**: the editor surfaces compiled artifact size against the
  measured device budget and an estimated FPS at the target pixel count,
  fed by the transform summary's cost model. Compositions that exceed the
  target device's limits warn before push.
- **Inspectability**: "View generated pattern" opens the compiled artifact
  read-only. A Show is ultimately a plain Pixelblaze pattern you could paste
  anywhere.
- **Preview**: the Studio preview renders Shows on a Stage with zone boundaries
  visible. The shipped default is per-zone strips; the shipped spatial path maps
  zones onto a selected 2D/3D stage map. Zones are **solo-able** in the preview
  ("show me only arch-left") as a debugging affordance.
- **Stage** (decided 2026-07-08, mockups tab 8): the show preview always
  renders *zones on a stage*. The default stage is the generic per-zone
  strips view (#337) — honest for freestyle shows, never warns. A show may
  choose any map as its stage (`stageMapId`, saved on the show — never
  per-scene); zone index ranges then map onto that map's coordinates and the
  preview renders the installation geometry, reusing the pattern preview's
  2D/3D viewport. Both views share one pipeline: a pure zones→layout
  provider feeding the existing mapPoints/renderer path, with strips as the
  degenerate map. Honesty states: a zone with no pixels on the stage warns
  "off stage" (preview-only, still compiles); stage pixels no zone covers
  render dim grey. The natural stage is the target controller's own map,
  acquired via an explicit Controller-page **"Import map"** action that
  mints a named user map (baked coordinates + provenance metadata, no
  generator source, no referential integrity — frozen at the device count,
  which is exactly what zone ranges index into). Marquee zone creation on
  the stage view is recorded as a later direction, not a v2 commitment.
- **Shipped baseline**: the #316/#317/#318 trunk, hold/ramp semantics, route-cost
  transitions, per-zone preview strips, show-local zones, zone spanning, stage
  map choice, controller-map import, and map fingerprint matching have landed.
- **Deferred**: the fluent/Strudel-style composition DSL (the recipe IR is the
  v1 authoring format, edited through the Show editor UI); low-resolution wash
  sampling; the geometric pattern language; a read-only `zoneIndex`/`zoneCount`
  injection for patterns that deliberately want per-zone behavior (escape
  hatch — the default remains zone-ignorant patterns); zone import from a
  device's `/obconf.dat` expander config. Recorded as later directions, not
  v2 commitments.

### Timeline-overhaul compatibility with the existing Show runway

The 2026-07-11 backlog audit keeps the visual-effect runway intact and prevents
parallel authoring systems:

- #397 remains the parent for dynamic routing layouts and catalog Shows. Its
  fundamentals and catalog work are not replaced by the timeline overhaul.
- #403 progressive routing transitions and #404 the expanded SDF family remain
  valid. Both attach their type-specific controls to the shared first-class
  transition entity/lane rather than the shipped marker-specific inspector.
- #405 parametric routing and #406 coordinate remapping remain valid. Both use
  the shared property-transition/automation model rather than defining private
  curves, keyframes, or time controls.
- #398's shipped hard routing marker projects as a zero-duration
  transition object; its runtime semantics do not change.
- #401 and #402 remain catalog/physical-review work and are not blocked on the
  new editor. #408–#411 remain routing/metadata infrastructure and are likewise
  not made obsolete.
- #390 ("Multiple zone mappings within a show") is an empty predecessor now
  covered by #397/#398 and should be closed as a duplicate when issue hygiene is
  next performed. #363 ("Build some killer + educational shows") remains a
  broad content direction; #401/#402 are its concrete current slices.
- #306 remains the shipped Shows-v1 baseline. The new timeline epic owns only
  the maturity layer above it and links back to that baseline rather than
  reopening its completed slices.

### Remaining Show prerequisites

The original gating slices (#315 scope-aware merge design, #316 compile
vertical, #317 segment routing, #318 scene strip, #333 show-local zones, #334
route transitions, #335 holds/ramps, #336 zone spanning software, #337 zone
strips, #338 controller-map import, and #339 stage preview) have landed. The
open prerequisite for richer Shows is not another editor shell; it is a better
cost and capability model.

**A real per-pixel cost model.** The current budget bar reports generated
artifact size against the measured device byte budget and distinguishes broad
render policies. The next model should be grounded in the hardware-spike
measurements and distinguish parameter automation, domain transforms, output
interception, and multi-render composition. It should track three axes, not one:
**cycles** (per-frame vs per-pixel vs per-output-call, crediting
`beforeRender` hoisting of frame-invariant setup), **memory** (arrays are a
separate hard budget), and **code size / exported-control count** (the
clips-per-show ceiling). Masked evaluation adds one more distinction: fixed
firmware/route overhead versus the original renderer work avoided on masked
pixels, with expected active coverage when the recipe makes it knowable. The
model should also admit **negative-cost adaptations** (shutters, decimation,
interlacing, hold buffers — see the roadmap below), which buy budget rather
than spend it.

**Hardware validation still batches best.** Remaining bench checks include
zone-spanning ramps on hardware and analog pot validation after rewiring to an
ADC1-safe input. (Power-cap was bench-validated 2026-07-09 — active limiting
confirmed on hardware; that session seeded §6.) These are validation gates, not
blockers on the shipped editor/compiler model.

### Temporal control, masked evaluation, and transition roadmap (epic #375, issues #376–#380)

This roadmap replaces the earlier undifferentiated automation idea ladder. It
separates decisions ready for implementation issues from recorded directions
that still need product or hardware evidence. The compiler terms are:

- A **clock adaptation** changes the `delta` and private `time()` seen by one
  clip. It may freeze or step Pattern state without changing light output by
  itself.
- An **evaluation mask** decides cheaply whether to call the original Pattern
  renderer for a pixel. A masked-out pixel emits explicit black; the firmware
  still calls the generated outer `render`, but the expensive inner renderer is
  skipped. This can be a negative-cost visual effect.
- A **route mask** chooses which one of two Pattern renderers owns a pixel. It
  smooths transitions without necessarily reducing electrical duty, while
  retaining the one-renderer-per-pixel property.
- An **output adaptation** changes the captured final color. It can reduce duty
  but does not avoid original Pattern work unless paired with an evaluation
  mask.

The settled semantic decisions are:

- **Exact pause, never universal rewind.** Time scale may ramp continuously to
  zero. Negative time is not offered as a generic adaptation: accumulators,
  random state, and simulations are not generally reversible.
- **Light shutter and clock stutter are separate controls.** A dark shutter may
  let the Pattern clock continue behind it or freeze the clock too. The first
  reveals a later animation moment on every flash; the second reveals the next
  state only when the shutter opens.
- **A true frame hold is buffered.** Passing zero `delta` freezes clock state
  but still renders every pixel. Reusing an exact prior RGB frame is a separate
  memory-for-cycles feature and remains in the later buffer tier.
- **Skipped output is explicit black.** Generated code does not depend on
  undocumented firmware behavior when a Pattern emits no color.
- **Immediate masks are 1D/index-domain.** Coordinate-aware radial, angular,
  and geometric masks wait for a real 2D Show-domain slice; they are not faked
  by smuggling installation geometry into zone-ignorant Patterns.

#### Decided implementation arc — address in this order

1. **Exact-zero time ramps (#376).** Remove the current positive floor on Show
   `timeScale`, preserve the existing private clock and same-Pattern adaptation
   ramp, and prove slow-to-stop / stop-to-motion behavior in preview and
   generated code. This is the smallest high-value slice and fixes the clock
   contract before more temporal modes build on it.
2. **Feathered route wipe (#377).** Extend the shipped wipe with a configurable 1D
   feather band. Pixels outside the band route deterministically; pixels inside
   use a stable ordered/hash threshold derived from distance through the band
   and still call exactly one Pattern renderer. Feather `0` is the shipped hard
   wipe. This is the first answer to row-at-a-time visual stepping without
   paying for a full crossfade.
3. **Full-clip light shutter via masked evaluation (#378).** Add rate, duty, phase, and
   clock behavior (`continue` / `freeze`) as a non-destructive clip adaptation.
   Closed phases skip the original renderer and emit black. The compile summary
   reports the shutter policy and expected active fraction; it must not claim
   savings from firmware/LED transport the generated wrapper cannot avoid.
4. **Stepped clock / temporal stutter (#379).** Quantize a clip's private time base and
   deliver accumulated `delta` only at step boundaries, producing freeze/jump
   motion without buffering. Keep it independent from the light shutter so a
   user can hear and see the difference between motion cadence and illumination
   cadence. The approved cadence-first Show inspector exposes Smooth/Stepped
   motion as jumps per second with an interval readback and an explicit
   unchanged-renderer-cost note.
5. **Per-zone time offset (#380).** Let repeated instances of the same Pattern start
   from staggered private clocks for rounds and travelling choreography, with no
   second renderer and no source changes.

Every slice must extend the generated-artifact summary, preview the same recipe
the device receives, preserve hold/restart semantics, and carry pure compiler /
model tests plus the lightest useful UI smoke coverage. The issue set should be
published under one **Temporal control & masked evaluation** epic (#375); capability
and cost reporting belong inside the vertical feature slices rather than in a
detached horizontal engine ticket.

#### Recorded next directions — no implementation issue yet

- **Spatial and density shutters.** Moving bands, checker/Bayer masks,
  deterministic sparkle, and changing well-distributed subsets could reduce
  both electrical duty and Pattern evaluation. The first product decision is
  whether these are clip adaptations, transition masks, or a reusable mask
  recipe shared by both.
- **Bounded dual-render feather.** A true blended frontier can run both
  renderers only inside a narrow band, costing roughly one renderer plus the
  band coverage rather than two everywhere. It follows the one-renderer
  feather only if visual comparison justifies the extra policy and cost tier.
- **Clip-relative progress.** Expose `clipTime` / `clipProgress` as modulation
  sources for exact entry and exit envelopes once the first temporal controls
  establish their inspector vocabulary.
- **Unified final-output pipeline.** Capture `hsv` / `rgb` / `paint` output and
  run a fused brightness, color, calibration, and power stack once per emitted
  pixel. This could amortize wrappers and broaden sink coverage, but it needs a
  code-shape and compatibility decision before becoming an issue.
- **Perceptual duty shaping.** Compare highlight soft-knee compression,
  common-white reduction (`min(r,g,b)`), and spatial density reduction against
  uniform scaling. The current duty cap remains the safety mechanism; these
  would be optional appearance/efficiency transforms, not a more accurate
  electrical claim. Hardware visual comparison and RGB sink coverage are still
  unresolved, so no implementation issue is justified yet.
- **Modulation sources and domain transforms.** LFOs, perlin drift,
  sample-and-hold, envelopes, scroll/translate, rotation, zoom, folds, polar
  wrap, wave warp, and jitter remain strong follow-ons. Frame-invariant setup
  belongs in `beforeRender`; Pattern-exposed controls remain cheaper than
  output interception.
- **Show-wide buses.** One macro or schedule fanned into corresponding controls
  across clips, including a night-mode bus for temperature, brightness, and
  speed.

#### Memory-, sensor-, and composition-dependent later tier

- **Buffered negative-cost adaptations:** decimation, interlacing, per-clip
  frame caps backed by cached output, freeze-a-zone buffers, snapshot crossfade,
  and trails. Each trades arrays for cycles and waits for the multi-axis cost
  model plus hardware memory measurements.
- **Audio and sensor modulation:** overall energy, FFT bands, onset/beat pulse,
  accelerometer, light, time-of-day, and a live `setVars` surface. Audio is an
  explicit desired direction, but no audio/sensor hardware is currently
  available for validation; preserve a modulation-source seam and do not task
  the hardware slice yet.
- **Sparse overlays:** cost by active coverage rather than mere presence — a
  scanner, beat flash, or small diagnostic overlay should not be priced like a
  full second renderer.
- **Cross-pattern modulation routing:** alpha-renamed members make Pattern A's
  exported state readable by Pattern B's bindings. Architecturally plausible,
  hard to surface honestly, and still deferred with the full modulation matrix,
  automation curves, fluent DSL, and generative composition.

## 2. Unfinished corners of shipped surfaces

Reference docs describe these surfaces as they are; this list is what's still
intended.

**Rail**:

- The **Controllers view now suppresses the pattern preview** with an empty
  context placeholder; collapse/remove that right slot later if the placeholder
  feels like wasted space.
- Factor the monolithic `PatternList.tsx` (~1,500 lines) into a shared rail
  shell + per-entity list modules — now tasked as #344, the opening issue of
  the user libraries arc (§5).

**Pattern detail / Gallery residuals** (specified, not built):

- **Copyable URL** affordance on the detail page (the `/p/<slug>` is shown as
  static text).
- **Pattern description** on the detail page (no description field exists).
- **Settings carry into Clone**: detail-page slider/embedding tweaks should
  ride into the eventual Studio copy via the settings cascade. The detail page
  now opens the built-in pattern read-only in Studio first, so this belongs to
  the in-Studio clone path rather than a Gallery clone shortcut.
- Share URLs for *personal* patterns remain a natural later step, out of
  scope for this arc.

**Controller profile residuals**:

- **Playlists / pattern-list management** — the intended later occupant of the
  deliberately roomy profile page: stock playlists per hardware type with
  one-click push of a whole set. The foundation is now tasked as the
  saved-program inventory (§6, #369); playlist reorder and bulk install build
  on it later. The device playlist is readable/writable over the existing
  protocol.
- **Hardware-input live readout** — the Inputs table's Live column is a
  placeholder; when the device is connected it should show the input's
  current value.
- **Mixin pack residuals (#319)** — power-cap is now real, wired into the
  push recipe for enabled profile transforms, and bench-validated 2026-07-09:
  it intercepts `hsv`, exports reserved `__px_power*` telemetry (rendered as a
  structured Power panel on the Controller page, hidden from generic watched
  vars), and scales output when over budget. Duty-first configuration and the
  amps calculator landed in #365; two-window telemetry and the responsive
  internal cap signal landed in #366, and live cap control follows in #367.
  `sensor-pulse` and `night-scheduler` ship as real, readable stock sources.
  Remaining here: consumption plumbing/UI for `sensor-pulse` and
  `night-scheduler` beyond cloneable source (the #294 binding surface is the
  natural home). Output-sink coverage beyond `hsv` stays a later decision
  (§6).
- **Per-pattern hardware bindings (#294)** — shipped: Controller profiles can
  bind a named input to a pattern's exported slider, named function, or variable
  without editing the pattern source. Push-time recipes sample once per frame,
  apply smoothing/fallback/invert, scale through min/max/quantize, and surface
  missing target warnings in the transform summary. Remaining: friendlier UI
  target validation/autocomplete before push, and bench validation once the
  analog pot is rewired to an ADC1-safe analog input.
- **Board profiles beyond v3 Standard** — one `ControllerBoardKind` exists;
  the ElectroMage GPIO table should back additional board kinds (and pad
  labels mapped to numeric IO values in the pin picker).
- **Controller metadata migration** — overwrite bindings and the program
  label cache remain a sibling storage seam (`/api/controller-metadata`);
  fold into or alongside the profile entity where natural.

**Open questions (deliberately unresolved)**:

- **Resolved 2026-07-08:** Patterns, Maps, and Mixins all use the same
  always-present collapsible stock/built-in section pattern. The Gallery remains
  the public browse/detail surface and keeps direct Send to Controller; Gallery
  **Open in Studio** opens a built-in read-only, and cloning happens from Studio.
- Whether the **Catalog** activity-strip entry stays once the reveal pattern
  beds in — re-evaluate.
- **Resolved 2026-07-08:** the Controllers page now has a context-pane occupant:
  the latest generated artifact inspection with transform summary, warnings,
  and a read-only generated source dialog.
- The mixin pass-kind badge vocabulary in the UI (inject/intercept/bind is
  engine truth; whether users need friendlier words is unsettled).

## 3. Platform remainder

**Analytics (#322)** — shipped as production-only instrumentation gated by
`VITE_GA_MEASUREMENT_ID`. The app injects GA only in production, disables
automatic page views, emits explicit route-level `page_view`s for Gallery,
pattern detail, Studio entity modes, and other app routes, and records coarse
events for Send to Controller, catalog clone, and sign-in intent. The event
payloads avoid personal names, source, controller ids, and IP addresses; see
`docs/reference/Cloudflare Operations.md` for deployment configuration.

**Cutover** — the repo README still points at v1 on GitHub Pages; the switch
to the Cloudflare deployment waits until this arc is finished.

## 4. Artifact identity & provenance (decided 2026-07-08)

Everything PXLBLZ distributes onto controllers — patterns, compiled show
artifacts, maps — should identify this IDE as its author wherever the channel
allows, so a controller can be triaged ("which programs are ours; leave the
rest alone"), device state can be tied back to Studio entities, and shared
artifacts carry attribution. Canonical URL:
`https://pxlblz-ide.whiteroomsoftware.com/`. The three v2 channels are now
implemented; the deferred work here is read-back/UI polish rather than first
write support:

- **Source banner (#341)**: a versioned, machine-parseable comment block
  stamped onto every bundled artifact that leaves the IDE (save-mode push —
  it persists in the PBP source section and is visible in the native editor —
  plus Copy/Download and compiled Shows). Carries kind, id,
  name, a content hash over the pre-banner artifact (drift detection), the
  applied profile transforms, and member patterns for shows. Zero runtime
  cost (comments never reach bytecode); no personal data; ships with its
  inverse parser so later re-ingest is a read-back problem, not a format
  problem. **The pattern name is never touched** — names stay the human
  currency; identity rides machine-facing channels.
- **Branded program ids (#342)**: mint program ids with a short fixed prefix
  (still 17 chars, firmware alphabet) so `listPrograms` alone distinguishes
  PXLBLZ-minted programs — no blob reads. Marks minted programs only;
  overwrite-in-place keeps the bound id, which the banner covers.
- **Map fingerprinting (#343)**: the mapData format has no metadata slot
  (rigid header + exact-size body), so map identity is by content hash —
  record the encoded blob's hash at push, match on read-back, and
  candidate-match by baking Studio maps at the device count. Extends #338
  import with "link to existing map". An LSB coordinate watermark was
  considered and rejected (breaks the what-you-preview-is-what-you-push
  guarantee).
- **Now tasked (§6)**: reading PBP blobs back off a controller (#372) and
  re-ingesting banner metadata through import (#373) — the banner was written
  precisely so this stayed cheap; the "pushed by PXLBLZ" distinction lands as
  the saved-program inventory's owned/foreign split (#369). Still deferred: a
  reserved live-identification exported var (`__px_ide`).

## 5. User libraries arc (decided 2026-07-08, issues #344–#350)

Libraries become the sixth Studio entity: user-creatable **cloud libraries**
beside the read-only stock six, with a LIBS rail mode, a **library mode**
editor flavor, and full compile-path integration. Design decisions are
canonical in `CONTEXT.md` (**Library**, **Library mode**, **Clone**,
**Transpiler**, **Left rail** entries); the short form:

- **Name = namespace** — one identifier-constrained field, unique across
  stock/user/builtin names; rename/delete allowed behind strong confirmation;
  references are soft (dependents fail compile with unknown-namespace).
- **No shadowing** — cloning a stock library mints a fresh namespace
  (`SDF2`); wrapping is the escape hatch for tweaking stock behavior.
- **Out-var contract becomes real** — the bundler emits a library's
  top-level `var` declarations (unmangled, ahead of functions) when any of
  its functions is inlined; library content rule: top level = functions,
  vars, comments only.
- **Library mode** — stock read-only + Clone; cloud auto-save on the sync
  tick; badge = dialect parse + content rule; right pane = live API
  reference generated from the library's own `//` doc comments.
- **Docs scope** — Monaco hover goes store-driven to cover cloud libraries;
  the top-bar Code menu stays stock/builtin-only.

Issue order: #344 rail factor-out and #345 bundler var emission (parallel,
unblocked) → #346 LIBS rail mode → #347 cloud CRUD → #348 clone, #349
compile-path threading, #350 API reference pane + hover (parallel).

## 6. Controller power & saved-program arc (decided 2026-07-09, issues #365–#374)

Seeded by the first hardware validation of the power-cap transform: active
limiting works on the bench, and the same session surfaced an honesty problem
in the power model plus a now-warranted saved-program inventory. Approved
mockups: `controller-verbs-mockup.html` beside this document.

**Duty-first power model (#365, implemented 2026-07-09).** The cap setpoint is output duty cycle,
not milliamps: duty is measured from the values a pattern emits (the
`v × (1 − s/2)` heuristic); milliamps is duty multiplied by assumptions the IDE
cannot verify. The Power panel leads with duty; estimated draw demotes to a
secondary line that states its assumptions. A calculator keeps the amps
intuition — **derived mode** (LED full-white mA/px, controller brightness,
budget amps → duty; inputs stored as provenance) and **direct mode** (type a
duty %; editing duty detaches from derived without discarding provenance).
Pixel count is never an input: the amps equivalence re-renders from the current
count so drift is visible while the duty setpoint stays put. Native brightness
is the boundary constraint of the whole model — deployed pattern code cannot
read it at runtime, but the IDE can over the connection, so it enters as a
configured estimate prefilled from the device (drift nudges possible later).

**Two-window telemetry (#366, implemented).** Per-frame accumulation finalizes
through a composed `beforeRender`; a 2-second block average publishes as the
*recent* figure (a calm readout regardless of poll rate); a fixed-point-bounded
since-start mean remains its companion (`78% / 41%`); and a roughly 250 ms
internal EWMA — deliberately neither display signal — drives the cap. The
since-start scalar weight caps at 16,384 frames to prevent fixed-point overflow
while retaining the intended slow, flattening behavior.

**Live duty cap (#367).** Generated code reads the mutable exported
`__px_powerLimit` instead of baking the constant into every comparison; the
Controller panel gains its one live control, a duty slider in the DeckSlider
idiom. The profile setpoint is the deploy-time default; a re-push restores it.

**Controller popover action row (#374).** The popover is the one surface that
exists only while a controller is connected, so it becomes the home for
controller verbs: Run and Save as action buttons (the editor send control's
glyphs and vocabulary), Profile as explicit chevron navigation — retiring the
ambiguous profile join row. A subject caption ("acts on the open pattern —
<name>") keeps the object honest since the popover opens from anywhere; the
verbs dim with a reason when nothing pushable is open; Profile never dims. The
editor's send control stays as the hot-loop shortcut; the popover row is the
canonical, always-available home.

**Saved-program inventory (#368–#370).** Closes the "what is actually installed
on this controller?" blind spot. Save-mode pushes persist a **push record**
(baked transforms, artifact hash, stamp time) beside the binding (#368) —
run-only pushes stay recordless by design. The profile page gains a Saved
Programs section (#369): the device list joined against bindings and Studio
names; IDE-owned rows first-class and linked, **foreign** rows (descriptive,
not pejorative) dimmed inline under a counted subhead — visible, never behind a
disclosure — and the running program marked. **Freshness** (#370) compares each
record's transforms against the profile's currently enabled transforms; both
inputs are local, so toggling a transform flips badges instantly: current /
stale ("push to update", with the fix as the row action) / unmanaged. This is
what makes push-time transforms trustworthy: enable power-cap and every stale
program says so.

**Read-back and import (#372–#373).** The groundwork already shipped: PBP
decode and the banner parser exist, and the extension relay's get-map pattern
is the template for an HTTP program-blob fetch (#372). Import (#373) mirrors
the map-import flow: IDE-owned programs match-or-recreate their Studio pattern
from recovered source and stamp metadata; foreign programs import best-effort
with recovered-vs-inferred marked; sourceless programs state plainly that they
cannot be imported.

**Transform UX (#371).** Push-time semantics get said out loud: "transforms
take effect when a pattern is pushed" beside the Global Transforms table, plus
per-transform plain-language descriptions. Power-cap coverage remains `hsv`
call sites; `rgb` coverage stays a later decision.

**Perceptual duty shaping (recorded, not tasked).** The duty-first cap above is
the safety/control mechanism and continues to scale output uniformly. A later
optional efficiency layer may preserve more apparent detail at the same duty by
compressing only highlights, reducing the common RGB white component, or
illuminating a well-distributed subset of pixels. These choices intentionally
trade different kinds of visual fidelity; none is selected yet. Compare them on
hardware, including diffuser-dependent density masks, after the output-finalizer
and RGB-coverage decisions in §1. Do not fold them into #365–#367 by stealth.

## 7. Map geometry & coordinate-space arc (decided 2026-07-10; epic #388, issues #391–#396)

At the start of this arc, the layout system's coherent first cut exposed its
history: 1D Patterns received no map coordinates, maps were filtered to the
Pattern's highest render-function dimensionality, renderer fallback only dropped
coordinates, and Cylinder existed only as a 2D viewport Surface even though the
resolved layout already knew its 3D points. Pixelblaze firmware 3.66 added true
1D maps and broadened cross-dimensional renderer selection, so PXLBLZ-IDE is
catching up to hardware and turning the existing `sample` / `pos` split into a
more flexible product model. Issues #391 and #392 have now delivered true 1D maps
and cross-dimensional browser preview; #393 now supplies matching hardware-safe
generated artifacts, leaving the Cylinder geometry-family tracer (#394) next.

### Durable model: three independent axes

1. **Pattern render capabilities** are the set of functions the Pattern defines:
   `render`, `render2D`, and/or `render3D`. The Pattern's highest function remains
   useful metadata, but no longer filters which maps the user may try.
2. A **Pixel map coordinate view** owns `sample`: Strand `[x]`, Surface `[u,v]`,
   or Spatial `[x,y,z]`. With no installed 1D map, `x` follows the conventional
   normalized index. One selected view is still one ordinary Pixelblaze map on
   hardware.
3. A **geometry / embedding** owns `pos`: where the LED is drawn in the preview.
   A generated geometry may know both a meaningful parameterization and its
   physical positions; imported/custom maps may know only the coordinate list
   they actually contain.

The resolved point keeps the channels separate:

```ts
{
  sample: [x] | [u, v] | [x, y, z],
  pos: [x, y] | [x, y, z]
}
```

The Pattern observes only `sample`; the viewport observes only `pos`. A
preview-only embedding remains preview-only. When the user explicitly selects a
generated geometry's Spatial view, however, those XYZ positions become the
chosen map's `sample` as well and are therefore real coordinates that may be
sent to a Controller.

### Geometry families and coordinate views

Catalogue a generated geometry once, then expose the coordinate views it can
meaningfully provide instead of maintaining unrelated dimension-specific
copies. A selected view must resolve to plain Pixelblaze-compatible map source /
points so preview and hardware share the same coordinate contract.

- Every ordered generated geometry can offer **Strand (1D)** progress.
- Every generated geometry with known physical positions can offer **Spatial
  (3D)** XYZ coordinates.
- Offer **Surface (2D)** only when the generator owns an intentional UV-style
  parameterization. Do not pretend an arbitrary imported XYZ cloud can be
  unwrapped reliably.
- **Shell** and **volume** remain different point distributions, not coordinate
  views of one distribution. A shell expressed as XYZ is a valid 3D map without
  filling its interior.
- Imported and hand-authored custom maps remain honest single coordinate sets
  unless they carry explicit generator metadata; no automatic geometry
  inference or schema migration is required.

Cylinder is the tracer geometry. One cylinder-surface point set should support:

- **Strand** — ordered progress for 1D chases;
- **Surface** — circumference × height for wrapped 2D Patterns; and
- **Spatial** — normalized XYZ points on the cylinder wall for 3D Patterns.

This adds the currently missing 3D Cylinder map without duplicating its geometry
or confusing it with a **Cylinder volume**, which would be a separate generator
that distributes points through the interior.

No new volume generators belong to the immediate arc. The existing Cube,
Sphere, Star, and Tetra volume maps already demonstrate the category. Cylinder
Volume may be useful later for physical LED towers, tubes, or lamps, but it is
recorded only as a possible future installation-driven addition.

### Catalogue and progressive disclosure

As the catalogue grows, organize geometry families by what they are:

- **Paths** — Line, Ring, Pole, Helix;
- **Surfaces** — Plane/Grid, Cylinder, and later selected parameterized forms;
- **Shells** — Sphere, Cube, Star, Tetra, and future boundary distributions;
- **Volumes** — the existing filled distributions; and
- **Custom / imported** — user-authored and measured installations.

The ordinary path stays small. PXLBLZ-IDE automatically chooses the natural
coordinate view and renderer, showing exact-dimensional choices first as
**Recommended**. An **Other dimensions** group exposes the remaining maps and
coordinate views for experimentation. The UI may grow grouped menus/submenus as
the catalogue warrants them, but it should not present every geometry ×
coordinate-view combination as an unrelated top-level row.

Do not add a manual render-function selector initially. The current stock Pattern
corpus defines one render function per Pattern, and firmware's deterministic
selection policy is the more understandable default. A concise status line may
explain an adapted combination, for example: “Using `render3D` with a 2D map;
missing `z` is 0.5.”

### Renderer compatibility and hardware honesty

Match the renderer preference introduced by Pixelblaze firmware 3.66:

| Active map | Renderer preference |
| --- | --- |
| None / 1D | `render` → `render3D` → `render2D` |
| 2D | `render2D` → `render3D` → `render` |
| 3D | `render3D` → `render2D` → `render` |

Exact arity wins. Extra coordinates are dropped; intended missing coordinates
default to `0.5`. `has2DMap()` / `has3DMap()` report the map actually installed,
not the renderer selected or the preview display dimension.

PXLBLZ-IDE must make browser preview and downloaded hardware behavior agree. A
V3 Standard running firmware 3.67 was observed passing following-point data into
missing arguments for 2D→`render3D` and 1D→higher-dimensional fallback; this has
been reported to ElectroMage without claiming which firmware version introduced
it. The generated-artifact path should not depend on that behavior: synthesize an
exact-arity adapter where necessary (for example, a `render2D` wrapper calling
the original 3D renderer with `z = 0.5`). Preserve a firmware-policy seam so
pre-3.66 Controllers can receive an honest unsupported warning or compatible
artifact rather than silently receiving a map/render combination they cannot
run.

### Decided implementation arc — address in this order

1. **True 1D maps end to end (#391) — implemented 2026-07-10.** Author, bake,
   select, preview, persist, import, and send `[x]` maps; deliver mapped `x` to
   `render(index, x)` and cover reversed, uneven, and discontinuous strands.
   Index and real 1D maps remain independent from Line/Ring/Pole. (The later #392
   selector now keeps Map visible because it also exposes 2D/3D choices.) Known
   pre-3.66 Controllers reject 1D map transfer; 3.67 device
   read-back verified a 256-point reversed/discontinuous payload and exact
   restoration of the prior map.
2. **Any map dimension in preview (#392) — implemented 2026-07-10.** Replaced
   native-dimension filtering and the one-way handle fallback with a pure
   compatibility matrix, Recommended / Other dimensions grouping, map-led
   Shape/Surface selection, exact map predicates, centered missing coordinates,
   deterministic dropped extras, and adapted-combination status. An internal Auto
   sentinel preserves exact-dimensional defaults until the user explicitly picks
   another dimension; no manual renderer selector was added.
3. **Hardware-safe cross-dimensional artifacts (#393) — implemented 2026-07-10.**
   Generated exact-arity missing-coordinate adapters from the live Controller's
   installed map, recorded +1 call/pixel cost and provenance in artifact
   inspection, included map dimension in the dirty signature, and added a
   pre-3.66 capability guard. Reversible 256-pixel hardware sentinels passed 1D
   → `render2D`, 1D → `render3D`, 2D → `render3D`, and 3D → `render2D`, then
   restored the original map byte-for-byte and active Pattern.
4. **Cylinder geometry-family tracer (#394).** Preserve one physical point generator,
   expose Strand / Surface / Spatial coordinate views, materialize the selected
   view as real map points/source, and verify all three in preview and on
   hardware. The coordinate-view control gets a human visual checkpoint before
   its final layout is accepted.
5. **Scalable catalogue organization (#395).** Group Paths, Surfaces, Shells, Volumes,
   and Custom/imported geometry in the preview and Maps surfaces without
   multiplying top-level rows for every coordinate view.
6. **Retrofit cheap views across the existing catalogue (#396).** Apply the proven
   geometry-family contract wherever the generator already owns enough
   information (ordered Strand and known-position Spatial views broadly;
   Surface only for intentional parameterizations), with no new volume
   generators in this slice.

Every issue is a vertical slice: pure engine policy and tests, the thinnest UI
needed to exercise it, preview behavior, hardware artifact/map behavior where
applicable, and docs updated as behavior ships. The existing `sample` / `pos`
architecture remains the seam; this arc generalizes what may own and derive each
channel rather than collapsing them.

### Recorded later directions — no implementation issue yet

- New generated Paths/Surfaces such as Cone and Torus, chosen for actual Pattern
  and installation value after the Cylinder contract proves itself.
- Cylinder Volume or other new filled geometries when a physical installation or
  flagship Pattern justifies their distribution and wiring rules.
- Assisted fitting/unwrapping of imported point clouds; never implicit in the
  first version because axis, origin, topology, and seam are ambiguous.
- A manual renderer override only if multi-renderer Patterns become common enough
  that firmware's automatic choice is insufficient.

## 8. Out of scope for v2

- Automated GLSL→Pixelblaze translation (unchanged from v1 stance).
- Device settings management (Wi-Fi, LED type, timezone) from the IDE.
  (Reading patterns back from a controller left this list 2026-07-09 — see
  §6.)
- The fluent composition DSL, low-res wash sampling, geometric pattern
  language (deferred, see §1).
- Continuous sync of hardware control positions back into preview controls.
- Public sharing/publishing of *personal* patterns beyond built-in gallery
  slugs.
- Multi-controller synchronized shows (Firestorm territory).

## 9. Sequencing

The old v2 sequence through #343 is substantially complete. Current remaining
work should be ordered by dependency rather than by the historical arc:

0. **User libraries arc** (§5, #344–#350): #344/#345 can start immediately;
   the rest follow the dependency chain above.
1. **Controller power & saved-program arc** (§6, #365–#374): #365, #368, #369,
   #371, #372, and #374 are unblocked and parallelizable; the chains are
   #365 → #366 → #367 (shared mixin source), #368 + #369 → #370, and
   #369 + #372 → #373.
2. **Temporal control & masked evaluation arc** (§1, epic #375): #376 exact-zero
   time ramps → #377 feathered route wipe → #378 masked-evaluation light shutter
   → #379 stepped clock → #380 per-zone time offset. Real blockers are narrower:
   #376 blocks #378/#379, and #379 blocks #380; #377 can start independently.
3. **Map geometry & coordinate-space arc** (§7, epic #388): #391 true 1D maps →
   #392 cross-dimensional preview → #393 hardware-safe adapters → #394 Cylinder
   coordinate-view tracer → #395 catalogue organization → #396 cheap views
   across existing generators.
4. **Bench-validation batch**: #336 zone-spanning ramp check, #289 analog pot
   validation after rewiring (power-cap validated 2026-07-09).
5. **Mixin/control maturity**: finish #319's consumption/UI plumbing for
   `sensor-pulse` and `night-scheduler`, using #294's binding surface where
   natural.
6. **Cost model and artifact inspection maturity**: deepen the transform/show
   cost model, then keep #293-style generated-artifact inspection aligned with
   the richer pass stack.
7. **Stage authoring later**: #340 marquee zone creation, after the shipped
   stage preview has enough real use to justify direct spatial editing.
8. **Platform/release polish**: close stale issue-state gaps, then switch the
   README and public entry points to the Cloudflare deployment when the v2 arc
   is ready for public cutover.

Each step should leave the app shippable.

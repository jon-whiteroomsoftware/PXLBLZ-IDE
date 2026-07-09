# PXLBLZ v2 — Product Requirements (remaining work)

**Status, July 2026.** Most of v2 has shipped: the routing layer, the public
Gallery and pattern detail pages, the five-entity Studio rail, the Mixins
entity, Controller profiles with device-id identity, the generic pass engine,
hardware-control/power transforms, Shows v1, stage previews, artifact
provenance, analytics, and multi-provider auth (GitHub + Google with linking).
Shipped behavior is documented in the **PXLBLZ Technical Reference** and
**Feature Guide** (`docs/reference/`) and is no longer specified here. This
document now holds only what remains: Show maturity beyond the shipped v1,
unfinished corners of shipped surfaces, platform residuals, and open questions.

Mockups for every v2 screen (approved July 2026) remain in
`pxlblz-v2-mockups.html` beside this document — still the visual reference for
the shipped Maps/Shows surfaces and deferred future Show states.

---

## 1. Shows residual arc

The shipped Show baseline is no longer specified here. In current code, Shows are
D1-backed personal content with a scene-strip editor, show-local zones, optional
target Controller profile, per-show stage map, generated-source inspection,
Controller push, hold/restart semantics, adaptation ramps, crossfade,
wipe/dither route transitions, zone routing, zone spanning, per-zone preview
strips, spatial stage preview, and imported-controller-map stage support. See
the reference docs for exact behavior.

The remaining Show arc is about maturity: richer adaptation sources, more spatial
authoring, better cost honesty, and later timeline/DSL affordances. The durable
model remains:

- **Model**: zone tracks (semantic names, resolved through the target
  Controller's zone map) holding **clips** (references to patterns, never
  copies) with durations, **transitions** between clips (cut, crossfade,
  wipe, dither, and future transition types), an optional overlay track, and
  per-clip **adaptations** (palette, mirror, phase offset, brightness
  envelope, and similar post-processing) that never fork the source pattern.
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
- **Editor direction** (decided 2026-07-08): the v1 Show editor is a **scene
  strip**, not a timeline — scenes as columns, zones as rows, a cell holds a
  pattern plus its adaptations, and transitions are first-class column
  separators glyphed by cost. Scene durations plus hold spans are the only
  time arithmetic v1 exposes. The underlying data model is nonetheless an
  **arrangement** (clips with start/duration on zone tracks), so the strip is
  a projection where boundaries happen to align; a zoomable timeline can
  arrive later as a second view on the same data, no migration. A cell can
  span rows (**zone spanning**: adjacent zones act as one canvas — one
  domain — versus two independently re-normalized domains). The current
  canonical mockups include the scene strip, hold explainer, timeline
  frame-out, and Controller zones card. The shipped 2026-07-09 scene-strip
  overhaul is captured in `docs/plans/shows-editor-overhaul-mockup.html`: one
  pane-owned header, recessed strip surface, zone-colored clips, transition
  seams, ghost growth affordances, and one selection-driven inspector.
- **Hold vs restart at scene boundaries** (decided 2026-07-08): never a
  per-clip setting — it's geometry. A cell spanning a boundary **holds**: the
  clip keeps playing with phase intact and the compiler emits nothing for
  that zone at the boundary. Two separate cells **restart** (second instance,
  fresh time base). When adjacent scenes hold the same pattern the default is
  to keep playing undisturbed, and a transition placed on that boundary
  compiles to an **adaptation ramp** over the continuous clip — palette,
  brightness, mirror, phase parameters interpolate across the transition
  window while one renderer runs, phase undisturbed. Same-pattern transitions
  are therefore parameter-cheap and never open a 2-renderer window.
- **Compilation**: a Show compiles to a single generated Pixelblaze pattern
  over alpha-renamed members. **Time-slicing is the default emission strategy**:
  steady-state runs only the active clip's `beforeRender`/render; both renderers
  evaluate only inside a crossfade window. Route transitions and routed zones
  are one-renderer-per-pixel paths in the shipped compiler.
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
clips-per-show ceiling). It should also admit **negative-cost adaptations**
(decimation, interlacing, hold buffers — see the ideas ladder below), which buy
budget rather than spend it.

**Hardware validation still batches best.** Remaining bench checks include
zone-spanning ramps on hardware, power-cap validation, and analog pot validation
after rewiring to an ADC1-safe input. These are validation gates, not blockers
on the shipped editor/compiler model.

### Automation & adaptation ideas ladder (recorded 2026-07-08)

An ideation pass over what Shows can automate, ordered from most tactical
(cheap, near-term, likely to shape v1.x) to most speculative. Nothing here is
a v2 commitment beyond what §1 already specifies; it is recorded so the cost
model, pass taxonomy, and Show editor leave room for these directions.

**Pass 1 — tactical, biggest bang for the buck:**

- **Clip time-base control.** Every pattern consumes `delta`/`time()`, so
  scaling or warping the clock a clip sees is a universal tier-1 lever —
  speed ramps, slow-motion, freeze-frame, stutter/strobe — that works even on
  patterns exporting no controls. One multiply per frame. (The synthetic
  preview already has a speed control; this is its on-device analogue.)
- **Per-zone time offset (canon).** The same clip in every zone with
  staggered clocks — a musical round, symmetric choreography — with no second
  renderer.
- **Clip-relative progress.** Expose `clipTime`/`clipProgress` (0→1 over the
  clip's duration) as a modulation source, making entry/exit envelopes
  trivial: intensity attack on entry, dim-and-desaturate outro that lands
  exactly on the cut.
- **Wipes and dither dissolves repriced as route transitions.** A wipe
  animates the route boundary so each pixel runs exactly one renderer; a
  dither dissolve hashes `index` against an animated threshold. Both cost
  steady-state plus a comparison, versus a crossfade's both-renderers window.
  Given the #314 finding that both-running is much slower than time-sliced,
  wipe/dither may deserve to ship before (or immediately after) crossfade.
- **Amortized wrapper stack.** The output wrapper's per-call cost (#314) is
  fixed, so one intercepted `hsv` should host the whole scalar stack — hue
  shift + saturation scale + brightness envelope + power accumulation. The
  cost model charges the wrapper once, then near-zero per additional op.

**Pass 2 — clear value, modest engine work:**

- **Modulation sources** for parameter automation: LFOs (`wave()` is right
  there), perlin drift for organic wander, sample-and-hold, envelopes
  triggered at clip boundaries.
- **Animated domain transforms.** Scroll/translate, rotation, zoom,
  kaleidoscope folds, polar wrap (any linear pattern becomes radial),
  wave-warp distortion, jitter. Their parameters (angle, zoom, offset) are
  per-frame scalars — i.e. tier-1 automatable — and frame-invariant setup
  (sin/cos) hoists into `beforeRender`. Animated domain transforms are the
  cheap route to Ken Burns-style motion over any static pattern
  (~1–2 ops/pixel).
- **Show-wide buses.** One macro knob or LFO fanned out to corresponding
  controls across all clips ("global energy"); "night mode" as a bus =
  schedule-driven color-temperature shift + brightness cap + speed reduction.
- **Negative-cost adaptations** as first-class citizens: decimation (N pixels
  share one evaluation — a chunky pixelated look *and* an N× cost cut),
  interlacing (evaluate half the pixels per frame), per-clip frame-rate caps,
  and freeze-a-zone hold buffers (an array traded for near-zero steady-state
  cost). These are what let an ambitious show fit the device.

**Pass 3 — valuable, more speculative (memory- and sensor-dependent):**

- **Snapshot crossfade.** Capture the outgoing clip's last frame to an array
  and fade from the static snapshot while only the incoming renderer runs
  live — one live renderer during the transition window, memory traded for
  cycles.
- **Trails intercept.** One output wrapper with a decay buffer
  (`out[i] = max(new, old*k)`) gives any pattern motion blur, comets, and
  paint/hold modes — probably the highest-value tier-4 adaptation after power
  limiting. Mind the firmware array constraints.
- **Sensor/live-driven modulation.** Sensor-board inputs (energy, FFT bands,
  accelerometer), time-of-day schedules, and a small live `setVars` control
  surface over the websocket. Beat-quantized transitions fall out of the
  shared merged time base: quantize cut triggers to `time()` phase
  boundaries so cuts land on the bar.
- **Sparse overlays.** Overlays costed by coverage (pixels touched), not
  presence — a scanner sweep or beat flash over a base clip is cheap
  composition.

**Pass 4 — wildly speculative:**

- **Cross-pattern modulation routing.** Because a Show compiles to one
  artifact with alpha-renamed globals, pattern A's exported state is readable
  by pattern B's bindings — patch-cable modulation (A's energy drives B's
  hue) that separate-pattern playlist systems categorically cannot do.
  Architecturally cheap, hard to surface in UI, easy to defer.
- **A full modulation matrix / automation-curve editor** in the Show editor.
- **Generative show composition** — rules or constraints choosing clips and
  adaptations — several rungs above the already-deferred fluent DSL.

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
  one-click push of a whole set. Not yet tasked; the device playlist is
  readable/writable over the existing protocol.
- **Hardware-input live readout** — the Inputs table's Live column is a
  placeholder; when the device is connected it should show the input's
  current value.
- **Mixin pack residuals (#319)** — power-cap is now real and wired into the
  push recipe for enabled profile transforms: it intercepts `hsv`, estimates
  draw from `lastKnownPixelCount` at 60 mA/pixel, exports reserved
  `__px_power*` telemetry (rendered as a structured Power panel on the
  Controller page, hidden from generic watched vars), and scales output when
  over budget. `sensor-pulse` and `night-scheduler` ship as real, readable
  stock sources. Remaining: hardware validation of power-cap; consumption
  plumbing/UI for `sensor-pulse` and `night-scheduler` beyond cloneable
  source (the #294 binding surface is the natural home); output-sink
  coverage beyond `hsv` if power measurement should apply to `rgb` patterns.
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
- **Deferred**: reading PBP blobs back off a controller to re-ingest banner
  metadata (the banner is written now precisely so this stays cheap later); a
  reserved live-identification exported var (`__px_ide`); a "pushed by
  PXLBLZ" badge on the Controller program list (natural #342 follow-up).

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

## 6. Out of scope for v2

- Automated GLSL→Pixelblaze translation (unchanged from v1 stance).
- Reading patterns back from a controller; device settings management.
- The fluent composition DSL, low-res wash sampling, geometric pattern
  language (deferred, see §1).
- Continuous sync of hardware control positions back into preview controls.
- Public sharing/publishing of *personal* patterns beyond built-in gallery
  slugs.
- Multi-controller synchronized shows (Firestorm territory).

## 7. Sequencing

The old v2 sequence through #343 is substantially complete. Current remaining
work should be ordered by dependency rather than by the historical arc:

0. **User libraries arc** (§5, #344–#350): #344/#345 can start immediately;
   the rest follow the dependency chain above.
1. **Bench-validation batch**: #336 zone-spanning ramp check, #319 power-cap
   validation, #289 analog pot validation after rewiring.
2. **Mixin/control maturity**: finish #319's consumption/UI plumbing for
   `sensor-pulse` and `night-scheduler`, using #294's binding surface where
   natural.
3. **Cost model and artifact inspection maturity**: deepen the transform/show
   cost model, then keep #293-style generated-artifact inspection aligned with
   the richer pass stack.
4. **Stage authoring later**: #340 marquee zone creation, after the shipped
   stage preview has enough real use to justify direct spatial editing.
5. **Platform/release polish**: close stale issue-state gaps, then switch the
   README and public entry points to the Cloudflare deployment when the v2 arc
   is ready for public cutover.

Each step should leave the app shippable.

# PXLBLZ v2 — Product Requirements (remaining work)

**Status, July 2026.** Most of v2 has shipped: the routing layer, the public
Gallery and pattern detail pages, the five-entity Studio rail, the Mixins
entity, Controller profiles with device-id identity, the generic pass engine
with hardware-brightness injection, and multi-provider auth (GitHub + Google
with linking). Shipped behavior is documented in the **PXLBLZ Technical
Reference** and **Feature Guide** (`docs/reference/`) and is no longer specified
here. This document now holds only what remains: Shows and its prerequisites,
the unfinished corners of shipped surfaces, and open questions.

Mockups for every v2 screen (approved July 2026) remain in
`pxlblz-v2-mockups.html` beside this document — still the visual reference for
the shipped Maps context pane and the unbuilt Show editor.

---

## 1. The remaining arc: Shows

A Show composes existing patterns into one deployable artifact. Its model:

- **Model**: zone tracks (semantic names, resolved through the target
  Controller's zone map) holding **clips** (references to patterns, never
  copies) with durations, **transitions** between clips (crossfade first;
  wipes later), an optional overlay track, and per-clip **adaptations**
  (palette, mirror, phase offset, brightness envelope, and similar
  post-processing) that never fork the source pattern.
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
  domain — versus two independently re-normalized domains). Design sketches
  2026-07-08 (scene strip, hold explainer, timeline frame-out, Controller
  zones card) to be folded into `pxlblz-v2-mockups.html`.
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
  via the pass engine (route + blend + intercept passes over alpha-renamed
  members). **Time-slicing is the default emission strategy**: steady-state
  runs only the active clip's `beforeRender`/render; both renderers evaluate
  only inside a transition window.
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
- **Preview**: the Studio preview renders the show timeline with zone
  boundaries visible; full multi-zone spatial preview can start simple
  (per-zone strips) before attempting installation geometry. Zones should be
  **solo-able** in the preview ("show me only arch-left") — useful as a
  debugging affordance as soon as zone maps exist, before any Show does.
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
- **v1 slice**: two clips + one crossfade on a single zone, compiled and
  verified on hardware (#316). Segment routing to named zones is the second
  slice (#317). Show editor v1 (scene strip, clip inspector, compile/budget
  bar) is #318.
- **Deferred**: the fluent/Strudel-style composition DSL (the recipe IR is the
  v1 authoring format, edited through the Show editor UI); low-resolution wash
  sampling; the geometric pattern language; a read-only `zoneIndex`/`zoneCount`
  injection for patterns that deliberately want per-zone behavior (escape
  hatch — the default remains zone-ignorant patterns); zone import from a
  device's `/obconf.dat` expander config. Recorded as later directions, not
  v2 commitments.

### Prerequisites (in order)

1. **Scope-aware alpha-renaming design note** (#315, ready-for-human). The
   pass engine's one genuinely new capability for Shows: renaming *all* of a
   pattern's globals collision-free so N patterns merge into one artifact.
   The note must settle: renaming globals/`t`/exported controls across N
   merged patterns; the semantics of N `beforeRender` time bases under
   pause/resume (freeze vs advance); how exported controls from member
   patterns surface (or don't) on the generated show pattern. Today's engine
   has only generated-name collision avoidance and scope-aware call-site
   rewriting — not whole-pattern renaming.
2. **route and blend passes** — specified in the pass taxonomy (route: gate
   render by index range / named zone; blend: transition mixer between two
   renderers) but not yet implemented; the engine's recipe union is
   inject/intercept/bind only. The route pass also hands the clip
   **zone-local coordinates** — each zone re-normalized to its own frame
   (centre-origin, unit-fit, per the project uv convention) so an unmodified
   pattern renders inside a zone as if the zone were its whole world, and
   per-zone adaptations like mirror become plain coordinate transforms.
   1D re-normalization (index/count) is the v1 shape; 2D zone-local frames
   over a pixel map follow. This route/domain-transform path is also the
   desired cheap implementation for duplicated virtual screens (for example,
   one strip split into two mirrored or repeated half-size screens), reverse,
   mirror, and zone phase offsets.
3. **Perf-harness spikes** (#314, runnable now, no new hardware work):
   wrapper-indirection cost (wrapped vs direct `hsv`, per pixel); device
   budgets (max pattern code size, global/array count limits,
   exported-control limit → the clips-per-show ceiling); two real renderers
   merged (steady-state FPS, time-sliced vs both-running, 300–1000 px rig).
   First findings are committed in
   `docs/plans/archive/issue-314-perf-harness-spikes.md`: output wrappers have
   a meaningful per-call cost, both-running renderers are much slower than
   time-sliced steady state, and the current 256-pixel controller run still
   needs a 300+ pixel rerun before #314 is final.
4. **A real per-pixel cost model.** `estimatedPixelCost` in the transform
   summary is a placeholder (call-site count); Shows' budget bar needs it
   grounded in the perf-spike measurements and able to distinguish parameter
   automation, domain transforms, output interception, and multi-render
   composition. The model should track three axes, not one: **cycles**
   (per-frame vs per-pixel vs per-output-call, crediting `beforeRender`
   hoisting of frame-invariant setup), **memory** (arrays are a separate hard
   budget), and **code size / exported-control count** (the clips-per-show
   ceiling). It should also admit **negative-cost adaptations** (decimation,
   interlacing, hold buffers — see the ideas ladder below), which buy budget
   rather than spend it.

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

**Maps context pane** (approved design, mockup tab 4 — built by #330):

- The Maps view's right pane should dock the **wiring check** — a static
  render of the map in its true shape for its arity, pixels colored by a
  gradient following wire order, indices at endpoints and intervals ("did I
  wire this in the right order?"). Redraws on each successful compile; on a
  parse error the badge flips and the render greys, holding last-good state.
  Never a pattern renderer. Below it: map facts (pixel count, arity, bounds)
  and provenance (which Controllers use the map, how many patterns use it).
  Supersedes #153, whose geometry-render idea it absorbs. 3D maps use the
  orbitable 3D viewport vocabulary from the pattern preview rather than a fixed
  projection.

**Rail**:

- The **Controllers view now suppresses the pattern preview** with an empty
  context placeholder; collapse/remove that right slot later if the placeholder
  feels like wasted space.
- Factor the monolithic `PatternList.tsx` (~1,400 lines) into a shared rail
  shell + per-entity list modules.

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
- **power-cap on push** — the transform is stored, toggleable, and has stock
  mixin source, but the push recipe only applies hardware-brightness today.
  Same for `sensor-pulse` / `night-scheduler` consumption (#319 covers the
  pack's real implementations; power-cap's mixin body is a passthrough
  placeholder).
- **Binding target validation** — "missing targets warn loudly" is only
  partly realized: a binding referencing a missing *input* is flagged, but
  target slider/function/variable names are free text, unchecked against the
  bound pattern.
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
- Whether the Controllers page grows a context pane occupant (push history /
  last transform summary) or full-width simply feels fine.
- The mixin pass-kind badge vocabulary in the UI (inject/intercept/bind is
  engine truth; whether users need friendlier words is unsettled).

## 3. Platform remainder

**Analytics (#322)** — not started (`src/analytics/` is empty). Lightweight
product analytics on the v2 deployment (likely Google Analytics). Verify what
default instrumentation captures (page views per route matter most: gallery
landings, pattern detail views, studio sessions); add explicit events only
where defaults fall short (e.g. Send to Controller, clone). v1's only signal
was landing counts; v2 should at least distinguish browsing, authoring, and
hardware use.

**Cutover** — the repo README still points at v1 on GitHub Pages; the switch
to the Cloudflare deployment waits until this arc is finished.

## 4. Out of scope for v2

- Automated GLSL→Pixelblaze translation (unchanged from v1 stance).
- Reading patterns back from a controller; device settings management.
- The fluent composition DSL, low-res wash sampling, geometric pattern
  language (deferred, see §1).
- Continuous sync of hardware control positions back into preview controls.
- Public sharing/publishing of *personal* patterns beyond built-in gallery
  slugs.
- Multi-controller synchronized shows (Firestorm territory).

## 5. Sequencing

1. Maps context pane (#330) · #322 analytics — independent, any order.
2. #315 renaming design note → route/blend passes → #314 perf spikes feed the
   cost model.
3. #316 show compile vertical → #317 segment routing → #318 Show editor v1
   (scene strip) → #319 built-in mixin pack.
4. Off the #316/#317 trunk, in rough value order: #335 hold spans &
   adaptation ramps and #334 wipe/dither transitions (both compiler-side,
   blocked by #316); #337 per-zone preview strips and #336 zone spanning
   (blocked by #317); #333 show-local zones (blocked by #317 + #318).
5. Stage arc (PRD §1 "Stage"): #338 import controller map as a named user
   map (independent) → #339 per-show stage choice + spatial zone preview
   (blocked by #337 + #338) → #340 stage marquee zone creation (deferred).

Each step leaves the app shippable.

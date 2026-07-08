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
the unbuilt screens (Maps context pane, Show editor).

---

## 1. The remaining arc: Shows

A Show composes existing patterns into one deployable artifact. Its model:

- **Model**: zone tracks (semantic names, resolved through the target
  Controller's zone map) holding **clips** (references to patterns, never
  copies) with durations, **transitions** between clips (crossfade first;
  wipes later), an optional overlay track, and per-clip **adaptations**
  (palette, mirror, phase offset, brightness envelope, and similar
  post-processing) that never fork the source pattern.
- **Compilation**: a Show compiles to a single generated Pixelblaze pattern
  via the pass engine (route + blend + intercept passes over alpha-renamed
  members). **Time-slicing is the default emission strategy**: steady-state
  runs only the active clip's `beforeRender`/render; both renderers evaluate
  only inside a transition window.
- **Budget honesty**: the editor surfaces compiled artifact size against the
  measured device budget and an estimated FPS at the target pixel count,
  fed by the transform summary's cost model. Compositions that exceed the
  target device's limits warn before push.
- **Inspectability**: "View generated pattern" opens the compiled artifact
  read-only. A Show is ultimately a plain Pixelblaze pattern you could paste
  anywhere.
- **Preview**: the Studio preview renders the show timeline with zone
  boundaries visible; full multi-zone spatial preview can start simple
  (per-zone strips) before attempting installation geometry.
- **v1 slice**: two clips + one crossfade on a single zone, compiled and
  verified on hardware (#316). Segment routing to named zones is the second
  slice (#317). Show editor v1 (zone timeline, clip inspector, budget bar) is
  #318.
- **Deferred**: the fluent/Strudel-style composition DSL (the recipe IR is the
  v1 authoring format, edited through the Show editor UI); low-resolution wash
  sampling; the geometric pattern language. Recorded as later directions, not
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
   inject/intercept/bind only.
3. **Perf-harness spikes** (#314, runnable now, no new hardware work):
   wrapper-indirection cost (wrapped vs direct `hsv`, per pixel); device
   budgets (max pattern code size, global/array count limits,
   exported-control limit → the clips-per-show ceiling); two real renderers
   merged (steady-state FPS, time-sliced vs both-running, 300–1000 px rig).
4. **A real per-pixel cost model.** `estimatedPixelCost` in the transform
   summary is a placeholder (call-site count); Shows' budget bar needs it
   grounded in the perf-spike measurements.

## 2. Unfinished corners of shipped surfaces

Reference docs describe these surfaces as they are; this list is what's still
intended.

**Maps context pane** (approved design, mockup tab 4 — unbuilt):

- The Maps view's right pane should dock the **wiring check** — a static
  render of the map in its true shape for its arity, pixels colored by a
  gradient following wire order, indices at endpoints and intervals ("did I
  wire this in the right order?"). Redraws on each successful compile; on a
  parse error the badge flips and the render greys, holding last-good state.
  Never a pattern renderer. Below it: map facts (pixel count, arity, bounds)
  and provenance (which Controllers use the map, how many patterns use it).
  Supersedes #153, whose geometry-render idea it absorbs. Today the Maps view
  still shows the live pattern preview in that pane.

**Rail** (#326 in flight on `codex/issue-326-one-rail-header`):

- **One header per list**: entity title row carries ＋ (and the lens for
  Patterns/Maps); only a revealed stock section earns a subheader. Built for
  Mixins only; Patterns/Maps/Controllers still render double headers.
- The **Controllers view should ship without a right context pane** (punt,
  revisit in use); today it still shows the pattern preview pane.
- Factor the monolithic `PatternList.tsx` (~1,400 lines) into a shared rail
  shell + per-entity list modules.

**Pattern detail / Gallery residuals** (specified, not built):

- **Copyable URL** affordance on the detail page (the `/p/<slug>` is shown as
  static text).
- **Pattern description** on the detail page (no description field exists).
- **Settings carry into Clone**: detail-page slider/embedding tweaks are meant
  to ride into the Studio copy via the settings cascade; today
  `galleryCloneRecord` drops them (the in-Studio demo fork does carry them).
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

- Whether the **Patterns** list also gets a show-stock reveal (useful for
  future playlist management; many stock patterns). Deferred.
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

1. #326 lands (in flight) · Maps context pane (needs an issue) · #322
   analytics — independent, any order.
2. #315 renaming design note → route/blend passes → #314 perf spikes feed the
   cost model.
3. #316 show compile vertical → #317 segment routing → #318 Show editor v1 →
   #319 built-in mixin pack.

Each step leaves the app shippable.

# PXLBLZ v2 — Product Requirements

**The whole document in two sentences.** v2 turns PXLBLZ from a pattern editor
into a pattern *platform*: a public Gallery for browsing and sharing patterns, a
Studio organized around five entity kinds (Patterns, Maps, Mixins, Controllers,
Shows), and one generic transpiler pass engine that powers hardware control
injection, output shaping, and pattern orchestration. Everything the system
generates stays inspectable — mixins are readable source, generated artifacts
are viewable, and transforms report what they did.

This PRD supersedes and replaces three earlier planning docs (the v2 direction
handoff, the orchestration ideas capture, and the hardware control injection
PRD); their surviving content is folded in below. Mockups for every v2 screen
were reviewed and approved in July 2026 — see `pxlblz-v2-mockups.html` beside
this document (open in a browser: Gallery, pattern detail, Studio nav, Maps,
Controller, Mixin, Show editor).

---

# Part 1 — The model

## 1. Why v2

The v1 launch retro concluded that the addressable audience for a pattern
*editor* is a small subset of a small community, while the features with broad
appeal are consumable by non-developers: the patterns themselves, and the
ability to adapt, combine, and deploy patterns without writing code. v2 shifts
value from "editor for authors" toward "compositor/adapter for consumers",
while keeping the editor core intact for the authoring minority.

Infrastructure is already in place: the Cloudflare Pages + D1 deployment with
GitHub OAuth is live, personal patterns/maps/settings are cloud-backed, and
signed-out use is a non-durable demo mode. v1 stays frozen on GitHub Pages.

## 2. The two surfaces

- **Gallery** — the public, signed-out-friendly face. A browsable grid of live
  animated pattern cards; each pattern gets a shareable URL with a large
  preview, the pattern's own controls, and Send to Controller — no editor in
  sight. This is the page a forum link lands on.
- **Studio** — the signed-in working environment. The three-pane IDE (rail,
  editor, preview) survives, but the rail is rebuilt around the user's own
  entities, with built-in content receding into a catalog you pull from.

## 3. The five entities

The Studio rail becomes an activity strip + list pane over five entity kinds:

| Entity | What it is | Built-in/catalog flavor | User flavor |
|---|---|---|---|
| Patterns | Pixelblaze-dialect programs | catalog (formerly "Built-in Patterns") | Patterns |
| Maps | `function(pixelCount)` coordinate sources | stock maps | Maps |
| Mixins | injectable source chunks consumed by the pass engine | built-in mixins | Mixins |
| Controllers | durable hardware profiles: inputs, transforms, bindings | — | per-user |
| Shows | compositions: clips on zone tracks, compiled to one pattern | — | per-user |

Two things are deliberately **not** top-level entities:

- **Adaptations/recipes** (palette swap, mirror, phase, brightness envelope)
  live on the relationship — a pattern *in a Show* or a pattern *bound on a
  Controller* — never as standalone documents.
- **Segments/zones** live inside a Controller (zone → pixel-range mapping) and
  are referenced by name from Shows.

## 4. One pass engine, not three features

Hardware control injection, universal brightness, power capping, sensor mixins,
and orchestration are all instances of one pipeline:

```
parse (Acorn) → namespace/rename → passes[] → merge → emit + transform summary
```

Pass taxonomy (canonical vocabulary):

| Pass | Does | Used by |
|---|---|---|
| inject | prepend mixin source; wrap or synthesize `beforeRender` | HW controls, sensors, scheduling |
| intercept | rewrite output-sink call sites (`hsv`/`hsv24`/`rgb`/`paint`) to wrappers | brightness, power cap, palette remap, gamma |
| bind | call an exported slider fn / assign a named var (min/max/quantize) | HW pots → pattern controls |
| route | gate render by index range / named zone | segment routing |
| blend | transition mixer between two renderers | crossfades, wipes |

The existing bundler (`src/engine/bundle.ts`) is already the right foundation:
Acorn-parsed ASTs with span-splice rewriting. The pass engine generalizes that
machinery. Its one genuinely new capability is **scope-aware alpha-renaming** —
renaming *all* of a pattern's globals collision-free so N patterns can merge
into one artifact. That is orchestration's hard 20% and gets its own design
note before any Show prototype.

## 5. Mixins are visible code

The app's standing philosophy — "here's a fancy map, and here's the actual
Mapper code that made it" — extends to code transforms. A mixin is a readable
Pixelblaze-dialect source file with declared `@param` slots. The pass engine
injects that file verbatim (parameters filled from the binding); it is not
synthesized from templates hidden in the engine. Built-in mixins ship read-only
and cloneable, exactly like stock maps.

What can't be expressed as visible code — call-site rewriting for intercept
passes — is covered by the **transform summary**: a per-push report of what was
wrapped, injected, and bound, with an estimated per-pixel cost delta, plus a
view of the full generated artifact.

## 6. Tracks and sequencing

Three parallel tracks, sliced so each proceeds independently:

- **Track A — engine**: dialect research spikes, then the pass engine, then
  hardware injection as its first proof, then orchestration.
- **Track B — UI/IA**: routing + Gallery, the five-entity rail rework, the
  Controller entity, the Mixins entity.
- **Track C — platform**: identity model (multi-provider auth), Google OAuth,
  analytics.

Gates: the spikes gate the pass engine's design; the state-namespacing design
note gates Shows; the identity-model migration lands *before* Google OAuth.

---

# Part 2 — Full requirements

## 7. Information architecture and routing

v2 introduces a real routing layer. v1 has no router — the only route is the
`#/docs/<id>` hash; everything else is store state. Shareable URLs are a launch
requirement, so navigation state moves into routes:

- `/gallery` — the Gallery grid; the signed-out landing page.
- `/p/<slug>` — pattern detail: large preview, pattern controls, description,
  View source, Open in Studio, Send to Controller, copyable URL. Built-in
  patterns get stable slugs; personal patterns may get share URLs later (out of
  scope for the first slice). View source is a **Preview | Code toggle on the
  main stage**: the Code view is a full-height, read-only Monaco editor reusing
  the Studio editor's syntax highlighting (none of its chrome), with "Open in
  Studio" as the edit escalation — not a snippet box in the sidebar.
- `/studio` — the IDE; redirects to Gallery when signed out (built-ins remain
  usable in the Gallery instead of a degraded Studio).
- `/studio/patterns/<id>`, `/studio/maps/<id>`, `/studio/mixins/<id>`,
  `/studio/controllers/<id>`, `/studio/shows/<id>` — entity-addressed Studio
  views.
- `/docs/<id>` — the existing docs viewer, promoted from hash routes.

Gallery requirements:

- Live animated cards running the real preview engine at reduced pixel count,
  staggered, paused off-viewport. Motion is the point.
- The dimension lens (All/1D/2D/3D) and category chips carry over from the v1
  rail vocabulary; name search included.
- Pattern detail drives the pattern's real exported controls, and slider tweaks
  ride into "Open in Studio" via the existing settings-cascade override layer.
- Send to Controller works from the detail page without entering the Studio.

Controller connect surface (live connection, distinct from the Controllers
entity in §12):

- The connect affordance — a Connect button when disconnected, the controller
  pill(s) when connected — is **global top-bar chrome, rendered in the same
  position on every route**, including the Gallery grid. Connecting is a
  prerequisite for any push-to-hardware action, so it must be reachable from
  anywhere those actions appear.
- The pill's dropdown is the **one live-interaction surface** for a running
  device, carried over from v1 essentially unchanged: device stats (FPS, map
  points, IP), native brightness, pixel count, the running pattern's controls,
  and exported variables. It behaves identically on every route and in every
  auth state — a signed-out hardware user who installed the extension gets its
  full value. No other surface duplicates live controls.
- When signed in, the dropdown gains one row: **"Controller profile →"**,
  linking to the connected device's Controller entity page (§12). When no
  profile matches the connected device, the row reads **"Create profile for
  this device"** — the primary creation path for Controller entities. Signed
  out, the row is absent; nothing else differs.
- Connection state is session-global and orthogonal to auth: signed-out users
  can connect and push, and signing in or out never touches the live
  connection. Navigation never mutates or hides connection state — only
  explicit connect/disconnect or device-side events do.
- Hardware-dependent actions (e.g. Send to Controller) stay visible but
  disabled when no controller is connected, with a hint pointing at the
  top-bar Connect button.

Top-bar chrome (signed-out surfaces):

- Sign in and Open Studio are deliberately both present: they serve different
  intents (attach an account vs. frictionless try-it, entering the non-durable
  demo Studio). **Open Studio is the single primary CTA**; Sign in and Connect
  stay ghost weight and must not compete with it.
- Signing in returns the user to the page they were on, not to the Studio.
  When signed in, the Sign in button is replaced by the account pill.

## 8. Studio nav rework

- A ~46px **activity strip** (icons + short labels) selects the entity kind:
  Patterns, Maps, Mixins, Controllers, Shows, with **Catalog** as the bottom
  entry linking back to the Gallery/browse experience (in a picker-friendly
  mode when invoked from the Studio).
- The list pane keeps the v1 patterns-list conventions: dimension lens, name
  search, inline rename/delete, user-owned sections gated on auth.
- **One header per list.** The entity title row is the only header: it carries
  the create action (＋) and, for arity-bearing kinds (Patterns, Maps), the
  dimension lens beneath it. The user's items render directly under it with no
  redundant section subheader. Only a revealed stock section earns a
  subheader ("Stock maps" / "Stock mixins", with its hide control) — a
  subheader exists only where two groups genuinely coexist.
- **Built-ins recede — the show-stock reveal.** No permanent built-in trees in
  the rail; the user's list is the rail. For **Maps and Mixins**, a quiet
  "show stock" link at the bottom of the list reveals the stock set in a
  visually muted section (hidden again on demand). Stock items open read-only
  with Clone — the read-only state is self-explaining because the user asked
  to see reference material. Cloning is the existing fork flow. Stock maps and
  mixins are code destinations: their pages are source viewers (a map may
  later add the geometry preview of #153), not gallery cards — maps and mixins
  are templates that need a pattern to present, so they do not appear in the
  public Gallery.
- **Patterns** keep the Gallery as their browse home, plus the dashed hint
  card when the list is empty/short. Whether the Patterns list also gets a
  show-stock reveal (useful for future playlist management; there are many
  stock patterns) is an **open question** — deferred. The Catalog entry in the
  activity strip is retained for now as the link back to the Gallery; its
  usefulness will be re-evaluated as the reveal pattern beds in.
- **The right-hand pane is a per-entity context slot.** Every entity view
  fills it with its most useful ambient context: Patterns — the live preview
  and deck (unchanged); Maps — the wiring check plus map facts and provenance;
  Mixins — usage provenance and the last transform summary. **Controllers
  deliberately ships without a context pane**: its live context already has a
  global home in the top-bar dropdown, and the page wants its width for
  tables now and playlist management later. Revisit once the page is in use —
  a natural occupant (e.g. push history / last transform summary) may emerge,
  or full-width may simply feel fine.
- **Maps view**: the editor holds the Mapper's plain-JS source with a
  compile-status badge. The context pane docks the **wiring check** — a
  static render of the map in its true shape for its arity, pixels colored by
  a gradient following wire order with indices at the endpoints and at
  intervals ("did I wire this in the right order?"). It redraws on each
  successful compile; on a parse error the badge flips and the render greys,
  holding the last good state. It is never a pattern renderer — watching a
  pattern run on a map happens in the pattern view via the deck's map
  chooser. Below the wiring check: map facts (pixel count, arity, bounds) and
  provenance — which Controllers use the map, and how many patterns use it.
  This supersedes the always-on framing of #153, whose geometry-render idea
  it absorbs.
- The editor pane, preview pane, control deck, settings cascade, Run/Save
  semantics, and controller pills are explicitly unchanged in this rework.
- Implementation: today's rail is a single ~1,177-line `PatternList.tsx` with a
  two-value `railMode`. The rework factors a shared rail shell with one list
  module per entity kind. Editor flavor handling follows the existing
  map-editor precedent (`editorStore.editorFlavor`, switched by store open/
  close helpers) when mixin editing arrives.

## 9. Pass engine

A pure engine module (no React imports) that generalizes `bundle.ts`'s
machinery:

- **Recipe IR**: a push (or Show compile) is described by an ordered list of
  passes with their parameters — produced by front-ends (Controller profile,
  Show definition), consumed by the engine. JSON-serializable, inspectable.
- **Pass interfaces** for the five taxonomy entries. Passes operate via the
  same AST-located span-splice rewriting `bundle.ts` uses today; whole-pattern
  merging (orchestration) additionally requires scope-aware renaming.
- **Transform summary**: what each pass did — call sites wrapped (by name and
  count), `beforeRender` handling (wrapped vs synthesized), globals/exports
  added, bindings applied, warnings for anything that could not be applied —
  plus an **estimated per-pixel cost delta** (the seed of the cost model Shows
  need). Unsupported output shapes are reported, never silently skipped.
- **Name hygiene**: generated/injected names use a reserved prefix; collisions
  with user identifiers are detected and avoided. Comments, strings, property
  names, and unrelated identifiers are never rewritten.
- **Purity and tests**: behavior-level unit tests over transformed source and
  summaries; the original pattern source is never modified anywhere.
- The normal no-recipe path is byte-identical to today's `bundle()` output.

### Scope-aware alpha-renaming (design note, gates Shows)

Before any Show prototype, a short design note must settle: renaming all
globals/`t`/exported controls across N merged patterns; the semantics of N
`beforeRender` time bases under pause/resume (freeze vs advance); how exported
controls from member patterns surface (or don't) on the generated show pattern.

## 10. Research spikes

Existing tooling makes most of this cheap: the divergence harness
(`test/divergence-harness/`), the hardware perf microbenchmark
(`test/perf-harness/`), and `npm run devbench` for compile-push-measure loops.

Hardware/dialect spike (blocking Track A implementation):

1. Confirmed 2026-07-07 in issue #289:
   - V3 analog input code is `pinMode(pin, ANALOG)` plus `analogRead(pin)`;
     `readAdc()` is V2-only and did not compile on the tested V3 controller.
   - Mockup-style `A1`/`A2` names are not compiler symbols on fw 3.67. Numeric
     GPIO arguments compile; GPIO 32 ran successfully. Pin pickers therefore
     need board-profile pad labels mapped to the numeric IO values Pixelblaze
     code uses.
   - ElectroMage's GPIO table is the board-profile authority. For v3 Standard,
     analog-capable labels are `IO33` on all v3 boards, plus `IO34`, `IO35`,
     `IO36`, and `IO39` on hardware revision >= v3.5. The 8-pin through-hole
     header labels `IO26`, `IO25`, and `IO0` are digital-only.
   - ESP32 ADC2 is shared with WiFi, so WiFi-connected Pixelblaze profiles
     should expose only board-available analog labels from ElectroMage's table,
     not every raw ESP32 ADC candidate.
   - Renamed/wrapped `beforeRender(delta)` works; injected code can call
     exported sliders and assign both plain top-level `var` and `export var`
     bindings.
   - Built-ins are not first-class aliasable values (`var oldHsv = hsv` fails),
     but user functions can shadow built-in names. Output interception must use
     scope-aware call-site rewriting and must not rewrite local shadows.
   - Wrappers forwarding to `hsv`, `hsv24`, `rgb`, and arity-specific `paint`
     call paths compiled and ran on hardware.
   - Pixelblaze has no `undefined` value, and missing user-function arguments
     read as `0`. Generated wrappers must use arity-specific branches rather
     than forwarding `undefined`.
   - Floating GPIO 32 spanned nearly the full 0..1 range in a short run; guard
     design should combine declared `deadband`/`fallback` with sustained
     rail-pinned or high-variance detection.
   - One `analogRead(32)` plus one-pole smoothing in `beforeRender` was
     indistinguishable from the ~124.5 FPS no-analog baseline on the tested rig.
2. Remaining Track A prerequisite: encode the ElectroMage GPIO table as board
   profiles. Do not brute-force GPIOs on hardware. A follow-up run stopped
   responding while moving from a successful GPIO 32 probe to GPIO 33, but
   ElectroMage documents `IO33` as analog-capable, so that timeout is
   inconclusive controller/socket state rather than a pin capability finding.
   The current test controller's pots appear to be wired to digital-only
   through-hole header labels `IO25`/`IO26`. A focused hardware fixture has
   validated `IO25` as a changing digital input that can route into injected
   logic/exported slider calls; `IO26` stayed high in that sample. Analog pot
   range/deadband/fallback validation waits until a wiper is moved to an
   analog-capable pad.

Perf-harness spikes (runnable now, no new hardware work):

7. Wrapper-indirection cost: wrapped `hsv` vs direct `hsv`, per pixel.
8. Device budgets: max pattern code size, global/array count limits,
   exported-control limit → determines the clips-per-show ceiling.
9. Two real renderers merged: steady-state FPS, time-sliced vs both-running,
   on a 300–1000 pixel rig.

## 11. Mixins

- **Format**: a Pixelblaze-dialect source file with a structured header
  comment: `@param NAME description` for binding-supplied values, `@target`
  for the control/variable slot, `@wraps beforeRender` (or similar) declaring
  its injection point. The file body is exactly what the inject pass prepends.
- **Kinds**: each mixin is tagged with its pass kind (inject / intercept /
  bind), surfaced as a badge in the rail. Intercept mixins pair visible helper
  source with engine-side call-site rewriting.
- **Built-in set (initial)**: `pot-binding` (bind), `hw-brightness`
  (intercept), `power-cap` (intercept), `sensor-pulse` (inject — sensor-board
  reactivity around unmodified patterns), `night-scheduler` (inject —
  time-of-day dim/off). `power-cap` estimates and limits total current draw;
  high value for battery and small-PSU builds.
- **Lifecycle**: built-ins are read-only + cloneable, revealed via the Mixins
  list's show-stock link (§8) rather than a permanent rail section; cloud
  mixins are created, renamed, edited, deleted like patterns; stored in D1
  behind the personal content provider.
- **Binding lives with the user**, not the mixin: parameters are set on the
  Controller (or Show) that applies the mixin, so mixin source stays generic
  and portable.
- **Mixin view**: editor shows the source; the right pane repurposes as
  provenance — where the mixin is used, and the last transform summary with a
  path to the generated artifact.

## 12. Controllers

A Controller is a durable, D1-backed entity — the physical box's profile — that
exists and is editable while the device is offline. It is distinct from the
live connection surface (the global top-bar Connect button/pills and the live
dropdown, §7), which works without auth and carries no durable state. All live
interaction — stats, brightness, pattern controls, variables — happens in the
dropdown; the profile page holds durable configuration only and never
duplicates live controls. It absorbs the earlier manifest concept whole
(identity, inputs, global transforms, per-pattern bindings,
smoothing/fallback/invert, explicit call-vs-assign targets), giving it a page
instead of a YAML file.

- **Status strip** (not a device card): a slim row showing connected/offline,
  last-known pixels, map dimensionality, and firmware, with a pointer to the
  top-bar dropdown for the live view. Native brightness remains the hard
  safety cap and is surfaced in the dropdown; injected brightness only shapes
  output inside it. Effective output = native cap × pattern output × injected
  UI brightness × pot value.
- **Deliberately roomy.** The v2 page ships with bindings-related config and
  visible empty space. Playlist and pattern-list management — including stock
  playlists per hardware type with one-click push of a whole set — is an
  intended later occupant of this page (not yet tasked; the device's playlist
  is readable/writable over the existing protocol, we just haven't built it).
- **Hardware inputs**: named inputs (pot0, pot1, btn0…) with pin, role
  (brightness / assignable / next-pattern), smoothing, fallback, invert, and a
  live readout when connected. Pin pickers offer only ADC1-safe pins per board
  variant, with the constraint explained inline.
- **Global transforms**: applied to every push to this Controller — hardware
  brightness (source pot × output), power cap — each naming the mixin that
  implements it, linked to its source, individually toggleable.
- **Pattern bindings**: pattern × input → target. Preferred order: call an
  exported slider function (the author already encoded scaling and taste
  there); call an explicit named function; assign a named variable with
  min/max and optional quantize. Missing targets warn loudly, never silently
  no-op.
- **Push pipeline**: every Send to Controller resolves the Controller's active
  recipe (global transforms + any binding for this pattern) and pushes the
  generated artifact. With no profile or all transforms off, the push is
  byte-identical to today's. Run/Save semantics, dirty tracking, and the
  overwrite binding are unchanged.
- **Zones**: the Controller carries named zone → pixel-range mappings
  (arch-left → 0–239), the deployment half of the Shows model.
- Existing controller metadata (overwrite bindings, program label cache)
  migrates into or alongside the Controller entity where natural.

## 13. Shows

A Show composes existing patterns into one deployable artifact. It is the last
major feature to build — after the pass engine, hardware injection, and the
renaming design note have landed — but its model constrains earlier work, so it
is specified here.

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
  verified on hardware. Segment routing to named zones is the second slice.
- **Deferred**: the fluent/Strudel-style composition DSL (the recipe IR is the
  v1 authoring format, edited through the Show editor UI); low-resolution wash
  sampling; the geometric pattern language. These are recorded as later
  directions, not v2 commitments.

## 14. Platform

### Identity and multi-provider auth

- **Identity model migration (first)**: split `users` into `users` +
  `identities` (provider, provider_user_id, email, verified flag → user_id).
  Existing GitHub users migrate to a GitHub identity row. All personal-content
  scoping continues to key off `user_id`.
- **Google OAuth (second)**: an OIDC authorization-code flow beside the
  existing hand-rolled GitHub flow, behind the same session cookie. Google is
  chosen for coverage and its verified-email claim; Reddit is explicitly not
  planned (no reliable verified email, near-total audience overlap).
- **Linking/dedup**: on first login with a new provider, if its verified email
  matches an existing identity's verified email, link automatically to that
  user. Otherwise create a new user. A signed-in "connect another login"
  action in the account menu handles explicit linking (including users whose
  GitHub email is hidden). Never auto-link on unverified email.

### Analytics

Lightweight product analytics on the v2 deployment (likely Google Analytics).
Verify what the default instrumentation captures (page views per route matter
most: gallery landings, pattern detail views, studio sessions); add explicit
events only where the defaults fall short (e.g. Send to Controller, catalog
clone). v1's only signal was landing counts; v2 should at least distinguish
browsing, authoring, and hardware use.

## 15. Out of scope for v2

- Automated GLSL→Pixelblaze translation (unchanged from v1 stance).
- Reading patterns back from a controller; device settings management.
- The fluent composition DSL, low-res wash sampling, geometric pattern
  language (deferred, see §13).
- Continuous sync of hardware control positions back into preview controls.
- Public sharing/publishing of *personal* patterns beyond built-in gallery
  slugs (a natural later step once the Gallery exists).
- Multi-controller synchronized shows (Firestorm territory).

## 16. Phasing summary

| Phase | Track A (engine) | Track B (UI/IA) | Track C (platform) |
|---|---|---|---|
| 1 | perf-harness spikes (§10.7–9); hardware spike (§10.1–6) | routing + Gallery + pattern detail | identity migration |
| 2 | pass engine + transform summary | five-entity rail; Controller entity | Google OAuth + linking; analytics |
| 3 | HW injection end-to-end (brightness, then bindings) | Mixins entity; transform-summary UI | — |
| 4 | renaming design note → Show compile (2 clips + crossfade) | Show editor v1 | — |
| 5 | segment routing; power-cap / sensor / scheduler mixins | zone editing on Controller | — |

Each phase leaves the app shippable; Tracks A and B only join at phase 3
(HW injection needs the Controller entity as its front-end).

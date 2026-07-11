# PXLBLZ — Technical Reference

For engineers working *on* PXLBLZ, or evaluating how it's built. Using PXLBLZ is
the **Feature Guide**'s job; understanding Pixelblaze itself is the **Ecosystem
Primer**'s. This document is the single authoritative record of the design
decisions and the reasoning behind them; where any doc disagrees with the code,
the code wins.

**The whole document in two sentences.** PXLBLZ is a browser app with two
surfaces — a public Gallery and an authenticated Studio — over one engine:
editing, transpiling, execution, and preview all happen in the page, while
personal patterns/maps/mixins/shows/settings and Controller profiles live in D1
behind Pages Functions. Its defining commitment is hardware
fidelity — the preview reproduces the device's fixed-point math, map semantics,
and edge-case behaviours, and nothing the preview invents ever reaches a
controller.

**Part 1** is the architecture: the stack, the defining decisions, and the system
map. **Part 2** is the subsystem reference: engine internals, the preview
pipeline, connectivity, storage, and the accepted divergences — complete, in
detail.

---

# Part 1 — The architecture

## 1. Technology stack & stance

| Concern | Choice | Why |
|---|---|---|
| Build / dev server | **Vite** | fast HMR; proxies API calls to local Wrangler for D1-backed dev |
| UI | **React + TypeScript** | mainstream, typed; thin view layer over the engine |
| Styling | **Tailwind CSS + shadcn/ui** | utility styling; a few headless components |
| State | **Zustand** | framework-agnostic stores readable/writable from the non-React engine |
| Editor | **Monaco** (`@monaco-editor/react`) | real IDE features: completion, markers, hovers |
| Parser | **Acorn** | standards JS AST; powers the transpiler, validator, fixed-point re-emit |
| Personal storage | **Cloudflare D1 + Pages Functions** | authenticated, user-scoped cloud workspace |
| Preview draw | **WebGL** point cloud | one pipeline for 1D/2D/3D |
| Tests | **Vitest** | fast; jsdom for component smoke tests |
| Commit gate | **Husky** | `npm run lint && npm test` pre-commit |

The overarching stance: **browser-native IDE with a small cloud workspace**.
Editing, transpiling, running, and previewing happen in the browser. Durable
personal resources use authenticated Pages Functions backed by D1. Signed-out
use is a non-durable demo mode for built-in demos/maps/libraries/docs. Live
Controller connectivity (§13) stays additive and routed through a Chrome
extension relay rather than through the cloud backend.

## 2. The defining decisions

Six decisions shape everything in Part 2.

**A hard engine/UI boundary.** Engine code (`src/engine/`) is pure TypeScript
with **zero React imports**; UI components are thin views over engine functions
and Zustand stores. Zustand specifically because the render loop and other engine
code read and write state outside React. This split is load-bearing for testing:
the tricky math and the transport-agnostic connectivity logic are unit-testable
with no DOM (§16).

**Everything that crosses to hardware is plain Pixelblaze code.** The bundler
only inlines and renames — never translates — so libraries are authored in the
Pixelblaze dialect (§4, §11). Map sources are plain browser JavaScript, exactly
as on real hardware, and stock maps are the very `.js` the user can read (§8).

**The sample/pos split.** Each preview point has two channels: **`sample`** — the
coordinates fed to the render function, always map-coordinate-owned — and
**`pos`** — where the dot is drawn, owned by the map when it encodes real geometry
or by a viewport **embedding**. A 1D point carries `[x]` from a true map or the
implicit Index convention while Line/Ring/Pole independently supplies `pos`.
This one model spans 1D shapes, 2D surfaces, and 3D maps (§8).

**Connectivity behind one seam.** All "how do we reach a Controller" knowledge
lives behind `ControllerProvider`; the UI never imports a transport. The v1
transport is a Chrome extension relaying `ws://` frames, because an https page
cannot open a LAN WebSocket itself (§13).

**Nothing the IDE invents for the preview ever reaches a controller.** Metadata,
the fixed-point emit, the settings cascade, light size, diffusion, solidity,
fidelity — all stay browser-side. Only the pattern artifact and, on request, the
map cross over (§14).

**Faithful fixed-point preview.** The preview can emulate the device's 16.16
fixed-point arithmetic exactly. The driver is shader porting: the common GLSL
hash `fract(sin(p·12.9898)·43758.5453)` overflows 16.16 on hardware while looking
perfect in float64, so a float-only preview cannot reveal that bug class — a
pattern would pass preview and fail on the device. This produces the
**two-renderer model**: **Fast** (float64, the editing default) and **Precise**
(faithful 16.16). Fidelity is a preview-only second emit path — the exported
artifact is plain unmodified code, since the device does fixed-point natively.
Two divergence classes are documented and accepted rather than chased:
**transcendental precision** (built-ins computed in float64 then quantized) and
**algorithmic identity** (`perlin`/`prng`/`wave` are different algorithms than
firmware). Only pure integer arithmetic is bit-identical on both sides — which is
why the library hashes are built from integer ops (§11).

## 3. System map

![System map: UI and stores over a pure engine, with WebGL, D1/API storage, and the extension relay below](../images/system-map.svg)

### Routing & the two surfaces

The app is split into a public **Gallery** and an authenticated **Studio**,
joined by a hand-rolled History-API router (no library, no hash routes). The
pure route codec is `src/engine/routes.ts` (`Route` union: `gallery`,
`studio-welcome`, `studio` with an optional `{kind, id}` entity,
`pattern-detail` by slug, `docs`, `not-found`); `src/store/routerStore.ts` owns
`pushState`/`replaceState` and `popstate` sync; `App.tsx` renders the route
switch and runs two effects that keep route ↔ store state aligned (deep links
open the matching record once collections load; opening an entity rewrites the
URL). v1's `#/docs/<id>` hash links redirect to `/docs/<id>`.

Route table: `/` and `/gallery` → the Gallery grid; `/p/<slug>` → pattern
detail (slugs exist for built-in demos only); `/studio` and
`/studio/<kind>/<id>` for the six entity kinds (patterns, maps, mixins,
libraries, controllers, shows); `/docs/<id>`; anything else → not-found.

Only Studio routes gate on auth. `decideStudioAccess`
(`src/engine/studioAccess.ts`) sends a signed-out visitor to the
`/studio-welcome` gate (GitHub/Google sign-in buttons; an acknowledged gate
goes straight to `/api/auth/login` next time), lets a Gallery-carried demo
through, and — to avoid flashing the IDE shell before `/api/me` resolves —
holds Studio routes on a "Checking Studio access" message until
`personalWorkspaceResolved` flips true.

The **Gallery** (`GalleryPage.tsx`, catalog in `src/engine/galleryCatalog.ts`)
filters the stock demos by dimension lens, category, and name. Cards run the
real preview engine (`GalleryLivePreview.tsx` composes `bundle`, `createShim`,
`loadPattern`, `resolveLayout`, `createRenderer`, `createRenderLoop`) at a
reduced pixel count (≤384 for 1D, ≤1024 for 2D/3D), with a global cap of six
concurrently animating cards (hovered/focused cards get slot priority),
IntersectionObserver pause off-viewport, a 70 ms-staggered start, and a static
single frame under `prefers-reduced-motion`. The **pattern detail page**
(`PatternDetailPage.tsx`) opens the demo into the normal preview stores, so
its deck controls and Send to Controller are the real Studio paths; the
Preview | Code toggle swaps in a read-only Monaco (`PixelblazeCodeEditor`)
with the Studio's language mode and none of its chrome. **Clone** queues the
slug (surviving a sign-in round-trip via localStorage) and copies the source
into a new personal pattern.

The **top-bar chrome is global**: `ControllerBar` (connect button, pills, live
panel — §13) and `AuthStatus` (account pill, provider connect/disconnect)
render in the same header on every route and in every auth state.

### Zustand stores (`src/store/`)

| Store | Holds |
|---|---|
| `previewStore` | `isRunning`, `speed`, `brightness`, live `lightSize`/`diffusion`, the global-sticky `lightSizeSticky`/`diffusionSticky` baselines, `fidelity`, watcher state, `fps`, `elapsed`. Persists only `fidelity` and the two sticky baselines; cascaded fields are seeded per pattern by the resolver (§12). |
| `patternStore` | tri-state selection (`activePatternId` / `activeLibraryName` / `activeDemoName`), `userPatterns`, `demoOverrides` (per-demo cascade layer-1 bag), CRUD through the active personal content provider. |
| `editorStore` | `source`, `previewSource`, `compileStatus`, `isReadOnly`, `patternVars`, `controls`, Pattern `nativeDim`, active `mapDim`, viewport `displayDim`, `renderAdaptation`, `solidEligible`, `editorFlavor` (`'pattern' \| 'map' \| 'mixin'`). |
| `mapStore` | `activeMapId`/`activeShapeId`/`activeSurfaceId`, `activePixelCount`, `activeNormalizeMode`, `activeSolidity`, `userMaps`, the stock catalogue, and the map-mode editing target. |
| `controlStore` | current pattern UI control values (transient). |
| `cameraStore` | ephemeral orbit angle, persistent auto-orbit flag, a transient `dragging` hold, pole wrap density. |
| `controllerStore` | keyed map of connected Controllers (IP → phase/nickname/map dim), the active one, extension presence, last-connected IP for auto-reconnect, the Send/push slices, and the sticky `saveArmed` toggle with mode-split dirty tracking for both source and generated-code Controller-profile signatures. |
| `controllerPanelStore` | the connected device's polled live slice: active program + program list, FPS, device `pixelCount` (with in-flight `pixelCountPending` hold), installed-map point count, panel-owned volatile brightness and live controls. `seed`/`start` are keyed by owning IP so a same-device reopen keeps last-known values while a device switch clears. |
| `routerStore` | the current `Route`, `navigate` (pushState/replaceState) and `syncFromLocation`; the only module that touches `history`/`location`. |
| `mixinStore` | cloud `MixinRecord` list + CRUD through the personal content provider, the mixin-mode editing target, stock-mixin open state. |
| `showStore` | cloud `ShowRecord` list + CRUD through the personal content provider, `activeShowId`, and scene/cell edit operations over the pure show model. |
| `controllerProfileStore` | durable Controller profiles: list/CRUD via `/api/controllers`, `ensureProfileForLiveController` (auto-create + refresh, with pending/suppressed device-id guards), live-metadata refresh for the profile page. |
| `workspaceStore` | `personalWorkspaceAuthenticated` / `personalWorkspaceResolved` — the auth-state seam the Studio gate and rail read. |

Each store exports `*InitialState`; tests reset with `setState(initialState)`
(merge mode). `previewStore`'s persist layer migrates legacy blobs (the retired
`grid`, pre-cascade per-pattern brightness/speed) forward into the current shape.

---

# Part 2 — Subsystem reference

## 4. Transpiler / bundler (`src/engine/bundle.ts`)

`bundle(patternSrc, libraries)` → `{ code, fxCode, metadata }`:

- **`code`** — the flat hardware/preview artifact: every referenced library
  function inlined and prepended, every `namespace.fn()` call rewritten to
  `_namespace_fn`, referenced libraries' top-level `var` declarations emitted
  unmangled ahead of the inlined functions, and `export` keywords preserved.
  This is exactly what runs in preview and the source body that export/push
  boundaries stamp before it leaves the IDE.
- **`fxCode`** — the fixed-point re-emit of `code` (§5), preview-only.
- **`metadata`** — preview-side companion, never sent to hardware.

**Parsing.** The pattern parses as an Acorn *module* (legal top-level
`export var`/`export function`); libraries as *scripts*.

**Tree-shaking & inlining.** `collectLibraryRefs` finds `lib.fn()` calls;
`resolveAllDeps` BFS-pulls each function's transitive same- and cross-library
references; `inlineFn` renames declarations and rewrites internal calls
(`mangle(ns, fn) → _ns_fn`). Only reachable functions are inlined —
function-level tree-shaking, critical for the device's memory limits. If any
function from a library is reached, all of that library's top-level `var`
declarations are emitted once, before the inlined functions, so out-var helpers
such as `Shader.toUV()` can initialize globals like `ux`/`uy` and callers can
read them bare immediately after the helper call. Unreferenced libraries still
contribute nothing. A pattern referencing no libraries returns its source
verbatim. The filename is the namespace (`Shader.js` → `Shader.*`); libraries
load eagerly via `import.meta.glob('./lib/*.js', '?raw')`.

**Library content rule.** `validateLibraryContent()` enforces that a library's
top level contains only function declarations, `var` declarations, and comments.
No executable top-level statements are allowed, which keeps emitted out-var
declarations safe to prepend.

**Metadata extraction** records `exportedVars`, top-level `patternVars`,
`controls` (exported functions matching a control prefix, with `pickerVars`
recovering the backing vars for colour pickers), and `renderFns` (the presence
set driving dimensionality).

This is a faithful interfacing choice: the artifact must be valid Pixelblaze
code, so libraries are authored in the Pixelblaze dialect (plain `.js`,
Acorn-parseable) and the bundler does only inlining and renaming, never language
translation.

### Pass engine (`src/engine/passEngine.ts`)

`bundleWithPasses(patternSrc, libraries, recipe)` layers the generic pass engine
on top of `bundle()`. With an empty recipe it returns the same `code`, `fxCode`,
and `metadata` bytes as `bundle()` plus an empty transform summary; this is the
compatibility guarantee for current Copy/Download/Send flows. Non-empty recipes
operate on the already-bundled artifact and return `{ code, fxCode, metadata,
summary, warnings }`.

The recipe IR is JSON-serializable and ordered. The implemented pass kinds are:

- **Inject** — substitutes `@param` placeholders by Acorn identifier spans,
  renames the mixin's `beforeRender`, prepends the mixin source, and either
  wraps the pattern's existing `beforeRender(delta)` or synthesizes one.
- **Intercept** — rewrites AST-located output-sink call sites for `hsv`,
  `hsv24`, `rgb`, `paint(v)`, and `paint(v,b)` to generated arity-specific
  wrappers. One pass can target several sinks with a per-sink wrapper function,
  allowing shared telemetry/frame state across `hsv` and `rgb`. Comments,
  strings, property names, unrelated identifiers, and
  locally shadowed sink names are left untouched. Unsupported arities produce
  warnings instead of silent skips.
- **Bind** — emits a small frame-level helper that calls a target function
  (including exported sliders) or assigns a target variable. Optional
  `min`/`max` scale a normalized `0..1` input into the assignment/call range,
  and `quantize` snaps the scaled result; missing targets warn and do not mutate
  the artifact.
- **Renderer adapter** — at Controller-send time, uses the live Controller's
  installed map dimension plus the Pattern's full renderer capability set. When
  the firmware preference selects a higher-dimensional renderer, emits the exact
  map-dimensional export and calls the authored renderer with every missing
  trailing coordinate explicitly set to `0.5`. Exact matches and
  lower-dimensional fallbacks remain byte-identical. A user/library binding that
  occupies the required canonical renderer name is a hard, inspectable error.

Generated helper names use the reserved `__pxlblz_` prefix. The engine detects
user-authored identifiers already using that prefix, avoids exact generated-name
collisions, and records both as warnings in the transform summary path. The
summary reports per-pass and aggregate call-site counts, beforeRender handling,
generated globals/exports, applied bindings, renderer adaptations, warnings,
and the estimated per-pixel cost delta. The default cost seed is one unit per wrapped output call
site unless a recipe item supplies an explicit `cost`. `controllerStore` keeps
the last transformed push as an inspection record containing the summary, pass
warnings, and full generated source; the mixin provenance pane and Controller
profile page expose that record read-only.

The supported output-sink abstraction is intentionally narrow: intercept passes
only see top-level unshadowed calls to `hsv`, `hsv24`, `rgb`, `paint(v)`, and
`paint(v,b)`. They do not understand arbitrary aliases, dynamically selected
sink functions, object methods, unsupported arities, or effects hidden behind
library abstractions; those cases warn or remain unchanged. Bind passes target
top-level functions or variables by name. Controller profile target names are
free text in the UI, so validation happens at transform time: missing functions
or variables produce transform-summary warnings and do not mutate the artifact.

### Artifact identity banner (`src/engine/artifactStamp.ts`)

Every outbound source artifact is stamped after bundling and after any pass
recipe has generated a derived source. The banner is a comment-only convention,
so it has no bytecode, FPS, or code-budget cost; run-only pushes send bytecode
only and are not stamped. Save-mode PBP blobs store the stamped source section,
while Copy Code and Download emit the same stamped `.js` artifact. The preview
and eval path continue to consume unstamped `bundle()`/`bundleWithPasses()`
results.

Current format:

```js
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// pxlblz:1 kind=pattern id=pat-1 name="Sunset Arch" hash=1a2b3c4d stamped=2026-07-08T00:00:00.000Z
// pxlblz:transforms hardware-brightness power-cap
```

`hash` is the 8-hex CRC32 of the artifact with any PXLBLZ banner stripped, so
restamping preserves the same hash and one-character source drift is detectable.
`parsePxlblzBanner(code)` returns null for unstamped source and recovers
kind/id/name/hash/stamped/transforms for stamped source. The pattern name section
inside PBP is untouched; names remain the human-facing currency, and the banner
is machine-facing provenance for future read-back.

## 5. Fixed-point engine

Three pieces implement Precise mode.

### Representation & operators (`fixedpoint.ts`)

Every pattern number is its **raw int32** = `round(value × 65536)`. The `fx`
object implements the 16.16 operators, confirmed against a real device (fw 3.67):

- `add`/`sub`/compare — native ops with `| 0` int32-wrap.
- `mul` — exact `(a·b) >> 16` via 16-bit limb decomposition (float64 alone
  overflows past 2⁵³); the one expensive op.
- `div` — rounds `a×65536/b`; a documented sub-ULP divergence from the device's
  *truncating* divide, for non-power-of-two divisors only.
- `mod`/`frac` — truncate (sign of dividend), matching firmware.
- Bitwise — integer-coerce operands first (`raw >> 16`, op, `<< 16`), matching
  firmware's "bitwise over the integer part" (`~2.5 → -3`).

### Fixed-point re-emit (`fxEmit.ts`)

`emitFixedPoint(code)` re-parses the bundled source and re-emits it: numeric
literals become raw int32, operators become `fx.*` calls, array subscripts
truncate (`(i)>>16`), `++`/`--` step by one whole unit (65536). Unknown node
types fall back to the original source text — degrading to float math rather than
crashing.

### Fixed-point shim (`createFxShim`)

Wraps the float shim at a per-function seam: numeric args decode raw→float, the
float built-in runs, the numeric result re-encodes float→raw. A built-in's
internals run in float64; only its result is quantized to the 16.16 grid. The
seam exists so a firmware-matched LUT could replace an individual `fx.sin` if a
divergence ever proved visible — none has, so the hook is unused. Arrays,
palettes, `mapPixels` callbacks, and `transformPoint` get bespoke overrides
(their elements are already raw). `encodeScalar`/`decodeScalar` become
`fx.fromFloat`/`toFloat`, so the render loop, controls, and watcher stay
mode-agnostic and convert only at the boundary.

## 6. Validator & editor integration

### Validator (`validate.ts`)

`validateSource(source)` is pure, returning `ParseError[]` from two passes: an
Acorn syntax parse, then an AST rule walk collecting *every* Pixelblaze violation
(not just the first): non-`var` declarations, classes, `switch`, `new`,
`try`/`catch`/`finally`, `throw`, `import`. This encodes the language limitations
as live feedback. Object literals and closure-scope divergences are deliberately
not flagged — not statically detectable in the rule set.

### Editor propagation & map mode (`Editor.tsx`, `monaco/`)

Monaco runs a Pixelblaze language mode (`pixelblazeLanguage.ts`) with completion
and signature providers backed by `builtins.ts` plus all loaded library
functions, and library hover cards. `Editor.tsx` converts validator output to
Monaco markers and sets `editorStore.compileStatus`. Two propagation paths on
independent timers:

- **Preview push** — a 600 ms debounce (`PREVIEW_DEBOUNCE_MS`): clean source is
  pushed to `previewSource`, rebuilding the preview. Broken code is not pushed —
  the last clean version keeps running.
- **Auto-save** — a separate 4 s tick (`SYNC_TICK_MS`) writing clean source to
  the authenticated personal content provider.

The model is force-tokenized on mount and source swap (2000-line cap) to avoid a
flash of unhighlighted text; read-only files skip validation and clear markers.

The editor's second flavor is **map authoring** (`editorFlavor === 'map'`,
`mapAuthoring.ts` + `MapModeHeader.tsx`): a plain-JavaScript surface with a
**parse-only** badge (`parseMapSource` — an Acorn parse of `(${source})`; no
dialect walker, no shim, since a map is just a JS function expression). **New
Map** opens on `MAP_SKELETON`, a minimal valid 2D function. Stock maps live in
the Maps rail's session-remembered collapsible **Stock Maps** section and open
read-only in the same flavor at stable `/studio/maps/<stock-id>` routes;
**Clone** copies the stock source into a new custom `MapRecord`, bakes it, routes
to the new `/studio/maps/<id>`, and opens it editable. Custom map source
**auto-bakes** on
the sync tick when it parses (`bakeMapSource` — plain-JS `new Function`, float64,
no shim). Auto-baking only updates the stored record; no map-mode action applies
itself to the running preview — assigning a map to a pattern happens only via the
preview **Map** control. Eval failures surface in the header without crashing.
Custom maps offer **Send map to Controller** and a confirmation-guarded
**Delete**; stock maps offer read-only state, **Clone**, and **Send map to
Controller**. A user map can also be a frozen controller import with `points` but
no `source`; opening it enters read-only map mode with a placeholder note while
the right pane previews the baked geometry. The autosave/bake tick ignores these
source-less imports so the placeholder can never overwrite the frozen points.

In map mode the right context pane is `MapContextPane`, not the animated pattern
preview. It resolves the open stock or custom map, paints deterministic
wire-order colors through the shared WebGL renderer (`createRenderer`), and
overlays one-based labels at the endpoints plus every 32nd pixel. 2D/1D maps use
the renderer's measured 2D projection; 3D maps use the same orbit camera and
`OrbitControls` vocabulary as the pattern preview, with the pole-only density
control suppressed. If a custom map evaluates badly, the pane dims the last
successful bake and surfaces the eval error instead of clearing the geometry.
Below the wiring check, the pane reports pixel count, arity, grid/bounds, and
honest provenance rows: explicit saved-pattern map settings when present, and an
empty controller-identity state until Controller profiles persist map ids.

The editor's third flavor is **mixin mode** (`editorFlavor === 'mixin'`,
`mixinStore.ts` + `MixinModeHeader.tsx`): Pixelblaze-dialect source with a
structured pass header. Validation is header-focused (`parseMixinHeader`) rather
than full dialect validation because `@param` placeholders are intentionally
unresolved until a Controller or Show binding applies the mixin. Stock mixins live
in the Mixins rail's session-remembered collapsible **Stock Mixins** section and
open read-only at stable `/studio/mixins/<stock-id>` routes with pass kind badges
(`inject`, `intercept`, `bind`). **Clone** copies the stock source
into a new D1-backed `MixinRecord`, routes to `/studio/mixins/<id>`, and opens it
editable. Cloud mixin source auto-saves on the editor sync tick when the header is
valid. The preview/right pane is replaced by `MixinProvenancePane`: header facts,
usage rows, and the last transform summary when available, with honest empty
states until the pass engine records provenance/artifacts. The stock catalog
includes `power-measure`, a measurement-only intercept source that exports the
reserved `__px_power*` telemetry variables while leaving output unchanged.
`power-cap` uses the same telemetry convention and, when enabled on a Controller
profile, compiles as an estimated `hsv`/`rgb` output limiter whose `MAX_DUTY` parameter
initializes the exported normalized 0..1 `__px_powerLimit` setpoint. Frame-level
limiting reads that export at runtime, so a documented `setVars` write can tune
the running cap without recompiling. Both power intercepts also contribute a composed
`beforeRender`: intercepted `hsv` calls accumulate one frame of duty, then the
frame hook publishes a roughly two-second block average as
`__px_powerDutyRecent` and advances a fixed-point-bounded cumulative mean as
`__px_powerDutySinceStart`. RGB duty is the mean of the three clamped channel
values and capping scales all three channels uniformly. The cap alone maintains
a separate roughly 250 ms EWMA and scales output from that signal, so neither
display average can delay limiting. Milliamps are not part of the generated cap
policy. Palette-aware `paint()` coverage remains deferred because source-level
calls expose palette position and brightness, not the resolved RGB channels;
sensor-pulse and night-scheduler consumption are also later #319 slices.

The editor's fourth flavor is **library mode** (`editorFlavor === 'library'`):
Pixelblaze-dialect source for stock and cloud helper namespaces. Stock libraries
open read-only from the Studio Libraries rail or the header's Libraries menu at
stable `/studio/libraries/<library-id>` routes. Cloning a stock library copies
the source into a cloud `LibraryRecord` with a fresh namespace based on the stock
name (`Shader2`, `Shader3`, ...), never the stock namespace itself. Cloud
libraries live in D1 as `LibraryRecord`s (`id`, identifier-constrained `name`
namespace, `src`, `updatedAt`), open editable at `/studio/libraries/<id>`, and
auto-save clean source on the editor sync tick through `/api/libraries`. New
libraries mint `LibN` names, and rename/create validate against stock library
names, the user's libraries, and Pixelblaze built-ins. Library mode uses
`validateLibraryContent()` instead of the full pattern walker so the top-level
rule is visible without pretending the file is a runnable pattern. Opening a
library intentionally does not change the running preview pattern or its source.
`LibraryContextPane` parses the current library source live with the pure
`parseLibraryApiReference()` helper, rendering docs from `//` comments directly
above function declarations and facts for function count, top-level `var`
out-vars, and referenced stock libraries. Monaco hover uses the same
case-sensitive stock+cloud doc index for `Namespace.fn()` calls; completion and
the top-bar Code menu remain stock/builtin-only.
Pattern compile paths merge `src/pixelblaze/lib/` stock libraries with the
current `userLibraries` store before calling `bundle()`: Studio preview (Fast
and Precise), Copy Code/Download, Send to Controller, and transform inspection
all receive the same namespace set. The bundler treats library references as
compile-time soft references: a missing namespace or missing function throws an
unknown-library error during bundling rather than leaving a late runtime
`Namespace is not defined` failure.

## 7. Runtime shim & built-ins (`shim.ts`, `builtins.ts`)

`createShim(config)` builds the Pixelblaze built-in surface as a plain object,
injected as named parameters to `new Function(...)` — nothing pollutes global
scope and the surface is mockable. It implements (float64 reference behaviour):
colour (`hsv`/`hsv24`/`rgb`, capturing the current pixel), waveforms and
interpolation (`time`, `wave`, `triangle`, `square`, `mix`, `smoothstep`,
beziers, `clamp`, `map`), the math/constant family (`frac` truncate-based, `mod`
floored), palettes (`setPalette`/`paint`), `perlin` plus the fractal family (Ken
Perlin's 2002 reference — not bit-identical to firmware), `prng` (mulberry32 —
algorithmically divergent), `clock*` (browser clock), the live coordinate
transform stack (a persistent 4×4 CTM applied via `transformPoint`), map
introspection sourced from the active map, and a Pixelblaze-semantics `array(n)`
Proxy.

**Inert stubs** (defined so patterns don't throw): hardware I/O, the
sensor-expansion globals (`frequencyData`, `accelerometer`, `light`, …), and
`nodeId`. Sensor-reactive patterns run without error but produce no motion — a
deliberate fidelity gap; the browser has no sensor board.

`builtins.ts` is a separate hand-maintained manifest feeding Monaco
completion/hover/signature hints, kept against the ElectroMage language
reference; there is no firmware auto-sync.

## 8. Maps, embeddings, and the sample/position split

The richest interfacing area. The core model:

- **`pixelCount` is independent of the map.** The render loop iterates
  `0…pixelCount-1` and asks the map for each index's sample; the map is an
  index→coordinate lookup, never the authority on count — mirroring hardware,
  where the two settings can disagree.
- **Each point has two channels** — `sample` (fed to the render fn, map-owned)
  and `pos` (where the dot draws; map-intrinsic for real geometry,
  viewport-supplied by an embedding when presentation is independent).

### Maps are source-backed plain JavaScript

A map function is plain JavaScript run in the browser — never the Pixelblaze
dialect, never the fixed-point shim — because that is exactly what hardware does.
Map evaluation is therefore faithful by construction.

Hardware's Mapper accepts two source formats — a literal JSON coordinate array,
or a `function(pixelCount)` returning one — authored in arbitrary real-world
units (the firmware normalizes from the coordinates' limits). The IDE accepts
both forms in map mode: `parseMapSource` parses either a top-level array literal
or function expression, and `bakeMapSource` evaluates the array directly or calls
the function once with the modeled pixel count. Coordinate arity 1, 2, and 3 are
all first-class: `inferDim` accepts `[x]`, `[x,y]`, or `[x,y,z]`. The raw-units
detail is invisible downstream — normalization erases input scale.

Every stock map (`stockCatalogue.ts`) is self-contained Mapper source in
`src/pixelblaze/stock/maps/sources/*.js` — either `function(pixelCount)` with
`Math.*`/language built-ins only, or a literal coordinate array for measured
hardware — pasteable into a real Mapper tab, read raw via `import.meta.glob`, and
run through a no-shim `new Function`. The `.js` a user views *is* the `.js` the
preview runs: single source of truth, no parallel generator to drift. Function
stock maps **regenerate live** for any count; literal-array stock maps keep their
measured point count.

The shipped catalogue (`STOCK_MAP_SPECS`): `plane` ("Square"), `wide`
("Wide 2:1"), `seed-ring-2d` ("Ring") in 2D; the 3D set in the shell/volume
naming scheme — `cube`/`cube-shell`, `star-shell`/`star-volume`,
`seed-sphere-3d` ("Sphere shell")/`sphere-volume`, `tetra-shell`/`tetra-volume`;
and `sunflower-pucks`, a fixed 160-point literal 3D array modeling eight small LED
puck clusters, plus `sunflower-pucks-2d`, the same wire order projected to X/Y.
Shell entries carry a `normals` recipe (`'face' | 'star' |
'tetra' | 'centroid'`), whose presence is the solid-eligibility gate (§9). A
lattice entry carries a `grid` recipe (`'square' | 'wide' | 'cube'`) backing
`PixelMap.gridDims` — the live count→dims derivation; absent means `gridDims`
returns null (irregular clouds, literal measured arrays, and shells).
There is currently no stock 1D map; 1D entries come from custom authoring or
Controller import and appear under the Maps rail's 1D lens.

### Custom maps bake on save

A custom map is evaluated **once** (float64, no shim) and its coordinate array
frozen into the `MapRecord`; `resolve(pixelCount)` replays that baked array
index-aligned. It does **not** re-run on a `pixelCount` change — deliberately
reproducing the hardware stale-map drift ("changed pixelCount, forgot to re-save
the Mapper"). A `MapRecord` carries `source`, `points`, and `gridDims` when the
points form a regular lattice. Baked replay applies to custom maps only (stock
maps regenerate). Opening or editing a custom map does not change `activeMapId`.
Imported controller maps use the same custom-map replay path but omit `source`;
their optional `importMetadata` records display-only provenance (`controllerName`,
`deviceId`, last IP, pixel count, imported timestamp, and the
`device-fill-normalized` honesty marker). This metadata is not a foreign key to a
Controller profile, so deleting a profile leaves imported maps intact.

### Aspect normalization: Fill / Contain

One shared pass maps raw geometry into `[0,1]`, in one of two modes — both real
Mapper behaviours, a **per-pattern** choice persisted on
`PatternRecord.normalize`, defaulting to Contain:

- **Contain** (`normalizeAspect`) — aspect-preserving; longest axis → `[0,1]`,
  shorter axes proportionally smaller.
- **Fill** (`normalizeFill`) — each axis independently → `[0,1]`.

`applyNormalizeMode` re-stretches resolved Contain `sample` values to Fill live
(no re-bake). It deliberately leaves `pos` in aspect-preserving Contain space:
Fill changes the coordinates the Pattern reads, not the physical placement or
canvas aspect. A pos-less 1D map therefore normalizes without inventing geometry.

### Viewport embeddings: shapes (1D) and surfaces (2D)

An embedding owns `pos` while the map owns `sample`; all embeddings are pure
`pos`-only generators.

Generated geometry families are the hardware-real sibling of this composition.
Every `SourceMapSpec` declares `kind: path | surface | shell | volume | custom`;
the classification is copied onto `PixelMap`/`MapMeta` and is never inferred from
an id or display name. `mapCatalogue.ts` owns stable group order, family collapse,
dimension/search filtering, and Custom/imported provenance. Empty groups are
omitted. `SourceMapSpec.family` groups ordinary source-backed map variants, while
`positionSource` names the family's one physical-point source. `createSourceMap`
evaluates the selected view source into `sample` and the shared position source
into `pos`, requiring index-aligned point counts. Cylinder ships Strand (1D),
Surface (2D, natural), and Spatial (3D) variants; every variant uses
`cylinder-spatial.js` for preview positions, so changing views cannot move a
pixel. Each view's standalone source still bakes, opens in map mode, pushes, and
reads back through the existing map contract. Cylinder is a wall distribution,
not a volume generator.

The shipped capability matrix is deliberately sparse:

| Family | Kind | Views |
|---|---|---|
| Square / Wide / panel winding | Surface | Strand, Surface (natural) |
| Cylinder wall | Surface | Strand, Surface (natural), Spatial |
| Cube / Sphere / Star / Tetra shell | Shell | Strand, Spatial (natural) |
| Cube / Sphere / Star / Tetra volume | Volume | Strand, Spatial (natural) |

All Strand variants reuse one standalone `strand.js` sample source and pair it
with their family's existing `positionSource`; the physical generator is not
copied. Shell variants retain the same normal recipe at every view, while volume
variants retain none. Ring's planar XY Path and literal Sunflower coordinates are
not promoted into families: no topology or extra coordinate axis is inferred.

- **Shapes** (`shapes.ts`, 1D): `line`, `ring`, and `pole` (a helix on a
  cylinder, drawn in 3D via `polePositions`, wrap density in `cameraStore`).
  Shared π-cell wall math in `cylinderWall.ts`. Each Shape supplies only `pos`;
  the selected true 1D map or implicit Index view independently supplies `[x]`.
- **Surfaces** (`surfaces.ts`, 2D): `flat` (identity) and `cylinder` (wraps the
  map's raw integer `gridDims` around a tube; `circumference : height =
  cols : rows`, fully map-derived).

Three embedding mechanisms, fixed by source-map arity: a 2D map can only wrap
onto a **developable** surface (Flat or Cylinder — a sphere needs a distortive
projection, a cube net only takes square-per-face grids); a 3D map owns its
geometry directly as a **shell** (boundary points, solid-eligible) or a
**volume** (interior fill, never solid-eligible).

### Layout routing (`layout.ts`)

Two orthogonal controls, not one union dropdown: **Map** owns `sample`, and
**embedding** owns `pos`. `mapOptions(nativeDim)` offers Index plus every real map
to every Pattern, stable-partitioned into exact-dimensional **Recommended** and
**Other dimensions**. Pattern native dimension chooses the initial/default group;
it is not a filter. The cascade's internal `AUTO_MAP_ID` sentinel lets an
untouched Pattern resolve to the first Recommended option without turning that
default into an explicit cross-dimensional choice. **Index** supplies
`x = index / pixelCount`; neither sentinel is a `MapRecord`, so neither appears in
Map mode or a Controller push.

`resolveLayoutSelection` restores any still-valid selected map, then derives the
embedding from that map's dimension: shapes for Index/1D, surfaces (gated on
`gridDims`) for 2D, none for 3D. A generated geometry family instead retains its
intrinsic 3D `pos` at every coordinate-view arity and suppresses the separate
embedding control. Thus a 3D-native Pattern on an ordinary 1D map gets a Shape,
while a 1D-native Pattern on a 2D map gets Flat/Cylinder.
`LayoutSelector.tsx` factors shared logic into `useLayoutControls()` and exports
the two controls separately so the deck can place them by what they are:
`MapSelect` renders inside the PIXELBLAZE block (stacked full-width, compatibility
groups and dimension badges); `CoordinateViewSelect` appears progressively under
a selected family; `EmbeddingSelect` renders on the transport row.
Fill/Contain keys off selected map dimension and remains hidden for 1D because
one axis has no aspect tradeoff.

`resolveLayout(input, deps): ResolvedLayout` is the single seam from a layout
*selection* to its drawn realization: selection-correction, active `mapDim`,
map/shape/surface resolution, the shared normalization, draw positions, solid-eligible normals, the
modeled `pixelCount`, and the `cols×rows(×depth)` readout label. The result's
`draw` is a discriminated union — `{ kind:'2d', positions }` or `{ kind:'3d',
positions, normals }` (normals present ⇔ solidity-eligible). `Preview.tsx` is
pure wiring over this; it holds no layout branching. To stay engine-pure,
`resolveLayout` takes its store-coupled lookups as injected `deps` — which also
makes every branch table-testable with fake maps (`resolveLayout.test.ts`).

The cylinder wrap and the readout label read the grid off the map itself —
`PixelMap.gridDims(count)` — so there are no map-id special cases: a map shows a
label exactly when `gridDims` is non-null. Each branch's modeled count runs
through one selector, `effectivePixelCount({ persisted, recommended, baked,
fallback })`, re-exported so the deck's editable count box reads the same chain
the renderer does.

### Recommended settings (`src/pixelblaze/stock/patterns.ts`)

Read-only demos carry no `PatternRecord`, so a single preview-only table sets
better on-open defaults: `RECOMMENDED_SETTINGS`, keyed by curated-pattern id,
holding any subset of the cascaded fields (e.g. `AuroraSphere →
{ mapId:'seed-sphere-3d', pixelCount: 4096, solidity: 1 }`). This is layer 2 of
the settings cascade (§12). It sets on-open defaults only; a user override
outranks it, and none of it reaches the pattern source, the artifact, or a
controller — the physical Pixelblaze knows only patterns and maps, never
associations.

## 9. Solidity & surface normals

**Solidity** is a preview-only, per-pattern display property of any
normal-bearing embedding or shell map: a `0 = transparent → 1 = solid` slider
fading back-facing points so a solid object hides its own back. It is a soft
terminator fade — a `normal · viewDir` brightness multiplier folded into
`project3D` beside the depth cue; front-facing points are never touched, and the
slider sets the floor the back fades to. At `0` the multiplier is uniformly 1
(the see-through draw, bit-identical).

Eligibility is the presence of a per-point normal, and is **provenance-gated,
not geometry-inferred**: the IDE supplies a normal only because it owns the
generator. Analytic embeddings (Cylinder) emit normals from their formula;
faceted shells (Cube/Star/Tetra) emit per-face normals; a convex shell (Sphere)
derives `normalize(pos − centroid)` because its catalogue entry carries a
`normals` recipe — the resolver maps the tag to the derivation (`NORMAL_FNS`), so
no map-id strings leak in. A hand-imported sphere-shaped cloud carries no recipe
and is never solid-able. Normals are preview-only — never stored in a map or sent
to a controller (a Pixelblaze map is positions only). Solidity persists on
`PatternRecord.solidity`; `editorStore.solidEligible` gates the deck slider.

## 10. Pattern loading, render loop, and WebGL

### Loading (`loadPattern.ts`)

`loadPattern` strips `export`, appends a generated epilogue, and evaluates via
`new Function(...builtinNames, body)(...builtinValues)` → a `PatternHandle`. The
epilogue exposes exact `render` / `render2D` / `render3D` slots (or no-ops); it
contains no hidden fallback chain. `nativeDimension(renderFns)` returns the
highest render fn defined for title metadata and Recommended map grouping, not
per-frame dispatch.

`renderCompatibility.ts` owns the firmware-3.66 preference matrix:

| Active map | Renderer preference |
|---|---|
| Index / 1D | `render` → `render3D` → `render2D` |
| 2D | `render2D` → `render3D` → `render` |
| 3D | `render3D` → `render2D` → `render` |

`selectRenderCompatibility` runs once when the preview loop is built. Exact arity
wins; `adaptSampleForRenderer` fills missing trailing coordinates with `0.5` or
drops extras. Its optional description is published as
`editorStore.renderAdaptation`; exact matches publish `null`. There is no manual
render-function selector. The shim receives the resolved layout's exact `mapDim`,
so `has2DMap()` is true only for 2D, `has3DMap()` only for 3D, and
`pixelMapDimensions()` is independent of Pattern renderer and viewport display.

### Render loop (`renderLoop.ts`)

Per `requestAnimationFrame`: scale `realDelta` by playback speed and advance the
virtual clock; `beforeRender(encodeScalar(scaledDelta))`; then per index, read
the map point's `sample`, adapt it through the preselected compatibility plan,
apply the transform stack, and call that exact Pattern render slot; capture the colour;
`paint(...)`; report watch values and a ~500 ms-smoothed FPS. Runtime throws are
caught — the loop stops quietly and reports via `onError`.

### WebGL renderer (`renderer.ts`)

A thin WebGL wrapper over `camera.ts`. All pixels draw as one `gl.POINTS` call;
the fragment shader renders a per-source kernel — a solid round core plus an
optional raised-cosine glow tail.

- **Diffusion** is a per-source point-spread, not a frame blur.
  `diffusionGlow(diffusion, coreDiameterPx, pitchPx)` returns the grown quad
  size, a dissolving `coreFrac`, and an overlap-normalised `peak` so the field
  never dims or blows out.
- **2D/1D**: one additive pass (order-independent); the canvas is sized to the
  layout's bounds aspect.
- **3D**: an opaque depth-tested core pass (nearer orbs occlude farther) plus an
  additive glow-tail pass into the gaps. The solidity fade and depth cue ride
  here.
- Degrades to a no-op renderer with no GL context (jsdom/tests).

### Camera (`camera.ts`)

Pure, fully unit-tested. A locked-2D camera derives extent/aspect from the
layout's `pos` bounds (`posBounds2D`, `canvasSizeForBounds`,
`projectPosInBounds`). An orbit camera (`OrbitCamera{azimuth,elevation,roll}`)
applies `Rz·Rx·Ry` plus orthographic projection; `fit3DScale`/`modelHalfExtent`
keep the rotation-invariant bounding sphere in frame; `depthCue` and the solidity
terminator size and shade per vertex. Caps: `MAX_PIXEL_COUNT = 65,536` (freeze
guard), `MAX_GRID_AXIS = 256`.

## 11. Libraries, demos & the porting toolkit

**Libraries**: the stock set lives in `src/pixelblaze/lib/` (read-only,
openable, authored in the Pixelblaze dialect): `Anim`, `Color`, `Coord`, `Noise`,
`SDF`, `Shader` — each with a `*.fidelity.test.ts` asserting Fast/Precise
agreement. User-owned cloud libraries share the same library-mode validator and
are stored as durable personal content; stock clones are user-owned cloud
libraries with fresh non-shadowing namespaces. The hardware `devbench` harness
loads the stock set and can add local cloud-library overlays with
`--library Namespace=/path/to/lib.js`, using the same non-shadowing merge helper
as the app compile paths.

**Stock patterns** (`src/pixelblaze/stock/patterns/`, read-only, forkable; UI label
**Built-in Patterns**): shader ports,
showcases, per-dimension test patterns, loaded at build time via
`import.meta.glob`.

**ShaderToy porting toolkit** (`Shader`), sequenced after fidelity because a port
is only worth doing if it survives upload. Key decisions:

- **No re-polyfilling.** `mix`/`smoothstep`/`clamp` are Pixelblaze built-ins with
  GLSL-matching signatures; `Shader` fills only genuine gaps.
- **`frac` vs `fract`.** Pixelblaze `frac` truncates; GLSL `fract` floors. They
  diverge for negatives, so `Shader.fract` is a distinct floor-based name, never
  a shadow of the built-in.
- **Integer-only hashes.** Only pure integer arithmetic is bit-identical
  preview↔hardware, so `hash21`/`hash11` are integer multiply/add, not the
  overflowing `fract(sin(…)·…)` idiom. They demote with `/ 256 / 256`
  (power-of-two, bit-exact) rather than `× 1/65536` (which the firmware number
  parser flushed to raw 0). Validated bit-identical on a real device.
- **Out of scope:** textures/`iChannel`, multipass feedback, `dFdx`/`fwidth`,
  `discard`, MRT, GLSL→3D porting. Automated GLSL rewrite is a non-goal.

**Performance** is its own living guide —
`docs/guides/Optimizing Pixelblaze patterns.md` — carrying the measured
per-built-in cost table from the hardware microbenchmark and the
bench-verifiable vs hardware-wisdom taxonomy.

## 12. Settings cascade & storage

### The per-pattern settings cascade

Effective preview settings resolve field-by-field through four layers, first hit
wins: **per-pattern override → recommended (curated patterns only) → user
global-sticky (comfort prefs only) → developer default**. The pure resolver is
`resolveSettings` (`src/engine/resolveSettings.ts`) over the `Settings`
vocabulary and `DEV_DEFAULTS` (`src/engine/settings.ts`); the store orchestration
seam is `src/store/settingsCascade.ts` (`seedActiveSettings` on open,
`writeCascadedOverride`/`writeHybrid` per control, `forkSettingsSnapshot`,
`resetActiveSettings`, `hasActiveOverrides`).

Layer-1 overrides are sparse and written only on genuine user manipulation: a
user pattern stores them on `PatternRecord.settings`; a demo stores them in
`patternStore.demoOverrides` (keyed by demo name, persisted), so a demo's tweaks
survive a reopen. `resetActiveSettings` clears whichever layer-1 bag is active —
a demo reverts to its recommendation, a user pattern to app defaults — and is
offered only when that bag is non-empty. `fidelity` is the one pure-global
field: never cascaded, persisted on its own.

### Personal content storage

`src/engine/personalContentProvider.ts` is the storage seam behind **Patterns**,
**Maps**, **Mixins**, **Libraries**, **Shows**, and Controller profiles. Durable personal content has one supported
backend: the authenticated Remote API provider, implemented by Cloudflare Pages
Functions over D1. When `/api/me` reports no signed-in session, startup installs
the non-durable demo provider instead. Demo mode returns empty personal
collections, ignores last-active/demo-override writes, and rejects personal
create/update/delete calls. Built-in demos, stock maps, stock mixins, stock
libraries, docs, and the preview remain usable without auth.

The Cloudflare D1 foundation is selected by the remote provider. The Wrangler
binding is `PXLBLZ_DB`, backed by the `pxlblz-ide` database. The migrations
create stable `users`, provider-specific `identities`, user-scoped tables for
personal patterns, personal maps, personal mixins, personal libraries, personal
shows, personal settings, durable Controller profiles, and controller metadata,
plus `app_metadata` for schema version
probing. The Pages Function at
`/api/d1/health` reads
`app_metadata.schema_version` and reports whether the binding is reachable; it is
only a backend foundation probe, not personal-content CRUD.

GitHub and Google OAuth start at `/api/auth/login?provider=...`, return through
`/api/auth/callback`, resolve the provider identity through `identities`, update
the durable `users` row, and set a signed `pxlblz_session` cookie whose stable
`userId` scopes personal content. Existing pre-identity GitHub users are
backfilled into `identities` with the same `users.id`, so personal content keys
do not move. Google sign-in auto-links only when the Google email is verified
and matches an already verified identity email; signed-in users can explicitly
connect another login from the account menu. `/api/me` verifies the cookie and
returns the user plus connected identities; `/api/auth/logout` clears the session
and `/api/auth/disconnect?provider=...` removes a linked provider unless it is
the last remaining login. The session signer and OAuth helpers live in
`src/cloudflare/auth.ts`, keeping provider/Cloudflare details out of React and
out of the personal content provider. Optional owner allow-lists are enforced
server-side before a session is issued.

Pattern operations call `/api/patterns`, custom map operations call `/api/maps`,
cloud mixin operations call `/api/mixins`, Show operations call `/api/shows`,
provider-owned settings (`lastActive`, `demoOverrides`) call
`/api/settings/:key`, and durable Controller profiles call `/api/controllers`.
Controller profiles are offline-editable records for hardware identity,
board-aware inputs, global transforms, per-pattern bindings, and zones. Their
pure validator lives in `src/engine/controllerProfile.ts`; it rejects analog
bindings on non-analog Pixelblaze v3 Standard pins using the ElectroMage GPIO
findings from the issue #289 spike. A Controller zone is a named list of
inclusive pixel-index ranges (`{ start, end }[]`); the page edits those ranges
directly, displays their total pixel count, and keeps legacy single
`start`/`end` zone rows readable by normalizing them on load. Profiles are
created from observed hardware rather than from a blank Studio form. They key
the physical controller by `device_id` when known, mirror the last observed
Pixelblaze device name into the profile `name`, and keep mutable convenience
fields (`lastKnownDeviceName`, `lastSeenIp`, `lastKnownPixelCount`,
`lastKnownMapDim`) for the Studio controller page's offline status strip.
Controller push metadata remains a sibling
framework-free storage seam: overwrite bindings (`controller-bindings`) and
program label caches (`controller-program-labels`) and saved-artifact push
records (`controller-push-records`) call
`/api/controller-metadata/:key`. All D1 helpers scope list/update/delete
predicates by the signed session's `userId`. The UI labels personal collections
as **Patterns**, **Maps**, and **Controllers**; Controllers opens durable profile
pages, while live hardware controls stay in the top-right Controller surface.
Signed-out users see sign-in prompts where personal workspace actions would be;
no browser-local durable workspace is created, and no browser-to-D1 migration is
attempted or implied.

Shows are persisted as `ShowRecord`s in `personal_shows` (migration 0007):
`name`, `scenes_json`, `zones_json`, `cells_json`, optional
`target_controller_profile_id`, optional `stage_map_id` (migration 0009), and
`routing_layouts_json` plus `routing_switches_json` (migration 0012), and
`updated_at`. `showStore` owns the active Show and writes every
scene/cell/zone/stage edit immediately through `/api/shows`. The
pure model helpers in `showModel.ts` create the default two-scene/one-zone
strip, seed a Show from a Controller profile's zone map, project the arrangement
into scene columns + zone rows, append scenes by copying the prior scene's
covering cells per zone, remove scenes while clipping or re-anchoring spanning
cells so every remaining zone row stays hole-free, edit show-local zone names
and nominal pixel counts, extend cells across scene boundaries as hold shapes,
edit non-destructive adaptations, and build compiler recipes. A one-zone Show
keeps the scene-boundary policies: a spanning cell emits a single continuous clip;
adjacent same-pattern cells with a non-cut transition emit a parameter ramp
between the cells' rampable adaptations when their discrete adaptations match;
different light-shutter settings keep separate clip instances. Separate cells
with a cut emit distinct clip
instances so the second clip gets a fresh virtual time base. A multi-zone Show
currently emits the first scene's cells as routed clips, one clip per populated
zone row. A cell can also span downward across adjacent zone rows: the compiler
emits that clip with `zones: [...]` and `zoneMode: 'span'`, so the named zones'
ordered ranges become one continuous 1D domain. Without a target Controller,
show-local zones become sequential nominal ranges for preview (`0..n-1`, then
the next zone after that); with a target, compile uses the Controller's real zone
ranges and binds clips by zone name.

Every normalized `ShowRecord` has at least one named routing layout. A layout
stores `zoneId -> [{start,end}]` independently from Controller-profile zones;
legacy rows synthesize one sequential `Default` layout from nominal Show-zone
sizes. Routing switches store `afterSceneId -> layoutId` and are valid only on
non-final scene boundaries. Removing a scene removes its marker; removing a
referenced layout removes its markers; the final layout cannot be removed.
Adding a Show zone appends a sequential range to every layout, while removing a
zone removes its layout entries.

`ShowEditor` renders the scene strip as a recessed composition surface: scene
headers are inline-editable labels, zone headers carry the zone color, cells are
zone-tinted clips, transitions are seam buttons between scenes, and holding cells
physically span across transition columns. UI-local selection drives one
contextual inspector. The default show selection edits target Controller and
stage-map setup; cell selection edits source pattern/adaptations/scene span/zone
span; transition selection edits the selected scene boundary; zone selection
edits a single show-local zone row. The strip includes ghost affordances for
appending scenes and zones. Scene removal is confirmed with an AlertDialog and
delegates to the pure `removeShowScene` helper. The compile/budget bar,
read-only generated-source view, and run-to-Controller action compile the
generated source through the active provider and push bytecode to the connected
controller.

`showEpeExport.ts` wraps that exact generated source in the standard EPE envelope
`{name,id,sources:{main},preview}`. Export mints a normal 17-character PXLBLZ
program id and uses `buildPreviewJpeg` for the same 100×150 base64 waterfall JPEG
carried by Controller exports. Before serialization it adds a human-readable
Show summary and the normal `artifactStamp` banner with `kind=show`; filenames
are ASCII-safe slugs; spatial portal Shows add the `spatial-transitions`
transform. The summary lists source Pattern kind/id references, scenes, routing
layouts, transition kind/duration/settings, and boundary switches while leaving detailed provenance/license
comments inside the isolated member sources. `ShowEditor` displays the stamped
source and uses it for both EPE download and connected-controller compilation, so
the inspected, downloaded, and hardware-compiled forms cannot drift.

The routing lane occupies a dedicated strip row above the zone cells. Boundary
markers select a destination layout in the contextual inspector. Show Setup
owns layout CRUD and compact range-list authoring (`0-63, 128-191`). The range
parser and all routing mutations remain pure `showModel` operations; the React
surface delegates edits through `showStore`.

Generated range branches remain the routing compiler's general representation:
they preserve arbitrary pixel sets, require no Pixelblaze arrays, and are the
best measured tradeoff for layouts with a small number of contiguous runs.
The #400 benchmark compares that emitter with RLE tables, packed per-pixel
lookup, and generated formulas at 256 and 1,024 pixels across 2, 4, and 8
layouts. RLE loses on both memory and runtime. Formulas are the preferred future
specialization when a regular layout can be proven; bounded packed lookup is a
possible escape hatch when irregular branch output would exceed the measured
68,384-byte device budget. It is not the default because a 256x8 table already
spends 2,048 array elements and a 1,024x8 table grows beyond device capacity.
Pattern Prism (#401) ships the bounded packed fallback from that evidence. A
named-layout schedule selects packed lookup only when its total branch-run count
is at least 64 and the complete `pixelCount * layoutCount` table is at most
2,048 elements; otherwise it retains range branches. Packed entries encode both
route ownership and dense zone-local index, preserve first-route-wins overlap
semantics, and keep one member renderer per physical pixel. The compile summary
reports `range-branches` or `packed-pixels`, and the Show compile bar displays
the choice. #408 remains open for conservative formula recognition and richer
estimated memory/bytecode reporting. The repeatable runner and complete emulator/compiler/hardware matrix live in
[`issue-400-routing-representation-results.md`](../plans/archive/issue-400-routing-representation-results.md).

`ShowStagePreview` is the right-pane Show context surface. It compiles the active
Show through the same `compileShowForPreview` helper used by the editor and runs
the generated artifact through the normal dimension-compatible preview render loop.
For the default strips stage, `zonePreview.ts` builds synthetic sequential
Controller zones and a 2D strips layout so multi-range physical zones flatten into
diagnostic rows. For a map stage, the same module builds a spatial zone
projection over the selected map's pixel count: target Controller zones bind by
real index ranges, unmatched freestyle rows use consecutive nominal ranges,
off-stage rows warn in the legend, uncovered map pixels are masked dim grey, and
solo blackens every non-solo zone without moving the geometry. The stage map
selection is saved per Show as `stageMapId`; a dangling id falls back to strips.

The current Show compiler (`src/engine/showCompiler.ts`) emits these policies:
single continuous hold (`single-continuous-hold`), cut/restart
(`cut-restart`), two-renderer crossfade (`steady-active-transition-both`),
same-pattern adaptation ramp (`parameter-ramp-one-renderer-per-pixel`), and the
#334 route-cost transition path (`route-transition-one-renderer-per-pixel`) plus
the #317 zone route pass (`route-one-renderer-per-pixel`). #398 extends that route
policy with a looping named-layout schedule: each frame selects the latest
scene-boundary marker, updates each member's zone-local `pixelCount`, advances
every member once, and emits only the active layout's range branches. Loop wrap
returns routing to layout zero while private Pattern clocks continue. Each member pattern is
alpha-renamed, gets a private elapsed-time accumulator, and receives per-member
adaptation variables for brightness, phase, time scale, mirror, and an optional
full-clip light shutter. Adaptation
ramps interpolate those variables once per frame and call only one renderer per
pixel; the transform summary marks them as `transitionCost: 'parameter'` with
`worstInstantRenderersPerPixel: 1`, unlike crossfades, which report a
renderer-window cost and `worstInstantRenderersPerPixel: 2`. Wipe and dither
route transitions run both members' `beforeRender` hooks during the transition
window but render exactly one member per pixel: wipe compares `index/pixelCount`
to the animated mix threshold, while dither compares a stable hash of `index` to
that threshold. A wipe feather (#377) is a normalized fraction of the 1D route.
At zero, compiler output is byte-identical to the original hard-wipe branch. At
a positive width, pixels outside the band route deterministically; pixels inside
compare their fixed index hash to their progress through the moving band. The
hash never changes, so a pixel flips owner once rather than sparkling between
frames, and only the selected member renderer is invoked. `routePolicy` reports
`hard-wipe`, `feathered-wipe`, `dither`, or `none`. Route transitions report
`transitionCost: 'route'` and
`worstInstantRenderersPerPixel: 1`; live harness notes are archived in
`docs/plans/archive/issue-334-route-cost-transitions.md`. A routed clip names a
zone; compile binds by zone name, warns in the summary when a show-local zone
has no matching Controller zone, and emits a single Pixelblaze artifact. Route
recipes may contain more than two clips because each physical pixel still calls
at most one member renderer. At render time the route pass tests the global LED
index against each route domain's ordered ranges, computes a continuous
zone-local index across multi-range zones, sets that member's virtual
`pixelCount` to the domain's total size, and calls exactly one member renderer
for the matching pixel. Multi-zone clips default to independent domains by
expanding into one member instance per named zone; `zoneMode: 'span'` keeps one
member and merges the zones into a single canvas. `zoneMode: 'repeat'` also
keeps one member, but routes it through every named zone as an independently
normalized domain and advances its `beforeRender` only once per frame. Routed
native-2D members emit an outer `render2D`: each route derives a compact square
frame from dense local index (256 pixels -> 16x16, 64 -> 8x8), while routed 1D
members keep the existing index path. The cell inspector exposes **one canvas**
and **repeat per zone** after Span zones exceeds one.

The #383 portal path is a spatial scene-boundary policy and emits an outer
`render2D(index, x, y)`. Member Patterns with native `render2D` receive those
coordinates; 1D members remain compatible through their normal `render(index)`.
The circular threshold expands to the farthest Stage corner from the configured
normalized center, or contracts when inverted. A zero-width hard edge reports
`portal-hard`; a stable spatial hash through a positive feather reports
`portal-dithered-feather`. Both use `spatial-route-one-renderer-per-pixel`,
`transitionCost: 'route'`, and one worst-instant renderer. True blend reports
`portal-blended-feather`, `spatial-route-bounded-feather`, and
`transitionCost: 'bounded-renderer-window'`; it calls both members only for
pixels inside the moving feather band. Recipe conversion requires the Show's
saved Stage Map to resolve to dimension 2. Preview dispatch supplies that map's
normalized coordinates, while the same standalone artifact uses the
Pixelblaze's configured 2D map on hardware. Reproducible hardware observations
are archived in `docs/plans/archive/issue-383-spatial-portal-results.md`.

#402 adds `portalSequence` for a single-zone Show with three or more portal-linked
scenes. Recipe conversion deduplicates cells that reference the same Pattern and
normalized adaptations, so an A -> B -> A loop compiles two members rather than
three fresh instances. The generated scheduler loops over hold and transition
segments: holds advance/render one member, portal windows advance both members,
and the existing portal renderer still calls the second renderer only inside a
true-blend feather. The final hold may return to the first member, making loop
wrap continuous without an implicit restart. Studio loop duration includes
transition windows; routing-layout schedules retain their scene-hold clock.
The exact browser export is
`artifacts/electromage/scene-splice-showcase.epe`; reproducible hardware results
are archived in `docs/plans/archive/issue-402-scene-splice-results.md`.

Show time scale is normalized to the closed range `0..4` (#376); negative input
clamps to zero and `0` survives model updates, cloud persistence, recipe
conversion, and compiler normalization. Every member advances through
`scaledDelta = delta * adapt_timeScale`, so at exact zero its private elapsed
accumulator and the `delta` passed to its rewritten Pattern `beforeRender` remain
zero. The generated outer `beforeRender` and per-pixel `render` still execute:
this is a clock pause, not an evaluation mask or buffered frame hold. A
same-Pattern adaptation ramp interpolates through zero on the existing member
instance, so stop, dwell, and resume preserve state without implicit restart.
`ShowCompileSummary.clockPolicy` distinguishes `real-time`, `scaled`,
`scaled-ramp`, `exact-pause`, and `exact-pause-ramp` while render policy and
`worstInstantRenderersPerPixel` continue to report the unchanged renderer cost.
`ShowStagePreview` loads this same generated artifact (float or fixed-point)
that hardware receives, rather than approximating pause in React or the stage
renderer.

Stepped clock (#379) is an optional clip adaptation stored as
`steppedClock.stepMs`, normalized to `16..60000` ms. Its cadence clock advances
through eligible real time, independently from `timeScale`; a light shutter in
`continue` mode leaves cadence advancing behind darkness, while `freeze` admits
only the shutter interval's exact open-time overlap. Each generated member keeps
both pending cadence milliseconds and the corresponding pending scaled Pattern
delta. Between boundaries its private `time()` and rewritten Pattern
`beforeRender` remain frozen, but the outer per-pixel renderer continues to draw
the same Pattern state. At a boundary, the wrapper delivers the accumulated
non-negative scaled delta as one jump and retains any post-boundary remainder.
Thus Time x changes jump distance while jumps-per-second controls release
timing.

A continuous hold keeps the same member and pending cadence state. A cut/restart
selects a fresh member whose cadence accumulator begins at zero. Same-Pattern
adaptation ramps remain one-member ramps only when their discrete stepped-clock
and light-shutter settings match; different schedules keep separate clip
instances. `ShowCompileSummary.temporalPolicy` reports `continuous`,
`stepped-clock`, or `mixed`, and every clip reports its `stepMs`. Renderer policy
and `worstInstantRenderersPerPixel` remain unchanged. `ShowStagePreview` compiles
and runs this exact generated artifact. The cell inspector presents the approved
cadence-first Smooth/Stepped control at `0.25..30` jumps per second with an
interval readback, explicitly separate from the light shutter.

Private time offset (#380) is an optional non-negative per-cell clock adaptation,
normalized to `0..60000` ms and compiled as `timeOffsetMs`. It initializes that
member's private elapsed accumulator, so rewritten Pattern `time(interval)` sees
the offset immediately; it does not alter the non-negative `delta` delivered to
Pattern `beforeRender`, cadence phase, brightness, or route coordinates. Time
scale controls subsequent clock advance, exact pause holds the configured
origin, and stepped cadence releases scaled motion on its ordinary eligible-time
boundaries. A continuous hold keeps the member clock, while a cut/restart creates
a fresh member initialized at its own configured offset.

Time offset is discrete for same-Pattern recipe selection: cells with different
origins remain separate members instead of entering a one-member adaptation
ramp. Routed zone rows therefore can reuse byte-identical Pattern source with
different private origins. Multi-range zones retain their continuous local pixel
index, and each physical pixel still invokes exactly one routed renderer.
`ShowCompileSummary.timeOffsetPolicy` reports `none` or `per-clip`; every clip
reports its normalized `timeOffsetMs`, while render policy and
`worstInstantRenderersPerPixel` remain unchanged. The cadence-first inspector
places Start offset beside the motion controls and the compile bar labels it as
clock parameter work with unchanged renderer cost.

A light shutter (#378) is an optional generated evaluation mask with normalized
rate (`0.01..60` Hz), duty (`0..1`), phase (`0..1`), and `continue` or `freeze`
clock behavior. The shutter oscillator follows outer Show time. Each member's
capture wrapper clears its RGB slot first; while closed it skips the rewritten
Pattern renderer, so the ordinary emit path produces explicit black without
calling source Pattern code. In `continue` mode the private clock and original
`beforeRender(delta)` advance normally behind darkness. In `freeze` mode the
wrapper integrates the exact open-time overlap of each outer frame interval and
delivers only that accumulated duration to the private clock and Pattern
`beforeRender`; a wholly closed interval calls neither. Duty `0` is always
closed, duty `1` is always open, and omitting the shutter leaves generated
runtime code byte-identical to the unmasked path.

The artifact summary reports top-level `evaluationPolicy` (`full`,
`masked-shutter`, or `mixed`) and `expectedActiveFraction` when one aggregate
fraction is honest. Every clip also reports `full`,
`masked-shutter-continue`, or `masked-shutter-freeze` plus its own expected
active fraction. These numbers describe Pattern evaluation only. Firmware still
calls the generated outer `render(index)` for every pixel and LED transport is
unchanged; the Show editor states that limit alongside the estimate. Stage
preview runs the same generated artifact and therefore exercises identical
mask, boundary, hold, and restart behavior.

`PatternRecord` carries the per-pattern overrides in a sparse
`settings?: Partial<Settings>` field — superseding older flat columns;
`migratePatternRecord` lifts pre-cascade records into the nested bag on read and
rewrites retired ids, schemaless throughout (no DB bump). Override writes go
through `updatePatternSettings` (a sparse merge that does not bump
`src`/`updatedAt`). `MapRecord` carries `source`/`points`/`gridDims` and
optional controller-import provenance (§8).
`MixinRecord` carries `name`, pass `kind`, Pixelblaze-dialect `src`, and
`updatedAt`; `/api/mixins` persists it in `personal_mixins` (migration 0006).
`ShowRecord` carries scene-strip data and is D1-backed through `/api/shows`.
New personal pattern/map/mixin/show records use UUID ids.

Selection is tri-state (pattern / library / demo). **Create** writes a runnable
animated starter immediately. **Import** parses `.epe` JSON (`epeImport.ts`,
takes `sources.main`) into a new user pattern. **Fork** copies a read-only demo
into an editable pattern, snapshotting the demo's *effective* settings into the
new record as frozen layer-1 overrides — no live pointer back. CRUD helpers
use the active personal content provider; tests inject memory providers or mock
the authenticated API.

## 13. Live Controller connectivity

The IDE can connect to a real Pixelblaze and mirror/drive it live: a status
surface, a live panel, and Send to Controller for patterns and maps. The whole
stack sits behind one provider seam; no UI imports a transport.

### The constraint that shapes everything

From an https deployment the browser cannot open `ws://<LAN-IP>:81` — mixed
active content, blocked outright (Ecosystem Primer §10). A helper outside the
browser sandbox must relay. The v1 helper is a **Chrome extension** (superseding
the originally anticipated Node "local bridge"): the page can't reach the device,
but the extension's service worker can.

### The isomorphic protocol core (`PixelblazeConnection`)

A framework-free `PixelblazeConnection` (injected `WebSocketLike` factory) speaks
the documented JSON + binary protocol on `ws://host:81`. It is the shared engine
across every transport — Node `ws` for tooling, browser `WebSocket`, the
extension relay — because each is just a different `WebSocketLike`. It serves:

- **The documented JSON API** plus the **divergence harness**
  (`test/divergence-harness/`, `npm run harness`), which sweeps a probe pattern
  against a real device and writes the committed divergence report gating the
  fidelity engine. Unit-tested against a fake in-memory WebSocket; the live tier
  runs out-of-band.
- **The binary-frame protocol** — `listPrograms` decode,
  `getControls`/`setControls`/`brightness`/`activeProgramId`, and the
  *undocumented* chunked pattern-push, verified on a real device.

### The provider seam (`ControllerProvider`)

`ControllerProvider` (`src/engine/ControllerProvider.ts`) is the firewall
containing the entire "how do we reach a Controller" decision. It exposes
`connect`/`disconnect`, a `ControllerStatus` subscription (`no-extension |
extension-present | connecting | connected | error`), the read/monitor surface
(`getConfig`, telemetry, `listPrograms`, `readSavedProgram`, controls, `brightness`,
`setPixelCount`, `checkFirmwareUpdate`), and the capability-gated
`compile`/`pushBytecode`/`getPixelMap`/`pushPixelMap`. The app imports only this
module and its types — never an extension API, `PixelblazeConnection`, or
`RelayWebSocket`. A `NullControllerProvider` (permanently `no-extension`) lets
the whole UI render before any backend exists. The `controllerProviderRegistry`
holds the active provider, a per-IP factory, and a global extension `detect`;
`main.tsx` installs the real ones, tests inject fakes.

### The extension backend (`ExtensionControllerProvider`, `RelayWebSocket`)

The v1 backend owns a `PixelblazeConnection` whose socket is a `RelayWebSocket` —
a `WebSocketLike` proxy tunnelling frames across a `window.postMessage` →
content-script → service-worker seam to a real `ws://` socket in the extension.
Because it satisfies the same `WebSocketLike`, the entire protocol engine drives
it unchanged — the relay adds transport, not protocol. Binary frames cross the
seam as base64 (`chrome.runtime` messaging is JSON-only).
`windowRelayTransport` is the one module that touches `window`; everything above
it is transport-agnostic and unit-tested with a fake relay emulating a device
end-to-end. The extension itself (`extension/`: manifest, `background.js` service
worker owning the sockets, `content.js`, an offscreen-hosted sandbox) stays on
the far side of the seam. The provider adds the extension-present handshake
(`detectHelper`), the status state machine, a keepalive ping, a liveness watchdog
(device declared gone after ~4 s of inbound silence even with no socket close),
and bounded auto-reconnect (MV3 can evict the service worker; a powered-off
Controller is expected back, so it keeps probing).
Socket-independent operations use reqId-correlated relay messages. In addition
to compile, discovery, map, and identity reads, `get-program` asks the helper for
the raw HTTP `/p/{programId}` blob; binary PBP bytes cross back as base64 for
page-side decode.

### Per-IP just-in-time host permissions

The extension must reach `ws://<LAN-IP>:81` and `http://<LAN-IP>/…` (compiler
fetch, `/pixelmap.dat` read-back, `/p/{programId}` saved-program read-back,
`/wifistatus` identity read) at
runtime-discovered IPs, but Chrome match
patterns can't express "the local network", and a static broad grant reads as a
network-sniffing surface that fails Web Store review (#229). So LAN reach lives
in **`optional_host_permissions`**, granted **per device IP, just-in-time**; only
`https://discover.electromage.com/*` is a required host permission (discovery
must work before any IP is known). When the app connects to an ungranted IP, the
service worker opens the extension's action popup, which calls
`chrome.permissions.request({ origins: ['http://<ip>/*', 'ws://<ip>/*'] })` —
Chrome's native *"Allow access to `<ip>`?"* dialog is the actual grant. The popup
batches all discovered IPs into one request, so onboarding a fleet is a single
dialog. The grant gates every device-bound call; the reconnect path must
distinguish "socket failed" from "permission missing for this (new) IP" — a DHCP
reassignment re-triggers the popup rather than silently retry-failing. The helper
emits `permission-needed` as soon as it opens the popup; the provider carries it
as `authorizationNeededIp` on the `connecting` status, and the pill renders an
"authorize via the helper" hint so the page never sits silently through the 60 s
grant timeout. A declined grant surfaces as a typed
`ControllerPermissionDeniedError` so the store drops the half-created pill back
to idle. The build is distribution-agnostic — the identical manifest works from
the Web Store or loaded unpacked. If the IDE tab was already open when the helper
was installed, the **I've installed it** button re-runs detection and reloads the
tab when the content script is absent (Chrome injects static content scripts on
navigation, not retroactively).

### Auto-discovery (cloud, via the helper)

The browser cannot find devices on the LAN — **UDP beacon discovery is impossible
from an MV3 extension** (`chrome.sockets.udp` is a dead Chrome-Apps API), so the
reference clients' port-1889 beacon path is closed. The only viable path is
**cloud discovery**, and only from the helper:
`GET https://discover.electromage.com/discover` matches Controllers by public IP
and returns `{ id, ip, localIp, name, version, boardType, … }` records. The page
can't read it (no CORS header — the same wall as `ws://LAN`), but the service
worker with a host permission can. `background.js` owns the fetch; the result
crosses the relay seam as a `reqId`-keyed `discover`/`discover-result`
round-trip, connection-independent. The seam exposes `discover()` on
`ControllerProvider` (Null returns `[]`; failures return `[]`), maps `localIp`
→ connect address and `id` → stable key, and the `ControllerBar` shows
candidates as clickable rows driving the existing keyed
`addController(discoveredController)`. A discovered row carries its stable `id`
into the provider target and its `name` in as a seed nickname, so the pill is
born named and claimed; `boardType` and firmware `version` display as quiet
metadata in the network list. Discovery runs automatically when the connect
dropdown opens, refreshes on a timer while open, offers a manual rescan (spinner
in flight), and filters out already-connected Controllers by IP or by stable
device id when known.

### Live Controller identity

Live connection state carries a `deviceId` field that is either the stable
Pixelblaze id or `null` for an unclaimed-but-usable connection. Discovery picks
thread the cloud `id` directly into `ConnectedController`. Manual IP connects
recover it opportunistically: after the websocket opens, `getConfig` captures the
settings packet's `boardType`, the helper fetches `http://<ip>/wifistatus` for
the MAC, and the provider builds
`pixelblaze_${boardType}_${reverseMacBytes(mac)}`. If that direct read is
unavailable, the provider falls back to helper cloud discovery and matches by
`localIp`. All identity reads are best-effort; failure leaves the connection live
with `deviceId: null`. The keyed store mirrors `deviceId` in memory only; durable
metadata belongs on Controller profiles. Profiles use the last observed
Pixelblaze device name as their durable `name`, keep `lastKnownDeviceName` for
older-record display fallback and metadata sync, plus `lastSeenIp` as a
convenience hint and `board.firmwareVersion` as last-seen firmware metadata. The
Studio `Controllers` rail lists durable profiles by last observed device name
with a live/idle marker derived from `deviceId`; selecting one opens
`/studio/controllers/<id>`, a durable profile page for hardware inputs, global
transforms, per-pattern bindings, zones, and a read-only status strip. That page
does not own live controls: the active connection controls stay in the top-right
Controller panel. There is no blank-new Controller profile action in the Studio
rail and no profile-name alias/rename path; users can delete profiles, while
creation happens from live observed hardware. When a signed-in session has a
live Controller with a stable `deviceId`, `ControllerBar` asks
`controllerProfileStore` to ensure a durable profile exists: existing profiles
are refreshed, and missing profiles are auto-created from the device
name/id/IP/firmware. A live Controller with `deviceId: null` stays fully usable
but is not auto-persisted from IP alone. Background auto-create and an explicit
Profile click share the same in-flight creation promise, so the action cannot
race the observer into duplicate profiles. Deleting a profile suppresses
same-session auto-recreation for that device id. When the matching physical
Controller is connected, the profile refresh path updates `name`,
`lastKnownDeviceName`, `lastSeenIp`, `lastKnownPixelCount`, `lastKnownMapDim`,
and last-seen firmware.
Discovery firmware can seed the profile before full live metadata is available;
a later live config read overwrites it.

The live Controller panel polls `getConfig`, `getTelemetry`, and `getVars` while
connected. Ordinary numeric exported vars render in the **variables** section.
Reserved IDE telemetry names (`__px_powerDutyRecent`,
`__px_powerDutySinceStart`, the legacy `__px_powerDuty`,
`__px_powerMilliAmps`, `__px_powerLimit`, `__px_powerScale`, and
`__px_powerClipping`) are filtered out of that generic watch list and rendered
as a structured **power** section instead. Duty renders as `recent / since
start`; when a cap-enabled profile matches the live Controller, the normalized
cap renders as a 0..1 slider alongside it. Slider changes optimistically update
panel state and send volatile `{setVars:{__px_powerLimit:…}}` over the provider
seam. The running bytecode owns that edit only until the next pattern push,
which reinitializes the export from the Controller profile default. The recent export only
changes at roughly two-second block boundaries, while the since-start value
advances per frame. The limiter responds from a separate short internal EWMA.
When the active Controller
profile has power-cap electrical provenance, the panel derives a contextual amps
estimate from recent emitted duty after scaling, current device pixel count, stored
full-white mA/pixel, and current live native brightness; the UI labels those
assumptions and never presents the result as a measurement. The older
`__px_powerMilliAmps` export remains reserved for the standalone measurement
mixin. All telemetry rides over the documented Pixelblaze `getVars` websocket
path; no separate pattern-code message channel exists.

### The in-app surface (status pills, panel)

- **Status + connect** live in the top-right `ControllerBar`: one interactive
  pill per connected Controller (status dot folded into the pill) plus one
  adaptive entry affordance whose dropdown adapts to extension presence. Pure
  view-models: `controllerStatusView`, `controllerPillView`. Connection state is
  keyed and multi-Controller in `controllerStore` — each Controller keyed by IP
  with its own isolated provider/socket/reconnect, exactly one active; the
  last-connected IP alone auto-reconnects on reload. Dot tones are the shared
  traffic-light vocabulary (`StatusDot`): dark-grey absent, grey idle, amber
  fast-blink connecting, green live, red error.
- **Firmware availability is device-authoritative and session-only.** Once a
  Controller is live, `PixelblazeConnection.checkFirmwareUpdate` sends
  `{upgradeVersion:"check"}` and polls `{getUpgradeState:true}` while the device
  reports `checking`, bounded to roughly five seconds. `firmwareUpdate.ts`
  decodes the vendor's numeric state vocabulary. `controllerStore` caches the
  check timestamp by stable device id (IP fallback) for one hour and mirrors the
  result into that Controller entry without persistence. Only `available`
  changes UI: a separate amber icon joins the still-green pill and the live
  panel links to `http://<ip>/` with **Settings → Updates** guidance. Unknown,
  unsupported, timeout, and service-error paths are silent and never alter the
  Controller connection state. PXLBLZ neither compares release versions nor
  installs firmware.
- **The name is cached and sticky.** The store persists the last-connected IP
  *and* its nickname, so on reload the pill is born named. The name only ever
  upgrades: a fresh `getConfig` name wins, but a transient empty read must not
  clobber a known name back to the IP — both the live patch and the persisted
  value guard on "did we actually read a name." Discovery rows and same-IP
  reconnects seed pending pills from the known name, so a named Controller never
  flashes its IP.
- **The live panel** is a pinned popover under the active pill.
  `controllerPanelStore` polls a small live slice (1 s);
  `controllerPanelView` renders rows of `DeckStat`/`DeckField`/`DeckSlider`:
  active pattern (id resolved to a name via program-list → local label cache →
  raw id) + brightness, map-points + pixel count, IP + FPS, then live controls.
  Above that data, `ControllerActionRow` (#374) gives the popover its three
  controller verbs: button-styled Run and Save plus unboxed Profile navigation.
  Its pure `describeControllerActionRow` projection is route-aware because the
  pattern store deliberately retains its last active pattern on Gallery, Shows,
  and other routes; only a Studio pattern route may enable those actions. The
  caption names the open pattern or explains why actions are unavailable, while
  the two mode gates reuse `describeSendToController`, `isAlreadyPushed`, and the
  same Controller-profile artifact signature as the editor control. Clicking a
  verb arms the matching `saveArmed` mode and calls the shared `requestPush` flow;
  the editor send control is unchanged. Profile remains available independently:
  it resolves the Controller's `deviceId` against profiles and opens the newest
  match, creates one from current live hardware when appropriate, or navigates a
  signed-out session toward Studio. The old bordered profile join row is gone.
  Matching is never by IP or name; unclaimed live Controllers remain live-only
  until a stable device id can be recovered (an explicit Profile click can still
  create their unclaimed durable record).
  On connect the panel is warm-seeded once so it opens populated; a same-device
  close/reopen keeps the last-known slice (`stop` preserves, `seed` clears only
  on device switch). Brightness is panel-owned and volatile — seeded once from
  the device's first report, then slider-owned, always `save:false` (flash wear);
  control writes likewise. Both are coalesced through `throttleTrailing`
  (leading + guaranteed trailing flush, injectable clock) to ~10/s. The
  brightness slider is logarithmic (`DeckSlider`'s `curve` prop — position-only;
  callers pass real `0..1`). A pixel-count edit holds the entered value in
  `pixelCountPending` (input dimmed) until the slow `save:true` write settles, so
  a mid-write poll can't flash the stale count. A control whose device value
  isn't a finite `0..1` (`controllerSliderValue` → `null`) renders the
  indeterminate hollow-ring state with a `—` readout, still draggable — covering
  run-only patterns (no `getControls`) and saved patterns whose
  `activeProgram.controls` report drifted bound-variable values.

### Send to Controller — pattern push (`pushPattern`, `controllerBinding`)

`compile`/`pushBytecode` are capability-gated: the device's own compiler runs
inside the helper's offscreen sandbox (the only MV3-legal place to eval the
remote compiler), turning source into bytecode; `pushBytecode` sends it over the
socket. `pushPattern` owns the policy, in one of two modes chosen by the sticky
**Run / Save** pill (`controllerStore.saveArmed`, persisted); the Send button's
glyph and tooltip follow the armed mode via `describeSendAction`. Run and save
are tracked as independent acts — the dirty gate keys off source plus the
generated-code Controller-profile signature in each mode, so a clean run push
doesn't satisfy a pending save and a transform/binding edit re-arms Send without
a source edit. Controller-profile edits update Zustand optimistically, serialize
durable writes per profile, roll back the latest optimistic edit on failure, and
expose a drain barrier; Push waits at that barrier before reading durable profiles.
The profile's Global Transforms table makes this persistence/application split
explicit: edits auto-save immediately but alter device code only on the next
push. Its per-transform descriptions report the current output-sink boundary:
hardware brightness intercepts `hsv`, power cap intercepts `hsv` and `rgb`, and
neither intercepts `paint`.
Before compile, `controllerStore.pushActivePattern` resolves the active
live Controller to its durable Controller profile (`deviceId` first,
`lastSeenIp` fallback) and asks `controllerProfilePassRecipe` for pass-engine
recipes. With no profile transforms and no missing-coordinate renderer adapter,
the no-op recipe emits the same artifact as `bundle()`. With the
hardware-brightness global transform enabled, it samples the configured analog
input once per `beforeRender`, smooths/inverts/falls back according to the
profile input, intercepts `hsv(...)` output calls through the stock
`hw-brightness` mixin, and stores the pass-engine transform summary in
`controllerStore.lastTransformSummary[controllerId][patternId]` for later
inspection. With the power-cap global transform enabled, the push recipe also
intercepts both `hsv(...)` and `rgb(...)` calls through one stock `power-cap`
mixin. HSV estimates duty with `v * (1 - s/2)` and scales `v`; RGB estimates
duty as `(clamp(r) + clamp(g) + clamp(b)) / 3` and scales all three channels.
Both paths export the same recent and since-start reserved `__px_power*`
telemetry windows. A composed `beforeRender` finalizes the previous
frame without device-side arrays. A roughly 250 ms EWMA drives scaling when it
exceeds the mutable exported `__px_powerLimit`; the profile's normalized
`maxDuty` only initializes that export when the artifact is pushed. Its response is independent
of the two display windows. The since-start incremental mean caps its scalar
weight at 16,384 frames to stay in a useful 16.16 fixed-point range while
retaining its deliberately slow, flattening behavior.

Every Pattern push also appends a renderer-adapter recipe keyed to the live
Controller's installed map dimension. A no-op exact/lower-dimensional recipe is
not recorded as a transform and leaves the bundled artifact byte-identical. A
missing-coordinate case adds one exact renderer export, reports its source and
adapter renderers plus centered coordinates, and estimates +1 function call per
pixel. Generated-source inspection shows the adapter verbatim. The run/save
dirty signature includes map dimension, so replacing the Controller map re-arms
Send even when source and Controller-profile configuration are unchanged.

`planHardwareRenderer` is the firmware capability seam. An exact generated
adapter on a 2D/3D map is compatible even on older firmware because the device
sees an ordinary exact renderer. True 1D maps and unadapted lower-dimensional
fallback require reported firmware 3.66+; a known older version blocks the plain
push, while an unknown version produces an honest push-past warning. The
artifact path repeats the guard immediately before compile so direct callers
cannot bypass preflight.
The pure `powerCap.ts` model owns the derived/direct calculator: derived mode
computes `target amps / (brightness * pixelCount * mA-per-pixel)` and clamps it
to 0..1; direct edits preserve calculator provenance. Per-pixel full-white
current is durable power-management data on the transform itself, defaults to
60 mA/px, and stays editable in both modes. Older serialized transforms resolve
the legacy provenance value first and otherwise fall back to 60; the next power
setting edit writes the top-level field into the existing
`global_transforms_json` D1 column, so no schema migration is required. Missing
brightness provenance prefills from a matching active Controller config, while
stored provenance is never silently overwritten when the device later differs.
Pixel count is read from current/profile state and is not calculator input.

The Controller panel's estimated draw is a separate live projection. Because
the exported duty windows are upstream of native Controller brightness,
`describeControllerPowerTelemetry` multiplies recent duty after limiter scale by
the panel's current brightness, current pixel count, and the profile's mA/px.
Changing the panel brightness therefore recomputes both the amps value and its
assumptions caption without a re-push. Setup brightness remains calculator
provenance only. Native brightness stays the hard device output cap controlled
from the live Controller panel, never a value copied from preview state.
Matching per-pattern bindings add another pair of passes per binding:
one inject pass samples the configured input once per `beforeRender` with
smoothing/fallback/invert, and one bind pass calls an exported slider or named
function, or assigns a named variable after scaling the normalized input through
the binding's min/max/quantize rules. Pattern source is never edited; only the
generated artifact sent to hardware changes. The modes:

- **Run-only** (default): compile, mint a throwaway program id, load + run via
  `pushBytecode` — the firmware's `setCode`/`putByteCode`/`pause:false` sequence
  (the reference client's `sendPatternToRenderer`). The pattern runs but is not
  persisted — it never enters Saved Patterns and its id resolves to no name. The
  `setCode` name is sent empty, matching the reference; the display name lives in
  the local label cache instead. Run-only deliberately does not consult or write
  the overwrite binding.
- **Save** (`persist: true`): compile, stamp the generated source artifact,
  encode a **PBP blob** (`encodePbp`,
  `pbpEncode.ts`) — a 17-char id plus a 36-byte header of nine LE uint32s
  (version, then offset/length pairs for name/jpeg/bytecode/source) followed by
  the concatenated sections; the source rides as the firmware-required
  `{"main":<source>}` JSON container, LZString-compressed, the preview JPEG an
  empty section — and write it via `saveProgram` (`putSourceCode`, binary type 1,
  payload = id bytes + blob). This creates the `/p/{id}` record that shows in
  Saved Patterns with its name. Save then activates: it `pushBytecode`s under the
  same stable id (carrying the real name) so the device switches to the freshly
  saved program, and the store refreshes the panel's program list. Mirrors
  `PBP.fromComponents` / `PBP.toPixelblaze` in
  [pixelblaze-client](https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L2992).

**Program ids** minted for new run-only or saved pushes are 17-character firmware
ids with a `pxb` prefix followed by random characters from the firmware's
unambiguous base-53 alphabet. `isPxlblzProgramId(id)` recognizes that convention
from a plain device program list, which lets future Controller inventory UI flag
programs this IDE minted without downloading PBP source. The prefix marks only
fresh ids minted here: overwriting an older existing binding keeps that existing
id, and the artifact banner above is the durable provenance for those records.

**Overwrite-in-place** (`controllerBinding`) applies to save mode only, because
only a saved pattern enters the program list: each `(Controller, IDE pattern)`
pair remembers the device program id it last saved to and reuses it (an id the
user deleted on-device is silently re-minted, detected against the live
`listPrograms`). Run-only's id never lists, so binding it would churn a fresh id
every push. Control values are never in either push; the binding is identity
only, persisted in D1 through controller metadata storage.

**Push records** (`controllerPushRecord`) are the saved-artifact companion to
those bindings and use the same `(Controller, IDE pattern)` key. After every
successful save-and-run, `pushPattern` parses the exact banner it embedded in
the PBP and persists `{ transforms, artifactHash, stampedAt, name }`; re-pushing
overwrites that key even when the bound device program id is reused. Sibling
records are preserved. Run-only pushes neither load nor write this store, so
they remain ephemeral and recordless. Because the hash, transforms, and time
come from the embedded banner rather than a parallel calculation, later
freshness checks compare against the artifact that was actually saved.

**Saved-program read-back** (`ControllerProvider.readSavedProgram`, #372) is the
inverse capability needed for controller-to-Studio recovery. The extension
fetches `/p/{programId}` over HTTP, following the reference client's
[`PBP.fromPixelblaze`](https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L2978-L2989)
composition. A 404 resolves `null`; authorization, network, other HTTP, timeout,
and undecodable-blob failures reject with caller-facing errors. The pure
`recoverSavedProgram` function decodes the PBP, keeps the device-stored name,
returns foreign source unchanged, and parses then strips a PXLBLZ banner so
IDE-owned source and `ParsedPxlblzBanner` provenance are separate values. A
valid PBP with no source remains recoverable with `sourceCode: null`. This is an
engine/relay capability consumed by the Controller-profile inventory import.

**Saved-program inventory** is the Controller profile route's live, read-only
right-hand context pane (`ControllerSavedProgramsPane`), replacing the otherwise
empty preview slot without lengthening the editable profile column. Its
projection is built by `describeControllerSavedPrograms`: the pane calls the
active Controller provider's `listPrograms`, reads that Controller's overwrite
bindings and push records, and joins binding keys against personal patterns and
built-in demos. `describeTransformFreshness` compares the saved transform ids
with the profile's currently enabled transform ids as order-independent sets:
equal is `current`, unequal is `stale`, and a missing record is `unmanaged`.
Bound programs are grouped first and link to their Studio route when the source
still exists; orphaned bindings remain identified as IDE-owned without a broken
link. Unbound programs remain visible in device order beneath a counted,
visually quieter foreign-program heading. The pane reads only while the
matching Controller is live and exposes explicit loading, refresh, offline,
empty, and error states. Profile transform toggles therefore recompute badges
without another device read.

Each inventory row also exposes an **Import** action (#373). After read-back,
the pure `decideSavedProgramImport` projection chooses one of four outcomes:
an artifact stamp that names a still-existing personal pattern or demo opens
that route; a stamped pattern missing from Studio is restored with its recovered
source and original pattern id; foreign source creates a new personal pattern
with a fresh id and a conflict-safe name; and source-less or non-pattern
artifacts produce an explicit unavailable explanation. The confirmation dialog
labels name, source, and Studio id as recovered or newly assigned before any
write occurs. `createSavedProgramPatternRecord` is the framework-free record
constructor; the component supplies persistence and navigation. Import never
renames, deletes, or otherwise mutates the device program.

**Program label cache** (`withProgramLabel`) is a parallel structure, persisted
under its own controller metadata key and keyed by device program id (not pattern
id).
Every push records the pushed name against the program id it landed on, so the
panel can name a running program the device list doesn't know. The panel resolves
the active program's name in three tiers — program-list name → local label → raw
id — and a label-tier hit is surfaced with an *unsaved* marker, so
running-but-not-saved reads honestly. The two stores stay separate deliberately:
they answer different questions ("what is this program called?" vs. "which
program do I overwrite for this pattern?").

`sendToController` is the pure gate for the editor-header button: enabled only
when a Controller is connected, the pattern compiles, and — when known — its
dimensionality matches the installed map (an unknown map dim never blocks).
**Demos are pushable too**: the dirty gate and overwrite binding key off
`activePushKey(patternStore)` — the user pattern's id, or a `demo:`-namespaced
key — so a demo sends without forking. Pattern pushes do not reconcile pixel
count: they send bytecode only and keep the device's existing count/map. Their
preflight is limited to cross-dimensional renderer explanation and firmware
capability. Supported combinations remain push-past warnings; a known
unsupported firmware combination blocks plain Send unless installing the
demo's recommended exact-dimensional map resolves it.

### Send map to Controller, and map read-back

A Pixelblaze stores one shared map per device, so a map push is a guarded
device-configuration act — always routed through the preflight dialog, never a
silent one-click. The open-map descriptor (`openMapForPushState`) covers both
editable custom maps (last baked points + source) and read-only stock maps
(baked on demand). `mapPush.ts` encodes the binary `mapData` blob (mirroring
`createMapData`/`setMapData` in pixelblaze-client
[`pixelblaze.py`](https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L1641)):
a 12-byte header of three LE uint32 `[formatVersion, numDimensions, bodyBytes]`
then each coordinate as a `formatVersion`-byte LE uint. **Deliberate divergence
from the reference:** our points are already firmware-normalized to `[0,1]` by
the preview layout (the user's Contain/Fill choice), so we scale straight through
and only clamp, rather than re-running the reference's per-axis Fill stretch
(which would silently break aspect). What the preview shows is exactly what the
device receives.

Key firmware facts gate the rest:

- **True 1D maps require firmware 3.66+.** `describeSendMap` disables a dim-1
  transfer when a connected Controller reports an older version, while an
  unknown version remains non-blocking. Dim-1 uses the same binary map format
  with `numDimensions = 1`; a 256-pixel reversed/discontinuous map was verified
  by device read-back on a V3 Standard running 3.67, with the original map
  restored byte-for-byte afterward (#391).

- **Cross-dimensional artifacts are explicit (#393).** On a V3 Standard with
  256 pixels, reversible hardware sentinels verified 1D map → `render2D`, 1D map
  → `render3D`, and 2D map → `render3D` all observe missing coordinates as exactly
  `0.5`; 3D map → `render2D` preserved only x/y. The probe restored the original
  map byte-for-byte and restored the original active Pattern. This establishes
  the generated adapter behavior without claiming when the observed firmware
  argument spill originated.

- **The exact-count rule.** A pushed map must contain exactly `pixelCount`
  coordinates or the firmware won't apply it — frames report success, nothing
  changes (#204). So `resolveMapPushPoints` re-bakes the map source to the
  device's `pixelCount` before encoding (mirroring the reference
  `setMapFunction`), conforming any map whose `function(pixelCount)` honours its
  argument. A hard-coded point count can't conform — the remedy is setting the
  device count to match, which is why the panel's pixels row is editable
  (`setPixelCount(n, save:true)`). This is a push-time constraint, distinct from
  the post-hoc stale-map drift.
- **Map read-back is an HTTP GET of `/pixelmap.dat`, not a WS call** (#205).
  There is no "get map" WS message and `getConfig` carries no map data, so the
  helper fetches the file over HTTP (the same helper that fetches the device
  compiler). `numPixels = bodyBytes / numDimensions / formatVersion` from the
  header, so even the point count is a cheap parse — surfaced beside the panel's
  pixels row so a dropped map is easy to spot. Read-back also
  supplies the map dimensionality the Send gate uses. (The Fill/Contain fit mode
  is map-bound — saved with the map, not a standalone settings field — so it
  rides read-back too.)
- **Controller profile import** (#338) builds on the same read-back path:
  `ControllerProfilePage` activates the profile's live provider, calls
  `getPixelMapData()`, hashes the raw `/pixelmap.dat` bytes, decodes them with
  `decodeMapData`, summarizes the coordinates with `inferDim` and
  `detectGridDims`, then either opens a matching Studio map or creates an
  ordinary `MapRecord` with `generator:'custom'`, frozen `points`, no `source`,
  and display-only import provenance. Pixelblaze-native Mapper writes are
  Fill-normalized per axis; PXLBLZ map pushes preserve the user's selected fit,
  so imported provenance records the Fill-normalized caveat where known.
- **Map provenance is fingerprint-based** (#343). The firmware's `mapData`
  format has no metadata slot and rejects non-reconciling blobs, so the IDE
  never embeds identity into a map. Instead `mapFingerprint.ts` hashes the
  deterministic encoded bytes. A successful map push records `{ hash, mapId,
  mapName, devicePixelCount, pushedAt }` on the Controller profile. Read-back
  first matches that profile record, then candidate-matches every current Studio
  map (stock + user) baked at the device's point count. If a match exists, the
  Import map flow opens that Studio map instead of minting a duplicate; genuinely
  foreign maps still import as frozen user maps.
- **Reducing the count must black out the tail first** (#222, verified on
  hardware). WS2812s hold their last value until re-clocked and the device only
  clocks `pixelCount` LEDs, so after a reduction the LEDs beyond the new count
  freeze lit. Nothing clears them as a side effect — not a `pixelCount` write,
  not a `putPixelMap`, and there is no per-pixel wire command (the canonical
  Pixelblaze UI leaves them lit too). The only mechanism is to clock the whole
  strip black while the count is still high, then shrink:
  `applyControllerPixelCount` zeroes brightness (`save:false`), waits one
  full-length dark frame (~400 ms), writes the new `pixelCount` (`save:true`),
  then restores brightness. It reads the restore brightness from `getConfig` and
  skips the blackout if that's unreadable (zeroing a brightness it can't restore
  would strand the strip dark). Both count-setting flows — the panel edit and the
  map-push "set count only" remedy — go through this one helper. A deliberate,
  hardware-honest maneuver: it does exactly what you'd do physically.

## 14. Export

- **Copy Code** — `stampArtifact(bundle(source).code, patternMeta)` to the
  clipboard; disabled while compile is broken.
- **Download** — the same stamped artifact as `<sanitized-name>.js`. The
  fixed-point `fxCode` is preview-only and never exported.

The artifact is the only thing that crosses to hardware. Metadata, the
fixed-point emit, and the whole settings cascade stay browser-side — the
consistent rule of §2.

## 15. In-app docs viewer

The user docs (Ecosystem Primer, Feature Guide, Optimization Guide) ship inside
the app. `src/docs/catalog.ts` imports each markdown file `?raw` at build time,
pairs it with its SVG assets (`?url`), and serves them at `/docs/<id>` routes
(legacy `#/docs/<id>` hash links redirect there; in-doc cross-links still emit
hash hrefs, caught by the `hashchange` listener).
`DocsReader` renders a block model produced by `src/engine/docsMarkdown.ts` — a
small purpose-built parser covering exactly the subset the docs use: h1–h3
headings (with slugged ids), paragraphs, blockquotes, ordered and unordered
lists (hard-wrapped continuation lines fold into their item), fenced code, pipe
tables, images, and rules, with strong/code/link inline spans. It is hand-rolled
rather than a markdown dependency so no raw HTML can ever reach the DOM —
unsupported syntax degrades to plain text. Relative links between catalog docs
resolve to in-app hash routes; links to repo files outside the catalog fall back
to GitHub URLs; image paths resolve through the bundled asset map.

## 16. Testing

Pure engine functions are the primary target: transpiler, validator, fixed-point
ops, camera projection, map/shape/surface generators, normals, dimensionality,
storage, and the transport-agnostic connectivity logic (a fake relay emulates a
device end-to-end). React components get smoke coverage only. Library fidelity
tests (`*.fidelity.test.ts`) assert Fast/Precise agreement per function;
`fixedpoint.bench.ts` benchmarks the multiply hot path; the hardware
microbenchmark (`test/perf-harness/`) profiles real per-built-in cost to guide
pattern-perf advice. A Playwright E2E smoke (`e2e/smoke.spec.ts`) covers the
route-level flows (Gallery, detail, Studio welcome gate). Husky runs
`npm run lint && npm test` pre-commit; the live hardware tier and E2E are
excluded from the gate and run out-of-band.

## 17. Known limits & accepted divergences

- **Float64 vs 16.16** — Fast is float64; Precise is faithful 16.16 (±32768,
  1/65536, int32-wrap overflow).
- **Algorithmic divergence** — `perlin`/`prng`/transcendentals are different
  algorithms than firmware; documented, not chased. Only pure integer arithmetic
  is bit-identical.
- **Main-thread execution** — patterns evaluate and render on the main thread
  (`new Function()` + rAF + WebGL), with no worker isolation. A syntactically
  valid infinite loop freezes the entire tab; there is no watchdog (real hardware
  has one). The clean-compile debounce — re-evaluating only on the periodic
  clean-compile tick, never per keystroke — reduces but does not eliminate this.
  The deferred fix is **one combined worker**: pattern exec and OffscreenCanvas
  draw together in a single worker, so the whole hot loop lives off the main
  thread and pixel buffers never cross the boundary (only low-frequency
  control/camera messages do). A worker *relocates* execution, it does not
  accelerate it — its two real prizes are responsiveness (editor stays live while
  a heavy 3D pattern grinds) and a real watchdog (a worker can be
  `terminate()`d). It needs no `SharedArrayBuffer` (whose cross-origin-isolation
  headers GitHub Pages cannot set); transferables suffice. The honest cost is
  that the engine's synchronous orchestration becomes message-passing async at
  the `renderLoop` seam — so it is deferred until the watchdog or 3D
  responsiveness genuinely bites. The pure modules stay synchronously
  unit-testable regardless.
- **Inert sensors** — sound/sensor-expansion globals are stubs; reactive
  patterns run but don't animate.
- **`fidelity` is pure-global by design** — a machine/performance choice, never
  recommended and never per-pattern; it persists as one global value.

## 18. Pointers

- **Feature guide** (using the IDE) — `docs/reference/PXLBLZ Feature Guide.md`
- **Ecosystem primer** (the platform itself) —
  `docs/reference/Pixelblaze Ecosystem Primer.md`
- **Optimization guide** — `docs/guides/Optimizing Pixelblaze patterns.md`
- **Domain glossary** — `CONTEXT.md`

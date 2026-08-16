# PXLBLZ — Technical Reference

This is the as-built engineering reference for PXLBLZ-IDE: the current
architecture, the decisions that constrain it, and the seams new work should
extend. It is a map into the code, not a recreation of it — each section names
the owning modules and their contracts, then points at the deeper document or
archived evidence. User workflows belong in the **PXLBLZ Feature Guide**;
platform concepts in the **Pixelblaze Ecosystem Primer**. Where this document
and the code disagree, the code wins.

PXLBLZ has two product surfaces over one browser engine: a public Gallery and
an authenticated Studio. Pattern editing, transpilation, execution, preview,
and hardware artifact generation happen in the page. Durable personal content
lives in Cloudflare D1 behind Pages Functions. Live Controllers sit behind an
optional Chrome-extension relay because an HTTPS page cannot open their LAN
WebSockets directly.

---

# Part 1 — Architecture

## 1. Stack and system boundaries

| Concern | Implementation |
|---|---|
| Build and local development | Vite, with API proxying to local Wrangler |
| UI | React + TypeScript + Tailwind CSS + selected shadcn/ui primitives |
| State | Zustand stores, readable outside React |
| Editor | Monaco with a Pixelblaze language mode |
| Parsing and rewriting | Acorn |
| Personal persistence | Cloudflare Pages Functions + D1 |
| Preview drawing | WebGL point renderer |
| Tests | Vitest/jsdom plus Playwright suites and hardware harnesses |
| Commit gate | Husky: lint and full Vitest suite |

![System boundaries: the browser contains UI, shared state, and the pure engine; only durable content and explicit hardware intent cross its boundary](../images/system-map.svg)

**Engine versus UI.** `src/engine/` is framework-free TypeScript: parsers,
transforms, compilers, state projections, validators, protocol logic, geometry.
Engine modules do not import React. Components render state, delegate events,
and call engine functions. Zustand is the shared state seam because render
loops and Controller providers need synchronous access outside React.

**Icon tiers.** `src/components/iconScale.ts` fixes chrome-glyph size and
stroke weight by role (`railIcon` 17, `controlIcon` 15, `denseIcon` 13,
`inlineIcon` 12, plus the `transportIcon` exception). Controller connection
glyphs are hand-drawn in `ControllerGlyphs.tsx` at a weight that matches Lucide
at small sizes.

**Hardware artifacts stay Pixelblaze code.** The transpiler inlines and
renames; it never translates into another runtime language. Passes derive
another inspectable Pixelblaze artifact; Shows compile into one Pixelblaze
Pattern; map source is ordinary Mapper JavaScript. This keeps preview,
generated source, the device compiler, and manual copy/paste on one code path.

**Preview state does not leak to hardware.** Renderer mode, camera, light
size, diffusion, playback speed, preview brightness, selected preview map, and
control positions are browser state. Hardware receives only an explicitly
generated Pattern artifact or an explicitly sent map. Controller-profile
transforms are included because they are authored hardware intent.

## 2. Routes, surfaces, and authentication

The pure route codec is `src/engine/routes.ts`; `routerStore` owns History API
mutation; `App.tsx` performs the route/store join after collections resolve.

| Route | Surface |
|---|---|
| `/`, `/gallery`, `/gallery/<slug>` | Public Gallery |
| `/p/<slug>` | Built-in Pattern detail |
| `/studio`, `/studio/<kind>/<id>` | Studio entities |
| `/studio-welcome` | Signed-out Studio gate |
| `/docs`, `/docs/<id>` | Public documentation |
| `/reference`, `/reference/<library>` | Public API Reference |

Studio routes wait for `/api/me`. GitHub and Google identities attach to one
stable user row; a verified matching email auto-links at sign-in. The API keeps
explicit link/disconnect endpoints but the app exposes no linking UI (#701).
Any valid GitHub or Google identity may create or enter a Studio account. OAuth
callbacks redirect with privacy-safe result and provider markers: success is
recorded quietly, while failures map to a dismissible notice through
`src/engine/authResult.ts`. Every personal-resource route still requires a
valid session and scopes D1 reads and writes to the stable user id.

**Gallery runtime.** `galleryCatalog.ts` owns the complete built-in
`STOCK_PATTERNS` catalogue, its public `GALLERY_PATTERNS` subset and directory
slugs, and (as `DEMO_SECTIONS`) the immutable Studio rail folders. Patterns in
the `Test Patterns` section stay in the Studio catalogue but are absent from
the public subset, so they have no Gallery card, directory, or detail route.
Cards run the real bundle/shim/render pipeline at bounded pixel counts with an
animation slot limit, IntersectionObserver pausing, and a reduced-motion static
frame. Cards, Pattern detail, and Studio resolve one shared recommended
presentation per Pattern. The `ZRanger1` section keeps its published popularity
order; other sections are alphabetical.

**Analytics** flow through a typed seam; local development and tests send
nothing. OAuth intent and callback outcome events use only the provider,
outcome, and coarse failure code, never account or profile data.

## 3. Personal content and persistence

`personalContentProvider.ts` is the browser-side storage interface. The
authenticated implementation calls Pages Functions backed by D1; demo mode
returns empty collections and rejects durable mutations while leaving stock
content and live hardware usable.

Resource families: Patterns, Maps, Mixins, Libraries, Shows, Controller
profiles, Settings (`/api/settings/:key`), and Controller metadata
(`/api/controller-metadata/:key`), each under `/api/<family>` and a matching
D1 table. All access is scoped by the signed session's stable `userId`. There
is no browser-local durable workspace; local storage holds only small
device/session preferences.

`workspaceStarters.ts` seeds one editable starter Pattern, map, Mixin, and
Library into a completely empty account, once, guarded by a versioned Settings
record so deletion cannot resurrect a starter.

Storage limits are coarse anti-griefing tripwires, not quotas: 1,900,000-byte
JSON bodies, 100,000,000 stored bytes per account, 1,000,000 personal rows.
Guard failures use stable JSON error codes.

Entity organization (folders, order, Trash, collapsed state) lives in six
allowlisted Settings sidecars, one per entity kind, holding only stable record
ids. `entityOrganizationStore` applies changes optimistically, serializes
writes per kind, and rolls back a failed latest write. Empty Trash deletes the
referenced resources before atomically clearing their Trash entries. If a
resource deletion fails after earlier deletions succeeded, the collection and
sidecar reconcile immediately: only undeleted records remain in Trash, and a
retry targets that remainder.

`studioOperationStore` owns failures for one-shot personal-content operations
on two independent launching surfaces, rail and editor. Its captured operation
closures keep create/Clone IDs, rename targets, delete IDs, and Empty Trash
remainders stable across Retry. A newer operation or Dismiss supersedes older
in-flight results, so a late rejection cannot replace current feedback.

## 4. Application state and editor modes

Major Zustand stores, one line each:

| Store | Responsibility |
|---|---|
| `routerStore` | Route and History synchronization |
| `workspaceStore` | Authentication resolution |
| `patternStore` / `mapStore` / `mixinStore` / `libraryStore` / `showStore` | Personal collections and editing state |
| `entityOrganizationStore` | Folders, order, Trash for all six kinds |
| `studioOperationStore` | Rail/editor one-shot failure notices and exact Retry intent |
| `showTransportStore` | Ephemeral playhead, loop duration, seek identity |
| `editorStore` | Authored source, last published preview source, preview availability, validation, flavor |
| `previewStore` | Playback, visual settings, telemetry, watched vars |
| `controlStore` | Current Pattern control values |
| `cameraStore` | Ephemeral orbit, 3D magnification, Pole density |
| `controllerStore` | Multi-Controller connections and push orchestration |
| `controllerPanelStore` | Polled live state for the active Controller |
| `controllerProfileStore` | Durable profile CRUD and live refresh |

Stores export initial state for test resets. Engine code does not depend on
React store hooks; store-coupled lookups are injected.

**Monaco and validation.** `Editor.tsx` runs two timers: a short preview
debounce publishing clean source, and a slower sync tick persisting source or
baking a map. Broken code stays visible with markers while the last clean
preview keeps running. Four source flavors — Pattern, Map, Mixin, Library —
each pair their own validation with their own right pane. Stock content opens
read-only and clones into personal records.

Pattern persistence separates authored text from executable preview source.
`navigationPreflightStore` captures a dirty personal Pattern before any
buffer-replacing transition and queues its exact source through the same
per-record chain as ordinary autosave. The departure write accepts valid,
broken, and empty source. Its transition runs only after the captured source is
both durable and still current; failure leaves route, selection, editor, and
preview untouched, while a newer in-flight edit cancels the captured
transition. `openPatternRecord` validates saved source before preview
publication. Broken or empty records restore their exact editor text, clear
`previewSource`, and set an explicit unavailable reason so `Preview` covers
stale canvas pixels until `Editor` publishes repaired source. Map, Mixin, and
Library broken-source navigation retains explicit discard confirmation.

---

# Part 2 — Pattern compilation and preview

## 5. Transpiler and library model

`bundle(patternSource, libraries)` returns `{ code, fxCode, metadata }`: the
flat float artifact for preview and hardware, the Precise-mode re-emit, and
preview-only metadata (renderers present, exported vars, controls). Metadata
and `fxCode` never cross to hardware.

Patterns parse as Acorn modules (top-level `export` is legal); libraries parse
as scripts. The bundler resolves transitive `Namespace.fn()` references,
alpha-renames, rewrites call sites, and emits only the reachable function
graph. `// @inline` above a single-expression library function makes
`Namespace.inline.fn()` expand at the call site, with safety checks on arity,
argument evaluation order, and definition shape. Top-level library `var`
declarations are liveness-filtered by declarator.

Stock libraries (`SDF`, `Anim`, `Color`, `Coord`, `Noise`, `Shader`) live
under `src/pixelblaze/lib/` as raw source; personal libraries join the same
namespace map everywhere. References are soft: renaming or deleting a library
makes dependent Patterns fail bundling with a clear error. `//` comments above
functions become Monaco hover help and API Reference entries.

The `Shader` library fills real GLSL gaps without pretending to be a shader
translator; `Noise.hash11`/`hash21` use integer arithmetic because the
familiar `fract(sin(...) * bigConstant)` idiom overflows 16.16. Textures,
multipass feedback, derivatives, and automated GLSL rewriting are out of
contract.

## 6. Pass engine and generated artifacts

`bundleWithPasses(source, libraries, recipe)` applies an ordered,
JSON-serializable recipe to the flat artifact; an empty recipe is
byte-compatible with `bundle()`.

![Pattern artifact pipeline: authored source branches into Fast and Precise preview products, while explicit passes and provenance produce outbound Pixelblaze artifacts](../images/artifact-pipeline.svg)

Pass kinds: **inject** (prepend source, compose `beforeRender`), **intercept**
(rewrite AST-located, unshadowed `hsv`/`hsv24`/`rgb`/`paint` calls), **bind**
(drive a function or variable from a normalized source with range/quantize),
and **renderer adapter** (exact map-dimensional wrapper). Generated
identifiers use the reserved `__pxlblz_` prefix; collisions and unsupported
call shapes become transform warnings, and generated source is always
inspectable. The interception boundary is deliberately honest: aliases, object
methods, and dynamically selected sinks are not guessed.

**Source manifests.** Every stock Pattern opens with a compact human-readable
manifest (name, provenance, description, controls). `parsePatternManifest`
owns the format; `extractPatternAuthors` also reads `Credit:` lines and the
community date-plus-name signature convention, so upstream authors become
structured Show attribution. Show compilation strips only this reader layer.

**Artifact identity.** Outbound source is stamped with a comment-only banner:
version, kind, Studio id, name, CRC32 hash (excluding any existing banner),
timestamp, transform ids. Preview uses unstamped source; Copy/Download and
Save-mode PBP embed the stamp; Run-only bytecode has no source and no banner.
`parsePxlblzBanner` is the read-back seam. New program ids are 17 firmware
characters with a `pxb` prefix; overwrites preserve pre-existing ids, so the
banner is the durable provenance signal.

## 7. Validation, loading, and runtime shim

`validateSource` runs an Acorn syntax pass plus an AST rule walk for
Pixelblaze-language violations (`let`, `const`, class, `switch`, `new`,
exceptions, imports). `loadPattern` strips `export`, appends an epilogue
exposing render/control/var handles, and evaluates with
`new Function(...builtinNames, body)` so built-ins are parameters, not
globals. `createShim` supplies the built-in surface, map introspection,
Pixelblaze-like arrays, per-pixel color capture, and inert hardware/sensor
globals so unsupported Patterns fail softly.

## 8. Precise fixed-point preview

Precise mode re-emits bundled code for 16.16 arithmetic: signed int32 raw
values, wrapping add/subtract/compare, limb-decomposed multiplication, and
Pixelblaze-oriented division, modulo, bitwise, and indexing semantics.
`fxEmit.ts` rewrites operators and literals; `createFxShim` wraps the runtime;
`encodeScalar`/`decodeScalar` keep controls and the var watcher mode-agnostic.
It is faithful to the numeric model, not a firmware clone: transcendental
internals run in float64 before quantization, and `perlin`/`prng` use
documented alternate algorithms. Divergences are measured by the hardware
harness, not hidden.

## 9. Render compatibility and frame loop

Render selection follows the firmware 3.66 preference order per map dimension
(1D: `render` → `render3D` → `render2D`; 2D: `render2D` → `render3D` →
`render`; 3D: `render3D` → `render2D` → `render`). Missing trailing
coordinates fill with `0.5`; extras drop.

Each animation frame scales delta by preview speed, calls `beforeRender` once,
renders every pixel through the adapted coordinates and transform stack,
paints, and publishes FPS and watched vars. Runtime exceptions stop the loop.
`tickHeadless` executes all stateful render work without painting; Show seek
replay depends on it because render functions may mutate state.

The Show Stage has two advancement contracts: live playback advances once per
presented frame (`advanceLive`), deterministic seek advances at fixed 60 Hz
(`advanceTo`). Fast replay flattens samples and compatibility at creation and
keeps a packed `Float64Array` hot path. Generated Show metadata may name one
compiler-owned temporal-feedback seek variable, set through a narrowly scoped
preview-only `setPatternVar()` seam during clear-at-target replay.

Deterministic seek replay checkpoints the complete fast-replay runtime state at
roughly two-second virtual-time intervals. A seek restores the nearest usable
checkpoint at or before its target into the existing compatible runtime, then
replays only the residual fixed steps. Cold seeks still reconstruct from Show
start and populate every checkpoint interval they cross. The checkpoint key is
exactly the generated-artifact identity, Stage map-point identity, random seed,
Fast/Precise fidelity, fixed step, and temporal-feedback seek mode; a Show edit
produces a new artifact identity and therefore a cache miss without partial
invalidation. Snapshot size can widen the interval, and a bounded oldest-first
policy limits retained entries. Only deterministic replay captures checkpoints;
real-delta `advanceLive` frames never do. A snapshot or restore failure discards
the affected optimization and retries the seek cold rather than presenting a
possibly corrupted frame.

While the Stage is paused, a stable compiled artifact starts one background
pre-warm pass after a short edit-settle delay. The pass creates a private runtime
and deterministically replays one complete Show loop in 250 ms virtual-time
chunks, returning to idle priority between chunks. It writes checkpoints only:
it never paints a frame, publishes its runtime, or moves the transport. Existing
coverage resumes from the checkpoint before the first missing interval, and a
fully covered loop creates no runtime. An artifact or layout change, a real seek,
playback, or closing the preview invalidates the pass; completed checkpoints
remain coherent and a paused replacement artifact starts a new pass after edits
settle.

Generated Shows may carry a deterministic-replay capability when the compiler
proves every emitted renderer path target-state-pure. The proof follows the
selected renderer and its helpers after routing and Effects have been emitted.
Renderer-local scalar scratch is admissible only when every semantic read is
dominated by an assignment and no `beforeRender` or external helper observes
its history. The capability records snapshot-visible scratch and normalizes it
after every deterministic step, including full-render verification steps; an
inactive member therefore cannot retain a different last-render value at a
checkpoint or target. Accumulators, array or alias writes, dynamic calls,
destructuring assignment targets, function-valued helpers on an external
observer path, mutable function declaration bindings, render-target history,
including block-level declaration collisions, render-target history, and
temporal feedback fail closed. A capable replay
advances the virtual clock and `beforeRender` on every fixed step, skips pixel
traversal on intermediate steps, and renders the requested target frame
normally. Live playback and artifacts without the capability keep the full
renderer path.

## 10. WebGL, camera, and preview settings

`renderer.ts` draws all pixels as WebGL points (2D additive; 3D depth-tested
core plus additive glow; diffusion is a per-source point-spread kernel). It
degrades to a no-op without WebGL, keeping jsdom tests practical. `camera.ts`
owns pure projection and fitting; caps protect against pathological counts
(`MAX_PIXEL_COUNT = 65,536`).

Interactive 3D surfaces share an ephemeral `0.5x..2x` magnification contract
through `cameraStore`, applied after fitting so positions and point size grow
together; wheel zoom uses coarse 0.25x steps, the slider 0.05x. The setting is
neither cascaded nor persisted. The Map context pane is outside that policy:
`mapDiagnosticViewport.ts` and `mapDiagnosticRenderer.ts` draw an additive
depth-test-free x-ray in wire-order color, fit to actual bounds, with bounded
index labels and coincident-coordinate counts — a wiring check that ignores
Pattern visual settings.

Effective preview settings resolve field-by-field: per-Pattern override →
built-in recommendation → user comfort baseline (light size/diffusion only) →
developer default. Personal overrides live on `PatternRecord.settings`;
built-in overrides in `demoOverrides`. Fast/Precise is a separate global
setting.

---

# Part 3 — Maps and spatial presentation

## 11. Map source and persistence

A map is an index-ordered coordinate set; `pixelCount` is modeled separately,
preserving the hardware possibility of a count/map mismatch. Map source is
ordinary JavaScript — a literal array or `function(pixelCount)` — not
Pixelblaze dialect. Stock maps under `src/pixelblaze/stock/maps/sources/` are
the exact source shown and evaluated. Personal maps bake on the sync tick and
store the baked array; later count changes replay it until the next bake,
mirroring stale Mapper output on hardware. Controller imports are source-less
frozen records.

## 12. Sample, position, and geometry families

Each resolved point carries `sample` (what the Pattern receives) and optional
`pos` (where the preview draws it). Generated geometry families separate one
physical point generator (`positionSource`) from several hardware-real
coordinate views, so a Cylinder exposes Strand/Surface/Spatial over one wall.
Catalogue type — Path, Surface, Shell, Volume, Custom/imported — is explicit
metadata; imported point clouds do not gain invented topology.

![Resolved layout pipeline: map coordinates feed Pattern sampling while intrinsic geometry or an embedding independently places the same lights in WebGL](../images/layout-pipeline.svg)

## 13. Normalization and resolved layout

**Contain** scales all axes from one shared range; **Fill** stretches each
axis to `0..1`. `pos` stays aspect-preserving; Fill affects only `sample`.

`resolveLayout` is the pure selection-to-runtime seam: given capability,
selection, count, and normalization, it returns corrected selection,
`sample`/`pos` points, modeled count, and a draw description.
`previewResolution.ts` derives the pixel-count quick-selection ladder from
stock-map `gridRecipe` metadata; exact entry stays unbounded.
`LayoutSelector` separates Map (owns `sample`), View (coordinate view of a
generated family), and Shape/Display (preview embedding). Solidity is enabled
only when the app owns trustworthy normals, and remains preview-only.

The map diagnostic reports total pixels, unique positions, and overlaps
(wire indices beyond the first at a coincident position) — no rendering mode
can make coincident coordinates individually visible, so the count is
explicit.

---

# Part 4 — Controller integration

## 14. Provider and extension architecture

`ControllerProvider` contains the transport boundary; components and stores
import typed capabilities, never extension APIs or raw sockets.
`PixelblazeConnection` is the transport-agnostic protocol core over an
injected `WebSocketLike`: JSON messages, binary program/control frames,
compile/push operations, map access, saved-program reads.
`ExtensionControllerProvider` relays through the MV3 extension (page → content
script → service worker → Controller), with base64 binary transport, an
offscreen device-compiler context, keepalive, and bounded reconnect. The
extension requests host permission per Controller IP — no blanket LAN access —
and performs discovery through ElectroMage's HTTPS service. Discovery reports a
successful empty scan separately from helper, timeout, or service failures so
the Controller entry surface can distinguish device settings from an
unreachable discovery path.

The provider's saved-program control seam exposes `setActiveProgram(id,
{save})` and `deleteProgram(id)`. The extension provider forwards them over the
existing generic JSON relay, so neither operation requires an extension release.
Activation defaults to `save: true` at the provider boundary: the already-saved
Pattern becomes the Controller's boot selection. Deletion is fire-and-forget at
the protocol layer; callers refresh the program list and treat that device truth
as confirmation. `NullControllerProvider` rejects both operations like every
other disconnected write.

## 15. Identity, connection state, and live panel

Connection state is keyed by IP; several Controllers may stay live with one
active. Durable identity is the Pixelblaze device id (board type + MAC). A
connection without a stable id is unclaimed but fully usable.

`controllerStore` owns connection phase, discovery, active selection, push
state, and the installed-map observation. `controllerPanelStore` polls the
active Controller for config, telemetry, vars, controls, programs, and FPS.
`ControllerActionRow` derives the Switch gate from the active IP's own
`programsByController` entry. A missing key means the inventory has not been
read; a present empty array means the read succeeded and the Controller has no
saved Patterns. The menu never substitutes the shared visible list or another
Controller's cached inventory. Its pure projection case-insensitively sorts the
flat list, filters only saved rows, marks a saved active row in place, and pins
an active id absent from the inventory as a disabled run-only row. The Switch
workflow does not read or write Pattern Studio selection or delivery records.
The config projection also retains the sequencer packet's optional
`sequencerMode` (0 off, 1 shuffle, 2 playlist) and `runSequencer` fields when a
later poll omits them. `activateProgram` sends a saved activation, invalidates
the prior control seed, publishes the id optimistically, then rejects unless a
direct config read confirms that id; a rejected confirmation rolls the
optimistic id and controls back. Activation also advances the panel read
generation so a poll started before the command cannot overwrite its confirmed
state. Its store-owned in-flight lock survives popover unmounts and rejects a
second persistent activation until the first command settles. `deleteProgram`
brackets the write with complete inventory reads, then
proves the target disappeared and every unrelated id/name pair survived. Both
confirmations are scoped to the provider/session that sent the command.
Per-Controller snapshots include the sequencer fields, so reopening one
Controller cannot inherit another's mode.
The open Controller popover presents an amber shuffle or playlist indicator
only when firmware reports mode 1 or 2 together with a running sequencer. The
indicator is observational; sequencer control remains in the Pixelblaze UI.
All four live-panel decks use the shared disclosure primitive. Pixelblaze,
Pattern controls, and Variables start expanded; Power starts folded with a
single-line summary of limiter state, recent duty, and estimated draw. Module
session state preserves each disclosure across popover unmount/reopen without
turning UI state into durable Controller data. Per-Controller panel snapshots
also retain limiter history. Only a successful device vars poll contributes a
sample; an optimistic live-cap edit does not. Folded and expanded presentation
use the same strict majority of the latest three samples, with a tie retaining
the prior state, and transition between structural grey and amber over 700 ms.
The map is read once per connect (and on panel/profile open or explicit
refresh) as raw `/pixelmap.dat` bytes; `installedMapObservation.ts` validates
the blob and derives fingerprint, dimension, and count. Per-Controller
generations discard late responses.

**Renderer transport (Play/Pause).** The protocol sends exactly
`{"pause":true|false}` and waits for `{"ack":...}`; no frame includes `save`.
Firmware exposes no paused-state field, so each Controller entry records the
last acknowledged command rather than device truth. A fresh connection starts
at Pause (connecting does not alter the renderer); successful Pattern
activation records expected-running; reconnects make state unknown, with
Resume as the safe recovery. A persisted per-IP recovery marker survives
disconnect and reload because firmware may apply Pause without acknowledging
it. A fresh FPS heartbeat from the open panel refines an unknown state only:
positive FPS offers Pause, zero offers Resume. Renderer commands share the
per-Controller device-write queue with Pattern writes and are disabled during
an active Send.

Live brightness and control writes are volatile and throttled. Pixel-count
edits are saved writes with an optimistic pending value; reducing the count
routes through a blackout helper so tail LEDs do not freeze lit. Firmware
update availability is checked through the Controller's first-party protocol,
cached per identity, and persisted on the profile as the last conclusive
observation; PXLBLZ never installs firmware.

## 16. Controller profiles

A profile is durable hardware intent for one physical Controller, keyed by
device id, created from observed hardware. It holds board facts (including the
last firmware-update observation), typed inputs, the two global transforms
(hardware brightness, power cap), an optional installation power model,
per-Pattern bindings, map fingerprints, and the last present/absent
installed-map snapshot for offline display. Profiles carry no zones: #775
retired `ControllerProfile.zones` and dropped the `zones_json` column
(migration 0026) after establishing that profile ranges never reached any
loadable Show's compiled artifact — every installation-contract recipe
shadows caller-provided zones with the Show's own Zone Layout data. Zones are
authored inside each Installation Show; "New show from profile" seeds a
single-zone Show sized from `lastKnownPixelCount`. Edits update
Zustand optimistically, serialize writes per profile, roll back failures, and
expose a drain barrier that Pattern push waits on.

**Inputs and effective uses.** Input records carry pin, signal, smoothing,
fallback, and inversion; bindings target an exported slider, function, or
variable with optional range/quantize. `controllerInputUses.ts` is the pure
derivation the profile page consumes: one presentation per input — pin,
physical facts, brightness assignment, ordered uses, input-scoped issues —
stating **effective behavior** only (would this configuration emit code right
now?). Whether the artifact already on the Controller predates the profile is
deliberately not stated per-use; that is a (Controller, Pattern) fact and is
designed as one signal in #777.

Validation errors partition to the input that owns them
(`inputs.<id>.` / `patternBindings.<id>.*` path prefixes) and render on that
card with a direct correction. Corrections are qualified against the whole
profile before being offered — a repair that would trade one error for another
is not advertised. Hardware brightness on a non-analog input is an error (the
pass recipe gates on `input.signal === 'analog'`, so it silently emitted
nothing before #772); the correction switches the input to analog and moves it
to a free analog pin when needed. Brightness assignment writes the single
seeded `hardware-brightness` transform's `enabled`/`inputId`, so exclusivity
across inputs is inherent. When a Pattern binding and hardware brightness name
the same input, the recipe emits only the binding for that Pattern; the
brightness row states that scope once (`every Pattern except Caustics`).

`ControllerInput.role` was removed in #772: all its values were inert.
`normalizeControllerInputs` strips the stray key on read so edits cannot write
it back. `controllerProfileLiveStore` owns the profile route's
connection-bound bindings read; its read key combines live IP, the
connection's `liveEpoch`, and program-list content, so a reconnect cannot pass
off the previous connection's answer as current.

**Power model.** Hardware brightness samples its input once per frame and scales
both `hsv()` and `rgb()` output sinks; the power cap wraps supported output
calls, estimates duty, and scales against the exported `__px_powerLimit`. The
power model selects an LED construction preset
(each carrying an explicit conservative full-white assumption) and a supply
budget in amps or watts; an optional override records a measured or rated
full-white total and goes stale when the address count changes. Since #786
the profile page offers no Custom construction entry — entering a measured
total is the custom path — but the domain still reads legacy `custom`
profiles, which render on the measured side.
`controllerPowerAuthoring.ts` owns the pure authoring transition so unit
conversion, cap modes, and provenance stay out of the React component. The cap
setpoint is normalized output duty; a pure resolver makes equivalent A/W
inputs resolve to the same duty. Reserved `__px_power*` exports render as
structured power telemetry. None of this replaces physical power-system
design.

## 17. Pattern push, PBP storage, and Saved Patterns

Before every push the store waits for profile writes, compiles libraries,
resolves the profile, derives one Controller delivery artifact from active
profile passes plus any renderer adapter, checks firmware, and invokes the
Controller's compiler. The same derivation supplies Show capacity reporting;
there is no fixed transform reserve for profiles that do not use one.
Run/Save dirty signatures
cover source, code-affecting profile configuration, and installed map
dimension. Run-mode cleanliness also pairs the transient program id with the
panel's live `activeProgramId`, so an external Pattern switch re-arms Run
without a source edit. Run/Save outcomes also carry artifact identity and mode;
the owning Pattern or Show presents a failure until Dismiss, while unrelated
Controller operations cannot borrow that alert.

**Run** pushes transient bytecode under a fresh id — no Saved Patterns entry,
binding, banner, or push record. **Save** stamps source, encodes a PBP (name,
optional JPEG, bytecode, compressed source), writes the saved program, and
activates the same id. Overwrite bindings key (Controller, Studio Pattern) to
program id; repeated saves reuse the id. A successful Save writes a push
record from the exact embedded banner — artifact hash, transform ids,
timestamp, optional Show output contract — making transform freshness locally
computable.

**Transient replacement fit.** Steady-state fit and replacement fit are
different questions: a Pattern can pass every steady-state limit and still
fail a direct large-to-large replacement, because activation briefly holds
both programs. `pushPattern` uses the observed 68,384-byte activation ceiling
as the transient overlap budget; a sum above it — or an unknown resident
footprint — routes through a run-only black drain Pattern (153 bytes of
bytecode) that must be observed active before the target is sent. The drain
never enters Saved Patterns, bindings, labels, or push records. The provider
caches a resident footprint only after confirmed activation and invalidates it
on external switches, disconnects, and every new attempt.

**Inventory and recovery.** The profile's context pane joins `listPrograms`
with bindings, push records, and the personal and built-in Pattern/Show
catalogs. Bound entries appear under Saved PXLBLZ Patterns and link to Studio;
unbound entries are Other Patterns, never modified. Saved PXLBLZ Patterns is
the sole profile-freshness surface. Each bound row compares the recognized,
compatibility-normalized signature in its push record with a fresh full-profile
signature for that binding and the live map dimension: exact matches are
CURRENT, recognized differences are PUSH AGAIN, and missing or unrecognized
evidence is UNKNOWN. Saved Show rows use the same signature and are labeled
Show output with their contract summary.

The read identity includes the connection epoch, push-record revision, and
manual-refresh generation. Reconnects, successful push-record writes, and
manual refreshes retire earlier freshness evidence even when the Controller's
program list is unchanged; late superseded answers cannot publish. Same-
connection refresh may retain the rows so QUEUED/SYNCING/FAILED work remains
visible, but steady freshness becomes UNKNOWN until the new read completes.
Offline, failed, and new-connection reads make no freshness claim.

`readSavedProgram` decodes a PBP and separates PXLBLZ provenance from source;
Import opens the existing Studio Pattern, restores a deleted one, creates a
personal Pattern from foreign source, or explains that recovery is impossible.
Import never mutates the Controller.

**Managed-artifact reconciliation.** Opt-in per profile. A program is eligible
only with both an overwrite binding and a successful push record plus
regenerable source; everything else is unmanaged and untouched. Code-affecting
profile edits schedule a plan that compares each eligible push record's stored
signature with a freshly computed per-artifact signature (global transforms,
referenced inputs, bindings, renderer dimension). The signature carries a
compatibility rule: **a field that cannot change generated code must never
change the signature, and a retired field is normalized on read rather than
paid for in device writes.** `normalizeStoredArtifactSignature` re-reads
stored signatures in today's terms (drop `role`, promote to the version-1
envelope) and returns unrecognized bytes verbatim - the safe direction, which
can cost one re-push but can never read stale data as current. Reconciliation
runs serially through the per-Controller write queue, updates the active
program last, and stops cleanly on newer edits or disable.

## 18. Map push, read-back, and fingerprints

Pixelblaze has one shared map slot; map send is confirm-first. The encoded map
is a 12-byte header plus quantized coordinates, encoded from already
normalized points. Point count must equal the Controller's configured count;
function maps re-bake at that count; true 1D maps require compatible firmware.
The format has no metadata field, so provenance is a hash of exact encoded
bytes: successful send stores `{hash, mapId, mapName, devicePixelCount,
pushedAt}`, then invalidates the live observation and retries read-back — the
final readable bytes stay authoritative. Identity resolution checks push
records first, then compares fingerprints of current stock and personal
candidates baked at the observed count; zero or multiple matches produce
Unknown map. Push history alone is never interpreted as the installed map.

---

# Part 5 — Shows

A Show is authored as timeline choreography and shipped as one ordinary
self-contained Pixelblaze Pattern. The unified editor preserves human intent
as Clips, Layers, Zones, Transitions, Groups, routing, and Property animation;
persistence and compilation retain internal Scene partitions as a
compatibility and lowering representation, then flatten everything into a
scheduler and isolated Pattern members.

## 19. Show domain model and persistence

`ShowRecord.composition` (`ShowCompositionV1`) holds the editor's Clips,
Layers, Groups, Markers, explicit Show End, and Property animation; the
record's Scenes, Zones, boundary Transitions, and routing layouts remain the
compiler substrate. `showModel.ts` owns creation, normalization, projection,
split, and mutation; `showStore` persists through `/api/shows` with per-Show
write queues, optimistic updates, and in-memory undo/redo snapshot stacks.
Shows therefore do not use the Pattern source-departure rule: they persist
structured choreography and derive their generated Pattern artifact at compile
and delivery boundaries.

**Authored Show files.** `showFileBundle.ts` owns the versioned `.pxlshow`
boundary. Version 1 is gzip-compressed JSON containing one complete
`ShowRecord`, reachable user `PatternRecord`s, referenced non-stock
`MapRecord`s, and export provenance. `showImportPlan.ts` parses that snapshot
against the receiving library before any write: stock IDs must exist locally;
same-ID dependencies with matching content are reused; absent dependencies keep
their IDs; and divergent dependencies receive fresh IDs and Show-tied names.
Application rewrites flat cells, composition instances, Group-definition
instances, Stage maps, and output-contract maps together, then normalizes and
validates the complete Show. The imported Show always receives a fresh ID and
persists its original Show ID, app version, export time, and import time in
`importMetadata`; D1 stores that sidecar in `personal_shows.import_metadata_json`.

![Show authoring model: direct timeline entities and routing pass through an internal compatibility representation, then compile into one scheduled Pixelblaze Pattern](../images/show-model-runtime.svg)

Key ownership rules of the substrate: a scene owns duration and Show-wide
property targets; a zone owns semantic identity; a clip owns Pattern
reference, span, adaptations, control targets, Effect stack, and entry
behavior; a transition is a stable boundary entity; a destination clip or
scene owns each animated value while the incoming boundary owns start,
duration, and easing; routing layouts own Installation ranges or Portable
logical geometry; the Show owns target Controller, output contract, and Stage
map.

**Output contract.** New records carry a versioned `installation` (exact
count + map) or `portable-2d` (reference count/map + variable-resolution
declaration) contract, capped at 2,000 pixels. D1 loading validates the
contract strictly and reports rejected rows in `unreadableShows` without
failing the collection. `showInstallationCoverage.ts` requires every index
assigned exactly once (missing/overlap/out-of-range are distinct
diagnostics); `showPortableCompatibility.ts` requires logical geometry and 2D
capability, admitting 1D `render` members through an explicit adaptation.

**Built-in Shows.** `src/pixelblaze/stock/shows.ts` owns pristine fixtures
plus catalogue metadata. Editing is session-scoped: the first mutation creates
an in-memory draft with normal undo; Reset or reload restores the fixture; no
built-in mutation touches D1. Reference Showcases group Pattern sources into
slots for **Try with Pattern**; selections project through the same
replacement path Learn lessons use and never mutate stock or personal
records. Pattern replacement keeps control targets and instance-control
Property tracks when the incoming Pattern exports the same public slider, and
removes only controls the new Pattern cannot express. The lesson and Showcase
picker checks its complete slot before applying a selection: when the swap
would remove a control animation, a confirmation names the Pattern and affected
controls; swaps that remove no animation apply immediately. Clip and Group
inspector replacements use the same selective rule without prompting.

**Boundary events and easing.** `ShowRecord.transitions` is the only persisted
owner of visual and routing boundary events; a zero-duration Cut is the
neutral form. Easing normalizes to one structured curve representation
(linear; quadratic/cubic/sine/Back with direction; CSS cubic Bezier; Steps;
Hold) shared by Transitions, property animation, and Effect parameters. Legacy
ease names map to their exact prior behavior; invalid structures normalize to
Linear with field-addressed validator issues.

Timeline authoring is framework-free: `showTimelineClipAuthoring.ts` (split,
duplicate, resize, move as atomic composition updates in global time, with
refusal by returning the input), `showClipInspectorModel.ts` (Show-global
projection of Scene-relative storage), `showClipIdentity.ts` (compact boundary
identity like `15.0: CompassRose`), `showSpatialSelection.ts` (Installation
spatial authoring as pure index-set operations), and `ShowZoneSpatialSelector`
(screen-space zone editing over the resolved output map, exact-count 2D
only).

## 20. Timeline editor and Stage preview

`ShowEditor` renders one proportional grid: ruler, Zone/Layer stacks, Clips,
per-Layer Transition junctions, disclosed property lanes, Markers, Show End,
playhead. This section names the seams; the interaction details live in the
modules and their tests.

**Viewport and snapping.** `showTimelineViewport.ts` owns zoom, pan, Navigator
geometry, and magnetic playhead snapping; `snapShowTimelineTime` layers an
always-on quantize grid (whole seconds refining along the ruler's 1/2/5 tick
family to a 200 ms floor; 100 ms with Shift) under boundary magnets, and
`showTimelineRulerTicks` emits ticks from the same formula so landings and
tick lines never disagree. `showEditorSessionStore` persists Snap, Marker
preferences, and per-Show Zone disclosure outside the record.

**Zone rail and Zone Map.** The Zones control discloses the rail; collapsed
Zones become 28 px time-accurate miniatures that remain drop targets.
`CollapsedZoneNameOverlay` stamps the Zone name only when the rail cannot. The
Zone Map popover is the single authoring surface for Zones themselves;
Zone Layout definitions open in the Entity Detail panel, and
`projectShowLayoutIntervals` is the only source of interval geometry. Rail
popovers render outside the timeline grid (which owns marquee and isolation
pointer handlers) and stop click propagation so selections made inside them
survive.

**Keyboard ownership.** `studioControlOwnsKeyboardEvent` (app-wide) leaves
Space with text surfaces only; inside the Show editor
`showControlOwnsKeyboardEvent` treats any focused button as owning the key
unless marked `data-studio-space-preview`, so chrome releases Space to
playback while popover buttons keep native activation — a settled decision,
not an inconsistency. Tab traversal walks Clips and Groups in time order,
exempting toolbar and marked rail chrome. The Show handler adds A (rewind),
1/2/3 (speed), and unmodified arrows (five-second seeks); all seeks are
deterministic reconstructions. `showEscapeLayers.ts` gives Escape one
registry-owned listener that peels exactly one surface per press, highest
rank first (Detail panel → Group-isolation exit → selection → popovers), with
palette-owned exceptions.

**Selection and Entity Detail.** Selection is UI-local with one open owner.
`ShowEntityDetailPanel` portals the inspector to `document.body` as a modeless
overlay; `showEntityDetailPlacement.ts` prefers side placement with viewport
clamping. `showClipInspectorModel.ts` normalizes flat cells and composition
placements into one owner model with a capability matrix; update adapters
translate patches back to the owning record shape. `ShowClipEntityDetail`
renders the Pattern chooser, Animation speed (commit-on-release because a
time-scale change rebuilds the compiled preview), Brightness, the placement
surface, controls, Effect stack, and the inline Add Effect takeover with its
family/compatibility filters. The public control catalogue derives from the
visible composition, so the first render matches post-edit state.

**Groups.** `groupDefinitions`/`groupOccurrences` persist linked reuse without
a second timeline model: a definition owns instances, relative placements,
internal Transitions, and tracks; an occurrence owns interval, Zone, start,
base Layer, and X/Y offset. `showGroupModel.ts` owns selection closure
(transitive over touched non-Cut Transition chains), validation over the
materialized result, Duplicate (shared definition), Make Unique, Ungroup, and
occurrence-prefixed materialization at compile/preview boundaries so private
state never leaks between occurrences. Double-click enters modeless isolation;
stale isolation closes itself.

**Layer Transitions.** Only positive-duration records persist; Cuts are
derived where placements abut (`showUnifiedTimelineProjection.ts`).
`showLayerTransitionAuthoring.ts` owns the editing algebra: creating or
growing a Transition shifts the connected successors; same-Layer moves carry
the connected sequence; cross-Layer moves detach; a move or resize that breaks
a Scene-boundary junction replaces it with a Cut and collapses its time.
Composition validation enforces clean endpoints — an unrelated same-Zone Clip
may span a Transition or stay out of it, never start or stop inside it.

**Markers, Show End, Insert Time.** `showTimelineAuthoring.ts` owns Marker
edits, non-destructive Show End changes, and Insert Time (extends the
containing scene, splits crossing placements, shifts later content, holds
crossing animation; refuses inside Transitions and inside value-changing
nonlinear segments rather than silently reshaping a curve). Markers never
affect rendering.

**Property lanes.** `showPropertyLaneProjection.ts` projects authored tracks
into truthful sparkline geometry, disclosed only when a value actually
varies. `showPropertyLaneFamilies.ts` sorts properties into five families
(time, appearance, transform, control, effect) that fix lane color, glyph,
and hover noun; `showPropertyLaneLabels.ts` resolves names per Zone with
abbreviation only on real collisions. Labels follow the Zone gutter when open,
sit sticky on the lane when closed, and retire once the playhead or viewport
passes their span.

**Value-field contracts.** Four framework-free presentation boundaries back
every numeric field; `BoundedNumberField` (with `DraftFieldActions` and
`fineAdjust.ts`) owns the shared draft, grip, transient slider, and
one-commit-per-gesture behavior:

- `percentageValue.ts` — straight percentages; semantic opt-in (a `0..1`
  range is not sufficient evidence), storage stays in real units.
- `domainNumberPresentation.ts` — multipliers (piecewise power mapping with
  `1x` neutral) and ratios (small-integer display, logarithmic travel);
  placement Width/Height layer grid-aware detents via
  `resolvePlacementScalePresentation` (#682).
- `anglePresentation.ts` — direction/phase/rotation/cycles over turn storage
  (#612); only direction normalizes on parse, so multi-turn animation paths
  survive editing; sliders window onto the stored range rather than spanning
  it.
- `linearNumberPresentation.ts` / `TimeField` — decimal seconds with a
  detented `0..30s` ruler whose bounds never clamp exact entry.

`ShowToolkitParameterDescriptor.presentation` selects presentations for
toolkit parameters; other call sites opt in explicitly. Stored records,
compiler inputs, and generated source always carry real units.

**Placement, Viewport, and the pad.** `showClipTransform.ts` owns the
canonical Transform (normalized position, turns rotation about `(0.5, 0.5)`,
scale) with neutral compaction — an entirely neutral Transform compiles
byte-identically to an absent one. `showClipViewport.ts` owns the optional
clipping rectangle with its aperture silhouette catalogue, edge policy
(hard/soft/dither, soft default), authored feather, rotation, and invert;
shape parameters are never animatable, so their constants always fold.
`spatialShapeGauge.ts` is the single emitted-metric source for silhouettes,
cross-checked sample-for-sample against the float64 preview metric.
`showClipPlacementPad.ts` is the framework-free gesture boundary — pointer
coordinates normalize through the rendered SVG bounds, so resizing the surface
cannot change stored results. Coverage-directed Viewport evaluation replaces
the post-capture multiply when skipped renderer calls cannot change observable
state. The original two-layer path (#590/#679) selects one Pattern per pixel
under a Hard aperture and evaluates both only inside a Soft band. The N-frame
path (#834) selects one of any number of static, axis-aligned, pairwise-disjoint
rectangular Hard frames, including keyed or repeated pure Pattern members, and
may also evaluate one shared lower ground. Emission, specialization metadata,
and renderer-pressure accounting consume the same coverage plan, so selected
stacks report their actual one-frame-plus-optional-ground evaluation bound.
Hard rectangle predicates include both endpoints, so numeric bounds must remain
strictly separated after 16.16 constant quantization; stock half-frame tiling
assigns the seam at that Controller coordinate quantum. Every ineligible case
keeps the ordinary stack and records a named reason in
`specializations.viewportCoverage`.

**Effects and Transition authoring.** `showEffectAuthoring.ts` adapts the
registry vocabulary to typed authoring actions (Mirror patches the placement
flag rather than joining the ordered stack). `colorValue.ts` and `ColorField`
own the canonical `#RRGGBB` contract with ephemeral Stage preview and one
persisted edit. `showTransitionAuthoring.ts` maps the catalogue onto the
persisted compatibility kinds; palette hover previews through the ephemeral
preview-override seam plus a deterministic seek to the boundary midpoint, and
Apply alone persists. The Effect palette deliberately never recompiles the
Stage on hover.

**Stage.** `ShowStagePreview` compiles the same Fast and Precise artifacts as
Pattern preview, reports measured FPS, and omits Pattern-level speed,
controls, and watch variables — Show transport is the canonical clock. Stage
preview does not apply artifact gates; `compileShowForArtifact` enforces
coverage, the 2,000-pixel ceiling, and resource limits for inspection,
export, Run, Save, and reconciliation. Installation preview uses the
contract's saved count and ranges; Portable preview uses the saved reference,
never a connected Controller. Zone outlines and timing guides are session-only
SVG diagnostics that never mutate compiled pixels.

**Layout.** The rail collapses to a 46 px Activity strip; panes have explicit
minimums and remembered per-entity divider widths; at 980 px and below the
Stage yields to a Preview overlay without creating a second runtime. Rail
typography follows `ui/ideMicrotype.ts`. The authenticated responsive and
persistence smokes cover these surfaces; deep Show editing lives in the
dedicated suite.

## 21. Show compiler

`showCompiler.ts` turns a normalized Show recipe into one flat Pixelblaze
Pattern. Member sources are alpha-renamed and isolated; compatible continued
clips reuse a member; Restart adds fresh identity. The narrative of the
optimization program, with measured results and rejected candidates, is
`docs/guides/Inside the Show compiler.md` and
`docs/reference/Show Rendering Optimization Results.md`; this section owns the
contracts.

**Lowering shape.** A one-zone Installation with no routing switch keeps the
compact static-routing recipe. Multi-zone and routing-switch Shows lower every
Scene into a routed Scene sequence: each Scene maps every Zone to a member;
the scheduler selects placements, applies boundary ramps, advances each unique
member once per frame, and routes each pixel through the active domain.
`showCompositionLowering.ts` unions Main and overlay boundaries into ordered
routed stacks (Main back, overlays front-to-back) and preserves
Continue/Restart identity across gaps. Newly materialized compositions persist
`executionModel: deterministic-loop`, which resets member state at the Show
End wrap.

Module seams (#570): `showRoutingRepresentation.ts` (logical layout shapes,
coverage diagnostics, representation pricing, packed-table decode, the
Stage-space operators), `showPhysicalRoutingSpecialization.ts` (ordered
short-circuit plan), `showMemberLowering.ts` (bundle → manifest strip →
inlining → hoisting → alpha-rename → analysis, never seeing scheduler state),
`showRoutedScenePlan.ts` (scene/timeline planning as data), and
`showMemberBindingPolicy.ts` (one frozen per-member policy object answering
"who writes this instance's per-frame values" — the module that retired the
scattered flag mutations behind two shipped wave-3 defects).

**Cost and resource accounting.** The compile summary reports code size,
render/transition/clock/evaluation policies, routing representation, and
machine-readable cost on five axes: Pattern evaluations (literal formulas —
`N`, `N + E`, `2N`), scalar/array memory, artifact bytes, coverage, and
warnings. `showVmResourceLedger.ts` models the 10,240-word array pool (plus
the separate 256-global limit) and groups words by owner; a bytecode-axis
estimate (#716) reprices the two constructs the source proxy mispredicts. The
delivered-source gauge in `showCompilePressure.ts` uses the observed
68,384-byte bytecode activation ceiling as an advisory source scale. It changes
color at 80% and 100%, but source bytes never block delivery: source and
compiled bytecode diverge too much for that proxy to decide fit. The Controller
compiler is authoritative. The pressure gate still blocks at five simultaneous
renderers per pixel (the unvalidated side of the four-renderer release fixture).
Blocked output stays previewable.

**Source inventory.** The compiler attaches an exact contiguous UTF-8
inventory to every generated Show — ranges by category and member,
reconciling to `artifactBytes` — which `ShowArtifactInventoryPopover` renders
against the same budget scale as the compile bar. With a selected Controller,
the popover keeps that canonical inventory and adds the exact byte delta from
active profile transforms; its total matches the artifact offered to the
Controller compiler. The compile summary keeps two
renderer scopes distinct: `steadyStateRenderersPerController` and
`worstInstantRenderersPerController` count distinct compiled Pattern machines
active across all Zones, while the existing per-pixel fields measure the
maximum evaluation depth traversed by one pixel. The inventory leads with the
controller-wide peak and shows per-pixel depth as secondary context. Repair
hints appear only for contributors that are changeable and large enough to
matter.

**Render-target arena and planner.** Every production artifact reserves three
RGB planes at the output extent (6,012 words at 2,000 pixels) — exactly three
compiler-owned arrays, with `showRenderTargetArena.ts` binding typed roles
(`stage-rgb`, `sample-xy`, `scalar-field`, `previous-rgb`) over them.
`showRenderTargetPlanner.ts` separates cache selection from emission:
candidates carry lifetimes, invalidators, exactness, and cost estimates;
policy is deterministic and conservative (required first, exact before
approximate, no positive saving → declined); non-overlapping lifetimes reuse
planes; `additionalArrayWords` is always zero. Consumers of the arena include
snapshot/live Crossfade, Trails (`previous-rgb`, with a suspension policy
under required Transition snapshots), Freeze/Strobe presentation captures,
authored Freeze-at-entry and Rolling Refresh evaluation policies,
compatible Pattern-output reuse, the coherent-noise scalar field, and static
Vignette. Each has a narrow proven envelope and an explicit named fallback;
each qualification (issue508–542 npm scripts) is archived under
`docs/plans/archive/`.

**Specializations.** The compiler carries a family of proven, individually
reversible source/bytecode/FPS optimizations, each with a compile-summary
record and a counterfactual option: stack and wrapper interning, body-identity
branch grouping, the table-driven scheduler and Show score, shared Motion
transition kernels, lifetime-colored Restart Pattern machines, shared
generated Effect kernels, tiny-helper inlining and frame-invariant hoisting,
coefficient hoisting, prologue-rebinding elimination, per-member HSV
conversion, and steady-state direct color sinks (whose Precise/hardware
divergence is a measured ~0.1 LSB at rounding boundaries). Selection is
automatic only where the result is provably compatible and smaller or
measured faster; failed hardware gates (the exact coordinate-field emitter)
remain diagnostic profiles. Routed transition bodies execute in separate
generated helper functions — a firmware-safety boundary proven by the #520
acceptance fixture, which future transition families must retain unless
hardware qualification proves otherwise.

**Member analysis.** Acorn proofs gate the aggressive paths: render-purity
for output reuse, guaranteed-output for clear elision, provable allocation
sizes for the member census (an unprovable size blocks with a remedy rather
than guessing).

## 22. Transition and adaptation policies

| Policy | Runtime cost shape |
|---|---|
| Cut / Restart | One active member |
| Parameter ramp | One continued member, per-frame updates |
| Snapshot/live Crossfade | One `2N` capture frame, then replay + one live renderer |
| Live/live Crossfade | Two renderers during the window |
| Fade through color | One renderer per phase (`N`) |
| Hard or stable-dither Wipe/Dissolve/Shape | One renderer per pixel (`N`) |
| True feather blend | Two renderers only inside the band (`N + E`) |
| Routing transfer | Both clocks advance; one layout selected per pixel |
| Soft Split | One renderer outside the feather, two inside |

Easing is deterministic arithmetic shared by preview helpers and generated
code: Linear; Quadratic/Cubic/Sine in/out/in-out; CSS-compatible Cubic Bezier
(X control points in `[0,1]` so X inverts; the fixed-iteration solver is
emitted only when a Bezier is present and runs per frame, never per pixel);
Steps; Hold; Back with bounded overshoot.

`showVisualToolkit.ts` is the framework-independent catalogue: families own
ids and cost policy, variants own parameter descriptors, presets are named
parameter bundles. `showVisualToolkitFixtures.ts` provides deterministic
headless evidence for every variant the compiler lowers, and
`showVisualToolkitFreeze.ts` seals registry, fixtures, and recipes behind a
version and fingerprint (version 1: `f81bca37`, 59 variants, 104 fixtures);
an intentional change increments the version. Hardware FPS stays dated
external evidence, never an inferred field.

The families in brief — each variant's exact parameters and equations live in
the registry and its fixtures:

- **Wipe** — directional (direction in turns; shared projection equation),
  plus Split, Barn Doors, Blinds, Clock, Checker, Grid variants; legacy wipes
  keep their index-domain equation. Non-linear variants require a 2D Stage
  Map.
- **Dissolve** — Pixel and Block (stable hash cells, optional seed), Coherent
  Noise (stable 2D value-noise field, no time input), Soft Threshold (adds
  Softness through the shared edge contract).
- **Shape reveal** — grow-incoming / shrink-outgoing over an SDF catalogue
  (circle, box, diamond, ring, ellipse, rounded box, cross, heart, star,
  crescent, polygon, and the signature cats — the last two provisional
  pending stronger high-resolution silhouettes). Shared center, scale,
  feather, edge policy, and easing.
- **Motion** — Cover, Reveal, Push, Content Grow/Shrink, Zoom In/Out with
  rotation (Spin is a preset, not a primitive); inverse-affine sampling with
  Clip or Wrap addressing; hard (`N`) or full blend (`2N`) only.
- **Property transitions** — Animation speed, brightness, exported sliders on
  clips; split position and repeat scale on scenes; boundary-owned start,
  duration, easing. Missing or renamed controls are compile errors, not
  dropped automation.

**Show Effects.** The clip-owned stack has two evaluation stages: coordinate
operations (translate/rotate/scale/shear composing in authored order, Wrap
applied once after the matrix) run before the renderer; output operations
(brightness, opacity, hue, saturation, contrast, invert, threshold, luma/
chroma key, posterize, Vignette, color map) run after capture, with the border
mask last. The literal runtime order is: Stage sample and zone-local
normalization → Show-wide sample remap → mirror → inverse affine → distortions
→ Clip/Wrap addressing → one renderer call → output Effects → border mask.
Neutral static Effects emit nothing. Frame-invariant Effect coefficients hoist
per frame (#558); static Hue's two per-pixel trig calls are reported, not
hidden. Distortions (Ripple, Swirl, Bulge/Pinch, Pixelate, Kaleidoscope)
remap coordinates and evaluate the Pattern once, with Amount 0 an exact
identity. Content keys carry alpha and enable top-down composition with
data-dependent `N + U` cost; exact opacity endpoints skip evaluation or blend
arithmetic where proofs allow.

**Sample remapping.** Synchronized tiling stores one `repeatScale`, evaluated
once per frame; scale 1 is an exact identity branch; the transform adds zero
member renderers. No 3D remap exists until Z semantics are designed. Discrete
adaptations (time offset, stepped clock with its boundary-zero priming
`beforeRender` (#663), light shutter, mirror/phase) remain part of member
compatibility. Time scale zero holds Pattern time at zero; negative time is
unsupported because stateful Patterns are not reversible.

## 23. Routing representation

Physical layouts preserve arbitrary inclusive range lists; first match wins;
uncovered pixels render black with a warning. Portable routing uses the
canonical `ShowLogicalRouting` union (Full Stage, Grid, Stripes, Checker,
Rings, Pinwheel, Wave, Moving Split, Soft Split); the pure router and
generated source share the same normalized region-local coordinate equations,
using `v - floor(v)` so browser and device agree at cell boundaries. Rings
and Pinwheel are normalized-radial by design; `showLogicalAspectAdvisory()`
surfaces the compressed-axis warning rather than injecting aspect correction.

Moving Split renormalizes the selected side and updates the member's virtual
`pixelCount`; Soft Split evaluates both stacks only inside its feather, with
Scene Transitions captured independently per side. Routing transfers compare
one eased threshold against stable Stage position and run only the selected
layout's route — no renderer blending.

The representation planner proves exact ownership before specializing:
complete partitions compile to an ordered upper-bound short-circuit; cyclic
reassignments of one topology compile to formulas; irregular layouts may use
a packed per-pixel table under four measured gates — RAM (4,096-word cap
against the arena residual), 16.16 representability, bytecode cost through
the shared `showDataTableEmission.ts` pricing, and a 13-comparison expected
branch depth (both directions measured; see
`test/perf-harness/issue573-*.json`). The summary names the selected
representation and its costs.

## 24. Deterministic seek replay

A cold seek builds a fresh Fast runtime with the Show-owned seed, renders time
zero, and advances at 60 fixed steps per second; a warm seek restores the nearest
compatible checkpoint before advancing the residual interval. Checkpointing
limits the residual interval's step count; the generated artifact capability
separately removes per-pixel work from those intermediate steps when renderer
state is proven target-local. Every step still advances `beforeRender` and
normalizes any compiler-listed renderer scratch after the step; this keeps
checkpoint and final runtime snapshots identical when a member is inactive at
the target. The target always receives a complete renderer traversal. Unproved
artifacts run every renderer on every step. Replay advances 250 ms of Show time
per cooperative chunk and yields; newer seeks supersede older work, and only
the completed reconstruction becomes the live runtime.

The paused Stage pre-warms the same checkpoint store with the same deterministic
replay contract. Its runtime remains private, its chunks run at idle priority,
and transport activity cancels it before the seek or live playback proceeds.
The implementation uses cooperative main-thread replay rather than a worker.
Determinism covers the seed, cadence, initial values, and scheduled automation;
wall-clock, network, and sensor history are outside the guarantee.

## 25. Show delivery and export

Shows have two intentionally different outbound artifacts. A `.pxlshow` is an
editable authoring snapshot for another PXLBLZ library; it preserves structured
choreography and embeds reachable personal dependencies. An `.epe` is the
compiled hardware artifact described below. It contains generated Pixelblaze
source and compatibility facts, not an editable Show model.

`showEpeExport.ts` packages the exact generated source with a program id, a
preview JPEG, a readable Show-global Clip schedule, Transition/routing facts,
provenance, and retained member license comments. Version-1 banners may carry
optional `pxlblz:map`, `pxlblz:compat`, and `pxlblz:show-output` comment
records; `pxlblz:show-output` is the authoritative artifact-level contract
(Installation: pixels + map identity + fingerprint; Portable: 2D classes +
variable resolution). Unknown versions or malformed optional lines omit only
the optional record.

The Show editor sends stamped source through the shared `pushPattern`
transport under identity `show:<show-id>`, inheriting the drain policy for
large replacements (§17). `ShowEditor` prepares an identity-bearing delivery
snapshot from the settled Show compilation and active Controller context before
enabling Run or Save. A Show, Pattern, Library, map, profile, or Controller
change invalidates that snapshot; Run and Save remain disabled while the next
snapshot builds, and any confirmation bound to the previous snapshot closes.
The click path consumes the ready snapshot and never recompiles the Show. A
confirmation revalidates that exact committed snapshot immediately before
delivery and again after asynchronous Save-preview generation; a dependency
change retires the action without submitting stale source and publishes an
artifact-scoped failure instead of silently consuming the confirmation.
During rebuilding, the Controller identity and action labels remain fixed while
the disabled Run and Save icons become same-size spinners. The snapshot's stable
Controller identity and live connection epoch travel through profile draining,
preview generation, and device compilation; `pushPattern` revalidates the active
target, identity, and epoch immediately before every queued Controller mutation.
A status-object or metadata refresh inside that connection remains valid. Once
delivery begins, a disconnect, reconnect, or different Controller aborts through
the visible action-failure surface before any write.
The extension provider numbers each websocket generation when it opens, before
device-identity recovery. A superseded open waits for the current connection and
never publishes its recovered identity, regardless of which recovery finishes
first. The Controller store also advances `liveEpoch` when a provider generation
changes as well as when the entry enters `live`; therefore a replacement socket
cannot reuse the prepared Show's session epoch.
Compilation and preparation failures remain delivery blockers with their
diagnostic reason. `showControllerArtifact.ts` is the only
device-derivation seam: it compares generated capabilities with the installed
map and firmware, appends a renderer adapter when required (restamped with
`renderer-adapter` provenance), blocks known-unsupported firmware and
Installation mismatches, and treats Portable differences as advisories.
Delivery never mutates the Controller's shared map or pixel count.

---

# Part 6 — Supporting systems and limits

## 26. Export and in-app documentation

Pattern Copy/Download emits stamped `bundle(...).code`. `.epe` import reads
`sources.main`, parses PXLBLZ map metadata, and surfaces an import notice
rather than guessing ambiguous map references.

Documentation is raw Markdown imported through `src/docs/catalog.ts` and
rendered by `DocsWorkspace` at `/docs/<id>`; `docsMarkdown.ts` is a
purpose-built safe parser for the repository's Markdown subset — unsupported
syntax degrades to text, raw HTML is never injected. `ApiReferenceWorkspace`
at `/reference/<library>` builds from the built-in cheatsheet and parsed
library comments; entering from Studio appends already-loaded cloud
libraries.

## 27. Testing and evidence

Most coverage belongs around pure engine logic; component tests are light
smoke over delegation. The repository also carries fixed-point and library
fidelity suites, fake-relay protocol tests, PBP/map binary round trips,
compiler and generated-artifact execution tests, Show equivalence tests,
performance harnesses, Playwright public-route and authenticated D1-backed
suites, and explicit live-hardware probes with archived result reports
(`npm run issue<NNN>` / `issue<NNN>:hardware` scripts). The pre-commit gate
runs lint and full Vitest; e2e, performance, and hardware tiers stay explicit
because their reliability and environments differ. Development builds expose
a hidden Show Stage telemetry probe; production builds omit it.

## 28. Known limits and accepted divergences

- Pattern execution runs on the main thread; a valid infinite loop can freeze
  the tab.
- Sensor Expansion Board globals are inert stubs in preview.
- Fast is float64; Precise emulates 16.16 without duplicating every firmware
  algorithm.
- Profile interception understands supported top-level output call shapes,
  not arbitrary dynamic aliases.
- Personal Pattern sharing is not public; only built-in Gallery slugs exist.
- Device playlist management stays in the Pixelblaze UI.
- One Show compiles for one Controller; synchronized multi-Controller
  playback is outside the system.

## 29. Evidence and further reading

- Feature Guide — `docs/reference/PXLBLZ Feature Guide.md`
- Pixelblaze Ecosystem Primer — `docs/reference/Pixelblaze Ecosystem Primer.md`
- Understanding Maps — `docs/reference/Understanding Maps.md`
- Optimization Guide — `docs/guides/Optimizing Pixelblaze patterns.md`
- Show compiler overview — `docs/guides/Inside the Show compiler.md`
- Show optimization evidence — `docs/reference/Show Rendering Optimization Results.md`
- Domain glossary — `CONTEXT.md`
- Archived measurements and decisions — `docs/plans/archive/issue-*.md`
  (routing representation #400/#409/#410, coordinate remapping #406, seek
  replay #421, headless freeze #459, distortion review #456, arena and
  specialization results #512–#573, composition freeze #492)

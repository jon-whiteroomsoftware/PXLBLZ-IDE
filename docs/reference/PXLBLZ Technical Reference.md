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
lives in Cloudflare D1 behind the Worker API. Live Controllers sit behind an
optional Chrome-extension relay because an HTTPS page cannot open their LAN
WebSockets directly. Agents, built in or connected over MCP, edit Shows through
the open editor; the Worker coordinates them but never holds Show content.

---

# Part 1 — Architecture

## 1. Stack and system boundaries

| Concern | Implementation |
|---|---|
| Build and local development | Vite with the Cloudflare Worker plugin |
| UI | React + TypeScript + Tailwind CSS + selected shadcn/ui primitives |
| State | Zustand stores, readable outside React |
| Editor | Monaco with a Pixelblaze language mode |
| Parsing and rewriting | Acorn |
| Personal persistence | Cloudflare Worker + D1 |
| Agent coordination | Worker Durable Objects; OpenAI Responses API for the built-in agent |
| Preview drawing | WebGL point renderer |
| Tests | Vitest/jsdom plus Playwright suites and hardware harnesses |
| Commit gate | Husky: lint, typecheck, and staged-path tests |

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
| `/s/<slug>` | Gallery Show detail |
| `/studio`, `/studio/<kind>/<id>` | Studio entities |
| `/studio-welcome` | Signed-out Studio gate |
| `/docs`, `/docs/<id>` | Public documentation |
| `/reference`, `/reference/<library>` | Public API Reference |

The Worker also serves `/api/*` for personal content (§3) and the agent
routes: OAuth discovery, `/oauth/*`, `/mcp`, and `/api/agent/*` (§26).

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

**Gallery live pool.** Every card is poster-first. `GalleryLivePreview`
owns a 2D poster canvas and mounts a WebGL canvas only while the card is
`live` or `warm`. `galleryLiveSelection.ts` (pure) ranks viewport-intersecting
cards by pointer distance to the card center (top-of-viewport proximity with
no pointer, keyboard focus first) and admits them in rank order until a budget
of 8,000 pixel evaluations per frame (`GALLERY_LIVE_PIXEL_BUDGET`) is spent;
the first-ranked card always gets in. That is about six Patterns at their
Gallery counts, or one 2,000-pixel Show plus four. Rank-gap hysteresis keeps a
holder live while it ranks within two places of the admitted set, so the
boundary does not flicker. `galleryLiveCoordinator.ts` (DOM) keeps
the registry, ignores touch pointer positions, re-ranks on pointer, scroll
(capture), resize, and focus after a 100 ms trailing debounce, and grants one
`warm` slot at a time so fresh cards render a single frame for their poster
(stepping forward a few frames if the first is dark) without exceeding
the admitted set plus one context. A card leaving the pool paints one last frame,
copies it into the poster synchronously (the drawing buffer is not preserved
across composites), and keeps a fast-replay snapshot of its runtime that the
next grant restores, so it continues exactly where it stopped; a blank
capture never replaces a lit poster. The density preference (`galleryDensity.ts`, localStorage) sets 2, 3, or 4
columns, and 1D Patterns span two columns.

**Gallery keyframes.** Cards run on `createFastReplayRuntime` (fast fidelity,
seed `GALLERY_KEYFRAME_RANDOM_SEED`) over the geometry from
`galleryThumbnailLayout.ts`, so a stored snapshot restores into exactly the
runtime that captured it. `galleryKeyframes.ts` scores sampled frames over
0.5–6 s (lit coverage x spatial contrast, channels clamped) and captures a
`FastReplaySnapshot` at the best time in a fresh runtime; the JSON codec in
`fastReplay.ts` carries typed-array frames, Symbol-tagged Pattern arrays,
holes, and non-finite numbers. Artifacts live in
`src/pixelblaze/stock/keyframes/<Name>.json.gz`, keyed by compiled code, map
points, seed, and format version, and are loaded lazily
(`stock/galleryKeyframes.ts`) on a card's first activation; a stale or missing
key degrades to the per-card opening offset. `npm run gallery:keyframes`
regenerates them through Vite SSR (`scripts/gallery-keyframes.ts`);
`keyframeOverrides.ts` pins a Pattern's poster time. A test asserts every
public Gallery Pattern and Gallery Show has a current keyframe.

**Gallery Shows.** `galleryShows.ts` is the curated, ordered list
(Overture, Quadrille, Redline, Coronal) with byline and premise, the band
geometry rules (height 0.4 x grid width, width from the stage's aspect, capped
at 0.7 x grid width; caption at most 0.8 x preview width), and
`resolveGalleryShowGeometry` / `prepareGalleryShow`, which resolve the Show's
own stage map — at its output contract's count for an installation Show, at
`GALLERY_SHOW_PIXEL_COUNT` (2,000) for a portable one — with 'contain'
normalization and compile the native v2 record through
`captureShowStageEditV2`, as the v2 Stage preview does. `gallerySubject.ts` resolves a Pattern or a Show to one
runtime shape (prepared artifact, geometry, look, keyframe key, pixel cost), so
`GalleryLivePreview` has a single code path; a Show card adds a loop
thermometer driven from the runtime's elapsed time. `GalleryPage` inserts
bands before the Pattern indexes `galleryShowInsertionIndexes` returns (hero
first, the rest evenly spread), only in the unfiltered Gallery and the
`shows` directory. `/s/<slug>` renders `ShowDetailPage`: the stage at full
size, caption, and its chapter list. Show keyframes are scored across the whole
loop at one sample per second and stored as `show--<id>.json.gz`.

**Analytics** flow through a typed seam; local development and tests send
nothing. OAuth intent and callback outcome events use only the provider,
outcome, and coarse failure code, never account or profile data.

**Studio entry.** The Gallery's Studio entry opens stock Quadrille and asks
for playback for that entry only; otherwise the Show editor opens paused.
Welcome completion and a successful OAuth return use the same destination, and
no last-Show preference is stored.

## 3. Personal content and persistence

`personalContentProvider.ts` is the browser-side storage interface. The
authenticated implementation calls Worker routes backed by D1; demo mode
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
| `useAgentDrawerStore` | Agent drawer connection, activity, and composer state |

Stores export initial state for test resets. Engine code does not depend on
React store hooks; store-coupled lookups are injected.

**Studio layout.** The top-bar place control owns the six Studio areas plus
Docs and API Reference, and remembers the last open entity in each area.
`StudioEntityDrawer` houses the entity list: pinned, it takes part in the
three-pane layout; unpinned, it reserves a 22 px edge tab and opens as an
overlay, so opening and closing never changes workspace width or scroll.
`studioEntityDrawer.ts` owns the transition rules and
`studioEntityDrawerStore.ts` persists the pin per place; narrow viewports force
it unpinned without changing that preference. Panes keep explicit minimums and
remembered per-entity divider widths. Shows replace the center and right panes
with the timeline-over-Stage workspace (§21).

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

Panel disclosure preferences live separately from Pattern
settings, keyed by Studio mode. The shared Deck primitive opts into summary
headers for Studio Pattern panels; Gallery details retain the legacy deck. Preview viewport changes refit the existing renderer
and loop; source, map, and fidelity changes still rebuild execution. Variable
sampling remains active while the Studio Pattern deck is mounted so folded and expanded
readouts share the same snapshots.

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

First-time access waits for the helper's 60-second per-IP permission flow. The
relay owns that deadline separately from the three-second socket-open deadline;
helper 1.0.2 emits a connection-keyed `socket-connecting` after authorization to
start the latter. Approval resumes the pending connection without reloading. A
61-second relay fallback bounds a lost helper. Older helpers' address-only grant
messages remain supported, using that fallback until `open` because they cannot
report when authorization finishes. Denial and grant timeout still return the
provider to idle with `ControllerPermissionDeniedError`.

Helper 1.0.2 cancels pending connection permission work by connection and Port
lifetime. Closing before authorization finishes cannot open a socket after a late
grant. The protocol core rejects a pre-open close, so cancellation settles the
caller's promise. The helper extension must be updated separately from the app;
see `extension/README.md` for unpacked and Web Store adoption.

The provider's saved-program control seam exposes `setActiveProgram(id,
{save})` and `deleteProgram(id)`. The extension provider forwards them over the
existing generic JSON relay, so neither operation requires an extension release.
Activation defaults to `save: true` at the provider boundary: the already-saved
Pattern becomes the Controller's boot selection. Deletion is fire-and-forget at
the protocol layer; callers refresh the program list and treat that device truth
as confirmation. `NullControllerProvider` rejects both operations like every
other disconnected write.

The same generic relay carries the device-name settings command through
`setName(name)`. Firmware gives that write no acknowledgement, so a rename is
not complete when the frame is sent: `controllerStore` follows it with
`getConfig()` and requires the settings packet to report the exact requested
name before any profile state changes.

## 15. Identity, connection state, and live panel

`App` mounts the Controller bar only on Studio routes and starts extension
presence detection and remembered-IP reconnect once, on the first Studio entry.
Startup reads the synchronized route so the router's initial Studio default
cannot trigger a handshake on a fresh public load. Public routes mount no
Controller discovery UI or Pattern delivery actions. Navigation hides the bar
without disposing the connection store or its live providers.

Connection state is keyed by IP; several Controllers may stay live with one
active. Durable identity is the Pixelblaze device id (board type + MAC). A
connection without a stable id is unclaimed but fully usable.
Recognized Pixelblaze IDs normalize their reversed-MAC suffix to 12 lowercase
hex digits before comparison, so discovery IDs without leading zeroes match
directly recovered IDs. Unknown ID formats remain opaque. Existing equivalent
profiles retain their authored settings and receive the same live hardware
facts; no identity match relies on the display name. The profile facts include
the decoded MAC address, or Unknown when its ID cannot supply one.

Controller rename is a live, device-authoritative transaction. The action
requires a durable profile whose device id matches a live keyed entry, captures
that provider and live connection epoch, and runs through the per-Controller
device-write queue. It writes the physical Controller first, confirms the name
on the same session, then updates the live nickname, reconnect seed,
device-id/name cache, profile name, and last-known device name. A send failure,
confirmation mismatch, or replaced connection rejects without inventing a
local alias. Offline and unmatched profiles expose no rename affordance. The
existing profile-save recovery handles a later D1 failure; PXLBLZ does not try
to roll back an already-confirmed physical rename.

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
All four live-panel decks use the shared summary-row disclosure primitive.
Controls starts expanded; Pixelblaze, Power, and Variables start folded. The
`controllerPanelView` readouts use the same values and unset-control semantics
as the expanded fields. Controller and Studio preview brightness share a compact sun-icon control with a 48px track, and read-only percentage. Browser previews use a linear response; only Controller brightness uses the squared position-to-value curve. The Show Preview heading binds that same control to browser preview brightness, including while folded; it does not mutate Show records. Pattern preview places Reset before Display, brightness, and transport so reset visibility cannot displace those controls. The title brightness slider retains its live volatile
setter and curve. `panelPreferencesStore` persists disclosure state under
Controller-specific Studio-mode keys across reloads, without turning UI state
into durable Controller data. Folding a section leaves Controller polling active. Per-Controller panel snapshots
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

The Controller popover resolves a Pattern or Show subject from the Studio
route. A mounted ShowEditor publishes its committed delivery capability through
`showControllerDeliveryStore`; it does not compile a second Show for the
popover. The global Controller popover is the sole Pattern and Show Run/Save
surface; entity headers retain authoring and export actions. Show delivery uses
prepared source, warning-dependent preflight, snapshot/session invalidation and
`show:<id>` tracking. Pattern preflight retains renderer warnings, firmware
blocking, and the optional recommended-map remedy. Closing the popover cancels
pending confirmation without sending; unrelated map preflight remains owned by
its map surface. Transient success feedback clears after 3.5 seconds even when
the popover is closed; artifact-scoped failure feedback survives reopening until
dismissal or a subsequent outcome.

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

Bytecode activation queries `getConfig` after transmission but waits only for
its sequencer `activeProgram` reply: success requires the expected program id
and the same still-open connection before and after the read. A missing
settings/brightness packet cannot veto that evidence. Full `getConfig` callers
still require both packets. Wrong ids and individual sequencer-query timeouts
are retried within the existing 15-second activation window. Each query wait and
poll delay is capped by the remaining window; no reply by its end rejects.
Only typed request timeouts are retryable. Connection loss/replacement cancels
both a waiting query and an inter-query delay immediately. Cancelling a shorter
activation request removes its own queue entry, preserving concurrent config
reads with longer deadlines. This is same-connection, post-query
program-identity evidence under the firmware's ordered reply protocol, not a
bytecode digest or a request-token guarantee: firmware replies carry no request
ids. Cached pre-push observations and saved-file existence are never consulted.
A failed activation leaves successful flash writes intact; it does not publish
successful saved-delivery bookkeeping or claim a physical rollback.

**Inventory and recovery.** The profile's context pane joins `listPrograms`
with bindings, push records, and the personal and built-in Pattern/Show
catalogs. Bound entries appear under Saved PXLBLZ Patterns and link to Studio;
unbound entries are Other Patterns and are never reconciled. The running id is
marked in either table. Row actions stay visually hidden until hover or keyboard
focus; Run delegates to the panel store's persistent activation path and never
navigates Studio. Program ids move from a column into the name tooltip, and
Other Patterns have no freshness column.

Delete is available for managed and Other rows only after Controller-scoped
active-program evidence arrives, and remains disabled for the live running id,
including when that id changes after the confirmation dialog opens. A fresh
config read revalidates the active id immediately before the device command;
a missing active id is unsafe rather than equivalent to no running Pattern.
The dialog distinguishes ownership: managed deletion promises to preserve the
Studio Pattern, while Other deletion warns that source recovery requires Import
first. The operation is deliberately device-first and the complete device plus
metadata transaction runs through the per-Controller write queue, serializing
it with managed-artifact reconciliation. The queued operation also retains the
exact profile, Controller, provider, and live-connection epoch that authorized
it when the dialog opened. It revalidates that token before the initial read,
device delete, and confirmation read, refusing to cross onto a newly active or
reconnected Controller. If a reconnect follows a sent delete, the dialog keeps
the original inventory baseline and offers an explicit same-profile/controller
recheck; an absent target can then finish metadata cleanup, while a reused id
with another name is rejected. App-originated Pattern switches use the same
write queue and retain the Controller/provider/live-epoch token from the click,
so a queued switch cannot cross onto another Controller. Deletion binds even
its first pre-read to the selected row's id and device name, and refuses to run
while the Controller sequencer is active. The captured name remains the raw
device value, including an empty name rather than its UI fallback. Even an
already-absent retry rechecks the active id before metadata cleanup, and an
activation abandoned across a live-epoch change never rolls old optimistic
state over the new session. `controllerPanelStore` re-reads the
complete inventory and proves the target absent and all unrelated id/name pairs
present before durable metadata changes. The first inventory is retained across
retries, so an ambiguous confirmation cannot erase evidence that an unrelated
Pattern also vanished. A managed success then
removes exactly its Controller/binding entry from both overwrite bindings and
push records and clears the five session-only Run/Save comparison memos for
that same pair. Foreign or no-longer-matching metadata is a no-op. A failed
binding write restores the prior push records; the dialog stays open with a
retryable error, so a retry can finish metadata cleanup even when the device
already confirmed deletion. Deletion never removes Studio content and never
queues managed-artifact reconciliation.

Saved PXLBLZ Patterns is the sole profile-freshness surface. Each bound row
compares the recognized, compatibility-normalized signature in its push record
with a fresh full-profile signature for that binding and the live map dimension:
exact matches get an emerald status dot, recognized differences amber, and
missing or unrecognized evidence zinc; queued and syncing pulse, and failures
are red. The tooltip and accessible label retain the full status explanation.
`controllerSavedProgramFeatures` separately derives up to four artifact facts
from durable evidence: power-cap and hardware-brightness transforms, a
call-exported-slider or call-function control binding, and an assign-variable
binding. Unrecognized signatures make no feature claim. Saved Show rows retain
their Show-output contract summary and any source-unavailable note.

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
program last, and stops cleanly on newer edits or disable. Unattended
reconciliation keeps Patterns and Portable Shows current, while Installation
Shows are sent only explicitly from the editor, because the Controller's
installed map cannot be verified atomically at write time (#1129).

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

Automatic panel/profile reads share the pending or settled read for the current
physical connection, including confirmed absence and read failures. Opening a
surface or receiving telemetry does not restart that read. Explicit Refresh and
post-push verification replace it; a new connection epoch cannot reuse an old
read or accept its late response. The Controller bar refresh trigger follows the
physical connection rather than a duplicate profile's mutable update timestamp,
and its profile links exclude records in Trash.

---

# Part 5 — Shows

A Show is authored as timeline choreography and shipped as one ordinary,
self-contained Pixelblaze Pattern. Four stages carry it from one to the other.
The **record** saves what the person meant: Clips, Layers, Zones, Transitions,
Groups, routing, and Property animation, each stored directly. The **editor**
changes that record only through pure owners and one admission path, so every
edit is one validated candidate, one Undo step, and one save. The **compiler**
lowers the record through internal Scene intervals into isolated Pattern
members, a scheduler, and a router. **Delivery** packages the generated source
for a Controller, an `.epe`, or the Source code view, while a `.pxlshow` file
carries the editable record itself.

![Show authoring model: direct timeline entities and routing pass through compiler-internal lowering, then compile into one scheduled Pixelblaze Pattern](../images/show-model-runtime.svg)

The detailed obligations live in contracts. Start with
[Show command semantics](contracts/show-command-semantics.md) for how edits are
invoked, identified, and refused, and
[Show state, history, and persistence](contracts/show-state-history-persistence.md)
for adoption, Undo, saving, and recovery. The `show-v2-*` contracts beside them
each own one edit family.

## 19. The Show record

`ShowRecordV2` (`src/engine/showCompositionV2.ts`) is the only Show record the
application reads or writes. It holds identity, Zones, Zone Layout definitions,
the output contract, the composition, optional Trails, and provenance.
Ownership inside it is strict, and most editing rules follow from it:

| Owner | Owns |
|---|---|
| Show | `showEndMs`, Show-wide Property targets, output contract, target Controller, Stage map |
| Zone | Semantic identity; Layers reference a Zone |
| Pattern instance | Pattern source reference and control values; several Clips may share one |
| Clip | Global interval, Zone, Layer, held appearance keys, Effects, entry policy |
| Transition | Positive-duration window and either Clip participants or whole-output contributors |
| Property track | Target, activation interval, Show-global keyframes |
| Layout occurrence | A routing definition over a time interval, optionally with a transfer into the next |
| Group definition / occurrence | Relative choreography / its placement on one Zone, start, and base Layer |
| Marker | A named time; never affects rendering |

A Cut is not stored. Exactly adjacent Clips on one Layer project a Cut, and
only positive-duration Transitions persist. Easing is one structured
representation (Linear; Quadratic, Cubic, Sine, and Back with direction; CSS
cubic Bézier; Steps; Hold) shared by Transitions, Property animation, and
Effect parameters. Invalid easing normalizes to Linear with a field-addressed
validator issue.

**Output contract.** Every Show declares `installation` (an exact pixel count
and output map) or `portable-2d` (a reference count and map plus a
variable-resolution promise), capped at 2,000 pixels. `set_output_contract` can replace
either kind with the other. `showInstallationCoverage.ts` requires every output index to be
assigned exactly once before delivery, reporting missing, overlapping, and
out-of-range indices separately; its interval sweep scales with the number of
authored ranges, not pixels. `showPortableCompatibility.ts` requires logical
geometry and 2D capability, admitting 1D `render` members through an explicit
adaptation.

**Storage.** Personal Shows are rows in D1 `personal_shows`, one
`ShowRecordV2` document per row in `record_json`, read and written through
`src/cloudflare/shows.ts` and the `/api/shows` routes. A row whose
`record_json` is NULL is a retired version-1 row: it stays stored but is never
listed or opened. D1 loading validates each contract strictly and reports
rejects in `unreadableShows` without failing the collection. The editor derives
generated source at compile and delivery time; no compiled artifact is stored.

**Built-in Shows.** `src/pixelblaze/stock/showsV2.ts` owns the catalogue as
native records, with authoring helpers in `showsV2Authoring.ts`. A built-in
Show opens as a session draft: the first edit creates an in-memory copy with
ordinary Undo, Reset or reload restores the fixture, and nothing reaches D1.
**Try with Pattern** slots in lessons and Showcases use the same Pattern
replacement owner as the Clip and Group inspectors. Replacement keeps control
values and control animation for every public slider the incoming Pattern also
exports and removes the rest; the slot picker confirms first when that would
remove animation.

**Show files.** `showFileBundle.ts` owns the gzip-compressed `.pxlshow`
format: one complete Show, every reachable personal Pattern, each referenced
custom Map, and export provenance. `showImportPlan.ts` plans the import
against the receiving library before writing anything. Built-in references
must exist locally, identical dependencies are reused, absent ones keep their
ids, and divergent ones get fresh ids and Show-tied names. The imported Show
always receives a fresh id and records its origin in `importMetadata`. Older
version-1 files convert through `showImportV1Conversion.ts` before any write;
a conversion refusal shows its first issue in the import dialog and writes
nothing. See [conversion provenance](contracts/show-v2-conversion-provenance.md).

**Record coverage.** `schemas/show-record.schema.json` is generated from the
record type (`npm run schema:show-record`, with a drift test). A coverage
snapshot classifies every record path by how commands reach it: addressed
directly, reached only through a parent rewrite, allowlisted with a written
reason, or unreachable. A new record field fails the suite by name until the
snapshot is regenerated and its classification reviewed.

## 20. Editing: owners, admission, and history

Every change to a Show, whether from a pointer drag, an inspector field, or an
agent command, runs through a pure owner in `src/engine/` that takes a record
and returns a complete candidate or a typed refusal. The owners are the only
place editing rules live:

| Concern | Owner |
|---|---|
| Clip timing: move, trim, extend, split, re-place | `showClipTemporalV2.ts` (gesture planning in `showTimelineGesturesV2.ts`) |
| Clip creation, duplication, deletion, Pattern replacement | `showClipsV2.ts`, `showTransitionsV2.ts` (deletion with attached Transitions) |
| Held appearance and Effects | `showV2ClipAppearancePlanning.ts` and the appearance owners |
| Transitions and connected moves | `showTransitionsV2.ts` |
| Layers | `showLayersV2.ts` |
| Groups | `showGroupCreationV2.ts`, `showGroupEditsV2.ts`, `showGroupModel.ts` |
| Property animation | `editShowPropertyV2` |
| Markers | `showMarkersV2.ts` |
| Show End and Layout occurrences | `showLayoutIntervalsV2.ts` |
| Insert Time | `showTimelineV2.ts` |

A few owner rules explain most of what an editor or agent sees:

- **Connected Clips move together.** A Transition joins its participants, so a
  time move carries the connected sequence and a resized edge ripples the Clips
  after it. Moving a Transition participant to another Zone or Layer refuses
  unless the caller grants detaching the Transition. A person's drag grants
  it, so the Transition detaches in the same commit; agent commands never do.
- **Deletion is complete.** Removing a Clip removes its owned Property tracks
  and every Transition naming it; everything else keeps its global time. A
  removed Transition that carried Property ramps needs an explicit projection
  plan, or the edit refuses whole.
- **Removal requires reassignment.** Removing a Layer refuses while any Clip,
  Group binding, or Transition still references it.
- **Show End and Insert Time respect content.** Shortening Show End refuses
  while a Clip, active track, or Layout transfer extends past the new end.
  Insert Time lengthens a crossing Clip rather than splitting it and refuses
  strictly inside a Transition or Layout transfer.
- **Groups share runtimes.** Linked Group occurrences share Pattern instances by
  default. Duplicate and Make Unique never allocate a runtime; only
  Make Pattern Independent does. `showGroupModel.ts` prefixes each
  occurrence's materialized members so private state never leaks between them.

**Admission.** A candidate becomes the Show only through the prepared-edit
admission path (`src/store/showV2PreparedEditAdmission.ts`). It revalidates the
route, provider, revision, and captured dependencies, then publishes exactly
one candidate with one history entry and one save. A refusal or a no-op writes
nothing. `src/store/showStore.ts` holds each open Show's working record, its
in-memory Undo/Redo history, and the stored row. Saves queue per Show and apply
optimistically; when the current save fails, the store restores the last
durable record and its history, so a failed save rolls the edit back instead
of leaving an unsaved Show on screen. Undo history lasts for the session.
Monotonic `updatedAt` stamps order one client's recovery; they are not a
cross-client conflict protocol.

**Validation.** `validateShowAuthoringV2` checks dependencies and control
metadata, Portable 2D capability, Installation coverage, Zone Layout
structure, and output pixel count. Agent candidates use an internal
authoring-validation policy that accepts delivery-incomplete work while
keeping structural and dependency checks; see
[agent candidate application](contracts/agent-candidate-application.md#internal-authoring-validation).

**The command registry.** `src/engine/showCommandsV2/` exposes the same owners
to structured callers as a typed catalogue: stable snake_case names,
descriptions, the record paths each command may write, and fully typed input
schemas. Commands address everything by identity, use Show-global integer
milliseconds with half-open intervals, and answer an already-satisfied
request with `unchanged` rather than a refusal. The built-in agent and external
MCP clients use this catalogue, and the
[Agent Authoring Reference](agent-clip-layer-authoring.md) and its MCP
resources are generated from the same field definitions. Adding a command
requires a descriptor in its family module, a golden accepted case, and a
refusal partition; a faithfulness sweep fails any command whose goldens write
outside its declared paths.

## 21. Timeline editor and Stage

`ShowEditor` renders one proportional grid: ruler, Zone and Layer stacks,
Clips, Transition junctions, disclosed Property lanes, Markers, Show End, and
the playhead. `ShowStagePreview` owns the Stage canvas and its runtime.
Both are thin: they render store state and hand events to the owners above.

**Editor state.** View state lives in store slices so tools and tests can read
it without a component handle. `showEditorViewStore` holds selection and the
visible time range; `showClipHoverStore` holds the hovered Clip in a separate
store so pointer-rate writes never re-render selection subscribers;
`showTransportStore` holds the playhead; `showEditorSessionStore` persists
Snap, Marker preferences, and per-Show Zone disclosure outside the record.

**Viewport and snapping.** `showTimelineViewport.ts` owns zoom, pan, the
Navigator, and snapping. Snapping layers an always-on quantize grid under
boundary magnets. The grid refines along the ruler's 1/2/5 tick family to a
200 ms floor (100 ms with Shift), and the ruler draws its ticks from the same
formula, so a landing never disagrees with a tick line.

**Keyboard and Escape.** `showControlOwnsKeyboardEvent` treats a focused
button as owning Space unless it is marked `data-studio-space-preview`, so
editor chrome releases Space to playback while popover buttons keep native
activation. Tab walks Clips and Groups in time order. `showEscapeLayers.ts`
registers one Escape listener that closes exactly one surface per press:
detail panel, then Group isolation, then selection, then popovers.

**Detail panel.** Selection has one open owner. `ShowEntityDetailPanel` portals
a modeless panel to `document.body`, placed beside the selection and clamped to
the viewport. `showClipInspectorModel.ts` projects each Clip into one editable
model with a capability matrix, and update adapters translate its patches back
to the owners. Animation speed commits on release because a time-scale change
rebuilds the compiled preview.

**Numbers and colors.** Every numeric field uses `BoundedNumberField`: one
draft, a grip, a transient slider, and one commit per gesture. Presentation
modules translate between stored real units and what the person sees:
`percentageValue.ts` for opt-in percentages, `domainNumberPresentation.ts` for
multipliers and ratios, `anglePresentation.ts` for turns (only direction
normalizes, so multi-turn animation survives editing), and
`linearNumberPresentation.ts` for seconds. Stored records, compiler inputs,
and generated code always carry real units. `ColorField` owns the canonical
`#RRGGBB` form.

**Placement.** `showClipTransform.ts` owns the canonical Transform
(normalized position, rotation in turns about the center, scale). A fully
neutral Transform compiles byte-identically to none. `showClipViewport.ts`
owns the Aperture: shape catalogue, edge policy (hard, soft, or dither), feather,
rotation, and invert. Shape parameters are never animatable, so their constants
always fold. `spatialShapeGauge.ts` is the single metric source for shapes,
checked sample-for-sample against the preview. `showClipPlacementPad.ts`
normalizes pointer coordinates through the rendered bounds, so resizing the
pad never changes a stored result.

**Stage.** The Stage runs the prepared Show artifact. A push can send
different source: `showControllerArtifact.ts` adds a renderer adapter when the
Controller's map dimension needs one, and delivery applies the target
Controller profile's passes.
`showPreparedStageV2.ts` validates the record and its dependencies,
lowers it with `prepareShowV2ForCompile`, and compiles through the shared
artifact cache; see [prepared Stage](contracts/show-v2-prepared-stage.md). The
Stage renders in Fast or Precise fidelity, takes its clock from Show transport
rather than Pattern speed, and does not apply delivery gates, so a Show that
cannot ship still previews. Installation Shows preview at their saved count
and ranges; Portable Shows at their saved reference, never at a connected
Controller's. Zone outlines and selected-Clip bounds are session-only SVG
guides that never touch compiled pixels, and they wait for a seek to finish so
they describe the painted frame.

One constraint surprises people. While paused, resizing the Stage must
repaint in the same synchronous effect using
`advanceTo(runtime.getElapsedMs())`, which redraws the retained frame without
ticking the Pattern. `renderCurrentFrame()` is wrong here because it runs
Pattern code even at zero elapsed time, and deferring the repaint exposes the
buffer the resize cleared.

**Workspace.** `ShowWorkspace` stacks the timeline over the Stage strip, with
sizing rules in `showWorkspaceLayout.ts`. The strip holds the Stage and the
Preview, Zones, Stage, and Source code sections; `ShowSourceOutlet` lets
`ShowEditor` keep ownership of compilation and delivery state while rendering
the Source code section there. The divider remembers the timeline height
across reloads.

## 22. Show compiler

The compiler has two halves. **Preparation**
(`showCompositionLoweringV2.ts`, `prepareShowV2ForCompile`) validates the
record and lowers it into a compiler recipe. Lowering cuts the timeline into
internal Scenes, the stretches during which the set of active Clips does not
change, and turns each Zone's Layers into an ordered routed stack (Main at the
back, overlays front to back). Preparation refusals are typed; see
[compile preparation](contracts/show-v2-compile-preparation.md).
**Compilation** (`showCompiler.ts`) turns the recipe into one flat Pixelblaze
Pattern. `Inside the Show compiler` tells this story for readers; this section
names the owners and the guarantees.

![The Show pipeline: saved choreography lowers through routing, scheduling, and specialization into one Pixelblaze Pattern](../images/show-pipeline.svg)

**Module seams.**

- `showMemberLowering.ts` turns each Pattern into an isolated member: bundle,
  strip the manifest, inline, hoist, alpha-rename, analyze. It never sees
  scheduler state. Continued Clips reuse a member; Restart gives a fresh one.
- `showMemberBindingPolicy.ts` answers, once per member, who writes that
  instance's per-frame values.
- `showRoutedScenePlan.ts` plans Scenes and the timeline as data.
- `showRoutingRepresentation.ts` owns routing shapes, coverage diagnostics,
  representation pricing, table decode, and the Stage-space operators;
  `showPhysicalRoutingSpecialization.ts` owns the ordered short-circuit plan.

A one-Zone Installation with no routing switch keeps a compact static
recipe. Everything else compiles to a scheduler that selects placements,
applies boundary ramps, advances each unique member once per frame, and routes
each pixel through the active layout. The composition's `executionModel` is
`continuous` or `deterministic-loop`; the latter resets member state at the
Show End wrap.

**Resources.** `showVmResourceLedger.ts` models the Pixelblaze virtual
machine: a 10,240-word array pool (each array's four-word header included) and
a separate 256-global limit, grouped by owner. Exceeding either, or the
2,000-pixel ceiling, blocks delivery. Five simultaneous renderers per pixel
also block, because four is the validated release fixture. Source size is only
advisory: `showCompilePressure.ts` scales its gauge to the observed
68,384-byte bytecode activation ceiling and colors at 80% and 100%, but source
and bytecode diverge too much for bytes to decide fit, so the Controller's own
compiler is authoritative. Blocked output stays previewable.

**Source inventory.** The Source code section explains the delivered source as
an exact byte ledger. The compiler attaches one owner to every contiguous range
of the final compacted artifact, so each Pattern's row, the generated
categories, and the provenance header reconcile to the bytes offered to the
Controller, including any profile transform. Three counts are kept distinct:
*uses* (separately configured Pattern instances), *copies* (compiled machines
in the delivered code), and *placements* (Clips on the timeline). **Pattern
copies running** is the maximum that can run at once, and **Busiest LED** is
the worst per-pixel count of Pattern color calculations. Effects are accounted
separately and never raise that count.

**Render-target arena.** Every artifact reserves exactly three
compiler-owned arrays at the output extent (6,012 words at 2,000 pixels).
`showRenderTargetArena.ts` binds typed roles over them (`stage-rgb`,
`sample-xy`, `scalar-field`, `previous-rgb`), and
`showRenderTargetPlanner.ts` decides who gets them. Candidates declare
lifetime, invalidation, exactness, and cost; required policies come first,
exact before approximate, and a candidate with no saving is declined.
Non-overlapping lifetimes reuse planes, and the planner never allocates
beyond the three. Snapshot Crossfade, Trails, Freeze and Strobe captures,
Freeze at entry, Rolling Refresh, Pattern-output reuse, coherent noise, and
static Vignette all draw on it, each with a named fallback when it does not
qualify.

**Specializations.** The compiler carries a family of individually
reversible optimizations, each recorded in the compile summary with a
counterfactual switch. They include stack and wrapper interning, the
table-driven scheduler and Show score, shared Transition and Effect kernels,
lifetime-colored Restart machines, frame-invariant hoisting, generated-wrapper
inlining, small-loop unrolling, and boundary-latched route decode. Selection is
automatic only where the result is provably equivalent and smaller or measured
faster. Three guarantees constrain future work:

- Boundary-latched decode recomputes routing only at index 0 and at Zone
  boundaries, which is exact only because firmware renders pixels in ascending
  order. A consumer that renders out of order would see stale routes.
- Routed Transition bodies run in separate generated helper functions. This is
  a firmware-safety boundary proven on hardware, and new Transition families
  must keep it unless hardware qualification proves otherwise.
- Lossy rewrites (integer `pow` lowering, approximate transcendentals, spatial
  hold-and-lerp) are off by default and never used at the Exact stop.

Acorn proofs gate the aggressive paths: render purity for output reuse,
guaranteed output for clear elision, and provable allocation sizes for the
member census. An unprovable size blocks with a remedy rather than a guess.
Measured results and rejected candidates are in
[Show Rendering Optimization Results](Show%20Rendering%20Optimization%20Results.md).

## 23. Transitions, Effects, and routing

Each visual policy has a known runtime cost, and the compiler reports it in
these terms (`N` is the output pixel count, `E` the pixels inside a band):

| Policy | Runtime cost shape |
|---|---|
| Cut / Restart | One active member |
| Parameter ramp | One continued member, per-frame updates |
| Snapshot/live Crossfade | One `2N` capture frame, then replay plus one live renderer |
| Live/live Crossfade | Two renderers during the window |
| Fade through color | One renderer per phase (`N`) |
| Hard or stable-dither Wipe, Dissolve, Shape | One renderer per pixel (`N`) |
| True feather blend | Two renderers only inside the band (`N + E`) |
| Routing transfer | Both clocks advance; one layout selected per pixel |
| Soft Split | One renderer outside the feather, two inside |

`showVisualToolkit.ts` is the framework-free catalogue of Transition and Effect
families: families own ids and cost policy, variants own parameter
descriptors, and presets are named parameter bundles.
`showVisualToolkitFixtures.ts` provides headless evidence for every variant
the compiler lowers, and `showVisualToolkitFreeze.ts` seals registry,
fixtures, and recipes behind a version and fingerprint; an intentional change
increments the version. Easing is deterministic arithmetic shared by preview
and generated code; the Bézier solver is emitted only when a Bézier is present
and runs per frame, never per pixel.

**Effect order.** A Clip's Effects run in two stages around one renderer
call. Coordinate operations come first, then the Pattern is evaluated once,
then output operations, with the border mask last. The full runtime order is:
Stage sample and Zone-local normalization, Show-wide sample remap, mirror,
inverse affine Transform, distortions, Clip or Wrap addressing, one renderer
call, output Effects, border mask. Neutral static Effects emit nothing, and a
distortion at Amount 0 is an exact identity. Content keys carry alpha and let
a keyed top layer skip covered pixels below it, which is where the `N + U`
cost comes from.

**Sample remap and adaptation.** Show-wide repeat scale is one value per frame,
with scale 1 an exact identity branch. Time offset, stepped clock, shutter,
and mirror or phase are part of member compatibility. Time scale zero holds
Pattern time at zero; negative time is unsupported because stateful Patterns
cannot run backwards.

**Routing.** Installation layouts keep arbitrary inclusive LED ranges; the
first match wins and uncovered pixels render black with a warning. Portable
layouts use the `ShowLogicalRouting` operators (Full Stage, Grid, Stripes,
Checker, Rings, Pinwheel, Wave, Moving Split, Soft Split). The preview router
and generated code share the same region-local equations, using
`v - floor(v)` so browser and device agree at cell boundaries. Moving Split
renormalizes the selected side and updates the member's virtual `pixelCount`;
Soft Split evaluates both sides only inside its feather. A routing transfer
compares one eased threshold against stable Stage position and never blends
renderers.

The representation planner proves exact ownership before specializing.
Complete partitions compile to an ordered short-circuit, cyclic reassignments
of one topology to formulas, and irregular layouts may use a packed per-pixel
table. The table must pass four measured gates: a 4,096-word memory cap within
the arena residual, 16.16 representability, bytecode cost, and a 13-comparison
expected branch depth. The compile summary names the chosen representation and
its cost.

## 24. Deterministic seek replay

Seeking never approximates. A cold seek builds a fresh Fast runtime with the
Show's seed, renders time zero, and advances at 60 fixed steps per second to
the target; a warm seek restores the nearest compatible checkpoint and advances
only the remainder. Every step runs `beforeRender`. Where the artifact proves
renderer state is target-local, intermediate steps skip per-pixel work, and
compiler-listed renderer scratch is normalized after each step so checkpoint
and final snapshots stay identical. The target frame always gets a complete
renderer pass; unproved artifacts render every step. See
[checkpoint bindings](contracts/show-replay-checkpoint-bindings.md).

Replay advances 250 ms of Show time per cooperative chunk and yields. A newer
seek supersedes older work, and only a completed reconstruction becomes the
live runtime. While paused, the Stage pre-warms the same checkpoint store at
idle priority, and any transport action cancels it. Determinism covers the
seed, cadence, initial values, and scheduled automation; wall-clock time,
network, and sensor history are outside it. Trails is the one visible
exception: a seek clears its prior-frame history at the destination rather
than reconstructing it.

## 25. Delivery and export

A Show leaves PXLBLZ in two deliberately different forms. A `.pxlshow` file
(§19) is the editable record for another PXLBLZ library. Everything else (Run,
Save, **Download .epe**, and **View code**) uses the compiled artifact, which
contains generated Pixelblaze source and compatibility facts but no editable
model. Delivery refuses coverage failures, Portable incompatibility, and
resource blockers; see
[native artifact qualification](contracts/show-v2-native-artifact-qualification.md).

`showEpeExportV2.ts` packages the exact generated source with a program id, a
preview JPEG, a readable Show-global schedule of Clips and Layouts, Transition
facts, provenance, and retained member license comments. Its banner may carry
`pxlblz:map`, `pxlblz:compat`, and `pxlblz:show-output` records;
`pxlblz:show-output` is the authoritative artifact contract (Installation:
pixel count, map identity, and fingerprint; Portable: 2D classes and variable
resolution). A malformed optional record is omitted, never guessed. See
[`.epe` export](contracts/show-v2-epe-export.md).

**Sending to a Controller.** The editor prepares one delivery snapshot from the
settled compilation and the active Controller before it enables Run or Save,
and the click consumes that snapshot without recompiling. Any change to the
Show, a dependency, the profile, or the Controller invalidates it: Run and Save
show spinners while the next one builds, and a pending confirmation bound to
the old snapshot closes. The snapshot carries the Controller identity and live
connection epoch through profile draining, preview generation, and device
compilation, and `pushPattern` checks both again before every queued Controller
write, so a disconnect, reconnect, or different Controller aborts before
anything is written. Sends use the shared Pattern transport under identity
`show:<show-id>` (§17). `showControllerArtifact.ts` is the only
device-derivation seam: it compares generated capabilities with the installed
map and firmware, appends a renderer adapter when required, blocks known
unsupported firmware and Installation mismatches, and treats Portable
differences as advisories. Delivery never changes the Controller's map or
pixel count.

---

# Part 6 — Agent service

An agent edits a Show in a private working copy admitted by the open editor.
Ordinary changes use the command catalogue (§20); an external MCP client can
also replace the whole private Show through `replace_show`. Two kinds of
agent use that path. The **Pixelblaze agent** is built in: the Worker calls the
model and relays each tool call to the browser. An **external agent** is any
MCP client the person authorizes with OAuth, such as Claude Code or Codex; its
tool calls arrive at the Worker's `/mcp` endpoint and take the same relay.
Either way the browser is the only place a Show is read, changed, validated, or
saved. The server coordinates who is connected and how much the built-in agent
may spend, and stores no Show content, candidate, or transcript.

The user-facing behavior is in Part 5 of the Feature Guide. The obligations are
in four contracts:
[OAuth and MCP discovery](contracts/agent-oauth-discovery.md),
[account rendezvous](contracts/agent-rendezvous.md),
[candidate application](contracts/agent-candidate-application.md), and
[built-in service](contracts/agent-builtin-service.md).

## 26. Components and connections

Three Durable Objects hold all server-side agent state, and no D1 table is
involved:

| Durable Object | Instance | Holds |
|---|---|---|
| `AgentAccount` | One per account | The account's connection slot (rendezvous), rate windows, and an in-memory relay |
| `AgentOAuthAuthority` | One per OAuth origin | Authorization continuations, consent nonces, registered clients, grants, and tokens |
| `AgentAllowance` | One global instance | Built-in operations, per-day dispatches, and message counters |

The Worker's agent routes are the OAuth and MCP family
(`src/worker/agent/agentOAuthRoutes.ts`: `/.well-known/oauth-*` discovery,
`/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/mcp`) and two
authenticated browser routes: `POST /api/agent/channel`, the editor's channel
to its account's `AgentAccount`, and `POST /api/agent/builtin`, one built-in
turn. In the browser, `src/agent/drawerController.ts` drives the Agent drawer,
`editorSession.ts` and `browserSession.ts` own the window's registration and
receive loop, `editorAdmission.ts` admits finished work into the Show, and
`builtinClient.ts` talks to the built-in route.

**One slot per account.** An account has one active agent connection,
shared by the built-in and external choices. An editor window registers with
its account's `AgentAccount`; connecting binds the slot to that window. Moving
the agent to another window (**Reconnect** or **Bring agent here**) is a
compare-and-replace on the exact binding generation that gives the destination
a fresh binding, call identity, and empty relay; a tool envelope addressed to
the old binding reports the new destination without running, and the client's
next response asks it to refresh its context. **Forget this agent** retires
browser work first, then ends the binding, then revokes the grant.

**Timers.** Setup keeps the connection window open for 2 minutes, and a
pending incoming call must be answered within 30 seconds. An editor
registration lives 5 minutes without renewal, and contact counts as lost
after 45 seconds of silence. OAuth access tokens last 5 minutes and refresh
tokens a day; a registered client expires after 90 days. Each account
allows 240 agent tool calls per minute, counted separately from the browser's
own channel traffic, so a throttled agent never starves the editor's replies.
The constants live in `src/engine/agentRendezvous.ts`,
`AgentAccount.ts`, and `AgentOAuthAuthority.ts`.

**Enablement.** Nothing is available unless `AGENT_SERVICE_ENABLED` is `1`.
`/api/me` reports `agentCapabilities`: `external` requires the OAuth
configuration (`AGENT_OAUTH_ORIGIN`, `AGENT_OAUTH_CLIENTS`) and the
`AGENT_OAUTH_AUTHORITY` and `AGENT_ACCOUNTS` bindings; `builtin` requires
`AGENT_ACCOUNTS`, `AGENT_ALLOWANCE`, and `OPENAI_API_KEY`. The drawer offers
only what `/api/me` reports, and a route whose configuration is missing
answers 503 `unavailable`.

## 27. How an agent edit runs

Every tool call follows the same round trip. The Worker validates the caller
(a bearer token for MCP, the signed session for built-in), asks the account's
`AgentAccount` to resolve the binding, and places the call on the relay. The
bound editor's receive loop fetches it, runs it against the private executor
(`src/engine/agentPrivateExecutor.ts`), and posts the reply. Relay payloads are
volatile; the Worker keeps only identities, deadlines, and counters.

An operation has three phases.

1. **`begin_edit`** captures the open Show and its context once, under an
   immutable request identity, and opens a private candidate for that binding.
   Its one-line `intent` is shown in the drawer's Activity.
2. **Commands** change the candidate. Each runs the same owner the editor
   uses and returns its result or refusal at once. An external MCP client can
   instead send `replace_show` with a full record based on `read_show` and the
   `pxlblz://schemas/show-record/v2` resource. The id must match the connected
   Show; the current name is kept. The executor validates the record at this
   call, and later commands apply to the replacement. Nothing reaches the Show
   or its history yet.
3. **`commit_edit`** asks the editor to admit the candidate. Admission checks,
   in order: the session and revision; that the Show is still open and not
   being deleted; that the captured record, dependencies, provider, and route
   are unchanged; that the candidate is a v2 record for this Show; the JSON
   Schema; the domain rules; Pattern, Library, and control availability; that
   something actually changed; and that the Stage can be prepared. A passing
   candidate is adopted as one Undo step through the ordinary save queue
   (§20), so it can still roll back if the save fails. `cancel_edit` discards
   the candidate.

If the person is in the middle of an edit (a drag, or a field with an unsaved
draft), admission waits for them to finish, up to 5 seconds
(`showInputWait.ts`), and the drawer shows **Waiting for you to finish**.
After that the operation ends as an interaction timeout. A manual edit that
lands first makes the candidate a revision conflict rather than overwriting
the person's work.

`get_outcome` reports what happened. Applied outcomes are saving, saved,
rolled back, superseded, and stock draft (a built-in Show's session draft).
Non-application outcomes include asked, refused, nothing applied, commit
refused, incomplete, and the service outcomes. Losing contact is separate from
the outcome: a browser that goes quiet makes the outcome unknown, never failed.
The browser keeps settlement receipts so a restored connection can report
what actually happened.

## 28. The built-in agent

For the built-in agent the Worker runs the conversation. `builtinTurn.ts`
calls the OpenAI Responses API (`builtinProvider.ts`) with the server's key,
model `gpt-5.6-luna` at high reasoning on the priority service tier, with
provider-side storage off and one tool call at a time. It relays each tool call
(`begin_edit`, commands, `commit_edit`) to the browser exactly as an MCP call
would travel, for at most six model rounds per message.

**Allowance.** `AgentAllowance` enforces three limits from
`AGENT_SERVICE_BOUNDS` and `AGENT_DAILY_MESSAGE_LIMIT` in
`src/engine/agentAllowance.ts`:

- **30 messages per account per UTC day.** A message is charged once, when
  its first provider call is admitted, atomically with the budget reservation.
  Later rounds of the same message are free.
- **A shared daily budget** across all accounts ($10). Each call reserves its
  worst-case cost before dispatch and settles the actual usage afterwards.
- **Four message starts per minute** per account.

`/api/me` and every built-in response carry the authoritative remaining count,
reset time, and state. The drawer refreshes on focus and at reset rather than
polling, and treats missing, malformed, or stale status as blocked. When a
limit blocks, the composer names which one: the personal message limit, the
shared budget, or the service being unavailable.

**Diagnostic harness.** `src/agent-harness/` is a separate, never-bundled
toolkit for evaluating agent editing offline: a dictation bridge, an MCP
server, a scripted corpus, and evaluation tools transferred from an earlier
prototype. It speaks the production v2 catalogue through one transport adapter
and runs the production route's own checks. Its paid model calls go through a
durable budget ledger that refuses any request it cannot price in advance. `npm run agent:smoke` and `npm run agent:corpus -- --fake` exercise it
without paid calls, and `npm run test:e2e:agent-baseline` drives the live
editor through a scripted bridge (an explicit diagnostic, not a push gate;
report in [agent-editing-baseline.md](agent-editing-baseline.md)). The harness
`README.md` has its commands and budget rules, and `PROVENANCE.md` records what
changed in the transfer.

---

# Part 7 — Supporting systems and limits

## 29. Export and in-app documentation

Pattern **Copy code** copies the stamped `bundle(...).code`; **Download .epe**
wraps the same stamped code in an `.epe` with a preview JPEG. `.epe` import reads
`sources.main`, parses PXLBLZ map metadata, and surfaces an import notice
rather than guessing ambiguous map references.

Documentation is raw Markdown imported through `src/docs/catalog.ts` and
rendered by `DocsWorkspace` at `/docs/<id>`; `docsMarkdown.ts` is a
purpose-built safe parser for the repository's Markdown subset — unsupported
syntax degrades to text, raw HTML is never injected. `ApiReferenceWorkspace`
at `/reference/<library>` builds from the built-in cheatsheet and parsed
library comments; entering from Studio appends already-loaded cloud
libraries.

## 30. Testing and evidence

Most coverage belongs around pure engine logic; component tests are light
smoke over delegation. The repository also carries fixed-point and library
fidelity suites, fake-relay protocol tests, PBP/map binary round trips,
compiler and generated-artifact execution tests, Show equivalence tests,
performance harnesses, Playwright public-route and authenticated D1-backed
suites, and explicit live-hardware probes with archived result reports
(`npm run issue<NNN>` / `issue<NNN>:hardware` scripts). The pre-commit gate
runs lint, test meta-checks, and staged-path-selected tests. Required full
Vitest and Playwright suites run at a committed tip on the private WRSP mini;
pre-push consumes matching exact-tip evidence after review approval and the
exported-artifact oracle instead of rerunning those suites locally.
Performance and hardware tiers stay explicit because their reliability and
environments differ. Development builds expose a hidden Show Stage telemetry
probe; production builds omit it.

The agent diagnostic harness and its baseline suites are described in §28.

## 31. Known limits and accepted divergences

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
- Agents can place, time, and select Zone Layouts but cannot create Zones or
  change a Layout definition's routing; those remain editor-only.
- Show seeking reconstructs Pattern state exactly, but Trails restarts its
  history at the seek destination.

## 32. Evidence and further reading

- Feature Guide — `docs/reference/PXLBLZ Feature Guide.md`
- Pixelblaze Ecosystem Primer — `docs/reference/Pixelblaze Ecosystem Primer.md`
- Understanding Maps — `docs/reference/Understanding Maps.md`
- Optimization Guide — `docs/guides/Optimizing Pixelblaze patterns.md`
- Show compiler overview — `docs/guides/Inside the Show compiler.md`
- Show optimization evidence — `docs/reference/Show Rendering Optimization Results.md`
- Domain glossary — `CONTEXT.md`
- Engineering contracts — `docs/reference/contracts/`
- Agent Authoring Reference — `docs/reference/agent-clip-layer-authoring.md`
- Archived measurements and decisions — `docs/plans/archive/issue-*.md`
  (routing representation #400/#409/#410, coordinate remapping #406, seek
  replay #421, headless freeze #459, distortion review #456, arena and
  specialization results #512–#573, composition freeze #492)

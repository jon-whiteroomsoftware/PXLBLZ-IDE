# PXLBLZ — Technical Reference

This is the as-built engineering reference for PXLBLZ-IDE. It explains the
current architecture, the decisions that constrain it, and the seams new work
should extend. User workflows belong in the **PXLBLZ Feature Guide**; Pixelblaze
platform concepts belong in the **Pixelblaze Ecosystem Primer**. Where this
document and the code disagree, the code wins.

PXLBLZ has two product surfaces over one browser engine: a public Gallery and an
authenticated Studio. Pattern editing, transpilation, execution, preview, and
hardware artifact generation happen in the page. Durable personal content lives
in Cloudflare D1 behind Pages Functions. Live Controllers sit behind an optional
Chrome-extension relay because an HTTPS page cannot open their LAN WebSockets
directly.

---

# Part 1 — Architecture

The browser is the center of PXLBLZ: it owns the product surfaces, shared state,
editing engine, preview runtime, and hardware artifact generation. Cloud storage
and live Controllers sit behind narrow provider boundaries, keeping durable
content and LAN transport out of the core engine.

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
| Tests | Vitest/jsdom plus Playwright route smoke tests and hardware harnesses |
| Commit gate | Husky: lint and full Vitest suite |

![System boundaries: the browser contains UI, shared state, and the pure engine; only durable content and explicit hardware intent cross its boundary](../images/system-map.svg)

### Engine versus UI

`src/engine/` is framework-free TypeScript. It owns parsers, transforms,
compilers, state projections, validators, protocol logic, and geometry. Engine
modules do not import React. Components render state, delegate events, and call
engine functions; they do not become a second implementation of compiler or
model rules.

Zustand is the shared state seam because render loops, Controller providers, and
other non-React code need synchronous access. Stores may orchestrate engine
functions and persistence, but reusable transformations remain pure.

### Hardware artifacts stay Pixelblaze code

The transpiler inlines and renames; it does not translate Pixelblaze into a
different runtime language. Stock and personal libraries are Pixelblaze-dialect
JavaScript. Passes derive another inspectable Pixelblaze artifact. Shows compile
into one Pixelblaze Pattern. Map source is ordinary Mapper JavaScript.

That constraint keeps preview, generated source, the device compiler, and manual
copy/paste workflows on the same code path.

### Preview state does not leak to hardware

Fast/Precise mode, viewport embeddings, camera, light size, diffusion, solidity,
playback speed, preview brightness, selected preview map, and Pattern control
positions are browser state. They are not silently included in a Pattern push.

Hardware receives only an explicitly generated Pattern artifact or an explicitly
sent map. Controller-profile transforms are included because they are authored
hardware intent and appear in artifact inspection—not because preview state was
serialized by accident.

## 2. Routes, surfaces, and authentication

The pure route codec is `src/engine/routes.ts`; `routerStore` owns History API
mutation and location synchronization. `App.tsx` performs the route/store join
after personal collections resolve.

| Route | Surface |
|---|---|
| `/`, `/gallery` | Public Gallery |
| `/p/<slug>` | Built-in Pattern detail |
| `/studio` | Studio home/current entity |
| `/studio/<kind>/<id>` | Patterns, maps, mixins, libraries, Controllers, or Shows |
| `/studio-welcome` | Signed-out Studio gate |
| `/docs/<id>` | In-app documentation |

Legacy `#/docs/<id>` links redirect into the path router. Unknown routes and
missing entities render explicit not-found states after the relevant collection
has loaded.

The Gallery and global Controller chrome are public. Studio routes wait for
`/api/me`; signed-out users see GitHub and Google sign-in choices rather than a
brief flash of authenticated UI. GitHub and Google identities attach to one
stable user row. Verified matching email may auto-link; an authenticated user
may explicitly connect another provider and may disconnect one unless it is the
last login.

`workspaceStore` exposes only resolved/authenticated state to the UI. OAuth,
cookie signing, identity linking, and owner allow-list enforcement remain in
Cloudflare helpers and Pages Functions.

### Gallery runtime

`galleryCatalog.ts` is the built-in Pattern catalogue. Gallery cards use the
real bundle/shim/render pipeline at bounded pixel counts, with a global animation
slot limit, IntersectionObserver pausing, staggered startup, and a static frame
for reduced-motion users. Cards, Pattern detail, and Studio resolve one shared
recommended presentation per Pattern; cards may reduce only its count. Layout
resolution enforces the Gallery ceiling after grid realization, so a Cube cannot
round a bounded request above 2,048 LEDs. Pattern detail uses the ordinary preview
stores and Controller push flow without a count multiplier; its Code view is
read-only Monaco.

### Analytics

Production route views and a small set of product actions are instrumented
through the analytics seam. Local development and tests do not send analytics.
React calls typed helpers rather than embedding provider-specific commands
throughout components.

## 3. Personal content and persistence

`personalContentProvider.ts` is the browser-side storage interface. The
authenticated implementation calls Pages Functions backed by D1. Demo mode
returns empty personal collections, ignores last-active/demo-override writes,
and rejects durable mutations while leaving stock content and live hardware
usable.

Durable resource families:

| Resource | API / storage |
|---|---|
| Patterns | `/api/patterns`, `personal_patterns` |
| Maps | `/api/maps`, `personal_maps` |
| Mixins | `/api/mixins`, `personal_mixins` |
| Libraries | `/api/libraries`, `personal_libraries` |
| Shows | `/api/shows`, `personal_shows` |
| Controller profiles | `/api/controllers`, Controller profile table |
| Settings | `/api/settings/:key` |
| Controller bindings, labels, push records | `/api/controller-metadata/:key` |

All reads and mutations are scoped by the signed session's stable `userId`.
There is no browser-local durable workspace and no implied migration between
local storage and D1. Local storage is used only for small device/session
preferences and the Studio-welcome acknowledgement.

The API treats authenticated storage limits as coarse anti-griefing tripwires,
not ordinary product quotas. Every durable create or update rejects JSON bodies
above 1,900,000 bytes and accounts above 100,000,000 stored content bytes;
creates also stop at 1,000,000 total personal rows across all resource families.
Settings and Controller metadata routes accept only the keys owned by the
application. Guard failures use stable JSON error codes. Reads and deletes are
not subject to these write guards, and transient request-rate flooding remains
the responsibility of the hosting edge rather than this storage layer.

The D1 health endpoint checks binding/schema availability; it is not an
alternate personal-content path. Local development uses Wrangler's D1 database
behind the Vite `/api` proxy, so migrations must be applied locally as well as
remotely.

## 4. Application state and editor modes

Major Zustand stores:

| Store | Responsibility |
|---|---|
| `routerStore` | Current route and History API synchronization |
| `workspaceStore` | Authentication resolution |
| `patternStore` | Personal Patterns, built-in selection, demo overrides |
| `mapStore` | Personal maps, active map/embedding/count, map-mode target |
| `mixinStore` | Personal and stock mixin editing state |
| `libraryStore` | Personal and stock library editing state |
| `showStore` | Personal Shows and persisted model mutations |
| `showTransportStore` | Ephemeral playhead, loop duration, seek request identity/status |
| `editorStore` | Source, last clean preview source, validation, metadata, editor flavor |
| `previewStore` | Playback, visual settings, telemetry, watched vars, zone solo |
| `controlStore` | Current Pattern control values |
| `cameraStore` | Orbit state, auto-orbit, Pole density |
| `controllerStore` | Multi-Controller connections and Pattern/map push orchestration |
| `controllerPanelStore` | Polled live state for the active Controller |
| `controllerProfileStore` | Durable Controller profile CRUD and live refresh |

Stores export initial state objects for test resets. Pure engine code should not
depend on React store hooks; when store-coupled lookups are needed, inject them
or confine orchestration to the store layer.

### Monaco and validation

`Editor.tsx` runs two independent timers:

- a short preview debounce publishes clean Pattern source to `previewSource`;
- a slower sync tick persists clean personal source or bakes a map.

Broken Pattern code remains in the editor while the last clean preview keeps
running. Monaco completion/signature data comes from the hand-maintained
Pixelblaze built-in manifest plus the active stock/personal library index.

The editor has four source flavors:

| Flavor | Validation | Right pane |
|---|---|---|
| Pattern | Pixelblaze syntax and forbidden-language rules | Live preview |
| Map | Plain-JavaScript parse/evaluation | Wiring-order geometry check |
| Mixin | Structured pass header plus source checks | Provenance and transform summary |
| Library | Pixelblaze parse plus top-level content rule | Live API reference |

Stock maps, mixins, and libraries open read-only and clone into personal records.
Source-less imported maps remain read-only. Opening a non-Pattern source does not
replace or mutate the last running Pattern preview.

---

# Part 2 — Pattern compilation and preview

An authored Pattern becomes several related but deliberately separate products:
a flat Pixelblaze artifact, preview metadata, and a fixed-point preview re-emit.
The same engine then validates, loads, advances, and draws those products without
turning browser-only state into hardware code.

## 5. Transpiler and library model

`bundle(patternSource, libraries)` returns:

```ts
{
  code,      // flat float artifact for preview/hardware
  fxCode,    // Precise-mode re-emit, preview only
  metadata,  // controls, vars, render capabilities, preview only
}
```

Patterns parse as Acorn modules because top-level `export` is legal. Libraries
parse as scripts. The bundler finds `Namespace.fn()` calls, resolves transitive
same-library and cross-library references, alpha-renames functions, rewrites call
sites, and emits only reachable functions.

If any function from a library is used, that library's top-level `var`
declarations are emitted once, unmangled, before its functions. This supports
the intentional out-var contract: a helper may write globals such as `ux`/`uy`
for immediate caller use. `validateLibraryContent` restricts top level to
functions, `var` declarations, and comments, so prepending those declarations
does not introduce hidden executable initialization.

Metadata records:

- `render`, `render2D`, and `render3D` presence;
- exported variables and top-level Pattern variables; and
- exported control functions and picker backing variables.

Metadata and `fxCode` never cross to hardware.

### Stock and personal libraries

Stock libraries live under `src/pixelblaze/lib/` and are loaded as raw source.
Personal libraries join the same namespace map for preview, Copy/Download,
Controller send, Show compilation, and artifact inspection. Names are
case-sensitive identifiers and cannot shadow stock namespaces or Pixelblaze
built-ins.

Library references are soft. Renaming or deleting a library is legal; dependent
Patterns then fail bundling with an unknown namespace/function error. API docs
are parsed from `//` comments directly above function declarations and feed both
Monaco hover and the library context pane.

### Shader porting contract

The stock `Shader` library fills real GLSL gaps without pretending PXLBLZ is an
automatic shader translator. Pixelblaze already supplies `mix`, `smoothstep`,
and `clamp`; the library does not shadow them. `Shader.fract` remains distinct
from Pixelblaze `frac` because GLSL floors negative values while Pixelblaze
truncates them.

Hash helpers use integer arithmetic rather than the familiar
`fract(sin(...) * largeConstant)` idiom, which overflows 16.16. Power-of-two
demotion preserves preview/hardware agreement. Textures, multipass feedback,
derivatives, discard, multiple render targets, and automated GLSL rewriting are
outside this library contract.

## 6. Pass engine and generated artifacts

`bundleWithPasses(source, libraries, recipe)` applies an ordered,
JSON-serializable recipe to the flat artifact. An empty recipe is byte-compatible
with `bundle()` and produces an empty transform summary.

![Pattern artifact pipeline: authored source branches into Fast and Precise preview products, while explicit passes and provenance produce outbound Pixelblaze artifacts](../images/artifact-pipeline.svg)

Pass kinds:

- **Inject** prepends parameterized source and composes or creates
  `beforeRender`.
- **Intercept** rewrites AST-located, unshadowed output calls for supported
  `hsv`, `hsv24`, `rgb`, and `paint` arities.
- **Bind** calls a top-level function or assigns a variable from a normalized
  source with optional range mapping and quantization.
- **Renderer adapter** emits an exact map-dimensional renderer that forwards to
  an authored higher-dimensional renderer with missing coordinates set to
  `0.5`.

Generated identifiers use the reserved `__pxlblz_` prefix. User collisions and
unsupported call shapes become transform warnings. The summary records applied
passes, call-site counts, inserted globals/exports, `beforeRender` composition,
bindings, renderer adaptation, rough cost, and warnings. Generated source is
always inspectable and never presented as editable original source.

The interception boundary is intentionally honest. Arbitrary aliases, object
methods, dynamically selected sinks, shadowed built-ins, and palette-resolved
behavior hidden behind unsupported abstractions are not guessed.

### Artifact identity

Outbound source is stamped after all passes. The comment-only banner carries
version, kind, Studio id, name, CRC32 artifact hash, timestamp, and transform
ids. The hash excludes any existing PXLBLZ banner, so restamping is stable and a
source change is detectable.

Preview/evaluation uses unstamped source. Copy and Download return stamped
source. Save-mode PBP embeds stamped source. Run-only bytecode has no source
section and therefore no banner. `parsePxlblzBanner` and banner stripping are
the read-back seam.

New Controller program ids are 17 characters using the firmware alphabet and a
`pxb` prefix. The prefix identifies fresh ids minted by PXLBLZ without reading a
PBP; overwrite of a pre-existing binding preserves its older id, so the source
banner remains the durable provenance signal.

## 7. Validation, loading, and runtime shim

`validateSource` performs an Acorn syntax pass and an AST rule walk. It reports
all recognized Pixelblaze-language violations, including `let`, `const`, class,
`switch`, `new`, exceptions, and imports. It deliberately does not pretend to
statically prove every firmware semantic.

`loadPattern` removes `export`, appends an epilogue exposing render/control/var
handles, and evaluates with `new Function(...builtinNames, body)`. Built-ins are
injected as parameters; they do not pollute browser globals.

`createShim` supplies:

- color, waveform, interpolation, math, palette, clock, noise, and transform
  built-ins;
- map introspection from the resolved layout;
- Pixelblaze-like array behavior;
- captured color output per rendered pixel; and
- inert hardware/sensor globals so unsupported Patterns fail softly.

The float shim is the Fast reference behavior. Sensor Expansion Board inputs are
defined but inert.

## 8. Precise fixed-point preview

Precise mode re-emits bundled code for 16.16 arithmetic:

- raw values are signed int32 `round(value * 65536)`;
- add/subtract/comparison preserve int32 wrapping;
- multiplication uses limb decomposition to avoid float64 precision loss;
- division, modulo, fraction, bitwise, array indexing, increment, and decrement
  follow Pixelblaze-oriented semantics; and
- numeric built-in boundaries decode to float, execute, then quantize back.

`fxEmit.ts` rewrites operators and literals; `createFxShim` wraps the runtime
built-ins. Controls, render dispatch, and the var watcher use
`encodeScalar`/`decodeScalar`, so they remain mode-agnostic.

Precise mode is faithful to the numeric model, not a firmware clone.
Transcendental internals run in float64 before quantization. `perlin`, `prng`,
and related functions use documented alternate algorithms. Pure integer
arithmetic is the bit-identical target; accepted divergences are measured by the
hardware harness instead of hidden.

## 9. Render compatibility and frame loop

Pattern native dimension is the highest authored renderer and is metadata, not
a map filter. Render selection follows the firmware 3.66 preference order:

| Map dimension | Preference |
|---|---|
| Index / 1D | `render` → `render3D` → `render2D` |
| 2D | `render2D` → `render3D` → `render` |
| 3D | `render3D` → `render2D` → `render` |

Missing trailing coordinates are filled with `0.5`; extras are dropped.
`has2DMap`, `has3DMap`, and `pixelMapDimensions` report the selected map, not the
renderer or viewport dimension.

Each animation frame:

1. scale real delta by preview speed and advance the virtual clock;
2. call `beforeRender` once;
3. for each pixel, read map `sample`, adapt coordinates, apply the transform
   stack, call the selected renderer, and capture color;
4. paint the complete frame; and
5. publish FPS and decoded watched variables.

Runtime exceptions stop the loop and surface an error. `tickHeadless` executes
all stateful render work without retaining or painting an RGB frame; Show seek
replay uses it because render functions may mutate Pattern state.

## 10. WebGL, camera, and preview settings

`renderer.ts` draws all pixels as WebGL points. 2D uses an additive pass. 3D
uses an opaque depth-tested core pass plus an additive glow pass. Diffusion is a
per-source point-spread kernel, not a post-process frame blur. The renderer
degrades to a no-op when WebGL is unavailable, which keeps jsdom tests practical.

`camera.ts` owns pure projection and fitting. 2D layout bounds determine canvas
aspect. The 3D orbit camera uses orthographic projection, rotation-invariant
fitting, depth cue, and optional normal-based solidity. Renderer caps protect
against accidental pathological counts (`MAX_PIXEL_COUNT = 65,536`, grid axis
256).

Effective preview settings resolve field-by-field:

```text
per-Pattern override
  → built-in Pattern recommendation
  → user comfort baseline (light size/diffusion only)
  → developer default
```

Personal Pattern overrides live on `PatternRecord.settings`; built-in overrides
live in `demoOverrides`. Fork snapshots effective values. Reset clears the
active sparse override bag. Fast/Precise is a separate global machine setting.

---

# Part 3 — Maps and spatial presentation

Maps decide what coordinates each LED gives a Pattern; geometry decides where
the preview draws those LEDs. Keeping sampling and presentation separate lets
one wiring order support virtual 1D domains, 2D surfaces, and 3D structures
without inventing coordinates that would not exist on hardware.

## 11. Map source and persistence

A map is an index-ordered coordinate set; `pixelCount` is modeled separately.
Hardware may therefore have a count/map mismatch, and PXLBLZ preserves that
possibility rather than making the map authoritative for count.

Map source is ordinary JavaScript, not Pixelblaze dialect and not fixed-point.
Accepted forms are a literal coordinate array or a
`function(pixelCount)` returning one. Coordinates may be 1D, 2D, or 3D and may
start in arbitrary units.

Stock maps under `src/pixelblaze/stock/maps/sources/` are the exact source shown
to the user and evaluated by the app. Function stock maps regenerate for the
requested count. Literal measured maps retain their authored point count.

Personal source maps bake on the editor sync tick. Their resulting coordinate
array is stored on the `MapRecord`; later pixel-count changes replay that baked
array until source is baked again, mirroring stale Mapper output on hardware.
Controller imports are source-less frozen records with display provenance.

## 12. Sample, position, and geometry families

Each resolved map point carries two channels:

```ts
{
  sample: number[] // values passed to the Pattern renderer
  pos?: number[]   // preview position
}
```

![Resolved layout pipeline: map coordinates feed Pattern sampling while intrinsic geometry or an embedding independently places the same lights in WebGL](../images/layout-pipeline.svg)

Ordinary 1D maps provide only `sample`; Line, Ring, or Pole provides preview
position. Ordinary 2D maps may be displayed Flat or wrapped around a Cylinder.
3D maps own physical position directly.

Generated geometry families separate one physical point generator from several
ordinary, hardware-real coordinate views. `positionSource` owns shared physical
positions; each view source owns `sample`. Cylinder therefore exposes Strand,
Surface, and Spatial while pixels remain on one wall. Shell and volume remain
different physical distributions.

Catalogue type—Path, Surface, Shell, Volume, Custom/imported—is explicit
metadata, never inferred from a display name. Surface views are offered only
when the generator owns a meaningful parameterization. Imported point clouds do
not gain invented topology.

## 13. Normalization and resolved layout

The shared normalization pass supports:

- **Contain** — one longest-axis scale preserves aspect;
- **Fill** — each axis independently spans `0..1`.

`pos` stays aspect-preserving. Fill stretches only Pattern-visible `sample`.

`resolveLayout` is the pure selection-to-runtime seam. Given Pattern capability,
selected map/view/embedding, count, normalization, and injected map lookups, it
returns corrected selection, map dimension, `sample`/`pos` points, modeled count,
display dimension, readout label, and a 2D or 3D draw description.

`previewResolution.ts` derives the Preview's discrete quick-selection ladder
from explicit stock-map `gridRecipe` metadata. Square, Wide, and Cube use complete
natural lattices; regenerating geometry without a lattice uses a bounded generic
ladder; fixed baked maps offer no ladder. Exact entry remains independent and
unbounded by the 2,048 quick-selection ceiling. Off-ladder values use the shared
indeterminate slider treatment, and Cube reports the complete side-cubed lattice
that `resolveLayout` actually realizes. `PixelCountPopover` receives this feature
only from `PreviewDeck`; the live Controller panel retains its exact, explicitly
applied hardware editor.

`LayoutSelector` exposes separate controls:

- Map owns `sample`;
- a generated family's View selects a coordinate view; and
- Shape/Display owns preview embedding when the map does not carry intrinsic
  positions.

An internal Auto sentinel chooses an exact-dimensional default without becoming
a saved map. Index is the explicit no-installed-map 1D convention
`x = index / pixelCount`.

Solidity is enabled only when the app owns trustworthy normals. Generated
Cylinder and shell recipes provide them; a coincidentally sphere-shaped imported
cloud does not. Normals and solidity remain preview-only.

---

# Part 4 — Controller integration

Controller integration extends the browser IDE across a constrained network
boundary rather than turning PXLBLZ into a device-management service. A typed
provider and optional extension relay carry explicit Pattern, map, and live
control operations while profiles preserve durable intent about physical
hardware.

## 14. Provider and extension architecture

An HTTPS page cannot open `ws://<controller>:81`. `ControllerProvider` contains
that transport boundary. Components and stores import its typed capabilities,
not extension APIs or raw sockets.

`PixelblazeConnection` is the transport-agnostic protocol core over an injected
`WebSocketLike`. It handles documented JSON messages, binary program/control
frames, compilation/push operations, map access, saved-program reads, and the
hardware divergence harness.

`ExtensionControllerProvider` uses `RelayWebSocket` across:

```text
page → window messaging → content script → extension service worker
     → Controller WebSocket / HTTP endpoints
```

Binary payloads cross extension messaging as base64. Device compiler execution
uses an extension offscreen context. Keepalive, inbound-silence detection, and
bounded reconnect handle ordinary MV3 service-worker eviction and Controller
blips.

The extension requests optional HTTP/WS host permission per Controller IP. It
does not hold blanket LAN access. Discovery uses ElectroMage's HTTPS discovery
service from the extension because browser pages lack CORS access and MV3 has no
usable UDP discovery API.

## 15. Identity, connection state, and live panel

Connection state is keyed by IP so several Controllers may remain live, with one
active. Durable identity is the Pixelblaze device id derived from board type and
MAC, with discovery as fallback. IP and device name are mutable transport/display
facts. A connection without stable id is unclaimed but fully usable.

`controllerStore` owns connection phase, discovery, active selection,
reconnection, and push state. The last connected IP/nickname is persisted for a
warm reconnect. `controllerPanelStore` polls the active Controller for config,
telemetry, vars, controls, programs, map point count, and FPS. Same-Controller
reopen retains last-known panel values; switching Controllers clears ownership.

Live brightness and controls are volatile writes, throttled with leading and
trailing delivery. Pixel-count edits are saved and hold an optimistic pending
value until the Controller confirms. Reducing count goes through the shared
blackout helper: set brightness to zero, wait one full old-length frame, save the
smaller count, then restore brightness so tail LEDs do not freeze lit.

Firmware availability comes from the Controller's first-party update protocol,
cached in memory for one hour per stable identity. Only an available result
changes UI. Unknown, unsupported, timeout, and update-service failure do not
become connection errors. PXLBLZ links to the Controller web UI and never
installs firmware.

## 16. Controller profiles

A Controller profile is durable hardware intent for one physical Controller.
Profiles are created/refreshed from observed hardware, not blank forms, and are
keyed by device id. The store prevents concurrent duplicate creation and
suppresses same-session recreation after explicit deletion.

A profile contains:

- board and last-seen Controller facts;
- typed hardware inputs with board-safe pin validation;
- enabled global transforms;
- the opt-in managed-artifact reconciliation preference;
- per-Pattern bindings;
- named, possibly multi-range zones;
- map fingerprint records; and
- metadata used to join saved Controller programs to Studio source.

Profile edits update Zustand optimistically, serialize durable writes per
profile, roll back the latest failed write, and expose a drain barrier. Pattern
push waits for that barrier before deriving generated code.

### Hardware inputs and bindings

Input records describe pin, signal, semantic role, smoothing, fallback, and
invert. Pattern bindings target an exported slider, named function, or variable
with optional min/max/quantize. The pass recipe samples the input once per frame
and applies the target without editing original Pattern source.

### Power model

Hardware-brightness and power-cap transforms are output-interception recipes.
Hardware brightness samples a configured input once per frame. Power cap wraps
supported HSV/RGB calls, estimates emitted duty, and scales output against the
mutable exported `__px_powerLimit`.

Power telemetry separates three jobs:

- a roughly two-second recent block average for a calm display;
- a fixed-point-bounded since-start average; and
- a roughly 250 ms internal response signal for limiting.

The cap setpoint is normalized output duty. Electrical values are derivation
provenance, not measurement. The Controller panel estimates amps from emitted
duty after limiting, live native brightness, live pixel count, and stored
full-white mA/pixel. Native brightness remains the final device-side cap.

Reserved `__px_power*` exports render as structured power telemetry instead of
ordinary watched vars. The live limit slider writes `setVars` and is volatile;
the next push reinitializes it from the profile.

## 17. Pattern push, PBP storage, and saved programs

Before every Pattern push, the store:

1. waits for profile writes to drain;
2. compiles stock and personal libraries;
3. resolves the active Controller profile by device id;
4. derives transform/binding passes;
5. derives a renderer adapter from installed map dimension when needed;
6. checks firmware compatibility; and
7. invokes the Controller's compiler.

Run/Save dirty signatures include source, relevant profile configuration, and
installed map dimension. Descriptive profile changes do not re-arm generated
code; transforms and bindings do.

### Run

Run pushes transient bytecode under a fresh id and does not create a Saved
Patterns entry, overwrite binding, source banner, or push record. A local label
cache lets the panel name the running transient Pattern.

### Save

Save stamps generated source, encodes a normal PBP, writes the saved program,
then activates matching bytecode under the same id. The PBP contains the name,
optional JPEG, bytecode, and compressed `{"main": source}` section.

Overwrite bindings key `(Controller, Studio Pattern/demo)` to Controller program
id. Repeated saves reuse the id while it exists; a deleted device record causes
a new id to be minted. Bindings carry identity only, never control values.

A successful Save also writes a push record from the exact embedded banner:
artifact hash, transform ids, timestamp, name, and optional Show output contract.
This makes transform freshness and saved-Show output facts locally computable
without downloading every PBP.

### Inventory and recovery

The live Controller-profile context pane joins `listPrograms` with overwrite
bindings, push records, personal Patterns, and built-ins. Bound entries link to
Studio; foreign entries remain visible. Transform sets compare order-independently
as current, stale, or unmanaged. A saved Show row also reports Installation versus
Portable plus fixed count/map or variable-resolution class from its push record.

`readSavedProgram` fetches `/p/<id>`, decodes PBP, retains the device-stored name,
separates PXLBLZ provenance from stripped source, and permits source-less records.
Import then chooses one of four outcomes:

- open an existing stamped Studio Pattern/demo;
- restore a deleted stamped Pattern with its original id;
- create a new personal Pattern from foreign source; or
- explain that source recovery is unavailable.

Import never mutates the Controller program.

### Managed-artifact reconciliation

The Controller profile can opt into keeping its PXLBLZ-managed saved artifacts
current. A program is eligible only when the installed program id has both an
overwrite binding and a successful push record, and its Pattern, demo, or Show
source remains regenerable. Every other program is unmanaged. The planner keeps
foreign, unproven, source-less, and Controller-deleted programs outside the
write set; background work never creates, renames, or deletes a program.

Code-affecting profile edits schedule reconciliation after the serialized
profile write completes. Descriptive edits do not. The planner compares each
eligible push record with a per-artifact signature covering global transforms,
referenced inputs and bindings, and the installed map dimension. Ordinary
Pattern source edits remain on explicit Run/Save.

Reconciliation processes stale artifacts serially through the same per-
Controller device-write queue as explicit pushes. It saves over the existing id
without activating each intermediate Pattern. The active managed program is
updated last and reactivated under the same id. Independent failures do not stop
the batch. A newer profile edit or disabling the setting stops additional jobs
after the current device write reaches its boundary; reconnect schedules a new
plan from current Controller and profile state.

The inventory exposes current, queued, updating, and failed row state, aggregate
progress only while work is active, and one retry action. The Controller pill
keeps active or failed work discoverable outside the profile route.

## 18. Map push, read-back, and fingerprints

Pixelblaze has one shared map slot. Map send is confirm-first and uses the
provider's HTTP/binary capabilities.

The encoded map is a 12-byte little-endian header followed by quantized
coordinates. PXLBLZ encodes its already normalized points directly; it does not
silently apply another per-axis Fill normalization.

Map transfer rules:

- point count must exactly equal the Controller's configured pixel count;
- function maps are re-baked at that count before send;
- a fixed literal that cannot conform requires changing Controller count;
- true 1D maps require compatible firmware when the version is known; and
- map read-back is HTTP `/pixelmap.dat`, not a WebSocket message.

The format has no metadata field. Provenance is therefore a hash of exact
encoded bytes. Successful send stores `{hash, mapId, mapName, devicePixelCount,
pushedAt}`. Import first checks recorded fingerprints, then bakes and hashes
current stock/personal candidates at the read count. A match opens existing
source; a miss becomes a frozen imported map.

---

# Part 5 — Shows

A Show is authored as timeline choreography but shipped as one ordinary,
self-contained Pixelblaze Pattern. Its model preserves human intent—scenes, zones,
boundaries, routing, and automation—while the compiler flattens that intent into
a scheduler and isolated Pattern members the Controller can run by itself.

## 19. Show domain model and persistence

A Show is saved choreography over scenes, zones, clips, boundaries, and routing
layouts under one immutable output-contract kind. New records carry a versioned
`installation` or `portable-2d` discriminated object. Installation stores an
exact pixel count and output map; Portable 2D stores a reference count/map plus
its variable-resolution 2D compatibility declaration. `showModel.ts` owns
creation, normalization, projection, split, growth/removal, range parsing, and
mutation. `showStore` persists normalized records through `/api/shows`.

![Show model and runtime: scenes and zones meet in clips, boundary entities own cross-scene behavior, and the compiler flattens the saved model into one scheduled Pixelblaze Pattern](../images/show-model-runtime.svg)

Core ownership rules:

- a scene owns name, hold duration, and Show-wide property targets, including
  moving-split position and sample repeat scale;
- a zone owns semantic identity and nominal preview count;
- a clip owns Pattern reference, scene/zone span, adaptations, control targets,
  an ordered Effect stack, and Continue/Restart entry behavior;
- a transition is a stable boundary entity with kind, duration, easing, and
  type-specific configuration;
- a destination clip owns clip-level property targets, a destination scene owns
  Show-wide property targets, and the incoming boundary owns each interpolation's
  explicit start, duration, and easing;
- routing layouts own either Installation `zoneId → ranges` or Portable logical
  geometry; boundary routing transitions choose the destination layout plus
  optional transfer duration, easing, and direction; and
- the Show owns target Controller profile, output contract, and the Stage map
  derived from that contract.

`showInstallationCoverage.ts` validates each Installation routing layout against
the contract's master pixel count. Physical layouts must assign every index in
`0..pixelCount - 1` exactly once; missing, overlapping, and out-of-range indexes
are distinct diagnostics. Logical layouts instead project their semantic zones
across the complete output. A new Installation starts with one full-output
physical range, so creation produces a valid model before later zone edits.

`showPortableCompatibility.ts` enforces the complementary contract boundary.
Every Portable routing layout must carry logical geometry; physical ranges,
non-2D reference maps, missing logical zones, malformed grids, and member
Patterns without `render2D` or `render` are artifact-blocking diagnostics. A
1D `render` member remains compatible through an explicit normalized-local-index
adaptation and is reported as an advisory. `render3D`-only members remain
previewable for repair but cannot leave the editor as Portable output.

`ShowCreationFlow` keeps contract comparison and setup provisional. Opening the
flow stores only the previous Show id in `showStore`; the first durable write is
the final Create Show action. Cancel or workspace Escape clears the provisional
state and restores that id. Inputs and native menus retain their own first
Escape so an edit or open control closes before the enclosing flow.

The D1 record stores the contract as `output_contract_json`. Row loading accepts
only the known version and discriminants, then reconstructs canonical
compatibility literals rather than trusting display copy.

`showLegacyClassification.ts` is the pure compatibility boundary for rows
without a contract. A known version returns its stored discriminant directly.
For a legacy row, an explicit target Controller or at least one non-empty
physical index range proves Installation; the classifier derives its fixed count
from the saved zone model and retains the saved Stage map. Stage dimension,
logical routing, and the absence of ranges are deliberately non-evidence, so no
legacy combination silently becomes Portable.

`showStore.openShow()` persists a proven contract as a narrow contract/Stage
patch. An ambiguous row instead creates provisional classification state with
the previous Show id, modeled count, and inspectable reasons. Confirmation
persists exactly one contract while retaining scenes, clips, transitions,
routing, and Pattern state. Cancel clears the provisional state without a write
and restores the previous Shows context. A successful write makes every later
open follow the ordinary versioned path.

Legacy scene-owned transitions and routing switches normalize into the boundary
model before compiler, editor, EPE, or persistence consumption. Every boundary
retains one explicit visual transition, with zero-duration cut as the neutral
form. Visual and routing entities may coexist.

Easing also normalizes at this boundary. Persisted transitions and property
descriptors use one structured curve representation shared by visual
Transitions, Pattern/property animations, routing/sample animations, and
animated Effect parameters. Linear has only its curve name. Quadratic, cubic,
sine, and Back carry `in`, `out`, or `in-out` direction; Back also carries a
nonnegative Overshoot. Cubic Bezier carries CSS control points `x1`, `y1`,
`x2`, and `y2`. Steps carries an integer count and start/end jump position.
Hold carries its normalized switch point.

The legacy `linear`, `ease-in`, `ease-out`, and `ease-in-out` strings remain
accepted inputs and map to the exact prior linear or quadratic behavior. Valid
custom structures survive JSON reload and repeated normalization unchanged. A
second normalization pass is therefore idempotent without making old Shows
timing-incompatible. Invalid structures normalize safely to Linear, while the
headless validator returns field-addressed `not-finite`, `not-integer`,
`out-of-range`, or `invalid-option` issues for a later editor to present.

The persisted record still uses the `cells` field and `ShowCell` type for
compatibility with existing saved Shows. Product language and editor behavior
call these entities clips.

A clip occupies a rectangular scene-by-zone footprint. `showCellAtSlot()` is
the shared occupancy query for direct cells and slots covered by either span.
Placement succeeds only in an empty slot. Growing a hold or zone span removes
every intersecting clip across both axes; scene and zone removal shrink or
re-anchor surviving spans so the record cannot retain overlapping or out-of-range
geometry.

Split is an atomic pure-model operation. It rejects transition windows and
sub-one-second fragments, creates one boundary across zones, divides covering
clips, deep-copies value objects, moves the original outgoing boundary to the
new right scene, and defaults destination clips to Continue.

`showSpatialSelection.ts` owns Installation spatial authoring as pure data
operations. A normalized 2D drag rectangle returns enclosed map-point indexes;
replace/add/subtract combine immutable index sets; sorted indexes compact into
minimal inclusive runs. `updateShowPhysicalZoneSelection()` replaces only one
physical `layoutId + zoneId` range entry and preserves the semantic zone record
and all choreography. The draft record passes through
`validateInstallationCoverage()`, so assigned, missing, overlap, out-of-range,
and total facts use the same authority as artifact gating.

`ShowZoneSpatialSelector` resolves the saved Installation output map at the
contract pixel count and renders its normalized points in the center pane. The
right Stage remains mounted as read-only preview context. The selector is
available only for an exact-count 2D map; Portable, 3D, missing, and fixed-count
mismatch cases never enter screen-space editing. Pointer drags preview indexes
and coverage before an explicit Save; Escape cancels without persistence.

## 20. Timeline editor and Stage preview

`ShowEditor` renders one proportional grid for scene headers, ruler, transition
lane, zone rows, clips, property lanes, and playhead. A moving-split layout adds
one Show-wide Split lane whose colored cells depict the authored ownership
boundary. `showTimelineViewport.ts`
owns Fit-to-16x zoom, playhead-anchored zoom, pan, navigator thumb geometry, and
range resizing. It also owns magnetic playhead snapping: structural Show
boundaries take priority over a zoom-aware nice-number time grid. Snap is local
editor state, defaults on, and Alt temporarily inverts it. Zoom and Snap never
change the saved Show.

Selection is UI-local and opens one contextual inspector for Show setup, clip,
empty slot, transition, or zone. An empty slot presents the same personal and
built-in Pattern catalogue used by clip source replacement, then delegates
placement and persistence through `showStore`. Other model mutations follow the
same route; the React surface does not reproduce occupancy,
split/transition/routing rules.

The Show timeline owns a local focus-return seam. Focus capture remembers the
last focusable selected timeline entity, while the timeline region is the
fallback workspace target. A change-capture handler on the contextual inspector
recognizes committed native `select` choices and schedules focus restoration
after React applies the saved update. It does not blur controls globally;
checkboxes, text-like editors, ranges, buttons, and navigator handles retain
their native keyboard ownership.

While `ShowTransportControls` is mounted, its document handler accepts Space,
Left/Right, and Home only when the Show workspace or a marked timeline entity
owns focus. Interactive controls consume those keys first. Relative and zero
commands clamp through `showTransportStore`, create ordinary deterministic seek
requests, and pause/resume around reconstruction so the previous playback state
is preserved. Unmount removes the handler, preventing shortcuts from leaking
into other Studio modes.

`showTransportStore` holds ephemeral play/pause-adjacent timeline state:
duration, position, rebuilding status, and monotonic seek identity. The global
preview run state remains the transport source of truth.

`ShowStagePreview` compiles the same generated float source used elsewhere, but
does not apply the artifact-action coverage gate: an invalid Installation stays
visible and repairable. Generated inspection, export, Run, and Save use
`compileShowForArtifact`, which rejects invalid physical coverage with the same
actionable diagnostic shown in Show properties.
Generic strips build synthetic sequential map points and diagnostic zone rows.
A selected 2D/3D Stage resolves the real map. Installation preview uses the
contract's saved pixel count and physical ranges even when a connected Controller
reports different setup; unclassified records may still project Controller
ranges. The Stage masks uncovered pixels grey, reports saved map/count/coverage,
warns for off-stage zones, and preserves solo geometry by blacking non-solo zones.

Portable preview takes its pixel count from the saved reference configuration,
never from a connected Controller. `buildShowLogicalStageProjection()` evaluates
the active logical predicate against resolved map coordinates for zone counts,
masking, and solo. `showLogicalAspectAdvisory()` reports when aspect-preserving
coordinates compress an axis used by stripes, grids, splits, or pinwheel routing.

## 21. Show compiler

`showCompiler.ts` turns a normalized Show recipe into one flat Pixelblaze
Pattern. Member sources are alpha-renamed and isolated. Compatible continued
clips reuse a member; Restart adds clip identity and a fresh time base. Repeated
appearances later in a sequence reuse compatible state rather than compiling a
new member per visual block.

An Installation recipe carries the contract pixel count as `masterPixelCount`.
Routing, coordinate normalization, transitions, deterministic seek, preview, and
artifact generation therefore share one output extent instead of inferring it
from the largest authored range or a connected Controller.

A one-zone Installation with no routing switch keeps the ordinary full scene
sequence and transition scheduler. Its sole physical zone already covers the
entire validated output, so the recipe adds the exact master count and saved
zone range without switching to the multi-zone first-scene routing path. This
preserves legacy playback when a proven one-zone Show gains its contract.

A Portable recipe carries no master count. Once a Show has multiple zones or
logical layout switching, `showRecordToCompileRecipe()` emits the existing
coordinate-predicate routing representation. `emitLogicalRoutingSetup()` derives
zone id and local X/Y from runtime coordinates for single-surface, stripe, grid,
split, and pinwheel layouts. Generated member counts use runtime `pixelCount`;
the reference preview count is absent from routing ownership.

Each member has private elapsed time and adaptation state. The outer scheduler
advances members according to holds and transition windows, then routes each
physical pixel through the active domain. Zone-local index and virtual
`pixelCount` are computed from ordered multi-range zones. Span mode merges zones
into one domain; Repeat mode reuses one member over separately normalized
domains and advances `beforeRender` once.

The summary separates code size, render policy, transition cost, clock policy,
evaluation policy, temporal policy, time-offset policy, routing representation,
routing-parameter pressure, expected active fraction, and warnings. It also
emits machine-readable cost metadata on five independent axes: Pattern
evaluations, generated scalar/array memory, artifact bytes against the measured
budget, output coverage, and compatibility warnings. Pattern evaluations use
literal formulas: ordinary selector and parameter work is `N`, bounded feather
blending is `N + E`, and full crossfade is `2N`. Here `N` is the output pixel
count and `E` is the measured feather-edge pixel count; the compiler does not
invent an `E` estimate when one is unavailable. Renderer count and clock
behavior remain separate: exact pause is not described as a cached frame or
renderer saving.

## 22. Transition and adaptation policies

Current compiler policies:

| Policy | Runtime cost shape |
|---|---|
| Cut / Restart | One active member; optional fresh state |
| Parameter ramp | One continued member, values updated once per frame |
| Crossfade | Two member renderers during the transition window |
| Fade through color | One outgoing renderer before the midpoint, one incoming renderer after it |
| Hard or stable-dither Wipe | Both clocks may advance; one renderer selected per pixel |
| True feather-blend Wipe | Two renderers only inside the projected edge band |
| 2D circle/box/diamond/ring hard or dither | One renderer per pixel from the Stage-space SDF boundary |
| 2D circle/box/diamond/ring true blend | Two renderers only inside the feather band |
| Routing-layout cut | Immediate destination layout selection |
| Routing-layout directional transfer | Both clocks advance; one adjacent layout and renderer selected per pixel |

Easing is deterministic arithmetic shared by preview helpers and generated
code. The standard set is Linear; Quadratic, Cubic, and Sine in/out/in-out;
CSS-compatible Cubic Bezier; Steps start/end; Hold; and Back in/out/in-out.
Named Bezier presets include CSS ease, ease-in, ease-out, and ease-in-out.
Legacy ease names retain their quadratic definitions.

Cubic Bezier accepts CSS-compatible Y overshoot but requires both X control
points in `[0, 1]` so X remains invertible. The pure evaluator finds the curve
parameter by bounded binary inversion, then samples Y. Generated Shows inject
one fixed-iteration solver only when a Bezier curve is present. The solver is
called from `beforeRender` or the member advance path, so its work occurs once
per frame for Transition progress and property/Effect parameters, never once
per pixel. Steps uses an integer `1..64`; Hold switches at `0..1`; Back accepts
Overshoot `0..10`. Input progress clamps to `[0, 1]`, while Bezier Y and Back
may intentionally produce controlled output overshoot.

The UI-neutral easing descriptors publish stable ids, labels, defaults,
parameter constraints, and samples at progress `0`, `0.25`, `0.5`, `0.75`, and
`1`. The compiled cost record already reports exact artifact bytes and budget
ratio; because the Bezier helper is conditionally emitted, its code-size impact
is visible by comparing those factual fields with a non-Bezier build.

`showVisualToolkit.ts` is the framework-independent catalogue for property
animations, effects, and transitions. Families own stable ids and cost policy;
variants own parameter descriptors and conditional parameters; presets are
named parameter bundles rather than separate runtime implementations. The
registry describes the complete headless property-animation, output, affine,
distortion, blend, Fade, Wipe, Dissolve, shape-reveal, and motion catalogue.
Validation rejects duplicate ids, missing parameter references, and presets that
do not resolve through their variant's public parameter contract. React may
project this catalogue, but engine code does not import the UI framework.

`showVisualToolkitFixtures.ts` provides deterministic headless evidence for
every registered Property animation, Effect, and Transition variant that the
compiler lowers. Each fixture uses fixed Patterns, progress samples at `0`,
`0.25`, `0.5`, `0.75`, and `1`, and generated minimum/default/maximum or enum
parameter sweeps. The fixture harness compiles artifacts; it is not a temporary
editor and does not establish production UI.

`showVisualToolkitFreeze.ts` joins the registry to that evidence without UI
imports. Contract version 1 has fingerprint `f81bca37`, 59 registered variants,
and 104 fixtures. The freeze test rejects an uncovered or unknown variant,
duplicate fixture, registry validation error, or unacknowledged descriptor
change. An intentional catalogue change increments the version and refreshes
the fingerprint plus `docs/plans/issue-459-headless-freeze.md`. The fingerprint
seals the registry, variant-to-fixture mapping, compile recipes, persisted
record behavior, progress samples, capture geometry, stage dimensions, and
capture start times; changing any of those inputs changes the fingerprint.
The volatile Show `updatedAt` storage timestamp is intentionally excluded.

The frozen matrix uses 256-point 2D captures. One hundred fixtures compile to
`N`, two to `N + E`, and two to `2N`; none use `S * N`. The largest generated
artifact is 10,004 of the measured 68,384-byte budget, the largest generated
scalar allocation is 16, and the matrix uses no generated array elements. The
automated matrix emits no compatibility warnings under each fixture's declared
dimension. A 2026-07-14 external run on a firmware-3.67 `pb32` with a 256-point
2D map completed all 104 frozen fixtures plus ten SDF edge-policy probes. Every
Pattern compiled, became active, and returned telemetry; the frozen matrix
measured 29.47-80.49 mean FPS. The deterministic CI result keeps hardware FPS
`null` because hardware measurements remain dated external evidence rather than
an inferred field.

Fade through color is a boundary-owned two-phase Transition. The persisted
`#RRGGBB` color is an ordinary editable parameter; Black, White, and Custom are
presets that write that same field. Shared easing first transforms the complete
transition progress. During the first half, the compiler evaluates only the
outgoing Pattern and blends its captured RGB toward the selected color. At the
exact midpoint the output is the selected color. During the second half, it
evaluates only the incoming Pattern and blends from the color toward that
Pattern. Both the two-scene and scene-sequence lowering paths therefore report
`N`, not Crossfade's `2N`, while deterministic fixtures cover start, quarter,
midpoint, three-quarter, and end frames for black, white, and custom colors.

A new directional Wipe stores one ordinary `direction` parameter in turns:
east is `0`, south is `0.25`, west is `0.5`, and north is `0.75`. Diagonal
names are presets at eighth-turn increments; arbitrary angles use the same
field and persisted Transition kind. For direction vector `(dx, dy)`, the Stage
position is projected and normalized across the unit square as
`(x*dx + y*dy - minDot) / (abs(dx) + abs(dy))`. The incoming side advances
where that value falls below eased progress. This equation is shared by pure
preview helpers and generated code.

Legacy Wipes have no `direction`. They retain their index-domain west-to-east
equation, including the old rule that a positive feather with no explicit edge
policy means stable dither. A saved direction requires a 2D Stage Map; Show
lowering reports that requirement directly instead of silently changing the
angle on a 1D installation.

New Wipe records may select one catalogue variant while retaining the same
persisted `wipe` Transition kind. Linear uses the directional projection above.
Split maps distance from the selected horizontal or vertical center line to
`0..1`; Center out uses that distance directly and Center in reverses it. Barn
Doors uses the maximum normalized X/Y distance from an editable center, which
opens or closes a rectangular aperture.

Blinds applies `frac(axis * count + phase)` to horizontal or vertical bands.
Clock maps `atan2(y-centerY, x-centerX)` into one turn, then applies phase and
clockwise/counter-clockwise direction. Checker alternates cell parity and local
cell progress. Grid uses the maximum local distance from each cell center, so
all cells expand together. Count is an integer from `1..32`. Variant
normalization removes parameters that have no meaning for the selected mask;
the UI-neutral registry exposes Direction only for Linear, Mode only for Split
and Barn Doors, Orientation only for Split and Blinds, Center only for Barn
Doors and Clock, and Count only for Blinds, Checker, and Grid.

Every catalogue mask produces the same normalized position scalar consumed by
the existing Wipe edge evaluator. Pure preview helpers and generated
Pixelblaze expressions implement the same equations. Non-linear variants
require a 2D Stage Map. Deterministic fixtures cover both Split modes, Barn
Doors, both Blinds orientations, Clock, Checker, and Grid.

The shared edge contract has Hard, Stable dither, and Blend policies. Hard and
dither select exactly one Pattern for each output pixel and report `N`. Blend
still selects one Pattern outside the projected feather band, evaluates both
inside it, and reports `N + E`. Deterministic fixtures cover all eight named
directions plus an arbitrary angle under dither and true blend.

Dissolve remains the persisted `dither` Transition kind for compatibility. A
record with no new Dissolve fields is the Pixel variant and emits the exact
legacy expression `hash(index) < progress`; existing Shows and generated
artifacts therefore retain their appearance. New Pixel records may add a
16-bit integer seed while keeping one hash cell per output index.

Block Dissolve groups adjacent output indices with
`floor(index / blockSize)`, where Block size is an integer count of output
pixels from `1..1024`. The stable cell id plus the normalized 16-bit seed feeds
the same deterministic fractional hash used by Pixel Dissolve. Every member of
a block therefore makes the same source choice across frames, reloads, and
deterministic seeks. Pixel and Block share duration, easing, seed, and the
Stable dither edge-policy descriptor; Block alone exposes Block size. Both
variants select exactly one Pattern per output pixel and report `N`.

Headless fixtures preserve the field-absent legacy Pixel form and add seeded
Pixel plus 8- and 32-pixel Block captures. The fixture harness recompiles and
replays them at fixed progress points to verify stable output and JSON
round-trip behavior.

Coherent Noise Dissolve evaluates a stable 2D value-noise field. Stage
coordinates are multiplied by Spatial scale (`1..32`), four surrounding lattice
points are hashed with the normalized 16-bit seed, and smooth cubic interpolation
combines them. The field has no time input: seek, replay, reload, preview, and
generated output therefore see the same spatial structure. Coherent Noise uses
a hard field threshold and evaluates one Pattern per output pixel (`N`). It
requires a 2D Stage Map.

Soft Threshold uses the same coherent field and adds Softness (`0..1`) through
the shared edge contract. Hard compares the field directly with eased progress.
Stable dither converts the active softness band to one deterministic source
choice and remains `N`. Blend evaluates one source outside the band and both
inside it, so cost is `N + E`; at Softness `1`, the active band may cover the
full Stage and `E` may equal `N`. The UI-neutral descriptor restricts Pixel and
Block to Stable dither, Coherent Noise to Hard, and Soft Threshold to
Hard/Stable dither/Blend. Deterministic fixtures cover two spatial scales and
both dithered and blended soft edges.

Shape reveal stores explicit `grow-incoming` and `shrink-outgoing` reveal modes
for new records. Grow Incoming expands the incoming side from the selected
center. Shrink Outgoing keeps the incoming Pattern behind a contracting
outgoing mask. Legacy Portal records retain field-absent mode and continue to
derive the exact same behavior from `invert=false` and `invert=true`,
respectively; equivalent explicit modes generate byte-identical artifacts.

Circle uses Euclidean distance. Diamond uses rotated Manhattan distance. Box
uses a rotated rectangular distance
`max(abs(rx)/sqrt(aspect), abs(ry)*sqrt(aspect))`, with aspect clamped to
`0.25..4`. Scale changes the SDF radius, rotation changes the mask axes, and
center changes the mask origin. None of these parameters remap Pattern sample
coordinates. **Shape Shrink** therefore reveals the incoming Pattern through a
contracting mask, while **Content Shrink** is a coordinate Effect that resizes
the rendered Pattern itself.

New shape records use the shared Hard, Stable dither, or Blend edge policy.
Field-absent records continue to read the legacy Portal feather policy. Hard
and dither report `N`; Blend evaluates both Patterns only inside the SDF edge
band and reports `N + E`. Deterministic fixtures cover both reveal modes for
Circle and rotated/aspect-scaled Box while retaining the legacy Circle,
Diamond, and Ring fixtures.

The expanded catalogue adds Ellipse, Rounded box, Cross, Heart, Star,
Crescent, Regular polygon, Cat head, Side-profile cat, and Bastet. Regular
polygon clamps Sides to `3..8`; Star uses `3..12` points and Inner radius
`0.2..0.8`. Rounded box blends the box and elliptical norms through Corner
roundness. Cross takes the union of horizontal and vertical rectangular norms.
Crescent subtracts an offset inner circle from an aspect-scaled outer ellipse,
so its cutout is a real hole rather than a concave outline approximation.

The remaining silhouettes use cheap homogeneous polar metrics. Heart varies
its radial boundary with first- and second-order sine/cosine terms. Star and
regular polygons use repeated angular sectors. The three signature cats use
distinct low-order angular bumps: paired ears around a head, asymmetric
head/tail/leg lobes for the side profile, and a narrow seated body with paired
ears for Bastet. These candidates deliberately trade anatomical detail for
low-resolution readability and generated-math cost. Their engine contract is
shipped. The 2026-07-14 visual review approved the common catalogue and Cat
head; Side-profile cat and Bastet remain provisional pending stronger
high-resolution silhouettes. Both nevertheless compiled and ran successfully
in the representative physical-Controller matrix.

All catalogue shapes share center, scale, reveal mode, feather, edge policy,
and easing. Aspect and rotation appear only on shapes whose metric uses them;
Corner roundness, Arm width, Star points/inner radius, Crescent cutout offset,
Polygon sides, and Ring width are shape-specific. Both Grow Incoming and Shrink
Outgoing use the same metric with opposite polarity. Hard/dither remain `N`;
Blend remains `N + E`.

Twenty-four representative Heart/Star/Crescent/Polygon/cat fixtures compile to
8,246-8,680 bytes. The largest candidate is 12.693% of the measured 68,384-byte
device budget. On the representative 256-point 2D Controller, the required
Bastet, Side-profile cat, Star, Crescent, and eight-sided Polygon probes measured
50.16-54.39 FPS across Hard and Blend policies. The complete table and the
provisional signature-shape disposition live in the focused #452 review plan.

Motion is a separate Transition family because it remaps Pattern coordinates
rather than changing a coverage shape. Cover moves the incoming content across
a stationary outgoing source. Reveal moves the outgoing content away from a
stationary incoming source. Push moves both sources in the same direction, with
the incoming source one projected Stage span behind the outgoing source.
Content Grow scales the incoming coordinates from Minimum scale to `1`; Content
Shrink scales the outgoing coordinates from `1` to Minimum scale. The latter is
therefore visibly and structurally distinct from Shape Shrink.

Motion stores direction in turns and uses the same inverse-affine sampling
contract as clip Effects. A direction vector is multiplied by the unit-square
projection span `abs(dx) + abs(dy)`, which places the moving rectangle fully
outside the Stage at its endpoint for cardinal and arbitrary directions.
Content scaling uses the authored Anchor X/Y as its fixed point. Clip addressing
clamps transformed sample coordinates; Wrap addressing applies `frac` after the
same inverse transform. Motion requires a 2D Stage Map, and both direct
two-scene and scene-sequence compilation use the same coordinate equations.

Zoom In transforms the incoming source from Endpoint scale to full size; Zoom
Out transforms the outgoing source from full size to Endpoint scale. Both keep
Anchor X/Y fixed. Rotation is an ordinary nonnegative turn count paired with a
clockwise or counterclockwise direction, so Spin is a preset rather than a
separate compiler primitive. The Zoom, Spin clockwise/counterclockwise, and
combined Zoom + Spin presets write only endpoint scale, rotation, rotation
direction, and anchor values. Authors can edit every value after choosing a
preset, and persisted Shows contain no preset enum.

The compiler evaluates scale, sine, and cosine inside the shared motion block,
then applies one inverse uniform-scale/rotation transform around the authored
anchor. Zoom In/Out therefore use the same pure affine equations in direct
boundaries, scene sequences, deterministic fixtures, and generated Pixelblaze
code. Clip addressing preserves transformed coverage and clears an
out-of-bounds source to the black Show background during full blend. Wrap
addresses the same transformed coordinates with `frac` and treats every sample
as covered. Motion exposes hard selector (`N`) and full blend (`2N`) only;
bounded feather is not offered because these transforms do not define a narrow
spatial transition seam.

Hard composition uses transformed coverage to select exactly one Pattern per
output pixel and reports `N`. Full blend evaluates the outgoing and incoming
sources with their respective transforms across the transition window, mixes
them by eased progress, and reports `2N`. Cost metadata also reports the active
Clip/Wrap address policy and affine scalar work. Deterministic fixtures cover
Cover, Reveal, Push, Content Grow, Content Shrink, Zoom In/Out, clockwise and
counterclockwise Spin, and combined Zoom + Spin; compiler tests cover
boundary, midpoint, anchored scaling, transformed sampling, and both renderer
policies.

Property transitions share one descriptor model. Animation speed (`0×..4×`), brightness
(`0..1`), and exported slider controls carry destination targets on clips. Moving
split position (`0..1`) and sample repeat scale (`1..8`) carry their targets on
the destination scene. Every form
uses boundary-owned starts, durations, and easing. Generated control values call the
alpha-renamed slider once before member `beforeRender`. Missing, renamed, or
non-slider controls are compile errors rather than dropped automation. Replacing
a Clip's Pattern clears that Clip's prior control targets at the model boundary.

### Show Effects

An Effect is a clip-owned single-source operation. The persisted stack contains
stable Effect ids and preserves authored order. Opacity, brightness, hue,
saturation, contrast, invert, threshold, posterize, color map, translate,
rotate, scale, and shear expose numeric targets through the same boundary-owned
Property descriptor used by Animation speed. Wrap has no curve; it is an
address policy applied after the complete affine transform. Add, update, move,
remove, JSON reload, and normalization remain pure `showModel.ts` operations.

The stack has two explicit evaluation stages because coordinate operations must
run before the Pattern renderer and output operations must run after it.
Translate, rotate, scale, and shear compose in their relative authored order;
Wrap applies once after that matrix. The renderer captures raw RGB. Legacy Clip
brightness then runs as the implicit first output operation, followed by
Opacity and color/output Effects in their relative authored order. The Clip
border mask runs last so an out-of-bounds coordinate remains the black Show
background even when Invert or Color map is active. Interleaving a coordinate
Effect and an output Effect in the persisted list does not move either across
the renderer boundary.

Legacy `adaptations.brightness` records and their Property animations retain
their schema compatibility view, but RGB and HSV capture no longer evaluate
brightness. Both legacy brightness and the explicit Brightness Effect use the
single post-capture output evaluator. Existing output is unchanged, and there
is no second brightness path.

The common output catalogue uses these normalized parameters:

- Brightness multiplies RGB by `0..2`; `1` is neutral.
- Hue rotates RGB around the neutral-gray axis in turns; `0` is neutral.
- Saturation blends each channel around Rec. 709 luma; `1` is neutral.
- Contrast scales each channel around `0.5`; `1` is neutral.
- Invert blends toward `1 - channel`; Amount `0` is neutral.
- Threshold blends toward a black/white Rec. 709 luma comparison; Amount `0`
  is neutral.
- Posterize rounds each channel to `2..32` levels; Amount `0` is neutral.
- Color map remaps Rec. 709 luma between authored shadow and highlight RGB
  endpoints; Amount `0` is neutral.

Every neutral static output Effect is eliminated with no generated-code change.
Non-neutral operations clamp only where their definition requires it, and
preview uses the same formulas and authored order as generated Pixelblaze code.

The approved distortion catalogue contains Ripple, Swirl, Bulge / Pinch,
Pixelate, and Kaleidoscope. Each operation remaps the normalized source
coordinate and then evaluates the Pattern once. Amount `0` is exact identity,
so a neutral static distortion emits no runtime and every Amount can use the
shared Effect Property animation path.

- Ripple displaces the coordinate radially with a sine wave over Radius,
  Frequency, and Phase.
- Swirl rotates the coordinate with a squared falloff inside Radius.
- Bulge / Pinch divides the centered coordinate by a bounded radial scale.
  Positive Amount is Bulge and negative Amount is Pinch; the minimum scale is
  `0.05`, so the center remains finite.
- Pixelate blends toward the center of a bounded Columns by Rows coordinate
  cell. Columns and Rows normalize to integers from `1..128`.
- Kaleidoscope folds the polar angle into `2..16` mirrored Segments, applies
  Rotation, and blends toward the folded coordinate.

The registry labels Pixelate **Cheap**. Ripple, Swirl, Bulge / Pinch, and
Kaleidoscope are **Smooth** because they use radial or polar math. Stretch does
not enter the production registry because Scale and Shear already cover it.
Glitch remains outside the persisted schema and registry pending a stronger,
animation-stable visual policy. The candidate, compiler, and hardware
measurements live in `docs/plans/issue-456-distortion-review.md`; human review
approved the selected set on 2026-07-14. The representative 256-point 2D
Controller measured 35.03-42.05 FPS for the individual selected distortions and
31.37 FPS for the animated Ripple plus Pixelate composition.

Affine order describes content motion. The compiler composes forward content
matrices in list order around normalized center `(0.5, 0.5)`, then inverts the
result because the renderer maps each output sample back into the source
Pattern. Static matrices fold at compile time; animated matrices recompute once
per frame. This produces the literal runtime order:

1. Stage Map sample and zone-local normalization;
2. Show-wide sample remapping;
3. mirror adaptation;
4. the inverse composed affine Effect matrix;
5. ordered distortion coordinate remaps;
6. post-transform Clip or Wrap addressing;
7. one member renderer call;
8. legacy brightness and ordered output Effects; and
9. clip-border masking toward the black Show background.

Clip addressing clamps the source coordinate for a deterministic renderer call,
then masks samples outside `[0, 1]` to black. Wrap instead uses
`value - floor(value)` on both axes, including negative coordinates, and removes
that border mask. Both policies therefore retain one Pattern evaluation per
output pixel. An absent stack, or a stack containing only identity values,
emits exactly the pre-Effect artifact.

The compiled cost contract reports `N` Pattern evaluations for the single-source
path plus independent Effect facts: affine operations and animated parameters
updated per frame, eight scalar affine operations per evaluated pixel, active
output-Effect count, color scalar operations, floor calls, trigonometric calls,
distortion count, scalar operations, floor calls, trigonometric calls, square
roots, `atan2` calls, Cheap versus Smooth counts, three Opacity multiplies per
evaluated pixel when active, generated scalar globals, and Clip versus Wrap
addressing. Static Hue uses two trigonometric calls per evaluated pixel in the
current generated implementation; the cost report exposes that expense rather
than hiding it. Distortion costs likewise remain separate from Transition
renderer cost such as `2N` Crossfade.

### Show sample remapping

Coordinate remapping is a generated outer-renderer stage, not a Stage Map or
routing layout. Runtime order is Stage Map sample, zone selection and local
normalization, Show remap, then renderer compatibility and member invocation.
Preview `pos` never enters the path.

The synchronized-tiling transform stores one `repeatScale`. Generated
`beforeRender` evaluates its shared scene/boundary ramp once per frame. Scale
`1` takes an exact identity branch. Other values apply `frac(position * scale)`
to normalized 1D local index position or to 2D local X and Y. Native 2D members
retain the routing-produced index argument while reading repeated X/Y; 1D
members receive the repeated bounded index domain. Existing source Patterns are
unchanged.

The transform adds zero member renderers. Its worst 2D pixel cost is two
multiplies and two `frac` calls; 1D uses one of each. Compile summary exposes
that ceiling separately from routing and transition renderer cost. No 3D remap
is emitted until Z semantics are explicitly designed.

Discrete adaptations remain part of member compatibility:

- `timeOffsetMs` initializes private elapsed time;
- stepped clock accumulates scaled delta and releases it at cadence boundaries;
- light shutter controls explicit black output and source-renderer evaluation;
- shutter Continue advances time behind darkness;
- shutter Freeze integrates only open-time overlap; and
- mirror/phase and other domain adaptations alter member routing or sampling.

Time scale zero keeps private elapsed time and delivered Pattern delta at zero
while the outer Show renderer continues. Negative time is not supported because
arbitrary stateful Patterns are not reversible.

Spatial transitions share one `portal` boundary/compiler path. Circle uses
Euclidean distance, diamond uses the L1 norm after optional static rotation and
progress-driven spin, and ring uses the absolute distance from an expanding or
contracting radius with a shape-specific band width. Center, scale, invert, and
feather policy are shared. Preview runs the generated artifact, so editor and
hardware use the same equations and renderer-cost policy.

## 23. Routing representation

Named routing layouts preserve arbitrary inclusive range lists. First matching
route wins; uncovered pixels render black and produce a compile warning. Loop
wrap returns layout selection to the first layout without resetting member
state.

A nonzero routing transition progressively reassigns ownership between its
source and destination layouts. `beforeRender` computes one eased progress
threshold. The outer renderer compares that threshold with stable normalized
Stage `x` in 2D or physical index position in 1D, optionally reversed, then runs
only the selected layout route. It does not blend renderers or interpolate zone
coordinates. Member `beforeRender` functions continue throughout the transfer.

The representation planner proves exact route ownership and dense zone-local
indexing before specializing a complete, non-overlapping physical layout.
Contiguous blocks, repeated row bands, and interleaved pixels compile to formulas
when every layout is a cyclic reassignment of the same topology. A gap, overlap,
exception, reordered local index, or unrecognized shape rejects the formula.

Arbitrary layouts retain generated range branches. High-run irregular layouts
may use a packed per-pixel lookup only when the complete
`pixelCount * layoutCount` table fits the 2,048-element policy and its bytecode
estimate remains below the measured 68,384-byte activation budget. The compile
summary and compile bar name the selected representation and report separate
estimated bytecode and permanent-array costs. These estimates are conservative
selection diagnostics derived from the routing spike, not Controller compiler
measurements. RLE remains excluded because the hardware spike measured it worse.

## 24. Deterministic seek replay

A seek constructs a fresh Fast runtime with the Show-owned random seed, renders
time zero, and advances at 60 fixed steps per second. Intermediate ticks execute
every `beforeRender` and renderer call, including render-side state mutation,
but do not retain or paint RGB frames. Only the target frame is installed.

Production replay advances 250 ms of simulated Show time per cooperative chunk,
yields, and checks the current seek id. Newer seeks supersede old work. The
rebuilt runtime becomes the live runtime so playback continues from the sought
state.

A named logical moving-split layout owns an X or Y axis and an ordered two-zone
pair. Scene targets place the split; the incoming visual boundary supplies its
explicit start, duration, and easing. `beforeRender` updates one scalar split
position. The outer renderer selects one side, renormalizes that side to a local
`0..1` domain, updates each member's virtual `pixelCount` from its current share,
and invokes one Pattern renderer. Endpoint positions give the
complete Stage to one zone without dividing by zero. The routing state uses one
scalar and no arrays; the compile summary compares that constant storage with a
keyframe-equivalent enumerated table.

The current path always uses the selected Stage's full pixel count and has no
checkpoint cache, frame history, downsampling, representative pixels, alternate
timestep, or worker. Completed-stack measurements support this as the simplest
current architecture; extreme long/high-pixel/heavy cases rely on visible rebuilding
and cancellation. Detailed matrices remain in the archived replay reports.

Determinism covers owned random seed, fixed cadence, initial property/control
values, and scheduled Show automation. Unrecorded wall-clock, network, and live
sensor history is outside the guarantee.

## 25. Show delivery and export

`showEpeExport.ts` packages the exact generated source used for inspection and
Controller compilation into the standard EPE envelope. Export adds:

- a normal Controller-format program id;
- a 100×150 preview JPEG;
- a readable Show summary;
- PXLBLZ artifact provenance; and
- source Pattern provenance/license comments retained inside isolated members.

Version-1 source banners may also carry optional map, compatibility, and Show
output-contract comment records:

```js
// pxlblz:map preferred=stock:plane name="Square"
// pxlblz:compat portability=adaptive dimensions=2 classes=surface aspect=0.75:1.33 resolution=adaptive exact=false
// pxlblz:show-output version=1 kind=portable-2d dimensions=2 classes=surface resolution=variable
```

The preferred map and compatibility contract are independent. Preferred stock
maps use stable catalogue ids. Custom maps carry names only; an import reconnects
one unambiguous exact-name match and otherwise retains the metadata while using
the normal preview fallback. Compatibility records dimension and physical map
class lists, adaptive/fixed resolution, an optional aspect-ratio interval, and
exact-map intent. Older banners without any optional line parse unchanged; malformed
optional lines do not invalidate the core artifact identity.

`pxlblz:show-output` is the authoritative artifact-level Show contract. Its
Installation variant records `pixels` and optional stock/custom map identity plus
an eight-hex map-data fingerprint. Its Portable variant records 2D, compatible
map classes, variable resolution, and an optional aspect interval. It never
serializes Portable reference pixels as physical identity. `parseEpe()` and
`recoverSavedProgram()` return the parsed record beside intact source; banner
stripping removes all recognized optional lines. Unknown versions or malformed
fields omit only this optional record.

The summary lists Pattern references, scenes, routing layouts, and transition
configuration. Generated orchestration names are collision-safe and do not
replace human-readable provenance.

The Show editor sends that canonical stamped source through the shared
`pushPattern` transport policy under identity `show:<show-id>`. Run compiles and
starts a throwaway id without touching saved bindings. Save writes a PBP preview,
starts the same stable id, records the per-Controller binding, and overwrites it
on later saves. Both modes update the Controller panel's local program label;
Save also refreshes its saved-program inventory.

`showControllerArtifact.ts` is the only device-derivation seam. It compares the
Show's generated renderer capabilities with the connected Controller's installed
map and firmware. A compatible artifact stays byte-identical. A required
exact-arity adapter is appended through the pass engine, restamped as the same
Show with `renderer-adapter` provenance, and presented through the ordinary
compatibility confirmation. Known unsupported firmware blocks the send.
Restamping preserves preferred-map, compatibility, and Show output-contract
fields. Controller preparation compares Installation pixel count and map
id/name/fingerprint when known. Exact matches are clean, unknown map state
requires explicit confirmation, and known mismatches block. Portable dimension,
class, and aspect differences are advisory; reference count and exact reference
map are never compared. Program delivery does not mutate the Controller's shared
map or pixel count.

---

# Part 6 — Supporting systems and limits

The core architecture is surrounded by export, documentation, testing, and
evidence systems that make its promises inspectable. The remaining limits mark
where PXLBLZ deliberately stops, where browser and firmware behavior can still
diverge, and which assurances are measured rather than assumed.

## 26. Export and in-app documentation

Pattern Copy/Download emits stamped `bundle(...).code`; `fxCode` and metadata are
preview-only. `.epe` import reads `sources.main` into a new personal Pattern and
parses any PXLBLZ map metadata before selecting preview settings. A resolved map
is persisted as that Pattern's map override. Missing or ambiguous custom-map
references leave the source banner intact and surface an import notice instead
of guessing.

User documentation is imported as raw Markdown in `src/docs/catalog.ts` and
served at `/docs/<id>`. `docsMarkdown.ts` is a purpose-built safe parser for the
Markdown subset used by the repository: headings, paragraphs, quotes, lists,
fences, tables, images, rules, and basic inline spans. Unsupported syntax
degrades to text; raw HTML is never injected. Relative documentation links route
inside the app when catalogued and fall back to repository URLs otherwise.

## 27. Testing and evidence

Most coverage belongs around pure engine logic. Component tests are light smoke
coverage over delegation and rendering. The repository also carries:

- fixed-point and library fidelity suites;
- fake-relay Controller protocol tests;
- PBP/map binary round trips;
- compiler and generated-artifact execution tests;
- Show model/compiler/runtime equivalence tests;
- performance harnesses for Pixelblaze built-in costs and generated strategies;
- Playwright public route smoke plus synthetic authenticated D1-backed Studio
  persistence and complex Show-authoring flows; and
- explicit live-hardware probes and archived result reports.

The pre-commit gate runs lint and the full Vitest suite. E2E, performance, and
hardware tiers remain explicit because they have different reliability and
environment requirements.

## 28. Known limits and accepted divergences

- Pattern execution and ordinary preview rendering run on the main thread. A
  valid infinite loop can freeze the tab; there is no browser-side watchdog.
- Sensor Expansion Board globals are inert stubs in preview.
- Fast is float64; Precise emulates 16.16 but does not duplicate every firmware
  algorithm.
- Controller-profile interception understands supported top-level output call
  shapes, not arbitrary dynamic aliases or all palette-resolved paths.
- Personal Pattern sharing is not public; only built-in Gallery slugs exist.
- Device playlist/rename/delete management remains in the Pixelblaze UI.
- One Show compiles for one Controller target; synchronized multi-Controller
  playback is outside the current system.

## 29. Evidence and further reading

- Feature Guide — `docs/reference/PXLBLZ Feature Guide.md`
- Pixelblaze Ecosystem Primer — `docs/reference/Pixelblaze Ecosystem Primer.md`
- Understanding Maps — `docs/reference/Understanding Maps.md`
- Optimization Guide — `docs/guides/Optimizing Pixelblaze patterns.md`
- Domain glossary — `CONTEXT.md`
- Show routing representation —
  `docs/plans/archive/issue-400-routing-representation-results.md`
- Adaptive routing/operators —
  `docs/plans/archive/issue-409-adaptive-show-routing-results.md` and
  `docs/plans/archive/issue-410-adaptive-spatial-operator-results.md`
- Coordinate-remapping decision and measurements —
  `docs/plans/archive/issue-406-coordinate-remapping-design.md` and
  `docs/plans/archive/issue-406-coordinate-remapping-results.md`
- Seek replay decision —
  `docs/plans/archive/issue-421-show-seek-replay-decision.md`

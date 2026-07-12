# PXLBLZ — Feature Guide

PXLBLZ-IDE is a browser-based authoring environment for Pixelblaze. It gives
you a public Gallery, a cloud-backed Studio, a hardware-faithful preview, and an
optional live connection to one or more Controllers. You can use most of it
without hardware; when hardware is present, the same work can be run, saved,
inspected, and recovered without turning the Studio into a second device admin
panel.

This guide explains the product as it exists now. If Pixelblaze terms such as
Pattern, map, control, or fixed-point are unfamiliar, start with the
**Pixelblaze Ecosystem Primer**. If you are working on PXLBLZ itself, use the
**PXLBLZ Technical Reference**.

The shortest useful mental model is:

- **Gallery** is the public place to browse built-in Patterns.
- **Studio** is the signed-in place to author Patterns, maps, mixins, libraries,
  Controller profiles, and Shows.
- **Controller** controls are global. Live hardware can be connected from the
  Gallery or Studio, with or without signing in.
- **Preview state is not hardware state.** Light size, diffusion, solidity,
  playback speed, and Fast/Precise rendering stay in the browser. Patterns and
  maps cross to hardware only when you explicitly send them.

---

# Part 1 — Working in PXLBLZ

Most work moves between three places: the public Gallery for discovery, Studio
for authoring, and the global Controller surface for live hardware. The same
Pattern and preview engine runs underneath them, so opening, editing, testing,
and sending work are different views of one workflow rather than separate tools.

## 1. Gallery, Studio, and accounts

### Gallery

`/gallery` is both the landing page and the public Pattern catalogue. Its cards
run the real preview engine rather than animated screenshots. Filter by
dimension, category, or name; open a card for a shareable Pattern detail page at
`/p/<slug>`.

A detail page gives the Pattern room to breathe:

- a large live preview with the Pattern's exported controls;
- the same map and preview settings used elsewhere in the app;
- a Preview / Code switch, with source shown read-only;
- **Run** and **Save** actions when a Controller is connected; and
- **Open in Studio**, which opens the built-in Pattern read-only for inspection
  and cloning.

Built-in Pattern slugs are public. Personal Patterns do not have public detail
pages yet.

Each built-in Pattern has one shared recommended presentation: map or shape,
surface, modeled LED count, light size, diffusion, normalization, brightness,
and solidity where supported. Gallery cards render a lower-density version when
needed for performance; Pattern detail and Studio keep the same presentation.
Gallery rendering never exceeds 2,048 realized LEDs, including rounded lattice
layouts such as Cube volume.

### Studio

`/studio/...` is the working environment. It uses stable routes for six entity
kinds:

| Rail mode | What opens |
|---|---|
| Patterns | Editable personal Patterns and read-only built-ins |
| Maps | Editable custom maps, frozen imports, and read-only stock maps |
| Mixins | Reusable pass-engine transformation source |
| Libraries | Reusable Pattern functions and shared state |
| Controllers | Durable profiles for physical Controllers |
| Shows | Timeline-based multi-Pattern choreography |

**Catalog** at the bottom of the rail returns to the Gallery. Switching rail
modes remembers the last open item for each mode during the session.

Patterns and Maps have a dimension lens and name search. Personal content is
listed first; stock or built-in content lives in a collapsible group beneath it.
Mixins and Libraries use the same personal-first, stock-second pattern without
dimension filtering. Controller profiles come only from observed hardware, so
there is no blank **New Controller** button.

The Studio is a three-pane environment:

- the left rail opens and creates things;
- the center pane edits source or a Show timeline; and
- the right pane supplies context: Pattern preview, map wiring check, mixin
  provenance, library API reference, saved Controller programs, or Show Stage.

PXLBLZ remains a single-document editor. Opening a map or library changes the
editor context; it does not create a tab or silently apply that object to the
running Pattern.

### Accounts and persistence

Studio requires sign-in with GitHub or Google. Both providers may be connected
to one account; a matching verified email can link them automatically, and the
account menu can connect or disconnect a provider as long as one login remains.

Personal Patterns, maps, mixins, libraries, Shows, Controller profiles, and
their metadata live in the signed-in cloud workspace. Signed-out use is
non-durable demo mode: the Gallery, built-in Patterns, stock maps, stock mixins,
stock libraries, documentation, preview, and live Controller connection still
work, but personal create/update/delete actions require sign-in.

## 2. Patterns and the editor

The center editor is Monaco, the engine behind VS Code, configured for the
Pixelblaze language. It provides completion, signatures, hover documentation,
inline errors, and a compact Good/Broken status.

Clean source is pushed to the preview after a short typing pause and auto-saved
on a slower sync tick. Broken source stays visible with markers while the last
clean version continues running. This is friendlier than replacing a useful
preview with a black rectangle because of one missing parenthesis.

A new personal Pattern starts from runnable source. Built-in Patterns open
read-only; **Clone** creates an editable personal copy and snapshots the current
effective preview settings. There is no live link back to the built-in.

Patterns may call stock or personal libraries with namespace syntax such as
`SDF.circle(...)` or `MyLib.paint(...)`. Compilation follows transitive library
references, inlines only the functions that are actually used, and produces one
flat Pixelblaze artifact.

### Controls and watched variables

Exported functions create the same style of controls used by Pixelblaze:

- `sliderName(v)` → slider;
- `toggleName(v)` → toggle;
- `hsvPickerName(h, s, v)` → HSV picker; and
- `rgbPickerName(r, g, b)` → RGB picker.

Control positions are remembered per Pattern. Other recognized control shapes
may compile without receiving a Studio widget yet.

Every `export var` appears in the var watcher and updates after each frame.
Arrays are summarized element by element rather than collapsed into an
unhelpful object string.

## 3. Preview

The preview executes the transpiled Pattern in the browser and draws its pixels
as a WebGL point field. It handles 1D, 2D, and 3D maps, including 3D orbiting,
depth, glow, and optional back-face fading.

### Fast and Precise

Pixelblaze uses 16.16 fixed-point arithmetic. PXLBLZ offers two preview modes:

- **Fast** uses ordinary float64 and is the everyday editing mode.
- **Precise** emulates 16.16 overflow, quantization, multiplication, division,
  modulo, and bitwise behavior closely enough to expose the failure modes that
  make shader ports look fine on a laptop and explode on hardware.

Precise mode is not a claim that every firmware algorithm was reverse
engineered. Transcendental functions are calculated in float64 and quantized;
`perlin`, `prng`, and related algorithms are not bit-identical to firmware.
Pure integer arithmetic is the strongest parity case.

### Preview controls

The deck separates settings by whether hardware could carry them.

**PIXELBLAZE** settings:

- **Map** — coordinates supplied to the Pattern;
- **Pixels** — modeled pixel count. Its popover offers a geometry-aware ladder
  of natural resolutions with previous/next controls, plus exact entry. An exact
  count may sit between ladder stops or exceed the 2,048-LED quick-selection
  ceiling. Fixed imported maps keep their measured count and omit the ladder.
- **Fit** — Fill or Contain normalization for 2D/3D maps; and
- **Brightness** — preview output level, displayed on a logarithmic slider.

**PREVIEW** settings:

- **Renderer** — Fast or Precise;
- **Speed** — the browser virtual clock rate;
- **Light size** — dot size without moving pixels;
- **Diffusion** — a per-source glow that closes physical-looking gaps; and
- **Solidity** — back-face fade for generated shells and solid-eligible forms.

Map, pixel count, fit, brightness, speed, and solidity are remembered per
Pattern. Light size and diffusion have a global comfort baseline but may be
overridden per Pattern. Fast/Precise is one machine-wide preference. The rewind
action clears the active Pattern's overrides without erasing the global comfort
baseline.

These settings do not ride along with **Send to Controller**. In particular,
preview brightness is not a safe substitute for physical brightness: a monitor
and several amps of LEDs are different animals.

## 4. Maps, coordinate views, and display geometry

A Pixelblaze map is an ordered coordinate set. Array position is the LED index;
the value at that position is what a renderer samples. PXLBLZ keeps two ideas
separate:

- **sample** is the coordinate delivered to the Pattern; and
- **position** is where the preview draws that LED.

That distinction is why a real 1D map can drive the Pattern while Line, Ring,
or Pole changes only the viewport. It is also why a generated Cylinder can keep
one physical wall while exposing Strand, Surface, and Spatial coordinate views.

### The map controls

Every Pattern may try every map dimension. Exact-dimensional choices appear
under **Recommended**; other dimensions remain available under **Other
dimensions**. Renderer selection follows the current Pixelblaze preference
order and is explained when adaptation is occurring.

| Selected map | Pattern receives | Display choice |
|---|---|---|
| Index / 1D | `[x]` | Line, Ring, or Pole |
| 2D | `[x, y]` | Flat or Cylinder wrap when the map is a grid |
| 3D | `[x, y, z]` | The map's own geometry |

Missing trailing coordinates are centered at `0.5`; extra coordinates are
dropped. When hardware needs an exact-arity wrapper for the same behavior,
PXLBLZ generates one at send time and shows it in artifact inspection.

### Geometry families

Generated geometry is catalogued by physical type: Paths, Surfaces, Shells,
Volumes, and Custom/imported. A family may expose several honest coordinate
views over the same LED positions:

| Family | Strand | Surface | Spatial |
|---|:---:|:---:|:---:|
| Square, Wide, panel windings | ✓ | ✓ | — |
| Cylinder wall | ✓ | ✓ | ✓ |
| Cube/Sphere/Star/Tetra shells | ✓ | — | ✓ |
| Cube/Sphere/Star/Tetra volumes | ✓ | — | ✓ |

Strand means deterministic wire progress. Surface exists only when the
generator owns a meaningful parameterization. Spatial means normalized physical
XYZ. PXLBLZ does not invent UV coordinates for an imported cloud or pretend a
shell and a volume are the same point distribution.

### Stock, custom, and imported maps

Stock maps are real, self-contained Mapper JavaScript. Open one read-only in
Maps mode to inspect it, use it directly in preview, send it to a Controller, or
Clone it into an editable custom map.

**New Map** opens a plain-JavaScript map source. It may be a literal coordinate
array or a `function(pixelCount)` returning one. Clean source is evaluated and
baked on the sync tick. Editing or opening a map never changes the running
Pattern's selected map; choose it explicitly in the Pattern deck.

The map context pane is a wiring check, not a Pattern preview. It colors points
in wire order, labels regular indexes, reports bounds and dimensions, and uses
the orbit viewport for 3D.

A connected Controller profile can import `/pixelmap.dat`. If its bytes match a
known Studio map, the import flow opens that map instead of creating a duplicate.
Otherwise it creates a frozen source-less custom map with Controller provenance.

### Fill and Contain

- **Contain** preserves aspect by scaling every axis from one shared longest-axis
  range.
- **Fill** stretches each axis independently to `0..1`.

Both are real Mapper behaviors. Fill changes what the Pattern samples; it does
not distort the preview's physical positions.

## 5. Libraries and mixins

Libraries and mixins are both reusable source, but they solve different
problems.

### Libraries: code a Pattern calls

A Library is a namespace of functions and top-level `var` state. Its top level
may contain function declarations, `var` declarations, and comments—no
executable statements. The name is the namespace, so it must be a valid,
case-sensitive identifier that does not collide with stock libraries,
Pixelblaze built-ins, or another personal library.

PXLBLZ ships `SDF`, `Anim`, `Color`, `Coord`, `Noise`, and `Shader`. Stock
libraries open read-only and may be cloned under a fresh namespace such as
`Shader2`; they cannot be shadowed. Personal libraries auto-save and compile
through every Pattern path: preview, Copy Code, Download, Controller send, and
artifact inspection.

Library API documentation comes from `//` comments directly above function
declarations. Those comments drive both hover cards and the live API reference
in the right pane. Rename and delete are confirmation-guarded because references
are intentionally soft: a dependent Pattern fails compilation until its
namespace call is updated.

### Mixins: code the pass engine applies

A mixin is Pixelblaze-dialect transformation source with a structured header
and a pass kind:

- **inject** adds source and composes `beforeRender`;
- **intercept** wraps selected output calls such as `hsv` or `rgb`; and
- **bind** connects a normalized source to a function or variable.

Mixins stay generic. Controller-specific pins, limits, and targets belong to a
Controller profile or pass recipe, not to the mixin itself. Stock mixins are
read-only examples; personal mixins auto-save. The right pane shows header facts,
usage, warnings, the latest transform summary, and generated source when those
records exist.

## 6. Connecting a Controller

PXLBLZ works without hardware. Live Controller access is an optional additive
layer provided by the PXLBLZ Chrome extension, because an HTTPS page cannot open
a Controller's insecure LAN WebSocket directly.

Open the top-right Controller menu and either select a Controller discovered
through ElectroMage's discovery service or enter its IP. Chrome asks for access
to each LAN host the first time. Several Controllers may remain connected; one
is active at a time.

Status uses a compact traffic-light vocabulary:

- dark grey — extension absent;
- grey — extension present, no connection;
- blinking amber — connecting;
- green — connected; and
- red — connection error.

Connections retry after ordinary network interruptions. A manually entered
Controller remains usable even if stable identity cannot be recovered; it is
then **unclaimed** and is not automatically persisted as a profile.

### Live Controller panel

Click the active Controller pill to open live state:

- Run, Save, and Profile actions;
- active Pattern and native brightness;
- pixel count and installed map point count, with mismatches flagged;
- IP address and reported FPS;
- the running Pattern's controls and watched variables;
- power telemetry and a live duty-cap control when the generated Pattern
  exposes them; and
- a quiet firmware-available notice sourced from the Controller's own update
  service.

Brightness and live control writes are volatile. Pixel count is a deliberate
saved hardware write. The Controller therefore retains exact entry with an
explicit apply action; it does not use the Preview's exploratory resolution
ladder. If the count is reduced, PXLBLZ first clocks the old tail black so LEDs
beyond the new count do not freeze at their previous color.

PXLBLZ never installs firmware. The notice opens the Controller's own web UI and
points to **Settings → Updates**.

## 7. Controller profiles and hardware transforms

A Controller profile is durable configuration for one physical Controller,
keyed by its stable device id rather than its IP or display name. Signed-in
sessions create or refresh a profile when connected hardware reports that id.
The profile remains editable while hardware is offline.

Profiles hold:

- last-seen device name, IP, firmware, pixel count, and map dimension;
- hardware inputs such as potentiometers and buttons;
- global transforms such as hardware brightness and power cap;
- per-Pattern input bindings;
- named multi-range zones used by Shows; and
- map fingerprints and saved-push metadata.

Profiles do not duplicate live brightness or Pattern controls; those stay in
the Controller panel.

### Inputs and bindings

A binding can call an exported slider, call a named function, or assign a named
variable with optional min/max scaling and quantization. The pass engine applies
it once per frame without editing Pattern source. Missing targets produce
transform warnings rather than silent partial behavior.

For an analog potentiometer, a linear 10k part is a good default: outer lugs to
3.3V and GND, wiper to one of the ADC1-safe pins offered by the profile. Never
feed 5V into a Pixelblaze analog input.

### Hardware brightness and power cap

Hardware brightness samples a configured input once per frame and scales
supported output calls. It is separate from the Controller's native brightness,
which remains the final physical safety control.

Power limiting is expressed as **output duty**, not as an imaginary current
measurement. The profile may store a direct duty percentage or derive one from
full-white milliamps per pixel, pixel count, a setup brightness, and target amps.
Those electrical values are assumptions and provenance. The live panel combines
emitted duty with the current native brightness and pixel count to show an
estimated draw; it does not call that estimate an ammeter.

Power telemetry has a calm recent window, a since-start average, and a separate
short response signal used by the limiter. The live duty slider changes the
running generated Pattern immediately but remains volatile; the next push
restores the profile default.

Current output interception covers the supported `hsv` and `rgb` call shapes.
Arbitrary aliases and palette-resolved `paint()` output are not magically
understood; artifact inspection makes those boundaries visible.

## 8. Run, Save, inspect, and recover

**Run** and **Save** compile with the Controller's own compiler.

- **Run** loads transient bytecode. It is not added to Saved Patterns.
- **Save** writes the Controller's standard saved Pattern package, containing
  its name, compiled code, and stamped source, then activates it. Repeated saves
  overwrite the same bound Controller program when that program still exists.

Run and Save have independent dirty state. Changing Pattern source, an enabled
profile transform, a matching binding, or the Controller's installed map
dimension re-arms the relevant action. A clean Run does not pretend the Pattern
has also been saved.

When a profile affects generated code, **View generated artifact** and the
transform summary show what was inserted, wrapped, bound, or adapted. Saved
source carries a machine-readable PXLBLZ banner with artifact hash and transform
ids. Preview code does not carry that banner; it is added only at an outbound
source boundary.

### Saved-program inventory

The Controller profile's right pane lists Saved Patterns while that Controller
is live. Studio-owned rows link back to their Pattern or built-in source;
foreign rows remain visible. Transform freshness is computed from the saved push
record:

- **current** — saved transforms match the profile now;
- **stale** — profile transforms changed; push again; and
- **unmanaged** — no Studio push record is available.

Import reads the selected saved Pattern. A stamped Pattern may open its existing
Studio record or restore a deleted one with its original id. Foreign Patterns
that contain source become new personal Patterns. A saved Pattern containing
compiled code but no source remains visible but cannot be reconstructed.

### Sending and importing maps

A Controller has one shared map slot. **Send map to Controller** is therefore a
confirm-first configuration action, not a casual per-Pattern preference. PXLBLZ
re-bakes function maps for the Controller's current pixel count and blocks known
unsupported true-1D transfers on old firmware.

The Controller panel flags a map-point/pixel-count mismatch because firmware
silently ignores a mismatched map. Controller profile **Import map** reads the
installed bytes, matches their fingerprint against known maps, and creates a
frozen import only when no match exists.

## 9. Shows

A Show composes existing Patterns into one generated Pixelblaze Pattern. The
source Patterns remain reusable textures; the Show owns timing, zones, routing,
transitions, adaptations, and Controller targeting.

### Timeline model

The canonical editor is a proportional, zoomable timeline:

- scene headers are sized by duration;
- zones are explicit rows;
- clips place Patterns across one or more scenes and zones;
- one transition lane holds selectable boundary entities;
- nested lanes expose Time, Brightness, and active public Pattern controls;
- a ruler, playhead, transport, and whole-Show navigator share one time axis.

Use **Fit**, zoom buttons, or Ctrl/Command-wheel to change the viewport. The
navigator thumb shows the visible fraction; drag it to pan or drag its edges to
resize the visible range. Zoom is editor state only and never changes Show time.

Click or drag the ruler to seek. PXLBLZ rebuilds deterministic Pattern state by
replaying from Show start in Fast mode at full Stage resolution. Replay yields
and a newer seek supersedes older work. There is no approximate seek renderer,
frame cache, downsampling, or checkpoint system in the current implementation.

**Split** creates one shared boundary across every zone row when the playhead is
safely inside a scene hold. Clips on the right default to **Continue**. Turn on
**Restart Pattern on entry** for a deliberate reset or stutter.

### Scenes, clips, and private time

A clip references a personal or built-in Pattern and applies non-destructive
adaptations. Continue reuses compatible private Pattern state across a boundary;
Restart creates a fresh instance and clock.

Delete removes a selected clip without a confirmation step and leaves an
explicit empty slot in its scene and zone. Select that slot and choose a Pattern
to create a fresh clip there. The timeline does not use freeform drag ordering:
clips are anchored to the scene/zone grid, so delete and place is the supported
way to relocate one.

Time controls include:

- **Time ×** from exact `0` through `4`; zero freezes the Pattern's private
  clock without pretending renderer work disappeared;
- **Start offset** for staggered instances and rounds;
- **Smooth / Stepped** cadence, where stepped motion accumulates time and
  releases it at cadence boundaries; and
- a **light shutter** with rate, duty, phase, and Continue/Freeze clock policy.

The shutter is an evaluation mask: closed pixels emit black and skip the source
renderer. The generated outer renderer and LED transport still run.

Clips may span adjacent zones as one canvas or **Repeat per zone** with one
shared Pattern instance and independently normalized local domains. Show zones
may be freestyle nominal rows or bind by name to the real multi-range zones on a
Controller profile. Hold and zone spans form one rectangular footprint. Growing
either span removes clips it covers; removing a covered scene or zone shrinks or
re-anchors the surviving footprint.

### Transitions and automation

A transition is its own boundary object, not a property hidden on either scene.
The lane supports cut, crossfade, wipe, dither, 2D spatial shapes, and routing-layout
markers. Duration-bearing transitions occupy visible time; a zero-duration cut
still has a stable selectable marker.

Transition cost is explicit:

- parameter ramps keep one renderer per pixel;
- wipe and dither route each pixel to one member renderer;
- crossfade runs both renderers during its window; and
- circle/portal, diamond iris, and ring/shockwave shapes can use a hard or
  stable-dither one-renderer edge, or a true blended feather that evaluates both
  Patterns only inside the band.

All spatial shapes share center, scale, direction, and feather behavior.
Diamond alone exposes rotation and animated spin; ring alone exposes band
width. The inspector hides parameters that do not affect the selected shape.

Property automation uses one shared CSS-like model: destination clips own
targets; the incoming boundary owns the explicit start, duration, and easing.
Time, Brightness, and exported `sliderName(v)` controls use the same system.
Each property may have its own duration and easing on one continued Pattern
instance. Private locals, toggles, and pickers are not exposed as automatable
numeric properties.

### Routing layouts and Stage

A Show may own several named routing layouts. Each maps semantic zones to pixel
ranges. A routing boundary may cut immediately or move a stable directional
threshold across the installation for a configured duration and easing. Each
physical pixel belongs to exactly one of the adjacent layouts on every frame,
so the transfer invokes one Pattern renderer per pixel while every Pattern clock
continues. Reverse direction moves the same threshold from the opposite edge.

The compiler chooses range branches or a bounded packed lookup according to
measured layout complexity while keeping first-route-wins overlap semantics.
Unassigned physical pixels render black and produce a compile warning.

The right pane is the Show **Stage**. Generic zone strips are always available
and honest for freestyle Shows. A saved 2D/3D Stage map instead draws the Show
over installation geometry, uses real Controller ranges when available, marks
uncovered pixels dim grey, and warns about off-stage zones. Stage selection is
Show-wide, not per scene.

### Compile, push, and export

The compiler alpha-renames member Patterns, gives each required member isolated
state, routes pixels through zone-local domains, and emits one ordinary
Pixelblaze Pattern. The compile bar reports code size, renderer policy,
transition cost, clock policy, evaluation masks, routing representation, and
warnings.

**View generated pattern** shows the source read-only. Push compiles that source
with the connected Controller's compiler through the same grouped identity,
**Run**, and **Save** actions used for ordinary Patterns. Run starts a transient
program. Save writes and starts a durable program, then overwrites that same
Controller-bound program on later saves of the Show. Neither action creates a
personal Pattern or requires an EPE round trip. If the installed Controller map
requires an exact-arity renderer adapter, PXLBLZ explains and confirms that
device derivative before sending it.

**Export `.epe`** packages the canonical generated source with a normal
Controller-format id, preview JPEG, readable Show summary, and provenance
comments. The source also records the authored Stage map when one exists and a
separate compatibility contract: adaptive versus installation-bound,
dimensions, map class, resolution policy, optional aspect range, and whether the
exact map is required. A stock map uses its stable catalogue id; a custom map
uses its human-readable name without leaking a local database id.

Inspection, direct send, and download therefore begin from one orchestration
program. Only an explicitly reported Controller renderer adapter may derive the
directly sent source, and that derivative retains the same map metadata. Sending
never changes the Controller's shared map. An installation-bound Show with an
authored map opens an explicit compatibility confirmation so the user can verify
that map is already installed.

## 10. Files and manual workflows

- **Copy Code** and **Download** emit one flat, tree-shaken `.js` artifact with
  a PXLBLZ identity banner. Precise-mode code and preview metadata never leave
  the browser.
- **Import `.epe`** creates a personal Pattern from `sources.main`. A PXLBLZ
  artifact restores an available preferred stock map, or reconnects a custom map
  only through one exact-name match. Missing or duplicate custom names preserve
  the source and show a fallback-map notice.
- Built-in Patterns may be run or saved directly; cloning is needed only to edit
  their source.
- Show `.epe` exports are standalone generated Patterns and can be used by
  normal Pixelblaze tools.

---

# Part 2 — Boundaries worth remembering

PXLBLZ stays focused by leaving device administration to Pixelblaze and by
being explicit about the few places where a browser preview cannot perfectly
reproduce firmware. These boundaries are product constraints, not hidden modes
or promises deferred to a later screen.

## 11. What PXLBLZ deliberately does not do

- It does not manage Wi-Fi, LED chipset, timezone, Output Expander setup, or
  other Controller settings. Use the Pixelblaze web UI.
- It lists and imports Saved Patterns but does not rename, delete, or arrange
  device playlists.
- It cannot recover source from a saved Pattern that contains only compiled
  code.
- It does not continuously synchronize hardware control positions with Studio
  preview controls.
- It does not publish personal Patterns to public Gallery URLs.
- It does not synchronize a Show across several Controllers.

## 12. Known preview limits

- Pattern execution runs on the browser main thread. A syntactically valid
  infinite loop can freeze the tab; clean compilation is not a watchdog.
- Sensor Expansion Board inputs are inert stubs. Sensor-reactive Patterns load,
  but audio, accelerometer, and light data do not animate in browser preview.
- Fast mode uses float64. Precise mode emulates fixed-point arithmetic but does
  not reproduce every firmware algorithm bit-for-bit.
- Accurate Show seeking reconstructs deterministic Pattern state. Unrecorded
  wall-clock, network, and live sensor history cannot be recreated from Show
  time alone.

For map theory and hardware rules, read **Understanding Maps**. For performance
work, use **Optimizing Pixelblaze Patterns**. For implementation details and
decision rationale, continue with the **PXLBLZ Technical Reference**.

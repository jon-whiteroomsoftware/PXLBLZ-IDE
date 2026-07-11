# PXLBLZ — Feature Guide

For people who use Pixelblaze and want to know what **PXLBLZ** does for them. It
assumes you know the Pixelblaze concepts — patterns, maps, controls, fixed-point;
if you don't, read the **Pixelblaze Ecosystem Primer** first. How PXLBLZ is *built*
is the **PXLBLZ Technical Reference**'s job.

**The whole document in two sentences.** PXLBLZ is a browser-based pattern
platform for Pixelblaze with two faces: a public **Gallery** for browsing live
animated patterns and sharing them by URL, and a signed-in **Studio** where you
write, preview, and tune patterns — with a preview built to be faithful to real
hardware (down to optional 16.16 fixed-point emulation) — and then put the
result onto your device, by hand or over a live connection. Everything the app
invents for previewing stays in the browser: only patterns and maps ever reach
a controller.

**Part 1** is the tour — what's on the screen and what it's for. **Part 2** is the
reference — exact control semantics, what sticks where, and the full Controller
details.

---

# Part 1 — Tour

## 1. What it does — and doesn't

PXLBLZ is a modern IDE for Pixelblaze patterns. It sits alongside the on-device
editor rather than replacing it — it deliberately doesn't mirror every device
function, and the device's own web UI remains the place for device management.

### What's different about it

- **It needs no hardware.** The whole loop — editing, compiling, a live animated
  preview faithful to the device's fixed-point math — runs in your browser.
- **Your work lives off the device.** Patterns and maps are saved outside
  Pixelblaze hardware, so they aren't tied to any one controller's storage
  (§10).
- **Modern IDE features.** Monaco (the engine behind VS Code) with autocomplete,
  signature hints, and hover API cards for the built-ins and libraries;
  background compilation with inline error markers that know the Pixelblaze
  dialect; quiet auto-save (§9).
- **Reusable libraries.** Call `SDF.circle(...)` or `Anim.ease(...)` from a
  bundled library; export inlines only what you actually use, keeping the
  artifact small enough for the device (§5).
- **A bench harness.** Scripted, repeatable benchmarking that runs a pattern
  under a software emulator or pushes it to a real controller and reads back FPS. Not
  covered in this guide — see **Optimizing Pixelblaze patterns**.

### What else you can do

- Ships with 25 brand-new demo patterns and 5 Shadertoy ports (§5).
- Connect to a Pixelblaze on your LAN — discover and connect to it, mirror its
  state live, drive the running pattern's controls in real time, and push
  patterns and maps (§6, §11).
- Import `.epe` files exported from the hardware editor or downloaded from the
  pattern library site (§7).
- Copy or download a flat, tree-shaken `.js` of your pattern plus the library
  code it uses, ready to paste into the device editor (§7).
- Preview in 1D, 2D, and 3D, with an orbit viewport and a Fast/Precise
  fixed-point renderer toggle (§3).
- Author custom maps, and push stock or custom maps to a connected device
  (§4, §11).
- Clone any demo or stock map into an editable copy (§5).

### What it doesn't do

- **Full pattern management on the device.** It can list and import saved
  programs, but it does not rename or delete them or drive playlists. Push to
  Controller still sends one pattern at a time (run or save) (§11).
- **Recover source that the device did not save.** A saved program with no
  source payload can be identified but not reconstructed. Source-bearing
  programs can be imported from the Controller profile; `.epe` remains the
  portable file-import path.
- **Device setup.** LED hardware type, WiFi, expanders, and the rest of the
  device's settings stay on the device's settings page.

## 2. The two surfaces, and getting in

The app has real URLs now — every page is shareable and bookmarkable.

- **Gallery** (`/gallery`, also the landing page) — the public face. A browsable
  grid of **live animated pattern cards**, filterable by dimension (All/1D/2D/3D),
  category, and name. No sign-in needed. Click a card for its **pattern detail
  page** (`/p/<name>`): a large live preview with the pattern's real controls, a
  **Preview | Code** toggle that shows the full source read-only in the same
  editor the Studio uses, **Clone** (copies it into your Studio patterns —
  prompting sign-in first if needed), and **Send to Controller** right from the
  page, no Studio required.
- **Studio** (`/studio/...`) — the signed-in working environment, the three-pane
  IDE described in the rest of this guide. Visiting it signed out shows a
  welcome page offering **Continue with GitHub** or **Continue with Google**.
  Every entity has a stable address: `/studio/patterns/<id>`,
  `/studio/maps/<id>`, `/studio/mixins/<id>`, `/studio/controllers/<id>`,
  `/studio/shows/<id>`.
- **Accounts**: sign in with GitHub or Google. Both can attach to one account —
  the account menu offers **Connect** for the other provider (and Disconnect,
  as long as one login remains). A Google sign-in whose verified email matches
  your existing account links automatically. Your patterns, maps, mixins, and
  observed controller profiles live in your cloud workspace, on any machine you
  sign into.
- **The Controller connection surface is global** — the same top-right Connect
  button, pills, and live panel on every page, Gallery included, signed in or
  not. Live hardware never requires an account.

### The Studio screen at a glance

- **Header** — the PXLBLZ wordmark and the **Libraries** menu on the left
  (authoring reference); the **Controller** connection surface and account pill
  on the right.
- **Left rail** — an **activity strip** of five entity kinds — **Patterns,
  Maps, Mixins, Controllers, Shows** — plus **Catalog** (back to the Gallery)
  at the bottom, with the selected kind's list beside it. Patterns and Maps
  include the dimension filter and name search; Controllers opens durable
  hardware profile pages (§10). Shows opens the proportional timeline editor.
- **Editor pane** (centre) — Monaco, in pattern, map, or mixin mode (§9), or
  the Show timeline (§5).
- **Context pane** (right) — Patterns show the animated preview canvas, transport
  row, and **control deck** (§8). Maps show a static wire-order geometry check
  with map facts and usage. Mixins show provenance.

## 3. Preview

The preview is not a rough approximation; it is built to match what your hardware
will do, across all three dimensionalities.

**It renders 1D, 2D, and 3D.** The IDE reads your render functions and infers the
pattern's dimensionality (a `render()` pattern is 1D, `render2D` 2D, `render3D`
3D), then draws it on a configurable arrangement of glowing dots. For 3D — and for
1D/2D patterns wrapped onto a 3D form — you get an **orbit viewport**: it
auto-spins, you can drag to orbit freely (horizontal drags yaw, vertical drags
tilt, horizon held level), and grabbing it just holds the spin until you let go.
Nearer dots draw larger and brighter and occlude the ones behind, so a sphere reads
as a sphere.

**Hardware-faithful math.** Pixelblaze runs 16.16 fixed-point, not floats — and
that gap is exactly where ported GPU shaders break. The **renderer** toggle picks:

- **Fast** (default) — plain float64. Smooth, right for everyday editing.
- **Precise** — emulates the controller's 16.16 arithmetic: overflow, precision
  loss, bitwise semantics, validated against a real device. Flip to Precise when
  you need to trust that what you see is what the device will do.

Two honest caveats: `perlin` and the random functions are different algorithms
from firmware, so they diverge slightly even in Precise mode (pure integer math is
bit-identical), and Precise is slower — which is why Fast is the default.

**Viewing controls.** Three preview-only sliders shape how the dots look — none
touch your pattern's math or ever reach hardware: **light size** (how big each
source draws), **diffusion** (blurs sources together like a diffuser sheet), and
**solidity** (for closed shapes, fades the back-facing dots so a solid object
hides its own back). Exact semantics and what sticks where: §8.

**Zone strips.** When the active or only zoned Controller profile defines zones,
the Preview deck shows one compact strip per zone. Each strip samples the current
frame in that zone's wire order, including multi-range zones flattened into one
contiguous diagnostic strip. The eye control solos a zone in the main preview by
holding the physical layout and blacking out every pixel outside that zone.

## 4. Maps and embeddings — what's read vs. how it's drawn

Just like real hardware, a **pixel map** describes where each LED sits, decoupled
from chain order. The IDE splits "layout" into two deliberately separate controls:

- The **Map** control picks the coordinates your pattern *reads* — `[x]` for
  `render`, `[x,y]` for `render2D`, or `[x,y,z]` for `render3D`. It lives inside
  the **PIXELBLAZE block** of the deck, with the other settings a real device
  would carry.
- The **Display** control picks how the dots are *drawn* — a viewport embedding the
  device never sees. It sits on the **transport row** beside play/pause.

The Map menu offers every dimensionality to every Pattern. Choices matching the
Pattern's highest render function appear under **Recommended**; the rest sit under
**Other dimensions**, each with a 1D/2D/3D badge. The selected map—not the
Pattern—then decides which embedding control appears:

| Active map | Map control | Embedding control |
|---|---|---|
| **Index** / 1D | ✓ | shape: **line**, **ring**, or **pole** (a helix with adjustable wrap density) |
| 2D | ✓ | display: **Flat** or **Cylinder wrap** (proportions follow the map's aspect) |
| 3D | ✓ | — (the map owns the geometry) |

Generated geometry families appear once in the Map menu and own their physical
preview positions. **Cylinder** adds a small subordinate **view** selector:
**Surface** (circumference × height, the natural default), **Strand** (ordered
wire progress), or **Spatial** (normalized XYZ wall positions). Changing the view
changes the real map coordinates the Pattern reads and the Controller receives;
the Cylinder wall itself does not move. These are three ordinary, inspectable
Mapper sources over one wall geometry—not a filled Cylinder volume.

| Generated family | Strand | Surface | Spatial |
|---|:---:|:---:|:---:|
| Square, Wide 2:1, panel winding | ✓ | ✓ (natural) | — |
| Cylinder wall | ✓ | ✓ (natural) | ✓ |
| Cube/Sphere/Star/Tetra shell | ✓ | — | ✓ (natural) |
| Cube/Sphere/Star/Tetra volume | ✓ | — | ✓ (natural) |

Strand is deterministic wire-order progress, so a chase may look spatially
irregular on a shell or volume while remaining honest. Surface is never guessed:
Ring stays a planar Path, and measured Sunflower maps stay single Custom/imported
coordinate sets. Shell and volume remain separate physical distributions even
when both expose Spatial.

Renderer selection is automatic and matches Pixelblaze firmware 3.66. Index/1D
prefers `render`, then `render3D`, then `render2D`; 2D prefers `render2D`, then
`render3D`, then `render`; 3D prefers `render3D`, then `render2D`, then `render`.
Missing coordinates are `0.5`, extra trailing coordinates are dropped, and a
small status line explains an adapted combination. Exact matches show no status.
Send to Controller applies the same policy to the Controller's installed map
(which may differ from the preview selection). When a higher-dimensional
renderer needs missing coordinates, the IDE generates an exact map-dimensional
adapter that supplies `0.5`, so the downloaded Pattern matches preview instead
of depending on incidental firmware argument values. Known pre-3.66 unsupported
map/fallback combinations are explained before Send and cannot be pushed as if
they were compatible.

**Stock maps** ship ready to use: Square, Wide 2:1, Ring, the Cylinder family, a 3D set in
shell/volume pairs — Cube, Sphere, Star, and Tetra (a d4), where "shell" puts LEDs
on the surface and "volume" fills the interior — plus Sunflower pucks as both
the fixed-length 160-point literal 3D coordinate array and a 2D X/Y projection
of the same measured LED clusters. Every stock map is real, pasteable Mapper
code: reveal **Stock Maps** in the Maps rail, open one read-only at its stable
`/studio/maps/<id>` route, and **Clone** it into an editable copy.

The catalogue is grouped by physical type: **Paths**, **Surfaces**, **Shells**,
**Volumes**, and **Custom / imported**. The Maps rail retains its Cloud/Stock
ownership sections and groups within Stock; the Pattern menu retains
Recommended/Other dimensions and adds type inside those groups. Empty categories
stay hidden, dimension and name filters keep working across groups, and a family
such as Cylinder remains one item with its coordinate views nested beneath it.

**Custom maps**: click **New Map** and you get an editor for real Pixelblaze
Mapper source: either a literal coordinate array (`[[x], ...]`, `[[x,y], ...]`,
or `[[x,y,z], ...]`) or a plain `function(pixelCount)` returning one. Function maps
are full JavaScript with `Math.*`, authored in whatever units fit your build.
Custom maps re-bake automatically as you edit (the same once-at-save evaluation
hardware does) but never change the running preview on their own; you assign a map
to a pattern with the preview's Map control.

For an active 1D map, Map and Shape stay independent. A reversed, uneven, or
discontinuous `[x]` map changes the value passed to the selected renderer;
switching Line/Ring/Pole changes only where those same pixels are drawn. **Index**
uses Pixelblaze's normal `x = index / pixelCount` no-installed-map convention.

**Imported controller maps**: a live Controller profile can read the installed
device map and save it as a named user map. Imported maps are frozen coordinates,
not editable source; they show an **import** badge in the Maps rail and provenance
in the map context pane. Maps read from the native Pixelblaze UI may be
fill-normalized per axis, so their aspect can differ from maps pushed by PXLBLZ
with **Contain**.

In Maps mode, the right pane is a **wiring check**, not a running pattern preview:
it draws the open map in wire order with a dark-to-amber ramp and labels the
endpoints plus regular intervals. 2D maps draw in their measured aspect; 3D maps
use the same orbitable 3D viewport controls as the pattern preview. Below the
canvas are map facts (pixel count, arity, bounds) and honest usage/provenance
rows.

**Mixins** are visible Pixelblaze-dialect source chunks for the pass engine.
Cloud mixins live under Mixins, followed by a collapsible **Stock Mixins** section
with read-only pass-kind examples (`inject`, `intercept`, `bind`). Opening a
stock mixin shows the exact source and structured header (`@param`, `@target`,
`@wraps`); **Clone** creates an editable cloud mixin. The right pane shows where
a mixin is used and the last transform summary when that data exists, with empty
states until bindings or generated artifacts have been recorded.

**Shows** compose existing patterns into one generated Pixelblaze pattern. A Show
opens as a proportional timeline: scenes are column headers sized by duration,
transitions occupy their real time between scenes, zones are rows, and each cell
holds a source pattern plus non-destructive adaptations such as mirror, phase,
brightness, and time scale. A ruler and persistent playhead keep every scene,
transition, routing marker, and zone clip on one shared time axis. Time scale
ranges from 0× through 4×: **0× is an exact pause**
for that clip's private clock and the `delta` delivered to its Pattern, while the
generated outer renderer continues to draw the paused state. Adjacent cells that
reuse the same Pattern can ramp continuously down to that pause, dwell there,
and ramp away without restarting or jumping phase. Negative time is not offered.
**Motion cadence** is a separate Smooth/Stepped control. Stepped motion holds
the Pattern clock between cadence boundaries, then releases the accumulated
scaled time as a jump. The inspector expresses cadence as jumps per second and
shows the equivalent interval in milliseconds. Time scale still controls how
far the animation moves; cadence controls when that motion is released. Pixels
keep rendering between jumps, so stepped motion does not blink the light or
claim renderer savings. A held cell keeps its cadence phase, while a restarted
cell starts a fresh schedule.
Each cell also has a non-negative **Start offset** for its private Pattern
clock. Repeating one Pattern across zone rows with different offsets creates
rounds, staggered motion, and travelling choreography without editing the source
Pattern or adding a second renderer per pixel. The offset chooses the cell's
starting Pattern-time position; Time x and stepped cadence continue to control
how far and when that private clock advances. Holds preserve the offset clock,
while a restarted cell begins fresh at its configured offset.
Each cell can also enable a **light shutter** with a rate, light-on fraction,
phase, and dark-time clock policy. Closed shutter frames are explicitly black
and skip that Pattern's renderer. **Continue** lets the Pattern advance behind
the darkness; **freeze** advances its private clock only for the open portion of
each frame interval. This is a generated evaluation mask, not a brightness
scalar: the outer Pixelblaze render loop and LED transport still run.
The timeline is a recessed composition surface: scene headers are
inline-editable labels, zone rows carry their zone color, and pattern cells render
as zone-tinted clips. A dedicated **Transitions** lane holds selectable chips for
cut, crossfade, wipe, dither, portal, and routing-layout events. Duration-bearing
events occupy proportional time; zero-duration cut/routing markers retain clear
hit targets at the shared boundary. Selecting a chip opens one inspector for its
stable entity rather than editing either neighboring scene. Visual transitions
expose kind, duration, easing, cost, and type-specific settings; routing markers
select their destination layout. Removing a visual event leaves an explicit cut
marker, while removing a routing marker removes only that routing event.
Each zone row includes compact nested **Time ×** and **Brightness** lanes. Scene
columns display their targets; a highlighted boundary segment displays an
authored start-to-target ramp. Select a segment (or its transition chip) to
enable either property for a destination zone and edit its start, target,
duration, and easing. Properties on one boundary may use independent curves.
Linear, ease-in, ease-out, and ease-in-out use the same deterministic math in
preview and generated controller code, with no additional Pattern renderer.
Public Pattern sliders can join the same system. Select a cell whose Pattern
exports a `sliderName(v)` function to see its humanized name, `0..1` range, and
saved Studio position (or the normal `0.5` Studio fallback), then enable a target
for that scene. Once targets exist on both neighboring cells, their transition
inspector offers the same start, target, duration, and easing controls and the
timeline adds a compact named lane. Renaming/removing the slider or changing to
an incompatible Pattern produces a compile error instead of silently dropping
the automation. Private Pattern locals never appear as automatable properties.

The transport above the timeline goes to Show start and toggles play/pause;
**Space** toggles the same state while focus is outside an editor control. Clicking
or dragging the ruler pauses playback and moves the playhead. The Stage rebuilds
the requested frame from Show start with deterministic, fixed-step **Fast** replay,
shows a brief rebuilding state when needed, and discards stale work when another
seek arrives. Playback resumes from the rebuilt Pattern state rather than jumping
back to the old preview position. Replay uses the selected Stage's full pixel
count and keeps no frame cache or approximate seek mode; long or unusually heavy
Shows remain cancellable while rebuilding. This guarantee covers deterministic
Pattern state; live sensor, network, and wall-clock inputs are inherently external. At
narrow window widths the Stage pane collapses so the timeline remains usable;
the timeline keeps its own intentional horizontal scrollbar.

Use the timeline's **Zoom out**, **Fit**, and **Zoom in** controls for precise
editing, or hold Ctrl (Command on macOS) while using the mouse wheel to zoom
around the playhead when it is visible. The **Show navigator** beneath the tracks
always represents the whole Show: its amber thumb grows or shrinks with the
visible fraction, dragging it pans, and its edge handles resize the range.
Arrow keys pan a focused thumb or resize a focused handle. Zoom is bounded from
Fit to 16×; it changes only the editor viewport, never Show timing or the
playhead's time. Split, transitions, scene headers, clips, ruler, and property
lanes remain on the same proportional grid while the timeline scrolls locally.

**Split** is enabled when the playhead is at least one second inside either edge
of a scene hold. It creates one shared scene boundary across all zone rows,
preserves the outgoing transition at the right edge, and divides every covering
cell without changing its Pattern, adaptations, clock, or accumulated state.
The new destination cells default to **Continue**.

The contextual inspector below the timeline follows the current selection. Clicking
the timeline background shows show-level setup (target Controller, stage map, loop
and zone summary, plus Add zone). Clicking a cell edits its source pattern,
adaptations, hold span, and zone span. Clicking a transition chip edits that
specific stable boundary entity, not just the first one or a neighboring scene.
Clicking a zone edits the show-local row
and its nominal pixel count. Ghost affordances at the end of the strip add a new
scene or zone; scene headers expose rename, duration, and removal controls, with
scene removal confirmed before it mutates the strip. The editor persists shows in
your cloud workspace, supports rename/delete from the rail, inspectable compiled
artifact budget, read-only generated source, and pushing the generated pattern to
the connected Controller. **Export `.epe`** downloads that same generated source
as a standard standalone Pixelblaze Pattern with a controller-format ID and
100×150 waterfall JPEG preview. Its readable header identifies the
Show, source Pattern references, scene/layout schedule, PXLBLZ URL, and
collision-safe generated orchestration; source-level provenance/license comments
remain embedded rather than being replaced with guessed metadata. The compile bar labels exact-pause clock recipes
separately from renderer policy: pausing time does not claim renderer-cycle
savings or buffered frame reuse. For shuttered clips it reports expected active
Pattern evaluation per clip and explicitly keeps that estimate separate from
unavoidable outer-render and LED-transport work. For stepped clips it reports
motion cadence separately and states that renderer cost is unchanged.

The Show-wide **routing** lane sits above the zone rows. Show Setup can create,
duplicate, rename, edit, and remove named routing layouts; each layout maps the
same semantic zone rows to its own pixel-index range lists. A compact marker at
a scene boundary selects the destination layout. At playback the first layout
starts the loop, boundary markers switch routing immediately, and the layout
returns to the first at the next loop without resetting any running Pattern
clock or state. Pixels not covered by the active layout render black. Overlaps
are deterministic (the first route wins) and appear as compile warnings.

A **wipe** can add a normalized `0..1` feather width. Zero is the original hard
index boundary. A positive feather turns the surrounding band over through a
stable per-pixel spatial threshold: each pixel changes owner once as the edge
passes, so the edge looks less row-stepped without temporal sparkle or a
two-renderer crossfade. The inspector keeps the tradeoff explicit, and the
compile bar still reports one Pattern renderer per pixel.

Show zones have two origins. A plain new Show starts with editable local rows
that use nominal pixel counts for preview. When a Controller profile with zones
exists, the Shows rail can create a Show seeded from that Controller's zone map.
At compile/push time, show rows bind to Controller zones by name; matched rows use
the Controller's real ranges and pixel counts, while unmatched rows appear as
compile-bar warnings rather than silently disappearing.

The right pane previews the Show on a **Stage**. The default stage is **Zone
strips - generic**, a flattened diagnostic view where each zone becomes a labeled
strip and solo keeps the strips in place while blacking out other zones. A Show
can instead save any selectable 2D/3D map as its stage. Spatial stages run the
generated Show artifact over the chosen map's positions, bind show rows to the
target Controller's real zone ranges when available, warn when a zone has no
pixels on that stage, and draw map pixels not covered by any Show zone as dim
grey. If the saved stage map is later deleted, the preview falls back to generic
strips with a note rather than failing.

Cells normally treat each zone row as its own domain. Setting **Span zones** on a
cell stretches that one pattern across adjacent rows as a single canvas, so a
gradient or wash can run continuously across multiple physical zones instead of
restarting inside each one. A multi-zone cell can instead choose **Repeat per
zone**: one shared Pattern instance and clock render into each covered zone's
independently normalized local canvas. This is cheaper and more state-coherent
than compiling several synchronized copies of the same Pattern.

The repository includes the browser-exported
`artifacts/electromage/pattern-prism.epe` catalog Show. Pattern Prism keeps one
Ribbon Loom instance running while hard-switching among full-panel, repeated
quadrant, alternating-strip, and pinwheel-interleave layouts before returning
to the full panel. It also includes
`artifacts/electromage/scene-splice-showcase.epe`: two ordinary stock Patterns
loop through a blended outward portal and a tighter dithered inward return.
Repeated Heat Shimmer scenes share one compiled Pattern instance, while the
more expensive second-renderer work stays inside the blended feather band.

Zone rows that reuse the same Pattern remain independent member instances. Their
Start offsets can differ even when their source and other controls match, and
multi-range Controller zones keep the same continuous zone-local indexing while
their private clocks stay staggered.

Scene-boundary behavior is explicit. Every non-initial cell has a **Restart
Pattern on entry** checkbox. Off means Continue: a matching Pattern/adaptation
pair reuses its private renderer state, clock, cadence, and phase even when the
timeline has been split into separate cells. On allocates a fresh instance and
time base, which makes deliberate stutters and repeated starts visible. Spanning
geometry remains a compact way to draw a hold, but it is not the continuity
contract. When adjacent cells use the same source pattern and a transition changes only adaptations, the
compiler emits a parameter ramp instead of a two-renderer blend, so the compile
bar reports it as one-renderer-per-pixel work.

Transitions are priced by renderer cost. **Crossfade** is the expensive
two-renderer window. **Wipe** moves a split point across the zone, and
**dither** uses a stable per-pixel hash against the animated threshold; both
render exactly one member per pixel and show as route-cost transitions in the
compile bar.

**Portal (2D)** moves a circular boundary across the selected 2D Stage Map. Its
inspector controls the normalized center, feather width, and inside-out versus
outside-in direction. Stable dither softens the boundary while retaining one
Pattern renderer per pixel. True blend evaluates both Patterns only inside the
circular feather band, so the compile bar calls out that bounded expensive
instant. Portal is unavailable without a 2D Stage Map; 3D and generic-strip
stages produce a clear compile error.

## 5. Patterns, built-ins, and libraries

The rail's Patterns list holds your personal patterns followed by a collapsible
**Built-in Patterns** section. The Gallery remains the public browse/detail
surface: it can send catalog patterns to a Controller directly, and **Open in
Studio** opens the built-in read-only in Studio for code inspection and cloning.
Maps mode lists your custom maps followed by collapsible **Stock Maps**; Mixins
mode lists your cloud mixins followed by collapsible **Stock Mixins**; Libraries
mode lists your cloud libraries followed by collapsible **Stock Libraries**;
Shows mode lists your cloud shows. Signed-out
use is demo mode: the Gallery, built-in patterns, stock maps, stock mixins,
libraries, docs, and preview controls remain usable, while durable personal
resources wait for sign-in.

A new pattern starts from a runnable animated starter. **New Library** creates a
`LibN` namespace and opens it editable in library mode; the namespace is the
library name, so it must be a valid identifier and cannot collide with stock
libraries, the user's libraries, or Pixelblaze built-ins. Built-in patterns can
open with a recommended map, pixel count, and solidity — defaults only,
everything stays switchable (§8).

The bundled **stock libraries** live in the Studio Libraries rail and the
header's Libraries menu. Opening one shows its source read-only in library mode
without changing the running preview pattern; **Clone** copies it into a new
cloud library with a fresh namespace such as `Shader2`, then opens the clone
editable. Hover the header menu for its stock API reference; when a library is
open, the right pane shows its live API reference generated from `//` comments
above function declarations, plus function count, out-vars, and stock library
calls. Cloud libraries auto-save clean source on the sync tick. Signed-in
pattern previews, Copy Code/Download, and Send to Controller compile against
stock libraries plus the user's cloud libraries, so pattern calls such as
`MyLib.paint(index)` inline into the artifact just like stock calls; editor hover
docs also resolve cloud-library calls. Rename and delete warn that dependent
patterns are soft references and will fail compile with an unknown-namespace
error until updated.

| Library | What it provides |
|---|---|
| `SDF` | 2D signed distance fields — circles, rects, rings, stars, polygons, smooth boolean ops |
| `Anim` | easing curves, oscillators, phase timing, looping primitives |
| `Color` | HSV/RGB blends, palette interpolation, colour math |
| `Coord` | polar coordinates, rect↔polar conversion, transforms |
| `Noise` | value noise, organic variation (hashes made hardware-safe) |
| `Shader` | GLSL gap-fillers (`fract`, `step`, `dot`, palettes, integer hashes) for shader ports |

The `Shader` library plus the Precise renderer make the IDE a comfortable home for
porting ShaderToy-style GLSL: the library fills the genuine GLSL gaps with
hardware-safe equivalents (notably integer hashes that don't overflow on the
device). Porting is human-driven — some idioms translate cleanly, some need
rewriting, and GPU-only features (textures, multipass feedback, `dFdx`) won't port.

## 6. Working with a real Controller

When a Pixelblaze is on your LAN, the IDE talks to it live through a small Chrome
helper extension (a deployed web page can't open a `ws://` LAN connection itself —
Ecosystem Primer §10). Install it once; the in-app Connect surface walks you
through it. Then:

- **Find your Controller** from the connect dropdown (top right): pick it from the
  auto-discovered list, or type its IP.
- **Grant access once per device** — Chrome's native "Allow access to `<ip>`?"
  prompt, remembered thereafter.
- **Mirror and drive it live**: a panel shows the active pattern, brightness,
  pixel count, installed map size, and FPS, with the running pattern's controls
  draggable in real time.
- **Keep a Controller profile** in the left rail: a durable record for that
  physical controller's identity, inputs, global transforms, pattern bindings,
  zones, and last-known hardware status. Signed-in sessions create that profile
  automatically when the connected device reports a stable id. IP-only
  unclaimed connections remain live and usable, but are not persisted as
  Controller profiles. The profile page is offline-editable; live brightness
  and running-pattern controls stay in the top-right panel.
- **Send to Controller** compiles the open pattern with the device's own compiler
  and pushes it — transiently (**Run**) or into the device's Saved Patterns
  (**Save**).
- **Send map to Controller** writes the open map to the device's single shared map
  slot, confirm-first.

Connecting is strictly additive — the offline workflow doesn't change, and nothing
the preview invents (light size, diffusion, solidity, Fast/Precise) is ever sent
to the device. Full reference: §11.

## 7. On and off hardware by hand

No device, no extension, or just by preference:

- **Copy Code / Download** emits a single flat `.js` — every library function you
  used inlined, `export`s preserved, and a small `pxlblz:1` identity banner at
  the top — exactly the format the device expects. Paste it into the built-in
  Pixelblaze editor or upload the file. Disabled while your code has a compile
  error.
- **Import** opens `.epe` files exported from the Pixelblaze hardware editor; they
  land as new editable patterns.

---

# Part 2 — Reference

## 8. Control deck, control by control

Controls group by what they *are*, and the IDE keeps that boundary visible.

### PIXELBLAZE block — settings real hardware would carry

These would round-trip to a controller:

- **Map** — the coordinates the Pattern reads (§4). A stacked full-width field
  (map names are long), grouped into **Recommended** and **Other dimensions**.
  **Index** is the reversible no-installed-map 1D choice.
- **Pixels** — the LED count, a single number; the map arranges it (the Square
  map squares it up).
- **Fit** — the Fill/Contain choice, mirroring the Pixelblaze Mapper's own
  dropdown; both are real device behaviours, chosen per pattern. **Contain**
  (default) preserves the map's true aspect — a circle stays a circle; **Fill**
  stretches each axis to the unit square. Absent while the selected map is 1D.
- **Brightness** — a **logarithmic** slider: more of the track is devoted to the
  dim end, where small changes matter most, while reading and writing plain
  `0..1`.

### Preview block — things the device never sees

Telemetry first: **fps**, **elapsed** time, and the active layout's dimensions.
Then:

- **Renderer** — Fast / Precise (§3).
- **Speed** — 0.1×–2× playback via a virtual clock; the pattern's own sense of
  time scales with it.
- **Light size** — how big each light source draws, as a fraction of the spacing
  between dots. Grows dots in place; never moves them.
- **Diffusion** — blurs sources together like a physical diffuser sheet. At 0
  they're crisp; turned up, they merge into a smooth, gap-free field. Never
  changes a source's size, never dims the image.
- **Solidity** — only for shapes with a front and a back (sphere shell, cube
  shell, cylinder, pole). Fades back-facing dots, from transparent (LEDs on glass
  or mesh) to fully solid.

A **rewind icon** beside the Preview title appears whenever any setting differs
from its default, and resets the whole preview in one click (semantics below).

### What sticks where

- **Per pattern**: map, pixels, fit, solidity, speed, brightness — adjust them on
  a pattern (or a demo) and they're remembered for it and restored next open.
- **Comfort baselines**: light size and diffusion are global — dial them in once
  and they're your default everywhere. Adjusting one *on a particular pattern*
  sticks to just that pattern, on top of your baseline.
- **Demos** may carry recommended settings (map, pixel count, solidity — the
  sphere demos open as dense solid spheres). They're defaults only; your tweaks
  outrank them and are remembered per demo. **Forking** a demo snapshots how it
  looks right now into your copy, with no live link back.
- **Reset (the rewind icon)**: a user pattern drops back to app defaults; a demo
  reverts to its author's recommended look. Your light-size/diffusion comfort
  baseline is never touched by a reset — it's a preference, not part of the
  pattern.
- **Renderer (Fast/Precise) is the one pure-global setting** — a machine choice,
  never per-pattern.

### Pattern controls and the var watcher

- **Pattern controls** — export a `sliderX`, `toggleX`, `hsvPickerX`, or
  `rgbPickerX` function and the IDE renders the matching widget, feeding your
  function values live — the same controls the hardware shows. `showNumber`,
  `gauge`, `trigger`, and `inputNumber` are recognised but don't render a widget
  yet; the pattern still loads and runs.
- **Watch variables** — the var watcher shows the live value of every
  `export var`, refreshed each frame, arrays element by element — just like the
  on-device Var Watcher.
- **Controller power telemetry** — IDE-reserved `__px_power*` exported variables
  from power-measure/power-cap mixins are shown as a structured Power row on the
  live Controller panel instead of appearing as ordinary watch variables. Output
  duty is the primary `recent / since start` pair: the recent value publishes a
  calm block average about every two seconds, while the second value accumulates
  across the run. Estimated amps are secondary and state the inputs used — the
  Controller profile's LED full-white current plus the panel's current live pixel
  count and native brightness. Moving the brightness slider recomputes the estimate
  immediately. This is a calculator, not an ammeter.
- **Power cap** — enabling the Controller profile's power-cap transform applies
  an estimated `hsv`/`rgb` output guard at push time. Its authoritative setpoint is
  output duty from 0–100%, not milliamps, and it reports the same Power row
  telemetry while it runs. The live Controller panel turns that duty setpoint
  into a slider: changes apply to the running pattern immediately without a
  re-push, remain volatile, and reset to the Controller profile default on the
  next push. A pattern pushed before live cap control was introduced must be
  pushed again before its slider can affect output. A separate short internal
  average drives the cap, so a bright scene engages it promptly even after the
  pattern has run for a long time; neither slower display window controls
  limiting.

## 9. Editor in detail

Monaco in a Pixelblaze language mode:

- **Autocomplete and signature hints** for the full built-in surface and every
  bundled library function, with **hover cards** on library functions.
- **Live error checking** — syntax errors plus the Pixelblaze-specific violations
  (`let`, `const`, `class`, `new`, `switch`, `try`/`throw`, `import`) as inline
  markers, with a Good/Broken status badge. Broken code keeps the last good
  version running in the preview rather than blanking it.
- **Quiet auto-save** to the browser's storage, with clean changes pushed to the
  preview as you pause typing.

The editor doubles as the **map editor** in map mode — a plain-JavaScript surface
with its own parse-checking badge. Custom maps are editable and deletable (delete
is confirmation-guarded); stock maps open read-only with **Clone**.

## 10. Rail in detail

The **activity strip** picks the entity kind — Patterns, Maps, Mixins,
Controllers, Shows, with Catalog (→ Gallery) pinned at the bottom. Patterns and
Maps get a filter row combining two things:

- **Dimension lens** — single-select All / 1D / 2D / 3D; shows only items of that
  native dimension (a Pattern's dimension is the highest render function it
  defines; a map's is its coordinate arity). All four lenses remain available in
  Maps mode, so custom and imported `[x]` maps can be isolated directly. Empty
  demo subsections hide rather than leaving bare headers. The lens is ephemeral
  (resets on reload), and the active document stays loaded even when filtered out
  of view.
- **Name search** — the magnifier expands into a type-down filter that
  AND-combines with the lens. An active query force-expands collapsed groups to
  surface hits, restoring their collapse state when cleared. Search text is kept
  separately for Patterns and Maps; the lens is shared.

The strip and filter row stay fixed; only the lists scroll. Personal patterns,
maps, mixins, and shows are created, renamed, and deleted by you; they live in your
signed-in cloud workspace, and signed-out use is non-durable demo mode. Delete
lives in the editor header as a visible, confirmation-guarded action, with the
rail hover action as a shortcut.

The other three entity lists:

- **Mixins** — your cloud mixins, each row badged with its pass kind
  (`inject` / `intercept` / `bind`), plus the collapsible **Stock Mixins**
  section for the shipped examples. Stock mixins open read-only with Clone.
- **Controllers** — your durable hardware profiles, each marked LIVE or IDLE
  depending on whether its physical device is currently connected. See §6 and
  §11.
- **Shows** — your cloud shows. Each row opens a proportional timeline editor with scene
  columns, zone rows, a cell inspector, compile/budget bar, generated-source
  view, and Controller push action.

## 11. Controller reference

### Connecting

The helper is a Chrome extension that relays the `ws://` connection a deployed
page can't open itself. With it installed, a **Connect** affordance appears top
right; its dropdown offers two ways in:

- **Discover** — lists Pixelblazes found via ElectroMage's cloud finder (the same
  service the official tools use; your device needs to have reached the internet
  at least once). The list runs automatically when the dropdown opens and
  refreshes periodically; a rescan button (spins while working) forces a fresh
  look. Click a device to connect. Multiple devices appear as separate rows with
  their name, IP, and available board/firmware metadata; already-connected
  hardware is filtered out so it is not offered as a duplicate connect target.
- **By IP** — type the LAN address and connect. Always works, even when cloud
  discovery can't see the device.

The first connection to a given device surfaces Chrome's native **"Allow access
to `<ip>`?"** prompt — approve once and it's remembered (several discovered
devices can batch into one prompt). This per-device grant is what lets the
extension be least-privilege rather than holding blanket network access.

### Status vocabulary

The status dot: **dark grey** = extension not installed; **grey** = installed,
nothing connected; **amber, blinking** = connecting; **green** = connected;
**red** = error. Each connected Controller gets its own **pill** showing its
name — remembered across reloads, so it reads "burner-bag" rather than a bare IP
even mid-connect. Connections **reconnect on their own** if the device blips off
and back. Click a pill to make that Controller active and open its panel; more
than one can stay connected.

After a Controller connects, the IDE asks that Controller whether compatible
firmware is available, at most once per hour in the current browser session. An
available update adds a small amber update icon without replacing the green
connection dot. PXLBLZ does not compare release numbers or install firmware;
the Controller remains the authority for its hardware and release line.

### Live panel

A pinned popover under the active pill, polled live, in rows:

- **Run**, **Save**, and **Profile** form the first action row. Run and Save use
  the same push flows and glyph vocabulary as the editor send control; the quiet
  caption names the open Studio pattern they act on. On Gallery, Shows, or any
  other non-pattern surface, both verbs dim and the caption explains that a
  pattern must be opened. Profile remains an unboxed navigation link and is
  always available; it opens the matching durable profile, creates one from
  live hardware when appropriate, or takes signed-out users toward Studio.
- **Active pattern** name and a **brightness** slider (logarithmic, like the
  preview's). Brightness and control writes are volatile — never written to
  flash, to spare it.
- **Map points** and **pixel count**. The map-points figure flags **amber** when
  it disagrees with the pixel count — the firmware won't apply a mismatched map,
  so this makes that easy to spot. The **pixel count is editable**;
  committing a new value saves it to the device (the only way to make a
  fixed-size map apply). The input holds your entered value, dimmed, while the
  slow write is in flight.
- **IP** and reported **frame rate**.
- When firmware is available, a compact notice shows the installed version and
  opens the Controller's own web UI; choose **Settings → Updates** there to
  install it. Update-service failures stay silent and do not affect connection.
- The running pattern's **live controls**, draggable in real time. A control
  whose device value can't be read as a real `0..1` position — run-only patterns
  report none; saved patterns report mutated variable values, not slider
  positions — shows an **indeterminate** hollow-ring state with a `—` readout,
  still draggable so you can set it.

Closing and reopening the same device's panel shows last-known values immediately;
switching devices clears first.

### Send to Controller (patterns)

Send compiles the open pattern with the **device's own compiler** and pushes the
result. A small **Run / Save** pill beside the button picks the mode; the Send
button's glyph and tooltip follow it:

- **Run** (default) — load and run transiently. Plays immediately, but is **not**
  added to the device's Saved Patterns; its name lives only in the IDE.
- **Save** — persist into Saved Patterns *and* activate it. Save **overwrites in
  place**: repeated Saves update the same on-device program instead of piling up
  copies.

Run and save are tracked independently — a clean run push doesn't satisfy a
pending save; flipping the toggle re-arms Send. Changing a Controller profile
transform or matching pattern binding also re-arms Send even when pattern source
is unchanged. Send waits for any in-flight profile auto-save before generating
the artifact. The editor control remains the authoring-loop shortcut; the live
panel's action row is the always-available home for the same verbs. Send is
enabled when a Controller is connected and the pattern compiles cleanly; if the
IDE can tell the pattern's dimensionality won't match the device's installed
map, it says so. **Demos can be
sent directly**, no fork needed. There's no pixel-count warning on pattern push: a
pattern push sends bytecode only and keeps the device's existing map, so a count
mismatch is "this won't look right," not an error.

### Controller profiles

A **Controller profile** is the durable record of one physical device — keyed
by the Pixelblaze's stable device id, which the app reads directly from the
device on connect (falling back to cloud discovery), never by IP. The live
panel's **Profile ›** link opens it (and a signed-in session creates the profile
automatically the first time when stable device identity is available); the
profile page at `/studio/controllers/<id>` is editable even while the device is
offline:

- a **status strip** — connected/offline, last-known device name, IP, pixel
  count, map dimensionality, firmware — with Refresh and **Import map** buttons
  when live. Device name, IP, and firmware are last-seen metadata:
  discovery/connect refreshes them when newer values are observed. Import map
  reads the device's installed pixel map, opens the matching Studio map when the
  byte fingerprint is recognized, or saves a separate frozen user map when it is
  genuinely foreign. Imported maps stay even if the Controller profile is later
  deleted;
- **saved programs** — the profile route's right-hand pane is a read-only live
  inventory of the patterns installed on the Controller. Programs that this IDE
  saved are listed first and link back to their Studio pattern or built-in demo.
  Programs without an IDE binding remain visible in a quieter, counted
  foreign-program group. A transform badge marks each row **current** when its
  saved push record matches the transforms enabled on the profile now,
  **stale** when the enabled set changed (re-push to update), or **unmanaged**
  when no Studio push record exists. These badges recompute locally as profile
  transforms change; only Refresh rereads the device. Offline, empty, loading,
  and read-error states are reported in place. **Import** reads the saved PBP:
  a program whose PXLBLZ stamp still names an existing Studio pattern simply
  opens it; a stamped program whose pattern was deleted restores that pattern
  with its original Studio id; and a foreign source-bearing program becomes a
  new Studio pattern. The confirmation explains which name, source, and id were
  recovered or newly assigned. Programs without recoverable source say why they
  cannot be imported rather than creating an empty pattern;
- **hardware inputs** — named pots/buttons with pin, signal, role, smoothing,
  fallback, and invert; analog choices are limited to the board's ADC1-safe
  pins, with anything else flagged inline;
- **global transforms** — hardware brightness (pot × output) and power cap,
  each toggleable and auto-saved immediately without a separate Save button.
  Auto-save changes the profile; the transform takes effect in generated code
  the next time a pattern is pushed, so saved programs need another push after
  a change. Hardware brightness samples the chosen input once per frame and
  multiplies `hsv()` output brightness. Power cap scales `hsv()` and `rgb()`
  output when estimated duty exceeds its normalized limit, using a short
  per-frame response signal rather than the slower display averages. Neither
  transform currently covers `paint()` output. Set the power limit directly as
  a percentage, or use **From power budget** to derive it from full-white mA/pixel, Controller
  brightness, and target amps. Full-white mA/pixel is durable installation data,
  defaults to 60, and remains visible in both modes. Calculator brightness and
  target amps remain as derivation provenance; editing duty directly switches to
  direct mode without losing them. Pixel count comes from the profile rather than
  an editable calculator field, so changing the installation changes the displayed
  amps equivalence without silently changing the stored duty cap;
- **pattern bindings** — pattern × input → an exported slider, a named
  function, or a variable with min/max/quantize. These are applied at Send to
  Controller time without editing the pattern source;
- **zones** — named lists of pixel ranges used by Shows. A zone can be
  one contiguous strip slice or several ranges that act as one semantic stage.
  Preview reads these ranges as soon as a matching live Controller profile is
  active, or when exactly one offline profile has zones configured.

The page never duplicates live controls — brightness and the running pattern's
sliders stay in the live panel.

For analog pots, use a linear 10k potentiometer when possible: connect the outer
lugs to **3.3V** and **GND**, and the wiper to an ADC1-safe Pixelblaze analog
input. Do not feed 5V into a Pixelblaze analog input. Under WiFi, use the
ADC1-safe pins offered by the Controller profile input picker.

### Send map to Controller

Writes the open custom or stock map to the device's **single shared map slot** — a
deliberate, confirm-first action, since one map is shared by every pattern on the
device. The IDE re-bakes the map to the device's exact pixel count first, because
the firmware drops any map whose point count doesn't match (**Understanding
Maps** §5).

## 12. Good to know

- **Patterns run on your browser's main thread.** A genuinely infinite loop can
  freeze the tab — there's no watchdog like real hardware has. The IDE only runs
  code that compiles cleanly, which reduces but doesn't eliminate the risk.
- **`perlin` and the random functions diverge slightly** from firmware even in
  Precise mode — different algorithms, not reverse-engineered. Pure integer math
  is bit-identical on both sides.
- **Sensor-reactive patterns load and run**, but the sensor inputs (sound FFT,
  accelerometer, light) are inert stubs, so they won't animate from audio or
  motion in the preview.
- **Your work follows your account.** Personal patterns, maps, mixins, shows, and
  observed controller profiles live in your signed-in cloud workspace,
  available from any machine. Controller profiles are created when hardware is
  connected and named from the Pixelblaze device name; signed-out sessions are
  non-durable demo mode — nothing you make there persists.
- **Push transforms are inspectable.** Renderer adapters are automatic when
  hardware parity requires them; Controller-profile transforms remain opt-in.
  If the connected device's
  Controller profile has hardware brightness, power cap, or a matching pattern
  binding enabled, Send to Controller generates a derived artifact (the pattern
  samples the configured input once per frame and applies the selected
  transform/binding). The Controller's native brightness slider remains the hard
  safety cap and is never copied from preview brightness. The generated source
  saved into a persisted PBP carries the same `pxlblz:1` identity banner as Copy
  and Download; run-only bytecode has no source section. After a transformed
  push, the Controller profile and mixin provenance panes show the transform
  summary, warnings, renderer-adapter provenance/cost, and a read-only view of
  the generated artifact.

---

For the platform itself — fixed-point, maps, the WebSocket wall — see the
**Pixelblaze Ecosystem Primer**. For making patterns fast, **Optimizing
Pixelblaze patterns**. For how PXLBLZ is built, the **PXLBLZ Technical
Reference**.

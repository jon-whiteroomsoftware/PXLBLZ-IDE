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

- **Pattern management on the device.** It won't list, rename, or delete the
  device's saved patterns, or drive playlists. Push to Controller one pattern at
  a time (run or save) (§11).
- **Read patterns back from a controller.** The import path is `.epe` files, not
  a device connection.
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
  `/studio/maps/<id>`, `/studio/mixins/<id>`, `/studio/controllers/<id>`.
- **Accounts**: sign in with GitHub or Google. Both can attach to one account —
  the account menu offers **Connect** for the other provider (and Disconnect,
  as long as one login remains). A Google sign-in whose verified email matches
  your existing account links automatically. Your patterns, maps, mixins, and
  controller profiles live in your cloud workspace, on any machine you sign
  into.
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
  hardware profile pages (§10). Shows is a placeholder for the upcoming
  composition feature.
- **Editor pane** (centre) — Monaco, in pattern, map, or mixin mode (§9).
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

## 4. Maps and embeddings — what's read vs. how it's drawn

Just like real hardware, a **pixel map** describes where each LED sits, decoupled
from chain order. The IDE splits "layout" into two deliberately separate controls:

- The **Map** control picks the geometry your pattern *reads* — the coordinates
  fed to `render2D`/`render3D`. It lives inside the **PIXELBLAZE block** of the
  deck, with the other settings a real device would carry.
- The **embedding** control picks how the dots are *drawn* — a viewport choice the
  device never sees. It sits on the **transport row** beside play/pause.

Which controls appear depends on the pattern's dimensionality; a control that
offers no real choice is hidden, not disabled:

| Pattern | Map control | Embedding control |
|---|---|---|
| 1D | — (no map at all) | shape: **line**, **ring**, or **pole** (a helix with adjustable wrap density) |
| 2D | ✓ | surface: **Flat** or **Cylinder** (proportions follow the map's aspect) |
| 3D | ✓ | — (the map owns the geometry) |

**Stock maps** ship ready to use: Square, Wide 2:1, Ring, a 3D set in
shell/volume pairs — Cube, Sphere, Star, and Tetra (a d4), where "shell" puts LEDs
on the surface and "volume" fills the interior — plus Sunflower pucks as both
the fixed-length 160-point literal 3D coordinate array and a 2D X/Y projection
of the same measured LED clusters. Every stock map is real, pasteable Mapper
code: reveal **Stock Maps** in the Maps rail, open one read-only at its stable
`/studio/maps/<id>` route, and **Clone** it into an editable copy.

**Custom maps**: click **New Map** and you get an editor for real Pixelblaze
Mapper source: either a literal coordinate array (`[[x,y], ...]` or
`[[x,y,z], ...]`) or a plain `function(pixelCount)` returning one. Function maps
are full JavaScript with `Math.*`, authored in whatever units fit your build.
Custom maps re-bake automatically as you edit (the same once-at-save evaluation
hardware does) but never change the running preview on their own; you assign a map
to a pattern with the preview's Map control.

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

## 5. Patterns, built-ins, and libraries

The rail's Patterns list holds your personal patterns followed by a collapsible
**Built-in Patterns** section. The Gallery remains the public browse/detail
surface: it can send catalog patterns to a Controller directly, and **Open in
Studio** opens the built-in read-only in Studio for code inspection and cloning.
Maps mode lists your custom maps followed by collapsible **Stock Maps**; Mixins
mode lists your cloud mixins followed by collapsible **Stock Mixins**. Signed-out
use is demo mode: the Gallery, built-in patterns, stock maps, stock mixins,
libraries, docs, and preview controls remain usable, while durable personal
resources wait for sign-in.

A new pattern starts from a runnable animated starter; any built-in pattern,
stock map, or stock mixin can be **cloned** into an editable copy. Built-in patterns can open
with a recommended map, pixel count, and solidity — defaults only, everything
stays switchable (§8).

The bundled **libraries** live in the header's Libraries menu — click one to view
its source read-only, hover for its API reference:

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
  automatically when the connected device reports a stable id; IP-only
  unclaimed connections remain live without being persisted unless you create a
  profile yourself. The profile page is offline-editable; live brightness and
  running-pattern controls stay in the top-right panel.
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
  used inlined, `export`s preserved — exactly the format the device expects. Paste
  it into the built-in Pixelblaze editor or upload the file. Disabled while your
  code has a compile error.
- **Import** opens `.epe` files exported from the Pixelblaze hardware editor; they
  land as new editable patterns.

---

# Part 2 — Reference

## 8. Control deck, control by control

Controls group by what they *are*, and the IDE keeps that boundary visible.

### PIXELBLAZE block — settings real hardware would carry

These would round-trip to a controller:

- **Map** — the geometry the pattern reads (§4). A stacked full-width field
  (map names are long). Absent entirely for 1D patterns.
- **Pixels** — the LED count, a single number; the map arranges it (the Square
  map squares it up).
- **Fit** — the Fill/Contain choice, mirroring the Pixelblaze Mapper's own
  dropdown; both are real device behaviours, chosen per pattern. **Contain**
  (default) preserves the map's true aspect — a circle stays a circle; **Fill**
  stretches each axis to the unit square. Absent for 1D.
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
  native dimension (a pattern's dimension is the highest render function it
  defines). Maps have no 1D form, so the 1D pill is hidden in Maps mode; entering
  Maps with the lens on 1D silently switches it to 2D. Empty demo subsections hide
  rather than leaving bare headers. The lens is ephemeral (resets on reload), and
  the active document stays loaded even when filtered out of view.
- **Name search** — the magnifier expands into a type-down filter that
  AND-combines with the lens. An active query force-expands collapsed groups to
  surface hits, restoring their collapse state when cleared. Search text is kept
  separately for Patterns and Maps; the lens is shared.

The strip and filter row stay fixed; only the lists scroll. Personal patterns,
maps, and mixins are created, renamed, and deleted by you; they live in your
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
- **Shows** — a placeholder for the upcoming composition feature; nothing to
  open yet.

## 11. Controller reference

### Connecting

The helper is a Chrome extension that relays the `ws://` connection a deployed
page can't open itself. With it installed, a **Connect** affordance appears top
right; its dropdown offers two ways in:

- **Discover** — lists Pixelblazes found via ElectroMage's cloud finder (the same
  service the official tools use; your device needs to have reached the internet
  at least once). The list runs automatically when the dropdown opens and
  refreshes periodically; a rescan button (spins while working) forces a fresh
  look. Click a device to connect.
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

### Live panel

A pinned popover under the active pill, polled live, in rows:

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
pending save; flipping the toggle re-arms Send. Send is enabled when a Controller
is connected and the pattern compiles cleanly; if the IDE can tell the pattern's
dimensionality won't match the device's installed map, it says so. **Demos can be
sent directly**, no fork needed. There's no pixel-count warning on pattern push: a
pattern push sends bytecode only and keeps the device's existing map, so a count
mismatch is "this won't look right," not an error.

### Controller profiles

A **Controller profile** is the durable record of one physical device — keyed
by the Pixelblaze's stable device id, which the app reads directly from the
device on connect (falling back to cloud discovery), never by IP. Signed in
with a live device, the panel shows a **Controller profile →** row (or the
profile is created automatically the first time); the profile page at
`/studio/controllers/<id>` is editable even while the device is offline:

- a **status strip** — connected/offline, last-known device name, IP, pixel
  count, map dimensionality, firmware — with a Refresh button when live;
- **hardware inputs** — named pots/buttons with pin, signal, role, smoothing,
  fallback, and invert; analog choices are limited to the board's ADC1-safe
  pins, with anything else flagged inline;
- **global transforms** — hardware brightness (pot × output) and power cap,
  each toggleable (hardware brightness is what Send to Controller applies
  today; power cap is stored but not yet applied on push);
- **pattern bindings** — pattern × input → an exported slider, a named
  function, or a variable with min/max/quantize;
- **zones** — named pixel ranges, groundwork for Shows.

The page never duplicates live controls — brightness and the running pattern's
sliders stay in the live panel.

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
- **Your work follows your account.** Personal patterns, maps, mixins, and
  controller profiles live in your signed-in cloud workspace, available from
  any machine. Signed-out sessions are non-durable demo mode — nothing you make
  there persists.
- **Push transforms are opt-in and inspectable.** If the connected device's
  Controller profile has its hardware-brightness transform enabled, Send to
  Controller injects that behaviour into the pushed artifact (the pattern
  samples the configured pot and scales its output). With no profile or the
  transform off, the push is byte-identical to the plain artifact.

---

For the platform itself — fixed-point, maps, the WebSocket wall — see the
**Pixelblaze Ecosystem Primer**. For making patterns fast, **Optimizing
Pixelblaze patterns**. For how PXLBLZ is built, the **PXLBLZ Technical
Reference**.

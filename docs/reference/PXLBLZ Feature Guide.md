# PXLBLZ — Feature Guide

PXLBLZ-IDE is a browser authoring environment for Pixelblaze: a public Gallery
of running Patterns, a cloud-backed Studio for writing your own, a
hardware-faithful preview, and an optional live connection to real Controllers.
Almost everything works without hardware.

This guide introduces every major feature and details none of them
exhaustively; each section ends where a deeper document begins. If Pattern,
map, control, or fixed-point are unfamiliar terms, start with the **Pixelblaze
Ecosystem Primer**. If you are working on PXLBLZ itself, use the **PXLBLZ
Technical Reference**.

Four rules shape the product:

- The Gallery shows built-in Patterns as live previews, and any of them opens
  in Studio.
- Studio is the signed-in working environment: Patterns, maps, mixins,
  libraries, Controller profiles, and Shows, saved to a cloud workspace.
- Hardware is always explicit. A Controller can be connected from anywhere in
  the app, but nothing reaches it except a deliberate Run, Save, or Send.
- Preview state is not hardware state. Light size, diffusion, playback speed,
  and Fast/Precise rendering stay in the browser.

---

# Part 1 — Gallery, Studio, Docs

## 1. Gallery

`/gallery` is the landing page and the public Pattern catalogue. Cards run the
real preview engine; filter by dimension, directory, or name. Directories have
shareable routes (`/gallery/zranger1`), and each Pattern has a detail page at
`/p/<slug>` with a large live preview, the Pattern's exported controls, a
Preview/Code switch with read-only source, **Run** and **Save** when a
Controller is connected, and **Open in Studio**.

Diagnostic Patterns in the **Test Patterns** folder remain available in Studio
but are excluded from the public Gallery, including its directories and detail
routes.

Each built-in Pattern carries one recommended presentation — map, LED count,
light size, diffusion — so it displays consistently everywhere. Built-in slugs
are public; personal Patterns do not have public detail pages yet.

## 2. Studio

`/studio/...` is the working environment. The left rail switches between six
entity kinds, each with stable routes:

| Rail mode | What opens |
|---|---|
| Patterns | Editable personal Patterns and read-only built-ins |
| Shows | Timeline-based multi-Pattern choreography |
| Maps | Editable custom maps, frozen imports, and read-only stock maps |
| Controllers | Durable profiles for physical Controllers |
| Mixins | Reusable pass-engine transformation source |
| Libraries | Reusable Pattern functions and shared state |

Studio has three panes: the rail opens and creates things, the center pane
edits source or a Show timeline, and the right pane supplies context — Pattern
preview, map wiring check, library API reference, saved Controller programs,
or the Show Stage. Opening a map or library changes the editor context; it
does not add a tab or silently apply that object to the running Pattern.

Personal content lives in compact trees with folders, drag reordering, search
that sees into collapsed branches, and a Trash that appears only when needed.
Emptying the Trash is the one permanent deletion in the rail, so it always
asks for confirmation — from the rail row or from inside the Trash itself.
Built-in and stock catalogues sit below in fixed folders, including a
**ZRanger1** folder of his published community Patterns. Built-in definitions
never change; Built-in Shows alone accept session edits that Reset or reload
discard. A new workspace starts with one editable **Start Here** example of
each kind. The center-pane title is the rename control, and **Space** toggles
preview playback anywhere outside a text field.

### Accounts and persistence

Studio requires sign-in with GitHub or Google; logins that share a verified
email open the same workspace. Personal content lives in the signed-in cloud
workspace. Signed out, the app is a non-durable demo — Gallery, built-ins,
stock content, docs, preview, and live Controller connections all work, but
saving personal content requires sign-in. A Show edit that cannot reach the
workspace rolls back visibly: the editor posts a notice with Retry instead of
failing silently.

## 3. Docs and API reference

**Docs** and **API** in the global header open public, read-only reference
workspaces without entering Studio. Both deep-link: `/docs/<id>` selects a
guide, `/reference/<library>` selects a built-in or stock Library reference.
Entering the API Reference from Studio appends **My libraries**, generated
from the `//` doc comments in your own cloud Libraries.

---

# Part 2 — Patterns, preview, and maps

The core loop: write Pixelblaze source, watch a faithful preview react, choose
the geometry it renders across.

## 4. The editor

The center editor is Monaco — the engine behind VS Code — configured for the
Pixelblaze language: completion, signatures, hover documentation, inline
errors, and a Good/Broken status. Clean source reaches the preview after a
short typing pause and auto-saves on a slower tick; broken source stays
visible with markers while the last clean version keeps running.

When edits cannot reach durable storage, the editor says so instead of staying
silent. A small cloud glyph joins the header badges in two cases: amber while
the source has errors (only clean source is auto-saved — fixing the errors
resumes saving), and red while a save is failing (offline or server error —
the editor keeps retrying automatically and clears the glyph on the first
success). The same glyph appears in the pattern, map, mixin, and library
editors, and closing the tab in either state asks for confirmation. An edit
that fails to save while switching views is reported with an inline notice
naming the record, so nothing is lost silently. One-shot edits outside the
editors — Show fields and Controller profile changes — roll back if their
save fails and report it with the same notice offering Retry.

Built-in Patterns open read-only; **Clone** creates an editable personal copy
and snapshots the current preview settings. Every built-in starts with a
source manifest — name, provenance, visual description, what each control
changes — and the header travels with clones.

Exported functions create the standard Pixelblaze controls: `sliderName(v)`,
`toggleName(v)`, `hsvPickerName(h, s, v)`, `rgbPickerName(r, g, b)`. Every
`export var` appears in the var watcher and updates each frame.

### Value fields

Numeric fields across Studio share one control: an exact text box with a fixed
unit suffix, plus a grip that opens a transient high-resolution slider. Drag
to preview continuously and save once on release; hold Shift for fine
adjustment; pin the slider for full keyboard control. Typing edits a local
draft that applies on Enter and cancels on Escape. Sliders, pickers, selects,
and checkboxes stay atomic.

Units are semantic, not inferred from storage. Normalized scalars display as
percentages (`72%` displays, `0.72` is stored). Multipliers use `x` notation
with `1x` neutral. Aspect values show small-integer ratios (`16:9`). Time
fields use decimal seconds with a detented 0–30s ruler; larger values stay
available through exact entry. Angles display degrees or turns by concept,
store turns, accept either on entry, and never normalize an authored
multi-cycle value — animating `0` to `720°` still spins twice.

## 5. Preview

The preview executes the transpiled Pattern in the browser and draws its
pixels as a WebGL point field — 1D, 2D, and 3D, with orbiting, depth, and
glow. Interactive 3D views share one tool rail: pause/resume auto-orbit, reset
view, and 0.5x–2x magnification, with wheel zoom in coarse steps.

Pixelblaze hardware computes in 16.16 fixed-point; browsers compute in
float64. The preview therefore offers two renderers:

- **Fast** — ordinary float64, the everyday editing mode.
- **Precise** — emulates fixed-point overflow, quantization, and bitwise
  behavior closely enough to expose the failures that make shader ports look
  fine on a laptop and break on hardware. An emulation, not a bit-for-bit
  firmware clone.

The preview deck separates settings by whether hardware could carry them.
**PIXELBLAZE** settings — map, modeled pixel count, Fill/Contain fit,
brightness — describe what the Pattern computes against. **PREVIEW** settings
— renderer, playback speed, light size, diffusion, solidity — describe how the
browser draws it. Most settings are remembered per Pattern. None of them ride
along with **Send to Controller**, and preview brightness is no substitute for
physical brightness planning. **Reset preview** clears those remembered preview
setting overrides; exported Pattern controls remain live runtime controls and
restart from the Pattern's own defaults when the Pattern reloads.

## 6. Maps and display geometry

A Pixelblaze map is an ordered coordinate set: array position is the LED
index, the value is what the Pattern samples. PXLBLZ keeps two ideas separate
— **sample**, the coordinate delivered to the Pattern, and **position**, where
the preview draws that LED. That is why a 1D map can display as a Line, Ring,
or Pole without changing what the Pattern computes.

Every Pattern may try every map dimension. Exact-dimensional choices appear
under **Recommended**; the rest stay available, with missing trailing
coordinates centered at `0.5` and extra coordinates dropped. Generated
geometry is catalogued by physical family — Paths, Surfaces, Shells, Volumes,
Custom/imported — and each family exposes only the coordinate views it can
honestly own.

Stock maps are real, self-contained Mapper JavaScript: inspect them read-only,
preview with them, send them to a Controller, or clone them. **New Map** opens
plain JavaScript — a literal coordinate array or a `function(pixelCount)`
returning one. The map context pane is a wiring check, not a Pattern preview:
it colors points in wire order, preserves physical aspect, uses a see-through
draw so depth cannot hide points, and reports bounds, dimensions, and
coincident coordinates. A connected Controller can **Import map** from its
installed `/pixelmap.dat`; byte-identical known maps are recognized rather
than duplicated.

**Contain** preserves aspect by scaling all axes from one shared range;
**Fill** stretches each axis independently to `0..1`. Both are real Mapper
behaviors. The built-in **MapAlignmentDiagnostic** Pattern checks any map with
red X, green Y, and blue Z bands. For map theory, read **Understanding Maps**.

## 7. Libraries and mixins

Both are reusable source with different jobs: a Pattern *calls* a library; the
pass engine *applies* a mixin.

A **Library** is a namespace of functions and shared `var` state, called as
`SDF.circle(...)`. Compilation flattens only the functions actually used into
one flat Pixelblaze artifact. PXLBLZ ships `SDF`, `Anim`, `Color`, `Coord`,
`Noise`, and `Shader` read-only; personal libraries auto-save and compile
through every Pattern path. `//` comments above functions become editor help
and API Reference entries.

A **mixin** is transformation source applied to a Pattern without editing it:
**inject** adds source, **intercept** wraps output calls such as `hsv`, and
**bind** connects a normalized input to a function or variable. Mixins stay
generic; Controller-specific pins and limits belong to Controller profiles
(see [section 10](#10-controller-profiles)).

## 8. Files and manual workflows

- **Copy Code** and **Download** emit one flat, tree-shaken `.js` artifact.
  Preview metadata never leaves the browser.
- **Import `.epe`** creates a personal Pattern from `sources.main`, restoring
  a preferred map when it can be matched.
- Built-in Patterns run and save directly; cloning is only needed to edit.
- Show `.epe` exports are standalone generated Patterns usable by normal
  Pixelblaze tools.

---

# Part 3 — Live hardware

PXLBLZ works fully without hardware. With a Controller there are three layers:
a live connection, a durable per-device profile, and explicit send actions.
Nothing crosses to hardware as a side effect.

## 9. Connecting a Controller

Live access goes through the PXLBLZ Chrome extension, because an HTTPS page
cannot open a Controller's insecure LAN WebSocket directly. Pick a discovered
Controller or enter its IP from the top-right menu; Chrome asks once per LAN
host. Several Controllers can stay connected with one active, tracked by a
connection-state pill.

The live panel shows native brightness, installed map identity, FPS, IP, pixel
count with mismatches flagged, the running Pattern's controls and watched
variables, and power telemetry when the generated Pattern exposes it.
Brightness and live control writes are volatile; pixel count is a deliberate
saved write with an explicit apply. PXLBLZ never installs firmware — when an
update is available it points to the Controller's own **Settings → Updates**.

Map identity matters because firmware silently drops a mismatched map. The
panel flags a map/pixel-count disagreement with an amber `256≠300` chip,
distinguishes **Unknown map**, **Reading map...**, **No installed map**, and
**Map unavailable**, and refreshes the map once when the panel opens.

**Play/Pause** freezes or resumes the Controller's active renderer — the
Controller itself, not the open Studio artifact. The command is volatile and
never writes flash. Because Pixelblaze does not report authoritative paused
state, a fresh connection starts at **Pause**, a reconnect treats the state as
unknown, and **Resume** stays available as the safe recovery. The panel uses
the live FPS heartbeat to refine this: positive FPS offers Pause, zero keeps
Resume.

## 10. Controller profiles

A Controller profile is durable configuration for one physical Controller,
keyed by its stable device id rather than its IP. It appears when signed in
and connected hardware reports that id, and stays editable offline. A profile
holds last-seen device facts, hardware inputs and their uses, the installation
power policy, named zones used by Shows, and map fingerprints. The page has
three sections: **Power**, **Inputs**, and **Last generated artifact**. Zones
are still stored and still compile into Shows, but they are Installation Show
setup and are no longer edited here (#775).

Map and firmware facts keep their last conclusive observation while offline; a
failed refresh never erases a last-known value.

Rename a profile from its row menu or by selecting its name in the page header.
The authored name remains while the profile is offline. When that physical
Controller is seen again, its current Pixelblaze device name becomes the profile
name; the separate last-known device-name fact records that same observation.

### Inputs and their effective uses

The input is the unit of the interface. Each entry is one physical control
wired to the board — a potentiometer or a button — and owns both its physical
definition and the complete list of everything it drives. (A linear 10k pot
across 3.3V and GND is the standard part — never feed 5V into a Pixelblaze
analog input.)

An input's card shows its `IOxx` pin, one line of physical facts, and one row
per effective use:

- **Brightness** samples the input each frame and scales supported output
  calls — separate from the Controller's native brightness, which remains the
  final physical safety control. Its row states its own scope: `every
  Pattern`, or `every Pattern except Caustics` when a Pattern use on the same
  input takes precedence.
- **A Pattern use** routes the input to an exported slider, function, or
  variable for one Pattern, applied once per frame without editing Pattern
  source.

An input driving nothing says so rather than showing an empty card. Set-once
physical parameters (pin, signal, smoothing, fallback, inversion) live behind
**Adjust**. The brightness switch writes the profile's single
hardware-brightness transform, so assignment is exclusive by construction.
What the page shows is what the next push will generate.

Validation reports on the input that owns the problem, with a one-click
correction where one exists — hardware brightness on a digital input, for
example, offers **Switch this input to analog** or a move to a free analog
pin. An invalid Pattern use is marked blocked with a **Fix** that opens its
binding fields.

**Keep Patterns up to date** rewrites managed artifacts by itself after a
profile edit that changes generated code — and only then. An edit or upgrade
that cannot change generated code never triggers a rewrite.

### Power

The Controller estimates draw live from the duty cycle of the running
Pattern. Two gates come first: **Limit power** switches enforcement on or
off, and a segmented control decides how the duty cap is set — **Fixed cap**
or **From load and budget**. Only the chosen flow renders its fields, and
switching enforcement off collapses the section to a one-line summary of the
kept cap.

Both flows share the full-white load: a **Construction estimate** (presets
named by chipset — WS2812B/SK6812, WS2811, WS2815) or your own **Measured
total** in amps or watts, with the supply voltage asked for only there. A
fixed cap is set with a slider and states what it holds the installation to
in watts and amps; the derived cap divides the supply budget by the
full-white load, with one readout chain stating the whole derivation. The
cap changes every generated Pattern. PXLBLZ does not pretend to be an
ammeter or replace physical power-system design.

Two built-in diagnostics help here: **AnalogWiggleFinder** identifies which
analog pin a potentiometer is on (run it on the Controller and sweep the pot),
and **View generated artifact** always shows exactly what a profile inserted,
wrapped, or bound.

## 11. Run, Save, and keeping hardware current

**Run** and **Save** compile with the Controller's own compiler. Run loads
transient bytecode; Save writes a durable saved Pattern and activates it. The
two have independent dirty state: a clean Run does not pretend the Pattern was
saved.

The profile's right pane splits the live Controller inventory into **Saved
PXLBLZ Patterns** and **Other Patterns**. Saved rows link back to their
source, including Show outputs; Other rows stay visible and untouched - never
modified, renamed, or deleted.

Saved PXLBLZ Patterns is the only profile surface that claims whether a saved
artifact still matches its code-affecting Controller profile and live map
dimension. **CURRENT** means its recognized durable signature matches exactly;
**PUSH AGAIN** means both signatures are known and differ; **UNKNOWN** means
there is not enough recognized evidence for either claim. A same-connection
metadata refresh keeps the rows visible but retires their earlier steady claim
to UNKNOWN; offline, reconnecting, and failed reads make no freshness claim.
**QUEUED**, **SYNCING**, and **FAILED** remain visible while automatic refresh
work is active. **Import** is offered for Other Patterns that contain source;
compiled code without source cannot be reconstructed.

A Controller has one shared map slot, so **Send map to Controller** is a
confirm-first configuration action, not a per-Pattern preference. PXLBLZ
re-bakes function maps for the Controller's pixel count and flags mismatches.

---

# Part 4 — Shows

A Show composes existing Patterns into time-based choreography — Clips on
Layers, Layers inside Zones, Transitions between connected Clips — and
compiles all of it into **one ordinary Pixelblaze Pattern**. The source
Patterns stay reusable; the Show owns timing, routing, adaptation, and one
permanent output contract. Deep treatments live in the
[Visual Effects Guide](../guides/Visual effects guide.md) and
[Inside the Show Compiler](../guides/Inside the Show compiler.md).

## 12. What a Show is

**New Show** opens a two-way choice that becomes the Show's permanent output
contract:

- **Portable** promises LED-resolution independence across compatible 2D
  mapped surfaces. Its map and count are an authoring reference, not device
  identity.
- **Installation** fixes one pixel count and output map for a known physical
  build, and unlocks physical zone ranges and Controller targeting.

The contract stays visible in the timeline header. Show setup supports
outputs through 2,000 pixels; entries above that ceiling clamp to it during
setup rather than blocking later. Stock maps scale to whatever count you set,
while a map imported from your Controller carries its measured count and
locks the field as **Fixed size**.

Two shortcuts skip parts of this flow. With a Controller profile selected in
the rail, **Add** also offers **New show from _profile_**, seeding an
Installation Show directly from that profile's zones, map, and last-known
pixel count. And an existing personal Show duplicates from its rail row menu
(**Duplicate**), copying the whole Show under a fresh name.

## 13. The timeline

The editor is one proportional timeline of Pattern Clips on explicit Layers,
with a shared ruler, playhead, transport, and Navigator. The essentials:

- **Transport.** Space plays and pauses, A rewinds, 1/2/3 select playback
  speed, arrows seek five seconds. Click or drag the ruler to seek. Scrubbing
  replays from Show start, so seek is exact and deterministic — never
  approximate.
- **Snap and grid.** Drags land on the ruler's tick grid and snap magnetically
  to Clip, Transition, Marker, playhead, and Show-end boundaries. Shift gives
  a fixed tenth of a second; Alt suspends snapping for one gesture.
- **Clip edits.** **Add Clip** places a Pattern at the playhead;
  double-clicking empty Layer time opens the Pattern chooser at that spot.
  Dragging moves without overwriting, Option-drag duplicates, edges resize,
  **Split** divides at the playhead, **Clone** duplicates in place. Each
  Clip's second row summarizes its authored controls, view changes, Effects,
  and animation as compact dot-separated values. Every commit is one undo
  step (Cmd/Ctrl+Z). Undo history is session-only: a reload clears it.
- **Selection and detail.** Selecting a Clip, Group, Transition, Zone, or the
  Show opens a floating Entity Detail Panel with that entity's exact editable
  fields. Summary facts are shortcuts: select one to open the owning tab and
  focus the field. Escape peels one surface per press. One panel may be
  pinned for comparison.
- **Progressive structure.** **Layer** adds a compositing lane. **Zones**
  reveals the Zone rail only when routing structure is needed.

The toolbar keeps transport, time, editing, and view controls in distinct
clusters. Marker creation and marker visibility stay together, and active
states use the same amber accent as timeline selection.

### Groups

Drag a marquee across Clips and **Group** them: one selectable occurrence
across its occupied Layers, with exact Start, base Layer, and X/Y offsets.
**Duplicate** creates linked occurrences sharing one definition — edits appear
in all of them, while each occurrence gets fresh Pattern runtime instances.
Double-click to edit a Group in place with everything else dimmed; **Make
Unique** breaks the link, **Ungroup** dissolves the container. Groups cannot
nest, and a Group must fit inside one Zone Layout interval — a marquee that
crosses a Layout boundary cannot Group.

## 14. Clips: time, adaptation, and Effects

A Clip references a Pattern and adapts it non-destructively. The referenced
**Pattern instance** owns private state, clock, exported controls, Animation
speed, and time offset; several Clips may share one instance, so
instance-owned changes affect every linked Clip. **Make Pattern Independent**
clones the settings for one Clip; splitting keeps the instance, preserving
motion through the cut.

Presentation belongs to the Clip: **Live** shows the running Pattern,
**Freeze** holds the entry frame, **Strobe** re-captures at a cadence,
**Blink** gates output without pausing Pattern time, and **Stutter**
quantizes the shared clock so every linked Clip steps together. **Opacity**
appears only on overlay-Layer Clips, where it scales that Layer's blend over
the base; base-Layer Clips carry no Opacity control.

Compatible 2D Clips expose a **Transform** group (position, rotation, scale)
and an ordered **Effect stack** in the compiler's fixed stages: Transform,
Distort, Address, Color & output. The **Place** tab pairs a square manipulation
pad with exact X, Y, Width, Height, and Rotation fields, editing either the
**Content** rectangle or an optional **Aperture** — a shaped mask chosen from
the same silhouette catalogue the Shape-reveal Transitions use, with Soft,
Hard, or Dither edges.

**Effects > Add** opens a searchable registry grouped by stage — transforms,
distortions, address policies, and Color & output Effects including Luma key,
Chroma key, and Vignette. A focused row expands with its summary, cost notes,
and presets. Show-wide output Effects such as **Trails** live in Show
properties and apply after the full composite.

Two advanced policies trade fidelity for cost with measured double-digit FPS
wins on hardware: **Freeze at entry** replays one captured frame, and
**Refresh** re-evaluates a quarter of the pixels per frame. Numbers live in
**Show Rendering Optimization Results**.

## 15. Transitions and Property animation

A Transition is a visible, selectable junction between two connected Clips on
one Layer. A searchable registry covers Blend, Fade, Wipe, Dissolve, Shape
reveal, and Motion families; hovering previews on the Stage without saving.
Each variant's detail panel exposes only its legal fields — duration, easing,
geometry, edge policy — and **Reset to cut** returns to a zero-duration
boundary. Transition cost is explicit: wipes route each pixel to one member,
crossfades disclose their snapshot-versus-live policy, feathered reveals
evaluate both Patterns only inside the band.

Property animation uses one shared model: the destination owns its value, the
incoming boundary owns start, duration, and easing. Animation speed,
Brightness, Clip Transform, exported sliders, and routing split position all
animate the same way and appear as named sparklines beneath their Zones.
Select a Clip and use the diamond beside any animatable parameter: hollow
creates a two-point ramp, filled violet reopens the existing one. The Clip
summary's **Animations — N** opens an overview of every track — endpoint
values, time range, owning tab — and is the single place to remove one.
Tracks with more than two keyframes stay intact and read-only; the overview
never rewrites them.

## 16. Zones and routing

Zones disclose routing structure progressively. A new Show starts with one
full-output Zone and no Zone chrome; **Zones** toggles the rail. The **Zone
Map** (from the rail's column header) is the single home for the Zones
themselves — add, rename, recolor, delete. Zones are Show-wide.

Zone Layouts live on the timeline. The **Layouts lane** labels each stretch of
the ruler with the Layout that owns it; selecting an interval opens its
routing mode, shape parameters, and ranges. Duplicated intervals stay linked
to their source until **Make Unique**, exactly like Groups. The boundary
between intervals carries a selectable routing switch with destination,
duration, easing, and direction. Its destination list names Layouts by their
own names, while the lane labels intervals by routing mode — both refer to
the same Layouts. Moving and Soft Splits animate an owned position while
every Pattern clock continues.

The output contract determines what Zones mean:

- An **Installation** Zone Layout assigns zones to physical pixel ranges, with
  spatial selection on the saved output map and exact coverage validation —
  overlap, gaps, and out-of-range indexes block artifact output with an
  actionable explanation.
- A **Portable** Zone Layout pairs ordered logical zones with a normalized
  routing mode — Full surface, Stripes, Grid, Checker, Rings, Pinwheel, Wave,
  or an animatable Split — derived from runtime coordinates, so the same rule
  holds on any compatible surface.

The right pane is the read-only **Stage**: the Show rendered over its output
geometry, with the usual light size, diffusion, and renderer controls. Show
transport owns time; Pattern-level speed and controls stay out of the Stage.

## 17. Compile, cost, and export

The compile bar under the timeline reports creator-facing limits: delivered
**Show source**, VM array words, and actionable warnings or blockers. The
source figure expands into a byte-level inventory of contributors; when the
inventory finds actionable savings — an oversized contributor, or a Pattern
compiled into more than one machine — it adds a **Ways to slim this Show**
section, and stays silent when there is nothing actionable. The same
bar enforces the support envelope — outputs above 2,000
pixels, exhausted memory axes, or more than five simultaneous renderers per
pixel block outbound actions with a named cause, while editing and preview
continue.

Outbound paths mirror ordinary Patterns: **View code**, **Run**, **Save**, and
**Export `.epe`** with provenance and a compatibility contract that import
recovers. Sending never changes the Controller's shared map or pixel count.
When replacing one very large resident program with another could exceed
transient memory, PXLBLZ automatically routes through a brief black run-only
Pattern first; the intermediary is never saved.

## 18. Built-in Shows to learn from

The Shows rail ships learning material beneath your personal Shows. **Learn**
holds numbered lessons that add one idea at a time. **Showcases** holds
reference catalogues for Effects, Transitions, Property animation, and easing,
plus finished scores such as the 2,000-pixel, five-surface **Redline
Installation**. **Remixes** holds finished pieces over community Patterns,
currently the Coronal Mass Ejection PXLBLZ remix over ZRanger1's Pattern.

Built-ins use the complete production editor. The first change creates a
session-only draft with normal undo; **Reset** or reload restores the shipped
definition. **Save a copy** keeps that work instead, saving the current draft
as a personal Show. Reference Showcases offer **Try with Pattern** to swap your own
Pattern through the same choreography.

---

# Part 5 — Boundaries

## 19. What PXLBLZ deliberately does not do

- Manage Wi-Fi, LED chipset, timezone, Output Expander setup, or other
  Controller settings. Use the Pixelblaze web UI.
- Rename, delete, or arrange device playlists (it lists and imports Saved
  Patterns).
- Recover source from a saved Pattern that contains only compiled code.
- Continuously synchronize hardware control positions with Studio preview
  controls.
- Publish personal Patterns to public Gallery URLs.
- Synchronize a Show across several Controllers.

## 20. Known preview limits

- Pattern execution runs on the browser main thread. A syntactically valid
  infinite loop can freeze the tab; clean compilation is not a watchdog.
- Sensor Expansion Board inputs are inert stubs: sensor-reactive Patterns
  load, but audio, accelerometer, and light data do not animate in preview.
- Fast mode uses float64. Precise mode emulates fixed-point arithmetic but
  not every firmware algorithm bit-for-bit.
- Show seeking reconstructs deterministic Pattern state exactly; Trails is a
  deliberate output-history exception, and wall-clock, network, and sensor
  history cannot be recreated from Show time alone.

## 21. Choose the next document by the job

| I want to… | Go here |
|---|---|
| Learn the Pixelblaze ecosystem from zero | **Pixelblaze Ecosystem Primer** |
| Understand maps, normalization, and `pixelCount` | **Understanding Maps** |
| Study Effects, Transitions, and animation by example | [Visual Effects Guide](../guides/Visual effects guide.md) |
| Make a Pattern faster on hardware | [Optimizing Pixelblaze Patterns](../guides/Optimizing Pixelblaze patterns.md) |
| See how a Show becomes one Pattern | [Inside the Show Compiler](../guides/Inside the Show compiler.md) |
| See measured Show rendering wins | **Show Rendering Optimization Results** |
| Understand how PXLBLZ is built | **PXLBLZ Technical Reference** |

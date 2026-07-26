# PXLBLZ — Feature Guide

PXLBLZ-IDE is a browser-based authoring environment for Pixelblaze. It gives
you a public Gallery of running Patterns, a cloud-backed Studio for writing
your own, a hardware-faithful preview, and an optional live connection to real
Controllers. Almost everything works without hardware; when hardware is
present, the same work can be run, saved, inspected, and recovered.

This guide is a tour of the knobs and dials: what each surface is for, which
dimensions of the product exist, and where to go when one of them becomes your
project. It introduces every major feature but details none of them
exhaustively — each section ends where a deeper document begins. If Pixelblaze
terms such as Pattern, map, control, or fixed-point are unfamiliar, start with
the **Pixelblaze Ecosystem Primer**. If you are working on PXLBLZ itself, use
the **PXLBLZ Technical Reference**.

Four ideas carry the whole product:

- **Gallery is the showroom.** Browse built-in Patterns as live previews, not
  screenshots, and open any of them in Studio.
- **Studio is the workshop.** Signed in, you author Patterns, maps, mixins,
  libraries, Controller profiles, and Shows, all saved to your cloud workspace.
- **The Controller surface is the loading dock.** Live hardware connects from
  anywhere in the app, and work crosses to it only when you explicitly send it.
- **Preview state is not hardware state.** Light size, diffusion, playback
  speed, and Fast/Precise rendering stay in the browser. Patterns and maps
  reach hardware only through a deliberate Run, Save, or Send.

---

# Part 1 — The lay of the land

Most work moves between three places: the public Gallery for discovery, Studio
for authoring, and the global Controller surface for live hardware. The same
Pattern and preview engine runs underneath all three, so opening, editing,
testing, and sending are different views of one workflow rather than separate
tools.

## 1. Gallery

`/gallery` is the landing page and the public Pattern catalogue. Its cards run
the real preview engine; filter them by dimension, category, or name, and open
a card for a shareable detail page at `/p/<slug>`. A detail page gives the
Pattern room to breathe: a large live preview with the Pattern's exported
controls, a Preview/Code switch with read-only source, **Run** and **Save**
when a Controller is connected, and **Open in Studio** for inspection and
cloning.

Each built-in Pattern carries one recommended presentation — map, LED count,
light size, diffusion, and the rest — so it looks its best everywhere it
appears. Built-in slugs are public; personal Patterns do not have public detail
pages yet.

## 2. Studio

`/studio/...` is the working environment. Its left rail switches between six
entity kinds, each with stable routes:

| Rail mode | What opens |
|---|---|
| Patterns | Editable personal Patterns and read-only built-ins |
| Shows | Timeline-based multi-Pattern choreography |
| Maps | Editable custom maps, frozen imports, and read-only stock maps |
| Controllers | Durable profiles for physical Controllers |
| Mixins | Reusable pass-engine transformation source |
| Libraries | Reusable Pattern functions and shared state |

The Studio is a three-pane environment: the left rail opens and creates
things, the center pane edits source or a Show timeline, and the right pane
supplies context — Pattern preview, map wiring check, library API reference,
saved Controller programs, or the Show Stage. PXLBLZ is a single-document
editor: opening a map or library changes the editor context rather than
adding a tab or silently applying that object to the running Pattern.
The expanded rail starts compact and remains resizable. An untouched right
pane also yields as browser zoom or a narrower window reduces the workspace,
keeping the center authoring pane at least equally wide until the preview
reaches its usable minimum. A deliberate divider resize remains remembered
per Studio mode.

The rail's personal content lives in compact trees with folders, drag
reordering, search that sees into collapsed branches, and a Trash that appears
only when something is in it. Built-in and stock catalogues sit below in fixed
folders. Their shipped definitions never change; Built-in Shows alone accept
session edits that Reset or reload discard. A brand-new workspace opens with
one editable **Start Here** example of each kind, so the first visit lands on
runnable source instead of four empty lists. The center-pane title doubles as
the rename control for personal content, and **Space** toggles preview playback
anywhere in Studio (and on Gallery detail pages) except while typing in a text
field or the code editor.

### Accounts and persistence

Studio requires sign-in with GitHub or Google; both providers can attach to
one account. Personal content lives in the signed-in cloud workspace. Signed
out, the app is a non-durable demo: Gallery, built-ins, stock content,
documentation, preview, and live Controller connections all work, but
creating and saving personal content requires sign-in.

## 3. Docs and API reference

**Docs** and **API** in the global header open public, read-only reference
workspaces without entering Studio. Both are deep-linkable: `/docs/<id>`
selects a checked-in guide and `/reference/<library>` selects a Pixelblaze
built-in or stock Library reference. **Back** returns to the exact route that
opened the reference. Entering the API Reference from Studio appends **My
libraries**, generated from the `//` doc comments in your own cloud
Libraries.

---

# Part 2 — Patterns, preview, and maps

This is the core creative loop: write Pixelblaze source, watch a faithful
preview react, and choose the geometry it renders across. Everything else in
the product builds on these three.

## 4. The editor

The center editor is Monaco — the engine behind VS Code — configured for the
Pixelblaze language, with completion, signatures, hover documentation, inline
errors, and a compact Good/Broken status. Clean source is pushed to the
preview after a short typing pause and auto-saved on a slower tick; broken
source stays visible with markers while the last clean version keeps running,
which is friendlier than replacing a working preview with a black rectangle
over one missing parenthesis.

Built-in Patterns open read-only; **Clone** creates an editable personal copy
and snapshots the current preview settings. Every built-in starts with a
compact source manifest — name, provenance, visual description, and what each
control changes — and that header travels with clones, so a Pattern opened
later in the Pixelblaze editor still explains itself.

Exported functions create the same controls Pixelblaze users know:
`sliderName(v)`, `toggleName(v)`, `hsvPickerName(h, s, v)`, and
`rgbPickerName(r, g, b)`. Control positions are remembered per Pattern. Every
`export var` appears in the var watcher and updates after each frame, with
arrays summarized element by element.

Straight normalized scalars are presented as percentages throughout Studio.
An exact field shows `72` with a fixed `%` suffix outside the editable box and
accepts either `72` or pasted `72%`; the saved Pattern, Show, or Controller
Profile still stores `0.72`. The small grip at the field's right edge opens a
high-resolution horizontal slider without permanently consuming inspector
space. Hold and drag to preview continuously and save once on release, or
click the grip to pin the slider for Arrow, Home/End, Enter, and Escape
control. A pinned slider keeps pointer capture during a drag, so releasing
after the pointer leaves the track still saves the final preview. The slider
popover remains part of its owning detail panel for outside-click behavior.
Preview and Controller deck sliders keep their full-width layout but use the
same percentage readout and accessible value text.

Percentage presentation is semantic, not inferred from a `0..1` range.
Brightness, opacity, duty, diffusion, public Pattern controls, ordinary Effect
amounts, thresholds, softness, and feather use it; gain controls may extend
past `100%`. Phase, turns, geometry, spatial scale, time, integer counts,
multipliers, and ratios retain their own units even when their storage happens
to be normalized.

Multiplicative values display their operation directly: `1x` is neutral,
`0x` pauses Animation speed, and other factors use the same `x` notation in
timeline summaries and the Preview speed selector. Editable fields show the
numeric part with a fixed `x` suffix outside the box and accept either `1.5`
or pasted `1.5x`. Animation speed, Clip Transform Width/Height, Repeat scale,
and multiplicative Effect or Transition parameters share this presentation.
Their compact slider marks `1x` and gives extra travel to the useful region
around neutral while preserving exact endpoints and zero. Compact Clip
summaries round numeric multiplier values to at most two decimal places
without changing the stored value.

Aspect values use ratios when the value has a clear small-integer form. For
example, a widescreen Aspect displays as `16:9`; exact entry also accepts the
equivalent decimal. Values without a concise ratio retain decimal notation.
Multiplier and ratio text is presentation only: saved Shows and generated
Pixelblaze artifacts continue to carry the same real numeric values.

Show time fields use the same compact exact-entry-and-grip interaction. The
editable box contains decimal seconds and keeps a fixed `s` suffix outside;
the transient ruler covers `0..30s`, marks every whole second, and labels
landmarks faintly. Short ranges also show half-second detents. Pointer travel
settles magnetically on nearby detents while retaining tenth-second choices
between them. The ruler is a fast adjustment surface, not a storage limit:
values beyond 30 seconds remain available through exact entry wherever the
Show model permits them.

Patterns may also call **libraries** with namespace syntax such as
`SDF.circle(...)` — see [section 7](#7-libraries-and-mixins).

## 5. Preview

The preview executes the transpiled Pattern in the browser and draws its
pixels as a WebGL point field, handling 1D, 2D, and 3D maps, including 3D
orbiting, depth, and glow.

Pixelblaze hardware computes in 16.16 fixed-point; browsers compute in
float64. The preview therefore offers two renderers:

- **Fast** uses ordinary float64 and is the everyday editing mode.
- **Precise** emulates fixed-point overflow, quantization, and bitwise
  behavior closely enough to expose the failure modes that make shader ports
  look fine on a laptop and explode on hardware. It is an emulation, not a
  bit-for-bit firmware clone; pure integer arithmetic is the strongest parity
  case.

The preview deck separates settings by whether hardware could carry them.
**PIXELBLAZE** settings — map, modeled pixel count, Fill/Contain fit, and
brightness — describe what the Pattern computes against. **PREVIEW** settings —
renderer, playback speed, light size, diffusion, and solidity — describe how
the browser draws it. Most settings are remembered per Pattern; light size and
diffusion have a global comfort baseline with per-Pattern overrides.

None of these settings ride along with **Send to Controller**. In particular,
preview brightness is not a safe substitute for physical brightness: a monitor
and several amps of LEDs are different animals.

## 6. Maps and display geometry

A Pixelblaze map is an ordered coordinate set: array position is the LED
index, and the value there is what the Pattern samples. PXLBLZ keeps two ideas
separate — **sample**, the coordinate delivered to the Pattern, and
**position**, where the preview draws that LED. That distinction is why a 1D
map can display as a Line, Ring, or Pole without changing what the Pattern
computes, and why one generated Cylinder can expose Strand, Surface, and
Spatial coordinate views over the same physical wall.

Every Pattern may try every map dimension. Exact-dimensional choices appear
under **Recommended**; the rest stay available under **Other dimensions**,
with missing trailing coordinates centered at `0.5` and extra coordinates
dropped:

| Selected map | Pattern receives | Display choice |
|---|---|---|
| Index / 1D | `[x]` | Line, Ring, or Pole |
| 2D | `[x, y]` | Flat, or Cylinder wrap for grids |
| 3D | `[x, y, z]` | The map's own geometry |

Generated geometry is catalogued by physical family — Paths, Surfaces,
Shells, Volumes, and Custom/imported — and each family exposes only the
coordinate views it can honestly own. PXLBLZ does not invent UV coordinates
for an imported point cloud or pretend a shell and a volume are the same
distribution.

Stock maps are real, self-contained Mapper JavaScript: inspect them
read-only, use them in preview, send them to a Controller, or clone them into
an editable custom map. **New Map** opens plain JavaScript — a literal
coordinate array or a `function(pixelCount)` returning one — and bakes it on
the sync tick. The map context pane is a wiring check, not a Pattern preview:
it colors points in wire order, labels indexes, and reports bounds and
dimensions. A connected Controller can also **Import map** from its installed
`/pixelmap.dat`; known maps are recognized rather than duplicated.

**Contain** preserves aspect by scaling all axes from one shared range;
**Fill** stretches each axis independently to `0..1`. Both are real Mapper
behaviors. For map theory from first principles, read **Understanding Maps**.

## 7. Libraries and mixins

Libraries and mixins are both reusable source with different jobs: a Pattern
*calls* a library; the pass engine *applies* a mixin.

A **Library** is a namespace of functions and shared `var` state, called as
`SDF.circle(...)` or `MyLib.paint(...)`. Compilation follows references and
flattens only the functions actually used into one flat Pixelblaze artifact.
PXLBLZ ships `SDF`, `Anim`, `Color`, `Coord`, `Noise`, and `Shader` as
read-only stock; personal libraries auto-save and compile through every
Pattern path. `//` comments above functions become editor help and the API
Reference. Single-expression helpers can offer an `inline` form that expands
at the call site and removes the runtime function call.

A **mixin** is transformation source the pass engine applies to a Pattern
without editing it: **inject** adds source, **intercept** wraps output calls
such as `hsv`, and **bind** connects a normalized input to a function or
variable. Mixins stay generic; Controller-specific pins and limits belong to
Controller profiles, which is where mixins earn their keep (see
[section 10](#10-controller-profiles)).

## 8. Files and manual workflows

- **Copy Code** and **Download** emit one flat, tree-shaken `.js` artifact
  with a PXLBLZ identity banner. Preview metadata never leaves the browser.
- **Import `.epe`** creates a personal Pattern from `sources.main`, restoring
  a preferred map when it can be matched by name or identity.
- Built-in Patterns may be run or saved directly; cloning is only needed to
  edit their source.
- Show `.epe` exports are standalone generated Patterns usable by normal
  Pixelblaze tools.

---

# Part 3 — Live hardware

PXLBLZ works fully without hardware. When you have a Controller, three layers
appear: a live connection, a durable per-device profile, and explicit send
actions. The design rule throughout is that nothing crosses to hardware as a
side effect.

## 9. Connecting a Controller

Live Controller access comes through the PXLBLZ Chrome extension, because an
HTTPS page cannot open a Controller's insecure LAN WebSocket directly. Open
the top-right Controller menu and pick a discovered Controller or enter its
IP; Chrome asks once per LAN host. Several Controllers may stay connected with
one active at a time, and a compact traffic-light pill tracks connection
state.

Clicking the active pill opens the live panel: Run/Save/Profile actions, the
active Pattern and native brightness, pixel count with map mismatches
flagged, the running Pattern's controls and watched variables, and power
telemetry when the generated Pattern exposes it. Brightness and live control
writes are volatile; pixel count is a deliberate saved hardware write with an
explicit apply. PXLBLZ never installs firmware — when an update is available
it points to the Controller's own **Settings → Updates**.

## 10. Controller profiles

A Controller profile is durable configuration for one physical Controller,
keyed by its stable device id rather than its IP. Profiles appear when signed
in and connected hardware reports that id, and stay editable while the
hardware is offline. A profile holds the last-seen device facts, hardware
inputs, global transforms, per-Pattern bindings, named zones used by Shows,
map fingerprints, and your declared output wiring.

The interesting part is what a profile can do to generated code:

- **Inputs and bindings.** A potentiometer or button becomes a normalized
  input; a binding routes it to an exported slider, a named function, or a
  variable, applied once per frame without editing Pattern source. (A linear
  10k pot across 3.3V and GND is the standard part — never feed 5V into a
  Pixelblaze analog input.)
- **Hardware brightness** samples an input each frame and scales supported
  output calls, separate from the Controller's native brightness, which
  remains the final physical safety control.
- **Power cap** limits output duty, either set directly or derived from
  per-pixel milliamps and a target draw. The live panel shows an estimated
  draw and a volatile live duty slider; PXLBLZ does not pretend to be an
  ammeter.

Missing binding targets produce transform warnings rather than silent partial
behavior, and **View generated artifact** always shows exactly what was
inserted, wrapped, or bound.

## 11. Run, Save, and keeping hardware current

**Run** and **Save** compile with the Controller's own compiler. Run loads
transient bytecode; Save writes a durable saved Pattern and activates it,
overwriting the same Controller-bound program on later saves. The two have
independent dirty state: a clean Run does not pretend the Pattern was saved.

The profile's right pane lists the Controller's saved programs while it is
live. Studio-owned rows link back to their source; foreign rows stay visible
and untouched. Each Studio row reports transform freshness — current, stale,
or unmanaged. **Keep PXLBLZ patterns up to date** is an opt-in that rebuilds
provably managed programs when a code-affecting profile edit lands; its scope
is deliberately narrow, and foreign programs are never modified, renamed, or
deleted. Import is offered for foreign programs that contain source; compiled
code without source cannot be reconstructed.

A Controller has one shared map slot, so **Send map to Controller** is a
confirm-first configuration action, not a per-Pattern preference. PXLBLZ
re-bakes function maps for the Controller's pixel count and flags map/pixel
mismatches, because firmware silently ignores a mismatched map.

---

# Part 4 — Shows

A Show composes existing Patterns into time-based choreography: Clips on
Layers, Layers inside Zones, and Transitions between connected Clips. It
compiles all of that into **one ordinary Pixelblaze Pattern**. The source Patterns stay
reusable; the Show owns timing, routing, adaptation, and one permanent output
contract. This part introduces each dimension of the Show editor; the deep
treatments live in the [Visual Effects Guide](../guides/Visual effects guide.md)
and [Inside the Show Compiler](../guides/Inside the Show compiler.md).

## 12. What a Show is

**New Show** opens a two-column choice that becomes the Show's permanent
output contract:

- **Portable** promises LED-resolution independence across compatible 2D
  mapped surfaces. Its map and count are an editable authoring reference, not
  device identity.
- **Installation** fixes one pixel count and output map for a known physical
  build, and unlocks physical zone ranges and Controller targeting.

The contract stays visible in the timeline header, and older Shows confirm it
once through the same comparison. Show setup supports outputs through 2,000
pixels.

## 13. The timeline

The canonical editor is one proportional timeline of Pattern Clips.
Clips occupy exact Show time on explicit Layers; they may move horizontally,
between existing Layers, or between Zones without exposing the internal Scene
owners used by the saved composition and compiler. A shared ruler, playhead,
transport, and Navigator stay visible above the editable Layer stacks. The
per-Layer Transition junctions and disclosed Property animation lanes remain
aligned to that same time axis.

The working grammar is compact:

- **Transport and keys.** Space plays and pauses; A rewinds; 1, 2, and 3 select
  1x, 1.5x, and 2x playback. Unmodified Left/Right Arrow seek backward or
  forward five seconds without moving the visible range. These transport keys work from
  ordinary Show page content without first focusing the timeline; active editors
  and keyboard-operable controls retain their native keys. Tab and Shift-Tab
  traverse timeline entities in deterministic time order. Click or drag the
  ruler to seek. Scrubbing rebuilds exact deterministic Pattern state by
  replaying from Show start — there is no approximate seek.
- **Navigator and Snap.** The compact Navigator pans or resizes the visible
  range; Fit restores the complete Show, and Ctrl/Cmd-wheel zooms around the
  playhead. Snap magnetically aligns scrubbing and edits to Clip, Transition,
  Marker, and time-grid boundaries; Alt temporarily reverses it.
- **Direct Clip edits.** **Add Clip** places a Pattern at the playhead when the
  target Layer has room. Dragging moves a Clip without overwriting another;
  selected Clip edges resize it. **Split** divides the selected Clip at the
  playhead and **Clone** duplicates it immediately after itself. Start and
  Duration combine exact decimal-second entry with the shared detented time
  ruler. Each Clip's second row
  tersely summarizes its authored controls, view changes, Effects, and Property
  animation; unchanged values after a connected Clip contract to their category
  glyphs. Unavailable commands stay focusable and explain why. Every commit is
  one session-scoped undo step (Cmd/Ctrl+Z).
- **Selection and detail.** Selecting a Clip, Group, Transition, Zone, or the
  Show opens a compact floating **Entity Detail Panel** beside its source with
  that entity's exact editable fields. Clip Details repeat the complete
  categorized configuration summary at the top. Clicking elsewhere closes
  transient Details; one Detail may be pinned for comparison.
- **Progressive structure.** **Layer** deliberately adds another compositing
  lane. **Zones** reveals the Zone Map only when routing structure is needed;
  a one-Zone Show otherwise spends the full width on its Clips.

### Groups and linked choreography

Drag a marquee across Clips to prepare a structural selection. If the marquee
touches part of a non-Cut Transition chain, the selection expands to include
both endpoints and the complete chain; Shift-click can then refine it. A valid
selection stays within one Zone and one Zone Layout interval, may span several
Layers, and enables **Group**. Groups cannot nest.

The resulting Group is one selectable occurrence across its occupied Layers.
Its Entity Detail Panel sets exact Start, base Layer, and normalized X/Y
offsets. **Duplicate** creates another occurrence linked to the same reusable
choreography, so definition edits appear in every linked occurrence. Each
occurrence still receives fresh Pattern runtime instances, preserving the
Group's internal sharing without sharing private Pattern state between uses.

Double-click a Group Clip to edit the Group in place. Content outside the Group
dims and cannot be edited; the Group's Clips retain their ordinary inspectors,
Effects, controls, and Transition editing. Escape exits this modeless isolation,
and Undo/Redo reverses edits normally. **Make Unique** keeps the Group container
but gives one occurrence its own copied definition. **Ungroup** removes that
occurrence's container and leaves its Clips, Transitions, Effects, and animation
as ordinary timeline entities. Deleting a Group removes only the selected
occurrence.

## 14. Clips: time, adaptation, and Effects

A clip references a personal or built-in Pattern and adapts it
non-destructively. The referenced **Pattern instance** owns private state, its
clock, exported controls, Animation speed, time offset, and optional
**Stutter** step. More than one Clip may share that instance, so a change to an
instance-owned control changes every linked Clip. **Make Pattern Independent**
clones those settings and local automation for the selected Clip;
**Rejoin Shared Pattern** deliberately adopts another compatible instance.
Splitting a Clip keeps the same instance and therefore preserves the visible
motion through the cut.

Presentation belongs to the Clip rather than the shared instance. **Live**
shows the running Pattern, **Freeze** captures and holds the complete entry
frame, and **Strobe** periodically captures and holds a new complete frame at
the chosen cadence. **Blink** gates the Clip output at an authored rate, duty,
and phase without pausing Pattern time. Stutter is different: it quantizes the
shared Pattern clock, so every Clip linked to that instance observes the same
stepped motion.

Compatible 2D clips expose a canonical **Transform** group — position,
rotation, scale, and a Mirror flip — followed by an ordered **Effect stack**
grouped into the compiler's fixed Transform, Distort, Address, and Color &
output stages. **Effects > Add** opens a searchable registry with animated
mnemonics and factual cost notes; clicking applies documented defaults, and
the Entity Detail Panel exposes exact parameters. The registry spans
transforms (Translate, Rotate, Scale, Shear, Wrap), distortions, address
policies, and Color & output Effects including Luma key, Chroma key, and
Vignette. Show-wide output Effects such as **Trails** live in Show
properties and apply after the full composite.

Authored colors use one compact **Color** field: click its swatch for the
platform picker or type an exact canonical `#RRGGBB` value beside it. Picker
movement previews on the Stage, then closing the picker saves one edit;
invalid text and Escape restore the saved color. **Color Map** consequently
has one **Shadow Color** and one **Highlight Color**, not separate red, green,
and blue controls. Chroma key and Fade through color use the same field.

Clips can separately trade evaluation fidelity for cost: **Freeze at entry**
captures one frame and replays it, and **Refresh** re-evaluates a quarter of
the pixels per frame. These advanced policies keep the Pattern clock running
and are independent of Live/Freeze/Strobe presentation. Both are authored
approximations with measured double-digit FPS wins on hardware; the exact
envelopes and numbers live in **Show Rendering Optimization Results**.

## 15. Transitions and Property animation

A Transition is a visible, selectable junction between two connected Clips on
one Layer, not a property hidden on either Clip. A
searchable registry covers Blend, Fade, Wipe, Dissolve, Shape reveal, and
Motion families; hovering a row previews it on the Stage at that boundary
without saving. Each variant's Entity Detail exposes only its legal fields —
duration, easing, geometry, edge policy, and family-specific controls — and
**Reset to cut** returns to a zero-duration boundary.

Dragging a connected Clip horizontally keeps its Transition sequence rigid.
Dragging that Clip onto another Layer moves the Clip alone and removes the
Transitions that attached it to its previous Layer.

Transition cost is explicit rather than hidden: parameter ramps keep one
renderer per pixel, wipes route each pixel to one member, crossfades disclose
their snapshot-versus-live policy, and feathered shape reveals evaluate both
Patterns only inside the band.

Property animation uses one shared model: the destination Clip or Show target
owns its value, while the incoming boundary owns start, duration, and easing.
Animation speed, Brightness, Clip Transform, exported sliders, and routing
split position all use the same system and appear as compact sparklines beneath
their Zones. Each sparkline is labelled on the lane with the Property it
animates, so a Zone with several animated Properties reads without hovering.
When two lanes in one Zone animate the same Property, those lanes also show the
owning Clip, abbreviated. Select a Clip and use **Property animation** in its
Entity Detail Panel to choose a supported Property, click **Animate**, then
edit its exact keyframe time, value, and easing. The authored track continues
to preview, compile, persist, and split through the internal composition model;
it does not open a separate Scene-local authoring surface.

## 16. Zones and routing

Zones progressively disclose routing structure. A new Show starts with one
full-output Zone and no persistent Zone chrome. **Zones** opens a compact Zone
Map containing that existing Zone, Add Zone, a stable optional icon, and links
to exact Zone properties. With several Zones, closing the map leaves only a
thin icon picker.

Expanded Zones share the ruler and may collapse independently. A collapsed
Zone remains a time-accurate miniature: one thin band per Layer retains Clip
spans and property-event positions, and it remains a snapping and drag target.
Focusing a Zone expands it and collapses its siblings. Collapse, focus, and
Zone-workspace disclosure persists independently per Show.

The output contract determines what those Zones mean:

- An **Installation** Zone Layout assigns semantic zones to physical pixel
  ranges. With a saved 2D output map, **Select LEDs on map** edits a zone
  spatially — drag Replace/Add/Subtract across real points with live coverage
  diagnostics. Coverage is validated exactly: overlap, gaps, and out-of-range
  indexes block artifact output with an actionable explanation.
- A **Portable** Zone Layout pairs ordered logical zones with a normalized
  routing mode: Full surface, Stripes, 2×2 Grid, Checker, Rings, Pinwheel,
  Wave, or a Moving/Soft Split whose position is itself animatable. The
  generated Pattern derives ownership from runtime coordinates, so the same
  rule holds on any compatible surface.

A Show may own several named Zone Layouts and reference them from explicit
Layout intervals on the Timeline. Each routed interval has a numbered selectable
Timeline control; selecting it opens the incoming routing transition's
destination Layout, transfer duration, easing, and direction. A boundary may
switch definitions as a Cut; Moving Split and Soft Split animate an owned
position while every Pattern clock continues. A synchronized **Repeat scale**
tiles what Patterns sample without changing Zone ownership or drawn positions
and appears as an ordinary Property animation band on the unified Timeline.

The right pane is the read-only **Stage**: the Show rendered over its output
geometry (or honest generic strips when no map is saved), with the familiar
light size, diffusion, and renderer comfort controls. Show transport owns
time, so Pattern-level speed and controls stay out of the Stage. Its divider is
resizable on desktop. In a narrow workspace the Stage yields before the
timeline becomes unreadable; **Preview** opens the same Stage as an overlay
without creating a second clock or playback state.

## 17. Compile, cost, and export

The compile bar under the timeline is the honest gauge cluster: generated
code size, renderer policy, transition cost, memory ledger, and warnings, all
measured from the artifact it just built rather than estimated from menu
labels. The **Show source** number expands into a byte-level inventory with
**Ways to slim this Show** ranking the contributors you can actually change.
**Advanced compiled cost** names every specialization the compiler selected
or rejected, and why — the mechanisms behind those labels are the subject of
[Inside the Show Compiler](../guides/Inside the Show compiler.md).

The same bar enforces the support envelope: outputs above 2,000 pixels,
exhausted memory axes, or five simultaneous renderers per pixel block
outbound actions with a named cause, while editing and preview remain
available.

Outbound paths mirror ordinary Patterns. **View code** shows the generated
source read-only; **Run** and **Save** compile it with the connected
Controller's compiler; **Export `.epe`** packages it with provenance,
a readable summary, and a compatibility contract that import and read-back
recover. Sending never changes the Controller's shared map or pixel count;
Installation identity mismatches block Send, and Portable compatibility facts
are advisories. One practical gotcha: hot-replacing one very large resident
program with another can disconnect before activation — reboot or run a small
Pattern first; the destination Show itself is fine.

## 18. Built-in Shows to learn from

The Shows rail ships learning examples beneath your personal Shows. **Learn**
holds numbered lessons that add one idea at a time — routing, Effects, Property
animation, Transitions, and cost techniques. **Showcases** holds reference
catalogues for Effects, Transitions, Property animation, and easing, plus
finished scores such as the 2,000-pixel, five-surface **Redline
Installation**.

Built-ins use the complete production editor. The first change creates a
session-only draft with normal Undo/Redo; it does not alter the shipped example
or create a personal Show. The draft survives navigation during that page
session. **Reset** or reload restores the built-in definition. Reference
Showcases also provide **Try with Pattern**, which swaps the comparison source
through the same timeline, Stage, generated-code, export, cost, and Controller
paths. The [Visual Effects Guide](../guides/Visual effects guide.md) explains
the current examples in prose.

---

# Part 5 — Boundaries and where to go next

PXLBLZ stays focused by leaving device administration to Pixelblaze and by
being explicit about the few places a browser preview cannot perfectly
reproduce firmware. These are product constraints, not hidden modes.

## 19. What PXLBLZ deliberately does not do

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

## 20. Known preview limits

- Pattern execution runs on the browser main thread. A syntactically valid
  infinite loop can freeze the tab; clean compilation is not a watchdog.
- Sensor Expansion Board inputs are inert stubs: sensor-reactive Patterns
  load, but audio, accelerometer, and light data do not animate in preview.
- Fast mode uses float64. Precise mode emulates fixed-point arithmetic but
  does not reproduce every firmware algorithm bit-for-bit.
- Show seeking reconstructs deterministic Pattern state exactly; Trails is a
  deliberate output-history exception, and unrecorded wall-clock, network,
  and sensor history cannot be recreated from Show time alone.

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

PXLBLZ rewards the same loop the hardware does: change one thing, watch the
preview react, and keep what makes the installation more expressive. The
features above are dimensions to explore when a project calls for them, not a
syllabus to absorb before beginning.

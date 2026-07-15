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

The top-bar **Gallery** link returns to the Gallery. Switching rail modes
remembers the last open item for each mode during the session. **Collapse
library** in the active entity header reduces the complete detail rail to the
46-pixel activity strip when the center pane needs more horizontal room. The
collapsed strip exposes **Expand library**. This state is shared across Studio
modes; switching from Shows to Patterns does not reopen it.

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

The center-pane title is also the rename control for personal Patterns, maps,
mixins, libraries, and Shows. Click the title, edit the name, and confirm with
Return or the check button; Escape or the cancel button leaves the name
unchanged. Library names remain Pixelblaze identifiers because the name is also
the namespace. Built-in and stock content is read-only, and Controller profile
names continue to mirror the physical Controller instead of being renamed in
Studio.

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
  ceiling. Custom baked maps retain exact entry without a ladder; stock literal
  coordinate arrays replace the editor with their locked authored count.
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
the orbit viewport for 3D. Its header distinguishes **Preview size** generators,
fixed-size stock coordinate arrays, and the last successful **Baked size** of a
custom map; hovering the status explains whether changing Preview pixels can
regenerate the geometry.

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

### Keeping managed Patterns current

**Keep PXLBLZ patterns up to date** is an opt-in at the top of Saved programs.
When enabled, a code-affecting Controller-profile edit automatically rebuilds
the saved Patterns, demos, and Shows that PXLBLZ can prove it manages. Each
refresh overwrites the existing Controller program id. It does not cycle the
Controller through every Pattern, and it preserves the active managed Pattern.

Management is deliberately narrow. An installed program needs a matching
PXLBLZ binding, a successful prior Save record, and regenerable Studio source.
Foreign programs, rows without a push record, missing source, and Patterns
deleted from the Controller are completely exempt: PXLBLZ does not modify,
recreate, rename, or delete them. The scope summary reports managed and
unmanaged counts before work begins.

The progress rail appears only while work is pending, running, or needs
attention. Rows report Current, Queued, Updating, or Failed, and one aggregate
retry handles independent failures. Offline work stays pending until the
Controller reconnects. Turning the setting off stops new automatic writes after
the current write finishes; it does not roll back artifacts already refreshed.
Ordinary Pattern source edits still require Run or Save.

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
transitions, adaptations, Controller targeting, and one permanent output
contract.

### Creating a Show

**New Show** opens a two-column comparison before it creates anything.
**Portable** leads with LED-resolution independence across compatible 2D mapped
surfaces; its selected map and pixel count are an editable reference for
authoring, not exact LED identity.
**Installation** fixes one pixel count and output map for a known physical build.
A measured custom map supplies and locks its point count, while a generated map
accepts the entered count. Its initial physical zone covers that complete output.

Choosing a column opens setup for the Show name, count, and map. The record does
not exist until **Create Show**. **Cancel** or workspace Escape returns to the
previously open Show, or to the Shows empty state when none was open. Inputs and
open native controls consume Escape before the enclosing creation flow.

The timeline header and Show properties keep the chosen contract visible after
creation and reload. PXLBLZ classifies an older Show automatically only when its
saved target Controller or physical LED ranges prove Installation intent. Every
other older Show opens the same one-time comparison with its current Stage,
modeled count, Controller, and routing facts prefilled. A 2D Stage, logical
routing, or missing physical ranges never proves Portable by itself.

Confirming the one-time choice adds the contract without rewriting timeline
choreography. Cancel returns to the previously open Show or the Shows list and
does not save anything. Once confirmed, reopening the Show goes directly to the
timeline; there is no later conversion command.

Portable Show properties separate the **Artifact promise** from **Reference
preview**. Changing the 2D reference map or count redraws the same choreography;
it does not rewrite scenes, clips, zones, or require the exported artifact to use
that count. Portable hides Controller targeting, physical ranges, nominal pixel
editing, and Controller-zone binding.

### Timeline model

The canonical editor is a proportional, zoomable timeline:

- scene headers are sized by duration;
- zones are explicit rows;
- clips place Patterns across one or more scenes and zones;
- one transition lane holds selectable boundary entities;
- nested lanes expose Animation speed, Brightness, and active public Pattern controls;
- a ruler, playhead, transport, and whole-Show navigator share one time axis.

Scene and transition duration fields accept tenths of a second.

The production toolbar keeps three stable groups. Playback sits left as
**Play/Pause**, **Start**, and current/total time at tenth-second precision.
Zoom sits in the center as borderless minus/plus controls, a slider, and its
numeric multiplier. Commands sit right in **Snap**, **Fit**, **Split**, and
**Clone** order, with compact **Undo** and **Redo** controls before them. Clone
activates for one selected scene or a simple one-scene, one-zone clip; its
tooltip explains why other owners are unavailable. In narrower center panes,
command labels disappear before controls move; at the smallest supported width,
current time stacks above total time.

Use **Fit**, zoom buttons, or Ctrl/Command-wheel to change the viewport. The
navigator thumb shows the visible fraction; drag it to pan or drag its edges to
resize the visible range. Zoom is editor state only and never changes Show time.
**Snap** magnetically aligns pointer scrubbing to scene, clip, transition, and
zoom-aware time-grid boundaries. It is on by default and remembered as an editor
preference; hold Alt to temporarily reverse the current Snap setting.

The Show workspace supports a mouse-free edit-and-preview loop. After a native
inspector menu commits a discrete choice, focus returns to the selected timeline
entity (or the timeline workspace when no entity is selected). **Space** then
toggles Show playback, **Left Arrow** and **Right Arrow** seek exactly one second,
and **Home** returns to Show start. Keyboard seeks clamp at the Show boundaries,
use the same deterministic replay as the playhead, and preserve whether playback
was running. The visible start button also advertises **Home** in its tooltip.

Text, number, range, and menu controls retain ordinary Space and Arrow behavior
while focused. Timeline navigator handles retain their pan/resize keys, and
ordinary buttons retain Space activation. Delete and Backspace likewise remain
local to editors; elsewhere they apply only to the selected scene, transition,
clip, or zone under the existing confirmation rules.

Click or drag the ruler to seek. PXLBLZ rebuilds deterministic Pattern state by
replaying from Show start in Fast mode at full Stage resolution. Replay yields
and a newer seek supersedes older work. There is no approximate seek renderer,
frame cache, downsampling, or checkpoint system in the current implementation.

**Split** creates one shared boundary across every zone row when the playhead is
safely inside a scene hold. Clips on the right default to **Continue**. Turn on
**Restart Pattern on entry** for a deliberate reset or stutter.

**Clone** duplicates a selected scene immediately after itself, including its
clip snapshots, and ripples later Show time. A simple one-scene, one-zone clip
also duplicates immediately after itself: Clone reuses an empty following slot
or inserts a Scene and ripples later Show time when that slot is occupied or
absent. The copy receives new stable clip and Effect identities and independent
editable value objects. Held clips, multi-zone clips, and non-cloneable owners
remain disabled with a reason instead of making an implicit ownership choice.

Drag a simple clip onto an empty slot in the same zone to preview and commit one
magnetic move. The destination highlight appears before drop. This first release
does not move clips between zones, displace occupied clips, drag scenes or
Transitions, or silently change their ownership.

Each add, remove, Split, Clone, move, or property commit is one session undo
transaction. **Undo**/**Redo** and Command/Ctrl+Z restore normalized Show
snapshots and persist the result. Command/Ctrl+Shift+Z redoes. Text fields and
other editable controls retain their native undo behavior. History is per Show
and ends with the browser session; it is not another durable Show copy.

Timeline rows use the production 44-pixel clip height. This is the ordinary
editing density, not a compact preference or prototype-only view.

One scene at a time can disclose a 36-pixel **Scene X-ray** beneath the scene
headers. Its three compact strata summarize entry/exit references, active
Effects, and boundary-authored property changes. The row is read-only: zoom
spreads the same facts and snap references without changing its height or
turning its small marks into drag handles.

Use the X-ray's magnify button to open **Super Detail**. This one modeless layer
keeps global and local Scene bounds together, then expands incoming/outgoing
boundary context, active zone placements, Effect spans, property shapes,
Continue state, and any compiler limitation that makes a saved placement
inactive. It contains no editable fields and does not move Timeline rows.
Selecting another Scene's X-ray transfers the open layer; click elsewhere,
press Escape, or use its close button to dismiss it. Scene-local authoring is a
later scope, so this release deliberately has no **Open Scene** command.

Selecting a Show, scene, transition, clip, empty slot, zone, or routing switch
opens one **Entity Detail Panel** beside that entity. The panel is modeless and
floats in the application overlay layer, so opening properties never changes
row heights or pushes the Timeline. Selecting a different entity transfers the
same panel; selecting its current owner again, clicking Timeline background, or
pressing Escape closes it. Escape restores focus to the owner when it still
exists. The panel flips above or below its owner and stays inside the viewport,
including at narrow center-pane widths.

### Scenes, clips, and private time

A clip references a personal or built-in Pattern and applies non-destructive
adaptations. Continue reuses compatible private Pattern state across a boundary;
Restart creates a fresh instance and clock.

The Pattern field is a type-down chooser grouped into personal and built-in
results. Typing narrows the catalogue without requiring a long native menu.

Delete removes a selected clip without a confirmation step and leaves an
explicit empty slot in its scene and zone. Select that slot and choose a Pattern
to create a fresh clip there, or drag one simple clip from the same zone into the
empty structural slot. The timeline does not use freeform ordering or collision
displacement.

Animation controls include:

- **Animation speed** from exact `0×` through `4×`; zero freezes the Pattern's private
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

### Static Effects

Select a clip and use **Effects > Add** to open the compact registry palette.
Search, family tabs, and the compatibility filter reduce the complete frozen
Effect registry. Rows stay terse; hover or keyboard focus reveals the family
description and factual cost policy while temporarily previewing that candidate
in the existing Stage. The preview does not save. Clicking a row applies its
default values; named preset buttons apply a documented starting preset.

The clip's Entity Detail Panel groups applied Effects by the compiler's fixed
Transform, Distort, Address, and Color & output stages. Expand an Effect for
exact keyboard-editable parameters. Duplicate and remove operate on one Effect.
Move earlier/later reorders only within the same compiler stage, so the UI never
implies a cross-stage order the generated Pattern cannot produce. All changes
save through the normal Show record and survive reload. **Advanced compiled
cost** reports aggregate Pattern-evaluation, operation, allocation, and artifact
facts from the compiler rather than UI estimates.

Adding a Zone creates an empty timeline row. Place Clips in its slots or extend
an existing Clip across it; the editor does not clone another Zone's Patterns.

### Transitions and automation

A transition is its own boundary object, not a property hidden on either scene.
The lane supports visual transitions and separate routing-layout markers.
Duration-bearing transitions occupy visible time; a zero-duration cut still has
a stable selectable marker.

Select a visual boundary and use **Change** to open the compact Transition
registry. Search, family tabs, and the compatibility filter cover Blend, Fade,
Wipe, Dissolve, Shape reveal, and Motion without turning the Entity Detail Panel
into a long kind menu. Rows use small motion mnemonics and factual compiler cost
policies. Hover or keyboard focus temporarily seeks the existing Stage to the
middle of that boundary and previews the outgoing/incoming result without
saving; leaving or closing restores the prior Show and playhead position.
Click a row to apply its defaults, or choose a named preset from the terse
description footer.

The boundary's Entity Detail Panel then exposes only the selected variant's
legal exact fields, including duration, easing, geometry, edge policy, and
family-specific controls. Changing a family or variant uses the registry's
documented defaults; subsequent edits save through the ordinary Show record and
survive reload. **Reset to cut** and choosing Cut both retain the boundary id,
set duration to zero, and leave any separate routing marker intact.

Transition cost is explicit:

- parameter ramps keep one renderer per pixel;
- wipe and dither route each pixel to one member renderer;
- crossfade runs both renderers during its window; and
- spatial Shape reveals can use a hard or stable-dither one-renderer edge, or a
  true blended feather that evaluates both Patterns only inside the band; and
- Motion variants disclose their full-blend policy.

All spatial shapes share center, scale, reveal mode, feather, edge policy, and
easing. Variant-specific controls include rotation and spin, Ring width, Star
points and inner radius, Crescent offset, Polygon sides, aspect, and shape
geometry. The inspector hides parameters that do not affect the selected
variant.

Property automation uses one shared CSS-like model: destination clips own
clip-level targets, destination scenes own Show-wide targets, and the incoming
boundary owns the explicit start, duration, and easing. Animation speed, Brightness,
exported `sliderName(v)` controls, and moving Split position use the same system.
Synchronized Sample repeat uses it as well.
Each property may have its own duration and easing on one continued Pattern
instance. Private locals, toggles, and pickers are not exposed as automatable
numeric properties.
Changing a Clip to a different Pattern clears the former Pattern's developer-
slider targets so unavailable controls cannot remain attached to the Clip.

### Routing layouts and Stage

A Show may own several named routing layouts. An Installation layout maps
semantic zones to physical pixel ranges. A routing boundary may cut immediately or move a stable directional
threshold across the installation for a configured duration and easing. Each
physical pixel belongs to exactly one of the adjacent layouts on every frame,
so the transfer invokes one Pattern renderer per pixel while every Pattern clock
continues. Reverse direction moves the same threshold from the opposite edge.

For a saved 2D Installation output map, select a zone and choose **Select LEDs on
map** to edit that zone spatially in the center pane. Drag **Replace**, **Add**,
or **Subtract** across map points; the surface previews the exact LED indexes,
their compact ranges, and assigned/missing/overlap/out-of-range coverage before
Save. Spatially adjacent LEDs may remain separate ranges when their wiring
indexes are discontinuous or serpentine. Saving changes physical ownership only:
the zone name, color, clips, scenes, and right-hand Stage remain unchanged.

Portable Shows do not offer physical selection because their zones own normalized
positions rather than LED identities. 3D maps and fixed maps whose point count
does not match the Installation output explain that spatial selection is
unavailable; PXLBLZ does not pretend a screen-space projection proves physical
ownership.

Portable layouts instead map logical zones with normalized coordinate predicates.
Full surface, equal left/right or top/bottom stripes, 2x2 grids, and moving X/Y
splits derive membership and zone-local X/Y from every runtime map point. The
generated Pattern uses runtime `pixelCount`, X, and Y; it never embeds the
reference count as physical ownership. A 32x32 square and 128x12 wide surface
therefore keep the same authored coordinate boundary. Because maps preserve
physical aspect, a compressed coordinate axis may make some grid zones narrow or
empty; the Stage reports that consequence rather than stretching or hiding it.

A two-zone layout may instead use a moving X or Y split. Each scene owns a
normalized Split target, displayed as a colored Show-wide property lane. The
incoming boundary may animate from an explicit start with its own duration and
easing. Each side is renormalized to its own local Pattern domain as it grows or
shrinks, including a virtual pixel count that follows its current share; targets
at 0% or 100% give the complete Stage to one zone. The effect
keeps both Pattern clocks continuous and invokes one renderer per pixel.

### Coordinate remapping

Synchronized tiling changes the local sample a Pattern reads without changing
the Stage Map, the drawn LED positions, or zone ownership. Each scene may set a
Show-wide **Repeat scale** from 1x to 8x. The nested Sample repeat lane shows the
target; the incoming transition may animate from an explicit start with its own
duration and easing. At 1x the transform is an exact identity.

On 2D Shows, local X and Y repeat together after routing has normalized the
selected zone, so every active Pattern sees synchronized tiles without source
edits. On 1D Shows, the same rule repeats normalized local index position. The
current control does not claim a 3D policy. Remapping adds no Pattern renderer;
the compile bar reports one scalar and at most two multiplies plus two
fractional-part operations per pixel.

The compiler emits compact formulas for provably regular contiguous, row-band,
and interleaved layouts. Irregular layouts use range branches or a bounded packed
lookup according to measured layout complexity. An Installation validates every
physical routing layout against its saved pixel count: out-of-range indexes,
overlap, and missing indexes are errors. Show properties report assigned,
overlapping, missing, and total pixels. Invalid coverage remains editable and
previewable, but one actionable explanation blocks generated inspection,
export, Run, and Save until the ranges cover every output index exactly once.
Logical layouts route over the complete saved output without physical ranges.

The right pane is the read-only Show **Stage**. Generic zone strips remain honest
for a Show without a saved map. A saved 2D/3D map instead draws the Show over its
output geometry. An Installation always uses its saved count and physical-zone
ranges rather than borrowing the connected Controller's setup. The Stage reports
the saved map, fixed count, and coverage, marks uncovered pixels dim grey, and
warns about off-stage zones. Durable map/count choices live in creation and Show
properties, not in the output pane.

### Compile, push, and export

The compiler alpha-renames member Patterns, gives each required member isolated
state, routes pixels through zone-local domains, and emits one ordinary
Pixelblaze Pattern. The compile bar reports code size, renderer policy,
transition cost, clock policy, evaluation masks, routing representation, and
warnings. Routed Shows also report separate estimated bytecode and permanent
array costs for the selected routing representation. Moving splits additionally
report one scalar, one route test per pixel, and the table entries an equivalent
enumerated sequence would require.
Synchronized tiling reports its one scalar, coordinate-operation ceiling, and
zero-renderer delta separately from routing cost.

**View code** shows the generated source read-only. Push compiles that source
with the connected Controller's compiler through the same grouped identity,
**Run**, and **Save** actions used for ordinary Patterns. Run starts a transient
program. Save writes and starts a durable program, then overwrites that same
Controller-bound program on later saves of the Show. Neither action creates a
personal Pattern or requires an EPE round trip. If the installed Controller map
requires an exact-arity renderer adapter, PXLBLZ explains and confirms that
device derivative before sending it.

The generated header names the Show output contract. Installation records its
fixed count and map identity plus a fingerprint when PXLBLZ can bake or recognize
the map. Portable records variable-resolution 2D surface compatibility without
turning its reference map or count into a device requirement.

**Export `.epe`** packages the canonical generated source with a normal
Controller-format id, preview JPEG, readable Show summary, and provenance
comments. The source also records the authored Stage map when one exists and a
separate compatibility contract: adaptive versus installation-bound,
dimensions, map class, resolution policy, optional aspect range, and whether the
exact map is required. A stock map uses its stable catalogue id; a custom map
uses its human-readable name without leaking a local database id.

EPE import and Controller saved-program read-back recover the same versioned
contract. Missing or ambiguous preferred maps produce a notice and normal preview
fallback; usable Pattern source remains intact. Malformed optional contract
metadata is ignored without invalidating the source banner.

Inspection, direct send, and download therefore begin from one orchestration
program. Only an explicitly reported Controller renderer adapter may derive the
directly sent source, and that derivative retains the same map and output-contract
metadata. Sending never changes the Controller's shared map or pixel count. An
Installation exact match sends cleanly; an unknown map requires explicit
confirmation; a known count, identity, or fingerprint mismatch blocks Send.
Portable compares 2D dimension, surface class, and any authored aspect interval
as advisories, never its reference count or exact map. Saved-program inventory
shows Installation/Portable and the decisive output facts recorded on the last
Studio Save.

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

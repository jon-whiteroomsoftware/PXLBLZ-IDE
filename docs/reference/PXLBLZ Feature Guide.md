# PXLBLZ — Feature Guide

PXLBLZ-IDE is a browser IDE for Pixelblaze LED controllers. Browse a Gallery
of Patterns running live, write your own against a hardware-faithful preview,
and compose finished Patterns into Shows: timeline choreography that compiles
back into one ordinary Pixelblaze Pattern. Almost everything works with no
hardware at all, and nothing reaches your hardware unless you deliberately
send it.

If Pattern, map, or fixed-point are unfamiliar words, start with the
**Pixelblaze Ecosystem Primer**. If you are working on PXLBLZ itself, use the
**PXLBLZ Technical Reference**. This guide is the product tour: what each
feature is for, where to find it, and where the deeper guides pick up.

---

# Part 1 — Gallery, Studio, Docs

## 1. Gallery

`/gallery` is the front door: the built-in Pattern catalogue running live, with
the Gallery Shows set among the Patterns as marquee bands. A band plays a
Show's Stage at its natural proportions, wide for an installation and square
for a portable Show. Beside it, a caption gives the title, byline, premise,
loop length, and the chapter currently playing. A band opens the Show's own
page (`/s/<slug>`), with the Stage at full size and its chapters laid out as an
arc. The **Shows** directory lists only the Shows.

Pattern cards open on a chosen keyframe of their Pattern. The cards nearest
your pointer run the real preview engine, so the animation follows the mouse
around the grid; on a touch screen, the cards nearest the top animate instead.
The density control in the header fits two, three, or four cards per row.
Browse by folder, dimension, or name. Each Pattern has a shareable detail page
(`/p/<slug>`) with a large live preview, the Pattern's controls, and read-only
source, shown with the map and look its author intended. **Open in Studio**
takes it from there: read the code, clone it, or send it to a Controller.

The public pages (Gallery, Pattern and Show pages, Docs, and API) never touch
your Controllers. They have no Controller controls and start no discovery or
extension handshake. Two built-in folders stay out of the public Gallery but
are available in Studio: **Test Patterns** (diagnostics) and **Luma Sources**
(grayscale keying ingredients for Shows).

## 2. Studio

`/studio` is your working environment. The place control beside the wordmark
switches among six Studio areas, each with its own stable route:

| Place | What opens |
|---|---|
| Patterns | Editable personal Patterns and read-only built-ins |
| Shows | Timeline-based multi-Pattern choreography |
| Maps | Editable custom maps, frozen imports, and read-only stock maps |
| Controllers | Durable profiles for physical Controllers |
| Mixins | Reusable pass-engine transformation source |
| Libraries | Reusable Pattern functions and shared state |

The place control remembers what you had open in each area and also lists the
public **Docs** and **API** workspaces under Reference. Each place has a
one-letter shortcut; the
[Keyboard Shortcuts](PXLBLZ Keyboard Shortcuts.md) guide lists them.

Most places use three panes: the entity list for opening and creating, the
editor in the center, and context on the right, such as a Pattern preview, a
map's wiring check, or a library's API reference. Shows use the space
differently: a full-width timeline sits above the Stage preview and its
controls.

Patterns, Shows, and Maps have a search field at the top of the list, and
Patterns and Maps add All / 1D / 2D / 3D filters with a match count. The list
starts pinned beside the workspace. Unpin it and it tucks behind a narrow tab
at the workspace edge; hover or click the tab and the list slides out over the
workspace without disturbing what is underneath. Each place remembers its own
pin choice. In a window 980 px wide or narrower the list always tucks, so the
editor keeps the width.

Personal content lives in folders with drag reordering, and search finds
things inside collapsed folders. Emptying the Trash is the only permanent
deletion in the list, and it asks first. Below your content sit the built-in
catalogues, including a folder of ZRanger1's published community Patterns. A
new workspace starts with an editable **Start Here** Pattern, map, Mixin, and
Library to take apart.

Two habits worth learning on day one: the center-pane title is the rename
control, and **Space** plays or pauses the preview anywhere outside a text
field. Controllers are the one exception to renaming. **Rename** appears only
while that Controller is live, because the name belongs to the device, not the
profile.

The Gallery's **Studio** button opens Shows with **Quadrille** playing, which
is a good first look at what a Show can do.

### Sign-in and your workspace

Studio uses GitHub or Google sign-in; logins that share a verified email open
the same workspace. Your content is stored in the cloud, not the browser.
Signed out, the Gallery, docs, and public previews all work; sign in to author
and to connect a Controller. If a save or delete ever fails to reach your
workspace, Studio says so where you made the change instead of failing
silently.

## 3. Docs and API reference

**Docs** and **API** under Reference in the place menu open public reference
workspaces without entering Studio, and both deep-link (`/docs/<id>`,
`/reference/<library>`). From Studio, the API reference adds **My libraries**,
generated from the `//` doc comments in your own code.

---

# Part 2 — Patterns, preview, and maps

The core loop: write Pixelblaze source, watch a faithful preview react,
choose the geometry it renders across.

## 4. The editor

The center editor is Monaco, the engine behind VS Code, tuned for the
Pixelblaze language: completion, signatures, hover documentation, and inline
errors. Pause typing and clean code slides into the preview; broken code
keeps its markers while the last working version keeps running, labeled as
such.

Saving is automatic and honest. A small cloud glyph appears while autosave is
stuck: amber while the code has errors (fix them and saving resumes), red
while saves are failing (the editor retries until one lands). Broken code is
kept too: navigate away mid-edit and Studio stores exactly what you typed,
restoring it when you return, with the preview covered until the code runs
again.

Controls come from code. Export `sliderSpeed(v)` and a slider appears; the
same convention makes toggles and color pickers, and every `export var` shows
in the var watcher, updating each frame. Numeric fields across Studio share
one control: type an exact value, or drag the grip for a temporary
high-resolution slider, with units that mean what they say: percentages,
multipliers, seconds, degrees, or turns.

Built-in Patterns open read-only; **Clone into Patterns** makes an editable
copy and keeps the source manifest header: name, provenance, and what each
control changes.

## 5. Preview

The preview runs your Pattern in the browser and draws it as a WebGL point
field in 1D, 2D, or 3D, with orbit, zoom, and glow. Pixelblaze hardware
computes in 16.16 fixed-point while browsers use float64, so there are two
renderers:

- **Fast**: ordinary float math, the everyday editing mode.
- **Precise**: emulates the device's fixed-point overflow and quantization,
  catching the ports that look fine on a laptop and break on hardware.

The settings are split by what the hardware could carry. **Pixelblaze**
settings (map, modeled pixel count, Fill/Contain fit) describe what the
Pattern computes against. **Preview** settings (renderer, playback speed,
light size, diffusion, interior opacity) only change how the browser draws it.
Most settings are remembered per Pattern, and none of them ride along when
you send to a Controller.

Below the preview, **Controls** starts open, while **Pixelblaze**,
**Preview**, and **Variables** fold to one-line summaries. Each remembers
whether you left it open. Brightness, Reset, and Play/Pause stay in the
header row. Expanding a section borrows height from the preview without
restarting the Pattern, and the sections scroll once the preview reaches its
minimum size.

![Preview state stays in the browser; only explicit Run, Save, and Send map actions reach the Controller](../images/preview-deck-boundary.svg)

## 6. Maps and display geometry

A map answers "where is LED #37?", and PXLBLZ keeps two answers separate:
**sample**, the coordinate the Pattern receives, and **position**, where the
preview draws that LED. That is why one 1D map can display as a Line, Ring,
or Pole without changing what the Pattern computes.

Any Pattern may try any map. Exact-dimension matches appear under
**Recommended**; everything else stays available with missing coordinates
filled sensibly. Generated geometry is catalogued by physical family (Paths,
Surfaces, Shells, Volumes) alongside your own imports.

Stock maps are real Mapper JavaScript: inspect, preview, send, or clone them.
**New Map** is plain JavaScript, a coordinate array or a
`function(pixelCount)`. The map pane is a wiring check, not a Pattern
preview: it colors points in wire order and reports bounds, dimensions, and
coincident points. A connected Controller can **Import map** from its
installed file.

![Fill vs Contain: aspect-preserving vs per-axis stretch](../images/fill-vs-contain.svg)

**Contain** preserves aspect; **Fill** stretches each axis to `0..1`. Both
are real Mapper behaviors, and the built-in **MapAlignmentDiagnostic**
Pattern paints X, Y, and Z bands to check any map. For map theory, read
**Understanding Maps**.

## 7. Libraries and mixins

Both are reusable source with different jobs: a Pattern *calls* a library;
the pass engine *applies* a mixin.

A **Library** is a namespace of functions and shared state, called as
`SDF.circle(...)`; compilation flattens only the functions you actually use
into the final artifact. Six ship read-only (`SDF`, `Anim`, `Color`, `Coord`,
`Noise`, `Shader`), personal libraries compile through every Pattern path,
and `//` comments above functions become editor help and API reference pages.

A **mixin** transforms a Pattern without editing it: **inject** adds source,
**intercept** wraps output calls such as `hsv`, and **bind** connects a
normalized input to a function or variable. Six stock mixins show each kind at
work, from `pot-binding` and `hw-brightness` to `power-cap` and
`night-scheduler`. Controller-specific pins and limits belong to Controller
profiles, so mixins stay generic and reusable.

## 8. Files

- **Copy code** copies one flat, tree-shaken Pattern with every library call
  it needs built in. **Download .epe** saves the same code as a Pixelblaze
  export file, preview image included. Preview settings never leak into
  either.
- **Import `.epe`** brings a Pattern in, restoring a matching preferred map
  when it can.
- A Show downloads the same way, as one generated Pattern that any Pixelblaze
  tool can use, or exports as a `.pxlshow` file that keeps it editable
  (section 17).

---

# Part 3 — Live hardware

Everything above works with zero hardware. Add a Controller and three layers
appear: a live connection, a durable per-device profile, and explicit send
actions. Nothing crosses to hardware as a side effect.

![The browser authors and observes; the Pixelblaze Controller stores and runs](../images/device-browser-boundary.svg)

## 9. Connecting a Controller

Live access goes through the PXLBLZ Chrome extension, because an HTTPS page
cannot open a Controller's LAN WebSocket on its own. The Controller bar and
**Connect** live in Studio only. Pick a discovered Controller or enter an IP
from Studio's top-right menu; several can stay connected with one active. The
first time, the extension asks you to approve access, then connects without
reloading the page. Visiting the Gallery or another public page hides the bar
without disconnecting.

The live panel shows what the device says right now: brightness, FPS, IP,
pixel count, the running Pattern's controls and watched variables, and power
telemetry when the Pattern exposes it. Brightness and control changes are
live and temporary; a pixel count change is a deliberate saved write.
**Play/Pause** freezes or resumes the Controller's renderer without touching
flash.

The panel folds the same way the preview does: **Controls** starts open, and
**Pixelblaze**, **Power**, and **Variables** fold to one-line summaries.
Power's summary keeps the limiter, recent duty, and estimated draw in view. A
grey **limiting** label means the cap is idle; amber means it is holding
output down. If the Controller is shuffling or playing a playlist, an icon in
the panel header says so, because the sequencer can replace a manual switch
at its next interval.

The **Switch** menu changes only what the Controller runs. It lists saved
Patterns alphabetically, marks the running one, and pins a run-only Pattern
as **unsaved · running** when it is not in the saved inventory. A successful
switch also becomes the Controller's boot Pattern. If the device cannot
confirm the change, the menu stays open with its reason.

One flag worth knowing: firmware silently drops a map whose pixel count
disagrees with the device, so the panel calls out the mismatch with an amber
`256≠300` chip instead of letting it fail quietly.

## 10. Controller profiles

A profile is durable configuration for one physical Controller, keyed by its
device id and editable even offline. It shows the MAC address alongside IP
and firmware, so identically named Controllers can be told apart. It is where
hardware knowledge lives:

- **Inputs.** Describe a potentiometer or button once (pin, signal,
  smoothing) and route it to hardware brightness or to any Pattern's
  exported control. No Pattern editing required; the routing is compiled into
  what you push. Validation flags problems on the input that owns them, with
  one-click fixes.
- **Power.** Set a duty cap from a fixed value, or derive it from your supply
  budget and full-white load (chipset presets, or your own measured amps or
  watts). Every Pattern or Show sent through the profile respects the cap.
  PXLBLZ does not pretend to be an ammeter; plan the physical power system
  for real.
- **Saved Patterns.** The profile's inventory separates what PXLBLZ manages
  from everything else on the device. The running row has a green marker, and
  managed rows show which profile features were baked in and whether the
  copy on the device is current, stale, syncing, queued, or failed. **Run**
  switches the Controller without opening anything in Studio. **Delete**
  removes a saved Pattern that is not running, after a confirmation; deleting
  one PXLBLZ did not create warns that there is no recovery copy unless you
  import it first. **Keep Patterns up to date** rewrites managed Patterns and
  Portable Shows after an edit that changes their generated code.
  Installation Shows are sent only explicitly from the editor, because PXLBLZ
  cannot verify the Controller's installed map at the moment it writes.

A profile's name is the device's name. While the Controller is live, rename it
from the center title; PXLBLZ writes the new name to the device, reads it
back, and only then updates the profile. If the device refuses, the old name
stays and the error appears where you made the edit.

Two built-in diagnostics earn their keep here: **AnalogWiggleFinder** finds
which analog pin a pot is on, and **View generated artifact** shows exactly
what the profile inserted, wrapped, or bound.

## 11. Run and Save

**Run** and **Save** live in the Controller popover at Studio's top right, and
they act on whatever Pattern or Show is open. The popover names what it is
about to send. If something needs your attention first, such as a map that
suits the Pattern better or a Show that does not fit this Controller, it says
so, and canceling sends nothing.

**Run** compiles with the Controller's own compiler and loads transient
bytecode; **Save** writes a durable Pattern and activates it. The two track
changes separately, so a clean Run does not pretend you saved, and failures
appear as visible alerts with a reason. **Switch**, beside them, acts on the
Controller's saved inventory instead and leaves both alone.

A Controller has one shared map slot, so **Send map to Controller** is its
own confirm-first action, re-baked for the device's pixel count, never a
per-Pattern side effect.

---

# Part 4 — Shows

A Show composes Patterns you already have into timeline choreography (Clips
on Layers, Transitions between them, Zones for routing) and compiles all of
it into **one ordinary Pixelblaze Pattern**. The source Patterns stay
untouched and reusable; the Show owns timing, routing, and adaptation. This
is the deepest part of PXLBLZ, with two dedicated guides:
[Visual Effects Guide](../guides/Visual effects guide.md) for Effects,
Transitions, and animation, and
[Inside the Show Compiler](../guides/Inside the Show compiler.md) for how one
Pattern can possibly hold all of this.

## 12. Portable or Installation

**New Show** asks one permanent question: what does this Show target?

![Portable Shows adapt to any compatible mapped surface; Installation Shows fix one pixel count, one output map, and physical zone ranges](../images/show-output-contract.svg)

- **Portable** adapts to any compatible 2D mapped surface; its map and pixel
  count are an authoring reference, not device identity.
- **Installation** fixes one pixel count and output map for a known physical
  build, unlocking physical zone ranges and Controller targeting.

The choice stays visible in the timeline header, and Shows support outputs of
up to 2,000 pixels. With a Controller profile selected in the list, **New show
from profile** seeds an Installation Show from that device's imported map and
pixel count.

## 13. The timeline

![The timeline: Clips on Layers inside Zones, a Transition junction between connected Clips, a property band, the Layouts lane, and an exact playhead](../images/show-timeline-anatomy.svg)

One proportional timeline holds everything. The gestures you will use
constantly:

- **Space** plays and pauses, **A** rewinds, **1/2/3** set playback speed;
  click or drag the ruler to seek. Seeking replays deterministically from
  the start of the Show, so it is exact, never approximate.
- **Add Clip** places a Pattern at the playhead; double-click empty Layer
  time to choose one there. Drag to move, Option-drag to duplicate, drag edges
  to resize. **Split** divides the selected Clip at the playhead, or the Clip
  under the playhead when nothing is selected.
- Drags land on the tick grid and snap to Clip, Marker, and playhead
  boundaries; Alt suspends snapping for one gesture, and Shift gives fixed
  fine steps. A resize stops where the next Clip on the same Layer begins.
- Every edit is one Undo step (Cmd/Ctrl+Z). Undo history lasts for the
  session.
- Select anything (a Clip, Group, Transition, Zone, or the Show itself) and a
  floating detail panel opens with exactly that thing's fields. Escape closes
  one surface per press.

Marquee-select Clips and **Group** them into one movable occurrence across
Layers. **Duplicate** creates linked copies that share edits until **Make
Unique** breaks the link.

A **Marker** is a named point on the timeline. It guides your eye and nothing
else: playback, Clips, and Transitions never depend on one. A Marker can also
be a **chapter**, which is how a Show names its passages for the Gallery, its
public page, and the Live strip. Markers you add are ordinary guides until you
make them chapters.

## 14. Clips

A Clip references a Pattern and adapts it non-destructively. The underlying
**Pattern instance** owns its state, clock, controls, and speed; Clips may
share one instance (splitting keeps motion continuous through the cut) or
take an independent copy with **Make Pattern Independent**.

Presentation belongs to the Clip: **Live**, **Freeze** (hold the entry
frame), **Strobe**, **Blink**, or **Stutter** (quantize the shared clock so
linked Clips step together). Every Clip also owns **Opacity**: on the
**Main** Layer it fades toward black, while higher Layers composite over the
content below. **Brightness** adjusts the Pattern before that composition. 2D Clips
add a **Transform** (position, rotation, scale), an optional **Aperture** mask
from the shape catalogue, and an ordered **Effect stack**: transforms,
distortions, address policies, and color Effects such as Luma key, Chroma
key, and Vignette, each searchable with cost notes and presets. Two policies
trade fidelity for measured double-digit FPS wins on hardware: **Freeze at
entry** and **Refresh**, which re-evaluates a quarter of the pixels per
frame.

One Effect belongs to the whole Show rather than a Clip. **Trails**, under
**Show output** in the Show's details, blends each frame with the one before
it, and **Retention** sets how much of the previous frame survives.

## 15. Transitions and animation

A Transition is a visible, selectable junction between connected Clips, with
Blend, Fade, Wipe, Dissolve, Shape reveal, and Motion families. Hovering a
variant previews it on the Stage before you commit, each exposes only its
legal fields, and costs are explicit: a feathered reveal evaluates both
Patterns only inside the band.

Deleting a Clip removes its attached Transitions and the animation tracks it
owns. Everything else keeps its place in time, so the vacated interval stays
blank unless other content covers it.

Property animation uses saved tracks with an explicit target, an active
interval, and keyframes at Show times; a Transition may carry its own ramp
over its window. Animated speed, brightness, opacity, Transform, exported
sliders, and split position appear as sparklines beneath their Zones. The
diamond beside any animatable field creates or reopens its ramp, and the
Clip's **Animations** overview is the one place to see and remove every
track.

## 16. Zones and routing

A new Show starts as one full-output Zone with no extra chrome. When you want
routing structure, the **Zones** button above the timeline's Zone column opens
the **Zone Map**, where you define Zones and their Layouts. **Layouts** also
live on the timeline and label stretches of the ruler, and the boundary
between Layouts is a routing switch with its own duration and easing: a
Show can rearrange its stage mid-flight while every Pattern keeps playing.

What Zones mean follows the output contract. Installation Layouts assign
physical pixel ranges, with coverage validated exactly. Portable Layouts use
normalized routing modes (Stripes, Grid, Checker, Rings, Pinwheel, Wave, or
an animatable Split) that hold on any compatible surface.

The **Stage** is the whole Show rendered over its output geometry and driven
by the Show's transport. On desktop it sits in a strip below the timeline,
with a narrow rail beside it holding playback and two outline toggles: Zone
guides that follow the current Layout, and an outline of the selected Clip's
content while that Clip plays. To its left, **Preview**, **Zones**, **Stage**,
and **Source code** fold to one-line summaries; Preview starts open. Its
brightness slider changes only how bright the browser draws, never the
authored Show or the Controller's output.

Drag the divider between the timeline and the strip to give either one more
room, or focus it and use **Up/Down**; PXLBLZ remembers the split. A paused
Stage keeps its frame while you resize, and light size and diffusion update
even while paused.

## 17. Cost, sending, and sharing

Your own Shows save automatically as you edit. If a save fails, the edit is
rolled back and Studio says so rather than leaving you with changes that exist
only in the browser. Undo history lasts for the session; reopening a Show
starts a fresh history.

The **Source code** section beside the Stage reports the delivered source
size, memory words, and how many Pattern copies can run at once. Expand it for
the byte-level inventory. Warnings and blockers stay visible below it, and
Run and Save failures appear in the Controller popover.

Every Pattern row in the inventory separates three counts that are easy to
confuse. **Configured uses** are separately configured versions of that
Pattern in the Show. **Copies in delivered code** are the copies the compiler
kept in the generated Pattern. **Timeline placements** are the Clips that put
those uses on the Stage. None of them says how many run at once: **Pattern
copies running** gives that maximum, and **Busiest LED** says how many Pattern
calculations can contribute to one LED, including the higher count reached
while visuals overlap.

Each row then reads as an equation: the compiled copies plus the source
generated for Show settings and placements add up to the Pattern's total.
Shared Show infrastructure, routing, Effects and Transitions, and Controller
transforms appear as their own rows. The inventory reports measurements and
leaves the creative choices to you. When a limit is exceeded, it names the
cause while editing and preview carry on.

Sending mirrors ordinary Patterns. The **Show actions** menu has **View code**
and **Download .epe**, and the Controller popover has **Run** and **Save**.
After an edit, Run and Save wait until the fresh Pattern is ready, so a stale
Show can never be sent.

**Export Show file…** shares the authored choreography itself: a `.pxlshow`
bundles the Show, every personal Pattern it uses, and any custom output map,
so another PXLBLZ workspace can import it and keep editing.

## 18. Built-in Shows to learn from

The Shows list ships learning material beneath your own:

- 17 **Learn** lessons, each adding one idea to the last.
- 19 **Showcases** that catalogue every Effect, Transition, animation easing,
  Aperture shape, and Zone Layout.
- Two finished **Portable Shows**: the Coronal Mass Ejection remix and
  Quadrille.
- Four map-specific **Installations**: the 2,000-pixel Redline; Overture, a
  128 BPM opening night for the Proscenium arch stage; Totality, a solar
  eclipse on the 490-pixel Eclipse Dome; and Black Sun, a 120 BPM black hole
  on the same dome.

Edit them freely. Changes live in a session draft, **Reset** or a reload
restores the shipped version, and **Clone** keeps your variant.

The **Lesson** pill beside the title opens a reading card: what the Show
demonstrates, what to look for, and two things to try, with a link to its
guide. Hover to read, click to pin. The card's **Live strip** switch adds a
narrow row above the timeline that narrates the Show as it plays, following
the current example, chapter, or Clip. **Try with Pattern** runs another
Pattern through the same choreography, which is the fastest way to see what
the Show itself is doing.

---

# Part 5 — Editing Shows with an agent

An agent can edit the Show you have open. Describe the change in words ("put
the fire Pattern on a new Layer for the last eight seconds and fade it in"),
and the agent turns it into the same edits you would make by hand. It works
through the Show editor rather than around it, so every agent edit follows the
editor's rules and lands in ordinary Undo history.

Two kinds of agent can do this. The built-in **Pixelblaze agent** lives inside
PXLBLZ; you type to it in the Agent drawer. Your own agent, such as Claude Code,
Codex, Claude.ai, or any other client that supports remote MCP, connects
from outside, and you keep talking to it wherever you already do.

## 19. The Agent drawer

The Agent drawer sits on the right edge of the Show editor. It appears when
you are signed in and the agent service is available. Click the edge tab,
or focus it and press **Enter**, to open the drawer. Pin it to keep it beside
the timeline. The drawer starts with a choice: **Use the Pixelblaze agent** or
**Connect your agent with MCP**.

The built-in agent is the quick way in. Choose it, type a request in **Ask for
an edit…**, and press **Send**. Above the message box, a counter shows how many
messages you have left today and when the count resets.

Everything either agent does appears under **Activity**. Each request gets one
entry. While the agent works, the entry reads **Thinking**. When it finishes,
the entry describes each change, or explains why nothing changed. Entries for
saved changes carry a small terminal icon. **Show MCP calls** in the drawer
menu (**⋯**) adds the raw commands under each entry. It's useful when you want
to see exactly what the agent asked the editor to do.

Edits to your own Shows save to your account like any other edit. Built-in
Shows stay session drafts, exactly as they do when you edit them by hand.
**Change agent** disconnects this window and returns to the choice; it is
unavailable while an edit is still in flight.

## 20. Connecting your own agent

**Connect your agent with MCP** walks through three steps:

1. **Add the endpoint.** Pick your client. PXLBLZ shows a ready-to-copy
   command for Claude Code or Codex. For Claude.ai, it shows where to paste the
   endpoint (Customize → Connectors → Add custom connector). **Other** gives
   you the bare endpoint.
2. **Authorize access.** The first time your client connects, it opens a
   browser tab where you sign in to PXLBLZ and approve the connection. The
   approval page names your account and the application asking for access.
3. **Connect this Show.** Click **Ready to connect**, then tell your agent
   "Connect to my Show in PXLBLZ." The window stays open for two minutes. When
   the agent calls, the drawer asks you to **Answer** or choose **Not now**,
   and gives you thirty seconds to decide.

Steps 1 and 2 happen once per client. After that, connecting to a Show is
just step 3. If a client goes unused for more than a day, expect it to ask you
to authorize again.

Your account holds one external agent connection at a time. Open a different
Show and the drawer shows where the agent is connected. **Bring agent here**
moves it to this Show, and **Reconnect** moves it to this window when the
connection is to the same Show in another tab. The old window notes that the
agent moved. Opening a Show never moves the agent on its own.

**Disconnect** ends the connection but keeps your client authorized, so it can
come back with step 3. **Forget this agent**, in the drawer menu, also revokes
the authorization. If a client cannot connect at all, check that it supports
remote MCP with OAuth; the client's own error message usually says which part
failed.

## 21. How agent edits land

An agent can work on almost anything in the Show's timeline. It can add, move,
resize, split, and remove Clips. It can rearrange Layers and Groups, add and
tune Transitions and Effects, and animate properties with keyframes. It can
also edit Layouts, Markers, and Show End. It sees the Show itself, the stock and
personal Patterns you could place (with their controls), and your Controller
profiles. It cannot edit Pattern source, create or delete Shows, or send
anything to a Controller; **Run** and **Save** stay with you.

An agent's work stays private until it is complete. The agent builds its
change in a private copy of the Show, checks each step against the editor's
rules, and then commits the whole thing at once. You see nothing half-finished
on the timeline. If one step is refused, for example because a Clip would
overlap another, the agent sees why. It can then fix that step, commit the
work that succeeded, or cancel. If you are in the middle of a drag or an edit
of your own, the entry reads **Waiting for you to finish** until you are done.
If your change conflicts with the agent's, the agent's change is not applied.

A committed edit is one Undo step. Activity then reports the outcome in plain
words: saved, applied to a draft, not applied, rolled back, or cancelled. If
contact with the service drops mid-edit, PXLBLZ does not guess: the entry
says the outcome is unknown and **Restore contact** checks what actually
happened without running anything twice.

Nothing retries on its own. For the built-in agent, send a new message. For an
external agent, ask it to try again in its own client; the drawer's failure
note says the same. Disconnecting, forgetting the agent, or leaving the Show
cancels any private work that has not been committed. A save that has already
started still finishes.

The [Agent Authoring Reference](agent-clip-layer-authoring.md) lists what an
agent can set on Clips, Layers, Effects, and animation, for anyone writing
prompts or building an agent against PXLBLZ.

## 22. Limits, cost, and privacy

The built-in agent runs on OpenAI's GPT-5.6 Luna and costs you nothing. It is
metered in three ways:

- **30 messages per account per day.** A message counts once, however much
  work it takes. The day follows UTC, and the counter shows the reset in your
  local time.
- **Four new requests per minute**, to keep one account from monopolizing the
  service.
- **A shared daily budget** across all accounts. If everyone's requests
  together use it up, the built-in agent pauses for everyone until the reset.

When a limit is reached, the drawer says which one (**Daily message limit
reached**, **Daily API budget reached**, or **Pixelblaze agent unavailable**)
and keeps your unsent message. An external agent has no PXLBLZ allowance; you
pay for it wherever you already pay for your client.

The built-in agent sends your request, the Show, and the editor information it
reads to OpenAI, with response storage turned off. An external agent receives
whatever it reads through its connection, and that client's own privacy terms
apply. [PXLBLZ Privacy](PXLBLZ Privacy.md) has the details.

---

# Part 6 — Boundaries

## 23. What PXLBLZ deliberately does not do

- Manage Wi-Fi, LED chipset, timezone, Output Expander setup, or other
  Controller settings. Use the Pixelblaze web UI.
- Rename or arrange device playlists. PXLBLZ can list, import, run, and delete
  individual saved Patterns, but it does not author playlist membership.
- Recover source from a saved Pattern that contains only compiled code.
- Continuously synchronize hardware control positions with Studio preview
  controls.
- Publish personal Patterns to public Gallery URLs.
- Synchronize a Show across several Controllers.

## 24. Known preview limits

- Pattern execution runs on the browser main thread. A syntactically valid
  infinite loop can freeze the tab; clean compilation is not a watchdog.
- Sensor Expansion Board inputs are inert stubs: sensor-reactive Patterns
  load, but audio, accelerometer, and light data do not animate in preview.
- Fast mode uses float64. Precise mode emulates fixed-point arithmetic but
  not every firmware algorithm bit-for-bit.
- Show seeking reconstructs deterministic Pattern state exactly; Trails is a
  deliberate output-history exception, and wall-clock, network, and sensor
  history cannot be recreated from Show time alone.

## 25. Choose the next document by the job

| I want to… | Go here |
|---|---|
| Learn the Pixelblaze ecosystem from zero | **Pixelblaze Ecosystem Primer** |
| Understand maps, normalization, and `pixelCount` | **Understanding Maps** |
| Study Effects, Transitions, and animation by example | [Visual Effects Guide](../guides/Visual effects guide.md) |
| Make a Pattern faster on hardware | [Optimizing Pixelblaze Patterns](../guides/Optimizing Pixelblaze patterns.md) |
| See how a Show becomes one Pattern | [Inside the Show Compiler](../guides/Inside the Show compiler.md) |
| See measured Show rendering wins | **Show Rendering Optimization Results** |
| Understand how PXLBLZ is built | **PXLBLZ Technical Reference** |

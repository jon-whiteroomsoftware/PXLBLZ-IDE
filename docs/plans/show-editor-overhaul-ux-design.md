# Show Editor overhaul UX design

Status: Proposed interaction design for review. This document translates the
[Show Editor overhaul feature PRD](./show-editor-overhaul-feature-prd.md) into
one coherent workspace. It does not authorize implementation or alter the
current visual brand.

## Recommendation

Build one continuous, ruler-led editor whose timeline directly contains Clips,
Transitions, Layers, Zone Layout intervals, Markers, and property animation. Keep
the Stage and the current PXLBLZ visual language. Remove every Scene-derived
view, put the ruler immediately above editable content, replace the zoom slider
with a compact Navigator, and let advanced structure appear only when authors
ask for it.

The design's signature is the **changing-topology timeline**. A hard Zone Layout
boundary restates the Zone and Layer stack inside the next time interval without
breaking the global ruler, playhead, or Show. This makes topology change literal
and inspectable instead of hiding it behind a Scene or sub-editor.

The ordinary one-Zone experience remains much simpler than that description:
one ruler, one Layer, and Clips. The same workspace grows into multiple Layers,
Zones, Layout intervals, Group isolation, and property tracks without changing
its editing grammar.

## Design constraints

- Preserve the existing dark zinc/near-black surfaces, monospace working type,
  compact controls, cyan Clip language, amber Transition/playhead language,
  violet property-animation language, and restrained borders.
- Preserve the Stage, Pattern and Effect catalogues, transport controls,
  Transition art, compile/cost disclosure, numeric fields, and existing direct
  manipulation where its semantics survive.
- Do not introduce a second timeline grammar for Groups, Zones, or advanced
  spatial placement.
- Optimize for tens of Clips and normally one to three Layers per Zone, not a
  professional editor's hundreds of assets and tracks.
- Keep exact values available without making numeric entry the primary path.
- Use labels, shape, and iconography in addition to color.

## Workspace anatomy

The editor retains the current split between authoring and Stage preview. The
authoring pane has six vertical bands:

1. Show header and delivery actions;
2. compact transport, Navigator, and structural commands;
3. optional Zone Map disclosure;
4. sticky ruler and Marker shelf;
5. continuous topology timeline; and
6. modeless Entity Details floating close to their source.

```text
+----------------------------------------------------------------+----------+
| Show name                         output / compile / run / save |          |
| [play] [A:start]  [======= Navigator window =======]  commands |  Stage   |
| [Zones >]  (hidden completely in the one-Zone default)         | preview  |
| 00:00        00:05        00:10       |marker|       Show End  | at the   |
|----------------------------------------------------------------| playhead |
| Layer 1  [Pattern A---------][cut][Pattern B------]             |          |
|          (first Layer: boundary snapping on)                    | controls |
| + Layer                                                        |          |
+----------------------------------------------------------------+----------+
```

The Stage never changes role. It renders the complete Show at the playhead.
Selecting a Zone may add a quiet Stage outline or solo diagnostic, but it never
turns the Stage into a second time scope.

### Recommended proportions

- Keep the existing authoring/Stage split and its resize behavior.
- Retain an approximately `128-136px` sticky timeline gutter; the current
  prototypes already demonstrate that this width can hold compact Layer and Zone
  identity without stealing the canvas.
- Use roughly `28-32px` for an ordinary Layer row, `18-22px` for a collapsed
  property row, and `24-28px` for the ruler.
- Keep the toolbar one row at normal desktop widths. Collapse labels before
  controls and move secondary commands into an overflow menu before wrapping.
- Target `280-340px` for a compact Entity Detail. A detail may grow vertically
  and scroll, but should not approach the current `520px` default width unless a
  specialized table genuinely requires it.

These are prototype targets, not persisted geometry.

## Visual and semantic grammar

Four relationships must never look interchangeable:

| Relationship | Meaning | Proposed cue |
| --- | --- | --- |
| Boundary snapping | Optional alignment aid | magnet glyph on the Layer header; temporary snap line during drag |
| Transition connection | Entities cannot separate | amber time-bearing Transition box and continuous connected outline |
| Shared Pattern instance | Clips share clock, state, seed, and Controls | small linked-clock badge plus shared-instance name/use count |
| Shared definition | Group or named Layout occurrences reuse structure | repeat/link badge with definition name and `N uses` scope copy |

Clip fill, selection ring, animation color, and transition color should remain
familiar. Badges sit inside the Clip only when there is room; otherwise they move
to the selected Entity Detail and an accessible tooltip. A minimum-width Clip
keeps one selectable body and suppresses internal text before it falsifies time.

### Timeline entities

- **Clip:** cyan-family body, Pattern icon/name, optional compact `fx`, viewport,
  shared-instance, Group, and presentation badges. Start/end handles appear on
  hover, keyboard focus, or selection.
- **Cut:** a small always-clickable junction drawn over two abutting Clip edges.
  It does not consume proportional width.
- **Transition:** an amber box occupying literal time. Its existing miniature
  SVG preview is the body, not a detached inspector illustration.
- **Marker:** a ruler handle plus guide line through visible topology. Marker
  lines may be hidden while their snapping remains active.
- **Keyframe:** the existing violet diamond on its owning property row. It never
  resembles a global Marker.
- **Show End:** a stronger ruler handle and trailing boundary. It snaps to the
  final content edge but permits intentional dead air.
- **Zone Layout boundary:** a full-height structural seam with a compact Layout
  label at the top of the next interval. It is neither a Transition nor a Scene.

## The ordinary one-Zone flow

The first Show opens with one implicit full-output Zone, one Layer, and no Zone
chrome. The empty state says **Add a Pattern** at the playhead. Adding creates a
five-second provisional Clip unless the available gap is shorter.

The author can immediately:

- drag the Clip body in time;
- drag either edge to change duration;
- drag into an existing Layer or Zone after deliberate vertical movement;
- select it to open compact Entity Details;
- place another Clip and use the Cut affordance between them;
- toggle boundary snapping on the selected Layer;
- drag a Marker from the ruler; and
- enter exact Start and Duration in seconds with decimal fractions.

No viewport, Pattern-instance, Zone, Group-definition, or compiler terminology
appears until an operation needs it.

## Toolbar, ruler, and Navigator

The toolbar is organized by frequency rather than object type:

```text
[Play/Pause] [A: Start]  [current / duration]
       [----- complete Show ----[visible window]------]
                       [Snap status] [Insert Time] [Add] [...]
```

The Navigator replaces the zoom slider because it exposes more useful state in
the same space. Its background is a quiet whole-Show occupancy summary. The
visible-range window can be dragged to pan or resized at either edge to zoom.
Clicking outside recenters it; Fit restores the whole Show. It may show the
playhead, Markers, Layout boundaries, and Show End without reproducing Layer
detail.

The ruler is the top edge of editable time. Clicking seeks. Dragging seeks.
Dragging a visible Marker seed/handle down from the ruler creates a Marker. The
Show End handle lives on the ruler. The ruler remains sticky while Zone stacks
scroll vertically.

## Add at playhead

Add at Playhead is one command with context-sensitive, stable choices. The menu
shows all applicable strategies and leaves impossible ones disabled with a
short reason.

### Empty time on the selected Layer

- **Add here:** begin at the playhead and fill to the next obstruction, capped
  by the provisional five-second default.
- **Add on Layer above:** available when that Layer exists or after explicit
  Layer creation.
- **Add at next opening:** useful when the current gap is too short.

### Playhead inside a Clip

- **Split and insert:** split the Clip, create room only through an explicit
  insertion choice, and preserve Pattern-instance continuity in the fragments.
- **Add on Layer above:** compose simultaneously without changing current
  content.
- **Add at next opening:** leave current content unchanged.

The menu previews the destination interval on hover. It never silently chooses
a different Layer or overwrites a Clip.

## Movement, resizing, and collision

Horizontal dragging previews the exact time in a small readout. Candidate Clip
boundaries and enabled Markers produce temporary alignment lines. The body stays
lane-locked until a deliberate vertical hysteresis threshold is crossed; then
legal destination Layers and Zones highlight.

Same-Layer temporal collisions clamp movement and show the obstructing edge.
The pointer may continue moving while the Clip remains at the legal boundary,
making the constraint clear. Passing an obstruction requires moving to another
existing Layer or using Insert Time.

When a non-Cut Transition connects Clips, the complete connected sequence gets a
subtle enclosing outline on hover or selection. Dragging any member previews and
moves the complete sequence. The three basic boundary edits are literal:

```text
[ Clip A | Transition | Clip B ]
         ^            ^        ^
         |            |        + resize Clip B
         |            + resize Transition; shift connected right side
         + resize Clip A; shift connected right side
```

The editor does not initially offer a rolling edit that preserves total sequence
length. Reset to Cut is the Transition deletion action.

## Selection and structural actions

Dragging from empty timeline space creates a marquee. Any visible intersection
selects an entity. During replace or additive acquisition, touching any member
of a non-Cut Transition-connected sequence expands selection to its complete
closure. The newly included members briefly pulse once.

Modifier refinement then operates literally. If the author subtracts one
required member, the editor honors the subtraction and disables **Make Group**
with a reason such as `Include the incoming Clip connected by Crossfade`.

Multi-selection exposes only:

- Move;
- Delete;
- Duplicate; and
- Make Group when structurally valid.

No mixed-value property form appears.

## Compact Entity Details

Selection opens one transient Entity Detail near the entity without covering its
active handles. The panel uses the strong summary already present in current
details, then dense field rows. Clicking away closes it. `I` toggles the detail
for the selected entity or, when nothing is selected, the Clip currently under
the pointer.

A pin keeps one Detail open while another selection opens a new transient one.
This is the proposed mechanism for side-by-side comparison without letting every
click accumulate panels. It should be validated; multiple unpinned panels are a
reasonable fallback if pinning feels too procedural.

The Clip Detail begins with:

```text
Pattern name                    [presentation: Live]
Start  4.023 s       Duration  5 s       Layer  1
X 0%   Y 0%          Width 100%          Height 100%   Rotation 0deg
[Enable Clip Viewport]
Effects >      Pattern controls >       Pattern instance >
```

Enabling Clip Viewport relabels the first spatial row **Content** and reveals a
second **Viewport** X/Y/Width/Height row initialized to `0%, 0%, 100%, 100%`.
There is no visual jump. Fit, Fill, Match, Center, and Reset appear as actions,
not saved modes.

The Pattern-instance section shows the instance name, first contribution time,
clock policy, exported Controls, and `Used by N Clips`. **Make Independent** and
**Rejoin Shared Pattern** include explanatory scope copy before committing.

Escape uses this priority:

1. cancel an active pointer gesture or close a transient menu/palette;
2. close all open Entity Details;
3. exit Group isolation; and
4. clear timeline selection.

## Property animation

Animation rows open immediately beneath the entity or structural header that
owns them. The row title states both property and owner, such as:

- `Clip - Opacity`;
- `Pattern instance - Speed`;
- `Group occurrence - X`;
- `Layout occurrence - Split Position`; or
- `Show - Trails retention`.

This naming is essential: animation never changes ownership. A selected Clip
may show several compact rows; closed rows retain a quiet keyframe summary in
the Clip body or Layer. Hidden keyframes beyond a shortened Clip remain visible
in the Detail as dormant values and reappear on the timeline when duration
extends.

## Clip presentation: Live, Freeze, Strobe, Blink, and Stutter

The Clip's presentation field begins at **Live**.

- **Freeze** exposes one entry-capture indicator. Upstream spatial/color
  animation rows remain present but receive a held-state cue after capture.
- **Strobe** exposes Cadence and Hold controls. Each capture tick may be shown as
  a faint repeated notch inside the Clip at sufficient zoom.
- **Blink** is an output-gate subsection with interval/duty controls; it never
  claims to stop Pattern time.
- **Stutter** appears in the Pattern-instance section because it changes the
  shared clock. Choosing it shows `Affects N linked Clips` before commit.

Freeze and Strobe resource use appears beside the mode and in compiler pressure
disclosure. A conflict disables the mode with the precise required/available RGB
storage; it never degrades silently.

## Groups

**Make Group** replaces the selected timeline entities with one selectable Group
occurrence shell while retaining a quiet internal summary. The shell has one
definition name and one occurrence badge. Its external handles move the
occurrence in time or translate it in X/Y; it has no initial Width, Height,
Rotation, or Viewport controls.

Double-clicking enters Group isolation in place:

- Group children regain ordinary Clip, Transition, and Layer handles;
- unrelated timeline content dims to approximately 25% opacity and becomes
  ineditable;
- the ruler, playhead, Stage, zoom, and Navigator do not change; and
- a slim `Editing Group: Name - N uses` scope bar offers Exit and Make Unique.

Definition edits announce `Updates all N occurrences`. Make Unique changes the
active occurrence's definition link without removing its Group shell. Ungroup
removes only that occurrence shell and leaves ordinary entities. Duplicating a
Group links the definition but allocates fresh runtime Pattern instances while
preserving sharing inside the definition.

A Group definition may be reused in another Zone. Dragging or pasting an
occurrence highlights the full multi-Layer footprint. Missing Layers may be
created only through an explicit confirmation. A collision in any existing
occurrence blocks a shared definition edit and identifies the occurrence; Make
Unique is the escape hatch.

## Zones and Zone Layout intervals

### Progressive disclosure

The **Zones** control toggles the Zone Map. In a one-Zone Show, closing it removes
Zone UI completely. Once the active Layout contains several Zones, closing the
full map leaves a micro-thin icon picker so the author can switch the Zone shown
in focus mode.

The Zone Map reflects the Layout occurrence at the playhead and shows:

- Layout name or `Unnamed layout`;
- shared-definition use count when named;
- each Zone's optional icon, name, color, and topology summary;
- complete Installation coverage status or Portable operator; and
- Add Zone, Use Layout, Copy Previous, and Layout actions.

An icon is optional. Wide states show icon plus full name, narrow states truncate
the name, and the micro picker may show only the icon with an accessible label.

### Changing topology on one ruler

Each Zone Layout occurrence is a horizontally proportional, self-contained
timeline interval. Adjacent intervals align at the top and may have different
intrinsic heights.

```text
RULER      00:00                00:12          00:20                 00:32
           Layout: Quartet      | Layout: Full | Layout: Triptych
           ---------------------+--------------+-------------------------
           [NW  L1  clips.....] | [Full L1...] | [Left  L1 ...........]
           [NE  L1  clips.....] | [Full L2...] | [Center L1 ..........]
           [SW  L1  clips.....] |              | [Right L1 ...........]
           [SE  L1  clips.....] |              | [Right L2 ...........]
```

The enclosing timeline takes the tallest visible interval; a shorter interval
does not invent phantom Layers. Independent Zone collapse, compact summaries,
focus mode, and ordinary vertical scrolling control height.

At every hard boundary the next Layout restates its Zone and Layer headers. When
the interval begins left of the viewport, a translucent local header rail sticks
to the timeline gutter until the next Layout pushes it away. This preserves
identity without assigning fake duration to labels. The playhead line crosses
the full visible canvas, and the Stage switches topology exactly at the boundary.

Nothing crosses the seam. A Clip continuation on the other side is a new Clip
that may explicitly share the same Pattern instance. A Group occurrence ends at
the seam. The boundary Detail explains both adjoining Layouts.

### Layout creation and reuse

At a hard boundary, **New Layout interval** offers:

- **Start new:** ad hoc topology, unnamed until useful;
- **Use named Layout:** shared topology with empty choreography;
- **Copy previous Layout:** independent copied topology with empty choreography;
  and
- **Duplicate previous interval:** shared topology plus complete copied
  choreography and fresh runtime instances.

The last option is an operation, not a persistent Scene-like container.

Editing a reused Layout occurrence presents two equally visible choices:
`Make unique for this interval` and `Edit all N uses`. Opening the named Layout
catalogue is the explicit all-uses context; it keeps use count and affected
intervals visible throughout.

**Duplicate Zone Track** lives on a Zone header. It previews the destination
Zone and copies Layers and choreography at identical Show times. It is the fast
path for spatial echoes without creating a cross-Zone Group occurrence.

### Portable Split

Split and Soft Split Layouts always show exactly two Zone stacks. A compact
`Split Position` property row sits above them. The same row handles a static
value or keyframes; there is no separate Moving Split mode. Axis and Soft Split
feather live in the Layout definition Detail.

Arbitrary animated handoff between different Layout definitions receives no
authoring control in this release.

## Insert Time and Show End

Insert Time is deliberately separate from dragging. Its compact popover asks for
location and duration, previews the global vertical insertion seam, and lists
affected Clips, Groups, Markers, Layout boundaries, and automation. It is
disabled when the insertion point falls inside a Transition.

Every intersected ordinary Clip splits. Linked Pattern state continues through
the new gap. A shared Group occurrence cannot be rewritten silently; the preview
requires Make Unique or Ungroup before insertion can proceed.

Show End is a ruler handle. Dragging into blank tail time is immediate and snaps
to the final content edge. It cannot cross content in ordinary dragging. A later
explicit Trim Show command may own destructive truncation.

## Filmstrips as progressive information

Filmstrips are not part of first paint. A Clip appears immediately with stable
geometry, label, color, and badges. When the editor is idle:

1. selected visible Clips receive one representative frame;
2. additional frames arrive slowly across selected Clips;
3. other visible Clips fill in; and
4. resolution improves only while the system remains idle.

Dragging, scrolling, zooming, scrubbing, playback pressure, property edits, or
dropped frames cancel or pause jobs. Slots are reserved before content arrives,
so no layout shifts or shimmer occurs. A subtle fade is sufficient.

Because samples use actual Show time, filmstrips make independent restart,
shared-instance continuity, Split continuity, Stutter, Freeze/Strobe capture,
and Transition pre-roll visible without adding new notation.

## Keyboard model

Keyboard behavior is scoped to the timeline unless focus is inside a native
field, menu, or Entity Detail control.

| Key | Timeline action |
| --- | --- |
| Space | Play/pause |
| A | Seek to Show start |
| Tab / Shift+Tab | Next/previous Clip in deterministic time, Zone, Layer order; wraps |
| Left / Right | Pan the timeline by one visible page |
| I | Toggle Entity Detail for selection or hovered Clip |
| Escape | Apply the priority described under Entity Details |
| Platform Undo/Redo | Undo/redo one semantic edit |
| Platform Cut/Copy/Paste | Standard structural clipboard behavior |

Native Tab traversal remains inside open Details and menus. The global Clip
traversal handler runs only while the timeline canvas owns focus.

## Narrow-window behavior

The design degrades by hiding labels and reducing simultaneous context, not by
changing the model:

1. toolbar labels collapse to icons with tooltips;
2. the Navigator shortens but remains draggable;
3. the Zone Map closes to the micro picker;
4. only one Entity Detail remains unpinned and is clamped inside the viewport;
5. focused-Zone mode is recommended when all-Zone stacks become illegible; and
6. the Stage keeps its existing resizable boundary rather than moving into a
   modal preview.

The timeline maintains a useful minimum width and scrolls inside its own pane.
It must never create page-level horizontal overflow.

## Accessibility and feedback

- Every pointer operation has an equivalent command or numeric route, even when
  not every path receives a first-release shortcut.
- Handles meet a practical pointer target through invisible hit areas while
  retaining visually compact geometry.
- Focus rings use the existing high-contrast amber/cyan language and are never
  suppressed.
- Disabled menu items remain focusable through roving menu navigation and expose
  a concise reason through description text.
- Zone identity never depends only on color; optional icons and names remain in
  accessible labels.
- Minimum-width Clips preserve accurate announced Start and Duration.
- Selection closure, shared-edit scope, resource blockers, collisions, and held
  animation receive text as well as visual feedback.
- Reduced-motion mode removes selection pulse and filmstrip fade without hiding
  state changes.

## Component reuse and replacement

### Preserve or adapt

- `ShowStagePreview` and its map, diagnostics, transport, and replay seam;
- Show transport controls and time display, replacing Home with `A`;
- timeline viewport geometry, pan/zoom engine, wheel behavior, and auto-scroll;
- the Show Navigator behavior, promoted to replace the zoom slider;
- Clip bars, direct manipulation handles, selected-state treatment, Cut and
  Transition SVG assets;
- `ShowClipEntityDetail` fields, summaries, Pattern controls, Effect palette,
  and pure inspector model after ownership is separated;
- numeric fields, easing controls, Effect catalogue, resource disclosures, and
  semantic color vocabulary; and
- Stage Zone outlines and focused-Zone diagnostics.

### Replace structurally

- `ShowEditor` orchestration that assumes Scene ownership;
- `SceneStrip`, Scene column headers, Scene X-ray, Super Detail, Scene-local
  transport, Scene Zone editor, Scene transition lane, and routing switches as
  Scene boundaries;
- the global zoom-slider cluster; and
- the single `520px` Entity Detail shell as the only panel geometry.

The replacement should be assembled around framework-independent edit and
projection engines. React renders Layout intervals and semantic operations; it
does not recalculate collision, ownership, selection closure, or time mapping.

## Prototype sequence

The first interactive prototype should answer structural questions before it
polishes forms:

1. **One Zone:** Add, move, resize, Cut/Transition, Navigator, Show End, and one
   compact Clip Detail.
2. **Selection and Group:** marquee closure/refinement, Group isolation, linked
   duplicate, Make Unique, and cross-Zone placement.
3. **Changing topology:** a representative `4 Zones -> 1 Zone -> 3 Zones`
   Show with varying Layer counts, local sticky headers, collapse, focus, and
   continuous playhead.
4. **Layout reuse:** ad hoc creation, naming, Use Layout, Copy Previous,
   Duplicate Zone Track, Duplicate Interval, and explicit all-uses editing.
5. **Advanced Clip:** Viewport, property rows, shared Pattern instance, Freeze,
   Strobe, Blink, and Stutter scope.
6. **Pressure test:** narrow window, many open Details, minimum-duration Clips,
   high Layer count, vertical scrolling, and several nearby Layout boundaries.

The third prototype is the load-bearing test. If authors cannot preserve time
orientation and understand which local Zone stack they are editing when
topology changes, the interval design needs revision before implementation. A
failure there must not be papered over with more labels.

## Review questions

1. Does the interval-local sticky header preserve orientation when the start of
   a Zone Layout occurrence is offscreen?
2. Is an intrinsically shorter one-Zone interval understandable beside a taller
   four-Zone interval, or does the empty canvas below it imply missing content?
3. Does pinning provide the right compact multi-Detail behavior, or should every
   newly opened Detail remain independent until Escape closes all?
4. Should a hard Layout boundary be draggable only through time that is empty on
   both adjoining Layouts, or should its time remain numeric/command-only in the
   first release?
5. Does `I` feel right for Entity Detail toggle alongside Space, A, Tab, and the
   standard clipboard shortcuts?
6. At what stack height should the editor recommend focus mode without switching
   automatically?

These questions are suitable for the prototype. They do not reopen the PRD's
settled ownership, time, Transition, Group, or Zone Layout contracts.

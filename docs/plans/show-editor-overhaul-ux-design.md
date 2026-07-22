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
authoring pane has five vertical bands:

1. Show header and delivery actions;
2. one grouped toolbar containing transport, Navigator, and structural commands;
3. sticky ruler and Marker shelf;
4. continuous topology timeline; and
5. modeless Entity Details floating close to their source.

The Zone Map opens over the workspace from the toolbar. It never inserts a
permanent Active Layout strip or another vertical band.

```text
+----------------------------------------------------------------+----------+
| Show name                         output / compile / run / save |          |
| [play] [A:start] | [=== Navigator ===] fit | Zones  commands   |  Stage   |
| 00:00        00:05        00:10       |marker|       Show End  | at the   |
|----------------------------------------------------------------| playhead |
|          [Pattern A---------][cut][Pattern B------]             |          |
|          fx: glow      property: brightness sparkline           | controls |
| + Layer                                                        |          |
+----------------------------------------------------------------+----------+
```

The Stage never changes role. It renders the complete Show at the playhead.
Selecting a Zone may add a quiet Stage outline or solo diagnostic, but it never
turns the Stage into a second time scope.

### Recommended proportions

- Keep the existing authoring/Stage split and its resize behavior.
- Retain an approximately `128-136px` sticky timeline gutter where Zone identity
  or disclosed detail labels require it. Unnamed Layer lanes do not consume the
  gutter merely to restate their order.
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
| Boundary snapping | Optional alignment aid | quiet magnet state for the selected/hovered Layer plus temporary snap line during drag |
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

The Zones toggle remains in the toolbar as the discovery path. Only the Zone
Map and redundant Zone headers disappear in the default one-Zone state.

## Toolbar, ruler, and Navigator

The toolbar remains one row at normal desktop widths and reads as three
clusters, not one run of boxed controls:

```text
[Play/Pause] [A: Start] [current / duration]
         | [----- complete Show ----[visible window]------] fit
         | [Zones] [Snap] [Select] [Insert Layout] [Add] [...]
```

Transport and time form the left cluster, the flexible Navigator and subtle Fit
affordance form the viewport cluster, and structural commands form the right
cluster. Alignment may resolve as left/center/right or as two outer groups after
final rendering, but spacing and at most two quiet separators must express the
three meanings. Labels disappear before controls wrap. The compact Zones button
does not repeat the active Layout name; the timeline supplies that identity and
the control's accessible label may include it.

The Navigator replaces the zoom slider because it exposes more useful state in
the same space. Its background is a quiet whole-Show occupancy summary. The
visible-range window can be dragged to pan or resized at either edge to zoom.
Clicking outside recenters it; Fit restores the whole Show. It may show the
playhead, Markers, Layout boundaries, and Show End without reproducing Layer
detail.

Fit is an icon-level affordance adjacent to the Navigator, not a primary boxed
button. It changes only the viewport, showing `0` through Show End at the
largest scale that fits; it never seeks the playhead and becomes inactive when
the whole Show is already visible.

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

## Creating Zone Layout intervals

Layout creation uses the same structural grammar as Insert Time. The primary
entry points are:

- **Append Layout Interval** at Show End;
- **Insert Layout Before** and **Insert Layout After** in a Layout-boundary menu;
  and
- **Insert Layout Interval at Playhead** in the Insert menu and Zone Map.

The first two paths are visually primary because they match the common workflow.
Playhead insertion remains available anywhere legal, but it inserts duration; it
does not reinterpret populated downstream choreography as a new topology.

Inserting within an existing interval performs one atomic operation:

1. ask for duration and Layout source;
2. split every intersected Clip, retaining its Pattern instance;
3. shift all later content exactly as Insert Time does;
4. create an entry boundary and a return boundary;
5. place the selected Layout in the new blank interval; and
6. resume the previous Layout afterward.

The operation is unavailable inside a Transition. An intersected linked Group
requires Make Unique or Ungroup, using the same rule as Insert Time. Appending at
Show End needs only the entry boundary.

One creation surface offers four sources with stable language:

- **Blank Layout**;
- **Use named Layout** — shared topology, empty choreography;
- **Copy previous Layout** — independent topology, empty choreography; and
- **Duplicate interval** — shared topology, copied choreography, fresh Pattern
  instances preserving internal sharing.

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

Clicking a Cut opens a compact Transition chooser using the existing SVG
previews and a Duration field. The initial duration is the smaller of the normal
default and the free interval after the connected right-hand sequence. If only
`0.4s` is free, the field begins at `0.4s`. If no time is free, non-Cut choices
remain visible but disabled with `No room after this sequence` and an **Insert
Time…** action.

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

A completed click selects an entity and opens one transient Entity Detail near
it without covering active handles. Pointer-down followed by movement beyond the
drag threshold selects for manipulation but does not open a new panel. The panel
uses the strong summary already present in current details, then dense field
rows. Clicking away closes it. `I` explicitly toggles the Detail for the selected
entity or the Clip currently under the pointer; hover alone never opens anything.

A pin keeps one Detail open while another selection opens a new transient one.
This is the proposed mechanism for side-by-side comparison without letting every
click accumulate panels. It should be validated; multiple unpinned panels are a
reasonable fallback if pinning feels too procedural.

During any direct timeline manipulation — move, resize, Transition adjustment,
Group movement, or marquee selection — all floating Entity Details temporarily
hide. Pinned and transient Details preserve their state and reappear anchored to
their entities when the gesture commits or cancels. The timeline retains only a
small readout for changing time, duration, Layer, or Zone. Hiding and restoration
create no undo step and use no animation beyond an optional very short fade.

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
Ordinary **Duplicate** and **Duplicate Linked** sit together in the Clip context
menu. **Use Same Instance…** opens a compatible-instance chooser with names,
first contribution times, and use counts; it never guesses which instance the
author means.

Escape uses this priority:

1. cancel an active pointer gesture or close a transient menu/palette;
2. close all open Entity Details;
3. exit Group isolation; and
4. clear timeline selection.

## Property animation

Animation rows open immediately beneath the Clip-owned Layer lane or structural
header that owns them. Empty Layers reserve no animation space. The row title
states both property and owner when ownership is not already obvious, such as:

- `Clip - Opacity`;
- `Pattern instance - Speed`;
- `Group occurrence - X`;
- `Layout occurrence - Split Position`; or
- `Show - Trails retention`.

This naming is essential: animation never changes ownership. A selected Clip
may show several compact rows. One or two rows use comfortable sparkline height;
additional rows compress progressively while preserving keyframe dots as the
semantic anchors. Hovering, focusing, or selecting a compressed row may expand
it temporarily, and a dense stack may show the most relevant rows plus an
overflow disclosure. Closed rows retain a quiet keyframe summary in the Clip
body or collapsed Zone miniature. Hidden keyframes beyond a shortened Clip
remain visible in the Detail as dormant values and reappear on the timeline when
duration extends.

A shared Pattern instance has no single Layer home. Selecting it projects its
animation into Show time beneath each visible linked appearance. Each projection
uses the linked-clock badge and the same instance name; editing any projection
changes one underlying instance track. Gaps, time-rate changes, and Stutter use
the instance's actual time mapping. Prototype 5 must test whether repeated
projections clarify sharing or create too much visual duplication.

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

The shell is segmented by occupied Layer. Each segment follows the actual child
footprint and the segments share a thin bracket/outline, one name, and one
selection state. Empty intermediate Layers retain no click-catching overlay, so
unrelated Clips remain directly selectable. Clicking any segment selects and
moves the complete Group occurrence.

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

The **Zones** control always remains in the toolbar and toggles the Zone Map. In
a one-Zone Show, closing it removes the map and redundant Zone header completely.
The Zone Map opens as an overlay and never adds a permanent Active Layout row.
In a multi-Zone Layout, closing it leaves the complete timeline in place; each
Zone header supplies its own collapse control.

The editor has one active Layout context: the selected entity's interval when a
selection exists, otherwise the playhead's interval. The overlaid Zone Map
reflects that editing context. The Stage remains tied exclusively to the
playhead.

The Zone Map shows:

- Layout name or `Unnamed layout`;
- shared-definition use count when named;
- each Zone's optional icon, name, color, and topology summary;
- complete Installation coverage status or Portable operator; and
- Add Zone, Use Layout, Copy Previous, and Layout actions.

An icon is optional. Wide states show icon plus full name, narrow states truncate
the name, and the most compressed state may show only the icon with an
accessible label.

Each Zone collapses independently within each Layout occurrence. The collapsed
state is a miniature time-accurate stack: every Layer becomes a thin lane, Clip
spans retain their colors and exact boundaries, property animation reduces to
curves and keyframe dots, and Effects and Transitions remain visible as compact
events. These boundaries remain snapping targets. `Focus Zone` is merely a
convenience command that expands one Zone and collapses its siblings; it does not
create another editor mode. A one-Zone Layout offers no collapse control.

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

The enclosing timeline uses the tallest interval in the current display state;
a shorter interval does not invent phantom Layers. Its height remains stable
during horizontal pan and zoom. It changes only when the author explicitly
expands or collapses a Zone or adds/removes Layers. Independent Zone collapse,
compact summaries, and ordinary vertical scrolling control height.

At every hard boundary the next Layout restates its Zone headers and unnamed
Layer lanes. When
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

The interval label row is suppressed when the Show contains only one Layout
occurrence. It appears as soon as topology changes over time.

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
| Delete / Backspace | Delete the selection, with structural warnings where required |
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
3. the overlaid Zone Map closes without leaving another toolbar or picker;
4. only one Entity Detail remains unpinned and is clamped inside the viewport;
5. independent Zone collapse remains available when all stacks become
   illegible; and
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

### Prototype findings

The throwaway prototype at `?prototype=show-overhaul` tests one changing-
topology model against the same `4 Zones -> 1 Zone -> 3 Zones` fixture. Every
Zone remains part of the continuous timeline. Prototype presets merely establish
different manual per-Zone collapse states; they are not product modes.

Full stacks is the default structural model. Authors independently collapse any
Zone they do not need to edit, and `Focus Zone` may apply a convenient set of
those ordinary states. An earlier Active Interval treatment was rejected because
it hid too much cross-boundary choreography. A separate per-Layout focus mode is
unnecessary once collapse is selective.

The prototype also validates these supporting decisions:

- a one-Zone Show can omit Zone headers and Layout labels entirely;
- transport, the flexible Navigator, a quiet Fit affordance, and structural
  commands can share one grouped toolbar above the ruler;
- unnamed Layer lanes need no permanent labels or object chrome;
- Clip-owned Effects and property animation can appear as conditional nested
  rails and compress into the collapsed Zone miniature;
- the Stage can collapse into a shallow top band at narrow widths while the
  timeline retains internal horizontal scrolling and creates no page overflow;
- Entity Details can disappear during direct manipulation and restore afterward
  without losing the author's working context;
- a Cut can remain a tiny persistent junction while opening a Transition chooser
  that shows the maximum duration currently available; and
- insertion choices fit in one compact command surface when their downstream
  effects are summarized before confirmation.

The prototype is a structural artifact, not production code. Implementation may
reuse its fixture and interaction vocabulary, but should rebuild the surface on
the production Show model and existing design-system components.

## Review questions

1. Does the interval-local sticky header preserve orientation when the start of
   a Zone Layout occurrence is offscreen?
2. Is an intrinsically shorter one-Zone interval understandable beside a taller
   four-Zone interval, or does the empty canvas below it imply missing content?
3. Does pinning provide the right compact multi-Detail behavior, or should every
   newly opened Detail remain independent until Escape closes all?
4. Should a hard Layout boundary remain numeric/command-only initially, or may it
   be dragged through time that is empty in both adjoining Layouts?
5. Does `I` feel right for Entity Detail toggle alongside Space, A, Tab, and the
   standard clipboard shortcuts?
6. At what stack height should the editor suggest collapsing sibling Zones
   without changing their state automatically?
7. Do repeated Show-time projections of one shared Pattern-instance animation
   clarify sharing, or should only the active projection expand?
8. Are segmented Group shells easy to select without obscuring unrelated Clips
   on intermediate Layers?
9. Should Details auto-open after a completed selection click, or only after `I`,
   once users begin rapid structural editing?
10. How should adjacent minimum-display-width Clips cluster without falsifying
    their time positions or overlapping hit targets?

These questions are suitable for the prototype. They do not reopen the PRD's
settled ownership, time, Transition, Group, or Zone Layout contracts.

# Independent Design Proposal: Show Timeline production density

## Recommendation

Use one stable three-pane IDE frame and one Timeline grammar at two time scopes.
The global Show Timeline is the production baseline; Scene-local detail swaps the
center Timeline's ruler and lane vocabulary while the library and Stage remain
fixed. A compact, modeless Quick Inspector follows the current selection in the
application overlay layer, so properties remain close without consuming a
permanent column or moving authored rows.

The visual system should behave like a calibrated instrument rather than a
stack of forms. Primary authored rows are 30 pixels high, subordinate lanes are
22 pixels, the ruler is 24 pixels, and controls use 10-11 pixel utility type with
explicit 24-pixel pointer targets where needed. Whitespace separates ownership
groups; borders, indentation, icons, and text carry structure instead of large
padding blocks.

## User workflow

### Global Show editing

1. The author opens a Show. The left library, center Timeline, and right Stage
   occupy the same positions used elsewhere in the IDE.
2. The Timeline opens fitted to the complete Show. Scene boundaries form one
   quiet header band; zones form compact rows beneath it; top-level Transitions
   occupy a dedicated boundary lane.
3. Clicking a Pattern clip selects it and opens one Quick Inspector adjacent to
   the clip. Clicking the same clip again closes the Inspector but leaves the
   clip selected. Selecting another entity transfers the same Inspector.
4. Common values are immediately editable. Structured or infrequent values sit
   behind compact disclosure groups. `Pin` converts the same Inspector into a
   narrow dock for a sustained parameter-editing session.
5. Empty-space dragging box-selects. Shift-click and Shift-drag add to the
   selection. Dragging the selection shows a single ghost, snap guides, and the
   exact insertion/displacement result before commit.
6. The author scrubs with the playhead, pans the viewport with a temporary Hand
   gesture, and zooms around the pointer or playhead. Viewport movement never
   writes Show history.
7. Copy/paste inserts a preview ghost at the playhead in the focused zone. The
   author can move the ghost before committing; Escape cancels it.

### Entering Scene-local detail

1. A Scene header exposes `Open Scene` when selected. Entering it replaces the
   global lanes with local base placements, overlays, and authored Property-
   animation lanes.
2. A compact breadcrumb and scope strip show `Show / Scene`, `LOCAL`, and the
   zero-based local time. A 20-pixel Show navigator marks the Scene's global
   position but is not another editable Timeline.
3. The same playhead, ruler, snap guides, clip selection, Quick Inspector,
   viewport gestures, clipboard, undo, and Stage operate in local time.
4. `Back to Show` restores the prior global viewport, playhead, selection, and
   keyboard focus. The local Scene retains its own viewport state for re-entry.

## Information architecture and structure

### Stable desktop frame

Target redline at a 1440 x 900 application window:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ APP BAR 38                                                                   │
├──────────────┬──────────────────────────────────────────────┬────────────────┤
│ LIBRARY      │ SHOW AUTHORING                              │ STAGE          │
│ 184 px       │ flex: min 640 px                            │ 304 px         │
│              │                                              │ same geometry  │
│ Shows        │ scope + transport + edit tools       34 px  │ Pattern / Show │
│ Patterns     ├──────────────────────────────────────────────┤ / Scene render │
│ Maps         │ Timeline ruler                       24 px  │                │
│              │ Scene band                           26 px  │                │
│              │ Transition lane                      24 px  │                │
│              │ Zone: Left / primary Pattern         30 px  │                │
│              │   Property animation (expanded)      22 px  │                │
│              │ Zone: Center / primary Pattern       30 px  │                │
│              │ Zone: Right / primary Pattern        30 px  │                │
│              │                                              │                │
│              │      ┌ QUICK INSPECTOR 292 x 154 ┐          │                │
│              │      │ selected Pattern properties│          │                │
│              │      └────────────────────────────┘          │                │
│              ├──────────────────────────────────────────────┤                │
│              │ VIEWPORT NAVIGATOR                    22 px │                │
├──────────────┴──────────────────────────────────────────────┴────────────────┤
│ COMPILE / COST / CONTROLLER STATUS 26                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

The Stage stays 304 pixels wide by default. Its internal pixel geometry and zone
overlay remain identical across scopes. A user may independently collapse the
library or Stage to give the Timeline more width; property presentation does not
implicitly replace either pane.

### Global Timeline redline

The left label gutter is 132 pixels and sticky. The time canvas begins after the
gutter. Scene durations remain proportional; Transition intervals consume real
time rather than decorative fixed widths.

```text
                 00:00       00:04       00:08       00:12       00:16
┌───────────────┬───────────┬────┬──────────────┬───┬───────────────────┐
│ SHOW TIME     │ 0         │    │ 5            │   │ 10                │ 24
├───────────────┼───────────┼────┼──────────────┼───┼───────────────────┤
│ SCENES        │ Orchard   │    │ Glass rain   │   │ Afterglow         │ 26
│               │ 4.2 s  ◇2│    │ 5.8 s  ◇0    │   │ 7.0 s  ◇4  Open › │
├───────────────┼───────────┼────┼──────────────┼───┼───────────────────┤
│ TRANSITIONS ⚡│           │Mix │              │Cut│                   │ 24
├───────────────┼───────────┴────┴──────────────┴───┴───────────────────┤
│ ▌ LEFT    84px│ [Prismatic veil]   [Cold lattice────────────]         │ 30
│   ↳ opacity   │ ──◆────────◆──────────────────────────────◆──         │ 22
├───────────────┼───────────────────────────────────────────────────────┤
│ ▌ CENTER  88px│ [Prismatic veil────────] [Pulse field────────]       │ 30
├───────────────┼───────────────────────────────────────────────────────┤
│ ▌ RIGHT   84px│ [Ember fall──────] [Pulse field──────────────]       │ 30
└───────────────┴───────────────────────────────────────────────────────┘
```

Each primary row contains, in order: entity icon, compact name, only the most
useful state badges, and edge handles on hover/focus. A Scene's `◇2` complexity
badge means two internal authored lanes; it summarizes rather than miniaturizes
the local Timeline. Property lanes are collapsed by default and appear only when
authored or explicitly expanded.

Color identifies family but never carries type alone:

- Scene: rectangular header plus Scene icon;
- Pattern clip: solid leading zone bar plus Pattern-grid icon;
- Transition: boundary wedge plus Transition icon and abbreviated family;
- Effect: `fx` badge attached to its owning placement;
- Property animation: indented lane, property icon, and diamond keyframes;
- overlay: stacked-squares icon and an upper-edge compositing stripe.

### Scene-local derivative

The local view spends 20 additional pixels on orientation and then uses the same
row metrics and label gutter.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ SHOW  Cathedral Signal / Neon orchard   LOCAL 00:00.180 / 00:02.000  32   │
├───────────────┬───────[ Orchard selected in complete Show ]──────────────────┤
│ SHOW MAP      │ ░░░░░░░░░░██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  20   │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ LOCAL TIME    │ 0    125 ms   250 ms       500 ms       1 s       2 s  24   │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ BASE · ALL    │[O][P][O][P][Neon orchard────────────────────────────]  30   │
│ OVERLAY  ▱    │       [Prismatic veil · fx2────────────────────]      30   │
│   ↳ opacity   │       ◆──────────◆──────────────────────────◆         22   │
│ LEFT zone     │          coverage ███████████████████████████         22   │
│ CENTER zone   │          coverage ███████████████████████████         22   │
│ RIGHT zone    │          coverage ███████████████████████████         22   │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ OUTGOING ⚡   │ Motion · 320 ms → Afterglow                          24   │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

The base lane contains mutually exclusive local cuts. Overlay rows represent
composited sources and therefore carry both the overlay icon and a compositing
stripe. Zone rows show coverage/routing membership, not additional blended
sources. The outgoing top-level Transition remains visually separated below the
local composition.

### One property rubric

Every Inspector uses the same ordering even when individual fields differ:

1. **Identity** — icon, type, name, owning scope, compatibility badge;
2. **Time** — start, duration/end, entry/restart, continuation;
3. **Source and placement** — Pattern source, zone/routing, position, scale,
   rotation, opacity, z-order where applicable;
4. **Visual stack** — Effects in evaluation order, bypass, preset, primary
   parameter;
5. **Animation** — authored-property summary, keyframe count, easing;
6. **Cost and advanced** — renderer count, compatibility, disclosure for the
   uncommon fields.

Simple entities omit irrelevant groups rather than preserving empty slots.
Within a group, compact two-column label/value rows are preferred; a range,
curve, vector, or Effect stack may span both columns. The group order, 96-pixel
label alignment, iconography, and disclosure affordance stay consistent.

### Quick Inspector redline

Default width is 292 pixels, minimum 252, maximum 352. The header is 26 pixels;
ordinary fields are 24 pixels; maximum default body height is 236 pixels before
internal scrolling or `Open details`. It is rendered in the app overlay root,
not inside Timeline overflow.

```text
┌ ▦ PATTERN  Prismatic veil          pin  × ┐ 26
├────────────────────────────────────────────┤
│ Time       00.180      End         01.400 │ 24
│ Entry      Continue    Speed        0.70× │ 24
├────────────────────────────────────────────┤
│ Opacity    Animated · 3◆            68%   │ 24
│ Scale      82%         Rotation       -8° │ 24
├────────────────────────────────────────────┤
│ Effects    Scale › Opacity             ›  │ 24
│ Advanced / cost                         ▸  │ 24
└────────────────────────────────────────────┘
```

The Inspector prefers the selected entity's lower edge, then upper edge. It
shifts horizontally to remain inside the application viewport and may overlap
the library or Stage temporarily. It never reflows lanes. During a content drag
it hides after the movement threshold and reappears at the committed position.

## Key interactions and states

### Selection and inspection

- Click an unselected entity: select and open the Inspector.
- Click the selected entity: toggle the Inspector without clearing selection.
- Click another entity: transfer selection and Inspector in one action.
- Escape: close Inspector; a second Escape clears selection or cancels the
  current transient operation.
- Keyboard `Inspect` command: toggle for the focused/selected entity. The final
  binding remains open.
- Multi-selection: anchor to the selection bounds and show count, shared values,
  `Mixed` values, and aggregate commands. Never open one Inspector per entity.
- Pin: preserve content, field focus, scroll position, and selection while
  moving the same Inspector into a narrow dock.

### Moving, inserting, and displacing

Selected entities move as one transaction. The drag display has three layers:

1. translucent originals retain source context;
2. a single compact ghost follows the pointer and reports delta time/zone;
3. a high-contrast insertion line and displaced-content preview show the exact
   result.

Green means a valid magnetic insertion, amber means content will be displaced,
and red means an invalid ownership or duration result. Each state also has an
icon and short text label. Alt temporarily reverses snapping. Escape cancels.
Undo restores the entire move rather than replaying item-by-item changes.

### Viewport navigation and transport

- Drag playhead/thumb: seek preview time.
- Drag authored entity/handle: change content.
- Space-hold plus pointer drag: temporary Hand pan; Space tap without a started
  drag remains play/pause.
- Middle-button or two-finger trackpad drag: viewport pan.
- Command/Ctrl-wheel: zoom around the pointer; toolbar zoom uses the playhead
  when visible and viewport center otherwise.
- Shift-wheel: horizontal time pan; ordinary wheel scrolls lanes vertically.
- Home: seek start; Fit restores the complete Show/Scene.

Open-hand, closed-hand, trim, move, and scrub cursors distinguish the operations.
Viewport state is session state and never enters Show undo history.

### Property and content overflow

- Property groups collapse independently; the Inspector itself is the only
  open property surface.
- Long Effect stacks show the first three entries plus `+N`; `Open details`
  provides a focused stack/keyframe editor without changing the Stage.
- Tiny clips retain 24-pixel invisible pointer targets around edge handles while
  their visible duration remains proportional.
- At very low zoom, rapid events become count-bearing clusters. Zooming or
  activating a cluster expands it around the pointer; the data is never silently
  omitted.

### Narrow-window behavior

At 960-1,100 pixels, the library collapses to a 44-pixel icon rail and Stage
narrows to 240 pixels. The Timeline keeps at least 520 pixels. At narrower widths
the Stage becomes independently toggled rather than being replaced by
properties; transport and compile status remain reachable. The Quick Inspector
clamps to 252 pixels and may cover either side rail. The lane gutter remains
sticky and may reduce from 132 to 108 pixels.

## Accessibility and responsive behavior

- Every Timeline entity is a native button or focusable control with a type,
  name, scope, and time range in its accessible name.
- Type never depends on color; icons, shapes, indentation, labels, and text
  state reinforce it.
- Roving focus follows visual time order within a lane, then lane order.
  Arrow-key navigation does not activate while a text or value editor owns
  focus.
- Opening the modeless Inspector does not trap focus. Pointer opening leaves
  focus on the entity; the Inspect command may move focus into the first field.
  Closing returns focus to the owning entity.
- Drag operations have keyboard equivalents: move by grid increment, move by
  frame/fine increment, change lane, and commit/cancel. An aria-live summary
  reports the proposed time, zone, and insertion result.
- Hit targets are at least 24 pixels in expert-density mode; destructive and
  touch-relevant controls receive 32 pixels where feasible. Visible rows may be
  smaller only when their interactive target extends without overlapping a
  conflicting target.
- Reduced-motion mode removes animated Inspector travel and displacement motion;
  source/destination states remain visually explicit.
- Window resize clamps overlays and restores an offscreen Inspector to the
  selected entity. No property surface can become permanently lost.

## Implementation implications

The production implementation should extract layout-independent state before
changing the large `ShowEditor.tsx` surface:

- a pure selection/inspection state machine for closed, anchored, and pinned
  states;
- semantic multi-selection and move/copy/paste transactions in the engine/store;
- pure drop-proposal geometry that returns snap kind, insertion position,
  displacement, and validity;
- shared Timeline row descriptors used by global and Scene-local renderers;
- per-scope viewport state using the existing `showTimelineViewport.ts`
  geometry; and
- an app-level overlay root with collision/clamping logic for the Quick
  Inspector.

The current Scene-strip grid can remain the migration source, but row rendering
should move toward descriptor-driven lanes so the local scope can share ruler,
playhead, selection, snapping, and accessibility behavior without copying the
component. React components should render descriptors and delegate commands;
they should not own edit algebra.

The interactive mock should be a clearly marked throwaway route beside the
current Show prototypes. It can use synthetic `Cathedral Signal` / `Neon
orchard` data and in-memory interactions. Production behavior requires TDD for
the pure command and geometry modules, light component tests, and Playwright
coverage for selection, Inspector transfer, drag proposals, keyboard flow,
desktop/narrow overflow, and console errors.

## Alternatives considered

### Permanent right Inspector

It provides stable vertical capacity and remains the best optional pinned state.
As a default it creates a four-column workspace and takes the Timeline width
needed for precise edits.

### Bottom property shelf

It preserves Timeline width but puts continuously referenced values far from the
selection and scales poorly to long entity definitions.

### Inline property row

It provides excellent proximity but reflows authored lanes, changes scroll
position, and makes controls resemble Timeline data.

### User-positioned floating palette

It gives experts maximum control and may become useful after prolonged use. It
adds window-management, recovery, and occlusion costs and therefore remains a
future option rather than a default dependency.

### Separate Scene workspace

It can maximize local composition area but weakens transfer learning and makes
the Stage and properties feel duplicated. The local scope needs a clear mode
boundary, not a different application frame.

## Risks and unresolved questions

- An anchored Inspector can cover the exact neighboring event needed for an
  alignment decision. Collision rules and temporary dismissal need hands-on
  testing with dense clips at viewport edges.
- Space tap versus Space-drag is efficient but delays playback until key release
  and may conflict with existing expectations. A dedicated Hand binding may be
  preferable after testing.
- A 30-pixel primary row with invisible edge targets may still be too dense for
  overlapping trim and selection affordances. The redline needs pointer testing,
  not screenshot approval alone.
- Event clustering at low zoom requires deterministic expansion and keyboard
  access; otherwise it hides the very complexity it is meant to manage.
- The property rubric must be tested against the largest real Transition and
  Effect descriptors, not only the representative Pattern placement.
- Multi-selection across incompatible entity owners may need explicit rules
  before aggregate editing can be more than move/copy/delete.
- Scene-local zone coverage rows may be redundant when coverage is simple. The
  mock should test whether they collapse into overlay metadata without losing
  routing clarity.
- The narrow-width breakpoint at which the Stage collapses is a user-workflow
  decision. The Stage must never be silently replaced or moved by the Inspector.

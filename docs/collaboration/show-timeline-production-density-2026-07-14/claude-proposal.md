# Claude proposal: Show Timeline production-density design

Author: Claude (independent proposal, 2026-07-14).
Sources: `docs/plans/show-timeline-dual-model-task.md`, the shared brief,
`CONTEXT.md`, `docs/reference/PXLBLZ Feature Guide.md` §9,
`docs/reference/PXLBLZ Technical Reference.md` Part 5,
`src/components/ShowEditor.tsx`, `src/engine/showTimelineViewport.ts`,
`src/engine/showModel.ts`, `src/components/ShowStagePreview.tsx`,
`src/store/showTransportStore.ts`, and
`docs/plans/show-editor-interaction-research-draft.md`. No other proposal or
comparison document was read.

## Recommendation

Keep the shell (library left, authoring center, Stage right) and restructure
the center column into three fixed regions: a **Timeline pane** with
disclosure-based lane density, a **stable-height Property dock** below it, and
the existing compile bar. Scene-local editing opens **in place** inside the
same Timeline pane behind a scope bar and a persistent miniature of the global
Show, so both scopes share one component system, one viewport engine, one
selection model, and one keyboard grammar.

The three moves that carry the design:

1. **Lanes are disclosure, not default.** Today every zone row permanently
   carries an Animation speed lane, a Brightness lane, and one lane per
   automated Pattern control across *all* zones (`rowStride = 3 + controlLanes`
   in `SceneStrip`). Four zones and five automated controls already cost
   4 × (64 + 7 × 26) = 984 px of timeline height. The proposal collapses each
   zone to one 48 px clip row whose clips carry compact authored-state badges;
   a per-zone chevron reveals that zone's lanes (22 px each) on demand. Only
   the zone being worked on pays for its lanes.
2. **Properties live in a bottom dock with detent heights.** The current
   contextual inspector renders below the timeline in the same scroll
   container, so selecting a different entity reflows the page. The dock has
   three explicit height detents (collapsed 32 px / standard 280 px /
   tall 420 px). Selection changes swap dock *content*, never dock height, so
   authored Timeline rows never move when properties open or close. Inside the
   dock, one learnable rubric — fixed-width property groups in canonical
   order, one 28 px row anatomy — scales from a 4-field Zone to a 20-field
   Portal Transition and to mixed multi-selections.
3. **One time geometry, two scopes.** Both scopes render from
   `showTimelineViewport.ts` math with true time→pixel positioning (replacing
   the current stretched `fr`-column grid). Scene-local scope is the same
   timeline component bound to a local time domain (0 at scene start), with
   millisecond-precision clip segments, keyframe lanes, an overlay layer lane,
   and the scene's outgoing Transition pinned at its right edge. Transport,
   playhead, snapping, zoom, clipboard, undo, and shortcuts are literally the
   same code paths, which is what keeps the scopes from feeling like two
   applications.

One honest asymmetry is named rather than blurred: in global scope, property
lanes show **per-scene target blocks with boundary ramp wedges** (the frozen
destination-owns-target / boundary-owns-ramp model). In Scene-local scope,
lanes show **true keyframe diamonds**. Both are revealed the same way, use the
same easing vocabulary and the same row anatomy, but the glyphs differ because
the semantics differ.

## User workflow

The representative Show used throughout: **"Atrium Loop"**, an Installation
Show (2,088 px output map), four zones (`canopy` 840 px, `columns` 512 px,
`floor` 640 px, `entry` 96 px), six scenes totalling 4:36.0, boundary
Transitions including a cut, a crossfade, a wipe, a portal, and a
routing-layout marker, one clip holding across two scenes, one clip spanning
two zones, several clips carrying Effect stacks and animated properties.

### Global-scope loop (ship first)

1. **Orient.** The author opens the Show. The Timeline pane shows the ruler,
   the boundary lane, and four 48 px zone rows — the entire four-zone Show
   fits in ~370 px of vertical space with the dock at standard height. Clips
   show Pattern name plus badges (`fx3`, `~anim`, `hold`, `⇕2`), so authored
   state is scannable without lanes.
2. **Scrub and inspect.** Drag the ruler or press Space/arrows; the Stage
   answers. Click a clip: the dock swaps to Clip properties at the same
   height. Click the portal Transition chip: the dock swaps to its groups
   (Timing · Shape · Placement · Motion · Edge · Cost) without any timeline
   reflow.
3. **Go dense where needed.** Expand the `canopy` zone chevron: its Animation
   speed, Brightness, and automated-control lanes appear under that zone only.
   Boundary cells in a lane show `0.5×→1.0×` ramps; clicking one selects the
   owning Transition with the relevant group pre-focused.
4. **Restructure.** Shift-click two scene headers, drag: a full-height
   insertion seam plus ghost block previews displacement in every row before
   drop. Option-drag duplicates. `[` / `]` do the same move from the keyboard.
   Marquee across clips, ⌘C, select an empty slot, ⌘V. Every mutation is one
   undo transaction with a status toast ("Moved 2 scenes · ⌘Z").
5. **Deliver.** Compile bar, View code, Export, and Send to Controller are
   unchanged.

### Scene-local loop (later, additive)

6. **Enter.** Double-click the `Strobe Break` scene header (or press Enter on
   it, or click "Open Scene" in its dock). The Timeline pane swaps in place to
   Scene scope: a 28 px scope bar (`Show ◂ ▸ Scene 3 · Strobe Break · 8.0s`)
   plus a 24 px global context strip — a miniature of the whole Show with the
   open scene highlighted. Zones keep the same order, colors, and gutter. The
   playhead is the same playhead, drawn in local time.
7. **Compose.** The author places four rapid cuts inside 250 ms on `canopy`,
   adds an overlay layer beneath `columns`, animates the overlay's Opacity
   with keyframes, stacks Swirl + Posterize on a segment, and sees the scene's
   outgoing crossfade as a fixed boundary post at the right edge. Zoom, snap,
   marquee, clipboard, undo, and lane disclosure all behave exactly as in
   global scope.
8. **Exit.** Esc (with nothing to cancel), the ◂ button, or clicking the
   context strip returns to global scope with the scene selected and the
   viewport restored to its previous global framing.

## Information architecture and structure

### Center column composition (desktop, 1440 × 900 reference)

Assumed shell widths: left rail 240 px, Stage pane 320 px, center ≈ 880 px.
The design must also hold at center ≈ 640 px (see responsive section).

```
┌─ CENTER COLUMN (880 px) ────────────────────────────────────────────────┐
│ Workspace header (existing): Show name, Properties, View code, Export,  │ 36 px
│ Send to Controller                                                      │
├──────────────────────────────────────────────────────────────────────────┤
│ TIMELINE PANE                                                            │ flexible,
│   toolbar 36px · [scope bar 28px + context strip 24px, Scene scope only] │ min 220 px
│   ruler 24px · boundary lane 28px · [Show lanes 22px each]               │ own vertical
│   zone blocks (48px row + 22px lanes when expanded, 6px between zones)   │ scroll
│   navigator 20px                                                         │
├───────────────────────────────── drag handle (6 px, detent snap) ────────┤
│ PROPERTY DOCK  · header 32px · grouped body                              │ 32/280/420 px
├──────────────────────────────────────────────────────────────────────────┤
│ COMPILE BAR (existing)                                                   │ 28 px
└──────────────────────────────────────────────────────────────────────────┘
```

Rules:

- The Timeline pane and the dock scroll independently. The timeline's
  vertical scroll appears only when expanded lanes exceed the pane; ruler,
  boundary lane, and toolbar stay pinned at the top, the navigator at the
  bottom, and the zone gutter sticky at the left.
- The dock height changes only by user action (drag handle or detent
  buttons). Selection changes swap content at constant height. The user's
  detent persists per session.
- Whitespace budget: 6 px gaps separate zone blocks; *within* a block, lanes
  sit flush under the clip row separated by 1 px hairlines. Grouping is the
  only job whitespace performs; there is no decorative padding inside rows.

### Typography and shared metrics

| Token | Value |
| --- | --- |
| Family | IBM Plex Mono (existing shell); tabular numerals for all times |
| Clip title | 12 px / 600 weight |
| Badges, lane values, chip labels | 9.5–10 px |
| Gutter zone name | 12 px; lane labels 9.5 px, indented 12 px, `↳` prefix |
| Ruler labels | 9.5 px, `m:ss` (global) / `s.mmm` (scene scope at high zoom) |
| Dock labels | 10.5 px; dock values 11 px right-aligned mono |
| Minimum pointer hit target | 20 × 20 px (chips, diamonds get invisible padding to reach it) |
| Focus ring | 2 px accent outline, 1 px offset, never color-only |

### Global Show Timeline — production redline

State shown: viewport 0:56–2:16 of 4:36 (zoom ≈ 3.5×); `canopy` expanded with
three lanes; the **portal Transition after Scene 4 selected** (a nontrivial
entity: ~20 parameters); dock at standard 280 px. Ninety-column ASCII, not to
scale; dimensions annotated at the right.

```
TOOLBAR                                                                            36px
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ⏮ ▶ 01:12.4 / 04:36.0 │ − Fit + │ ⌕3.5x │ 🧲Snap │ ▦Cozy │        [1 Transition ▾] │
└────────────────────────────────────────────────────────────────────────────────────┘
GUTTER 160px │ CANVAS  (time→px, virtualized to visible range)
┌────────────┬───────────────────────────────────────────────────────────────────────┐
│            │ |1:00      |1:10      |1:20      |1:30      |1:40      |1:50    ruler 24px
├────────────┼───────────────────────────────────────────────────────────────────────┤
│ scenes     │  S2 Pulse Storm 30.0s      ][ S3 Strobe Break 8.0s ][ S4 Portal Bloom…│ (headers ride
├────────────┼───────────────────────────────────────────────────────────────────────┤  the ruler row)
│ ⚡ trans    │            ≋xfade 2.0s│      ▤wipe 1.5s│        ╔◎ portal 3.0s╗  bound. 28px
│            │                       │                │        ╚═ selected ══╝ ⇄route │
├────────────┼───────────────────────────────────────────────────────────────────────┤
│ ▾ canopy   │ ┌─────────────────────┐┌──────┬──┬─┬──┐┌───────────────────────────┐  48px
│   840px  ▍ │ │ NebulaSphere        ││Strobe│St│S│St││ PortalBloom     fx3 ~anim │   clip row
│            │ │ 0.8× ·  fx2   hold  ││ …    │… │…│… ││ 1.0×                      │
│            │ └─────────────────────┘└──────┴──┴─┴──┘└───────────────────────────┘
│  ↳ speed   │ ▓0.8×▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│◣│1.0×▓▓▓▓▓▓▓▓▓│  │1.0×▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  22px
│  ↳ bright  │ ▓100%▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │80%▓▓▓▓▓▓▓▓▓▓│◣│100%▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  22px
│  ↳ Speed   │ ▓0.35▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│◣│0.62▓▓▓▓▓▓▓▓▓│  │—▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  22px
├────────────┼──────────────────────────────────────────────────────────────  gap 6px
│ ▸ columns  │ ┌──────────────────────────────┐┌────────────────────────────────┐   48px
│   512px  ▍ │ │ CometLoom        ⇕2 span     ││ EmberDrift              fx1    │
├────────────┼───────────────────────────────────────────────────────────────  gap 6px
│ ▸ floor    │ │  (occupied by ⇕2 span above) │┌────────────────────────────────┐   48px
│   640px  ▍ │ └──────────────────────────────┘│ RippleField      ~anim         │
├────────────┼───────────────────────────────────────────────────────────────  gap 6px
│ ▸ entry    │ ┌──────────────────────────────┐╔════════════╗┌──────────────────┐   48px
│   96px   ▍ │ │ TestPattern1D                │║ + clip     ║│ PhantomStar      │
│            │ └──────────────────────────────┘╚═empty slot═╝└──────────────────┘
├────────────┼───────────────────────────────────────────────────────────────────────┤
│ + zone     │ ◤────────────█████████ visible ████████────────────────◥  navigator 20px
└────────────┴───────────────────────────────────────────────────────────────────────┘
════ drag handle ═══════════════════════════════════════════════════════════════ 6px
PROPERTY DOCK — standard detent                                                  280px
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ◎ Transition · Portal — after "Portal Bloom"      [Reset] [Delete]   ▁ ▄ █ (detents)│ 32px
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────┤
│ TIMING       │ SHAPE        │ PLACEMENT    │ MOTION       │ EDGE         │ COST    │ groups
│ Duration     │ Shape  Star ▾│ Center X 0.50│ Rotation  0° │ Feather 0.12◆│ 2 rend. │ 236px
│   3.0 s      │ Points     5 │ Center Y 0.42│ Spin   0.5/s │ Policy blend▾│ in band │ each
│ Easing       │ Inner   0.45 │ Scale    1.20│ Reveal grow ▾│              │ ≈1.4 N  │
│  ease-in-out▾│ Aspect  1.00 │ Invert    ⊘  │              │              │         │
│ Property     │ Corner    —  │              │              │              │         │
│  ramps (2) ▸ │              │              │  ◂ h-scroll if > 5 groups ▸ │         │ rows 28px
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴─────────┘
COMPILE BAR — 9.4 KB · 1 renderer/px steady · portal band 2 renderers · OK      28px
```

Redline annotations:

- **Scene headers** ride inside the ruler band as labeled spans (24 px tall,
  click = select scene, double-click/Enter = open Scene scope, drag = move
  scene block). They are positioned by time, so at deep zoom a header can be
  wider than the pane; its label is sticky within the visible part.
- **Boundary lane (28 px).** One chip per boundary entity. Chip height 20 px;
  width = transition duration in px, min 24 px. A zero-duration cut renders
  as a 2 px tick with a centered 24 × 24 px hit area. Routing markers render
  as a second, visually distinct chip (`⇄` glyph, dashed border) beside the
  visual Transition — the two never merge. Chips are distinguishable by glyph
  (≋ crossfade, ▤ wipe, ▒ dither, ◎ portal/shape, ✂ cut, ⇄ routing), not
  color alone.
- **Clip row (48 px cozy / 36 px compact).** Anatomy: 3 px zone-color left
  bar; line 1 = Pattern name (12 px, truncating); line 2 = badge row
  (10 px): adaptation summary (`0.8×`, `80%`), `fx3` Effect count, `~anim`
  animated-property flag, `hold` scene span, `⇕2` zone span, `↻` restart on
  entry. In compact density the badge row collapses to icons only. Badges
  are the permanent authored-state summary; lanes and dock carry the rest.
- **Empty slot.** Dashed 1 px border cell (`+ clip`), same footprint as a
  clip; selecting it docks the Pattern chooser. Unchanged semantics.
- **Lanes (22 px).** Global-scope lanes render a *target block* per scene
  (value label at block start, tinted fill: violet speed, amber brightness,
  cyan controls) and a *ramp wedge* `◣` in the boundary column when the
  incoming Transition owns an explicit start (`0.8×→1.0×` on hover; the wedge
  is the click target for the owning Transition, pre-focusing its Property
  ramps group). `—` marks unset. Lane visibility is per zone, remembered per
  Show, toggled by the gutter chevron or `L` on a focused zone.
- **Show-wide lanes** (Split position, Sample repeat) appear under a `SHOW`
  gutter caption above the first zone, same 22 px grammar, collapsed behind a
  chevron whenever they exist but are untouched this session.
- **Gutter (160 px, sticky).** Zone row: chevron, color chip (10 × 24 px),
  name, `px` count, overflow `⋯` menu (rename, color, spatial select,
  delete). Lane rows indent 12 px with `↳ label`. The `+ zone` affordance is
  the last gutter row; `+ scene` is a 24 px sticky strip at the canvas's
  right edge (unchanged from production).
- **Playhead.** 1 px full-height line, 11 px grab handle in the ruler, 9 px
  invisible hit width; seek-in-progress shows the existing rebuild badge near
  the transport readout.
- **Zoom.** True time→px mapping: `x = timeToViewportPercent(viewport, t) *
  canvasWidth`. Max zoom raised so `minDurationMs = max(2000, totalMs/256)`
  in global scope (the current `totalMs/16` cannot resolve sub-second work).
  Ctrl/⌘-wheel zooms at the pointer's time, not the playhead; toolbar buttons
  keep playhead-centered zoom; Fit restores the whole Show. The navigator
  (20 px) keeps its pan/resize thumb.

### Scene-local Timeline — production redline

State shown: Scene 3 "Strobe Break" (8.0 s) open; viewport 0.90–2.10 s
(zoom ≈ 6.7×); `canopy` has four cuts inside 250 ms; `columns` hosts an
overlay layer with animated Opacity and a two-Effect stack on the base clip;
outgoing crossfade pinned at the right edge; an Opacity keyframe selected;
dock standard.

```
TOOLBAR (identical to global scope)                                              36px
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ◂ Show │ Scene 3 · Strobe Break · 8.0s │ local 0:01.240 (show 1:11.24) │ ⟲ loop scene│ scope 28px
│ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  ← global context strip │ 24px
└──────────── S1 ─── S2 ──── [S3] ─── S4 ────── S5 ────── S6 ────────────────────────┘
GUTTER 160px │ CANVAS (local time domain, 0 at scene start)
┌────────────┬───────────────────────────────────────────────────────────────────────┐
│            │ |1.000     |1.200     |1.400     |1.600     |1.800     |2.000  ruler 24px
├────────────┼───────────────────────────────────────────────────────────────────────┤
│ ⚡ out      │                                                    ≋ xfade 2.0s ▐▐▐   28px
│            │                                     (outgoing Transition post, pinned) │
├────────────┼───────────────────────────────────────────────────────────────────────┤
│ ▾ canopy   │ ┌────────────┐┌───┐┌──┐┌───┐┌────┐┌───────────────────────────────┐  48px
│   840px  ▍ │ │ StrobeA    ││StB││SA││StB││ SA ││ StrobeCooldown        fx1     │
│            │ │            ││   ││  ││   ││    ││                               │
│            │ └────────────┘└───┘└──┘└───┘└────┘└───────────────────────────────┘
│            │       cuts at 1.180 / 1.240 / 1.290 / 1.355 / 1.430 (4 in 250 ms)     │
│  ↳ bright  │ ▓100%▓▓▓▓▓▓▓◆▓▓▓▓◆▓▓▓▓▓▓▓◆▓▓▓▓▓▓▓▓▓▓▓▓▓◆▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  22px
├────────────┼──────────────────────────────────────────────────────────────  gap 6px
│ ▾ columns  │ ┌───────────────────────────────────────────────────────────────────┐ 48px
│   512px  ▍ │ │ CometLoom                                   fx2  ~anim            │
│            │ └───────────────────────────────────────────────────────────────────┘
│  ↳ fx      │ ▓ Swirl ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║ Posterize ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  22px
│  ⧉ overlay │ ┌· SparkVeil (overlay layer) ····◆·······◆············┐              36px
│            │ └──────────────────────────────────────────────────────┘
│   ↳ opacity│ 0%▁▁▂▃◆45%▔▔▔▔▔◆▔▔╔◆╗70%▔▔▔▔▔▔▔▔▔▶ (curve strip)                    22px
│            │              selected ╚═╝ 1.240s · 62% · ease-out                     │
├────────────┼──────────────────────────────────────────────────────────────  gap 6px
│ ▸ floor    │ ┌───────────────────────────────────────────────────────────────────┐ 48px
│   640px  ▍ │ │ RippleField                                 ~anim                 │
├────────────┼───────────────────────────────────────────────────────────────────────┤
│            │ ◤──────────█████ visible █████──────────◥                navigator 20px
└────────────┴───────────────────────────────────────────────────────────────────────┘
PROPERTY DOCK                                                                    280px
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Keyframe · Opacity — SparkVeil overlay · canopy? no: columns   [Delete]  ▁ ▄ █   │ 32px
├──────────────┬──────────────┬──────────────────────────────────────────────────────┤
│ KEYFRAME     │ NEIGHBORS    │ PROPERTY                                             │
│ Time 1.240 s │ ◂ prev 1.050 │ Opacity — overlay layer · animated (5 keys)          │
│ Value   62 % │ next ▸ 1.410 │ [Open curve editor] [Remove animation…]              │
│ Easing       │              │                                                      │
│  ease-out  ▾ │              │                                                      │
└──────────────┴──────────────┴──────────────────────────────────────────────────────┘
```

Scene-scope redline annotations:

- **Scope bar (28 px).** `◂ Show` returns to global scope (also Esc when no
  gesture/selection is pending). The time readout shows local time first,
  global time in parentheses — the single most effective orientation cue.
  `⟲ loop scene` constrains transport looping to the scene while in scope.
- **Global context strip (24 px).** A non-interactive-except-click miniature
  of the entire Show: scene blocks proportional, open scene filled, playhead
  tick visible. Clicking another scene block switches scope to that scene;
  clicking outside any block exits to global scope at that time.
- **Outgoing boundary lane** replaces the global boundary lane: it holds only
  the scene's incoming Transition (pinned at x = 0 when scrolled to start)
  and outgoing Transition (pinned post at the scene's right edge). Editing
  them here edits the same boundary entities as global scope.
- **Clip segments** are the scene-local unit: ms-precise edges, same anatomy
  as global clips but with edge trim handles (6 px wide, cursor `ew-resize`)
  and snap to other segment edges, keyframes, and the local grid. At the
  shown zoom (1.2 s across ≈ 700 px canvas), a 50 ms segment is ≈ 29 px —
  legible with title elision to first letters; below 24 px the segment shows
  color + tooltip only.
- **Effect lane (`↳ fx`, 22 px).** Ordered Effect spans for the selected/
  expanded clip; `║` marks the stack order divider. Clicking a span docks
  that Effect's parameters. Reordering happens in the dock's stack list (the
  lane is a map, not the reorder surface).
- **Overlay layer lane (⧉, 36 px).** One level deep, nested under its host
  zone with a dotted border to mark "another source". It owns its own
  segment, Effect chips, and property lanes (indented one more step). No
  recursion: an overlay cannot host overlays.
- **Keyframe lanes (22 px).** Diamonds 9 px drawn / 20 px hit; selected
  diamond gets the accent ring plus a value flag (`1.240s · 62% · ease-out`).
  A faint value curve strip renders inside the lane. Double-clicking a lane
  opens the on-demand curve editor, which expands that lane to 64 px — an
  explicit, user-initiated row-height change.
- **Ruler** switches to `s.mmm` labels beyond 4× zoom; grid steps come from
  the same `showTimelineGridStepMs`. Scene scope viewport uses
  `minDurationMs = max(50, sceneMs/512)` so 250 ms of work can fill the pane.

### Property dock rubric

One rubric for every entity type, both scopes:

- **Header (32 px):** entity glyph + type word, name (inline-editable where
  the model allows), context ("after ‘Portal Bloom'", "canopy · Scene 3"),
  actions (Reset / Duplicate / Delete as applicable), detent buttons.
  Multi-selection header shows the selection pill: `4 clips` or
  `3 scenes · 18.0 s`.
- **Body:** property **groups**, each a 236 px column (224 px content +
  12 px gutter), laid left to right in canonical order. Groups beyond the
  pane width scroll horizontally with snap; group tabs appear above the body
  when more than five groups exist. Standard detent fits 8 rows per group;
  a group with more rows scrolls vertically within itself; a group's
  `Advanced ▸` disclosure keeps rare fields out of the first 8.
- **Canonical group order (identical across entity types):**
  1. *Identity & Timing* (name, duration, easing, entry policy)
  2. *Content* (Pattern chooser, kind/variant, shape)
  3. *Kind-specific groups* (Placement, Motion, Edge…, in registry order)
  4. *Property targets & ramps* (the boundary/target table, or keyframe data)
  5. *Advanced / Cost* (cost math, compatibility notes, raw values)
- **Row anatomy (28 px):** label 92 px · control flex · value 48 px
  right-aligned mono · animation affordance 20 px. The affordance is a ramp
  wedge `◣` in global scope (opens the boundary ramp for that property) and a
  keyframe diamond `◇/◆` in Scene scope (toggles a key at the playhead).
  Non-animatable rows leave the slot empty, keeping alignment.
- **Mixed values (multi-selection):** value cell shows `—` plus a `mixed`
  tag; the control renders in indeterminate state (the existing
  `deck-slider-unset` hollow-ring idiom); committing an edit applies to all
  selected entities in one transaction. Fields that don't exist on every
  selected entity render disabled with "not on 2 of 4".
- **Entity coverage:** Show (contract, reference/output facts, routing
  layouts), Scene (name, duration, targets, Open Scene), Clip (Pattern,
  adaptations, shutter, spans, controls, Effect stack list), Transition
  (as wireframed), Routing marker (layout, direction, duration), Zone
  (name, color, px, binding, spatial select), Effect (parameters, order,
  bypass), Keyframe (time, value, easing, neighbors), Empty slot (Pattern
  chooser), Multi-selection (shared/mixed fields + batch actions).

### What lives where (capacity discipline)

| Information | Timeline row (always) | Lane (on demand) | Dock (on selection) |
| --- | --- | --- | --- |
| Pattern identity | name + zone color | — | chooser, source facts |
| Adaptations | `0.8× · 80%` summary | speed/bright target blocks | exact fields |
| Automated controls | `~anim` badge | per-control lanes | targets + ramp table |
| Effects | `fx3` badge | fx spans (Scene scope) | ordered stack + params |
| Transitions | boundary chip + duration | ramp wedges in lanes | full parameter groups |
| Keyframes (Scene) | `~anim` badge | diamonds + curve strip | time/value/easing |
| Cost | — | — | Cost group + compile bar |

## Key interactions and states

### Selection

- Click selects one entity; ⌘-click toggles membership (clips with clips,
  scenes with scenes — mixed-kind sets are not offered); Shift-click on scene
  headers extends a contiguous scene range; Shift-click on keyframes extends
  along a lane.
- Marquee starts only on empty canvas (not ruler, not headers, not entities)
  and selects clips/segments it intersects; in Scene scope with keyframe
  lanes revealed, a marquee started inside a lane selects keyframes only.
- Initiation regions are unambiguous: ruler = scrub, scene header = scene
  select/drag, gutter = zone ops, entity = entity select/drag, empty canvas
  = marquee.
- Selected entity: 1.5 px accent ring (existing `--color-live` treatment).
  Multi-selection: same ring on each member + dock pill count. Select All
  (⌘A) is focus-scoped: clips when the canvas has focus, scenes when a
  header has focus, keyframes when a lane has focus.
- Esc order: cancel active gesture → clear selection → (Scene scope only)
  exit to Show.

### Structural movement (global scope)

- **Scene-block drag:** dragging selected header(s) lifts a ghost of the
  whole column block (headers + chips + all zone cells at 50% opacity), shows
  a 2 px full-height insertion seam with triangle caps at each valid
  boundary, closes the source gap in preview, and labels the drop
  (`Insert 2 scenes before "Blackout"`). Drop commits one transaction;
  Esc/outside-drop cancels bit-exactly. Option-drag duplicates (cursor badge
  `+`). Boundary Transitions move with their *preceding* scene; the seam
  label states the edge rule when a moved range's outgoing Transition would
  collide (`keeps its crossfade; "Dawn Wash" boundary becomes a cut`).
- **Clip drag:** clips move only onto structurally valid scene/zone
  footprints. Valid empty footprints highlight; occupied cells show a
  hatched red overlay listing what a drop would displace. v1 policy is
  reject-on-collision (drop does nothing, overlay explains); explicit
  replace arrives only with its own confirmation affordance. No drag ever
  creates time.
- **Keyboard equivalents:** `[` / `]` move the selected scene block one
  boundary left/right; Alt+←/→ nudge a selected Scene-scope segment edge or
  keyframe by one snap step (Shift·Alt = 10 ms fine); all invoke the same
  pure model operations as the drags.

### Clipboard, duplication, insertion

- ⌘C copies the structural selection into a versioned in-app Show fragment
  (scenes with their cells, Effects, targets, and interior Transitions; or
  clips with relative offsets). ⌘X = copy + one atomic removal where removal
  is well defined. ⌘D duplicates in place and selects the copy.
- ⌘V pastes at the selected boundary seam (scene ranges) or the selected
  empty slot (clips, anchored at the top-left of the copied footprint). With
  no valid anchor, a toast explains what to select — paste never guesses or
  invents a boundary. Pasting inside a scene requires Split first, matching
  the model.
- Scene-scope clipboard reuses the same fragment format for segments and
  keyframes, anchored at the playhead within the same lane kind.

### Scrub, zoom, pan

- Ruler click/drag scrubs with snap (scene, clip/segment, transition,
  keyframe edges, and zoom-aware grid via `snapShowTimelineTime`); Alt
  temporarily inverts Snap; snapped ticks flash the matched boundary.
- Ctrl/⌘-wheel zooms at pointer time; pinch maps to the same handler; plain
  wheel/trackpad scrolls vertically (lanes) and Shift-wheel pans time;
  Space-drag on empty canvas pans (grabby hand). ⌘0 Fit, ⌘= in, ⌘− out.
- During any drag near a pane edge, the viewport auto-scrolls at up to
  40 px/frame proportional to overshoot, preserving the drag anchor.
- Scrubbing issues `requestSeek` throttled to one in-flight rebuild
  (existing supersede semantics); the playhead line tracks the pointer
  optimistically while the Stage shows the rebuild badge.

### States checklist (for the mock)

| State | Treatment |
| --- | --- |
| Default row / lane | as redlined above |
| Hover | +5% surface tint; gutter reveals `⋯`; chips reveal duration |
| Selected | 1.5 px accent ring; dock swaps content |
| Multi-selected | rings + `N kind` pill in toolbar and dock header |
| Dragging | ghost at 50%, source dimmed 35%, seam/footprint preview, drop label |
| Drop target valid | accent fill 12%, 2 px seam |
| Drop target invalid | hatched red 20% overlay + one-line reason |
| Mixed value | `—` + `mixed` tag + indeterminate control |
| Unset lane value | `—` (existing idiom) |
| Empty slot | dashed border `+ clip` |
| Seek rebuilding | playhead optimistic; Stage badge; transport readout spinner |
| Overflowing groups | group tabs + horizontal snap scroll; count `6 groups` |
| Narrow window | see next section |
| Zero-duration cut | 2 px tick, 24 px hit, selectable, labeled "Cut" in dock |
| Lane collapsed w/ authored data | gutter chevron shows a dot marker (`▸•`) |

### Keyboard grammar (both scopes)

| Keys | Action |
| --- | --- |
| Space | play/pause (Show; loop-scene when engaged) |
| ← / → (workspace focus) | seek ±1 s (Shift ±0.1 s; Alt ±10 ms in Scene scope) |
| Home | Show start / scene start in Scene scope |
| ← → ↑ ↓ (entity focus) | move focus between sibling entities / across rows |
| Enter | open focused entity in dock (focus first field); on scene header: open Scene scope |
| Esc | cancel gesture → clear selection → exit Scene scope |
| ⌘A / ⌘C / ⌘X / ⌘V / ⌘D | focus-scoped select all / clipboard / duplicate |
| Delete / Backspace | delete selection (existing confirmation rules) |
| [ / ] | move selected scene block left / right |
| ⌘Z / ⇧⌘Z | undo / redo (semantic transactions) |
| ⌘0 / ⌘= / ⌘− | fit / zoom in / zoom out |
| S | toggle Snap (timeline focus) |
| L | toggle lanes on focused zone |
| K (Scene scope) | toggle keyframe at playhead for the docked property |

Arrows are transport when the timeline *workspace* has focus and spatial
navigation when a specific *entity* has focus; Esc drops entity focus back to
the workspace. This resolves the transport-versus-navigation collision
without modes. Text/number/menu controls keep their native keys, per the
existing Feature Guide contract.

### Undo and recovery

Every gesture, paste, batch dock edit, Effect reorder, and delete is one
semantic transaction with a human name ("Move 2 scenes", "Paste 3 clips",
"Set Brightness on 4 clips"). A transient toast offers Undo after structural
mutations; destructive bulk actions ≥ N entities (default 4) get a one-line
consequence preview in the dock before commit. Optimistic preview never
persists intermediate invalid states; the saved Show changes once per
transaction. Undo history is an in-memory session stack layered above
`showStore` persistence.

## Accessibility and responsive behavior

### Accessibility

- **Names:** every interactive element keeps a complete accessible name
  ("Select crossfade transition after Pulse Storm, 2.0 seconds";
  "Opacity keyframe at 1.240 seconds, 62 percent, ease-out"). Lane values
  keep `sr-only` expansions for `—` (existing pattern).
- **Roles:** the timeline canvas is a `role="grid"` per zone block
  (rows = clip row + lanes, cells = entities) with `aria-rowindex`/
  `aria-colindex` derived from scene/lane indexes; the toolbar keeps
  `role="toolbar"`; the dock is a `role="region"` labeled
  "`{Kind}` properties"; the context strip is a labeled `navigation`.
- **Focus:** one roving tabindex across the timeline (Tab enters/leaves the
  widget; arrows move inside), extending the existing
  `data-show-timeline-focus` return-focus contract: after a dock commit,
  focus returns to the selected timeline entity. Focus is always visible
  (2 px ring) and never trapped; the dock is in normal document order after
  the timeline.
- **Keyboard-only parity:** every drag has a command twin (`[`/`]`, Alt-
  nudge, ⌘V-at-anchor, dock reorder buttons for Effects). Marquee's twin is
  Shift/⌘-based extension plus focus-scoped ⌘A.
- **Not color alone:** entity kinds differ by glyph and shape (chip glyphs,
  wedge vs diamond, dotted overlay border, hatched invalid overlay); zone
  color is reinforced by the gutter name and the clip's aria context.
- **Contrast and motion:** value text on tinted lane fills maintains ≥ 4.5:1
  (tint ceilings 12–14% over `#0a0a0c`); `prefers-reduced-motion` disables
  ghost animation, auto-scroll easing, and toast slide (state changes remain
  instant and complete).
- **Announcements:** a polite live region reports transaction results
  ("Moved 2 scenes before Blackout") and seek completion ("Playhead at
  1:12.4").

### Responsive behavior

Breakpoints are on the *center pane* width, not the window:

- **≥ 760 px (full):** as redlined.
- **560–760 px (narrow):** gutter collapses to a 36 px rail (color chip +
  chevron; names in tooltips/aria); dock groups drop to 208 px and rely on
  group tabs; toolbar collapses transport readout to current time only and
  moves Density/Snap into an overflow `⋯` menu; scene header labels elide to
  numbers (`S3`).
- **< 560 px (minimal):** the dock becomes a full-width bottom sheet toggled
  by a Properties button (collapsed strip stays 32 px so the constraint
  "content never moves un-asked" still holds); boundary chips render at
  fixed 24 px min-width with duration in the dock only; structural drag
  remains available but the command twins (`[`/`]`, paste-at-anchor) are the
  advertised path (a hint appears once in the drop label).
- The timeline pane keeps `minWidth` behavior via horizontal scroll (as
  today) so ultra-narrow windows scroll rather than crush columns; the
  navigator remains the recovery surface when the viewport is lost
  (double-click navigator = Fit).
- Vertical scarcity (short windows): the timeline pane owns a vertical
  scrollbar with the ruler/boundary lane pinned; collapsing all zones yields
  a guaranteed-fit summary (4 zones ≈ 370 px including chrome).

## Implementation implications

Sequencing: everything in global scope ships first and stands alone; Scene
scope reuses the same components with a different time domain and lane set.

1. **Engine (pure, tested first):**
   - `showTimelineViewport.ts`: parameterize `minDurationMs` (global
     `max(2000, total/256)`, scene `max(50, scene/512)`); keep everything
     else. Add pointer-anchored zoom (already supported via `anchorMs`).
   - New `showTimelineLayout.ts`: time→px placement for headers, chips,
     cells/segments, lane blocks, wedges, diamonds, seams, from
     `projectShowTimeline` + viewport + pane width; returns only visible-range
     geometry (virtualization seam). Table-testable like `resolveLayout`.
   - New `showSelectionModel.ts`: typed selection sets (scenes | clips |
     keyframes | single other), toggle/extend/marquee-hit, validity of moves
     (`canMoveSceneBlock`, `canPlaceClipFootprint` reusing
     `showCellIntersects`), displacement previews as data.
   - New model operations in `showModel.ts`: `moveSceneBlock`,
     `duplicateSceneRange`, `moveClipFootprint`, fragment
     serialize/deserialize (versioned), each a pure transaction.
   - Undo layer in `showStore`: named transaction stack over existing
     mutation functions — a prerequisite for shipping any multi-entity
     mutation (per the research), tracked with the related issues (#462/#463
     scope).
2. **Components:** decompose `ShowEditor.tsx` (4,000+ lines) into
   `ShowTimeline` (canvas + gutter + navigator), `ShowPropertyDock` (rubric
   renderer over per-entity group descriptors), and thin gesture hooks.
   Replace the interleaved CSS-grid columns with absolutely positioned
   children in a relative canvas (translate on pan); keep the sticky gutter
   as a separate synced-scroll column. Existing inspectors' field logic
   migrates into dock group descriptors largely unchanged.
3. **Scene scope:** a `TimeDomain` adapter (`toLocal`/`fromLocal`, pinned
   boundary posts) plus scope state in the component; transport stays
   global (`showTransportStore` untouched except a loop-range option).
   Scene-local segments/overlays/keyframes render from the existing
   composition prototype's model behind its flag; no persistence or compiler
   change is implied by the mock (explicit non-goal).
4. **Interactive mock:** build on a seeded busy Show (the "Atrium Loop" and
   "Strobe Break" fixtures above), local-only history, no D1 writes. The
   mock must demonstrate every row of the states checklist.
5. **Verification:** unit tests on layout/selection/model ops; light
   component smoke tests; Playwright flows for drag-insert, marquee+paste,
   dock stability (assert timeline scroll offset unchanged across selection
   changes), and keyboard-only scene move; `?capture` screenshots at 880 px
   and 600 px pane widths.

Costs acknowledged: dropping the `fr`-grid loses free layout from CSS and
requires a resize observer + virtualization; the dock migration touches every
inspector; roving-tabindex grids need careful testing with the existing
focus-return contract.

## Alternatives considered

- **Right-side inspector column between timeline and Stage.** Rejected: the
  center pane is already the scarcest horizontal resource; a 300 px
  inspector forces the timeline below ~580 px on laptops and competes with
  the Stage, which must remain the constant preview surface.
- **Keep the inspector below the timeline in shared scroll (status quo).**
  Rejected: it violates the row-stability constraint — selecting entities
  with different inspector heights reflows the page and scrolls authored
  rows.
- **Popover/floating inspector anchored to the selection.** Rejected as the
  default: it occludes neighboring lanes exactly where dense editing
  happens, and anchor positions jump between entities. A detachable palette
  stays a future option (#464); the dock design does not preclude it.
- **Always-visible lanes with smaller rows** (compress instead of disclose).
  Rejected: at 4 zones × 7 lanes even 16 px lanes exceed 700 px and the
  values become unreadable; density without hierarchy is noise.
- **A separate Scene editor route/screen.** Rejected: a route swap discards
  spatial context, duplicates transport/zoom state, and is precisely the
  "different application" failure the task names. In-place scope swap with a
  persistent global miniature preserves orientation.
- **Freeform-keyframe lanes in global scope** to unify glyphs across scopes.
  Rejected: it would misrepresent the frozen boundary-owned property model
  ("Property animation is not an arbitrary freeform keyframe track" —
  CONTEXT.md). The shared rubric lives in the row anatomy and easing
  vocabulary instead.
- **Track-targeting / per-zone locks** (Premiere-style). Rejected per the
  research: zones share scene boundaries and are not independent media
  tracks.
- **Canvas-desk (Stage-first) organization of Effects.** Rejected as the
  organizer; the Stage keeps direct manipulation only for descriptors that
  declare a spatial affordance.

## Risks and unresolved questions

1. **Scrub cost during drags.** Deterministic replay from Show start makes
   high-frequency scrubbing expensive on long Shows. The design assumes
   optimistic playhead + superseding seeks is acceptable; if not, a
   checkpoint cache is a compiler/runtime decision outside this scope.
2. **Lane-disclosure discoverability.** Authored-but-hidden automation is
   summarized by badges and gutter dot markers; whether that is enough to
   prevent "where did my automation go?" needs the interactive mock test.
   Fallback: an "expand zones with authored lanes" command on Show open.
3. **Ramp wedge vs keyframe diamond.** The deliberate glyph split could read
   as inconsistency rather than honesty. Test whether authors transfer
   between scopes; if not, the wedge may need a stronger "owned by the
   Transition" hover explanation.
4. **Dock capacity on 13-inch laptops.** Standard detent (280 px) over a
   min-220 px timeline pane fits 900 px-tall windows, but tall detent does
   not; the mock should confirm the standard detent suffices for the portal
   Transition without constant group scrolling.
5. **Edge rules for moved scene ranges** (which boundary Transitions travel
   with a block, and what the seam label promises at each edge) need a final
   model decision — the proposal states a default (Transitions follow their
   preceding scene) but this is exactly research open-decision #2.
6. **Scene-local model authority.** The wireframed segments, overlays, and
   keyframes presume the composition prototype's model; if the eventual
   Scene model constrains cut density or overlay count differently, the lane
   set — not the grammar — changes.
7. **Selection persistence across scope switches** (does entering a Scene
   keep a global clip selection?) is left as: selection clears on scope
   entry except the opened scene; revisit after mock use.
8. **Undo transaction boundaries with async D1 persistence** (failure
   mid-transaction, history lifetime) remain the open questions the research
   flagged; the dock and timeline only require that the answer exist before
   multi-entity mutations ship.
9. **Touch/pen input** is unaddressed by design (specialist desktop IDE);
   narrow-window command twins are the fallback if that assumption changes.

# Claude revision: Show Timeline production-density design (Round 2)

Author: Claude (revision, 2026-07-14).
Inputs: the shared brief, `claude-proposal.md`, `codex-proposal.md`, and
`human-feedback.md`. No adjudication, comparison, or final-design artifact was
read.

## Verdict on the other proposal

The Codex proposal wins on the two decisions that shape everything else, and I
adopt both.

**The anchored Quick Inspector is the better default property surface.** My
bottom dock optimized for stability and capacity, but it bought them at the
cost that matters most in repeated expert use: proximity. A dock puts the
value being edited 300–600 px from the entity being watched, on every single
selection, forever. Codex's anchored panel pays an occasional occlusion cost
instead — and occlusion is recoverable (flip, shift, hide-during-drag,
Escape), while distance is not. My dock's core argument, "selection changes
must never move authored rows," is fully satisfied by an overlay-root panel
too: it never reflows lanes at all. The dock solved a stability problem the
overlay solves for free. The human feedback confirms this direction and names
the surface the **Entity Detail Panel**; the required amendments (visible
stem/leader to its owner, editable controls styled distinctly from quiet
read-only facts, pin deliberately breaking the anchor) are refinements of the
Codex design, not reversals.

**The 30/22 px row metric is the right density.** My 48 px "cozy" clip row
and Cozy/Compact toggle treated density as a preference. In a specialist IDE
where vertical Timeline space is scarce and authored content is dense, it is
a constant. Codex's calibrated-instrument framing — 30 px primary rows, 22 px
subordinate lanes, structure carried by borders, indentation, icons, and
text rather than padding — is simply the correct budget, and the two-line
clip anatomy my 48 px row bought can live as a one-line row plus badges
without real loss. The density toggle is deleted, not demoted.

Codex's weaknesses, which this revision does not carry forward:

- **The Scene-local zone-coverage rows are redundant.** Three 22 px rows
  repeating "coverage" bars restate routing membership that the base and
  overlay rows already imply. Codex's own risk list half-concedes this. The
  hierarchical owner-nested structure (Effect spans, overlays, automation
  lanes directly under their owning placement) is denser and more truthful,
  and the feedback endorses it.
- **The opacity keyframes drawn outside their owner were a model error**
  (acknowledged as a mock defect in feedback). Property lanes must be bounded
  by their typed owner's time range; the revision states that rule and the
  boundary-owned-ramp exception explicitly.
- **Space-hold Hand pan conflicts with transport.** Codex's own risk note
  says it: deciding play/pause on key *release* delays playback, and playback
  rhythm is the most-used action in the tool. The revision keeps Space as an
  immediate play/pause and pans by other means.
- **The outgoing Transition lane at the bottom, with no incoming lane,**
  under-serves the boundary model. Feedback places compact read-only incoming
  and outgoing lanes near the top with true local-time geometry.
- **Silently collapsing the library at a breakpoint** violates the feedback's
  stable-frame rule; collapse must be an explicit, restorable user action.

## Reconsideration of the original proposal

What my proposal got wrong, judged on its own terms and not only against
feedback:

- **The dock was a defensible answer to the wrong ranking of costs.** I
  ranked stability > capacity > proximity; for an expert doing hundreds of
  select-inspect-adjust loops per session, proximity dominates. I also
  over-weighted the portal Transition's ~20 fields: a 292 px panel with group
  disclosure and `Open details` handles it; a six-column horizontal dock was
  capacity theater.
- **Zone colors spent a scarce channel on information the layout already
  carries.** Row position, the sticky gutter label, and routing context
  identify zones; my 3 px zone-color bars and gutter chips consumed the
  restrained palette that should bind semantic classes (placements, Effects,
  automation, Transitions, routing, selection, warnings, continuation)
  across Timeline, panel, and Stage. Feedback rules this explicitly; I would
  now make the same call without it.
- **Global lanes zone-scoped with "target block per scene + ramp wedge" was
  half right.** The boundary-owned model reading was correct; the geometry
  was not. A lane belongs to a typed owner — normally a Pattern placement —
  and is bounded by that owner's span. The wedge glyph, my honest-asymmetry
  device, becomes unnecessary once lanes draw a value-scaled sparkline:
  a flat run at the target value, a diamond at each authored change point,
  and the ramp drawn inside the Transition interval in Transition-ownership
  styling. Same glyph vocabulary in both scopes, ownership carried by
  styling and selection behavior instead of by a second glyph. This retires
  risk #3 of my original proposal.
- **Scene headers riding inside the ruler band** saved 24 px by merging the
  scrub surface with a selection/drag surface — an initiation-region
  ambiguity my own selection rules then had to legislate around. A dedicated
  26 px Scene band is cheaper than the rule it removes, and it gives the
  three-resolution Scene representation (silhouette badge, medium overview,
  full editor) a natural home.
- **"Pinned" boundary posts in Scene scope** misdrew the model. An incoming
  4 s crossfade genuinely occupies the first 4 s of local time while the
  scene's placements run underneath it; pinning it to x = 0 as a post hid
  that overlap. Real-geometry spans, read-only, with a jump to the global
  boundary editor, are correct.

What survives scrutiny and is retained:

- In-place scope swap with a persistent miniature Show map (both proposals
  converged here independently; the "separate Scene route" rejection stands).
- One viewport engine (`showTimelineViewport.ts`), true time→px placement,
  pointer-anchored zoom, parameterized `minDurationMs` per scope.
- The Scene-local hierarchy: owner-nested Effect spans, overlay layers one
  level deep, and automation lanes with drawn value curves — the feedback
  names these as the strongest contributions.
- Named semantic undo transactions, keyboard twins for every drag, the
  focus-grammar resolution (arrows are transport at workspace focus, spatial
  navigation at entity focus), marquee/initiation-region rules, mixed-value
  idioms, and the accessibility architecture.
- Strict "paste never invents time," now wrapped in Codex's better two-stage
  ghost commit.

## Decision ledger

| # | Difference | Ruling | Reason |
| --- | --- | --- | --- |
| 1 | Property surface: bottom dock (Claude) vs anchored Quick Inspector (Codex) | **Adopt Codex** | Proximity dominates for repeated expert loops; occlusion is recoverable, distance is not; overlay root satisfies row stability for free. Amended per feedback: stem/leader anchor cue, editable-vs-read-only styling, pin breaks the anchor. |
| 2 | Row metrics: 48/36 px + density toggle vs 30/22 px fixed | **Adopt Codex** | Density is a constant in this IDE, not a preference; badges carry the second line's content. Toggle deleted. |
| 3 | Scene representation: headers in ruler band vs dedicated Scene band | **Adopt Codex** | Removes a scrub-vs-drag ambiguity for 26 px; hosts the complexity badge, `Open ›`, and the three-resolution silhouette. |
| 4 | Automation lane ownership and glyphs: zone-scoped target blocks + ramp wedges vs placement lanes + diamonds | **Adapt (merge)** | Adopt owner-bounded lanes and unified diamond vocabulary; keep my boundary-owned semantics by drawing the ramp inside the Transition interval in Transition-ownership styling (Codex's version had keys outside the owner — a defect). Add value-scaled sparklines per feedback. |
| 5 | Zone colors (both proposals used them; mine heavier) | **Reject both** | Feedback rules color is semantic-class only. Zones are identified by row position and gutter label; the palette binds classes across Timeline, panel, and Stage. |
| 6 | Scene-local structure: owner-nested hierarchy (Claude) vs base/overlay + zone-coverage rows (Codex) | **Retain Claude** | Coverage rows restate what the hierarchy shows; feedback endorses the hierarchy and the Effect lane specifically. Coverage becomes placement/overlay metadata in the panel. |
| 7 | Effect lane with ordered spans (Claude only) | **Retain** | Maps which Effect is active over time; the panel edits stack order/params. Now drawn in the Effect class hue as the cross-surface binding example feedback cites. |
| 8 | Boundary Transitions in Scene scope: pinned posts (Claude) vs single bottom OUT lane (Codex) | **Adapt (neither as-is)** | Feedback: compact read-only IN and OUT lanes near the top with true local-time spans and a jump to the global boundary editor. One shared 22 px lane; it splits into two when the spans overlap in time (short scene). |
| 9 | Pan gesture: Space-hold Hand (Codex) vs Space-drag-on-empty-canvas (Claude) | **Reject both** | Both compromise Space-as-transport (Codex's own risk note). Space stays immediate play/pause; pan = H-hold Hand, middle/two-finger drag, Shift-wheel. |
| 10 | Paste: strict anchor, no preview (Claude) vs movable ghost at playhead (Codex) | **Adapt (merge)** | Adopt the two-stage ghost commit (movable, Escape cancels) — it defers commitment and communicates displacement. Keep my anchors: playhead in Scene scope; structural seam/empty slot in global scope. Paste still never invents time. |
| 11 | Drop conflicts: reject-on-collision (Claude) vs green/amber/red displacement (Codex) | **Adapt (merge)** | Adopt the three-state color+icon+label language. Amber displacement applies only where the model defines displacement (scene-block insertion, Scene-local segment insertion); a clip dropped on an occupied global cell remains red/invalid in v1 with a one-line reason. |
| 12 | Click selected entity again toggles the panel (Codex) | **Adopt** | Cheap, discoverable close gesture consistent with a modeless panel. |
| 13 | Panel hides during content drags, reappears at commit (Codex) | **Adopt** | Directly mitigates the occlusion risk during the interactions where it bites hardest. |
| 14 | Rubric layout: fixed-width group columns with empty-slot alignment (Claude) vs vertical groups, 96 px labels, omit irrelevant groups (Codex) | **Adopt Codex layout** | The panel is vertical; omitting irrelevant groups beats preserving ghost slots. Retain my mixed-value idiom (`—` + indeterminate control), multi-selection pill, and "not on 2 of 4" disabled fields, plus feedback's editable-vs-read-only styling split. |
| 15 | Narrow-window: dock-as-bottom-sheet (Claude) vs auto-collapsing library rail (Codex) | **Reject both** | Dock is gone; feedback forbids silent library removal. Library collapse is an explicit toggle with an obvious restore; the panel clamps and may temporarily cover a side rail; Stage never silently replaced. |
| 16 | Viewport engine reuse, pointer-anchored zoom, semantic undo transactions, keyboard twins for drags | **Shared — keep** | Both proposals converged; no change. |
| 17 | Parameterized zoom ceilings per scope (Claude only) | **Retain** | The current `totalMs/16` floor cannot resolve sub-second work; Codex is silent on limits. Global `max(2000, total/256)`, Scene `max(50, scene/512)`. |
| 18 | Scene entry: `Open ›` on selected header (Codex) vs double-click / Enter (Claude) | **Merge** | All three affordances invoke the same command; no conflict. |
| 19 | Miniature Show map in Scene scope: 24 px interactive (Claude) vs 20 px display-only (Codex) | **Adapt** | Keep at 20 px, but interactive: it is the scope exit and adjacent-scene switch, which is what earns its persistent height (answers feedback gate 1). |
| 20 | Low-zoom event clustering with deterministic expansion (Codex) | **Adopt** | The correct extreme-zoom behavior and the mechanism behind resolution 1 of the three-resolution rule; never silently omits data. |
| 21 | Escape order | **Merge** | Cancel active gesture → close panel → clear selection → exit Scene scope. Gesture cancel must outrank panel close or Escape-during-drag would strand the drag. |
| 22 | Continuing Pattern across a silent boundary | **New (feedback)** | Joined run with a subtle seam tick + continuation cue; later Scene shows a segment labeled "continues from previous Scene"; Restart Here / Make Independent as explicit actions. Neither proposal drew this. |
| 23 | Stage Show/Hide Zones mode | **New (feedback)** | Explicit toggle from zone/routing context; colors and labels the layout active at the playhead; cross-highlights with rows; Escape dismisses. Replaces my persistent zone-color coupling ambition. |
| 24 | Fixtures | **Rebuild per feedback** | Six mandated fixtures with named owners and stated continue/restart semantics at every boundary (list below). |
| 25 | Compile/status readout | **Position on open gate** | Recommend collapsible to a ~26 px status chip (state + cost headline), expandable on demand. It is reference, not editing; distinct from the rejected dock because it holds no controls. |

## Revised recommendation

Keep the three-pane frame with the Stage fixed at right and the library
explicitly collapsible. The center column is a single compact Timeline
grammar at two time scopes: a 26 px Scene band, a 24 px Transition lane, and
30 px placement rows with owner-nested 22 px disclosure lanes, drawn with
true time→px geometry from `showTimelineViewport.ts`. Properties live in one
anchored, modeless **Entity Detail Panel** in the application overlay root:
it transfers between selections, attaches to its owner with a visible stem,
flips for space, hides during drags, and pins into a narrow dock only by
explicit user action. Color is a restrained semantic-class palette
(placement, Effect, automation, Transition, routing, selection, warning,
continuation) that binds a Timeline span to its panel, badges, and Stage
affordance; zones are identified by position and label, never by color.
Scene-local scope swaps the time domain in place behind a scope strip and a
20 px interactive Show map, exposes read-only incoming/outgoing boundary
Transition spans in true local geometry near the top, and authors cuts,
overlays, Effect spans, and keyframed automation in the same grammar,
gestures, and shortcuts as global scope.

## Revised workflow and structure

### Center column (desktop, 1440 × 900; center ≈ 880 px, min 640 px)

```
┌─ CENTER COLUMN ──────────────────────────────────────────────────────────┐
│ Workspace header (existing)                                        36 px │
│ scope + transport + edit tools                                     34 px │
│ ruler                                                              24 px │
│ SCENE band                                                         26 px │
│ TRANSITION lane                                                    24 px │
│ placement rows (30 px) + disclosure lanes (22 px), 4 px zone gaps  flex  │
│ viewport navigator                                                 20 px │
│ compile/status chip (collapsible; expanded 26 px)                  26 px │
└──────────────────────────────────────────────────────────────────────────┘
```

Gutter: 132 px sticky (108 px at narrow widths). Lane labels indent 12 px
with `↳`. The Timeline pane scrolls vertically only when disclosed lanes
exceed it; ruler, Scene band, and Transition lane stay pinned. Nothing about
selection or the panel ever changes row positions.

### Fixtures (all six mandated; each span has a named owner and each boundary
states continue/restart)

1. **"Atrium Loop"** — long Show, 4 zones, 6 scenes / 4:36, dense local
   activity, one clip holding across two scenes, one spanning two zones.
2. **"Cathedral Signal"** — short Show, 12 zones, near-continuous occupancy
   (stress: 12 × 30 px = 360 px of primary rows plus chrome fits an ~900 px
   window with zero lanes disclosed; the pane scrolls with pinned chrome
   beyond that).
3. **"Strobe Break"** — Scene with 4 base cuts inside 250 ms, one overlay,
   two Effect spans, two animated properties, and incoming (wipe 1.5 s) and
   outgoing (crossfade 2.0 s) boundary spans.
4. **Routing loop** — repeated routing-layout switches at boundaries.
5. **Silent boundary** — a Scene boundary with continuing Pattern state and
   no visible change (joined run + seam cue).
6. **Active boundary** — a boundary made visible by routing + property +
   placement changes together.

### Global Timeline redline

State: "Atrium Loop", viewport 0:56–2:16, `canopy` placement lanes disclosed,
portal Transition selected, Entity Detail Panel anchored to it.

```
┌ 34 │ ⏮ ▶ 01:12.4 / 04:36.0 │ − Fit + ⌕3.5x │ 🧲Snap │ [1 Transition ▾]      │
GUTTER 132   CANVAS (time→px, virtualized)
┌────────────┬─────────────────────────────────────────────────────────────┐
│ SHOW TIME  │ |1:00     |1:10     |1:20     |1:30     |1:40     |1:50   24 │
├────────────┼─────────────────────────────────────────────────────────────┤
│ SCENES     │ Pulse Storm 30.0s ◇1 │ Strobe Break 8.0s ◇6 Open › │ Port… 26│
├────────────┼─────────────────────────────────────────────────────────────┤
│ TRANS ⚡   │            ≋2.0s│           ▤1.5s│        ╔◎ 3.0s╗ ⇄route  24│
├────────────┼─────────────────────────────────────────────────────────────┤
│ ▾ canopy   │ [NebulaSphere 0.8× fx2 hold][StB×5 ⊞][PortalBloom fx3 ~2] 30│
│  ↳ speed   │ ─0.8×────────────◆╱─1.0×──────────────◆─1.0×──────────    22│
│  ↳ Speed   │ ─0.35────────────◆╱─0.62──────────────  (ctrl, owner-bound) 22│
├────────────┼─────────────────────────────────────────────────────────────┤
│ ▸ columns  │ [CometLoom ⇕2            ][EmberDrift fx1 ⋯continues→]    30│
│ ▸ floor    │ [  (⇕2 span above)       ][RippleField ~1]                30│
│ ▸ entry    │ [TestPattern1D ][+ clip  ][PhantomStar]                   30│
├────────────┼─────────────────────────────────────────────────────────────┤
│ + zone     │ ◤────────█████ visible █████──────────◥        navigator 20│
└────────────┴─────────────────────────────────────────────────────────────┘
                     ┌ stem ┐
        ┌ ◎ TRANSITION  Portal · after "Portal Bloom"        pin  × ┐ 26
        │ Duration      3.0 s      Easing        ease-in-out ▾      │ 24
        │ Shape         Star ▾     Points        5                  │ 24
        │ Center        0.50, 0.42 Scale         1.20               │ 24
        │ Motion        grow ▾     Spin          0.5 /s             │ 24
        │ Property ramps (2)                                    ›   │ 24
        │ Cost   2 renderers in band · ≈1.4 N        (read-only)    │ 24
        │ Advanced                                              ▸   │ 24
        └────────────────────────────────────────────────────────────┘
```

Annotations:

- **Scene band (26 px).** Header = name, duration, `◇N` complexity badge
  (count of authored internal lanes/events — a signal, not a miniature),
  `Open ›` when selected. Click selects; drag moves the scene block;
  double-click / Enter / `Open ›` enters Scene scope. This is resolution 1
  of three: at any zoom the header carries a faint internal-event
  **silhouette** (hairline cut ticks, overlay stripe, automation shading)
  that degrades to density shading at extreme zoom-out — clustering, never
  omission.
- **Medium Scene overview (resolution 2).** A per-scene read-only
  disclosure: toggling `overview` on a selected scene draws that scene's
  internal beats as faint hairline ticks and dimmed micro-spans *inside its
  existing global rows* — no hit targets, no handles, nothing that looks
  editable. During any drag, hidden internal beats surface as temporary
  snap guides whether or not overview is on. This answers feedback gate 2:
  the overview's information is beat positions, Pattern rhythm, and
  cross-Scene alignment references — exactly what wayfinding and snapping
  need, and nothing a pointer can grab.
- **Transition lane (24 px).** One chip per boundary entity, width = real
  duration, min 24 px; zero-duration cut = 2 px tick with 24 px hit area.
  Routing markers are a second, dashed `⇄` chip beside the visual
  Transition; they never merge. Glyphs (≋ ▤ ▒ ◎ ✂ ⇄) distinguish kind;
  the Transition class hue binds chip, ramp segments, panel header, and
  Stage affordance.
- **Placement rows (30 px).** Anatomy: class icon, name, compact badges
  (`0.8×`, `fx3`, `~2` animated-property count, `hold`, `⇕2`, `↻`), edge
  handles on hover/focus with 24 px invisible targets. `StB×5 ⊞` is a
  low-zoom cluster chip: activating or zooming expands it around the
  pointer. The `⋯continues→` cue plus a 1 px seam tick marks a joined run
  across a silent boundary (fixture 5): one visual run, Scene ownership
  preserved by the seam.
- **Automation lanes (22 px, owner-bounded).** Disclosed per placement
  (chevron or `L`), drawn only within the owner's span. A value-scaled
  sparkline (0–1 for normalized properties; others declare range and
  baseline) runs flat at each target value; ◆ diamonds mark authored change
  points; the ramp between targets is drawn *inside the Transition
  interval* in Transition-ownership styling (Transition hue, hatched
  underlay). Clicking the ramp segment selects the owning Transition with
  its Property-ramps group focused; clicking a diamond shows the precise
  value. A collapsed owner with authored lanes shows a `▸•` dot in the
  gutter. Same vocabulary in Scene scope; only ownership differs, and the
  styling says so.
- **No zone color.** Gutter labels and row position identify zones. The
  semantic palette: placement (neutral surface), Effect (e.g. teal),
  automation (violet), Transition (amber), routing (dashed slate),
  selection (accent ring), warning (red), continuation (dim cyan seam).
  Subtle enough that selection and errors keep priority; always paired
  with glyph/label.

### Scene-local redline

State: "Strobe Break" (8.0 s) open; viewport 0.90–2.10 s; incoming wipe
already elapsed (off-view left), outgoing crossfade span visible at right in
true geometry; an Opacity keyframe selected.

```
┌ ‹ Show │ Scene 3 · Strobe Break · 8.0s │ local 0:01.240 (show 1:11.24) ⟲ 30│
│ SHOW MAP  ░░░░░████ [S3] ████░░░░░░░░░░░░░░░  (click = switch/exit)     20│
├────────────┬─────────────────────────────────────────────────────────────┤
│ LOCAL TIME │ |1.000    |1.200    |1.400    |1.600    |1.800    |2.000  24│
├────────────┼─────────────────────────────────────────────────────────────┤
│ BOUNDS ⚡  │ ‹▤ in 1.5s (elapsed)          ≋ out 2.0s → Portal Bloom ▒▒ 22│
│ (read-only)│                                    edit at boundary ›        │
├────────────┼─────────────────────────────────────────────────────────────┤
│ ▾ canopy   │ [StrobeA ][StB][SA][StB][ SA ][StrobeCooldown fx1]        30│
│  ↳ bright  │ ─1.00────◆──◆────◆──────◆─0.80───────────────────         22│
├────────────┼─────────────────────────────────────────────────────────────┤
│ ▾ columns  │ [CometLoom fx2 ~1                                    ]    30│
│  ↳ fx      │ ▓Swirl▓▓▓▓▓▓▓▓▓▓▓▓▓║▓Posterize▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓      22│
│  ⧉ overlay │ [· SparkVeil ·······································]     30│
│   ↳ opacity│ 0─▁▂▃◆.45───◆──╔◆╗.62──.70──▶   1.240s · 62% · ease-out   22│
├────────────┼─────────────────────────────────────────────────────────────┤
│ ▸ floor    │ [RippleField ~1                                      ]    30│
│            │ ◤──────█████ visible █████──────◥              navigator 20│
└────────────┴─────────────────────────────────────────────────────────────┘
```

Annotations:

- **Boundary lane (22 px, read-only, near top).** Incoming and outgoing
  Transition spans in true local time: a 1.5 s incoming wipe occupies local
  0–1.5 s while the scene's placements run fully underneath. Selecting a
  span identifies the boundary and offers `edit at boundary ›`, which exits
  to global scope with that Transition selected and the panel open. Scene
  scope never implies it owns the boundary. When incoming and outgoing
  spans overlap in time (a short Scene — feedback gate 4), the lane splits
  into two 22 px sub-lanes (IN above OUT) for exactly the overlap case, and
  the panel for either span states the overlap ("in and out overlap for
  0.8 s; both render for the full Scene"). Nothing is clipped or merged.
- **Show map (20 px, interactive).** Proportional scene blocks, open scene
  filled, playhead tick. Click another block = switch scene; click outside
  blocks = exit to global at that time; `‹ Show` and terminal Escape do the
  same. Serving as the exit and switcher is what earns its height
  (feedback gate 1); a display-only strip would not.
- **Hierarchy.** Effect spans (`↳ fx`, ordered, `║` stack divider, Effect
  hue), overlay layers (`⧉`, one level deep, dotted border + compositing
  stripe, no recursion), and automation lanes nest under their owning
  placement. No zone-coverage rows: coverage/routing membership is a quiet
  read-only fact in the placement's panel.
- **Continuation.** A placement continuing from the previous Scene renders
  as a segment labeled "continues from previous Scene" starting at local 0;
  edits affect only this Scene's segment; `Restart Here` / `Make
  Independent` are explicit panel actions.
- **Keyframes.** ◆ 9 px drawn / 24 px hit; selected key gets the accent
  ring and a value flag; the lane draws the property-scaled curve.
  Double-click expands the lane to a 64 px curve editor — an explicit,
  user-initiated height change.
- Ruler switches to `s.mmm` beyond 4× zoom; Scene viewport uses
  `minDurationMs = max(50, sceneMs/512)`.

### Entity Detail Panel

- **Placement:** 292 px default (252–352), overlay root, prefers below the
  owner then above, shifts horizontally to stay in the app viewport, may
  temporarily cover a side rail, never reflows lanes. A 2 px stem/leader
  ties it to its owner; window resize clamps it back on-screen — no panel
  can be permanently lost.
- **Lifecycle:** click unselected entity = select + open; click the selected
  entity again = toggle panel, selection kept; selecting another entity
  transfers the same panel; it hides past the drag threshold and reappears
  at the committed position; Escape closes it (after gesture cancel).
  `Pin` deliberately breaks the anchor into a narrow edge dock, preserving
  content, field focus, and scroll; free repositioning stays future work.
- **Rubric (one order, groups omitted when irrelevant):** Identity → Time →
  Source & placement → Visual stack → Animation → Cost & advanced. 26 px
  header, 24 px rows, 96 px label column, max 236 px body before internal
  scroll or `Open details` (focused stack/keyframe editor; Stage
  unchanged). Editable controls are visually distinct (field affordance,
  brighter text) from quiet read-only facts (context, ownership, cost —
  dimmed, no affordance).
- **Multi-selection:** one panel anchored to the selection bounds; count
  pill (`4 clips`), shared values editable, `—` + indeterminate control for
  mixed (the `deck-slider-unset` idiom), "not on 2 of 4" disabled fields,
  aggregate commands; commits are one transaction.
- **Animation affordance:** each animatable row carries ◇/◆ — in Scene
  scope it toggles a key at the playhead; in global scope it opens the
  owning boundary's Property-ramps group (the row states "ramped by
  crossfade at 1:26"). One affordance, ownership-truthful behavior.

## Revised interactions and states

### Selection

Click / ⌘-click toggle (like kinds only) / Shift-click contiguous extension
(scene headers along the band; keyframes along a lane). Marquee starts only
on empty canvas; inside a disclosed lane it selects that lane's keyframes.
Initiation regions: ruler = scrub, Scene band = scene ops, gutter = zone
ops, entity = entity ops, empty canvas = marquee. Focus-scoped ⌘A. Escape:
cancel gesture → close panel → clear selection → exit Scene scope.

### Movement, insertion, displacement

Drags show translucent originals + one compact ghost reporting Δtime/zone +
a high-contrast insertion line with the displaced-content preview. Green =
valid magnetic insertion; amber = defined displacement (scene-block and
Scene-local segment insertion); red = invalid, with icon and one-line
reason — a clip dropped on an occupied global cell is red in v1 (explicit
replace ships later with its own confirmation). Boundary Transitions travel
with their preceding scene; the seam label states the edge rule. Alt
inverts snap; Escape cancels; Option-drag duplicates. Keyboard twins: `[`/`]`
move scene blocks; Alt+←/→ nudge edges/keys by snap step (Shift·Alt fine);
lane-change and commit/cancel commands; aria-live reports the proposal.

### Clipboard

⌘C copies a versioned Show fragment; ⌘X, ⌘D as before. ⌘V places a movable
ghost — at the playhead in the focused zone (Scene scope) or at the selected
seam/empty slot (global scope) — commit on click/Enter, Escape cancels. With
no valid global anchor a toast says what to select; paste never invents time.

### Viewport and transport

Space = immediate play/pause. Pan: H-hold Hand, middle/two-finger drag,
Shift-wheel; plain wheel scrolls lanes. Ctrl/⌘-wheel zooms at pointer;
toolbar zoom centers the playhead when visible; ⌘0 Fit. Distinct open-hand /
closed-hand / trim / move / scrub cursors. Viewport state is session state,
never undo history. Edge auto-scroll during drags preserves the anchor.
Scrubbing issues superseding `requestSeek`s; the playhead tracks
optimistically with the existing rebuild badge.

### Stage zones

`Show/Hide Zones`, initiated from zone or routing context: colors and labels
the routing layout active at the playhead; Stage regions and Timeline rows
cross-highlight; same control or Escape dismisses. Previewing unrelated or
future zone sets is deferred.

### States checklist (mock must demonstrate every row)

| State | Treatment |
| --- | --- |
| Default row / lane | as redlined; 30/22 px |
| Hover | +5% tint; edge handles and `⋯` revealed |
| Selected | accent ring; panel opens/transfers with stem |
| Multi-selected | rings + count pill in panel header |
| Dragging | translucent source, ghost + Δ label, insertion line; panel hidden |
| Drop valid / displacing / invalid | green / amber+preview / red+reason, each with icon and text |
| Mixed value | `—` + indeterminate control + `mixed` tag |
| Cluster (low zoom) | `×N ⊞` chip; expand on zoom/activate; keyboard-accessible |
| Continuation | seam tick + `⋯continues→` cue; "continues from previous Scene" segment label |
| Read-only boundary span (Scene scope) | dimmed, no handles, `edit at boundary ›` |
| Empty slot | dashed `+ clip` |
| Seek rebuilding | optimistic playhead; Stage badge |
| Panel overflow | group disclosure → internal scroll → `Open details` |
| Collapsed owner w/ authored lanes | gutter `▸•` dot |
| Zero-duration cut | 2 px tick, 24 px hit, "Cut" in panel |
| Narrow window | library explicitly collapsed to labeled rail with restore; gutter 108 px; panel clamps to 252 px; Stage min 240 px, independently toggled below that |

### Keyboard grammar (both scopes)

Unchanged from my original except: Space is always immediate play/pause;
H-hold is Hand pan; `Inspect` (Enter on a focused entity) opens the panel
with focus in the first field; Escape order as above. Arrows remain
transport at workspace focus and spatial navigation at entity focus; `K`
toggles a key at the playhead for the panel's focused property (Scene
scope); `L` toggles lanes on the focused owner; `S` snap; `[`/`]` scene
moves; ⌘Z semantic transactions with named toasts.

### Accessibility

Every entity is focusable with a complete accessible name (type, name,
owner, scope, time range); roving focus in time order within a lane, then
lane order; arrows never activate while a text/value editor owns focus. The
modeless panel never traps focus: pointer-open leaves focus on the entity,
the Inspect command moves it in, close returns it to the owner (extends the
existing `data-show-timeline-focus` contract). Type never depends on color;
tinted fills keep ≥ 4.5:1 value text; `prefers-reduced-motion` removes panel
travel and displacement animation while keeping end states explicit; a
polite live region announces transactions and seek completion; hit targets
≥ 24 px (32 px for destructive controls where feasible).

## Implementation implications

Global scope ships first and stands alone; Scene scope reuses the same
components with a different time domain and lane set.

1. **Engine (pure, TDD first):**
   - `showTimelineViewport.ts`: parameterize `minDurationMs` per scope;
     pointer-anchored zoom via existing `anchorMs`.
   - New `showTimelineLayout.ts`: time→px geometry for band headers, chips,
     placements, owner-bounded lane sparklines, ramps, diamonds, seams,
     clusters (with the deterministic cluster/expand thresholds), and
     silhouette ticks; visible-range only (virtualization seam);
     table-tested.
   - New `showSelectionModel.ts` + a pure inspection state machine (closed /
     anchored / pinned) — the Codex framing, adopted.
   - Pure drop-proposal geometry returning snap kind, insertion position,
     displacement set, and validity class (green/amber/red + reason).
   - `showModel.ts` operations: `moveSceneBlock`, `duplicateSceneRange`,
     `moveClipFootprint`, versioned fragment serialize/deserialize;
     named-transaction undo stack in `showStore` (prerequisite for any
     multi-entity mutation; #462/#463 scope).
2. **Components:** decompose `ShowEditor.tsx` into `ShowTimeline`
   (descriptor-driven rows: canvas + gutter + navigator),
   `EntityDetailPanel` (rubric renderer over per-entity group descriptors,
   overlay root with collision/clamp/stem logic), and thin gesture hooks.
   Rows render from shared descriptors so both scopes share ruler,
   playhead, selection, snapping, and accessibility without copying.
3. **Scene scope:** `TimeDomain` adapter (`toLocal`/`fromLocal`), read-only
   boundary-span descriptors derived from the global boundary entities,
   scope state in the component; `showTransportStore` gains only a
   loop-range option. No persistence or compiler change (explicit
   non-goal).
4. **Interactive mock:** throwaway route beside the existing Show
   prototypes, seeded with all six fixtures, in-memory history, no D1
   writes; must demonstrate every states-checklist row, including the
   12-zone density fixture and the overlapping-boundary short Scene.
5. **Verification:** unit tests on layout/selection/proposal/model modules;
   light component smoke tests; Playwright for selection + panel transfer,
   drag proposals (all three validity classes), keyboard-only scene move,
   row-stability assertion across selection changes, narrow-window
   collapse/restore, and console errors; `?capture` screenshots at 880 px
   and 600 px pane widths.

Costs acknowledged: the overlay panel needs collision, clamp, and
resize-recovery logic the dock never did; owner-bounded sparklines add lane
geometry work; abandoning the `fr`-grid still requires a resize observer
and virtualization; every existing inspector's field logic migrates into
panel group descriptors.

## Remaining disagreements and confidence

1. **Space-hold Hand pan: rejected (high confidence).** I disagree with the
   Codex default even though its risk list hedges. Play/pause latency is a
   per-minute cost in a transport-centric tool; a dedicated H-hold plus
   middle/two-finger drag covers panning with zero transport tax. If
   hands-on testing shows Hand demand exceeding H-hold reach, revisit.
2. **Clip-on-occupied-cell drops stay invalid in v1 (medium-high).** Codex's
   amber displacement is adopted only where the model defines displacement.
   Silent clip replacement is a destructive edit hiding inside a move
   gesture; explicit replace deserves its own affordance. If mock testing
   shows constant friction, add drop-with-confirm before inventing
   displacement semantics.
3. **Boundary-lane split rule for short Scenes (medium).** The
   one-lane-splitting-to-two answer to feedback gate 4 is my proposal, not
   a settled decision; a permanently two-lane layout costs 22 px in every
   Scene to simplify a rare case. The mock's short-Scene fixture decides.
4. **Medium Scene overview as in-row read-only ticks (medium).** This
   answers gate 2 without a second embedded editor, but whether faint ticks
   inside global rows read as "not editable" needs hands-on testing; the
   fallback is confining the overview to an expanded Scene-band strip.
5. **Compile/status chip collapse (low stakes, medium confidence).** I
   recommend collapsible-to-chip; it is read-only status, unlike the
   rejected dock. Human gate.
6. **Occlusion at viewport edges (shared risk, unresolved).** Adopting the
   anchored panel adopts its hardest problem. Flip/shift/hide-during-drag
   plus Escape are the mitigations; Codex is right that this needs pointer
   testing with dense clips at pane edges, not screenshot approval.
7. **Panel capacity for the largest real descriptors (shared risk).** The
   rubric must be exercised against the portal Transition and the longest
   Effect stack in the mock; `Open details` is the pressure valve.

Everything else in the ledger I hold at high confidence: the adopted Codex
foundation (panel, 30/22 metrics, Scene band, drag-proposal language) plus
the retained hierarchy, Effect spans, value-bearing curves, keyboard
grammar, and undo architecture are mutually consistent and feedback-aligned.

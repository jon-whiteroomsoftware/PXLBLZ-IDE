# Adversarial Cross-Revision: Codex Show Timeline production density

## Verdict on the other proposal

Fable's first proposal has the stronger account of vertical ownership inside a
Scene. Its expanded zone hierarchy makes Effect spans, overlays, and animated
properties legible as children of authored content instead of undifferentiated
rows. Its value-bearing automation lanes also communicate substantially more
than the decorative diamonds in the Codex mock. Those decisions should become
part of the revised design.

Fable's permanent bottom property dock and 36/48-pixel primary rows do not fit
this product. They spend the two resources under the most pressure: proximity
to the selected entity and vertical Timeline capacity. The anchored modeless
Entity Detail Panel and a 30/22-pixel row grammar remain the better foundation.

The first proposals also shared several weak assumptions. Both used sparse,
partly invalid fixtures; both spent color on zone identity; neither made
cross-Scene Pattern continuation sufficiently explicit; and neither separated
Scene-owned authoring from boundary-owned Transition references correctly in
Scene-local scope. Round 2 must repair those shared defects rather than choose
between them.

## Reconsideration of the original proposal

The original Codex proposal was right about the stable application frame,
compact density, local property surface, shared scope grammar, and precommit
editing states. It was too flat inside Scene-local scope. `BASE`, `OVERLAY`, and
coverage rows described output categories but did not consistently reveal which
placement owned an Effect or animation lane. Fable's nested hierarchy is a
better organizing mechanism.

The original proposal also treated the Show navigator as almost self-evidently
useful and the medium Scene resolution as only a complexity badge. Human review
showed that both need to earn their pixels. The revised design makes the
navigator conditional and turns medium detail into a deliberately read-only
X-ray lane aligned to global time.

Finally, the original Scene-local mock placed the outgoing Transition below the
composition and implied local editability. A Scene boundary owns that
Transition. Scene-local scope needs read-only incoming and outgoing reference
lanes with real time geometry while Scene-owned content continues underneath.

## Decision ledger

| Decision | Action | Reason |
| --- | --- | --- |
| Stable library / Timeline / Stage frame | **Adopt** | Both proposals preserve spatial memory and the same Stage. |
| In-place global-to-local scope change | **Adopt** | One Timeline grammar transfers expertise and keeps Scene-local additive. |
| Permanent bottom property dock | **Reject** | It is distant from selection and permanently consumes vertical space. |
| Anchored modeless Entity Detail Panel | **Retain** | It minimizes pointer and eye travel without reflowing authored rows. |
| Pinning the panel | **Adapt** | Pinning preserves a sustained work surface but may break the visible anchor; free placement remains future work. |
| 36/48-pixel density modes | **Reject** | Larger rows do not solve a user task and hide realistic dense content. |
| 30-pixel primary / 22-pixel subordinate rows | **Retain** | The compact grammar leaves vertical capacity for explicit disclosure. |
| Fable's 160-pixel gutter | **Adapt** | Use 132 pixels by default, compressible to 108; reveal full labels by tooltip or panel. |
| Dedicated Transition track globally | **Adopt** | Boundary events become findable and their duration geometry remains honest. |
| Editable boundary Transition inside Scene-local scope | **Reject** | The boundary, not either Scene, owns the Transition. |
| Incoming/outgoing Scene-local Transition references | **Adapt** | Draw read-only spans at actual local times and route editing back to the global boundary. |
| Hierarchical Scene-local lanes | **Adopt** | Effect, overlay, and property lanes read as children of their actual owner. |
| Time-mapped Effect spans | **Adopt** | They show when an Effect is active; stack order and parameters remain in the panel. |
| Property value curves and numeric flags | **Adopt** | Shape plus selected/playhead value answers both qualitative and exact questions. |
| Per-Scene target blocks as a universal global model | **Reject** | Values belong to typed placements or boundary ramps, not automatically to every Scene-zone cell. |
| Expanded property lanes by default | **Adapt** | Authored lanes are discoverable, but only selected or explicitly disclosed owners spend vertical space. |
| Miniature Show navigator always visible | **Adapt** | Keep it in Scene-local scope only when it supports navigation or orientation; collapse it to a scope marker when height is constrained. |
| Click outside navigator Scenes to exit scope | **Reject** | A small miss should not cause a scope change; use `Back to Show`, Escape, or an explicit Show region. |
| Scene headers merged into the ruler | **Reject** | A separate compact Scene band provides selection, disclosure, names, and complexity without overloading scrubbing. |
| Medium Scene detail as a second editor | **Reject** | It creates conflicting authoring surfaces and false affordances. |
| Read-only medium Scene X-ray | **Adopt** | It preserves global alignment while exposing internal rhythm and snap references. |
| Zone-specific row colors | **Reject** | Position and labels already distinguish zones; color is more valuable across distant semantic representations. |
| Semantic cross-surface color | **Adopt** | The same restrained accent can bind an Effect span, badge, panel, and Stage affordance. |
| Typed selection and semantic undo transactions | **Adopt** | Operations remain explainable, reversible, and testable across scopes. |
| Paste rejected whenever occupied | **Reject** | The intended editing loop requires insertion and displacement, but only through an explicit precommit proposal. |
| Silent magnetic displacement | **Reject** | The preview must name Insert, Overwrite, or Invalid and show the exact moved footprint before commit. |
| Space-hold Hand pan | **Adapt** | Retain the user-requested expert gesture with a movement threshold: tap toggles transport; hold plus drag pans. Disable it while text/value controls own input. |
| Stage zone preview from incidental hover | **Reject** | Zone visualization is an explicit routing mode; hover only cross-highlights after activation. |
| Dense and model-valid fixtures | **Adopt** | Empty space and impossible ownership cannot be allowed to make a layout look successful. |

## Revised recommendation

Use the compact Codex application frame and Entity Detail Panel with Fable's
owner-nested Scene-local lane hierarchy and value-bearing curves. The Timeline
operates at three Scene resolutions without creating three editors:

1. The ordinary global Scene band shows structure and a compact complexity
   signal.
2. One selected Scene may open a read-only X-ray lane aligned to global time.
3. Scene-local scope replaces the global time domain for full authoring.

Color communicates semantic family and active behavior across surfaces. Row
position, labels, icons, geometry, and indentation carry zone and ownership
structure. Global boundary Transitions remain editable in their dedicated
track; Scene-local scope shows their overlapping intervals as read-only context.

The Round 2 visual comparison should use the same two valid fixtures for both
models. A dense long Show tests horizontal growth and continuation. A short
twelve-zone Show tests vertical growth. The open Scene fixture includes rapid
cuts, overlapping placements, two Effect spans, two animated properties, a
continuing Pattern instance, and both incoming and outgoing Transition context.

## Revised workflow and structure

### Global Show scope

The application opens in the unchanged three-pane frame. The library has an
explicit collapse button in its header; when collapsed, a 24-pixel restoration
tab remains at the Timeline edge. The Stage remains fixed. The center toolbar
contains transport first, then viewport controls, Snap, selection mode, and a
Space-drag reminder.

The Timeline begins with ruler, Scene band, Transition track, then stable zone
rows. A zone row is 30 pixels. Selecting a placement may reveal its property or
Effect lanes directly beneath it, each 22 pixels. Disclosure is owner-specific:
opening PortalBloom's Opacity does not create a permanent Opacity row for every
later placement in the zone.

The Scene band uses true time geometry. Each Scene shows its name at sufficient
width and otherwise its icon plus tooltip. A quiet internal silhouette reports
activity density: placement boundaries use short neutral ticks, authored
property beats use the automation accent, Effects use the Effect accent, and a
routing switch marks the boundary rather than the Scene body. At extreme zoom,
these merge into a single complexity histogram.

Selecting the Scene disclosure opens one 32-pixel read-only X-ray immediately
beneath the Scene band. It spans only that Scene's global interval and summarizes
activity across zones as three thin layers:

- placement rhythm and continuations;
- Effect and property-event density; and
- named internal beats that can become snap guides during a drag.

The X-ray permits selection, hover explanation, snapping, and `Open Scene`; it
does not trim, move, keyframe, or reorder local content. Only one X-ray opens at
a time. Its explicit `Read-only overview` label and absence of handles prevent
it from resembling a miniature editor.

### Scene-local scope

Opening a Scene preserves the library and Stage and swaps the Timeline's time
domain. The 28-pixel scope bar presents:

```text
Back to Show | Scene 3 - Strobe Break - 8.0 s | LOCAL 1.240 | SHOW 71.240 | Loop Scene
```

A 20-pixel Show navigator appears when vertical capacity permits. It shows
proportional Scenes, current Scene, and global playhead. Clicking another Scene
switches local scope after pending edits commit or cancel. It is navigation, not
an editable Timeline. A compact `Scene 3 of 6` marker replaces it when collapsed.

The local Timeline uses this order:

```text
LOCAL RULER                                      24
INCOMING BOUNDARY - read-only                    22 when present
OUTGOING BOUNDARY - read-only                    22 when present
ZONE / PLACEMENT                                 30
  Effect activity                               22 when disclosed
  Overlay placement                             30 when present/disclosed
    Overlay opacity curve                       22 when disclosed
  Placement brightness curve                    22 when disclosed
NEXT ZONE / PLACEMENT                            30
```

Boundary rows sit near the top because they describe the Scene's temporal
envelope, not a child of any zone. A four-second incoming crossfade occupies the
first four seconds in its row. Placements, rapid cuts, Effects, and keyframes
remain active and editable underneath it. Selecting the crossfade opens a
read-only Entity Detail Panel with `Edit boundary in Show` and `Reveal global
Transition` actions.

Within a zone, the primary placement row shows cuts and overlapping placements.
An Effect lane maps active spans using the Effect class accent; clicking a span
opens that Effect in the Entity Detail Panel. The panel owns stack order,
bypass, presets, and parameters. An overlay is another placement source and
therefore receives a 30-pixel row, with its own nested Effects and animated
properties. Nesting stops at one overlay level until the model proves more is
needed.

### Pattern continuation across Scenes

The global Timeline may join two adjacent placements that reference one
continuing Pattern instance. A subtle Scene seam remains visible and a
continuation glyph straddles it. The joined appearance communicates continuous
output; the seam communicates ownership.

Opening the later Scene shows a segment beginning at local zero with `Continues
from previous Scene`. Placement edits affect only the later Scene's bounded
placement. Pattern clock and private state continue. The Entity Detail Panel
distinguishes placement controls from shared instance controls and offers
`Restart here` and `Make independent` as explicit structural commands.

### Stage routing mode

`Show Zones` lives in the routing/zone gutter, not as a generic Stage button.
Activating it changes the Stage from rendered output to the routing layout
active at the playhead. Regions receive temporary categorical fills, labels,
and geometry outlines. Those colors describe the temporary routing diagram,
not persistent zone-row identity. Hover cross-highlights the corresponding row
only after the mode is active. Escape or the same control restores output.

## Revised interactions and states

### Entity Detail Panel

The panel is one app-overlay surface, 252-352 pixels wide. Its stem or aligned
edge points to the selected entity; it flips above or below and may temporarily
cover the library or Stage rather than reflow the Timeline. Selecting another
entity transfers it. Clicking the selected entity toggles it. Pinning preserves
the selected content and turns the stem into a `Pinned` indicator.

Fields use three visibly different treatments:

- editable value: input surface, scrub affordance, menu chevron, or keyframe
  control;
- read-only fact: quiet text with no input border;
- structural command: explicit verb such as `Restart here` or `Edit boundary in
  Show`.

The same semantic accent appears on the selected Timeline entity, its type icon
or Effect badge, and the panel's narrow header rule. Selection itself remains a
strong neutral or primary focus outline so category color never masks focus.

### Curves and keys

An animated property lane draws a one-pixel curve over a declared display
domain. Zero-to-one properties use the full lane height. Signed properties show
a center baseline. Rotation, position, and time-scale declare compact domains
and show an overflow marker when values leave the current scale.

Diamonds are authored keys, not decorative samples. A selected key displays its
time, value, and easing in the Entity Detail Panel and a compact lane flag. The
playhead may show a transient sampled value without creating a key. Double-click
or `Open curve editor` expands only the selected lane to 64 pixels; closing it
restores 22 pixels without changing other rows.

### Selection, movement, and paste

Empty-space drag box-selects compatible entities. Shift extends; Command/Ctrl
toggles; the selection model never mixes structurally incompatible kinds in one
move. A move displays translucent origins, one compact group ghost, a snap
guide, and an operation label.

Paste creates a proposal at the playhead or selected boundary rather than
committing immediately. The proposal names one of:

- `Insert` - downstream content moves by the fragment duration;
- `Overwrite` - explicitly replaces the shown footprint;
- `Place in gap` - no other content moves; or
- `Invalid` - ownership or duration rules prevent commit.

The preview draws every displaced or replaced interval. Tab or a compact toggle
changes available modes; Enter/click commits one semantic transaction; Escape
cancels. Nothing silently invents a Scene boundary or moves content the preview
did not show.

### Navigation and keyboard

Space tap toggles play/pause. Space hold plus pointer movement beyond the Hand
threshold pans; releasing ends the gesture without toggling transport. Middle
drag and two-finger pan remain direct alternatives. Text and numeric controls
consume Space normally. The status area reports `Hand pan` while the temporary
mode is armed, preventing an invisible modal state.

Scene-local Escape order is: cancel gesture, close panel, clear selection, then
return to global scope. Returning restores the prior global viewport; re-entry
restores the Scene-local viewport. Viewport state does not enter Show history.

## Implementation implications

The UI should render from shared descriptors rather than duplicating global and
local components. Each descriptor names its entity owner, semantic family,
time range, row depth, edit authority, color token, and available commands. A
boundary reference in Scene-local scope therefore uses the same Transition id
as global scope but declares `authority: read-only-reference` and supplies a
global reveal command.

The engine/store work should remain framework-independent:

- typed selection sets and semantic transactions;
- pure insert/overwrite/displacement proposal functions;
- a `TimeDomain` adapter between Show and Scene-local coordinates;
- owner-bounded automation geometry and sampled-value helpers;
- Scene activity summarization for the collapsed signal and X-ray;
- explicit continuing-instance versus Scene-placement commands; and
- per-scope viewport and disclosure state outside durable Show content.

The app overlay layer owns panel positioning, collision, and anchoring. React
rows render descriptors and dispatch commands; they do not decide placement
ownership, Transition authority, displacement, or continuation behavior.

The first production slice remains the improved global Timeline and works
without Scene-local composition. It can ship compact rows, collapsible library,
dedicated Transitions, anchored Entity Detail Panel, selection, snapping, and
precommit paste against the existing coarse Show model. The X-ray and
Scene-local hierarchy follow when the placement model is ready.

Prototype verification must render the same valid fixtures for both revised
proposals at desktop and narrow widths. Browser checks should include nearly
continuous occupancy, twelve zones, one-zone horizontal density, opened lanes,
panel collision at every edge, keyboard-only scope changes, and boundary spans
that consume most of a short Scene.

## Remaining disagreements and confidence

The design is highly confident about the compact row grammar, anchored Entity
Detail Panel, semantic color, owner-nested lanes, read-only Scene-local boundary
references, and explicit library collapse. Human feedback and the domain model
all point in the same direction.

The miniature Show navigator remains conditional. It should survive only if a
moving prototype proves faster than the scope bar and keyboard navigation.

The medium Scene X-ray is promising but still provisional. Its 32 pixels must
improve cross-Scene alignment in realistic Shows; otherwise the collapsed
complexity signal plus full Scene-local editor is the cleaner two-level model.

Paste displacement needs model validation. The UX should support an explicit
Insert proposal, but current Scene and cell invariants may make some footprints
impossible without a higher-level Scene insertion command. The proposal engine
must report that honestly rather than approximate it in React.

Boundary Transitions longer than a short Scene need a visual rule. The leading
candidate clips the visible span to the Scene while labeling the full duration
and continuing the reference at the opposite edge. A motion prototype should
test whether this reads better than compressing the entire Transition into the
available Scene width.

Whether the compile/status strip collapses remains a separate product decision.
It should not be conflated with property presentation.

# Comparison: Fable and Codex Show Timeline proposals

## Overall shape

The proposals independently converge on the same product architecture and
disagree sharply about the default property surface. That disagreement is
useful enough to preserve in the visual mocks rather than smoothing it into an
untestable compromise.

Both proposals keep the library, center authoring surface, and Stage fixed;
design the global Show Timeline first; open Scene-local time in place; disclose
automation lanes on demand; reuse one viewport and interaction grammar; and
require semantic transactions before structural multi-selection ships.

| Decision | Fable | Codex |
| --- | --- | --- |
| Default properties | Stable bottom dock with 32/280/420 px detents | 292 px modeless Quick Inspector anchored to selection |
| Primary clip row | 48 px cozy or 36 px compact | 30 px production base row |
| Subordinate lane | 22 px | 22 px |
| Global lane visibility | Per-zone disclosure with authored-data badges | Authored/selected disclosure with compact Scene complexity badges |
| Scene entry | Double-click/Enter/header dock action | Explicit Open Scene action; scope transfer preserves state |
| Global geometry | True time-to-pixel canvas replacing `fr` columns | Shared descriptor-driven time geometry using current viewport engine |
| Clip collision | Reject occupied destinations in the first version | Preview magnetic insertion and displacement before commit |
| Clipboard anchor | Explicit selected boundary or empty slot | Playhead/focused zone with a movable pre-commit ghost |

## Agreements

### One IDE frame, two Timeline scopes

The Stage remains the same physical preview surface. Scene-local editing swaps
the center Timeline's domain and lanes without moving the Stage, creating a
second preview, or changing the library. A compact scope bar and global Show
navigator preserve orientation.

### Density comes from disclosure and hierarchy

Neither proposal tries to solve lane proliferation only by shrinking text.
Primary Pattern rows summarize authored state with badges, while automation,
Effect, and keyframe lanes appear when authored, selected, or explicitly
expanded. Both use 22-pixel subordinate lanes, sticky labels, hairlines within
a group, and small intentional gaps between ownership groups.

### Global and local animation remain semantically honest

Global Property-animation lanes show per-Scene targets and boundary-owned ramps;
Scene-local lanes show true keyframe diamonds. The commonality lies in lane
anatomy, selection, easing vocabulary, and property grouping—not in pretending
the stored models are identical.

### Structural edits need a proposal state

Both designs require the drag to show source context, a moving ghost, snap or
insertion geometry, validity, and the exact result before commit. Multi-entity
operations become one semantic undo transaction with a human-readable name.

### The production component must become descriptor-driven

Both proposals identify `ShowEditor.tsx` as too monolithic for global/local
reuse. Pure viewport, lane geometry, selection, drop proposal, clipboard, and
transaction logic should sit outside React. Thin renderers consume shared lane
descriptors in each scope.

## Fable's distinct contributions

- Quantified the current lane explosion from `rowStride = 3 + controlLanes` and
  made per-zone disclosure the central density mechanism.
- Specified a stable-height bottom dock with explicit user-controlled detents,
  independent Timeline/dock scrolling, and horizontally ordered 236-pixel
  property groups.
- Produced a detailed rubric for global target blocks and boundary ramp wedges,
  preserving the current destination-target/boundary-ramp contract visibly.
- Proposed a richer 4:36 `Atrium Loop` fixture and a portal Transition with
  approximately twenty parameters, which stress-tests property capacity better
  than a simple placement.
- Defined focus-scoped keyboard behavior, typed selection sets, explicit paste
  anchors, auto-scroll during drag, and a thorough state checklist.
- Named center-pane breakpoints rather than window breakpoints and supplied a
  36-pixel compact clip-row mode.

## Codex's distinct contributions

- Kept the property surface physically close to the selected entity without
  paying a permanent horizontal or vertical tax.
- Defined one Inspector with anchored and pinned placements, stable transfer
  between selections, app-level collision handling, and no authored-row reflow.
- Pushed the base Timeline to a 30-pixel redline and separated invisible hit
  padding from visible lane height.
- Treated the Scene complexity badge as a global summary rather than a miniature
  Timeline, keeping the local scope progressively disclosed.
- Specified modeless multi-selection inspection, pointer-proximate property
  grouping, and a clear field-order rubric that omits irrelevant groups.
- Preserved magnetic insertion/displacement as a first-class preview state and
  used a movable paste ghost rather than requiring a preselected structural
  anchor.

## Real disagreements

### Default property surface

Fable rejects an anchored popover because it can cover neighboring lanes and
jump between selections. Its dock spends a fixed, user-chosen vertical budget
and handles long property definitions well. Codex rejects a permanent bottom
dock as the default because it separates the author's eye and pointer from the
selection and consumes Timeline height even for simple entities.

This should remain two mock families. The human review should measure selection
switching, a twenty-parameter Transition, rapid Timeline edits, and a tall
monitor rather than choose from screenshots alone.

### Primary row height

Fable's 48-pixel cozy row carries a Pattern name and permanent authored-state
badge line; 36 pixels is its compact mode. Codex uses a 30-pixel base row and
moves more state into selection/disclosure. The question is not cosmetic:
Fable favors scanability before selection, while Codex favors simultaneous lane
count. The mock should show identical content at actual scale.

### Collision and paste policy

Fable's first clip move rejects an occupied destination and makes paste require
an explicit structural anchor. Codex previews insertion/displacement and lets a
paste ghost begin at the playhead/focused lane. Fable is safer against surprising
mutation; Codex better matches the requested fluid editing loop. The engine
needs an explicit policy before either interaction becomes production truth.

### Scene entry gesture

Fable permits double-clicking a Scene header; Codex favors an explicit Open
Scene affordance so click/drag/toggle behavior stays unambiguous. Enter on a
focused Scene is common ground. Pointer behavior remains a small human decision.

## Rejected ideas shared by both

- A permanent right Inspector as the default creates an untenable fourth
  column beside the Stage.
- Always-expanded automation lanes do not scale with zones and controls.
- A separate Scene application or Stage weakens transfer learning.
- Recursive composition is outside the model.
- A detachable floating palette is a credible future option, not a dependency
  of the first release.
- Timeline viewport state must not enter authored undo history.

## Human review gates

1. Choose the default property surface after using both mocks: anchored Quick
   Inspector or stable bottom dock.
2. Choose the default primary row density after viewing the same busy Show at
   30, 36, and 48 pixels; the winning design may still expose a density setting.
3. Decide whether occupied drops and paste may preview displacement in the first
   release or must require an empty/explicit structural anchor.

The remaining differences can be resolved after those decisions without
changing the common architecture.

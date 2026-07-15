# Provisional final design: shared Show Timeline foundation

## Recommendation

Adopt the shared architecture now and preserve the property-surface disagreement
for hands-on review. The production global Show Timeline becomes the baseline;
Scene-local detail is the same Timeline engine in a bounded local time domain.
The Stage, transport, viewport, selection grammar, property vocabulary,
clipboard, snapping, and undo remain common.

The visual comparison should contain two complete and attributable families:

- **Fable:** per-zone disclosure, 48/36-pixel Pattern rows, and the stable bottom
  property dock with detents.
- **Codex:** 30-pixel Pattern rows and one anchored modeless Quick Inspector that
  can pin for sustained work.

Neither mock is implementation code. The review selects the property placement
and density before #457 is divided into production slices.

## Shared production foundation

### Frame and scope

The application keeps the library at left, authoring surface in the center, and
Stage at right. Global Show scope is independently complete. Opening one Scene
changes the time domain and available lane types in place, adds a compact scope
bar and non-editable global navigator, and restores the prior global viewport
on exit.

### Lane system

The Timeline uses true time-to-pixel geometry and shared lane descriptors.
Primary rows summarize Pattern identity and authored complexity. Global target
lanes, boundary ramps, Scene-local Effects, overlays, and keyframes appear by
authored state, selection, or explicit disclosure. Subordinate rows use the
same 22-pixel anatomy in both proposals.

### Entity language

Entity type is communicated through icon, shape, label, indentation, and
ownership—not color alone. Scene headers, Pattern clips, boundary Transitions,
Effects, Property-animation lanes, keyframes, overlays, and routing facts each
retain a distinct silhouette and accessible name.

### Editing grammar

Playhead dragging seeks; entity dragging mutates authored content; temporary
Hand dragging pans viewport state. Selection and multi-selection operate within
typed ownership rules. Structural drags and paste show a proposal before commit.
Each committed operation is one named undo transaction.

### Property rubric

Every property surface starts with identity and context, then orders Time,
Content/Source, Placement or family-specific values, Visual stack, Animation,
and Advanced/Cost. Simple entities omit irrelevant groups. Mixed multi-selection
values remain explicit. Both mock families use this content order even though
their containers differ.

## Decisions deliberately left open

### Anchored Inspector or bottom dock

The anchored Inspector optimizes proximity and workspace area; the bottom dock
optimizes stability and capacity. Both must be tested with a simple Pattern, a
multi-selection, and the full portal Transition definition. A hybrid is not the
default answer unless review shows a real workflow that needs both.

### Visible row density

Thirty pixels is the aggressive expert redline; thirty-six pixels retains a
compact second line; forty-eight pixels exposes the most state without
selection. Review should choose the default from identical fixtures. A later
density preference is possible, but the initial design still needs one
authoritative baseline.

### Drop policy

The visual grammar supports both reject-on-collision and previewed displacement.
The model must decide which content moves, which Transitions travel with a Scene,
and where pasted fragments anchor before implementation.

## Implementation implications

The first production slices should establish pure selection, viewport, lane
geometry, drop-proposal, fragment, and semantic-transaction modules. React then
renders the approved property container and shared Timeline descriptors. The
global editor ships before Scene persistence or compilation changes; Scene-local
mock data remains synthetic until #462 resolves the model seam.

## Review artifact

The interactive comparison at `?prototype=timeline-dual` shows four views from
one route:

1. Fable / global Show;
2. Fable / Scene local;
3. Codex / global Show; and
4. Codex / Scene local.

Model and scope controls must remain clearly outside the proposed product UI.
Each family keeps its own dimensions and property behavior so attribution and
tradeoffs remain visible.

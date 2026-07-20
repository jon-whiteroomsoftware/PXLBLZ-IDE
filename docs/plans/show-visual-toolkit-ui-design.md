# Show visual toolkit UI design

Status: approved production direction, 2026-07-14. The headless visual-toolkit
contract is complete and frozen at version 1. This document defines the
authoring model that projects that contract into the Show editor. The final
Timeline, palette, and Entity Detail Panel behavior is recorded in the
[production design](../collaboration/show-timeline-production-density-2026-07-14/final-production-design.md).
Expanded Property animation authoring remains deferred by product decision.

## Conclusion

The production UI combines a compact registry palette with one anchored Entity
Detail Panel. The palette answers what can be added. Entity Details show what
the selected clip or boundary currently owns. The Timeline shows when values
change. The existing Stage previews saved output and applied Effects;
Effect-palette hover never rebuilds it. Transition candidates may still use the
Stage because their two-source boundary behavior is otherwise difficult to
evaluate. The palette does not contain a second preview viewport.

This is not a fourth generic layer system. Four product concepts remain
separate:

- a **Property animation** moves one saved property target across an incoming
  scene boundary;
- an **Effect stack** changes one clip source through explicit evaluation
  stages;
- a **Transition** combines outgoing and incoming sources at one boundary; and
- a future **Scene composition** introduces local source placements, including
  overlays, inside one semantic Scene.

The existing Signal chain, Inspector rail, and Canvas desk prototype is design
history, not a production starting point. It uses synthetic state, hard-coded
families, and several unshipped choices. The review candidate replaces it with
one production direction backed by the real registry.

The first production slice is deliberately narrower than the frozen headless
contract. It authors static Effect stacks and boundary Transitions. Existing
boundary-ramp data and engine behavior remain supported, but this slice does
not add general Property-animation controls or Effect-parameter animation.

## Review candidate

In development, `?prototype=visual-toolkit` opens the review candidate without
requiring a saved Show. It demonstrates:

- a searchable catalogue containing all 63 shipped variants and presets;
- compatibility filtering against a 1D or 2D Stage;
- progressive Effect description, locally animated motion mnemonics, and explicit apply language;
- scene-versus-boundary inspector ownership;
- the Transform, Distort, Address, and Color & output signal path;
- Effect expansion, parameters, animation state, cost, and proposed bypass;
- structural Property animation language and the three-change stress case;
- Transition replacement on a boundary; and
- desktop and narrow-window layouts with keyboard-reachable controls.

The prototype is intentionally non-persistent. Its Stage and timeline content
are representative local state, not a compiled Show draft. Candidate previews
are representative tiles rather than captured fixture output. Drag reordering,
duplicate/remove, copy/paste, real undo, and direct manipulation are represented
by the layout but are not interaction-complete. Those omissions keep this
artifact focused on ownership, hierarchy, terminology, and the model gate; they
must not be mistaken for shipped behavior.

The first review result is already material: making three value changes visible
inside `Neon orchard` produces three structural scene segments. The prototype
makes the cost understandable, but it does not prove the result is acceptable.
Human review must decide whether those segments still behave like one authored
scene for naming, selection, reuse, and Transition ownership. If not, the next
work is a versioned property-event model, not production UI over the current
boundary-only contract.

## As-built contract

The UI inherits these completed constraints rather than reopening them:

- The registry contains 63 variants: five Property animation targets, twenty-three
  Effects, and thirty-five Transitions.
- Families, variants, ordinary editable presets, parameter constraints,
  conditional applicability, dimensional compatibility, easing, and cost policy
  are framework-independent descriptors.
- A clip owns a persisted ordered Effect list. A boundary owns one visual
  Transition and may also own a distinct routing marker.
- Property animation uses destination targets plus an incoming boundary ramp.
  It is not an arbitrary keyframe track.
- Effect parameters animate only when adjacent clips have the same stable
  Effect identities and kinds. Split preserves that structure; copying an
  Effect stack must preserve it deliberately.
- The compiler has fixed evaluation stages: affine transforms, distortions,
  address policy, one Pattern render, then color/output Effects. Authored order
  matters inside a stage, but moving an Effect across a compiler stage cannot
  change the actual evaluation order.
- The compiler owns factual cost and compatibility. UI labels summarize those
  facts; React does not recreate their formulas.

## Product definitions

### Catalogue

The catalogue is the complete set of available Property animation targets,
Effects, and Transitions. It is a temporary discovery surface, not a second
representation of applied state.

Browsing follows `kind -> family -> variant -> preset`:

1. Kind states what owns the behavior.
2. Family groups related visual structure.
3. Variant selects the implemented behavior.
4. Preset writes an editable starting parameter set.

Browse mode shows compatible choices by default. Search results may include an
incompatible choice disabled with a concrete reason, and a Show incompatible
toggle reveals the complete catalogue. The catalogue supports search, recent
choices, and favorites. These are presentation state, not persisted Show
semantics.

Each dense row needs a name, motion mnemonic, compatibility state, and simple
cost label. For Effects, hover or keyboard focus reveals the one-sentence
distinction and animates the row's schematic SVG mnemonic without changing
playback or compiling a candidate Show. Reduced-motion users retain the static
glyph. Selecting the row applies editable starting values in one durable
authoring transaction, after which the Stage renders the saved Effect. Boundary
Transitions may still compile an ephemeral Show draft because evaluating their
two-source behavior requires the boundary context; leaving or pressing Escape
restores the saved preview.

### Effect stack

The selected clip's inspector contains its applied Effects in visible compiler
stages:

1. **Transform** - Mirror, Translate, Rotate, Scale, and Shear;
2. **Distort** - Ripple, Swirl, Bulge / Pinch, Pixelate, and Kaleidoscope;
3. **Address** - Clip or Wrap policy; and
4. **Color & output** - Opacity, Brightness, Hue, Saturation, Contrast, Invert,
   Threshold, Posterize, and Color map.

The inspector may render these as one continuous stack, but stage separators
are structural. Reordering is allowed inside a stage. A cross-stage drag shows
the valid insertion region and snaps to it rather than implying an evaluation
order the compiler cannot produce.

Each collapsed Effect card shows its name, non-default summary, animation state,
compatibility warning, bypass state, and simple cost. An expanded card exposes
ordinary parameters, a preset starting point, animation controls, reset,
duplicate, copy, and remove. The stack can filter All, Edited, or Animated.

Persistent bypass is required: an author must be able to compare an Effect
without deleting its values or animation. Version 1 has no bypass field, so this
is a small explicit versioned follow-up to the frozen contract rather than a UI
fiction.

### Property animation

Property animation follows the structural Show model rather than importing an
arbitrary video keyframe model.

- The destination clip or scene owns the target value.
- Its incoming boundary owns an optional explicit start, duration, and easing.
- Without an explicit start, the ramp begins from the compatible previous
  target.
- Changing a value inside a scene first uses Split to create a boundary.
- Several properties may inherit the boundary's duration and easing; one
  property may override either value.

The inspector therefore uses **Animate on entry**, not an ambiguous auto-
keyframe mode. Enabling it reveals From, Duration, and Easing beside the target
property. The timeline reveals authored lanes on demand and draws target values
over scenes plus ramps across boundaries. It does not display fake freeform
keyframe diamonds.

An Effect parameter can animate across a boundary only when the incoming and
outgoing clips contain the same stable Effect id and kind. If they do not, the
UI offers Copy Effect stack to destination or explains why animation is
unavailable. It never silently pairs Effects by display name.

#### Decision: defer expanded Property animation authoring

The current engine can express one ramp per property at each scene boundary.
It is proven and deterministic, but it has not yet proven that complex visual
treatments remain understandable when every mid-scene direction change needs a
Split. A production UI built around this model would be wrong if real Shows
turn semantic scenes into dozens of automation-only fragments.

The stress prototype reproduces three successive changes inside one conceptual
scene and exposes the resulting structural fragments. On 2026-07-14, product
review accepted the recommendation to defer expanded Property animation rather
than normalize those fragments into the production workflow.

This decision does not remove the current boundary-ramp model or invalidate its
frozen tests. Existing Shows continue to persist, preview, compile, export, and
reload through it. The first production UI may display existing animation state
where needed for safety, but it does not create or substantially edit that state.
Future authoring work now begins with the one-level Scene composition direction
in [`show-scene-composition-design.md`](show-scene-composition-design.md). That
model keeps current boundary ramps as migration input while giving mid-Scene
keyframes a bounded local owner. Do not conceal the current gap with keyframe-
looking UI over boundary-only persistence.

### Transition

A Transition remains one selectable boundary entity. Its catalogue preview must
use both outgoing and incoming sources. The boundary inspector exposes family,
variant, preset, duration, easing, meaningful geometry, edge policy,
compatibility, and cost. A routing marker may coexist at the same boundary but
is selected and edited separately.

The common operation is direct manipulation of duration on the boundary.
Exact duration and all less-common parameters live in the inspector. Transition
stacking is not part of this design.

### Presentation descriptor

The runtime registry should remain frozen. Production discovery needs additional
facts that do not change rendered behavior: search keywords, category path,
short description, compact summary, preferred preview fixture, parameter groups,
and optional Stage-handle capability.

Add a framework-independent presentation registry keyed by the stable runtime
family and variant ids. Validation must reject missing and unknown ids, but this
registry remains outside the version-1 runtime fingerprint. React consumes the
joined view and contains no family switch statements.

The first direct-manipulation capabilities are Translate, Rotate, Scale,
Transition direction, center, and anchor. Distortion centers and radii can
follow only if the prototype shows that Stage handles are clearer than numeric
controls.

## Selection, reuse, and recovery

The first production visual-toolkit slice may author one selected clip or
boundary, but its commands must be defined as transactions so later set-valued
selection can reuse them.

### Reuse

The first reuse model is an independent snapshot:

- Duplicate Effect copies one Effect with a new id on the same clip.
- Copy/Paste Effect preserves parameters and animation only when the destination
  has a compatible boundary context.
- Paste Attributes can later copy a complete stack, selected Effects, or
  Property animations to compatible selected clips.
- Presets remain editable starting values, not linked instances.

Named linked Looks and reusable choreography motifs are deferred. The internal
fragment format should be versioned so later linked objects do not require
pretending that existing snapshots were references.

### Recovery

Every add, apply preset, parameter gesture, reorder, bypass, duplicate, remove,
paste, or batch operation is one semantic Show transaction. Range drags may
preview continuously, but persistence records the final value as one action.

Before batch authoring or structural drag ships, the Show store needs per-Show
session undo/redo over normalized Show snapshots. A failed optimistic write
restores the pre-transaction state and reports the persistence error. History
is editor-session state, not another durable copy of the workspace.

## Layout

### Desktop

The existing Show workspace remains recognizable:

- Stage preview above or beside the timeline;
- timeline as the primary temporal surface;
- one anchored Entity Detail Panel for the selected clip or boundary; and
- a compact modeless registry palette launched by Add Effect or Change
  Transition.

Entity Details remain visible while the palette previews choices. Selecting a
palette row returns focus to the new Effect row or boundary control.
Spatial direct manipulation appears in the Stage only while its owning
parameter or Effect is selected.

The revised Show Timeline does not replace this catalogue model. Selecting a
placement's `Add Effect` or a boundary's `Replace Transition` opens the same
temporary application-overlay catalogue, anchored conceptually to the active
Entity Detail Panel but free to use the center workspace. The catalogue keeps a
compact selected-owner header so the author never loses which placement or
boundary will change. Applying a tile closes the catalogue and transfers focus
to the new Effect card or Transition controls in the anchored panel.

High-cardinality families must not flatten into a select element. Browse follows
kind, family, variant, then preset: Wipe remains one family; Linear, Split, Barn
doors, Blinds, Clock, Checker, and Grid are variants; direction choices are
editable Linear presets. Shape Reveal likewise presents one family with visual
shape variants rather than fourteen unrelated top-level commands.

Catalogue density follows the Show-editor legibility baseline. Persistent tile
names, family labels, compatibility reasons, and parameter summaries remain
readable at ordinary monitor distance. Eight-pixel dark-gray-on-black copy is
not acceptable for information the author must compare; compactness comes from
tight line-height, small gaps, and progressive detail.

### Narrow layout

The Timeline remains visible. The palette may widen or flip to remain reachable,
but it keeps toolbar-like density and a compact selected-owner header rather
than becoming a full-screen gallery. The Stage may reduce in height but should
not disappear during visual preview. Drag reordering gains Move earlier/Move
later commands and does not depend on touch precision.

## Cost and compatibility

The default cost vocabulary is behavioral:

- **Parameter only** - once-per-frame property work;
- **One source** - one Pattern evaluation per output pixel;
- **Edge blend** - a second source only near the active edge; and
- **Two sources** - both Patterns across the active Transition.

The advanced disclosure shows the compiled expression (`N`, `N + E`, `2N`, or
`S * N`), substituted pixel count when available, generated bytes and budget
ratio, scalar/array allocation, Effect operation counts, coverage, and
compatibility warnings. The applied stack also shows aggregate compiled cost;
several individually cheap Effects can still be the expensive choice.

## Stress-case prototype

The next prototype uses the real registry and a seeded Show with:

- three zones and five scenes;
- one clip with Effects in all four evaluation stages;
- three animated Effect parameters;
- a boundary Motion Transition;
- one incompatible 2D-only candidate under a 1D Stage;
- Content Shrink and Shape Shrink available together; and
- enough timeline density to force scrolling and narrow-layout decisions.

The prototype must support these tasks:

1. Find and preview an Effect, then add it.
2. Reorder within a stage and attempt a cross-stage move.
3. Bypass, restore, duplicate, and remove an Effect.
4. Animate one Effect parameter on entry and locate its timeline ramp.
5. Build a three-change Effect animation and judge whether the required scene
   splits preserve the author's scene model.
6. Change a Transition and distinguish Content Shrink from Shape Shrink before
   applying either.
7. Explain the aggregate cost and one incompatibility.
8. Copy the treatment to another clip and correctly predict whether later edits
   propagate.

Human review records task completion, mistaken selections, incorrect ownership
predictions, and any point where the author loses the selected clip, boundary,
or preview context.

## Delivery sequence

1. Build and validate the presentation registry plus the stress-case prototype.
2. Add persistent Effect bypass and refreeze the intentionally changed contract.
3. Add semantic Show transactions and session undo/redo.
4. Ship single-clip Effect catalogue and staged stack authoring.
5. Ship the visual Transition catalogue and boundary inspector.
6. Finish narrow layout, keyboard, accessibility, cost, compatibility, and
   authoring-to-export Playwright coverage.
7. Build the example Shows and user guide through the finished UI.

Multi-selection, Paste Attributes, grouped movement, and general clipboard
editing are a later interaction-efficiency increment, not a release gate for the
single-owner production editor.

Expanded Property animation and overlay placement are later consumers of one
Scene composition model, not separate bolt-ons. Their schema and UI remain
deferred until the compiler-migration and Scene-detail evidence described in
[`show-scene-composition-design.md`](show-scene-composition-design.md) passes
review.

## Evidence and authority

- [`show-editor-interaction-research-draft.md`](show-editor-interaction-research-draft.md)
  contains the comparative editor research and rejected alternatives.
- [`pxlblz-v2-prd.md`](pxlblz-v2-prd.md) owns the wider product contract and
  delivery order.
- [`show-scene-composition-design.md`](show-scene-composition-design.md) owns the
  exploratory one-level Scene detail destination and its unresolved evidence.
- [`issue-459-headless-freeze.md`](issue-459-headless-freeze.md) owns the frozen
  runtime evidence.
- [`../reference/PXLBLZ Technical Reference.md`](../reference/PXLBLZ%20Technical%20Reference.md)
  owns as-built engine behavior.
- GitHub #457 owns the parent executable UI state; its thin child issues own
  implementation after the 2026-07-14 human approval.

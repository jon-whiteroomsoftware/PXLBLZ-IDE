# Shared Brief: Show Timeline production-density design

## Objective

Design a production-ready interaction and visual system for the PXLBLZ Show
Timeline in global Show scope and future Scene-local scope. The result should let
an experienced author understand and manipulate dense timing, selection,
properties, transitions, Effects, and preview state efficiently without making
the two scopes feel like different applications.

The deliverable is a concrete redline and mock specification, not a spacious
concept sketch. It should use realistic dimensions, content, controls, overflow,
and representative complexity.

## Source task

- Primary task: `docs/plans/archive/show-timeline-dual-model-task.md`
- Domain language: `CONTEXT.md`
- Current user-visible behavior: `docs/reference/PXLBLZ Feature Guide.md`
- Current technical behavior: `docs/reference/PXLBLZ Technical Reference.md`
- Comparative interaction evidence:
  `docs/plans/archive/show-editor-interaction-research-draft.md`
- Related implementation issues: #457, #458, #462, #463, and #464

## Existing constraints

- Preserve the application shell: global library at left, active authoring
  surface in the center, and the existing Stage at right.
- Preserve one Stage representation across Pattern, Show, and Scene work. Its
  content and zones may change; its physical output layout does not become a
  separate Scene-specific preview.
- The global Show editor must ship and remain complete without Scene
  composition. Scene-local editing is a later additive scope.
- Both scopes must share transport, playhead, selection, snapping, zoom,
  clipboard, undo, property vocabulary, Stage behavior, and keyboard grammar.
- PXLBLZ is a specialist IDE. Optimize for repeated expert use while retaining
  understandable hierarchy and discoverable commands.
- Horizontal and vertical Timeline space are both scarce. Whitespace should
  communicate grouping; decorative or redundant padding should not consume the
  working area.
- Opening or closing selected-entity properties must not unpredictably move
  authored Timeline rows.
- Use realistic entity and control counts rather than assuming every selection
  has only two or three properties.
- Support desktop and narrow application windows, keyboard and pointer use,
  accessible names and focus, coherent scrolling, and overflow recovery.
- Keep Scene composition one level deep. Do not introduce recursive
  compositions, persistence changes, compiler changes, native windows, or a
  second browser window.

## Relevant repository context

- `src/components/ShowEditor.tsx` contains the current production Show
  workspace, Timeline, transport, selection state, property panels, and Stage
  integration. Inspect its real information and behavior; do not assume its
  current visual hierarchy is the answer.
- `src/engine/showTimelineViewport.ts` owns current viewport geometry, visible
  range, scroll/zoom calculations, and drag-thumb behavior.
- `src/components/ShowPreview.tsx` and the preview stores show how the existing
  Stage and transport state connect to Show playback.
- `src/engine/showModel.ts` defines current global Show entities and ownership.
- The primary task names the representative dense workflows and exact
  non-goals.

## Deliverable expectations

Each independent proposal should cover:

- a realistic global Show Timeline redline using Pattern clips, Scenes, zones,
  Transitions, and a nontrivial selected entity;
- the same system in Scene-local scope with rapid cuts, an overlay, Effects,
  Property-animation keyframes, three zones, and an outgoing Transition;
- how selection, property inspection, multi-selection, insertion, displacement,
  scrubbing, panning, zooming, copy/paste, and undo appear and behave;
- a learnable property-layout rubric that scales from simple to complicated
  entities;
- important default, selected, open, dragging, drop-target, mixed-value,
  overflow, and narrow-window states;
- realistic typography, row heights, hit targets, pane dimensions, and
  progressive disclosure;
- accessibility and responsive behavior; and
- implementation implications, risks, and alternatives considered.

Include ASCII wireframes or similarly concrete spatial specifications detailed
enough for a separate implementer to reproduce the proposal faithfully as an
interactive mock.

## Open questions

- What default property presentation best balances proximity, stability, and
  capacity across different entity types?
- Which information belongs permanently in a compact Timeline row, and which
  appears only with selection or expanded detail?
- How should the design preserve orientation while changing between global Show
  time and Scene-local time?
- What density remains legible at common laptop widths and at a narrow app
  window?
- Which viewport-navigation and transport shortcuts can coexist without
  ambiguous pointer or keyboard behavior?
- Which parts of the property rubric should remain identical across entity types
  and which should adapt to their content?

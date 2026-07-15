# Show Timeline production-density design task

## Objective

Design the production interaction and visual system for the PXLBLZ Show
Timeline in two related scopes: the global Show Timeline, where Pattern clips
occupy Scenes and zones, and the future Scene-local Timeline, where an author
can edit rapid cuts, overlays, Effects, and Property-animation keyframes. The
global editor is the independently shippable product. Scene-local editing must
feel additive rather than like another application.

This task asks for an actual redline rather than a spacious concept wireframe.
The result must demonstrate realistic information density, typography, lane
height, hit areas, property controls, scrolling, and overflow in the existing
IDE shell.

## Product constraints

- PXLBLZ is a specialist IDE used for sustained editing. It can require learning
  when the resulting interaction is faster and more predictable.
- The application keeps a global library at left, the active authoring surface
  in the center, and the Stage at right. The Stage represents the same physical
  pixel layout across Pattern, Show, and Scene work; its rendered content and
  zones may change, but Scene editing does not invent another preview surface.
- The global Show Timeline is designed and shipped first. Scene-local editing
  reuses its transport, playhead, selection, snapping, zoom, clipboard, undo,
  property vocabulary, Stage, and keyboard grammar.
- Timeline space is scarce in both axes. Whitespace must clarify hierarchy and
  grouping, while padding that carries no information should be removed.
- Dense does not mean tiny or dim. The production redline must use legible
  information-bearing microcopy, avoid the darkest gray text on black, and
  recover space through line-height, padding, abbreviation, and disclosure
  before reducing font size. Eight-pixel type is not a default UI size.
- The interface must keep Timeline content, selected-entity properties, and the
  Stage understandable during ordinary editing. The design may use overlays,
  docks, disclosure, or focus modes, but must define their costs and transitions.
- Property layouts need a learnable rubric across Scenes, Pattern clips,
  Transitions, Effects, Property animation, keyframes, overlays, and
  multi-selection. Different entities may require different control counts.
- Opening or closing property UI must not unpredictably move authored Timeline
  content.
- The main editor remains fully useful without Scene composition. The latter is
  a later additive release and stays one level deep.

## Required workflows

The design must make the following operations legible and efficient:

1. Scrub, play, pause, zoom, and pan a dense Timeline without changing authored
   content accidentally.
2. Select one entity, change selection, inspect its current values, and edit its
   common and advanced properties.
3. Box-select or additively select several entities, move them magnetically,
   copy/paste them, and understand insertion or displacement before committing.
4. Distinguish Scene boundaries, Pattern clips, zones, Transitions, Effects,
   Property-animation lanes, keyframes, and overlays without relying only on
   color, while using restrained semantic color to bind the same class or
   entity across the Timeline, catalogue, Entity Detail Panel, and Stage.
5. Work with four rapid cuts inside 250 ms, several zones, an overlay, animated
   opacity, multiple Effects, and an outgoing Transition.
6. Move between global Show time and Scene-local time without losing orientation
   or learning another editing grammar.
7. Use desktop and narrow windows with coherent scrolling, reachable controls,
   and readable smallest-size labels at ordinary monitor distance.
8. Select a boundary or placement, open the visual catalogue, find and preview
   one of many related Transition or Effect variants, apply it, and return to
   the same anchored editing context.
9. Read several stacked property curves in very little vertical space, select
   one for exact numeric time/value/easing edits, and distinguish a compact
   read-only summary from an expanded direct-manipulation curve editor.

## Non-goals

- Do not implement persistence, compiler changes, or Scene composition.
- Do not redesign the Pattern code editor, library information architecture, or
  Stage rendering model.
- Do not use a native window or separate browser window for property editing.
- Do not make recursive nested composition part of the model.
- Do not assume a detachable floating palette is required; it remains a future
  option tracked by #464.

## Evidence and repository context

- `AGENTS.md` defines the repository workflow and UI verification expectations.
- `CONTEXT.md` defines Show, Scene, Pattern, Effect, Transition, routing, and
  Property-animation vocabulary.
- `docs/reference/PXLBLZ Feature Guide.md` describes current user-visible
  behavior.
- `docs/reference/PXLBLZ Technical Reference.md` describes the current Show
  architecture and preview pipeline.
- `src/components/ShowEditor.tsx` contains the production Show workspace,
  Timeline, transport, selection, inspectors, and Stage integration.
- `src/engine/showTimelineViewport.ts` contains current Timeline viewport and
  drag-thumb geometry.
- `docs/plans/show-editor-interaction-research-draft.md` contains comparative
  interaction research.

## Deliverable

Produce a concrete design proposal and visual mock family for both scopes. Show
the same representative Show in global and Scene-local views, integrate the
registry-backed visual catalogue with the Timeline and Entity Detail Panel,
demonstrate the legibility baseline at actual density, explain the shared
grammar, and identify the few interactions that need human judgment before
production implementation.

import type { ShowClipTransform, ShowClipViewport } from './personalContentRecords'
import {
  resolveLinearNumberPresentation,
  type ResolvedLinearNumberPresentation,
} from './linearNumberPresentation'
import { normalizeShowClipTransform } from './showClipTransform'
import { DEFAULT_SHOW_CLIP_VIEWPORT, normalizeShowClipViewport } from './showClipViewport'

// Geometry and gesture rules for the Clip placement pad (#617).
//
// The two rectangles a Clip owns are stored differently, and that asymmetry
// drives every rule here:
//
//   content  - centre at (0.5 + positionX, 0.5 + positionY), extent
//              (scaleX, scaleY), rotation about its own centre. `centered()`
//              in showEffects.ts applies scale and rotation about the Zone
//              centre with translate last, so the box is exactly that.
//   viewport - min corner (x, y) plus extent (width, height), axis-aligned.
//              showClipViewport.ts compares coordinates with no rotation term.
//
// So the corner-anchored viewport gets cell sweeping and grid snapping, and the
// centre-anchored content gets position, zoom and fit. Neither borrows the
// other's idiom.

export interface PlacementRect {
  left: number
  top: number
  width: number
  height: number
}

export type PlacementCorner = 'nw' | 'ne' | 'sw' | 'se'
export type PlacementFocus = 'content' | 'aperture'

export interface PlacementPadContext {
  transform: ShowClipTransform
  viewport: ShowClipViewport
  /** 0 is free. Otherwise the divisor: 2 up, 3 up, 4 up. */
  grid: number
}

/** Only the parts a gesture actually changed. */
export interface PlacementPadResult {
  transform?: ShowClipTransform
  viewport?: ShowClipViewport
}

export const PLACEMENT_ZONE_RECT: Readonly<PlacementRect> = Object.freeze({ left: 0, top: 0, width: 1, height: 1 })

export const PLACEMENT_GRID_DIVISORS: readonly number[] = Object.freeze([0, 2, 3, 4, 6, 10, 12])

/** How close an edge must come before it sticks, in Zone units. */
export const PLACEMENT_EDGE_DETENT = 0.025

/** Upright is the value authors return to most, so it gets a detent. */
export const PLACEMENT_ROTATION_DETENT_TURNS = 4 / 360

const MIN_SCALE = 0.01
const MAX_SCALE = 8
const MIN_OFFSET = -4
const MAX_OFFSET = 4

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The content's axis-aligned extent before rotation, in Zone coordinates. */
export function contentRectFromTransform(transform: ShowClipTransform): PlacementRect {
  const safe = normalizeShowClipTransform(transform)
  return {
    left: 0.5 + safe.positionX - safe.scaleX / 2,
    top: 0.5 + safe.positionY - safe.scaleY / 2,
    width: safe.scaleX,
    height: safe.scaleY,
  }
}

/** Inverse of `contentRectFromTransform`: an edge-valued rect back into storage. */
export function transformFromContentRect(rect: PlacementRect, rotation: number): ShowClipTransform {
  return normalizeShowClipTransform({
    positionX: rect.left + rect.width / 2 - 0.5,
    positionY: rect.top + rect.height / 2 - 0.5,
    scaleX: rect.width,
    scaleY: rect.height,
    rotation,
  })
}

export function viewportRect(viewport: ShowClipViewport): PlacementRect {
  const safe = normalizeShowClipViewport(viewport)
  return { left: safe.x, top: safe.y, width: safe.width, height: safe.height }
}

function viewportFromRect(rect: PlacementRect, enabled: boolean): ShowClipViewport {
  return normalizeShowClipViewport({ enabled, x: rect.left, y: rect.top, width: rect.width, height: rect.height })
}

/** Whichever rectangle the content is composed against. */
export function placementTargetRect(context: PlacementPadContext): PlacementRect {
  return context.viewport.enabled ? viewportRect(context.viewport) : { ...PLACEMENT_ZONE_RECT }
}

export function snapPlacementValue(value: number, grid: number): number {
  return grid > 0 ? Math.round(value * grid) / grid : value
}

/**
 * Snaps a rect by its edges, never its centre. A centre-quantised box of odd
 * cell width lands off-lattice; quantising edges keeps every snapped box on
 * exact cell boundaries, which is the whole reason the grid is worth having.
 */
export function snapPlacementRect(rect: PlacementRect, grid: number): PlacementRect {
  if (grid <= 0) return rect
  const cell = 1 / grid
  const left = snapPlacementValue(rect.left, grid)
  const top = snapPlacementValue(rect.top, grid)
  const right = snapPlacementValue(rect.left + rect.width, grid)
  const bottom = snapPlacementValue(rect.top + rect.height, grid)
  return {
    left,
    top,
    width: Math.max(cell, right - left),
    height: Math.max(cell, bottom - top),
  }
}

/**
 * Grid snapping for a move. The nearer edge lands on the lattice and the
 * opposite edge follows by translation, preserving the authored extent.
 */
function snapPlacementTranslate(rect: PlacementRect, grid: number): PlacementRect {
  if (grid <= 0) return rect
  const offset = (low: number, high: number) => {
    const lowOffset = snapPlacementValue(low, grid) - low
    const highOffset = snapPlacementValue(high, grid) - high
    return Math.abs(lowOffset) <= Math.abs(highOffset) ? lowOffset : highOffset
  }
  return {
    ...rect,
    left: rect.left + offset(rect.left, rect.left + rect.width),
    top: rect.top + offset(rect.top, rect.top + rect.height),
  }
}

/**
 * Same-side edge magnets against several targets at once, nearest wins. Runs
 * after the lattice so an exact match with the other rectangle can win it: the
 * tolerance is far below any cell, so a cell sweep only gives way when the
 * pointer is already on a target edge.
 */
export function stickPlacementRect(
  rect: PlacementRect,
  targets: readonly PlacementRect[],
  tolerance = PLACEMENT_EDGE_DETENT,
): PlacementRect {
  const stick = (value: number, edges: number[]) => {
    let best = value
    let bestGap = tolerance
    for (const edge of edges) {
      const gap = Math.abs(value - edge)
      if (gap <= bestGap) {
        best = edge
        bestGap = gap
      }
    }
    return best
  }
  const left = stick(rect.left, targets.map((target) => target.left))
  const top = stick(rect.top, targets.map((target) => target.top))
  const right = stick(rect.left + rect.width, targets.map((target) => target.left + target.width))
  const bottom = stick(rect.top + rect.height, targets.map((target) => target.top + target.height))
  return {
    left,
    top,
    width: Math.max(MIN_SCALE, right - left),
    height: Math.max(MIN_SCALE, bottom - top),
  }
}

/**
 * Edge magnets for a move: the rect translates onto a matching edge and is
 * never resized. Sticking edges independently during a move would silently
 * change the size, which is not what a move means.
 */
export function stickPlacementTranslate(
  rect: PlacementRect,
  targets: readonly PlacementRect[],
  tolerance = PLACEMENT_EDGE_DETENT,
): PlacementRect {
  const offset = (low: number, high: number, lows: number[], highs: number[]) => {
    let best = 0
    let bestGap = tolerance
    for (const edge of lows) {
      const gap = Math.abs(low - edge)
      if (gap <= bestGap) { bestGap = gap; best = edge - low }
    }
    for (const edge of highs) {
      const gap = Math.abs(high - edge)
      if (gap <= bestGap) { bestGap = gap; best = edge - high }
    }
    return best
  }
  const lefts = targets.map((target) => target.left)
  const rights = targets.map((target) => target.left + target.width)
  const tops = targets.map((target) => target.top)
  const bottoms = targets.map((target) => target.top + target.height)
  return {
    ...rect,
    left: rect.left + offset(rect.left, rect.left + rect.width, lefts, rights),
    top: rect.top + offset(rect.top, rect.top + rect.height, tops, bottoms),
  }
}

/**
 * Dragging stops once a rect is entirely clear of the Zone. Further than that
 * is never useful to aim at by hand, and the numeric fields remain the way to
 * author an extreme offset deliberately.
 */
export function clampPlacementRectToZone(rect: PlacementRect, grid: number): PlacementRect {
  const limit = (value: number, min: number, max: number) => {
    const held = clamp(value, min, max)
    if (grid <= 0) return held
    const onLattice = Math.round(held * grid) / grid
    if (onLattice < min) return Math.ceil(min * grid) / grid
    if (onLattice > max) return Math.floor(max * grid) / grid
    return onLattice
  }
  return {
    ...rect,
    left: limit(rect.left, -rect.width, PLACEMENT_ZONE_RECT.width),
    top: limit(rect.top, -rect.height, PLACEMENT_ZONE_RECT.height),
  }
}

/** Wrapping first means a hair under a full turn snaps upright like a hair over. */
export function detentPlacementRotation(turns: number, threshold = PLACEMENT_ROTATION_DETENT_TURNS): number {
  const wrapped = ((turns + 0.5) % 1 + 1) % 1 - 0.5
  return Math.abs(wrapped) <= threshold ? 0 : turns
}

/**
 * The corner held still for a resize. Captured once at pointer down: deriving
 * it per move from the live rect makes the anchor chase the dragged corner and
 * the box runs away.
 */
export function placementCornerAnchor(rect: PlacementRect, corner: PlacementCorner): { x: number; y: number } {
  return {
    x: corner === 'nw' || corner === 'sw' ? rect.left + rect.width : rect.left,
    y: corner === 'nw' || corner === 'ne' ? rect.top + rect.height : rect.top,
  }
}

function contentMagnets(context: PlacementPadContext): PlacementRect[] {
  return context.viewport.enabled
    ? [viewportRect(context.viewport), { ...PLACEMENT_ZONE_RECT }]
    : [{ ...PLACEMENT_ZONE_RECT }]
}

/** With a viewport present it owns the composition, so content stops snapping. */
function placeContentRect(context: PlacementPadContext, rect: PlacementRect, translating: boolean): PlacementRect {
  const aligned = context.viewport.enabled
    ? translating
      ? stickPlacementTranslate(rect, contentMagnets(context))
      : stickPlacementRect(rect, contentMagnets(context))
    : translating
      ? snapPlacementTranslate(rect, context.grid)
      : snapPlacementRect(rect, context.grid)
  return clampPlacementRectToZone(aligned, context.viewport.enabled || translating ? 0 : context.grid)
}

export function moveContentCentre(context: PlacementPadContext, centreX: number, centreY: number): PlacementPadResult {
  const rect = contentRectFromTransform(context.transform)
  const moved = { ...rect, left: centreX - rect.width / 2, top: centreY - rect.height / 2 }
  return { transform: transformFromContentRect(placeContentRect(context, moved, true), context.transform.rotation) }
}

export function resizeContentToAnchor(
  context: PlacementPadContext,
  anchor: { x: number; y: number },
  pointerX: number,
  pointerY: number,
  options: { uniform?: boolean } = {},
): PlacementPadResult {
  let width = Math.abs(pointerX - anchor.x)
  let height = Math.abs(pointerY - anchor.y)
  if (options.uniform) {
    const side = Math.max(width, height)
    width = side
    height = side
  }
  width = Math.max(MIN_SCALE, width)
  height = Math.max(MIN_SCALE, height)
  const next: PlacementRect = {
    left: pointerX < anchor.x ? anchor.x - width : anchor.x,
    top: pointerY < anchor.y ? anchor.y - height : anchor.y,
    width,
    height,
  }
  return { transform: transformFromContentRect(placeContentRect(context, next, false), context.transform.rotation) }
}

/** Uniform zoom about the content's own centre. */
export function zoomContent(context: PlacementPadContext, scale: number): PlacementPadResult {
  const safe = clamp(scale, MIN_SCALE, MAX_SCALE)
  return { transform: normalizeShowClipTransform({ ...context.transform, scaleX: safe, scaleY: safe }) }
}

export function rotateContent(context: PlacementPadContext, turns: number): PlacementPadResult {
  return { transform: normalizeShowClipTransform({ ...context.transform, rotation: detentPlacementRotation(turns) }) }
}

export function nudgeContent(context: PlacementPadContext, dx: number, dy: number): PlacementPadResult {
  const rect = contentRectFromTransform(context.transform)
  const moved = clampPlacementRectToZone({ ...rect, left: rect.left + dx, top: rect.top + dy }, 0)
  return { transform: transformFromContentRect(moved, context.transform.rotation) }
}

/** Keyboard nudges are exact edits, so they bypass pointer magnets and the grid. */
export function nudgeViewport(context: PlacementPadContext, dx: number, dy: number): PlacementPadResult {
  const rect = viewportRect(context.viewport)
  const moved = clampPlacementRectToZone({ ...rect, left: rect.left + dx, top: rect.top + dy }, 0)
  return { viewport: viewportFromRect(moved, true) }
}

export type PlacementFit = 'fill' | 'fit' | 'stretch' | 'reset'

/**
 * Fit and fill compute on the unrotated box; rotation applies afterwards.
 * Content's natural size is the whole Zone, so a scale of 1 already covers a
 * 1x1 target and every mode is a ratio against the target's extent.
 */
export function applyContentFit(context: PlacementPadContext, fit: PlacementFit): PlacementPadResult {
  if (fit === 'reset') {
    return {
      transform: normalizeShowClipTransform({
        positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: context.transform.rotation,
      }),
    }
  }
  const target = placementTargetRect(context)
  const scaleX = fit === 'stretch'
    ? target.width
    : fit === 'fill' ? Math.max(target.width, target.height) : Math.min(target.width, target.height)
  const scaleY = fit === 'stretch' ? target.height : scaleX
  return {
    transform: transformFromContentRect({
      left: target.left + target.width / 2 - scaleX / 2,
      top: target.top + target.height / 2 - scaleY / 2,
      width: scaleX,
      height: scaleY,
    }, context.transform.rotation),
  }
}

/** Nine-point placement of the content box inside the target rect. */
export function anchorContent(context: PlacementPadContext, column: 0 | 1 | 2, row: 0 | 1 | 2): PlacementPadResult {
  const target = placementTargetRect(context)
  const rect = contentRectFromTransform(context.transform)
  return {
    transform: transformFromContentRect({
      ...rect,
      left: [target.left, target.left + (target.width - rect.width) / 2, target.left + target.width - rect.width][column],
      top: [target.top, target.top + (target.height - rect.height) / 2, target.top + target.height - rect.height][row],
    }, context.transform.rotation),
  }
}

export function setViewportRect(
  context: PlacementPadContext,
  rect: PlacementRect,
  options: { carryContent?: boolean; translate?: boolean; snap?: boolean } = {},
): PlacementPadResult {
  const snapping = options.snap !== false
  const translating = options.translate === true
  const snapped = snapping
    ? translating
      ? snapPlacementTranslate(rect, context.grid)
      : snapPlacementRect(rect, context.grid)
    : rect
  const targets = [contentRectFromTransform(context.transform), { ...PLACEMENT_ZONE_RECT }]
  const stuck = translating
    ? stickPlacementTranslate(snapped, targets)
    : stickPlacementRect(snapped, targets)
  const held = clampPlacementRectToZone(stuck, snapping && !translating ? context.grid : 0)
  const viewport = viewportFromRect(held, true)
  if (!options.carryContent) return { viewport }
  const dx = viewport.x - context.viewport.x
  const dy = viewport.y - context.viewport.y
  return {
    viewport,
    transform: normalizeShowClipTransform({
      ...context.transform,
      positionX: clamp(context.transform.positionX + dx, MIN_OFFSET, MAX_OFFSET),
      positionY: clamp(context.transform.positionY + dy, MIN_OFFSET, MAX_OFFSET),
    }),
  }
}

export function moveViewportTo(
  context: PlacementPadContext,
  left: number,
  top: number,
  options: { carryContent?: boolean } = {},
): PlacementPadResult {
  const rect = viewportRect(context.viewport)
  return setViewportRect(context, { left, top, width: rect.width, height: rect.height }, { ...options, translate: true })
}

export function resizeViewportToAnchor(
  context: PlacementPadContext,
  anchor: { x: number; y: number },
  pointerX: number,
  pointerY: number,
): PlacementPadResult {
  return setViewportRect(context, {
    left: Math.min(pointerX, anchor.x),
    top: Math.min(pointerY, anchor.y),
    width: Math.max(MIN_SCALE, Math.abs(pointerX - anchor.x)),
    height: Math.max(MIN_SCALE, Math.abs(pointerY - anchor.y)),
  })
}

/** Cell sweep: two points anywhere become an inclusive cell span. */
export function sweepViewport(
  context: PlacementPadContext,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): PlacementPadResult {
  if (context.grid <= 0) {
    return setViewportRect(context, {
      left: Math.min(ax, bx),
      top: Math.min(ay, by),
      width: Math.max(MIN_SCALE, Math.abs(bx - ax)),
      height: Math.max(MIN_SCALE, Math.abs(by - ay)),
    })
  }
  const cell = 1 / context.grid
  const columns = [Math.floor(ax * context.grid), Math.floor(bx * context.grid)]
  const rows = [Math.floor(ay * context.grid), Math.floor(by * context.grid)]
  return setViewportRect(context, {
    left: Math.min(...columns) * cell,
    top: Math.min(...rows) * cell,
    width: (Math.max(...columns) - Math.min(...columns) + 1) * cell,
    height: (Math.max(...rows) - Math.min(...rows) + 1) * cell,
  })
}

/** Where the content can actually be seen: its bounds, cropped to the Zone. */
export function visibleContentRect(transform: ShowClipTransform): PlacementRect | null {
  const rect = contentRectFromTransform(transform)
  const left = Math.max(rect.left, PLACEMENT_ZONE_RECT.left)
  const top = Math.max(rect.top, PLACEMENT_ZONE_RECT.top)
  const right = Math.min(rect.left + rect.width, PLACEMENT_ZONE_RECT.width)
  const bottom = Math.min(rect.top + rect.height, PLACEMENT_ZONE_RECT.height)
  if (right - left < MIN_SCALE || bottom - top < MIN_SCALE) return null
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * Turning the viewport on hands it the compositional job, so defaulting it to
 * the whole Zone reads as the Clip suddenly growing. It opens on what the Clip
 * already covers instead: visually identical to the moment before, and it
 * rewrites nothing on the content, so placement property lanes are unaffected.
 * An authored rectangle is preserved by showClipViewport and comes back as-is.
 */
export function enableViewportForContent(context: PlacementPadContext): ShowClipViewport {
  const authored = normalizeShowClipViewport(context.viewport)
  const untouched = authored.x === DEFAULT_SHOW_CLIP_VIEWPORT.x
    && authored.y === DEFAULT_SHOW_CLIP_VIEWPORT.y
    && authored.width === DEFAULT_SHOW_CLIP_VIEWPORT.width
    && authored.height === DEFAULT_SHOW_CLIP_VIEWPORT.height
  if (!untouched) return { ...authored, enabled: true }
  const visible = visibleContentRect(context.transform) ?? { ...PLACEMENT_ZONE_RECT }
  return viewportFromRect(visible, true)
}

/**
 * Adopts the content's current bounds as the viewport, leaving content alone.
 * Deliberately bypasses the lattice: framing means matching the content
 * exactly, and snapping would make that impossible whenever the content does
 * not already sit on the grid.
 */
export function frameContent(context: PlacementPadContext): PlacementPadResult {
  return setViewportRect(context, contentRectFromTransform(context.transform), { snap: false })
}

/**
 * The pad's visible square, in Zone units. Content is routinely parked outside
 * the Zone, so the view zooms out to keep it reachable. It stays centred on the
 * Zone and only changes scale: recentring would slide the artwork out from
 * under the pointer mid-drag.
 */
export function placementPadView(
  context: PlacementPadContext,
  { margin = 0.18, minExtent = 1.7, maxExtent = 12 } = {},
): { min: number; max: number } {
  const rects = [{ ...PLACEMENT_ZONE_RECT }, contentRectFromTransform(context.transform)]
  if (context.viewport.enabled) rects.push(viewportRect(context.viewport))
  let reach = 0.5
  for (const rect of rects) {
    reach = Math.max(
      reach,
      Math.abs(rect.left - 0.5),
      Math.abs(rect.left + rect.width - 0.5),
      Math.abs(rect.top - 0.5),
      Math.abs(rect.top + rect.height - 0.5),
    )
  }
  const extent = clamp(reach * 2 + margin * 2, minExtent, maxExtent)
  return { min: 0.5 - extent / 2, max: 0.5 + extent / 2 }
}

/**
 * Grid-aware presentation for the placement X/Y fields (#633). The slider
 * windows onto the two stage units around center where placement actually
 * happens - beyond one unit the content is already off stage - while exact
 * entry keeps the full stored bounds. Detents follow the pad's selected grid
 * so slider travel lands on the same cells the pad snaps to; Free keeps the
 * legacy half-unit stops. The magnet scales with the cell so dense grids do
 * not swallow the space between detents.
 */
export function resolvePlacementPositionPresentation(
  grid: number,
): ResolvedLinearNumberPresentation & { neutralPosition: number } {
  const detentStep = grid > 0 ? 1 / grid : 0.5
  return {
    ...resolveLinearNumberPresentation({
      kindLabel: 'position',
      min: -4,
      max: 4,
      step: 0.001,
      sliderMin: -2,
      sliderMax: 2,
      sliderStep: 0.005,
      detentStep,
      detentMagnet: detentStep * 0.08,
      labelStep: 1,
    }),
    neutralPosition: 0.5,
  }
}

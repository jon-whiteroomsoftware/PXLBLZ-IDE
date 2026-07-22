import type { ShowClipViewport } from './personalContentRecords'

export const DEFAULT_SHOW_CLIP_VIEWPORT: Readonly<ShowClipViewport> = Object.freeze({
  enabled: false,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
})

export function normalizeShowClipViewport(
  viewport: Partial<ShowClipViewport> | undefined,
): ShowClipViewport {
  return {
    enabled: Boolean(viewport?.enabled),
    x: clamp(viewport?.x, -4, 4, 0),
    y: clamp(viewport?.y, -4, 4, 0),
    width: clamp(viewport?.width, 0.01, 8, 1),
    height: clamp(viewport?.height, 0.01, 8, 1),
  }
}

/** Missing is the compact default. A disabled authored rectangle is retained. */
export function compactShowClipViewport(
  viewport: Partial<ShowClipViewport> | undefined,
): ShowClipViewport | undefined {
  if (!viewport) return undefined
  const normalized = normalizeShowClipViewport(viewport)
  return normalized.enabled
    || normalized.x !== 0
    || normalized.y !== 0
    || normalized.width !== 1
    || normalized.height !== 1
    ? normalized
    : undefined
}

export function showClipViewportMaskExpression(
  viewport: Partial<ShowClipViewport> | undefined,
  xExpression: string,
  yExpression: string,
  propertyExpressions: Partial<Record<'x' | 'y' | 'width' | 'height', string>> = {},
): string | null {
  const normalized = normalizeShowClipViewport(viewport)
  if (!normalized.enabled) return null
  if (Object.keys(propertyExpressions).length === 0) {
    const maxX = normalized.x + normalized.width
    const maxY = normalized.y + normalized.height
    return `((${xExpression}) >= ${numberSource(normalized.x)} && (${xExpression}) <= ${numberSource(maxX)} && (${yExpression}) >= ${numberSource(normalized.y)} && (${yExpression}) <= ${numberSource(maxY)})`
  }
  const viewportX = propertyExpressions.x ?? numberSource(normalized.x)
  const viewportY = propertyExpressions.y ?? numberSource(normalized.y)
  const viewportWidth = propertyExpressions.width ?? numberSource(normalized.width)
  const viewportHeight = propertyExpressions.height ?? numberSource(normalized.height)
  const maxX = `((${viewportX}) + (${viewportWidth}))`
  const maxY = `((${viewportY}) + (${viewportHeight}))`
  return `((${xExpression}) >= (${viewportX}) && (${xExpression}) <= ${maxX} && (${yExpression}) >= (${viewportY}) && (${yExpression}) <= ${maxY})`
}

function numberSource(value: number): string {
  const stable = Number(value.toFixed(12))
  return String(Object.is(stable, -0) ? 0 : stable)
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

import type { ShowClipViewport } from './personalContentRecords'

export const DEFAULT_SHOW_CLIP_VIEWPORT: Readonly<ShowClipViewport> = Object.freeze({
  enabled: false,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
})

/**
 * Default soft-band width, emitted into generated code rather than resolved at
 * compile time: `pixelCount` is a Pixelblaze built-in (the preview runtime
 * provides it too), so the band tracks the actual device density - roughly
 * 1.5 LED pitches on a square-ish 2D map - instead of the authoring-time
 * output contract.
 */
export const SHOW_CLIP_APERTURE_DEFAULT_FEATHER = '(1.5 / sqrt(pixelCount))'

export function normalizeShowClipViewport(
  viewport: Partial<ShowClipViewport> | undefined,
): ShowClipViewport {
  const feather = typeof viewport?.feather === 'number' && Number.isFinite(viewport.feather)
    ? Math.max(0.001, Math.min(1, viewport.feather))
    : undefined
  const aperture = viewport?.aperture !== undefined && SHAPED_APERTURES.includes(viewport.aperture)
    ? viewport.aperture
    : undefined
  return {
    enabled: Boolean(viewport?.enabled),
    x: clamp(viewport?.x, -4, 4, 0),
    y: clamp(viewport?.y, -4, 4, 0),
    width: clamp(viewport?.width, 0.01, 8, 1),
    height: clamp(viewport?.height, 0.01, 8, 1),
    // Rectangle is the compact default, so it normalizes away entirely; only
    // an authored non-default shape survives. Shape parameters are owned by
    // their shape and normalize away with it.
    ...(aperture !== undefined ? { aperture } : {}),
    ...(viewport?.edge === 'hard' || viewport?.edge === 'soft' || viewport?.edge === 'dither' ? { edge: viewport.edge } : {}),
    ...(feather !== undefined ? { feather } : {}),
    ...(aperture === 'ring' && typeof viewport?.ringWidth === 'number' && Number.isFinite(viewport.ringWidth)
      ? { ringWidth: Math.max(0.05, Math.min(1, viewport.ringWidth)) }
      : {}),
    ...(aperture === 'rounded-box' && typeof viewport?.cornerRadius === 'number' && Number.isFinite(viewport.cornerRadius)
      ? { cornerRadius: Math.max(0.05, Math.min(1, viewport.cornerRadius)) }
      : {}),
  }
}

const SHAPED_APERTURES: ReadonlyArray<NonNullable<ShowClipViewport['aperture']>> = [
  'ellipse', 'diamond', 'ring', 'rounded-box',
]

/** Ring band thickness default, as a fraction of the unit radius. */
export const DEFAULT_SHOW_CLIP_RING_WIDTH = 0.25

/** Rounded-box corner radius default, as a fraction of the half-side. */
export const DEFAULT_SHOW_CLIP_CORNER_RADIUS = 0.25

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
    || normalized.aperture !== undefined
    || normalized.edge !== undefined
    || normalized.feather !== undefined
    || normalized.ringWidth !== undefined
    || normalized.cornerRadius !== undefined
    ? normalized
    : undefined
}

/**
 * The edge defaults from the shape: rectangles keep today's hard cut so
 * existing Shows stay byte-identical, while a newly shaped aperture feathers
 * by default (#591 decision record). An authored edge always wins.
 */
export function showClipViewportEffectiveEdge(
  viewport: Pick<ShowClipViewport, 'aperture' | 'edge'>,
): 'hard' | 'soft' | 'dither' {
  return viewport.edge ?? (viewport.aperture !== undefined ? 'soft' : 'hard')
}

export function showClipViewportMaskExpression(
  viewport: Partial<ShowClipViewport> | undefined,
  xExpression: string,
  yExpression: string,
  propertyExpressions: Partial<Record<'x' | 'y' | 'width' | 'height', string>> = {},
  options: { indexExpression?: string } = {},
): string | null {
  const normalized = normalizeShowClipViewport(viewport)
  if (!normalized.enabled) return null
  const edge = showClipViewportEffectiveEdge(normalized)
  if (edge === 'hard') {
    return showClipViewportHardPredicateExpression(normalized, xExpression, yExpression, propertyExpressions)
  }
  const mix = showClipViewportSoftMixExpression(normalized, xExpression, yExpression, propertyExpressions)!
  if (edge === 'dither' && options.indexExpression !== undefined) {
    // Pixel-stable binary selection: the spatial hash thresholds the band mix,
    // matching the Portal transition's stable-dither policy (#679).
    return `((${mix}) >= 1 || ((${mix}) > 0 && __pxlblz_show_hash01(${options.indexExpression}) < (${mix})))`
  }
  return mix
}

/** The boolean inside-test for the effective-hard aperture. */
export function showClipViewportHardPredicateExpression(
  viewport: Partial<ShowClipViewport> | undefined,
  xExpression: string,
  yExpression: string,
  propertyExpressions: Partial<Record<'x' | 'y' | 'width' | 'height', string>> = {},
): string | null {
  const normalized = normalizeShowClipViewport(viewport)
  if (!normalized.enabled) return null
  const animated = Object.keys(propertyExpressions).length > 0
    ? propertyExpressions
    : undefined
  if (normalized.aperture === undefined) {
    return rectangleHardMask(normalized, xExpression, yExpression, animated)
  }
  // Sqrt-free predicates wherever the shape permits one.
  if (normalized.aperture === 'ellipse') {
    return ellipseHardMask(normalized, xExpression, yExpression, animated)
  }
  if (normalized.aperture === 'diamond') {
    return `(${diamondUnitField(normalized, xExpression, yExpression, animated)} <= 1)`
  }
  if (normalized.aperture === 'ring') {
    const quadratic = ellipseQuadratic(normalized, xExpression, yExpression, animated)
    const inner = 1 - (normalized.ringWidth ?? DEFAULT_SHOW_CLIP_RING_WIDTH)
    return `(${quadratic} <= 1 && ${quadratic} >= ${numberSource(inner * inner)})`
  }
  return `(${roundedBoxSignedDistance(normalized, xExpression, yExpression, animated)} <= 0)`
}

/** The 0..1 band mix shared by the Soft edge, Stable Dither, and the
 * coverage-directed emitters. Null while the Viewport is disabled. */
export function showClipViewportSoftMixExpression(
  viewport: Partial<ShowClipViewport> | undefined,
  xExpression: string,
  yExpression: string,
  propertyExpressions: Partial<Record<'x' | 'y' | 'width' | 'height', string>> = {},
): string | null {
  const normalized = normalizeShowClipViewport(viewport)
  if (!normalized.enabled) return null
  const animated = Object.keys(propertyExpressions).length > 0
    ? propertyExpressions
    : undefined
  const feather = normalized.feather !== undefined
    ? numberSource(normalized.feather)
    : SHOW_CLIP_APERTURE_DEFAULT_FEATHER
  const signed = normalized.aperture === 'ellipse'
    ? ellipseSignedDistance(normalized, xExpression, yExpression, animated)
    : normalized.aperture === 'diamond'
      ? diamondSignedDistance(normalized, xExpression, yExpression, animated)
      : normalized.aperture === 'ring'
        ? ringSignedDistance(normalized, xExpression, yExpression, animated)
        : normalized.aperture === 'rounded-box'
          ? roundedBoxSignedDistance(normalized, xExpression, yExpression, animated)
          : rectangleSignedDistance(normalized, xExpression, yExpression, animated)
  return `clamp(0.5 - (${signed}) / ${feather}, 0, 1)`
}

type FrameExpressions = Partial<Record<'x' | 'y' | 'width' | 'height', string>>

/** `|u| + |v|` over frame-normalized coordinates; 1 on the diamond boundary. */
function diamondUnitField(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: FrameExpressions,
): string {
  const { cx, cy, rx, ry } = frameTerms(viewport, propertyExpressions)
  return `abs(((${x}) - ${wrapTerm(cx)}) / ${wrapTerm(rx)}) + abs(((${y}) - ${wrapTerm(cy)}) / ${wrapTerm(ry)})`
}

function diamondSignedDistance(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: FrameExpressions,
): string {
  const { rx, ry, rxNumber, ryNumber } = frameTerms(viewport, propertyExpressions)
  // The unit field grows sqrt(2) faster than distance along the axes; folding
  // 1/sqrt(2) into the minor radius keeps the band near real width.
  const scale = rxNumber !== undefined && ryNumber !== undefined
    ? numberSource(Math.min(rxNumber, ryNumber) * Math.SQRT1_2)
    : `min(${wrapTerm(rx)}, ${wrapTerm(ry)}) * ${numberSource(Math.SQRT1_2)}`
  return `(${diamondUnitField(viewport, x, y, propertyExpressions)} - 1) * ${scale}`
}

/** The ellipse quadratic `u^2 + v^2` shared by the hard ellipse and ring. */
function ellipseQuadratic(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: FrameExpressions,
): string {
  const { cx, cy, rx, ry, rxNumber, ryNumber } = frameTerms(viewport, propertyExpressions)
  const dx = `((${x}) - ${wrapTerm(cx)})`
  const dy = `((${y}) - ${wrapTerm(cy)})`
  const rxSquared = rxNumber !== undefined ? numberSource(rxNumber * rxNumber) : `((${rx}) * (${rx}))`
  const rySquared = ryNumber !== undefined ? numberSource(ryNumber * ryNumber) : `((${ry}) * (${ry}))`
  return `${dx} * ${dx} / ${rxSquared} + ${dy} * ${dy} / ${rySquared}`
}

function ringSignedDistance(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: FrameExpressions,
): string {
  const { cx, cy, rx, ry, rxNumber, ryNumber } = frameTerms(viewport, propertyExpressions)
  const width = viewport.ringWidth ?? DEFAULT_SHOW_CLIP_RING_WIDTH
  const minRadius = rxNumber !== undefined && ryNumber !== undefined
    ? numberSource(Math.min(rxNumber, ryNumber))
    : `min(${wrapTerm(rx)}, ${wrapTerm(ry)})`
  const base = `hypot(((${x}) - ${wrapTerm(cx)}) / ${wrapTerm(rx)}, ((${y}) - ${wrapTerm(cy)}) / ${wrapTerm(ry)})`
  return `(abs(${base} - ${numberSource(1 - width / 2)}) - ${numberSource(width / 2)}) * ${minRadius}`
}

function roundedBoxSignedDistance(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: FrameExpressions,
): string {
  const { cx, cy, rx, ry, rxNumber, ryNumber } = frameTerms(viewport, propertyExpressions)
  const radius = viewport.cornerRadius ?? DEFAULT_SHOW_CLIP_CORNER_RADIUS
  const minRadius = rxNumber !== undefined && ryNumber !== undefined
    ? numberSource(Math.min(rxNumber, ryNumber))
    : `min(${wrapTerm(rx)}, ${wrapTerm(ry)})`
  const qx = `(abs(((${x}) - ${wrapTerm(cx)}) / ${wrapTerm(rx)}) - ${numberSource(1 - radius)})`
  const qy = `(abs(((${y}) - ${wrapTerm(cy)}) / ${wrapTerm(ry)}) - ${numberSource(1 - radius)})`
  return `(min(max(${qx}, ${qy}), 0) + hypot(max(${qx}, 0), max(${qy}, 0)) - ${numberSource(radius)}) * ${minRadius}`
}

/** Frame-derived center/radius terms, folded to constants when static. */
function frameTerms(
  viewport: ShowClipViewport,
  propertyExpressions?: Partial<Record<'x' | 'y' | 'width' | 'height', string>>,
): { cx: string; cy: string; rx: string; ry: string; rxNumber?: number; ryNumber?: number } {
  const xExpr = propertyExpressions?.x
  const yExpr = propertyExpressions?.y
  const widthExpr = propertyExpressions?.width
  const heightExpr = propertyExpressions?.height
  const rxNumber = widthExpr === undefined ? viewport.width / 2 : undefined
  const ryNumber = heightExpr === undefined ? viewport.height / 2 : undefined
  const rx = widthExpr === undefined ? numberSource(viewport.width / 2) : `(${widthExpr}) * 0.5`
  const ry = heightExpr === undefined ? numberSource(viewport.height / 2) : `(${heightExpr}) * 0.5`
  const cx = xExpr === undefined
    ? widthExpr === undefined
      ? numberSource(viewport.x + viewport.width / 2)
      : `${numberSource(viewport.x)} + (${widthExpr}) * 0.5`
    : widthExpr === undefined
      ? `(${xExpr}) + ${numberSource(viewport.width / 2)}`
      : `(${xExpr}) + (${widthExpr}) * 0.5`
  const cy = yExpr === undefined
    ? heightExpr === undefined
      ? numberSource(viewport.y + viewport.height / 2)
      : `${numberSource(viewport.y)} + (${heightExpr}) * 0.5`
    : heightExpr === undefined
      ? `(${yExpr}) + ${numberSource(viewport.height / 2)}`
      : `(${yExpr}) + (${heightExpr}) * 0.5`
  return { cx, cy, rx, ry, rxNumber, ryNumber }
}

function rectangleHardMask(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: Partial<Record<'x' | 'y' | 'width' | 'height', string>>,
): string {
  if (!propertyExpressions) {
    const maxX = viewport.x + viewport.width
    const maxY = viewport.y + viewport.height
    return `((${x}) >= ${numberSource(viewport.x)} && (${x}) <= ${numberSource(maxX)} && (${y}) >= ${numberSource(viewport.y)} && (${y}) <= ${numberSource(maxY)})`
  }
  const viewportX = propertyExpressions.x ?? numberSource(viewport.x)
  const viewportY = propertyExpressions.y ?? numberSource(viewport.y)
  const viewportWidth = propertyExpressions.width ?? numberSource(viewport.width)
  const viewportHeight = propertyExpressions.height ?? numberSource(viewport.height)
  const maxX = `((${viewportX}) + (${viewportWidth}))`
  const maxY = `((${viewportY}) + (${viewportHeight}))`
  return `((${x}) >= (${viewportX}) && (${x}) <= ${maxX} && (${y}) >= (${viewportY}) && (${y}) <= ${maxY})`
}

function ellipseHardMask(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: Partial<Record<'x' | 'y' | 'width' | 'height', string>>,
): string {
  const { cx, cy, rx, ry, rxNumber, ryNumber } = frameTerms(viewport, propertyExpressions)
  const dx = `((${x}) - ${wrapTerm(cx)})`
  const dy = `((${y}) - ${wrapTerm(cy)})`
  const rxSquared = rxNumber !== undefined ? numberSource(rxNumber * rxNumber) : `((${rx}) * (${rx}))`
  const rySquared = ryNumber !== undefined ? numberSource(ryNumber * ryNumber) : `((${ry}) * (${ry}))`
  return `(${dx} * ${dx} / ${rxSquared} + ${dy} * ${dy} / ${rySquared} <= 1)`
}

/**
 * Scaled-space metric matching the Portal emitter family: normalizing by the
 * radii turns the boundary into the unit circle, and re-scaling by the minor
 * radius restores approximately real distance so the soft band stays uniform.
 */
function ellipseSignedDistance(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: Partial<Record<'x' | 'y' | 'width' | 'height', string>>,
): string {
  const { cx, cy, rx, ry, rxNumber, ryNumber } = frameTerms(viewport, propertyExpressions)
  const minRadius = rxNumber !== undefined && ryNumber !== undefined
    ? numberSource(Math.min(rxNumber, ryNumber))
    : `min(${wrapTerm(rx)}, ${wrapTerm(ry)})`
  return `(hypot(((${x}) - ${wrapTerm(cx)}) / ${wrapTerm(rx)}, ((${y}) - ${wrapTerm(cy)}) / ${wrapTerm(ry)}) - 1) * ${minRadius}`
}

/** Axis-aligned box distance: exact in the face regions, conservative at corners. */
function rectangleSignedDistance(
  viewport: ShowClipViewport,
  x: string,
  y: string,
  propertyExpressions?: Partial<Record<'x' | 'y' | 'width' | 'height', string>>,
): string {
  const { cx, cy, rx, ry } = frameTerms(viewport, propertyExpressions)
  return `max(abs((${x}) - ${wrapTerm(cx)}) - ${wrapTerm(rx)}, abs((${y}) - ${wrapTerm(cy)}) - ${wrapTerm(ry)})`
}

/** Composite arithmetic terms need parentheses; folded constants stay bare. */
function wrapTerm(term: string): string {
  return /^[0-9.-]+$/.test(term) ? term : `(${term})`
}

function numberSource(value: number): string {
  const stable = Number(value.toFixed(12))
  return String(Object.is(stable, -0) ? 0 : stable)
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

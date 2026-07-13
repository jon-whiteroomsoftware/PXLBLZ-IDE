export interface ShowTimelineViewport {
  totalMs: number
  startMs: number
  durationMs: number
  minDurationMs: number
}

const MAX_ZOOM = 16

export function fitShowTimelineViewport(totalMs: number): ShowTimelineViewport {
  const total = Math.max(1, Math.round(totalMs))
  return { totalMs: total, startMs: 0, durationMs: total, minDurationMs: Math.max(1, total / MAX_ZOOM) }
}

export function zoomShowTimelineViewport(
  viewport: ShowTimelineViewport,
  factor: number,
  anchorMs: number,
): ShowTimelineViewport {
  const durationMs = clamp(viewport.durationMs / Math.max(0.001, factor), viewport.minDurationMs, viewport.totalMs)
  if (durationMs === viewport.totalMs) return fitShowTimelineViewport(viewport.totalMs)
  const anchor = clamp(anchorMs, viewport.startMs, viewport.startMs + viewport.durationMs)
  const anchorFraction = (anchor - viewport.startMs) / viewport.durationMs
  return panShowTimelineViewport({ ...viewport, durationMs }, anchor - durationMs * anchorFraction)
}

export function panShowTimelineViewport(viewport: ShowTimelineViewport, startMs: number): ShowTimelineViewport {
  return { ...viewport, startMs: clamp(startMs, 0, viewport.totalMs - viewport.durationMs) }
}

export function resizeShowTimelineViewport(
  viewport: ShowTimelineViewport,
  edge: 'start' | 'end',
  timeMs: number,
): ShowTimelineViewport {
  const endMs = viewport.startMs + viewport.durationMs
  if (edge === 'start') {
    const startMs = clamp(timeMs, 0, endMs - viewport.minDurationMs)
    return { ...viewport, startMs, durationMs: endMs - startMs }
  }
  const nextEnd = clamp(timeMs, viewport.startMs + viewport.minDurationMs, viewport.totalMs)
  return { ...viewport, durationMs: nextEnd - viewport.startMs }
}

export function showTimelineThumb(viewport: ShowTimelineViewport): { leftPercent: number; widthPercent: number } {
  return {
    leftPercent: viewport.startMs / viewport.totalMs * 100,
    widthPercent: viewport.durationMs / viewport.totalMs * 100,
  }
}

export function rangeThumbCenterOffsetPx(percent: number, thumbWidthPx: number): number {
  const fraction = clamp(percent, 0, 100) / 100
  return Math.max(0, thumbWidthPx) / 2 * (1 - 2 * fraction)
}

export function timeToViewportPercent(viewport: ShowTimelineViewport, timeMs: number): number {
  return (timeMs - viewport.startMs) / viewport.durationMs * 100
}

export function viewportPercentToTime(viewport: ShowTimelineViewport, percent: number): number {
  return clamp(viewport.startMs + viewport.durationMs * percent / 100, 0, viewport.totalMs)
}

export function showTimelineGridStepMs(visibleDurationMs: number, visibleWidthPx: number): number {
  const rawStep = Math.max(100, visibleDurationMs * 80 / Math.max(1, visibleWidthPx))
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return multiplier * magnitude
}

export interface ShowTimelineSnapOptions {
  visibleDurationMs: number
  visibleWidthPx: number
  structuralTimesMs: number[]
  minTimeMs?: number
  maxTimeMs?: number
}

export interface ShowTimelineSnapResult {
  timeMs: number
  kind?: 'boundary' | 'grid'
}

export function snapShowTimelineTime(
  candidateTimeMs: number,
  options: ShowTimelineSnapOptions,
): ShowTimelineSnapResult {
  const min = options.minTimeMs ?? 0
  const max = options.maxTimeMs ?? Number.POSITIVE_INFINITY
  const candidate = clamp(candidateTimeMs, min, max)
  const thresholdMs = options.visibleDurationMs / Math.max(1, options.visibleWidthPx) * 10
  const boundary = options.structuralTimesMs
    .map((timeMs) => clamp(timeMs, min, max))
    .filter((timeMs) => Math.abs(timeMs - candidate) <= thresholdMs)
    .sort((left, right) => Math.abs(left - candidate) - Math.abs(right - candidate))[0]
  if (boundary !== undefined) return { timeMs: boundary, kind: 'boundary' }

  const gridStepMs = showTimelineGridStepMs(options.visibleDurationMs, options.visibleWidthPx)
  const gridTimeMs = clamp(Math.round(candidate / gridStepMs) * gridStepMs, min, max)
  if (Math.abs(gridTimeMs - candidate) <= thresholdMs) return { timeMs: gridTimeMs, kind: 'grid' }
  return { timeMs: candidate }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

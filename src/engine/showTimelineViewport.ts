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

export function timeToViewportPercent(viewport: ShowTimelineViewport, timeMs: number): number {
  return (timeMs - viewport.startMs) / viewport.durationMs * 100
}

export function viewportPercentToTime(viewport: ShowTimelineViewport, percent: number): number {
  return clamp(viewport.startMs + viewport.durationMs * percent / 100, 0, viewport.totalMs)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

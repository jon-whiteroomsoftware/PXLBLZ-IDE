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

export interface ShowTimelineRulerTick {
  timeMs: number
  fraction: number
  kind: 'major' | 'minor'
  label?: string
}

export interface ShowTimelineRulerTicksOptions {
  rulerDurationMs: number
  viewport: ShowTimelineViewport
  visibleWidthPx: number
}

export interface ShowTimelineRulerTicksResult {
  majorStepMs: number
  minorStepMs: number
  ticks: ShowTimelineRulerTick[]
}

/**
 * Ruler ticks share the magnetic grid step, so the marks users see are the
 * same times the timeline snaps to. Steps are 1/2/5 x 10^n ms, which keeps
 * every tick on a whole second or a clean decimal fraction at any zoom.
 * Ticks span the whole ruler rather than a viewport-trimmed window: the
 * on-screen time span can exceed the logical viewport (the grid width formula
 * reserves rail pixels the current rail may not use), and full emission stays
 * bounded because zoom is clamped, at roughly zoom x visibleWidthPx / 16
 * ticks.
 */
export function showTimelineRulerTicks(options: ShowTimelineRulerTicksOptions): ShowTimelineRulerTicksResult {
  const majorStepMs = showTimelineGridStepMs(options.viewport.durationMs, options.visibleWidthPx)
  const multiplier = Math.round(majorStepMs / 10 ** Math.floor(Math.log10(majorStepMs)))
  const minorStepMs = multiplier === 2 ? majorStepMs / 4 : majorStepMs / 5
  if (options.rulerDurationMs <= 0) return { majorStepMs, minorStepMs, ticks: [] }

  const ticks: ShowTimelineRulerTick[] = []
  for (let index = 0; index * minorStepMs <= options.rulerDurationMs; index += 1) {
    const timeMs = index * minorStepMs
    const major = timeMs % majorStepMs === 0
    ticks.push({
      timeMs,
      fraction: timeMs / options.rulerDurationMs,
      kind: major ? 'major' : 'minor',
      ...(major ? { label: formatShowTimelineRulerTime(timeMs) } : {}),
    })
  }
  return { majorStepMs, minorStepMs, ticks }
}

export function formatShowTimelineRulerTime(timeMs: number): string {
  const totalSeconds = timeMs / 1000
  if (totalSeconds < 60) return `${trimSeconds(totalSeconds)}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  const wholeSeconds = Math.floor(seconds)
  const fraction = trimSeconds(seconds - wholeSeconds).replace(/^0\.?/, '')
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}${fraction ? `.${fraction}` : ''}`
}

function trimSeconds(seconds: number): string {
  return Number(seconds.toFixed(3)).toString()
}

export interface ShowTimelineSnapOptions {
  visibleDurationMs: number
  visibleWidthPx: number
  structuralTimesMs: number[]
  gridEnabled?: boolean
  /**
   * Always-on drop grid (#667). Unlike the magnetic zoom-aware grid, which
   * only attracts within a pixel threshold and otherwise lets a drop land on
   * raw milliseconds, a quantize step rounds every non-boundary result onto
   * the grid. Near boundaries still win, so Clips continue to butt against
   * neighbours, Markers, and the playhead exactly. When set, the magnetic
   * grid flag is ignored.
   */
  quantizeStepMs?: number
  minTimeMs?: number
  maxTimeMs?: number
}

export interface ShowTimelineSnapResult {
  timeMs: number
  kind?: 'boundary' | 'grid'
}

export interface ShowTimelineClipDragPlacement {
  startMs: number
  magnetized: boolean
}

export interface ShowTimelineClipDragPlacementOptions {
  durationMs: number
  totalMs: number
  visibleDurationMs: number
  visibleWidthPx: number
  structuralTimesMs: number[]
  excludedStructuralTimesMs?: number[]
  altKey: boolean
  shiftKey: boolean
  previousPlacement?: ShowTimelineClipDragPlacement
}

/**
 * Timeline drops land on whole seconds by default; Shift asks for a fixed
 * 0.1s at any zoom (#667). Zooming in refines the default grid along the
 * ruler's own 1/2/5 tick family — 1s, then 500ms, then a 200ms floor — so a
 * drop always lands on a tick line the user can see, and every step divides
 * one second, so whole-second landings stay available at every zoom. The
 * exact textbox owns anything finer.
 */
export function showTimelineQuantizeStepMs(
  fine: boolean,
  visibleDurationMs?: number,
  visibleWidthPx?: number,
): number {
  if (fine) return 100
  if (visibleDurationMs === undefined || visibleWidthPx === undefined) return 1_000
  const majorStepMs = showTimelineGridStepMs(visibleDurationMs, visibleWidthPx)
  const multiplier = Math.round(majorStepMs / 10 ** Math.floor(Math.log10(majorStepMs)))
  const minorStepMs = multiplier === 2 ? majorStepMs / 4 : majorStepMs / 5
  return Math.min(1_000, Math.max(200, minorStepMs))
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

  if (options.quantizeStepMs !== undefined && options.quantizeStepMs > 0) {
    // Quantize the raw pointer time, then clamp: a drag pressed past a range
    // limit rests exactly on the limit rather than jumping to the grid line
    // beyond it.
    const stepMs = options.quantizeStepMs
    return { timeMs: clamp(Math.round(candidateTimeMs / stepMs) * stepMs, min, max), kind: 'grid' }
  }

  if (options.gridEnabled !== false) {
    const gridStepMs = showTimelineGridStepMs(options.visibleDurationMs, options.visibleWidthPx)
    const gridTimeMs = clamp(Math.round(candidate / gridStepMs) * gridStepMs, min, max)
    if (Math.abs(gridTimeMs - candidate) <= thresholdMs) return { timeMs: gridTimeMs, kind: 'grid' }
  }
  return { timeMs: candidate }
}

/**
 * Resolves one live Clip-drag sample. The moved Clip's own old boundaries are
 * excluded so they cannot seed magnetic hysteresis and pin the next gesture
 * to a prior Shift/free-placement time (#789).
 */
export function resolveShowTimelineClipDragPlacement(
  candidateStartMs: number,
  options: ShowTimelineClipDragPlacementOptions,
): ShowTimelineClipDragPlacement {
  const durationMs = Math.max(0, options.durationMs)
  const totalMs = Math.max(0, options.totalMs)
  const maxStartMs = Math.max(0, totalMs - durationMs)
  const rawStartMs = clamp(candidateStartMs, 0, maxStartMs)
  const excludedStructuralTimesMs = new Set(options.excludedStructuralTimesMs ?? [])
  const structuralTimesMs = options.altKey
    ? []
    : options.structuralTimesMs.filter((timeMs) => (
        timeMs >= 0
        && timeMs <= totalMs
        && !excludedStructuralTimesMs.has(timeMs)
      ))
  const snapBoundary = (candidateMs: number, minTimeMs: number, maxTimeMs: number) => (
    snapShowTimelineTime(candidateMs, {
      visibleDurationMs: options.visibleDurationMs,
      visibleWidthPx: options.visibleWidthPx,
      structuralTimesMs: structuralTimesMs.filter((timeMs) => timeMs >= minTimeMs && timeMs <= maxTimeMs),
      gridEnabled: !options.altKey,
      quantizeStepMs: options.altKey
        ? undefined
        : showTimelineQuantizeStepMs(options.shiftKey, options.visibleDurationMs, options.visibleWidthPx),
      minTimeMs,
      maxTimeMs,
    })
  )
  const startSnap = snapBoundary(rawStartMs, 0, maxStartMs)
  const rawEndMs = rawStartMs + durationMs
  const endSnap = snapBoundary(rawEndMs, durationMs, totalMs)

  // A magnetic boundary on either edge beats the drop grid on the other.
  const edgeRank = (kind: 'boundary' | 'grid' | undefined, deltaMs: number) =>
    kind === undefined ? [2, Number.POSITIVE_INFINITY] as const
      : kind === 'grid' ? [1, Math.abs(deltaMs)] as const
        : [0, Math.abs(deltaMs)] as const
  const startDeltaMs = startSnap.timeMs - rawStartMs
  const endDeltaMs = endSnap.timeMs - rawEndMs
  const startRank = edgeRank(startSnap.kind, startDeltaMs)
  const endRank = edgeRank(endSnap.kind, endDeltaMs)
  const startWins = startRank[0] < endRank[0]
    || (startRank[0] === endRank[0] && startRank[1] <= endRank[1])
  const winningSnap = startWins ? startSnap : endSnap
  const freshPlacement = {
    startMs: clamp(startWins ? winningSnap.timeMs : winningSnap.timeMs - durationMs, 0, maxStartMs),
    magnetized: winningSnap.kind === 'boundary',
  }

  const releaseThresholdMs = options.visibleDurationMs / Math.max(1, options.visibleWidthPx) * 16
  if (options.previousPlacement?.magnetized
    && !options.altKey
    && !freshPlacement.magnetized
    && Math.abs(rawStartMs - options.previousPlacement.startMs) <= releaseThresholdMs) {
    return options.previousPlacement
  }
  return freshPlacement
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

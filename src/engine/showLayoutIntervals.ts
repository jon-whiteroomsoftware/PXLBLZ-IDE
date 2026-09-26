import { normalizeShowTransitionState, projectShowTimeline, showRoutingTransitionAfter } from './showModel'
import type { ShowRecord } from './personalContentRecords'

export interface ShowLayoutInterval {
  /** Stable while the first internal Scene remains the occurrence entry. */
  id: string
  layoutId: string
  layoutName: string
  zoneIds: string[]
  startMs: number
  endMs: number
  durationMs: number
  sceneIds: string[]
}

/**
 * Project persisted internal Scene/routing state into the author-facing hard
 * Zone Layout occurrences. Every routing event starts a new occurrence, even
 * when it intentionally reuses the same Layout definition.
 */
export function projectShowLayoutIntervals(show: ShowRecord): ShowLayoutInterval[] {
  const normalized = normalizeShowTransitionState(show)
  const timeline = projectShowTimeline(normalized)
  const layoutById = new Map(normalized.routingLayouts.map((layout) => [layout.id, layout]))
  let activeLayoutId = normalized.routingLayouts[0]?.id
  if (!activeLayoutId) return []

  const intervals: ShowLayoutInterval[] = []
  for (const [sceneIndex, sceneRange] of timeline.scenes.entries()) {
    const layout = layoutById.get(activeLayoutId) ?? normalized.routingLayouts[0]
    const previous = intervals[intervals.length - 1]
    const startsOccurrence = sceneIndex === 0
      || Boolean(showRoutingTransitionAfter(normalized, normalized.scenes[sceneIndex - 1].id))
    if (startsOccurrence || !previous) {
      const startMs = previous?.endMs ?? sceneRange.startMs
      intervals.push({
        id: `layout-occurrence-${sceneRange.sceneId}`,
        layoutId: layout.id,
        layoutName: layout.name,
        zoneIds: layout.logical?.zoneIds ?? layout.zones.map((zone) => zone.zoneId),
        startMs,
        endMs: sceneRange.endMs,
        durationMs: sceneRange.endMs - startMs,
        sceneIds: [sceneRange.sceneId],
      })
    } else {
      previous.sceneIds.push(sceneRange.sceneId)
      previous.endMs = sceneRange.endMs
      previous.durationMs = previous.endMs - previous.startMs
    }
    const outgoing = showRoutingTransitionAfter(normalized, sceneRange.sceneId)
    if (outgoing?.layoutId && layoutById.has(outgoing.layoutId)) activeLayoutId = outgoing.layoutId
  }
  const last = intervals[intervals.length - 1]
  if (last) {
    last.endMs = timeline.durationMs
    last.durationMs = last.endMs - last.startMs
  }
  return intervals
}

/** Resolve the author-facing Layout occurrence that owns a Show instant. */
export function showLayoutIntervalAtTime<T extends { startMs: number; endMs: number }>(
  intervals: readonly T[],
  timeMs: number,
): T | null {
  if (intervals.length === 0 || !Number.isFinite(timeMs)) return null
  return intervals.find((interval) => timeMs >= interval.startMs && timeMs < interval.endMs)
    ?? [...intervals].reverse().find((interval) => timeMs >= interval.startMs)
    ?? intervals[0]
}

/** Choose a valid authoring Zone from the Layout occurrence at this instant. */
export function showLayoutZoneIdAtTime(
  show: ShowRecord,
  timeMs: number,
  preferredZoneId?: string | null,
): string | null {
  const interval = showLayoutIntervalAtTime(projectShowLayoutIntervals(show), timeMs)
  if (!interval) return null
  if (preferredZoneId && interval.zoneIds.includes(preferredZoneId)) return preferredZoneId
  return interval.zoneIds[0] ?? null
}

/** Place an occurrence on the full-width timeline canvas, independent of zoom. */
export function showLayoutIntervalPercentBounds(
  interval: Pick<ShowLayoutInterval, 'startMs' | 'endMs'>,
  totalMs: number,
): { left: number; width: number } {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return { left: 0, width: 0 }
  const start = Math.min(totalMs, Math.max(0, interval.startMs))
  const end = Math.min(totalMs, Math.max(start, interval.endMs))
  return {
    left: start / totalMs * 100,
    width: (end - start) / totalMs * 100,
  }
}

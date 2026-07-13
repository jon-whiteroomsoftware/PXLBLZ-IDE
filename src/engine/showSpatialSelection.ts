import type { ShowRecord } from './personalContentRecords'

export interface SpatialPoint2D {
  x: number
  y: number
}

export type SpatialSelectionMode = 'replace' | 'add' | 'subtract'

export function selectIndexesInRect(
  points: ReadonlyArray<SpatialPoint2D>,
  from: SpatialPoint2D,
  to: SpatialPoint2D,
): number[] {
  const left = Math.min(from.x, to.x)
  const right = Math.max(from.x, to.x)
  const top = Math.min(from.y, to.y)
  const bottom = Math.max(from.y, to.y)
  return points.flatMap((point, index) => (
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom ? [index] : []
  ))
}

export function applySpatialIndexSelection(
  current: ReadonlySet<number>,
  hitIndexes: ReadonlyArray<number>,
  mode: SpatialSelectionMode,
): Set<number> {
  const next = mode === 'replace' ? new Set<number>() : new Set(current)
  for (const index of hitIndexes) {
    if (!Number.isInteger(index) || index < 0) continue
    if (mode === 'subtract') next.delete(index)
    else next.add(index)
  }
  return new Set([...next].sort((a, b) => a - b))
}

export function compactSpatialIndexes(indexes: ReadonlyArray<number>): Array<{ start: number; end: number }> {
  const ordered = [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0))].sort((a, b) => a - b)
  if (ordered.length === 0) return []
  const ranges: Array<{ start: number; end: number }> = []
  let start = ordered[0]
  let end = start
  for (const index of ordered.slice(1)) {
    if (index === end + 1) {
      end = index
      continue
    }
    ranges.push({ start, end })
    start = index
    end = index
  }
  ranges.push({ start, end })
  return ranges
}

export function indexesFromPhysicalRanges(
  ranges: ReadonlyArray<{ start: number; end: number }>,
  pixelCount: number,
): Set<number> {
  const indexes = new Set<number>()
  for (const range of ranges) {
    const start = Math.max(0, Math.floor(Math.min(range.start, range.end)))
    const end = Math.min(pixelCount - 1, Math.floor(Math.max(range.start, range.end)))
    for (let index = start; index <= end; index += 1) indexes.add(index)
  }
  return indexes
}

export function updateShowPhysicalZoneSelection(
  show: ShowRecord,
  layoutId: string,
  zoneId: string,
  indexes: ReadonlyArray<number>,
): ShowRecord {
  if (show.outputContract?.kind !== 'installation') return show
  const layout = show.routingLayouts.find((candidate) => candidate.id === layoutId)
  if (!layout || layout.logical || !show.zones.some((zone) => zone.id === zoneId)) return show
  const ranges = compactSpatialIndexes(indexes)
  const hasEntry = layout.zones.some((entry) => entry.zoneId === zoneId)
  return {
    ...show,
    routingLayouts: show.routingLayouts.map((candidate) => candidate.id === layoutId
      ? {
          ...candidate,
          zones: hasEntry
            ? candidate.zones.map((entry) => entry.zoneId === zoneId ? { ...entry, ranges } : entry)
            : [...candidate.zones, { zoneId, ranges }],
        }
      : candidate),
    updatedAt: Date.now(),
  }
}

import type { ShowRecord, ShowRoutingLayout } from './personalContentRecords'
import { controllerZonePixelCount, type ControllerZone } from './controllerProfile'

export interface InstallationLayoutCoverage {
  layoutId: string
  layoutName: string
  kind: 'physical' | 'logical'
  valid: boolean
  assignedPixelCount: number
  missingPixelCount: number
  overlappingPixelCount: number
  outOfRangePixelCount: number
  totalPixelCount: number
}

export interface InstallationCoverage {
  valid: boolean
  pixelCount: number
  layouts: InstallationLayoutCoverage[]
}

export function validateInstallationCoverage(
  show: Pick<ShowRecord, 'outputContract' | 'routingLayouts'>,
): InstallationCoverage | null {
  if (show.outputContract?.kind !== 'installation') return null
  const pixelCount = show.outputContract.pixelCount
  const layouts = show.routingLayouts.length > 0
    ? show.routingLayouts.map((layout) => validateLayout(layout, pixelCount))
    : [validateLayout({ id: 'missing', name: 'Default', zones: [] }, pixelCount)]
  return {
    valid: layouts.every((layout) => layout.valid),
    pixelCount,
    layouts,
  }
}

export function installationCoverageBlockingMessage(coverage: InstallationCoverage | null): string | null {
  const invalid = coverage?.layouts.find((layout) => !layout.valid)
  if (!invalid) return null
  const problems = [
    invalid.missingPixelCount > 0 ? `${invalid.missingPixelCount} missing` : null,
    invalid.overlappingPixelCount > 0 ? `${invalid.overlappingPixelCount} overlapping` : null,
    invalid.outOfRangePixelCount > 0 ? `${invalid.outOfRangePixelCount} out of range` : null,
  ].filter((problem): problem is string => problem !== null)
  return `Installation output is incomplete: ${invalid.layoutName} assigns ${invalid.assignedPixelCount} of ${invalid.totalPixelCount} pixels (${problems.join(', ')}). Repair physical pixel ranges in Show properties.`
}

export function installationPhysicalZones(
  show: Pick<ShowRecord, 'outputContract' | 'zones' | 'routingLayouts'>,
  layoutId = show.routingLayouts[0]?.id,
): ControllerZone[] | undefined {
  if (show.outputContract?.kind !== 'installation') return undefined
  const layout = show.routingLayouts.find((candidate) => candidate.id === layoutId)
  if (!layout || layout.logical) return undefined
  return show.zones.map((zone) => ({
    id: `${layout.id}:${zone.id}`,
    name: zone.name,
    ranges: (layout.zones.find((entry) => entry.zoneId === zone.id)?.ranges ?? []).map((range) => ({ ...range })),
  }))
}

export function resolveShowZonePixelCount(
  show: Pick<ShowRecord, 'outputContract' | 'zones' | 'routingLayouts'>,
  zoneId: string,
  layoutId = show.routingLayouts.find((candidate) => !candidate.logical)?.id,
): { source: 'physical' | 'nominal'; pixelCount: number } | null {
  const zone = show.zones.find((candidate) => candidate.id === zoneId)
  if (!zone) return null
  const physicalZone = layoutId
    ? installationPhysicalZones(show, layoutId)?.find((candidate) => candidate.id === `${layoutId}:${zoneId}`)
    : undefined
  return physicalZone && physicalZone.ranges.length > 0
    ? { source: 'physical', pixelCount: controllerZonePixelCount(physicalZone) }
    : { source: 'nominal', pixelCount: zone.nominalPixelCount }
}

function validateLayout(layout: ShowRoutingLayout, pixelCount: number): InstallationLayoutCoverage {
  if (layout.logical) {
    return {
      layoutId: layout.id,
      layoutName: layout.name,
      kind: 'logical',
      valid: true,
      assignedPixelCount: pixelCount,
      missingPixelCount: 0,
      overlappingPixelCount: 0,
      outOfRangePixelCount: 0,
      totalPixelCount: pixelCount,
    }
  }

  // Coverage cost follows authored ranges, not the requested Controller size.
  const events = new Map<number, number>()
  const event = (at: number, delta: number) => events.set(at, (events.get(at) ?? 0) + delta)
  const outside: Array<{ start: number; end: number }> = []
  for (const zone of layout.zones) {
    for (const range of zone.ranges) {
      if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) continue
      const start = Math.floor(Math.min(range.start, range.end))
      const end = Math.floor(Math.max(range.start, range.end))
      const inRangeStart = Math.max(0, start)
      const inRangeEnd = Math.min(pixelCount - 1, end)
      if (inRangeStart <= inRangeEnd) {
        event(inRangeStart, 1)
        event(inRangeEnd + 1, -1)
      }
      if (start < 0) outside.push({ start, end: Math.min(-1, end) })
      if (end >= pixelCount) outside.push({ start: Math.max(pixelCount, start), end })
    }
  }

  let assignedPixelCount = 0
  let overlappingPixelCount = 0
  let owners = 0
  let previous = 0
  for (const [at, delta] of [...events].sort(([left], [right]) => left - right)) {
    if (owners > 0) assignedPixelCount += at - previous
    if (owners > 1) overlappingPixelCount += at - previous
    owners += delta
    previous = at
  }

  const outOfRangePixelCount = intervalUnionLength(outside)
  const missingPixelCount = pixelCount - assignedPixelCount
  return {
    layoutId: layout.id,
    layoutName: layout.name,
    kind: 'physical',
    valid: missingPixelCount === 0 && overlappingPixelCount === 0 && outOfRangePixelCount === 0,
    assignedPixelCount,
    missingPixelCount,
    overlappingPixelCount,
    outOfRangePixelCount,
    totalPixelCount: pixelCount,
  }
}

function intervalUnionLength(intervals: Array<{ start: number; end: number }>): number {
  const sorted = intervals
    .filter((range) => range.start <= range.end)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  let total = 0
  let activeStart: number | null = null
  let activeEnd = 0
  for (const range of sorted) {
    if (activeStart === null) {
      activeStart = range.start
      activeEnd = range.end
    } else if (range.start <= activeEnd + 1) {
      activeEnd = Math.max(activeEnd, range.end)
    } else {
      total += activeEnd - activeStart + 1
      activeStart = range.start
      activeEnd = range.end
    }
  }
  return activeStart === null ? total : total + activeEnd - activeStart + 1
}

export interface PhysicalRoutingRange {
  start: number
  end: number
}

export interface PhysicalRoutingRoute {
  ranges: PhysicalRoutingRange[]
}

export interface PhysicalRoutingShortCircuitRange {
  routeIndex: number
  start: number
  end: number
  localOffset: number
}

export interface PhysicalRoutingShortCircuitPlan {
  kind: 'complete-disjoint-short-circuit'
  ranges: PhysicalRoutingShortCircuitRange[]
  rangeCount: number
  baselineMaxComparisonsPerPixel: number
  selectedMaxComparisonsPerPixel: number
  maxComparisonsAvoidedPerPixel: number
}

/**
 * Proves that the authored ranges partition the complete output domain. The
 * returned ranges may be reordered physically because disjoint ownership makes
 * route order irrelevant; each range retains its authored zone-local offset.
 */
export function planPhysicalRoutingShortCircuit(
  routes: PhysicalRoutingRoute[],
  outputPixelCount: number | undefined,
): PhysicalRoutingShortCircuitPlan | null {
  if (!Number.isInteger(outputPixelCount) || (outputPixelCount ?? 0) < 1) return null
  const ranges = routes.flatMap((route, routeIndex) => {
    let localOffset = 0
    return route.ranges.map((range) => {
      const planned = { routeIndex, start: range.start, end: range.end, localOffset }
      localOffset += range.end - range.start + 1
      return planned
    })
  })
  if (ranges.length === 0 || ranges.some((range) => (
    !Number.isInteger(range.start)
    || !Number.isInteger(range.end)
    || range.start < 0
    || range.end < range.start
  ))) return null

  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end)
  if (sorted[0].start !== 0 || sorted[sorted.length - 1].end !== outputPixelCount! - 1) return null
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].start !== sorted[index - 1].end + 1) return null
  }

  const baselineMaxComparisonsPerPixel = sorted.length * 2
  const selectedMaxComparisonsPerPixel = Math.max(0, sorted.length - 1)
  return {
    kind: 'complete-disjoint-short-circuit',
    ranges: sorted,
    rangeCount: sorted.length,
    baselineMaxComparisonsPerPixel,
    selectedMaxComparisonsPerPixel,
    maxComparisonsAvoidedPerPixel: baselineMaxComparisonsPerPixel - selectedMaxComparisonsPerPixel,
  }
}

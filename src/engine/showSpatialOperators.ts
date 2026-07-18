import { routeShowLogicalPoint, type ShowLogicalRouting } from './showLogicalRouting'

export interface ShowSpatialSample {
  region: number
  localX: number
  localY: number
  /** Weight of the alternate Pattern at this point. */
  mix: number
  /** Normalized distance to the nearest operator boundary. */
  boundary: number
}

/**
 * Historical #410 sampling facade. Production and research now share the
 * canonical ShowLogicalRouting model and routeShowLogicalPoint formulas.
 */
export function sampleShowSpatialOperator(
  operator: ShowLogicalRouting,
  x: number,
  y: number,
  _time: number,
): ShowSpatialSample {
  const routed = routeShowLogicalPoint(operator, x, y, { splitPosition: 0.5 })
  const region = Math.max(0, operator.zoneIds.indexOf(routed.zoneId))
  return {
    region,
    localX: routed.localX,
    localY: routed.localY,
    mix: routed.mix ?? region % 2,
    boundary: routed.mix === undefined
      ? Math.min(routed.localX, 1 - routed.localX, routed.localY, 1 - routed.localY)
      : operator.kind === 'soft-split'
        ? Math.abs((operator.axis === 'x' ? x : y) - 0.5)
        : 0,
  }
}

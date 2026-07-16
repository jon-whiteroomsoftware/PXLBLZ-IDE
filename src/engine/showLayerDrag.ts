const DEFAULT_LANE_HEIGHT_PX = 32
const DEFAULT_HYSTERESIS_PX = 14

/**
 * Convert vertical pointer intent into an overlay-layer target.
 *
 * The dead band keeps horizontal timing drags stable. After the pointer crosses
 * it, each additional lane-height advances one more layer.
 */
export function resolveShowLayerDragTarget(
  layers: Array<{ id: string }>,
  initialLayerId: string,
  deltaY: number,
  options: { laneHeightPx?: number; hysteresisPx?: number } = {},
): string {
  const initialIndex = layers.findIndex((layer) => layer.id === initialLayerId)
  if (initialIndex < 0) return initialLayerId

  const hysteresisPx = Math.max(0, options.hysteresisPx ?? DEFAULT_HYSTERESIS_PX)
  const laneHeightPx = Math.max(1, options.laneHeightPx ?? DEFAULT_LANE_HEIGHT_PX)
  if (Math.abs(deltaY) < hysteresisPx) return initialLayerId

  const direction = Math.sign(deltaY)
  const steps = 1 + Math.floor((Math.abs(deltaY) - hysteresisPx) / laneHeightPx)
  const targetIndex = Math.max(0, Math.min(layers.length - 1, initialIndex + direction * steps))
  return layers[targetIndex]?.id ?? initialLayerId
}

import type { ShowSpatialShape } from './personalContentRecords'

export interface SpatialDistanceOptions {
  centerX: number
  centerY: number
  radius: number
  scale?: number
  rotationTurns?: number
  ringWidth?: number
}

export function spatialSignedDistance(
  shape: ShowSpatialShape,
  x: number,
  y: number,
  options: SpatialDistanceOptions,
): number {
  const dx = x - options.centerX
  const dy = y - options.centerY
  const radius = options.radius * (options.scale ?? 1)
  if (shape === 'diamond') {
    const angle = (options.rotationTurns ?? 0) * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const rotatedX = dx * cosine + dy * sine
    const rotatedY = -dx * sine + dy * cosine
    return Math.abs(rotatedX) + Math.abs(rotatedY) - radius
  }
  const distance = Math.hypot(dx, dy)
  if (shape === 'ring') return Math.abs(distance - radius) - (options.ringWidth ?? 0.12) / 2
  return distance - radius
}

export function spatialTransitionMask(
  shape: ShowSpatialShape,
  x: number,
  y: number,
  options: SpatialDistanceOptions,
): boolean {
  return spatialSignedDistance(shape, x, y, options) <= 0
}

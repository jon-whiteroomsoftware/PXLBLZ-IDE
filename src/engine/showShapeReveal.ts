import type { ShowRevealMode, ShowSpatialShape } from './personalContentRecords'

const TAU = Math.PI * 2

export function normalizeShowRevealMode(
  revealMode: ShowRevealMode | undefined,
  legacyInvert: boolean | undefined,
): ShowRevealMode {
  if (revealMode === 'grow-incoming' || revealMode === 'shrink-outgoing') return revealMode
  return legacyInvert ? 'shrink-outgoing' : 'grow-incoming'
}

export function showShapeRevealDistance(input: {
  x: number
  y: number
  centerX: number
  centerY: number
  shape: ShowSpatialShape
  aspect?: number
  rotation?: number
}): number {
  const dx = input.x - input.centerX
  const dy = input.y - input.centerY
  if (input.shape === 'circle' || input.shape === 'ring') return Math.hypot(dx, dy)
  const angle = (input.rotation ?? 0) * TAU
  const rx = dx * Math.cos(angle) + dy * Math.sin(angle)
  const ry = -dx * Math.sin(angle) + dy * Math.cos(angle)
  if (input.shape === 'diamond') return Math.abs(rx) + Math.abs(ry)
  const aspect = Math.min(4, Math.max(0.25, input.aspect ?? 1))
  const rootAspect = Math.sqrt(aspect)
  return Math.max(Math.abs(rx) / rootAspect, Math.abs(ry) * rootAspect)
}

export function showShapeRevealMaxDistance(input: {
  centerX: number
  centerY: number
  shape: ShowSpatialShape
  aspect?: number
  rotation?: number
}): number {
  return Math.max(...([
    [0, 0], [1, 0], [0, 1], [1, 1],
  ] as const).map(([x, y]) => showShapeRevealDistance({ ...input, x, y })))
}

export function showShapeRevealSignedDistance(input: {
  x: number
  y: number
  centerX: number
  centerY: number
  shape: ShowSpatialShape
  progress: number
  revealMode: ShowRevealMode
  scale?: number
  aspect?: number
  rotation?: number
  ringWidth?: number
}): number {
  const progress = Math.min(1, Math.max(0, input.progress))
  const maximum = showShapeRevealMaxDistance(input)
  const radius = maximum
    * (input.revealMode === 'shrink-outgoing' ? 1 - progress : progress)
    * Math.min(2, Math.max(0.25, input.scale ?? 1))
  const distance = showShapeRevealDistance(input)
  if (input.shape === 'ring') return Math.abs(distance - radius) - (input.ringWidth ?? 0.12) / 2
  return input.revealMode === 'shrink-outgoing' ? radius - distance : distance - radius
}

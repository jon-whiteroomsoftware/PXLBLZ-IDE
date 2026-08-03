import type { ShowRevealMode, ShowSpatialShape } from './personalContentRecords'

const TAU = Math.PI * 2

export function normalizeShowRevealMode(
  revealMode: ShowRevealMode | undefined,
): ShowRevealMode {
  if (revealMode === 'grow-incoming' || revealMode === 'shrink-outgoing') return revealMode
  return 'grow-incoming'
}

export function showShapeRevealDistance(input: {
  x: number
  y: number
  centerX: number
  centerY: number
  shape: ShowSpatialShape
  aspect?: number
  rotation?: number
  cornerRadius?: number
  crossWidth?: number
  starPoints?: number
  starInner?: number
  polygonSides?: number
}): number {
  const dx = input.x - input.centerX
  const dy = input.y - input.centerY
  if (input.shape === 'circle' || input.shape === 'ring') return Math.hypot(dx, dy)
  const rotationAngle = (input.rotation ?? 0) * TAU
  const rx = dx * Math.cos(rotationAngle) + dy * Math.sin(rotationAngle)
  const ry = -dx * Math.sin(rotationAngle) + dy * Math.cos(rotationAngle)
  if (input.shape === 'diamond') return Math.abs(rx) + Math.abs(ry)
  const aspect = Math.min(4, Math.max(0.25, input.aspect ?? 1))
  const rootAspect = Math.sqrt(aspect)
  const sx = rx / rootAspect
  const sy = ry * rootAspect
  const box = Math.max(Math.abs(sx), Math.abs(sy))
  const radial = Math.hypot(sx, sy)
  if (input.shape === 'box') return box
  if (input.shape === 'ellipse' || input.shape === 'crescent') return radial
  if (input.shape === 'rounded-box') {
    const roundness = clamp(input.cornerRadius ?? 0.3, 0, 1)
    return box * (1 - roundness) + radial * roundness
  }
  if (input.shape === 'cross') {
    const width = clamp(input.crossWidth ?? 0.32, 0.1, 0.9)
    return Math.min(
      Math.max(Math.abs(sx), Math.abs(sy) / width),
      Math.max(Math.abs(sx) / width, Math.abs(sy)),
    )
  }
  const angle = Math.atan2(sy, sx)
  if (input.shape === 'polygon') {
    const sides = Math.round(clamp(input.polygonSides ?? 6, 3, 8))
    const sector = TAU / sides
    const local = modulo(angle + sector / 2, sector) - sector / 2
    return radial * Math.cos(local) / Math.cos(Math.PI / sides)
  }
  if (input.shape === 'star') {
    const points = Math.round(clamp(input.starPoints ?? 5, 3, 12))
    const inner = clamp(input.starInner ?? 0.45, 0.2, 0.8)
    const phase = modulo(angle / TAU * points, 1)
    const spike = 1 - 2 * Math.abs(phase - 0.5)
    return radial / (inner + (1 - inner) * spike)
  }
  if (input.shape === 'heart') {
    // Two round lobes astride an up-center cleft, and a linear tent for the
    // sharp bottom point; the old smooth-trig boundary could only make an
    // egg (#692).
    const lobes = 0.32 * (
      smoothAngularBump(angle, -Math.PI / 2 - 0.72, 0.9)
      + smoothAngularBump(angle, -Math.PI / 2 + 0.72, 0.9)
    )
    const point = 0.46 * angularBump(angle, Math.PI / 2, 1.9)
    return radial / (0.54 + lobes + point)
  }
  if (input.shape === 'cloud') {
    // Cumulus gauge: a taller center lobe flanked by two side lobes (union by
    // max keeps the scallops), clipped below by the polar trace of the
    // straight line `dy = 0.44` for the flat base.
    const crown = 0.58 + Math.max(
      0.36 * smoothAngularBump(angle, -Math.PI / 2, 0.9),
      0.3 * smoothAngularBump(angle, -2.3, 0.85),
      0.3 * smoothAngularBump(angle, -0.84, 0.85),
    )
    const boundary = Math.min(crown, 0.44 / Math.max(Math.sin(angle), 0.05))
    return radial / boundary
  }
  if (input.shape === 'cat-head') {
    const ears = 0.42 * (
      angularBump(angle, -2.2, 0.38) + angularBump(angle, -0.94, 0.38)
    )
    return radial / (0.72 + ears)
  }
  if (input.shape === 'cat-side-profile') {
    const head = 0.3 * angularBump(angle, -0.2, 0.65)
    const tail = 0.38 * angularBump(angle, -2.75, 0.42)
    const legs = 0.22 * angularBump(angle, 1.35, 0.34)
    return radial / (0.62 + head + tail + legs)
  }
  const ears = 0.34 * (
    angularBump(angle, -1.96, 0.3) + angularBump(angle, -1.18, 0.3)
  )
  const seatedBase = 0.38 * angularBump(angle, Math.PI / 2, 0.68)
  return radial / (0.55 + ears + seatedBase)
}

export function showShapeRevealMaxDistance(input: {
  centerX: number
  centerY: number
  shape: ShowSpatialShape
  aspect?: number
  rotation?: number
  cornerRadius?: number
  crossWidth?: number
  starPoints?: number
  starInner?: number
  polygonSides?: number
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
  cornerRadius?: number
  crossWidth?: number
  starPoints?: number
  starInner?: number
  crescentOffset?: number
  polygonSides?: number
}): number {
  const progress = Math.min(1, Math.max(0, input.progress))
  const maximum = showShapeRevealMaxDistance(input)
  const radius = maximum
    * (input.revealMode === 'shrink-outgoing' ? 1 - progress : progress)
    * Math.min(2, Math.max(0.25, input.scale ?? 1))
  const distance = showShapeRevealDistance(input)
  if (input.shape === 'ring') return Math.abs(distance - radius) - (input.ringWidth ?? 0.12) / 2
  if (input.shape === 'crescent') {
    const angle = (input.rotation ?? 0) * TAU
    const dx = input.x - input.centerX
    const dy = input.y - input.centerY
    const rx = dx * Math.cos(angle) + dy * Math.sin(angle)
    const ry = -dx * Math.sin(angle) + dy * Math.cos(angle)
    const aspect = clamp(input.aspect ?? 1, 0.25, 4)
    const sx = rx / Math.sqrt(aspect)
    const sy = ry * Math.sqrt(aspect)
    const offset = clamp(input.crescentOffset ?? 0.45, 0.15, 0.8) * radius
    const outer = Math.hypot(sx, sy) - radius
    const hole = radius * 0.78 - Math.hypot(sx - offset, sy)
    const crescent = Math.max(outer, hole)
    return input.revealMode === 'shrink-outgoing' ? -crescent : crescent
  }
  return input.revealMode === 'shrink-outgoing' ? radius - distance : distance - radius
}

function angularBump(angle: number, target: number, width: number): number {
  const distance = Math.abs(modulo(angle - target + Math.PI, TAU) - Math.PI)
  return Math.max(0, 1 - distance / width)
}

/** Cosine bell over the folded angular distance; 1 at the target, 0 past `width`. */
function smoothAngularBump(angle: number, target: number, width: number): number {
  const distance = Math.abs(modulo(angle - target + Math.PI, TAU) - Math.PI)
  return 0.5 + 0.5 * Math.cos(Math.PI * Math.min(distance / width, 1))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

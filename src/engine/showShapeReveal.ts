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
  if (input.shape === 'heart') {
    // The classic construction (#63): a 45-degree square with a semicircle
    // on each upper edge. The gauge is the union's - the minimum of the
    // diamond gauge and each lobe's chord gauge (both lobe circles pass
    // through the center, so a ray's chord is 2 * (c . unit)). The old
    // polar bumps could only make a gummy-bear head.
    return heartGauge(sx, sy)
  }
  const angle = Math.atan2(sy, sx)
  if (input.shape === 'polygon') {
    const sides = Math.round(clamp(input.polygonSides ?? 6, 3, 8))
    const sector = TAU / sides
    const local = modulo(angle + sector / 2, sector) - sector / 2
    return radial * Math.cos(local) / Math.cos(Math.PI / sides)
  }
  if (input.shape === 'star') {
    // A straight-edged star polygon pointing up (#63): within each half
    // sector the boundary is the line from an outer tip to an inner vertex,
    // in polar form. The old polar tent gave curved edges and a sideways tip.
    const points = Math.round(clamp(input.starPoints ?? 5, 3, 12))
    const inner = clamp(input.starInner ?? 0.45, 0.2, 0.8)
    const half = Math.PI / points
    const phase = modulo((angle + Math.PI / 2) / TAU * points, 1)
    const psi = Math.min(phase, 1 - phase) * 2 * half
    return radial * (inner * Math.sin(half - psi) + Math.sin(psi)) / (inner * Math.sin(half))
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
  // Concave gauges (the heart cleft, cross and star notches) can peak
  // between the stage corners, and no finite sample set alone is a proof
  // (#692 review P2s). The bound is therefore interval-rigorous: sample
  // angles densely in shape space - inserting the exact notch directions and
  // every corner direction, so within one interval the stage-boundary radial
  // is quasi-convex and peaks at an endpoint - then bound each interval by
  // max(endpoint radial) * (max(endpoint unit gauge) + L * gap / 2), where L
  // is the shape's documented direction-Lipschitz constant (drift-guarded by
  // test). Runs at compile time, never per pixel. Convex silhouettes keep
  // the exact corner evaluation.
  const lipschitz = concaveGaugeDirectionLipschitz(input)
  if (lipschitz === null) {
    return Math.max(...([
      [0, 0], [1, 0], [0, 1], [1, 1],
    ] as const).map(([x, y]) => showShapeRevealDistance({ ...input, x, y })))
  }
  const angles = concaveGaugeNotchAngles(input)
  const sweep = 128
  for (let step = 0; step < sweep; step += 1) angles.push((step / sweep) * TAU)
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    angles.push(shapeSpaceDirectionOf(x, y, input))
  }
  // Directions in which the stage ends at the center itself (a center on the
  // stage boundary) hold no stage points, so they participate as zero-radial
  // samples and refinement converges across the dead arc.
  const sampleAt = (rawAngle: number) => {
    const angle = modulo(rawAngle, TAU)
    const point = shapeDirectionStageBoundaryPoint(angle, input)
    if (!point) return { angle, radial: 0, unitGauge: 0, gauge: 0 }
    const radial = scaledRadialOf(point[0], point[1], input)
    if (radial <= 1e-9) return { angle, radial: 0, unitGauge: 0, gauge: 0 }
    const gauge = showShapeRevealDistance({ ...input, x: point[0], y: point[1] })
    return { angle, radial, unitGauge: gauge / radial, gauge }
  }
  type BoundarySample = ReturnType<typeof sampleAt>
  const seeds = angles
    .map((angle) => sampleAt(angle))
    .sort((a, b) => a.angle - b.angle)
  let best = Math.max(...([
    [0, 0], [1, 0], [0, 1], [1, 1],
  ] as const).map(([x, y]) => showShapeRevealDistance({ ...input, x, y })))
  // Branch and bound: an interval's gauge maximum is at most
  // max(endpoint radial) * (max(endpoint unit gauge) + L * gap / 2), because
  // corner directions are seed samples (so the radial is quasi-convex within
  // each interval) and L dominates the unit gauge's angular slope. Split any
  // interval whose bound exceeds the best sampled gauge until it converges.
  const stack: Array<[BoundarySample, BoundarySample]> = []
  for (let index = 0; index < seeds.length; index += 1) {
    stack.push([seeds[index], seeds[(index + 1) % seeds.length]])
  }
  let residual = 0
  while (stack.length > 0) {
    const [here, next] = stack.pop()!
    best = Math.max(best, here.gauge, next.gauge)
    const gap = modulo(next.angle - here.angle, TAU)
    const bound = Math.max(here.radial, next.radial)
      * (Math.max(here.unitGauge, next.unitGauge) + lipschitz * gap / 2)
    if (bound <= best * (1 + 1e-6)) continue
    if (gap < 1e-6) {
      residual = Math.max(residual, bound)
      continue
    }
    const midpoint = sampleAt(here.angle + gap / 2)
    stack.push([here, midpoint], [midpoint, next])
  }
  return Math.max(best * (1 + 1e-6), residual)
}

/** The scaled-space radial the gauge metrics normalize against. */
function scaledRadialOf(
  x: number,
  y: number,
  input: { centerX: number; centerY: number; aspect?: number; rotation?: number },
): number {
  const rotationAngle = (input.rotation ?? 0) * TAU
  const aspect = Math.min(4, Math.max(0.25, input.aspect ?? 1))
  const rootAspect = Math.sqrt(aspect)
  const dx = x - input.centerX
  const dy = y - input.centerY
  const rx = dx * Math.cos(rotationAngle) + dy * Math.sin(rotationAngle)
  const ry = -dx * Math.sin(rotationAngle) + dy * Math.cos(rotationAngle)
  return Math.hypot(rx / rootAspect, ry * rootAspect)
}

/** The shape-space angle under which a stage point is seen from the center. */
function shapeSpaceDirectionOf(
  x: number,
  y: number,
  input: { centerX: number; centerY: number; aspect?: number; rotation?: number },
): number {
  const rotationAngle = (input.rotation ?? 0) * TAU
  const aspect = Math.min(4, Math.max(0.25, input.aspect ?? 1))
  const rootAspect = Math.sqrt(aspect)
  const dx = x - input.centerX
  const dy = y - input.centerY
  const rx = dx * Math.cos(rotationAngle) + dy * Math.sin(rotationAngle)
  const ry = -dx * Math.sin(rotationAngle) + dy * Math.cos(rotationAngle)
  return Math.atan2(ry * rootAspect, rx / rootAspect)
}

/**
 * A bound on |d(unit-radius gauge)/d(angle)| for each concave silhouette,
 * null for convex silhouettes. Polar shapes use L_b / b_min^2 from their bump
 * slopes and boundary floors; the cross's arm metric slope is 1/width. The
 * constants are drift-guarded by the numeric-derivative test.
 */
function concaveGaugeDirectionLipschitz(input: {
  shape: ShowSpatialShape
  crossWidth?: number
  starPoints?: number
  starInner?: number
}): number | null {
  if (input.shape === 'cross') return 1 / clamp(input.crossWidth ?? 0.32, 0.1, 0.9)
  if (input.shape === 'star') {
    // |d/dpsi| of (inner * sin(half - psi) + sin(psi)) / (inner * sin(half)).
    const points = Math.round(clamp(input.starPoints ?? 5, 3, 12))
    const inner = clamp(input.starInner ?? 0.45, 0.2, 0.8)
    return (1 + inner) / (inner * Math.sin(Math.PI / points))
  }
  // The diamond's unit gauge slopes at most 1 / d; each lobe chord hands
  // over to the diamond at exactly that slope.
  if (input.shape === 'heart') return 1 / HEART_HALF_DIAGONAL * 1.05
  if (input.shape === 'cloud') return 26
  if (input.shape === 'cat-head') return 4.3
  if (input.shape === 'cat-side-profile') return 6.7
  if (input.shape === 'bastet') return 9.4
  return null
}

/** The shape-space directions of each concave silhouette's boundary minima. */
function concaveGaugeNotchAngles(input: {
  shape: ShowSpatialShape
  starPoints?: number
}): number[] {
  if (input.shape === 'cross') {
    return [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]
  }
  if (input.shape === 'star') {
    const points = Math.round(clamp(input.starPoints ?? 5, 3, 12))
    return Array.from({ length: points }, (_, index) => ((index + 0.5) / points) * TAU - Math.PI / 2)
  }
  if (input.shape === 'heart') return [-Math.PI / 2]
  // Bump-built silhouettes have wide valleys; the dense sweep finds them.
  return []
}

/**
 * Casts a shape-space direction through the inverse aspect/rotation mapping
 * to its exit point on the unit stage boundary, or null when the center sits
 * on the boundary pointing outward.
 */
function shapeDirectionStageBoundaryPoint(
  angle: number,
  input: { centerX: number; centerY: number; aspect?: number; rotation?: number },
): [number, number] | null {
  const aspect = Math.min(4, Math.max(0.25, input.aspect ?? 1))
  const rootAspect = Math.sqrt(aspect)
  const rotationAngle = (input.rotation ?? 0) * TAU
  const cosine = Math.cos(rotationAngle)
  const sine = Math.sin(rotationAngle)
  // Inverse of the metric's rotate-then-scale: shape direction -> raw delta.
  const scaledX = Math.cos(angle) * rootAspect
  const scaledY = Math.sin(angle) / rootAspect
  const directionX = scaledX * cosine - scaledY * sine
  const directionY = scaledX * sine + scaledY * cosine
  let travel = Number.POSITIVE_INFINITY
  if (directionX > 1e-12) travel = Math.min(travel, (1 - input.centerX) / directionX)
  if (directionX < -1e-12) travel = Math.min(travel, -input.centerX / directionX)
  if (directionY > 1e-12) travel = Math.min(travel, (1 - input.centerY) / directionY)
  if (directionY < -1e-12) travel = Math.min(travel, -input.centerY / directionY)
  if (!Number.isFinite(travel) || travel <= 0) return null
  return [
    Math.min(1, Math.max(0, input.centerX + travel * directionX)),
    Math.min(1, Math.max(0, input.centerY + travel * directionY)),
  ]
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
  // Ring cannot end covered on its own silhouette, so its inside floods
  // over the reveal's late quarter-power (#63): `fill` runs 1 -> 0 so the
  // band holds its character for most of the move.
  const fraction = input.revealMode === 'shrink-outgoing' ? 1 - progress : progress
  const fill = 1 - fraction * fraction * fraction * fraction
  if (input.shape === 'ring') {
    const halfWidth = (input.ringWidth ?? 0.12) / 2
    const ring = Math.max(distance - radius - halfWidth, (radius - halfWidth) * fill - distance)
    return input.revealMode === 'shrink-outgoing' ? -ring : ring
  }
  if (input.shape === 'crescent') {
    // The crescent keeps its proportions and slides sideways as it scales so
    // its thickest point stays pinned at the reveal center (#63); the
    // thick part alone covers the stage at full radius and the cutout has
    // left the stage to the right, so the reveal ends covered with no cut.
    const angle = (input.rotation ?? 0) * TAU
    const dx = input.x - input.centerX
    const dy = input.y - input.centerY
    const rx = dx * Math.cos(angle) + dy * Math.sin(angle)
    const ry = -dx * Math.sin(angle) + dy * Math.cos(angle)
    const aspect = clamp(input.aspect ?? 1, 0.25, 4)
    const sx = rx / Math.sqrt(aspect)
    const sy = ry * Math.sqrt(aspect)
    const { outerRadius, centerShift, holeOffset } = crescentGeometry(input.crescentOffset, radius)
    const cx = sx - centerShift
    const outer = Math.hypot(cx, sy) - outerRadius
    const hole = CRESCENT_HOLE_RATIO * outerRadius - Math.hypot(cx - holeOffset, sy)
    const crescent = Math.max(outer, hole)
    return input.revealMode === 'shrink-outgoing' ? -crescent : crescent
  }
  return input.revealMode === 'shrink-outgoing' ? radius - distance : distance - radius
}

/** The crescent's cutout radius as a fraction of its outer radius. */
export const CRESCENT_HOLE_RATIO = 0.78

/**
 * Crescent placement for a reveal radius: `radius` is the half-thickness
 * of the crescent's widest part, which sits at the reveal center. The outer
 * circle's center therefore sits `centerShift` to the right, and the cutout
 * `holeOffset` further right of that.
 */
export function crescentGeometry(crescentOffset: number | undefined, radius: number): {
  outerRadius: number
  centerShift: number
  holeOffset: number
} {
  const offset = clamp(crescentOffset ?? 0.45, 0.15, 0.8)
  const halfThickness = (1 + offset - CRESCENT_HOLE_RATIO) / 2
  const outerRadius = radius / halfThickness
  return {
    outerRadius,
    centerShift: ((1 + CRESCENT_HOLE_RATIO - offset) / 2) * outerRadius,
    holeOffset: offset * outerRadius,
  }
}

/** Half-diagonal of the heart's square; lobes are radius d / sqrt(2) at (+-d/2, -d/2). */
export const HEART_HALF_DIAGONAL = 0.8

/** Union gauge of the heart over centered, scaled coordinates (y down). */
export function heartGauge(sx: number, sy: number): number {
  const d = HEART_HALF_DIAGONAL
  const r2 = sx * sx + sy * sy
  let gauge = (Math.abs(sx) + Math.abs(sy)) / d
  const left = -(d / 2) * (sx + sy)
  const right = (d / 2) * (sx - sy)
  // A ray only meets a lobe's far boundary when it points into that lobe;
  // the 0.001 floor skips chords the diamond already dominates and keeps the
  // 16.16 division bounded.
  if (left > 0.001) gauge = Math.min(gauge, r2 / (2 * left))
  if (right > 0.001) gauge = Math.min(gauge, r2 / (2 * right))
  return gauge
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

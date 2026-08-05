import {
  DEFAULT_ORBIT,
  canvasSizeForBounds,
  orbitRotate,
  posBounds2D,
  type Bounds2D,
  type OrbitCamera,
} from './camera'

export type MapDiagnosticPosition =
  | readonly [number, number]
  | readonly [number, number, number]

export interface MapDiagnosticPoint {
  index: number
  x: number
  y: number
  depth: number
}

export interface MapDiagnosticLabel {
  index: number
  label: string
  x: number
  y: number
}

export interface MapDiagnosticViewport {
  width: number
  height: number
  points: MapDiagnosticPoint[]
  labels: MapDiagnosticLabel[]
  coordinateSummary: MapCoordinateSummary
  pointDiameterPx: number
}

export interface MapCoordinateSummary {
  pointCount: number
  uniquePointCount: number
  overlappingPointCount: number
  overlapLocationCount: number
  maxStack: number
}

export interface MapDiagnosticViewportInput {
  positions: readonly MapDiagnosticPosition[]
  displayDimension: 1 | 2 | 3
  containerWidth: number
  camera?: OrbitCamera
}

export interface MapDiagnosticGeometry {
  positions: readonly MapDiagnosticPosition[]
  displayDimension: 1 | 2 | 3
  bounds2D: Bounds2D
  center3D: readonly [number, number, number]
  radius3D: number
  coordinateSummary: MapCoordinateSummary
}

export interface PrepareMapDiagnosticGeometryInput {
  positions: readonly MapDiagnosticPosition[]
  displayDimension: 1 | 2 | 3
}

export interface ProjectMapDiagnosticGeometryInput {
  geometry: MapDiagnosticGeometry
  containerWidth: number
  camera?: OrbitCamera
}

const FRAME_INSET = 0.05
const FIT_MARGIN = 1 - FRAME_INSET * 2
const COORDINATE_PRECISION = 9
const MAX_LABELS = 12
const MIN_LABEL_DISTANCE_PX = 30
const MIN_2D_FRAME_HEIGHT_PX = 80
const MAX_2D_FRAME_ASPECT = 1.25

function projectAxis(value: number, min: number, max: number, start: number, end: number): number {
  if (max <= min) return (start + end) / 2
  const normalized = (value - min) / (max - min)
  const projected = start + normalized * (end - start)
  return Math.round(projected * 1e6) / 1e6
}

function positionZ(position: MapDiagnosticPosition): number {
  return position.length === 3 ? position[2] : 0
}

function axisBounds3D(
  positions: readonly MapDiagnosticPosition[],
  axis: 0 | 1 | 2,
): { min: number; max: number } {
  if (positions.length === 0) return { min: 0, max: 1 }
  let min = Infinity
  let max = -Infinity
  for (const position of positions) {
    const value = axis === 2 ? positionZ(position) : position[axis]
    if (value < min) min = value
    if (value > max) max = value
  }
  return { min, max }
}

function project3D(
  geometry: MapDiagnosticGeometry,
  size: number,
  camera: OrbitCamera,
): MapDiagnosticPoint[] {
  const centered = geometry.positions.map((position) => {
    const point: [number, number, number] = [
      position[0] - geometry.center3D[0],
      position[1] - geometry.center3D[1],
      positionZ(position) - geometry.center3D[2],
    ]
    return point
  })
  const scale = geometry.radius3D > 0 ? FIT_MARGIN / geometry.radius3D : 1

  return centered.map((point, index) => {
    const [x, y, depth] = orbitRotate(point, camera)
    return {
      index,
      x: Math.round((((x * scale + 1) / 2) * size) * 1e6) / 1e6,
      y: Math.round((((1 - y * scale) / 2) * size) * 1e6) / 1e6,
      depth,
    }
  })
}

function summarizeCoordinates(
  positions: readonly MapDiagnosticPosition[],
  displayDimension: 1 | 2 | 3,
): MapCoordinateSummary {
  const stacks = new Map<string, number>()
  for (const position of positions) {
    const key = position
      .slice(0, displayDimension)
      .map((value) => value.toFixed(COORDINATE_PRECISION))
      .join(',')
    stacks.set(key, (stacks.get(key) ?? 0) + 1)
  }
  const counts = [...stacks.values()]
  return {
    pointCount: positions.length,
    uniquePointCount: stacks.size,
    overlappingPointCount: positions.length - stacks.size,
    overlapLocationCount: counts.filter((count) => count > 1).length,
    maxStack: counts.length > 0 ? Math.max(...counts) : 0,
  }
}

function project2D(
  geometry: MapDiagnosticGeometry,
  size: { width: number; height: number },
): MapDiagnosticPoint[] {
  const rangeX = geometry.bounds2D.maxX - geometry.bounds2D.minX
  const rangeY = geometry.bounds2D.maxY - geometry.bounds2D.minY
  const availableWidth = size.width * FIT_MARGIN
  const availableHeight = size.height * FIT_MARGIN
  let plotWidth = availableWidth
  let plotHeight = availableHeight
  if (rangeX > 0 && rangeY > 0) {
    const mapAspect = rangeY / rangeX
    if (availableHeight / availableWidth > mapAspect) {
      plotHeight = availableWidth * mapAspect
    } else {
      plotWidth = availableHeight / mapAspect
    }
  }
  const left = (size.width - plotWidth) / 2
  const top = (size.height - plotHeight) / 2

  return geometry.positions.map((position, index) => ({
    index,
    x: projectAxis(
      position[0],
      geometry.bounds2D.minX,
      geometry.bounds2D.maxX,
      left,
      left + plotWidth,
    ),
    y: projectAxis(
      position[1],
      geometry.bounds2D.minY,
      geometry.bounds2D.maxY,
      top + plotHeight,
      top,
    ),
    depth: 0,
  }))
}

function diagnosticLabels(points: readonly MapDiagnosticPoint[]): MapDiagnosticLabel[] {
  if (points.length === 0) return []
  const candidateCount = Math.min(MAX_LABELS, points.length)
  const candidateIndices = new Set<number>()
  for (let slot = 0; slot < candidateCount; slot += 1) {
    const index = candidateCount === 1
      ? 0
      : Math.round((slot * (points.length - 1)) / (candidateCount - 1))
    candidateIndices.add(index)
  }

  const labels: MapDiagnosticLabel[] = []
  for (const index of candidateIndices) {
    const point = points[index]
    const clear = labels.every((label) => (
      Math.hypot(point.x - label.x, point.y - label.y) >= MIN_LABEL_DISTANCE_PX
    ))
    if (!clear) continue
    labels.push({ index, label: String(index + 1), x: point.x, y: point.y })
  }
  return labels
}

export function prepareMapDiagnosticGeometry({
  positions,
  displayDimension,
}: PrepareMapDiagnosticGeometryInput): MapDiagnosticGeometry {
  const positions2D = positions.map((position) => [position[0], position[1]] as const)
  const bounds2D = posBounds2D(positions2D)
  const xBounds = axisBounds3D(positions, 0)
  const yBounds = axisBounds3D(positions, 1)
  const zBounds = axisBounds3D(positions, 2)
  const center3D: [number, number, number] = [
    (xBounds.min + xBounds.max) / 2,
    (yBounds.min + yBounds.max) / 2,
    (zBounds.min + zBounds.max) / 2,
  ]
  let radius3D = 0
  for (const position of positions) {
    radius3D = Math.max(radius3D, Math.hypot(
      position[0] - center3D[0],
      position[1] - center3D[1],
      positionZ(position) - center3D[2],
    ))
  }
  return {
    positions,
    displayDimension,
    bounds2D,
    center3D,
    radius3D,
    coordinateSummary: summarizeCoordinates(positions, displayDimension),
  }
}

export function projectMapDiagnosticGeometry({
  geometry,
  containerWidth,
  camera = DEFAULT_ORBIT,
}: ProjectMapDiagnosticGeometryInput): MapDiagnosticViewport {
  const width = Math.max(1, Math.round(containerWidth))
  const natural2DSize = canvasSizeForBounds(containerWidth, geometry.bounds2D)
  const size = geometry.displayDimension === 1
    ? { width, height: Math.max(80, Math.round(width / 4)) }
    : geometry.displayDimension === 2
      ? {
        width,
        height: Math.max(
          MIN_2D_FRAME_HEIGHT_PX,
          Math.min(Math.round(width * MAX_2D_FRAME_ASPECT), natural2DSize.height),
        ),
      }
      : { width, height: width }

  const points = geometry.displayDimension === 3
    ? project3D(geometry, size.width, camera)
    : project2D(geometry, size)

  return {
    ...size,
    points,
    labels: diagnosticLabels(points),
    coordinateSummary: geometry.coordinateSummary,
    pointDiameterPx: Math.max(
      2,
      Math.min(6, (size.width / Math.sqrt(Math.max(1, geometry.positions.length))) * 0.35),
    ),
  }
}

export function buildMapDiagnosticViewport({
  positions,
  displayDimension,
  containerWidth,
  camera,
}: MapDiagnosticViewportInput): MapDiagnosticViewport {
  return projectMapDiagnosticGeometry({
    geometry: prepareMapDiagnosticGeometry({ positions, displayDimension }),
    containerWidth,
    camera,
  })
}

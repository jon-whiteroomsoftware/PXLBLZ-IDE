import {
  FIT_3D_MARGIN,
  fit3DScale,
  insetForSpacing,
  modelHalfExtent,
  nearestNeighborSpacing2D,
  posBounds2D,
  projectOrbit,
  projectPosInBounds,
  type OrbitCamera,
} from './camera'
import type { GridDims, MapPoint } from './maps'

export type WirePoint2D = [number, number]
export type WirePoint3D = [number, number, number]

export interface WireGeometry2D {
  kind: '2d'
  displayDim: 1 | 2
  positions: WirePoint2D[]
}

export interface WireGeometry3D {
  kind: '3d'
  displayDim: 3
  positions: WirePoint3D[]
}

export type WireGeometry = WireGeometry2D | WireGeometry3D

export interface WireLabel {
  index: number
  label: string
  x: number
  y: number
}

export interface WireViewportPoint {
  x: number
  y: number
}

export interface MapFacts {
  pixels: number
  arity: '1D' | '2D' | '3D'
  bounds: string
}

const WIRE_START = [42, 42, 48] as const
const WIRE_END = [251, 191, 36] as const

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function pointCoord(point: MapPoint, index: number, count: number): number[] {
  const pos = point.pos
  if (pos && pos.length > 0) return [...pos]
  if (point.sample.length > 0) return [...point.sample]
  const t = count > 1 ? index / (count - 1) : 0.5
  return [t]
}

export function wireGeometry(points: MapPoint[], dim: 1 | 2 | 3): WireGeometry | null {
  if (points.length === 0) return null
  if (dim === 3) {
    return {
      kind: '3d',
      displayDim: 3,
      positions: points.map((point, index) => {
        const coord = pointCoord(point, index, points.length)
        return [
          finiteOr(coord[0], 0),
          finiteOr(coord[1], 0),
          finiteOr(coord[2], 0),
        ]
      }),
    }
  }
  return {
    kind: '2d',
    displayDim: dim,
    positions: points.map((point, index) => {
      const coord = pointCoord(point, index, points.length)
      if (dim === 1 || coord.length === 1) {
        return [finiteOr(coord[0], points.length > 1 ? index / (points.length - 1) : 0.5), 0.5]
      }
      return [finiteOr(coord[0], 0), finiteOr(coord[1], 0)]
    }),
  }
}

export function wireOrderColors(count: number): [number, number, number][] {
  if (count <= 0) return []
  return Array.from({ length: count }, (_, index) => {
    const t = count > 1 ? index / (count - 1) : 0
    return [
      (WIRE_START[0] + (WIRE_END[0] - WIRE_START[0]) * t) / 255,
      (WIRE_START[1] + (WIRE_END[1] - WIRE_START[1]) * t) / 255,
      (WIRE_START[2] + (WIRE_END[2] - WIRE_START[2]) * t) / 255,
    ]
  })
}

// Fit a physical 2D map into Map view's stable wide frame. The SVG surface is
// always 2:1, but the map itself is never stretched: a square map receives
// horizontal breathing room while a wide map fills the frame edge to edge.
// Values are expressed as percentages so the same geometry scales smoothly as
// the pane is resized, without depending on a one-time canvas measurement.
export function wireViewportPoints2D(
  positions: WirePoint2D[],
  frameAspect = 2,
): WireViewportPoint[] {
  if (positions.length === 0) return []
  const bounds = posBounds2D(positions)
  const rangeX = bounds.maxX - bounds.minX
  const rangeY = bounds.maxY - bounds.minY
  const safeAspect = frameAspect > 0 ? frameAspect : 2
  const mapAspect = rangeX > 0 && rangeY > 0 ? rangeX / rangeY : safeAspect
  const widthScale = rangeX > 0 && rangeY > 0 ? Math.min(1, mapAspect / safeAspect) : 1
  const heightScale = rangeX > 0 && rangeY > 0 ? Math.min(1, safeAspect / mapAspect) : 1

  return positions.map(([x, y]) => {
    const normalizedX = rangeX > 0 ? (x - bounds.minX) / rangeX : 0.5
    const normalizedY = rangeY > 0 ? (y - bounds.minY) / rangeY : 0.5
    return {
      x: 50 + (normalizedX - 0.5) * 100 * widthScale,
      y: 50 + (normalizedY - 0.5) * 100 * heightScale,
    }
  })
}

export function wireLabelIndices(count: number, interval = 32): number[] {
  if (count <= 0) return []
  const indices = new Set<number>([0, count - 1])
  const step = Math.max(1, Math.floor(interval))
  for (let oneBased = step; oneBased < count; oneBased += step) {
    indices.add(oneBased - 1)
  }
  return [...indices].sort((a, b) => a - b)
}

export function wireLabels2D(
  positions: WirePoint2D[],
  canvasWidth: number,
  canvasHeight: number,
  indices = wireLabelIndices(positions.length),
): WireLabel[] {
  if (positions.length === 0) return []
  const bounds = posBounds2D(positions)
  const spacing = nearestNeighborSpacing2D(positions)
  const inset = insetForSpacing(spacing)
  return indices
    .filter((index) => index >= 0 && index < positions.length)
    .map((index) => {
      const [clipX, clipY] = projectPosInBounds(positions[index], bounds, inset)
      return {
        index,
        label: String(index + 1),
        x: ((clipX + 1) / 2) * canvasWidth,
        y: ((1 - clipY) / 2) * canvasHeight,
      }
    })
}

export function wireLabels3D(
  positions: WirePoint3D[],
  canvasPx: number,
  camera: OrbitCamera,
  indices = wireLabelIndices(positions.length),
): WireLabel[] {
  if (positions.length === 0) return []
  const scale = fit3DScale(FIT_3D_MARGIN, modelHalfExtent(positions))
  return indices
    .filter((index) => index >= 0 && index < positions.length)
    .map((index) => {
      const { clip } = projectOrbit(positions[index], camera, scale)
      return {
        index,
        label: String(index + 1),
        x: ((clip[0] + 1) / 2) * canvasPx,
        y: ((1 - clip[1]) / 2) * canvasPx,
      }
    })
}

function axisBounds(values: number[]): string {
  if (values.length === 0) return 'n/a'
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (Math.abs(max - min) < 1e-9) return min.toFixed(2)
  return `${min.toFixed(2)}-${max.toFixed(2)}`
}

function gridBounds(gridDims: GridDims | null | undefined): string | null {
  if (!gridDims) return null
  return gridDims.depth === undefined
    ? `${gridDims.cols} x ${gridDims.rows}`
    : `${gridDims.cols} x ${gridDims.rows} x ${gridDims.depth}`
}

export function mapFacts(
  points: MapPoint[],
  dim: 1 | 2 | 3,
  gridDims?: GridDims | null,
): MapFacts {
  const grid = gridBounds(gridDims)
  if (grid) return { pixels: points.length, arity: `${dim}D`, bounds: grid }
  const geometry = wireGeometry(points, dim)
  if (!geometry) return { pixels: 0, arity: `${dim}D`, bounds: 'n/a' }
  if (geometry.kind === '3d') {
    return {
      pixels: points.length,
      arity: '3D',
      bounds: ['x', 'y', 'z']
        .map((axis, axisIndex) => `${axis} ${axisBounds(geometry.positions.map((p) => p[axisIndex]))}`)
        .join(' / '),
    }
  }
  if (geometry.displayDim === 1) {
    return {
      pixels: points.length,
      arity: '1D',
      bounds: `x ${axisBounds(geometry.positions.map((p) => p[0]))}`,
    }
  }
  return {
    pixels: points.length,
    arity: '2D',
    bounds: ['x', 'y']
      .map((axis, axisIndex) => `${axis} ${axisBounds(geometry.positions.map((p) => p[axisIndex]))}`)
      .join(' / '),
  }
}

export function explicitPatternMapUsers<T extends { settings?: { mapId?: string }; name: string }>(
  patterns: T[],
  mapId: string,
): T[] {
  return patterns.filter((pattern) => pattern.settings?.mapId === mapId)
}

export function labelStyle(label: WireLabel, width: number, height: number): { left: string; top: string } {
  return {
    left: `${clamp01(label.x / Math.max(1, width)) * 100}%`,
    top: `${clamp01(label.y / Math.max(1, height)) * 100}%`,
  }
}

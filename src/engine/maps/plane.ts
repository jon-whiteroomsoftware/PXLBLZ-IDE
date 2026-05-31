import type { MapPoint, PixelMap } from './types'

export interface PlaneParams {
  rows: number
  cols: number
}

// Lay a bare pixel count out as the most-square plane that holds it (ADR-0004:
// the count is the knob; the map decides the arrangement, and the stock plane
// has no aspect to honour, so it squares up). `cols = ceil(sqrt(n))` then
// `rows = ceil(n/cols)`, so the grid is always wide-enough and at most one row
// is partial (e.g. 99 → 10×10 with the last cell unused).
export function squarePlaneDims(pixelCount: number): PlaneParams {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return { rows, cols }
}

// Normalize an integer position on [0, n) into [0, 1], matching the legacy grid
// loop's per-axis normalization (`x = col/(cols-1)`). A single-cell axis maps to
// 0 (avoids divide-by-zero), as the old renderer did.
function norm(i: number, n: number): number {
  return n > 1 ? i / (n - 1) : 0
}

// Stock 2D plane / grid — the existing preview grid re-expressed as a map.
// Row-major index order, matching today's `row*cols + col` exactly so the 2D
// no-regression baseline holds. `sample` and map-intrinsic `pos` coincide.
export function planePoint(index: number, params: PlaneParams): MapPoint {
  const { rows, cols } = params
  const col = index % cols
  const row = Math.floor(index / cols)
  const xy: [number, number] = [norm(col, cols), norm(row, rows)]
  return { sample: [...xy], pos: xy }
}

export function createPlaneMap(params: PlaneParams, opts: { id?: string; name?: string } = {}): PixelMap {
  return {
    id: opts.id ?? 'plane',
    name: opts.name ?? 'Plane',
    builtin: true,
    dim: 2,
    resolve(pixelCount: number): MapPoint[] {
      const points: MapPoint[] = []
      for (let i = 0; i < pixelCount; i++) points.push(planePoint(i, params))
      return points
    },
  }
}

import type { MapPoint, PixelMap } from './types'

export interface CylinderParams {
  rows: number // vertical resolution (height)
  cols: number // pixels around the circumference
}

// Choose a rows×cols grid for a bare pixel count so the dots are roughly square
// on the cylinder's visible surface. The columns wrap the full circumference
// (surface length 2πr = π at r=0.5) while the rows span a height of 1, so equal
// counts pack the verticals ~π× tighter than the horizontals. Compensating with
// cols ≈ π·rows (cols = √(πN), rows = ⌈N/cols⌉) makes the front-face spacing
// match in both axes. The last row may be partial, like the stock plane.
export function cylinderDims(pixelCount: number): CylinderParams {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  const cols = Math.max(1, Math.round(Math.sqrt(Math.PI * n)))
  const rows = Math.ceil(n / cols)
  return { rows, cols }
}

// Wrap a 2D grid onto the lateral surface of a cylinder. This is the one map
// where `sample` and `pos` deliberately diverge: the pattern still sees flat
// [u,v] grid coordinates (so a plain render2D pattern runs unchanged), but each
// pixel is DRAWN in 3D on the cylinder wall — so the standard 3D orbit camera
// applies, exactly like the cube. dim:2 keeps it offered to 2D patterns;
// displayDim:3 routes it through the orbit renderer.

// Normalize a height index on [0, rows) into [0,1]; a single row sits at the
// bottom (matches the plane's degenerate-axis behaviour).
function vNorm(i: number, n: number): number {
  return n > 1 ? i / (n - 1) : 0
}

// One pixel of a rows×cols grid wrapped around a cylinder of radius 0.5 centred
// in the unit cube. The circumference wraps fully (u = col/cols, so the seam is
// a one-step gap, not an overlap, like LEDs around a tube). x-fastest, matching
// the plane's row-major order.
export function cylinderPoint(index: number, params: CylinderParams): MapPoint {
  const { rows, cols } = params
  const col = index % cols
  const row = Math.floor(index / cols)
  const u = cols > 0 ? col / cols : 0 // around: 0..1 (wraps)
  const v = vNorm(row, rows) // height: 0..1
  const a = u * 2 * Math.PI
  const x = 0.5 + 0.5 * Math.cos(a)
  const z = 0.5 + 0.5 * Math.sin(a)
  return { sample: [u, v], pos: [x, v, z] }
}

export function createCylinderMap(
  params: CylinderParams,
  opts: { id?: string; name?: string } = {},
): PixelMap {
  return {
    id: opts.id ?? 'cylinder',
    name: opts.name ?? 'Cylinder',
    builtin: true,
    dim: 2, // sample arity: a render2D pattern consumes it
    displayDim: 3, // drawn in 3D — gets the orbit camera
    resolve(pixelCount: number): MapPoint[] {
      const points: MapPoint[] = []
      for (let i = 0; i < pixelCount; i++) points.push(cylinderPoint(i, params))
      return points
    },
  }
}

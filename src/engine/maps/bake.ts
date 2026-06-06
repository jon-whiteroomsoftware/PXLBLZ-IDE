import { evalMapSource } from './evalMapSource'
import { inferDim } from './custom'
import { normalizeAspect } from './normalize'
import type { GridDims } from './types'

// Two raw axis values count as the same lattice line when within this epsilon.
// Map sources emit integer/clean indices, so an exact compare would do; the
// tolerance only guards against trivial float noise (e.g. i/(n) round-trips).
const AXIS_EPS = 1e-9

// Cluster a single axis's values into its distinct sorted lattice lines.
function distinctSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > AXIS_EPS) out.push(v)
  }
  return out
}

// Detect whether a raw coordinate array forms a regular axis-aligned lattice and,
// if so, return its integer dims. A lattice is recognised when the
// product of each axis's distinct-value count equals the point count AND every
// lattice cell is occupied exactly once — so a 20×10 grid yields {cols:20,rows:10}
// but a ring, a diagonal, or any irregular cloud yields null (the readout then
// shows no dims rather than inventing a meaningless extent). `cols` is the x-axis
// line count, `rows` the y-axis, `depth` the z-axis — matching the stock plane's
// `cols×rows` label convention.
export function detectGridDims(coords: number[][]): GridDims | null {
  if (coords.length === 0) return null
  const arity = coords[0].length
  if (arity !== 2 && arity !== 3) return null
  const axes: number[][] = []
  for (let a = 0; a < arity; a++) axes.push(distinctSorted(coords.map((c) => c[a])))
  const product = axes.reduce((p, ax) => p * ax.length, 1)
  if (product !== coords.length) return null
  // Confirm a full lattice: each (lineIndex per axis) tuple occupied once.
  const lineIndex = (a: number, v: number): number =>
    axes[a].findIndex((x) => Math.abs(x - v) <= AXIS_EPS)
  const seen = new Set<string>()
  for (const c of coords) {
    const key = c.map((v, a) => lineIndex(a, v)).join(',')
    if (seen.has(key)) return null
    seen.add(key)
  }
  return arity === 3
    ? { cols: axes[0].length, rows: axes[1].length, depth: axes[2].length }
    : { cols: axes[0].length, rows: axes[1].length }
}

export interface BakedMap {
  // Coordinates normalized aspect-preserving into [0,1] (longest
  // axis fills the unit interval), ready to freeze into a custom map's replay array.
  points: number[][]
  // Sample/display arity, inferred from the raw coords' arity.
  dim: 2 | 3
  // Recorded grid dims when the points form a regular lattice; null otherwise.
  gridDims: GridDims | null
}

// Evaluate a map source (plain-JS `new Function`, float64) at the
// given count and bake the result: validate arity, detect any regular grid, and
// normalize to [0,1]. Throws a descriptive error if the source fails to compile,
// throws while running, or returns empty/mixed/invalid-arity coordinates — the
// caller surfaces that without crashing the preview. Normalization is
// aspect-preserving: a 2:1 map bakes to a 2:1 rectangle, not a square.
export function bakeMapSource(source: string, pixelCount: number): BakedMap {
  const raw = evalMapSource(source, pixelCount)
  const dim = inferDim(raw)
  const gridDims = detectGridDims(raw)
  const points = normalizeAspect(raw)
  return { points, dim, gridDims }
}

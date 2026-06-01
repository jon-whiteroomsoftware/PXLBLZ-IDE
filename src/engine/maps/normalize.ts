// The shared map normalize pass (ADR-0008, ADR-0009). Stock map sources return
// RAW natural-unit geometry (row/col indices, lattice indices, raw cos/sin in
// [-1,1]); this single engine pass maps that geometry into [0,1], mirroring how
// firmware normalizes a map's coordinates at bake time. This replaces the per-map
// hand-baked `i/(n-1)` that each TS generator used to do.
//
// Normalization is ASPECT-PRESERVING, anchored to the longest axis (ADR-0009):
// every axis is divided by the SINGLE largest axis range, so the longest axis
// fills [0,1] and shorter axes get a proportionally smaller range (a 15×10 map →
// long axis 0..1, short axis 0..0.667). No axis ever exceeds 1.0. This supersedes
// the old per-axis stretch (each axis independently → [0,1]), a vestige of the
// square-only 2D renderer that collapsed 15×10, 10×15, and 12×12 maps all to the
// same unit square — destroying the map's true shape on both the drawn `pos` and
// the pattern's `sample`. The map is authoritative for aspect (ADR-0009); the
// preview and the pattern both see the true proportion.
//
// A fully degenerate input (all points coincident, longest range 0) collapses to
// the origin — the single-point / single-cell convention.

// Normalize a raw coordinate array, aspect-preserving, into [0,1] (longest axis
// fills the unit interval). All coords must share the same arity (the caller's
// source is responsible for that). Returns a fresh array; input is not mutated.
export function normalizeAspect(coords: number[][]): number[][] {
  if (coords.length === 0) return []
  const arity = coords[0].length
  const min = new Array<number>(arity).fill(Infinity)
  const max = new Array<number>(arity).fill(-Infinity)
  for (const c of coords) {
    for (let a = 0; a < arity; a++) {
      if (c[a] < min[a]) min[a] = c[a]
      if (c[a] > max[a]) max[a] = c[a]
    }
  }
  // Divide every axis by the single longest range so aspect is preserved; the
  // longest axis maps to [0,1], shorter axes to [0, range_a / longest].
  const longest = Math.max(...min.map((mn, a) => max[a] - mn))
  return coords.map((c) =>
    c.map((v, a) => (longest > 0 ? (v - min[a]) / longest : 0)),
  )
}

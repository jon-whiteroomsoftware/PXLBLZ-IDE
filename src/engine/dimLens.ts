// The "dimension lens" model (#251): a single-select filter over the pattern rail.
// Pure, framework-free — the rail is a thin consumer of these predicates.
//
// A lens is `'all'` (no filtering) or one canonical dimension. Items are filtered by
// their CANONICAL `nativeDimension` (the highest render fn a pattern defines), NOT by
// dimension membership — consistent with the preview lock. A pattern defining both
// `render` and `render3D` is "3D" and appears only under the 3D lens.

import { exportedDims } from './exportedDims'

export type DimLens = 'all' | 1 | 2 | 3

// The canonical dimension of a pattern source: the highest render fn it defines.
// Defaults to 2 when none is defined, matching `nativeDimension`'s default so the
// lens and the preview lock agree.
export function nativeDim(src: string): 1 | 2 | 3 {
  const dims = exportedDims(src)
  return dims.length ? (Math.max(...dims) as 1 | 2 | 3) : 2
}

// Does an item of canonical dimension `dim` survive the current lens? `'all'` always
// passes; a dimension lens passes only exact matches.
export function matchesLens(dim: 1 | 2 | 3, lens: DimLens): boolean {
  return lens === 'all' || dim === lens
}

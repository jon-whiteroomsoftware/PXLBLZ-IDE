import type { GeometryFamilyView, GridDims, MapCatalogueKind, MapPoint, NormalRecipe, PixelMap } from './types'
import { evalMapSource } from './evalMapSource'
import { normalizeAspect } from './normalize'
import { squarePlaneDims, widePlaneDims } from './plane'

// A stock generator's count→dims recipe: the catalogue tags the entry;
// createSourceMap maps the tag to the live derivation. Absent ⇒ the map exposes no
// clean grid (an irregular cloud, a shell), so `gridDims` returns null. The 2D
// recipes back a wrappable plane; `cube` describes the volumetric side³ lattice.
export type GridRecipe = 'square' | 'wide' | 'cube'

// The cube source cubes the count up to a side³ lattice with side = round(cbrt(n))
// (sources/cube.js). By the time dims are read the count is the realized side³, so
// the same formula recovers the side exactly — no clamp needed here.
function cubeGridDims(pixelCount: number): GridDims {
  const side = Math.max(1, Math.round(Math.cbrt(Math.max(1, Math.floor(pixelCount) || 1))))
  return { cols: side, rows: side, depth: side }
}

const GRID_FNS: Record<GridRecipe, (pixelCount: number) => GridDims> = {
  square: squarePlaneDims,
  wide: widePlaneDims,
  cube: cubeGridDims,
}

// Metadata pairing a stock map's identity with its raw `.js` source.
// The source is the single source of truth; `dim`/`displayDim`/`name` are the
// thin catalogue overlay the source itself doesn't carry.
export interface SourceMapSpec {
  id: string
  name: string
  kind: MapCatalogueKind
  dim: 1 | 2 | 3
  displayDim?: 1 | 2 | 3
  family?: GeometryFamilyView
  // Raw Mapper JavaScript (Vite `?raw` text): either a literal coordinate array
  // or `function(pixelCount){ … return coords }`.
  source: string
  // Optional shared physical-position source for a generated geometry family.
  // Its selected view source still owns `sample`; this source owns preview `pos`.
  positionSource?: string
  // Provenance-gated normal recipe: set only on a stock 3D shell
  // the catalogue vouches for, so the preview derives the matching per-point normal
  // and offers the solidity slider. Carried through onto the PixelMap.
  normals?: NormalRecipe
  // The count→grid recipe for a wrappable 2D generator; absent ⇒ the
  // map has no clean lattice. Backs the PixelMap's `gridDims` method.
  grid?: GridRecipe
}

// Build a source-backed PixelMap. `resolve(pixelCount)` runs the raw source
// through the no-shim `new Function` primitive and the shared aspect-preserving
// normalize pass. Function sources regenerate for any count; literal coordinate
// arrays intentionally keep their measured point count. The normalized coords
// serve as both the render-fn `sample` and the drawn `pos`, so a non-square stock
// map (e.g. a count the plane squares to N×M) shows its true proportion on both
// channels.
export function createSourceMap(spec: SourceMapSpec): PixelMap {
  return {
    id: spec.id,
    name: spec.name,
    builtin: true,
    kind: spec.kind,
    dim: spec.dim,
    ...(spec.displayDim !== undefined ? { displayDim: spec.displayDim } : {}),
    ...(spec.family ? { family: spec.family } : {}),
    ...(spec.normals ? { normals: spec.normals } : {}),
    gridDims: spec.grid ? (pixelCount: number) => GRID_FNS[spec.grid!](pixelCount) : () => null,
    resolve(pixelCount: number): MapPoint[] {
      const samples = normalizeAspect(evalMapSource(spec.source, pixelCount))
      const positions = spec.positionSource
        ? normalizeAspect(evalMapSource(spec.positionSource, pixelCount))
        : samples
      if (positions.length !== samples.length) {
        throw new Error(`map ${spec.id} position source returned ${positions.length} points for ${samples.length} samples`)
      }
      return samples.map((sample, index) => ({
        sample: [...sample],
        ...(spec.dim === 1 && !spec.positionSource
          ? {}
          : { pos: [...positions[index]] as MapPoint['pos'] }),
      }))
    },
  }
}

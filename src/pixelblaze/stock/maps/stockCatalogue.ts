import { createSourceMap, type SourceMapSpec } from '@/engine/maps/sourceMap'
import type { PixelMap } from '@/engine/maps/types'

// Raw `.js` map sources, read as text: each file is either a self-contained
// `function(pixelCount){ … }` generator or a literal coordinate array,
// pasteable into a real Pixelblaze Mapper tab. The filename is the source key.
const rawSources = import.meta.glob('./sources/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function source(name: string): string {
  const entry = rawSources[`./sources/${name}.js`]
  if (entry === undefined) throw new Error(`missing stock map source: ${name}.js`)
  return entry
}

function strandView(options: {
  id: string
  familyId: string
  familyName: string
  kind: SourceMapSpec['kind']
  positionSource: string
  displayDim: 2 | 3
  grid?: SourceMapSpec['grid']
  normals?: SourceMapSpec['normals']
}): SourceMapSpec {
  return {
    id: options.id,
    name: `${options.familyName} · Strand`,
    kind: options.kind,
    dim: 1,
    displayDim: options.displayDim,
    source: source('strand'),
    positionSource: options.positionSource,
    ...(options.grid ? { grid: options.grid } : {}),
    ...(options.normals ? { normals: options.normals } : {}),
    family: { id: options.familyId, name: options.familyName, view: 'strand' },
  }
}

// The thin catalogue: stock map identity/metadata paired with its `?raw` source.
// Generated families retain one physical position source while each supported
// coordinate view remains an ordinary standalone Mapper source. The legacy
// preview-only Cylinder surface embedding still exists for arbitrary 2D grids;
// the Cylinder family below is the hardware-real wall geometry.
export const STOCK_MAP_SPECS: SourceMapSpec[] = [
  {
    id: 'plane', name: 'Square', kind: 'surface', dim: 2, source: source('plane'),
    positionSource: source('plane'), grid: 'square',
    family: { id: 'square-grid', name: 'Square', view: 'surface', natural: true },
  },
  strandView({
    id: 'plane-strand', familyId: 'square-grid', familyName: 'Square', kind: 'surface',
    positionSource: source('plane'), displayDim: 2, grid: 'square',
  }),
  {
    id: 'wide', name: 'Wide 2:1', kind: 'surface', dim: 2, source: source('wide'),
    positionSource: source('wide'), grid: 'wide',
    family: { id: 'wide-grid', name: 'Wide 2:1', view: 'surface', natural: true },
  },
  strandView({
    id: 'wide-strand', familyId: 'wide-grid', familyName: 'Wide 2:1', kind: 'surface',
    positionSource: source('wide'), displayDim: 2, grid: 'wide',
  }),
  {
    id: 'panel-winding', name: '2D panel winding', kind: 'surface', dim: 2,
    source: source('panel-winding'), positionSource: source('panel-winding'), grid: 'square',
    family: { id: 'panel-winding', name: '2D panel winding', view: 'surface', natural: true },
  },
  strandView({
    id: 'panel-winding-strand', familyId: 'panel-winding', familyName: '2D panel winding',
    kind: 'surface', positionSource: source('panel-winding'), displayDim: 2, grid: 'square',
  }),
  {
    id: 'cylinder-strand',
    name: 'Cylinder · Strand',
    kind: 'surface',
    dim: 1,
    displayDim: 3,
    source: source('cylinder-strand'),
    positionSource: source('cylinder-spatial'),
    grid: 'square',
    normals: 'cylinder',
    family: { id: 'cylinder', name: 'Cylinder', view: 'strand' },
  },
  {
    id: 'cylinder-surface',
    name: 'Cylinder · Surface',
    kind: 'surface',
    dim: 2,
    displayDim: 3,
    source: source('cylinder-surface'),
    positionSource: source('cylinder-spatial'),
    grid: 'square',
    normals: 'cylinder',
    family: { id: 'cylinder', name: 'Cylinder', view: 'surface', natural: true },
  },
  {
    id: 'cylinder-spatial',
    name: 'Cylinder · Spatial',
    kind: 'surface',
    dim: 3,
    displayDim: 3,
    source: source('cylinder-spatial'),
    positionSource: source('cylinder-spatial'),
    grid: 'square',
    normals: 'cylinder',
    family: { id: 'cylinder', name: 'Cylinder', view: 'spatial' },
  },
  strandView({
    id: 'cube-volume-strand', familyId: 'cube-volume', familyName: 'Cube volume',
    kind: 'volume', positionSource: source('cube'), displayDim: 3, grid: 'cube',
  }),
  {
    id: 'cube', name: 'Cube volume', kind: 'volume', dim: 3, source: source('cube'),
    positionSource: source('cube'), grid: 'cube',
    family: { id: 'cube-volume', name: 'Cube volume', view: 'spatial', natural: true },
  },
  // The faceted shell sibling of the volume cube: points on the six
  // faces, solid-eligible via per-face normals the preview derives (faceNormals,
  // the dominant axis of pos − centre) rather than the sphere's centroid radial.
  strandView({
    id: 'cube-shell-strand', familyId: 'cube-shell', familyName: 'Cube shell', kind: 'shell',
    positionSource: source('cube-shell'), displayDim: 3, normals: 'face',
  }),
  {
    id: 'cube-shell', name: 'Cube shell', kind: 'shell', dim: 3,
    source: source('cube-shell'), positionSource: source('cube-shell'), normals: 'face',
    family: { id: 'cube-shell', name: 'Cube shell', view: 'spatial', natural: true },
  },
  // The Star joins the shell/volume scheme (the lone wireframe star is
  // retired). The shell scatters points over the 60 stellation triangles and is
  // solid-eligible via per-face normals the preview derives (starShellNormals);
  // the volume fills the spiky solid and has no per-point normal.
  strandView({
    id: 'star-shell-strand', familyId: 'star-shell', familyName: 'Star shell', kind: 'shell',
    positionSource: source('star-shell'), displayDim: 3, normals: 'star',
  }),
  {
    id: 'star-shell', name: 'Star shell', kind: 'shell', dim: 3,
    source: source('star-shell'), positionSource: source('star-shell'), normals: 'star',
    family: { id: 'star-shell', name: 'Star shell', view: 'spatial', natural: true },
  },
  strandView({
    id: 'star-volume-strand', familyId: 'star-volume', familyName: 'Star volume',
    kind: 'volume', positionSource: source('star-volume'), displayDim: 3,
  }),
  {
    id: 'star-volume', name: 'Star volume', kind: 'volume', dim: 3,
    source: source('star-volume'), positionSource: source('star-volume'),
    family: { id: 'star-volume', name: 'Star volume', view: 'spatial', natural: true },
  },
  // The Sphere is a convex shell, so the catalogue vouches it solid-eligible
  //: the preview re-derives outward normals via normalize(pos −
  // centroid) and offers the solidity slider. The volumetric Cube has no per-
  // point normal, so it is not flagged.
  strandView({
    id: 'sphere-shell-strand', familyId: 'sphere-shell', familyName: 'Sphere shell',
    kind: 'shell', positionSource: source('sphere'), displayDim: 3, normals: 'centroid',
  }),
  {
    id: 'seed-sphere-3d', name: 'Sphere shell', kind: 'shell', dim: 3,
    source: source('sphere'), positionSource: source('sphere'), normals: 'centroid',
    family: { id: 'sphere-shell', name: 'Sphere shell', view: 'spatial', natural: true },
  },
  // The solid sibling of the Sphere shell: points fill the interior of
  // the ball. A volume has no per-point boundary normal, so it is NOT solid-
  // eligible — it relies on the renderer's depth-tested opaque cores instead.
  strandView({
    id: 'sphere-volume-strand', familyId: 'sphere-volume', familyName: 'Sphere volume',
    kind: 'volume', positionSource: source('sphere-volume'), displayDim: 3,
  }),
  {
    id: 'sphere-volume', name: 'Sphere volume', kind: 'volume', dim: 3,
    source: source('sphere-volume'), positionSource: source('sphere-volume'),
    family: { id: 'sphere-volume', name: 'Sphere volume', view: 'spatial', natural: true },
  },
  // The Tetrahedron (a four-sided die / d4) joins the shell/volume scheme
  // as the simplest faceted case: 4 triangular faces. The shell scatters cell-
  // centre points over the four faces and is solid-eligible via per-face normals
  // the preview derives (tetraShellNormals); the volume fills the convex solid and
  // has no per-point normal.
  strandView({
    id: 'tetra-shell-strand', familyId: 'tetra-shell', familyName: 'Tetra shell',
    kind: 'shell', positionSource: source('tetra-shell'), displayDim: 3, normals: 'tetra',
  }),
  {
    id: 'tetra-shell', name: 'Tetra shell', kind: 'shell', dim: 3,
    source: source('tetra-shell'), positionSource: source('tetra-shell'), normals: 'tetra',
    family: { id: 'tetra-shell', name: 'Tetra shell', view: 'spatial', natural: true },
  },
  strandView({
    id: 'tetra-volume-strand', familyId: 'tetra-volume', familyName: 'Tetra volume',
    kind: 'volume', positionSource: source('tetra-volume'), displayDim: 3,
  }),
  {
    id: 'tetra-volume', name: 'Tetra volume', kind: 'volume', dim: 3,
    source: source('tetra-volume'), positionSource: source('tetra-volume'),
    family: { id: 'tetra-volume', name: 'Tetra volume', view: 'spatial', natural: true },
  },
  { id: 'sunflower-pucks', name: 'Sunflower pucks', kind: 'custom', dim: 3, source: source('sunflower-pucks') },
  { id: 'sunflower-pucks-2d', name: 'Sunflower pucks 2D', kind: 'custom', dim: 2, source: source('sunflower-pucks-2d') },
  { id: 'seed-ring-2d', name: 'Ring', kind: 'path', dim: 2, source: source('ring') },
]

// The source-backed stock maps as live PixelMaps.
export const SOURCE_STOCK_MAPS: PixelMap[] = STOCK_MAP_SPECS.map(createSourceMap)

// Stable id lookup for a stock map's raw source — used by the New Map "Load
// template" path (#143/#151) and to look a spec up by id.
export function stockMapSpec(id: string): SourceMapSpec | undefined {
  return STOCK_MAP_SPECS.find((s) => s.id === id)
}

// The ids of the relocated #140 example clouds — used to prune rows an earlier
// build seeded into the `maps` IDB store before they became stock.
export const SEED_MAP_IDS: string[] = ['seed-sphere-3d', 'seed-ring-2d']

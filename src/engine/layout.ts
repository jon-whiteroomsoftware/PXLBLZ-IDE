// The Layout controls' routing logic — pure, no React/DOM.
//
// Layout is two orthogonal controls, not one union dropdown:
//   • the MAP control owns `sample` (the [u,v] the pattern reads), and
//   • the EMBEDDING control owns `pos` (where each dot is drawn) — populated
//     from the active map dimension: Shapes for 1D, Surfaces for 2D, none for 3D.
// Every Pattern may select every map; native dimension only orders Recommended
// ahead of Other dimensions.
//
// This module owns (a) compatibility ordering for maps, (b) the embedding list
// for the active map dimension, (c) routing
// a chosen option to the right knob, and (d) resolving a pattern's persisted
// selection (or a default) on open. The components are thin wrappers over these.

import type { ShapeId } from './shapes'
import type { SurfaceId } from './surfaces'
import type { CoordinateView, GeometryFamilyView, MapPoint, PixelMap, NormalizeMode, NormalRecipe, GridDims } from './maps'
import { cubePixelCount, applyNormalizeMode } from './maps'
import {
  SHAPES,
  embedPositions,
  resolvePole,
} from './shapes'
import { cylinderSurfacePositions, cylinderSurfaceNormals } from './surfaces'
import { clampPixelCount, cubeSideForCount } from './camera'
import { centroidNormals, faceNormals } from './centroidNormals'
import { starShellNormals } from './maps/starGeometry'
import { tetraShellNormals } from './maps/tetraGeometry'

// The map a NormalRecipe tag resolves to its derivation: the
// catalogue declares the recipe NAME; the resolver owns the function lookup, so
// no map-id strings leak in here. A new shell ships its recipe in the catalogue.
const NORMAL_FNS: Record<NormalRecipe, (positions: [number, number, number][]) => [number, number, number][]> = {
  face: faceNormals,
  star: starShellNormals,
  tetra: tetraShellNormals,
  centroid: centroidNormals,
  cylinder: (positions) => positions.map(([x, , z]) => {
    const dx = x - 0.5
    const dz = z - 0.5
    const length = Math.hypot(dx, dz) || 1
    return [dx / length, 0, dz / length]
  }),
}

export type LayoutKind = 'shape' | 'surface' | 'map'

export interface LayoutOption {
  kind: LayoutKind
  id: string // ShapeId / SurfaceId for embeddings, map id for maps
  name: string
  // DISPLAY dimension of the option (a 1D pattern's ring reads as 2D display; a
  // 2D pattern's cylinder reads as 3D).
  displayDim: 1 | 2 | 3
  // Map options are progressively disclosed by compatibility with the Pattern.
  group?: 'recommended' | 'other'
  // Installed/sample dimension. Deliberately independent of displayDim.
  mapDim?: 1 | 2 | 3
  // Preserved for secondary presentation/provenance even though compatibility
  // is the selector's primary grouping axis.
  provenance?: 'stock' | 'user'
  // The 1D Index option represents Pixelblaze's no-map coordinate convention,
  // not a persisted Map entity or a blob that can be sent to hardware.
  implicit?: boolean
}

// Reversible default for 1D Patterns: no installed map, so firmware supplies
// x = index / pixelCount. Kept outside the map catalogue because it is not a
// Map entity and must never appear in Map mode or Controller map pushes.
export const INDEX_MAP_ID = '__index__'

export interface ShapeMeta {
  id: ShapeId
  name: string
  displayDim: 1 | 2 | 3
}

export interface SurfaceMeta {
  id: SurfaceId
  name: string
  displayDim: 2 | 3
  // Whether this surface requires a map's integer grid (cylinder yes, flat no).
  needsGrid: boolean
}

export interface MapMeta {
  id: string
  name: string
  // Sample arity — the active map dimension, independent of Pattern renderers.
  dim: 1 | 2 | 3
  // How the map is DRAWN, when it differs from `dim`. Absent ⇒ same as `dim`.
  displayDim?: 1 | 2 | 3
  // Whether the map exposes a clean integer `cols×rows` grid a surface can wrap
  // The stock Square/Wide and regular-lattice custom maps qualify;
  // an irregular cloud does not, so it is offered Flat only.
  wrappable?: boolean
  // True for a built-in stock map, false/absent for a user-authored one — drives the
  // stock/user subgrouping in the map dropdown.
  stock?: boolean
  family?: GeometryFamilyView
}

export interface LayoutSource {
  shapes: ShapeMeta[]
  surfaces: SurfaceMeta[]
  maps: MapMeta[]
}

// Every map is available. Exact-dimensional options are Recommended; the rest
// follow under Other dimensions. Index is the reversible no-map 1D view.
export function mapOptions(nativeDim: 1 | 2 | 3, source: LayoutSource): LayoutOption[] {
  const candidates: LayoutOption[] = [
    {
      kind: 'map',
      id: INDEX_MAP_ID,
      name: 'Index',
      displayDim: 1,
      mapDim: 1,
      implicit: true,
    },
    ...source.maps.filter((m) => !m.family || m.family.natural).map((m) => ({
      kind: 'map' as const,
      id: m.id,
      name: m.family?.name ?? m.name,
      displayDim: m.displayDim ?? m.dim,
      mapDim: m.dim,
      provenance: m.stock ? ('stock' as const) : ('user' as const),
    })),
  ]
  const recommended: LayoutOption[] = candidates
    .filter((option) => option.mapDim === nativeDim)
    .map((option) => ({ ...option, group: 'recommended' }))
  const other: LayoutOption[] = candidates
    .filter((option) => option.mapDim !== nativeDim)
    .map((option) => ({ ...option, group: 'other' }))
  return [...recommended, ...other]
}

export interface CoordinateViewOption {
  mapId: string
  view: CoordinateView
  label: string
  dim: 1 | 2 | 3
}

const VIEW_LABELS: Record<CoordinateView, string> = {
  strand: 'Strand',
  surface: 'Surface',
  spatial: 'Spatial',
}

// The top-level Map selector shows one natural entry per family. A persisted
// alternate view therefore resolves back to that entry without changing the
// actual selected map id.
export function selectedFamilyOptionId(mapId: string | undefined, source: LayoutSource): string | undefined {
  const active = source.maps.find((map) => map.id === mapId)
  if (!active?.family) return mapId
  return source.maps.find((map) => map.family?.id === active.family?.id && map.family?.natural)?.id ?? mapId
}

export function coordinateViewOptions(mapId: string | undefined, source: LayoutSource): CoordinateViewOption[] {
  const active = source.maps.find((map) => map.id === mapId)
  if (!active?.family) return []
  return source.maps
    .filter((map) => map.family?.id === active.family?.id)
    .map((map) => ({
      mapId: map.id,
      view: map.family!.view,
      label: VIEW_LABELS[map.family!.view],
      dim: map.dim,
    }))
}

// Embedding options come from the active map: Shapes for 1D (each owns only
// `pos`, independently of `[x]` sampling), and Surfaces for 2D. Surfaces that need a grid are offered
// only when the active map is wrappable; an irregular 2D map gets Flat alone —
// and a single-option embedding control is hidden by the component. A 3D map has
// no embedding choice because it owns its positions.
export function embeddingOptions(
  mapDim: 1 | 2 | 3,
  source: LayoutSource,
  activeMap?: MapMeta,
): LayoutOption[] {
  if (activeMap?.family) return []
  if (mapDim === 1) {
    return source.shapes.map((s) => ({
      kind: 'shape' as const,
      id: s.id,
      name: s.name,
      displayDim: s.displayDim,
    }))
  }
  if (mapDim === 3) return []
  const wrappable = activeMap?.wrappable ?? false
  return source.surfaces
    .filter((s) => wrappable || !s.needsGrid)
    .map((s) => ({ kind: 'surface' as const, id: s.id, name: s.name, displayDim: s.displayDim }))
}

// The per-pattern layout selection persisted on `PatternRecord`.
export interface LayoutSelection {
  mapId?: string
  shapeId?: string
  surfaceId?: SurfaceId
}

// Route a chosen option to the knob it sets: shapes → `shapeId`, surfaces →
// `surfaceId`, maps → `mapId`.
export function selectionForOption(opt: LayoutOption): LayoutSelection {
  if (opt.kind === 'shape') return { shapeId: opt.id }
  if (opt.kind === 'surface') return { surfaceId: opt.id as SurfaceId }
  return { mapId: opt.id }
}

// The id the MAP control shows as selected. Map and embedding are orthogonal in
// every dimension, including a 1D map paired with a Shape.
export function selectedMapId(sel: LayoutSelection, _nativeDim: 1 | 2 | 3): string | undefined {
  return sel.mapId
}

// The id the EMBEDDING control shows as selected: a 1D pattern reads its
// `shapeId`; a 2D pattern its `surfaceId` (defaulting to Flat). 3D has none.
export function selectedEmbeddingId(
  sel: LayoutSelection,
  mapDim: 1 | 2 | 3,
): string | undefined {
  if (mapDim === 1) return sel.shapeId
  if (mapDim === 2) return sel.surfaceId ?? 'flat'
  return undefined
}

// Resolve the on-open solidity for a layout, the same precedence
// family as the recommended map/count: a user pattern's PERSISTED solidity wins
// outright; otherwise a demo's RECOMMENDED solidity is the on-open default ahead
// of the global `fallback` (1.0). A demo persists nothing, so the recommendation
// only sets the starting point — the slider stays freely editable afterwards.
export function resolveSolidity(
  persisted: number | undefined,
  recommended: number | undefined,
  fallback: number,
): number {
  return persisted ?? recommended ?? fallback
}

// The single precedence chain for a layout's MODELED pixel count, the
// pre-arrangement knob the user edits — before a map squares it up to a lattice
// (cube/plane) or a shape stretches it along a strip. A pattern's PERSISTED count
// wins; else a demo's RECOMMENDED count; else a custom map's BAKED length (the
// count its frozen array was authored at); else the per-dimension default. Stock
// generators carry no `baked`, so that slot drops out for them. The resolver feeds
// every map branch through this, and the deck's count box reads the same selector
// so the editable number matches what is rendered.
export function effectivePixelCount(opts: {
  persisted: number | null
  recommended?: number
  baked?: number
  fallback: number
}): number {
  return opts.persisted ?? opts.recommended ?? opts.baked ?? opts.fallback
}

// Resolve the layout a Pattern opens with against the live catalogue:
//   • any valid persisted map wins; otherwise the first Recommended option.
//   • the embedding is restored/defaulted by selected map dimension — first
//     Shape for 1D, Flat for 2D, none for 3D.
// A stale cylinder on a now-irregular map falls back to Flat (cylinder drops out
// of the offered set), so selecting a wrappable map never surprise-wraps.
//
// On-open demo recommendations no longer enter here: the settings cascade
// seeds a recommended `mapId` into the persisted selection before this
// runs, so a demo's map arrives as the persisted choice like any other.
export function resolveLayoutSelection(
  persisted: LayoutSelection,
  nativeDim: 1 | 2 | 3,
  source: LayoutSource,
): LayoutSelection {
  const sel: LayoutSelection = {}

  const maps = mapOptions(nativeDim, source)
  // A valid persisted map wins outright; otherwise the dimension's default.
  const persistedMap = source.maps.find((candidate) => candidate.id === persisted.mapId)
  const map = persisted.mapId === INDEX_MAP_ID
    ? maps.find((candidate) => candidate.id === INDEX_MAP_ID)
    : persistedMap
    ? {
        id: persistedMap.id,
        mapDim: persistedMap.dim,
      }
    : maps[0]
  if (map) sel.mapId = map.id

  const activeMap = sel.mapId ? source.maps.find((m) => m.id === sel.mapId) : undefined
  const mapDim = map?.mapDim ?? activeMap?.dim ?? nativeDim
  const embeddings = embeddingOptions(mapDim, source, activeMap)
  if (embeddings.length > 0) {
    const wantId = selectedEmbeddingId(persisted, mapDim)
    const chosen = embeddings.find((e) => e.id === wantId) ?? embeddings[0]
    Object.assign(sel, selectionForOption(chosen))
  } else if (mapDim === 2 && !activeMap?.family) {
    // Irregular 2D map: no embedding choice, but the layout is still Flat.
    sel.surfaceId = 'flat'
  }

  return sel
}

// ---------------------------------------------------------------------------
// resolveLayout — the single seam from a Layout *selection* to its *resolved*
// drawn realization.
//
// Given the persisted selection, the pattern's native dimensionality, the
// modeled pixel count and normalize mode, this corrects the selection (via
// resolveLayoutSelection), resolves the chosen map/shape/surface, applies the
// shared aspect normalization, computes draw positions + any solid-eligible
// surface normals, and reports the realized grid label. The component that
// consumes it is pure wiring: it writes correctedSelection back to the store,
// feeds `draw`/`mapPoints` to the renderer and render loop, and surfaces
// `displayDim`/`layoutLabel` to the editor store (solid-eligibility falls out as
// `draw.normals !== null`).
//
// Store-coupled lookups are INJECTED (`deps`) so this stays engine-pure (no
// store/React import, no import cycle) and table-testable with fakes: a test
// supplies a stub `resolveMap` returning a controlled PixelMap.

// The 3D channel carries per-point normals (present ⇔ solid-eligible);
// the 2D channel never does. `displayDim` (1|2|3) is the LOGICAL display
// dimension for UI gating, distinct from the draw channel — a 1D line and a 2D
// ring both draw through the 2D channel.
export type ResolvedDraw =
  | { kind: '2d'; positions: [number, number][] }
  | { kind: '3d'; positions: [number, number, number][]; normals: [number, number, number][] | null }

export interface ResolvedLayout {
  // The selection after dimension-correction — the component writes this back so
  // the dropdowns stay in sync with what was actually drawn.
  correctedSelection: LayoutSelection
  // Per-index sample+pos, feeding the shim and render loop.
  mapPoints: MapPoint[]
  pixelCount: number
  // Installed/sample dimension. Renderer compatibility and map predicates key
  // off this value, never native Pattern or display dimension.
  mapDim: 1 | 2 | 3
  displayDim: 1 | 2 | 3
  // The `cols×rows(×depth)` readout, or null for a 1D strip / irregular cloud.
  layoutLabel: string | null
  draw: ResolvedDraw
}

// Format a map's grid dims as the readout layout label (`cols×rows` or, for a
// volumetric lattice, `cols×rows×depth`). Null dims ⇒ no clean lattice ⇒ no label,
// so the readout cell stays hidden. This is the single rule gating the layout
// readout: a map shows dims exactly when its `gridDims` is non-null.
function formatGridDims(dims: GridDims | null): string | null {
  if (!dims) return null
  return dims.depth !== undefined
    ? `${dims.cols}×${dims.rows}×${dims.depth}`
    : `${dims.cols}×${dims.rows}`
}

export interface ResolveLayoutDeps {
  // Resolve a map id to its PixelMap (applies the store's DEFAULT_MAP_ID
  // fallback at the injection site so this module stays constant-free).
  resolveMap: (mapId: string | undefined) => PixelMap
  // Per-dimension default modeled count.
  defaultCountForDim: (dim: 1 | 2 | 3) => number
}

export interface ResolveLayoutInput {
  selection: LayoutSelection
  nativeDim: 1 | 2 | 3
  source: LayoutSource
  // The modeled pixel count (null ⇒ use a default). A demo's recommended count
  // arrives here already, seeded into the persisted selection by the settings
  // cascade.
  persistedCount: number | null
  normalizeMode: NormalizeMode
  // The ephemeral pole-wrap density (null ⇒ the shape default).
  poleCols: number | null
  // The 1D-shape on-open count (DEFAULT_SHAPE_PIXEL_COUNT), injected to keep
  // this module free of store constants.
  shapeDefaultCount: number
}

export function resolveLayout(
  input: ResolveLayoutInput,
  deps: ResolveLayoutDeps,
): ResolvedLayout {
  const {
    selection,
    nativeDim,
    source,
    persistedCount,
    normalizeMode,
    poleCols,
    shapeDefaultCount,
  } = input
  const { resolveMap, defaultCountForDim } = deps

  const correctedSelection = resolveLayoutSelection(selection, nativeDim, source)
  const selectedMapMeta = source.maps.find((map) => map.id === correctedSelection.mapId)
  const mapDim: 1 | 2 | 3 =
    correctedSelection.mapId === INDEX_MAP_ID ? 1 : selectedMapMeta?.dim ?? nativeDim

  let pixelCount: number
  let mapPoints: MapPoint[]
  let displayDim: 1 | 2 | 3
  let layoutLabel: string | null = null
  let positions2D: [number, number][] | null = null
  let positions3D: [number, number, number][] | null = null
  let normals3D: [number, number, number][] | null = null

  if (correctedSelection.shapeId) {
    // 1D composes two independent channels: the selected map (or implicit
    // Index convention) owns sample `[x]`; the Shape owns drawn `pos`.
    const shape = SHAPES[correctedSelection.shapeId as ShapeId]
    const selected1DMap =
      correctedSelection.mapId && correctedSelection.mapId !== INDEX_MAP_ID
        ? resolveMap(correctedSelection.mapId)
        : null
    pixelCount = clampPixelCount(
      effectivePixelCount({
        persisted: persistedCount,
        baked: selected1DMap?.bakedCount,
        fallback: shapeDefaultCount,
      }),
    )
    const samples = selected1DMap
      ? applyNormalizeMode(selected1DMap.resolve(pixelCount), normalizeMode).map((p) => p.sample)
      : Array.from({ length: pixelCount }, (_, index) => [index / pixelCount])
    if (shape.displayDim === 3) {
      // Pole: a 1D strip wrapped onto a cylinder, drawn in 3D.
      const pole = resolvePole(pixelCount, poleCols)
      positions3D = pole.positions
      normals3D = pole.normals
      mapPoints = positions3D.map((pos, index) => ({ sample: samples[index], pos }))
      displayDim = 3
    } else {
      positions2D = embedPositions(shape, pixelCount)
      mapPoints = positions2D.map((pos, index) => ({ sample: samples[index], pos }))
      displayDim = shape.displayDim
    }
  } else {
    const map = resolveMap(correctedSelection.mapId)
    // The shared modeled count for every map branch: a stock generator
    // carries no `baked`, so that slot drops out; the cube then squares this up.
    const modeledCount = effectivePixelCount({
      persisted: persistedCount,
      baked: map.bakedCount,
      fallback: defaultCountForDim(map.dim),
    })
    if (map.id === 'cube') {
      // 3D cube lattice: the count squares up to a side³ lattice.
      const cubeSide = cubeSideForCount(modeledCount)
      pixelCount = clampPixelCount(cubePixelCount(cubeSide))
    } else {
      pixelCount = clampPixelCount(modeledCount)
    }
    mapPoints = applyNormalizeMode(map.resolve(pixelCount), normalizeMode)
    layoutLabel = formatGridDims(map.gridDims(pixelCount))
    displayDim = map.displayDim ?? map.dim
    if (displayDim === 3) {
      positions3D = mapPoints.map((p) => p.pos as [number, number, number])
      // A solid-eligible generated shell carries a normal recipe; no recipe means
      // the 3D positions remain a transparent point cloud.
      if (map.normals) normals3D = NORMAL_FNS[map.normals](positions3D)
    } else {
      positions2D = mapPoints.map((p) => p.pos as [number, number])
    }

    // 2D surface embedding: the Cylinder wraps the map's grid onto a
    // 3D tube. The map still owns `sample`; the surface owns `pos`.
    if (map.dim === 2 && correctedSelection.surfaceId === 'cylinder' && displayDim === 2) {
      const gridDims = map.gridDims(pixelCount)
      if (gridDims) {
        positions3D = cylinderSurfacePositions(pixelCount, gridDims)
        normals3D = cylinderSurfaceNormals(pixelCount, gridDims)
        mapPoints = mapPoints.map((p, i) => ({ sample: p.sample, pos: positions3D![i] }))
        positions2D = null
        layoutLabel = formatGridDims(gridDims)
        displayDim = 3
      }
    }
  }

  const draw: ResolvedDraw =
    positions3D !== null
      ? { kind: '3d', positions: positions3D, normals: normals3D }
      : { kind: '2d', positions: positions2D ?? [] }

  return { correctedSelection, mapPoints, pixelCount, mapDim, displayDim, layoutLabel, draw }
}

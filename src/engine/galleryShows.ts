// Gallery Shows (#894). A curated, ordered list of stock Shows that appear in
// the Gallery as marquee bands, plus the geometry and compiled artifact a
// Show card runs on. A compiled Show is one Pattern, so a Show card is an
// ordinary live-pool card; only its geometry (the Show's own stage map at the
// Show's Gallery pixel count) and look (more diffusion) differ.
import { applyNormalizeMode, type MapPoint } from './maps'
import type { PreparedFastReplay } from './fastReplay'
import { showLoopDurationMs } from './showModel'
import { compileShowForPreview, resolveShowCompilationControllerZones } from './showPreviewArtifact'
import { stockShowById, type StockShow } from '@/pixelblaze/stock/shows'
import { resolveMap } from '@/store/mapStore'

export interface GalleryShow {
  id: string
  slug: string
  /** "by PXLBLZ, with Wavy Bands and Line Dancer 2D by ZRanger1" */
  byline: string
  /** One or two lines of premise, README style. Gallery presentation only. */
  premise: string
}

/** Shows are built for their stage counts; the Gallery runs them near it. */
export const GALLERY_SHOW_PIXEL_COUNT = 2000
/** Shows read best smoothed; Patterns default to 0.5. */
export const GALLERY_SHOW_DIFFUSION = 0.8
/** Caption column is at most this fraction of the preview's width. */
export const GALLERY_SHOW_CAPTION_WIDTH_RATIO = 0.8
/** Band height as a fraction of the grid width; width follows the stage. */
export const GALLERY_SHOW_BAND_HEIGHT_RATIO = 0.4
/** A stage wider than this fraction of the grid gives up height instead. */
export const GALLERY_SHOW_BAND_MAX_WIDTH_RATIO = 0.7

/** Deterministic order: the hero first. */
export const GALLERY_SHOWS: readonly GalleryShow[] = [
  {
    id: 'stock-show-remix-overture',
    slug: 'overture-installation',
    byline: 'by PXLBLZ',
    premise: 'An opening movement across the whole stage: themes introduced one at a time, then played together.',
  },
  {
    id: 'stock-show-remix-quadrille',
    slug: 'quadrille',
    byline: 'by PXLBLZ, with Wavy Bands and Line Dancer 2D by ZRanger1',
    premise: 'Four mirrored quarters, rejoined for the finale. Two Pattern instances, one compiled Pattern.',
  },
  {
    id: 'stock-show-showcase-redline-installation',
    slug: 'redline-installation',
    byline: 'by PXLBLZ, with Harmonograph',
    premise: 'One Harmonograph render drives five surfaces: a panel in the middle and four radial blooms around it.',
  },
  {
    id: 'stock-show-remix-coronal-mass-ejection',
    slug: 'coronal-mass-ejection-remix',
    byline: 'by PXLBLZ, with Coronal Mass Ejection by ZRanger1',
    premise: 'A quiet corona, a building flare, and the ejection itself, timed as one arc.',
  },
]

export function galleryShowBySlug(slug: string): GalleryShow | undefined {
  return GALLERY_SHOWS.find((show) => show.slug === slug)
}

export function galleryShowById(id: string): GalleryShow | undefined {
  return GALLERY_SHOWS.find((show) => show.id === id)
}

export function galleryShowStock(show: GalleryShow): StockShow {
  const stock = stockShowById(show.id)
  if (!stock) throw new Error(`Gallery Show "${show.id}" is not a stock Show.`)
  return stock
}

export interface GalleryShowFacts {
  title: string
  /** Exact loop length; the thermometer and keyframe window use this. */
  loopMs: number
  loopSeconds: number
  sceneCount: number
  zoneCount: number
  track: StockShow['track']
}

export function galleryShowFacts(show: GalleryShow): GalleryShowFacts {
  const stock = galleryShowStock(show)
  const loopMs = showLoopDurationMs(stock.show)
  return {
    title: stock.name,
    loopMs,
    loopSeconds: Math.round(loopMs / 1000),
    sceneCount: stock.show.scenes.length,
    zoneCount: stock.show.zones.length,
    track: stock.track,
  }
}

export interface GalleryShowGeometry {
  mapId: string
  dim: 1 | 2 | 3
  mapPoints: MapPoint[]
  /** Width over height of the stage's position bounds; 1 for 3D stages. */
  aspect: number
}

/** An installation Show is compiled for a fixed output count; its stage map
 * only lays out correctly at that count. Portable Shows scale to the Gallery
 * count. */
export function galleryShowPixelCount(show: GalleryShow): number {
  const contract = galleryShowStock(show).show.outputContract
  return contract?.kind === 'installation' && contract.pixelCount > 0 ? contract.pixelCount : GALLERY_SHOW_PIXEL_COUNT
}

/** The Show's own stage map, resolved at the Show's Gallery pixel count with
 * the stage's true proportions kept ('contain'), so a wide installation reads
 * as the installation, gaps between zones included. */
export function resolveGalleryShowGeometry(
  show: GalleryShow,
  pixelCount = galleryShowPixelCount(show),
): GalleryShowGeometry {
  const stock = galleryShowStock(show)
  const map = resolveMap(stock.show.stageMapId ?? 'plane', [])
  const resolved = applyNormalizeMode(map.resolve(Math.max(1, pixelCount)), 'contain')
  const mapPoints: MapPoint[] = resolved.map((point) => {
    const raw = point.pos ?? point.sample
    const pos = map.dim === 3
      ? ([raw[0] ?? 0.5, raw[1] ?? 0.5, raw[2] ?? 0.5] as [number, number, number])
      : ([raw[0] ?? 0.5, raw[1] ?? 0.5] as [number, number])
    return { sample: [...pos], pos } as MapPoint
  })
  return { mapId: map.id, dim: map.dim, mapPoints, aspect: stageAspect(mapPoints, map.dim) }
}

export function stageAspect(mapPoints: readonly MapPoint[], dim: number): number {
  if (dim === 3 || mapPoints.length === 0) return 1
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of mapPoints) {
    const [x, y] = point.pos as [number, number]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return maxY > minY && maxX > minX ? (maxX - minX) / (maxY - minY) : 1
}

/** Compile the Show for preview exactly as the stage preview does. */
export function prepareGalleryShow(show: GalleryShow, geometry: GalleryShowGeometry): PreparedFastReplay {
  const stock = galleryShowStock(show)
  const compiled = compileShowForPreview(
    stock.show,
    [],
    resolveShowCompilationControllerZones(stock.show),
    {},
    { stageDimension: geometry.dim },
  )
  if (!compiled.artifact) throw new Error(compiled.error ?? `Gallery Show "${show.id}" did not compile.`)
  return {
    code: compiled.artifact.code,
    fxCode: compiled.artifact.fxCode,
    metadata: compiled.artifact.metadata,
    dimension: geometry.dim === 3 ? 3 : 2,
  }
}

/** Band box for a stage: fixed height from the grid width, natural width. */
export function galleryShowBandBox(gridWidth: number, aspect: number): { width: number; height: number } {
  const bandHeight = Math.round(gridWidth * GALLERY_SHOW_BAND_HEIGHT_RATIO)
  const width = Math.round(Math.min(bandHeight * aspect, gridWidth * GALLERY_SHOW_BAND_MAX_WIDTH_RATIO))
  return { width, height: Math.round(width / aspect) }
}

/**
 * Where bands sit among the Pattern cards: the hero first, the rest spread
 * evenly. Returns the Pattern index each Show is inserted before.
 */
export function galleryShowInsertionIndexes(showCount: number, patternCount: number): number[] {
  if (showCount === 0) return []
  return Array.from({ length: showCount }, (_, i) => Math.round((i * patternCount) / showCount))
}

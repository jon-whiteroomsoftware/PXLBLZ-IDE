// A Gallery card's subject (#894): a stock Pattern or a Gallery Show. Both
// resolve to the same runtime inputs — a prepared artifact, geometry, look
// settings, a keyframe key, and a pixel cost — so GalleryLivePreview has one
// code path and the keyframe batch one artifact format.
import { prepareFastReplay, type PreparedFastReplay } from './fastReplay'
import { GALLERY_KEYFRAME_RANDOM_SEED, galleryKeyframeKey } from './galleryKeyframes'
import {
  GALLERY_SHOW_DIFFUSION,
  GALLERY_SHOW_PIXEL_COUNT,
  galleryShowById,
  prepareGalleryShow,
  resolveGalleryShowGeometry,
  type GalleryShow,
} from './galleryShows'
import { galleryThumbnailSettings, resolveGalleryThumbnailLayout } from './galleryThumbnailLayout'
import { galleryThumbnailPixelCount } from './previewPixelCount'
import { defaultPixelCountForDim } from '@/store/mapStore'
import type { MapPoint } from './maps/types'
import { LIBRARIES } from '@/pixelblaze/libs'

export type GallerySubject =
  | { kind: 'pattern'; name: string; src: string }
  | { kind: 'show'; id: string }

/** Stable identity for registration, keyframe artifacts, and test ids. */
export function gallerySubjectKey(subject: GallerySubject): string {
  return subject.kind === 'pattern' ? subject.name : `show--${subject.id}`
}

export interface GallerySubjectLook {
  lightSize: number
  diffusion: number
  brightness: number
  speed: number
  solidity: number
}

export interface ResolvedGallerySubject {
  prepared: PreparedFastReplay
  mapPoints: MapPoint[]
  draw:
    | { kind: '2d'; positions: [number, number][] }
    | { kind: '3d'; positions: [number, number, number][]; normals: [number, number, number][] | null }
  look: GallerySubjectLook
  /** Keyframe artifact key for this exact runtime. */
  keyframeKey: string
  /** Pixel evaluations per frame when live. */
  cost: number
}

export function resolveGallerySubject(subject: GallerySubject): ResolvedGallerySubject {
  if (subject.kind === 'pattern') {
    const prepared = prepareFastReplay(subject.src, LIBRARIES)
    const { settings, layout } = resolveGalleryThumbnailLayout(subject.name, prepared)
    return {
      prepared,
      mapPoints: layout.mapPoints,
      draw: layout.draw,
      look: {
        lightSize: settings.lightSize,
        diffusion: settings.diffusion,
        brightness: settings.brightness,
        speed: settings.speed,
        solidity: settings.solidity,
      },
      keyframeKey: galleryKeyframeKey({ code: prepared.code, mapPoints: layout.mapPoints, randomSeed: GALLERY_KEYFRAME_RANDOM_SEED }),
      cost: layout.mapPoints.length,
    }
  }
  const show = galleryShowById(subject.id)
  if (!show) throw new Error(`Unknown Gallery Show "${subject.id}".`)
  return resolveGalleryShowSubject(show)
}

export function resolveGalleryShowSubject(show: GalleryShow): ResolvedGallerySubject {
  const geometry = resolveGalleryShowGeometry(show)
  const prepared = prepareGalleryShow(show, geometry)
  const draw = geometry.dim === 3
    ? { kind: '3d' as const, positions: geometry.mapPoints.map((p) => p.pos as [number, number, number]), normals: null }
    : { kind: '2d' as const, positions: geometry.mapPoints.map((p) => p.pos as [number, number]) }
  return {
    prepared,
    mapPoints: geometry.mapPoints,
    draw,
    look: { lightSize: 1, diffusion: GALLERY_SHOW_DIFFUSION, brightness: 1, speed: 1, solidity: 1 },
    keyframeKey: galleryKeyframeKey({ code: prepared.code, mapPoints: geometry.mapPoints, randomSeed: GALLERY_KEYFRAME_RANDOM_SEED }),
    cost: geometry.mapPoints.length,
  }
}

/** Pixel cost without compiling: enough for live-pool admission. The exact
 * cost comes with the resolved subject. */
export function estimateGallerySubjectCost(subject: GallerySubject, dim: 1 | 2 | 3): number {
  if (subject.kind === 'show') return GALLERY_SHOW_PIXEL_COUNT
  const settings = galleryThumbnailSettings(subject.name)
  return galleryThumbnailPixelCount(dim, settings.pixelCount, defaultPixelCountForDim(dim))
}

// The Gallery card's runtime geometry (#888): the map, pixel count, and draw
// positions a stock Pattern's thumbnail uses. Shared by the live card and the
// keyframe batch so a stored keyframe is captured in exactly the runtime the
// card will restore it into.
import { DEV_DEFAULTS } from './settings'
import { nativeDimension } from './loadPattern'
import { resolveLayout } from './layout'
import { GALLERY_THUMBNAIL_PIXEL_COUNT_CAPS, galleryThumbnailPixelCount } from './previewPixelCount'
import { selectRenderCompatibility } from './renderCompatibility'
import type { PreparedFastReplay } from './fastReplay'
import type { SurfaceId } from './surfaces'
import { recommendedSettingsFor } from '@/pixelblaze/stock/patterns'
import {
  DEFAULT_MAP_ID,
  DEFAULT_SHAPE_PIXEL_COUNT,
  defaultPixelCountForDim,
  layoutSource,
  resolveMap,
} from '@/store/mapStore'

export type GalleryThumbnailSettings = typeof DEV_DEFAULTS & ReturnType<typeof recommendedSettingsFor>

export interface GalleryThumbnailLayout {
  settings: GalleryThumbnailSettings
  nativeDim: 1 | 2 | 3
  layout: ReturnType<typeof resolveLayout>
  renderCompatibility: ReturnType<typeof selectRenderCompatibility>
}

export function galleryThumbnailSettings(name: string): GalleryThumbnailSettings {
  return { ...DEV_DEFAULTS, ...recommendedSettingsFor(name) }
}

export function resolveGalleryThumbnailLayout(name: string, prepared: PreparedFastReplay): GalleryThumbnailLayout {
  const settings = galleryThumbnailSettings(name)
  const nativeDim = nativeDimension(prepared.metadata.renderFns)
  const pixelCount = galleryThumbnailPixelCount(nativeDim, settings.pixelCount, defaultPixelCountForDim(nativeDim))
  const layout = resolveLayout(
    {
      selection: {
        mapId: settings.mapId,
        shapeId: settings.shapeId,
        surfaceId: settings.surfaceId as SurfaceId,
      },
      nativeDim,
      source: layoutSource({ userMaps: [] }),
      persistedCount: pixelCount,
      normalizeMode: settings.normalize,
      poleCols: null,
      shapeDefaultCount: DEFAULT_SHAPE_PIXEL_COUNT,
      maxPixelCount: GALLERY_THUMBNAIL_PIXEL_COUNT_CAPS[nativeDim],
    },
    {
      resolveMap: (mapId) => resolveMap(mapId ?? DEFAULT_MAP_ID, []),
      defaultCountForDim: defaultPixelCountForDim,
    },
  )
  return {
    settings,
    nativeDim,
    layout,
    renderCompatibility: selectRenderCompatibility(layout.mapDim, prepared.metadata.renderFns),
  }
}

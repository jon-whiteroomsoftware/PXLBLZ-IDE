import { clampPixelCount } from './camera'

export const GALLERY_THUMBNAIL_PIXEL_COUNT_CAPS: Record<1 | 2 | 3, number> = {
  1: 576,
  2: 1536,
  3: 1536,
}

export const GALLERY_DETAIL_PIXEL_COUNT_CAP = 2048

export function galleryThumbnailPixelCount(
  dim: 1 | 2 | 3,
  recommended: number | null | undefined,
  fallback: number,
): number {
  const base = recommended ?? fallback
  return Math.min(base, GALLERY_THUMBNAIL_PIXEL_COUNT_CAPS[dim])
}

export function cappedPreviewPixelCount(
  pixelCount: number | null,
  cap: number | null,
): number | null {
  if (pixelCount == null) return null
  return cap == null
    ? clampPixelCount(pixelCount)
    : Math.min(clampPixelCount(pixelCount), clampPixelCount(cap))
}

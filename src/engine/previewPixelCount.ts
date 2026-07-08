import { clampPixelCount } from './camera'

export const GALLERY_THUMBNAIL_PIXEL_COUNT_CAPS: Record<1 | 2 | 3, number> = {
  1: 576,
  2: 1536,
  3: 1536,
}

export const PATTERN_DETAIL_PIXEL_COUNT_MULTIPLIER = 2

export function galleryThumbnailPixelCount(
  dim: 1 | 2 | 3,
  recommended: number | null | undefined,
  fallback: number,
): number {
  const base = recommended ?? fallback
  return Math.min(base, GALLERY_THUMBNAIL_PIXEL_COUNT_CAPS[dim])
}

export function scaledPreviewPixelCount(
  pixelCount: number | null,
  multiplier: number,
): number | null {
  if (pixelCount == null) return null
  return clampPixelCount(pixelCount * multiplier)
}

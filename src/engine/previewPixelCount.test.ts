import {
  galleryThumbnailPixelCount,
  PATTERN_DETAIL_PIXEL_COUNT_MULTIPLIER,
  scaledPreviewPixelCount,
} from './previewPixelCount'

describe('previewPixelCount', () => {
  it('caps gallery thumbnails 50% above the previous thumbnail caps', () => {
    expect(galleryThumbnailPixelCount(1, 9999, 256)).toBe(576)
    expect(galleryThumbnailPixelCount(2, 9999, 1024)).toBe(1536)
    expect(galleryThumbnailPixelCount(3, 9999, 1024)).toBe(1536)
  })

  it('keeps lower gallery recommendations and falls back when no recommendation exists', () => {
    expect(galleryThumbnailPixelCount(1, 320, 256)).toBe(320)
    expect(galleryThumbnailPixelCount(2, null, 1024)).toBe(1024)
  })

  it('doubles detail preview counts without changing null defaults', () => {
    expect(scaledPreviewPixelCount(1024, PATTERN_DETAIL_PIXEL_COUNT_MULTIPLIER)).toBe(2048)
    expect(scaledPreviewPixelCount(null, PATTERN_DETAIL_PIXEL_COUNT_MULTIPLIER)).toBeNull()
  })
})

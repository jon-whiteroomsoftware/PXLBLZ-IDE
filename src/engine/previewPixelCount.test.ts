import {
  GALLERY_DETAIL_PIXEL_COUNT_CAP,
  galleryThumbnailPixelCount,
  cappedPreviewPixelCount,
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

  it('keeps detail recommendations intact and caps only oversized values', () => {
    expect(cappedPreviewPixelCount(1024, GALLERY_DETAIL_PIXEL_COUNT_CAP)).toBe(1024)
    expect(cappedPreviewPixelCount(4096, GALLERY_DETAIL_PIXEL_COUNT_CAP)).toBe(2048)
    expect(cappedPreviewPixelCount(null, GALLERY_DETAIL_PIXEL_COUNT_CAP)).toBeNull()
  })
})

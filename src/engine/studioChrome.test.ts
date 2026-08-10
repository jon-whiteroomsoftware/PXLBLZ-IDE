import { describe, expect, it } from 'vitest'
import {
  STUDIO_LIBRARY_DEFAULT_WIDTH,
  STUDIO_LIBRARY_MAX_VIEWPORT_WIDTH,
  STUDIO_LIBRARY_MIN_WIDTH,
  STUDIO_PREVIEW_DEFAULT_WIDTH,
  STUDIO_PREVIEW_MIN_WIDTH,
  defaultStudioPreviewWidth,
  resizeStudioLibraryWidth,
} from './studioChrome'

describe('Studio chrome geometry (#479)', () => {
  it('keeps the expanded entity library wide enough to scan names (#787)', () => {
    expect(STUDIO_LIBRARY_DEFAULT_WIDTH).toBe(288)
    expect(STUDIO_LIBRARY_MIN_WIDTH).toBe(184)
    expect(resizeStudioLibraryWidth(288, -500)).toBe(184)
    expect(resizeStudioLibraryWidth(288, 40)).toBe(328)
    expect(STUDIO_LIBRARY_MAX_VIEWPORT_WIDTH).toBe('34vw')
  })

  it('keeps the full default preview width while the authoring pane can remain equally wide (#63)', () => {
    expect(STUDIO_PREVIEW_DEFAULT_WIDTH).toBe(460)
    expect(defaultStudioPreviewWidth(925)).toBe(460)
    expect(defaultStudioPreviewWidth(1200)).toBe(460)
  })

  it('shrinks the untouched preview with its workspace until the preview reaches its usable floor (#63)', () => {
    expect(defaultStudioPreviewWidth(780)).toBe(387)
    expect(defaultStudioPreviewWidth(604)).toBe(300)
    expect(defaultStudioPreviewWidth(500)).toBe(STUDIO_PREVIEW_MIN_WIDTH)
  })
})

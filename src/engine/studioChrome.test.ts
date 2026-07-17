import { describe, expect, it } from 'vitest'
import {
  STUDIO_LIBRARY_DEFAULT_WIDTH,
  STUDIO_LIBRARY_MAX_VIEWPORT_WIDTH,
  STUDIO_LIBRARY_MIN_WIDTH,
  resizeStudioLibraryWidth,
} from './studioChrome'

describe('Studio chrome geometry (#479)', () => {
  it('keeps the expanded entity library wide enough to scan names', () => {
    expect(STUDIO_LIBRARY_DEFAULT_WIDTH).toBe(288)
    expect(STUDIO_LIBRARY_MIN_WIDTH).toBe(184)
    expect(resizeStudioLibraryWidth(288, -500)).toBe(184)
    expect(resizeStudioLibraryWidth(288, 40)).toBe(328)
    expect(STUDIO_LIBRARY_MAX_VIEWPORT_WIDTH).toBe('34vw')
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GALLERY_DENSITY,
  GALLERY_DENSITY_STORAGE_KEY,
  parseGalleryDensity,
  readGalleryDensity,
  writeGalleryDensity,
} from './galleryDensity'

describe('gallery density preference', () => {
  it.each([
    ['2', 2],
    ['3', 3],
    ['4', 4],
    ['5', DEFAULT_GALLERY_DENSITY],
    ['1', DEFAULT_GALLERY_DENSITY],
    ['', DEFAULT_GALLERY_DENSITY],
    [null, DEFAULT_GALLERY_DENSITY],
    ['abc', DEFAULT_GALLERY_DENSITY],
  ])('parses %j as %d', (raw, expected) => {
    expect(parseGalleryDensity(raw)).toBe(expected)
  })

  it('round-trips through storage and survives a storage that throws', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) }
    writeGalleryDensity(storage, 4)
    expect(store.get(GALLERY_DENSITY_STORAGE_KEY)).toBe('4')
    expect(readGalleryDensity(storage)).toBe(4)

    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(() => writeGalleryDensity(broken, 2)).not.toThrow()
    expect(readGalleryDensity(broken)).toBe(DEFAULT_GALLERY_DENSITY)
    expect(readGalleryDensity(null)).toBe(DEFAULT_GALLERY_DENSITY)
  })
})

// Gallery card density (#888): how many cards share a row at desktop widths.
// A small local preference, not workspace content.

export type GalleryDensity = 2 | 3 | 4

export const GALLERY_DENSITY_OPTIONS: readonly GalleryDensity[] = [2, 3, 4]
export const DEFAULT_GALLERY_DENSITY: GalleryDensity = 3
export const GALLERY_DENSITY_STORAGE_KEY = 'pxlblz-gallery-density'

export function parseGalleryDensity(raw: string | null | undefined): GalleryDensity {
  const value = Number(raw)
  return (GALLERY_DENSITY_OPTIONS as readonly number[]).includes(value)
    ? (value as GalleryDensity)
    : DEFAULT_GALLERY_DENSITY
}

export function readGalleryDensity(storage: Pick<Storage, 'getItem'> | null | undefined): GalleryDensity {
  try {
    return parseGalleryDensity(storage?.getItem(GALLERY_DENSITY_STORAGE_KEY))
  } catch {
    return DEFAULT_GALLERY_DENSITY
  }
}

export function writeGalleryDensity(storage: Pick<Storage, 'setItem'> | null | undefined, density: GalleryDensity): void {
  try {
    storage?.setItem(GALLERY_DENSITY_STORAGE_KEY, String(density))
  } catch {
    // Private mode or quota: the preference simply does not persist.
  }
}

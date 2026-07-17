export const STUDIO_LIBRARY_DEFAULT_WIDTH = 288
export const STUDIO_LIBRARY_MIN_WIDTH = 184
export const STUDIO_LIBRARY_MAX_VIEWPORT_WIDTH = '34vw'

export function resizeStudioLibraryWidth(currentWidth: number, deltaX: number): number {
  return Math.max(STUDIO_LIBRARY_MIN_WIDTH, currentWidth + deltaX)
}

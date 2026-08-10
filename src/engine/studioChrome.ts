export const STUDIO_LIBRARY_DEFAULT_WIDTH = 288
export const STUDIO_LIBRARY_MIN_WIDTH = 184
export const STUDIO_LIBRARY_MAX_VIEWPORT_WIDTH = '34vw'
export const STUDIO_PREVIEW_DEFAULT_WIDTH = 460
export const STUDIO_PREVIEW_MIN_WIDTH = 300

const STUDIO_SPLITTER_WIDTH = 4
const STUDIO_AUTHORING_ROUNDING_GUARD = 1

export function resizeStudioLibraryWidth(currentWidth: number, deltaX: number): number {
  return Math.max(STUDIO_LIBRARY_MIN_WIDTH, currentWidth + deltaX)
}

export function defaultStudioPreviewWidth(workspaceWidth: number): number {
  const balancedWidth = Math.floor(
    (workspaceWidth - STUDIO_SPLITTER_WIDTH - STUDIO_AUTHORING_ROUNDING_GUARD) / 2,
  )
  return Math.max(STUDIO_PREVIEW_MIN_WIDTH, Math.min(STUDIO_PREVIEW_DEFAULT_WIDTH, balancedWidth))
}

export const SHOW_WORKSPACE_DIVIDER_HEIGHT = 6
export const SHOW_TIMELINE_MIN_HEIGHT = 164
export const SHOW_STRIP_MIN_HEIGHT = 140
export const SHOW_CONTROLS_MIN_WIDTH = 200
export const SHOW_TIMELINE_DEFAULT_FRACTION = 0.6
export const SHOW_TIMELINE_HEIGHT_STORAGE_KEY = 'pxlblz-show-workspace-timeline-height'

export type ShowWorkspaceClamp = 'timeline-min' | 'controls-min' | 'strip-min' | null

export interface ShowWorkspaceLayout {
  timelineHeight: number
  stripHeight: number
  previewWidth: number
  controlsWidth: number
  clamp: ShowWorkspaceClamp
}

export function resolveShowWorkspaceLayout({
  width,
  height,
  desiredTimelineHeight,
  previewAspect,
  timelineMinimumHeight = SHOW_TIMELINE_MIN_HEIGHT,
}: {
  width: number
  height: number
  desiredTimelineHeight: number | null
  previewAspect: number
  timelineMinimumHeight?: number
}): ShowWorkspaceLayout {
  const workspaceWidth = Math.max(1, Math.floor(width))
  const availableHeight = Math.max(1, Math.floor(height) - SHOW_WORKSPACE_DIVIDER_HEIGHT)
  const aspect = Number.isFinite(previewAspect) && previewAspect > 0 ? previewAspect : 1
  const desiredTimeline = desiredTimelineHeight === null
    ? Math.round(availableHeight * SHOW_TIMELINE_DEFAULT_FRACTION)
    : Math.round(desiredTimelineHeight)
  const desiredStrip = availableHeight - desiredTimeline
  const minimumTimeline = Math.max(1, Math.ceil(timelineMinimumHeight))
  const timelineBound = Math.max(1, availableHeight - minimumTimeline)
  const controlsBound = Math.max(1, Math.floor((workspaceWidth - SHOW_CONTROLS_MIN_WIDTH) / aspect))
  const upperStrip = Math.max(1, Math.min(timelineBound, controlsBound))
  const lowerStrip = Math.min(SHOW_STRIP_MIN_HEIGHT, upperStrip)

  let stripHeight = desiredStrip
  let clamp: ShowWorkspaceClamp = null
  if (stripHeight <= lowerStrip) {
    stripHeight = lowerStrip
    clamp = 'strip-min'
  } else if (stripHeight >= upperStrip) {
    stripHeight = upperStrip
    clamp = controlsBound <= timelineBound ? 'controls-min' : 'timeline-min'
  }

  const timelineHeight = availableHeight - stripHeight
  const previewWidth = Math.max(1, Math.min(
    Math.round(stripHeight * aspect),
    Math.max(1, workspaceWidth - SHOW_CONTROLS_MIN_WIDTH),
  ))
  return {
    timelineHeight,
    stripHeight,
    previewWidth,
    controlsWidth: Math.max(0, workspaceWidth - previewWidth),
    clamp,
  }
}

export function measureShowTimelineMinimumHeight({
  transportTop,
  secondLaneBottom,
  fixedFooterHeight,
}: {
  transportTop: number
  secondLaneBottom: number
  fixedFooterHeight: number
}): number {
  return Math.max(1, Math.ceil(secondLaneBottom - transportTop + fixedFooterHeight))
}

export function showControlsLayoutMode(width: number): 'compact' | 'one-column' | 'two-column' | 'three-column' {
  if (width <= 300) return 'compact'
  if (width < 760) return 'one-column'
  if (width < 1140) return 'two-column'
  return 'three-column'
}

export function serializeShowTimelineHeight(height: number): string {
  return String(Math.max(1, Math.round(height)))
}

export function parseShowTimelineHeight(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

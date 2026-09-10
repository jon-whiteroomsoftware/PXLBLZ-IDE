export const SHOW_WORKSPACE_DIVIDER_HEIGHT = 6
export const SHOW_TIMELINE_MIN_HEIGHT = 164
export const SHOW_STRIP_MIN_HEIGHT = 140
export const SHOW_CONTROLS_MIN_WIDTH = 200
export const SHOW_PREVIEW_RAIL_WIDTH = 30
export const SHOW_TIMELINE_DEFAULT_SLACK = 12
export const SHOW_TIMELINE_HEIGHT_STORAGE_KEY = 'pxlblz-show-workspace-timeline-height'

/** Convert the intended (unclamped) split to pixels in the current workspace. */
export function scaleShowTimelineHeight(height: number, workspaceHeight: number, referenceHeight = workspaceHeight): number {
  const available = Math.max(1, Math.floor(workspaceHeight) - SHOW_WORKSPACE_DIVIDER_HEIGHT)
  const referenceAvailable = Math.max(1, Math.floor(referenceHeight) - SHOW_WORKSPACE_DIVIDER_HEIGHT)
  return Math.round(Math.round(height) * available / referenceAvailable)
}

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
  referenceHeight,
  previewAspect,
  timelineMinimumHeight = SHOW_TIMELINE_MIN_HEIGHT,
  timelineContentHeight = timelineMinimumHeight,
}: {
  width: number
  height: number
  desiredTimelineHeight: number | null
  referenceHeight?: number
  previewAspect: number
  timelineMinimumHeight?: number
  timelineContentHeight?: number
}): ShowWorkspaceLayout {
  const workspaceWidth = Math.max(1, Math.floor(width))
  const availableHeight = Math.max(1, Math.floor(height) - SHOW_WORKSPACE_DIVIDER_HEIGHT)
  const aspect = Number.isFinite(previewAspect) && previewAspect > 0 ? previewAspect : 1
  const desiredTimeline = desiredTimelineHeight === null
    ? Math.ceil(timelineContentHeight + SHOW_TIMELINE_DEFAULT_SLACK)
    : Math.round(desiredTimelineHeight)
  const desiredStrip = availableHeight - scaleShowTimelineHeight(desiredTimeline, height, referenceHeight)
  const minimumTimeline = Math.max(1, Math.ceil(timelineMinimumHeight))
  const timelineBound = Math.max(1, availableHeight - minimumTimeline)
  const controlsBound = Math.max(1, Math.floor((workspaceWidth - SHOW_CONTROLS_MIN_WIDTH - SHOW_PREVIEW_RAIL_WIDTH) / aspect))
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
    Math.max(1, workspaceWidth - SHOW_CONTROLS_MIN_WIDTH - SHOW_PREVIEW_RAIL_WIDTH),
  ))
  return {
    timelineHeight,
    stripHeight,
    previewWidth,
    controlsWidth: Math.max(0, workspaceWidth - previewWidth - SHOW_PREVIEW_RAIL_WIDTH),
    clamp,
  }
}

export function measureShowTimelineMinimumHeight({
  editorTop,
  secondLaneBottom,
  fixedFooterHeight,
}: {
  editorTop: number
  secondLaneBottom: number
  fixedFooterHeight: number
}): number {
  return Math.max(1, Math.ceil(secondLaneBottom - editorTop + fixedFooterHeight))
}

export function serializeShowTimelineHeight(height: number): string {
  return String(Math.max(1, Math.round(height)))
}

export function parseShowTimelineHeight(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

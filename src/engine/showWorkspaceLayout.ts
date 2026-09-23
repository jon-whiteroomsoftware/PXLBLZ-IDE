export const SHOW_WORKSPACE_DIVIDER_HEIGHT = 6
export const SHOW_TIMELINE_MIN_HEIGHT = 80
export const SHOW_STRIP_MIN_HEIGHT = 140
export const SHOW_CONTROLS_MIN_WIDTH = 200
export const SHOW_PREVIEW_RAIL_WIDTH = 30
export const SHOW_TIMELINE_DEFAULT_SLACK = 12
export const SHOW_TIMELINE_FRACTION_STORAGE_KEY = 'pxlblz-show-workspace-timeline-fraction'

export type ShowWorkspaceClamp = 'timeline-min' | 'strip-min' | null

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
  desiredTimelineFraction,
  desiredTimelineHeight,
  previewAspect,
  timelineMinimumHeight = SHOW_TIMELINE_MIN_HEIGHT,
  timelineContentHeight = timelineMinimumHeight,
}: {
  width: number
  height: number
  desiredTimelineFraction: number | null
  desiredTimelineHeight?: number
  previewAspect: number
  timelineMinimumHeight?: number
  timelineContentHeight?: number
}): ShowWorkspaceLayout {
  const workspaceWidth = Math.max(1, Math.floor(width))
  const availableHeight = Math.max(1, Math.floor(height) - SHOW_WORKSPACE_DIVIDER_HEIGHT)
  const aspect = Number.isFinite(previewAspect) && previewAspect > 0 ? previewAspect : 1
  const desiredTimeline = desiredTimelineHeight !== undefined
    ? Math.round(desiredTimelineHeight)
    : desiredTimelineFraction === null
      ? Math.min(Math.ceil(timelineContentHeight + SHOW_TIMELINE_DEFAULT_SLACK), Math.floor(availableHeight / 2))
      : Math.round(desiredTimelineFraction * availableHeight)
  const desiredStrip = availableHeight - desiredTimeline
  const minimumTimeline = Math.max(1, Math.ceil(timelineMinimumHeight))
  const upperStrip = Math.max(1, availableHeight - minimumTimeline)
  const lowerStrip = Math.min(SHOW_STRIP_MIN_HEIGHT, upperStrip)

  let stripHeight = desiredStrip
  let clamp: ShowWorkspaceClamp = null
  if (stripHeight <= lowerStrip) {
    stripHeight = lowerStrip
    clamp = 'strip-min'
  } else if (stripHeight >= upperStrip) {
    stripHeight = upperStrip
    clamp = 'timeline-min'
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
  toolbarBottom,
  fixedFooterHeight,
}: {
  editorTop: number
  toolbarBottom: number
  fixedFooterHeight: number
}): number {
  return Math.max(1, Math.ceil(toolbarBottom - editorTop + fixedFooterHeight + 24))
}

export function showTimelineFraction(timelineHeight: number, workspaceHeight: number): number {
  return timelineHeight / Math.max(1, Math.floor(workspaceHeight) - SHOW_WORKSPACE_DIVIDER_HEIGHT)
}

export function serializeShowTimelineFraction(fraction: number): string {
  if (fraction <= 0) return String(0.0001)
  if (fraction >= 1) return String(0.9999)
  return String(fraction)
}

export function parseShowTimelineFraction(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : null
}

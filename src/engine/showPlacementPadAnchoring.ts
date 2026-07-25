export interface PlacementPadRect {
  left: number
  top: number
  width: number
  height: number
}

export interface PlacementPadAnchorInput {
  /** The summary row the pad belongs to, used for vertical alignment. */
  anchor: PlacementPadRect
  /** The panel the pad sits beside, so it never covers its own parent. */
  panel: PlacementPadRect
  pad: { width: number; height: number }
  viewport: { width: number; height: number }
  gap?: number
  margin?: number
}

export interface PlacementPadAnchorPlacement {
  left: number
  top: number
  side: 'right' | 'left'
  /** Vertical room actually available, so a tall pad can scroll rather than clip. */
  maxHeight: number
  /** Where the stem should sit relative to the pad's own top edge. */
  stemTop: number
}

/**
 * The pad goes beside the Clip panel, not above or below it.
 *
 * The panel is already tall and often sits low against the timeline, so
 * stacking a ~460px pad on the same axis runs off the viewport. Sideways there
 * is almost always room - the editor's centre is largely empty - and the pad
 * stops covering the panel it was opened from.
 */
export function placeShowPlacementPad({
  anchor,
  panel,
  pad,
  viewport,
  gap = 10,
  margin = 8,
}: PlacementPadAnchorInput): PlacementPadAnchorPlacement {
  const panelRight = panel.left + panel.width
  const roomRight = viewport.width - margin - (panelRight + gap)
  const roomLeft = panel.left - gap - margin
  const side: 'right' | 'left' = roomRight >= pad.width || roomRight >= roomLeft ? 'right' : 'left'

  const desiredLeft = side === 'right' ? panelRight + gap : panel.left - gap - pad.width
  const left = clamp(desiredLeft, margin, Math.max(margin, viewport.width - margin - pad.width))

  const maxHeight = Math.max(1, viewport.height - margin * 2)
  const height = Math.min(pad.height, maxHeight)
  // Line the pad up with the row that opened it, then keep it on screen.
  const top = clamp(anchor.top, margin, Math.max(margin, viewport.height - margin - height))

  return {
    left,
    top,
    side,
    maxHeight,
    stemTop: clamp(anchor.top + anchor.height / 2 - top, 10, Math.max(10, height - 10)),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

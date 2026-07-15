export type ShowEntityDetailRect = {
  left: number
  top: number
  width: number
  height: number
}

export type ShowEntityDetailPlacement = {
  left: number
  top: number
  placement: 'above' | 'below'
  stemLeft: number
}

export function placeShowEntityDetailPanel({
  anchor,
  panel,
  viewport,
  margin = 8,
  gap = 10,
}: {
  anchor: ShowEntityDetailRect
  panel: Pick<ShowEntityDetailRect, 'width' | 'height'>
  viewport: Pick<ShowEntityDetailRect, 'width' | 'height'>
  margin?: number
  gap?: number
}): ShowEntityDetailPlacement {
  const anchorCenter = anchor.left + anchor.width / 2
  const belowTop = anchor.top + anchor.height + gap
  const aboveTop = anchor.top - panel.height - gap
  const roomBelow = viewport.height - margin - belowTop
  const roomAbove = anchor.top - gap - margin
  const placement = roomBelow >= panel.height || roomBelow >= roomAbove ? 'below' : 'above'
  const desiredTop = placement === 'below' ? belowTop : aboveTop
  const left = clamp(anchorCenter - panel.width / 2, margin, viewport.width - panel.width - margin)
  const top = clamp(desiredTop, margin, viewport.height - panel.height - margin)
  const stemLeft = clamp(anchorCenter - left, 16, panel.width - 16)

  return { left, top, placement, stemLeft }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

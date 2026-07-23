export type ShowEntityDetailRect = {
  left: number
  top: number
  width: number
  height: number
}

export type ShowEntityDetailPlacement = {
  left: number
  top: number
  maxHeight: number
  placement: 'above' | 'below'
  stemLeft: number
}

export function placeShowEntityDetailPanel({
  anchor,
  panel,
  viewport,
  avoid = [],
  margin = 8,
  gap = 10,
  collisionGap = 8,
}: {
  anchor: ShowEntityDetailRect
  panel: Pick<ShowEntityDetailRect, 'width' | 'height'>
  viewport: Pick<ShowEntityDetailRect, 'width' | 'height'>
  avoid?: ShowEntityDetailRect[]
  margin?: number
  gap?: number
  collisionGap?: number
}): ShowEntityDetailPlacement {
  const anchorCenter = anchor.left + anchor.width / 2
  const belowTop = anchor.top + anchor.height + gap
  const roomBelow = viewport.height - margin - belowTop
  const roomAbove = anchor.top - gap - margin
  const placement = roomBelow >= panel.height || roomBelow >= roomAbove ? 'below' : 'above'
  const placeOnSide = (side: 'above' | 'below', leftOverride?: number): ShowEntityDetailPlacement => {
    const maxHeight = Math.max(1, side === 'below' ? roomBelow : roomAbove)
    const renderedHeight = Math.min(panel.height, maxHeight)
    const desiredTop = side === 'below' ? belowTop : anchor.top - gap - renderedHeight
    const left = clamp(
      leftOverride ?? anchorCenter - panel.width / 2,
      margin,
      viewport.width - panel.width - margin,
    )
    const top = clamp(desiredTop, margin, viewport.height - renderedHeight - margin)
    const stemLeft = clamp(anchorCenter - left, 16, panel.width - 16)
    return { left, top, maxHeight, placement: side, stemLeft }
  }
  const preferred = placeOnSide(placement)
  if (!avoid.some((rect) => placementsCollide(preferred, panel.width, panel.height, rect, collisionGap))) return preferred

  const candidates: ShowEntityDetailPlacement[] = []
  for (const side of [placement, placement === 'below' ? 'above' : 'below'] as const) {
    const natural = placeOnSide(side)
    candidates.push(natural)
    for (const rect of avoid) {
      candidates.push(
        placeOnSide(side, rect.left - collisionGap - panel.width),
        placeOnSide(side, rect.left + rect.width + collisionGap),
      )
    }
  }
  const packed = candidates
    .filter((candidate) => !avoid.some((rect) => placementsCollide(candidate, panel.width, panel.height, rect, collisionGap)))
    .sort((left, right) => placementDistance(left, preferred) - placementDistance(right, preferred))[0]
  return packed ?? preferred
}

function placementsCollide(
  placement: ShowEntityDetailPlacement,
  panelWidth: number,
  panelHeight: number,
  rect: ShowEntityDetailRect,
  gap: number,
): boolean {
  const renderedHeight = Math.min(panelHeight, placement.maxHeight)
  return placement.left < rect.left + rect.width + gap
    && placement.left + panelWidth + gap > rect.left
    && placement.top < rect.top + rect.height + gap
    && placement.top + renderedHeight + gap > rect.top
}

function placementDistance(candidate: ShowEntityDetailPlacement, preferred: ShowEntityDetailPlacement): number {
  const sideChangePenalty = candidate.placement === preferred.placement ? 0 : 80
  return Math.abs(candidate.left - preferred.left) + Math.abs(candidate.top - preferred.top) + sideChangePenalty
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

type OverlaySide = 'top' | 'bottom'

interface RectLike {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

interface ViewportSize {
  width: number
  height: number
}

export interface AnchoredOverlayPlacement {
  left: number
  top: number
  maxWidth: number
  maxHeight: number
  side: OverlaySide
}

export function placeAnchoredOverlay({
  anchor,
  overlay,
  viewport,
  align,
  preferredSide,
  gap = 4,
  margin = 8,
}: {
  anchor: RectLike
  overlay: Pick<RectLike, 'width' | 'height'>
  viewport: ViewportSize
  align: 'left' | 'right'
  preferredSide: OverlaySide
  gap?: number
  margin?: number
}): AnchoredOverlayPlacement {
  const maxWidth = Math.max(1, viewport.width - margin * 2)
  const renderedWidth = Math.min(Math.max(1, overlay.width), maxWidth)
  const availableAbove = Math.max(1, anchor.top - gap - margin)
  const availableBelow = Math.max(1, viewport.height - anchor.bottom - gap - margin)
  const preferredAvailable = preferredSide === 'top' ? availableAbove : availableBelow
  const oppositeAvailable = preferredSide === 'top' ? availableBelow : availableAbove
  const side = overlay.height > preferredAvailable && oppositeAvailable > preferredAvailable
    ? preferredSide === 'top' ? 'bottom' : 'top'
    : preferredSide
  const maxHeight = side === 'top' ? availableAbove : availableBelow
  const renderedHeight = Math.min(Math.max(1, overlay.height), maxHeight)
  const unclampedLeft = align === 'left' ? anchor.left : anchor.right - renderedWidth
  const left = Math.max(margin, Math.min(unclampedLeft, viewport.width - margin - renderedWidth))
  const top = side === 'top'
    ? Math.max(margin, anchor.top - gap - renderedHeight)
    : anchor.bottom + gap

  return { left, top, maxWidth, maxHeight, side }
}

export function useAnchoredOverlayPosition(
  triggerRef: RefObject<HTMLElement | null>,
  overlayRef: RefObject<HTMLElement | null>,
  open: boolean,
  {
    align = 'right',
    preferredSide = 'bottom',
    gap = 4,
    margin = 8,
  }: {
    align?: 'left' | 'right'
    preferredSide?: OverlaySide | 'responsive'
    gap?: number
    margin?: number
  } = {},
): CSSProperties {
  const [placement, setPlacement] = useState<AnchoredOverlayPlacement | null>(null)

  const update = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect()
    const overlay = overlayRef.current?.getBoundingClientRect()
    if (!anchor || !overlay) return
    const resolvedSide = preferredSide === 'responsive'
      ? window.matchMedia?.('(min-width: 640px)').matches ? 'bottom' : 'top'
      : preferredSide
    setPlacement(placeAnchoredOverlay({
      anchor,
      overlay: {
        width: overlay.width || anchor.width || 1,
        height: overlay.height || 1,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      align,
      preferredSide: resolvedSide,
      gap,
      margin,
    }))
  }, [align, gap, margin, overlayRef, preferredSide, triggerRef])

  useLayoutEffect(() => {
    if (!open) return
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, update])

  return {
    position: 'fixed',
    left: placement?.left ?? 0,
    top: placement?.top ?? 0,
    maxWidth: placement?.maxWidth,
    maxHeight: placement?.maxHeight,
    visibility: placement ? 'visible' : 'hidden',
    zIndex: 50,
  }
}

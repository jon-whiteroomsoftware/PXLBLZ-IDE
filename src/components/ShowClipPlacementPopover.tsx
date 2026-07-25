import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeShowEntityDetailPanel, type ShowEntityDetailPlacement } from '@/engine/showEntityDetailPlacement'

// A second floating layer over the Clip detail panel, holding the placement pad.
//
// It carries role="dialog" deliberately: the editor's outside-pointerdown
// handler bails on `closest('[role="dialog"]')`, so pointer activity in here
// never reads as a click outside the panel that owns it. Escape is handled in
// the capture phase for the same reason - the editor closes the whole panel on
// Escape, and the nearer layer should win.

export function ShowClipPlacementPopover({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: HTMLElement
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<ShowEntityDetailPlacement | null>(null)

  const updatePosition = useCallback(() => {
    const popover = popoverRef.current
    if (!popover || !anchor.isConnected) return
    setPosition(placeShowEntityDetailPanel({
      anchor: anchor.getBoundingClientRect(),
      panel: popover.getBoundingClientRect(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      avoid: [],
    }))
  }, [anchor])

  useLayoutEffect(() => {
    updatePosition()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    observer?.observe(anchor)
    if (popoverRef.current) observer?.observe(popoverRef.current)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchor, updatePosition])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popoverRef.current?.contains(target) || anchor.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      data-testid="show-clip-placement-popover"
      data-placement={position?.placement ?? 'measuring'}
      className="fixed z-[90] w-[min(440px,calc(100vw-16px))] rounded-md border border-zinc-600 bg-[#0b0b0e]/[0.985] p-2.5 shadow-[0_18px_55px_-18px_rgba(0,0,0,0.95)] backdrop-blur-sm"
      style={{
        left: position?.left ?? 8,
        top: position?.top ?? 8,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <span
        aria-hidden
        className={position?.placement === 'above'
          ? 'pointer-events-none absolute z-10 size-3 rotate-45 border-b border-r border-zinc-600 bg-[#0b0b0e]'
          : 'pointer-events-none absolute z-10 size-3 rotate-45 border-l border-t border-zinc-600 bg-[#0b0b0e]'}
        style={{
          left: (position?.stemLeft ?? 24) - 6,
          top: position?.placement === 'above' ? 'calc(100% - 6px)' : -6,
        }}
      />
      {children}
    </div>,
    document.body,
  )
}

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Pin, PinOff } from 'lucide-react'
import { placeShowEntityDetailPanel, type ShowEntityDetailPlacement } from '@/engine/showEntityDetailPlacement'

export function ShowEntityDetailPanel({
  anchor,
  ownerKey,
  pinned = false,
  avoidPinnedPanel = false,
  onPinnedChange,
  onClose,
  children,
}: {
  anchor: HTMLElement
  ownerKey: string
  pinned?: boolean
  avoidPinnedPanel?: boolean
  onPinnedChange?: () => void
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<ShowEntityDetailPlacement | null>(null)
  const updatePosition = useCallback(() => {
    const panel = panelRef.current
    if (!panel || !anchor.isConnected) return
    const anchorRect = anchor.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const avoid = avoidPinnedPanel
      ? [...document.querySelectorAll<HTMLElement>('[data-testid="show-entity-detail-panel"][data-pinned="true"]')]
          .filter((candidate) => candidate !== panel)
          .map((candidate) => candidate.getBoundingClientRect())
      : []
    setPosition(placeShowEntityDetailPanel({
      anchor: anchorRect,
      panel: panelRect,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      avoid,
    }))
  }, [anchor, avoidPinnedPanel])

  useLayoutEffect(() => {
    updatePosition()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePosition)
    observer?.observe(anchor)
    if (panelRef.current) observer?.observe(panelRef.current)
    if (avoidPinnedPanel) {
      document
        .querySelectorAll<HTMLElement>('[data-testid="show-entity-detail-panel"][data-pinned="true"]')
        .forEach((candidate) => observer?.observe(candidate))
    }
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchor, avoidPinnedPanel, updatePosition])

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="Entity Detail Panel"
      data-testid="show-entity-detail-panel"
      data-owner-key={ownerKey}
      data-pinned={pinned ? 'true' : 'false'}
      data-placement={position?.placement ?? 'measuring'}
      className="fixed z-[80] w-[min(408px,calc(100vw-16px))] max-h-[min(560px,calc(100vh-16px))] overflow-x-hidden overflow-y-auto rounded-md border border-zinc-700 bg-[#08080a]/[0.985] shadow-[0_18px_55px_-18px_rgba(0,0,0,0.95),0_0_0_1px_rgba(245,158,11,0.08)] backdrop-blur-sm has-[[data-entity-family=clip]]:overflow-y-hidden [&:has([data-entity-family=clip])>div]:h-full"
      style={{
        left: position?.left ?? 8,
        top: position?.top ?? 8,
        maxHeight: position ? Math.min(560, position.maxHeight) : undefined,
        visibility: position ? 'visible' : 'hidden',
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span
        aria-hidden
        data-testid="show-entity-detail-stem"
        className={position?.placement === 'above'
          ? 'pointer-events-none absolute z-10 size-3 rotate-45 border-b border-r border-zinc-700 bg-[#08080a]'
          : 'pointer-events-none absolute z-10 size-3 rotate-45 border-l border-t border-zinc-700 bg-[#08080a]'}
        style={{
          left: (position?.stemLeft ?? 24) - 6,
          top: position?.placement === 'above' ? 'calc(100% - 6px)' : -6,
        }}
      />
      {onPinnedChange && (
        <button
          type="button"
          aria-label={pinned ? 'Unpin Entity Detail Panel' : 'Pin Entity Detail Panel'}
          title={pinned ? 'Unpin comparison' : 'Keep open for comparison'}
          onClick={onPinnedChange}
          className="absolute right-9 top-2 z-20 grid size-6 place-items-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300"
        >
          {pinned ? <PinOff size={12} aria-hidden /> : <Pin size={12} aria-hidden />}
        </button>
      )}
      <button
        type="button"
        aria-label="Close Entity Detail Panel"
        title="Close properties (Escape)"
        onClick={onClose}
        className="absolute right-2 top-2 z-20 grid size-6 place-items-center rounded text-sm text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300"
      >
        ×
      </button>
      {children}
    </div>,
    document.body,
  )
}

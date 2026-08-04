import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Pin, PinOff } from 'lucide-react'
import { placeShowEntityDetailPanel, type ShowEntityDetailPlacement } from '@/engine/showEntityDetailPlacement'

const ShowEntityDetailPanelHeightContext = createContext<((height: number | undefined) => void) | null>(null)

/** Lets embedded detail content size its owning floating panel to the active view. */
export function useShowEntityDetailPanelHeight(height: number | undefined) {
  const requestHeight = useContext(ShowEntityDetailPanelHeightContext)

  useLayoutEffect(() => {
    requestHeight?.(height)
    return () => requestHeight?.(undefined)
  }, [height, requestHeight])
}

export function ShowEntityDetailPanel({
  anchor,
  ownerKey,
  pinned = false,
  avoidPinnedPanel = false,
  bodyOwnsOverflow = false,
  onPinnedChange,
  onClose,
  children,
}: {
  anchor: HTMLElement
  ownerKey: string
  pinned?: boolean
  avoidPinnedPanel?: boolean
  bodyOwnsOverflow?: boolean
  onPinnedChange?: () => void
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<ShowEntityDetailPlacement | null>(null)
  const [requestedBodyHeight, setRequestedBodyHeight] = useState<number>()
  const requestBodyHeight = useCallback((height: number | undefined) => {
    setRequestedBodyHeight(height)
  }, [])
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

  const sidePlacement = position?.placement === 'left' || position?.placement === 'right'
  const effectiveBodyHeight = requestedBodyHeight ?? 560
  const panelMaxHeight = position
    ? Math.min(bodyOwnsOverflow ? effectiveBodyHeight : 560, position.maxHeight)
    : undefined
  const stemClassName = position?.placement === 'above'
    ? 'border-b border-r'
    : position?.placement === 'left'
      ? 'border-r border-t'
      : position?.placement === 'right'
        ? 'border-b border-l'
        : 'border-l border-t'
  const stemStyle = position && sidePlacement
    ? {
        left: position.placement === 'right' ? -6 : 'calc(100% - 6px)',
        top: position.stemTop - 6,
      }
    : {
        left: position && 'stemLeft' in position ? position.stemLeft - 6 : 18,
        top: position?.placement === 'above' ? 'calc(100% - 6px)' : -6,
      }

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
      data-scroll-owner={bodyOwnsOverflow ? 'body' : 'panel'}
      className={`fixed z-[80] w-[min(408px,calc(100vw-16px))] max-h-[min(560px,calc(100vh-16px))] overflow-x-hidden rounded-md border border-zinc-700 bg-[#08080a]/[0.985] shadow-[0_18px_55px_-18px_rgba(0,0,0,0.95),0_0_0_1px_rgba(245,158,11,0.08)] backdrop-blur-sm ${bodyOwnsOverflow ? 'overflow-y-hidden' : 'overflow-y-auto'}`}
      style={{
        left: position?.left ?? 8,
        top: position?.top ?? 8,
        height: bodyOwnsOverflow ? panelMaxHeight : undefined,
        maxHeight: panelMaxHeight,
        visibility: position ? 'visible' : 'hidden',
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span
        aria-hidden
        data-testid="show-entity-detail-stem"
        className={`pointer-events-none absolute z-10 size-3 rotate-45 border-zinc-700 bg-[#08080a] ${stemClassName}`}
        style={stemStyle}
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
      <ShowEntityDetailPanelHeightContext.Provider value={requestBodyHeight}>
        {children}
      </ShowEntityDetailPanelHeightContext.Provider>
    </div>,
    document.body,
  )
}

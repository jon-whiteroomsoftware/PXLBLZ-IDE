import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fitShowTimelineViewport,
  reconcileShowTimelineViewport,
  type ShowTimelineViewport,
} from '@/engine/showTimelineViewport'
import { useShowTransportStore } from '@/store/showTransportStore'

/** What the ruler assumes before the surface has been measured. */
export const SHOW_TIMELINE_DEFAULT_WIDTH_PX = 812

export interface ShowTimelineViewportState {
  /** The visible window both v2 surfaces and the shared lanes draw. */
  viewport: ShowTimelineViewport
  setViewport: (viewport: ShowTimelineViewport) => void
  /** The measured width of the drawn timeline, for tick and snap thresholds. */
  visibleWidthPx: number
  /** Attach to the element whose width the window is drawn across. */
  measureRef: (element: HTMLElement | null) => void
}

/**
 * The v2 timeline's visible window (#1039).
 *
 * Presentation state, held by the surface: zoom and pan reach no view model,
 * owner, record, history entry or save, and nothing about them is persisted.
 * An edit that moves Show End - Insert Time, Set Show End, a Clip dragged past
 * the end - rescales the window around the playhead rather than dropping the
 * author back to fit, exactly as the v1 workspace does.
 */
export function useShowTimelineViewport(showEndMs: number, showId?: string): ShowTimelineViewportState {
  const totalMs = Math.max(1, showEndMs)
  const fitted = useMemo(() => fitShowTimelineViewport(totalMs), [totalMs])
  const [stored, setStored] = useState<ShowTimelineViewport | null>(null)
  const [visibleWidthPx, setVisibleWidthPx] = useState(SHOW_TIMELINE_DEFAULT_WIDTH_PX)

  // An edit moved Show End under the window: rescale it now, in the render
  // that saw the new total. Adjusting this component's own state during its
  // render is React's documented way to derive from changed input, and React
  // re-runs the component before committing, so the stale window never paints.
  if (stored && stored.totalMs !== totalMs) {
    // The anchor a rescale keeps in view. Read rather than subscribed: the
    // playhead moves every frame during playback and must not re-render this.
    const transport = useShowTransportStore.getState()
    setStored(reconcileShowTimelineViewport(
      stored,
      totalMs,
      showId !== undefined && transport.showId === showId ? transport.positionMs : 0,
    ))
  }
  const viewport = stored && stored.totalMs === totalMs ? stored : fitted

  const observed = useRef<{ element: HTMLElement; observer: ResizeObserver } | null>(null)
  const measureRef = useCallback((element: HTMLElement | null) => {
    if (observed.current?.element === element) return
    observed.current?.observer.disconnect()
    observed.current = null
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setVisibleWidthPx(Math.max(1, Math.round(element.getBoundingClientRect().width)) )
    })
    observer.observe(element)
    observed.current = { element, observer }
    const width = Math.round(element.getBoundingClientRect().width)
    if (width > 0) setVisibleWidthPx(width)
  }, [])
  useEffect(() => () => { observed.current?.observer.disconnect() }, [])

  return { viewport, setViewport: setStored, visibleWidthPx, measureRef }
}

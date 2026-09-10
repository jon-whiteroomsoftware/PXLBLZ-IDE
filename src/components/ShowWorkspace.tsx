import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  SHOW_STRIP_MIN_HEIGHT,
  SHOW_TIMELINE_HEIGHT_STORAGE_KEY,
  SHOW_TIMELINE_MIN_HEIGHT,
  SHOW_WORKSPACE_DIVIDER_HEIGHT,
  parseShowTimelineHeight,
  resolveShowWorkspaceLayout,
  serializeShowTimelineHeight,
} from '@/engine/showWorkspaceLayout'
import ShowSourceOutletContext from './ShowSourceOutlet'

export function ShowWorkspace({
  previewAspect,
  timelineMinimumHeight = SHOW_TIMELINE_MIN_HEIGHT,
  timelineContentHeight,
  timeline,
  stage,
}: {
  previewAspect: number
  timelineMinimumHeight?: number
  timelineContentHeight?: number
  timeline: ReactNode
  stage: ReactNode | null
}) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; y: number; height: number; target: HTMLDivElement } | null>(null)
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [desiredTimelineHeight, setDesiredTimelineHeightState] = useState<number | null>(() => {
    try {
      return parseShowTimelineHeight(window.localStorage.getItem(SHOW_TIMELINE_HEIGHT_STORAGE_KEY))
    } catch {
      return null
    }
  })
  const [sourceOutlet, setSourceOutlet] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => resolveShowWorkspaceLayout({
    ...size,
    desiredTimelineHeight,
    previewAspect,
    timelineMinimumHeight,
    timelineContentHeight,
  }), [desiredTimelineHeight, previewAspect, size, timelineMinimumHeight, timelineContentHeight])

  const rememberTimelineHeight = useCallback((height: number) => {
    const rounded = Math.round(height)
    setDesiredTimelineHeightState(rounded)
    try {
      window.localStorage.setItem(SHOW_TIMELINE_HEIGHT_STORAGE_KEY, serializeShowTimelineHeight(rounded))
    } catch {
      // A blocked storage surface should not make the divider unusable.
    }
  }, [])

  const moveDivider = useCallback((deltaY: number) => {
    const next = resolveShowWorkspaceLayout({
      ...size,
      desiredTimelineHeight: layout.timelineHeight + deltaY,
      previewAspect,
      timelineMinimumHeight,
    })
    rememberTimelineHeight(next.timelineHeight)
  }, [layout.timelineHeight, previewAspect, rememberTimelineHeight, size, timelineMinimumHeight])

  const endDragging = useCallback((pointerId?: number) => {
    const drag = dragRef.current
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return
    dragRef.current = null
    if (drag.target.hasPointerCapture?.(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId)
    }
  }, [])

  const beginDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return
    dragRef.current = { pointerId: event.pointerId, y: event.clientY, height: layout.timelineHeight, target: event.currentTarget }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  const stageAvailable = stage !== null

  useEffect(() => {
    const finish = (event: PointerEvent) => endDragging(event.pointerId)
    const blur = () => endDragging()
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    window.addEventListener('blur', blur)
    return () => {
      endDragging()
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', finish, true)
      window.removeEventListener('blur', blur)
    }
  }, [endDragging, stageAvailable])

  const sourceContext = useMemo(() => ({
    enabled: stageAvailable,
    target: sourceOutlet,
    setTarget: setSourceOutlet,
  }), [sourceOutlet, stageAvailable])

  return (
    <ShowSourceOutletContext.Provider value={sourceContext}>
      <div ref={workspaceRef} className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="show-over-under-workspace">
        <div
          data-testid="show-timeline-pane"
          className="min-h-0 shrink-0 overflow-hidden"
          style={{ height: stageAvailable ? layout.timelineHeight : '100%' }}
        >
          {timeline}
        </div>
        {stageAvailable && <div
          role="separator"
          tabIndex={0}
          aria-label="Resize timeline and Stage"
          aria-orientation="horizontal"
          aria-valuemin={Math.min(timelineMinimumHeight, Math.max(1, size.height - SHOW_WORKSPACE_DIVIDER_HEIGHT))}
          aria-valuemax={Math.max(1, size.height - SHOW_WORKSPACE_DIVIDER_HEIGHT - SHOW_STRIP_MIN_HEIGHT)}
          aria-valuenow={layout.timelineHeight}
          data-clamp={layout.clamp ?? 'none'}
          className={`group relative h-[6px] shrink-0 cursor-row-resize touch-none select-none border-y transition-colors focus-visible:outline-none ${layout.clamp
            ? 'border-red-400/45 bg-red-400/15'
            : 'border-seam bg-zinc-900 hover:border-amber-300/45 focus-visible:border-amber-300/60'}`}
          onPointerDown={beginDragging}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            if ((event.buttons & 1) === 0) {
              endDragging(event.pointerId)
              return
            }
            // Pointer moves can batch before React renders. Accumulate against
            // the gesture's last clamped height, not a stale rendered layout.
            const next = resolveShowWorkspaceLayout({
              ...size,
              desiredTimelineHeight: drag.height + event.clientY - drag.y,
              previewAspect,
              timelineMinimumHeight,
            })
            drag.height = next.timelineHeight
            drag.y = event.clientY
            rememberTimelineHeight(next.timelineHeight)
          }}
          onPointerUp={(event) => endDragging(event.pointerId)}
          onPointerCancel={(event) => endDragging(event.pointerId)}
          onLostPointerCapture={(event) => endDragging(event.pointerId)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
            event.preventDefault()
            moveDivider((event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? 50 : 10))
          }}
        >
          <span
            aria-hidden
            className={`absolute left-1/2 top-1/2 h-0.5 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${layout.clamp
              ? 'bg-red-400'
              : 'bg-zinc-600 group-hover:bg-amber-300 group-focus-visible:bg-amber-300'}`}
          />
        </div>}
        {stageAvailable && <div
          data-testid="show-stage-strip"
          className="min-h-0 shrink-0 overflow-hidden bg-zinc-950"
          style={{ height: layout.stripHeight }}
        >
          {stage}
        </div>}
      </div>
    </ShowSourceOutletContext.Provider>
  )
}

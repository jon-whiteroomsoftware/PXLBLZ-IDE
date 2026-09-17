import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useRef } from 'react'
import {
  panShowTimelineViewport,
  resizeShowTimelineViewport,
  showTimelineThumb,
  type ShowTimelineViewport,
} from '@/engine/showTimelineViewport'
import { usePreviewStore } from '@/store/previewStore'
import { useShowTransportStore } from '@/store/showTransportStore'

/**
 * The Show navigator: the whole Show as one strip, the visible window as a
 * draggable thumb with its own edge handles, the playhead, and the zoom
 * percentage. It is the timeline's zoom and pan control on both editor routes -
 * the v1 workspace's toolbar and the v2 surface's view controls - because it
 * reads nothing but a viewport and the transport position, and returns a new
 * viewport. It holds no record, no view model and no version.
 *
 * Keyboard: `←`/`→` on the thumb pans by 5% of the window, and the same keys on
 * either edge handle resize that edge - the keyboard zoom. `Space` stays the
 * studio's playback toggle, so a focused handle never swallows it.
 *
 * Extracted verbatim from `ShowEditor` for #1039; the v1 fingerprint corpus is
 * the oracle that its markup did not move a byte.
 */
export function ShowTimelineNavigator({
  showId,
  viewport,
  onChange,
  compact = false,
}: {
  showId: string
  viewport: ShowTimelineViewport
  onChange: (viewport: ShowTimelineViewport) => void
  compact?: boolean
}) {
  const overviewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'pan' | 'start' | 'end'; x: number; viewport: ShowTimelineViewport } | null>(null)
  const thumb = showTimelineThumb(viewport)
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  const playheadPercent = viewport.totalMs > 0
    ? Math.min(100, Math.max(0, positionMs / viewport.totalMs * 100))
    : 0
  const beginDrag = (mode: 'pan' | 'start' | 'end', event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    event.currentTarget.focus()
    dragRef.current = { mode, x: event.clientX, viewport }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    const width = overviewRef.current?.clientWidth ?? 0
    if (!drag || width <= 0) return
    const deltaMs = (event.clientX - drag.x) / width * drag.viewport.totalMs
    if (drag.mode === 'pan') onChange(panShowTimelineViewport(drag.viewport, drag.viewport.startMs + deltaMs))
    if (drag.mode === 'start') onChange(resizeShowTimelineViewport(drag.viewport, 'start', drag.viewport.startMs + deltaMs))
    if (drag.mode === 'end') onChange(resizeShowTimelineViewport(drag.viewport, 'end', drag.viewport.startMs + drag.viewport.durationMs + deltaMs))
  }
  const endDrag = () => { dragRef.current = null }
  const keyboardStep = viewport.durationMs * 0.05
  const togglePlaybackOnSpace = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.code !== 'Space') return false
    event.preventDefault()
    usePreviewStore.getState().toggle()
    return true
  }
  return (
    <div
      className={compact
        ? 'timeline-zoom-cluster grid h-6 min-w-[96px] max-w-[260px] flex-1 grid-cols-[minmax(0,1fr)_30px] bg-zinc-950/45'
        : 'mt-2 grid h-9 grid-cols-[148px_minmax(0,1fr)_64px] border-t border-zinc-800 bg-zinc-950/65'}
      role="group"
      aria-label="Show navigator"
    >
      {!compact && <div className="flex items-center px-2 text-[9px] uppercase tracking-[0.12em] text-zinc-600">Show navigator</div>}
      <div ref={overviewRef} className={compact ? 'relative my-1 overflow-hidden rounded-sm bg-zinc-900/80' : 'relative my-2 overflow-hidden rounded-sm bg-zinc-900/80'}>
        <div className="absolute inset-y-0 left-0 right-0 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(161,161,170,.35) 0 1px, transparent 1px 8%)' }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Pan visible timeline range"
          aria-valuemin={0}
          aria-valuemax={Math.round(viewport.totalMs - viewport.durationMs)}
          aria-valuenow={Math.round(viewport.startMs)}
          className="absolute inset-y-[-3px] cursor-grab rounded border border-amber-400 bg-amber-400/[0.07] outline-none focus:ring-1 focus:ring-amber-300"
          style={{ left: `${thumb.leftPercent}%`, width: `${thumb.widthPercent}%` }}
          onPointerDown={(event) => beginDrag('pan', event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            if (togglePlaybackOnSpace(event)) return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            onChange(panShowTimelineViewport(viewport, viewport.startMs + (event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep)))
          }}
        />
        <button
          type="button"
          aria-label="Resize visible range start"
          className="absolute inset-y-1 z-10 w-1 cursor-ew-resize border-x border-zinc-500/70 outline-none transition-colors hover:border-amber-300 focus-visible:border-amber-300"
          style={{ left: `calc(${thumb.leftPercent}% + 4px)` }}
          onPointerDown={(event) => beginDrag('start', event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            if (togglePlaybackOnSpace(event)) return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            onChange(resizeShowTimelineViewport(viewport, 'start', viewport.startMs + (event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep)))
          }}
        />
        <button
          type="button"
          aria-label="Resize visible range end"
          className="absolute inset-y-1 z-10 w-1 cursor-ew-resize border-x border-zinc-500/70 outline-none transition-colors hover:border-amber-300 focus-visible:border-amber-300"
          style={{ left: `calc(${thumb.leftPercent + thumb.widthPercent}% - 8px)` }}
          onPointerDown={(event) => beginDrag('end', event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            if (togglePlaybackOnSpace(event)) return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const end = viewport.startMs + viewport.durationMs + (event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep)
            onChange(resizeShowTimelineViewport(viewport, 'end', end))
          }}
        />
        <span
          aria-hidden
          data-testid="show-timeline-navigator-playhead"
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-live/60 shadow-[0_0_3px_color-mix(in_srgb,var(--color-live)_25%,transparent)]"
          style={{ left: `${playheadPercent}%` }}
        />
        <span
          aria-hidden
          data-testid="show-timeline-navigator-playhead-cap"
          className="pointer-events-none absolute top-0 z-20 h-1 w-1.5 bg-live/70"
          style={timelinePlayheadCapStyle(playheadPercent)}
        />
      </div>
      <div className="flex items-center justify-end px-1.5 text-[9px] tabular-nums text-zinc-600">{Math.round(viewport.totalMs / viewport.durationMs * 100)}%</div>
    </div>
  )
}

function timelinePlayheadCapStyle(positionPercent: number): CSSProperties {
  if (positionPercent <= 0) {
    return {
      left: '0%',
      transform: 'translateX(0)',
      clipPath: 'polygon(0 100%, 0 0, 100% 0)',
    }
  }
  if (positionPercent >= 100) {
    return {
      left: '100%',
      transform: 'translateX(-100%)',
      clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
    }
  }
  return {
    left: `${positionPercent}%`,
    transform: 'translateX(-50%)',
    clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
  }
}

import { Redo2, Undo2 } from 'lucide-react'
import {
  fitShowTimelineViewport,
  showTimelineRulerTicks,
} from '@/engine/showTimelineViewport'
import {
  showTimelineSelectionKey,
  type ShowTimelineJunctionView,
  type ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'
import { useShowTransportStore } from '@/store/showTransportStore'

/**
 * The lanes every v2 timeline surface draws the same way: the ruler, the Zone
 * Layouts lane, the Marker lane and a Layer junction mark. They read only the
 * version-agnostic view model, hold no record and offer no edit, so the
 * read-only surface and the gesture surface share one rendering.
 *
 * Authoring the Layout lane and Transition junctions is #1056 slice 4.
 */
export function showTimelinePercentOf(totalMs: number): (timeMs: number) => string {
  return (timeMs: number) => `${Math.min(100, Math.max(0, timeMs / totalMs * 100))}%`
}

/**
 * The route's Undo and Redo. Both v2 surfaces draw them, because history
 * belongs to the record rather than to the gestures: a record whose prepared
 * Stage refuses is still edited through the inspectors, and those edits must
 * be undoable (#1056 slice 6).
 */
export function ShowTimelineHistoryControls({ undo, redo, canUndo, canRedo, busy }: {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  busy: boolean
}) {
  return (
    <span role="group" aria-label="Show history" className="flex shrink-0 items-center gap-1">
      {([
        ['Undo', undo, !canUndo, Undo2],
        ['Redo', redo, !canRedo, Redo2],
      ] as const).map(([label, run, off, Icon]) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={`${label} (${label === 'Undo' ? '\u2318Z' : '\u21e7\u2318Z'})`}
          aria-disabled={off || busy || undefined}
          onClick={() => { if (!off && !busy) run() }}
          className="flex h-5 w-5 items-center justify-center rounded-sm text-zinc-400 outline-none hover:bg-white/5 focus-visible:ring-1 focus-visible:ring-live/80 aria-disabled:opacity-35"
        >
          <Icon size={11} aria-hidden />
        </button>
      ))}
    </span>
  )
}

export function ShowTimelineRulerLane({ totalMs, percent, transportShowId }: {
  totalMs: number
  percent: (timeMs: number) => string
  /** The Show whose transport draws a playhead here (#1056 slice 6). */
  transportShowId?: string
}) {
  const { ticks } = showTimelineRulerTicks({
    viewport: fitShowTimelineViewport(totalMs),
    rulerDurationMs: totalMs,
    visibleWidthPx: 812,
  })
  return (
    <div
      data-testid="show-timeline-read-only-ruler"
      className="relative h-7 shrink-0 border-b border-zinc-800 bg-zinc-950/70"
      role="presentation"
    >
      {ticks.map((tick) => (
        <span
          key={tick.timeMs}
          aria-hidden
          className={tick.kind === 'major'
            ? 'absolute inset-y-0 w-px bg-zinc-700'
            : 'absolute bottom-0 h-1.5 w-px bg-zinc-800'}
          style={{ left: percent(tick.timeMs) }}
        />
      ))}
      {transportShowId !== undefined && <ShowTimelinePlayhead showId={transportShowId} percent={percent} />}
      {ticks.filter((tick) => tick.label).map((tick) => (
        <span
          key={`label-${tick.timeMs}`}
          aria-hidden
          className="pointer-events-none absolute top-1 pl-1 text-[8.5px] tabular-nums text-zinc-600"
          style={{ left: percent(tick.timeMs) }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  )
}

/**
 * The transport's playhead. It subscribes to the position itself so playback
 * repaints this hairline rather than the whole timeline every frame.
 */
function ShowTimelinePlayhead({ showId, percent }: {
  showId: string
  percent: (timeMs: number) => string
}) {
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : null)
  if (positionMs === null) return null
  return (
    <i
      aria-hidden
      data-testid="show-timeline-playhead"
      data-show-playhead-ms={Math.round(positionMs)}
      className="absolute inset-y-0 z-[3] w-px bg-live"
      style={{ left: percent(positionMs) }}
    />
  )
}

export function ShowTimelineLayoutLane({ view, percent }: {
  view: ShowTimelineViewModel
  percent: (timeMs: number) => string
}) {
  return (
    <div role="group" aria-label="Zone Layouts lane" className="relative h-5 shrink-0 border-b border-zinc-900/80">
      {view.layoutIntervals.map((interval) => (
        <span
          key={interval.id}
          tabIndex={0}
          role="button"
          aria-disabled="true"
          data-show-selection-key={showTimelineSelectionKey(interval.selection)}
          aria-label={`${interval.definitionName} Zone Layout, ${formatShowTimelineRange(interval.startMs, interval.endMs)}${
            interval.parameters.splitPosition === undefined
              ? ''
              : `, split ${Math.round(interval.parameters.splitPosition * 100)}%`
          }`}
          className="absolute inset-y-0 flex items-center overflow-hidden border-l border-zinc-800 px-1 font-mono text-[9px] text-zinc-400 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80"
          style={{ left: percent(interval.startMs), width: percent(interval.durationMs) }}
        >
          <span className="truncate">{interval.definitionName}</span>
        </span>
      ))}
    </div>
  )
}

export function ShowTimelineMarkerLane({ view, percent }: {
  view: ShowTimelineViewModel
  percent: (timeMs: number) => string
}) {
  return (
    <div role="group" aria-label="Show Markers" className="relative h-5 shrink-0 border-b border-zinc-900/80">
      {view.markers.map((marker) => (
        <span
          key={marker.id}
          tabIndex={0}
          role="button"
          aria-disabled="true"
          data-show-selection-key={showTimelineSelectionKey(marker.selection)}
          data-show-marker-role={marker.role}
          aria-label={`${marker.role === 'chapter' ? 'Chapter Marker' : 'Marker'} ${marker.name ?? marker.id} at ${formatShowTimelineTime(marker.timeMs)}`}
          className="absolute inset-y-0 flex max-w-[45%] items-center gap-1 whitespace-nowrap pl-1 font-mono text-[9px] text-zinc-400 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80"
          style={{ left: percent(marker.timeMs), borderLeft: `2px solid ${marker.color ?? '#a1a1aa'}` }}
        >
          <span className="truncate">{marker.name ?? marker.id}</span>
        </span>
      ))}
      <span
        data-testid="show-timeline-read-only-end"
        aria-label={`Show End at ${formatShowTimelineTime(view.showEndMs)}`}
        className="absolute inset-y-0 right-0 flex items-center pr-1 font-mono text-[9px] text-zinc-500"
      >
        End {formatShowTimelineTime(view.showEndMs)}
      </span>
    </div>
  )
}

/** A drawn boundary: a hairline for a derived Cut, a window for a Transition. */
export function ShowTimelineJunctionMark({ junction, percent }: {
  junction: ShowTimelineJunctionView
  percent: (timeMs: number) => string
}) {
  if (junction.scope === 'derived-cut') {
    return (
      <i
        aria-hidden
        data-show-layer-junction={junction.scope}
        className="absolute inset-y-0 z-[2] w-px -translate-x-1/2 bg-zinc-500"
        style={{ left: percent(junction.startMs) }}
      />
    )
  }
  return (
    <i
      aria-hidden
      data-show-layer-junction={junction.scope}
      data-show-transition-kind={junction.kind}
      className="absolute inset-y-1 z-[2] bg-amber-300/25"
      style={{ left: percent(junction.startMs), width: percent(junction.durationMs) }}
    />
  )
}

export function formatShowTimelineRange(startMs: number, endMs: number): string {
  return `${formatShowTimelineTime(startMs)} to ${formatShowTimelineTime(endMs)}`
}

export function formatShowTimelineTime(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(2)}s`
}

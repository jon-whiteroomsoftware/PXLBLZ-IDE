import {
  fitShowTimelineViewport,
  showTimelineRulerTicks,
} from '@/engine/showTimelineViewport'
import {
  showTimelineSelectionKey,
  type ShowTimelineJunctionView,
  type ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'

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

export function ShowTimelineRulerLane({ totalMs, percent }: {
  totalMs: number
  percent: (timeMs: number) => string
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

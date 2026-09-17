import { Lock } from 'lucide-react'
import {
  fitShowTimelineViewport,
  showTimelineRulerTicks,
} from '@/engine/showTimelineViewport'
import {
  showTimelineSelectionKey,
  type ShowTimelineItemView,
  type ShowTimelineJunctionView,
  type ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'

/**
 * The read-only timeline surface for a record the editor renders but cannot yet
 * edit. It draws only from the version-agnostic view model, so it holds no v1
 * or v2 record and offers no mutating control. Items stay focusable so keyboard
 * traversal still reaches every Clip, Layout occurrence and Marker.
 */
export function ShowTimelineReadOnlySurface({
  view,
  statusLine,
}: {
  view: ShowTimelineViewModel
  statusLine: string
}) {
  const totalMs = Math.max(1, view.showEndMs)
  const { ticks } = showTimelineRulerTicks({
    viewport: fitShowTimelineViewport(totalMs),
    rulerDurationMs: totalMs,
    visibleWidthPx: 812,
  })
  const percent = (timeMs: number) => `${Math.min(100, Math.max(0, timeMs / totalMs * 100))}%`

  return (
    <section
      aria-label="Show timeline"
      data-testid="show-timeline-read-only"
      data-show-record-version={view.recordVersion}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#060608] text-zinc-300"
    >
      <div
        role="note"
        data-testid="show-timeline-read-only-status"
        className="flex shrink-0 items-center gap-2 border-b border-amber-300/15 bg-amber-300/[0.035] px-3 py-1.5 text-[10px] text-zinc-500"
      >
        <Lock size={12} aria-hidden className="shrink-0 text-amber-300/70" />
        <span className="min-w-0">{statusLine}</span>
      </div>

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

      <div role="group" aria-label="Zone Layouts lane" className="relative h-5 shrink-0 border-b border-zinc-900/80">
        {view.layoutIntervals.map((interval) => (
          <span
            key={interval.id}
            tabIndex={0}
            role="button"
            aria-disabled="true"
            data-show-selection-key={showTimelineSelectionKey(interval.selection)}
            aria-label={`${interval.definitionName} Zone Layout, ${formatRange(interval.startMs, interval.endMs)}${
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

      <div role="group" aria-label="Show Markers" className="relative h-5 shrink-0 border-b border-zinc-900/80">
        {view.markers.map((marker) => (
          <span
            key={marker.id}
            tabIndex={0}
            role="button"
            aria-disabled="true"
            data-show-selection-key={showTimelineSelectionKey(marker.selection)}
            data-show-marker-role={marker.role}
            aria-label={`${marker.role === 'chapter' ? 'Chapter Marker' : 'Marker'} ${marker.name ?? marker.id} at ${formatTime(marker.timeMs)}`}
            className="absolute inset-y-0 flex max-w-[45%] items-center gap-1 whitespace-nowrap pl-1 font-mono text-[9px] text-zinc-400 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80"
            style={{ left: percent(marker.timeMs), borderLeft: `2px solid ${marker.color ?? '#a1a1aa'}` }}
          >
            <span className="truncate">{marker.name ?? marker.id}</span>
          </span>
        ))}
        <span
          data-testid="show-timeline-read-only-end"
          aria-label={`Show End at ${formatTime(view.showEndMs)}`}
          className="absolute inset-y-0 right-0 flex items-center pr-1 font-mono text-[9px] text-zinc-500"
        >
          End {formatTime(view.showEndMs)}
        </span>
      </div>

      {view.rows.map((row) => (
        <div
          key={row.zoneId}
          role="group"
          aria-label={`Zone ${row.zoneName}`}
          data-show-zone-id={row.zoneId}
          className="flex min-w-0 shrink-0 flex-col border-b border-zinc-900"
        >
          <div className="flex items-center gap-1.5 px-2 py-1 text-[11px]">
            <span aria-hidden className="h-3 w-[3px] rounded-sm" style={{ backgroundColor: row.color ?? '#38bdf8' }} />
            <span className="truncate font-medium">{row.zoneName}</span>
          </div>
          {row.layers.map((layer) => (
            <div
              key={layer.id}
              role="group"
              aria-label={`Layer ${layer.name} in Zone ${row.zoneName}`}
              data-show-layer-id={layer.id}
              data-show-layer-rank={layer.rank}
              className="relative mx-2 mb-1 h-8 min-w-0 rounded-sm bg-white/[0.025]"
            >
              {layer.items.map((item) => (
                <ReadOnlyItem key={item.id} item={item} percent={percent} />
              ))}
              {layer.junctions.map((junction) => (
                <ReadOnlyJunction key={junction.id} junction={junction} percent={percent} />
              ))}
            </div>
          ))}
          {row.composed && row.layers.length === 0 && (
            <p className="px-2 pb-1 text-[9px] text-zinc-600">No Layers in this Zone.</p>
          )}
        </div>
      ))}
    </section>
  )
}

function ReadOnlyItem({
  item,
  percent,
}: {
  item: ShowTimelineItemView
  percent: (timeMs: number) => string
}) {
  return (
    <span
      tabIndex={0}
      role="button"
      aria-disabled="true"
      data-show-composition-clip="true"
      data-show-selection-key={showTimelineSelectionKey(item.selection)}
      data-show-group-occurrence={item.groupOccurrenceId}
      aria-label={`${item.groupOccurrenceId ? 'Group Clip' : 'Clip'} ${item.patternName}, ${
        formatRange(item.startMs, item.endMs)
      }${item.entryPolicy === 'restart' ? ', restarts on entry' : ''}`}
      className="absolute inset-y-0 flex min-w-px items-center overflow-hidden rounded-[3px] border-l-2 border-live/60 bg-live/10 px-1 text-[9px] leading-none text-zinc-200 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80"
      style={{ left: percent(item.startMs), width: percent(item.durationMs) }}
    >
      <span className="truncate">{item.patternName}</span>
    </span>
  )
}

function ReadOnlyJunction({
  junction,
  percent,
}: {
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

function formatRange(startMs: number, endMs: number): string {
  return `${formatTime(startMs)} to ${formatTime(endMs)}`
}

function formatTime(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(2)}s`
}

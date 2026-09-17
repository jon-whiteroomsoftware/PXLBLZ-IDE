import { Lock } from 'lucide-react'
import {
  showTimelineSelectionKey,
  type ShowTimelineItemView,
  type ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'
import { useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import {
  formatShowTimelineRange,
  ShowTimelineHistoryControls,
  ShowTimelineJunctionMark,
  ShowTimelineLayoutLane,
  ShowTimelineMarkerLane,
  ShowTimelineRulerLane,
  showTimelineGeometry,
  type ShowTimelineGeometry,
} from './ShowTimelineLanes'
import { ShowTimelineViewControls } from './ShowTimelineViewControls'
import { useShowTimelineViewport } from './useShowTimelineViewport'

/**
 * The read-only timeline surface for a record the editor renders but cannot
 * edit - a v2 record whose prepared Stage refuses, where every edit would be
 * refused by admission anyway. It draws only from the version-agnostic view
 * model, so it holds no v1 or v2 record and offers no mutating control. Items
 * stay focusable so keyboard traversal still reaches every Clip, Layout
 * occurrence and Marker.
 *
 * It follows the same visible window the gesture surface does (#1039): zoom,
 * pan and the lane toggles are ways of looking at a Show, and a Show that
 * cannot be edited can still be read closely.
 *
 * An editable v2 record renders through `ShowTimelineGestureSurface` instead.
 */
export function ShowTimelineReadOnlySurface({
  view,
  statusLine,
  transportShowId,
  history,
}: {
  view: ShowTimelineViewModel
  statusLine: string
  /** The Show whose transport draws the ruler's playhead (#1056 slice 6). */
  transportShowId?: string
  /**
   * The route's Undo and Redo. A refused record offers no Clip gesture, but
   * the inspectors still edit it, so its history stays reachable here.
   */
  history?: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; busy: boolean }
}) {
  const totalMs = Math.max(1, view.showEndMs)
  const { viewport, setViewport, visibleWidthPx, measureRef } = useShowTimelineViewport(totalMs, transportShowId)
  const geometry = showTimelineGeometry(viewport)
  const markersVisible = useShowEditorSessionStore((state) => state.markersVisible)
  const lanes = useShowEditorSessionStore((state) => state.timelineLanes)

  return (
    <section
      ref={measureRef}
      aria-label="Show timeline"
      data-testid="show-timeline-read-only"
      data-show-record-version={view.recordVersion}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#060608] text-zinc-300"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-300/15 bg-amber-300/[0.035] px-3 py-1.5 text-[10px] text-zinc-500">
        <Lock size={12} aria-hidden className="shrink-0 text-amber-300/70" />
        <span role="note" data-testid="show-timeline-read-only-status" className="min-w-0 flex-1 truncate">{statusLine}</span>
        <ShowTimelineViewControls
          {...(transportShowId === undefined ? {} : { showId: transportShowId })}
          viewport={viewport}
          onViewportChange={setViewport}
        />
        {history && <ShowTimelineHistoryControls {...history} />}
      </div>

      <ShowTimelineRulerLane
        geometry={geometry}
        visibleWidthPx={visibleWidthPx}
        {...(transportShowId === undefined ? {} : { transportShowId })}
      />
      {lanes.zoneLayouts && <ShowTimelineLayoutLane view={view} geometry={geometry} />}
      <ShowTimelineMarkerLane view={view} geometry={geometry} markersVisible={markersVisible} />

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
              className="relative mx-2 mb-1 h-8 min-w-0 overflow-hidden rounded-sm bg-white/[0.025]"
            >
              {layer.items.map((item) => (
                <ReadOnlyItem key={item.id} item={item} geometry={geometry} />
              ))}
              {lanes.junctions && layer.junctions.map((junction) => (
                <ShowTimelineJunctionMark key={junction.id} junction={junction} geometry={geometry} />
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
  geometry,
}: {
  item: ShowTimelineItemView
  geometry: ShowTimelineGeometry
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
        formatShowTimelineRange(item.startMs, item.endMs)
      }${item.entryPolicy === 'restart' ? ', restarts on entry' : ''}`}
      className="absolute inset-y-0 flex min-w-px items-center overflow-hidden rounded-[3px] border-l-2 border-live/60 bg-live/10 px-1 text-[9px] leading-none text-zinc-200 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80"
      style={{ left: geometry.at(item.startMs), width: geometry.span(item.durationMs) }}
    >
      <span className="truncate">{item.patternName}</span>
    </span>
  )
}

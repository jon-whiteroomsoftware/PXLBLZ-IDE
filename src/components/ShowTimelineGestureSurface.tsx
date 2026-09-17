import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  resolveShowTimelineClipDropV2,
  resolveShowTimelineEdgeDropV2,
  showTimelineGestureStepMs,
  type ShowTimelineClipDropV2,
  type ShowTimelineGestureV2,
} from '@/engine/showTimelineGesturesV2'
import {
  showTimelineSelectionKey,
  type ShowTimelineItemView,
  type ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'
import { useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { useShowTransportStore } from '@/store/showTransportStore'
import {
  formatShowTimelineRange,
  ShowTimelineHistoryControls,
  ShowTimelineJunctionMark,
  ShowTimelineLayoutLane,
  ShowTimelineMarkerLane,
  ShowTimelineRulerLane,
  showTimelineGeometry,
  showTimelineLabelInset,
  type ShowTimelineGeometry,
} from './ShowTimelineLanes'
import { ShowTimelineViewControls } from './ShowTimelineViewControls'
import { useShowTimelineViewport } from './useShowTimelineViewport'

export interface ShowTimelineGestureHandlers {
  /** One adopted gesture becomes one candidate and one history entry. */
  submit: (gesture: ShowTimelineGestureV2) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /** An edit is in flight; the surface refuses to start another gesture. */
  busy: boolean
  /** A Clip one gesture just created; keyboard focus follows it once. */
  focusClipId: string | null
  onFocused: () => void
}

type Drag =
  | {
      mode: 'move'
      itemId: string
      duplicate: boolean
      pointerId: number
      originX: number
      laneWidthPx: number
      destination: { zoneId: string; layerId: string }
      drop: ShowTimelineClipDropV2
    }
  | {
      mode: 'edge'
      itemId: string
      edge: 'leading' | 'trailing'
      pointerId: number
      originX: number
      originTimeMs: number
      laneWidthPx: number
      timeMs: number
      magnetized: boolean
    }

/**
 * The editable v2 timeline. It draws the same version-agnostic view model the
 * read-only surface draws and adds direct manipulation of ordinary Clips:
 * drag to move, Alt-drag to duplicate linked, drag an edge to resize,
 * double-click to split, Delete to remove. Every gesture leaves through
 * `ShowTimelineGestureV2`; this surface decides no edit semantics and holds no
 * record. Group Clip uses stay inert here - their occurrence owns them.
 *
 * Every gesture is resolved in the visible window (#1039): the pointer maps
 * through the drawn window, and the drop resolvers are given that window's real
 * duration and measured pixel width, so magnetism and the drop grid follow the
 * ticks the author can see. The intent a gesture produces stays zoom
 * independent - the same target time yields the same owner intent at any zoom,
 * because zoom changes only how finely a pointer can name a time.
 */
export function ShowTimelineGestureSurface({
  view,
  statusLine,
  gestures,
  transportShowId,
}: {
  view: ShowTimelineViewModel
  statusLine: string
  gestures: ShowTimelineGestureHandlers
  /** The Show whose transport draws the ruler's playhead (#1056 slice 6). */
  transportShowId?: string
}) {
  const totalMs = Math.max(1, view.showEndMs)
  const { viewport, setViewport, visibleWidthPx, measureRef } = useShowTimelineViewport(totalMs, transportShowId)
  const geometry = showTimelineGeometry(viewport)
  const snapEnabled = useShowEditorSessionStore((state) => state.snapEnabled)
  const markersVisible = useShowEditorSessionStore((state) => state.markersVisible)
  const lanes = useShowEditorSessionStore((state) => state.timelineLanes)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)

  /**
   * What a pointer gesture may magnetize to, as the v1 toolbar composes it: the
   * playhead always, the drawn structural boundaries while the Magnet toggle is
   * on, and Marker times while Markers are shown. The drop grid is separate and
   * always applies; Alt is still the per-gesture escape to raw milliseconds.
   */
  const snapTimesMs = useMemo(() => {
    const transport = useShowTransportStore.getState()
    return [
      ...(transportShowId !== undefined && transport.showId === transportShowId ? [transport.positionMs] : []),
      ...(snapEnabled ? view.structuralTimesMs : []),
      ...(markersVisible ? view.markers.map((marker) => marker.timeMs) : []),
    ]
  }, [markersVisible, snapEnabled, transportShowId, view])

  // A live drag reads the newest view, window and handlers without restarting.
  const live = useRef({ view, gestures, viewport, snapTimesMs })
  useLayoutEffect(() => {
    live.current = { view, gestures, viewport, snapTimesMs }
  }, [gestures, snapTimesMs, view, viewport])
  const update = (next: Drag | null) => { dragRef.current = next; setDrag(next) }

  useEffect(() => {
    if (!drag) return
    // The pointer moves through the drawn window, so one pixel is one window
    // millisecond per pixel - not one Show millisecond per pixel.
    const timeAt = (clientX: number, current: Drag) => (
      (clientX - current.originX) / Math.max(1, current.laneWidthPx) * live.current.viewport.durationMs
    )
    const onMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current || event.pointerId !== current.pointerId) return
      const { view: model, viewport: visible, snapTimesMs: snapTimes } = live.current
      if (current.mode === 'edge') {
        const resolved = resolveShowTimelineEdgeDropV2(model, {
          itemId: current.itemId,
          edge: current.edge,
          candidateTimeMs: Math.round(current.originTimeMs + timeAt(event.clientX, current)),
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          visibleDurationMs: visible.durationMs,
          visibleWidthPx: current.laneWidthPx,
          structuralTimesMs: snapTimes,
        })
        update({ ...current, timeMs: resolved.timeMs, magnetized: resolved.magnetized })
        return
      }
      const item = findItem(model, current.itemId)
      if (!item) return
      const destination = laneUnderPointer(event) ?? current.destination
      const drop = resolveShowTimelineClipDropV2(model, {
        itemId: current.itemId,
        candidateStartMs: Math.round(item.startMs + timeAt(event.clientX, current)),
        destination,
        carry: current.duplicate ? 'clip' : 'component',
        altKey: event.altKey && !current.duplicate,
        shiftKey: event.shiftKey,
        visibleDurationMs: visible.durationMs,
        visibleWidthPx: current.laneWidthPx,
        structuralTimesMs: snapTimes,
        previousPlacement: { startMs: current.drop.componentStartMs, magnetized: current.drop.magnetized },
      })
      update({ ...current, destination, drop })
    }
    const onUp = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current || event.pointerId !== current.pointerId) return
      update(null)
      const { view: model, gestures: handlers } = live.current
      const item = findItem(model, current.itemId)
      if (!item) return
      if (current.mode === 'edge') {
        if (current.edge === 'leading' && current.timeMs !== item.startMs) {
          handlers.submit({ kind: 'resize-leading', clipId: item.id, startMs: current.timeMs })
        } else if (current.edge === 'trailing' && current.timeMs !== item.endMs) {
          handlers.submit({ kind: 'resize-trailing', clipId: item.id, endMs: current.timeMs })
        }
        return
      }
      const placed = {
        startMs: current.drop.startMs,
        zoneId: current.destination.zoneId,
        layerId: current.destination.layerId,
      }
      if (current.duplicate) {
        handlers.submit({ kind: 'duplicate', clipId: item.id, ...placed })
        return
      }
      const unmoved = placed.startMs === item.startMs
        && placed.zoneId === item.zoneId && placed.layerId === item.layerId
      if (!unmoved) handlers.submit({ kind: 'move', clipId: item.id, ...placed })
    }
    const onCancel = () => update(null)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') update(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [drag])

  // A split or a duplicate creates a Clip; keyboard flow follows it there once.
  const { focusClipId, onFocused } = gestures
  useEffect(() => {
    if (!focusClipId) return
    document.querySelector<HTMLElement>(
      `[data-show-clip-id="${CSS.escape(focusClipId)}"] [data-show-composition-clip]`,
    )?.focus()
    onFocused()
  }, [focusClipId, onFocused, view])

  const beginDrag = (event: React.PointerEvent<HTMLElement>, item: ShowTimelineItemView, edge?: 'leading' | 'trailing') => {
    if (event.button !== 0) return
    // Starting a drag cancels the press default, which suppresses the mouse
    // focus Chromium and Firefox would otherwise give the pressed control. The
    // shortcuts below act on whatever holds focus, so a press that did not move
    // it would let Delete, S, D and the arrows act on a Clip pressed earlier.
    // Move focus explicitly rather than relying on a default we cancel.
    event.currentTarget.focus()
    if (gestures.busy) return
    const lane = event.currentTarget.closest<HTMLElement>('[data-show-layer-id]')
    const laneWidthPx = lane?.getBoundingClientRect().width ?? 0
    if (laneWidthPx <= 0) return
    event.preventDefault()
    if (edge) {
      update({
        mode: 'edge', itemId: item.id, edge, pointerId: event.pointerId, originX: event.clientX,
        originTimeMs: edge === 'leading' ? item.startMs : item.endMs,
        laneWidthPx, timeMs: edge === 'leading' ? item.startMs : item.endMs, magnetized: false,
      })
      return
    }
    update({
      mode: 'move', itemId: item.id, duplicate: event.altKey, pointerId: event.pointerId,
      originX: event.clientX, laneWidthPx,
      destination: { zoneId: item.zoneId, layerId: item.layerId },
      drop: resolveShowTimelineClipDropV2(view, {
        itemId: item.id, candidateStartMs: item.startMs, altKey: true, shiftKey: false,
        visibleDurationMs: viewport.durationMs, visibleWidthPx: laneWidthPx,
      }),
    })
  }

  const onItemKeyDown = (event: React.KeyboardEvent<HTMLElement>, item: ShowTimelineItemView) => {
    if (gestures.busy || event.metaKey || event.ctrlKey) return
    const stepMs = showTimelineGestureStepMs(event.shiftKey)
    const nudge = (direction: -1 | 1) => resolveShowTimelineClipDropV2(view, {
      itemId: item.id, candidateStartMs: item.startMs + direction * stepMs, altKey: true, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    }).startMs
    const gesture: ShowTimelineGestureV2 | null =
      event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        ? {
            kind: 'move', clipId: item.id, zoneId: item.zoneId, layerId: item.layerId,
            startMs: nudge(event.key === 'ArrowLeft' ? -1 : 1),
          }
        : event.key.toLowerCase() === 's'
          ? { kind: 'split', clipId: item.id, atMs: Math.round((item.startMs + item.endMs) / 2) }
          : event.key.toLowerCase() === 'd'
            ? { kind: 'duplicate', clipId: item.id, startMs: item.endMs, zoneId: item.zoneId, layerId: item.layerId }
            : event.key === 'Delete' || event.key === 'Backspace'
              ? { kind: 'delete', clipId: item.id }
              : null
    if (!gesture) return
    event.preventDefault()
    gestures.submit(gesture)
  }

  const onEdgeKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    item: ShowTimelineItemView,
    edge: 'leading' | 'trailing',
  ) => {
    if (gestures.busy || event.metaKey || event.ctrlKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    const from = edge === 'leading' ? item.startMs : item.endMs
    const { timeMs } = resolveShowTimelineEdgeDropV2(view, {
      itemId: item.id, edge, candidateTimeMs: from + direction * showTimelineGestureStepMs(event.shiftKey),
      altKey: true, shiftKey: false, visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    })
    if (timeMs === from) return
    gestures.submit(edge === 'leading'
      ? { kind: 'resize-leading', clipId: item.id, startMs: timeMs }
      : { kind: 'resize-trailing', clipId: item.id, endMs: timeMs })
  }

  const onSplitPointer = (event: React.MouseEvent<HTMLElement>, item: ShowTimelineItemView) => {
    if (gestures.busy) return
    const lane = event.currentTarget.closest<HTMLElement>('[data-show-layer-id]')
    const rect = lane?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const atMs = Math.round(viewport.startMs + (event.clientX - rect.left) / rect.width * viewport.durationMs)
    gestures.submit({
      kind: 'split',
      clipId: item.id,
      atMs: Math.min(item.endMs - 1, Math.max(item.startMs + 1, atMs)),
    })
  }

  return (
    <section
      ref={measureRef}
      aria-label="Show timeline"
      data-testid="show-timeline-read-only"
      data-show-record-version={view.recordVersion}
      data-show-timeline-editable="true"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#060608] text-zinc-300"
      onKeyDown={(event) => {
        if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || gestures.busy) return
        event.preventDefault()
        if (event.shiftKey) gestures.redo()
        else gestures.undo()
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-live/15 bg-live/[0.035] px-3 py-1.5 text-[10px] text-zinc-500">
        <span role="note" data-testid="show-timeline-read-only-status" className="min-w-0 flex-1 truncate">{statusLine}</span>
        <ShowTimelineViewControls
          {...(transportShowId === undefined ? {} : { showId: transportShowId })}
          viewport={viewport}
          onViewportChange={setViewport}
        />
        <ShowTimelineHistoryControls
          undo={gestures.undo}
          redo={gestures.redo}
          canUndo={gestures.canUndo}
          canRedo={gestures.canRedo}
          busy={gestures.busy}
        />
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
              data-show-lane-zone-id={row.zoneId}
              data-show-layer-rank={layer.rank}
              className="relative mx-2 mb-1 h-8 min-w-0 touch-none overflow-hidden rounded-sm bg-white/[0.025]"
            >
              {layer.items.map((item) => (
                <GestureItem
                  key={item.id}
                  item={item}
                  geometry={geometry}
                  busy={gestures.busy}
                  dragging={drag?.itemId === item.id ? drag : null}
                  onPointerDown={beginDrag}
                  onKeyDown={onItemKeyDown}
                  onEdgeKeyDown={onEdgeKeyDown}
                  onSplitPointer={onSplitPointer}
                />
              ))}
              {lanes.junctions && layer.junctions.map((junction) => (
                <ShowTimelineJunctionMark key={junction.id} junction={junction} geometry={geometry} />
              ))}
              {drag?.mode === 'move' && drag.destination.layerId === layer.id && (
                <DropPreview view={view} drag={drag} geometry={geometry} />
              )}
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

function GestureItem({
  item, geometry, busy, dragging, onPointerDown, onKeyDown, onEdgeKeyDown, onSplitPointer,
}: {
  item: ShowTimelineItemView
  geometry: ShowTimelineGeometry
  busy: boolean
  dragging: Drag | null
  onPointerDown: (event: React.PointerEvent<HTMLElement>, item: ShowTimelineItemView, edge?: 'leading' | 'trailing') => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>, item: ShowTimelineItemView) => void
  onEdgeKeyDown: (event: React.KeyboardEvent<HTMLElement>, item: ShowTimelineItemView, edge: 'leading' | 'trailing') => void
  onSplitPointer: (event: React.MouseEvent<HTMLElement>, item: ShowTimelineItemView) => void
}) {
  const label = `${item.groupOccurrenceId ? 'Group Clip' : 'Clip'} ${item.patternName}, ${
    formatShowTimelineRange(item.startMs, item.endMs)
  }${item.entryPolicy === 'restart' ? ', restarts on entry' : ''}`
  const box = { left: geometry.at(item.startMs), width: geometry.span(item.durationMs) }

  // A Group Clip use belongs to its occurrence, not to this Clip gesture seam.
  if (item.groupOccurrenceId) {
    return (
      <span
        tabIndex={0}
        role="button"
        aria-disabled="true"
        data-show-composition-clip="true"
        data-show-selection-key={showTimelineSelectionKey(item.selection)}
        data-show-group-occurrence={item.groupOccurrenceId}
        aria-label={label}
        className="absolute inset-y-0 flex min-w-px items-center overflow-hidden rounded-[3px] border-l-2 border-zinc-500/60 bg-white/[0.04] px-1 text-[9px] leading-none text-zinc-400 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80"
        style={box}
      >
        <span
          className="truncate"
          style={{ marginLeft: showTimelineLabelInset(geometry, item.startMs, item.durationMs) }}
        >
          {item.patternName}
        </span>
      </span>
    )
  }

  return (
    <span className="absolute inset-y-0 min-w-px" style={box} data-show-clip-id={item.id}>
      <button
        type="button"
        data-show-composition-clip="true"
        data-show-selection-key={showTimelineSelectionKey(item.selection)}
        aria-label={label}
        aria-keyshortcuts="ArrowLeft ArrowRight S D Delete"
        aria-disabled={busy || undefined}
        title="Drag to move · Alt-drag to duplicate · double-click to split · Delete to remove"
        onPointerDown={(event) => onPointerDown(event, item)}
        onDoubleClick={(event) => onSplitPointer(event, item)}
        onKeyDown={(event) => onKeyDown(event, item)}
        className={`absolute inset-0 flex min-w-0 items-center overflow-hidden rounded-[3px] border-l-2 border-live/60 bg-live/10 px-1 text-left text-[9px] leading-none text-zinc-200 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80 ${
          dragging?.mode === 'move' ? 'opacity-40' : ''
        }`}
      >
        <span
          className="truncate"
          style={{ marginLeft: showTimelineLabelInset(geometry, item.startMs, item.durationMs) }}
        >
          {item.patternName}
        </span>
      </button>
      {(['leading', 'trailing'] as const).map((edge) => (
        <button
          key={edge}
          type="button"
          data-show-clip-edge={edge}
          aria-label={`${edge === 'leading' ? 'Start' : 'End'} edge of ${label}`}
          aria-disabled={busy || undefined}
          onPointerDown={(event) => onPointerDown(event, item, edge)}
          onKeyDown={(event) => onEdgeKeyDown(event, item, edge)}
          className={`absolute inset-y-0 z-[3] w-2 cursor-ew-resize rounded-sm bg-live/30 outline-none hover:bg-live/60 focus-visible:ring-1 focus-visible:ring-live/80 ${
            edge === 'leading' ? 'left-0' : 'right-0'
          }`}
        />
      ))}
    </span>
  )
}

function DropPreview({ view, drag, geometry }: {
  view: ShowTimelineViewModel
  drag: Extract<Drag, { mode: 'move' }>
  geometry: ShowTimelineGeometry
}) {
  const item = findItem(view, drag.itemId)
  if (!item) return null
  return (
    <i
      aria-hidden
      data-show-drop-preview={drag.duplicate ? 'duplicate' : 'move'}
      data-show-drop-collides={drag.drop.collidingItemIds.length > 0 ? 'true' : 'false'}
      className={`absolute inset-y-0 z-[4] rounded-[3px] border ${
        drag.drop.collidingItemIds.length > 0 ? 'border-rose-400/80 bg-rose-400/15' : 'border-live/80 bg-live/20'
      }`}
      style={{ left: geometry.at(drag.drop.startMs), width: geometry.span(item.durationMs) }}
    />
  )
}

function findItem(view: ShowTimelineViewModel, itemId: string): ShowTimelineItemView | undefined {
  return view.rows.flatMap((row) => row.layers.flatMap((layer) => layer.items))
    .find((item) => item.id === itemId)
}

/** The Layer lane under the pointer, so a drag can cross rows inside the Zone rail. */
function laneUnderPointer(event: PointerEvent): { zoneId: string; layerId: string } | null {
  // Without hit testing the drag stays in the lane it started from.
  const element = typeof document.elementFromPoint === 'function'
    ? document.elementFromPoint(event.clientX, event.clientY)
    : null
  const lane = element instanceof Element ? element.closest<HTMLElement>('[data-show-layer-id]') : null
  const layerId = lane?.dataset.showLayerId
  const zoneId = lane?.dataset.showLaneZoneId
  return layerId && zoneId ? { zoneId, layerId } : null
}

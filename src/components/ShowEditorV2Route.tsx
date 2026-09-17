import { useEffect, useMemo, useState } from 'react'
import { SHOW_TIMELINE_MIN_HEIGHT } from '@/engine/showWorkspaceLayout'
import type { ShowTimelineSelection } from '@/engine/showTimelineViewModel'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import { useShowStore } from '@/store/showStore'
import { ShowClipInspectorV2 } from './ShowClipInspectorV2'
import { ShowEditorV2DeliveryPanel } from './ShowEditorV2DeliveryPanel'
import { ShowEditorV2ShowInspector } from './ShowEditorV2ShowInspector'
import { ShowEditorV2TransitionLayoutPanel } from './ShowEditorV2TransitionLayoutPanel'
import { ShowEditorV2Transport } from './ShowEditorV2Transport'
import { ShowStagePreview } from './ShowStagePreview'
import { ShowTimelineGestureSurface } from './ShowTimelineGestureSurface'
import { ShowTimelineReadOnlySurface } from './ShowTimelineReadOnlySurface'
import { ShowV2AnimationLanes } from './ShowV2AnimationLanes'
import { useShowV2TimelineGestures } from './useShowV2TimelineGestures'
import { ShowWorkspace } from './ShowWorkspace'
import { useShowV2EditCapture } from './useShowV2EditCapture'

/**
 * The ordinary Show editor route holding a `ShowRecordV2`.
 *
 * Slice 1 of #1056 rendered that record read-only from the version-agnostic
 * view model. Slice 2 added the timeline's direct manipulation of ordinary
 * Clips - move, resize, split, duplicate, delete, Undo and Redo - through the
 * landed v2 owners and the closed prepared-edit admission, slice 3 mounted the
 * Clip inspector beside the workspace, slice 4 added Transition authoring
 * and the Zone Layout lane's own operations in a panel beneath the timeline,
 * and slice 5 drew the animation lanes under the timeline and mounted the
 * Show inspector - Property tracks, Markers, Show End and Insert Time.
 *
 * Slice 6 completes the route: the transport and its keyboard seek, the Show
 * summary, the artifact inventory, the `.pxlshow` and `.epe` exports and
 * Send to Controller. All of them read the one prepared capture
 * `useShowV2EditCapture` owns, and the timeline owns the route's Undo and
 * Redo. A record whose prepared Stage refuses keeps a read-only timeline and
 * refuses every authoring control, because admission would refuse every edit
 * on it anyway. The v1 route is untouched, and this surface registers no agent
 * binding, so no command sees a v2 record (specification section 10).
 */
export function ShowEditorV2Route({ showId }: { showId: string }) {
  const record = useShowStore((state) => state.showV2Pilots[showId])
  const open = useShowStore((state) => state.openShowV2Pilot)
  const binding = useShowV2EditCapture(showId)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [selection, setSelection] = useState<ShowTimelineSelection | null>(null)

  useEffect(() => {
    if (record) return
    let live = true
    void open(showId).then((result) => {
      if (!live) return
      setRefusal(result.status === 'refused' ? result.issues[0]?.message ?? 'Conversion refused.' : null)
    }).catch((error: unknown) => {
      if (live) setRefusal(error instanceof Error ? error.message : 'Open failed.')
    })
    return () => { live = false }
  }, [open, record, showId])

  const capture = binding.capture
  const prepared = capture?.prepared ?? null
  const { status, handlers } = useShowV2TimelineGestures({ showId, capture })

  const view = useMemo(() => (record ? projectShowTimelineV2(record) : null), [record])
  const [previewAspect, setPreviewAspect] = useState(1)

  if (!record || !view || !capture) {
    return (
      <div role="status" className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
        {refusal ?? 'Opening this Show…'}
      </div>
    )
  }

  // What the timeline column draws at its natural height: the timeline surface
  // and, beneath it, the animation lanes. The authoring panel takes a fraction
  // of the column rather than a fixed strip, so the column is asked for enough
  // height to hold both in what the panel leaves.
  const surfaceHeight = READ_ONLY_LANES_PX + view.rows.reduce((height, row) => (
    height + ZONE_HEADER_PX + row.layers.length * LAYER_LANE_PX
  ), 0)
  const laneHeight = (view.propertyTracks?.length ?? 0) * PROPERTY_LANE_PX
    + view.rows.reduce((height, row) => (
      height
      + row.groups.length * GROUP_LANE_PX
      + row.layers.reduce((keys, layer) => keys + layer.items
        .filter((item) => (item.appearanceKeys?.length ?? 0) > 1).length, 0) * APPEARANCE_LANE_PX
    ), 0)
  const contentHeight = Math.ceil((surfaceHeight + laneHeight) / (1 - AUTHORING_PANEL_MAX_FRACTION))

  return (
    <div data-testid="show-editor-v2-route" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-3 py-1.5">
        <h1 className="min-w-0 truncate text-[11px] font-medium text-zinc-200">{record.name}</h1>
        <span
          data-testid="show-editor-v2-route-version"
          className="shrink-0 rounded-sm border border-zinc-700 px-1 font-mono text-[9px] text-zinc-400"
        >
          v{record.version}
        </span>
        <span className="ml-auto" />
        <ShowEditorV2Transport showId={showId} showEndMs={view.showEndMs} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-hidden">
          <ShowWorkspace
            previewAspect={previewAspect}
            timelineMinimumHeight={Math.max(SHOW_TIMELINE_MIN_HEIGHT, Math.min(contentHeight, 420))}
            timelineContentHeight={contentHeight}
            timelineRequiredHeight={contentHeight}
            timeline={(
              <div
                data-testid="show-editor-v2-timeline-column"
                className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden"
              >
                {/*
                  The surface keeps its own height rather than absorbing whatever
                  the animation lanes and the authoring panel leave: the workspace
                  caps the column at half the editor, and a squeezed surface
                  scrolls its Zone rows out of sight, where a Clip is neither
                  visible nor droppable. The column above scrolls instead.
                */}
                <div className="flex shrink-0 flex-col" style={{ minHeight: surfaceHeight }}>
                  {prepared?.status === 'refused' ? (
                    <ShowTimelineReadOnlySurface
                      view={view}
                      transportShowId={showId}
                      statusLine={`Read only - this v2 Show cannot be prepared: ${prepared.message}`}
                    />
                  ) : (
                    <ShowTimelineGestureSurface
                      view={view}
                      transportShowId={showId}
                      statusLine={status ?? 'Editing this v2 Show. Drag a Clip to move it, drag its edges to resize.'}
                      gestures={handlers}
                    />
                  )}
                </div>
                <ShowV2AnimationLanes view={view} selection={selection} onSelect={setSelection} />
                <ShowEditorV2TransitionLayoutPanel showId={showId} view={view} binding={binding} />
              </div>
            )}
            stage={prepared?.status === 'ready' ? (
              <ShowStagePreview kind="prepared-v2" bundle={prepared.bundle} onPreviewAspectChange={setPreviewAspect} />
            ) : (
              <div role="status" className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
                {prepared?.status === 'empty'
                  ? 'Add content to preview or export this Show.'
                  : prepared?.status === 'refused' ? prepared.message : 'Preparing Stage preview…'}
              </div>
            )}
          />
        </div>
        {/*
          One scroll container for the whole side panel. The panel's own sections
          have natural height, so without a bounded scrolling parent everything
          below the first viewport - the Group sections, the delivery panel and
          the status lines that carry refusals - is unreachable by ordinary
          scrolling.
        */}
        <div
          data-testid="show-editor-v2-side-panel"
          className="min-h-0 shrink-0 basis-[55%] overflow-y-auto overflow-x-hidden border-t border-zinc-800 lg:basis-[24rem] lg:border-l lg:border-t-0"
        >
          <ShowClipInspectorV2
            showId={showId}
            binding={binding}
            selection={selection}
            onSelectionChange={setSelection}
          />
          <ShowEditorV2ShowInspector
            showId={showId}
            binding={binding}
            selection={selection}
            onSelectionChange={setSelection}
          />
          <ShowEditorV2DeliveryPanel showId={showId} binding={binding} />
        </div>
      </div>
    </div>
  )
}

/** Status line, ruler, Layout lane and Marker lane, plus the surface's padding. */
const READ_ONLY_LANES_PX = 30 + 28 + 20 + 20 + 8
const ZONE_HEADER_PX = 27
const LAYER_LANE_PX = 36
/** One Property lane, one held-appearance lane and one Group occurrence band. */
const PROPERTY_LANE_PX = 33
const APPEARANCE_LANE_PX = 25
const GROUP_LANE_PX = 32
/** Matches `max-h-[55%]` on `ShowEditorV2TransitionLayoutPanel`'s own section. */
const AUTHORING_PANEL_MAX_FRACTION = 0.55

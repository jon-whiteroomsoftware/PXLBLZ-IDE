import { useEffect, useMemo, useState } from 'react'
import { SHOW_TIMELINE_MIN_HEIGHT } from '@/engine/showWorkspaceLayout'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import { useShowStore } from '@/store/showStore'
import { ShowClipInspectorV2 } from './ShowClipInspectorV2'
import { ShowEditorV2TransitionLayoutPanel } from './ShowEditorV2TransitionLayoutPanel'
import { ShowStagePreview } from './ShowStagePreview'
import { ShowTimelineGestureSurface } from './ShowTimelineGestureSurface'
import { ShowTimelineReadOnlySurface } from './ShowTimelineReadOnlySurface'
import { useShowV2TimelineGestures } from './useShowV2TimelineGestures'
import { ShowWorkspace } from './ShowWorkspace'
import { useShowV2EditCapture } from './useShowV2EditCapture'

/**
 * The ordinary Show editor route holding a `ShowRecordV2`.
 *
 * Slice 1 of #1056 rendered that record read-only from the version-agnostic
 * view model. Slice 2 adds the timeline's direct manipulation of ordinary
 * Clips - move, resize, split, duplicate, delete, Undo and Redo - through the
 * landed v2 owners and the closed prepared-edit admission, slice 3 mounts the
 * Clip inspector beside the workspace, and slice 4 adds Transition authoring
 * and the Zone Layout lane's own operations in a panel beneath the timeline.
 * All three read the one prepared capture `useShowV2EditCapture` owns. A record
 * whose prepared Stage refuses keeps a read-only timeline and refuses every
 * authoring control, because admission would refuse every edit on it anyway.
 * The v1 route is untouched, and this surface registers no agent binding, so no
 * command sees a v2 record (specification section 10).
 */
export function ShowEditorV2ReadOnly({ showId }: { showId: string }) {
  const record = useShowStore((state) => state.showV2Pilots[showId])
  const open = useShowStore((state) => state.openShowV2Pilot)
  const binding = useShowV2EditCapture(showId)
  const [refusal, setRefusal] = useState<string | null>(null)

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

  // Reserve the height the timeline column actually draws - the read-only
  // surface plus the authoring panel with nothing selected - so the Stage
  // preview never squeezes either out of the workspace.
  const contentHeight = READ_ONLY_LANES_PX + AUTHORING_PANEL_PX + view.rows.reduce((height, row) => (
    height + ZONE_HEADER_PX + row.layers.length * LAYER_LANE_PX
  ), 0)

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ShowWorkspace
          previewAspect={previewAspect}
          timelineMinimumHeight={Math.max(SHOW_TIMELINE_MIN_HEIGHT, Math.min(contentHeight, 420))}
          timelineContentHeight={contentHeight}
          timelineRequiredHeight={contentHeight}
          timeline={(
            <div className="flex h-full min-h-0 flex-col">
              {prepared?.status === 'refused' ? (
                <ShowTimelineReadOnlySurface
                  view={view}
                  statusLine={`Read only - this v2 Show cannot be prepared: ${prepared.message}`}
                />
              ) : (
                <ShowTimelineGestureSurface
                  view={view}
                  statusLine={status ?? 'Editing this v2 Show. Drag a Clip to move it, drag its edges to resize.'}
                  gestures={handlers}
                />
              )}
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
      <div className="min-h-0 shrink-0 basis-[55%] overflow-hidden border-t border-zinc-800 lg:basis-[24rem] lg:border-l lg:border-t-0">
        <ShowClipInspectorV2 showId={showId} binding={binding} />
      </div>
    </div>
  )
}

/** Status line, ruler, Layout lane and Marker lane, plus the surface's padding. */
const READ_ONLY_LANES_PX = 30 + 28 + 20 + 20 + 8
const ZONE_HEADER_PX = 27
const LAYER_LANE_PX = 36
/** The authoring panel's heading row, status line, boundary chips and Layout lane. */
const AUTHORING_PANEL_PX = 150

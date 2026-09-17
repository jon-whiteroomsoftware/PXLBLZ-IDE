import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Code2 } from 'lucide-react'
import { SHOW_TIMELINE_MIN_HEIGHT } from '@/engine/showWorkspaceLayout'
import type { ShowTimelineSelection } from '@/engine/showTimelineViewModel'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import { createAgentBrowserSession } from '@/agent/browserSession'
import { useAgentEditorLifecycle } from '@/agent/editorLifecycle'
import { useShowStore } from '@/store/showStore'
import { useShowTransportStore } from '@/store/showTransportStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
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
import { PixelblazeCodeEditor } from './PixelblazeCodeEditor'
import { Button } from './ui/button'
import { useShowV2EditCapture } from './useShowV2EditCapture'
import { ShowEditorV2ShowActions } from './ShowEditorV2ShowActions'
import { useShowV2RouteArtifacts } from './useShowV2RouteArtifacts'

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
 * Redo - on both surfaces, because history belongs to the record. A record
 * whose prepared Stage refuses keeps a read-only timeline and refuses every
 * authoring control, because admission would refuse every edit that reads the
 * prepared Stage; the inspectors that do not still edit it, and those edits
 * stay undoable. The v1 route is untouched.
 *
 * #1039 registers this route's agent binding, in the release that made the
 * executor, the editor admission and both command catalogues follow the routed
 * record's version. Before that the binding could not exist: a command reaching
 * a v2 record while the executor assumed v1 is the window specification
 * section 10 forbids.
 */
export function ShowEditorV2Route({ showId }: { showId: string }) {
  const record = useShowStore((state) => state.showV2Pilots[showId])
  const open = useShowStore((state) => state.openShowV2Pilot)
  const binding = useShowV2EditCapture(showId)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [selection, setSelection] = useState<ShowTimelineSelection | null>(null)
  const [viewingCode, setViewingCode] = useState(false)

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

  // The agent binding for this v2 record. It reads the same prepared capture
  // the route's own typed intents adopt through, so a command sequence and a
  // manual edit are admitted against one Stage preparation, and it is declared
  // as version 2 so the executor, the admission and both command catalogues
  // follow the record this editor actually holds (specification section 10).
  const live = useRef(binding)
  const selectionRef = useRef(selection)
  // Layout, not paint: a delivery arriving from the relay must never read a
  // capture the route has already replaced.
  useLayoutEffect(() => { live.current = binding; selectionRef.current = selection })
  const agentCapabilities = useWorkspaceStore((state) => state.agentCapabilities)
  const getAgentEditorContext = useCallback(() => ({
    selection: selectionRef.current,
    playheadMs: useShowTransportStore.getState().showId === showId ? useShowTransportStore.getState().positionMs : 0,
  }), [showId])
  const agentRecord = useMemo(() => ({
    recordVersion: 2 as const,
    capture: () => live.current.capture,
    isCurrentCapture: () => live.current.isCurrentCapture(),
  }), [])
  useAgentEditorLifecycle({
    showId,
    readOnly: false,
    enabled: Boolean(agentCapabilities?.external || agentCapabilities?.builtin),
    allowance: agentCapabilities?.allowance,
    getContext: getAgentEditorContext,
    record: agentRecord,
    createChannel: createAgentBrowserSession,
  })

  const view = useMemo(() => (record ? projectShowTimelineV2(record) : null), [record])
  const [previewAspect, setPreviewAspect] = useState(1)
  // One artifact build for this capture, read by the header's Show actions and
  // by the delivery panel, so View code, Download .epe, the inventory and a
  // Controller send all describe the same compiled Show (#1039).
  const delivery = useShowV2RouteArtifacts(capture)

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
        {/*
          The Show actions sit after the transport, as the v1 header's actions
          menu does, so the transport still leads this route's tab order.
        */}
        <ShowEditorV2Transport showId={showId} showEndMs={view.showEndMs} />
        <ShowEditorV2ShowActions delivery={delivery} onViewCode={() => setViewingCode(true)} />
      </div>
      {viewingCode && delivery.artifacts && (
        <div data-testid="show-editor-v2-generated" className="flex min-h-0 flex-1 flex-col bg-zinc-950">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 font-mono text-xs text-zinc-400">
            <Code2 size={14} aria-hidden />
            <span className="flex-1 truncate text-zinc-200">Generated pattern - {record.name}</span>
            <Button size="xs" variant="outline" onClick={() => setViewingCode(false)}>Back to show</Button>
          </div>
          <div className="min-h-0 flex-1">
            <PixelblazeCodeEditor value={delivery.artifacts.epe.source} readOnly />
          </div>
        </div>
      )}
      {!viewingCode && (
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
                      history={{
                        undo: handlers.undo,
                        redo: handlers.redo,
                        canUndo: handlers.canUndo,
                        canRedo: handlers.canRedo,
                        busy: handlers.busy,
                      }}
                      statusLine={status ?? `Read only - this v2 Show cannot be prepared: ${prepared.message}`}
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
          <ShowEditorV2DeliveryPanel showId={showId} binding={binding} delivery={delivery} />
        </div>
      </div>
      )}
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

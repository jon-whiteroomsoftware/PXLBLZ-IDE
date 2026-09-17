import { useLayoutEffect, useRef, useState } from 'react'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import {
  planShowTimelineGestureV2,
  type ShowTimelineGestureV2,
} from '@/engine/showTimelineGesturesV2'
import type { ShowPreparedStageEditCaptureV2 } from '@/engine/showPreparedStageV2'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useMapStore } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import {
  admitShowV2PilotClipDelete,
  admitShowV2PilotClipSharingEdit,
  admitShowV2PilotClipTemporal,
  type ShowV2PilotAdoptionReceipt,
} from '@/store/showV2PreparedEditAdmission'

export interface ShowV2TimelineGestureCapture extends ShowPreparedStageEditCaptureV2 {
  /** The provider the capture was taken against; a swap invalidates the edit. */
  provider: ReturnType<typeof getPersonalContentProvider>
}

const LABELS: Record<ShowTimelineGestureV2['kind'], string> = {
  move: 'Clip',
  'resize-trailing': 'Clip',
  'resize-leading': 'Clip',
  split: 'Clip',
  duplicate: 'Clip sharing',
  delete: 'Clip',
}

/**
 * Bind the timeline's gesture vocabulary to the landed v2 owners through the
 * closed prepared-edit admission: one adopted gesture, one candidate, one
 * history entry, one save. Nothing here decides an edit or writes a record.
 */
export function useShowV2TimelineGestures({ showId, capture }: {
  showId: string
  capture: ShowV2TimelineGestureCapture | null
}) {
  const history = useShowStore((state) => state.showV2Histories[showId])
  const undoPilot = useShowStore((state) => state.undoShowV2Pilot)
  const redoPilot = useShowStore((state) => state.redoShowV2Pilot)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [focusClipId, setFocusClipId] = useState<string | null>(null)
  const pending = useRef(false)
  const live = useRef(true)
  const activeCapture = useRef(capture)
  useLayoutEffect(() => {
    live.current = true
    activeCapture.current = capture
    return () => { live.current = false; activeCapture.current = null }
  }, [capture, showId])

  const isCurrentCapture = () => Boolean(capture && activeCapture.current === capture
    && getPersonalContentProvider() === capture.provider
    && useShowStore.getState().showV2Pilots[showId] === capture.record
    && usePatternStore.getState().userPatterns === capture.dependencies.patterns
    && useMapStore.getState().userMaps === capture.dependencies.maps
    && useLibraryStore.getState().userLibraries === capture.dependencies.libraries
    && useControllerProfileStore.getState().profiles === capture.dependencies.profiles)

  const isCurrentCompletion = (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => {
    const active = activeCapture.current
    if (!capture || !active || active.record.id !== showId || receipt.showId !== showId
      || active.dependencies.stageMap !== capture.dependencies.stageMap
      || usePatternStore.getState().userPatterns !== capture.dependencies.patterns
      || useMapStore.getState().userMaps !== capture.dependencies.maps
      || useLibraryStore.getState().userLibraries !== capture.dependencies.libraries
      || useControllerProfileStore.getState().profiles !== capture.dependencies.profiles
      || getPersonalContentProvider() !== receipt.provider) return false
    const state = useShowStore.getState()
    return phase === 'saved'
      ? state.showV2Pilots[showId] === receipt.record && (state.showRevisions[showId] ?? 0) === receipt.revision
      : state.showV2SaveFailure?.showId === showId && state.showV2SaveFailure.record === receipt.record
  }

  const submit = async (gesture: ShowTimelineGestureV2) => {
    if (pending.current || !capture || !isCurrentCapture()) return
    // Identity is allocated once, at submission, by the pure adapter.
    const planned = planShowTimelineGestureV2(capture, gesture, () => newPersonalContentId())
    const label = LABELS[gesture.kind]
    if (planned.status !== 'ready') {
      if (live.current && isCurrentCapture()) {
        setStatus(planned.status === 'refused' ? planned.message : `${label} is unchanged.`)
      }
      return
    }
    pending.current = true
    setBusy(true)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    const context = {
      showId,
      baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
      capture,
      isCurrent: () => live.current && isCurrentCapture(),
      onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => { adoption.current = receipt },
    }
    try {
      const { submission } = planned
      const outcome = submission.owner === 'clip-temporal'
        ? await admitShowV2PilotClipTemporal({ ...context, intent: submission.intent })
        : submission.owner === 'clip-sharing'
          ? await admitShowV2PilotClipSharingEdit({ ...context, intent: submission.intent })
          : await admitShowV2PilotClipDelete({ ...context, intent: submission.intent })
      const current = outcome.status === 'applied'
        ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return
      setStatus(outcome.status === 'refused'
        ? outcome.message
        : outcome.status === 'unchanged'
          ? `${label} is unchanged.`
          : gesture.kind === 'delete' ? 'Clip deleted.' : `${label} saved.`)
      if (outcome.status === 'applied' && planned.selectAfterId) setFocusClipId(planned.selectAfterId)
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) {
        setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
      }
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }

  const runHistory = async (direction: 'undo' | 'redo') => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const changed = direction === 'undo' ? await undoPilot(showId) : await redoPilot(showId)
      if (live.current) setStatus(changed ? `${direction === 'undo' ? 'Undo' : 'Redo'} saved.` : `Nothing to ${direction}.`)
    } catch (error) {
      if (live.current) setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }

  return {
    status,
    handlers: {
      submit: (gesture: ShowTimelineGestureV2) => { void submit(gesture) },
      undo: () => { void runHistory('undo') },
      redo: () => { void runHistory('redo') },
      canUndo: (history?.past.length ?? 0) > 0,
      canRedo: (history?.future.length ?? 0) > 0,
      busy,
      focusClipId,
      onFocused: () => setFocusClipId(null),
    },
  }
}

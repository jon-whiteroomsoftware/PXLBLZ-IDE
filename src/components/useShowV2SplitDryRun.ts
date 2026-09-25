import { useEffect, useRef, useState } from 'react'
import type { ShowEditorTimelineCommandCapabilityV2 } from '@/engine/showEditorTimelinePresentation'
import type { ShowTimelineViewModel } from '@/engine/showTimelineViewModel'
import { planShowV2ClipSplit } from '@/engine/showV2ClipTemporalPlanning'
import { showV2EditRefusalCopy, showV2PlannerRefusalInput } from '@/engine/showV2EditRefusalCopy'
import { checkShowV2ClipTemporal, type ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'

/** Playhead-only changes recompute at most this often, always on the trailing edge. */
export const SHOW_V2_SPLIT_DRY_RUN_THROTTLE_MS = 100

interface DryRunInput {
  capture: ShowV2PilotPreparedCapture
  view: ShowTimelineViewModel
  clipId: string
  atMs: number
}

/**
 * Ask the planner and the prepared-edit check the question a Split click
 * would ask, with a fixed provisional right identity (#1126). A refusal
 * disables the control and names its reason (spec §10 UI honesty).
 */
function dryRunSplit(input: DryRunInput): ShowEditorTimelineCommandCapabilityV2 | null {
  const plan = planShowV2ClipSplit(input.view, { clipId: input.clipId, atMs: input.atMs, rightClipId: 'split-dry-run' })
  if (plan.kind === 'refuse') {
    const refusal = showV2PlannerRefusalInput('split', plan.reason)
    return refusal ? { enabled: false, reason: showV2EditRefusalCopy(refusal).status } : null
  }
  if (plan.kind !== 'temporal') return null
  const checked = checkShowV2ClipTemporal(input.capture, plan.intent)
  return checked.status === 'refused' ? { enabled: false, reason: checked.message } : null
}

/**
 * The effective Split capability: the geometry capability, narrowed by a
 * dry-run of the owner and prepared-edit checks. One dry-run prepares the whole
 * Show (about 8 ms on the largest stock Show), so a changed record or target
 * recomputes at once while playhead-only changes are throttled; between
 * recomputes the control shows the last answer, and the click path's own
 * admission still refuses anything that went stale in that window.
 */
export function useShowV2SplitDryRun(input: {
  geometry: ShowEditorTimelineCommandCapabilityV2
  view: ShowTimelineViewModel
  targetClipId: string | null
  positionMs: number
  capture: ShowV2PilotPreparedCapture | null
}): ShowEditorTimelineCommandCapabilityV2 {
  const { geometry, view, targetClipId, capture } = input
  const atMs = Math.round(input.positionMs)
  const active = geometry.enabled && !!targetClipId && !!capture
  const [refusal, setRefusal] = useState<ShowEditorTimelineCommandCapabilityV2 | null>(null)
  const throttle = useRef<{
    record: ShowV2PilotPreparedCapture['record'] | null
    clipId: string | null
    atMs: number | null
    lastRunAt: number
    pending: DryRunInput | null
    timer: ReturnType<typeof setTimeout> | null
  }>({ record: null, clipId: null, atMs: null, lastRunAt: 0, pending: null, timer: null })

  useEffect(() => {
    const state = throttle.current
    const run = (next: DryRunInput) => {
      state.record = next.capture.record
      state.clipId = next.clipId
      state.atMs = next.atMs
      state.lastRunAt = Date.now()
      setRefusal(dryRunSplit(next))
    }
    const cancel = () => {
      if (state.timer) clearTimeout(state.timer)
      state.timer = null
      state.pending = null
    }
    // An inactive control shows the geometry answer; forgetting the key makes
    // the next activation recompute at once.
    if (!active || !capture || !targetClipId) {
      cancel()
      state.record = null
      state.clipId = null
      state.atMs = null
      return
    }
    const next = { capture, view, clipId: targetClipId, atMs }
    if (state.record !== capture.record || state.clipId !== targetClipId) {
      cancel()
      run(next)
      return
    }
    if (state.timer) {
      state.pending = next
      return
    }
    if (state.atMs === atMs) return
    const waited = Date.now() - state.lastRunAt
    if (waited >= SHOW_V2_SPLIT_DRY_RUN_THROTTLE_MS) {
      run(next)
      return
    }
    state.pending = next
    state.timer = setTimeout(() => {
      state.timer = null
      const trailing = state.pending
      state.pending = null
      if (trailing) run(trailing)
    }, SHOW_V2_SPLIT_DRY_RUN_THROTTLE_MS - waited)
  }, [active, atMs, capture, targetClipId, view])

  useEffect(() => () => {
    const state = throttle.current
    if (state.timer) clearTimeout(state.timer)
  }, [])

  return active && refusal ? refusal : geometry
}

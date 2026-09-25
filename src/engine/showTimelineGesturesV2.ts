import type { ShowClipEditIntentV2, ShowClipEditRefusalV2 } from './showClipsV2'
import { editShowClipV2 } from './showClipsV2'
import type { ShowCompositionV2ValidationCode } from './showCompositionV2'
import type { ShowClipTemporalIntentV2 } from './showClipTemporalV2'
import type { ShowTimelineItemView, ShowTimelineViewModel } from './showTimelineViewModel'
import {
  resolveShowTimelineClipDragPlacement,
  showTimelineQuantizeStepMs,
  snapShowTimelineTime,
  type ShowTimelineClipDragPlacement,
} from './showTimelineViewport'
import { transitionEndpoints, type ShowTransitionEditIntentV2 } from './showTransitionsV2'
import {
  checkShowV2LinkedDuplicateDraft,
  createShowV2LinkedDuplicateIntent,
  type ShowV2ClipSharingCapture,
  type ShowV2DuplicateRefusalCode,
} from './showV2ClipSharingEditorModel'
import { allocateShowClipTimingIdsV2 } from './showV2TimelineEditorModel'
import {
  planShowV2ClipDeleteRampProjections,
  planShowV2TransitionRampProjections,
} from './showV2TransitionEditorModel'

/**
 * The timeline's direct-manipulation vocabulary, stated in view-model terms.
 *
 * Every gesture names one Clip and the times or destination the pointer or the
 * keyboard produced. Nothing here decides an edit: the landed v2 owners do,
 * and this module only chooses which owner and intent one gesture means.
 */
export type ShowTimelineGestureV2 =
  | { kind: 'move'; clipId: string; startMs: number; zoneId: string; layerId: string }
  | { kind: 'resize-trailing'; clipId: string; endMs: number }
  | { kind: 'resize-leading'; clipId: string; startMs: number }
  | { kind: 'split'; clipId: string; atMs: number }
  | { kind: 'duplicate'; clipId: string; startMs: number; zoneId: string; layerId: string }
  | { kind: 'delete'; clipId: string }

/** One gesture becomes exactly one owner intent behind the closed admission. */
export type ShowTimelineGestureSubmissionV2 =
  | { owner: 'clip-temporal'; intent: ShowClipTemporalIntentV2 }
  | { owner: 'clip-sharing'; intent: Extract<ShowClipEditIntentV2, { kind: 'duplicate' }> }
  | { owner: 'clip-delete'; intent: Extract<ShowTransitionEditIntentV2, { kind: 'delete-clip' }> }

export type ShowTimelineGesturePlanV2 =
  | { status: 'ready'; submission: ShowTimelineGestureSubmissionV2; selectAfterId?: string }
  | { status: 'unchanged' }
  /** `code` names a duplicate draft refusal (#1098). */
  | { status: 'refused'; message: string; code?: ShowV2DuplicateRefusalCode }

/**
 * Plan one gesture against the captured record.
 *
 * Identity is never allocated inside an owner and never allocated for a gesture
 * that cannot change the record: the adapter validates the request first, then
 * calls the caller's allocator exactly as many times as the intent needs.
 */
export function planShowTimelineGestureV2(
  capture: ShowV2ClipSharingCapture,
  gesture: ShowTimelineGestureV2,
  allocate: () => string,
): ShowTimelineGesturePlanV2 {
  const record = capture.record
  const refuse = (message: string): ShowTimelineGesturePlanV2 => ({ status: 'refused', message })
  const ready = (
    submission: ShowTimelineGestureSubmissionV2,
    selectAfterId?: string,
  ): ShowTimelineGesturePlanV2 => ({ status: 'ready', submission, ...(selectAfterId ? { selectAfterId } : {}) })
  const clip = record.composition.clips.find(candidate => candidate.id === gesture.clipId)
  if (!clip) {
    return refuse('Choose one ordinary Clip. A Group Clip use is edited through its Group occurrence.')
  }
  const endMs = clip.startMs + clip.durationMs

  if (gesture.kind === 'move') {
    if (gesture.zoneId !== clip.zoneId || gesture.layerId !== clip.layerId) {
      // A human drag grants the detach permission the agent command withholds:
      // joined participant Transitions detach in the same commit, while
      // non-Clip-value carriers and blocked repairs still refuse at the owner.
      return ready({
        owner: 'clip-temporal',
        intent: {
          kind: 'replace-placement',
          clipId: clip.id,
          zoneId: gesture.zoneId,
          layerId: gesture.layerId,
          startMs: gesture.startMs,
          detachParticipantTransitions: true,
        },
      })
    }
    if (gesture.startMs === clip.startMs) return { status: 'unchanged' }
    // A Clip joined by Transitions translates with its whole connected
    // component; the temporal owner owns that traversal, not this adapter.
    return ready({ owner: 'clip-temporal', intent: { kind: 'move', clipId: clip.id, startMs: gesture.startMs } })
  }

  if (gesture.kind === 'resize-trailing' || gesture.kind === 'resize-leading') {
    const trailing = gesture.kind === 'resize-trailing'
    const nextStartMs = trailing ? clip.startMs : gesture.startMs
    const nextEndMs = trailing ? gesture.endMs : endMs
    if (nextStartMs === clip.startMs && nextEndMs === endMs) return { status: 'unchanged' }
    const kind = trailing
      ? (nextEndMs > endMs ? 'extend' : 'trim')
      : (nextStartMs < clip.startMs ? 'extend' : 'trim')
    const intent: ShowClipTemporalIntentV2 = { kind, clipId: clip.id, startMs: nextStartMs, endMs: nextEndMs }
    // A leading edge dragged onto or past the window start closes the incoming
    // window; the owner drops Clip value ramps and projects other carriers.
    const carrier = trailing ? undefined : closingRampCarrier(record, clip.id, nextStartMs - clip.startMs)
    if (!carrier) return ready({ owner: 'clip-temporal', intent })
    const projected = planShowV2TransitionRampProjections(record, carrier, allocate)
    if (projected.status === 'refused') return refuse(projected.message)
    return ready({
      owner: 'clip-temporal',
      intent: { ...intent, ...(projected.projections.length > 0 ? { propertyRampProjections: projected.projections } : {}) },
    })
  }

  if (gesture.kind === 'split') {
    if (!Number.isSafeInteger(gesture.atMs) || gesture.atMs <= clip.startMs || gesture.atMs >= endMs) {
      return refuse('Split needs a whole-millisecond time inside the Clip.')
    }
    const identities = allocateShowClipTimingIdsV2(record, 'split', false, allocate)
    if (identities.status === 'refused') return refuse(identities.message)
    return ready({
      owner: 'clip-temporal',
      intent: { kind: 'split', clipId: clip.id, atMs: gesture.atMs, rightClipId: identities.clipId },
    }, identities.clipId)
  }

  if (gesture.kind === 'duplicate') {
    // Duplication is linked by default: the copy consumes the same effective
    // Pattern instance, and no gesture mints a runtime.
    const duplicate = createShowV2LinkedDuplicateIntent(capture, clip.id, {
      zoneId: gesture.zoneId, layerId: gesture.layerId, startMs: String(gesture.startMs),
    }, allocate)
    if (duplicate.status === 'unchanged') return { status: 'unchanged' }
    if (duplicate.status === 'refused') return { status: 'refused', message: duplicate.message, ...(duplicate.code ? { code: duplicate.code } : {}) }
    if (duplicate.intent.kind !== 'duplicate') return refuse('Duplication produced an unexpected sharing intent.')
    return ready({ owner: 'clip-sharing', intent: duplicate.intent }, duplicate.intent.identities.clipId)
  }

  const plans = planShowV2ClipDeleteRampProjections(record, clip.id, allocate)
  if (plans.status === 'refused') return refuse(plans.message)
  return ready({
    owner: 'clip-delete',
    intent: {
      kind: 'delete-clip',
      clipId: clip.id,
      ...(plans.plans.length > 0 ? { propertyRampProjections: plans.plans } : {}),
    },
  })
}

/**
 * Check one duplicate gesture without allocating a stored identity. The preview
 * plans provisional identities, then asks the same owner the drop will ask
 * whether this edit is valid (specification section 10, #1111-B3).
 */
export function checkShowTimelineDuplicateGestureV2(
  capture: ShowV2ClipSharingCapture,
  gesture: Extract<ShowTimelineGestureV2, { kind: 'duplicate' }>,
): { status: 'ready' } | { status: 'refused'; message: string; code: ShowV2DuplicateRefusalCode; ownerRefusal?: { code: ShowClipEditRefusalV2; issueCode?: ShowCompositionV2ValidationCode } } {
  const clip = capture.record.composition.clips.find(candidate => candidate.id === gesture.clipId)
  if (!clip) {
    return { status: 'refused', message: 'Choose one ordinary Clip. A Group Clip use is edited through its Group occurrence.', code: 'missing-clip' }
  }
  const draft = checkShowV2LinkedDuplicateDraft(capture, gesture.clipId, {
    zoneId: gesture.zoneId, layerId: gesture.layerId, startMs: String(gesture.startMs),
  })
  if (draft.status === 'refused') return draft
  let provisional = 0
  const planned = planShowTimelineGestureV2(capture, gesture, () => `__preview_duplicate_${++provisional}`)
  if (planned.status !== 'ready') {
    return { status: 'refused', message: planned.status === 'refused' ? planned.message : 'Duplication made no change.', code: 'owner-refused' }
  }
  if (planned.submission.owner !== 'clip-sharing') {
    return { status: 'refused', message: 'Duplication produced an unexpected sharing intent.', code: 'owner-refused' }
  }
  const result = editShowClipV2(capture.record, planned.submission.intent)
  return result.status === 'refused'
    ? { status: 'refused', message: result.message, code: 'owner-refused', ownerRefusal: { code: result.code, ...(result.issueCode ? { issueCode: result.issueCode } : {}) } }
    : { status: 'ready' }
}

/**
 * The sole incoming carrier a leading resize of `deltaMs` would remove, if
 * any: the drag reaches or passes the window start, closing it.
 */
function closingRampCarrier(
  record: ShowV2ClipSharingCapture['record'],
  clipId: string,
  deltaMs: number,
): ShowV2ClipSharingCapture['record']['composition']['transitions'][number] | undefined {
  const incoming = record.composition.transitions
    .filter(transition => transitionEndpoints(transition).to.includes(clipId))
  if (incoming.length !== 1 || incoming[0].propertyRamps.length === 0) return undefined
  return incoming[0].durationMs + deltaMs <= 0 ? incoming[0] : undefined
}

/**
 * Every item one rigid move carries. Transitions in the view already name their
 * participants and whole-output contributor sets, so the drawn surface derives
 * the same connected component the temporal owner translates.
 */
export function showTimelineConnectedItemIdsV2(view: ShowTimelineViewModel, itemId: string): string[] {
  const connected = new Set([itemId])
  let changed = true
  while (changed) {
    changed = false
    for (const transition of view.transitions) {
      const endpoints = transition.scope.kind === 'whole-output'
        ? [...transition.scope.fromItemIds, ...transition.scope.toItemIds]
        : transition.scope.participants.flatMap(participant => [participant.fromItemId, participant.toItemId])
      if (!endpoints.some(id => connected.has(id))) continue
      for (const id of endpoints) {
        if (connected.has(id)) continue
        connected.add(id)
        changed = true
      }
    }
  }
  return [...connected].sort()
}

export interface ShowTimelineClipDropV2 {
  /** Where the dragged Clip itself would land. */
  startMs: number
  /** Where the moved component's earliest contribution would land. */
  componentStartMs: number
  magnetized: boolean
  movedItemIds: string[]
  collidingItemIds: string[]
}

export interface ShowTimelineClipDropInputV2 {
  itemId: string
  candidateStartMs: number
  /** A destination Zone/Layer only when the pointer left the item's own lane. */
  destination?: { zoneId: string; layerId: string }
  /**
   * `clip` carries the dragged Clip alone - a duplicate copies one Clip, and a
   * re-placement never drags a Transition endpoint's counterpart with it.
   * The default `component` is the rigid connected move of specification 5.
   */
  carry?: 'component' | 'clip'
  altKey: boolean
  shiftKey: boolean
  visibleDurationMs: number
  visibleWidthPx: number
  /**
   * Which times this gesture may magnetize to. The surface owns the choice,
   * because the snap toggle, Marker visibility and the playhead are view state
   * the view model does not carry; omitting it keeps every boundary the view
   * draws. An empty list is the Magnet toggle off: nothing attracts, and the
   * always-on drop grid still applies.
   */
  structuralTimesMs?: number[]
  previousPlacement?: ShowTimelineClipDragPlacement
}

/**
 * Resolve one live drag sample into the drop the surface should draw. Snapping
 * reuses the landed viewport helpers and the view's own structural times; the
 * moved set is the connected component, so the chain clamps and collides as
 * one body rather than as the Clip under the pointer.
 */
export function resolveShowTimelineClipDropV2(
  view: ShowTimelineViewModel,
  input: ShowTimelineClipDropInputV2,
): ShowTimelineClipDropV2 {
  const items = allItems(view)
  const item = items.find(candidate => candidate.id === input.itemId)
  if (!item) {
    return {
      startMs: input.candidateStartMs, componentStartMs: input.candidateStartMs,
      magnetized: false, movedItemIds: [], collidingItemIds: [],
    }
  }
  const reroutes = Boolean(input.destination
    && (input.destination.zoneId !== item.zoneId || input.destination.layerId !== item.layerId))
  // Re-placement moves the selected Clip alone: this door grants the detach
  // permission, so an endpoint tears off its Transitions rather than dragging
  // the chain across Layers with it.
  const movedItemIds = reroutes || input.carry === 'clip'
    ? [item.id]
    : showTimelineConnectedItemIdsV2(view, item.id)
  const moved = items.filter(candidate => movedItemIds.includes(candidate.id))
  const componentStartMs = Math.min(...moved.map(candidate => candidate.startMs))
  const componentEndMs = Math.max(...moved.map(candidate => candidate.endMs))
  const placement = resolveShowTimelineClipDragPlacement(
    componentStartMs + (input.candidateStartMs - item.startMs),
    {
      durationMs: componentEndMs - componentStartMs,
      totalMs: view.showEndMs,
      visibleDurationMs: input.visibleDurationMs,
      visibleWidthPx: input.visibleWidthPx,
      structuralTimesMs: wholeMilliseconds(input.structuralTimesMs ?? view.structuralTimesMs),
      excludedStructuralTimesMs: moved.flatMap(candidate => [candidate.startMs, candidate.endMs]),
      altKey: input.altKey,
      shiftKey: input.shiftKey,
      ...(input.previousPlacement ? { previousPlacement: input.previousPlacement } : {}),
    },
  )
  const deltaMs = placement.startMs - componentStartMs
  const collidingItemIds = new Set<string>()
  for (const candidate of moved) {
    const lane = reroutes ? input.destination! : { zoneId: candidate.zoneId, layerId: candidate.layerId }
    const startMs = candidate.startMs + deltaMs
    const endMs = candidate.endMs + deltaMs
    for (const other of items) {
      if (movedItemIds.includes(other.id)) continue
      if (other.zoneId !== lane.zoneId || other.layerId !== lane.layerId) continue
      if (startMs < other.endMs && other.startMs < endMs) collidingItemIds.add(other.id)
    }
  }
  return {
    startMs: item.startMs + deltaMs,
    componentStartMs: placement.startMs,
    magnetized: placement.magnetized,
    movedItemIds,
    collidingItemIds: [...collidingItemIds].sort(),
  }
}

export interface ShowTimelineEdgeDropInputV2 {
  itemId: string
  edge: 'leading' | 'trailing'
  candidateTimeMs: number
  altKey: boolean
  shiftKey: boolean
  visibleDurationMs: number
  visibleWidthPx: number
  /** The times this gesture may magnetize to; see the Clip drop input. */
  structuralTimesMs?: number[]
}

/**
 * Snap candidates as whole milliseconds. Authored times are integers, but the
 * surface also offers the transport's playhead, which is fractional while the
 * preview runs; a drop magnetized to it would otherwise carry a fractional time
 * into an owner that refuses anything but safe integer milliseconds (#1039).
 */
function wholeMilliseconds(timesMs: readonly number[]): number[] {
  return timesMs.filter(Number.isFinite).map(timeMs => Math.round(timeMs))
}

/**
 * Resolve one edge drag. The opposite edge is fixed, so the resolved time stays
 * inside the Clip by at least one millisecond and inside Show End.
 */
export function resolveShowTimelineEdgeDropV2(
  view: ShowTimelineViewModel,
  input: ShowTimelineEdgeDropInputV2,
): { timeMs: number; magnetized: boolean } {
  const item = allItems(view).find(candidate => candidate.id === input.itemId)
  if (!item) return { timeMs: input.candidateTimeMs, magnetized: false }
  const minTimeMs = input.edge === 'leading' ? 0 : item.startMs + 1
  const maxTimeMs = input.edge === 'leading' ? item.endMs - 1 : view.showEndMs
  const ownEdges = [item.startMs, item.endMs]
  const snapped = snapShowTimelineTime(input.candidateTimeMs, {
    visibleDurationMs: input.visibleDurationMs,
    visibleWidthPx: input.visibleWidthPx,
    structuralTimesMs: input.altKey
      ? []
      : wholeMilliseconds(input.structuralTimesMs ?? view.structuralTimesMs).filter(timeMs => !ownEdges.includes(timeMs)),
    gridEnabled: !input.altKey,
    ...(input.altKey
      ? {}
      : { quantizeStepMs: showTimelineQuantizeStepMs(input.shiftKey, input.visibleDurationMs, input.visibleWidthPx) }),
    minTimeMs,
    maxTimeMs,
  })
  return { timeMs: snapped.timeMs, magnetized: snapped.kind === 'boundary' }
}

/** One keyboard nudge: the timeline's own drop grid, refined while Shift is held. */
export function showTimelineGestureStepMs(fine: boolean): number {
  return showTimelineQuantizeStepMs(fine)
}

function allItems(view: ShowTimelineViewModel): ShowTimelineItemView[] {
  return view.rows.flatMap(row => row.layers.flatMap(layer => layer.items))
}

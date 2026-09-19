import type { ShowClipTemporalIntentV2 } from './showClipTemporalV2'
import type { ShowTransitionEditIntentV2 } from './showTransitionsV2'
import type {
  ShowTimelineItemView,
  ShowTimelineTransitionView,
  ShowTimelineViewModel,
} from './showTimelineViewModel'

/** The connected clip forms the transition owner defines for one joined Clip. */
export type ShowV2ConnectedClipIntent = Extract<
  ShowTransitionEditIntentV2,
  { kind: 'resize-leading' | 'resize-trailing' | 'move-connected' }
>

export type ShowV2ClipTemporalRefusal =
  | 'missing-clip'
  | 'missing-target'
  | 'group-child'
  | 'no-change'
  | 'outside-clip'
  | 'connected-reroute'
  | 'boundary-detach-unsupported'
  | 'invalid-request'

/**
 * One gesture's v2 command, decided from the presented timeline before any
 * owner runs. `temporal` submits through the clip-temporal door,
 * `transition-resize` through the connected transition-resize door, and
 * `refuse` submits nothing: no record, no history entry, no save.
 */
export type ShowV2ClipTemporalPlan =
  | { kind: 'temporal'; intent: ShowClipTemporalIntentV2 }
  | { kind: 'transition-resize'; intent: ShowV2ConnectedClipIntent }
  | { kind: 'refuse'; reason: ShowV2ClipTemporalRefusal }

function refuse(reason: ShowV2ClipTemporalRefusal): ShowV2ClipTemporalPlan {
  return { kind: 'refuse', reason }
}

interface PlacedItem {
  item: ShowTimelineItemView
}

function findItem(view: ShowTimelineViewModel, clipId: string): PlacedItem | null {
  for (const row of view.rows) {
    for (const layer of row.layers) {
      const item = layer.items.find((candidate) => candidate.id === clipId)
      if (item) return { item }
    }
  }
  return null
}

function findLayer(view: ShowTimelineViewModel, zoneId: string, layerId: string): boolean {
  return view.rows.some((row) => row.zoneId === zoneId
    && row.layers.some((layer) => layer.id === layerId))
}

function endpointClips(view: ShowTimelineViewModel, clipId: string): { incoming: number; outgoing: number } {
  let incoming = 0
  let outgoing = 0
  for (const transition of view.transitions) {
    if (transition.scope.kind === 'participants') {
      for (const participant of transition.scope.participants) {
        if (participant.toItemId === clipId) incoming += 1
        if (participant.fromItemId === clipId) outgoing += 1
      }
    } else {
      if (transition.scope.toItemIds.includes(clipId)) incoming += 1
      if (transition.scope.fromItemIds.includes(clipId)) outgoing += 1
    }
  }
  return { incoming, outgoing }
}

/**
 * Participant endpoints only. The temporal owner refuses a re-placement that
 * would detach a participant pair, but a whole-output contributor list is not
 * a placement bond, so the planner must not refuse those up front: the owner
 * stays the authority at commit.
 */
function isParticipantEndpoint(view: ShowTimelineViewModel, clipId: string): boolean {
  return view.transitions.some((transition) => transition.scope.kind === 'participants'
    && transition.scope.participants.some((participant) => (
      participant.fromItemId === clipId || participant.toItemId === clipId
    )))
}

function isEndpoint(view: ShowTimelineViewModel, clipId: string): boolean {
  const { incoming, outgoing } = endpointClips(view, clipId)
  return incoming > 0 || outgoing > 0
}

function edgeTransitions(
  view: ShowTimelineViewModel,
  clipId: string,
  edge: 'leading' | 'trailing',
): ShowTimelineTransitionView[] {
  return view.transitions.filter((transition) => {
    if (transition.scope.kind === 'participants') {
      return transition.scope.participants.some((participant) => (
        edge === 'leading' ? participant.toItemId === clipId : participant.fromItemId === clipId
      ))
    }
    const ids = edge === 'leading' ? transition.scope.toItemIds : transition.scope.fromItemIds
    return ids.includes(clipId)
  })
}

/**
 * Plan a pointer drop of one Clip onto a Zone Layer at a snapped start time.
 * A same-Layer move of a joined Clip shifts its connected component through
 * the connected move form; a cross-Layer or cross-Zone drop re-places a free
 * Clip. A joined Clip never re-places: the temporal owner refuses to detach a
 * transition participant, so the gesture refuses before any submission.
 */
export function planShowV2ClipMove(
  view: ShowTimelineViewModel,
  input: { clipId: string; zoneId: string; layerId: string; startMs: number },
): ShowV2ClipTemporalPlan {
  const found = findItem(view, input.clipId)
  if (!found) return refuse('missing-clip')
  if (found.item.groupOccurrenceId) return refuse('group-child')
  const reroutes = input.zoneId !== found.item.zoneId || input.layerId !== found.item.layerId
  if (!reroutes && input.startMs === found.item.startMs) return refuse('no-change')
  if (reroutes) {
    if (!findLayer(view, input.zoneId, input.layerId)) return refuse('missing-target')
    if (isParticipantEndpoint(view, input.clipId)) return refuse('connected-reroute')
    return {
      kind: 'temporal',
      intent: {
        kind: 'replace-placement',
        clipId: input.clipId,
        zoneId: input.zoneId,
        layerId: input.layerId,
        startMs: input.startMs,
      },
    }
  }
  if (isEndpoint(view, input.clipId)) {
    return {
      kind: 'transition-resize',
      intent: { kind: 'move-connected', clipId: input.clipId, startMs: input.startMs },
    }
  }
  return { kind: 'temporal', intent: { kind: 'move', clipId: input.clipId, startMs: input.startMs } }
}

/**
 * Plan an edge resize to an explicit interval. The resized edge decides the
 * door: a joined edge goes through the connected resize form, a free edge (or
 * a two-edge change the connected forms cannot carry) through trim/extend.
 * The pointer modifier never reaches this planner: Alt feeds the snap the
 * caller already applied, exactly as v1's `beginCompositionResize` does.
 *
 * A resize that pulls a joined edge AWAY from a Transition v1 authored on a
 * Scene boundary (leading startMs increases, trailing endMs decreases) would
 * detach it the way v1 detaches a broken Scene-boundary junction
 * (`scene-boundary-cut` in `resizeShowClipExactly`: the junction needs exact
 * millisecond adjacency, so ANY positive move away breaks it), and no single
 * landed v2 owner expresses that trim plus Transition reset and Show-End
 * reclaim in one edit. It refuses as `boundary-detach-unsupported` before any
 * submission: no preview, no write, record identity kept. The missing
 * single-owner detach operation is engine issue #1068.
 * A Layer-Transition join (`origin: 'converted-layer-transition'`) or a
 * natively authored join (no origin) keeps the connected form exactly as now,
 * as does every resize toward the Transition and every resize that leaves the
 * junction intact. Provenance comes from the presented Transition record, never
 * a name or id heuristic.
 * A straddle that is neither inside nor containing refuses: both temporal
 * owners refuse it as an invalid intent.
 */
export function planShowV2ClipResize(
  view: ShowTimelineViewModel,
  input: { clipId: string; edge: 'leading' | 'trailing'; startMs: number; endMs: number },
): ShowV2ClipTemporalPlan {
  const found = findItem(view, input.clipId)
  if (!found) return refuse('missing-clip')
  if (found.item.groupOccurrenceId) return refuse('group-child')
  const { item } = found
  const endMs = item.startMs + item.durationMs
  if (input.startMs === item.startMs && input.endMs === endMs) return refuse('no-change')
  if (!(input.endMs > input.startMs)) return refuse('outside-clip')
  const leadingChanged = input.startMs !== item.startMs
  const trailingChanged = input.endMs !== endMs
  const leading = edgeTransitions(view, input.clipId, 'leading')
  const trailing = edgeTransitions(view, input.clipId, 'trailing')
  if (leadingChanged && !trailingChanged && leading.length > 0) {
    if (input.startMs > item.startMs
      && leading.some((transition) => transition.origin === 'converted-boundary-transition')) {
      return refuse('boundary-detach-unsupported')
    }
    return {
      kind: 'transition-resize',
      intent: { kind: 'resize-leading', clipId: input.clipId, startMs: input.startMs },
    }
  }
  if (trailingChanged && !leadingChanged && trailing.length > 0) {
    if (input.endMs < endMs
      && trailing.some((transition) => transition.origin === 'converted-boundary-transition')) {
      return refuse('boundary-detach-unsupported')
    }
    return {
      kind: 'transition-resize',
      intent: { kind: 'resize-trailing', clipId: input.clipId, endMs: input.endMs },
    }
  }
  if (input.startMs >= item.startMs && input.endMs <= endMs) {
    return {
      kind: 'temporal',
      intent: { kind: 'trim', clipId: input.clipId, startMs: input.startMs, endMs: input.endMs },
    }
  }
  if (input.startMs <= item.startMs && input.endMs >= endMs) {
    return {
      kind: 'temporal',
      intent: { kind: 'extend', clipId: input.clipId, startMs: input.startMs, endMs: input.endMs },
    }
  }
  return refuse('outside-clip')
}

/** Plan a split at an interior time with a caller-minted fresh right identity. */
export function planShowV2ClipSplit(
  view: ShowTimelineViewModel,
  input: { clipId: string; atMs: number; rightClipId: string },
): ShowV2ClipTemporalPlan {
  const found = findItem(view, input.clipId)
  if (!found) return refuse('missing-clip')
  if (found.item.groupOccurrenceId) return refuse('group-child')
  if (!Number.isSafeInteger(input.atMs)
    || input.atMs <= found.item.startMs
    || input.atMs >= found.item.startMs + found.item.durationMs) {
    return refuse('outside-clip')
  }
  if (!input.rightClipId || !input.rightClipId.trim()) return refuse('invalid-request')
  return {
    kind: 'temporal',
    intent: { kind: 'split', clipId: input.clipId, atMs: input.atMs, rightClipId: input.rightClipId },
  }
}

function firstOrdinaryItemAt(view: ShowTimelineViewModel, timeMs: number): ShowTimelineItemView | null {
  for (const row of view.rows) {
    for (const layer of row.layers) {
      for (const item of layer.items) {
        if (item.groupOccurrenceId) continue
        if (timeMs > item.startMs && timeMs < item.startMs + item.durationMs) return item
      }
    }
  }
  return null
}

/**
 * The toolbar Split target on a v2 backing, mirroring the landed split
 * capability rule: the selected ordinary Clip, else the ordinary Clip under
 * the playhead, and nothing inside Group isolation or for a Group child.
 */
export function resolveShowV2SplitTarget(
  view: ShowTimelineViewModel,
  input: { selectionClipId: string | null; playheadMs: number; isolatedGroupOccurrenceId: string | null },
): string | null {
  if (input.isolatedGroupOccurrenceId) return null
  const selected = input.selectionClipId ? findItem(view, input.selectionClipId) : null
  if (selected && !selected.item.groupOccurrenceId) return selected.item.id
  if (selected) return null
  return firstOrdinaryItemAt(view, input.playheadMs)?.id ?? null
}

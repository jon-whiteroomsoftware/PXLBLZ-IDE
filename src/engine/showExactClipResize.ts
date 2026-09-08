import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'
import { normalizeShowTransitionState } from './showModel'
import { validateShowComposition } from './showCompositionModel'
import { resizeShowClipAtGlobalTime } from './showTimelineClipAuthoring'
import {
  resizeShowConnectedClipAtGlobalTime,
  resizeShowConnectedClipInShowAtGlobalTime,
  showLayerTransitionConnectedClosure,
  showLayerTransitionsConnectedToClip,
} from './showLayerTransitionAuthoring'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

export type ShowExactClipResizeRequest = { clipId: string; globalStartMs?: number } & (
  | { durationMs: number; globalEndMs?: never }
  | { globalEndMs: number; durationMs?: never }
)
export type ShowExactClipResizeResult =
  | {
      status: 'changed'
      composition: ShowCompositionV1
      changedClipIds: string[]
      movedClipIds: string[]
      transitionChanges: Array<{ transitionId: string; previousDurationMs: number; durationMs: number }>
    }
  | { status: 'noop'; composition: ShowCompositionV1 }
  | {
      status: 'refused'
      code: 'invalid-request' | 'missing-target' | 'unsupported-topology' | 'no-space' | 'domain-refusal'
      reason: string
      /** Fixed-start same-Layer capacity; additional engine constraints may apply. */
      availableRange?: { startMs: number; endMs: number }
    }

/** Pure internal operation; adoption and caller migration belong to shared admission. */
export function resizeShowClipExactly(
  show: ShowRecord,
  composition: ShowCompositionV1,
  request: ShowExactClipResizeRequest,
): ShowExactClipResizeResult {
  if (
    typeof request.clipId !== 'string' || !request.clipId
    || (request.durationMs === undefined) === (request.globalEndMs === undefined)
    || [request.globalStartMs, request.durationMs, request.globalEndMs]
      .some(value => value !== undefined && !Number.isSafeInteger(value))
  ) return { status: 'refused', code: 'invalid-request', reason: 'Use integer global milliseconds and exactly one duration or end time.' }
  const projection = projectShowUnifiedTimeline(show, composition)
  const clips = projection.zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips))
  const clip = clips.find(candidate => candidate.id === request.clipId)
  if (!clip) return { status: 'refused', code: 'missing-target', reason: 'The logical Clip no longer exists.' }
  if (clip.groupOccurrenceId) {
    return { status: 'refused', code: 'unsupported-topology', reason: 'Group-owned Clips do not yet support this exact resize operation.' }
  }
  const globalStartMs = request.globalStartMs ?? clip.startMs
  const durationMs = request.durationMs ?? request.globalEndMs! - globalStartMs
  if (globalStartMs < 0 || durationMs <= 0 || !Number.isSafeInteger(globalStartMs + durationMs)) {
    return { status: 'refused', code: 'invalid-request', reason: 'Clip start must be nonnegative and duration must be positive.' }
  }
  if (validateShowComposition(show, composition).length) {
    return { status: 'refused', code: 'domain-refusal', reason: 'The composition is not valid for exact resize.' }
  }
  if (globalStartMs === clip.startMs && durationMs === clip.durationMs) return { status: 'noop', composition }
  const owner = clip.kind === 'main'
    ? { kind: 'main' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.id }
    : { kind: 'overlay' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.id, layerId: clip.layerId! }
  const connected = showLayerTransitionsConnectedToClip(composition, clip.id)
  const candidate = (connected.length ? resizeShowConnectedClipAtGlobalTime : resizeShowClipAtGlobalTime)(show, composition, { owner, globalStartMs, durationMs })
  if (candidate === composition || validateShowComposition(show, candidate).length) {
    // Capacity explains a failed exact request; domain acceptance stays in the
    // existing engines. This is not a clamp or a second overlap validator.
    const closure = new Set(showLayerTransitionConnectedClosure(composition, [clip.id]))
    const downstreamEndMs = clips.filter(other => closure.has(other.id)).reduce((end, other) => Math.max(end, other.endMs), clip.endMs)
    const siblings = clips.filter(other => !closure.has(other.id) && other.zoneId === clip.zoneId
      && other.kind === clip.kind && other.layerIndex === clip.layerIndex)
    const startMs = clip.startMs
    const endMs = siblings.filter(other => other.startMs >= clip.endMs)
      .reduce((bound, other) => Math.min(bound, other.startMs), projection.durationMs) - (downstreamEndMs - clip.endMs)
    if (globalStartMs === startMs && globalStartMs + durationMs > endMs) {
      return { status: 'refused', code: 'no-space', reason: `The same-Layer range at this start is ${startMs}–${endMs} ms.`, availableRange: { startMs, endMs } }
    }
    return { status: 'refused', code: 'domain-refusal', reason: 'The exact Clip range cannot be authored.' }
  }
  const after = projectShowUnifiedTimeline(show, candidate).zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips))
  const resized = after.find(other => other.id === clip.id)
  if (!resized || resized.startMs !== globalStartMs || resized.durationMs !== durationMs) {
    return { status: 'refused', code: 'domain-refusal', reason: 'The engine did not preserve the exact requested range.' }
  }
  const transitionChanges: Array<{ transitionId: string; previousDurationMs: number; durationMs: number }> = []
  for (const previous of composition.transitions ?? []) {
    const next = candidate.transitions?.find(transition => transition.id === previous.id)
    if (!next) return { status: 'refused', code: 'unsupported-topology', reason: 'Exact resize cannot remove an attached Transition.' }
    if (next.durationMs !== previous.durationMs) {
      if (previous.toPlacementId !== clip.startPlacementId || globalStartMs + durationMs !== clip.endMs) {
        return { status: 'refused', code: 'unsupported-topology', reason: 'This Transition timing change is not supported by exact resize.' }
      }
      transitionChanges.push({ transitionId: previous.id, previousDurationMs: previous.durationMs, durationMs: next.durationMs })
    }
  }
  // Compare the same canonical boundary representation on both sides: an
  // implicit Cut may be materialized without changing boundary semantics.
  // The returned composition leaves every original Show Transition untouched.
  const canonical = resizeShowConnectedClipInShowAtGlobalTime(show, composition, { owner, globalStartMs, durationMs, plannedComposition: candidate })
  if (JSON.stringify(normalizeShowTransitionState(canonical).transitions) !== JSON.stringify(normalizeShowTransitionState(show).transitions)) {
    return { status: 'refused', code: 'unsupported-topology', reason: 'This resize would remove a Scene-boundary Transition.' }
  }
  const changed = after.filter(next => {
    const previous = clips.find(other => other.id === next.id)
    return previous && (next.startMs !== previous.startMs || next.durationMs !== previous.durationMs)
  })
  return {
    status: 'changed', composition: candidate,
    changedClipIds: changed.map(next => next.id),
    movedClipIds: changed.filter(next => next.startMs !== clips.find(previous => previous.id === next.id)!.startMs).map(next => next.id),
    transitionChanges,
  }
}

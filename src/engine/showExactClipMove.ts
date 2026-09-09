import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'
import { normalizeShowTransitionState } from './showModel'
import { validateShowComposition } from './showCompositionModel'
import { moveShowClipAtGlobalTime } from './showTimelineClipAuthoring'
import { moveShowConnectedClipAtGlobalTime, moveShowConnectedClipInShowAtGlobalTime, showLayerTransitionsConnectedToClip, showLayerTransitionConnectedClosure } from './showLayerTransitionAuthoring'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

export interface ShowExactClipMoveRequest { clipId: string; globalStartMs: number; zoneId?: string; layer?: 'main' | number }
export type ShowExactClipMoveResult =
  | { status: 'changed'; composition: ShowCompositionV1; movedClipIds: string[] }
  | { status: 'noop'; composition: ShowCompositionV1 }
  | { status: 'refused'; code: 'invalid-request' | 'missing-target' | 'missing-destination' | 'unsupported-topology' | 'domain-refusal' | 'occupied' | 'outside-timeline'; reason: string; remedy?: string }

export function moveShowClipExactly(show: ShowRecord, composition: ShowCompositionV1, request: ShowExactClipMoveRequest): ShowExactClipMoveResult {
  if (typeof request.clipId !== 'string' || !request.clipId || !Number.isSafeInteger(request.globalStartMs) || request.globalStartMs < 0) return { status: 'refused', code: 'invalid-request', reason: 'Use a Clip id and nonnegative safe integer global milliseconds.' }
  const projection = projectShowUnifiedTimeline(show, composition)
  const clips = projection.zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips))
  const clip = clips.find(candidate => candidate.id === request.clipId)
  if (!clip) return { status: 'refused', code: 'missing-target', reason: 'The logical Clip no longer exists.' }
  if (clip.groupOccurrenceId) return { status: 'refused', code: 'unsupported-topology', reason: 'Group-owned Clips do not support this exact move.' }
  if (!Number.isSafeInteger(request.globalStartMs + clip.durationMs)) return { status: 'refused', code: 'invalid-request', reason: 'The resulting end must be safe integer milliseconds.' }
  if (validateShowComposition(show, composition).length) return { status: 'refused', code: 'domain-refusal', reason: 'The composition is invalid.' }
  const zoneId = request.zoneId ?? clip.zoneId
  const kind = request.layer === undefined ? clip.kind : request.layer === 'main' ? 'main' : 'overlay'
  const layerIndex = request.layer === undefined ? clip.layerIndex : request.layer === 'main' ? 0 : request.layer
  if (!show.zones.some(zone => zone.id === zoneId) || (kind === 'overlay' && (!Number.isSafeInteger(layerIndex) || layerIndex < 0 || !composition.scenes.some(scene => scene.zones.some(zone => zone.zoneId === zoneId && zone.overlays[layerIndex]))))) return { status: 'refused', code: 'missing-destination', reason: 'The destination Zone or Layer does not exist.' }
  const sameLayer = zoneId === clip.zoneId && kind === clip.kind && (kind === 'main' || layerIndex === clip.layerIndex)
  const connected = showLayerTransitionsConnectedToClip(composition, clip.id)
  if (connected.length && !sameLayer) return { status: 'refused', code: 'unsupported-topology', reason: 'Moving a connected Clip to another Zone or Layer would detach its Transitions. Reset those Transitions to Cut explicitly first.' }
  if (sameLayer && clip.startMs === request.globalStartMs) return { status: 'noop', composition }
  const owner = clip.kind === 'main'
    ? { kind: 'main' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.id }
    : { kind: 'overlay' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.id, layerId: clip.layerId! }
  const target = kind === 'main'
    ? { kind: 'main' as const, zoneId, globalStartMs: request.globalStartMs }
    : { kind: 'overlay' as const, zoneId, layerIndex, globalStartMs: request.globalStartMs }
  const candidate = (connected.length ? moveShowConnectedClipAtGlobalTime : moveShowClipAtGlobalTime)(show, composition, { owner, target })
  if (candidate === composition) {
    // Explain only finite projected bounds/collisions after the engine refuses;
    // these diagnostics never authorize a move or replace engine validation.
    const members = new Set(showLayerTransitionConnectedClosure(composition, [clip.id]))
    const delta = request.globalStartMs - clip.startMs
    const shifted = clips.filter(value => members.has(value.id))
      .map(value => ({ clip: value, startMs: value.startMs + delta, endMs: value.endMs + delta }))
    if (shifted.some(value => value.startMs < 0 || value.endMs > projection.durationMs)) return {
      status: 'refused', code: 'outside-timeline',
      reason: `Moving Clip ${clip.id} would place its supported chain outside the Show's 0–${projection.durationMs} ms timeline.`,
      remedy: 'Choose a time that fits the whole chain, or change Show End explicitly first.',
    }
    for (const member of shifted) {
      const blocker = clips.find(value => !members.has(value.id) && value.zoneId === zoneId
        && value.kind === kind && (kind === 'main' || value.layerIndex === layerIndex)
        && value.startMs < member.endMs && value.endMs > member.startMs)
      if (blocker) return {
        status: 'refused', code: 'occupied',
        reason: `Moving Clip ${clip.id} would overlap Clip ${blocker.id} (${blocker.patternName}) on the destination Layer.`,
        remedy: `Choose another time or Layer, or move or resize Clip ${blocker.id} first.`,
      }
    }
    return { status: 'refused', code: 'domain-refusal', reason: 'The requested move cannot be authored.' }
  }
  if (validateShowComposition(show, candidate).length) return { status: 'refused', code: 'domain-refusal', reason: 'The requested move is invalid.' }
  const after = projectShowUnifiedTimeline(show, candidate).zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips))
  const moved = after.find(next => next.id === clip.id)
  if (!moved || moved.startMs !== request.globalStartMs || moved.durationMs !== clip.durationMs || moved.zoneId !== zoneId || moved.kind !== kind || (kind === 'overlay' && moved.layerIndex !== layerIndex)) return { status: 'refused', code: 'domain-refusal', reason: 'The engine did not preserve the exact requested destination and duration.' }
  const closure = new Set(showLayerTransitionConnectedClosure(composition, [clip.id]))
  const delta = request.globalStartMs - clip.startMs
  const movedClipIds: string[] = []
  for (const previous of clips) {
    const next = after.find(value => value.id === previous.id)
    if (!next || next.durationMs !== previous.durationMs || next.startMs !== previous.startMs + (closure.has(previous.id) ? delta : 0)) return { status: 'refused', code: 'domain-refusal', reason: 'The move changed unrelated timing or connected offsets.' }
    if (next.startMs !== previous.startMs || next.zoneId !== previous.zoneId || next.kind !== previous.kind || next.layerIndex !== previous.layerIndex) movedClipIds.push(next.id)
    if (!closure.has(previous.id) && (next.zoneId !== previous.zoneId || next.kind !== previous.kind || next.layerIndex !== previous.layerIndex)) return { status: 'refused', code: 'domain-refusal', reason: 'The move changed an unrelated destination.' }
    // The manual wrapper checks its selected endpoint. Check each chain member
    // against the original Show so a boundary attached to another member counts.
    if (closure.has(previous.id)) {
      const memberOwner = previous.kind === 'main'
        ? { kind: 'main' as const, sceneId: previous.sceneId, zoneId: previous.zoneId, placementId: previous.id }
        : { kind: 'overlay' as const, sceneId: previous.sceneId, zoneId: previous.zoneId, placementId: previous.id, layerId: previous.layerId! }
      const memberTarget = next.kind === 'main'
        ? { kind: 'main' as const, zoneId: next.zoneId, globalStartMs: next.startMs }
        : { kind: 'overlay' as const, zoneId: next.zoneId, layerIndex: next.layerIndex, globalStartMs: next.startMs }
      const canonical = moveShowConnectedClipInShowAtGlobalTime(show, composition, { owner: memberOwner, target: memberTarget, plannedComposition: candidate })
      if (JSON.stringify(normalizeShowTransitionState(canonical).transitions) !== JSON.stringify(normalizeShowTransitionState(show).transitions)) return { status: 'refused', code: 'unsupported-topology', reason: 'This move would remove a visual Scene-boundary Transition.' }
    }
  }
  if (after.length !== clips.length || (candidate.transitions ?? []).length !== (composition.transitions ?? []).length) return { status: 'refused', code: 'domain-refusal', reason: 'The move changed Clip or Transition identity.' }
  for (const previous of composition.transitions ?? []) {
    const next = candidate.transitions?.find(value => value.id === previous.id)
    const from = clips.find(value => value.endPlacementId === previous.fromPlacementId)
    const to = clips.find(value => value.startPlacementId === previous.toPlacementId)
    const expected = { ...previous, fromPlacementId: after.find(value => value.id === from?.id)?.endPlacementId ?? previous.fromPlacementId, toPlacementId: after.find(value => value.id === to?.id)?.startPlacementId ?? previous.toPlacementId }
    if (JSON.stringify(next) !== JSON.stringify(expected)) return { status: 'refused', code: 'unsupported-topology', reason: 'The move changed an attached Transition.' }
  }
  return { status: 'changed', composition: candidate, movedClipIds }
}

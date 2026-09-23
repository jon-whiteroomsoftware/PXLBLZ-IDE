import type { ShowClipV2, ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowLayerTransitionInsertionPlan } from './showLayerTransitionAuthoring'
import { showV2TransitionJunctionKey } from './showV2TransitionEditorModel'

const DIFFERENT_LAYOUTS_REASON =
  'These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.'
const NOT_ADJACENT_REASON =
  'A Transition joins two Clips that follow each other on the same Layer. Select a Clip and the one directly after it.'
const ALREADY_TRANSITION_REASON =
  'This junction already has a Transition. Edit that one instead of adding another.'
const SAME_INSTANT_REASON =
  'Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.'
const SIMULTANEOUS_TRANSITION_REASON =
  'Another Layer is already running a Transition across this moment. Only one Layer can transition at a time, so move this junction or shorten that Transition.'
const NO_FREE_TIME_REASON =
  'There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.'
const MISSING_GROUP_REASON = 'This Group no longer exists.'

function disabled(reason: string): ShowLayerTransitionInsertionPlan {
  return { enabled: false, maxDurationMs: 0, reason }
}

function clipsOnLayer(record: ShowRecordV2, zoneId: string, layerId: string) {
  return record.composition.clips
    .filter(clip => clip.zoneId === zoneId && clip.layerId === layerId)
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
}

// v2 retires Scenes, so there is no Scene end to read. On a converted record
// every v1 Scene start survives as a chapter Marker (the converter mints one
// per Scene, absorbing a same-named Marker already there), and Scene
// intervals are contiguous with the loop end after the last one. The v2 bound
// is therefore the next chapter Marker time after the junction's Scene start,
// else showEndMs. A natively authored record without chapter Markers treats
// the whole loop as one Scene.
function chapterBoundaries(record: ShowRecordV2): number[] {
  return [...new Set(
    record.composition.markers
      .filter(marker => marker.role === 'chapter')
      .map(marker => marker.timeMs),
  )].sort((left, right) => left - right)
}

function sceneIndexAt(boundaries: number[], timeMs: number): number {
  let scene = -1
  for (let index = 0; index < boundaries.length; index += 1) {
    if (boundaries[index] <= timeMs) scene = index
    else break
  }
  return scene
}

function sceneEndAt(
  record: ShowRecordV2,
  boundaries: number[],
  clipsById: Map<string, ShowClipV2>,
  timeMs: number,
): number {
  const scene = sceneIndexAt(boundaries, timeMs)
  const base = boundaries[scene + 1] ?? record.composition.showEndMs
  // A converted Scene-boundary Transition bridges its Scene end and the next
  // Scene start, so v1's Scene end is the window start, not the next Marker.
  // Former boundaries carry converted-boundary-transition provenance; native
  // Transitions never do, so they never narrow the bound.
  let endMs = base
  for (const transition of record.composition.transitions) {
    if (transition.origin !== 'converted-boundary-transition') continue
    const window = transitionWindow(clipsById, transition)
    if (window && window.endMs === base) endMs = Math.min(endMs, window.startMs)
  }
  return endMs
}

function transitionWindow(
  clipsById: Map<string, ShowClipV2>,
  transition: ShowTransitionV2,
): { startMs: number; endMs: number } | null {
  if (transition.wholeOutput) {
    return { startMs: transition.wholeOutput.startMs, endMs: transition.wholeOutput.startMs + transition.durationMs }
  }
  const source = clipsById.get(transition.participants[0]?.fromClipId ?? '')
  if (!source) return null
  const startMs = source.startMs + source.durationMs
  return { startMs, endMs: startMs + transition.durationMs }
}

function participantTransitions(record: ShowRecordV2): ShowTransitionV2[] {
  return record.composition.transitions.filter(transition => !transition.wholeOutput)
}

// Layer-scope Transitions: native Transitions plus converted Layer
// Transitions. Converted Scene-boundary Transitions live in v1's separate
// boundary collection and never extend a Layer chain nor pin a Layer window,
// so they stay out of the chain, moving and fixed sets below even at
// participant scope.
function layerScopeTransitions(record: ShowRecordV2): ShowTransitionV2[] {
  return participantTransitions(record).filter(transition => transition.origin !== 'converted-boundary-transition')
}

function transitionConnects(
  record: ShowRecordV2,
  fromClipId: string,
  toClipId: string,
): boolean {
  return participantTransitions(record).some(transition => transition.participants.some(
    participant => participant.fromClipId === fromClipId && participant.toClipId === toClipId,
  ))
}

function planForClips(
  record: ShowRecordV2,
  fromClipId: string,
  toClipId: string,
): ShowLayerTransitionInsertionPlan {
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const from = clipsById.get(fromClipId)
  const to = clipsById.get(toClipId)
  if (!from || !to) return disabled(DIFFERENT_LAYOUTS_REASON)
  const boundaries = chapterBoundaries(record)
  if (sceneIndexAt(boundaries, from.startMs) !== sceneIndexAt(boundaries, to.startMs)) {
    return disabled(DIFFERENT_LAYOUTS_REASON)
  }
  if (from.zoneId !== to.zoneId || from.layerId !== to.layerId) return disabled(NOT_ADJACENT_REASON)
  const layerClips = clipsOnLayer(record, from.zoneId, from.layerId)
  const fromIndex = layerClips.findIndex(clip => clip.id === fromClipId)
  const toIndex = layerClips.findIndex(clip => clip.id === toClipId)
  if (fromIndex < 0 || toIndex !== fromIndex + 1) return disabled(NOT_ADJACENT_REASON)
  const cutMs = from.startMs + from.durationMs
  if (to.startMs !== cutMs || transitionConnects(record, fromClipId, toClipId)) {
    return disabled(ALREADY_TRANSITION_REASON)
  }
  const scope = layerScopeTransitions(record)
  const connected = (fromClipId: string, toClipId: string): boolean => scope.some(
    transition => transition.participants.some(
      participant => participant.fromClipId === fromClipId && participant.toClipId === toClipId,
    ),
  )
  const chain = [layerClips[toIndex]]
  for (let index = toIndex; index < layerClips.length - 1; index += 1) {
    const current = layerClips[index]
    const next = layerClips[index + 1]
    if (current.startMs + current.durationMs !== next.startMs) break
    if (!connected(current.id, next.id)) break
    chain.push(next)
  }
  const last = chain[chain.length - 1]
  const lastEndMs = last.startMs + last.durationMs
  const obstruction = layerClips[toIndex + chain.length]
  const sceneEndMs = sceneEndAt(record, boundaries, clipsById, cutMs)
  let maxDurationMs = Math.max(
    0,
    Math.min(obstruction?.startMs ?? sceneEndMs, sceneEndMs) - lastEndMs,
  )
  const cutScene = sceneIndexAt(boundaries, cutMs)
  const unrelatedClips = record.composition.clips.filter(clip => (
    clip.zoneId === from.zoneId
    && clip.layerId !== from.layerId
    && sceneIndexAt(boundaries, clip.startMs) === cutScene
  ))
  const nextUnrelatedStartMs = unrelatedClips
    .filter(clip => clip.startMs > cutMs)
    .reduce((nearest, clip) => Math.min(nearest, clip.startMs), Number.POSITIVE_INFINITY)
  if (Number.isFinite(nextUnrelatedStartMs)) {
    maxDurationMs = Math.min(maxDurationMs, nextUnrelatedStartMs - cutMs - 1)
  }
  if (unrelatedClips.some(clip => clip.startMs === cutMs)) {
    return disabled(SAME_INSTANT_REASON)
  }
  const activeUnrelatedEndMs = unrelatedClips
    .filter(clip => clip.startMs < cutMs && clip.startMs + clip.durationMs >= cutMs)
    .reduce((nearest, clip) => Math.min(nearest, clip.startMs + clip.durationMs), Number.POSITIVE_INFINITY)
  if (Number.isFinite(activeUnrelatedEndMs)) {
    maxDurationMs = Math.min(maxDurationMs, activeUnrelatedEndMs - cutMs - 1)
  }
  const nextOtherZoneBoundaryMs = record.composition.clips
    .filter(clip => clip.zoneId !== from.zoneId && sceneIndexAt(boundaries, clip.startMs) === cutScene)
    .flatMap(clip => [clip.startMs, clip.startMs + clip.durationMs])
    .filter(boundaryMs => boundaryMs > cutMs && boundaryMs < sceneEndMs)
    .reduce((nearest, boundaryMs) => Math.min(nearest, boundaryMs), Number.POSITIVE_INFINITY)
  if (Number.isFinite(nextOtherZoneBoundaryMs)) {
    maxDurationMs = Math.min(maxDurationMs, nextOtherZoneBoundaryMs - cutMs - 1)
  }
  const chainIds = new Set(chain.map(clip => clip.id))
  const movingTransitionIds = new Set(scope.filter(transition => (
    transition.participants.some(participant => chainIds.has(participant.fromClipId))
  )).map(transition => transition.id))
  const fixedIntervals = scope
    .filter(transition => !movingTransitionIds.has(transition.id))
    .flatMap(transition => transition.participants.flatMap(participant => {
      const source = clipsById.get(participant.fromClipId)
      if (!source) return []
      const startMs = source.startMs + source.durationMs
      return [{ startMs, endMs: startMs + transition.durationMs }]
    }))
  if (fixedIntervals.some(interval => cutMs >= interval.startMs && cutMs < interval.endMs)) {
    return disabled(SIMULTANEOUS_TRANSITION_REASON)
  }
  const nextFixedStart = fixedIntervals
    .filter(interval => interval.startMs > cutMs)
    .reduce((nearest, interval) => Math.min(nearest, interval.startMs), Number.POSITIVE_INFINITY)
  if (Number.isFinite(nextFixedStart)) maxDurationMs = Math.min(maxDurationMs, nextFixedStart - cutMs)
  return maxDurationMs > 0
    ? { enabled: true, maxDurationMs }
    : disabled(NO_FREE_TIME_REASON)
}

function resolveJunctionKey(
  record: ShowRecordV2,
  junctionKey: string,
): { fromClipId: string; toClipId: string } | null {
  for (const layer of record.composition.layers) {
    const clips = clipsOnLayer(record, layer.zoneId, layer.id)
    for (let index = 1; index < clips.length; index += 1) {
      const from = clips[index - 1]
      const to = clips[index]
      const atMs = from.startMs + from.durationMs
      if (showV2TransitionJunctionKey({
        atMs,
        zoneId: layer.zoneId,
        layerId: layer.id,
        fromClipId: from.id,
        toClipId: to.id,
      }) === junctionKey) {
        return { fromClipId: from.id, toClipId: to.id }
      }
    }
  }
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  for (const transition of participantTransitions(record)) {
    for (const participant of transition.participants) {
      const source = clipsById.get(participant.fromClipId)
      if (!source) continue
      if (showV2TransitionJunctionKey({
        atMs: source.startMs + source.durationMs,
        zoneId: participant.zoneId,
        layerId: participant.layerId,
        fromClipId: participant.fromClipId,
        toClipId: participant.toClipId,
      }) === junctionKey) {
        return { fromClipId: participant.fromClipId, toClipId: participant.toClipId }
      }
    }
  }
  return null
}

export function planShowV2LayerTransitionInsertion(
  record: ShowRecordV2,
  junctionKey: string,
): ShowLayerTransitionInsertionPlan {
  const resolved = resolveJunctionKey(record, junctionKey)
  if (!resolved) return disabled(NOT_ADJACENT_REASON)
  return planForClips(record, resolved.fromClipId, resolved.toClipId)
}

export function planShowV2GroupLayerTransitionInsertion(
  record: ShowRecordV2,
  occurrenceId: string,
  definitionFromClipId: string,
  definitionToClipId: string,
): ShowLayerTransitionInsertionPlan {
  const occurrence = record.composition.groupOccurrences.find(candidate => candidate.id === occurrenceId)
  if (!occurrence) return disabled(MISSING_GROUP_REASON)
  const materialized = materializeShowGroupsV2(record)
  let maxDurationMs = Number.POSITIVE_INFINITY
  let sawLinked = false
  for (const linked of record.composition.groupOccurrences.filter(
    candidate => candidate.definitionId === occurrence.definitionId,
  )) {
    sawLinked = true
    const plan = planForClips(
      materialized,
      `${linked.id}:${definitionFromClipId}`,
      `${linked.id}:${definitionToClipId}`,
    )
    if (!plan.enabled) return plan
    maxDurationMs = Math.min(maxDurationMs, plan.maxDurationMs)
  }
  return sawLinked && Number.isFinite(maxDurationMs)
    ? { enabled: true, maxDurationMs }
    : disabled(MISSING_GROUP_REASON)
}

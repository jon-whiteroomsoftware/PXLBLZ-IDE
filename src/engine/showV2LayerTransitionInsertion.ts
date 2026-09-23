import type { ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { insertShowGroupDefinitionLayerTransitionV2 } from './showGroupEditsV2'
import type { ShowLayerTransitionInsertionPlan } from './showLayerTransitionAuthoring'
import { editShowTransitionV2 } from './showTransitionsV2'
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

// "Different Zone Layouts" reads the Layout occurrences, which cover Show
// time exactly once, sorted by startMs. The Cut sits in different layouts
// when one occurrence ends at the Cut time and the next starts there with
// another layoutId. A boundary with the same layoutId on both sides, or a Cut
// inside one occurrence, stays inside one layout.
function orderedLayoutOccurrences(record: ShowRecordV2) {
  return [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
}

function isLayoutBoundaryWithDifferentLayout(record: ShowRecordV2, cutMs: number): boolean {
  const ordered = orderedLayoutOccurrences(record)
  const before = ordered.find(occurrence => occurrence.startMs + occurrence.durationMs === cutMs)
  const after = ordered.find(occurrence => occurrence.startMs === cutMs)
  return !!before && !!after && before.layoutId !== after.layoutId
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

function freshProbeId(record: ShowRecordV2): string {
  const used = new Set(record.composition.transitions.map(transition => transition.id))
  const base = '__probe-layer-transition-insertion'
  if (!used.has(base)) return base
  let counter = 2
  while (used.has(`${base}-${counter}`)) counter += 1
  return `${base}-${counter}`
}

function ownerAcceptsAt(
  record: ShowRecordV2,
  from: { id: string; zoneId: string; layerId: string },
  to: { id: string },
  durationMs: number,
  probeId: string,
): boolean {
  const transition: ShowTransitionV2 = {
    kind: 'crossfade',
    id: probeId,
    durationMs,
    easing: { curve: 'linear' },
    crossfadePolicy: 'live-live',
    participants: [{
      id: `${probeId}:participant`,
      zoneId: from.zoneId,
      layerId: from.layerId,
      fromClipId: from.id,
      toClipId: to.id,
    }],
    propertyRamps: [],
  }
  return editShowTransitionV2(record, { kind: 'insert', transition }).status === 'changed'
}

// #1075, Jon 2026-09-22: Chapter Markers are labels only. The maximum duration
// offered at a Cut is the room up to the next logical obstruction, which is
// the largest whole-millisecond duration the Transition owner accepts.
function maxDurationViaOwner(
  record: ShowRecordV2,
  from: { id: string; zoneId: string; layerId: string },
  to: { id: string },
): number {
  const high = record.composition.showEndMs
  if (!Number.isSafeInteger(high) || high < 1) return 0
  const probeId = freshProbeId(record)
  if (!ownerAcceptsAt(record, from, to, 1, probeId)) return 0
  let low = 1
  let highBound = high
  while (low < highBound) {
    const mid = Math.floor((low + highBound + 1) / 2)
    if (ownerAcceptsAt(record, from, to, mid, probeId)) low = mid
    else highBound = mid - 1
  }
  return low
}

function refusalForClips(
  record: ShowRecordV2,
  fromClipId: string,
  toClipId: string,
): ShowLayerTransitionInsertionPlan | null {
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const from = clipsById.get(fromClipId)
  const to = clipsById.get(toClipId)
  if (!from || !to) return disabled(DIFFERENT_LAYOUTS_REASON)
  const cutMs = from.startMs + from.durationMs
  if (isLayoutBoundaryWithDifferentLayout(record, cutMs)) return disabled(DIFFERENT_LAYOUTS_REASON)
  if (from.zoneId !== to.zoneId || from.layerId !== to.layerId) return disabled(NOT_ADJACENT_REASON)
  const layerClips = clipsOnLayer(record, from.zoneId, from.layerId)
  const fromIndex = layerClips.findIndex(clip => clip.id === fromClipId)
  const toIndex = layerClips.findIndex(clip => clip.id === toClipId)
  if (fromIndex < 0 || toIndex !== fromIndex + 1) return disabled(NOT_ADJACENT_REASON)
  if (to.startMs !== cutMs || transitionConnects(record, fromClipId, toClipId)) {
    return disabled(ALREADY_TRANSITION_REASON)
  }
  const unrelatedClips = record.composition.clips.filter(clip => (
    clip.zoneId === from.zoneId
    && clip.layerId !== from.layerId
  ))
  if (unrelatedClips.some(clip => clip.startMs === cutMs)) {
    return disabled(SAME_INSTANT_REASON)
  }
  const scope = layerScopeTransitions(record)
  const connected = (candidateFrom: string, candidateTo: string): boolean => scope.some(
    transition => transition.participants.some(
      participant => participant.fromClipId === candidateFrom && participant.toClipId === candidateTo,
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
  return null
}

function planForClips(
  record: ShowRecordV2,
  fromClipId: string,
  toClipId: string,
): ShowLayerTransitionInsertionPlan {
  const refusal = refusalForClips(record, fromClipId, toClipId)
  if (refusal) return refusal
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const from = clipsById.get(fromClipId)!
  const to = clipsById.get(toClipId)!
  const maxDurationMs = maxDurationViaOwner(record, from, to)
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

function groupProbeAccepts(
  record: ShowRecordV2,
  definitionId: string,
  definitionLayerId: string,
  definitionFromClipId: string,
  definitionToClipId: string,
  durationMs: number,
  probeId: string,
): boolean {
  const transition: ShowTransitionV2 = {
    kind: 'crossfade',
    id: probeId,
    durationMs,
    easing: { curve: 'linear' },
    crossfadePolicy: 'live-live',
    participants: [{
      id: `${probeId}:participant`,
      zoneId: 'definition-zone',
      layerId: definitionLayerId,
      fromClipId: definitionFromClipId,
      toClipId: definitionToClipId,
    }],
    propertyRamps: [],
  }
  return insertShowGroupDefinitionLayerTransitionV2(record, {
    kind: 'insert-definition-layer-transition',
    definitionId,
    transition,
  }).status === 'changed'
}

// #1075, Jon 2026-09-22: the Group maximum comes from the Group owner the same
// way. Its whole-record validation covers every linked occurrence.
function maxGroupDurationViaOwner(
  record: ShowRecordV2,
  definitionId: string,
  definitionLayerId: string,
  definitionFromClipId: string,
  definitionToClipId: string,
): number {
  const high = record.composition.showEndMs
  if (!Number.isSafeInteger(high) || high < 1) return 0
  const used = new Set(record.composition.groupDefinitions.flatMap(definition => definition.transitions.map(transition => transition.id)))
  const base = '__probe-group-layer-transition-insertion'
  let probeId = base
  let counter = 2
  while (used.has(probeId)) {
    probeId = `${base}-${counter}`
    counter += 1
  }
  if (!groupProbeAccepts(record, definitionId, definitionLayerId, definitionFromClipId, definitionToClipId, 1, probeId)) return 0
  let low = 1
  let highBound = high
  while (low < highBound) {
    const mid = Math.floor((low + highBound + 1) / 2)
    if (groupProbeAccepts(record, definitionId, definitionLayerId, definitionFromClipId, definitionToClipId, mid, probeId)) low = mid
    else highBound = mid - 1
  }
  return low
}

export function planShowV2GroupLayerTransitionInsertion(
  record: ShowRecordV2,
  occurrenceId: string,
  definitionFromClipId: string,
  definitionToClipId: string,
): ShowLayerTransitionInsertionPlan {
  const occurrence = record.composition.groupOccurrences.find(candidate => candidate.id === occurrenceId)
  if (!occurrence) return disabled(MISSING_GROUP_REASON)
  const definition = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)
  if (!definition) return disabled(MISSING_GROUP_REASON)
  const materialized = materializeShowGroupsV2(record)
  const linked = record.composition.groupOccurrences.filter(
    candidate => candidate.definitionId === occurrence.definitionId,
  )
  if (linked.length === 0) return disabled(MISSING_GROUP_REASON)
  for (const linkedOccurrence of linked) {
    const refusal = refusalForClips(
      materialized,
      `${linkedOccurrence.id}:${definitionFromClipId}`,
      `${linkedOccurrence.id}:${definitionToClipId}`,
    )
    if (refusal) return refusal
  }
  const fromDefinitionClip = definition.clips.find(clip => clip.id === definitionFromClipId)
  if (!fromDefinitionClip) return disabled(DIFFERENT_LAYOUTS_REASON)
  const maxDurationMs = maxGroupDurationViaOwner(
    record,
    definition.id,
    fromDefinitionClip.layerId,
    definitionFromClipId,
    definitionToClipId,
  )
  return maxDurationMs > 0
    ? { enabled: true, maxDurationMs }
    : disabled(NO_FREE_TIME_REASON)
}

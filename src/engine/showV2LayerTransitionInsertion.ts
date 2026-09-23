import type { ShowGroupDefinitionV2, ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import { projectShowEditorTimelineV2 } from './showEditorTimelinePresentation'
import type { ShowTimelineLayerView } from './showTimelineViewModel'
import {
  groupDefinitionAsRecord,
  groupOccurrenceDuration,
  materializeShowGroupsV2,
  occurrenceBoundaryAfter,
} from './showGroupsV2'
import { insertShowGroupDefinitionLayerTransitionV2 } from './showGroupEditsV2'
import type { ShowLayerTransitionInsertionPlan } from './showLayerTransitionAuthoring'
import { downstreamClosure, editShowTransitionV2, transitionEndpoints } from './showTransitionsV2'
import { clipContributionInterval } from './showLayoutIntervalsV2'
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

function transitionWindowV2(
  record: ShowRecordV2,
  transition: ShowTransitionV2,
): { startMs: number; endMs: number } | null {
  if (transition.wholeOutput) {
    return { startMs: transition.wholeOutput.startMs, endMs: transition.wholeOutput.startMs + transition.durationMs }
  }
  const fromId = transitionEndpoints(transition).from[0]
  const from = fromId === undefined ? undefined : record.composition.clips.find(clip => clip.id === fromId)
  if (!from) return null
  return { startMs: from.startMs + from.durationMs, endMs: from.startMs + from.durationMs + transition.durationMs }
}

function contributionWindowFor(record: ShowRecordV2, clipId: string): { startMs: number; endMs: number } {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  let startMs = clip.startMs
  let endMs = clip.startMs + clip.durationMs
  for (const transition of record.composition.transitions) {
    const endpoints = transitionEndpoints(transition)
    if (endpoints.to.includes(clipId)) startMs = Math.min(startMs, clip.startMs - transition.durationMs)
    if (endpoints.from.includes(clipId)) endMs = Math.max(endMs, clip.startMs + clip.durationMs + transition.durationMs)
  }
  return { startMs, endMs }
}

function layoutZoneIdsFor(record: ShowRecordV2, layoutId: string): string[] {
  const layout = record.zoneLayouts.find(candidate => candidate.id === layoutId)
  if (!layout) return []
  const ids = layout.logical?.zoneIds ?? (layout.zones.length > 0
    ? layout.zones.map(zone => zone.zoneId)
    : record.zones.map(zone => zone.id))
  return [...new Set(ids)]
}

function orderedLayoutOccurrencesFor(record: ShowRecordV2) {
  return [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
}

type FixedTransitionWindowForInsert = { startMs: number; endMs: number; zoneIds: string[]; owned: Set<string> }
type MovingClipForInsert = { id: string; zoneId: string; startMs: number; endMs: number }

function pushFixedWindowRefusals(
  candidates: number[],
  fixedWindows: FixedTransitionWindowForInsert[],
  movingClips: MovingClipForInsert[],
): void {
  for (const window of fixedWindows) {
    for (const clip of movingClips) {
      if (window.owned.has(clip.id)) continue
      const sameZone = window.zoneIds.includes(clip.zoneId)
      if (sameZone) {
        if (clip.endMs < window.startMs) candidates.push(window.startMs - clip.endMs)
        else if (clip.startMs < window.startMs && clip.endMs > window.endMs) candidates.push(window.startMs - clip.startMs)
      } else {
        if (clip.endMs <= window.startMs) candidates.push(window.startMs - clip.endMs + 1)
        else if (clip.startMs <= window.startMs && clip.endMs > window.endMs) candidates.push(window.startMs - clip.startMs + 1)
      }
    }
  }
}

function fixedLayerWindowsForInsert(
  materialized: ShowRecordV2,
  movedIds: Set<string>,
): FixedTransitionWindowForInsert[] {
  const windows: FixedTransitionWindowForInsert[] = []
  for (const transition of materialized.composition.transitions) {
    if (transition.wholeOutput) continue
    const endpoints = transitionEndpoints(transition)
    if (endpoints.from.some(id => movedIds.has(id)) || endpoints.to.some(id => movedIds.has(id))) continue
    const window = transitionWindowV2(materialized, transition)
    if (!window) continue
    const zoneIds = [...new Set(transition.participants.map(participant => participant.zoneId))]
    windows.push({ startMs: window.startMs, endMs: window.endMs, zoneIds, owned: new Set(endpoints.all) })
  }
  return windows
}

function firstRefusedTopLevel(
  record: ShowRecordV2,
  fromId: string,
  toId: string,
  cutMs: number,
): number {
  const candidates: number[] = []
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const from = clipsById.get(fromId)
  const to = clipsById.get(toId)
  if (!from || !to) return 1
  const closure = new Set(downstreamClosure(record, [toId]))
  if (closure.has(fromId)) return 1
  const moved = closure
  const showEndMs = record.composition.showEndMs
  let maxMovedEnd = -Infinity
  for (const clipId of moved) {
    const clip = clipsById.get(clipId)
    if (clip) maxMovedEnd = Math.max(maxMovedEnd, clip.startMs + clip.durationMs)
  }
  if (!Number.isSafeInteger(maxMovedEnd)) return 1
  candidates.push(showEndMs - maxMovedEnd + 1)
  const materialized = record.composition.groupOccurrences.length > 0
    ? materializeShowGroupsV2(record)
    : record
  const matClips = materialized.composition.clips
  const matByLayer = new Map<string, Array<{ startMs: number; endMs: number; id: string }>>()
  for (const clip of matClips) {
    const key = `${clip.zoneId}:${clip.layerId}`
    const entries = matByLayer.get(key) ?? []
    entries.push({ startMs: clip.startMs, endMs: clip.startMs + clip.durationMs, id: clip.id })
    matByLayer.set(key, entries)
  }
  const movedKeys = new Set<string>()
  for (const clipId of moved) {
    const clip = clipsById.get(clipId)
    if (clip) movedKeys.add(`${clip.zoneId}:${clip.layerId}`)
  }
  for (const key of movedKeys) {
    let movedEnd = -Infinity
    for (const clipId of moved) {
      const clip = clipsById.get(clipId)
      if (clip && `${clip.zoneId}:${clip.layerId}` === key) {
        movedEnd = Math.max(movedEnd, clip.startMs + clip.durationMs)
      }
    }
    const entries = matByLayer.get(key) ?? []
    let nextStart = Infinity
    for (const entry of entries) {
      if (moved.has(entry.id)) continue
      if (entry.startMs >= movedEnd) nextStart = Math.min(nextStart, entry.startMs)
    }
    if (nextStart !== Infinity) candidates.push(nextStart - movedEnd + 1)
  }
  const participantZone = from.zoneId
  const ownedNew = new Set([fromId, toId])
  const fixedMat = matClips.filter(clip => !moved.has(clip.id))
  for (const clip of fixedMat) {
    if (ownedNew.has(clip.id)) continue
    const startMs = clip.startMs
    const endMs = clip.startMs + clip.durationMs
    if (clip.zoneId === participantZone) {
      if (endMs < cutMs) continue
      if (startMs < cutMs) candidates.push(endMs - cutMs)
      else candidates.push(startMs - cutMs)
    } else {
      let best = Infinity
      if (startMs > cutMs) best = Math.min(best, startMs - cutMs)
      if (endMs > cutMs) best = Math.min(best, endMs - cutMs)
      if (best !== Infinity) candidates.push(best)
    }
  }
  const layerTransitions = record.composition.transitions.filter(transition => !transition.wholeOutput)
  for (const transition of layerTransitions) {
    const endpoints = transitionEndpoints(transition)
    const fromIn = endpoints.from.some(id => moved.has(id))
    const toIn = endpoints.to.some(id => moved.has(id))
    if (fromIn !== toIn) {
      candidates.push(1)
      break
    }
  }
  const movingWindows: Array<{ startMs: number; endMs: number; owned: Set<string> }> = []
  for (const transition of layerTransitions) {
    const endpoints = transitionEndpoints(transition)
    if (!endpoints.from.some(id => moved.has(id))) continue
    const window = transitionWindowV2(record, transition)
    if (!window) continue
    movingWindows.push({ startMs: window.startMs, endMs: window.endMs, owned: new Set(endpoints.all) })
  }
  for (const window of movingWindows) {
    for (const clip of fixedMat) {
      if (window.owned.has(clip.id)) continue
      const startMs = clip.startMs
      const endMs = clip.startMs + clip.durationMs
      let best = Infinity
      if (startMs > window.endMs) best = Math.min(best, startMs - window.endMs)
      if (endMs > window.endMs) best = Math.min(best, endMs - window.endMs)
      if (best !== Infinity) candidates.push(best)
    }
  }
  const fixedWindows = fixedLayerWindowsForInsert(materialized, moved)
  const movingClips = [...moved]
    .map(id => clipsById.get(id))
    .filter((clip): clip is NonNullable<typeof clip> => !!clip)
  pushFixedWindowRefusals(
    candidates,
    fixedWindows,
    movingClips.map(clip => ({ id: clip.id, zoneId: clip.zoneId, startMs: clip.startMs, endMs: clip.startMs + clip.durationMs })),
  )
  const useCounts = new Map<string, number>()
  for (const clip of matClips) useCounts.set(clip.instanceId, (useCounts.get(clip.instanceId) ?? 0) + 1)
  const soleMovedInstances = new Set<string>()
  for (const clipId of moved) {
    const clip = clipsById.get(clipId)
    if (clip && (useCounts.get(clip.instanceId) ?? 0) === 1) soleMovedInstances.add(clip.instanceId)
  }
  for (const track of record.composition.propertyTracks) {
    let ownerClipId: string
    if ('clipId' in track.target) {
      if (!moved.has(track.target.clipId)) continue
      ownerClipId = track.target.clipId
    } else if ('instanceId' in track.target) {
      const targetInstanceId = track.target.instanceId
      if (!soleMovedInstances.has(targetInstanceId)) continue
      const owner = [...moved].find(id => clipsById.get(id)?.instanceId === targetInstanceId)
      if (!owner) continue
      ownerClipId = owner
    } else {
      continue
    }
    const window = contributionWindowFor(record, ownerClipId)
    const activeEnd = track.activeStartMs + track.activeDurationMs
    if (track.activeStartMs >= window.startMs && activeEnd <= window.endMs) {
      candidates.push(showEndMs - activeEnd + 1)
    } else {
      let lastKey = -Infinity
      for (const key of track.keyframes) lastKey = Math.max(lastKey, key.timeMs)
      if (Number.isSafeInteger(lastKey)) candidates.push(activeEnd - lastKey + 1)
    }
  }
  for (const transition of record.composition.transitions) {
    if (!transition.wholeOutput) continue
    const endpoints = transitionEndpoints(transition)
    const scope = new Set(endpoints.all)
    const movedCount = [...scope].filter(id => moved.has(id)).length
    if (scope.size > 0 && movedCount > 0 && movedCount < scope.size) {
      candidates.push(1)
      continue
    }
    const window = transitionWindowV2(record, transition)
    if (!window) continue
    if (scope.size > 0 && movedCount === scope.size) {
      for (const clip of fixedMat) {
        if (scope.has(clip.id)) continue
        const startMs = clip.startMs
        const endMs = clip.startMs + clip.durationMs
        if (endMs > window.startMs) candidates.push(endMs - window.startMs)
        if (startMs > window.endMs) candidates.push(startMs - window.endMs)
      }
    } else if (movedCount === 0) {
      for (const clip of movingClips) {
        if (scope.has(clip.id)) continue
        const endMs = clip.startMs + clip.durationMs
        if (endMs < window.startMs) candidates.push(window.startMs - endMs)
      }
    }
  }
  for (const transition of record.composition.transitions) {
    if (!transition.wholeOutput) continue
    const window = transitionWindowV2(record, transition)
    if (!window || !(window.startMs > cutMs)) continue
    const scope = new Set(transitionEndpoints(transition).all)
    if (scope.size > 0 && [...scope].every(id => moved.has(id))) continue
    candidates.push(window.startMs - cutMs + 1)
  }
  const occurrences = orderedLayoutOccurrencesFor(record)
  for (const clip of movingClips) {
    const interval = clipContributionInterval(record, clip)
    for (const occurrence of occurrences) {
      if (layoutZoneIdsFor(record, occurrence.layoutId).includes(clip.zoneId)) continue
      const occStart = occurrence.startMs
      const occEnd = occurrence.startMs + occurrence.durationMs
      if (interval.startMs >= occEnd) continue
      if (interval.endMs <= occStart) candidates.push(occStart - interval.endMs + 1)
    }
  }
  if (from) {
    const fromInterval = clipContributionInterval(record, from)
    for (const occurrence of occurrences) {
      if (layoutZoneIdsFor(record, occurrence.layoutId).includes(from.zoneId)) continue
      const occStart = occurrence.startMs
      const occEnd = occurrence.startMs + occurrence.durationMs
      if (fromInterval.startMs >= occEnd) continue
      if (fromInterval.endMs <= occStart) candidates.push(occStart - cutMs + 1)
    }
  }
  let minimum = Infinity
  for (const candidate of candidates) {
    if (Number.isSafeInteger(candidate)) minimum = Math.min(minimum, candidate)
  }
  return minimum
}

function structuralMaxTopLevel(
  record: ShowRecordV2,
  fromId: string,
  toId: string,
  cutMs: number,
): number {
  const showEndMs = record.composition.showEndMs
  if (!Number.isSafeInteger(showEndMs) || showEndMs < 1) return 0
  const firstRefused = firstRefusedTopLevel(record, fromId, toId, cutMs)
  if (!Number.isSafeInteger(firstRefused)) return showEndMs
  return Math.max(0, Math.min(showEndMs, firstRefused - 1))
}

function confirmMaxTopLevel(
  record: ShowRecordV2,
  from: { id: string; zoneId: string; layerId: string },
  to: { id: string },
  structuralMax: number,
): number {
  if (!Number.isSafeInteger(structuralMax) || structuralMax < 1) return 0
  const probeId = freshProbeId(record)
  if (ownerAcceptsAt(record, from, to, structuralMax, probeId)) return structuralMax
  if (!ownerAcceptsAt(record, from, to, 1, probeId)) return 0
  let low = 1
  let highBound = structuralMax
  while (low < highBound) {
    const mid = Math.floor((low + highBound + 1) / 2)
    if (ownerAcceptsAt(record, from, to, mid, probeId)) low = mid
    else highBound = mid - 1
  }
  return low
}

// #1089: the insert-room maximum is a structural room that every offered
// duration satisfies. The structural list above is the specification: the
// downstream closure moves by d (the owner's commitShift/downstreamClosure in
// showTransitionsV2), and the first refused d is the minimum over the
// obstructions (same-Layer next Clip/Group occurrence via materialized overlap
// validation; the new window and each moving Transition window via the owner's
// RL09; whole-output windows via exact-match validation and RL10; Layout
// occurrence boundaries via layout availability; Property tracks whose
// activation stays fixed via key-inside-activation validation ~780 and the
// owner's shiftOwnedTracks rule; showEndMs). The offered maximum is that
// minimum minus 1. Owner confirmation is the backstop: the result is always a
// probed, accepted duration, and a missed obstruction falls back to a downward
// search within [1, structural max].
function maxDurationViaOwner(
  record: ShowRecordV2,
  from: { id: string; zoneId: string; layerId: string },
  to: { id: string },
): number {
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const fromClip = clipsById.get(from.id)
  const toClip = clipsById.get(to.id)
  if (!fromClip || !toClip) return 0
  const cutMs = fromClip.startMs + fromClip.durationMs
  const structuralMax = structuralMaxTopLevel(record, from.id, to.id, cutMs)
  return confirmMaxTopLevel(record, from, to, structuralMax)
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

function firstRefusedDefinitionLocal(
  adapter: ShowRecordV2,
  fromId: string,
  toId: string,
  cutMs: number,
): number {
  const candidates: number[] = []
  const clipsById = new Map(adapter.composition.clips.map(clip => [clip.id, clip]))
  const from = clipsById.get(fromId)
  const to = clipsById.get(toId)
  if (!from || !to) return 1
  const closure = new Set(downstreamClosure(adapter, [toId]))
  if (closure.has(fromId)) return 1
  const moved = closure
  const byLayer = new Map<string, Array<{ startMs: number; endMs: number; id: string }>>()
  for (const clip of adapter.composition.clips) {
    const entries = byLayer.get(clip.layerId) ?? []
    entries.push({ startMs: clip.startMs, endMs: clip.startMs + clip.durationMs, id: clip.id })
    byLayer.set(clip.layerId, entries)
  }
  const movedLayers = new Set<string>()
  for (const clipId of moved) {
    const clip = clipsById.get(clipId)
    if (clip) movedLayers.add(clip.layerId)
  }
  for (const layerId of movedLayers) {
    let movedEnd = -Infinity
    for (const clipId of moved) {
      const clip = clipsById.get(clipId)
      if (clip && clip.layerId === layerId) movedEnd = Math.max(movedEnd, clip.startMs + clip.durationMs)
    }
    const entries = byLayer.get(layerId) ?? []
    let nextStart = Infinity
    for (const entry of entries) {
      if (moved.has(entry.id)) continue
      if (entry.startMs >= movedEnd) nextStart = Math.min(nextStart, entry.startMs)
    }
    if (nextStart !== Infinity) candidates.push(nextStart - movedEnd + 1)
  }
  const ownedNew = new Set([fromId, toId])
  const fixed = adapter.composition.clips.filter(clip => !moved.has(clip.id))
  for (const clip of fixed) {
    if (ownedNew.has(clip.id)) continue
    const startMs = clip.startMs
    const endMs = clip.startMs + clip.durationMs
    if (endMs < cutMs) continue
    if (startMs < cutMs) candidates.push(endMs - cutMs)
    else candidates.push(startMs - cutMs)
  }
  for (const transition of adapter.composition.transitions) {
    const endpoints = transitionEndpoints(transition)
    const fromIn = endpoints.from.some(id => moved.has(id))
    const toIn = endpoints.to.some(id => moved.has(id))
    if (fromIn !== toIn) {
      candidates.push(1)
      break
    }
  }
  const movingWindows: Array<{ startMs: number; endMs: number; owned: Set<string> }> = []
  for (const transition of adapter.composition.transitions) {
    const endpoints = transitionEndpoints(transition)
    if (!endpoints.from.some(id => moved.has(id))) continue
    const window = transitionWindowV2(adapter, transition)
    if (!window) continue
    movingWindows.push({ startMs: window.startMs, endMs: window.endMs, owned: new Set(endpoints.all) })
  }
  for (const window of movingWindows) {
    for (const clip of fixed) {
      if (window.owned.has(clip.id)) continue
      const startMs = clip.startMs
      const endMs = clip.startMs + clip.durationMs
      let best = Infinity
      if (startMs > window.endMs) best = Math.min(best, startMs - window.endMs)
      if (endMs > window.endMs) best = Math.min(best, endMs - window.endMs)
      if (best !== Infinity) candidates.push(best)
    }
  }
  const useCounts = new Map<string, number>()
  for (const clip of adapter.composition.clips) useCounts.set(clip.instanceId, (useCounts.get(clip.instanceId) ?? 0) + 1)
  const soleMoved = new Set<string>()
  for (const clipId of moved) {
    const clip = clipsById.get(clipId)
    if (clip && (useCounts.get(clip.instanceId) ?? 0) === 1) soleMoved.add(clip.instanceId)
  }
  for (const track of adapter.composition.propertyTracks) {
    let ownerClipId: string
    if ('clipId' in track.target) {
      if (!moved.has(track.target.clipId)) continue
      ownerClipId = track.target.clipId
    } else if ('instanceId' in track.target) {
      const targetInstanceId = track.target.instanceId
      if (!soleMoved.has(targetInstanceId)) continue
      const owner = [...moved].find(id => clipsById.get(id)?.instanceId === targetInstanceId)
      if (!owner) continue
      ownerClipId = owner
    } else {
      continue
    }
    const window = contributionWindowFor(adapter, ownerClipId)
    const activeEnd = track.activeStartMs + track.activeDurationMs
    if (!(track.activeStartMs >= window.startMs && activeEnd <= window.endMs)) {
      let lastKey = -Infinity
      for (const key of track.keyframes) lastKey = Math.max(lastKey, key.timeMs)
      if (Number.isSafeInteger(lastKey)) candidates.push(activeEnd - lastKey + 1)
    }
  }
  let minimum = Infinity
  for (const candidate of candidates) {
    if (Number.isSafeInteger(candidate)) minimum = Math.min(minimum, candidate)
  }
  return minimum
}

function outerFirstRefusedForOccurrence(
  record: ShowRecordV2,
  definition: ShowGroupDefinitionV2,
  occurrenceId: string,
  definitionFromId: string,
  definitionToId: string,
  localCutMs: number,
  movedDef: Set<string>,
): number {
  const candidates: number[] = []
  const occurrence = record.composition.groupOccurrences.find(candidate => candidate.id === occurrenceId)!
  const showEndMs = record.composition.showEndMs
  const oldOccDuration = groupOccurrenceDuration(definition, occurrence)
  const oldOccEnd = occurrence.startMs + oldOccDuration
  candidates.push(showEndMs - oldOccEnd + 1)
  if (occurrence.trackActivation) {
    const trackEnd = occurrence.trackActivation.startMs + occurrence.trackActivation.durationMs
    candidates.push(trackEnd - oldOccEnd + 1)
  }
  const materialized = materializeShowGroupsV2(record)
  const matClips = materialized.composition.clips
  const bindingByDef = new Map(occurrence.layerBindings.map(binding => [binding.definitionLayerId, binding.layerId]))
  const globalCut = occurrenceBoundaryAfter(occurrence, localCutMs)
  const ownedNewMat = new Set([`${occurrence.id}:${definitionFromId}`, `${occurrence.id}:${definitionToId}`])
  const movedOuterEnds = new Map<string, number>()
  for (const child of definition.clips) {
    if (!movedDef.has(child.id)) continue
    const outerLayer = bindingByDef.get(child.layerId)
    if (!outerLayer) continue
    const mat = matClips.find(clip => clip.id === `${occurrence.id}:${child.id}`)
    if (!mat) continue
    const endMs = mat.startMs + mat.durationMs
    const key = `${occurrence.zoneId}:${outerLayer}`
    movedOuterEnds.set(key, Math.max(movedOuterEnds.get(key) ?? -Infinity, endMs))
  }
  for (const [key, movedEnd] of movedOuterEnds) {
    let nextStart = Infinity
    for (const clip of matClips) {
      if (`${clip.zoneId}:${clip.layerId}` !== key) continue
      let isMoved = false
      if (clip.id.startsWith(`${occurrence.id}:`)) {
        isMoved = movedDef.has(clip.id.slice(occurrence.id.length + 1))
      }
      if (isMoved) continue
      if (clip.startMs >= movedEnd) nextStart = Math.min(nextStart, clip.startMs)
    }
    if (nextStart !== Infinity) candidates.push(nextStart - movedEnd + 1)
  }
  const fixedOuter = matClips.filter(clip => {
    if (clip.id.startsWith(`${occurrence.id}:`)) {
      return !movedDef.has(clip.id.slice(occurrence.id.length + 1))
    }
    return true
  })
  for (const clip of fixedOuter) {
    if (ownedNewMat.has(clip.id)) continue
    const startMs = clip.startMs
    const endMs = clip.startMs + clip.durationMs
    if (clip.zoneId === occurrence.zoneId) {
      if (endMs < globalCut) continue
      if (startMs < globalCut) candidates.push(endMs - globalCut)
      else candidates.push(startMs - globalCut)
    } else {
      let best = Infinity
      if (startMs > globalCut) best = Math.min(best, startMs - globalCut)
      if (endMs > globalCut) best = Math.min(best, endMs - globalCut)
      if (best !== Infinity) candidates.push(best)
    }
  }
  const movingMatWindows: Array<{ startMs: number; endMs: number; owned: Set<string> }> = []
  for (const transition of definition.transitions) {
    if (!movedDef.has(transition.fromPlacementId)) continue
    if (!movedDef.has(transition.toPlacementId)) continue
    const fromChild = definition.clips.find(clip => clip.id === transition.fromPlacementId)!
    const ws = occurrenceBoundaryAfter(occurrence, fromChild.startMs + fromChild.durationMs)
    movingMatWindows.push({
      startMs: ws,
      endMs: ws + transition.durationMs,
      owned: new Set([`${occurrence.id}:${transition.fromPlacementId}`, `${occurrence.id}:${transition.toPlacementId}`]),
    })
  }
  for (const window of movingMatWindows) {
    for (const clip of fixedOuter) {
      if (window.owned.has(clip.id)) continue
      const startMs = clip.startMs
      const endMs = clip.startMs + clip.durationMs
      let best = Infinity
      if (startMs > window.endMs) best = Math.min(best, startMs - window.endMs)
      if (endMs > window.endMs) best = Math.min(best, endMs - window.endMs)
      if (best !== Infinity) candidates.push(best)
    }
  }
  const movedMatIds = new Set([...movedDef].map(id => `${occurrence.id}:${id}`))
  const fixedOuterWindows = fixedLayerWindowsForInsert(materialized, movedMatIds)
  const movingOuterClips: MovingClipForInsert[] = []
  for (const clip of matClips) {
    if (!clip.id.startsWith(`${occurrence.id}:`)) continue
    if (!movedDef.has(clip.id.slice(occurrence.id.length + 1))) continue
    movingOuterClips.push({ id: clip.id, zoneId: clip.zoneId, startMs: clip.startMs, endMs: clip.startMs + clip.durationMs })
  }
  pushFixedWindowRefusals(candidates, fixedOuterWindows, movingOuterClips)
  for (const transition of record.composition.transitions) {
    if (!transition.wholeOutput) continue
    const window = transitionWindowV2(record, transition)
    if (!window || !(window.startMs > globalCut)) continue
    candidates.push(window.startMs - globalCut + 1)
  }
  const occurrences = orderedLayoutOccurrencesFor(record)
  for (const [key, movedEnd] of movedOuterEnds) {
    const zoneId = key.split(':')[0]
    for (const layoutOcc of occurrences) {
      if (layoutZoneIdsFor(record, layoutOcc.layoutId).includes(zoneId)) continue
      if (movedEnd <= layoutOcc.startMs) candidates.push(layoutOcc.startMs - movedEnd + 1)
    }
  }
  let minimum = Infinity
  for (const candidate of candidates) {
    if (Number.isSafeInteger(candidate)) minimum = Math.min(minimum, candidate)
  }
  return minimum
}

function structuralMaxGroup(
  record: ShowRecordV2,
  definition: ShowGroupDefinitionV2,
  definitionFromId: string,
  definitionToId: string,
): number {
  const showEndMs = record.composition.showEndMs
  if (!Number.isSafeInteger(showEndMs) || showEndMs < 1) return 0
  const adapter = groupDefinitionAsRecord(record, definition)
  const fromChild = definition.clips.find(clip => clip.id === definitionFromId)
  if (!fromChild) return 0
  const localCutMs = fromChild.startMs + fromChild.durationMs
  const localFirst = firstRefusedDefinitionLocal(adapter, definitionFromId, definitionToId, localCutMs)
  const movedDef = new Set(downstreamClosure(adapter, [definitionToId]))
  const linked = record.composition.groupOccurrences.filter(candidate => candidate.definitionId === definition.id)
  let overallFirst = localFirst
  for (const occurrence of linked) {
    const outerFirst = outerFirstRefusedForOccurrence(
      record,
      definition,
      occurrence.id,
      definitionFromId,
      definitionToId,
      localCutMs,
      movedDef,
    )
    overallFirst = Math.min(overallFirst, outerFirst)
  }
  if (!Number.isSafeInteger(overallFirst)) return showEndMs
  return Math.max(0, Math.min(showEndMs, overallFirst - 1))
}

function confirmMaxGroup(
  record: ShowRecordV2,
  definitionId: string,
  definitionLayerId: string,
  definitionFromId: string,
  definitionToId: string,
  structuralMax: number,
): number {
  if (!Number.isSafeInteger(structuralMax) || structuralMax < 1) return 0
  const used = new Set(record.composition.groupDefinitions.flatMap(entry => entry.transitions.map(transition => transition.id)))
  const base = '__probe-group-layer-transition-insertion'
  let probeId = base
  let counter = 2
  while (used.has(probeId)) {
    probeId = `${base}-${counter}`
    counter += 1
  }
  if (groupProbeAccepts(record, definitionId, definitionLayerId, definitionFromId, definitionToId, structuralMax, probeId)) {
    return structuralMax
  }
  if (!groupProbeAccepts(record, definitionId, definitionLayerId, definitionFromId, definitionToId, 1, probeId)) return 0
  let low = 1
  let highBound = structuralMax
  while (low < highBound) {
    const mid = Math.floor((low + highBound + 1) / 2)
    if (groupProbeAccepts(record, definitionId, definitionLayerId, definitionFromId, definitionToId, mid, probeId)) low = mid
    else highBound = mid - 1
  }
  return low
}

// #1089: the Group maximum is the same structural guarantee mapped outward.
// Definition-local room comes from the definition adapter (the Group owner's
// grownDefinitionAdapter/editShowTransitionV2 path in showGroupEditsV2); outer
// room is the occurrence's growth against outer obstructions and outer Show
// End, mapped from definition time to Show time for every linked occurrence
// (the minimum wins). Confirmation is the backstop, like the top-level path.
function maxGroupDurationViaOwner(
  record: ShowRecordV2,
  definitionId: string,
  definitionLayerId: string,
  definitionFromClipId: string,
  definitionToClipId: string,
): number {
  const definition = record.composition.groupDefinitions.find(candidate => candidate.id === definitionId)
  if (!definition) return 0
  const structuralMax = structuralMaxGroup(record, definition, definitionFromClipId, definitionToClipId)
  return confirmMaxGroup(record, definitionId, definitionLayerId, definitionFromClipId, definitionToClipId, structuralMax)
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

export type ShowV2LayerTransitionClipTarget = {
  fromName: string
  toName: string
  side: 'before' | 'after'
  v2Cut?: { junctionKey: string }
  v2GroupCut?: { occurrenceId: string; fromClipId: string; toClipId: string }
}

export type ShowV2LayerTransitionClipInsertionPlan =
  | { enabled: true; maxDurationMs: number; target: ShowV2LayerTransitionClipTarget }
  | { enabled: false; maxDurationMs: 0; reason: string; target: ShowV2LayerTransitionClipTarget | null }

/**
 * Resolve the Add-menu command from one selected v2 Clip, mirroring v1's
 * `planShowLayerTransitionInsertionForClip` (`showLayerTransitionAuthoring.ts`):
 * the same candidate order (trailing junctions, then leading), the same
 * resolution (first enabled, else first Cut, else first) and the same reason
 * strings. Adjacent Clips and their names come from the v2 timeline
 * presentation's Layer junctions and items (`projectShowEditorTimelineV2`),
 * the same source the junction click reads (`ShowEditor.tsx` Layer-junction
 * rendering): an ordinary Clip addresses its Cut by junction key, and a Group
 * Clip in isolation (`${occurrenceId}:${childId}`) addresses its Cut by
 * occurrence and definition children. Each candidate junction delegates to the
 * rule-B planner (`planShowV2LayerTransitionInsertion` or
 * `planShowV2GroupLayerTransitionInsertion`), so the maximum and the refusal
 * reasons come from the Transition owner.
 */
export function planShowV2LayerTransitionInsertionForClip(
  record: ShowRecordV2,
  presentedClipId: string | null,
): ShowV2LayerTransitionClipInsertionPlan {
  if (!presentedClipId) {
    return { enabled: false, maxDurationMs: 0, reason: 'Select a Clip first.', target: null }
  }
  const view = projectShowEditorTimelineV2(record)
  let selectedZoneId: string | null = null
  let selectedLayer: ShowTimelineLayerView | null = null
  for (const row of view.rows) {
    for (const layer of row.layers) {
      if (layer.items.some(item => item.id === presentedClipId)) {
        selectedZoneId = row.zoneId
        selectedLayer = layer
        break
      }
    }
    if (selectedLayer) break
  }
  const selectedItem = selectedLayer?.items.find(item => item.id === presentedClipId) ?? null
  if (!selectedLayer || !selectedItem) {
    return { enabled: false, maxDurationMs: 0, reason: 'Select a Clip first.', target: null }
  }
  const trailing = selectedLayer.junctions.filter(junction => junction.leftItemId === presentedClipId)
  const leading = selectedLayer.junctions.filter(junction => junction.rightItemId === presentedClipId)
  const candidates = [...trailing, ...leading].flatMap(junction => {
    const from = selectedLayer!.items.find(item => item.id === junction.leftItemId)
    const to = selectedLayer!.items.find(item => item.id === junction.rightItemId)
    if (!from || !to) return []
    const side = junction.leftItemId === presentedClipId ? 'after' as const : 'before' as const
    if (selectedItem!.groupOccurrenceId) {
      const occurrenceId = selectedItem!.groupOccurrenceId
      const prefix = `${occurrenceId}:`
      if (!junction.leftItemId.startsWith(prefix) || !junction.rightItemId.startsWith(prefix)) return []
      const fromClipId = junction.leftItemId.slice(prefix.length)
      const toClipId = junction.rightItemId.slice(prefix.length)
      const plan = planShowV2GroupLayerTransitionInsertion(record, occurrenceId, fromClipId, toClipId)
      const target: ShowV2LayerTransitionClipTarget = {
        fromName: from.patternName,
        toName: to.patternName,
        side,
        v2GroupCut: { occurrenceId, fromClipId, toClipId },
      }
      return [{ junction, plan, target }]
    }
    const junctionKey = showV2TransitionJunctionKey({
      atMs: junction.startMs,
      zoneId: selectedZoneId!,
      layerId: selectedLayer!.id,
      fromClipId: junction.leftItemId,
      toClipId: junction.rightItemId,
    })
    const plan = planShowV2LayerTransitionInsertion(record, junctionKey)
    const target: ShowV2LayerTransitionClipTarget = {
      fromName: from.patternName,
      toName: to.patternName,
      side,
      v2Cut: { junctionKey },
    }
    return [{ junction, plan, target }]
  })
  if (candidates.length === 0) {
    return {
      enabled: false,
      maxDurationMs: 0,
      reason: 'This Clip does not touch another Clip. Move it next to another Clip first.',
      target: null,
    }
  }
  const resolved = candidates.find(candidate => candidate.plan.enabled)
    ?? candidates.find(candidate => candidate.junction.kind === 'cut')
    ?? candidates[0]
  return { ...resolved.plan, target: resolved.target }
}

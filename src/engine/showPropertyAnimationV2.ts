import { repeatScaleSourceIsInRangeV2, repeatScaleHoldSourceIsInRangeV2 } from './showRepeatScaleEditEligibilityV2'
import { validateShowRecordV2, type ShowClipV2, type ShowPropertyKeyframeV2, type ShowPropertyTrackV2, type ShowRecordV2 } from './showCompositionV2'
import { effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from './showGroupsV2'
import { findShowInstancePropertyTrackConflictsV2, propertyTrackIntervalsOverlap, sameShowInstancePropertyTargetV2 } from './showPropertyTrackConflictsV2'
import {
  evaluateShowPropertyKeysV2,
  restrictShowPropertyTrackV2,
  insertTimeInPropertyTracksV2,
  type ShowInsertPropertyTimeResultV2,
} from './showPropertyTrackTimeMappingV2'

export { findNewShowInstancePropertyTrackConflictV2, findShowInstancePropertyTrackConflictsV2 } from './showPropertyTrackConflictsV2'
export { evaluateShowPropertyKeysV2 } from './showPropertyTrackTimeMappingV2'
export type { ShowInsertPropertyTimeResultV2 } from './showPropertyTrackTimeMappingV2'

export type ShowClipPropertyTrackEditV2 =
  | { kind: 'move'; startMs: number }
  | { kind: 'trim' | 'extend'; startMs: number; endMs: number }
  | { kind: 'split'; atMs: number; rightClipId: string }

export interface ShowClipPropertyTrackEditResultV2 {
  propertyTracks: ShowPropertyTrackV2[]
  affectedTrackIds: string[]
}

export type ShowPropertyKeyframeReauthorResultV2 =
  | { status: 'changed'; record: ShowRecordV2; affectedTrackIds: [string] }
  | { status: 'unchanged'; record: ShowRecordV2; affectedTrackIds: [] }
  | { status: 'refused'; record: ShowRecordV2; affectedTrackIds: []; message: string }

export interface ShowRestartEventV2 {
  id: string
  instanceId: string
  atMs: number
  clipIds: string[]
}

export type ShowRestartEventDerivationV2 =
  | { status: 'derived'; events: ShowRestartEventV2[] }
  | { status: 'refused'; events: []; message: string }

export interface CopyShowInstancePropertyTracksIntentV2 {
  fromInstanceId: string
  toInstanceId: string
  placementDeltaMs: number
  identitiesBySourceTrackId: Readonly<Record<string, {
    trackId: string
    keyframeIdsBySourceId: Readonly<Record<string, string>>
  }>>
  /** Omit to retain every authored control track, as for Make Independent. */
  compatibleControlExports?: readonly string[]
}

export type CopyShowInstancePropertyTracksResultV2 =
  | {
      status: 'changed'
      propertyTracks: ShowPropertyTrackV2[]
      copiedTrackIds: string[]
      discardedTargets: ShowPropertyTrackV2['target'][]
    }
  | {
      status: 'unchanged'
      propertyTracks: ShowPropertyTrackV2[]
      copiedTrackIds: []
      discardedTargets: ShowPropertyTrackV2['target'][]
    }
  | {
      status: 'refused'
      propertyTracks: ShowPropertyTrackV2[]
      copiedTrackIds: []
      discardedTargets: []
      message: string
    }

export interface ShowTransitionRampProjectionV2 {
  rampIndex: number
  trackId: string
  startKeyId: string
  endKeyId: string
  activeEndMs: number
  toValue: number
}

export type ShowTransitionRampProjectionResultV2 =
  | { status: 'changed'; record: ShowRecordV2; affectedTrackIds: string[] }
  | { status: 'unchanged'; record: ShowRecordV2; affectedTrackIds: [] }
  | { status: 'refused'; record: ShowRecordV2; affectedTrackIds: []; message: string }

/** Evaluate one active v2 Property track in its authored time domain. */
export function evaluateShowPropertyTrackV2(
  track: ShowPropertyTrackV2,
  atMs: number,
): number | undefined {
  const activeEndMs = track.activeStartMs + track.activeDurationMs
  if (atMs < track.activeStartMs || atMs >= activeEndMs) return undefined
  return evaluateShowPropertyKeysV2(track.keyframes, atMs)
}

/** Reauthor one key's adjacent kernels without mutating the supplied track. */
export function reauthorShowPropertyKeyframeInTrackV2(
  source: ShowPropertyTrackV2,
  keyframeId: string,
  changes: Partial<Pick<ShowPropertyKeyframeV2, 'timeMs' | 'value' | 'easing'>>,
): ShowPropertyTrackV2 {
  const track = structuredClone(source)
  const oldIndex = track.keyframes.findIndex(candidate => candidate.id === keyframeId)
  if (oldIndex < 0) return track
  const edited = track.keyframes[oldIndex]
  const editsEndpoint = changes.timeMs !== undefined || changes.value !== undefined
  delete edited.curveSegment
  if (editsEndpoint && oldIndex > 0) delete track.keyframes[oldIndex - 1].curveSegment
  Object.assign(edited, structuredClone(changes))
  track.keyframes.sort(compareKeys)
  if (editsEndpoint) {
    const newIndex = track.keyframes.findIndex(candidate => candidate.id === keyframeId)
    if (newIndex > 0) delete track.keyframes[newIndex - 1].curveSegment
  }
  return track
}

/** Reauthor the ordinary segments adjacent to an explicitly edited key. */
export function reauthorShowPropertyKeyframeV2(
  record: ShowRecordV2,
  trackId: string,
  keyframeId: string,
  changes: Partial<Pick<ShowPropertyKeyframeV2, 'timeMs' | 'value' | 'easing'>>,
): ShowPropertyKeyframeReauthorResultV2 {
  if (Object.keys(changes).length === 0) return { status: 'unchanged', record, affectedTrackIds: [] }
  const next = structuredClone(record)
  const track = next.composition.propertyTracks.find(candidate => candidate.id === trackId)
  const oldIndex = track?.keyframes.findIndex(candidate => candidate.id === keyframeId) ?? -1
  if (!track || oldIndex < 0) {
    return { status: 'refused', record, affectedTrackIds: [], message: `Property keyframe "${keyframeId}" does not exist in track "${trackId}".` }
  }
  next.composition.propertyTracks[next.composition.propertyTracks.indexOf(track)] = reauthorShowPropertyKeyframeInTrackV2(track, keyframeId, changes)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return { status: 'refused', record, affectedTrackIds: [], message: `${issue.path}: ${issue.message}` }
  return { status: 'changed', record: next, affectedTrackIds: [trackId] }
}

/**
 * Apply Clip interval edits to their owned tracks and, only for a sole user,
 * to tracks owned by the Clip's Pattern instance. The caller validates the
 * complete resulting record.
 */
export function editShowClipPropertyTracksV2(
  record: ShowRecordV2,
  clip: ShowClipV2,
  intent: ShowClipPropertyTrackEditV2,
): ShowClipPropertyTrackEditResultV2 {
  const soleInstanceUser = effectiveShowInstanceUseCountV2(record, clip.instanceId) === 1
  const affectedTrackIds: string[] = []
  const tracks = record.composition.propertyTracks.flatMap((source): ShowPropertyTrackV2[] => {
    const clipOwned = 'clipId' in source.target && source.target.clipId === clip.id
    const movableInstance = 'instanceId' in source.target && source.target.instanceId === clip.instanceId && soleInstanceUser
    if (!clipOwned && !movableInstance) return [structuredClone(source)]
    if (intent.kind === 'split' && movableInstance) return [structuredClone(source)]

    if (intent.kind === 'move') {
      const deltaMs = intent.startMs - clip.startMs
      if (deltaMs === 0) return [structuredClone(source)]
      affectedTrackIds.push(source.id)
      return [{
        ...structuredClone(source),
        activeStartMs: source.activeStartMs + deltaMs,
        keyframes: source.keyframes.map(key => ({ ...structuredClone(key), timeMs: key.timeMs + deltaMs })),
      }]
    }

    if (intent.kind === 'trim') {
      const restricted = restrictShowPropertyTrackV2(record.composition.propertyTracks, source, intent.startMs, intent.endMs)
      if (restricted === source) return [structuredClone(source)]
      affectedTrackIds.push(source.id)
      return restricted ? [restricted] : []
    }

    if (intent.kind === 'extend') {
      const extended = extendTrack(record, source, clip.startMs, clip.startMs + clip.durationMs, intent.startMs, intent.endMs)
      if (JSON.stringify(extended) === JSON.stringify(source)) return [structuredClone(source)]
      affectedTrackIds.push(source.id)
      return [extended]
    }

    if (intent.kind !== 'split') return [structuredClone(source)]
    // A split cuts each track only at the split time, as v1 does (#1101): the
    // left piece keeps the authored activation start and the right piece its
    // end, never narrowing to the Clip's visible span.
    const splitMs = intent.atMs
    const activeEndMs = source.activeStartMs + source.activeDurationMs
    const sourceKeyIds = new Set(source.keyframes.map(key => key.id))
    const left = restrictShowPropertyTrackV2(record.composition.propertyTracks, source, source.activeStartMs, splitMs, sourceKeyIds)
    const right = restrictShowPropertyTrackV2(record.composition.propertyTracks, source, splitMs, activeEndMs, sourceKeyIds)
    if (!left && !right) return []
    affectedTrackIds.push(source.id)
    if (!left && right) return [{ ...right, target: retargetClip(right.target, intent.rightClipId) }]
    if (left && !right) return [left]
    const rightTrackId = freshTrackId(record, `${source.id}:split:${intent.rightClipId}`)
    const usedKeyIds = new Set(left!.keyframes.map(key => key.id))
    const rightKeys = right!.keyframes.map(key => {
      if (!usedKeyIds.has(key.id)) return key
      const id = freshKeyId(record, source, `${key.id}:split:${intent.rightClipId}`, usedKeyIds)
      usedKeyIds.add(id)
      return { ...key, id }
    })
    affectedTrackIds.push(rightTrackId)
    return [left!, {
      ...right!, id: rightTrackId, target: retargetClip(right!.target, intent.rightClipId), keyframes: rightKeys,
    }]
  })
  return { propertyTracks: tracks, affectedTrackIds }
}

/** Map authored global Property time across one positive Insert Time edit. */
export function insertTimeInShowPropertyTracksV2(
  record: ShowRecordV2,
  atMs: number,
  durationMs: number,
): ShowInsertPropertyTimeResultV2 {
  const outsideRepeat = record.composition.propertyTracks.find(track => track.activeStartMs < atMs && atMs < track.activeStartMs + track.activeDurationMs && !repeatScaleHoldSourceIsInRangeV2(track, atMs))
  if (outsideRepeat) return { status: 'refused', propertyTracks: record.composition.propertyTracks, affectedTrackIds: [], message: `Holding repeat-scale track "${outsideRepeat.id}" requires its complete source curve to stay within 1–8.` }
  return insertTimeInPropertyTracksV2(record.composition.propertyTracks, record.composition.showEndMs, atMs, durationMs)
}

/**
 * Derive transient full Pattern reset events from materialized Clips. Callers may
 * supply contribution starts from the Transition owner; otherwise exact current
 * participant and whole-output windows are used.
 */
export function deriveShowRestartEventsV2(
  record: ShowRecordV2,
  contributionStartMsByClipId: Readonly<Record<string, number>> = {},
): ShowRestartEventDerivationV2 {
  let effective: ShowRecordV2
  try {
    effective = record.composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record
  } catch (error) {
    return { status: 'refused', events: [], message: error instanceof Error ? error.message : String(error) }
  }
  const clips = effective.composition.clips
  const clipById = new Map(clips.map(clip => [clip.id, clip]))
  const inferred = new Map<string, number>()
  for (const transition of effective.composition.transitions) {
    if (transition.wholeOutput) {
      for (const clipId of transition.wholeOutput.toClipIds) inferred.set(clipId, transition.wholeOutput.startMs)
      continue
    }
    for (const participant of transition.participants) {
      const from = clipById.get(participant.fromClipId)
      if (from) inferred.set(participant.toClipId, from.startMs + from.durationMs)
    }
  }
  const coalesced = new Map<string, ShowRestartEventV2>()
  for (const clip of clips) {
    if (clip.entryPolicy !== 'restart') continue
    const atMs = contributionStartMsByClipId[clip.id] ?? inferred.get(clip.id) ?? clip.startMs
    if (!Number.isSafeInteger(atMs) || atMs < 0 || atMs > clip.startMs) {
      return { status: 'refused', events: [], message: `Restart contribution for Clip "${clip.id}" must be a safe time no later than its nominal start.` }
    }
    const key = JSON.stringify([clip.instanceId, atMs])
    const existing = coalesced.get(key)
    if (existing) existing.clipIds.push(clip.id)
    else coalesced.set(key, {
      id: `restart:${key}`,
      instanceId: clip.instanceId,
      atMs,
      clipIds: [clip.id],
    })
  }
  const events = [...coalesced.values()]
  for (const event of events) event.clipIds.sort()
  events.sort((left, right) => left.atMs - right.atMs || left.instanceId.localeCompare(right.instanceId))
  return { status: 'derived', events }
}

/** Copy the instance-owned animation subset used by Make Independent and Replace. */
export function copyShowInstancePropertyTracksV2(
  record: ShowRecordV2,
  intent: CopyShowInstancePropertyTracksIntentV2,
): CopyShowInstancePropertyTracksResultV2 {
  const { fromInstanceId, toInstanceId, placementDeltaMs } = intent
  const instances = new Set(record.composition.patternInstances.map(instance => instance.id))
  if (!instances.has(fromInstanceId) || !instances.has(toInstanceId) || fromInstanceId === toInstanceId
    || !Number.isSafeInteger(placementDeltaMs)) {
    return { status: 'refused', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets: [], message: 'Track copying requires distinct existing instances and a safe placement delta.' }
  }
  let effectiveTracks: ShowPropertyTrackV2[]
  try {
    effectiveTracks = record.composition.groupOccurrences.length > 0
      ? materializeShowGroupsV2(record).composition.propertyTracks
      : record.composition.propertyTracks
  } catch (error) {
    return {
      status: 'refused', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets: [],
      message: error instanceof Error ? error.message : String(error),
    }
  }
  const compatible = intent.compatibleControlExports === undefined
    ? undefined
    : new Set(intent.compatibleControlExports)
  const discardedTargets: ShowPropertyTrackV2['target'][] = []
  const copies: ShowPropertyTrackV2[] = []
  const copiedTrackIds: string[] = []
  const usedTrackIds = new Set(effectiveTracks.map(track => track.id))
  const usedKeyIds = new Set(effectiveTracks.flatMap(track => track.keyframes.map(key => key.id)))
  const existingConflict = findShowInstancePropertyTrackConflictsV2(effectiveTracks)[0]
  if (existingConflict) {
    return {
      status: 'refused', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets: [],
      message: `Instance animation tracks "${existingConflict.trackIds[0]}" and "${existingConflict.trackIds[1]}" overlap for the same effective target.`,
    }
  }
  const retainedSources: ShowPropertyTrackV2[] = []
  for (const source of effectiveTracks) {
    if (!('instanceId' in source.target) || source.target.instanceId !== fromInstanceId) continue
    if (source.target.kind === 'instance-control' && compatible && !compatible.has(source.target.exportName)) {
      discardedTargets.push(structuredClone(source.target))
      continue
    }
    retainedSources.push(source)
  }
  const plannedSourceIds = Object.keys(intent.identitiesBySourceTrackId).sort()
  const retainedSourceIds = retainedSources.map(track => track.id).sort()
  if (new Set(retainedSourceIds).size !== retainedSourceIds.length
    || JSON.stringify(plannedSourceIds) !== JSON.stringify(retainedSourceIds)) {
    return {
      status: 'refused', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets: [],
      message: 'Track copying requires an exact identity plan for every retained effective source track.',
    }
  }
  for (const source of retainedSources) {
    if (source.target.kind !== 'instance-time-scale' && source.target.kind !== 'instance-control') {
      return {
        status: 'refused', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets: [],
        message: `Effective source track "${source.id}" is not instance-owned.`,
      }
    }
    const identity = intent.identitiesBySourceTrackId[source.id]
    const plannedKeySourceIds = Object.keys(identity?.keyframeIdsBySourceId ?? {}).sort()
    const sourceIds = source.keyframes.map(key => key.id).sort()
    const plannedKeyIds = source.keyframes.map(key => identity?.keyframeIdsBySourceId[key.id] ?? '')
    if (!identity?.trackId.trim()
      || usedTrackIds.has(identity.trackId)
      || JSON.stringify(plannedKeySourceIds) !== JSON.stringify(sourceIds)
      || plannedKeyIds.some(id => !id.trim() || usedKeyIds.has(id))
      || new Set(plannedKeyIds).size !== plannedKeyIds.length) {
      return { status: 'refused', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets: [], message: `Copied track "${source.id}" requires complete fresh caller-supplied track and keyframe identities.` }
    }
    const id = identity.trackId
    usedTrackIds.add(id)
    plannedKeyIds.forEach(keyId => usedKeyIds.add(keyId))
    const copy: ShowPropertyTrackV2 = {
      ...structuredClone(source),
      id,
      target: { ...structuredClone(source.target), instanceId: toInstanceId },
      activeStartMs: source.activeStartMs + placementDeltaMs,
      keyframes: source.keyframes.map(key => ({
        ...structuredClone(key),
        id: identity.keyframeIdsBySourceId[key.id],
        timeMs: key.timeMs + placementDeltaMs,
      })),
    }
    if (copy.activeStartMs < 0 || copy.activeStartMs + copy.activeDurationMs > record.composition.showEndMs
      || copy.keyframes.some(key => !Number.isSafeInteger(key.timeMs) || key.timeMs < 0)) {
      return { status: 'refused', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets: [], message: `Copied track "${source.id}" would leave Show time.` }
    }
    const conflict = [...effectiveTracks, ...copies].find(track => (
      sameShowInstancePropertyTargetV2(track.target, copy.target) && propertyTrackIntervalsOverlap(track, copy)
    ))
    if (conflict) {
      return { status: 'refused', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets: [], message: `Copied track "${source.id}" conflicts with "${conflict.id}" on the destination instance.` }
    }
    copies.push(copy)
    copiedTrackIds.push(id)
  }
  return copies.length === 0
    ? { status: 'unchanged', propertyTracks: record.composition.propertyTracks, copiedTrackIds: [], discardedTargets }
    : { status: 'changed', propertyTracks: [...structuredClone(record.composition.propertyTracks), ...copies], copiedTrackIds, discardedTargets }
}

/**
 * Detach Property ramps from one visual Transition while preserving their
 * authored values, timing and activation as independent tracks.
 */
export function projectShowTransitionPropertyRampsV2(
  record: ShowRecordV2,
  transitionId: string,
  projections: readonly ShowTransitionRampProjectionV2[],
): ShowTransitionRampProjectionResultV2 {
  const transitionIndex = record.composition.transitions.findIndex(candidate => candidate.id === transitionId)
  if (transitionIndex < 0) return { status: 'refused', record, affectedTrackIds: [], message: `Transition "${transitionId}" does not exist.` }
  const transition = record.composition.transitions[transitionIndex]
  if (transition.propertyRamps.length === 0) return { status: 'unchanged', record, affectedTrackIds: [] }
  if (projections.length !== transition.propertyRamps.length
    || projections.some(item => !Number.isSafeInteger(item.rampIndex) || item.rampIndex < 0 || item.rampIndex >= transition.propertyRamps.length)
    || new Set(projections.map(item => item.rampIndex)).size !== projections.length
    || new Set(projections.flatMap(item => [item.trackId, item.startKeyId, item.endKeyId])).size !== projections.length * 3) {
    return { status: 'refused', record, affectedTrackIds: [], message: 'Every Property ramp requires one projection with fresh identities.' }
  }
  const existingIds = new Set([
    ...record.composition.propertyTracks.map(track => track.id),
    ...record.composition.propertyTracks.flatMap(track => track.keyframes.map(key => key.id)),
  ])
  const tracks: ShowPropertyTrackV2[] = []
  for (const projection of projections) {
    const ramp = transition.propertyRamps[projection.rampIndex]
    if (!ramp || existingIds.has(projection.trackId) || existingIds.has(projection.startKeyId)
      || existingIds.has(projection.endKeyId) || !Number.isFinite(projection.toValue)) {
      return { status: 'refused', record, affectedTrackIds: [], message: 'Property ramp projection identities and values must be fresh and finite.' }
    }
    const participant = ramp.participantId
      ? transition.participants.find(candidate => candidate.id === ramp.participantId)
      : transition.participants.length === 1 ? transition.participants[0] : undefined
    const fromClip = participant
      ? record.composition.clips.find(candidate => candidate.id === participant.fromClipId)
      : undefined
    const startMs = transition.wholeOutput?.startMs ?? (fromClip ? fromClip.startMs + fromClip.durationMs : undefined)
    const durationMs = ramp.durationMs ?? transition.durationMs
    if (startMs === undefined || !Number.isSafeInteger(startMs) || !Number.isSafeInteger(durationMs) || durationMs <= 0) {
      return { status: 'refused', record, affectedTrackIds: [], message: `Property ramp ${projection.rampIndex} has no valid contribution and activation interval.` }
    }
    const endMs = startMs + durationMs
    if (projection.activeEndMs < endMs
      || !Number.isSafeInteger(projection.activeEndMs) || projection.activeEndMs > record.composition.showEndMs) {
      return { status: 'refused', record, affectedTrackIds: [], message: `Property ramp ${projection.rampIndex} has no valid contribution and activation interval.` }
    }
    if (ramp.target.kind === 'show-repeat-scale' && !repeatScaleSourceIsInRangeV2(ramp.from, projection.toValue, ramp.easing ?? transition.easing ?? { curve: 'linear' })) {
      return { status: 'refused', record, affectedTrackIds: [], message: 'Projected repeat-scale source curve must stay within 1–8.' }
    }
    const candidate: ShowPropertyTrackV2 = {
      id: projection.trackId,
      target: structuredClone(ramp.target),
      activeStartMs: startMs,
      activeDurationMs: projection.activeEndMs - startMs,
      keyframes: [
        { id: projection.startKeyId, timeMs: startMs, value: ramp.from, easing: structuredClone(ramp.easing ?? transition.easing ?? { curve: 'linear' }) },
        { id: projection.endKeyId, timeMs: endMs, value: projection.toValue, easing: { curve: 'linear' } },
      ],
    }
    const conflict = [...record.composition.propertyTracks, ...tracks].find(track => (
      sameTarget(track.target, candidate.target) && propertyTrackIntervalsOverlap(track, candidate)
    ))
    if (conflict) return { status: 'refused', record, affectedTrackIds: [], message: `Projected track "${candidate.id}" conflicts with active owner "${conflict.id}".` }
    tracks.push(candidate)
  }
  const next = structuredClone(record)
  next.composition.transitions[transitionIndex].propertyRamps = []
  next.composition.propertyTracks.push(...tracks)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return { status: 'refused', record, affectedTrackIds: [], message: `${issue.path}: ${issue.message}` }
  return { status: 'changed', record: next, affectedTrackIds: tracks.map(track => track.id) }
}

function sameTarget(left: ShowPropertyTrackV2['target'], right: ShowPropertyTrackV2['target']): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}


function extendTrack(
  record: ShowRecordV2,
  source: ShowPropertyTrackV2,
  oldStartMs: number,
  oldEndMs: number,
  newStartMs: number,
  newEndMs: number,
): ShowPropertyTrackV2 {
  const result = structuredClone(source)
  const sourceEndMs = source.activeStartMs + source.activeDurationMs
  const keys = [...source.keyframes].sort(compareKeys)
  if (newStartMs < oldStartMs && source.activeStartMs === oldStartMs) {
    result.activeStartMs = newStartMs
    result.activeDurationMs += oldStartMs - newStartMs
    result.keyframes.unshift({
      id: freshKeyId(record, source, `${source.id}:boundary:${newStartMs}`, new Set(result.keyframes.map(key => key.id))),
      timeMs: newStartMs,
      value: evaluateShowPropertyKeysV2(keys, oldStartMs),
      easing: { curve: 'linear' },
    })
  }
  if (newEndMs > oldEndMs && sourceEndMs === oldEndMs) {
    result.activeDurationMs += newEndMs - oldEndMs
    result.keyframes.push({
      id: freshKeyId(record, source, `${source.id}:boundary:${newEndMs}`, new Set(result.keyframes.map(key => key.id))),
      timeMs: newEndMs,
      value: evaluateShowPropertyKeysV2(keys, oldEndMs),
      easing: { curve: 'linear' },
    })
  }
  result.keyframes.sort(compareKeys)
  return result
}

function freshKeyId(
  record: ShowRecordV2,
  source: ShowPropertyTrackV2,
  base: string,
  local: Set<string>,
): string {
  const used = new Set(record.composition.propertyTracks.flatMap(track => (
    track === source ? [] : track.keyframes.map(key => key.id)
  )))
  for (const id of local) used.add(id)
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}:${suffix}`)) suffix += 1
  return `${base}:${suffix}`
}

function freshTrackId(record: ShowRecordV2, base: string): string {
  const used = new Set(record.composition.propertyTracks.map(track => track.id))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}:${suffix}`)) suffix += 1
  return `${base}:${suffix}`
}

function retargetClip(
  target: ShowPropertyTrackV2['target'],
  clipId: string,
): ShowPropertyTrackV2['target'] {
  return 'clipId' in target ? { ...target, clipId } : structuredClone(target)
}

function compareKeys(left: ShowPropertyKeyframeV2, right: ShowPropertyKeyframeV2): number {
  return left.timeMs - right.timeMs || left.id.localeCompare(right.id)
}

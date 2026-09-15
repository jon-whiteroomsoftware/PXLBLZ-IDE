import { applyShowEasing } from './showEasing'
import { validateShowRecordV2, type ShowClipV2, type ShowPropertyKeyframeV2, type ShowPropertyTrackV2, type ShowRecordV2 } from './showCompositionV2'
import { effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from './showGroupsV2'
import { propertyTrackIntervalsOverlap, sameShowInstancePropertyTargetV2 } from './showPropertyTrackConflictsV2'

export { findNewShowInstancePropertyTrackConflictV2, findShowInstancePropertyTrackConflictsV2 } from './showPropertyTrackConflictsV2'

export type ShowClipPropertyTrackEditV2 =
  | { kind: 'move'; startMs: number }
  | { kind: 'trim' | 'extend'; startMs: number; endMs: number }
  | { kind: 'split'; atMs: number; rightClipId: string }

export interface ShowClipPropertyTrackEditResultV2 {
  propertyTracks: ShowPropertyTrackV2[]
  affectedTrackIds: string[]
}

export type ShowInsertPropertyTimeResultV2 =
  | { status: 'changed'; propertyTracks: ShowPropertyTrackV2[]; affectedTrackIds: string[] }
  | { status: 'unchanged'; propertyTracks: ShowPropertyTrackV2[]; affectedTrackIds: [] }
  | { status: 'refused'; propertyTracks: ShowPropertyTrackV2[]; affectedTrackIds: []; message: string }

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

export function evaluateShowPropertyKeysV2(
  source: readonly ShowPropertyKeyframeV2[],
  atMs: number,
): number {
  const keys = [...source].sort(compareKeys)
  if (keys.length === 0) return 0
  if (atMs <= keys[0].timeMs) return keys[0].value
  const last = keys[keys.length - 1]
  if (atMs >= last.timeMs) return last.value
  const rightIndex = keys.findIndex(key => key.timeMs > atMs)
  const left = keys[rightIndex - 1]
  const right = keys[rightIndex]
  if (left.curveSegment) {
    const segment = left.curveSegment
    const progress = (segment.elapsedOffsetMs + atMs - left.timeMs) / segment.sourceDurationMs
    return segment.baseValue + segment.deltaValue * applyShowEasing(segment.easing, progress)
  }
  const progress = (atMs - left.timeMs) / (right.timeMs - left.timeMs)
  return left.value + (right.value - left.value) * applyShowEasing(left.easing, progress)
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
      const restricted = restrictTrack(record, source, intent.startMs, intent.endMs)
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
    const splitMs = intent.atMs
    const oldEndMs = clip.startMs + clip.durationMs
    const left = restrictTrack(record, source, clip.startMs, splitMs)
    const right = restrictTrack(record, source, splitMs, oldEndMs)
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
  if (!Number.isSafeInteger(atMs) || !Number.isSafeInteger(durationMs)
    || atMs < 0 || atMs > record.composition.showEndMs || durationMs <= 0
    || !Number.isSafeInteger(record.composition.showEndMs + durationMs)) {
    return { status: 'refused', propertyTracks: record.composition.propertyTracks, affectedTrackIds: [], message: 'Insert Time requires safe integer milliseconds inside Show time.' }
  }
  const affectedTrackIds: string[] = []
  const propertyTracks = record.composition.propertyTracks.map(source => {
    const activeEndMs = source.activeStartMs + source.activeDurationMs
    if (activeEndMs <= atMs) return structuredClone(source)
    affectedTrackIds.push(source.id)
    if (source.activeStartMs >= atMs) return {
      ...structuredClone(source),
      activeStartMs: source.activeStartMs + durationMs,
      keyframes: source.keyframes.map(key => ({ ...structuredClone(key), timeMs: key.timeMs + durationMs })),
    }
    return insertTrackHold(record, source, atMs, durationMs)
  })
  return affectedTrackIds.length === 0
    ? { status: 'unchanged', propertyTracks: record.composition.propertyTracks, affectedTrackIds: [] }
    : { status: 'changed', propertyTracks, affectedTrackIds }
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
  for (const source of record.composition.propertyTracks) {
    if (!('instanceId' in source.target) || source.target.instanceId !== fromInstanceId) continue
    if (source.target.kind === 'instance-control' && compatible && !compatible.has(source.target.exportName)) {
      discardedTargets.push(structuredClone(source.target))
      continue
    }
    const identity = intent.identitiesBySourceTrackId[source.id]
    const plannedSourceIds = Object.keys(identity?.keyframeIdsBySourceId ?? {}).sort()
    const sourceIds = source.keyframes.map(key => key.id).sort()
    const plannedKeyIds = source.keyframes.map(key => identity?.keyframeIdsBySourceId[key.id] ?? '')
    if (!identity?.trackId.trim()
      || usedTrackIds.has(identity.trackId)
      || JSON.stringify(plannedSourceIds) !== JSON.stringify(sourceIds)
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

function insertTrackHold(
  record: ShowRecordV2,
  source: ShowPropertyTrackV2,
  atMs: number,
  durationMs: number,
): ShowPropertyTrackV2 {
  const keys = [...source.keyframes].sort(compareKeys)
  const exact = keys.find(key => key.timeMs === atMs)
  const value = evaluateShowPropertyKeysV2(keys, atMs)
  const localIds = new Set(keys.map(key => key.id))
  const shifted = keys.map(key => key.timeMs >= atMs
    ? { ...structuredClone(key), timeMs: key.timeMs + durationMs }
    : structuredClone(key))
  if (exact) {
    const holdId = freshKeyId(record, source, `${source.id}:hold:${atMs}`, localIds)
    shifted.push({ id: holdId, timeMs: atMs, value, easing: { curve: 'linear' } })
  } else {
    const left = [...keys].reverse().find(key => key.timeMs < atMs)
    const right = keys.find(key => key.timeMs > atMs)
    if (left && right) {
      const retainedLeft = shifted.find(key => key.id === left.id)!
      if (!retainedLeft.curveSegment) retainedLeft.curveSegment = retainedSegment(left, right, left.timeMs)
      const holdId = freshKeyId(record, source, `${source.id}:hold:${atMs}`, localIds)
      localIds.add(holdId)
      const resumeId = freshKeyId(record, source, `${source.id}:resume:${atMs + durationMs}`, localIds)
      shifted.push(
        { id: holdId, timeMs: atMs, value, easing: { curve: 'linear' } },
        {
          id: resumeId, timeMs: atMs + durationMs, value, easing: structuredClone(left.easing),
          curveSegment: retainedSegment(left, right, atMs),
        },
      )
    }
  }
  return {
    ...structuredClone(source),
    activeDurationMs: source.activeDurationMs + durationMs,
    keyframes: shifted.sort(compareKeys),
  }
}

function restrictTrack(
  record: ShowRecordV2,
  source: ShowPropertyTrackV2,
  requestedStartMs: number,
  requestedEndMs: number,
): ShowPropertyTrackV2 | undefined {
  const activeEndMs = source.activeStartMs + source.activeDurationMs
  const startMs = Math.max(source.activeStartMs, requestedStartMs)
  const endMs = Math.min(activeEndMs, requestedEndMs)
  if (endMs <= startMs) return undefined
  if (startMs === source.activeStartMs && endMs === activeEndMs) return source
  return {
    ...structuredClone(source),
    activeStartMs: startMs,
    activeDurationMs: endMs - startMs,
    keyframes: retainedKeys(record, source, startMs, endMs),
  }
}

function retainedKeys(
  record: ShowRecordV2,
  source: ShowPropertyTrackV2,
  startMs: number,
  endMs: number,
): ShowPropertyKeyframeV2[] {
  const keys = [...source.keyframes].sort(compareKeys)
  const result: ShowPropertyKeyframeV2[] = []
  const exactStart = keys.find(key => key.timeMs === startMs)
  if (exactStart) result.push(structuredClone(exactStart))
  else {
    const left = [...keys].reverse().find(key => key.timeMs < startMs)
    const right = keys.find(key => key.timeMs > startMs)
    const seed = structuredClone(left ?? keys[0])
    seed.timeMs = startMs
    seed.value = evaluateShowPropertyKeysV2(keys, startMs)
    if (left && right) seed.curveSegment = retainedSegment(left, right, startMs)
    else delete seed.curveSegment
    result.push(seed)
  }
  result.push(...keys.filter(key => key.timeMs > startMs && key.timeMs < endMs).map(key => structuredClone(key)))
  const exactEnd = keys.find(key => key.timeMs === endMs)
  const sourceLeftAtEnd = [...keys].reverse().find(key => key.timeMs < endMs)
  const sourceRightAtEnd = exactEnd ?? keys.find(key => key.timeMs > endMs)
  if (sourceLeftAtEnd && sourceRightAtEnd) {
    const retainedLeft = [...result].reverse().find(key => key.timeMs === sourceLeftAtEnd.timeMs)
      ?? result[result.length - 1]
    if (!retainedLeft.curveSegment) {
      retainedLeft.curveSegment = retainedSegment(sourceLeftAtEnd, sourceRightAtEnd, retainedLeft.timeMs)
    }
  }
  const end = exactEnd ? structuredClone(exactEnd) : {
    ...structuredClone([...keys].reverse().find(key => key.timeMs < endMs) ?? keys[0]),
    id: freshKeyId(record, source, `${source.id}:boundary:${endMs}`, new Set(result.map(key => key.id))),
    timeMs: endMs,
    value: evaluateShowPropertyKeysV2(keys, endMs),
  }
  delete end.curveSegment
  if (!result.some(key => key.timeMs === endMs)) result.push(end)
  return result.sort(compareKeys)
}

function retainedSegment(
  left: ShowPropertyKeyframeV2,
  right: ShowPropertyKeyframeV2,
  startMs: number,
) {
  if (left.curveSegment) return {
    ...structuredClone(left.curveSegment),
    elapsedOffsetMs: left.curveSegment.elapsedOffsetMs + startMs - left.timeMs,
  }
  return {
    baseValue: left.value,
    deltaValue: right.value - left.value,
    easing: structuredClone(left.easing),
    sourceDurationMs: right.timeMs - left.timeMs,
    elapsedOffsetMs: startMs - left.timeMs,
  }
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

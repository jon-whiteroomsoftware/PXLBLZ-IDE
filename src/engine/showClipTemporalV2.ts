import { validateShowRecordV2, type ShowClipV2, type ShowRecordV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { editShowClipPropertyTracksV2, projectShowTransitionPropertyRampsV2, type ShowTransitionRampProjectionV2 } from './showPropertyAnimationV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'
import { applyShowTransitionClipShiftV2, connectedComponent, downstreamClosure, transitionEndpoints } from './showTransitionsV2'
import type { ShowTimelineEditAffectedV2 } from './showTimelineV2'

export type ShowClipTemporalIntentV2 =
  | { kind: 'move'; clipId: string; startMs: number }
  | { kind: 'trim' | 'extend'; clipId: string; startMs: number; endMs: number; propertyRampProjections?: readonly ShowTransitionRampProjectionV2[] }
  | { kind: 'split'; clipId: string; atMs: number; rightClipId: string }
export type ShowClipTemporalRefusalV2 = 'invalid-record' | 'missing-clip' | 'invalid-intent' | 'invalid-topology' | 'unsupported-property-carrier' | 'compiler-ineligible' | 'invalid-result'
export type ShowClipTemporalResultV2 = (
  | { status: 'changed' | 'unchanged'; record: ShowRecordV2 }
  | { status: 'refused'; record: ShowRecordV2; code: ShowClipTemporalRefusalV2; message: string }
) & ShowTimelineEditAffectedV2

function emptyAffected(): ShowTimelineEditAffectedV2 {
  return { affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], removedIds: [], discardedControlTargets: [] }
}
function retainedAppearance(clip: ShowClipV2, startMs: number, endMs: number): ShowClipV2['appearance']['keys'] {
  const held = [...clip.appearance.keys].reverse().find(key => key.timeMs <= startMs) ?? clip.appearance.keys[0]
  return [{ ...structuredClone(held), timeMs: startMs }, ...structuredClone(clip.appearance.keys.filter(key => key !== held && key.timeMs > startMs && key.timeMs < endMs))]
}

function validIntent(intent: unknown): intent is ShowClipTemporalIntentV2 {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const raw = intent as Record<string, unknown>
  const fields = raw.kind === 'move' ? ['kind', 'clipId', 'startMs'] : raw.kind === 'trim' || raw.kind === 'extend' ? ['kind', 'clipId', 'startMs', 'endMs'] : raw.kind === 'split' ? ['kind', 'clipId', 'atMs', 'rightClipId'] : []
  const optional = raw.kind === 'trim' || raw.kind === 'extend' ? ['propertyRampProjections'] : []
  return fields.length > 0 && Object.keys(raw).every(field => fields.includes(field) || optional.includes(field)) && fields.every(field => Object.prototype.hasOwnProperty.call(raw, field)) && typeof raw.clipId === 'string' && raw.clipId.trim().length > 0
}
function validProjections(value: unknown): value is readonly ShowTransitionRampProjectionV2[] {
  if (!Array.isArray(value)) return false
  const fields = ['rampIndex', 'trackId', 'startKeyId', 'endKeyId', 'activeEndMs', 'toValue']
  return value.every(item => item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === fields.length && fields.every(field => Object.prototype.hasOwnProperty.call(item, field)) && [item.trackId, item.startKeyId, item.endKeyId].every(id => typeof id === 'string' && id.trim().length > 0))
}
function replaceOwnedTracks(next: ShowRecordV2, propertyTracks: ShowRecordV2['composition']['propertyTracks'], ids: readonly string[], deltaMs = 0): void {
  const affected = new Set(ids)
  const replacements = propertyTracks.filter(track => affected.has(track.id)).map(track => {
    const copy = structuredClone(track)
    copy.activeStartMs += deltaMs
    copy.keyframes.forEach(key => { key.timeMs += deltaMs })
    return copy
  })
  next.composition.propertyTracks = next.composition.propertyTracks.flatMap(track => affected.has(track.id) ? replacements.filter(candidate => candidate.id === track.id) : [track])
}

/** One pure temporal transaction. Dispatch, adoption, history and persistence stay caller-owned. */
export function editShowClipTemporalV2(record: ShowRecordV2, intent: ShowClipTemporalIntentV2): ShowClipTemporalResultV2 {
  const refuse = (code: ShowClipTemporalRefusalV2, message: string): ShowClipTemporalResultV2 => ({ status: 'refused', record, code, message, ...emptyAffected() })
  if (!validIntent(intent)) return refuse('invalid-intent', 'Temporal intent must use the exact operation fields and an explicit Clip identity.')
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  const unavailable = validateShowLayoutAvailabilityV2(record)[0]
  if (unavailable) return refuse('invalid-record', `Zone is unavailable for "${unavailable.entityId}".`)
  const clip = record.composition.clips.find(candidate => candidate.id === intent.clipId)
  if (!clip) return refuse('missing-clip', `Clip "${intent.clipId}" does not exist.`)
  const effective = materializeShowGroupsV2(record)
  const oldEndMs = clip.startMs + clip.durationMs
  const startMs = intent.kind === 'split' ? clip.startMs : intent.startMs
  const endMs = intent.kind === 'split' ? intent.atMs : intent.kind === 'move' ? startMs + clip.durationMs : intent.endMs
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs || endMs > record.composition.showEndMs) return refuse('invalid-intent', 'Clip interval must use safe integer milliseconds within Show End.')
  if (intent.kind === 'trim' && (startMs < clip.startMs || endMs > oldEndMs)) return refuse('invalid-intent', 'Trim must stay inside the current Clip.')
  if (intent.kind === 'extend' && (startMs > clip.startMs || endMs < oldEndMs)) return refuse('invalid-intent', 'Extension must contain the current Clip.')
  if (intent.kind === 'split' && (endMs >= oldEndMs || typeof intent.rightClipId !== 'string' || !intent.rightClipId.trim() || effective.composition.clips.some(candidate => candidate.id === intent.rightClipId))) return refuse('invalid-intent', 'Split requires an interior time and a fresh effective Clip identity.')
  if (startMs === clip.startMs && endMs === oldEndMs && (intent.kind === 'trim' || intent.kind === 'extend') && Object.prototype.hasOwnProperty.call(intent, 'propertyRampProjections')) return refuse('invalid-intent', 'An unchanged interval cannot consume Property ramp projections.')
  if (startMs === clip.startMs && endMs === oldEndMs) return { status: 'unchanged', record, ...emptyAffected() }
  const projectionTracks: ShowRecordV2['composition']['propertyTracks'] = []
  let usedProjectionPlan = false
  const next = structuredClone(record)
  if (intent.kind === 'move') {
    applyShowTransitionClipShiftV2(record, next, connectedComponent(record, [clip.id]), startMs - clip.startMs)
  } else if (intent.kind === 'split') {
    const authoredTrackIds = new Set(record.composition.propertyTracks.map(track => track.id))
    // Reserve projected identities, then retain only authored owners and the new
    // right Clip pieces. Group projection remains an immutable validation input.
    next.composition.propertyTracks = editShowClipPropertyTracksV2(effective, clip, intent).propertyTracks.filter(track => authoredTrackIds.has(track.id) || ('clipId' in track.target && track.target.clipId === intent.rightClipId))
    const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
    edited.durationMs = intent.atMs - clip.startMs
    edited.appearance.keys = retainedAppearance(clip, clip.startMs, intent.atMs)
    next.composition.clips.splice(next.composition.clips.indexOf(edited) + 1, 0, {
      ...structuredClone(clip), id: intent.rightClipId, startMs: intent.atMs, durationMs: oldEndMs - intent.atMs, entryPolicy: 'continue', appearance: { keys: retainedAppearance(clip, intent.atMs, oldEndMs) },
    })
    for (const transition of next.composition.transitions) {
      if (transition.wholeOutput) transition.wholeOutput.fromClipIds = transition.wholeOutput.fromClipIds.map(id => id === clip.id ? intent.rightClipId : id)
      const outgoingOwnsClip = transitionEndpoints(record.composition.transitions.find(source => source.id === transition.id)!).from.includes(clip.id)
      for (const participant of transition.participants) if (participant.fromClipId === clip.id) participant.fromClipId = intent.rightClipId
      if (outgoingOwnsClip) for (const ramp of transition.propertyRamps) if ('clipId' in ramp.target && ramp.target.clipId === clip.id) ramp.target.clipId = intent.rightClipId
    }
  } else {
    let resetDeltaMs = 0
    const leadingDeltaMs = startMs - clip.startMs
    const trailingDeltaMs = endMs - oldEndMs
    const incoming = record.composition.transitions.filter(transition => transitionEndpoints(transition).to.includes(clip.id))
    const outgoing = record.composition.transitions.filter(transition => transitionEndpoints(transition).from.includes(clip.id))
    if (leadingDeltaMs && incoming.length > 0) {
      if (incoming.length !== 1 || transitionEndpoints(incoming[0]).to.length !== 1) return refuse('invalid-topology', 'Leading resize cannot split a common Transition window.')
      const durationMs = incoming[0].durationMs + leadingDeltaMs
      if (durationMs < 0) return refuse('invalid-intent', 'Leading resize cannot create a negative Transition duration.')
      if (durationMs === 0) {
        if (incoming[0].propertyRamps.length) {
          if (!intent.propertyRampProjections || !validProjections(intent.propertyRampProjections)) return refuse('unsupported-property-carrier', 'Reset requires explicit complete Property ramp projections before removing its carrier.')
          const usedIds = new Set(effective.composition.propertyTracks.flatMap(track => [track.id, ...track.keyframes.map(key => key.id)]))
          if (intent.propertyRampProjections.some(plan => [plan.trackId, plan.startKeyId, plan.endKeyId].some(id => usedIds.has(id)))) return refuse('unsupported-property-carrier', 'Property projection identities must be fresh against effective Group and ordinary owners.')
          const projected = projectShowTransitionPropertyRampsV2(record, incoming[0].id, intent.propertyRampProjections)
          if (projected.status !== 'changed') return refuse('unsupported-property-carrier', projected.status === 'refused' ? projected.message : 'Reset did not project its Property ramps.')
          projectionTracks.push(...projected.record.composition.propertyTracks.filter(track => projected.affectedTrackIds.includes(track.id)))
          usedProjectionPlan = true
        }
        const endpoints = transitionEndpoints(incoming[0])
        const successors = downstreamClosure(record, endpoints.to)
        if (endpoints.from.some(id => successors.includes(id))) return refuse('invalid-topology', 'Transition topology contains a directed cycle.')
        resetDeltaMs = -incoming[0].durationMs
        applyShowTransitionClipShiftV2(record, next, successors, resetDeltaMs, [incoming[0].id])
        next.composition.transitions = next.composition.transitions.filter(transition => transition.id !== incoming[0].id)
      } else next.composition.transitions.find(transition => transition.id === incoming[0].id)!.durationMs = durationMs
    }
    if (trailingDeltaMs && outgoing.length > 0) {
      if (outgoing.length !== 1 || transitionEndpoints(outgoing[0]).from.length !== 1) return refuse('invalid-topology', 'Trailing resize cannot split a common Transition window.')
      const successors = downstreamClosure(record, transitionEndpoints(outgoing[0]).to)
      if (successors.includes(clip.id)) return refuse('invalid-topology', 'Transition topology contains a directed cycle.')
      applyShowTransitionClipShiftV2(record, next, successors, trailingDeltaMs, [outgoing[0].id])
      const boundary = next.composition.transitions.find(transition => transition.id === outgoing[0].id)!
      if (boundary.wholeOutput) boundary.wholeOutput.startMs += trailingDeltaMs
    }
    const retainedStartMs = resetDeltaMs ? clip.startMs : startMs
    const trackEdit = editShowClipPropertyTracksV2(record, clip, { ...intent, startMs: retainedStartMs, endMs })
    // All selected and successor mappings use the same preimage, never an intermediate commit.
    replaceOwnedTracks(next, trackEdit.propertyTracks, trackEdit.affectedTrackIds, resetDeltaMs)
    const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
    edited.startMs = retainedStartMs + resetDeltaMs
    edited.durationMs = endMs - retainedStartMs
    edited.appearance.keys = retainedAppearance(clip, retainedStartMs, endMs)
    edited.appearance.keys.forEach(key => { key.timeMs += resetDeltaMs })
  }
  if ((intent.kind === 'trim' || intent.kind === 'extend') && Object.prototype.hasOwnProperty.call(intent, 'propertyRampProjections') && !usedProjectionPlan) return refuse('invalid-intent', 'Property ramp projections apply only to a leading zero-duration Reset with existing ramps.')
  // Projected boundary animation retains its preimage global times through Reset and ripple.
  next.composition.propertyTracks.push(...projectionTracks)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refuse('invalid-result', `${issue.path}: ${issue.message}`)
  const availability = validateShowLayoutAvailabilityV2(next)[0]
  if (availability) return refuse('invalid-result', `Zone is unavailable for "${availability.entityId}".`)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse('compiler-ineligible', restriction.message)
  const affected = emptyAffected()
  for (const candidate of next.composition.clips) {
    const prior = record.composition.clips.find(source => source.id === candidate.id)
    if (JSON.stringify(candidate) === JSON.stringify(prior)) continue
    affected.affectedClipIds.push(candidate.id)
    for (const key of candidate.appearance.keys) if (JSON.stringify(key) !== JSON.stringify(prior?.appearance.keys.find(source => source.id === key.id))) affected.affectedAppearanceKeyIds.push(key.id)
    for (const key of prior?.appearance.keys ?? []) if (!candidate.appearance.keys.some(source => source.id === key.id)) { affected.affectedAppearanceKeyIds.push(key.id); affected.removedIds.push(key.id) }
  }
  for (const candidate of next.composition.transitions) {
    if (JSON.stringify(candidate) !== JSON.stringify(record.composition.transitions.find(source => source.id === candidate.id))) affected.affectedTransitionIds.push(candidate.id)
  }
  for (const prior of record.composition.transitions) if (!next.composition.transitions.some(transition => transition.id === prior.id)) { affected.affectedTransitionIds.push(prior.id); affected.removedIds.push(prior.id) }
  // Implicit participant window timing follows changed Clip endpoints without changing its record.
  for (const transition of record.composition.transitions) if (transitionEndpoints(transition).all.some(id => affected.affectedClipIds.includes(id)) && !affected.affectedTransitionIds.includes(transition.id)) affected.affectedTransitionIds.push(transition.id)
  for (const prior of record.composition.propertyTracks) {
    const candidate = next.composition.propertyTracks.find(track => track.id === prior.id)
    if (JSON.stringify(candidate) === JSON.stringify(prior)) continue
    affected.affectedTrackIds.push(prior.id)
    if (!candidate) affected.removedIds.push(prior.id)
    for (const key of candidate?.keyframes ?? []) if (JSON.stringify(key) !== JSON.stringify(prior.keyframes.find(source => source.id === key.id))) affected.affectedPropertyKeyIds.push(key.id)
    for (const key of prior.keyframes) if (!candidate?.keyframes.some(source => source.id === key.id)) { affected.affectedPropertyKeyIds.push(key.id); affected.removedIds.push(key.id) }
  }
  for (const candidate of next.composition.propertyTracks) if (!record.composition.propertyTracks.some(track => track.id === candidate.id)) {
    affected.affectedTrackIds.push(candidate.id)
    affected.affectedPropertyKeyIds.push(...candidate.keyframes.map(key => key.id))
  }
  for (const ids of [affected.affectedClipIds, affected.affectedTransitionIds, affected.affectedTrackIds, affected.affectedAppearanceKeyIds, affected.affectedPropertyKeyIds, affected.removedIds]) ids.sort()
  return { status: 'changed', record: next, ...affected }
}

import { validateShowRecordV2, type ShowClipV2, type ShowRecordV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { editShowClipPropertyTracksV2, projectShowTransitionPropertyRampsV2, type ShowTransitionRampProjectionV2 } from './showPropertyAnimationV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'
import { applyShowTransitionClipShiftV2, commitConvertedBoundaryRepairsV2, connectedComponent, convertedBoundaryRepairSpecV2, downstreamClosure, transitionEndpoints, type ConvertedBoundaryRepairV2 } from './showTransitionsV2'
import type { ShowTimelineEditAffectedV2 } from './showTimelineV2'

export type ShowClipTemporalIntentV2 =
  | { kind: 'move'; clipId: string; startMs: number }
  /** Re-placement: the Clip's own Zone/Layer destination, optionally with a new start. */
  | { kind: 'replace-placement'; clipId: string; zoneId?: string; layerId?: string; startMs?: number; detachParticipantTransitions?: boolean }
  | { kind: 'trim' | 'extend'; clipId: string; startMs: number; endMs: number; propertyRampProjections?: readonly ShowTransitionRampProjectionV2[] }
  | { kind: 'split'; clipId: string; atMs: number; rightClipId: string }
export type ShowClipTemporalRefusalV2 = 'invalid-record' | 'missing-clip' | 'missing-target' | 'invalid-intent' | 'invalid-topology' | 'zone-unavailable' | 'unsupported-property-carrier' | 'compiler-ineligible' | 'invalid-result'
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
  if (typeof raw.clipId !== 'string' || raw.clipId.trim().length === 0) return false
  if (raw.kind === 'replace-placement') return validPlacementIntent(raw)
  const fields = raw.kind === 'move' ? ['kind', 'clipId', 'startMs'] : raw.kind === 'trim' || raw.kind === 'extend' ? ['kind', 'clipId', 'startMs', 'endMs'] : raw.kind === 'split' ? ['kind', 'clipId', 'atMs', 'rightClipId'] : []
  const optional = raw.kind === 'trim' || raw.kind === 'extend' ? ['propertyRampProjections'] : []
  return fields.length > 0 && Object.keys(raw).every(field => fields.includes(field) || optional.includes(field)) && fields.every(field => Object.prototype.hasOwnProperty.call(raw, field))
}
/** Re-placement names at least one destination field, each of the exact shape, and nothing else. */
function validPlacementIntent(raw: Record<string, unknown>): boolean {
  const destinations = ['zoneId', 'layerId', 'startMs']
  const has = (field: string): boolean => Object.prototype.hasOwnProperty.call(raw, field)
  if (!Object.keys(raw).every(field => field === 'kind' || field === 'clipId' || field === 'detachParticipantTransitions' || destinations.includes(field))) return false
  if (!destinations.some(has)) return false
  if (['zoneId', 'layerId'].some(field => has(field) && (typeof raw[field] !== 'string' || (raw[field] as string).trim().length === 0))) return false
  if (has('detachParticipantTransitions') && typeof raw.detachParticipantTransitions !== 'boolean') return false
  return !has('startMs') || (Number.isSafeInteger(raw.startMs) && (raw.startMs as number) >= 0)
}
function validProjections(value: unknown, rampCount: number): value is readonly ShowTransitionRampProjectionV2[] {
  if (!Array.isArray(value)) return false
  const fields = ['rampIndex', 'trackId', 'startKeyId', 'endKeyId', 'activeEndMs', 'toValue']
  return value.every(item => item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === fields.length && fields.every(field => Object.prototype.hasOwnProperty.call(item, field)) && Number.isSafeInteger(item.rampIndex) && item.rampIndex >= 0 && item.rampIndex < rampCount && [item.trackId, item.startKeyId, item.endKeyId].every(id => typeof id === 'string' && id.trim().length > 0))
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
  const destination = intent.kind === 'replace-placement'
    ? { zoneId: intent.zoneId ?? clip.zoneId, layerId: intent.layerId ?? clip.layerId }
    : { zoneId: clip.zoneId, layerId: clip.layerId }
  const reroutes = destination.zoneId !== clip.zoneId || destination.layerId !== clip.layerId
  const startMs = intent.kind === 'split' ? clip.startMs
    : intent.kind === 'replace-placement' ? intent.startMs ?? clip.startMs
      : intent.startMs
  const endMs = intent.kind === 'split' ? intent.atMs
    : intent.kind === 'move' || intent.kind === 'replace-placement' ? startMs + clip.durationMs
      : intent.endMs
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs || endMs > record.composition.showEndMs) return refuse('invalid-intent', 'Clip interval must use safe integer milliseconds within Show End.')
  if (intent.kind === 'trim' && (startMs < clip.startMs || endMs > oldEndMs)) return refuse('invalid-intent', 'Trim must stay inside the current Clip.')
  if (intent.kind === 'extend' && (startMs > clip.startMs || endMs < oldEndMs)) return refuse('invalid-intent', 'Extension must contain the current Clip.')
  if (intent.kind === 'split' && (endMs >= oldEndMs || typeof intent.rightClipId !== 'string' || !intent.rightClipId.trim() || effective.composition.clips.some(candidate => candidate.id === intent.rightClipId))) return refuse('invalid-intent', 'Split requires an interior time and a fresh effective Clip identity.')
  if (startMs === clip.startMs && endMs === oldEndMs && (intent.kind === 'trim' || intent.kind === 'extend') && Object.prototype.hasOwnProperty.call(intent, 'propertyRampProjections')) return refuse('invalid-intent', 'An unchanged interval cannot consume Property ramp projections.')
  if (startMs === clip.startMs && endMs === oldEndMs && !reroutes) return { status: 'unchanged', record, ...emptyAffected() }
  // A cross-Zone or cross-Layer re-placement moves the Clip alone. Detaching
  // the Clip's participant Transitions is a permission the caller grants: the
  // drag surfaces grant it, the agent command does not, and a caller that
  // passes nothing gets the refusal. Without it an attached participant
  // refuses invalid-topology, matching v1's command path; with it a plain
  // participant Transition detaches, a Transition carrying Property ramps is
  // never silently deleted, and a converted Scene boundary (participant or whole-output scope, #1068)
  // reclaims its window through the same cut-and-reclaim commit the
  // resize path uses, or refuses the whole edit when that reclaim is blocked.
  let detachedTransitionIds: string[] = []
  const pendingBoundaryRepairs: ConvertedBoundaryRepairV2[] = []
  if (reroutes) {
    if (!record.zones.some(zone => zone.id === destination.zoneId)) return refuse('missing-target', `Zone "${destination.zoneId}" does not exist.`)
    const layer = record.composition.layers.find(candidate => candidate.id === destination.layerId)
    if (!layer || layer.zoneId !== destination.zoneId) return refuse('missing-target', `Layer "${destination.layerId}" is not a Layer of Zone "${destination.zoneId}".`)
    const attached = record.composition.transitions.filter(transition => (
      transition.participants.some(participant => participant.fromClipId === clip.id || participant.toClipId === clip.id)
      || (transition.wholeOutput !== undefined
        && transitionEndpoints(transition).all.includes(clip.id)
        && convertedBoundaryRepairSpecV2(record, transition.id).status === 'ready')
    ))
    const mayDetach = intent.kind === 'replace-placement' && intent.detachParticipantTransitions === true
    if (attached.length > 0 && !mayDetach) return refuse('invalid-topology', `Clip "${clip.id}" is a participant endpoint of Transition ${attached.map(transition => `"${transition.id}"`).join(', ')}; re-placement never detaches or retargets a Transition unless the caller grants it. Reset those Transitions explicitly first.`)
    const carrier = attached.find(transition => transition.propertyRamps.length > 0)
    if (carrier) return refuse('unsupported-property-carrier', `Transition "${carrier.id}" carries Property ramps. Reset it with an explicit projection plan before moving its participant to another Zone or Layer.`)
    // The blanket carrier check above subsumes the repair spec's ramp-carrier
    // case, so a ready spec here always carries a committable cut-and-reclaim.
    for (const transition of attached) {
      const boundary = convertedBoundaryRepairSpecV2(record, transition.id)
      if (boundary.status === 'ready') pendingBoundaryRepairs.push(boundary.repair)
    }
    detachedTransitionIds = attached.map(transition => transition.id)
  }
  const projectionTracks: ShowRecordV2['composition']['propertyTracks'] = []
  const shortenedLayoutOccurrenceIds: string[] = []
  const shiftedMarkerIds: string[] = []
  const shiftedGroupOccurrenceIds: string[] = []
  let usedProjectionPlan = false
  const next = structuredClone(record)
  if (intent.kind === 'move' || intent.kind === 'replace-placement') {
    // Detached participant bonds release before the shift, so only the dragged
    // Clip moves; surviving whole-output links still bind, as in the already
    // allowed contributor re-placement. Validation below runs post-detach.
    const detached = new Set(detachedTransitionIds)
    const repaired = new Set(pendingBoundaryRepairs.map(repair => repair.transitionId))
    const componentSource: ShowRecordV2 = detached.size > 0
      ? { ...record, composition: { ...record.composition, transitions: record.composition.transitions.filter(transition => !detached.has(transition.id)) } }
      : record
    // Repair-ready boundaries stay present until the commit removes them: the
    // commit requires their presence and refuses atomically when blocked.
    if (detached.size > 0) next.composition.transitions = next.composition.transitions.filter(transition => !detached.has(transition.id) || repaired.has(transition.id))
    applyShowTransitionClipShiftV2(record, next, connectedComponent(componentSource, [clip.id]), startMs - clip.startMs)
    if (reroutes) {
      const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
      edited.zoneId = destination.zoneId
      edited.layerId = destination.layerId
    }
    if (pendingBoundaryRepairs.length > 0) {
      // An explicit startMs names post-repair coordinates — the number the
      // preview paints is the number the timeline must show — so the already
      // placed Clip stays out of the preimage-derived shift set. Without an
      // explicit start the Clip keeps its preimage position and rides the
      // reclaim downstream like any other Clip.
      const committed = commitConvertedBoundaryRepairsV2(record, next, pendingBoundaryRepairs, {
        alreadyRelocatedClipIds: intent.startMs !== undefined ? [clip.id] : [],
      })
      if (committed.status === 'refused') return refuse('invalid-result', committed.message)
      shortenedLayoutOccurrenceIds.push(...committed.applied.shortenedLayoutOccurrenceIds, ...committed.applied.shiftedLayoutOccurrenceIds)
      shiftedMarkerIds.push(...committed.applied.shiftedMarkerIds)
      shiftedGroupOccurrenceIds.push(...committed.applied.shiftedGroupOccurrenceIds)
    }
  } else if (intent.kind === 'split') {
    const authoredTrackIds = new Set(record.composition.propertyTracks.map(track => track.id))
    // Reserve projected identities, then retain only authored owners and the new
    // right Clip pieces. Group projection remains an immutable validation input.
    next.composition.propertyTracks = editShowClipPropertyTracksV2(effective, clip, intent).propertyTracks.filter(track => authoredTrackIds.has(track.id) || ('clipId' in track.target && track.target.clipId === intent.rightClipId))
    const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
    edited.durationMs = intent.atMs - clip.startMs
    edited.appearance.keys = retainedAppearance(clip, clip.startMs, intent.atMs)
    next.composition.clips.splice(next.composition.clips.indexOf(edited) + 1, 0, {
      ...structuredClone(clip), id: intent.rightClipId, startMs: intent.atMs, durationMs: oldEndMs - intent.atMs, entryPolicy: 'continue', appearance: { keys: retainedAppearance(clip, intent.atMs, oldEndMs).map((key, index) => ({ ...key, id: `${intent.rightClipId}:appearance:${index + 1}` })) },
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
    const pendingRepairs: ConvertedBoundaryRepairV2[] = []
    if (leadingDeltaMs && incoming.length > 0) {
      if (incoming.length !== 1 || transitionEndpoints(incoming[0]).to.length !== 1) return refuse('invalid-topology', 'Leading resize cannot split a common Transition window.')
      const leadingBoundary = convertedBoundaryRepairSpecV2(record, incoming[0].id)
      if (leadingBoundary.status === 'ramp-carrier') return refuse('unsupported-property-carrier', `Transition "${leadingBoundary.transitionId}" carries Property ramps. Reset it with an explicit projection plan; its ramp window cannot be resized.`)
      if (leadingBoundary.status === 'ready') {
        if (leadingDeltaMs < 0) return refuse('invalid-topology', `Clip "${clip.id}" meets converted Scene-boundary Transition "${leadingBoundary.repair.transitionId}" at the Scene edge; it cannot extend into the boundary. Reset the Transition explicitly first.`)
        pendingRepairs.push(leadingBoundary.repair)
      } else {
        const durationMs = incoming[0].durationMs + leadingDeltaMs
        if (durationMs < 0) return refuse('invalid-intent', 'Leading resize cannot create a negative Transition duration.')
        if (durationMs === 0) {
          if (incoming[0].propertyRamps.length) {
            if (!intent.propertyRampProjections || !validProjections(intent.propertyRampProjections, incoming[0].propertyRamps.length)) return refuse('unsupported-property-carrier', 'Reset requires explicit complete Property ramp projections before removing its carrier.')
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
    }
    if (trailingDeltaMs && outgoing.length > 0) {
      if (outgoing.length !== 1 || transitionEndpoints(outgoing[0]).from.length !== 1) return refuse('invalid-topology', 'Trailing resize cannot split a common Transition window.')
      const trailingBoundary = convertedBoundaryRepairSpecV2(record, outgoing[0].id)
      if (trailingBoundary.status === 'ramp-carrier') return refuse('unsupported-property-carrier', `Transition "${trailingBoundary.transitionId}" carries Property ramps. Reset it with an explicit projection plan; its ramp window cannot be resized.`)
      if (trailingBoundary.status === 'ready') {
        if (trailingDeltaMs > 0) return refuse('invalid-topology', `Clip "${clip.id}" meets converted Scene-boundary Transition "${trailingBoundary.repair.transitionId}" at the Scene edge; it cannot extend into the boundary. Reset the Transition explicitly first.`)
        pendingRepairs.push(trailingBoundary.repair)
      } else {
        const successors = downstreamClosure(record, transitionEndpoints(outgoing[0]).to)
        if (successors.includes(clip.id)) return refuse('invalid-topology', 'Transition topology contains a directed cycle.')
        applyShowTransitionClipShiftV2(record, next, successors, trailingDeltaMs, [outgoing[0].id])
        const boundary = next.composition.transitions.find(transition => transition.id === outgoing[0].id)!
        if (boundary.wholeOutput) boundary.wholeOutput.startMs += trailingDeltaMs
      }
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
    if (pendingRepairs.length > 0) {
      const committed = commitConvertedBoundaryRepairsV2(record, next, pendingRepairs)
      if (committed.status === 'refused') return refuse('invalid-result', committed.message)
      shortenedLayoutOccurrenceIds.push(...committed.applied.shortenedLayoutOccurrenceIds, ...committed.applied.shiftedLayoutOccurrenceIds)
      shiftedMarkerIds.push(...committed.applied.shiftedMarkerIds)
      shiftedGroupOccurrenceIds.push(...committed.applied.shiftedGroupOccurrenceIds)
    }
  }
  if ((intent.kind === 'trim' || intent.kind === 'extend') && Object.prototype.hasOwnProperty.call(intent, 'propertyRampProjections') && !usedProjectionPlan) return refuse('invalid-intent', 'Property ramp projections apply only to a leading zero-duration Reset with existing ramps.')
  // Projected boundary animation retains its preimage global times through Reset and ripple.
  next.composition.propertyTracks.push(...projectionTracks)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refuse('invalid-result', `${issue.path}: ${issue.message}`)
  const availability = validateShowLayoutAvailabilityV2(next)[0]
  // Re-placement reports its own routing code; the time-only edges keep theirs.
  if (availability) return refuse(intent.kind === 'replace-placement' ? 'zone-unavailable' : 'invalid-result', `Zone is unavailable for "${availability.entityId}".`)
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
  for (const id of shortenedLayoutOccurrenceIds) if (!affected.affectedLayoutOccurrenceIds.includes(id)) affected.affectedLayoutOccurrenceIds.push(id)
  for (const id of shiftedMarkerIds) if (!affected.affectedMarkerIds.includes(id)) affected.affectedMarkerIds.push(id)
  for (const id of shiftedGroupOccurrenceIds) if (!affected.affectedGroupOccurrenceIds.includes(id)) affected.affectedGroupOccurrenceIds.push(id)
  for (const ids of [affected.affectedClipIds, affected.affectedTransitionIds, affected.affectedTrackIds, affected.affectedAppearanceKeyIds, affected.affectedPropertyKeyIds, affected.affectedLayoutOccurrenceIds, affected.affectedMarkerIds, affected.affectedGroupOccurrenceIds, affected.removedIds]) ids.sort()
  return { status: 'changed', record: next, ...affected }
}

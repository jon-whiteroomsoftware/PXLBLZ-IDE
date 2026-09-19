import {
  validateShowRecordV2,
  type ShowClipV2,
  type ShowPropertyTrackV2,
  type ShowRecordV2,
  type ShowTransitionV2,
} from './showCompositionV2'
import { effectiveShowInstanceUseCountV2 } from './showGroupsV2'
import { validateClipLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import {
  editShowClipPropertyTracksV2,
  projectShowTransitionPropertyRampsV2,
  type ShowTransitionRampProjectionV2,
} from './showPropertyAnimationV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'

export interface ShowDerivedCutJunctionV2 {
  kind: 'cut'
  atMs: number
  zoneId: string
  layerId: string
  fromClipId: string
  toClipId: string
}

/** One removed carrier's complete ramp projection plan; identities come from the caller. */
export interface ShowTransitionCarrierRampProjectionPlanV2 {
  transitionId: string
  projections: readonly ShowTransitionRampProjectionV2[]
}

export type ShowTransitionEditIntentV2 =
  | { kind: 'insert'; transition: ShowTransitionV2 }
  | { kind: 'update-transition'; transition: ShowTransitionV2 }
  | { kind: 'resize-transition'; transitionId: string; durationMs: number }
  | { kind: 'move-connected'; clipId: string; startMs: number; zoneId?: string; layerId?: string }
  | { kind: 'resize-trailing'; clipId: string; endMs: number }
  | { kind: 'resize-leading'; clipId: string; startMs: number }
  | { kind: 'reset-to-cut'; transitionId: string; propertyRampProjections?: readonly ShowTransitionRampProjectionV2[] }
  | { kind: 'delete-clip'; clipId: string; propertyRampProjections?: readonly ShowTransitionCarrierRampProjectionPlanV2[] }

export type ShowTransitionEditRefusalV2 =
  | 'invalid-record'
  | 'missing-clip'
  | 'missing-transition'
  | 'invalid-intent'
  | 'invalid-topology'
  | 'unsupported-layout'
  | 'unsupported-property-carrier'
  | 'compiler-ineligible'
  | 'invalid-result'

interface ShowTransitionEditAffectedV2 {
  affectedClipIds: string[]
  affectedTransitionIds: string[]
  affectedTrackIds: string[]
  removedIds: string[]
}

export type ShowTransitionEditResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowTransitionEditAffectedV2)
  | ({ status: 'unchanged'; record: ShowRecordV2 } & ShowTransitionEditAffectedV2)
  | ({ status: 'refused'; record: ShowRecordV2; code: ShowTransitionEditRefusalV2; message: string } & ShowTransitionEditAffectedV2)

/** Project selectable Cut junctions without minting persisted identity. */
export function projectShowTransitionJunctionsV2(record: ShowRecordV2): ShowDerivedCutJunctionV2[] {
  const result: ShowDerivedCutJunctionV2[] = []
  for (const layer of record.composition.layers) {
    const clips = record.composition.clips
      .filter(clip => clip.zoneId === layer.zoneId && clip.layerId === layer.id)
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    for (let index = 1; index < clips.length; index += 1) {
      const from = clips[index - 1]
      const to = clips[index]
      const atMs = from.startMs + from.durationMs
      if (atMs !== to.startMs) continue
      result.push({
        kind: 'cut',
        atMs,
        zoneId: layer.zoneId,
        layerId: layer.id,
        fromClipId: from.id,
        toClipId: to.id,
      })
    }
  }
  return result.sort((left, right) => left.atMs - right.atMs
    || left.zoneId.localeCompare(right.zoneId)
    || left.layerId.localeCompare(right.layerId)
    || left.fromClipId.localeCompare(right.fromClipId))
}

/** Additive v2 Transition owner. Adoption, history and persistence remain caller-owned. */
export function editShowTransitionV2(
  record: ShowRecordV2,
  intent: ShowTransitionEditIntentV2,
): ShowTransitionEditResultV2 {
  const empty = (): ShowTransitionEditAffectedV2 => ({
    affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [],
  })
  const refuse = (code: ShowTransitionEditRefusalV2, message: string): ShowTransitionEditResultV2 => ({
    status: 'refused', record, code, message, ...empty(),
  })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)

  if (intent.kind === 'delete-clip') {
    const clip = record.composition.clips.find(candidate => candidate.id === intent.clipId)
    if (!clip) return refuse('missing-clip', `Clip "${intent.clipId}" does not exist.`)
    const removedTransitions = record.composition.transitions.filter(transition => (
      transitionEndpoints(transition).all.includes(clip.id)
    ))
    const carrierIds = removedTransitions.filter(transition => transition.propertyRamps.length > 0).map(transition => transition.id)
    const plans = intent.propertyRampProjections ?? []
    if (plans.length !== carrierIds.length
      || new Set(plans.map(plan => plan.transitionId)).size !== plans.length
      || plans.some(plan => !carrierIds.includes(plan.transitionId))) {
      return refuse('unsupported-property-carrier', `Deleting Clip "${clip.id}" needs one complete Property-ramp projection plan for each removed carrier Transition (${carrierIds.join(', ') || 'none'}).`)
    }
    // Project every removed carrier's ramps on the preimage, before the visual record leaves.
    let projected = record
    const projectedTrackIds: string[] = []
    for (const plan of plans) {
      const result = projectShowTransitionPropertyRampsV2(projected, plan.transitionId, plan.projections)
      if (result.status !== 'changed') {
        return refuse('unsupported-property-carrier', result.status === 'refused'
          ? result.message
          : `Transition "${plan.transitionId}" Property ramps were not projected.`)
      }
      projected = result.record
      projectedTrackIds.push(...result.affectedTrackIds)
    }
    const removedTransitionIds = removedTransitions.map(transition => transition.id)
    const removedTrackIds = projected.composition.propertyTracks
      .filter(track => 'clipId' in track.target && track.target.clipId === clip.id)
      .map(track => track.id)
    const next = structuredClone(projected)
    next.composition.clips = next.composition.clips.filter(candidate => candidate.id !== clip.id)
    next.composition.transitions = next.composition.transitions.filter(transition => !removedTransitionIds.includes(transition.id))
    next.composition.propertyTracks = next.composition.propertyTracks.filter(track => !removedTrackIds.includes(track.id))
    const issue = validateShowRecordV2(next)[0]
    if (issue) return refuse('invalid-result', `${issue.path}: ${issue.message}`)
    const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
    if (compilerRestriction) return refuse('compiler-ineligible', compilerRestriction.message)
    return {
      status: 'changed', record: next,
      affectedClipIds: [clip.id],
      affectedTransitionIds: removedTransitionIds.sort(),
      affectedTrackIds: [...new Set([...projectedTrackIds, ...removedTrackIds])].sort(),
      removedIds: [clip.id, ...removedTransitionIds, ...removedTrackIds].sort(),
    }
  }

  if (intent.kind === 'update-transition') {
    const current = record.composition.transitions.find(candidate => candidate.id === intent.transition.id)
    if (!current) return refuse('missing-transition', `Transition "${intent.transition.id}" does not exist.`)
    const ownership = (transition: ShowTransitionV2) => ({
      id: transition.id,
      durationMs: transition.durationMs,
      participants: transition.participants,
      wholeOutput: transition.wholeOutput,
      propertyRamps: transition.propertyRamps,
      // Conversion provenance is written by the v1 converter alone (#1065), so
      // a settings edit can neither change nor clear it.
      origin: transition.origin,
    })
    if (JSON.stringify(ownership(current)) !== JSON.stringify(ownership(intent.transition))) {
      return refuse('invalid-intent', 'A settings edit cannot change Transition identity, timing, participants, property ramps or conversion provenance.')
    }
    if (JSON.stringify(current) === JSON.stringify(intent.transition)) return { status: 'unchanged', record, ...empty() }
    const next = structuredClone(record)
    next.composition.transitions = next.composition.transitions.map(transition => (
      transition.id === current.id ? structuredClone(intent.transition) : transition
    ))
    const issue = validateShowRecordV2(next)[0]
    if (issue) return refuse('invalid-result', `${issue.path}: ${issue.message}`)
    const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
    if (compilerRestriction) return refuse('compiler-ineligible', compilerRestriction.message)
    return {
      status: 'changed', record: next, affectedClipIds: [], affectedTransitionIds: [current.id],
      affectedTrackIds: [], removedIds: [],
    }
  }

  if (intent.kind === 'resize-trailing' || intent.kind === 'resize-leading') {
    const clip = record.composition.clips.find(candidate => candidate.id === intent.clipId)
    if (!clip) return refuse('missing-clip', `Clip "${intent.clipId}" does not exist.`)
    const requestedMs = intent.kind === 'resize-trailing' ? intent.endMs : intent.startMs
    if (!Number.isSafeInteger(requestedMs) || requestedMs < 0 || requestedMs > record.composition.showEndMs) {
      return refuse('invalid-intent', 'Clip edge must be a safe integer within Show End.')
    }
    if (intent.kind === 'resize-trailing') return resizeTrailing(record, clip.id, intent.endMs)
    return resizeLeading(record, clip.id, intent.startMs)
  }

  if (intent.kind === 'move-connected') {
    const clip = record.composition.clips.find(candidate => candidate.id === intent.clipId)
    if (!clip) return refuse('missing-clip', `Clip "${intent.clipId}" does not exist.`)
    if (!Number.isSafeInteger(intent.startMs) || intent.startMs < 0) return refuse('invalid-intent', 'Clip start must be a nonnegative safe integer.')
    if (intent.zoneId !== undefined && intent.zoneId !== clip.zoneId || intent.layerId !== undefined && intent.layerId !== clip.layerId) {
      return refuse('invalid-topology', 'A connected Transition component cannot move to a different Zone or Layer.')
    }
    const deltaMs = intent.startMs - clip.startMs
    if (deltaMs === 0) return { status: 'unchanged', record, ...empty() }
    const affectedClipIds = connectedComponent(record, [clip.id])
    return commitShift(record, affectedClipIds, deltaMs, [], [])
  }

  if (intent.kind === 'insert') {
    const transition = intent.transition
    if (!Number.isSafeInteger(transition.durationMs) || transition.durationMs <= 0 || !transition.id.trim()) {
      return refuse('invalid-intent', 'A Transition requires a fresh identity and positive safe-integer duration.')
    }
    if (record.composition.transitions.some(candidate => candidate.id === transition.id)) {
      return refuse('invalid-intent', `Transition "${transition.id}" already exists.`)
    }
    // Only the v1 converter writes conversion provenance; an authored insertion
    // cannot mint it (#1065).
    if (transition.origin !== undefined) {
      return refuse('invalid-intent', 'An inserted Transition cannot author conversion provenance.')
    }
    const endpoints = transitionEndpoints(transition)
    if (!insertEndpointsAreExact(record, transition, endpoints)) {
      return refuse('invalid-intent', 'Insertion requires an exact derived Cut across every named contributor.')
    }
    const affectedClipIds = downstreamClosure(record, endpoints.to)
    if (endpoints.from.some(id => affectedClipIds.includes(id))) {
      return refuse('invalid-topology', 'Transition topology contains a directed cycle.')
    }
    return commitShift(record, affectedClipIds, transition.durationMs, [structuredClone(transition)], [])
  }

  const transition = record.composition.transitions.find(candidate => candidate.id === intent.transitionId)
  if (!transition) return refuse('missing-transition', `Transition "${intent.transitionId}" does not exist.`)
  if (intent.kind === 'resize-transition' && (!Number.isSafeInteger(intent.durationMs) || intent.durationMs < 0)) {
    return refuse('invalid-intent', 'Transition duration must be a nonnegative safe integer.')
  }
  if (intent.kind === 'resize-transition' && intent.durationMs === transition.durationMs) {
    return { status: 'unchanged', record, ...empty() }
  }
  if (transition.propertyRamps.length > 0) {
    if (intent.kind === 'reset-to-cut' && intent.propertyRampProjections) {
      return resetTransitionWithProjectedPropertyRamps(record, transition, intent.propertyRampProjections)
    }
    // Reset consumes an explicit projection plan; resizing a boundary carrier window
    // remains an adapter-only guard with no accepted ramp re-timing semantics.
    return refuse('unsupported-property-carrier', `Transition "${transition.id}" carries Property ramps. Reset it with an explicit projection plan; its ramp window cannot be resized.`)
  }
  if (intent.kind === 'resize-transition' && intent.durationMs === 0) {
    return editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId: transition.id })
  }
  if (intent.kind === 'reset-to-cut') {
    const spec = convertedBoundaryRepairSpecV2(record, transition.id)
    if (spec.status === 'ready') return resetConvertedBoundaryToCut(record, spec.repair)
  }
  const endpoints = transitionEndpoints(transition)
  const affectedClipIds = downstreamClosure(record, endpoints.to)
  if (endpoints.from.some(id => affectedClipIds.includes(id))) {
    return refuse('invalid-topology', 'Transition topology contains a directed cycle.')
  }
  const deltaMs = intent.kind === 'resize-transition'
    ? intent.durationMs - transition.durationMs
    : -transition.durationMs
  const replacements = intent.kind === 'resize-transition'
    ? [{ ...structuredClone(transition), durationMs: intent.durationMs }]
    : []
  return commitShift(record, affectedClipIds, deltaMs, replacements, intent.kind === 'reset-to-cut' ? [transition.id] : [])
}

/**
 * Converted Scene-boundary repair (#1068).
 *
 * A converted Scene-boundary Transition is a v1 scene edge wearing a Layer
 * junction shape: the converter lands it at participant scope whenever one
 * pair of Clips meets exactly, but its provenance still names the boundary
 * inspector, not the junction popover. Growing it like a native crossfade
 * invents choreography v1 never had: v1 plans the requested Clip range
 * against original timing, then replaces the orphaned boundary with a Cut
 * and shortens its loop by the boundary duration, keeping every Scene-local
 * offset. The v2 repair below is that same commit in global coordinates: cut
 * the boundary record, move the boundary's downstream side (every Clip at or
 * after the destination entry plus the transition-connected closure) earlier
 * by the boundary duration, and lower Show End by the same duration, keeping
 * the single Layout coverage exact by shortening its tail occurrence.
 *
 * The repair fires only for Transitions carrying
 * `origin: 'converted-boundary-transition'` at single-participant scope.
 * Provenance is the only reliable family signal: a converted boundary at
 * participant scope is structurally identical to a native Layer junction, so
 * structure alone must never select this path. Native Transitions,
 * converted Layer Transitions and whole-output boundaries keep the existing
 * grow/shift behaviour, and Clip deletion keeps survivor times and Show End
 * exactly (v1 preserves its loop on delete; only the unrepresentable orphan
 * record is dropped).
 *
 * One repair never invents room: content spanning the reclaimed window end,
 * a tail occurrence that cannot absorb the reclaim, stranded Property
 * activation, broken Layout availability or compiler placement refuse the
 * whole edit atomically. A boundary carrier that still holds Property ramps
 * refuses here; Reset it explicitly with a projection plan first.
 */
export interface ConvertedBoundaryRepairV2 {
  transitionId: string
  fromClipId: string
  toClipId: string
  windowStartMs: number
  windowEndMs: number
  durationMs: number
}

export type ConvertedBoundaryRepairEligibilityV2 =
  | { status: 'ready'; repair: ConvertedBoundaryRepairV2 }
  | { status: 'ramp-carrier'; transitionId: string }
  | { status: 'ignore' }

export function isConvertedBoundaryTransitionV2(transition: ShowTransitionV2): boolean {
  return transition.origin === 'converted-boundary-transition'
}

/** Classify one Transition for boundary repair without mutating the record. */
export function convertedBoundaryRepairSpecV2(
  record: ShowRecordV2,
  transitionId: string,
): ConvertedBoundaryRepairEligibilityV2 {
  const transition = record.composition.transitions.find(candidate => candidate.id === transitionId)
  if (!transition || !isConvertedBoundaryTransitionV2(transition)) return { status: 'ignore' }
  if (transition.wholeOutput || transition.participants.length !== 1) return { status: 'ignore' }
  if (transition.propertyRamps.length > 0) return { status: 'ramp-carrier', transitionId: transition.id }
  const participant = transition.participants[0]
  const from = record.composition.clips.find(clip => clip.id === participant.fromClipId)
  const to = record.composition.clips.find(clip => clip.id === participant.toClipId)
  if (!from || !to) return { status: 'ignore' }
  if (from.zoneId !== participant.zoneId || to.zoneId !== participant.zoneId
    || from.layerId !== participant.layerId || to.layerId !== participant.layerId) return { status: 'ignore' }
  const windowStartMs = from.startMs + from.durationMs
  const windowEndMs = to.startMs
  if (windowStartMs + transition.durationMs !== windowEndMs) return { status: 'ignore' }
  return {
    status: 'ready',
    repair: {
      transitionId: transition.id,
      fromClipId: from.id,
      toClipId: to.id,
      windowStartMs,
      windowEndMs,
      durationMs: transition.durationMs,
    },
  }
}

export interface ConvertedBoundaryRepairAppliedV2 {
  removedTransitionIds: string[]
  shiftedClipIds: string[]
  shiftedTrackIds: string[]
  shortenedLayoutOccurrenceIds: string[]
  reclaimedMs: number
}

/**
 * Commit converted-boundary cuts on a working candidate. The Clip retime in
 * old coordinates belongs to the caller; this moves the downstream side,
 * reclaims Show End and keeps Layout coverage exact. Returns a refusal
 * message when protected content collides; the caller refuses atomically
 * with its original record.
 */
export function commitConvertedBoundaryRepairsV2(
  record: ShowRecordV2,
  next: ShowRecordV2,
  repairs: readonly ConvertedBoundaryRepairV2[],
): { status: 'applied'; applied: ConvertedBoundaryRepairAppliedV2 } | { status: 'refused'; message: string } {
  // Windows, closures and membership all read the pre-edit record: the caller
  // retimes the edited Clip in old coordinates first, and the repair closes
  // the reclaimed window underneath it. Shifts are absolute, so several
  // repairs compose additively in any order.
  const ordered = [...repairs].sort((left, right) => right.windowEndMs - left.windowEndMs)
  const removedTransitionIds: string[] = []
  const shiftedClipIds = new Set<string>()
  const shiftedTrackIds = new Set<string>()
  let reclaimedMs = 0
  for (const repair of ordered) {
    if (!next.composition.transitions.some(candidate => candidate.id === repair.transitionId)) {
      return { status: 'refused', message: `Transition "${repair.transitionId}" is no longer present.` }
    }
    const durationMs = repair.durationMs
    const shiftIds = new Set(downstreamClosure(record, [repair.toClipId]))
    for (const clip of record.composition.clips) {
      if (clip.startMs >= repair.windowEndMs) shiftIds.add(clip.id)
      else if (clip.startMs + clip.durationMs > repair.windowEndMs) {
        return { status: 'refused', message: `Clip "${clip.id}" spans the reclaimed boundary window ending at ${repair.windowEndMs} ms; split or trim it away from the boundary first.` }
      }
    }
    next.composition.transitions = next.composition.transitions.filter(candidate => candidate.id !== repair.transitionId)
    const movedTrackIds = applyShowTransitionClipShiftV2(record, next, [...shiftIds], -durationMs, [repair.transitionId])
    for (const id of shiftIds) shiftedClipIds.add(id)
    for (const id of movedTrackIds) shiftedTrackIds.add(id)
    next.composition.showEndMs -= durationMs
    reclaimedMs += durationMs
    removedTransitionIds.push(repair.transitionId)
  }
  const orderedOccurrences = [...next.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  const tail = orderedOccurrences[orderedOccurrences.length - 1]
  if (!tail || tail.durationMs <= reclaimedMs) {
    return { status: 'refused', message: 'The reclaimed boundary window does not fit behind the final Layout occurrence; consolidate Layouts first.' }
  }
  next.composition.layoutOccurrences.find(candidate => candidate.id === tail.id)!.durationMs -= reclaimedMs
  return {
    status: 'applied',
    applied: {
      removedTransitionIds: removedTransitionIds.sort(),
      shiftedClipIds: [...shiftedClipIds].sort(),
      shiftedTrackIds: [...shiftedTrackIds].sort(),
      shortenedLayoutOccurrenceIds: [tail.id],
      reclaimedMs,
    },
  }
}

/** Reset a converted boundary to a Cut while reclaiming its window from Show End. */
function resetConvertedBoundaryToCut(record: ShowRecordV2, repair: ConvertedBoundaryRepairV2): ShowTransitionEditResultV2 {
  const next = structuredClone(record)
  const committed = commitConvertedBoundaryRepairsV2(record, next, [repair])
  if (committed.status === 'refused') return refusedResult(record, 'invalid-result', committed.message)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refusedResult(record, 'invalid-result', `${issue.path}: ${issue.message}`)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const moved = new Set(committed.applied.shiftedClipIds)
  const unavailable = firstUnavailableContributor(next, [...new Set([...moved, repair.fromClipId, repair.toClipId])])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  return {
    status: 'changed',
    record: next,
    affectedClipIds: [...moved].sort(),
    affectedTransitionIds: [...new Set([repair.transitionId, ...affectedTransitionIdsFor(record, moved)])].sort(),
    affectedTrackIds: committed.applied.shiftedTrackIds,
    removedIds: [repair.transitionId],
  }
}

/**
 * Retime one Clip edge in old coordinates, then repair its converted
 * boundary: cut the record, move the downstream side earlier and reclaim
 * Show End. Callers refuse extension into the boundary before reaching here.
 */
function resizeConvertedBoundaryEdge(
  record: ShowRecordV2,
  clip: ShowClipV2,
  startMs: number,
  endMs: number,
  repair: ConvertedBoundaryRepairV2,
): ShowTransitionEditResultV2 {
  const oldEndMs = clip.startMs + clip.durationMs
  const leading = startMs !== clip.startMs
  const trackEdit = editShowClipPropertyTracksV2(record, clip, { kind: 'trim', startMs, endMs })
  const next = structuredClone(record)
  next.composition.propertyTracks = trackEdit.propertyTracks
  const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
  edited.startMs = startMs
  edited.durationMs = endMs - startMs
  if (leading) {
    const held = [...clip.appearance.keys].reverse().find(key => key.timeMs <= startMs) ?? clip.appearance.keys[0]
    edited.appearance.keys = [
      { ...structuredClone(held), timeMs: startMs },
      ...structuredClone(clip.appearance.keys.filter(key => key !== held && key.timeMs > startMs && key.timeMs < oldEndMs)),
    ]
  } else {
    edited.appearance.keys = edited.appearance.keys.filter(key => key.timeMs < endMs)
  }
  const committed = commitConvertedBoundaryRepairsV2(record, next, [repair])
  if (committed.status === 'refused') return refusedResult(record, 'invalid-result', committed.message)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refusedResult(record, 'invalid-result', `${issue.path}: ${issue.message}`)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const moved = new Set([clip.id, ...committed.applied.shiftedClipIds])
  const unavailable = firstUnavailableContributor(next, [...new Set([...moved, repair.fromClipId, repair.toClipId])])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  return {
    status: 'changed',
    record: next,
    affectedClipIds: [...moved].sort(),
    affectedTransitionIds: [...new Set([repair.transitionId, ...affectedTransitionIdsFor(record, moved)])].sort(),
    affectedTrackIds: [...new Set([...trackEdit.affectedTrackIds, ...committed.applied.shiftedTrackIds])].sort(),
    removedIds: [repair.transitionId],
  }
}

function resizeTrailing(record: ShowRecordV2, clipId: string, endMs: number): ShowTransitionEditResultV2 {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  const oldEndMs = clip.startMs + clip.durationMs
  if (endMs <= clip.startMs) return refusedResult(record, 'invalid-intent', 'Trailing resize must leave a positive Clip duration.')
  if (endMs === oldEndMs) return unchangedResult(record)
  const outgoing = record.composition.transitions.filter(transition => transitionEndpoints(transition).from.includes(clip.id))
  if (outgoing.length !== 1) return refusedResult(record, 'invalid-topology', 'Trailing connected resize requires exactly one outgoing Transition.')
  const transition = outgoing[0]
  const endpoints = transitionEndpoints(transition)
  if (endpoints.from.length !== 1) return refusedResult(record, 'invalid-topology', 'Resize cannot split a multi-contributor Transition window.')
  const boundary = convertedBoundaryRepairSpecV2(record, transition.id)
  if (boundary.status === 'ready') {
    if (endMs > oldEndMs) return refusedResult(record, 'invalid-topology', `Clip "${clip.id}" meets converted Scene-boundary Transition "${boundary.repair.transitionId}" at the Scene edge; it cannot extend into the boundary. Reset the Transition explicitly first.`)
    return resizeConvertedBoundaryEdge(record, clip, clip.startMs, endMs, boundary.repair)
  }
  const deltaMs = endMs - oldEndMs
  const affectedClipIds = downstreamClosure(record, endpoints.to)
  if (affectedClipIds.includes(clip.id)) return refusedResult(record, 'invalid-topology', 'Transition topology contains a directed cycle.')
  const trackEdit = editShowClipPropertyTracksV2(record, clip, {
    kind: endMs < oldEndMs ? 'trim' : 'extend',
    startMs: clip.startMs,
    endMs,
  })
  const next = structuredClone(record)
  next.composition.propertyTracks = trackEdit.propertyTracks
  shiftClips(next, affectedClipIds, deltaMs)
  const shiftedTrackIds = shiftOwnedTracks(record, next.composition.propertyTracks, new Set(affectedClipIds), deltaMs)
  shiftWholeOutputWindows(record, next, new Set(affectedClipIds), deltaMs, new Set([transition.id]))
  const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
  edited.durationMs = endMs - clip.startMs
  edited.appearance.keys = edited.appearance.keys.filter(key => key.timeMs < endMs)
  next.composition.transitions = next.composition.transitions.map(candidate => candidate.id === transition.id && candidate.wholeOutput
    ? { ...candidate, wholeOutput: { ...candidate.wholeOutput, startMs: candidate.wholeOutput.startMs + deltaMs } }
    : candidate)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refusedResult(record, 'invalid-result', `${issue.path}: ${issue.message}`)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const unavailable = firstUnavailableContributor(next, [...new Set([
    clip.id,
    ...affectedClipIds,
    ...endpoints.all,
  ])])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  return {
    status: 'changed', record: next,
    affectedClipIds: [clip.id, ...affectedClipIds].sort(),
    affectedTransitionIds: affectedTransitionIdsFor(record, new Set([clip.id, ...affectedClipIds])),
    affectedTrackIds: [...new Set([...trackEdit.affectedTrackIds, ...shiftedTrackIds])].sort(), removedIds: [],
  }
}

function resetTransitionWithProjectedPropertyRamps(
  record: ShowRecordV2,
  transition: ShowTransitionV2,
  projections: readonly ShowTransitionRampProjectionV2[],
): ShowTransitionEditResultV2 {
  const projected = projectShowTransitionPropertyRampsV2(record, transition.id, projections)
  if (projected.status === 'refused') {
    return refusedResult(record, 'unsupported-property-carrier', projected.message)
  }
  if (projected.status !== 'changed') {
    return refusedResult(record, 'unsupported-property-carrier', `Transition "${transition.id}" Property ramps were not projected.`)
  }
  const projectedTrackIds = new Set(projected.affectedTrackIds)
  const projectedTracks = projected.record.composition.propertyTracks
    .filter(track => projectedTrackIds.has(track.id))
    .map(track => structuredClone(track))
  const carrierCleared = structuredClone(record)
  carrierCleared.composition.transitions = carrierCleared.composition.transitions.map(candidate => (
    candidate.id === transition.id ? { ...candidate, propertyRamps: [] } : candidate
  ))
  const reset = editShowTransitionV2(carrierCleared, { kind: 'reset-to-cut', transitionId: transition.id })
  if (reset.status !== 'changed') return { ...reset, record }
  const next = structuredClone(reset.record)
  next.composition.propertyTracks.push(...projectedTracks)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refusedResult(record, 'invalid-result', `${issue.path}: ${issue.message}`)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  return {
    ...reset,
    record: next,
    affectedTrackIds: [...new Set([...reset.affectedTrackIds, ...projected.affectedTrackIds])].sort(),
  }
}

function resizeLeading(record: ShowRecordV2, clipId: string, startMs: number): ShowTransitionEditResultV2 {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  const oldEndMs = clip.startMs + clip.durationMs
  if (startMs >= oldEndMs) return refusedResult(record, 'invalid-intent', 'Leading resize must leave a positive Clip duration.')
  if (startMs === clip.startMs) return unchangedResult(record)
  const incoming = record.composition.transitions.filter(transition => transitionEndpoints(transition).to.includes(clip.id))
  if (incoming.length !== 1) return refusedResult(record, 'invalid-topology', 'Leading connected resize requires exactly one incoming Transition.')
  const transition = incoming[0]
  const endpoints = transitionEndpoints(transition)
  if (endpoints.to.length !== 1) return refusedResult(record, 'invalid-topology', 'Resize cannot split a multi-contributor Transition window.')
  const boundary = convertedBoundaryRepairSpecV2(record, transition.id)
  if (boundary.status === 'ready') {
    if (startMs < clip.startMs) return refusedResult(record, 'invalid-topology', `Clip "${clip.id}" meets converted Scene-boundary Transition "${boundary.repair.transitionId}" at the Scene edge; it cannot extend into the boundary. Reset the Transition explicitly first.`)
    return resizeConvertedBoundaryEdge(record, clip, startMs, oldEndMs, boundary.repair)
  }
  const durationMs = transition.durationMs + startMs - clip.startMs
  if (durationMs < 0) return refusedResult(record, 'invalid-intent', 'Leading resize cannot create a negative Transition duration.')
  if (durationMs === 0) return editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId: transition.id })
  const trackEdit = editShowClipPropertyTracksV2(record, clip, {
    kind: startMs > clip.startMs ? 'trim' : 'extend',
    startMs,
    endMs: oldEndMs,
  })
  const next = structuredClone(record)
  next.composition.propertyTracks = trackEdit.propertyTracks
  const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
  edited.startMs = startMs
  edited.durationMs = oldEndMs - startMs
  const held = [...clip.appearance.keys].reverse().find(key => key.timeMs <= startMs) ?? clip.appearance.keys[0]
  edited.appearance.keys = [
    { ...structuredClone(held), timeMs: startMs },
    ...structuredClone(clip.appearance.keys.filter(key => key !== held && key.timeMs > startMs && key.timeMs < oldEndMs)),
  ]
  next.composition.transitions = next.composition.transitions.map(candidate => candidate.id === transition.id
    ? { ...candidate, durationMs }
    : candidate)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refusedResult(record, 'invalid-result', `${issue.path}: ${issue.message}`)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const unavailable = firstUnavailableContributor(next, [...new Set([clip.id, ...endpoints.all])])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  return {
    status: 'changed', record: next, affectedClipIds: [clip.id], affectedTransitionIds: [transition.id],
    affectedTrackIds: trackEdit.affectedTrackIds.sort(), removedIds: [],
  }
}

function unchangedResult(record: ShowRecordV2): ShowTransitionEditResultV2 {
  return {
    status: 'unchanged', record, affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [],
  }
}

function commitShift(
  record: ShowRecordV2,
  affectedClipIds: string[],
  deltaMs: number,
  replacements: ShowTransitionV2[],
  removedIds: string[],
): ShowTransitionEditResultV2 {
  const moved = new Set(affectedClipIds)
  const next = structuredClone(record)
  shiftClips(next, affectedClipIds, deltaMs)
  const affectedTrackIds = shiftOwnedTracks(record, next.composition.propertyTracks, moved, deltaMs)
  const replacementById = new Map(replacements.map(transition => [transition.id, transition]))
  next.composition.transitions = next.composition.transitions
    .filter(transition => !removedIds.includes(transition.id))
    .map(transition => replacementById.get(transition.id) ?? transition)
  for (const replacement of replacements) {
    if (!next.composition.transitions.some(transition => transition.id === replacement.id)) {
      next.composition.transitions.push(replacement)
    }
  }
  shiftWholeOutputWindows(record, next, moved, deltaMs, new Set(replacementById.keys()))
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refusedResult(record, 'invalid-result', `${issue.path}: ${issue.message}`)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const contributionAffected = new Set(moved)
  for (const transition of replacements) {
    transitionEndpoints(transition).all.forEach(id => contributionAffected.add(id))
  }
  for (const transition of record.composition.transitions.filter(candidate => removedIds.includes(candidate.id))) {
    transitionEndpoints(transition).all.forEach(id => contributionAffected.add(id))
  }
  const unavailable = firstUnavailableContributor(next, [...contributionAffected])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  const affectedTransitionIds = [...new Set([
    ...replacements.map(transition => transition.id),
    ...removedIds,
    ...record.composition.transitions
      .filter(transition => transitionEndpoints(transition).all.some(id => moved.has(id)))
      .map(transition => transition.id),
  ])].sort()
  return {
    status: 'changed',
    record: next,
    affectedClipIds: [...moved].sort(),
    affectedTransitionIds,
    affectedTrackIds: affectedTrackIds.sort(),
    removedIds: [...removedIds].sort(),
  }
}

function shiftClips(record: ShowRecordV2, clipIds: readonly string[], deltaMs: number): void {
  const moved = new Set(clipIds)
  for (const clip of record.composition.clips) {
    if (!moved.has(clip.id)) continue
    clip.startMs += deltaMs
    clip.appearance.keys.forEach(key => { key.timeMs += deltaMs })
  }
}

function shiftWholeOutputWindows(
  source: ShowRecordV2,
  next: ShowRecordV2,
  moved: Set<string>,
  deltaMs: number,
  excluded: Set<string>,
): void {
  for (const transition of next.composition.transitions) {
    if (!transition.wholeOutput || excluded.has(transition.id)) continue
    const original = source.composition.transitions.find(candidate => candidate.id === transition.id)!
    const endpoints = transitionEndpoints(original)
    if (endpoints.all.every(id => moved.has(id))) transition.wholeOutput.startMs += deltaMs
  }
}

function affectedTransitionIdsFor(record: ShowRecordV2, affectedClipIds: Set<string>): string[] {
  return record.composition.transitions
    .filter(transition => transitionEndpoints(transition).all.some(id => affectedClipIds.has(id)))
    .map(transition => transition.id)
    .sort()
}

function refusedResult(
  record: ShowRecordV2,
  code: ShowTransitionEditRefusalV2,
  message: string,
): ShowTransitionEditResultV2 {
  return {
    status: 'refused', record, code, message,
    affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [],
  }
}

export function transitionEndpoints(transition: ShowTransitionV2): { from: string[]; to: string[]; all: string[] } {
  const from = transition.wholeOutput?.fromClipIds ?? transition.participants.map(participant => participant.fromClipId)
  const to = transition.wholeOutput?.toClipIds ?? transition.participants.map(participant => participant.toClipId)
  return { from, to, all: [...new Set([...from, ...to])] }
}

function insertEndpointsAreExact(
  record: ShowRecordV2,
  transition: ShowTransitionV2,
  endpoints: ReturnType<typeof transitionEndpoints>,
): boolean {
  const clips = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  if (transition.wholeOutput) {
    const atMs = transition.wholeOutput.startMs
    return transition.participants.length === 0
      && endpoints.from.length > 0
      && endpoints.to.length > 0
      && endpoints.from.every(id => {
        const clip = clips.get(id)
        return clip !== undefined && clip.startMs + clip.durationMs === atMs
      })
      && endpoints.to.every(id => clips.get(id)?.startMs === atMs)
  }
  return transition.participants.length > 0 && transition.participants.every(participant => {
    const from = clips.get(participant.fromClipId)
    const to = clips.get(participant.toClipId)
    return from !== undefined && to !== undefined
      && from.zoneId === participant.zoneId && to.zoneId === participant.zoneId
      && from.layerId === participant.layerId && to.layerId === participant.layerId
      && from.startMs + from.durationMs === to.startMs
  })
}

export function connectedComponent(record: ShowRecordV2, seeds: readonly string[]): string[] {
  const connected = new Set(seeds)
  let changed = true
  while (changed) {
    changed = false
    for (const transition of record.composition.transitions) {
      const endpoints = transitionEndpoints(transition).all
      if (!endpoints.some(id => connected.has(id))) continue
      for (const id of endpoints) {
        if (!connected.has(id)) {
          connected.add(id)
          changed = true
        }
      }
    }
  }
  return [...connected].sort()
}

export function downstreamClosure(record: ShowRecordV2, seeds: readonly string[]): string[] {
  const downstream = new Set(seeds)
  let changed = true
  while (changed) {
    changed = false
    for (const transition of record.composition.transitions) {
      const endpoints = transitionEndpoints(transition)
      const touchesTo = endpoints.to.some(id => downstream.has(id))
      const touchesFrom = endpoints.from.some(id => downstream.has(id))
      if (!touchesFrom && !touchesTo) continue
      const required = touchesFrom ? [...endpoints.from, ...endpoints.to] : endpoints.to
      for (const id of required) {
        if (!downstream.has(id)) {
          downstream.add(id)
          changed = true
        }
      }
    }
  }
  return [...downstream].sort()
}

export function applyShowTransitionClipShiftV2(source: ShowRecordV2, next: ShowRecordV2, clipIds: readonly string[], deltaMs: number, excludedTransitionIds: readonly string[] = []): string[] {
  const moved = new Set(clipIds)
  shiftClips(next, clipIds, deltaMs)
  const affectedTrackIds = shiftOwnedTracks(source, next.composition.propertyTracks, moved, deltaMs)
  shiftWholeOutputWindows(source, next, moved, deltaMs, new Set(excludedTransitionIds))
  return affectedTrackIds
}

function shiftOwnedTracks(
  source: ShowRecordV2,
  tracks: ShowPropertyTrackV2[],
  moved: Set<string>,
  deltaMs: number,
): string[] {
  const soleMovedInstanceIds = new Set([...moved].flatMap(clipId => {
    const instanceId = source.composition.clips.find(clip => clip.id === clipId)?.instanceId
    return instanceId && effectiveShowInstanceUseCountV2(source, instanceId) === 1 ? [instanceId] : []
  }))
  const affected: string[] = []
  for (const track of tracks) {
    const follows = 'clipId' in track.target
      ? moved.has(track.target.clipId)
      : 'instanceId' in track.target
        ? soleMovedInstanceIds.has(track.target.instanceId)
        : false
    if (!follows) continue
    track.activeStartMs += deltaMs
    track.keyframes.forEach(key => { key.timeMs += deltaMs })
    affected.push(track.id)
  }
  return affected
}

function firstUnavailableContributor(record: ShowRecordV2, clipIds: readonly string[]): string | null {
  const issue = validateClipLayoutAvailabilityV2(record, clipIds)[0]
  return issue
    ? `Clip "${issue.entityId}" contributes while Zone "${issue.zoneId}" is unavailable in Layout occurrence "${issue.layoutOccurrenceId}".`
    : null
}

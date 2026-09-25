import {
  showV2LogicalClipSegmentIds,
  isShowTransitionClipValueRampV2,
  retimeShowTransitionRampsV2,
  validateShowRecordV2,
  type ShowClipV2,
  type ShowCompositionV2ValidationCode,
  type ShowCompositionV2ValidationIssue,
  type ShowPropertyTrackV2,
  type ShowRecordV2,
  type ShowTransitionV2,
} from './showCompositionV2'
import { effectiveShowInstanceUseCountV2, groupOccurrenceDuration } from './showGroupsV2'
import { collectOrphanedShowInstanceV2 } from './showClipsV2'
import { showLayoutOccurrenceAtTimeV2, validateClipLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import {
  editShowClipPropertyTracksV2,
  projectShowTransitionPropertyRampsV2,
  type ShowTransitionRampProjectionV2,
} from './showPropertyAnimationV2'
import { promoteConvertedBoundariesToWholeOutputV2 } from './showBoundaryScopeV2'
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
  | { kind: 'delete-clip'; clipId: string; scope?: 'logical-clip' | 'segment'; propertyRampProjections?: readonly ShowTransitionCarrierRampProjectionPlanV2[] }

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
  affectedInstanceIds: string[]
  affectedTransitionIds: string[]
  affectedTrackIds: string[]
  affectedKeyframeIds: string[]
  affectedLayoutOccurrenceIds: string[]
  affectedMarkerIds: string[]
  affectedGroupOccurrenceIds: string[]
  removedIds: string[]
}

export type ShowTransitionEditResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowTransitionEditAffectedV2)
  | ({ status: 'unchanged'; record: ShowRecordV2 } & ShowTransitionEditAffectedV2)
  /** `issueCode` names the validator issue behind an `invalid-result` refusal. */
  | ({ status: 'refused'; record: ShowRecordV2; code: ShowTransitionEditRefusalV2; message: string; issueCode?: ShowCompositionV2ValidationCode } & ShowTransitionEditAffectedV2)

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
    affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedInstanceIds: [], affectedKeyframeIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [], removedIds: [],
  })
  const refuse = (code: ShowTransitionEditRefusalV2, message: string): ShowTransitionEditResultV2 => ({
    status: 'refused', record, code, message, ...empty(),
  })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)

  if (intent.kind === 'delete-clip') {
    const clip = record.composition.clips.find(candidate => candidate.id === intent.clipId)
    if (!clip) return refuse('missing-clip', `Clip "${intent.clipId}" does not exist.`)
    // A segment delete removes one physical part of a logical Clip; its other
    // parts keep their logicalClipId (#1111-E review). Default deletion removes
    // every linked part in one edit, as v1 does (#1068 item 1b).
    const removedClipIds = intent.scope === 'segment'
      ? [clip.id]
      : showV2LogicalClipSegmentIds(record.composition, clip.id)
    const removedClipIdSet = new Set(removedClipIds)
    const removedTransitions = record.composition.transitions.filter(transition => (
      transitionEndpoints(transition).all.some(endpoint => removedClipIdSet.has(endpoint))
    ))
    const carrierIds = removedTransitions.filter(transition => transition.propertyRamps.length > 0
      && !transition.propertyRamps.every(isShowTransitionClipValueRampV2)).map(transition => transition.id)
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
      .filter(track => 'clipId' in track.target && removedClipIdSet.has(track.target.clipId))
      .map(track => track.id)
    const next = structuredClone(projected)
    next.composition.clips = next.composition.clips.filter(candidate => !removedClipIdSet.has(candidate.id))
    next.composition.transitions = next.composition.transitions.filter(transition => !removedTransitionIds.includes(transition.id))
    next.composition.propertyTracks = next.composition.propertyTracks.filter(track => !removedTrackIds.includes(track.id))
    // Collect only the instances the removed Clips used; a pre-existing orphan stays (#1100).
    const collectedIds: string[] = []
    const collectedTrackIds: string[] = []
    const collectedInstanceIds: string[] = []
    const collectedKeyframeIds: string[] = []
    for (const instanceId of new Set(record.composition.clips.filter(candidate => removedClipIdSet.has(candidate.id)).map(candidate => candidate.instanceId))) {
      const collected = collectOrphanedShowInstanceV2(next, instanceId)
      if (!collected.removed) continue
      collectedIds.push(instanceId, ...collected.removedTrackIds, ...collected.removedKeyframeIds)
      collectedTrackIds.push(...collected.removedTrackIds)
      collectedInstanceIds.push(instanceId)
      collectedKeyframeIds.push(...collected.removedKeyframeIds)
    }
    const issue = validateShowRecordV2(next)[0]
    if (issue) return refuse('invalid-result', `${issue.path}: ${issue.message}`)
    const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
    if (compilerRestriction) return refuse('compiler-ineligible', compilerRestriction.message)
    return {
      status: 'changed', record: next,
      affectedClipIds: removedClipIds,
      affectedTransitionIds: removedTransitionIds.sort(),
      affectedTrackIds: [...new Set([...projectedTrackIds, ...removedTrackIds, ...collectedTrackIds])].sort(),
      affectedInstanceIds: collectedInstanceIds.sort(), affectedKeyframeIds: collectedKeyframeIds.sort(),
      affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [],
      removedIds: [...removedClipIds, ...removedTransitionIds, ...removedTrackIds, ...collectedIds].sort(),
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
      // Settings own Show-scalar and incoming Clip value ramps. Validation
      // checks their shape; every other ramp remains owner-protected.
      propertyRamps: transition.propertyRamps.filter(ramp =>
        !isShowScalarRampTargetV2(ramp.target) && !isShowTransitionClipValueRampV2(ramp)),
      // Conversion provenance is written by the v1 converter alone (#1065), so
      // a settings edit can neither change nor clear it.
      origin: transition.origin,
    })
    if (JSON.stringify(ownership(current)) !== JSON.stringify(ownership(intent.transition))) {
      // A settings edit that also carries a new Duration (the palette's)
      // retimes through resize-transition first, under whichever rule that
      // edit applies to this Transition: the converted-boundary repair, or
      // the native shift that keeps Show End fixed. The settings then apply
      // to the retimed record, as one accepted edit (#1066 5b, 5b-2).
      const retimed = JSON.stringify(ownership(current)) === JSON.stringify({ ...ownership(intent.transition), durationMs: current.durationMs })
        && intent.transition.durationMs > 0
        ? editShowTransitionV2(record, { kind: 'resize-transition', transitionId: current.id, durationMs: intent.transition.durationMs })
        : null
      if (!retimed) {
        return refuse('invalid-intent', 'A settings edit cannot change Transition identity, timing, participants, owner-protected property ramps or conversion provenance.')
      }
      if (retimed.status !== 'changed') return retimed
      const retimedTransition = retimed.record.composition.transitions.find(candidate => candidate.id === current.id)!
      const propertyRamps = retimeShowTransitionRampsV2(
        { ...intent.transition, durationMs: current.durationMs }, intent.transition.durationMs)
      const settled = structuredClone(retimed.record)
      settled.composition.transitions = settled.composition.transitions.map(transition => (
        transition.id === current.id ? { ...structuredClone(intent.transition), wholeOutput: retimedTransition.wholeOutput, participants: retimedTransition.participants, propertyRamps } : transition
      ))
      const settledIssue = validateShowRecordV2(settled)[0]
      if (settledIssue) return validatorRefusedResult(record, settledIssue)
      // The nested resize checked placement under the old kind; the settings
      // may change the kind (RL08 keys on Fade and Motion), so the settled
      // record faces the same compiler check as every sibling path.
      const settledRestriction = firstShowTransitionPlacementRestrictionV2(settled)
      if (settledRestriction) return refusedResult(record, 'compiler-ineligible', settledRestriction.message)
      return { ...retimed, record: settled }
    }
    if (JSON.stringify(current) === JSON.stringify(intent.transition)) return { status: 'unchanged', record, ...empty() }
    const next = structuredClone(record)
    next.composition.transitions = next.composition.transitions.map(transition => (
      transition.id === current.id ? structuredClone(intent.transition) : transition
    ))
    // A Show-scalar ramp needs whole-output scope, so a converted participant boundary takes the converter's
    // whole-output shape (v1-then-convert, #1066 L2411), through the same promotion the Layout and Show-track owners use.
    const promotion = promoteConvertedBoundariesToWholeOutputV2(next)
    const issue = validateShowRecordV2(promotion.record)[0]
    if (issue) return refuse('invalid-result', `${issue.path}: ${issue.message}`)
    const compilerRestriction = firstShowTransitionPlacementRestrictionV2(promotion.record)
    if (compilerRestriction) return refuse('compiler-ineligible', compilerRestriction.message)
    return {
      status: 'changed', record: promotion.record, affectedClipIds: [],
      affectedTransitionIds: [...new Set([current.id, ...promotion.promotedTransitionIds])].sort(),
      affectedTrackIds: [], affectedInstanceIds: [], affectedKeyframeIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [], removedIds: [],
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
  if (intent.kind === 'reset-to-cut' && transition.propertyRamps.length > 0 && !transition.propertyRamps.every(isShowTransitionClipValueRampV2)) {
    if (intent.kind === 'reset-to-cut' && intent.propertyRampProjections) {
      return resetTransitionWithProjectedPropertyRamps(record, transition, intent.propertyRampProjections)
    }
    return refuse('unsupported-property-carrier', rampCarrierRefusalMessageV2(transition.id))
  }
  if (intent.kind === 'resize-transition' && intent.durationMs === 0) {
    return editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId: transition.id })
  }
  if (intent.kind === 'reset-to-cut' || intent.kind === 'resize-transition') {
    const spec = convertedBoundaryRepairSpecV2(record, transition.id, intent.kind === 'resize-transition'
      ? { multiContributor: true, retimeRampCarrier: true }
      : { multiContributor: true })
    if (spec.status === 'ready') {
      return resetConvertedBoundaryToCut(record, intent.kind === 'resize-transition' ? { ...spec.repair, retainDurationMs: intent.durationMs } : spec.repair)
    }
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
    ? [{ ...structuredClone(transition), durationMs: intent.durationMs,
      propertyRamps: retimeShowTransitionRampsV2(transition, intent.durationMs) }]
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
 * the single Layout coverage exact by shortening the occurrence that owns
 * the reclaimed window and moving later occurrences earlier by the same duration.
 *
 * The repair fires for Transitions carrying
 * `origin: 'converted-boundary-transition'` with exactly one outgoing and one
 * incoming Clip, at single-participant or whole-output scope. The Transition
 * edits (`resize-transition`, `reset-to-cut`, the palette retime) additionally
 * opt in to multi-contributor whole-output boundaries (`{ multiContributor:
 * true }`, #1066 slice 5e2a1): one Clip per Zone and Layer on each side, every
 * outgoing Clip ending at the window start and every incoming one starting at
 * the window end, with no ramps, repairs as one Scene edge. Provenance is the
 * only reliable family signal: a converted boundary at participant scope is
 * structurally identical to a native Layer junction, so structure alone must
 * never select this path, and scope is a lowering concern the #1068 promotion
 * may change without changing what the boundary is. Native Transitions,
 * converted Layer Transitions, multi-contributor boundaries outside the
 * Transition edits' opt-in (the Clip-edge and temporal gestures stay
 * single-contributor) and whole-output boundaries still carrying ramps keep the
 * existing grow/shift behaviour, and Clip deletion keeps survivor times and
 * Show End exactly (v1 preserves its loop on delete; only the unrepresentable
 * orphan record is dropped).
 *
 * One repair never invents room: content spanning the reclaimed window end,
 * a tail occurrence that cannot absorb the reclaim, stranded Property
 * activation, broken Layout availability or compiler placement refuse the
 * whole edit atomically. A boundary carrier that still holds Property ramps
 * refuses here; Reset it explicitly with a projection plan first.
 */
/** The two Show-scalar ramp targets: global Show time, owned by no Clip or instance. */
export function isShowScalarRampTargetV2(target: ShowTransitionV2['propertyRamps'][number]['target']): boolean {
  return target.kind === 'show-repeat-scale' || target.kind === 'layout-occurrence-split-position'
}

export interface ConvertedBoundaryRepairV2 {
  transitionId: string
  /** Every outgoing contributor: one at participant scope, one per Zone and Layer at whole-output scope. */
  fromClipIds: string[]
  /** Every incoming contributor, as above. */
  toClipIds: string[]
  windowStartMs: number
  windowEndMs: number
  durationMs: number
  /**
   * When set, the boundary is retimed to this duration instead of cut: the
   * downstream side moves by the signed difference and the Transition stays.
   */
  retainDurationMs?: number
}

export type ConvertedBoundaryRepairEligibilityV2 =
  | { status: 'ready'; repair: ConvertedBoundaryRepairV2 }
  | { status: 'ramp-carrier'; transitionId: string }
  | { status: 'ignore' }

export function isConvertedBoundaryTransitionV2(transition: ShowTransitionV2): boolean {
  return transition.origin === 'converted-boundary-transition'
}

/** Classify one Transition for boundary repair without mutating the record. */
export interface ConvertedBoundaryRepairSpecOptionsV2 {
  /**
   * Admit a whole-output boundary with several Clips per side (one per Zone
   * and Layer), as v1 retimes and resets one Scene edge for every Zone (#1066
   * slice 5e2a1). Only the Transition edits (resize, Reset to Cut, the palette
   * retime) opt in: the Clip-edge and temporal gestures move one Clip and
   * stay single-contributor until their own slice.
   */
  multiContributor?: boolean
  /** Resizing retains the carrier and retimes its ramps; removal callers omit this. */
  retimeRampCarrier?: boolean
}

/** The refusal every edit gives a scalar Property ramp carrier it cannot project. */
export function rampCarrierRefusalMessageV2(transitionId: string): string {
  return `Transition "${transitionId}" carries Property ramps. Reset it with an explicit projection plan; its ramp window cannot be resized.`
}

export function convertedBoundaryRepairSpecV2(
  record: ShowRecordV2,
  transitionId: string,
  options?: ConvertedBoundaryRepairSpecOptionsV2,
): ConvertedBoundaryRepairEligibilityV2 {
  const transition = record.composition.transitions.find(candidate => candidate.id === transitionId)
  if (!transition || !isConvertedBoundaryTransitionV2(transition)) return { status: 'ignore' }
  const endpoints = transitionEndpoints(transition)
  if (options?.multiContributor && transition.wholeOutput && (endpoints.from.length > 1 || endpoints.to.length > 1)) {
    return multiContributorBoundaryRepairSpec(record, transition, options.retimeRampCarrier)
  }
  if (endpoints.from.length !== 1 || endpoints.to.length !== 1) return { status: 'ignore' }
  if (!transition.wholeOutput && transition.participants.length !== 1) return { status: 'ignore' }
  if (!options?.retimeRampCarrier && transition.propertyRamps.length > 0 && !transition.propertyRamps.every(isShowTransitionClipValueRampV2)) return transition.wholeOutput ? { status: 'ignore' } : { status: 'ramp-carrier', transitionId: transition.id }
  const from = record.composition.clips.find(clip => clip.id === endpoints.from[0])
  const to = record.composition.clips.find(clip => clip.id === endpoints.to[0])
  if (!from || !to) return { status: 'ignore' }
  if (transition.wholeOutput) {
    if (transition.wholeOutput.startMs !== from.startMs + from.durationMs) return { status: 'ignore' }
  } else {
    const participant = transition.participants[0]
    if (from.zoneId !== participant.zoneId || to.zoneId !== participant.zoneId
      || from.layerId !== participant.layerId || to.layerId !== participant.layerId) return { status: 'ignore' }
  }
  const windowStartMs = from.startMs + from.durationMs
  const windowEndMs = to.startMs
  if (windowStartMs + transition.durationMs !== windowEndMs) return { status: 'ignore' }
  return {
    status: 'ready',
    repair: {
      transitionId: transition.id,
      fromClipIds: [from.id],
      toClipIds: [to.id],
      windowStartMs,
      windowEndMs,
      durationMs: transition.durationMs,
    },
  }
}

/**
 * A whole-output boundary naming several Clips per side: every outgoing
 * contributor ends at the window start and every incoming one starts at the
 * window end, which record validation already pins. Removal of ramp carriers
 * and empty sides stay outside this slice.
 */
function multiContributorBoundaryRepairSpec(record: ShowRecordV2, transition: ShowTransitionV2, retimeRampCarrier = false): ConvertedBoundaryRepairEligibilityV2 {
  const wholeOutput = transition.wholeOutput!
  if (!retimeRampCarrier && transition.propertyRamps.length > 0 && !transition.propertyRamps.every(isShowTransitionClipValueRampV2)) return { status: 'ignore' }
  if (wholeOutput.fromClipIds.length === 0 || wholeOutput.toClipIds.length === 0) return { status: 'ignore' }
  const windowStartMs = wholeOutput.startMs
  const windowEndMs = windowStartMs + transition.durationMs
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const from = wholeOutput.fromClipIds.map(id => clipsById.get(id))
  const to = wholeOutput.toClipIds.map(id => clipsById.get(id))
  if (from.some(clip => !clip || clip.startMs + clip.durationMs !== windowStartMs)) return { status: 'ignore' }
  if (to.some(clip => !clip || clip.startMs !== windowEndMs)) return { status: 'ignore' }
  return {
    status: 'ready',
    repair: {
      transitionId: transition.id,
      fromClipIds: [...wholeOutput.fromClipIds],
      toClipIds: [...wholeOutput.toClipIds],
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
  shiftedLayoutOccurrenceIds: string[]
  shiftedMarkerIds: string[]
  shiftedGroupOccurrenceIds: string[]
  reclaimedMs: number
}

/**
 * Commit converted-boundary cuts on a working candidate. The Clip retime in
 * old coordinates belongs to the caller; this moves the downstream side,
 * reclaims Show End and keeps Layout coverage exact. Returns a refusal
 * message when protected content collides; the caller refuses atomically
 * with its original record.
 *
 * Coordinate frame: `record` is the pre-edit preimage — windows, closures and
 * membership all read it — and every shift applied to `next` is relative
 * (-durationMs). A caller that retimes its edited Clip in old coordinates
 * (both resize owners) passes no options, so the edited Clip rides the
 * reclaim like any other downstream Clip. A caller that already placed a Clip
 * at its requested post-repair coordinates (the re-placement owner: an
 * explicit startMs names the final number, the one the preview paints) names
 * it in `alreadyRelocatedClipIds`, and this commit neither shifts it nor its
 * owned tracks/whole-output windows. The straddle rule does not apply to it:
 * that rule exists to stop a shift cutting a Clip across the window end, and
 * nothing shifts a relocated Clip; a destination collision is caught by record
 * validation with an accurate overlap message.
 */
export interface ConvertedBoundaryRepairCommitOptionsV2 {
  /** Clips already sitting at post-repair coordinates in `next`: excluded from the relative shift. */
  alreadyRelocatedClipIds?: readonly string[]
}

export function commitConvertedBoundaryRepairsV2(
  record: ShowRecordV2,
  next: ShowRecordV2,
  repairs: readonly ConvertedBoundaryRepairV2[],
  options?: ConvertedBoundaryRepairCommitOptionsV2,
): { status: 'applied'; applied: ConvertedBoundaryRepairAppliedV2 } | { status: 'refused'; message: string } {
  // Windows, closures and membership all read the pre-edit record: the caller
  // retimes the edited Clip in old coordinates first, and the repair closes
  // the reclaimed window underneath it. Shifts are absolute, so several
  // repairs compose additively in any order.
  const ordered = [...repairs].sort((left, right) => right.windowEndMs - left.windowEndMs)
  const removedTransitionIds: string[] = []
  const shiftedClipIds = new Set<string>()
  const shiftedTrackIds = new Set<string>()
  const shortenedLayoutOccurrenceIds = new Set<string>()
  const shiftedLayoutOccurrenceIds = new Set<string>()
  const shiftedMarkerIds = new Set<string>()
  const shiftedGroupOccurrenceIds = new Set<string>()
  let reclaimedMs = 0
  for (const repair of ordered) {
    if (!next.composition.transitions.some(candidate => candidate.id === repair.transitionId)) {
      return { status: 'refused', message: `Transition "${repair.transitionId}" is no longer present.` }
    }
    // The signed Show-time change: positive reclaims (cut or shorten), negative
    // inserts (lengthen). A cut reclaims the whole boundary duration.
    const durationMs = repair.durationMs - (repair.retainDurationMs ?? 0)
    const relocated = new Set(options?.alreadyRelocatedClipIds ?? [])
    const shiftIds = new Set(downstreamClosure(record, repair.toClipIds))
    for (const id of relocated) shiftIds.delete(id)
    for (const clip of record.composition.clips) {
      // A relocated Clip already sits at its requested post-repair coordinates
      // and nothing here shifts it, so the straddle rule below has nothing to
      // protect for it: that rule exists because shifting one end of a Clip
      // across the window end would cut it. A destination collision is caught
      // by record validation with an accurate overlap message (#1068).
      if (relocated.has(clip.id)) continue
      if (clip.startMs >= repair.windowEndMs) shiftIds.add(clip.id)
      else if (clip.startMs + clip.durationMs > repair.windowEndMs) {
        return { status: 'refused', message: `Clip "${clip.id}" spans the reclaimed boundary window ending at ${repair.windowEndMs} ms; split or trim it away from the boundary first.` }
      }
    }
    for (const group of record.composition.groupOccurrences) {
      const definition = record.composition.groupDefinitions.find(candidate => candidate.id === group.definitionId)
      const occurrenceEndMs = group.startMs + (definition ? groupOccurrenceDuration(definition, group) : 0)
      if (group.startMs < repair.windowEndMs && occurrenceEndMs > repair.windowEndMs) {
        return { status: 'refused', message: `Group occurrence "${group.id}" spans the reclaimed boundary window ending at ${repair.windowEndMs} ms; move it away from the boundary first.` }
      }
    }
    if (repair.retainDurationMs === undefined) {
      next.composition.transitions = next.composition.transitions.filter(candidate => candidate.id !== repair.transitionId)
    } else {
      const retained = next.composition.transitions.find(candidate => candidate.id === repair.transitionId)!
      retained.propertyRamps = retimeShowTransitionRampsV2(retained, repair.retainDurationMs)
      retained.durationMs = repair.retainDurationMs
    }
    const movedTrackIds = applyShowTransitionClipShiftV2(record, next, [...shiftIds], -durationMs, [repair.transitionId], repair.windowEndMs)
    for (const id of shiftIds) shiftedClipIds.add(id)
    for (const id of movedTrackIds) shiftedTrackIds.add(id)
    // The outgoing Clip's own track - the outgoing Scene's, whose converted
    // activation ends at Scene end plus the outgoing Transition - retimes its
    // end with the window, as v1 does. Only that Clip's tracks follow (by Clip,
    // or by an instance only it uses); a relocated outgoing Clip already sits
    // at post-repair coordinates, so its tracks rode the relocation instead.
    const movedTrackSet = new Set(movedTrackIds)
    const outgoingClipIds = new Set(repair.fromClipIds.filter(id => !relocated.has(id)))
    const soleOutgoingInstanceIds = new Set(repair.fromClipIds.flatMap(id => {
      if (!outgoingClipIds.has(id)) return []
      const instanceId = record.composition.clips.find(clip => clip.id === id)?.instanceId
      return instanceId && effectiveShowInstanceUseCountV2(record, instanceId) === 1 ? [instanceId] : []
    }))
    for (const track of next.composition.propertyTracks) {
      if (movedTrackSet.has(track.id)) continue
      const followsOutgoing = 'clipId' in track.target
        ? outgoingClipIds.has(track.target.clipId)
        : 'instanceId' in track.target && soleOutgoingInstanceIds.has(track.target.instanceId)
      if (!followsOutgoing) continue
      const activation = reclaimActivationV2(track.activeStartMs, track.activeDurationMs, repair.windowEndMs, durationMs)
      if (!activation || (activation.activeStartMs === track.activeStartMs && activation.activeDurationMs === track.activeDurationMs)) continue
      if (activation.activeStartMs !== track.activeStartMs) continue
      track.activeDurationMs = activation.activeDurationMs
      shiftedTrackIds.add(track.id)
    }
    next.composition.showEndMs -= durationMs
    reclaimedMs += durationMs
    if (repair.retainDurationMs === undefined) removedTransitionIds.push(repair.transitionId)
    // Show-scoped repeat-scale tracks are global Show time that no Clip owns,
    // so the Clip shift above never moves them. v1 holds the same value per
    // Scene, and the reclaim shortens the loop, so keys after the window move
    // earlier and an activation reaching past the window shortens by the same
    // duration. A key inside the reclaimed window has no v1 position; refuse.
    for (const track of record.composition.propertyTracks) {
      if (track.target?.kind !== 'show-repeat-scale') continue
      const live = next.composition.propertyTracks.find(candidate => candidate.id === track.id)
      if (!live) continue
      if (track.keyframes.some(key => key.timeMs > repair.windowStartMs && key.timeMs < repair.windowEndMs)) {
        return { status: 'refused', message: `Property track "${track.id}" holds a key inside the reclaimed boundary window; move it out of the window first.` }
      }
      // Repairs apply latest-window-first, so the live activation below an
      // earlier window still reads preimage coordinates and stacked reclaims
      // compose additively.
      const activation = reclaimActivationV2(live.activeStartMs, live.activeDurationMs, repair.windowEndMs, durationMs)
      if (!activation) {
        return { status: 'refused', message: `Property track "${track.id}" ends inside the reclaimed boundary window; move it out of the window first.` }
      }
      let changed = activation.activeStartMs !== live.activeStartMs || activation.activeDurationMs !== live.activeDurationMs
      Object.assign(live, activation)
      track.keyframes.forEach((key, index) => {
        if (key.timeMs < repair.windowEndMs) return
        live.keyframes[index].timeMs -= durationMs
        changed = true
      })
      if (changed) shiftedTrackIds.add(track.id)
    }
    // Converted Scene labels materialize v1 Scene starts, which move with the
    // reclaim; authored guides are absolute Show times v1 leaves on the same
    // edit, so they stay. Membership reads the pre-edit record so stacked
    // repairs compose additively.
    for (const marker of record.composition.markers) {
      if (marker.origin !== 'converted-scene-label' || marker.timeMs < repair.windowEndMs) continue
      next.composition.markers.find(candidate => candidate.id === marker.id)!.timeMs -= durationMs
      shiftedMarkerIds.add(marker.id)
    }
    // Group occurrences are global Show times; v1 anchors the same content to
    // its Scene start, which the reclaim moves, so the occurrence and its
    // track activation move with the downstream side. Holds and definition
    // content stay definition-local.
    for (const group of record.composition.groupOccurrences) {
      if (group.startMs < repair.windowEndMs) continue
      const live = next.composition.groupOccurrences.find(candidate => candidate.id === group.id)!
      live.startMs -= durationMs
      if (live.trackActivation) live.trackActivation.startMs -= durationMs
      shiftedGroupOccurrenceIds.add(group.id)
    }
    // The reclaimed window leaves Layout coverage from inside one occurrence:
    // that occurrence absorbs the reclaim and every later occurrence moves
    // earlier by the same duration, so shifted content keeps its Layout. A
    // window that is not inside one occurrence, or an owning occurrence that
    // cannot cover the reclaim, refuses the whole edit atomically. Repairs
    // apply latest-window-first, so an earlier window always reads occurrence
    // positions no earlier repair has moved.
    const orderedOccurrences = [...next.composition.layoutOccurrences]
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    const ownerIndex = orderedOccurrences.findIndex((occurrence) => (
      occurrence.startMs <= repair.windowStartMs
      && repair.windowStartMs < occurrence.startMs + occurrence.durationMs
    ))
    const owner = ownerIndex < 0 ? undefined : orderedOccurrences[ownerIndex]
    if (!owner || repair.windowEndMs > owner.startMs + owner.durationMs) {
      return { status: 'refused', message: `The reclaimed boundary window ending at ${repair.windowEndMs} ms is not inside one Layout occurrence; consolidate Layouts first.` }
    }
    const live = next.composition.layoutOccurrences.find(candidate => candidate.id === owner.id)!
    if (durationMs > 0 && live.durationMs <= durationMs) {
      return { status: 'refused', message: `Layout occurrence "${owner.id}" cannot absorb the reclaimed ${durationMs} ms boundary window; consolidate Layouts first.` }
    }
    live.durationMs -= durationMs
    const shiftedLayoutIdsThisRepair = new Set<string>()
    for (const later of orderedOccurrences.slice(ownerIndex + 1)) {
      next.composition.layoutOccurrences.find(candidate => candidate.id === later.id)!.startMs -= durationMs
      shiftedLayoutOccurrenceIds.add(later.id)
      shiftedLayoutIdsThisRepair.add(later.id)
    }
    shortenedLayoutOccurrenceIds.add(owner.id)
    // Layout-owned animation is anchored to its occurrence interval: the
    // owning occurrence absorbs the reclaim in place, so its tracks stay, but
    // a shifted occurrence carries its tracks with it.
    for (const track of next.composition.propertyTracks) {
      if (track.target.kind !== 'layout-occurrence-split-position') continue
      if (!shiftedLayoutIdsThisRepair.has(track.target.layoutOccurrenceId)) continue
      track.activeStartMs -= durationMs
      track.keyframes.forEach(keyframe => { keyframe.timeMs -= durationMs })
      shiftedTrackIds.add(track.id)
    }
  }
  // A shifted occurrence keeps its Layout association exact. Ownership is
  // preserved by construction (the owner absorbs, later occurrences move
  // rigidly), so this rebinds a stale binding instead of inventing one; an
  // unshifted occurrence keeps the binding the preimage validated.
  for (const id of shiftedGroupOccurrenceIds) {
    const shifted = next.composition.groupOccurrences.find(candidate => candidate.id === id)!
    const association = showLayoutOccurrenceAtTimeV2(next, shifted.startMs)
    if (association && association.id !== shifted.layoutOccurrenceId) shifted.layoutOccurrenceId = association.id
  }
  return {
    status: 'applied',
    applied: {
      removedTransitionIds: removedTransitionIds.sort(),
      shiftedClipIds: [...shiftedClipIds].sort(),
      shiftedTrackIds: [...shiftedTrackIds].sort(),
      shortenedLayoutOccurrenceIds: [...shortenedLayoutOccurrenceIds].sort(),
      shiftedLayoutOccurrenceIds: [...shiftedLayoutOccurrenceIds].sort(),
      shiftedMarkerIds: [...shiftedMarkerIds].sort(),
      shiftedGroupOccurrenceIds: [...shiftedGroupOccurrenceIds].sort(),
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
  if (issue) return validatorRefusedResult(record, issue)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const moved = new Set(committed.applied.shiftedClipIds)
  const unavailable = firstUnavailableContributor(next, [...new Set([...moved, ...repair.fromClipIds, ...repair.toClipIds])])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  return {
    status: 'changed',
    record: next,
    affectedClipIds: [...moved].sort(),
    affectedTransitionIds: [...new Set([repair.transitionId, ...affectedTransitionIdsFor(record, moved)])].sort(),
    affectedTrackIds: committed.applied.shiftedTrackIds,
    affectedInstanceIds: [], affectedKeyframeIds: [],
    affectedLayoutOccurrenceIds: [...new Set([...committed.applied.shortenedLayoutOccurrenceIds, ...committed.applied.shiftedLayoutOccurrenceIds])].sort(),
    affectedMarkerIds: committed.applied.shiftedMarkerIds,
    affectedGroupOccurrenceIds: committed.applied.shiftedGroupOccurrenceIds,
    removedIds: repair.retainDurationMs === undefined ? [repair.transitionId] : [],
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
  if (issue) return validatorRefusedResult(record, issue)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const moved = new Set([clip.id, ...committed.applied.shiftedClipIds])
  const unavailable = firstUnavailableContributor(next, [...new Set([...moved, ...repair.fromClipIds, ...repair.toClipIds])])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  return {
    status: 'changed',
    record: next,
    affectedClipIds: [...moved].sort(),
    affectedTransitionIds: [...new Set([repair.transitionId, ...affectedTransitionIdsFor(record, moved)])].sort(),
    affectedTrackIds: [...new Set([...trackEdit.affectedTrackIds, ...committed.applied.shiftedTrackIds])].sort(),
    affectedInstanceIds: [], affectedKeyframeIds: [],
    affectedLayoutOccurrenceIds: [...new Set([...committed.applied.shortenedLayoutOccurrenceIds, ...committed.applied.shiftedLayoutOccurrenceIds])].sort(),
    affectedMarkerIds: committed.applied.shiftedMarkerIds,
    affectedGroupOccurrenceIds: committed.applied.shiftedGroupOccurrenceIds,
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
  if (boundary.status === 'ramp-carrier') return refusedResult(record, 'unsupported-property-carrier', rampCarrierRefusalMessageV2(boundary.transitionId))
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
  if (issue) return validatorRefusedResult(record, issue)
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
    affectedTrackIds: [...new Set([...trackEdit.affectedTrackIds, ...shiftedTrackIds])].sort(),
    affectedInstanceIds: [], affectedKeyframeIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [], removedIds: [],
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
  if (issue) return validatorRefusedResult(record, issue)
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
  if (boundary.status === 'ramp-carrier') return refusedResult(record, 'unsupported-property-carrier', rampCarrierRefusalMessageV2(boundary.transitionId))
  const durationMs = transition.durationMs + startMs - clip.startMs
  // A zero or negative incoming window extends the Clip and removes the
  // Transition in place, with no ripple (Jon, 2026-09-24, #1111-C).
  if (durationMs <= 0) return extendLeadingThroughTransitionV2(record, clip, startMs, transition)
  if (boundary.status === 'ready') {
    if (startMs < clip.startMs) return refusedResult(record, 'invalid-topology', `Clip "${clip.id}" meets converted Scene-boundary Transition "${boundary.repair.transitionId}" at the Scene edge; it cannot extend into the boundary. Reset the Transition explicitly first.`)
    return resizeConvertedBoundaryEdge(record, clip, startMs, oldEndMs, boundary.repair)
  }
  const next = structuredClone(record)
  const trackEdit = applyLeadingClipEdit(record, next, clip, startMs)
  next.composition.transitions = next.composition.transitions.map(candidate => candidate.id === transition.id
    ? { ...candidate, durationMs, propertyRamps: retimeShowTransitionRampsV2(candidate, durationMs) }
    : candidate)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return validatorRefusedResult(record, issue)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const unavailable = firstUnavailableContributor(next, [...new Set([clip.id, ...endpoints.all])])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  return {
    status: 'changed', record: next, affectedClipIds: [clip.id], affectedTransitionIds: [transition.id],
    affectedTrackIds: trackEdit.affectedTrackIds.sort(),
    affectedInstanceIds: [], affectedKeyframeIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [], removedIds: [],
  }
}

/**
 * Move the selected Clip's start to `startMs` with its end fixed, writing the
 * Property tracks and appearance keys into `next`. Returns the track edit.
 */
function applyLeadingClipEdit(record: ShowRecordV2, next: ShowRecordV2, clip: ShowClipV2, startMs: number) {
  const oldEndMs = clip.startMs + clip.durationMs
  const trackEdit = editShowClipPropertyTracksV2(record, clip, {
    kind: startMs > clip.startMs ? 'trim' : 'extend',
    startMs,
    endMs: oldEndMs,
  })
  next.composition.propertyTracks = trackEdit.propertyTracks
  const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
  edited.startMs = startMs
  edited.durationMs = oldEndMs - startMs
  const held = [...clip.appearance.keys].reverse().find(key => key.timeMs <= startMs) ?? clip.appearance.keys[0]
  edited.appearance.keys = [
    { ...structuredClone(held), timeMs: startMs },
    ...structuredClone(clip.appearance.keys.filter(key => key !== held && key.timeMs > startMs && key.timeMs < oldEndMs)),
  ]
  return trackEdit
}

/**
 * A leading resize whose incoming window closes (duration <= 0) extends the
 * Clip to the requested start and removes the Transition, its Property ramps
 * and contributor sets in the same edit. Nothing else moves: no ripple, and
 * Show End stays fixed. Clip-value ramps go with the Transition; a scalar
 * Property ramp needs a projection plan this intent cannot carry, so it
 * refuses. Otherwise only the validator can refuse (Jon, 2026-09-24, #1111-C).
 */
function extendLeadingThroughTransitionV2(
  record: ShowRecordV2,
  clip: ShowClipV2,
  startMs: number,
  transition: ShowTransitionV2,
): ShowTransitionEditResultV2 {
  if (!transition.propertyRamps.every(isShowTransitionClipValueRampV2)) {
    return refusedResult(record, 'unsupported-property-carrier', rampCarrierRefusalMessageV2(transition.id))
  }
  const endpoints = transitionEndpoints(transition)
  const next = structuredClone(record)
  next.composition.transitions = next.composition.transitions.filter(candidate => candidate.id !== transition.id)
  const trackEdit = applyLeadingClipEdit(record, next, clip, startMs)
  const issue = validateShowRecordV2(next)[0]
  if (issue) return validatorRefusedResult(record, issue)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refusedResult(record, 'compiler-ineligible', compilerRestriction.message)
  const unavailable = firstUnavailableContributor(next, [...new Set([clip.id, ...endpoints.all])])
  if (unavailable) return refusedResult(record, 'unsupported-layout', unavailable)
  return {
    status: 'changed', record: next, affectedClipIds: [clip.id], affectedTransitionIds: [],
    affectedTrackIds: trackEdit.affectedTrackIds.sort(),
    affectedInstanceIds: [], affectedKeyframeIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [], removedIds: [transition.id],
  }
}

function unchangedResult(record: ShowRecordV2): ShowTransitionEditResultV2 {
  return {
    status: 'unchanged', record, affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedInstanceIds: [], affectedKeyframeIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [], removedIds: [],
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
  if (issue) return validatorRefusedResult(record, issue)
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
    affectedInstanceIds: [], affectedKeyframeIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [],
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
    // A window with no endpoints has nothing to follow, so it stays anchored
    // while exact-match validation refuses any edit that breaks it. Without
    // the length gate the every below is vacuously true and any unrelated
    // Clip move silently shifts every empty/empty boundary (#1068).
    if (endpoints.all.length > 0 && endpoints.all.every(id => moved.has(id))) transition.wholeOutput.startMs += deltaMs
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
): Extract<ShowTransitionEditResultV2, { status: 'refused' }> {
  return {
    status: 'refused', record, code, message,
    affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedInstanceIds: [], affectedKeyframeIds: [], affectedLayoutOccurrenceIds: [], affectedMarkerIds: [], affectedGroupOccurrenceIds: [], removedIds: [],
  }
}

function validatorRefusedResult(record: ShowRecordV2, issue: ShowCompositionV2ValidationIssue): ShowTransitionEditResultV2 {
  return { ...refusedResult(record, 'invalid-result', `${issue.path}: ${issue.message}`), issueCode: issue.code }
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

export function applyShowTransitionClipShiftV2(source: ShowRecordV2, next: ShowRecordV2, clipIds: readonly string[], deltaMs: number, excludedTransitionIds: readonly string[] = [], reclaimWindowEndMs?: number): string[] {
  const moved = new Set(clipIds)
  shiftClips(next, clipIds, deltaMs)
  const affectedTrackIds = shiftOwnedTracks(source, next.composition.propertyTracks, moved, deltaMs, reclaimWindowEndMs)
  shiftWholeOutputWindows(source, next, moved, deltaMs, new Set(excludedTransitionIds))
  return affectedTrackIds
}

/**
 * Retime one activation through a converted-boundary reclaim (#1068). v1
 * shortens the loop by the boundary duration: an activation starting at or
 * after the reclaimed window moves earlier with its Scene, and one starting
 * before the window end but reaching past it keeps its start and shortens,
 * because the converter derives it from a Scene start minus an incoming
 * Transition that the reclaim removes. An activation that starts inside the
 * reclaimed window starts at the window start after the reclaim; one that
 * ends inside it has no v1 position and returns null, which the Show-scoped
 * caller refuses.
 */
function reclaimActivationV2(activeStartMs: number, activeDurationMs: number, windowEndMs: number, durationMs: number): { activeStartMs: number; activeDurationMs: number } | null {
  const windowStartMs = windowEndMs - durationMs
  const activeEndMs = activeStartMs + activeDurationMs
  if (activeStartMs >= windowEndMs) return { activeStartMs: activeStartMs - durationMs, activeDurationMs }
  // A lengthened boundary inserts time at the window end: an activation
  // reaching it extends by the same amount.
  if (durationMs < 0) return activeEndMs >= windowEndMs ? { activeStartMs, activeDurationMs: activeDurationMs - durationMs } : { activeStartMs, activeDurationMs }
  if (activeEndMs <= windowStartMs) return { activeStartMs, activeDurationMs }
  if (activeEndMs < windowEndMs) return null
  const startMs = Math.min(activeStartMs, windowStartMs)
  return { activeStartMs: startMs, activeDurationMs: activeEndMs - durationMs - startMs }
}
/**
 * A Clip's contribution window in `record`: its own span widened by every
 * Transition it enters (earlier by that Transition's duration) or leaves (later
 * by that Transition's duration).
 */
function contributionWindow(record: ShowRecordV2, clipId: string): { startMs: number; endMs: number } {
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

/**
 * Move a moved Clip's owned Property tracks with it (#1068). Keys always move
 * by `deltaMs`. The activation moves with them only when it lies inside the
 * owning Clip's contribution window in `source`; a wider activation - a
 * converted Scene-span track, which v1 held as a Scene-local track with no
 * activation - stays in place, matching v1 then convert. A shifted key that
 * leaves its activation is refused by record validation. Inside the
 * converted-boundary repair the caller passes the reclaimed window end, and the
 * activation follows the shared reclaim rule instead (`reclaimActivationV2`).
 */
function shiftOwnedTracks(
  source: ShowRecordV2,
  tracks: ShowPropertyTrackV2[],
  moved: Set<string>,
  deltaMs: number,
  reclaimWindowEndMs?: number,
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
    const ownerClipId = 'clipId' in track.target
      ? track.target.clipId
      : [...moved].find(clipId => source.composition.clips.find(clip => clip.id === clipId)?.instanceId === (track.target as { instanceId: string }).instanceId)!
    const window = contributionWindow(source, ownerClipId)
    if (reclaimWindowEndMs !== undefined) {
      const activation = reclaimActivationV2(track.activeStartMs, track.activeDurationMs, reclaimWindowEndMs, -deltaMs)
      if (activation) Object.assign(track, activation)
    } else if (track.activeStartMs >= window.startMs && track.activeStartMs + track.activeDurationMs <= window.endMs) {
      track.activeStartMs += deltaMs
    }
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

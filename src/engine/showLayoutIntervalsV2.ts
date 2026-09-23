import { promoteConvertedBoundariesToWholeOutputV2 } from './showBoundaryScopeV2'
import { groupOccurrenceDuration, materializeShowGroupsV2 } from './showGroupsV2'
import { ownedShowIdsV2 } from './showIdentityV2'
import {
  editShowZoneLayoutDefinitionV2,
  type ShowZoneLayoutDefinitionIntentV2,
  type ShowZoneLayoutDefinitionRefusalV2,
} from './showZoneLayoutDefinitionsV2'
import {
  validateShowRecordV2,
  type ShowClipV2,
  type ShowLayoutOccurrenceV2,
  type ShowLayoutTransferV2,
  type ShowPropertyTargetV2,
  type ShowRecordV2,
} from './showCompositionV2'

/**
 * Complete fresh identity for every entity a content duplication copies: each
 * Clip, appearance key, Clip-owned Property track, keyframe, Transition,
 * Transition participant, Group occurrence and Group-local hold inside the
 * duplicated interval. Identity is never allocated inside this owner.
 */
export interface ShowLayoutDuplicateContentPlanV2 {
  idsBySourceId: Readonly<Record<string, string>>
}

export type ShowLayoutEditIntentV2 =
  | { kind: 'insert'; occurrenceId: string; atMs: number; layoutId: string }
  | { kind: 'append'; occurrenceId: string; durationMs: number; layoutId: string; definition?: Extract<ShowZoneLayoutDefinitionIntentV2, { kind: 'add' | 'duplicate' }> }
  | { kind: 'set-show-end'; showEndMs: number }
  | { kind: 'move'; occurrenceId: string; startMs: number }
  | { kind: 'select-layout'; occurrenceId: string; layoutId: string }
  | { kind: 'set-parameters'; occurrenceId: string; parameters: { splitPosition?: number } }
  | { kind: 'make-unique'; occurrenceId: string; layoutId: string; name: string }
  | { kind: 'remove'; occurrenceId: string }
  | { kind: 'remove-switch'; occurrenceId: string }
  | {
    kind: 'duplicate'
    occurrenceId: string
    newOccurrenceId: string
    /** Omitted duplicates an empty span of the same routing. */
    content?: ShowLayoutDuplicateContentPlanV2
  }
  | {
    kind: 'set-transfer'
    occurrenceId: string
    transfer: Omit<ShowLayoutTransferV2, 'fromOccurrenceId'> | null
  }

export type ShowLayoutEditRefusalV2 =
  | 'invalid-record'
  | 'missing-layout'
  | 'missing-occurrence'
  | 'invalid-intent'
  | 'invalid-transfer'
  | 'meaningful-occurrence-data'
  | 'protected-content'
  | 'owned-track-out-of-bounds'
  | 'boundary-crossing-content'
  | 'unsupported-content-copy'
  | 'time-overflow'
  | 'zone-unavailable'
  | 'invalid-result'

interface ShowLayoutEditAffectedV2 {
  affectedClipIds: string[]
  affectedGroupOccurrenceIds: string[]
  affectedLayoutDefinitionIds: string[]
  affectedLayoutOccurrenceIds: string[]
  affectedMarkerIds: string[]
  affectedTrackIds: string[]
  affectedTransitionIds: string[]
  removedLayoutOccurrenceIds: string[]
}

export type ShowLayoutEditResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowLayoutEditAffectedV2)
  | ({ status: 'unchanged'; record: ShowRecordV2 } & ShowLayoutEditAffectedV2)
  | ({
    status: 'refused'
    record: ShowRecordV2
    code: ShowLayoutEditRefusalV2
    message: string
  } & ShowLayoutEditAffectedV2)

export interface ShowLayoutAvailabilityIssueV2 {
  entityKind: 'clip' | 'group-occurrence'
  entityId: string
  zoneId: string
  startMs: number
  endMs: number
  layoutOccurrenceId: string
  layoutId: string
}

/** Resolve the occurrence owning a half-open Show instant. */
export function showLayoutOccurrenceAtTimeV2(
  record: ShowRecordV2,
  timeMs: number,
): ShowLayoutOccurrenceV2 | null {
  if (!Number.isSafeInteger(timeMs) || timeMs < 0 || timeMs >= record.composition.showEndMs) return null
  return orderedOccurrences(record).find(occurrence => (
    occurrence.startMs <= timeMs && occurrence.startMs + occurrence.durationMs > timeMs
  )) ?? null
}

/** Choose the preferred Zone when present, otherwise the first Zone in the active Layout. */
export function showLayoutZoneIdAtTimeV2(
  record: ShowRecordV2,
  timeMs: number,
  preferredZoneId?: string | null,
): string | null {
  const occurrence = showLayoutOccurrenceAtTimeV2(record, timeMs)
  if (!occurrence) return null
  const zoneIds = layoutZoneIds(record, occurrence.layoutId)
  if (preferredZoneId && zoneIds.includes(preferredZoneId)) return preferredZoneId
  return zoneIds[0] ?? null
}

/**
 * Check complete Clip contribution, including positive incoming and outgoing
 * visual windows, against every Layout occurrence it intersects.
 */
export function validateClipLayoutAvailabilityV2(
  record: ShowRecordV2,
  clipIds?: readonly string[],
): ShowLayoutAvailabilityIssueV2[] {
  const selected = clipIds ? new Set(clipIds) : null
  return record.composition.clips.flatMap(clip => {
    if (selected && !selected.has(clip.id)) return []
    const interval = clipContributionInterval(record, clip)
    return unavailableIntervals(record, 'clip', clip.id, clip.zoneId, interval.startMs, interval.endMs)
  })
}

/** Validate ordinary Clips and materialized Group children at the routing boundary. */
export function validateShowLayoutAvailabilityV2(record: ShowRecordV2): ShowLayoutAvailabilityIssueV2[] {
  const clipIssues = validateClipLayoutAvailabilityV2(record)
  if (record.composition.groupOccurrences.length === 0) return clipIssues
  const expanded = materializeShowGroupsV2(record)
  const ordinaryIds = new Set(record.composition.clips.map(clip => clip.id))
  const groupIssues = validateClipLayoutAvailabilityV2(expanded)
    .filter(issue => !ordinaryIds.has(issue.entityId))
    .flatMap(issue => {
      const occurrence = [...record.composition.groupOccurrences]
        .sort((left, right) => right.id.length - left.id.length)
        .find(candidate => issue.entityId.startsWith(`${candidate.id}:`))
      return occurrence ? [{
        ...issue,
        entityKind: 'group-occurrence' as const,
        entityId: occurrence.id,
      }] : []
    })
  return [...clipIssues, ...deduplicateAvailabilityIssues(groupIssues)]
}

/** Map a definition-owner refusal onto the nearest Layout occurrence code. Add/duplicate can only fail on identity, naming or a missing source. */
function mapDefinitionRefusal(code: ShowZoneLayoutDefinitionRefusalV2): ShowLayoutEditRefusalV2 {
  switch (code) {
    case 'invalid-record':
      return 'invalid-record'
    case 'missing-target':
      return 'missing-layout'
    case 'zone-unavailable':
      return 'zone-unavailable'
    case 'invalid-result':
      return 'invalid-result'
    default:
      return 'invalid-intent'
  }
}

/** Additive pure v2 owner. Store adoption, history and persistence remain caller-owned. */
export function editShowLayoutIntervalsV2(
  record: ShowRecordV2,
  intent: ShowLayoutEditIntentV2,
): ShowLayoutEditResultV2 {
  const empty = (): ShowLayoutEditAffectedV2 => ({
    affectedClipIds: [],
    affectedGroupOccurrenceIds: [],
    affectedLayoutDefinitionIds: [],
    affectedLayoutOccurrenceIds: [],
    affectedMarkerIds: [],
    affectedTrackIds: [],
    affectedTransitionIds: [],
    removedLayoutOccurrenceIds: [],
  })
  const refuse = (code: ShowLayoutEditRefusalV2, message: string): ShowLayoutEditResultV2 => ({
    status: 'refused', record, code, message, ...empty(),
  })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  const unavailablePreimage = validateShowLayoutAvailabilityV2(record)[0]
  if (unavailablePreimage) {
    return refuse(
      'invalid-record',
      `${unavailablePreimage.entityKind} "${unavailablePreimage.entityId}" uses an unavailable Zone in Layout occurrence "${unavailablePreimage.layoutOccurrenceId}".`,
    )
  }
  let next = structuredClone(record)
  let affectedLayoutOccurrenceIds: string[] = []
  let removedLayoutOccurrenceIds: string[] = []
  const duplicated: Pick<
    ShowLayoutEditAffectedV2,
    'affectedClipIds' | 'affectedMarkerIds' | 'affectedTrackIds' | 'affectedTransitionIds' | 'affectedGroupOccurrenceIds'
  > = { affectedClipIds: [], affectedMarkerIds: [], affectedTrackIds: [], affectedTransitionIds: [], affectedGroupOccurrenceIds: [] }
  if (intent.kind === 'duplicate') {
    const source = record.composition.layoutOccurrences.find(candidate => candidate.id === intent.occurrenceId)
    if (!source) return refuse('missing-occurrence', `Layout occurrence "${intent.occurrenceId}" does not exist.`)
    const outcome = duplicateLayoutOccurrence(record, next, source, intent)
    if ('code' in outcome) return refuse(outcome.code, outcome.message)
    affectedLayoutOccurrenceIds = outcome.affectedLayoutOccurrenceIds
    duplicated.affectedClipIds = outcome.affectedClipIds
    duplicated.affectedMarkerIds = outcome.affectedMarkerIds
    duplicated.affectedTrackIds = outcome.affectedTrackIds
    duplicated.affectedTransitionIds = outcome.affectedTransitionIds
    duplicated.affectedGroupOccurrenceIds = outcome.affectedGroupOccurrenceIds
  } else if (intent.kind === 'insert') {
    if (!record.zoneLayouts.some(layout => layout.id === intent.layoutId)) {
      return refuse('missing-layout', `Zone Layout "${intent.layoutId}" does not exist.`)
    }
    if (!intent.occurrenceId.trim()
      || record.composition.layoutOccurrences.some(occurrence => occurrence.id === intent.occurrenceId)
      || !Number.isSafeInteger(intent.atMs)
      || intent.atMs <= 0
      || intent.atMs >= record.composition.showEndMs) {
      return refuse('invalid-intent', 'Insert requires a fresh occurrence identity and an interior safe-integer Show time.')
    }
    const owner = showLayoutOccurrenceAtTimeV2(record, intent.atMs)
    if (!owner || owner.startMs === intent.atMs) {
      return refuse('invalid-intent', 'Insert requires a time strictly inside one Layout occurrence.')
    }
    const index = next.composition.layoutOccurrences.findIndex(occurrence => occurrence.id === owner.id)
    const edited = next.composition.layoutOccurrences[index]
    const previousEndMs = edited.startMs + edited.durationMs
    edited.durationMs = intent.atMs - edited.startMs
    next.composition.layoutOccurrences.splice(index + 1, 0, {
      id: intent.occurrenceId,
      layoutId: intent.layoutId,
      startMs: intent.atMs,
      durationMs: previousEndMs - intent.atMs,
      parameters: {},
    })
    affectedLayoutOccurrenceIds = [owner.id, intent.occurrenceId]
  } else if (intent.kind === 'append') {
    let base = record
    if (intent.definition) {
      if (intent.definition.layoutId !== intent.layoutId) {
        return refuse('invalid-intent', 'An appended Zone Layout definition must carry the appended occurrence Layout identity.')
      }
      const defined = editShowZoneLayoutDefinitionV2(record, intent.definition)
      if (defined.status === 'refused') return refuse(mapDefinitionRefusal(defined.code), defined.message)
      if (defined.status === 'unchanged') return refuse('invalid-intent', 'The appended Zone Layout definition was not applied.')
      base = defined.record
      next = structuredClone(base)
    }
    if (!base.zoneLayouts.some(layout => layout.id === intent.layoutId)) {
      return refuse('missing-layout', `Zone Layout "${intent.layoutId}" does not exist.`)
    }
    const newEndMs = base.composition.showEndMs + intent.durationMs
    if (!intent.occurrenceId.trim()
      || base.composition.layoutOccurrences.some(occurrence => occurrence.id === intent.occurrenceId)
      || !Number.isSafeInteger(intent.durationMs)
      || intent.durationMs <= 0
      || !Number.isSafeInteger(newEndMs)) {
      return refuse('invalid-intent', 'Append requires a fresh occurrence identity and a positive safe-integer duration.')
    }
    next.composition.layoutOccurrences.push({
      id: intent.occurrenceId,
      layoutId: intent.layoutId,
      startMs: base.composition.showEndMs,
      durationMs: intent.durationMs,
      parameters: {},
    })
    next.composition.showEndMs = newEndMs
    affectedLayoutOccurrenceIds = [intent.occurrenceId]
  } else if (intent.kind === 'set-show-end') {
    if (!Number.isSafeInteger(intent.showEndMs) || intent.showEndMs <= 0) {
      return refuse('invalid-intent', 'Show End must be a positive safe-integer millisecond time.')
    }
    const previousEndMs = record.composition.showEndMs
    if (intent.showEndMs === previousEndMs) return { status: 'unchanged', record, ...empty() }
    const ordered = orderedOccurrences(next)
    if (intent.showEndMs > previousEndMs) {
      const last = next.composition.layoutOccurrences.find(candidate => candidate.id === ordered[ordered.length - 1].id)!
      last.durationMs += intent.showEndMs - previousEndMs
      next.composition.showEndMs = intent.showEndMs
      affectedLayoutOccurrenceIds = [last.id]
    } else {
      const protectedReason = showEndProtectionIssue(record, intent.showEndMs)
      if (protectedReason) return refuse('protected-content', protectedReason)
      const containing = ordered.find(occurrence => (
        occurrence.startMs < intent.showEndMs
        && occurrence.startMs + occurrence.durationMs >= intent.showEndMs
      ))
      if (!containing) return refuse('invalid-intent', 'Show End must leave one positive Layout occurrence.')
      removedLayoutOccurrenceIds = ordered
        .filter(occurrence => occurrence.startMs >= intent.showEndMs)
        .map(occurrence => occurrence.id)
      next.composition.layoutOccurrences = next.composition.layoutOccurrences
        .filter(occurrence => !removedLayoutOccurrenceIds.includes(occurrence.id))
      const last = next.composition.layoutOccurrences.find(candidate => candidate.id === containing.id)!
      const durationMs = intent.showEndMs - last.startMs
      affectedLayoutOccurrenceIds = durationMs === last.durationMs ? [] : [last.id]
      last.durationMs = durationMs
      next.composition.showEndMs = intent.showEndMs
    }
  } else if (intent.kind === 'move') {
    const ordered = orderedOccurrences(next)
    const index = ordered.findIndex(occurrence => occurrence.id === intent.occurrenceId)
    if (index < 0) return refuse('missing-occurrence', `Layout occurrence "${intent.occurrenceId}" does not exist.`)
    if (index === 0 || !Number.isSafeInteger(intent.startMs)) {
      return refuse('invalid-intent', 'Only a noninitial switch can move to a safe-integer time.')
    }
    const previous = ordered[index - 1]
    const occurrence = ordered[index]
    const endMs = occurrence.startMs + occurrence.durationMs
    if (intent.startMs <= previous.startMs || intent.startMs >= endMs) {
      return refuse('invalid-intent', 'A moved switch must leave both neighboring Layout occurrences nonempty.')
    }
    if (intent.startMs === occurrence.startMs) return { status: 'unchanged', record, ...empty() }
    const nextPrevious = next.composition.layoutOccurrences.find(candidate => candidate.id === previous.id)!
    const nextOccurrence = next.composition.layoutOccurrences.find(candidate => candidate.id === occurrence.id)!
    nextPrevious.durationMs = intent.startMs - previous.startMs
    nextOccurrence.startMs = intent.startMs
    nextOccurrence.durationMs = endMs - intent.startMs
    affectedLayoutOccurrenceIds = [previous.id, occurrence.id]
  } else {
    const ordered = orderedOccurrences(next)
    const index = ordered.findIndex(occurrence => occurrence.id === intent.occurrenceId)
    if (index < 0) return refuse('missing-occurrence', `Layout occurrence "${intent.occurrenceId}" does not exist.`)
    const occurrence = next.composition.layoutOccurrences.find(candidate => candidate.id === intent.occurrenceId)!
    if (intent.kind === 'select-layout') {
      if (!record.zoneLayouts.some(layout => layout.id === intent.layoutId)) {
        return refuse('missing-layout', `Zone Layout "${intent.layoutId}" does not exist.`)
      }
      if (occurrence.layoutId === intent.layoutId) return { status: 'unchanged', record, ...empty() }
      occurrence.layoutId = intent.layoutId
    } else if (intent.kind === 'set-parameters') {
      const splitPosition = intent.parameters.splitPosition
      if (splitPosition !== undefined
        && (!Number.isFinite(splitPosition) || splitPosition < 0 || splitPosition > 1)) {
        return refuse('invalid-intent', 'Layout split position must be finite and between zero and one.')
      }
      if (JSON.stringify(occurrence.parameters) === JSON.stringify(intent.parameters)) {
        return { status: 'unchanged', record, ...empty() }
      }
      occurrence.parameters = structuredClone(intent.parameters)
    } else if (intent.kind === 'set-transfer') {
      if (index === 0) return refuse('invalid-transfer', 'The first Layout occurrence cannot own an incoming transfer.')
      if (intent.transfer === null) {
        if (!occurrence.incomingTransfer) return { status: 'unchanged', record, ...empty() }
        delete occurrence.incomingTransfer
      } else {
        const duplicateId = next.composition.layoutOccurrences.some(candidate => (
          candidate.id !== occurrence.id && candidate.incomingTransfer?.id === intent.transfer!.id
        ))
        if (!intent.transfer.id.trim()
          || duplicateId
          || !Number.isSafeInteger(intent.transfer.durationMs)
          || intent.transfer.durationMs <= 0) {
          return refuse('invalid-transfer', 'A timed transfer needs a unique identity and a positive safe-integer duration.')
        }
        occurrence.incomingTransfer = {
          ...structuredClone(intent.transfer),
          fromOccurrenceId: ordered[index - 1].id,
        }
        // An authored timed transfer supersedes a converted zero-duration
        // switch at the same boundary. Dropping stale provenance is safe; no
        // command may mint it (#1065).
        delete occurrence.incomingSwitch
      }
    } else if (intent.kind === 'make-unique') {
      const source = next.zoneLayouts.find(layout => layout.id === occurrence.layoutId)!
      const uses = next.composition.layoutOccurrences.filter(candidate => candidate.layoutId === source.id).length
      if (uses <= 1) return { status: 'unchanged', record, ...empty() }
      if (!intent.layoutId.trim()
        || !intent.name.trim()
        || next.zoneLayouts.some(layout => layout.id === intent.layoutId)) {
        return refuse('invalid-intent', 'Make Unique requires a fresh Layout identity and nonblank name.')
      }
      next.zoneLayouts.push({ ...structuredClone(source), id: intent.layoutId, name: intent.name })
      occurrence.layoutId = intent.layoutId
    } else if (intent.kind === 'remove-switch') {
      if (ordered.length === 1) return refuse('invalid-intent', 'A Show must retain one Layout occurrence.')
      if (index === 0) return refuse('invalid-intent', 'Only a noninitial switch can be removed.')
      const ownsTrack = next.composition.propertyTracks.some(track => (
        track.target.kind === 'layout-occurrence-split-position'
        && track.target.layoutOccurrenceId === occurrence.id
      ))
      if (ownsTrack) {
        return refuse('meaningful-occurrence-data', 'Resolve occurrence-owned tracks and transfers before removing the Layout occurrence.')
      }
      delete occurrence.incomingTransfer
      delete occurrence.incomingSwitch
      const previous = next.composition.layoutOccurrences.find(candidate => candidate.id === ordered[index - 1].id)!
      previous.durationMs += occurrence.durationMs
      affectedLayoutOccurrenceIds = [previous.id]
      const successor = ordered[index + 1]
        ? next.composition.layoutOccurrences.find(candidate => candidate.id === ordered[index + 1].id)
        : undefined
      if (successor?.incomingTransfer?.fromOccurrenceId === occurrence.id) {
        successor.incomingTransfer.fromOccurrenceId = previous.id
        affectedLayoutOccurrenceIds = [previous.id, successor.id]
      }
      next.composition.layoutOccurrences = next.composition.layoutOccurrences.filter(candidate => candidate.id !== occurrence.id)
    } else {
      if (ordered.length === 1) return refuse('invalid-intent', 'A Show must retain one Layout occurrence.')
      const ownsTrack = next.composition.propertyTracks.some(track => (
        track.target.kind === 'layout-occurrence-split-position'
        && track.target.layoutOccurrenceId === occurrence.id
      ))
      // Inert conversion provenance never makes a removal refuse: only real
      // timed transfers and owned tracks do (#1065). A discarded occurrence
      // takes its own switch provenance with it, and a successor's provenance
      // is dropped below once the boundary it described is gone.
      const ownsTransfer = Boolean(occurrence.incomingTransfer)
        || Boolean(ordered[index + 1]?.incomingTransfer?.fromOccurrenceId === occurrence.id)
      if (ownsTrack || ownsTransfer) {
        return refuse('meaningful-occurrence-data', 'Resolve occurrence-owned tracks and transfers before removing the Layout occurrence.')
      }
      if (index === 0) {
        const promoted = next.composition.layoutOccurrences.find(candidate => candidate.id === ordered[1].id)!
        promoted.startMs = 0
        promoted.durationMs += occurrence.durationMs
        affectedLayoutOccurrenceIds = [promoted.id]
      } else {
        const previous = next.composition.layoutOccurrences.find(candidate => candidate.id === ordered[index - 1].id)!
        previous.durationMs += occurrence.durationMs
        affectedLayoutOccurrenceIds = [previous.id]
      }
      next.composition.layoutOccurrences = next.composition.layoutOccurrences.filter(candidate => candidate.id !== occurrence.id)
    }
    if (intent.kind !== 'remove' && intent.kind !== 'remove-switch') affectedLayoutOccurrenceIds = [occurrence.id]
  }
  const affectedGroupOccurrenceIds = rebindGroupLayoutAssociations(next)
  affectedLayoutOccurrenceIds = [...new Set([
    ...affectedLayoutOccurrenceIds,
    ...rebindIncomingTransfers(next),
  ])]
  dropStaleSwitchProvenance(next)
  const invalidTransfer = invalidTransferWindow(next)
  if (invalidTransfer) return refuse('invalid-transfer', invalidTransfer)
  const ownedTrack = layoutTrackOutsideOwner(next)
  if (ownedTrack) {
    return refuse(
      'owned-track-out-of-bounds',
      `Layout track "${ownedTrack.trackId}" must remain inside occurrence "${ownedTrack.occurrenceId}".`,
    )
  }
  // Promotion widens whole-output contributor sets, so Zone availability is
  // checked on the promoted record the owner will persist.
  const promotion = promoteConvertedBoundariesToWholeOutputV2(next)
  const availability = validateShowLayoutAvailabilityV2(promotion.record)[0]
  if (availability) {
    return refuse(
      'zone-unavailable',
      `${availability.entityKind} "${availability.entityId}" uses Zone "${availability.zoneId}" while Layout occurrence "${availability.layoutOccurrenceId}" does not provide it.`,
    )
  }
  const resultIssue = validateShowRecordV2(promotion.record)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  const affectedLayoutDefinitionIds = intent.kind === 'make-unique' || (intent.kind === 'append' && intent.definition)
    ? [intent.layoutId]
    : []
  if (intent.kind === 'remove' || intent.kind === 'remove-switch') removedLayoutOccurrenceIds = [intent.occurrenceId]
  return {
    status: 'changed',
    record: promotion.record,
    ...empty(),
    ...duplicated,
    affectedTransitionIds: [...new Set([...duplicated.affectedTransitionIds, ...promotion.promotedTransitionIds])].sort(),
    affectedLayoutOccurrenceIds,
    affectedLayoutDefinitionIds,
    affectedGroupOccurrenceIds: [...new Set([...duplicated.affectedGroupOccurrenceIds, ...affectedGroupOccurrenceIds])].sort(),
    removedLayoutOccurrenceIds,
  }
}

type DuplicateOutcome =
  | { code: ShowLayoutEditRefusalV2; message: string }
  | (Pick<
      ShowLayoutEditAffectedV2,
      'affectedClipIds' | 'affectedGroupOccurrenceIds' | 'affectedLayoutOccurrenceIds' | 'affectedMarkerIds' | 'affectedTrackIds' | 'affectedTransitionIds'
    >)

/**
 * Duplicate one Layout occurrence immediately after itself (D7, issue #1041).
 * Later authored content moves once by the source duration; content inside the
 * interval stays, and an explicit plan copies it into the new span sharing the
 * same Pattern runtimes. Content crossing the boundary refuses.
 */
function duplicateLayoutOccurrence(
  record: ShowRecordV2,
  next: ShowRecordV2,
  source: ShowLayoutOccurrenceV2,
  intent: Extract<ShowLayoutEditIntentV2, { kind: 'duplicate' }>,
): DuplicateOutcome {
  const spanMs = source.durationMs
  const boundaryMs = source.startMs + spanMs
  const used = ownedShowIdsV2(record)
  if (typeof intent.newOccurrenceId !== 'string' || !intent.newOccurrenceId.trim() || used.has(intent.newOccurrenceId)) {
    return { code: 'invalid-intent', message: 'Duplicate requires a fresh nonblank Layout occurrence identity.' }
  }
  if (!Number.isSafeInteger(record.composition.showEndMs + spanMs)) {
    return { code: 'time-overflow', message: 'The duplicated Show End exceeds safe integer milliseconds.' }
  }

  const effective = record.composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record
  const crossing = (startMs: number, endMs: number): boolean => startMs < boundaryMs && endMs > boundaryMs
  const crossingClip = effective.composition.clips.find(clip => crossing(clip.startMs, clip.startMs + clip.durationMs))
  if (crossingClip) {
    return { code: 'boundary-crossing-content', message: `Clip "${crossingClip.id}" crosses the end of Layout occurrence "${source.id}".` }
  }
  const crossingTrack = effective.composition.propertyTracks.find(track => crossing(track.activeStartMs, track.activeStartMs + track.activeDurationMs))
  if (crossingTrack) {
    return { code: 'boundary-crossing-content', message: `Property track "${crossingTrack.id}" crosses the end of Layout occurrence "${source.id}".` }
  }
  for (const group of record.composition.groupOccurrences) {
    const definition = record.composition.groupDefinitions.find(candidate => candidate.id === group.definitionId)!
    if (crossing(group.startMs, group.startMs + groupOccurrenceDuration(definition, group))) {
      return { code: 'boundary-crossing-content', message: `Group occurrence "${group.id}" crosses the end of Layout occurrence "${source.id}".` }
    }
  }
  const shifts = (clipId: string): boolean => {
    const clip = effective.composition.clips.find(candidate => candidate.id === clipId)
    return clip !== undefined && clip.startMs >= boundaryMs
  }
  for (const transition of effective.composition.transitions) {
    const scope = transition.wholeOutput
    if (scope && crossing(scope.startMs, scope.startMs + transition.durationMs)) {
      return { code: 'boundary-crossing-content', message: `Transition "${transition.id}" crosses the end of Layout occurrence "${source.id}".` }
    }
    const endpoints = scope
      ? [...scope.fromClipIds, ...scope.toClipIds]
      : transition.participants.flatMap(participant => [participant.fromClipId, participant.toClipId])
    if (new Set(endpoints.map(shifts)).size > 1) {
      return { code: 'boundary-crossing-content', message: `Transition "${transition.id}" joins Clips on both sides of the end of Layout occurrence "${source.id}".` }
    }
  }
  const crossingTransfer = record.composition.layoutOccurrences.find(occurrence => (
    occurrence.incomingTransfer && crossing(occurrence.startMs, occurrence.startMs + occurrence.incomingTransfer.durationMs)
  ))
  if (crossingTransfer) {
    return { code: 'boundary-crossing-content', message: `Layout transfer "${crossingTransfer.incomingTransfer!.id}" crosses the end of Layout occurrence "${source.id}".` }
  }

  const inside = duplicatedInterval(record, source, boundaryMs)
  if (intent.content !== undefined) {
    const unsupported = inside.transitions.find(transition => transition.propertyRamps.length > 0)
    if (unsupported) {
      return { code: 'unsupported-content-copy', message: `Transition "${unsupported.id}" carries Property ramps; project them into tracks before duplicating this Layout occurrence with its content.` }
    }
  }
  const plan = intent.content === undefined ? null : resolveDuplicatePlan(intent.content, inside.sourceIds, used, intent.newOccurrenceId)
  if (plan !== null && 'message' in plan) return { code: 'invalid-intent', message: plan.message }

  const affectedClipIds: string[] = []
  const affectedTrackIds: string[] = []
  const affectedMarkerIds: string[] = []
  const affectedTransitionIds: string[] = []
  const affectedGroupOccurrenceIds: string[] = []
  const affectedLayoutOccurrenceIds = [intent.newOccurrenceId]

  for (const clip of next.composition.clips) {
    if (clip.startMs < boundaryMs) continue
    clip.startMs += spanMs
    clip.appearance.keys.forEach(key => { key.timeMs += spanMs })
    affectedClipIds.push(clip.id)
  }
  for (const track of next.composition.propertyTracks) {
    if (track.activeStartMs < boundaryMs) continue
    track.activeStartMs += spanMs
    track.keyframes.forEach(keyframe => { keyframe.timeMs += spanMs })
    affectedTrackIds.push(track.id)
  }
  for (const marker of next.composition.markers) {
    if (marker.timeMs < boundaryMs) continue
    marker.timeMs += spanMs
    affectedMarkerIds.push(marker.id)
  }
  for (const transition of next.composition.transitions) {
    if (!transition.wholeOutput || transition.wholeOutput.startMs < boundaryMs) continue
    transition.wholeOutput.startMs += spanMs
    affectedTransitionIds.push(transition.id)
  }
  for (const group of next.composition.groupOccurrences) {
    if (group.startMs < boundaryMs) continue
    group.startMs += spanMs
    if (group.trackActivation) group.trackActivation.startMs += spanMs
    affectedGroupOccurrenceIds.push(group.id)
  }
  for (const occurrence of next.composition.layoutOccurrences) {
    if (occurrence.startMs < boundaryMs) continue
    occurrence.startMs += spanMs
    affectedLayoutOccurrenceIds.push(occurrence.id)
  }
  next.composition.layoutOccurrences.push({
    id: intent.newOccurrenceId,
    layoutId: source.layoutId,
    startMs: boundaryMs,
    durationMs: spanMs,
    parameters: structuredClone(source.parameters),
  })
  next.composition.layoutOccurrences.sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  next.composition.showEndMs += spanMs

  if (plan !== null && !('message' in plan)) {
    const id = (sourceId: string): string => plan.idsBySourceId[sourceId]
    for (const clip of inside.clips) {
      // A content copy is a new Clip under a fresh identity; conversion
      // provenance describes the converter's own segment, so it never copies (#1068).
      const { logicalClipId: _layoutCopyLogicalClipId, ...layoutCopySource } = structuredClone(clip)
      next.composition.clips.push({
        ...layoutCopySource,
        id: id(clip.id),
        startMs: clip.startMs + spanMs,
        appearance: {
          keys: clip.appearance.keys.map(key => ({ ...structuredClone(key), id: id(key.id), timeMs: key.timeMs + spanMs })),
        },
      })
      affectedClipIds.push(id(clip.id))
    }
    for (const track of inside.tracks) {
      next.composition.propertyTracks.push({
        ...structuredClone(track),
        id: id(track.id),
        target: {
          ...structuredClone(track.target),
          clipId: id((track.target as { clipId: string }).clipId),
        } as ShowPropertyTargetV2,
        activeStartMs: track.activeStartMs + spanMs,
        keyframes: track.keyframes.map(keyframe => ({ ...structuredClone(keyframe), id: id(keyframe.id), timeMs: keyframe.timeMs + spanMs })),
      })
      affectedTrackIds.push(id(track.id))
    }
    for (const transition of inside.transitions) {
      next.composition.transitions.push({
        ...structuredClone(transition),
        id: id(transition.id),
        participants: transition.participants.map(participant => ({
          ...structuredClone(participant),
          id: id(participant.id),
          fromClipId: id(participant.fromClipId),
          toClipId: id(participant.toClipId),
        })),
      })
      affectedTransitionIds.push(id(transition.id))
    }
    for (const group of inside.groups) {
      next.composition.groupOccurrences.push({
        ...structuredClone(group),
        id: id(group.id),
        startMs: group.startMs + spanMs,
        holds: group.holds.map(hold => ({ ...structuredClone(hold), id: id(hold.id) })),
        ...(group.trackActivation
          ? { trackActivation: { ...group.trackActivation, startMs: group.trackActivation.startMs + spanMs } }
          : {}),
      })
      affectedGroupOccurrenceIds.push(id(group.id))
    }
  }
  return {
    affectedClipIds: affectedClipIds.sort(),
    affectedGroupOccurrenceIds: affectedGroupOccurrenceIds.sort(),
    affectedLayoutOccurrenceIds: affectedLayoutOccurrenceIds.sort(),
    affectedMarkerIds: affectedMarkerIds.sort(),
    affectedTrackIds: affectedTrackIds.sort(),
    affectedTransitionIds: affectedTransitionIds.sort(),
  }
}

/**
 * The exact source identities a content duplication of one occurrence copies,
 * in the owner's own order, so a caller can allocate one fresh identity each.
 * Reading this changes nothing; an unknown occurrence returns `null`.
 */
export function showLayoutDuplicateSourceIdsV2(
  record: ShowRecordV2,
  occurrenceId: string,
): string[] | null {
  const source = record.composition.layoutOccurrences.find(occurrence => occurrence.id === occurrenceId)
  if (!source) return null
  return duplicatedInterval(record, source, source.startMs + source.durationMs).sourceIds
}

interface DuplicatedInterval {
  clips: ShowClipV2[]
  tracks: ShowRecordV2['composition']['propertyTracks']
  transitions: ShowRecordV2['composition']['transitions']
  groups: ShowRecordV2['composition']['groupOccurrences']
  sourceIds: string[]
}

/** Every authored entity wholly inside the duplicated interval, with its copyable identities. */
function duplicatedInterval(record: ShowRecordV2, source: ShowLayoutOccurrenceV2, boundaryMs: number): DuplicatedInterval {
  const clips = record.composition.clips.filter(clip => clip.startMs >= source.startMs && clip.startMs < boundaryMs)
  const clipIds = new Set(clips.map(clip => clip.id))
  const tracks = record.composition.propertyTracks.filter(track => 'clipId' in track.target && clipIds.has(track.target.clipId))
  const transitions = record.composition.transitions.filter(transition => !transition.wholeOutput
    && transition.participants.length > 0
    && transition.participants.every(participant => clipIds.has(participant.fromClipId) && clipIds.has(participant.toClipId)))
  const groups = record.composition.groupOccurrences.filter(group => group.startMs >= source.startMs && group.startMs < boundaryMs)
  return {
    clips,
    tracks,
    transitions,
    groups,
    sourceIds: [
      ...clips.flatMap(clip => [clip.id, ...clip.appearance.keys.map(key => key.id)]),
      ...tracks.flatMap(track => [track.id, ...track.keyframes.map(keyframe => keyframe.id)]),
      ...transitions.flatMap(transition => [transition.id, ...transition.participants.map(participant => participant.id)]),
      ...groups.flatMap(group => [group.id, ...group.holds.map(hold => hold.id)]),
    ],
  }
}

function resolveDuplicatePlan(
  content: ShowLayoutDuplicateContentPlanV2,
  sourceIds: readonly string[],
  used: ReadonlySet<string>,
  newOccurrenceId: string,
): ShowLayoutDuplicateContentPlanV2 | { message: string } {
  const incomplete = { message: 'Duplicate with content requires one fresh, unique, unowned identity for every copied entity.' }
  const raw: unknown = content
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)
    || JSON.stringify(Object.keys(raw).sort()) !== JSON.stringify(['idsBySourceId'])) return incomplete
  const map: unknown = (raw as { idsBySourceId: unknown }).idsBySourceId
  if (typeof map !== 'object' || map === null || Array.isArray(map)) return incomplete
  const entries = Object.entries(map as Record<string, unknown>)
  if (JSON.stringify(entries.map(([key]) => key).sort()) !== JSON.stringify([...sourceIds].sort())) return incomplete
  const values = entries.map(([, value]) => value)
  if (values.some(value => typeof value !== 'string' || !value.trim() || value === newOccurrenceId || used.has(value))) return incomplete
  if (new Set(values as string[]).size !== values.length) return incomplete
  return { idsBySourceId: map as Record<string, string> }
}


function rebindIncomingTransfers(record: ShowRecordV2): string[] {
  const affected: string[] = []
  const ordered = orderedOccurrences(record)
  for (let index = 1; index < ordered.length; index += 1) {
    const transfer = ordered[index].incomingTransfer
    if (transfer && transfer.fromOccurrenceId !== ordered[index - 1].id) {
      transfer.fromOccurrenceId = ordered[index - 1].id
      affected.push(ordered[index].id)
    }
  }
  return affected
}

/**
 * Discard converted zero-duration switch provenance once the boundary it
 * described is gone (#1065).
 *
 * A timed transfer is authored content and is rebound to its new predecessor.
 * A switch record is inert conversion provenance describing one exact v1
 * boundary, so rebinding it would invent a relationship the author never made.
 * Dropping it instead keeps every existing command outcome unchanged: no edit
 * refuses, and no dangling reference survives. It reports no affected entity,
 * because provenance owns no content: the same edit on the same record without
 * the metadata must produce the same status, the same affected sets and the
 * same record once the metadata is stripped.
 */
function dropStaleSwitchProvenance(record: ShowRecordV2): void {
  const ordered = orderedOccurrences(record)
  const transferIds = new Set(ordered.flatMap(occurrence => (
    occurrence.incomingTransfer ? [occurrence.incomingTransfer.id] : []
  )))
  ordered.forEach((occurrence, index) => {
    const provenance = occurrence.incomingSwitch
    if (!provenance) return
    const describesThisBoundary = index > 0 && provenance.fromOccurrenceId === ordered[index - 1].id
    // Authored content always wins the shared routing identity space.
    if (describesThisBoundary && !transferIds.has(provenance.id)) return
    delete occurrence.incomingSwitch
  })
}

function rebindGroupLayoutAssociations(record: ShowRecordV2): string[] {
  const affected: string[] = []
  for (const group of record.composition.groupOccurrences) {
    const occurrence = showLayoutOccurrenceAtTimeV2(record, group.startMs)
    if (occurrence && group.layoutOccurrenceId !== occurrence.id) {
      group.layoutOccurrenceId = occurrence.id
      affected.push(group.id)
    }
  }
  return affected
}

function showEndProtectionIssue(record: ShowRecordV2, showEndMs: number): string | null {
  const expanded = record.composition.groupOccurrences.length > 0
    ? materializeShowGroupsV2(record)
    : record
  for (const clip of expanded.composition.clips) {
    const contribution = clipContributionInterval(expanded, clip)
    if (contribution.endMs > showEndMs) {
      return `Clip contribution "${clip.id}" ends at ${contribution.endMs} ms.`
    }
  }
  const track = expanded.composition.propertyTracks.find(candidate => (
    candidate.activeStartMs + candidate.activeDurationMs > showEndMs
  ))
  if (track) return `Property track "${track.id}" remains active beyond the requested Show End.`
  const removedIds = new Set(record.composition.layoutOccurrences
    .filter(occurrence => occurrence.startMs >= showEndMs)
    .map(occurrence => occurrence.id))
  const transfer = record.composition.layoutOccurrences.find(occurrence => {
    const incoming = occurrence.incomingTransfer
    return incoming && (removedIds.has(occurrence.id) || occurrence.startMs + incoming.durationMs > showEndMs)
  })?.incomingTransfer
  if (transfer) return `Layout transfer "${transfer.id}" remains meaningful beyond the requested Show End.`
  return null
}

function invalidTransferWindow(record: ShowRecordV2): string | null {
  const ordered = orderedOccurrences(record)
  for (const [index, occurrence] of ordered.entries()) {
    const transfer = occurrence.incomingTransfer
    if (!transfer) continue
    const previous = ordered[index - 1]
    if (!previous
      || transfer.fromOccurrenceId !== previous.id
      || !Number.isSafeInteger(transfer.durationMs)
      || transfer.durationMs <= 0
      || transfer.durationMs > previous.durationMs
      || transfer.durationMs > occurrence.durationMs
      || occurrence.startMs + transfer.durationMs > record.composition.showEndMs) {
      return `Incoming transfer "${transfer.id}" must attach to adjacent occurrences and fit both routing intervals and Show End.`
    }
  }
  return null
}

function layoutTrackOutsideOwner(
  record: ShowRecordV2,
): { trackId: string; occurrenceId: string } | null {
  for (const track of record.composition.propertyTracks) {
    if (track.target.kind !== 'layout-occurrence-split-position') continue
    const layoutOccurrenceId = track.target.layoutOccurrenceId
    const occurrence = record.composition.layoutOccurrences.find(candidate => candidate.id === layoutOccurrenceId)
    const trackEndMs = track.activeStartMs + track.activeDurationMs
    if (!occurrence
      || track.activeStartMs < occurrence.startMs
      || trackEndMs > occurrence.startMs + occurrence.durationMs) {
      return { trackId: track.id, occurrenceId: layoutOccurrenceId }
    }
  }
  return null
}

function orderedOccurrences(record: ShowRecordV2): ShowLayoutOccurrenceV2[] {
  return [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
}

function layoutZoneIds(record: ShowRecordV2, layoutId: string): string[] {
  const layout = record.zoneLayouts.find(candidate => candidate.id === layoutId)
  if (!layout) return []
  const ids = layout.logical?.zoneIds ?? (layout.zones.length > 0
    ? layout.zones.map(zone => zone.zoneId)
    : record.zones.map(zone => zone.id))
  return [...new Set(ids)]
}

export function clipContributionInterval(
  record: ShowRecordV2,
  clip: ShowClipV2,
): { startMs: number; endMs: number } {
  let startMs = clip.startMs
  let endMs = clip.startMs + clip.durationMs
  for (const transition of record.composition.transitions) {
    if (transition.wholeOutput) {
      const windowStartMs = transition.wholeOutput.startMs
      const windowEndMs = windowStartMs + transition.durationMs
      if (transition.wholeOutput.toClipIds.includes(clip.id)) startMs = Math.min(startMs, windowStartMs)
      if (transition.wholeOutput.fromClipIds.includes(clip.id)) endMs = Math.max(endMs, windowEndMs)
      continue
    }
    for (const participant of transition.participants) {
      const from = record.composition.clips.find(candidate => candidate.id === participant.fromClipId)
      if (!from) continue
      const windowStartMs = from.startMs + from.durationMs
      const windowEndMs = windowStartMs + transition.durationMs
      if (participant.toClipId === clip.id) startMs = Math.min(startMs, windowStartMs)
      if (participant.fromClipId === clip.id) endMs = Math.max(endMs, windowEndMs)
    }
  }
  return { startMs, endMs }
}

function unavailableIntervals(
  record: ShowRecordV2,
  entityKind: ShowLayoutAvailabilityIssueV2['entityKind'],
  entityId: string,
  zoneId: string,
  startMs: number,
  endMs: number,
): ShowLayoutAvailabilityIssueV2[] {
  return orderedOccurrences(record).flatMap(occurrence => {
    const occurrenceEndMs = occurrence.startMs + occurrence.durationMs
    if (startMs >= occurrenceEndMs || endMs <= occurrence.startMs
      || layoutZoneIds(record, occurrence.layoutId).includes(zoneId)) return []
    return [{
      entityKind,
      entityId,
      zoneId,
      startMs,
      endMs,
      layoutOccurrenceId: occurrence.id,
      layoutId: occurrence.layoutId,
    }]
  })
}

function deduplicateAvailabilityIssues(
  issues: ShowLayoutAvailabilityIssueV2[],
): ShowLayoutAvailabilityIssueV2[] {
  const seen = new Set<string>()
  return issues.filter(issue => {
    const key = JSON.stringify([
      issue.entityKind,
      issue.entityId,
      issue.zoneId,
      issue.startMs,
      issue.endMs,
      issue.layoutOccurrenceId,
    ])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

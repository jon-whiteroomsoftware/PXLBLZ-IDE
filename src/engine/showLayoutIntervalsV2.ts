import { materializeShowGroupsV2 } from './showGroupsV2'
import {
  validateShowRecordV2,
  type ShowClipV2,
  type ShowLayoutOccurrenceV2,
  type ShowLayoutTransferV2,
  type ShowRecordV2,
} from './showCompositionV2'

export type ShowLayoutEditIntentV2 =
  | { kind: 'insert'; occurrenceId: string; atMs: number; layoutId: string }
  | { kind: 'append'; occurrenceId: string; durationMs: number; layoutId: string }
  | { kind: 'set-show-end'; showEndMs: number }
  | { kind: 'move'; occurrenceId: string; startMs: number }
  | { kind: 'select-layout'; occurrenceId: string; layoutId: string }
  | { kind: 'set-parameters'; occurrenceId: string; parameters: { splitPosition?: number } }
  | { kind: 'make-unique'; occurrenceId: string; layoutId: string; name: string }
  | { kind: 'remove'; occurrenceId: string }
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
  | 'zone-unavailable'
  | 'invalid-result'

interface ShowLayoutEditAffectedV2 {
  affectedClipIds: string[]
  affectedGroupOccurrenceIds: string[]
  affectedLayoutDefinitionIds: string[]
  affectedLayoutOccurrenceIds: string[]
  affectedTrackIds: string[]
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
    affectedTrackIds: [],
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
  const next = structuredClone(record)
  let affectedLayoutOccurrenceIds: string[] = []
  let removedLayoutOccurrenceIds: string[] = []
  if (intent.kind === 'insert') {
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
    if (!record.zoneLayouts.some(layout => layout.id === intent.layoutId)) {
      return refuse('missing-layout', `Zone Layout "${intent.layoutId}" does not exist.`)
    }
    const newEndMs = record.composition.showEndMs + intent.durationMs
    if (!intent.occurrenceId.trim()
      || record.composition.layoutOccurrences.some(occurrence => occurrence.id === intent.occurrenceId)
      || !Number.isSafeInteger(intent.durationMs)
      || intent.durationMs <= 0
      || !Number.isSafeInteger(newEndMs)) {
      return refuse('invalid-intent', 'Append requires a fresh occurrence identity and a positive safe-integer duration.')
    }
    next.composition.layoutOccurrences.push({
      id: intent.occurrenceId,
      layoutId: intent.layoutId,
      startMs: record.composition.showEndMs,
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
    } else {
      if (ordered.length === 1) return refuse('invalid-intent', 'A Show must retain one Layout occurrence.')
      const ownsTrack = next.composition.propertyTracks.some(track => (
        track.target.kind === 'layout-occurrence-split-position'
        && track.target.layoutOccurrenceId === occurrence.id
      ))
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
    if (intent.kind !== 'remove') affectedLayoutOccurrenceIds = [occurrence.id]
  }
  const affectedGroupOccurrenceIds = rebindGroupLayoutAssociations(next)
  affectedLayoutOccurrenceIds = [...new Set([
    ...affectedLayoutOccurrenceIds,
    ...rebindIncomingTransfers(next),
  ])]
  const invalidTransfer = invalidTransferWindow(next)
  if (invalidTransfer) return refuse('invalid-transfer', invalidTransfer)
  const ownedTrack = layoutTrackOutsideOwner(next)
  if (ownedTrack) {
    return refuse(
      'owned-track-out-of-bounds',
      `Layout track "${ownedTrack.trackId}" must remain inside occurrence "${ownedTrack.occurrenceId}".`,
    )
  }
  const availability = validateShowLayoutAvailabilityV2(next)[0]
  if (availability) {
    return refuse(
      'zone-unavailable',
      `${availability.entityKind} "${availability.entityId}" uses Zone "${availability.zoneId}" while Layout occurrence "${availability.layoutOccurrenceId}" does not provide it.`,
    )
  }
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  const affectedLayoutDefinitionIds = intent.kind === 'make-unique' ? [intent.layoutId] : []
  if (intent.kind === 'remove') removedLayoutOccurrenceIds = [intent.occurrenceId]
  return {
    status: 'changed',
    record: next,
    ...empty(),
    affectedLayoutOccurrenceIds,
    affectedLayoutDefinitionIds,
    affectedGroupOccurrenceIds,
    removedLayoutOccurrenceIds,
  }
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

function clipContributionInterval(
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

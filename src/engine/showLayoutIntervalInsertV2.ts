import { promoteConvertedBoundariesToWholeOutputV2 } from './showBoundaryScopeV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { groupOccurrenceDuration, materializeShowGroupsV2 } from './showGroupsV2'
import { editShowClipTemporalV2 } from './showClipTemporalV2'
import {
  editShowLayoutIntervalsV2,
  showLayoutOccurrenceAtTimeV2,
  validateShowLayoutAvailabilityV2,
  type ShowLayoutEditRefusalV2,
  type ShowLayoutEditResultV2,
} from './showLayoutIntervalsV2'
import {
  editShowZoneLayoutDefinitionV2,
  type ShowZoneLayoutDefinitionIntentV2,
  type ShowZoneLayoutDefinitionRefusalV2,
} from './showZoneLayoutDefinitionsV2'
import { insertShowTimeV2, visualWindows } from './showTimelineV2'

export type ShowLayoutIntervalInsertIntentV2 = {
  kind: 'insert-interval'
  atMs: number
  durationMs: number
  layoutId: string
  definition: Extract<ShowZoneLayoutDefinitionIntentV2, { kind: 'add' | 'duplicate' }>
  occurrenceIds: { interval: string; resume: string }
  rightClipIds: Readonly<Record<string, string>>
}

function emptyAffected() {
  return {
    affectedClipIds: [] as string[],
    affectedGroupOccurrenceIds: [] as string[],
    affectedLayoutDefinitionIds: [] as string[],
    affectedLayoutOccurrenceIds: [] as string[],
    affectedMarkerIds: [] as string[],
    affectedTrackIds: [] as string[],
    affectedTransitionIds: [] as string[],
    removedLayoutOccurrenceIds: [] as string[],
  }
}

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

export function insertShowLayoutIntervalV2(
  record: ShowRecordV2,
  intent: ShowLayoutIntervalInsertIntentV2,
): ShowLayoutEditResultV2 {
  const refuse = (code: ShowLayoutEditRefusalV2, message: string): ShowLayoutEditResultV2 => ({
    status: 'refused',
    record,
    code,
    message,
    ...emptyAffected(),
  })
  if (!intent || intent.kind !== 'insert-interval') {
    return refuse('invalid-intent', 'Insert here requires an insert-interval intent.')
  }
  const preimageIssue = validateShowRecordV2(record)[0]
  if (preimageIssue) {
    return refuse('invalid-record', `${preimageIssue.path}: ${preimageIssue.message}`)
  }
  const preimageUnavailable = validateShowLayoutAvailabilityV2(record)[0]
  if (preimageUnavailable) {
    return refuse('invalid-record', `Zone is unavailable for ${preimageUnavailable.entityId}.`)
  }
  const { atMs, durationMs, layoutId, definition, occurrenceIds, rightClipIds } = intent
  const showEndMs = record.composition?.showEndMs
  if (!Number.isSafeInteger(atMs) || !Number.isSafeInteger(showEndMs) || atMs < 0 || atMs >= showEndMs || !Number.isSafeInteger(durationMs) || durationMs <= 0) {
    return refuse('invalid-intent', 'Insert here requires a safe integer time inside Show time and a positive safe integer duration.')
  }
  if (!definition || definition.layoutId !== layoutId) {
    return refuse('invalid-intent', 'An inserted Zone Layout definition must carry the inserted occurrence Layout identity.')
  }
  const effective = record.composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record
  const windows = visualWindows(effective)
  const visual = windows.find(window => window.startMs <= atMs && atMs <= window.endMs)
  if (visual) {
    return refuse('boundary-crossing-content', `Insert here cannot cross visual Transition "${visual.id}".`)
  }
  for (const occurrence of record.composition.groupOccurrences) {
    const definitionRecord = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)
    if (!definitionRecord) continue
    const endMs = occurrence.startMs + groupOccurrenceDuration(definitionRecord, occurrence)
    if (occurrence.startMs < atMs && atMs < endMs) {
      return refuse('boundary-crossing-content', 'Insert here cannot split a Group occurrence.')
    }
  }
  const spanning = record.composition.clips
    .filter(clip => clip.startMs < atMs && atMs < clip.startMs + clip.durationMs)
    .map(clip => clip.id)
    .sort()
  const provided = Object.keys(rightClipIds).sort()
  if (JSON.stringify(provided) !== JSON.stringify(spanning)) {
    return refuse('invalid-intent', 'Insert here requires one right Clip identity for every Clip strictly spanning the insert time.')
  }
  const union = {
    affectedClipIds: new Set<string>(),
    affectedGroupOccurrenceIds: new Set<string>(),
    affectedLayoutDefinitionIds: new Set<string>(),
    affectedLayoutOccurrenceIds: new Set<string>(),
    affectedMarkerIds: new Set<string>(),
    affectedTrackIds: new Set<string>(),
    affectedTransitionIds: new Set<string>(),
    removedLayoutOccurrenceIds: new Set<string>(),
  }
  const absorb = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const source = value as Record<string, unknown>
    const take = (field: keyof typeof union) => {
      const entries = source[field as string]
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (typeof entry === 'string') (union[field] as Set<string>).add(entry)
        }
      }
    }
    take('affectedClipIds')
    take('affectedGroupOccurrenceIds')
    take('affectedLayoutDefinitionIds')
    take('affectedLayoutOccurrenceIds')
    take('affectedMarkerIds')
    take('affectedTrackIds')
    take('affectedTransitionIds')
    take('removedLayoutOccurrenceIds')
  }
  const preimageOwner = showLayoutOccurrenceAtTimeV2(record, atMs)
  const preimageParameters = structuredClone(preimageOwner?.parameters ?? {})
  const defined = editShowZoneLayoutDefinitionV2(record, definition)
  if (defined.status === 'refused') {
    return refuse(mapDefinitionRefusal(defined.code), defined.message)
  }
  if (defined.status === 'unchanged') {
    return refuse('invalid-intent', 'The inserted Zone Layout definition was not applied.')
  }
  let current = defined.record
  absorb(defined)
  const orderedSpanning = [...spanning].sort((left, right) => left.localeCompare(right))
  for (const clipId of orderedSpanning) {
    const split = editShowClipTemporalV2(current, {
      kind: 'split',
      clipId,
      atMs,
      rightClipId: rightClipIds[clipId],
    })
    if (split.status === 'refused') {
      return refuse('invalid-intent', split.message)
    }
    if (split.status === 'unchanged') {
      return refuse('invalid-intent', `Split of Clip "${clipId}" was not applied.`)
    }
    current = split.record
    absorb(split)
  }
  const inserted = insertShowTimeV2(current, { atMs, durationMs })
  if (inserted.status === 'refused') {
    return refuse('boundary-crossing-content', inserted.message)
  }
  current = inserted.record
  absorb(inserted)
  const owner = showLayoutOccurrenceAtTimeV2(current, atMs)
  if (atMs > 0) {
    if (!owner) {
      return refuse('invalid-intent', 'Insert here requires a Layout occurrence covering the insert time.')
    }
    const ownerEndMs = owner.startMs + owner.durationMs
    const ownerLayoutId = owner.layoutId
    const first = editShowLayoutIntervalsV2(current, {
      kind: 'insert',
      occurrenceId: occurrenceIds.interval,
      atMs,
      layoutId,
    })
    if (first.status === 'refused') {
      return refuse(first.code, first.message)
    }
    if (first.status === 'unchanged') {
      return refuse('invalid-intent', 'The inserted Layout occurrence was not applied.')
    }
    current = first.record
    absorb(first)
    if (ownerEndMs > atMs + durationMs) {
      const second = editShowLayoutIntervalsV2(current, {
        kind: 'insert',
        occurrenceId: occurrenceIds.resume,
        atMs: atMs + durationMs,
        layoutId: ownerLayoutId,
      })
      if (second.status === 'refused') {
        return refuse(second.code, second.message)
      }
      if (second.status === 'unchanged') {
        return refuse('invalid-intent', 'The resumed Layout occurrence was not applied.')
      }
      current = second.record
      absorb(second)
      const resumed = current.composition.layoutOccurrences.find(occurrence => occurrence.id === occurrenceIds.resume)
      if (resumed) resumed.parameters = structuredClone(preimageParameters)
    }
  } else {
    const firstOccurrence = showLayoutOccurrenceAtTimeV2(current, 0)
    if (!firstOccurrence) {
      return refuse('invalid-intent', 'Insert here requires a Layout occurrence covering the insert time.')
    }
    const firstId = firstOccurrence.id
    const firstLayoutId = firstOccurrence.layoutId
    const prepend = editShowLayoutIntervalsV2(current, {
      kind: 'insert',
      occurrenceId: occurrenceIds.resume,
      atMs: durationMs,
      layoutId: firstLayoutId,
    })
    if (prepend.status === 'refused') {
      return refuse(prepend.code, prepend.message)
    }
    if (prepend.status === 'unchanged') {
      return refuse('invalid-intent', 'The resumed Layout occurrence was not applied.')
    }
    current = prepend.record
    absorb(prepend)
    const selected = editShowLayoutIntervalsV2(current, {
      kind: 'select-layout',
      occurrenceId: firstId,
      layoutId,
    })
    if (selected.status === 'refused') {
      return refuse(selected.code, selected.message)
    }
    if (selected.status === 'unchanged') {
      return refuse('invalid-intent', 'The prepended Layout occurrence was not applied.')
    }
    current = selected.record
    absorb(selected)
    const resumedAtZero = current.composition.layoutOccurrences.find(occurrence => occurrence.id === occurrenceIds.resume)
    if (resumedAtZero) resumedAtZero.parameters = structuredClone(preimageParameters)
    const freshAtZero = current.composition.layoutOccurrences.find(occurrence => occurrence.id === firstId)
    if (freshAtZero) freshAtZero.parameters = {}
  }
  // Same final validation editShowLayoutIntervalsV2 runs before it returns
  // (showLayoutIntervalsV2.ts: promotion, Zone availability, validateShowRecordV2).
  const promotion = promoteConvertedBoundariesToWholeOutputV2(current)
  for (const id of promotion.promotedTransitionIds) union.affectedTransitionIds.add(id)
  const availability = validateShowLayoutAvailabilityV2(promotion.record)[0]
  if (availability) {
    return refuse(
      'zone-unavailable',
      `${availability.entityKind} "${availability.entityId}" uses Zone "${availability.zoneId}" while Layout occurrence "${availability.layoutOccurrenceId}" does not provide it.`,
    )
  }
  const resultIssue = validateShowRecordV2(promotion.record)[0]
  if (resultIssue) {
    return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  }
  const sort = (values: Set<string>) => [...values].sort()
  return {
    status: 'changed',
    record: promotion.record,
    affectedClipIds: sort(union.affectedClipIds),
    affectedGroupOccurrenceIds: sort(union.affectedGroupOccurrenceIds),
    affectedLayoutDefinitionIds: sort(union.affectedLayoutDefinitionIds),
    affectedLayoutOccurrenceIds: sort(union.affectedLayoutOccurrenceIds),
    affectedMarkerIds: sort(union.affectedMarkerIds),
    affectedTrackIds: sort(union.affectedTrackIds),
    affectedTransitionIds: sort(union.affectedTransitionIds),
    removedLayoutOccurrenceIds: sort(union.removedLayoutOccurrenceIds),
  }
}

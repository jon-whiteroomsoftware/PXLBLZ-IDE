import { validateShowRecordV2, type ShowClipV2, type ShowPropertyTargetV2, type ShowRecordV2 } from './showCompositionV2'
import { insertTimeInPropertyTracksV2 } from './showPropertyTrackTimeMappingV2'
import { groupOccurrenceDuration, groupOccurrenceLocalTimeAtV2, materializeShowGroupsV2 } from './showGroupsV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { repeatScaleHoldSourceIsInRangeV2 } from './showRepeatScaleEditEligibilityV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'

export interface ShowInsertTimeIntentV2 { atMs: number; durationMs: number }
export interface ShowTimelineEditAffectedV2 {
  affectedClipIds: string[]
  affectedInstanceIds: string[]
  affectedTransitionIds: string[]
  affectedTrackIds: string[]
  affectedLayoutDefinitionIds: string[]
  affectedLayoutOccurrenceIds: string[]
  affectedGroupDefinitionIds: string[]
  affectedGroupOccurrenceIds: string[]
  affectedLayerIds: string[]
  affectedMarkerIds: string[]
  affectedAppearanceKeyIds: string[]
  affectedPropertyKeyIds: string[]
  removedIds: string[]
  discardedControlTargets: Array<Extract<ShowPropertyTargetV2, { kind: 'instance-control' }>>
}
export type ShowTimelineEditRefusalV2 = 'invalid-record' | 'invalid-intent' | 'time-overflow' | 'visual-transition-window' | 'layout-transfer-window' | 'transition-attachment' | 'property-mapping' | 'shared-track-conflict' | 'zone-unavailable' | 'compiler-ineligible' | 'invalid-result'
export type ShowTimelineEditResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowTimelineEditAffectedV2)
  | ({ status: 'refused'; record: ShowRecordV2; code: ShowTimelineEditRefusalV2; message: string } & ShowTimelineEditAffectedV2)

function emptyAffected(): ShowTimelineEditAffectedV2 {
  return { affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], removedIds: [], discardedControlTargets: [] }
}
function freshId(base: string, ids: readonly string[]): string {
  const used = new Set(ids)
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}:${suffix}`)) suffix++
  return `${base}:${suffix}`
}
function insertAppearance(clip: ShowClipV2, atMs: number, durationMs: number): void {
  const value = [...clip.appearance.keys].reverse().find(key => key.timeMs <= atMs)!.value
  const id = freshId(`${clip.id}:appearance:hold:${atMs}`, clip.appearance.keys.map(key => key.id))
  clip.appearance.keys.forEach(key => { if (key.timeMs >= atMs) key.timeMs += durationMs })
  clip.appearance.keys.push({ id, timeMs: atMs, value: structuredClone(value) })
  clip.appearance.keys.sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id))
}

function visualWindows(record: ShowRecordV2): Array<{ id: string; startMs: number; endMs: number }> {
  return record.composition.transitions.flatMap(transition => {
    const starts = transition.wholeOutput ? [transition.wholeOutput.startMs] : transition.participants.map(participant => {
      const from = record.composition.clips.find(clip => clip.id === participant.fromClipId)!
      return from.startMs + from.durationMs
    })
    return starts.map(startMs => ({ id: transition.id, startMs, endMs: startMs + transition.durationMs }))
  })
}

/** Insert authored hold time without resetting or cloning Pattern execution. */
export function insertShowTimeV2(record: ShowRecordV2, intent: ShowInsertTimeIntentV2): ShowTimelineEditResultV2 {
  const refuse = (code: ShowTimelineEditRefusalV2, message: string): ShowTimelineEditResultV2 => ({ status: 'refused', record, code, message, ...emptyAffected() })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  const unavailable = validateShowLayoutAvailabilityV2(record)[0]
  if (unavailable) return refuse('invalid-record', `Zone is unavailable for ${unavailable.entityId}.`)
  const { atMs, durationMs } = intent
  if (!Number.isSafeInteger(atMs) || atMs < 0 || atMs > record.composition.showEndMs || !Number.isSafeInteger(durationMs) || durationMs <= 0) return refuse('invalid-intent', 'Insert Time requires safe integer milliseconds inside Show time and positive duration.')
  if (!Number.isSafeInteger(record.composition.showEndMs + durationMs) || record.composition.markers.some(marker => marker.timeMs >= atMs && !Number.isSafeInteger(marker.timeMs + durationMs))) return refuse('time-overflow', 'Mapped Show End or Marker time exceeds safe integer milliseconds.')
  const effective = record.composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record
  const windows = visualWindows(effective)
  const visual = windows.find(window => window.startMs < atMs && atMs < window.endMs)
  if (visual) return refuse('visual-transition-window', `Insert Time is strictly inside visual Transition "${visual.id}".`)
  const transfer = record.composition.layoutOccurrences.find(occurrence => occurrence.incomingTransfer && occurrence.startMs < atMs && atMs < occurrence.startMs + occurrence.incomingTransfer.durationMs)
  if (transfer) return refuse('layout-transfer-window', `Insert Time is strictly inside Layout transfer "${transfer.incomingTransfer!.id}".`)
  const outsideRepeat = effective.composition.propertyTracks.find(track => track.activeStartMs < atMs && atMs < track.activeStartMs + track.activeDurationMs && !repeatScaleHoldSourceIsInRangeV2(track, atMs))
  if (outsideRepeat) return refuse('property-mapping', `Holding repeat-scale track "${outsideRepeat.id}" requires its complete source curve to stay within 1–8.`)
  const mappedTracks = insertTimeInPropertyTracksV2(record.composition.propertyTracks, record.composition.showEndMs, atMs, durationMs)
  if (mappedTracks.status === 'refused') return refuse('property-mapping', mappedTracks.message)
  const next = structuredClone(record)
  const affected = emptyAffected()
  next.composition.showEndMs += durationMs
  next.composition.propertyTracks = structuredClone(mappedTracks.propertyTracks)
  affected.affectedTrackIds = [...mappedTracks.affectedTrackIds].sort()
  for (const track of next.composition.propertyTracks) {
    const prior = record.composition.propertyTracks.find(source => source.id === track.id)!
    for (const key of track.keyframes) if (JSON.stringify(key) !== JSON.stringify(prior.keyframes.find(source => source.id === key.id))) affected.affectedPropertyKeyIds.push(key.id)
  }
  for (const clip of next.composition.clips) {
    const prior = record.composition.clips.find(source => source.id === clip.id)!
    if (clip.startMs + clip.durationMs <= atMs) continue
    affected.affectedClipIds.push(clip.id)
    if (clip.startMs >= atMs) {
      clip.startMs += durationMs
      clip.appearance.keys.forEach(key => { key.timeMs += durationMs })
    } else {
      clip.durationMs += durationMs
      insertAppearance(clip, atMs, durationMs)
    }
    for (const key of clip.appearance.keys) if (JSON.stringify(key) !== JSON.stringify(prior.appearance.keys.find(source => source.id === key.id))) affected.affectedAppearanceKeyIds.push(key.id)
  }
  for (const occurrence of next.composition.groupOccurrences) {
    const prior = record.composition.groupOccurrences.find(source => source.id === occurrence.id)!
    const definition = record.composition.groupDefinitions.find(source => source.id === occurrence.definitionId)!
    const endMs = occurrence.startMs + groupOccurrenceDuration(definition, occurrence)
    if (occurrence.startMs >= atMs) occurrence.startMs += durationMs
    else if (endMs > atMs) {
      const localTimeMs = groupOccurrenceLocalTimeAtV2(prior, atMs)
      const existing = occurrence.holds.find(hold => hold.localTimeMs === localTimeMs)
      if (existing) existing.durationMs += durationMs
      else occurrence.holds.push({ id: freshId(`${occurrence.id}:hold:${localTimeMs}`, occurrence.holds.map(hold => hold.id)), localTimeMs, durationMs })
      occurrence.holds.sort((a, b) => a.localTimeMs - b.localTimeMs)
    }
    const activation = occurrence.trackActivation
    if (activation && activation.startMs + activation.durationMs > atMs) {
      if (activation.startMs >= atMs) activation.startMs += durationMs
      else activation.durationMs += durationMs
    }
    if (JSON.stringify(prior) !== JSON.stringify(occurrence)) affected.affectedGroupOccurrenceIds.push(occurrence.id)
  }
  const ordered = [...next.composition.layoutOccurrences].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
  const coverageOwner = atMs === 0 ? ordered[0] : ordered.find(occurrence => occurrence.startMs < atMs && occurrence.startMs + occurrence.durationMs >= atMs)!
  for (const occurrence of next.composition.layoutOccurrences) {
    if (occurrence.id === coverageOwner.id) occurrence.durationMs += durationMs
    else if (occurrence.startMs >= atMs) occurrence.startMs += durationMs
    const prior = record.composition.layoutOccurrences.find(source => source.id === occurrence.id)!
    if (JSON.stringify(prior) !== JSON.stringify(occurrence)) affected.affectedLayoutOccurrenceIds.push(occurrence.id)
  }
  for (const transition of next.composition.transitions) {
    if (windows.some(window => window.id === transition.id && window.startMs >= atMs)) affected.affectedTransitionIds.push(transition.id)
    if (transition.wholeOutput && transition.wholeOutput.startMs >= atMs) transition.wholeOutput.startMs += durationMs
  }
  for (const marker of next.composition.markers) if (marker.timeMs >= atMs) {
    marker.timeMs += durationMs
    affected.affectedMarkerIds.push(marker.id)
  }
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) {
    const code = resultIssue.code === 'invalid-transition' ? 'transition-attachment'
      : resultIssue.message.includes('overlaps active owner') ? 'shared-track-conflict' : 'invalid-result'
    return refuse(code, `${resultIssue.path}: ${resultIssue.message}`)
  }
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse('compiler-ineligible', restriction.message)
  const resultAvailability = validateShowLayoutAvailabilityV2(next)[0]
  if (resultAvailability) return refuse('zone-unavailable', `Zone is unavailable for ${resultAvailability.entityId}.`)
  for (const ids of [affected.affectedClipIds, affected.affectedLayoutOccurrenceIds, affected.affectedMarkerIds, affected.affectedAppearanceKeyIds, affected.affectedPropertyKeyIds, affected.affectedGroupOccurrenceIds, affected.affectedTransitionIds]) ids.sort()
  return { status: 'changed', record: next, ...affected }
}

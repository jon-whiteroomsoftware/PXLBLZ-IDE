import { validateShowRecordV2, type ShowRecordV2, type ShowPropertyTrackV2, type ShowPropertyKeyframeV2 } from './showCompositionV2'
import { reauthorShowPropertyKeyframeInTrackV2 } from './showPropertyAnimationV2'
import { groupRuntimeBindings, effectiveShowClipsV2 } from './showGroupsV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { promoteConvertedBoundariesToWholeOutputV2 } from './showBoundaryScopeV2'
import type { ShowTimelineEditAffectedV2 } from './showTimelineV2'

export type ShowPropertyTrackOwnerV2 = { kind: 'show' } | { kind: 'group-definition'; definitionId: string }
export type ShowPropertyEditIntentV2 =
  | { kind: 'add-track'; track: ShowPropertyTrackV2 }
  | { kind: 'update-track'; trackId: string; patch: Partial<Pick<ShowPropertyTrackV2, 'target' | 'activeStartMs' | 'activeDurationMs'>> }
  | { kind: 'remove-track'; trackId: string }
  | { kind: 'add-key'; trackId: string; key: Omit<ShowPropertyKeyframeV2, 'curveSegment'> }
  | { kind: 'update-key'; trackId: string; keyId: string; patch: Partial<Pick<ShowPropertyKeyframeV2, 'timeMs' | 'value' | 'easing'>> }
  | { kind: 'remove-key'; trackId: string; keyId: string }
export type ShowPropertyEditRefusalV2 = 'invalid-record' | 'invalid-owner' | 'invalid-intent' | 'missing-track' | 'missing-key' | 'duplicate-track' | 'duplicate-key' | 'invalid-result'
export type ShowPropertyEditResultV2 =
  | ({ status: 'changed' | 'unchanged'; record: ShowRecordV2 } & ShowTimelineEditAffectedV2)
  | ({ status: 'refused'; record: ShowRecordV2; code: ShowPropertyEditRefusalV2; message: string } & ShowTimelineEditAffectedV2)
function emptyAffected(): ShowTimelineEditAffectedV2 {
  return { affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], removedIds: [], discardedControlTargets: [] }
}
function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key))
}
function id(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function keyTime(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function equal(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string | undefined => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
  return canonical(a) === canonical(b)
}
function issue(record: ShowRecordV2): string | undefined {
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return `${invalid.path}: ${invalid.message}`
  const unavailable = validateShowLayoutAvailabilityV2(record)[0]
  if (unavailable) return `${unavailable.entityKind} "${unavailable.entityId}" uses an unavailable Zone in Layout occurrence "${unavailable.layoutOccurrenceId}".`
}
function ownerTracks(record: ShowRecordV2, owner: ShowPropertyTrackOwnerV2): ShowPropertyTrackV2[] {
  return owner.kind === 'show' ? record.composition.propertyTracks : record.composition.groupDefinitions.find(definition => definition.id === owner.definitionId)!.propertyTracks
}
function setTracks(record: ShowRecordV2, owner: ShowPropertyTrackOwnerV2, tracks: ShowPropertyTrackV2[]): void {
  if (owner.kind === 'show') record.composition.propertyTracks = tracks
  else record.composition.groupDefinitions.find(definition => definition.id === owner.definitionId)!.propertyTracks = tracks
}
/** Closed persisted Property edits. Source-dependent preparation stays at trusted admission. */
export function editShowPropertyV2(record: ShowRecordV2, owner: ShowPropertyTrackOwnerV2, intent: ShowPropertyEditIntentV2): ShowPropertyEditResultV2 {
  const refuse = (code: ShowPropertyEditRefusalV2, message: string): ShowPropertyEditResultV2 => ({ status: 'refused', record, code, message, ...emptyAffected() })
  const invalid = issue(record)
  if (invalid) return refuse('invalid-record', invalid)
  if (!exactObject(owner, owner?.kind === 'show' ? ['kind'] : ['kind', 'definitionId']) || (owner.kind !== 'show' && owner.kind !== 'group-definition')) return refuse('invalid-owner', 'Give one persisted Show or Group-definition owner.')
  if (owner.kind === 'group-definition' && (!id(owner.definitionId) || !record.composition.groupDefinitions.some(definition => definition.id === owner.definitionId))) return refuse('invalid-owner', 'The persisted Group definition does not exist.')
  if (!exactObject(intent, ['kind', 'track', 'trackId', 'patch', 'key', 'keyId'])) return refuse('invalid-intent', 'Give one exact Property operation.')
  const allowed = intent.kind === 'add-track' ? ['kind', 'track'] : intent.kind === 'update-track' ? ['kind', 'trackId', 'patch'] : intent.kind === 'remove-track' ? ['kind', 'trackId'] : intent.kind === 'add-key' ? ['kind', 'trackId', 'key'] : intent.kind === 'update-key' ? ['kind', 'trackId', 'keyId', 'patch'] : intent.kind === 'remove-key' ? ['kind', 'trackId', 'keyId'] : []
  if (!allowed.length || !exactObject(intent, allowed)) return refuse('invalid-intent', 'Property operation contains unsupported fields.')
  try { intent = structuredClone(intent) } catch { return refuse('invalid-intent', 'Property intent must contain data-only authored fields.') }
  const tracks = ownerTracks(record, owner)
  const trackId = intent.kind === 'add-track' ? intent.track?.id : intent.trackId
  if (!id(trackId)) return refuse('invalid-intent', 'Give a nonblank persisted track ID.')
  const source = tracks.find(track => track.id === trackId)
  if (intent.kind === 'add-track' && source) return refuse('duplicate-track', `Property track "${trackId}" already exists in this owner.`)
  if (intent.kind !== 'add-track' && !source) return refuse('missing-track', `Property track "${trackId}" does not exist in this owner.`)
  if (intent.kind === 'update-track' && (!exactObject(intent.patch, ['target', 'activeStartMs', 'activeDurationMs']) || Object.values(intent.patch).some(value => value === undefined))) return refuse('invalid-intent', 'Give supported explicit track fields.')
  if (intent.kind === 'update-key' && (!id(intent.keyId) || !exactObject(intent.patch, ['timeMs', 'value', 'easing']) || Object.values(intent.patch).some(value => value === undefined))) return refuse('invalid-intent', 'Give exact key identity and supported reauthor fields.')
  if (intent.kind === 'remove-key' && !id(intent.keyId)) return refuse('invalid-intent', 'Give an explicit persisted key ID.')
  if (intent.kind === 'add-key' && (!exactObject(intent.key, ['id', 'timeMs', 'value', 'easing']) || !id(intent.key.id))) return refuse('invalid-intent', 'Give a complete ordinary key, without a descriptor patch.')
  if ((intent.kind === 'add-key' && !keyTime(intent.key.timeMs)) || (intent.kind === 'update-key' && Object.prototype.hasOwnProperty.call(intent.patch, 'timeMs') && !keyTime(intent.patch.timeMs))) return refuse('invalid-intent', 'Key time requires nonnegative safe integer milliseconds.')
  if ((intent.kind === 'update-key' || intent.kind === 'remove-key') && !source!.keyframes.some(key => key.id === intent.keyId)) return refuse('missing-key', `Key "${intent.keyId}" does not exist in this track.`)
  if (intent.kind === 'add-key' && source!.keyframes.some(key => key.id === intent.key.id)) return refuse('duplicate-key', `Key "${intent.key.id}" already exists in this track.`)
  let updated: ShowPropertyTrackV2 | undefined
  if (intent.kind === 'add-track') updated = structuredClone(intent.track)
  else if (intent.kind === 'update-track') updated = { ...structuredClone(source!), ...structuredClone(intent.patch) }
  else if (intent.kind === 'update-key') updated = Object.keys(intent.patch).length ? reauthorShowPropertyKeyframeInTrackV2(source!, intent.keyId, intent.patch) : structuredClone(source!)
  else if (intent.kind === 'add-key' || intent.kind === 'remove-key') {
    updated = structuredClone(source!)
    if (intent.kind === 'add-key') {
      updated.keyframes.push(structuredClone(intent.key))
      updated.keyframes.sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id))
      const index = updated.keyframes.findIndex(key => key.id === intent.key.id)
      if (index > 0) delete updated.keyframes[index - 1].curveSegment
    } else {
      const index = updated.keyframes.findIndex(key => key.id === intent.keyId)
      if (index > 0) delete updated.keyframes[index - 1].curveSegment
      updated.keyframes.splice(index, 1)
    }
  }
  const next = structuredClone(record)
  const nextTracks = ownerTracks(next, owner)
  setTracks(next, owner, intent.kind === 'add-track' ? [...nextTracks, updated!] : intent.kind === 'remove-track' ? nextTracks.filter(track => track.id !== trackId) : nextTracks.map(track => track.id === trackId ? updated! : track))
  const promotion = owner.kind === 'show' ? promoteConvertedBoundariesToWholeOutputV2(next) : { record: next, promotedTransitionIds: [] }
  const resultIssue = issue(promotion.record)
  if (resultIssue) return refuse('invalid-result', resultIssue)
  if (equal(tracks, ownerTracks(promotion.record, owner))) return { status: 'unchanged', record, ...emptyAffected() }
  const affected = emptyAffected()
  affected.affectedTrackIds = [trackId]
  affected.affectedTransitionIds = promotion.promotedTransitionIds
  const oldKeys = source?.keyframes ?? []; const newKeys = updated?.keyframes ?? []
  affected.affectedPropertyKeyIds = [...oldKeys.filter(key => !equal(key, newKeys.find(candidate => candidate.id === key.id))).map(key => key.id), ...newKeys.filter(key => !oldKeys.some(candidate => candidate.id === key.id)).map(key => key.id)]
  affected.removedIds = intent.kind === 'remove-track' ? [trackId, ...oldKeys.map(key => key.id)] : intent.kind === 'remove-key' ? [intent.keyId] : []
  const occurrences = owner.kind === 'group-definition' ? record.composition.groupOccurrences.filter(occurrence => occurrence.definitionId === owner.definitionId) : []
  if (owner.kind === 'group-definition') { affected.affectedGroupDefinitionIds = [owner.definitionId]; affected.affectedGroupOccurrenceIds = occurrences.map(occurrence => occurrence.id) }
  for (const target of [source?.target, updated?.target].filter((target): target is ShowPropertyTrackV2['target'] => !!target)) {
    if ('instanceId' in target) {
      const ids = owner.kind === 'show' ? [target.instanceId] : groupRuntimeBindings(record).filter(binding => binding.definitionId === owner.definitionId && binding.slotId === target.instanceId).map(binding => binding.runtimeId)
      affected.affectedInstanceIds.push(...ids)
      affected.affectedClipIds.push(...effectiveShowClipsV2(record).filter(clip => ids.includes(clip.instanceId)).map(clip => clip.id))
    } else if ('clipId' in target) affected.affectedClipIds.push(...(owner.kind === 'show' ? [target.clipId] : occurrences.map(occurrence => `${occurrence.id}:${target.clipId}`)))
    else if (target.kind === 'layout-occurrence-split-position') {
      affected.affectedLayoutOccurrenceIds.push(target.layoutOccurrenceId)
      affected.affectedLayoutDefinitionIds.push(record.composition.layoutOccurrences.find(occurrence => occurrence.id === target.layoutOccurrenceId)!.layoutId)
    }
  }
  affected.affectedClipIds = [...new Set(affected.affectedClipIds)]
  affected.affectedInstanceIds = [...new Set(affected.affectedInstanceIds)]
  affected.affectedLayoutOccurrenceIds = [...new Set(affected.affectedLayoutOccurrenceIds)]
  affected.affectedLayoutDefinitionIds = [...new Set(affected.affectedLayoutDefinitionIds)]
  affected.affectedLayerIds = [...new Set(effectiveShowClipsV2(record).filter(clip => affected.affectedClipIds.includes(clip.id)).map(clip => clip.layerId))]
  return { status: 'changed', record: promotion.record, ...affected }
}

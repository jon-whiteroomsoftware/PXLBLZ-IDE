import type { ShowTimelineMarker } from './personalContentRecords'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import type { ShowTimelineEditAffectedV2 } from './showTimelineV2'

export type ShowMarkerEditIntentV2 =
  | { kind: 'add'; marker: ShowTimelineMarker }
  | { kind: 'move'; markerId: string; timeMs: number }
  | { kind: 'update'; markerId: string; patch: Partial<Omit<ShowTimelineMarker, 'id'>> }
  | { kind: 'remove'; markerId: string }
export type ShowMarkerEditResultV2 =
  | ({ status: 'changed' | 'unchanged'; record: ShowRecordV2 } & ShowTimelineEditAffectedV2)
  | ({ status: 'refused'; record: ShowRecordV2; code: 'invalid-record' | 'invalid-intent' | 'duplicate-marker' | 'missing-marker' | 'invalid-result'; message: string } & ShowTimelineEditAffectedV2)

function emptyAffected(): ShowTimelineEditAffectedV2 {
  return { affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], removedIds: [], discardedControlTargets: [] }
}
function objectWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key))
}
function has(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}
function markerFieldsValid(value: Record<string, unknown>): boolean {
  return (!has(value, 'timeMs') || (Number.isSafeInteger(value.timeMs) && (value.timeMs as number) >= 0))
    && (!has(value, 'name') || value.name === undefined || typeof value.name === 'string')
    && (!has(value, 'color') || value.color === undefined || typeof value.color === 'string')
}

/** Exact general Marker edits; playback, clocks and adoption remain unchanged. */
export function editShowMarkerV2(record: ShowRecordV2, intent: ShowMarkerEditIntentV2): ShowMarkerEditResultV2 {
  const refuse = (code: Extract<ShowMarkerEditResultV2, { status: 'refused' }>['code'], message: string): ShowMarkerEditResultV2 => ({ status: 'refused', record, code, message, ...emptyAffected() })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  if (!objectWithKeys(intent, ['kind', 'marker', 'markerId', 'timeMs', 'patch']) || !has(intent, 'kind')) return refuse('invalid-intent', 'Give one explicit Marker operation.')
  const allowed = intent.kind === 'add' ? ['kind', 'marker'] : intent.kind === 'move' ? ['kind', 'markerId', 'timeMs'] : intent.kind === 'update' ? ['kind', 'markerId', 'patch'] : intent.kind === 'remove' ? ['kind', 'markerId'] : []
  if (!allowed.length || !objectWithKeys(intent, allowed)) return refuse('invalid-intent', 'Marker intent contains unsupported fields or operation.')
  let id: string
  let patch: Partial<ShowTimelineMarker> | undefined
  if (intent.kind === 'add') {
    if (!objectWithKeys(intent.marker, ['id', 'timeMs', 'name', 'color']) || !has(intent.marker, 'id') || !has(intent.marker, 'timeMs') || !markerFieldsValid(intent.marker)) return refuse('invalid-intent', 'Give exact Marker identity/time and optional string fields.')
    id = intent.marker.id
    patch = intent.marker
  } else {
    if (!has(intent, 'markerId')) return refuse('invalid-intent', 'Give an explicit Marker identity.')
    id = intent.markerId
    if (intent.kind === 'move') {
      if (!has(intent, 'timeMs') || !markerFieldsValid({ timeMs: intent.timeMs })) return refuse('invalid-intent', 'Marker time must be nonnegative safe integer milliseconds.')
      patch = { timeMs: intent.timeMs }
    } else if (intent.kind === 'update') {
      if (!objectWithKeys(intent.patch, ['timeMs', 'name', 'color']) || !Object.keys(intent.patch).length || !markerFieldsValid(intent.patch)) return refuse('invalid-intent', 'Give at least one supported exact Marker field.')
      patch = intent.patch
    }
  }
  if (typeof id !== 'string' || !id.length) return refuse('invalid-intent', 'Give a nonempty Marker identity.')
  const source = record.composition.markers.find(marker => marker.id === id)
  if (intent.kind === 'add' && source) return refuse('duplicate-marker', `Marker "${id}" already exists.`)
  if (intent.kind !== 'add' && !source) return refuse('missing-marker', `Marker "${id}" does not exist.`)
  const updated = { ...source, ...patch } as ShowTimelineMarker
  if (updated.name === undefined) delete updated.name
  if (updated.color === undefined) delete updated.color
  if (intent.kind !== 'add' && intent.kind !== 'remove' && source!.timeMs === updated.timeMs && source!.name === updated.name && source!.color === updated.color) return { status: 'unchanged', record, ...emptyAffected() }
  const next = structuredClone(record)
  next.composition.markers = (intent.kind === 'add' ? [...next.composition.markers, structuredClone(updated)] : intent.kind === 'remove' ? next.composition.markers.filter(marker => marker.id !== id) : next.composition.markers.map(marker => marker.id === id ? structuredClone(updated) : marker))
    .sort((a, b) => a.timeMs - b.timeMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  return { status: 'changed', record: next, ...emptyAffected(), affectedMarkerIds: [id], removedIds: intent.kind === 'remove' ? [id] : [] }
}

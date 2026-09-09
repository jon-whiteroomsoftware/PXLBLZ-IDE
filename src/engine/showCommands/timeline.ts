// Timeline command family: global time structure (insert time, Show End) and
// timeline markers, through the existing pure timeline authoring functions.
import { newPersonalContentId } from '../personalContentMetadata'
import { showLoopDurationMs } from '../showModel'
import {
  insertShowTime,
  planShowTimeInsertion,
  setShowEndMs,
} from '../showTimelineAuthoring'
import { editShowMarkerExactly, type ShowMarkerRequest } from '../showExactTimelineMarker'
import type { ShowRecord } from '../personalContentRecords'
import {
  refuseShowCommand,
  type ShowCommandDescriptor,
  type ShowCommandOutcome,
} from './registry'
import { engineIdentityRefusal, planRefusal } from './support'

export function insertTimeCommandOutcome(record: ShowRecord, input: Record<string, unknown>, newId = newPersonalContentId): ShowCommandOutcome {
  const atMs = input.at_ms as number
  const durationMs = input.duration_ms as number
  const plan = planShowTimeInsertion(record, atMs, durationMs)
  if (!plan.enabled) return planRefusal(plan, 'insert_time')
  const newPlacementIdBySourceId = Object.fromEntries(
    plan.crossingPlacementIds.map((sourceId) => [sourceId, newId()]),
  )
  const result = insertShowTime(record, { atMs, durationMs, newPlacementIdBySourceId })
  if (result === record) return engineIdentityRefusal('insert_time', '')
  return {
    ok: true,
    record: result,
    changes: [{
      command: 'insert_time',
      description:
        `${Math.round(durationMs)} ms inserted at ${Math.round(atMs)} ms` +
        `${plan.crossingPlacementIds.length > 0 ? `, splitting ${plan.crossingPlacementIds.length} clip(s)` : ''}.`,
      details: { splitClipIdsBySourceId: newPlacementIdBySourceId },
    }],
  }
}

const insertTime: ShowCommandDescriptor = {
  name: 'insert_time',
  description:
    'Insert empty time at a global point, pushing everything after it later. Clips crossing the point ' +
    'split; refused inside a Transition window, across a Group occurrence, or where a multi-Scene clip ' +
    'cannot split.',
  touches: ['/scenes', '/composition', '/updatedAt'],
  fields: {
    at_ms: { kind: 'number', description: 'Global insertion point in milliseconds' },
    duration_ms: { kind: 'number', description: 'How much time to insert' },
  },
  apply: insertTimeCommandOutcome,
}

const setShowEnd: ShowCommandDescriptor = {
  name: 'set_show_end',
  description:
    'Set the Show\'s loop boundary (Show End) in global milliseconds. Content is never truncated: the ' +
    'boundary clamps to the end of the last clip. Refused when nothing would change.',
  touches: ['/scenes/*/durationMs', '/composition/durationMs', '/updatedAt'],
  fields: {
    end_ms: { kind: 'number', description: 'Requested Show End in milliseconds' },
  },
  apply(record, input) {
    const result = setShowEndMs(record, input.end_ms as number)
    if (result === record) {
      return refuseShowCommand({
        code: 'no-change',
        message:
          `Show End is already ${showLoopDurationMs(record)} ms, or the request was invalid ` +
          '(it clamps to the end of the last clip and never truncates content).',
      })
    }
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'set_show_end',
        description: `Show End is now ${showLoopDurationMs(result)} ms.`,
      }],
    }
  },
}

const markerTime = { kind: 'integer' as const, safeInteger: true, description: 'Nonnegative safe integer global milliseconds; may be beyond Show End' }

export function markerCommandOutcome(record: ShowRecord, name: string, input: Record<string, unknown>, newId = newPersonalContentId) {
  const markerId = name === 'add_marker' ? newId() : input.marker_id as string
  const patch = {
    ...(input.name !== undefined ? { name: input.name as string } : {}),
    ...(input.color !== undefined ? { color: input.color as string } : {}),
    ...(input.at_ms !== undefined ? { timeMs: input.at_ms as number } : {}),
  }
  const request: ShowMarkerRequest = name === 'add_marker' ? { kind: 'add', marker: { id: markerId, timeMs: input.at_ms as number, ...patch } }
    : name === 'move_marker' ? { kind: 'move', markerId, timeMs: input.at_ms as number }
      : name === 'update_marker' ? { kind: 'update', markerId, patch }
        : { kind: 'remove', markerId }
  const result = editShowMarkerExactly(record, request)
  if (result.status === 'refused') return refuseShowCommand({ code: result.code, message: result.reason, candidates: result.candidates })
  return { ok: true as const, record: result.record, changes: result.status === 'noop' ? [] : [{ command: name, targetId: markerId, description: `Marker ${markerId}: ${name.replace('_marker', '')} applied.` }] }
}

export const SHOW_MARKER_COMMANDS: ShowCommandDescriptor[] = [
  { name: 'add_marker', description: 'Add a timeline marker at an exact global time, optionally named and colored. Markers never affect playback.', fields: { at_ms: markerTime, name: { kind: 'string', optional: true, description: 'Display name' }, color: { kind: 'string', optional: true, description: 'Display color' } } },
  { name: 'move_marker', description: 'Move a marker to an exact global time, preserving name and color. An already-satisfied request is a no-op.', fields: { marker_id: { kind: 'string', description: 'Marker id' }, at_ms: markerTime } },
  { name: 'update_marker', description: 'Update marker name, color or exact time; give at least one field. An already-satisfied request is a no-op.', fields: { marker_id: { kind: 'string', description: 'Marker id' }, name: { kind: 'string', optional: true, description: 'New name' }, color: { kind: 'string', optional: true, description: 'New color' }, at_ms: { ...markerTime, optional: true } } },
  { name: 'remove_marker', description: 'Remove an existing marker without changing playback or Clips. Missing targets refuse.', fields: { marker_id: { kind: 'string', description: 'Marker id' } } },
].map((entry): ShowCommandDescriptor => ({ ...entry, fields: entry.fields as ShowCommandDescriptor['fields'], touches: ['/composition/markers', '/updatedAt'], apply: (record, input) => markerCommandOutcome(record, entry.name, input) }))

export const SHOW_TIMELINE_COMMANDS: ShowCommandDescriptor[] = [
  insertTime,
  setShowEnd,
  ...SHOW_MARKER_COMMANDS,
]

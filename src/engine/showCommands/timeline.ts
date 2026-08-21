// Timeline command family: global time structure (insert time, Show End) and
// timeline markers, through the existing pure timeline authoring functions.
import { newPersonalContentId } from '../personalContentMetadata'
import { showLoopDurationMs } from '../showModel'
import {
  addShowTimelineMarker,
  insertShowTime,
  moveShowTimelineMarker,
  planShowTimeInsertion,
  removeShowTimelineMarker,
  setShowEndMs,
  updateShowTimelineMarker,
} from '../showTimelineAuthoring'
import type { ShowRecord } from '../personalContentRecords'
import {
  refuseShowCommand,
  type ShowCommandDescriptor,
  type ShowCommandRefusal,
} from './registry'
import { engineIdentityRefusal, planRefusal } from './support'

function unknownMarker(record: ShowRecord, markerId: string): ShowCommandRefusal {
  const markers = record.composition?.markers ?? []
  return refuseShowCommand({
    code: 'unknown-marker',
    message:
      markers.length === 0
        ? 'This Show has no markers yet; add one with add_marker.'
        : `No marker has id "${markerId}". Markers: ${
            markers.map((marker) => `${marker.id} (${marker.timeMs} ms${marker.name ? `, ${marker.name}` : ''})`).join('; ')}.`,
    candidates: markers.map((marker) => marker.id),
  })
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
  apply(record, input) {
    const atMs = input.at_ms as number
    const durationMs = input.duration_ms as number
    const plan = planShowTimeInsertion(record, atMs, durationMs)
    if (!plan.enabled) return planRefusal(plan, 'insert_time')
    const newPlacementIdBySourceId = Object.fromEntries(
      plan.crossingPlacementIds.map((sourceId) => [sourceId, newPersonalContentId()]),
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
  },
}

const setShowEnd: ShowCommandDescriptor = {
  name: 'set_show_end',
  description:
    'Set the Show\'s loop boundary (Show End) in global milliseconds. Content is never truncated: the ' +
    'boundary clamps to the end of the last clip. Refused when nothing would change.',
  touches: ['/scenes', '/composition/durationMs', '/updatedAt'],
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

const addMarker: ShowCommandDescriptor = {
  name: 'add_marker',
  description:
    'Add a timeline marker at a global time, optionally named and colored. Markers are alignment ' +
    'guides; they never affect playback.',
  touches: ['/composition/markers', '/updatedAt'],
  fields: {
    at_ms: { kind: 'number', description: 'Global marker time in milliseconds' },
    name: { kind: 'string', optional: true, description: 'Display name' },
    color: { kind: 'string', optional: true, description: 'Display color (a CSS color)' },
  },
  apply(record, input) {
    const marker = {
      id: newPersonalContentId(),
      timeMs: input.at_ms as number,
      ...(input.name !== undefined ? { name: input.name as string } : {}),
      ...(input.color !== undefined ? { color: input.color as string } : {}),
    }
    const result = addShowTimelineMarker(record, marker)
    if (result === record) {
      return engineIdentityRefusal('add_marker', 'The Show may lack a composition or the time was not finite.')
    }
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'add_marker',
        targetId: marker.id,
        description: `Marker${marker.name ? ` "${marker.name}"` : ''} added at ${Math.round(marker.timeMs)} ms.`,
      }],
    }
  },
}

const moveMarker: ShowCommandDescriptor = {
  name: 'move_marker',
  description: 'Move a timeline marker to a new global time; the marker keeps its name and color.',
  touches: ['/composition/markers', '/updatedAt'],
  fields: {
    marker_id: { kind: 'string', description: 'The marker to move' },
    at_ms: { kind: 'number', description: 'New global time in milliseconds' },
  },
  apply(record, input) {
    const result = moveShowTimelineMarker(record, input.marker_id as string, input.at_ms as number)
    if (result === record) return unknownMarker(record, input.marker_id as string)
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'move_marker',
        targetId: input.marker_id as string,
        description: `Marker ${input.marker_id} moved to ${Math.round(input.at_ms as number)} ms.`,
      }],
    }
  },
}

const updateMarker: ShowCommandDescriptor = {
  name: 'update_marker',
  description: 'Rename or recolor a timeline marker, or change its time; give at least one field.',
  touches: ['/composition/markers', '/updatedAt'],
  fields: {
    marker_id: { kind: 'string', description: 'The marker to update' },
    name: { kind: 'string', optional: true, description: 'New display name' },
    color: { kind: 'string', optional: true, description: 'New display color' },
    at_ms: { kind: 'number', optional: true, description: 'New global time in milliseconds' },
  },
  apply(record, input) {
    if (input.name === undefined && input.color === undefined && input.at_ms === undefined) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: 'update_marker: give at least one of name, color, or at_ms.',
      })
    }
    const result = updateShowTimelineMarker(record, input.marker_id as string, {
      ...(input.name !== undefined ? { name: input.name as string } : {}),
      ...(input.color !== undefined ? { color: input.color as string } : {}),
      ...(input.at_ms !== undefined ? { timeMs: input.at_ms as number } : {}),
    })
    if (result === record) return unknownMarker(record, input.marker_id as string)
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'update_marker',
        targetId: input.marker_id as string,
        description: `Marker ${input.marker_id} updated.`,
      }],
    }
  },
}

const removeMarker: ShowCommandDescriptor = {
  name: 'remove_marker',
  description: 'Remove a timeline marker from the Show; playback and clips are unaffected.',
  touches: ['/composition/markers', '/updatedAt'],
  fields: {
    marker_id: { kind: 'string', description: 'The marker to remove' },
  },
  apply(record, input) {
    const result = removeShowTimelineMarker(record, input.marker_id as string)
    if (result === record) return unknownMarker(record, input.marker_id as string)
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'remove_marker',
        targetId: input.marker_id as string,
        description: `Marker ${input.marker_id} removed.`,
      }],
    }
  },
}

export const SHOW_TIMELINE_COMMANDS: ShowCommandDescriptor[] = [
  insertTime,
  setShowEnd,
  addMarker,
  moveMarker,
  updateMarker,
  removeMarker,
]

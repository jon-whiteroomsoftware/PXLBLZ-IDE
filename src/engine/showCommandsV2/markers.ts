// Marker commands over the v2 Marker owner. Markers are optional narrative
// guides: they never partition time and never trigger playback.
import type { ShowTimelineMarker } from '../personalContentRecords'
import { editShowMarkerV2 } from '../showMarkersV2'
import { type ShowCommandV2Descriptor } from './registry'
import {
  adoptOwnerResult,
  freshShowIdV2,
  idField,
  ownedShowIdsV2,
  timeField,
  unknownIdentity,
  unsupported,
} from './support'

/**
 * `role: chapter` is specification section 3 delta 7 and lands with #1040's
 * Marker role. Until that field exists on the record, the catalogue accepts the
 * argument and refuses it explicitly rather than silently dropping it.
 */
const ROLE_FIELD = {
  kind: 'string' as const,
  optional: true,
  nullable: true,
  enum: ['chapter'] as const,
  description: 'Marker role. "chapter" projects the Marker into the Gallery and Live chapter lists; null clears the role. Requires the Marker role field from #1040.',
}

const CHAPTER_UNSUPPORTED = 'the Marker role field is not part of the landed v2 record yet; it arrives with the chapter projection in #1040. Add the Marker without a role and set the role after that lands.'

const addMarker: ShowCommandV2Descriptor = {
  name: 'add_marker',
  family: 'markers',
  description: 'Add one Marker at a global millisecond. Markers may sit beyond Show End, where they stay dormant, and never partition time or trigger playback.',
  touches: ['/composition/markers'],
  fields: {
    at_ms: timeField('Global millisecond for the Marker.'),
    name: { kind: 'string', optional: true, maxLength: 200, description: 'Marker name.' },
    color: { kind: 'string', optional: true, maxLength: 64, description: 'Marker display color.' },
    role: ROLE_FIELD,
  },
  apply(record, input) {
    if (input.role !== undefined && input.role !== null) return unsupported(record, 'add_marker', CHAPTER_UNSUPPORTED)
    const markerId = freshShowIdV2(`marker-${input.at_ms as number}`, ownedShowIdsV2(record))
    const marker: ShowTimelineMarker = {
      id: markerId,
      timeMs: input.at_ms as number,
      ...(input.name !== undefined ? { name: input.name as string } : {}),
      ...(input.color !== undefined ? { color: input.color as string } : {}),
    }
    return adoptOwnerResult('add_marker', record,
      editShowMarkerV2(record, { kind: 'add', marker }),
      () => `Marker ${markerId} added at ${input.at_ms as number} ms.`, markerId)
  },
}

const updateMarker: ShowCommandV2Descriptor = {
  name: 'update_marker',
  family: 'markers',
  description: 'Change one Marker\'s name, color or time. Moving a Marker changes nothing else; playback is unaffected.',
  touches: ['/composition/markers'],
  atLeastOne: ['name', 'color', 'at_ms', 'role'],
  fields: {
    marker_id: idField('The Marker to change.'),
    name: { kind: 'string', optional: true, maxLength: 200, description: 'New Marker name.' },
    color: { kind: 'string', optional: true, maxLength: 64, description: 'New Marker display color.' },
    at_ms: timeField('New global millisecond for the Marker.', true),
    role: ROLE_FIELD,
  },
  apply(record, input) {
    const markerId = input.marker_id as string
    if (!record.composition.markers.some(marker => marker.id === markerId)) {
      return unknownIdentity(record, 'update_marker', 'Marker', markerId, record.composition.markers.map(marker => marker.id))
    }
    if (input.role !== undefined) return unsupported(record, 'update_marker', CHAPTER_UNSUPPORTED)
    const patch = {
      ...(input.name !== undefined ? { name: input.name as string } : {}),
      ...(input.color !== undefined ? { color: input.color as string } : {}),
      ...(input.at_ms !== undefined ? { timeMs: input.at_ms as number } : {}),
    }
    return adoptOwnerResult('update_marker', record,
      editShowMarkerV2(record, { kind: 'update', markerId, patch }),
      () => `Marker ${markerId} updated.`, markerId)
  },
}

const removeMarker: ShowCommandV2Descriptor = {
  name: 'remove_marker',
  family: 'markers',
  description: 'Remove one Marker. Clips, Layout intervals, Transitions and Show End stay fixed.',
  touches: ['/composition/markers'],
  fields: {
    marker_id: idField('The Marker to remove.'),
  },
  apply(record, input) {
    const markerId = input.marker_id as string
    if (!record.composition.markers.some(marker => marker.id === markerId)) {
      return unknownIdentity(record, 'remove_marker', 'Marker', markerId, record.composition.markers.map(marker => marker.id))
    }
    return adoptOwnerResult('remove_marker', record,
      editShowMarkerV2(record, { kind: 'remove', markerId }),
      () => `Marker ${markerId} removed.`, markerId)
  },
}

export const SHOW_V2_MARKER_COMMANDS: ShowCommandV2Descriptor[] = [
  addMarker,
  updateMarker,
  removeMarker,
]

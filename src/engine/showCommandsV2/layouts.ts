// Zone Layout interval commands over the v2 Layout occurrence owner. Intervals
// are addressed by `interval_id`; the record field is `layoutOccurrences`.
import type { ShowRecordV2 } from '../showCompositionV2'
import { editShowLayoutIntervalsV2 } from '../showLayoutIntervalsV2'
import { normalizeShowEasing } from '../showEasing'
import {
  type ShowCommandV2Descriptor,
} from './registry'
import {
  EASING_FIELD,
  ROUTING_DIRECTION_VALUES,
  adoptOwnerResult,
  describeIds,
  durationField,
  freshShowIdV2,
  idField,
  ownedShowIdsV2,
  timeField,
  unitField,
  unknownIdentity,
} from './support'

function intervalIds(record: ShowRecordV2): string[] {
  return record.composition.layoutOccurrences.map(occurrence => occurrence.id)
}

function layoutIds(record: ShowRecordV2): string[] {
  return record.zoneLayouts.map(layout => layout.id)
}

const addLayoutInterval: ShowCommandV2Descriptor = {
  name: 'add_layout_interval',
  family: 'layouts',
  description: 'Add one Zone Layout interval: inserted at a strict interior global time, splitting coverage without moving content (at_ms), or appended after Show End for a positive duration, which extends Show End (duration_ms). Coverage stays exactly one interval deep.',
  touches: ['/composition/layoutOccurrences', '/composition/showEndMs'],
  exactlyOne: ['at_ms', 'duration_ms'],
  fields: {
    layout_id: idField('The Zone Layout definition.'),
    at_ms: timeField('Interior global ms for the new switch.', true),
    duration_ms: durationField('Positive duration to append.', true),
  },
  apply(record, input) {
    const layoutId = input.layout_id as string
    if (!record.zoneLayouts.some(layout => layout.id === layoutId)) {
      return unknownIdentity(record, 'add_layout_interval', 'Zone Layout', layoutId, layoutIds(record))
    }
    const atMs = input.at_ms as number | undefined
    const occurrenceId = freshShowIdV2(`layout-interval-${atMs ?? record.composition.showEndMs}`, ownedShowIdsV2(record))
    return adoptOwnerResult('add_layout_interval', record,
      atMs === undefined
        ? editShowLayoutIntervalsV2(record, { kind: 'append', occurrenceId, durationMs: input.duration_ms as number, layoutId })
        : editShowLayoutIntervalsV2(record, { kind: 'insert', occurrenceId, atMs, layoutId }),
      affected => `Layout interval ${occurrenceId} added; intervals ${describeIds(affected.layoutIntervals)}.`, occurrenceId)
  },
}

const duplicateLayoutInterval: ShowCommandV2Descriptor = {
  name: 'duplicate_layout_interval',
  family: 'layouts',
  description: 'Duplicate one Zone Layout interval immediately after itself, empty by default or with its content. Later authored content moves once by the source duration and Show End grows by it; content inside keeps its authored times. Copies share their Pattern runtimes. Content crossing the interval end refuses.',
  touches: ['/composition/layoutOccurrences', '/composition/showEndMs', '/composition/clips', '/composition/transitions', '/composition/propertyTracks', '/composition/markers', '/composition/groupOccurrences'],
  fields: {
    interval_id: idField('The Layout interval to duplicate.'),
    with_content: { kind: 'boolean', optional: true, description: 'Copy the interval content. Default false.' },
  },
  apply(record, input) {
    const occurrenceId = input.interval_id as string
    const source = record.composition.layoutOccurrences.find(occurrence => occurrence.id === occurrenceId)
    if (!source) return unknownIdentity(record, 'duplicate_layout_interval', 'Layout interval', occurrenceId, intervalIds(record))
    const used = ownedShowIdsV2(record)
    const newOccurrenceId = freshShowIdV2(`${occurrenceId}-copy`, used)
    used.add(newOccurrenceId)
    let content: { idsBySourceId: Record<string, string> } | undefined
    if (input.with_content === true) {
      const boundaryMs = source.startMs + source.durationMs
      const clips = record.composition.clips.filter(clip => clip.startMs >= source.startMs && clip.startMs < boundaryMs)
      const clipIds = new Set(clips.map(clip => clip.id))
      const tracks = record.composition.propertyTracks.filter(track => 'clipId' in track.target && clipIds.has(track.target.clipId))
      const transitions = record.composition.transitions.filter(transition => !transition.wholeOutput
        && transition.participants.length > 0
        && transition.participants.every(participant => clipIds.has(participant.fromClipId) && clipIds.has(participant.toClipId)))
      const groups = record.composition.groupOccurrences.filter(group => group.startMs >= source.startMs && group.startMs < boundaryMs)
      const sourceIds = [
        ...clips.flatMap(clip => [clip.id, ...clip.appearance.keys.map(key => key.id)]),
        ...tracks.flatMap(track => [track.id, ...track.keyframes.map(keyframe => keyframe.id)]),
        ...transitions.flatMap(transition => [transition.id, ...transition.participants.map(participant => participant.id)]),
        ...groups.flatMap(group => [group.id, ...group.holds.map(hold => hold.id)]),
      ]
      const idsBySourceId: Record<string, string> = {}
      for (const sourceId of sourceIds) {
        const fresh = freshShowIdV2(`${sourceId}-copy`, used)
        used.add(fresh)
        idsBySourceId[sourceId] = fresh
      }
      content = { idsBySourceId }
    }
    return adoptOwnerResult('duplicate_layout_interval', record,
      editShowLayoutIntervalsV2(record, { kind: 'duplicate', occurrenceId, newOccurrenceId, ...(content ? { content } : {}) }),
      affected => `Layout interval ${occurrenceId} duplicated as ${newOccurrenceId}; Clips ${describeIds(affected.clips)}.`,
      newOccurrenceId)
  },
}

const makeLayoutIntervalUnique: ShowCommandV2Descriptor = {
  name: 'make_layout_interval_unique',
  family: 'layouts',
  description: 'Give one Layout interval its own copy of the Zone Layout definition, so editing that routing no longer affects the other intervals sharing it. Zone identities, Clips and Pattern runtimes stay shared. An interval whose definition is already used once is unchanged.',
  touches: ['/zoneLayouts', '/composition/layoutOccurrences/*/layoutId'],
  fields: {
    interval_id: idField('The Layout interval to separate.'),
    name: { kind: 'string', optional: true, maxLength: 200, description: 'Name for the cloned definition.' },
  },
  apply(record, input) {
    const occurrenceId = input.interval_id as string
    const occurrence = record.composition.layoutOccurrences.find(candidate => candidate.id === occurrenceId)
    if (!occurrence) return unknownIdentity(record, 'make_layout_interval_unique', 'Layout interval', occurrenceId, intervalIds(record))
    const source = record.zoneLayouts.find(layout => layout.id === occurrence.layoutId)
    const layoutId = freshShowIdV2(`${occurrence.layoutId}-unique`, ownedShowIdsV2(record))
    const name = ((input.name as string | undefined) ?? `${source?.name ?? occurrence.layoutId} copy`).trim()
    return adoptOwnerResult('make_layout_interval_unique', record,
      editShowLayoutIntervalsV2(record, { kind: 'make-unique', occurrenceId, layoutId, name }),
      affected => `Layout interval ${occurrenceId} owns Zone Layout ${describeIds(affected.layoutDefinitions)}.`, occurrenceId)
  },
}

const moveLayoutSwitch: ShowCommandV2Descriptor = {
  name: 'move_layout_switch',
  family: 'layouts',
  description: 'Move one noninitial Layout switch to a global millisecond, changing only that boundary and the two neighbouring interval durations. Unrelated Clips, Markers, Transitions and Show-wide tracks stay fixed; an interval-owned split-position track leaving its owner, or content whose Zone would disappear, refuses.',
  touches: ['/composition/layoutOccurrences/*/startMs', '/composition/layoutOccurrences/*/durationMs'],
  fields: {
    interval_id: idField('The interval whose start is the moved switch.'),
    start_ms: timeField('New global start ms.'),
  },
  apply(record, input) {
    const occurrenceId = input.interval_id as string
    if (!record.composition.layoutOccurrences.some(candidate => candidate.id === occurrenceId)) {
      return unknownIdentity(record, 'move_layout_switch', 'Layout interval', occurrenceId, intervalIds(record))
    }
    return adoptOwnerResult('move_layout_switch', record,
      editShowLayoutIntervalsV2(record, { kind: 'move', occurrenceId, startMs: input.start_ms as number }),
      affected => `Layout switch moved to ${input.start_ms as number} ms; intervals ${describeIds(affected.layoutIntervals)}.`,
      occurrenceId)
  },
}

const selectLayout: ShowCommandV2Descriptor = {
  name: 'select_layout',
  family: 'layouts',
  description: 'Point one Layout interval at an existing Zone Layout definition. Boundaries, Clips and Show End stay fixed; a routing choice that would hide a contributing Zone refuses.',
  touches: ['/composition/layoutOccurrences/*/layoutId'],
  fields: {
    interval_id: idField('The Layout interval to reroute.'),
    layout_id: idField('The Zone Layout definition.'),
  },
  apply(record, input) {
    const occurrenceId = input.interval_id as string
    if (!record.composition.layoutOccurrences.some(candidate => candidate.id === occurrenceId)) {
      return unknownIdentity(record, 'select_layout', 'Layout interval', occurrenceId, intervalIds(record))
    }
    const layoutId = input.layout_id as string
    if (!record.zoneLayouts.some(layout => layout.id === layoutId)) {
      return unknownIdentity(record, 'select_layout', 'Zone Layout', layoutId, layoutIds(record))
    }
    return adoptOwnerResult('select_layout', record,
      editShowLayoutIntervalsV2(record, { kind: 'select-layout', occurrenceId, layoutId }),
      () => `Layout interval ${occurrenceId} routes through ${layoutId}.`, occurrenceId)
  },
}

const updateLayoutInterval: ShowCommandV2Descriptor = {
  name: 'update_layout_interval',
  family: 'layouts',
  description: 'Set the routing parameters of one Layout interval. Only the named parameters change; boundaries and content stay fixed.',
  touches: ['/composition/layoutOccurrences/*/parameters'],
  fields: {
    interval_id: idField('The Layout interval to reparameterize.'),
    split_position: unitField('Split position, 0–1.'),
  },
  apply(record, input) {
    const occurrenceId = input.interval_id as string
    if (!record.composition.layoutOccurrences.some(candidate => candidate.id === occurrenceId)) {
      return unknownIdentity(record, 'update_layout_interval', 'Layout interval', occurrenceId, intervalIds(record))
    }
    return adoptOwnerResult('update_layout_interval', record,
      editShowLayoutIntervalsV2(record, {
        kind: 'set-parameters', occurrenceId, parameters: { splitPosition: input.split_position as number },
      }),
      () => `Layout interval ${occurrenceId} split position is ${input.split_position as number}.`, occurrenceId)
  },
}

const setLayoutTransfer: ShowCommandV2Descriptor = {
  name: 'set_layout_transfer',
  family: 'layouts',
  description: 'Set or clear the incoming timed routing transfer owned by one Layout interval. The transfer begins at that interval\'s start, references the immediately preceding interval and must fit both durations and Show End. Pass transfer null for a switch with no timed transfer; the first interval cannot own one.',
  touches: ['/composition/layoutOccurrences/*/incomingTransfer'],
  fields: {
    interval_id: idField('The destination Layout interval.'),
    transfer: {
      kind: 'object',
      nullable: true,
      description: 'The transfer, or null to clear it.',
      properties: {
        duration_ms: durationField('Positive duration ms.'),
        direction: { kind: 'string', enum: ROUTING_DIRECTION_VALUES, description: 'Transfer direction.' },
        easing: EASING_FIELD,
      },
    },
  },
  apply(record, input) {
    const occurrenceId = input.interval_id as string
    const occurrence = record.composition.layoutOccurrences.find(candidate => candidate.id === occurrenceId)
    if (!occurrence) return unknownIdentity(record, 'set_layout_transfer', 'Layout interval', occurrenceId, intervalIds(record))
    const raw = input.transfer as Record<string, unknown> | null
    const transfer = raw === null ? null : {
      id: occurrence.incomingTransfer?.id ?? freshShowIdV2(`${occurrenceId}-transfer`, ownedShowIdsV2(record)),
      durationMs: raw.duration_ms as number,
      direction: raw.direction as 'forward' | 'reverse',
      ...(raw.easing !== undefined ? { easing: normalizeShowEasing(raw.easing as never) } : {}),
    }
    return adoptOwnerResult('set_layout_transfer', record,
      editShowLayoutIntervalsV2(record, { kind: 'set-transfer', occurrenceId, transfer }),
      () => raw === null ? `Layout interval ${occurrenceId} has no timed transfer.` : `Layout interval ${occurrenceId} transfers over ${raw.duration_ms as number} ms.`,
      occurrenceId)
  },
}

const removeLayoutInterval: ShowCommandV2Descriptor = {
  name: 'remove_layout_interval',
  family: 'layouts',
  description: 'Remove one Layout interval. Its predecessor extends over the vacated time, or the next interval is promoted to zero when the first is removed. An interval owning a split-position track or a timed transfer refuses until that data is resolved explicitly, and the last remaining interval cannot be removed.',
  touches: ['/composition/layoutOccurrences'],
  fields: {
    interval_id: idField('The Layout interval to remove.'),
  },
  apply(record, input) {
    const occurrenceId = input.interval_id as string
    if (!record.composition.layoutOccurrences.some(candidate => candidate.id === occurrenceId)) {
      return unknownIdentity(record, 'remove_layout_interval', 'Layout interval', occurrenceId, intervalIds(record))
    }
    return adoptOwnerResult('remove_layout_interval', record,
      editShowLayoutIntervalsV2(record, { kind: 'remove', occurrenceId }),
      affected => `Layout interval ${occurrenceId} removed; intervals ${describeIds(affected.layoutIntervals)}.`, occurrenceId)
  },
}

export const SHOW_V2_LAYOUT_COMMANDS: ShowCommandV2Descriptor[] = [
  addLayoutInterval,
  duplicateLayoutInterval,
  makeLayoutIntervalUnique,
  moveLayoutSwitch,
  selectLayout,
  updateLayoutInterval,
  setLayoutTransfer,
  removeLayoutInterval,
]

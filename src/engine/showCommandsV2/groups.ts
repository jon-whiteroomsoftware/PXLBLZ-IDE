// Group occurrence commands over the v2 Group owners (decision D2:
// occurrence-level editing only). Group creation, definition editing and
// Group-local Transitions stay #1010 scope.
import type { ShowGroupLayerBindingV2, ShowRecordV2 } from '../showCompositionV2'
import {
  duplicateShowGroupOccurrenceV2,
  makeShowGroupUniqueV2,
  moveShowGroupOccurrenceV2,
  ungroupShowGroupOccurrenceV2,
  type ShowGroupUniqueIdentityPlanV2,
} from '../showGroupEditsV2'
import { showLayoutOccurrenceAtTimeV2 } from '../showLayoutIntervalsV2'
import { type ShowCommandV2Descriptor } from './registry'
import {
  adoptOwnerResult,
  describeIds,
  freshShowIdV2,
  idField,
  invalidArgument,
  ownedShowIdsV2,
  timeField,
  unknownIdentity,
} from './support'

function occurrenceIds(record: ShowRecordV2): string[] {
  return record.composition.groupOccurrences.map(occurrence => occurrence.id)
}

const LAYER_BINDINGS_FIELD = {
  kind: 'array' as const,
  optional: true,
  minItems: 1,
  maxItems: 128,
  description: 'Destination Layer for every Group Layer, by identity; omit to keep the bindings.',
  items: {
    kind: 'object' as const,
    description: 'One binding.',
    properties: {
      group_layer_id: idField('The definition Layer.'),
      layer_id: idField('Destination Layer in the Zone.'),
    },
  },
}

function resolveBindings(
  record: ShowRecordV2,
  occurrenceId: string,
  raw: Array<Record<string, unknown>> | undefined,
): ShowGroupLayerBindingV2[] {
  const occurrence = record.composition.groupOccurrences.find(candidate => candidate.id === occurrenceId)!
  if (!raw) return structuredClone(occurrence.layerBindings)
  return raw.map(binding => ({
    definitionLayerId: binding.group_layer_id as string,
    layerId: binding.layer_id as string,
  }))
}

const moveGroupOccurrence: ShowCommandV2Descriptor = {
  name: 'move_group_occurrence',
  family: 'groups',
  description: 'Move one Group occurrence to a new global start, optionally into another Zone with explicit Layer bindings. The definition, its Group-local holds and every effective Pattern runtime identity stay unchanged; a sole-user instance track moves with it.',
  touches: ['/composition/groupOccurrences', '/composition/propertyTracks'],
  fields: {
    group_occurrence_id: idField('The Group occurrence to move.'),
    start_ms: timeField('New global start ms.'),
    zone_id: idField('Destination Zone; default current.', true),
    layer_bindings: LAYER_BINDINGS_FIELD,
  },
  apply(record, input) {
    const occurrenceId = input.group_occurrence_id as string
    const occurrence = record.composition.groupOccurrences.find(candidate => candidate.id === occurrenceId)
    if (!occurrence) return unknownIdentity(record, 'move_group_occurrence', 'Group occurrence', occurrenceId, occurrenceIds(record))
    const startMs = input.start_ms as number
    const layoutOccurrence = showLayoutOccurrenceAtTimeV2(record, startMs)
    if (!layoutOccurrence) {
      return invalidArgument(record, 'move_group_occurrence', `no Layout interval owns ${startMs} ms.`, '$.start_ms')
    }
    return adoptOwnerResult('move_group_occurrence', record,
      moveShowGroupOccurrenceV2(record, {
        kind: 'move-occurrence',
        occurrenceId,
        startMs,
        layoutOccurrenceId: layoutOccurrence.id,
        zoneId: (input.zone_id as string | undefined) ?? occurrence.zoneId,
        layerBindings: resolveBindings(record, occurrenceId, input.layer_bindings as Array<Record<string, unknown>> | undefined),
        translationX: occurrence.translationX,
        translationY: occurrence.translationY,
      }),
      () => `Group occurrence ${occurrenceId} starts at ${startMs} ms.`, occurrenceId)
  },
}

const duplicateGroupOccurrence: ShowCommandV2Descriptor = {
  name: 'duplicate_group_occurrence',
  family: 'groups',
  description: 'Add one linked Group occurrence at a new global start. It shares the definition and every effective Pattern runtime, and carries the source occurrence\'s Group-local hold list; no definition, track or runtime is minted.',
  touches: ['/composition/groupOccurrences'],
  fields: {
    group_occurrence_id: idField('The Group occurrence to duplicate.'),
    start_ms: timeField('Global start of the copy.'),
    zone_id: idField('Zone for the copy; default source.', true),
    layer_bindings: LAYER_BINDINGS_FIELD,
  },
  apply(record, input) {
    const occurrenceId = input.group_occurrence_id as string
    const occurrence = record.composition.groupOccurrences.find(candidate => candidate.id === occurrenceId)
    if (!occurrence) return unknownIdentity(record, 'duplicate_group_occurrence', 'Group occurrence', occurrenceId, occurrenceIds(record))
    const startMs = input.start_ms as number
    const layoutOccurrence = showLayoutOccurrenceAtTimeV2(record, startMs)
    if (!layoutOccurrence) {
      return invalidArgument(record, 'duplicate_group_occurrence', `no Layout interval owns ${startMs} ms.`, '$.start_ms')
    }
    const newOccurrenceId = freshShowIdV2(`${occurrenceId}-copy`, ownedShowIdsV2(record))
    return adoptOwnerResult('duplicate_group_occurrence', record,
      duplicateShowGroupOccurrenceV2(record, {
        kind: 'duplicate-occurrence',
        occurrenceId,
        newOccurrenceId,
        startMs,
        layoutOccurrenceId: layoutOccurrence.id,
        zoneId: (input.zone_id as string | undefined) ?? occurrence.zoneId,
        layerBindings: resolveBindings(record, occurrenceId, input.layer_bindings as Array<Record<string, unknown>> | undefined),
        translationX: occurrence.translationX,
        translationY: occurrence.translationY,
      }),
      () => `Group occurrence ${occurrenceId} duplicated as ${newOccurrenceId} at ${startMs} ms.`, newOccurrenceId)
  },
}

const makeGroupUnique: ShowCommandV2Descriptor = {
  name: 'make_group_unique',
  family: 'groups',
  description: 'Give one Group occurrence its own copy of the Group definition, so editing its choreography no longer affects the other occurrences. Effective Pattern runtime identities are preserved: a shared definition-default payload is hoisted to an explicit Show instance under the same runtime identity, and no new runtime is created. An occurrence whose definition is already used once is unchanged.',
  touches: ['/composition/groupDefinitions', '/composition/groupOccurrences', '/composition/patternInstances'],
  fields: {
    group_occurrence_id: idField('The Group occurrence to separate.'),
  },
  apply(record, input) {
    const occurrenceId = input.group_occurrence_id as string
    const occurrence = record.composition.groupOccurrences.find(candidate => candidate.id === occurrenceId)
    if (!occurrence) return unknownIdentity(record, 'make_group_unique', 'Group occurrence', occurrenceId, occurrenceIds(record))
    const definition = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)!
    const used = ownedShowIdsV2(record)
    const mint = (base: string): string => {
      const id = freshShowIdV2(base, used)
      used.add(id)
      return id
    }
    const identities: ShowGroupUniqueIdentityPlanV2 = {
      definitionId: mint(`${definition.id}-unique`),
      patternInstanceIds: Object.fromEntries(definition.patternInstances.map(slot => [slot.id, mint(`${slot.id}-unique`)])),
      layerIds: Object.fromEntries(definition.layers.map(layer => [layer.id, mint(`${layer.id}-unique`)])),
      clipIds: Object.fromEntries(definition.clips.map(clip => [clip.id, mint(`${clip.id}-unique`)])),
      transitionIds: Object.fromEntries(definition.transitions.map(transition => [transition.id, mint(`${transition.id}-unique`)])),
      propertyTrackIds: Object.fromEntries(definition.propertyTracks.map(track => [track.id, mint(`${track.id}-unique`)])),
      appearanceKeyIdsByClipId: Object.fromEntries(definition.clips.map(clip => [
        clip.id,
        Object.fromEntries(clip.appearance.keys.map(key => [key.id, mint(`${key.id}-unique`)])),
      ])),
      propertyKeyIdsByTrackId: Object.fromEntries(definition.propertyTracks.map(track => [
        track.id,
        Object.fromEntries(track.keyframes.map(key => [key.id, mint(`${key.id}-unique`)])),
      ])),
    }
    return adoptOwnerResult('make_group_unique', record,
      makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId, identities }),
      affected => `Group occurrence ${occurrenceId} owns Group definition ${describeIds(affected.groupDefinitions)}; Pattern instances ${describeIds(affected.instances)}.`,
      occurrenceId)
  },
}

const ungroup: ShowCommandV2Descriptor = {
  name: 'ungroup',
  family: 'groups',
  description: 'Materialize one Group occurrence into ordinary v2 content: its mapped Clips, Transitions and Property tracks become authored records at their global times, with Group-local holds applied. Pattern runtimes are never cloned; a definition-default payload is hoisted under the same runtime identity.',
  touches: ['/composition/groupOccurrences', '/composition/clips', '/composition/transitions', '/composition/propertyTracks', '/composition/patternInstances'],
  fields: {
    group_occurrence_id: idField('The Group occurrence to materialize.'),
  },
  apply(record, input) {
    const occurrenceId = input.group_occurrence_id as string
    if (!record.composition.groupOccurrences.some(candidate => candidate.id === occurrenceId)) {
      return unknownIdentity(record, 'ungroup', 'Group occurrence', occurrenceId, occurrenceIds(record))
    }
    return adoptOwnerResult('ungroup', record,
      ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId }),
      affected => `Group occurrence ${occurrenceId} materialized into Clips ${describeIds(affected.clips)}.`, occurrenceId)
  },
}

export const SHOW_V2_GROUP_COMMANDS: ShowCommandV2Descriptor[] = [
  moveGroupOccurrence,
  duplicateGroupOccurrence,
  makeGroupUnique,
  ungroup,
]

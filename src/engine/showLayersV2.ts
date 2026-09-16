import {
  validateShowRecordV2,
  type ShowLayerV2,
  type ShowPropertyTargetV2,
  type ShowRecordV2,
} from './showCompositionV2'

export interface ShowLayerEditAffectedV2 {
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
  removedIds: string[]
  discardedControlTargets: Array<Extract<ShowPropertyTargetV2, { kind: 'instance-control' }>>
}

export type ShowLayerReassignmentV2 =
  | { kind: 'clip'; clipId: string; layerId: string }
  | { kind: 'group-layer-binding'; groupOccurrenceId: string; definitionLayerId: string; layerId: string }
  | { kind: 'transition-participant'; transitionId: string; participantId: string; layerId: string }

export type ShowLayerEditIntentV2 =
  | { kind: 'add'; layer: ShowLayerV2 }
  | { kind: 'rename'; zoneId: string; layerId: string; name: string }
  | { kind: 'reorder'; zoneId: string; layerIds: readonly string[] }
  | {
      kind: 'remove'
      zoneId: string
      layerId: string
      reassignments?: readonly ShowLayerReassignmentV2[]
    }

export type ShowLayerEditRefusalCodeV2 =
  | 'invalid-record'
  | 'invalid-request'
  | 'missing-target'
  | 'identity-conflict'
  | 'incomplete-reassignment'
  | 'incompatible-reassignment'
  | 'invalid-result'

export type ShowLayerEditResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowLayerEditAffectedV2)
  | ({ status: 'unchanged'; record: ShowRecordV2 } & ShowLayerEditAffectedV2)
  | ({
      status: 'refused'
      record: ShowRecordV2
      code: ShowLayerEditRefusalCodeV2
      message: string
    } & ShowLayerEditAffectedV2)

type LayerReference =
  | { kind: 'clip'; key: string; clipId: string }
  | { kind: 'group-layer-binding'; key: string; groupOccurrenceId: string; definitionLayerId: string }
  | { kind: 'transition-participant'; key: string; transitionId: string; participantId: string }

function emptyAffected(): ShowLayerEditAffectedV2 {
  return {
    affectedClipIds: [],
    affectedInstanceIds: [],
    affectedTransitionIds: [],
    affectedTrackIds: [],
    affectedLayoutDefinitionIds: [],
    affectedLayoutOccurrenceIds: [],
    affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [],
    affectedLayerIds: [],
    affectedMarkerIds: [],
    removedIds: [],
    discardedControlTargets: [],
  }
}

function refuse(
  record: ShowRecordV2,
  code: ShowLayerEditRefusalCodeV2,
  message: string,
): ShowLayerEditResultV2 {
  return { status: 'refused', record, code, message, ...emptyAffected() }
}

function unchanged(record: ShowRecordV2): ShowLayerEditResultV2 {
  return { status: 'unchanged', record, ...emptyAffected() }
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function layerReferenceKey(reassignment: ShowLayerReassignmentV2): string {
  if (reassignment.kind === 'clip') return `clip:${reassignment.clipId}`
  if (reassignment.kind === 'group-layer-binding') {
    return `group-layer-binding:${reassignment.groupOccurrenceId}:${reassignment.definitionLayerId}`
  }
  return `transition-participant:${reassignment.transitionId}:${reassignment.participantId}`
}

function layerReferences(record: ShowRecordV2, layerId: string): LayerReference[] {
  const clips: LayerReference[] = record.composition.clips
    .filter(clip => clip.layerId === layerId)
    .map(clip => ({ kind: 'clip', key: `clip:${clip.id}`, clipId: clip.id }))
  const bindings: LayerReference[] = record.composition.groupOccurrences.flatMap(occurrence => (
    occurrence.layerBindings
      .filter(binding => binding.layerId === layerId)
      .map(binding => ({
        kind: 'group-layer-binding' as const,
        key: `group-layer-binding:${occurrence.id}:${binding.definitionLayerId}`,
        groupOccurrenceId: occurrence.id,
        definitionLayerId: binding.definitionLayerId,
      }))
  ))
  const participants: LayerReference[] = record.composition.transitions.flatMap(transition => (
    transition.participants
      .filter(participant => participant.layerId === layerId)
      .map(participant => ({
        kind: 'transition-participant' as const,
        key: `transition-participant:${transition.id}:${participant.id}`,
        transitionId: transition.id,
        participantId: participant.id,
      }))
  ))
  return [...clips, ...bindings, ...participants]
}

function commitCandidate(
  source: ShowRecordV2,
  candidate: ShowRecordV2,
  affected: ShowLayerEditAffectedV2,
): ShowLayerEditResultV2 {
  const issues = validateShowRecordV2(candidate)
  if (issues.length > 0) {
    return refuse(
      source,
      'invalid-result',
      `The requested Layer edit would produce an invalid Show at ${issues[0].path}: ${issues[0].message}`,
    )
  }
  return { status: 'changed', record: candidate, ...affected }
}

function addLayer(record: ShowRecordV2, layer: ShowLayerV2): ShowLayerEditResultV2 {
  if (!validText(layer.id) || !validText(layer.zoneId) || !validText(layer.name)
    || !Number.isSafeInteger(layer.rank) || layer.rank < 0) {
    return refuse(record, 'invalid-request', 'A Layer requires nonblank identity, Zone and name plus a nonnegative safe-integer rank.')
  }
  if (!record.zones.some(zone => zone.id === layer.zoneId)) {
    return refuse(record, 'missing-target', `Zone "${layer.zoneId}" does not exist.`)
  }
  if (record.composition.layers.some(candidate => candidate.id === layer.id)) {
    return refuse(record, 'identity-conflict', `Layer identity "${layer.id}" already exists.`)
  }
  if (record.composition.layers.some(candidate => candidate.zoneId === layer.zoneId && candidate.rank === layer.rank)) {
    return refuse(record, 'identity-conflict', `Layer rank ${layer.rank} already exists in Zone "${layer.zoneId}".`)
  }
  const candidate = structuredClone(record)
  candidate.composition.layers.push(structuredClone(layer))
  return commitCandidate(record, candidate, {
    ...emptyAffected(),
    affectedLayerIds: [layer.id],
  })
}

function renameLayer(
  record: ShowRecordV2,
  intent: Extract<ShowLayerEditIntentV2, { kind: 'rename' }>,
): ShowLayerEditResultV2 {
  if (!validText(intent.name)) return refuse(record, 'invalid-request', 'Layer name must be nonblank.')
  const layer = record.composition.layers.find(candidate => (
    candidate.id === intent.layerId && candidate.zoneId === intent.zoneId
  ))
  if (!layer) return refuse(record, 'missing-target', `Layer "${intent.layerId}" does not exist in Zone "${intent.zoneId}".`)
  if (layer.name === intent.name) return unchanged(record)
  const candidate = structuredClone(record)
  candidate.composition.layers.find(value => value.id === intent.layerId)!.name = intent.name
  return commitCandidate(record, candidate, {
    ...emptyAffected(),
    affectedLayerIds: [intent.layerId],
  })
}

function reorderLayers(
  record: ShowRecordV2,
  intent: Extract<ShowLayerEditIntentV2, { kind: 'reorder' }>,
): ShowLayerEditResultV2 {
  if (!record.zones.some(zone => zone.id === intent.zoneId)) {
    return refuse(record, 'missing-target', `Zone "${intent.zoneId}" does not exist.`)
  }
  if (!intent.layerIds.every(validText) || new Set(intent.layerIds).size !== intent.layerIds.length) {
    return refuse(record, 'invalid-request', 'Layer order must contain unique nonblank identities.')
  }
  const current = record.composition.layers
    .filter(layer => layer.zoneId === intent.zoneId)
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
  if (current.length !== intent.layerIds.length
    || current.some(layer => !intent.layerIds.includes(layer.id))) {
    return refuse(record, 'invalid-request', 'Layer order must name every Layer in the Zone exactly once and no other Layer.')
  }
  if (current.every((layer, index) => layer.id === intent.layerIds[index])) return unchanged(record)

  const nextRankById = new Map(intent.layerIds.map((id, rank) => [id, rank]))
  const affectedLayerIds = current
    .filter(layer => layer.rank !== nextRankById.get(layer.id))
    .map(layer => layer.id)
    .sort()
  const candidate = structuredClone(record)
  candidate.composition.layers.forEach(layer => {
    const rank = layer.zoneId === intent.zoneId ? nextRankById.get(layer.id) : undefined
    if (rank !== undefined) layer.rank = rank
  })
  return commitCandidate(record, candidate, {
    ...emptyAffected(),
    affectedLayerIds,
  })
}

function removeLayer(
  record: ShowRecordV2,
  intent: Extract<ShowLayerEditIntentV2, { kind: 'remove' }>,
): ShowLayerEditResultV2 {
  const sourceLayer = record.composition.layers.find(layer => (
    layer.id === intent.layerId && layer.zoneId === intent.zoneId
  ))
  if (!sourceLayer) return refuse(record, 'missing-target', `Layer "${intent.layerId}" does not exist in Zone "${intent.zoneId}".`)

  const references = layerReferences(record, sourceLayer.id)
  const expectedByKey = new Map(references.map(reference => [reference.key, reference]))
  const reassignments = intent.reassignments ?? []
  const actualByKey = new Map<string, ShowLayerReassignmentV2>()
  for (const reassignment of reassignments) {
    const key = layerReferenceKey(reassignment)
    if (actualByKey.has(key)) {
      return refuse(record, 'incompatible-reassignment', `Layer reassignment "${key}" is duplicated.`)
    }
    const reference = expectedByKey.get(key)
    if (!reference || reference.kind !== reassignment.kind) {
      return refuse(record, 'incompatible-reassignment', `Layer reassignment "${key}" does not reference the removed Layer.`)
    }
    const destination = record.composition.layers.find(layer => layer.id === reassignment.layerId)
    if (!destination || destination.zoneId !== sourceLayer.zoneId || destination.id === sourceLayer.id) {
      return refuse(record, 'incompatible-reassignment', `Layer reassignment "${key}" must name another Layer in Zone "${sourceLayer.zoneId}".`)
    }
    actualByKey.set(key, reassignment)
  }
  if (expectedByKey.size !== actualByKey.size
    || [...expectedByKey.keys()].some(key => !actualByKey.has(key))) {
    return refuse(record, 'incomplete-reassignment', 'Removing a referenced Layer requires one explicit reassignment for every Clip, Group binding and Transition participant.')
  }

  const candidate = structuredClone(record)
  const affectedClipIds: string[] = []
  const affectedGroupOccurrenceIds = new Set<string>()
  const affectedTransitionIds = new Set<string>()
  const destinationLayerIds = new Set<string>()
  for (const reassignment of reassignments) {
    destinationLayerIds.add(reassignment.layerId)
    if (reassignment.kind === 'clip') {
      candidate.composition.clips.find(clip => clip.id === reassignment.clipId)!.layerId = reassignment.layerId
      affectedClipIds.push(reassignment.clipId)
    } else if (reassignment.kind === 'group-layer-binding') {
      const occurrence = candidate.composition.groupOccurrences.find(value => value.id === reassignment.groupOccurrenceId)!
      occurrence.layerBindings.find(binding => binding.definitionLayerId === reassignment.definitionLayerId)!.layerId = reassignment.layerId
      affectedGroupOccurrenceIds.add(reassignment.groupOccurrenceId)
    } else {
      const transition = candidate.composition.transitions.find(value => value.id === reassignment.transitionId)!
      transition.participants.find(participant => participant.id === reassignment.participantId)!.layerId = reassignment.layerId
      affectedTransitionIds.add(reassignment.transitionId)
    }
  }
  candidate.composition.layers = candidate.composition.layers.filter(layer => layer.id !== sourceLayer.id)
  return commitCandidate(record, candidate, {
    ...emptyAffected(),
    affectedClipIds: affectedClipIds.sort(),
    affectedTransitionIds: [...affectedTransitionIds].sort(),
    affectedGroupOccurrenceIds: [...affectedGroupOccurrenceIds].sort(),
    affectedLayerIds: [sourceLayer.id, ...destinationLayerIds].sort(),
    removedIds: [sourceLayer.id],
  })
}

/** Apply one complete, immutable Layer edit to a validated Show v2 record. */
export function editShowLayerV2(record: ShowRecordV2, intent: ShowLayerEditIntentV2): ShowLayerEditResultV2 {
  const sourceIssues = validateShowRecordV2(record)
  if (sourceIssues.length > 0) {
    return refuse(record, 'invalid-record', `The source Show is invalid at ${sourceIssues[0].path}: ${sourceIssues[0].message}`)
  }
  if (intent.kind === 'add') return addLayer(record, intent.layer)
  if (intent.kind === 'rename') return renameLayer(record, intent)
  if (intent.kind === 'reorder') return reorderLayers(record, intent)
  return removeLayer(record, intent)
}

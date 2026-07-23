import type {
  ShowCompositionV1,
  ShowGroupDefinition,
  ShowGroupOccurrence,
  ShowGroupPlacement,
  ShowLayerTransition,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPatternInstance,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowZoneComposition,
} from './personalContentRecords'
import { showCompositionClipCount } from './showClipInvariant'

export type ShowGroupValidationCode =
  | 'duplicate-id'
  | 'missing-definition'
  | 'missing-instance'
  | 'missing-placement'
  | 'missing-scene'
  | 'missing-zone'
  | 'out-of-bounds'
  | 'overlap'
  | 'cross-layer'
  | 'invalid-transition'
  | 'invalid-property-track'

export interface ShowGroupValidationIssue {
  path: string
  code: ShowGroupValidationCode
  message: string
}

export interface ShowGroupSelection {
  placementIds: string[]
  transitionIds: string[]
}

export type ShowGroupSelectionPlan =
  | ({ enabled: true; code: 'ready'; sceneId: string; zoneId: string } & ShowGroupSelection)
  | { enabled: false; code: 'empty' | 'missing-placement' | 'cross-zone' | 'cross-layout' | 'partial-transition-chain'; reason: string }

interface PlacementOwner {
  sceneId: string
  zoneId: string
  layerKey: string
  absoluteLayer: number
}

interface OwnedPlacement extends PlacementOwner {
  placement: ShowMainPlacement | ShowOverlayPlacement
}

export function completeShowGroupSelection(
  composition: ShowCompositionV1,
  placementIds: Iterable<string>,
): ShowGroupSelection {
  const connectedSet = new Set(placementIds)
  let changed = true
  while (changed) {
    changed = false
    for (const transition of composition.transitions ?? []) {
      if (!connectedSet.has(transition.fromPlacementId) && !connectedSet.has(transition.toPlacementId)) continue
      const before = connectedSet.size
      connectedSet.add(transition.fromPlacementId)
      connectedSet.add(transition.toPlacementId)
      changed ||= connectedSet.size !== before
    }
  }
  const connected = [...connectedSet].sort((left, right) => left.localeCompare(right))
  return {
    placementIds: connected,
    transitionIds: (composition.transitions ?? [])
      .filter((transition) => connectedSet.has(transition.fromPlacementId) && connectedSet.has(transition.toPlacementId))
      .map((transition) => transition.id)
      .sort((left, right) => left.localeCompare(right)),
  }
}

export function validateShowGroupSelection(
  composition: ShowCompositionV1,
  selection: ShowGroupSelection,
): ShowGroupSelectionPlan {
  const placementOwners = ordinaryPlacementOwners(composition)
  const selectedPlacements = [...new Set(selection.placementIds)].sort((left, right) => left.localeCompare(right))
  if (selectedPlacements.length === 0) return { enabled: false, code: 'empty', reason: 'Select at least one Clip.' }
  const owners = selectedPlacements.map((id) => placementOwners.get(id))
  if (owners.some((owner) => !owner)) {
    return { enabled: false, code: 'missing-placement', reason: 'One or more selected Clips no longer exist.' }
  }
  const first = owners[0]!
  if (owners.some((owner) => owner!.sceneId !== first.sceneId)) {
    return { enabled: false, code: 'cross-layout', reason: 'A Group cannot cross a Zone Layout boundary.' }
  }
  if (owners.some((owner) => owner!.zoneId !== first.zoneId)) {
    return { enabled: false, code: 'cross-zone', reason: 'A Group occurrence belongs to exactly one Zone.' }
  }

  const placementSet = new Set(selectedPlacements)
  const transitionSet = new Set(selection.transitionIds)
  const broken = (composition.transitions ?? []).some((transition) => {
    const from = placementSet.has(transition.fromPlacementId)
    const to = placementSet.has(transition.toPlacementId)
    const selected = transitionSet.has(transition.id)
    return (from || to || selected) && !(from && to && selected)
  })
  if (broken) {
    return {
      enabled: false,
      code: 'partial-transition-chain',
      reason: 'Select both Clips and the complete non-Cut Transition chain.',
    }
  }
  return {
    enabled: true,
    code: 'ready',
    sceneId: first.sceneId,
    zoneId: first.zoneId,
    placementIds: selectedPlacements,
    transitionIds: [...transitionSet].sort((left, right) => left.localeCompare(right)),
  }
}

export function validateShowGroups(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
): ShowGroupValidationIssue[] {
  const issues: ShowGroupValidationIssue[] = []
  const definitionIds = new Set<string>()
  const definitions = new Map<string, ShowGroupDefinition>()
  const sceneById = new Map(show.scenes.map((scene) => [scene.id, scene]))
  const zoneIds = new Set(show.zones.map((zone) => zone.id))

  for (const [definitionIndex, definition] of (composition.groupDefinitions ?? []).entries()) {
    const path = `groupDefinitions[${definitionIndex}]`
    if (definitionIds.has(definition.id)) addIssue(issues, `${path}.id`, 'duplicate-id', `Group definition id "${definition.id}" is duplicated.`)
    definitionIds.add(definition.id)
    definitions.set(definition.id, definition)
    validateDefinition(issues, path, definition)
  }

  const occurrenceIds = new Set<string>()
  for (const [occurrenceIndex, occurrence] of (composition.groupOccurrences ?? []).entries()) {
    const path = `groupOccurrences[${occurrenceIndex}]`
    if (occurrenceIds.has(occurrence.id)) addIssue(issues, `${path}.id`, 'duplicate-id', `Group occurrence id "${occurrence.id}" is duplicated.`)
    occurrenceIds.add(occurrence.id)
    const definition = definitions.get(occurrence.definitionId)
    if (!definition) addIssue(issues, `${path}.definitionId`, 'missing-definition', `Group definition "${occurrence.definitionId}" does not exist.`)
    const scene = sceneById.get(occurrence.sceneId)
    const sceneComposition = composition.scenes.find((candidate) => candidate.sceneId === occurrence.sceneId)
    if (!scene || !sceneComposition) addIssue(issues, `${path}.sceneId`, 'missing-scene', `Scene "${occurrence.sceneId}" does not exist in the Show composition.`)
    if (
      !zoneIds.has(occurrence.zoneId)
      || !sceneComposition?.zones.some((candidate) => candidate.zoneId === occurrence.zoneId)
    ) {
      addIssue(issues, `${path}.zoneId`, 'missing-zone', `Zone "${occurrence.zoneId}" does not exist in the occurrence Scene composition.`)
    }
    if (!Number.isInteger(occurrence.startMs) || occurrence.startMs < 0) {
      addIssue(issues, `${path}.startMs`, 'out-of-bounds', 'Group start must be a non-negative whole millisecond.')
    }
    if (!Number.isInteger(occurrence.baseLayer) || occurrence.baseLayer < 0) {
      addIssue(issues, `${path}.baseLayer`, 'out-of-bounds', 'Group base Layer must be a non-negative integer.')
    }
    if (!Number.isFinite(occurrence.translationX) || !Number.isFinite(occurrence.translationY)) {
      addIssue(issues, path, 'out-of-bounds', 'Group translation must be finite.')
    }
    if (definition && scene && occurrence.startMs + groupDefinitionDuration(definition) > scene.durationMs) {
      addIssue(issues, `${path}.startMs`, 'out-of-bounds', 'A Group occurrence cannot cross its Layout interval boundary.')
    }
  }

  validateMaterializedOccupancy(issues, composition, definitions)
  return issues
}

export function duplicateShowGroupOccurrence(
  composition: ShowCompositionV1,
  input: {
    occurrenceId: string
    newOccurrenceId: string
    startMs: number
    sceneId?: string
    zoneId?: string
    baseLayer?: number
  },
): ShowCompositionV1 {
  const source = composition.groupOccurrences?.find((occurrence) => occurrence.id === input.occurrenceId)
  if (!source || composition.groupOccurrences?.some((occurrence) => occurrence.id === input.newOccurrenceId)) return composition
  return {
    ...cloneJson(composition),
    groupOccurrences: [
      ...cloneJson(composition.groupOccurrences ?? []),
      {
        ...cloneJson(source),
        id: input.newOccurrenceId,
        startMs: Math.round(input.startMs),
        ...(input.sceneId ? { sceneId: input.sceneId } : {}),
        ...(input.zoneId ? { zoneId: input.zoneId } : {}),
        ...(input.baseLayer !== undefined ? { baseLayer: input.baseLayer } : {}),
      },
    ],
  }
}

export function makeShowGroupOccurrenceUnique(
  composition: ShowCompositionV1,
  input: { occurrenceId: string; newDefinitionId: string; name?: string },
): ShowCompositionV1 {
  const occurrence = composition.groupOccurrences?.find((candidate) => candidate.id === input.occurrenceId)
  if (!occurrence || composition.groupDefinitions?.some((definition) => definition.id === input.newDefinitionId)) return composition
  const definition = composition.groupDefinitions?.find((candidate) => candidate.id === occurrence.definitionId)
  if (!definition) return composition
  const clone = {
    ...cloneJson(definition),
    id: input.newDefinitionId,
    name: input.name?.trim() || `${definition.name} copy`,
  }
  return {
    ...cloneJson(composition),
    groupDefinitions: [...cloneJson(composition.groupDefinitions ?? []), clone],
    groupOccurrences: cloneJson(composition.groupOccurrences ?? []).map((candidate) => (
      candidate.id === occurrence.id ? { ...candidate, definitionId: clone.id } : candidate
    )),
  }
}

export function translateShowGroupOccurrence(
  composition: ShowCompositionV1,
  input: { occurrenceId: string; translationX: number; translationY: number },
): ShowCompositionV1 {
  if (!Number.isFinite(input.translationX) || !Number.isFinite(input.translationY)) return composition
  if (!composition.groupOccurrences?.some((occurrence) => occurrence.id === input.occurrenceId)) return composition
  return {
    ...cloneJson(composition),
    groupOccurrences: cloneJson(composition.groupOccurrences).map((occurrence) => occurrence.id === input.occurrenceId
      ? { ...occurrence, translationX: input.translationX, translationY: input.translationY }
      : occurrence),
  }
}

export function updateShowGroupOccurrencePlacement(
  composition: ShowCompositionV1,
  input: {
    occurrenceId: string
    startMs?: number
    sceneId?: string
    zoneId?: string
    baseLayer?: number
  },
): ShowCompositionV1 {
  const source = composition.groupOccurrences?.find((occurrence) => occurrence.id === input.occurrenceId)
  if (!source) return composition
  const startMs = input.startMs === undefined ? source.startMs : Math.round(input.startMs)
  const baseLayer = input.baseLayer === undefined ? source.baseLayer : Math.round(input.baseLayer)
  if (!Number.isFinite(startMs) || startMs < 0 || !Number.isFinite(baseLayer) || baseLayer < 0) return composition
  return {
    ...composition,
    groupOccurrences: composition.groupOccurrences?.map((occurrence) => occurrence.id === input.occurrenceId
      ? {
          ...occurrence,
          startMs,
          baseLayer,
          ...(input.sceneId ? { sceneId: input.sceneId } : {}),
          ...(input.zoneId ? { zoneId: input.zoneId } : {}),
        }
      : occurrence),
  }
}

/** Resize or remove one Transition in a linked Group definition. */
export function resizeShowGroupLayerTransition(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: { occurrenceId: string; transitionId: string; durationMs: number },
): ShowCompositionV1 {
  if (!Number.isInteger(input.durationMs) || input.durationMs < 0) return composition
  const occurrence = composition.groupOccurrences?.find((candidate) => candidate.id === input.occurrenceId)
  const definition = composition.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
  if (!occurrence || !definition) return composition
  const prefix = `${occurrence.id}:`
  const transitionId = input.transitionId.startsWith(prefix)
    ? input.transitionId.slice(prefix.length)
    : input.transitionId
  const transition = definition.transitions?.find((candidate) => candidate.id === transitionId)
  if (!transition || transition.durationMs === input.durationMs) return composition

  const deltaMs = input.durationMs - transition.durationMs
  const draft = cloneJson(composition)
  const changedDefinition = draft.groupDefinitions?.find((candidate) => candidate.id === definition.id)
  if (!changedDefinition) return composition
  shiftGroupDefinitionPlacements(
    changedDefinition,
    connectedGroupPlacementIds(changedDefinition, transition.toPlacementId),
    deltaMs,
  )
  if (input.durationMs === 0) {
    changedDefinition.transitions = changedDefinition.transitions?.filter((candidate) => candidate.id !== transitionId)
    if (changedDefinition.transitions?.length === 0) delete changedDefinition.transitions
  } else {
    const changedTransition = changedDefinition.transitions?.find((candidate) => candidate.id === transitionId)
    if (!changedTransition) return composition
    changedTransition.durationMs = input.durationMs
  }
  return validateShowGroups(show, draft).length === 0 ? draft : composition
}

export function insertShowGroupLayerTransition(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: { occurrenceId: string; transition: ShowLayerTransition },
): ShowCompositionV1 {
  if (!Number.isInteger(input.transition.durationMs) || input.transition.durationMs <= 0) return composition
  const occurrence = composition.groupOccurrences?.find((candidate) => candidate.id === input.occurrenceId)
  const definition = composition.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
  if (!occurrence || !definition || definition.transitions?.some((candidate) => candidate.id === input.transition.id)) {
    return composition
  }
  const fromPlacementId = groupLocalId(occurrence.id, input.transition.fromPlacementId)
  const toPlacementId = groupLocalId(occurrence.id, input.transition.toPlacementId)
  const from = definition.placements.find((placement) => placement.id === fromPlacementId)
  const to = definition.placements.find((placement) => placement.id === toPlacementId)
  const ordered = from
    ? definition.placements
        .filter((placement) => placement.layerOffset === from.layerOffset)
        .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    : []
  const fromIndex = ordered.findIndex((placement) => placement.id === fromPlacementId)
  if (
    !from
    || !to
    || from.layerOffset !== to.layerOffset
    || ordered[fromIndex + 1]?.id !== toPlacementId
    || from.startMs + from.durationMs !== to.startMs
    || definition.transitions?.some((transition) => (
      transition.fromPlacementId === fromPlacementId && transition.toPlacementId === toPlacementId
    ))
  ) {
    return composition
  }
  const draft = cloneJson(composition)
  const changedDefinition = draft.groupDefinitions?.find((candidate) => candidate.id === definition.id)
  if (!changedDefinition) return composition
  shiftGroupDefinitionPlacements(
    changedDefinition,
    connectedGroupPlacementIds(changedDefinition, toPlacementId),
    input.transition.durationMs,
  )
  changedDefinition.transitions = [
    ...(changedDefinition.transitions ?? []),
    {
      ...cloneJson(input.transition),
      fromPlacementId,
      toPlacementId,
    },
  ]
  return validateShowGroups(show, draft).length === 0 ? draft : composition
}

export function deleteShowGroupOccurrence(
  composition: ShowCompositionV1,
  occurrenceId: string,
): ShowCompositionV1 {
  const occurrence = composition.groupOccurrences?.find((candidate) => candidate.id === occurrenceId)
  if (!occurrence) return composition
  const definition = composition.groupDefinitions?.find((candidate) => candidate.id === occurrence.definitionId)
  if (showCompositionClipCount(composition) <= (definition?.placements.length ?? 0)) return composition
  const groupOccurrences = composition.groupOccurrences?.filter((candidate) => candidate.id !== occurrenceId) ?? []
  const groupDefinitions = groupOccurrences.some((candidate) => candidate.definitionId === occurrence.definitionId)
    ? composition.groupDefinitions
    : composition.groupDefinitions?.filter((candidate) => candidate.id !== occurrence.definitionId)
  return {
    ...composition,
    ...(groupOccurrences.length ? { groupOccurrences } : { groupOccurrences: undefined }),
    ...(groupDefinitions?.length ? { groupDefinitions } : { groupDefinitions: undefined }),
  }
}

export function createShowGroupFromSelection(
  composition: ShowCompositionV1,
  input: {
    selection: ShowGroupSelection
    definitionId: string
    occurrenceId: string
    name: string
  },
): ShowCompositionV1 {
  if (
    !input.definitionId
    || !input.occurrenceId
    || composition.groupDefinitions?.some((definition) => definition.id === input.definitionId)
    || composition.groupOccurrences?.some((occurrence) => occurrence.id === input.occurrenceId)
  ) return composition
  const plan = validateShowGroupSelection(composition, input.selection)
  if (!plan.enabled) return composition
  const owned = ordinaryOwnedPlacements(composition)
  const selected = plan.placementIds.map((id) => owned.get(id)).filter((item): item is OwnedPlacement => Boolean(item))
  if (selected.length !== plan.placementIds.length) return composition
  const startMs = Math.min(...selected.map((item) => item.placement.startMs))
  const baseLayer = Math.min(...selected.map((item) => item.absoluteLayer))
  const selectedIds = new Set(plan.placementIds)
  const selectedTransitionIds = new Set(plan.transitionIds)
  const selectedInstanceIds = new Set(selected.map((item) => item.placement.instanceId))
  const definition: ShowGroupDefinition = {
    id: input.definitionId,
    name: input.name.trim() || 'Group',
    patternInstances: composition.patternInstances
      .filter((instance) => selectedInstanceIds.has(instance.id))
      .map(cloneJson),
    placements: selected.map((item): ShowGroupPlacement => ({
      ...cloneJson(item.placement),
      opacity: 'opacity' in item.placement ? item.placement.opacity : 1,
      startMs: item.placement.startMs - startMs,
      layerOffset: item.absoluteLayer - baseLayer,
    })).sort((left, right) => left.layerOffset - right.layerOffset || left.startMs - right.startMs || left.id.localeCompare(right.id)),
    ...(plan.transitionIds.length
      ? {
          transitions: cloneJson(composition.transitions ?? [])
            .filter((transition) => selectedTransitionIds.has(transition.id)),
        }
      : {}),
  }
  const draft = cloneJson(composition)
  const scene = draft.scenes.find((candidate) => candidate.sceneId === plan.sceneId)
  const zone = scene?.zones.find((candidate) => candidate.zoneId === plan.zoneId)
  if (!scene || !zone) return composition

  const definitionTracks = (scene.propertyTracks ?? []).filter((track) => (
    ('placementId' in track.target && selectedIds.has(track.target.placementId))
    || ('instanceId' in track.target && selectedInstanceIds.has(track.target.instanceId))
  )).map((track) => ({
    ...cloneJson(track),
    keyframes: track.keyframes.map((keyframe) => ({ ...cloneJson(keyframe), timeMs: keyframe.timeMs - startMs })),
  }))
  if (definitionTracks.length) definition.propertyTracks = definitionTracks

  zone.main = zone.main.filter((placement) => !selectedIds.has(placement.id))
  zone.overlays = zone.overlays.map((layer) => ({
    ...layer,
    placements: layer.placements.filter((placement) => !selectedIds.has(placement.id)),
  }))
  const remainingInstanceIds = ordinaryPlacementInstanceIds(draft)
  if (draft.transitions) draft.transitions = draft.transitions.filter((transition) => !selectedTransitionIds.has(transition.id))
  if (scene.propertyTracks) {
    scene.propertyTracks = scene.propertyTracks.filter((track) => !(
      ('placementId' in track.target && selectedIds.has(track.target.placementId))
      || (
        'instanceId' in track.target
        && selectedInstanceIds.has(track.target.instanceId)
        && !remainingInstanceIds.has(track.target.instanceId)
      )
    ))
    if (scene.propertyTracks.length === 0) delete scene.propertyTracks
  }
  draft.patternInstances = draft.patternInstances.filter((instance) => remainingInstanceIds.has(instance.id))
  draft.groupDefinitions = [...(draft.groupDefinitions ?? []), definition]
  draft.groupOccurrences = [...(draft.groupOccurrences ?? []), {
    id: input.occurrenceId,
    definitionId: definition.id,
    sceneId: plan.sceneId,
    zoneId: plan.zoneId,
    startMs,
    baseLayer,
    translationX: 0,
    translationY: 0,
  }]
  return draft
}

export function ungroupShowGroupOccurrence(
  composition: ShowCompositionV1,
  occurrenceId: string,
): ShowCompositionV1 {
  const occurrence = composition.groupOccurrences?.find((candidate) => candidate.id === occurrenceId)
  const definition = composition.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
  if (!occurrence || !definition) return composition
  const draft = cloneJson(composition)
  materializeOccurrence(draft, definition, occurrence)
  draft.groupOccurrences = draft.groupOccurrences?.filter((candidate) => candidate.id !== occurrenceId)
  if (!draft.groupOccurrences?.some((candidate) => candidate.definitionId === definition.id)) {
    draft.groupDefinitions = draft.groupDefinitions?.filter((candidate) => candidate.id !== definition.id)
  }
  if (draft.groupOccurrences?.length === 0) delete draft.groupOccurrences
  if (draft.groupDefinitions?.length === 0) delete draft.groupDefinitions
  draft.patternInstances.sort((left, right) => left.id.localeCompare(right.id))
  draft.transitions?.sort((left, right) => left.id.localeCompare(right.id))
  return draft
}

/**
 * Expand Group occurrences into ordinary composition owners. The compiler and
 * Ungroup use the same deterministic ids, so removing a shell does not alter
 * the definition's internal sharing topology.
 */
export function materializeShowGroupOccurrences(composition: ShowCompositionV1): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const definitions = new Map((draft.groupDefinitions ?? []).map((definition) => [definition.id, definition]))
  for (const occurrence of draft.groupOccurrences ?? []) {
    const definition = definitions.get(occurrence.definitionId)
    if (!definition) continue
    materializeOccurrence(draft, definition, occurrence)
  }
  delete draft.groupDefinitions
  delete draft.groupOccurrences
  draft.patternInstances.sort((left, right) => left.id.localeCompare(right.id))
  draft.transitions?.sort((left, right) => left.id.localeCompare(right.id))
  return draft
}

/** Runtime Pattern identities are occurrence-local even when choreography is linked. */
export function projectShowGroupRuntimePatternInstances(
  composition: ShowCompositionV1,
): ShowPatternInstance[] {
  const definitions = new Map((composition.groupDefinitions ?? []).map((definition) => [definition.id, definition]))
  return (composition.groupOccurrences ?? []).flatMap((occurrence) => {
    const definition = definitions.get(occurrence.definitionId)
    if (!definition) return []
    return definition.patternInstances.map((instance) => ({
      ...cloneJson(instance),
      id: `${occurrence.id}:${instance.id}`,
    }))
  }).sort((left, right) => left.id.localeCompare(right.id))
}

function materializeOccurrence(
  composition: ShowCompositionV1,
  definition: ShowGroupDefinition,
  occurrence: ShowGroupOccurrence,
): void {
  const scene = composition.scenes.find((candidate) => candidate.sceneId === occurrence.sceneId)
  const zone = scene?.zones.find((candidate) => candidate.zoneId === occurrence.zoneId)
  if (!scene || !zone) return
  const instanceId = (id: string) => `${occurrence.id}:${id}`
  const placementId = (id: string) => `${occurrence.id}:${id}`
  for (const instance of definition.patternInstances) {
    const id = instanceId(instance.id)
    if (!composition.patternInstances.some((candidate) => candidate.id === id)) {
      composition.patternInstances.push({ ...cloneJson(instance), id })
    }
  }

  const maximumLayer = Math.max(0, ...definition.placements.map((placement) => occurrence.baseLayer + placement.layerOffset))
  ensureOverlayCount(zone, maximumLayer, occurrence)
  for (const child of definition.placements) {
    const absoluteLayer = occurrence.baseLayer + child.layerOffset
    const placement = materializedPlacement(child, occurrence, placementId(child.id), instanceId(child.instanceId))
    if (absoluteLayer === 0) {
      const { opacity: _opacity, layerOffset: _layerOffset, ...main } = placement
      zone.main.push(main)
    } else {
      const overlayIndex = zone.overlays.length - absoluteLayer
      const { layerOffset: _layerOffset, ...overlay } = placement
      zone.overlays[overlayIndex]?.placements.push(overlay)
    }
  }

  for (const transition of definition.transitions ?? []) {
    composition.transitions ??= []
    composition.transitions.push({
      ...cloneJson(transition),
      id: `${occurrence.id}:${transition.id}`,
      fromPlacementId: placementId(transition.fromPlacementId),
      toPlacementId: placementId(transition.toPlacementId),
    })
  }
  if (definition.propertyTracks?.length) {
    scene.propertyTracks ??= []
    scene.propertyTracks.push(...definition.propertyTracks.map((track) => materializedTrack(track, occurrence)))
  }
}

function materializedPlacement(
  child: ShowGroupPlacement,
  occurrence: ShowGroupOccurrence,
  id: string,
  instanceId: string,
): ShowGroupPlacement {
  const transform = child.transform ?? { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
  return {
    ...cloneJson(child),
    id,
    instanceId,
    startMs: occurrence.startMs + child.startMs,
    transform: {
      ...transform,
      positionX: transform.positionX + occurrence.translationX,
      positionY: transform.positionY + occurrence.translationY,
    },
    ...(child.viewport?.enabled
      ? { viewport: { ...child.viewport, x: child.viewport.x + occurrence.translationX, y: child.viewport.y + occurrence.translationY } }
      : {}),
  }
}

function materializedTrack(track: ShowPropertyAnimationTrack, occurrence: ShowGroupOccurrence): ShowPropertyAnimationTrack {
  const clone = cloneJson(track)
  clone.id = `${occurrence.id}:${track.id}`
  clone.keyframes = clone.keyframes.map((keyframe) => ({
    ...keyframe,
    id: `${occurrence.id}:${keyframe.id}`,
    timeMs: occurrence.startMs + keyframe.timeMs,
    value: translatedTrackValue(track, keyframe.value, occurrence),
  }))
  if ('placementId' in clone.target) clone.target = { ...clone.target, placementId: `${occurrence.id}:${clone.target.placementId}` }
  if ('instanceId' in clone.target) clone.target = { ...clone.target, instanceId: `${occurrence.id}:${clone.target.instanceId}` }
  return clone
}

function translatedTrackValue(
  track: ShowPropertyAnimationTrack,
  value: number,
  occurrence: ShowGroupOccurrence,
): number {
  if (track.target.kind === 'placement-transform') {
    if (track.target.property === 'positionX') return value + occurrence.translationX
    if (track.target.property === 'positionY') return value + occurrence.translationY
  }
  if (track.target.kind === 'placement-viewport') {
    if (track.target.property === 'x') return value + occurrence.translationX
    if (track.target.property === 'y') return value + occurrence.translationY
  }
  return value
}

function ensureOverlayCount(
  zone: ShowZoneComposition,
  requiredCount: number,
  occurrence: ShowGroupOccurrence,
): void {
  while (zone.overlays.length < requiredCount) {
    const ordinal = zone.overlays.length + 1
    zone.overlays.unshift({
      id: `${occurrence.sceneId}:${occurrence.zoneId}:group-layer:${ordinal}`,
      name: `Layer ${ordinal}`,
      placements: [],
    })
  }
}

function validateDefinition(
  issues: ShowGroupValidationIssue[],
  path: string,
  definition: ShowGroupDefinition,
): void {
  const instanceIds = new Set<string>()
  definition.patternInstances.forEach((instance, index) => {
    if (instanceIds.has(instance.id)) addIssue(issues, `${path}.patternInstances[${index}].id`, 'duplicate-id', `Pattern instance id "${instance.id}" is duplicated inside the Group.`)
    instanceIds.add(instance.id)
  })
  const placementIds = new Set<string>()
  const placementById = new Map<string, ShowGroupPlacement>()
  definition.placements.forEach((placement, index) => {
    const placementPath = `${path}.placements[${index}]`
    if (placementIds.has(placement.id)) addIssue(issues, `${placementPath}.id`, 'duplicate-id', `Group placement id "${placement.id}" is duplicated.`)
    placementIds.add(placement.id)
    placementById.set(placement.id, placement)
    if (!instanceIds.has(placement.instanceId)) addIssue(issues, `${placementPath}.instanceId`, 'missing-instance', `Pattern instance "${placement.instanceId}" does not exist inside the Group.`)
    if (!Number.isInteger(placement.layerOffset) || placement.layerOffset < 0) addIssue(issues, `${placementPath}.layerOffset`, 'out-of-bounds', 'Group Layer offset must be a non-negative integer.')
    if (!Number.isInteger(placement.startMs) || !Number.isInteger(placement.durationMs) || placement.startMs < 0 || placement.durationMs <= 0) {
      addIssue(issues, placementPath, 'out-of-bounds', 'Group Clip time must use non-negative whole milliseconds and positive duration.')
    }
  })
  for (const layerOffset of new Set(definition.placements.map((placement) => placement.layerOffset))) {
    const ordered = definition.placements.filter((placement) => placement.layerOffset === layerOffset)
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    ordered.forEach((placement, index) => {
      const previous = ordered[index - 1]
      if (previous && previous.startMs + previous.durationMs > placement.startMs) {
        addIssue(issues, path, 'overlap', 'Group Clips on one relative Layer cannot overlap.')
      }
    })
  }
  const transitionIds = new Set<string>()
  for (const [index, transition] of (definition.transitions ?? []).entries()) {
    const transitionPath = `${path}.transitions[${index}]`
    if (transitionIds.has(transition.id)) addIssue(issues, `${transitionPath}.id`, 'duplicate-id', `Group Transition id "${transition.id}" is duplicated.`)
    transitionIds.add(transition.id)
    const from = placementById.get(transition.fromPlacementId)
    const to = placementById.get(transition.toPlacementId)
    if (!from) addIssue(issues, `${transitionPath}.fromPlacementId`, 'missing-placement', `Group placement "${transition.fromPlacementId}" does not exist.`)
    if (!to) addIssue(issues, `${transitionPath}.toPlacementId`, 'missing-placement', `Group placement "${transition.toPlacementId}" does not exist.`)
    if (from && to && from.layerOffset !== to.layerOffset) addIssue(issues, transitionPath, 'cross-layer', 'A Group Transition must connect Clips on the same relative Layer.')
    if (from && to && from.startMs + from.durationMs + transition.durationMs !== to.startMs) {
      addIssue(issues, transitionPath, 'invalid-transition', 'A Group Transition must occupy the exact gap between its Clip endpoints.')
    }
  }
  const durationMs = groupDefinitionDuration(definition)
  const trackIds = new Set<string>()
  for (const [trackIndex, track] of (definition.propertyTracks ?? []).entries()) {
    const trackPath = `${path}.propertyTracks[${trackIndex}]`
    if (trackIds.has(track.id)) addIssue(issues, `${trackPath}.id`, 'duplicate-id', `Group property track id "${track.id}" is duplicated.`)
    trackIds.add(track.id)
    if ('placementId' in track.target && !placementIds.has(track.target.placementId)) {
      addIssue(issues, `${trackPath}.target`, 'invalid-property-track', `Group placement "${track.target.placementId}" does not exist.`)
    }
    if ('instanceId' in track.target && !instanceIds.has(track.target.instanceId)) {
      addIssue(issues, `${trackPath}.target`, 'invalid-property-track', `Group Pattern instance "${track.target.instanceId}" does not exist.`)
    }
    if (track.keyframes.length < 2) {
      addIssue(issues, `${trackPath}.keyframes`, 'invalid-property-track', 'A Group property animation needs at least two keyframes.')
    }
    track.keyframes.forEach((keyframe, keyframeIndex) => {
      const previous = track.keyframes[keyframeIndex - 1]
      if (
        !Number.isInteger(keyframe.timeMs)
        || keyframe.timeMs < 0
        || keyframe.timeMs > durationMs
        || (previous && keyframe.timeMs <= previous.timeMs)
      ) {
        addIssue(issues, `${trackPath}.keyframes[${keyframeIndex}].timeMs`, 'invalid-property-track', 'Group keyframes must be ordered whole milliseconds inside the Group duration.')
      }
    })
  }
}

function validateMaterializedOccupancy(
  issues: ShowGroupValidationIssue[],
  composition: ShowCompositionV1,
  definitions: Map<string, ShowGroupDefinition>,
): void {
  if (!(composition.groupOccurrences?.length)) return
  const spans = new Map<string, Array<{ startMs: number; endMs: number; id: string; group: boolean }>>()
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      addSpans(spans, `${scene.sceneId}:${zone.zoneId}:0`, zone.main)
      zone.overlays.forEach((layer, index) => {
        const ordinal = zone.overlays.length - index
        addSpans(spans, `${scene.sceneId}:${zone.zoneId}:${ordinal}`, layer.placements)
      })
    }
  }
  for (const occurrence of composition.groupOccurrences ?? []) {
    const definition = definitions.get(occurrence.definitionId)
    if (!definition) continue
    for (const placement of definition.placements) {
      const key = `${occurrence.sceneId}:${occurrence.zoneId}:${occurrence.baseLayer + placement.layerOffset}`
      const entries = spans.get(key) ?? []
      entries.push({
        id: `${occurrence.id}:${placement.id}`,
        startMs: occurrence.startMs + placement.startMs,
        endMs: occurrence.startMs + placement.startMs + placement.durationMs,
        group: true,
      })
      spans.set(key, entries)
    }
  }
  for (const entries of spans.values()) {
    const ordered = entries.sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    ordered.forEach((entry, index) => {
      const previous = ordered[index - 1]
      if (previous && previous.endMs > entry.startMs && (previous.group || entry.group)) {
        addIssue(issues, 'groupOccurrences', 'overlap', `Group placement "${entry.id}" overlaps "${previous.id}" on the destination Layer.`)
      }
    })
  }
}

function ordinaryPlacementOwners(composition: ShowCompositionV1): Map<string, PlacementOwner> {
  const owners = new Map<string, PlacementOwner>()
  for (const [id, owner] of ordinaryOwnedPlacements(composition)) {
    const { placement: _placement, ...placementOwner } = owner
    owners.set(id, placementOwner)
  }
  return owners
}

function ordinaryOwnedPlacements(composition: ShowCompositionV1): Map<string, OwnedPlacement> {
  const owners = new Map<string, OwnedPlacement>()
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      zone.main.forEach((placement) => owners.set(placement.id, {
        sceneId: scene.sceneId,
        zoneId: zone.zoneId,
        layerKey: `${scene.sceneId}:${zone.zoneId}:main`,
        absoluteLayer: 0,
        placement,
      }))
      zone.overlays.forEach((layer, index) => layer.placements.forEach((placement) => owners.set(placement.id, {
        sceneId: scene.sceneId,
        zoneId: zone.zoneId,
        layerKey: `${scene.sceneId}:${zone.zoneId}:${layer.id}`,
        absoluteLayer: zone.overlays.length - index,
        placement,
      })))
    }
  }
  return owners
}

function ordinaryPlacementInstanceIds(composition: ShowCompositionV1): Set<string> {
  return new Set(composition.scenes.flatMap((scene) => scene.zones.flatMap((zone) => [
    ...zone.main.map((placement) => placement.instanceId),
    ...zone.overlays.flatMap((layer) => layer.placements.map((placement) => placement.instanceId)),
  ])))
}

function groupLocalId(occurrenceId: string, materializedId: string): string {
  const prefix = `${occurrenceId}:`
  return materializedId.startsWith(prefix) ? materializedId.slice(prefix.length) : materializedId
}

function connectedGroupPlacementIds(
  definition: ShowGroupDefinition,
  firstPlacementId: string,
): Set<string> {
  const placementIds = new Set<string>([firstPlacementId])
  let endpointId = firstPlacementId
  while (true) {
    const nextTransition = definition.transitions?.find((transition) => transition.fromPlacementId === endpointId)
    if (!nextTransition) break
    placementIds.add(nextTransition.toPlacementId)
    endpointId = nextTransition.toPlacementId
  }
  return placementIds
}

function shiftGroupDefinitionPlacements(
  definition: ShowGroupDefinition,
  placementIds: Set<string>,
  deltaMs: number,
): void {
  for (const placement of definition.placements) {
    if (placementIds.has(placement.id)) placement.startMs += deltaMs
  }
  const exclusivelyMovedInstanceIds = new Set(definition.patternInstances.flatMap((instance) => {
    const users = definition.placements.filter((placement) => placement.instanceId === instance.id)
    return users.length > 0 && users.every((placement) => placementIds.has(placement.id))
      ? [instance.id]
      : []
  }))
  for (const track of definition.propertyTracks ?? []) {
    const movesWithPlacement = 'placementId' in track.target && placementIds.has(track.target.placementId)
    const movesWithInstance = 'instanceId' in track.target && exclusivelyMovedInstanceIds.has(track.target.instanceId)
    if (!movesWithPlacement && !movesWithInstance) continue
    track.keyframes.forEach((keyframe) => {
      keyframe.timeMs += deltaMs
    })
  }
}

function addSpans(
  spans: Map<string, Array<{ startMs: number; endMs: number; id: string; group: boolean }>>,
  key: string,
  placements: Array<ShowMainPlacement | ShowOverlayPlacement>,
): void {
  spans.set(key, [
    ...(spans.get(key) ?? []),
    ...placements.map((placement) => ({
      id: placement.id,
      startMs: placement.startMs,
      endMs: placement.startMs + placement.durationMs,
      group: false,
    })),
  ])
}

function groupDefinitionDuration(definition: ShowGroupDefinition): number {
  return Math.max(0, ...definition.placements.map((placement) => placement.startMs + placement.durationMs))
}

function addIssue(
  issues: ShowGroupValidationIssue[],
  path: string,
  code: ShowGroupValidationCode,
  message: string,
): void {
  issues.push({ path, code, message })
}

function cloneJson<T>(value: T): T {
  return structuredClone(value)
}

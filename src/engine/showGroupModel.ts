import type {
  ShowCompositionV1,
  ShowGroupDefinition,
  ShowGroupOccurrence,
  ShowGroupPlacement,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPatternInstance,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowZoneComposition,
} from './personalContentRecords'

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

/** Realize only the target Zone's implicit Layer shells, retaining Group authorship. */
export function materializeShowGroupLayerShells(composition: ShowCompositionV1, zoneId: string): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const definitions = new Map((draft.groupDefinitions ?? []).map(definition => [definition.id, definition]))
  for (const occurrence of draft.groupOccurrences ?? []) {
    if (occurrence.zoneId !== zoneId) continue
    const definition = definitions.get(occurrence.definitionId)
    const zone = draft.scenes.find(scene => scene.sceneId === occurrence.sceneId)?.zones.find(zone => zone.zoneId === zoneId)
    if (definition && zone) ensureGroupOverlayLayers(zone, definition, occurrence)
  }
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

  ensureGroupOverlayLayers(zone, definition, occurrence)
  for (const child of definition.placements) {
    const absoluteLayer = occurrence.baseLayer + child.layerOffset
    const placement = materializedPlacement(child, occurrence, placementId(child.id), instanceId(child.instanceId))
    if (absoluteLayer === 0) {
      const { layerOffset: _layerOffset, ...main } = placement
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

function ensureGroupOverlayLayers(zone: ShowZoneComposition, definition: ShowGroupDefinition, occurrence: ShowGroupOccurrence): void {
  const maximumLayer = Math.max(0, ...definition.placements.map(placement => occurrence.baseLayer + placement.layerOffset))
  ensureOverlayCount(zone, maximumLayer, occurrence)
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

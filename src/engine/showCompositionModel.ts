import { projectFlatShowComposition } from './showCompositionProjection'
import {
  normalizeShowPropertyTracks,
  validateShowPropertyTracks,
  type ShowPropertyAnimationValidationCode,
} from './showPropertyAnimation'
import type { ShowCompileRecipeSourceLookup } from './showModel'
import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowOverlayLayer,
  ShowOverlayPlacement,
  ShowPatternInstance,
  ShowRecord,
  ShowSceneComposition,
  ShowZoneComposition,
} from './personalContentRecords'
import { compactShowClipTransform } from './showClipTransform'
import { compactShowClipViewport } from './showClipViewport'

export type ShowCompositionValidationCode =
  | 'duplicate-id'
  | 'missing-scene'
  | 'missing-zone'
  | 'missing-instance'
  | 'missing-placement'
  | 'not-finite'
  | 'not-integer'
  | 'out-of-bounds'
  | 'overlap'
  | 'cross-layer'
  | 'invalid-transition'
  | ShowPropertyAnimationValidationCode

export interface ShowCompositionValidationIssue {
  path: string
  code: ShowCompositionValidationCode
  message: string
}

export interface ShowMainPlacementOwner {
  sceneId: string
  zoneId: string
  placementId: string
}

export interface ShowOverlayLayerOwner {
  sceneId: string
  zoneId: string
  layerId: string
}

export interface ShowOverlayPlacementOwner extends ShowOverlayLayerOwner {
  placementId: string
}

/**
 * Convert the flat compatibility record into the first durable ownership
 * shape. The version-0 projection supplies the exact inferred runtime-instance
 * identities, so Continue and Restart preserve current compiler semantics.
 */
export function projectFlatShowToCompositionV1(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): ShowCompositionV1 {
  const projection = projectFlatShowComposition(show, lookup)
  const patternInstances: ShowPatternInstance[] = projection.patternInstances.map((instance) => ({
    id: instance.id,
    pattern: { ...instance.pattern },
    patternName: instance.patternName,
    ...(instance.evaluationPolicy && instance.evaluationPolicy !== 'live'
      ? { evaluationPolicy: instance.evaluationPolicy }
      : {}),
    time: {
      timeScale: instance.simulation.timeScale,
      timeOffsetMs: instance.simulation.timeOffsetMs,
      ...(instance.simulation.lightShutter
        ? { lightShutter: cloneJson(instance.simulation.lightShutter) }
        : {}),
      ...(instance.simulation.steppedClock
        ? { steppedClock: cloneJson(instance.simulation.steppedClock) }
        : {}),
    },
    ...(instance.simulation.controlTargets
      ? { controlTargets: { ...instance.simulation.controlTargets } }
      : {}),
  }))
  const scenes: ShowSceneComposition[] = projection.scenes.map((scene) => ({
    sceneId: scene.id,
    zones: show.zones.map((zone): ShowZoneComposition => ({
      zoneId: zone.id,
      main: scene.placements.flatMap((placement): ShowMainPlacement[] => {
        if (!placement.zoneIds.includes(zone.id)) return []
        const id = placement.zoneIds.length === 1 ? placement.id : `${placement.id}-${zone.id}`
        return [{
          id,
          instanceId: placement.instanceId,
          startMs: placement.startMs,
          durationMs: placement.durationMs,
          view: {
            mirror: placement.appearance.mirror,
            phase: placement.appearance.phase,
            brightness: placement.appearance.brightness,
          },
          ...(placement.appearance.transform
            ? { transform: cloneJson(placement.appearance.transform) }
            : {}),
          ...(placement.appearance.viewport
            ? { viewport: cloneJson(placement.appearance.viewport) }
            : {}),
          ...(placement.appearance.effects
            ? { effects: cloneJson(placement.appearance.effects) }
          : {}),
        }]
      }),
      overlays: [],
    })),
  }))
  return normalizeShowComposition(show, { version: 1, patternInstances, scenes })
}

/** Deterministic ordering and cloning only; invalid authored facts remain visible to validation. */
export function normalizeShowComposition(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
): ShowCompositionV1 {
  const sceneOrder = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const zoneOrder = new Map(show.zones.map((zone, index) => [zone.id, index]))
  return {
    version: 1,
    ...(Number.isInteger(composition.durationMs) && (composition.durationMs ?? 0) > 0
      ? { durationMs: composition.durationMs }
      : {}),
    ...(composition.markers && composition.markers.length > 0
      ? {
          markers: cloneJson(composition.markers)
            .filter((marker) => marker.id && Number.isInteger(marker.timeMs) && marker.timeMs >= 0)
            .sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)),
        }
      : {}),
    patternInstances: cloneJson(composition.patternInstances)
      .sort((a, b) => a.id.localeCompare(b.id)),
    ...(composition.transitions
      ? { transitions: cloneJson(composition.transitions).sort((a, b) => a.id.localeCompare(b.id)) }
      : {}),
    scenes: cloneJson(composition.scenes)
      .sort((a, b) => ownerOrder(sceneOrder, a.sceneId) - ownerOrder(sceneOrder, b.sceneId) || a.sceneId.localeCompare(b.sceneId))
       .map((scene) => ({
         ...scene,
         ...(scene.propertyTracks
           ? { propertyTracks: normalizeShowPropertyTracks(scene.propertyTracks) }
           : {}),
         zones: scene.zones
          .sort((a, b) => ownerOrder(zoneOrder, a.zoneId) - ownerOrder(zoneOrder, b.zoneId) || a.zoneId.localeCompare(b.zoneId))
          .map((zone) => ({
            ...zone,
            main: zone.main
              .map(normalizePlacementAppearance)
              .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
            overlays: (zone.overlays ?? []).map((layer) => ({
              ...layer,
              placements: layer.placements
                .map(normalizePlacementAppearance)
                .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
            })),
          })),
      })),
  }
}

function normalizePlacementAppearance<T extends ShowMainPlacement | ShowOverlayPlacement>(placement: T): T {
  const { transform: authoredTransform, viewport: authoredViewport, ...rest } = placement
  const transform = compactShowClipTransform(authoredTransform)
  const viewport = compactShowClipViewport(authoredViewport)
  return {
    ...rest,
    ...(transform ? { transform } : {}),
    ...(viewport ? { viewport } : {}),
  } as T
}

export function validateShowComposition(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
): ShowCompositionValidationIssue[] {
  const issues: ShowCompositionValidationIssue[] = []
  const sceneById = new Map(show.scenes.map((scene) => [scene.id, scene]))
  const zoneIds = new Set(show.zones.map((zone) => zone.id))
  const instanceIds = new Set<string>()
  const placementIds = new Set<string>()
  const placementOwnerById = new Map<string, {
    layerKey: string
    sceneId: string
    startMs: number
    endMs: number
  }>()
  const layerIds = new Set<string>()

  if (composition.durationMs !== undefined) {
    validateFiniteInteger(issues, 'durationMs', composition.durationMs)
    if (composition.durationMs <= 0) {
      addIssue(issues, 'durationMs', 'out-of-bounds', 'Show End must be positive.')
    }
  }

  const markerIds = new Set<string>()
  for (const [markerIndex, marker] of (composition.markers ?? []).entries()) {
    const path = `markers[${markerIndex}]`
    if (markerIds.has(marker.id)) addIssue(issues, `${path}.id`, 'duplicate-id', `Marker id "${marker.id}" is duplicated.`)
    markerIds.add(marker.id)
    validateFiniteInteger(issues, `${path}.timeMs`, marker.timeMs)
    if (marker.timeMs < 0) addIssue(issues, `${path}.timeMs`, 'out-of-bounds', 'Marker time cannot be negative.')
  }

  composition.patternInstances.forEach((instance, instanceIndex) => {
    const path = `patternInstances[${instanceIndex}]`
    if (instanceIds.has(instance.id)) addIssue(issues, `${path}.id`, 'duplicate-id', `Pattern instance id "${instance.id}" is duplicated.`)
    instanceIds.add(instance.id)
    validateFiniteInteger(issues, `${path}.time.timeOffsetMs`, instance.time.timeOffsetMs)
    if (!Number.isFinite(instance.time.timeScale)) {
      addIssue(issues, `${path}.time.timeScale`, 'not-finite', 'Animation speed must be finite.')
    }
  })

  composition.scenes.forEach((scene, sceneIndex) => {
    const scenePath = `scenes[${sceneIndex}]`
    const owner = sceneById.get(scene.sceneId)
    if (!owner) addIssue(issues, `${scenePath}.sceneId`, 'missing-scene', `Scene "${scene.sceneId}" does not exist.`)
    scene.zones.forEach((zone, zoneIndex) => {
      const zonePath = `${scenePath}.zones[${zoneIndex}]`
      if (!zoneIds.has(zone.zoneId)) addIssue(issues, `${zonePath}.zoneId`, 'missing-zone', `Zone "${zone.zoneId}" does not exist.`)
      const ordered = [...zone.main].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
      ordered.forEach((placement, orderedIndex) => {
        const placementIndex = zone.main.findIndex((candidate) => candidate === placement)
        const path = `${zonePath}.main[${placementIndex}]`
        if (placementIds.has(placement.id)) addIssue(issues, `${path}.id`, 'duplicate-id', `Placement id "${placement.id}" is duplicated.`)
        placementIds.add(placement.id)
        placementOwnerById.set(placement.id, {
          layerKey: `${scene.sceneId}:${zone.zoneId}:main`,
          sceneId: scene.sceneId,
          startMs: placement.startMs,
          endMs: placement.startMs + placement.durationMs,
        })
        if (!instanceIds.has(placement.instanceId)) {
          addIssue(issues, `${path}.instanceId`, 'missing-instance', `Pattern instance "${placement.instanceId}" does not exist.`)
        }
        validateFiniteInteger(issues, `${path}.startMs`, placement.startMs)
        validateFiniteInteger(issues, `${path}.durationMs`, placement.durationMs)
        if (placement.startMs < 0 || placement.durationMs <= 0 || (owner && placement.startMs + placement.durationMs > owner.durationMs)) {
          addIssue(issues, `${path}.durationMs`, 'out-of-bounds', 'Main placement must stay inside positive Scene-local time.')
        }
        const previous = ordered[orderedIndex - 1]
        if (previous && previous.startMs + previous.durationMs > placement.startMs) {
          addIssue(issues, `${path}.startMs`, 'overlap', 'Main placements in one Scene and Zone cannot overlap.')
        }
      })
      zone.overlays.forEach((layer, layerIndex) => {
        const layerPath = `${zonePath}.overlays[${layerIndex}]`
        if (layerIds.has(layer.id)) addIssue(issues, `${layerPath}.id`, 'duplicate-id', `Overlay layer id "${layer.id}" is duplicated.`)
        layerIds.add(layer.id)
        const orderedPlacements = [...layer.placements].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
        orderedPlacements.forEach((placement, orderedIndex) => {
          const placementIndex = layer.placements.findIndex((candidate) => candidate === placement)
          const path = `${layerPath}.placements[${placementIndex}]`
          if (placementIds.has(placement.id)) addIssue(issues, `${path}.id`, 'duplicate-id', `Placement id "${placement.id}" is duplicated.`)
          placementIds.add(placement.id)
          placementOwnerById.set(placement.id, {
            layerKey: `${scene.sceneId}:${zone.zoneId}:overlay:${layerIndex}`,
            sceneId: scene.sceneId,
            startMs: placement.startMs,
            endMs: placement.startMs + placement.durationMs,
          })
          if (!instanceIds.has(placement.instanceId)) {
            addIssue(issues, `${path}.instanceId`, 'missing-instance', `Pattern instance "${placement.instanceId}" does not exist.`)
          }
          validateFiniteInteger(issues, `${path}.startMs`, placement.startMs)
          validateFiniteInteger(issues, `${path}.durationMs`, placement.durationMs)
          if (placement.startMs < 0 || placement.durationMs <= 0 || (owner && placement.startMs + placement.durationMs > owner.durationMs)) {
            addIssue(issues, `${path}.durationMs`, 'out-of-bounds', 'Overlay placement must stay inside positive Scene-local time.')
          }
          if (!Number.isFinite(placement.opacity) || placement.opacity < 0 || placement.opacity > 1) {
            addIssue(issues, `${path}.opacity`, 'out-of-bounds', 'Overlay opacity must be between 0 and 1.')
          }
          const previous = orderedPlacements[orderedIndex - 1]
          if (previous && previous.startMs + previous.durationMs > placement.startMs) {
            addIssue(issues, `${path}.startMs`, 'overlap', 'Overlay placements in one layer cannot overlap.')
          }
        })
      })
    })
  })
  const transitionIds = new Set<string>()
  for (const [transitionIndex, transition] of (composition.transitions ?? []).entries()) {
    const path = `transitions[${transitionIndex}]`
    if (transitionIds.has(transition.id)) {
      addIssue(issues, `${path}.id`, 'duplicate-id', `Layer transition id "${transition.id}" is duplicated.`)
    }
    transitionIds.add(transition.id)
    validateFiniteInteger(issues, `${path}.durationMs`, transition.durationMs)
    if (transition.durationMs <= 0) {
      addIssue(issues, `${path}.durationMs`, 'out-of-bounds', 'A non-Cut Layer transition must have positive duration.')
    }
    const fromOwner = placementOwnerById.get(transition.fromPlacementId)
    const toOwner = placementOwnerById.get(transition.toPlacementId)
    if (!fromOwner) {
      addIssue(issues, `${path}.fromPlacementId`, 'missing-placement', `Placement "${transition.fromPlacementId}" does not exist.`)
    }
    if (!toOwner) {
      addIssue(issues, `${path}.toPlacementId`, 'missing-placement', `Placement "${transition.toPlacementId}" does not exist.`)
    }
    if (fromOwner && toOwner && fromOwner.layerKey !== toOwner.layerKey) {
      addIssue(issues, path, 'cross-layer', 'A Layer transition must connect placements on the same Layer.')
    }
    if (fromOwner && toOwner && fromOwner.layerKey === toOwner.layerKey) {
      const orderedPlacementIds = [...placementOwnerById.entries()]
        .filter(([, owner]) => owner.layerKey === fromOwner.layerKey)
        .sort((left, right) => left[1].startMs - right[1].startMs || left[0].localeCompare(right[0]))
        .map(([placementId]) => placementId)
      const fromIndex = orderedPlacementIds.indexOf(transition.fromPlacementId)
      if (fromIndex < 0 || orderedPlacementIds[fromIndex + 1] !== transition.toPlacementId) {
        addIssue(issues, path, 'invalid-transition', 'A Layer transition must connect consecutive Clips.')
      }
    }
    if (fromOwner && toOwner && (
      fromOwner.sceneId !== toOwner.sceneId
      || fromOwner.endMs + transition.durationMs !== toOwner.startMs
    )) {
      addIssue(issues, path, 'invalid-transition', 'A Layer transition must occupy the exact gap between its ordered Clip endpoints.')
    }
    if (fromOwner && toOwner) {
      const unrelatedOwners = [...placementOwnerById.entries()].flatMap(([placementId, owner]) => {
        return (
          placementId === transition.fromPlacementId
          || placementId === transition.toPlacementId
          || owner.sceneId !== fromOwner.sceneId
        ) ? [] : [owner]
      })
      const unrelatedBoundaryInside = unrelatedOwners.some((owner) => {
        const overlapsOpenInterval = owner.endMs > fromOwner.endMs && owner.startMs < toOwner.startMs
        const spansCompleteInterval = owner.startMs < fromOwner.endMs && owner.endMs > toOwner.startMs
        return overlapsOpenInterval && !spansCompleteInterval
      })
      if (unrelatedBoundaryInside) {
        addIssue(issues, path, 'invalid-transition', 'An unrelated Clip cannot start or stop inside a Layer transition.')
      }
      const unrelatedSpansCompleteInterval = unrelatedOwners.some((owner) => (
        owner.startMs < fromOwner.endMs && owner.endMs > toOwner.startMs
      ))
      if (unrelatedSpansCompleteInterval && (transition.kind === 'fade-color' || transition.kind === 'motion')) {
        addIssue(issues, path, 'invalid-transition', 'Fade and Motion Layer transitions cannot pass over an unrelated Clip.')
      }
    }
  }
  issues.push(...validateShowPropertyTracks(show, composition))
  return issues
}

export function addShowMainPlacement(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: { sceneId: string; zoneId: string; placement: ShowMainPlacement },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const zone = findZoneComposition(draft, input.sceneId, input.zoneId)
    if (!zone) return false
    zone.main.push(cloneJson(input.placement))
    return true
  })
}

export function addShowOverlayLayer(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: { sceneId: string; zoneId: string; layer: ShowOverlayLayer },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const zone = findZoneComposition(draft, input.sceneId, input.zoneId)
    if (!zone) return false
    zone.overlays.push(cloneJson(input.layer))
    return true
  })
}

export function renameShowOverlayLayer(
  composition: ShowCompositionV1,
  input: ShowOverlayLayerOwner & { name: string },
): ShowCompositionV1 {
  const name = input.name.trim()
  if (!name) return composition
  const draft = cloneJson(composition)
  const layer = findOverlayLayer(draft, input)
  if (!layer) return composition
  layer.name = name
  return draft
}

export function reorderShowOverlayLayer(
  composition: ShowCompositionV1,
  input: ShowOverlayLayerOwner & { targetIndex: number },
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const zone = findZoneComposition(draft, input.sceneId, input.zoneId)
  const currentIndex = zone?.overlays.findIndex((layer) => layer.id === input.layerId) ?? -1
  if (!zone || currentIndex < 0 || !Number.isInteger(input.targetIndex)) return composition
  const targetIndex = Math.max(0, Math.min(zone.overlays.length - 1, input.targetIndex))
  if (targetIndex === currentIndex) return composition
  const [layer] = zone.overlays.splice(currentIndex, 1)
  zone.overlays.splice(targetIndex, 0, layer)
  return draft
}

export function deleteShowOverlayLayer(
  composition: ShowCompositionV1,
  input: ShowOverlayLayerOwner,
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const zone = findZoneComposition(draft, input.sceneId, input.zoneId)
  const layer = zone?.overlays.find((candidate) => candidate.id === input.layerId)
  if (!zone || !layer) return composition
  const deletedPlacementIds = new Set(layer.placements.map((placement) => placement.id))
  zone.overlays = zone.overlays.filter((layer) => layer.id !== input.layerId)
  removePlacementTracks(draft, input.sceneId, deletedPlacementIds)
  removePlacementTransitions(draft, deletedPlacementIds)
  return draft
}

export function addShowOverlayPlacement(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: ShowOverlayLayerOwner & { placement: ShowOverlayPlacement },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const layer = findOverlayLayer(draft, input)
    if (!layer) return false
    layer.placements.push(cloneJson(input.placement))
    return true
  })
}

export function addShowOverlayClip(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: ShowOverlayLayerOwner & { instance: ShowPatternInstance; placement: ShowOverlayPlacement },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    if (draft.patternInstances.some((candidate) => candidate.id === input.instance.id)) return false
    const layer = findOverlayLayer(draft, input)
    if (!layer) return false
    draft.patternInstances.push(cloneJson(input.instance))
    layer.placements.push(cloneJson(input.placement))
    return true
  })
}

export function moveShowOverlayPlacement(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: ShowOverlayPlacementOwner & { startMs: number; targetLayerId?: string },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const sourceLayer = findOverlayLayer(draft, input)
    const placement = sourceLayer?.placements.find((candidate) => candidate.id === input.placementId)
    const targetLayer = findOverlayLayer(draft, { ...input, layerId: input.targetLayerId ?? input.layerId })
    if (!sourceLayer || !placement || !targetLayer) return false
    placement.startMs = input.startMs
    if (targetLayer.id !== sourceLayer.id) {
      sourceLayer.placements = sourceLayer.placements.filter((candidate) => candidate.id !== placement.id)
      targetLayer.placements.push(placement)
    }
    return true
  })
}

export function trimShowOverlayPlacement(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: ShowOverlayPlacementOwner & { startMs: number; durationMs: number; opacity?: number },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const placement = findOverlayPlacement(draft, input)
    if (!placement) return false
    placement.startMs = input.startMs
    placement.durationMs = input.durationMs
    if (input.opacity !== undefined) placement.opacity = input.opacity
    return true
  })
}

export function splitShowOverlayPlacement(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: ShowOverlayPlacementOwner & { atMs: number; newPlacementId: string },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const layer = findOverlayLayer(draft, input)
    const placement = layer?.placements.find((candidate) => candidate.id === input.placementId)
    if (!layer || !placement) return false
    const endMs = placement.startMs + placement.durationMs
    if (input.atMs <= placement.startMs || input.atMs >= endMs) return false
    const idExists = draft.scenes.some((scene) => scene.zones.some((zone) => (
      zone.main.some((candidate) => candidate.id === input.newPlacementId)
      || zone.overlays.some((candidate) => candidate.placements.some((item) => item.id === input.newPlacementId))
    )))
    if (idExists) return false
    const right = cloneJson(placement)
    right.id = input.newPlacementId
    right.startMs = input.atMs
    right.durationMs = endMs - input.atMs
    placement.durationMs = input.atMs - placement.startMs
    layer.placements.push(right)
    draft.transitions?.forEach((transition) => {
      if (transition.fromPlacementId === placement.id) transition.fromPlacementId = input.newPlacementId
    })
    clonePlacementTracks(draft, input.sceneId, placement.id, input.newPlacementId)
    return true
  })
}

export function deleteShowOverlayPlacement(
  composition: ShowCompositionV1,
  input: ShowOverlayPlacementOwner,
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const layer = findOverlayLayer(draft, input)
  if (!layer?.placements.some((placement) => placement.id === input.placementId)) return composition
  layer.placements = layer.placements.filter((placement) => placement.id !== input.placementId)
  removePlacementTracks(draft, input.sceneId, new Set([input.placementId]))
  removePlacementTransitions(draft, new Set([input.placementId]))
  return draft
}

export function addShowMainClip(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: { sceneId: string; zoneId: string; instance: ShowPatternInstance; placement: ShowMainPlacement },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    if (draft.patternInstances.some((candidate) => candidate.id === input.instance.id)) return false
    const zone = findZoneComposition(draft, input.sceneId, input.zoneId)
    if (!zone) return false
    draft.patternInstances.push(cloneJson(input.instance))
    zone.main.push(cloneJson(input.placement))
    return true
  })
}

export function moveShowMainPlacement(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: ShowMainPlacementOwner & { startMs: number },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const placement = findPlacement(draft, input)
    if (!placement) return false
    placement.startMs = input.startMs
    return true
  })
}

export function trimShowMainPlacement(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: ShowMainPlacementOwner & { startMs: number; durationMs: number },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const placement = findPlacement(draft, input)
    if (!placement) return false
    placement.startMs = input.startMs
    placement.durationMs = input.durationMs
    return true
  })
}

export function splitShowMainPlacement(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  input: ShowMainPlacementOwner & { atMs: number; newPlacementId: string },
): ShowCompositionV1 {
  return commitValidEdit(show, composition, (draft) => {
    const zone = findZoneComposition(draft, input.sceneId, input.zoneId)
    const placement = zone?.main.find((candidate) => candidate.id === input.placementId)
    if (!zone || !placement) return false
    const endMs = placement.startMs + placement.durationMs
    if (input.atMs <= placement.startMs || input.atMs >= endMs) return false
    if (draft.scenes.some((scene) => scene.zones.some((candidate) => candidate.main.some((item) => item.id === input.newPlacementId)))) return false
    const right = cloneJson(placement)
    right.id = input.newPlacementId
    right.startMs = input.atMs
    right.durationMs = endMs - input.atMs
    placement.durationMs = input.atMs - placement.startMs
    zone.main.push(right)
    draft.transitions?.forEach((transition) => {
      if (transition.fromPlacementId === placement.id) transition.fromPlacementId = input.newPlacementId
    })
    clonePlacementTracks(draft, input.sceneId, placement.id, input.newPlacementId)
    return true
  })
}

export function restartShowMainPlacement(
  composition: ShowCompositionV1,
  input: ShowMainPlacementOwner & { newInstanceId: string },
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const placement = findPlacement(draft, input)
  if (!placement || draft.patternInstances.some((instance) => instance.id === input.newInstanceId)) return composition
  const instance = draft.patternInstances.find((candidate) => candidate.id === placement.instanceId)
  if (!instance) return composition
  draft.patternInstances.push({ ...cloneJson(instance), id: input.newInstanceId })
  placement.instanceId = input.newInstanceId
  cloneInstanceTracks(draft, input.sceneId, instance.id, input.newInstanceId)
  return {
    ...draft,
    patternInstances: draft.patternInstances.sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export function replaceShowPatternInstance(
  composition: ShowCompositionV1,
  instanceId: string,
  replacement: Pick<ShowPatternInstance, 'pattern' | 'patternName'>,
): ShowCompositionV1 {
  if (!composition.patternInstances.some((instance) => instance.id === instanceId)) return composition
  return {
    ...cloneJson(composition),
    patternInstances: composition.patternInstances.map((instance) => instance.id === instanceId
      ? { ...cloneJson(instance), pattern: { ...replacement.pattern }, patternName: replacement.patternName }
      : cloneJson(instance)),
  }
}

export function deleteShowMainPlacement(
  composition: ShowCompositionV1,
  input: ShowMainPlacementOwner,
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const zone = findZoneComposition(draft, input.sceneId, input.zoneId)
  if (!zone || !zone.main.some((placement) => placement.id === input.placementId)) return composition
  zone.main = zone.main.filter((placement) => placement.id !== input.placementId)
  removePlacementTracks(draft, input.sceneId, new Set([input.placementId]))
  removePlacementTransitions(draft, new Set([input.placementId]))
  return draft
}

/** Resolve drag intent to a legal millisecond start, preferring nearby magnetic edges. */
export function resolveShowMainPlacementStart(
  sceneDurationMs: number,
  placement: Pick<ShowMainPlacement, 'id' | 'durationMs'>,
  placements: Array<Pick<ShowMainPlacement, 'id' | 'startMs' | 'durationMs'>>,
  desiredStartMs: number,
  thresholdMs: number,
): number {
  const maxStart = Math.max(0, sceneDurationMs - placement.durationMs)
  const desired = Math.round(Math.max(0, Math.min(maxStart, desiredStartMs)))
  const others = placements.filter((candidate) => candidate.id !== placement.id)
  const edges = [
    0,
    maxStart,
    ...others.flatMap((candidate) => [
      candidate.startMs - placement.durationMs,
      candidate.startMs + candidate.durationMs,
    ]),
  ].map((value) => Math.max(0, Math.min(maxStart, value)))
  const legal = (startMs: number) => others.every((candidate) => (
    startMs + placement.durationMs <= candidate.startMs
    || startMs >= candidate.startMs + candidate.durationMs
  ))
  const legalEdges = [...new Set(edges.filter(legal))]
  const nearby = legalEdges
    .filter((candidate) => Math.abs(candidate - desired) <= Math.max(0, thresholdMs))
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)[0]
  if (nearby !== undefined) return nearby
  if (legal(desired)) return desired
  return legalEdges.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)[0] ?? desired
}

function commitValidEdit(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  mutate: (draft: ShowCompositionV1) => boolean,
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  if (!mutate(draft)) return composition
  if (validateShowComposition(show, draft).length > 0) return composition
  return normalizeShowComposition(show, draft)
}

function findZoneComposition(
  composition: ShowCompositionV1,
  sceneId: string,
  zoneId: string,
): ShowZoneComposition | undefined {
  return composition.scenes.find((scene) => scene.sceneId === sceneId)
    ?.zones.find((zone) => zone.zoneId === zoneId)
}

function findPlacement(
  composition: ShowCompositionV1,
  owner: ShowMainPlacementOwner,
): ShowMainPlacement | undefined {
  return findZoneComposition(composition, owner.sceneId, owner.zoneId)
    ?.main.find((placement) => placement.id === owner.placementId)
}

function findOverlayLayer(
  composition: ShowCompositionV1,
  owner: ShowOverlayLayerOwner,
): ShowOverlayLayer | undefined {
  return findZoneComposition(composition, owner.sceneId, owner.zoneId)
    ?.overlays.find((layer) => layer.id === owner.layerId)
}

function findOverlayPlacement(
  composition: ShowCompositionV1,
  owner: ShowOverlayPlacementOwner,
): ShowOverlayPlacement | undefined {
  return findOverlayLayer(composition, owner)
    ?.placements.find((placement) => placement.id === owner.placementId)
}

function clonePlacementTracks(
  composition: ShowCompositionV1,
  sceneId: string,
  sourcePlacementId: string,
  targetPlacementId: string,
): void {
  const scene = composition.scenes.find((candidate) => candidate.sceneId === sceneId)
  if (!scene?.propertyTracks) return
  const ids = allPropertyIds(composition)
  const clones = scene.propertyTracks.flatMap((track) => {
    if (!('placementId' in track.target) || track.target.placementId !== sourcePlacementId) return []
    const target = track.target
    const clone = cloneJson(track)
    clone.id = uniqueDerivedId(ids, `${track.id}-${targetPlacementId}`)
    clone.target = { ...target, placementId: targetPlacementId }
    clone.keyframes = clone.keyframes.map((keyframe) => ({
      ...keyframe,
      id: uniqueDerivedId(ids, `${keyframe.id}-${targetPlacementId}`),
    }))
    return [clone]
  })
  scene.propertyTracks.push(...clones)
}

function cloneInstanceTracks(
  composition: ShowCompositionV1,
  sceneId: string,
  sourceInstanceId: string,
  targetInstanceId: string,
): void {
  const scene = composition.scenes.find((candidate) => candidate.sceneId === sceneId)
  if (!scene?.propertyTracks) return
  const ids = allPropertyIds(composition)
  const clones = scene.propertyTracks.flatMap((track) => {
    if (!('instanceId' in track.target) || track.target.instanceId !== sourceInstanceId) return []
    const target = track.target
    const clone = cloneJson(track)
    clone.id = uniqueDerivedId(ids, `${track.id}-${targetInstanceId}`)
    clone.target = { ...target, instanceId: targetInstanceId }
    clone.keyframes = clone.keyframes.map((keyframe) => ({
      ...keyframe,
      id: uniqueDerivedId(ids, `${keyframe.id}-${targetInstanceId}`),
    }))
    return [clone]
  })
  scene.propertyTracks.push(...clones)
}

function removePlacementTracks(
  composition: ShowCompositionV1,
  sceneId: string,
  placementIds: Set<string>,
): void {
  const scene = composition.scenes.find((candidate) => candidate.sceneId === sceneId)
  if (!scene?.propertyTracks) return
  scene.propertyTracks = scene.propertyTracks.filter((track) => (
    !('placementId' in track.target) || !placementIds.has(track.target.placementId)
  ))
  if (scene.propertyTracks.length === 0) delete scene.propertyTracks
}

function removePlacementTransitions(
  composition: ShowCompositionV1,
  placementIds: Set<string>,
): void {
  if (!composition.transitions) return
  composition.transitions = composition.transitions.filter((transition) => (
    !placementIds.has(transition.fromPlacementId)
    && !placementIds.has(transition.toPlacementId)
  ))
}

function allPropertyIds(composition: ShowCompositionV1): Set<string> {
  return new Set(composition.scenes.flatMap((scene) => (scene.propertyTracks ?? []).flatMap((track) => [
    track.id,
    ...track.keyframes.map((keyframe) => keyframe.id),
  ])))
}

function uniqueDerivedId(ids: Set<string>, base: string): string {
  if (!ids.has(base)) {
    ids.add(base)
    return base
  }
  let suffix = 2
  while (ids.has(`${base}-${suffix}`)) suffix += 1
  const id = `${base}-${suffix}`
  ids.add(id)
  return id
}

function validateFiniteInteger(
  issues: ShowCompositionValidationIssue[],
  path: string,
  value: number,
): void {
  if (!Number.isFinite(value)) addIssue(issues, path, 'not-finite', 'Time must be finite.')
  else if (!Number.isInteger(value)) addIssue(issues, path, 'not-integer', 'Time must use whole milliseconds.')
}

function addIssue(
  issues: ShowCompositionValidationIssue[],
  path: string,
  code: ShowCompositionValidationCode,
  message: string,
): void {
  issues.push({ path, code, message })
}

function ownerOrder(order: Map<string, number>, id: string): number {
  return order.get(id) ?? Number.MAX_SAFE_INTEGER
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

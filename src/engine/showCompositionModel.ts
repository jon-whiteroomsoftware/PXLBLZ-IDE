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
  ShowOverlayPlacement,
  ShowPatternInstance,
  ShowRecord,
  ShowSceneComposition,
  ShowZoneComposition,
} from './personalContentRecords'
import { compactShowClipTransform } from './showClipTransform'
import { compactShowClipViewport } from './showClipViewport'
import {
  materializeShowGroupOccurrences,
  validateShowGroups,
  type ShowGroupValidationCode,
} from './showGroupModel'

type ShowCompositionValidationCode =
  | 'duplicate-id'
  | 'missing-scene'
  | 'missing-zone'
  | 'missing-definition'
  | 'missing-instance'
  | 'missing-placement'
  | 'not-finite'
  | 'not-integer'
  | 'out-of-bounds'
  | 'overlap'
  | 'cross-layer'
  | 'invalid-logical-clip'
  | 'invalid-transition'
  | ShowGroupValidationCode
  | ShowPropertyAnimationValidationCode

interface ShowCompositionValidationIssue {
  path: string
  code: ShowCompositionValidationCode
  message: string
}

/**
 * Convert the flat compatibility record into the first durable ownership
 * shape. The version-0 projection supplies the exact inferred runtime-instance
 * identities, so Continue and Restart preserve current compiler semantics.
 */
export function projectFlatShowToCompositionV1WithCellOrigins(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): {
  composition: ShowCompositionV1
  sourceCellIdByPlacementId: Record<string, string>
} {
  const projection = projectFlatShowComposition(show, lookup)
  const sourceCellIdByPlacementId: Record<string, string> = {}
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
        sourceCellIdByPlacementId[id] = placement.sourceCellId
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
  return {
    composition: normalizeShowComposition(show, { version: 1, patternInstances, scenes }),
    sourceCellIdByPlacementId,
  }
}

export function projectFlatShowToCompositionV1(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): ShowCompositionV1 {
  return projectFlatShowToCompositionV1WithCellOrigins(show, lookup).composition
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
    ...(composition.executionModel === 'deterministic-loop'
      ? { executionModel: 'deterministic-loop' as const }
      : {}),
    ...(composition.durationMs !== undefined
      ? { durationMs: composition.durationMs }
      : {}),
    ...(composition.markers && composition.markers.length > 0
      ? {
          markers: cloneJson(composition.markers)
            .sort((a, b) => a.timeMs - b.timeMs || String(a.id).localeCompare(String(b.id))),
        }
      : {}),
    patternInstances: cloneJson(composition.patternInstances)
      .sort((a, b) => a.id.localeCompare(b.id)),
    ...(composition.transitions
      ? { transitions: cloneJson(composition.transitions).sort((a, b) => a.id.localeCompare(b.id)) }
      : {}),
    ...(composition.groupDefinitions?.length
      ? {
          groupDefinitions: cloneJson(composition.groupDefinitions)
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((definition) => ({
              ...definition,
              patternInstances: definition.patternInstances
                .sort((left, right) => left.id.localeCompare(right.id)),
              placements: definition.placements
                .map(normalizePlacementAppearance)
                .sort((left, right) => (
                  left.layerOffset - right.layerOffset
                  || left.startMs - right.startMs
                  || left.id.localeCompare(right.id)
                )),
              ...(definition.transitions
                ? { transitions: definition.transitions.sort((left, right) => left.id.localeCompare(right.id)) }
                : {}),
              ...(definition.propertyTracks
                ? { propertyTracks: normalizeShowPropertyTracks(definition.propertyTracks) }
                : {}),
            })),
        }
      : {}),
    ...(composition.groupOccurrences?.length
      ? {
          groupOccurrences: cloneJson(composition.groupOccurrences)
            .sort((left, right) => left.id.localeCompare(right.id)),
        }
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

export function validateShowCompositionTimelineMetadata(
  composition: ShowCompositionV1,
): ShowCompositionValidationIssue[] {
  const issues: ShowCompositionValidationIssue[] = []
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
  return issues
}

export function validateShowComposition(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
): ShowCompositionValidationIssue[] {
  return validateComposition(show, composition)
}

function validateComposition(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  pair?: readonly [string, string],
): ShowCompositionValidationIssue[] {
  const conflicts = (ordered: Array<ShowMainPlacement | ShowOverlayPlacement>, index: number) => {
    const placement = ordered[index]
    // Ordinary validation keeps its existing adjacent-neighbor diagnostics.
    // Private overlap makes that insufficient: a long participant can enclose
    // both its partner and a third Clip, so inspect every earlier interval.
    const earlier = pair ? ordered.slice(0, index) : ordered.slice(Math.max(0, index - 1), index)
    return earlier.some(previous => previous.startMs + previous.durationMs > placement.startMs
      && !(pair && pair.includes(previous.id) && pair.includes(placement.id) && previous.id !== placement.id))
  }
  const issues = validateShowCompositionTimelineMetadata(composition)
  const sceneById = new Map(show.scenes.map((scene) => [scene.id, scene]))
  const zoneIds = new Set(show.zones.map((zone) => zone.id))
  const instanceIds = new Set<string>()
  const placementIds = new Set<string>()
  const placementOwnerById = new Map<string, {
    layerKey: string
    sceneId: string
    zoneId: string
    startMs: number
    endMs: number
  }>()
  const layerIds = new Set<string>()

  issues.push(...validateShowGroups(show, composition))

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
          zoneId: zone.zoneId,
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
        if (placement.opacity !== undefined && (!Number.isFinite(placement.opacity) || placement.opacity < 0 || placement.opacity > 1)) {
          addIssue(issues, `${path}.opacity`, 'out-of-bounds', 'Main opacity must be between 0 and 1.')
        }
        if (conflicts(ordered, orderedIndex)) {
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
            zoneId: zone.zoneId,
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
          if (conflicts(orderedPlacements, orderedIndex)) {
            addIssue(issues, `${path}.startMs`, 'overlap', 'Overlay placements in one layer cannot overlap.')
          }
        })
      })
    })
  })
  issues.push(...validateLogicalClipSegments(show, composition))
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
      const sceneUnrelatedOwners = [...placementOwnerById.entries()].flatMap(([placementId, owner]) => {
        return (
          placementId === transition.fromPlacementId
          || placementId === transition.toPlacementId
          || owner.sceneId !== fromOwner.sceneId
        ) ? [] : [owner]
      })
      const unrelatedOwners = sceneUnrelatedOwners.filter((owner) => owner.zoneId === fromOwner.zoneId)
      const unrelatedBoundaryInside = unrelatedOwners.some((owner) => {
        const touchesTransitionInterval = owner.endMs >= fromOwner.endMs && owner.startMs <= toOwner.startMs
        const spansCompleteInterval = owner.startMs < fromOwner.endMs && owner.endMs > toOwner.startMs
        return touchesTransitionInterval && !spansCompleteInterval
      })
      if (unrelatedBoundaryInside) {
        addIssue(issues, path, 'invalid-transition', 'An unrelated Clip cannot start or stop at or inside a Layer transition.')
      }
      const otherZoneBoundaryAfterStart = sceneUnrelatedOwners.some((owner) => (
        owner.zoneId !== fromOwner.zoneId
        && (
          (owner.startMs > fromOwner.endMs && owner.startMs <= toOwner.startMs)
          || (owner.endMs > fromOwner.endMs && owner.endMs <= toOwner.startMs)
        )
      ))
      if (otherZoneBoundaryAfterStart) {
        addIssue(issues, path, 'invalid-transition', 'A Clip in another Zone cannot start or stop after a Layer Transition has begun.')
      }
      const unrelatedSpansCompleteInterval = sceneUnrelatedOwners.some((owner) => (
        owner.startMs < fromOwner.endMs && owner.endMs > toOwner.startMs
      ))
      if (unrelatedSpansCompleteInterval && (transition.kind === 'fade-color' || transition.kind === 'motion')) {
        addIssue(issues, path, 'invalid-transition', 'Fade and Motion Layer transitions cannot pass over an unrelated Clip.')
      }
    }
  }
  issues.push(...validateShowPropertyTracks(show, composition))
  if ((composition.groupDefinitions?.length ?? 0) > 0 || (composition.groupOccurrences?.length ?? 0) > 0) {
    const materialized = materializeShowGroupOccurrences(composition)
    issues.push(...validateComposition(show, materialized, pair))
  }
  return issues
}

interface LogicalPlacementSegment {
  path: string
  sceneId: string
  sceneIndex: number
  zoneId: string
  layerKey: string
  placement: ShowMainPlacement | ShowOverlayPlacement
}

function directPlacementSegments(composition: ShowCompositionV1): LogicalPlacementSegment[] {
  return composition.scenes.flatMap((scene, sceneIndex) => scene.zones.flatMap((zone, zoneIndex) => [
    ...zone.main.map((placement, placementIndex) => ({
      path: `scenes[${sceneIndex}].zones[${zoneIndex}].main[${placementIndex}]`,
      sceneId: scene.sceneId,
      sceneIndex,
      zoneId: zone.zoneId,
      layerKey: 'main',
      placement,
    })),
    ...zone.overlays.flatMap((layer, layerIndex) => layer.placements.map((placement, placementIndex) => ({
      path: `scenes[${sceneIndex}].zones[${zoneIndex}].overlays[${layerIndex}].placements[${placementIndex}]`,
      sceneId: scene.sceneId,
      sceneIndex,
      zoneId: zone.zoneId,
      layerKey: `overlay:${layerIndex}`,
      placement,
    }))),
  ]))
}

function resolveLogicalPlacementSegments(
  composition: ShowCompositionV1,
  placementId: string,
): LogicalPlacementSegment[] | null {
  const placements = directPlacementSegments(composition)
  const selected = placements.find((segment) => segment.placement.id === placementId)
  if (!selected) return null
  const logicalClipId = selected.placement.logicalClipId ?? selected.placement.id
  const segments = placements
    .filter((segment) => (segment.placement.logicalClipId ?? segment.placement.id) === logicalClipId)
    .sort((left, right) => left.sceneIndex - right.sceneIndex
      || left.placement.startMs - right.placement.startMs
      || left.placement.id.localeCompare(right.placement.id))
  if (segments.length === 1 && !segments[0].placement.logicalClipId) return segments
  const root = segments[0]
  if (
    root.placement.id !== logicalClipId
    || root.placement.logicalClipId !== undefined
    || segments.some((segment, index) => (
      segment.placement.instanceId !== root.placement.instanceId
      || placementPresentationSignature(segment.placement) !== placementPresentationSignature(root.placement)
      || segment.zoneId !== root.zoneId
      || segment.layerKey !== root.layerKey
      || (index > 0 && (
        segment.sceneIndex === segments[index - 1].sceneIndex
          ? segment.placement.id !== `${logicalClipId}--appearance-${index}`
            || segment.placement.startMs !== segments[index - 1].placement.startMs + segments[index - 1].placement.durationMs
          : segment.sceneIndex !== segments[index - 1].sceneIndex + 1
            || segment.placement.id !== `${logicalClipId}--span-${segment.sceneId}`
            || segment.placement.startMs !== 0
      ))
    ))
  ) return null
  return segments
}

export function placementPresentationSignature(
  placement: ShowMainPlacement | ShowOverlayPlacement,
): string {
  const {
    id: _id,
    logicalClipId: _logicalClipId,
    startMs: _startMs,
    durationMs: _durationMs,
    opacity: _opacity,
    transform: _transform,
    viewport: _viewport,
    ...presentation
  } = normalizePlacementAppearance(placement)
  return canonicalJson(presentation)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function validateLogicalClipSegments(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
): ShowCompositionValidationIssue[] {
  const issues: ShowCompositionValidationIssue[] = []
  const descriptors = directPlacementSegments(composition)
  const logicalClipIds = new Set(descriptors.flatMap((segment) => (
    segment.placement.logicalClipId ? [segment.placement.logicalClipId] : []
  )))
  const sceneById = new Map(show.scenes.map((scene, index) => [scene.id, { scene, index }]))
  for (const logicalClipId of logicalClipIds) {
    const referenced = descriptors.find((segment) => segment.placement.logicalClipId === logicalClipId)
    const segments = resolveLogicalPlacementSegments(composition, referenced?.placement.id ?? logicalClipId)
    const hasValidSceneSlices = segments?.every((segment, index) => {
      const owner = sceneById.get(segment.sceneId)
      const previous = index > 0 ? sceneById.get(segments[index - 1].sceneId) : null
      const next = index < segments.length - 1 ? sceneById.get(segments[index + 1].sceneId) : null
      return Boolean(
        owner
        && (!previous || owner.index === previous.index || owner.index === previous.index + 1)
        && (!next || owner.index === next.index
          || segment.placement.startMs + segment.placement.durationMs === owner.scene.durationMs),
      )
    })
    if (!segments || !hasValidSceneSlices) {
      addIssue(
        issues,
        `${referenced?.path ?? 'scenes'}.logicalClipId`,
        'invalid-logical-clip',
        `Logical Clip "${logicalClipId}" must have one real root and contiguous segments on the same Zone, Layer, and Pattern instance.`,
      )
    }
  }
  return issues
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

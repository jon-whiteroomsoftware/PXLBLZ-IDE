import { projectFlatShowComposition } from './showCompositionProjection'
import type { ShowCompileRecipeSourceLookup } from './showModel'
import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowPatternInstance,
  ShowRecord,
  ShowSceneComposition,
  ShowZoneComposition,
} from './personalContentRecords'

export type ShowCompositionValidationCode =
  | 'duplicate-id'
  | 'missing-scene'
  | 'missing-zone'
  | 'missing-instance'
  | 'not-finite'
  | 'not-integer'
  | 'out-of-bounds'
  | 'overlap'

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
          ...(placement.appearance.effects
            ? { effects: cloneJson(placement.appearance.effects) }
            : {}),
        }]
      }),
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
    patternInstances: cloneJson(composition.patternInstances)
      .sort((a, b) => a.id.localeCompare(b.id)),
    scenes: cloneJson(composition.scenes)
      .sort((a, b) => ownerOrder(sceneOrder, a.sceneId) - ownerOrder(sceneOrder, b.sceneId) || a.sceneId.localeCompare(b.sceneId))
      .map((scene) => ({
        ...scene,
        zones: scene.zones
          .sort((a, b) => ownerOrder(zoneOrder, a.zoneId) - ownerOrder(zoneOrder, b.zoneId) || a.zoneId.localeCompare(b.zoneId))
          .map((zone) => ({
            ...zone,
            main: zone.main.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
          })),
      })),
  }
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
    })
  })
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

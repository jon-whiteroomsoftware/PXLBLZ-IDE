import {
  trimShowMainPlacement,
  trimShowOverlayPlacement,
} from './showCompositionModel'
import { normalizeShowClipEffects } from './showEffects'
import {
  updateShowCellAdaptations,
  updateShowCellEffects,
  updateShowCellPattern,
} from './showModel'
import type {
  ShowCell,
  ShowClipEffect,
  ShowClipEvaluationPolicy,
  ShowCompositionV1,
  ShowLightShutter,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPatternInstance,
  ShowPatternRef,
  ShowPlacementView,
  ShowRecord,
  ShowSteppedClock,
} from './personalContentRecords'

export type ShowClipInspectorScope = 'global' | 'scene-main' | 'scene-overlay'

export type ShowClipInspectorOwner =
  | { kind: 'global'; cellId: string }
  | { kind: 'scene-main'; sceneId: string; zoneId: string; placementId: string }
  | { kind: 'scene-overlay'; sceneId: string; zoneId: string; layerId: string; placementId: string }

export interface ShowClipInspectorCapabilities {
  pattern: true
  simulation: true
  view: true
  effects: true
  patternControls: true
  structural: boolean
  localTiming: boolean
  layerAssignment: boolean
  sourceOverOpacity: boolean
  localActions: boolean
  propertyAnimation: 'boundary-ramp' | 'local-keyframes'
}

export interface ShowClipInspectorSimulation {
  timeScale: number
  timeOffsetMs: number
  lightShutter?: ShowLightShutter
  steppedClock?: ShowSteppedClock
  controlTargets?: Record<string, number>
}

export interface ShowClipInspectorValue {
  scope: ShowClipInspectorScope
  owner: ShowClipInspectorOwner
  pattern: ShowPatternRef
  patternName: string
  evaluationPolicy: ShowClipEvaluationPolicy
  simulation: ShowClipInspectorSimulation
  view: ShowPlacementView
  effects: ShowClipEffect[]
  placementId?: string
  instanceId?: string
  layerId?: string
  local?: {
    startMs: number
    durationMs: number
    opacity?: number
  }
}

export interface ShowClipInspectorPatch {
  pattern?: { ref: ShowPatternRef; name: string }
  evaluationPolicy?: ShowClipEvaluationPolicy
  simulation?: Partial<ShowClipInspectorSimulation>
  view?: Partial<ShowPlacementView>
  effects?: ShowClipEffect[]
  local?: Partial<NonNullable<ShowClipInspectorValue['local']>>
}

const COMMON_CAPABILITIES = {
  pattern: true,
  simulation: true,
  view: true,
  effects: true,
  patternControls: true,
} as const

export function showClipInspectorCapabilities(scope: ShowClipInspectorScope): ShowClipInspectorCapabilities {
  if (scope === 'global') {
    return {
      ...COMMON_CAPABILITIES,
      structural: true,
      localTiming: false,
      layerAssignment: false,
      sourceOverOpacity: false,
      localActions: false,
      propertyAnimation: 'boundary-ramp',
    }
  }
  return {
    ...COMMON_CAPABILITIES,
    structural: false,
    localTiming: true,
    layerAssignment: scope === 'scene-overlay',
    sourceOverOpacity: scope === 'scene-overlay',
    localActions: true,
    propertyAnimation: 'local-keyframes',
  }
}

export function projectShowClipInspector(
  show: ShowRecord,
  owner: ShowClipInspectorOwner,
): ShowClipInspectorValue | null {
  if (owner.kind === 'global') {
    const cell = show.cells.find((candidate) => candidate.id === owner.cellId)
    return cell ? projectGlobalClip(cell, owner) : null
  }
  const resolved = resolveCompositionOwner(show.composition, owner)
  if (!resolved) return null
  const { placement, instance } = resolved
  return {
    scope: owner.kind,
    owner,
    pattern: { ...instance.pattern },
    patternName: instance.patternName,
    evaluationPolicy: normalizeEvaluationPolicy(instance.evaluationPolicy),
    simulation: {
      ...cloneSimulation(instance),
      ...(instance.controlTargets ? { controlTargets: { ...instance.controlTargets } } : {}),
    },
    view: { ...placement.view },
    effects: normalizeShowClipEffects(placement.effects),
    placementId: placement.id,
    instanceId: instance.id,
    ...(owner.kind === 'scene-overlay' ? { layerId: owner.layerId } : {}),
    local: {
      startMs: placement.startMs,
      durationMs: placement.durationMs,
      ...(owner.kind === 'scene-overlay' ? { opacity: (placement as ShowOverlayPlacement).opacity } : {}),
    },
  }
}

export function updateShowClipInspector(
  show: ShowRecord,
  owner: ShowClipInspectorOwner,
  patch: ShowClipInspectorPatch,
): ShowRecord {
  if (owner.kind === 'global') return updateGlobalClip(show, owner.cellId, patch)
  const resolved = resolveCompositionOwner(show.composition, owner)
  if (!show.composition || !resolved) return show
  let composition = show.composition
  const originalPatternKey = patternKey(resolved.instance.pattern)
  if (patch.pattern || patch.simulation || patch.evaluationPolicy) {
    composition = mapPatternInstance(composition, resolved.instance.id, (instance) => ({
      ...instance,
      ...(patch.pattern
        ? { pattern: { ...patch.pattern.ref }, patternName: patch.pattern.name }
        : {}),
      ...(patch.evaluationPolicy
        ? { evaluationPolicy: normalizeEvaluationPolicy(patch.evaluationPolicy) }
        : {}),
      time: normalizeSimulationTime({ ...instance.time, ...patch.simulation }),
      ...resolveControlTargets(
        patch.simulation,
        patch.pattern && patternKey(patch.pattern.ref) !== originalPatternKey
          ? undefined
          : instance.controlTargets,
      ),
    }))
  }
  if (patch.view || patch.effects) {
    composition = mapPlacement(composition, owner, (placement) => ({
      ...placement,
      ...(patch.view ? { view: normalizeView({ ...placement.view, ...patch.view }) } : {}),
      ...(patch.effects ? { effects: normalizeShowClipEffects(patch.effects) } : {}),
    }))
  }
  if (patch.local) {
    const current = resolveCompositionOwner(composition, owner)?.placement
    if (!current) return show
    if (owner.kind === 'scene-main') {
      composition = trimShowMainPlacement(show, composition, {
        ...owner,
        startMs: patch.local.startMs ?? current.startMs,
        durationMs: patch.local.durationMs ?? current.durationMs,
      })
    } else {
      composition = trimShowOverlayPlacement(show, composition, {
        ...owner,
        startMs: patch.local.startMs ?? current.startMs,
        durationMs: patch.local.durationMs ?? current.durationMs,
        opacity: clamp01(patch.local.opacity ?? (current as ShowOverlayPlacement).opacity),
      })
    }
  }
  if (composition === show.composition) return show
  return { ...show, composition, updatedAt: Math.max(Date.now(), show.updatedAt + 1) }
}

function projectGlobalClip(cell: ShowCell, owner: Extract<ShowClipInspectorOwner, { kind: 'global' }>): ShowClipInspectorValue {
  return {
    scope: 'global',
    owner,
    pattern: { ...cell.pattern },
    patternName: cell.patternName,
    evaluationPolicy: normalizeEvaluationPolicy(cell.evaluationPolicy),
    simulation: {
      timeScale: cell.adaptations.timeScale,
      timeOffsetMs: cell.adaptations.timeOffsetMs ?? 0,
      ...(cell.adaptations.lightShutter ? { lightShutter: { ...cell.adaptations.lightShutter } } : {}),
      ...(cell.adaptations.steppedClock ? { steppedClock: { ...cell.adaptations.steppedClock } } : {}),
      ...(cell.controlTargets ? { controlTargets: { ...cell.controlTargets } } : {}),
    },
    view: {
      mirror: cell.adaptations.mirror,
      phase: cell.adaptations.phase,
      brightness: cell.adaptations.brightness,
    },
    effects: normalizeShowClipEffects(cell.effects),
  }
}

function updateGlobalClip(show: ShowRecord, cellId: string, patch: ShowClipInspectorPatch): ShowRecord {
  if (!show.cells.some((cell) => cell.id === cellId)) return show
  let next = show
  if (patch.pattern) next = updateShowCellPattern(next, cellId, { pattern: patch.pattern.ref, patternName: patch.pattern.name })
  if (patch.evaluationPolicy) {
    next = {
      ...next,
      cells: next.cells.map((cell) => cell.id === cellId
        ? { ...cell, evaluationPolicy: normalizeEvaluationPolicy(patch.evaluationPolicy) }
        : cell),
      updatedAt: Math.max(Date.now(), next.updatedAt + 1),
    }
  }
  if (patch.simulation || patch.view) {
    const changes = {
      ...(patch.simulation?.timeScale !== undefined ? { timeScale: patch.simulation.timeScale } : {}),
      ...(patch.simulation?.timeOffsetMs !== undefined ? { timeOffsetMs: patch.simulation.timeOffsetMs } : {}),
      ...(patch.simulation?.lightShutter !== undefined ? { lightShutter: patch.simulation.lightShutter } : {}),
      ...(patch.simulation?.steppedClock !== undefined ? { steppedClock: patch.simulation.steppedClock } : {}),
      ...patch.view,
    }
    next = updateShowCellAdaptations(next, cellId, changes)
  }
  if (patch.simulation && Object.prototype.hasOwnProperty.call(patch.simulation, 'controlTargets')) {
    const controlTargets = patch.simulation.controlTargets
      ? Object.fromEntries(Object.entries(patch.simulation.controlTargets).map(([key, value]) => [key, clamp01(value)]))
      : undefined
    next = {
      ...next,
      cells: next.cells.map((cell) => cell.id === cellId ? { ...cell, controlTargets } : cell),
      updatedAt: Math.max(Date.now(), next.updatedAt + 1),
    }
  }
  if (patch.effects) next = updateShowCellEffects(next, cellId, patch.effects)
  return next
}

function resolveCompositionOwner(
  composition: ShowCompositionV1 | null | undefined,
  owner: Exclude<ShowClipInspectorOwner, { kind: 'global' }>,
): { placement: ShowMainPlacement | ShowOverlayPlacement; instance: ShowPatternInstance } | null {
  const zone = composition?.scenes.find((scene) => scene.sceneId === owner.sceneId)?.zones
    .find((candidate) => candidate.zoneId === owner.zoneId)
  const placement = owner.kind === 'scene-main'
    ? zone?.main.find((candidate) => candidate.id === owner.placementId)
    : zone?.overlays.find((layer) => layer.id === owner.layerId)?.placements
      .find((candidate) => candidate.id === owner.placementId)
  const instance = placement
    ? composition?.patternInstances.find((candidate) => candidate.id === placement.instanceId)
    : undefined
  return placement && instance ? { placement, instance } : null
}

function mapPatternInstance(
  composition: ShowCompositionV1,
  instanceId: string,
  update: (instance: ShowPatternInstance) => ShowPatternInstance,
): ShowCompositionV1 {
  return {
    ...composition,
    patternInstances: composition.patternInstances.map((instance) => (
      instance.id === instanceId ? update(instance) : instance
    )),
  }
}

function mapPlacement(
  composition: ShowCompositionV1,
  owner: Exclude<ShowClipInspectorOwner, { kind: 'global' }>,
  update: <T extends ShowMainPlacement | ShowOverlayPlacement>(placement: T) => T,
): ShowCompositionV1 {
  return {
    ...composition,
    scenes: composition.scenes.map((scene) => scene.sceneId !== owner.sceneId ? scene : {
      ...scene,
      zones: scene.zones.map((zone) => zone.zoneId !== owner.zoneId ? zone : owner.kind === 'scene-main'
        ? { ...zone, main: zone.main.map((placement) => placement.id === owner.placementId ? update(placement) : placement) }
        : {
            ...zone,
            overlays: zone.overlays.map((layer) => layer.id !== owner.layerId ? layer : {
              ...layer,
              placements: layer.placements.map((placement) => placement.id === owner.placementId ? update(placement) : placement),
            }),
          }),
    }),
  }
}

function cloneSimulation(instance: ShowPatternInstance): ShowClipInspectorSimulation {
  return {
    timeScale: instance.time.timeScale,
    timeOffsetMs: instance.time.timeOffsetMs,
    ...(instance.time.lightShutter ? { lightShutter: { ...instance.time.lightShutter } } : {}),
    ...(instance.time.steppedClock ? { steppedClock: { ...instance.time.steppedClock } } : {}),
  }
}

function normalizeSimulationTime(time: ShowPatternInstance['time']): ShowPatternInstance['time'] {
  return {
    timeScale: clamp(time.timeScale, 0, 4),
    timeOffsetMs: Math.round(clamp(time.timeOffsetMs, 0, 60_000)),
    ...(time.lightShutter ? {
      lightShutter: {
        rateHz: clamp(time.lightShutter.rateHz, 0.01, 60),
        duty: clamp01(time.lightShutter.duty),
        phase: clamp01(time.lightShutter.phase),
        clockBehavior: time.lightShutter.clockBehavior === 'freeze' ? 'freeze' : 'continue',
      },
    } : {}),
    ...(time.steppedClock ? { steppedClock: { stepMs: Math.max(1, Math.round(time.steppedClock.stepMs)) } } : {}),
  }
}

function normalizeView(view: ShowPlacementView): ShowPlacementView {
  return {
    mirror: Boolean(view.mirror),
    phase: clamp01(view.phase),
    brightness: clamp01(view.brightness),
  }
}

function resolveControlTargets(
  simulation: Partial<ShowClipInspectorSimulation> | undefined,
  current: Record<string, number> | undefined,
): Pick<ShowPatternInstance, 'controlTargets'> {
  if (!simulation || !Object.prototype.hasOwnProperty.call(simulation, 'controlTargets')) {
    return current ? { controlTargets: { ...current } } : { controlTargets: undefined }
  }
  const next = simulation.controlTargets
    ? Object.fromEntries(Object.entries(simulation.controlTargets).map(([key, value]) => [key, clamp01(value)]))
    : {}
  return Object.keys(next).length > 0 ? { controlTargets: next } : { controlTargets: undefined }
}

function patternKey(pattern: ShowPatternRef): string {
  return `${pattern.kind}:${pattern.id}`
}

export function normalizeShowClipEvaluationPolicy(
  policy: ShowClipEvaluationPolicy | undefined,
): ShowClipEvaluationPolicy {
  return policy === 'freeze-at-entry' || policy === 'rolling-refresh' ? policy : 'live'
}

const normalizeEvaluationPolicy = normalizeShowClipEvaluationPolicy

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

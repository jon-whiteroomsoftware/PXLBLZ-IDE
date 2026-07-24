import {
  validateShowComposition,
} from './showCompositionModel'
import { normalizeShowClipEffects } from './showEffects'
import {
  compactShowClipTransform,
  normalizeShowClipTransform,
} from './showClipTransform'
import {
  compactShowClipViewport,
  normalizeShowClipViewport,
} from './showClipViewport'
import {
  projectShowTimeline,
  updateShowCellAdaptations,
  updateShowCellEffects,
  updateShowCellPattern,
} from './showModel'
import { resizeShowClipAtGlobalTime } from './showTimelineClipAuthoring'
import type {
  ShowCell,
  ShowClipBlink,
  ShowClipPresentation,
  ShowClipTransform,
  ShowClipViewport,
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
  presentation: ShowClipPresentation
  blink?: ShowClipBlink
  simulation: ShowClipInspectorSimulation
  view: ShowPlacementView
  transform: ShowClipTransform
  viewport: ShowClipViewport
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
  presentation?: ShowClipPresentation
  blink?: ShowClipBlink | null
  simulation?: Partial<ShowClipInspectorSimulation>
  view?: Partial<ShowPlacementView>
  transform?: Partial<ShowClipTransform>
  viewport?: Partial<ShowClipViewport>
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
  const logicalRange = show.composition
    ? logicalPlacementRange(show, show.composition, placement)
    : null
  return {
    scope: owner.kind,
    owner,
    pattern: { ...instance.pattern },
    patternName: instance.patternName,
    evaluationPolicy: normalizeEvaluationPolicy(instance.evaluationPolicy),
    presentation: normalizePresentation(placement.presentation),
    ...(placement.blink ? { blink: normalizeBlink(placement.blink) } : {}),
    simulation: {
      ...cloneSimulation(instance),
      ...(instance.controlTargets ? { controlTargets: { ...instance.controlTargets } } : {}),
    },
    view: { ...placement.view },
    transform: normalizeShowClipTransform(placement.transform),
    viewport: normalizeShowClipViewport(placement.viewport),
    effects: normalizeShowClipEffects(placement.effects),
    placementId: placement.id,
    instanceId: instance.id,
    ...(owner.kind === 'scene-overlay' ? { layerId: owner.layerId } : {}),
    local: {
      startMs: logicalRange?.localStartMs ?? placement.startMs,
      durationMs: logicalRange?.durationMs ?? placement.durationMs,
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
  if (validateShowComposition(show, show.composition).some((issue) => issue.code === 'invalid-logical-clip')) {
    return show
  }
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
  if (patch.view || patch.transform || patch.viewport || patch.effects || patch.presentation || patch.blink !== undefined) {
    composition = mapPlacement(composition, owner, (placement) => ({
      ...placement,
      ...(patch.view ? { view: normalizeView({ ...placement.view, ...patch.view }) } : {}),
      ...(patch.transform ? { transform: compactShowClipTransform({ ...placement.transform, ...patch.transform }) } : {}),
      ...(patch.viewport ? { viewport: compactShowClipViewport({ ...placement.viewport, ...patch.viewport }) } : {}),
      ...(patch.effects ? { effects: normalizeShowClipEffects(patch.effects) } : {}),
      ...(patch.presentation ? compactPresentation(patch.presentation) : {}),
      ...(patch.blink === null ? { blink: undefined } : patch.blink ? { blink: normalizeBlink(patch.blink) } : {}),
    }))
  }
  if (patch.local) {
    const current = resolveCompositionOwner(composition, owner)?.placement
    if (!current) return show
    if (owner.kind === 'scene-overlay' && patch.local.opacity !== undefined) {
      composition = mapPlacement(composition, owner, (placement) => ({
        ...placement,
        opacity: clamp01(patch.local!.opacity!),
      }))
    }
    if (patch.local.startMs !== undefined || patch.local.durationMs !== undefined) {
      const range = logicalPlacementRange(show, composition, current)
      if (!range) return show
      composition = resizeShowClipAtGlobalTime(show, composition, {
        owner: owner.kind === 'scene-main'
          ? { ...owner, kind: 'main' }
          : { ...owner, kind: 'overlay' },
        globalStartMs: range.sceneStartMs + (patch.local.startMs ?? range.localStartMs),
        durationMs: patch.local.durationMs ?? range.durationMs,
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
    presentation: normalizePresentation(cell.presentation),
    ...(cell.blink ? { blink: normalizeBlink(cell.blink) } : {}),
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
    transform: normalizeShowClipTransform(cell.transform),
    viewport: normalizeShowClipViewport(cell.viewport),
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
  if (patch.presentation || patch.blink !== undefined) {
    next = {
      ...next,
      cells: next.cells.map((cell) => cell.id === cellId
        ? {
            ...cell,
            ...(patch.presentation ? compactPresentation(patch.presentation) : {}),
            ...(patch.blink === null ? { blink: undefined } : patch.blink ? { blink: normalizeBlink(patch.blink) } : {}),
          }
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
  if (patch.transform) {
    next = {
      ...next,
      cells: next.cells.map((cell) => cell.id === cellId
        ? { ...cell, transform: compactShowClipTransform({ ...cell.transform, ...patch.transform }) }
        : cell),
      updatedAt: Math.max(Date.now(), next.updatedAt + 1),
    }
  }
  if (patch.viewport) {
    next = {
      ...next,
      cells: next.cells.map((cell) => cell.id === cellId
        ? { ...cell, viewport: compactShowClipViewport({ ...cell.viewport, ...patch.viewport }) }
        : cell),
      updatedAt: Math.max(Date.now(), next.updatedAt + 1),
    }
  }
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

function logicalPlacementRange(
  show: ShowRecord,
  composition: ShowCompositionV1,
  placement: ShowMainPlacement | ShowOverlayPlacement,
): { sceneStartMs: number; localStartMs: number; durationMs: number } | null {
  const logicalClipId = placement.logicalClipId ?? placement.id
  const sceneStartById = new Map(projectShowTimeline(show).scenes.map((scene) => [scene.sceneId, scene.startMs]))
  const segments = composition.scenes.flatMap((scene) => {
    const sceneStartMs = sceneStartById.get(scene.sceneId)
    if (sceneStartMs === undefined) return []
    return scene.zones.flatMap((zone) => [
      ...zone.main,
      ...zone.overlays.flatMap((layer) => layer.placements),
    ]).filter((candidate) => (
      (candidate.logicalClipId ?? candidate.id) === logicalClipId
    )).map((candidate) => ({
      placement: candidate,
      sceneStartMs,
      globalStartMs: sceneStartMs + candidate.startMs,
      globalEndMs: sceneStartMs + candidate.startMs + candidate.durationMs,
    }))
  }).sort((left, right) => left.globalStartMs - right.globalStartMs)
  const first = segments[0]
  if (!first) return null
  const endMs = Math.max(...segments.map((segment) => segment.globalEndMs))
  return {
    sceneStartMs: first.sceneStartMs,
    localStartMs: first.placement.startMs,
    durationMs: endMs - first.globalStartMs,
  }
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
  const resolved = resolveCompositionOwner(composition, owner)
  if (!resolved) return composition
  const logicalClipId = resolved.placement.logicalClipId ?? resolved.placement.id
  const updateLogicalPlacement = <T extends ShowMainPlacement | ShowOverlayPlacement>(placement: T): T => (
    (placement.logicalClipId ?? placement.id) === logicalClipId ? update(placement) : placement
  )
  return {
    ...composition,
    scenes: composition.scenes.map((scene) => ({
      ...scene,
      zones: scene.zones.map((zone) => ({
        ...zone,
        main: zone.main.map(updateLogicalPlacement),
        overlays: zone.overlays.map((layer) => ({
          ...layer,
          placements: layer.placements.map(updateLogicalPlacement),
        })),
      })),
    })),
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

function normalizePresentation(presentation: ShowClipPresentation | undefined): ShowClipPresentation {
  if (presentation?.mode === 'freeze') return { mode: 'freeze' }
  if (presentation?.mode === 'strobe') {
    return { mode: 'strobe', cadenceMs: Math.round(clamp(presentation.cadenceMs, 16, 60_000)) }
  }
  return { mode: 'live' }
}

function compactPresentation(presentation: ShowClipPresentation): Pick<ShowCell, 'presentation'> {
  const normalized = normalizePresentation(presentation)
  return normalized.mode === 'live' ? { presentation: undefined } : { presentation: normalized }
}

function normalizeBlink(blink: ShowClipBlink): ShowClipBlink {
  return {
    rateHz: clamp(blink.rateHz, 0.01, 60),
    duty: clamp01(blink.duty),
    phase: clamp01(blink.phase),
  }
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

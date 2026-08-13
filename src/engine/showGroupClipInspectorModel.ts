import type {
  ShowClipBlink,
  ShowClipPresentation,
  ShowGroupDefinition,
  ShowGroupPlacement,
  ShowPatternInstance,
  ShowRecord,
} from './personalContentRecords'
import {
  normalizeShowClipEvaluationPolicy,
  type ShowClipInspectorPatch,
  type ShowClipInspectorValue,
} from './showClipInspectorModel'
import { normalizeShowClipEffects } from './showEffects'
import { compactShowClipTransform, normalizeShowClipTransform } from './showClipTransform'
import { compactShowClipViewport, normalizeShowClipViewport } from './showClipViewport'
import { projectShowTimeline } from './showModel'

export interface ShowGroupClipOwner {
  occurrenceId: string
  placementId: string
}

export function projectShowGroupClipInspector(
  show: ShowRecord,
  owner: ShowGroupClipOwner,
): ShowClipInspectorValue | null {
  const resolved = resolveGroupClip(show, owner)
  if (!resolved) return null
  const { occurrence, placement, instance } = resolved
  const sceneRange = projectShowTimeline(show).scenes.find((scene) => scene.sceneId === occurrence.sceneId)
  if (!sceneRange) return null
  const absoluteLayer = occurrence.baseLayer + placement.layerOffset
  return {
    scope: absoluteLayer === 0 ? 'scene-main' : 'scene-overlay',
    owner: absoluteLayer === 0
      ? {
          kind: 'scene-main',
          sceneId: occurrence.sceneId,
          zoneId: occurrence.zoneId,
          placementId: placement.id,
        }
      : {
          kind: 'scene-overlay',
          sceneId: occurrence.sceneId,
          zoneId: occurrence.zoneId,
          layerId: `group-layer:${absoluteLayer}`,
          placementId: placement.id,
        },
    pattern: { ...instance.pattern },
    patternName: instance.patternName,
    evaluationPolicy: normalizeShowClipEvaluationPolicy(instance.evaluationPolicy),
    presentation: normalizePresentation(placement.presentation),
    ...(placement.blink ? { blink: normalizeBlink(placement.blink) } : {}),
    simulation: {
      timeScale: instance.time.timeScale,
      timeOffsetMs: instance.time.timeOffsetMs,
      ...(instance.time.lightShutter ? { lightShutter: { ...instance.time.lightShutter } } : {}),
      ...(instance.time.steppedClock ? { steppedClock: { ...instance.time.steppedClock } } : {}),
      ...(instance.controlTargets ? { controlTargets: { ...instance.controlTargets } } : {}),
    },
    view: { ...placement.view },
    transform: normalizeShowClipTransform(placement.transform),
    viewport: normalizeShowClipViewport(placement.viewport),
    effects: normalizeShowClipEffects(placement.effects),
    placementId: placement.id,
    instanceId: instance.id,
    ...(absoluteLayer > 0 ? { layerId: `group-layer:${absoluteLayer}` } : {}),
    local: {
      startMs: sceneRange.startMs + occurrence.startMs + placement.startMs,
      durationMs: placement.durationMs,
      ...(absoluteLayer > 0 ? { opacity: placement.opacity } : {}),
    },
  }
}

export function updateShowGroupClipInspector(
  show: ShowRecord,
  owner: ShowGroupClipOwner,
  patch: ShowClipInspectorPatch,
): ShowRecord {
  const resolved = resolveGroupClip(show, owner)
  if (!show.composition || !resolved) return show
  const sceneRange = projectShowTimeline(show).scenes.find((scene) => scene.sceneId === resolved.occurrence.sceneId)
  if (!sceneRange) return show
  const normalizedPatch = patch.local?.startMs === undefined
    ? patch
    : {
        ...patch,
        local: {
          ...patch.local,
          startMs: Math.round(patch.local.startMs - sceneRange.startMs - resolved.occurrence.startMs),
        },
      }
  if (!validLocalPatch(normalizedPatch)) return show
  const definitions = show.composition.groupDefinitions?.map((definition) => {
    if (definition.id !== resolved.definition.id) return definition
    return updateDefinition(definition, resolved.placement.id, resolved.instance.id, normalizedPatch)
  })
  if (!definitions) return show
  // A changed Group source forfeits the deterministic-loop stamp: the
  // exact-reset proof (#823 wrap census) binds to the whole authored cast,
  // group members included.
  const sourceChanged = Boolean(patch.pattern
    && patternKey(patch.pattern.ref) !== patternKey(resolved.instance.pattern))
  return {
    ...show,
    composition: {
      ...show.composition,
      ...(sourceChanged ? { executionModel: undefined } : {}),
      groupDefinitions: definitions,
    },
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  }
}

function resolveGroupClip(show: Pick<ShowRecord, 'composition'>, owner: ShowGroupClipOwner) {
  const occurrence = show.composition?.groupOccurrences?.find((candidate) => candidate.id === owner.occurrenceId)
  const definition = show.composition?.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
  const placement = definition?.placements.find((candidate) => candidate.id === owner.placementId)
  const instance = definition?.patternInstances.find((candidate) => candidate.id === placement?.instanceId)
  return occurrence && definition && placement && instance
    ? { occurrence, definition, placement, instance }
    : null
}

function updateDefinition(
  definition: ShowGroupDefinition,
  placementId: string,
  instanceId: string,
  patch: ShowClipInspectorPatch,
): ShowGroupDefinition {
  const patternInstances = definition.patternInstances.map((instance) => instance.id === instanceId
    ? updateInstance(instance, patch)
    : instance)
  const placements = definition.placements.map((placement) => placement.id === placementId
    ? updatePlacement(placement, patch)
    : placement)
  let propertyTracks = definition.propertyTracks
  if (patch.pattern || (patch.simulation && Object.prototype.hasOwnProperty.call(patch.simulation, 'controlTargets'))) {
    const controlTargets = patternInstances.find((instance) => instance.id === instanceId)?.controlTargets
    propertyTracks = propertyTracks?.filter((track) => {
      const target = track.target
      if (target.kind !== 'instance-control' || target.instanceId !== instanceId) return true
      return Object.prototype.hasOwnProperty.call(controlTargets ?? {}, target.exportName)
    })
  }
  if (patch.effects) {
    const effects = placements.find((placement) => placement.id === placementId)?.effects
    propertyTracks = propertyTracks?.filter((track) => {
      const target = track.target
      if (target.kind !== 'placement-effect' || target.placementId !== placementId) return true
      return (effects ?? []).some((effect) => effect.id === target.effectId && effect.kind === target.effectKind)
    })
  }
  return {
    ...definition,
    patternInstances,
    placements,
    ...(propertyTracks === definition.propertyTracks
      ? {}
      : propertyTracks?.length ? { propertyTracks } : { propertyTracks: undefined }),
  }
}

function updateInstance(instance: ShowPatternInstance, patch: ShowClipInspectorPatch): ShowPatternInstance {
  if (!patch.pattern && !patch.simulation && !patch.evaluationPolicy) return instance
  const time = patch.simulation ? normalizeSimulationTime({ ...instance.time, ...patch.simulation }) : instance.time
  let controlTargets = instance.controlTargets
  if (patch.simulation && Object.prototype.hasOwnProperty.call(patch.simulation, 'controlTargets')) {
    const next = patch.simulation.controlTargets
      ? Object.fromEntries(Object.entries(patch.simulation.controlTargets).map(([key, value]) => [key, clamp(value, 0, 1)]))
      : {}
    controlTargets = Object.keys(next).length > 0 ? next : undefined
  } else if (patch.pattern && patternKey(patch.pattern.ref) !== patternKey(instance.pattern)) {
    controlTargets = undefined
  }
  return {
    ...instance,
    ...(patch.pattern ? { pattern: { ...patch.pattern.ref }, patternName: patch.pattern.name } : {}),
    ...(patch.evaluationPolicy ? { evaluationPolicy: normalizeShowClipEvaluationPolicy(patch.evaluationPolicy) } : {}),
    time,
    controlTargets,
  }
}

function updatePlacement(placement: ShowGroupPlacement, patch: ShowClipInspectorPatch): ShowGroupPlacement {
  return {
    ...placement,
    ...(patch.view ? { view: normalizeView({ ...placement.view, ...patch.view }) } : {}),
    ...(patch.transform ? { transform: compactShowClipTransform({ ...placement.transform, ...patch.transform }) } : {}),
    ...(patch.viewport ? { viewport: compactShowClipViewport({ ...placement.viewport, ...patch.viewport }) } : {}),
    ...(patch.effects ? { effects: normalizeShowClipEffects(patch.effects) } : {}),
    ...(patch.presentation ? compactPresentation(patch.presentation) : {}),
    ...(patch.blink === null ? { blink: undefined } : patch.blink ? { blink: normalizeBlink(patch.blink) } : {}),
    ...(patch.local ? {
      startMs: Math.round(patch.local.startMs ?? placement.startMs),
      durationMs: Math.round(patch.local.durationMs ?? placement.durationMs),
      opacity: clamp(patch.local.opacity ?? placement.opacity, 0, 1),
    } : {}),
  }
}

function validLocalPatch(patch: ShowClipInspectorPatch): boolean {
  if (!patch.local) return true
  if (patch.local.startMs !== undefined && (!Number.isFinite(patch.local.startMs) || patch.local.startMs < 0)) return false
  if (patch.local.durationMs !== undefined && (!Number.isFinite(patch.local.durationMs) || patch.local.durationMs <= 0)) return false
  return true
}

function normalizeSimulationTime(time: ShowPatternInstance['time']): ShowPatternInstance['time'] {
  return {
    timeScale: clamp(time.timeScale, 0, 4),
    timeOffsetMs: Math.round(clamp(time.timeOffsetMs, 0, 60_000)),
    ...(time.lightShutter ? {
      lightShutter: {
        rateHz: clamp(time.lightShutter.rateHz, 0.01, 60),
        duty: clamp(time.lightShutter.duty, 0, 1),
        phase: clamp(time.lightShutter.phase, 0, 1),
        clockBehavior: time.lightShutter.clockBehavior === 'freeze' ? 'freeze' : 'continue',
      },
    } : {}),
    ...(time.steppedClock ? { steppedClock: { stepMs: Math.max(1, Math.round(time.steppedClock.stepMs)) } } : {}),
  }
}

function normalizeView(view: ShowGroupPlacement['view']): ShowGroupPlacement['view'] {
  return {
    mirror: Boolean(view.mirror),
    phase: clamp(view.phase, 0, 1),
    brightness: clamp(view.brightness, 0, 1),
  }
}

function normalizePresentation(presentation: ShowClipPresentation | undefined): ShowClipPresentation {
  if (presentation?.mode === 'freeze') return { mode: 'freeze' }
  if (presentation?.mode === 'strobe') return { mode: 'strobe', cadenceMs: Math.round(clamp(presentation.cadenceMs, 16, 60_000)) }
  return { mode: 'live' }
}

function compactPresentation(presentation: ShowClipPresentation): Pick<ShowGroupPlacement, 'presentation'> {
  const normalized = normalizePresentation(presentation)
  return normalized.mode === 'live' ? { presentation: undefined } : { presentation: normalized }
}

function normalizeBlink(blink: ShowClipBlink): ShowClipBlink {
  return {
    rateHz: clamp(blink.rateHz, 0.01, 60),
    duty: clamp(blink.duty, 0, 1),
    phase: clamp(blink.phase, 0, 1),
  }
}

function patternKey(pattern: ShowPatternInstance['pattern']): string {
  return `${pattern.kind}:${pattern.id}`
}

function clamp(value: number | undefined, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return minimum
  return Math.max(minimum, Math.min(maximum, value))
}

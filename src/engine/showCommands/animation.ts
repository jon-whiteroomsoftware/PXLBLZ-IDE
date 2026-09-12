// Property-animation command family: Scene-owned property tracks through the
// pure track functions. Commands speak global milliseconds; tracks store
// Scene-local times, so every command converts through the timeline's Scene
// ranges. Group-definition tracks are out of scope here; they edit through
// the Group animation functions.
import { newPersonalContentId } from '../personalContentMetadata'
import { declaredPatternSliderNames } from '../showPatternControls'
import { normalizeShowEasing, validateShowEasing } from '../showEasing'
import { showClipEffectParameterValue, showClipEffectParameters } from '../showEffectAuthoring'
import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowTransitionEasing,
} from '../personalContentRecords'
import { projectShowTimeline } from '../showModel'
import {
  addShowPropertyKeyframe,
  describeShowPropertyTrack,
  editShowPropertyKeyframes,
  propertyTargetKey,
  addShowPropertyTrack,
  deleteShowPropertyKeyframe,
  deleteShowPropertyTrack,
  updateShowPropertyKeyframe,
} from '../showPropertyAnimation'
import {
  commandComposition,
  refuseShowCommand,
  withComposition,
  type ShowCommandDescriptor,
  type ShowCommandContext,
  type ShowCommandOutcome,
  type ShowCommandRefusal,
} from './registry'
import { engineIdentityRefusal, resolveCommandClip } from './support'

const TARGET_KINDS = new Set([
  'instance-time-scale', 'instance-control', 'placement-opacity',
  'placement-view', 'placement-transform', 'placement-viewport', 'placement-effect',
])

const SHORT_TARGETS = new Set([
  'opacity', 'view-brightness', 'view-phase',
  'transform-position-x', 'transform-position-y', 'transform-rotation',
  'transform-scale-x', 'transform-scale-y',
  'viewport-x', 'viewport-y', 'viewport-width', 'viewport-height',
  'effect', 'time-scale', 'control',
])

const SHORT_TARGET_SELECTORS = ['clip_id', 'control_export_name', 'effect_id', 'parameter_id'] as const

function isTrackTarget(value: unknown): value is ShowPropertyAnimationTarget {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const target = value as Record<string, unknown>
  if (!TARGET_KINDS.has(target.kind as string)) return false
  const shapes: Record<string, Record<string, readonly string[] | null>> = {
    'instance-time-scale': { instanceId: null },
    'instance-control': { instanceId: null, exportName: null },
    'placement-opacity': { placementId: null },
    'placement-view': { placementId: null, property: ['brightness', 'phase'] },
    'placement-transform': { placementId: null, property: ['positionX', 'positionY', 'rotation', 'scaleX', 'scaleY'] },
    'placement-viewport': { placementId: null, property: ['x', 'y', 'width', 'height'] },
    'placement-effect': { placementId: null, effectId: null, effectKind: null, parameterId: null },
  }
  const shape = shapes[target.kind as string]
  return !!shape && Object.keys(target).every(key => key === 'kind' || Object.prototype.hasOwnProperty.call(shape, key))
    && Object.entries(shape).every(([key, values]) => typeof target[key] === 'string' && (values === null || values.includes(target[key] as string)))
}

interface TrackSite {
  sceneId: string
  sceneStartMs: number
  sceneEndMs: number
  track: ShowPropertyAnimationTrack
}

interface AnimationTargetContext {
  target: ShowPropertyAnimationTarget
  sceneId: string
  ownership: 'placement' | 'instance'
  clipId?: string
  instanceId?: string
  affectedClipIds?: string[]
}

type ScenePlacement = ShowMainPlacement | ShowOverlayPlacement

function scenePlacements(composition: ShowCompositionV1, sceneId: string): ScenePlacement[] {
  const scene = composition.scenes.find((candidate) => candidate.sceneId === sceneId)
  return scene?.zones.flatMap((zone) => [
    ...zone.main,
    ...zone.overlays.flatMap((layer) => layer.placements),
  ]) ?? []
}

function placementSite(
  composition: ShowCompositionV1,
  placementId: string,
): { sceneId: string; placement: ScenePlacement } | undefined {
  for (const scene of composition.scenes) {
    const placement = scenePlacements(composition, scene.sceneId)
      .find((candidate) => candidate.id === placementId)
    if (placement) return { sceneId: scene.sceneId, placement }
  }
  return undefined
}

function instanceOwnership(
  composition: ShowCompositionV1,
  sceneId: string,
  instanceId: string,
): Pick<AnimationTargetContext, 'ownership' | 'instanceId' | 'affectedClipIds'> {
  return {
    ownership: 'instance',
    instanceId,
    affectedClipIds: [...new Set(scenePlacements(composition, sceneId)
      .filter((placement) => placement.instanceId === instanceId)
      .map((placement) => placement.logicalClipId ?? placement.id))].sort(),
  }
}

function invalidSelectorMessage(target: string, selectors: readonly string[]): ShowCommandRefusal {
  return refuseShowCommand({
    code: 'invalid-argument',
    message: `${target}: selector${selectors.length === 1 ? '' : 's'} ${selectors.join(', ')} ${selectors.length === 1 ? 'is' : 'are'} not valid for this animation target.`,
  })
}

function resolveAnimationTarget(
  record: ShowRecord,
  composition: ShowCompositionV1,
  input: Record<string, unknown>,
  context?: ShowCommandContext,
): { ok: true; context: AnimationTargetContext } | ShowCommandRefusal {
  let target: ShowPropertyAnimationTarget
  let sceneId: string | undefined
  let clipId: string | undefined

  if (typeof input.target === 'string') {
    const shortName = input.target
    if (!SHORT_TARGETS.has(shortName)) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: `Unknown short animation target "${shortName}".`,
        candidates: [...SHORT_TARGETS],
      })
    }
    if (typeof input.clip_id !== 'string' || input.clip_id.length === 0) {
      return refuseShowCommand({ code: 'invalid-argument', message: 'A short target name requires a nonempty clip_id.' })
    }
    clipId = input.clip_id
    const found = resolveCommandClip(record, composition, clipId)
    if (!found.ok) return found
    const clip = found.context.clip
    if (clip.startSceneId !== clip.endSceneId) {
      return refuseShowCommand({
        code: 'multi-segment-clip',
        message: 'Property tracks edit one Scene; target a Clip contained wholly in one Scene.',
      })
    }
    sceneId = clip.sceneId
    if (input.scene_id !== undefined && input.scene_id !== sceneId) {
      return refuseShowCommand({ code: 'invalid-argument', message: 'scene_id must match the Clip owner.' })
    }
    const allowedSelectors = shortName === 'control'
      ? new Set(['clip_id', 'control_export_name'])
      : shortName === 'effect'
        ? new Set(['clip_id', 'effect_id', 'parameter_id'])
        : new Set(['clip_id'])
    const irrelevant = SHORT_TARGET_SELECTORS.filter((selector) =>
      input[selector] !== undefined && !allowedSelectors.has(selector))
    if (irrelevant.length > 0) return invalidSelectorMessage(shortName, irrelevant)

    const placementId = clip.startPlacementId
    switch (shortName) {
      case 'opacity': target = { kind: 'placement-opacity', placementId }; break
      case 'view-brightness': target = { kind: 'placement-view', placementId, property: 'brightness' }; break
      case 'view-phase': target = { kind: 'placement-view', placementId, property: 'phase' }; break
      case 'transform-position-x': target = { kind: 'placement-transform', placementId, property: 'positionX' }; break
      case 'transform-position-y': target = { kind: 'placement-transform', placementId, property: 'positionY' }; break
      case 'transform-rotation': target = { kind: 'placement-transform', placementId, property: 'rotation' }; break
      case 'transform-scale-x': target = { kind: 'placement-transform', placementId, property: 'scaleX' }; break
      case 'transform-scale-y': target = { kind: 'placement-transform', placementId, property: 'scaleY' }; break
      case 'viewport-x': target = { kind: 'placement-viewport', placementId, property: 'x' }; break
      case 'viewport-y': target = { kind: 'placement-viewport', placementId, property: 'y' }; break
      case 'viewport-width': target = { kind: 'placement-viewport', placementId, property: 'width' }; break
      case 'viewport-height': target = { kind: 'placement-viewport', placementId, property: 'height' }; break
      case 'time-scale': target = { kind: 'instance-time-scale', instanceId: clip.instanceId }; break
      case 'control': {
        if (typeof input.control_export_name !== 'string' || input.control_export_name.length === 0) {
          return refuseShowCommand({ code: 'invalid-argument', message: 'The control shortcut requires a nonempty control_export_name.' })
        }
        target = { kind: 'instance-control', instanceId: clip.instanceId, exportName: input.control_export_name }
        break
      }
      case 'effect': {
        if (typeof input.effect_id !== 'string' || input.effect_id.length === 0
          || typeof input.parameter_id !== 'string' || input.parameter_id.length === 0) {
          return refuseShowCommand({ code: 'invalid-argument', message: 'The effect shortcut requires nonempty effect_id and parameter_id.' })
        }
        const site = placementSite(composition, placementId)
        const effect = site?.placement.effects?.find((candidate) => candidate.id === input.effect_id)
        if (!effect) {
          return refuseShowCommand({
            code: 'unknown-effect',
            message: `Clip ${clipId} has no Effect "${input.effect_id}".`,
            candidates: site?.placement.effects?.map((candidate) => candidate.id) ?? [],
          })
        }
        const parameter = showClipEffectParameters(effect)
          .find((candidate) => candidate.id === input.parameter_id)
        if (!parameter || parameter.kind !== 'number'
          || typeof showClipEffectParameterValue(effect, parameter.id) !== 'number') {
          return refuseShowCommand({
            code: 'unknown-effect-parameter',
            message: `Effect ${effect.id} has no numeric animatable parameter "${input.parameter_id}".`,
            candidates: showClipEffectParameters(effect)
              .filter((candidate) => candidate.kind === 'number')
              .map((candidate) => candidate.id),
          })
        }
        target = {
          kind: 'placement-effect',
          placementId,
          effectId: effect.id,
          effectKind: effect.kind,
          parameterId: parameter.id,
        }
        break
      }
      default: return refuseShowCommand({ code: 'invalid-argument', message: 'Unknown short animation target.' })
    }
  } else {
    const selectors = SHORT_TARGET_SELECTORS.filter((selector) => input[selector] !== undefined)
    if (selectors.length > 0) return invalidSelectorMessage('Persisted targets', selectors)
    target = input.target as ShowPropertyAnimationTarget
    if (!isTrackTarget(target)) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: `add_property_track: target.kind must be one of ${[...TARGET_KINDS].join(', ')}.`,
      })
    }
    if ('placementId' in target) {
      const site = placementSite(composition, target.placementId)
      sceneId = site?.sceneId
      if (!sceneId) {
        return refuseShowCommand({ code: 'unknown-clip', message: `No placement has id "${target.placementId}".` })
      }
      clipId = site!.placement.logicalClipId ?? site!.placement.id
      if (input.scene_id !== undefined && input.scene_id !== sceneId) {
        return refuseShowCommand({ code: 'invalid-argument', message: 'scene_id must match the target placement owner.' })
      }
    } else {
      const instanceId = target.instanceId
      sceneId = input.scene_id as string | undefined
        ?? composition.scenes.find((scene) =>
          scenePlacements(composition, scene.sceneId).some((placement) => placement.instanceId === instanceId))?.sceneId
      if (!sceneId || !composition.scenes.some((scene) =>
        scene.sceneId === sceneId
        && scenePlacements(composition, sceneId!).some((placement) => placement.instanceId === instanceId))) {
        return refuseShowCommand({
          code: 'unknown-clip',
          message: `Scene ${String(sceneId)} does not use instance "${instanceId}".`,
        })
      }
    }
  }

  if (target.kind === 'instance-control') {
    const instance = composition.patternInstances.find((candidate) => candidate.id === target.instanceId)
    if (!instance || !Object.prototype.hasOwnProperty.call(instance.controlTargets ?? {}, target.exportName)) {
      return refuseShowCommand({
        code: 'unknown-control',
        message: `Pattern instance ${target.instanceId} has no authored control target "${target.exportName}".`,
        candidates: Object.keys(instance?.controlTargets ?? {}),
      })
    }
    let names: ReadonlySet<string>
    try { names = declaredPatternSliderNames(context?.source(instance.pattern)) }
    catch {
      return refuseShowCommand({ code: 'unknown-control', message: 'Pattern control metadata cannot be inspected.' })
    }
    if (!names.has(target.exportName)) {
      return refuseShowCommand({
        code: 'unknown-control',
        message: `The current Pattern source has no exported slider named ${target.exportName}.`,
        candidates: [...names],
      })
    }
  }

  if (target.kind === 'placement-effect') {
    const site = placementSite(composition, target.placementId)
    const effect = site?.placement.effects?.find((candidate) => candidate.id === target.effectId)
    const parameter = effect?.kind === target.effectKind
      ? showClipEffectParameters(effect).find((candidate) => candidate.id === target.parameterId)
      : undefined
    if (!effect || effect.kind !== target.effectKind || !parameter || parameter.kind !== 'number'
      || typeof showClipEffectParameterValue(effect, target.parameterId) !== 'number') {
      return refuseShowCommand({
        code: 'unknown-effect-parameter',
        message: 'The persisted Effect target does not resolve to its exact numeric animatable parameter.',
      })
    }
  }

  const ownership = 'instanceId' in target
    ? instanceOwnership(composition, sceneId!, target.instanceId)
    : { ownership: 'placement' as const }
  return {
    ok: true,
    context: {
      target,
      sceneId: sceneId!,
      ...(clipId ? { clipId } : {}),
      ...ownership,
    },
  }
}

function parseCommandEasing(
  easing: unknown,
  path: string,
): { ok: true; easing: ShowTransitionEasing } | ShowCommandRefusal {
  const valid = typeof easing === 'string'
    ? ['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(easing)
    : validateShowEasing(easing).valid
  if (!valid) {
    return refuseShowCommand({ code: 'invalid-argument', message: `${path}: easing is invalid.` })
  }
  return { ok: true, easing: easing as ShowTransitionEasing }
}

function parseTrackKeyframes(
  value: unknown,
  site: Pick<TrackSite, 'sceneId' | 'sceneStartMs' | 'sceneEndMs'>,
): { ok: true; keyframes: Array<Omit<ShowPropertyAnimationKeyframe, 'id'>> } | ShowCommandRefusal {
  if (!Array.isArray(value) || value.length < 2) {
    return refuseShowCommand({
      code: 'invalid-argument',
      message: 'add_property_track: keyframes must be an array with at least two entries.',
    })
  }
  const keyframes: Array<Omit<ShowPropertyAnimationKeyframe, 'id'>> = []
  for (const [index, raw] of value.entries()) {
    const path = `keyframes[${index}]`
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return refuseShowCommand({ code: 'invalid-argument', message: `${path} must be an object.` })
    }
    const entry = raw as Record<string, unknown>
    const unknown = Object.keys(entry).filter((key) => !['time_ms', 'value', 'easing'].includes(key))
    if (unknown.length > 0) {
      return refuseShowCommand({ code: 'invalid-argument', message: `${path}: unknown field "${unknown[0]}".` })
    }
    if (typeof entry.time_ms !== 'number' || !Number.isFinite(entry.time_ms)
      || typeof entry.value !== 'number' || !Number.isFinite(entry.value)) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: `${path} requires finite number fields time_ms and value.`,
      })
    }
    const easing = parseCommandEasing(entry.easing === undefined ? 'linear' : entry.easing, path)
    if (!easing.ok) return easing
    const local = toSceneLocal(site, 'add_property_track', entry.time_ms)
    if (!local.ok) return local
    keyframes.push({
      timeMs: local.localMs,
      value: entry.value,
      easing: normalizeShowEasing(easing.easing),
    })
  }
  keyframes.sort((left, right) => left.timeMs - right.timeMs)
  const collision = keyframes.find((keyframe, index) =>
    index > 0 && keyframe.timeMs === keyframes[index - 1].timeMs)
  if (collision) {
    return refuseShowCommand({
      code: 'duplicate-keyframe-time',
      message: `Keyframe times collide at ${collision.timeMs + site.sceneStartMs} ms after rounding.`,
    })
  }
  return { ok: true, keyframes }
}

function trackSites(record: ShowRecord): TrackSite[] {
  const ranges = new Map(projectShowTimeline(record).scenes
    .map((scene) => [scene.sceneId, { startMs: scene.startMs, endMs: scene.endMs }]))
  return (record.composition?.scenes ?? []).flatMap((scene) => {
    const range = ranges.get(scene.sceneId)
    if (!range) return []
    return (scene.propertyTracks ?? []).map((track) => ({
      sceneId: scene.sceneId,
      sceneStartMs: range.startMs,
      sceneEndMs: range.endMs,
      track,
    }))
  })
}

function resolveTrack(record: ShowRecord, trackId: string): { ok: true; site: TrackSite } | ShowCommandRefusal {
  const sites = trackSites(record)
  const site = sites.find((candidate) => candidate.track.id === trackId)
  if (!site) {
    return refuseShowCommand({
      code: 'unknown-track',
      message:
        sites.length === 0
          ? 'This Show has no Scene property tracks yet; add one with add_property_track.'
          : `No property track has id "${trackId}". Tracks: ${
              sites.map((candidate) =>
                `${candidate.track.id} (${candidate.track.target.kind} in ${candidate.sceneId})`).join('; ')}.`,
      candidates: sites.map((candidate) => candidate.track.id),
    })
  }
  return { ok: true, site }
}

/** Global → Scene-local, refusing a time outside the owning Scene's range. */
function toSceneLocal(
  site: Pick<TrackSite, 'sceneId' | 'sceneStartMs' | 'sceneEndMs'>,
  command: string,
  globalMs: number,
): { ok: true; localMs: number } | ShowCommandRefusal {
  if (!Number.isFinite(globalMs) || globalMs < site.sceneStartMs || globalMs > site.sceneEndMs) {
    return refuseShowCommand({
      code: 'outside-scene',
      message:
        `${command}: ${globalMs} ms is outside Scene ${site.sceneId}, which covers ` +
        `${site.sceneStartMs}–${site.sceneEndMs} ms on the global timeline.`,
      remedy: `Choose a time between ${site.sceneStartMs} and ${site.sceneEndMs} ms.`,
    })
  }
  return { ok: true, localMs: Math.round(globalMs - site.sceneStartMs) }
}

function resolveKeyframe(
  site: TrackSite,
  keyframeId: string,
): { ok: true; keyframe: ShowPropertyAnimationKeyframe } | ShowCommandRefusal {
  const keyframe = site.track.keyframes.find((candidate) => candidate.id === keyframeId)
  if (!keyframe) {
    return refuseShowCommand({
      code: 'unknown-keyframe',
      message:
        `Track ${site.track.id} has no keyframe "${keyframeId}". Keyframes: ${
          site.track.keyframes.map((candidate) =>
            `${candidate.id} (at ${candidate.timeMs + site.sceneStartMs} ms)`).join('; ')}.`,
      candidates: site.track.keyframes.map((candidate) => candidate.id),
    })
  }
  return { ok: true, keyframe }
}

const addPropertyTrack: ShowCommandDescriptor = {
  name: 'add_property_track',
  description:
    'Add a Scene-owned property animation track. The target is the persisted target record (for ' +
    'example { "kind": "placement-view", "placementId": "...", "property": "brightness" } or ' +
    '{ "kind": "instance-control", "instanceId": "...", "exportName": "speed" }); keyframes give ' +
    'global times, converted to the owning Scene\'s local time. The Scene is derived from the ' +
    'target\'s placement, or given as scene_id for instance targets.',
  touches: ['/composition/scenes/*/propertyTracks', '/updatedAt'],
  fields: {
    target: { kind: 'json', description: 'Persisted seven-kind target record, or a documented short target name with clip_id' },
    clip_id: { kind: 'string', optional: true, description: 'Logical Clip for a short target name; multi-Scene Clips refuse' },
    control_export_name: { kind: 'string', optional: true, description: 'Exported slider name for short control target' },
    effect_id: { kind: 'string', optional: true, description: 'Effect id for the short effect target' },
    parameter_id: { kind: 'string', optional: true, description: 'Numeric parameter id for the short effect target' },
    initial_value: { kind: 'number', optional: true, description: 'Constant value seeded at both Scene endpoints, instead of keyframes' },
    keyframes: { kind: 'json', optional: true, description: 'Array of { time_ms (global), value, easing? }, at least two, instead of initial_value' },
    scene_id: { kind: 'string', optional: true, description: 'Owning Scene for instance targets (default: the first Scene using the instance)' },
  },
  exactlyOne: ['initial_value', 'keyframes'],
  apply: (record, input, context) => addPropertyTrackCommandOutcome(record, input, context),
}

export function addPropertyTrackCommandOutcome(record: ShowRecord, input: Record<string, unknown>, context?: ShowCommandContext, idFactory: (kind: 'kf' | 'track') => string = () => newPersonalContentId()): ShowCommandOutcome {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const composition = resolved.composition
  const targetResult = resolveAnimationTarget(record, composition, input, context)
  if (!targetResult.ok) return targetResult
  const { target, sceneId } = targetResult.context
  const ranges = projectShowTimeline(record).scenes
  const existing = composition.scenes.find(scene => scene.sceneId === sceneId)?.propertyTracks?.find(track => propertyTargetKey(track.target) === propertyTargetKey(target))
  if (existing) return refuseShowCommand({ code: 'duplicate-target', message: `Track ${existing.id} already animates this target.`, candidates: [existing.id] })
  const range = ranges.find((scene) => scene.sceneId === sceneId)
  if (!range) return refuseShowCommand({ code: 'unknown-scene', message: `Scene ${sceneId} has no authored timeline range.` })
  if ((input.keyframes === undefined) === (input.initial_value === undefined)) {
    return refuseShowCommand({ code: 'invalid-argument', message: 'Give exactly one of keyframes or initial_value.' })
  }
  if (input.initial_value !== undefined
    && (typeof input.initial_value !== 'number' || !Number.isFinite(input.initial_value))) {
    return refuseShowCommand({ code: 'invalid-argument', message: 'initial_value must be a finite number.' })
  }
  const site = { sceneId, sceneStartMs: range.startMs, sceneEndMs: range.endMs }
  const parsed = parseTrackKeyframes(input.initial_value === undefined ? input.keyframes : [
    { time_ms: range.startMs, value: input.initial_value },
    { time_ms: range.endMs, value: input.initial_value },
  ], site)
  if (!parsed.ok) return parsed
  const keyframes: ShowPropertyAnimationKeyframe[] = parsed.keyframes.map((keyframe) => ({
    ...keyframe,
    id: idFactory('kf'),
  }))
  const trackId = idFactory('track')
  const result = addShowPropertyTrack(record, composition, sceneId, {
    id: trackId,
    target,
    keyframes,
  })
  if (result === composition) {
    return engineIdentityRefusal(
      'add_property_track',
      'The track validator declined it: the target may not exist, may already have a track, or the keyframes may be invalid.',
    )
  }
  return {
    ok: true,
    record: withComposition(record, result),
    changes: [{
      command: 'add_property_track',
      targetId: trackId,
      description: `Property track added in ${sceneId} (${target.kind}) with ${keyframes.length} keyframes.`,
      details: {
        keyframeIds: keyframes.map(keyframe => keyframe.id),
        ...targetResult.context,
        ...describeShowPropertyTrack({ id: trackId, target, keyframes }, range.startMs),
      },
    }],
  }
}

interface PlannedCommandKeyframeEdit {
  inputIndex: number
  operation: 'add' | 'update' | 'delete'
  keyframeId?: string
  timeMs?: number
  value?: number
  easing?: ShowTransitionEasing
}

function parseKeyframeEdits(
  value: unknown,
  site: TrackSite,
): { ok: true; edits: PlannedCommandKeyframeEdit[] } | ShowCommandRefusal {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    return refuseShowCommand({
      code: 'invalid-argument',
      message: 'edit_property_keyframes: edits must be a nonempty JSON array with at most 128 entries.',
    })
  }
  const planned: PlannedCommandKeyframeEdit[] = []
  const referenced = new Set<string>()
  for (const [inputIndex, raw] of value.entries()) {
    const path = `edits[${inputIndex}]`
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return refuseShowCommand({ code: 'invalid-argument', message: `${path} must be an object.` })
    }
    const edit = raw as Record<string, unknown>
    const operation = edit.operation
    if (operation !== 'add' && operation !== 'update' && operation !== 'delete') {
      return refuseShowCommand({ code: 'invalid-argument', message: `${path}.operation must be add, update, or delete.` })
    }
    const allowed = operation === 'add'
      ? ['operation', 'time_ms', 'value', 'easing']
      : operation === 'update'
        ? ['operation', 'keyframe_id', 'time_ms', 'value', 'easing']
        : ['operation', 'keyframe_id']
    const unknown = Object.keys(edit).filter((key) => !allowed.includes(key))
    if (unknown.length > 0) {
      return refuseShowCommand({ code: 'invalid-argument', message: `${path}: unknown field "${unknown[0]}".` })
    }

    if (operation === 'add') {
      if (typeof edit.time_ms !== 'number' || !Number.isFinite(edit.time_ms)
        || typeof edit.value !== 'number' || !Number.isFinite(edit.value)) {
        return refuseShowCommand({
          code: 'invalid-argument',
          message: `${path} add requires finite number fields time_ms and value.`,
        })
      }
      const local = toSceneLocal(site, 'edit_property_keyframes', edit.time_ms)
      if (!local.ok) return local
      const easing = parseCommandEasing(edit.easing === undefined ? 'linear' : edit.easing, path)
      if (!easing.ok) return easing
      planned.push({
        inputIndex,
        operation,
        timeMs: local.localMs,
        value: edit.value,
        easing: normalizeShowEasing(easing.easing),
      })
      continue
    }

    if (typeof edit.keyframe_id !== 'string' || edit.keyframe_id.length === 0) {
      return refuseShowCommand({ code: 'invalid-argument', message: `${path} requires a nonempty keyframe_id.` })
    }
    const keyframe = site.track.keyframes.find((candidate) => candidate.id === edit.keyframe_id)
    if (!keyframe) {
      return refuseShowCommand({
        code: 'unknown-keyframe',
        message: `${path}: keyframe "${edit.keyframe_id}" was not in track ${site.track.id} at command entry.`,
        candidates: site.track.keyframes.map((candidate) => candidate.id),
      })
    }
    if (referenced.has(edit.keyframe_id)) {
      return refuseShowCommand({
        code: 'duplicate-keyframe-reference',
        message: `${path}: keyframe "${edit.keyframe_id}" is already referenced by this request.`,
      })
    }
    referenced.add(edit.keyframe_id)
    if (operation === 'delete') {
      planned.push({ inputIndex, operation, keyframeId: edit.keyframe_id })
      continue
    }
    if (edit.time_ms === undefined && edit.value === undefined && edit.easing === undefined) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: `${path} update requires at least one of time_ms, value, or easing.`,
      })
    }
    let timeMs: number | undefined
    if (edit.time_ms !== undefined) {
      if (typeof edit.time_ms !== 'number' || !Number.isFinite(edit.time_ms)) {
        return refuseShowCommand({ code: 'invalid-argument', message: `${path}.time_ms must be a finite number.` })
      }
      const local = toSceneLocal(site, 'edit_property_keyframes', edit.time_ms)
      if (!local.ok) return local
      timeMs = local.localMs
    }
    if (edit.value !== undefined && (typeof edit.value !== 'number' || !Number.isFinite(edit.value))) {
      return refuseShowCommand({ code: 'invalid-argument', message: `${path}.value must be a finite number.` })
    }
    let easing: ShowTransitionEasing | undefined
    if (edit.easing !== undefined) {
      const parsedEasing = parseCommandEasing(edit.easing, path)
      if (!parsedEasing.ok) return parsedEasing
      easing = normalizeShowEasing(parsedEasing.easing)
    }
    planned.push({
      inputIndex,
      operation,
      keyframeId: edit.keyframe_id,
      ...(timeMs !== undefined ? { timeMs } : {}),
      ...(edit.value !== undefined ? { value: edit.value } : {}),
      ...(easing !== undefined ? { easing } : {}),
    })
  }
  return { ok: true, edits: planned }
}

const editPropertyKeyframes: ShowCommandDescriptor = {
  name: 'edit_property_keyframes',
  description:
    'Atomically add, update, and delete up to 128 keys on one property track. Every update and ' +
    'delete resolves against the command-entry track; the final state is sorted and validated once.',
  touches: ['/composition/scenes/*/propertyTracks/*/keyframes', '/updatedAt'],
  fields: {
    track_id: { kind: 'string', description: 'The property track to revise' },
    edits: { kind: 'json', description: 'Nonempty array of strict add, update, or delete entries; maximum 128' },
  },
  apply: (record, input, context) => editPropertyKeyframesCommandOutcome(record, input, context),
}

export function editPropertyKeyframesCommandOutcome(
  record: ShowRecord,
  input: Record<string, unknown>,
  context?: ShowCommandContext,
  idFactory: () => string = newPersonalContentId,
): ShowCommandOutcome {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const found = resolveTrack(record, input.track_id as string)
  if (!found.ok) return found

  const targetResult = resolveAnimationTarget(record, resolved.composition, {
    target: found.site.track.target,
    scene_id: found.site.sceneId,
  }, context)
  if (!targetResult.ok) return targetResult
  const parsed = parseKeyframeEdits(input.edits, found.site)
  if (!parsed.ok) return parsed

  const generatedIds = new Map<number, string>()
  const edits = parsed.edits.map((edit) => {
    if (edit.operation === 'add') {
      const id = idFactory()
      generatedIds.set(edit.inputIndex, id)
      return {
        operation: 'add' as const,
        keyframe: {
          id,
          timeMs: edit.timeMs!,
          value: edit.value!,
          easing: normalizeShowEasing(edit.easing),
        },
      }
    }
    if (edit.operation === 'delete') {
      return { operation: 'delete' as const, keyframeId: edit.keyframeId! }
    }
    return {
      operation: 'update' as const,
      keyframeId: edit.keyframeId!,
      changes: {
        ...(edit.timeMs !== undefined ? { timeMs: edit.timeMs } : {}),
        ...(edit.value !== undefined ? { value: edit.value } : {}),
        ...(edit.easing !== undefined ? { easing: normalizeShowEasing(edit.easing) } : {}),
      },
    }
  })
  const result = editShowPropertyKeyframes(
    record,
    resolved.composition,
    found.site.sceneId,
    found.site.track.id,
    edits,
  )
  if (!result.ok) {
    const issue = result.issues[0]
    return refuseShowCommand({
      code: 'engine-refused',
      message: `edit_property_keyframes: ${issue?.message ?? 'the final track failed validation.'}`,
    })
  }
  if (!result.changed) return { ok: true, record, changes: [] }

  const finalTrack = result.composition.scenes
    .find((scene) => scene.sceneId === found.site.sceneId)!
    .propertyTracks!.find((track) => track.id === found.site.track.id)!
  const finalById = new Map(finalTrack.keyframes.map((keyframe) => [keyframe.id, keyframe]))
  const results = parsed.edits.map((edit) => {
    const keyframeId = edit.operation === 'add' ? generatedIds.get(edit.inputIndex)! : edit.keyframeId!
    if (edit.operation === 'delete') {
      return { inputIndex: edit.inputIndex, operation: edit.operation, keyframeId }
    }
    const keyframe = finalById.get(keyframeId)!
    return {
      inputIndex: edit.inputIndex,
      operation: edit.operation,
      keyframeId,
      timeMs: found.site.sceneStartMs + keyframe.timeMs,
      value: keyframe.value,
      easing: keyframe.easing.curve,
      structuredEasing: structuredClone(keyframe.easing),
    }
  })
  return {
    ok: true,
    record: withComposition(record, result.composition),
    changes: [{
      command: 'edit_property_keyframes',
      targetId: found.site.track.id,
      description:
        `Property track ${found.site.track.id} revised atomically ` +
        `(${found.site.track.keyframes.length} → ${finalTrack.keyframes.length} keyframes).`,
      details: {
        ...targetResult.context,
        beforeKeyframeCount: found.site.track.keyframes.length,
        afterKeyframeCount: finalTrack.keyframes.length,
        results,
        deletedKeyframeIds: parsed.edits
          .filter((edit) => edit.operation === 'delete')
          .map((edit) => edit.keyframeId!),
      },
    }],
  }
}

const addKeyframe: ShowCommandDescriptor = {
  name: 'add_keyframe',
  description: 'Add a keyframe to a property track at a global time inside the track\'s Scene.',
  touches: ['/composition/scenes/*/propertyTracks', '/updatedAt'],
  fields: {
    track_id: { kind: 'string', description: 'The property track' },
    time_ms: { kind: 'number', description: 'Global time; converted to the owning Scene\'s local time' },
    value: { kind: 'number', description: 'The keyframe value' },
    easing: { kind: 'easing', optional: true, description: 'Preset or structured easing (default linear)' },
  },
  apply: (record, input) => addKeyframeCommandOutcome(record, input),
}

export function addKeyframeCommandOutcome(record: ShowRecord, input: Record<string, unknown>, idFactory: () => string = newPersonalContentId): ShowCommandOutcome {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const found = resolveTrack(record, input.track_id as string)
  if (!found.ok) return found
  const local = toSceneLocal(found.site, 'add_keyframe', input.time_ms as number)
  if (!local.ok) return local
  const collision = found.site.track.keyframes.find(keyframe => keyframe.timeMs === local.localMs)
  if (collision) return refuseShowCommand({ code: 'duplicate-keyframe-time', message: `Keyframe ${collision.id} already sits at this time.`, candidates: [collision.id] })
  const keyframeId = idFactory()
  const result = addShowPropertyKeyframe(record, resolved.composition, found.site.sceneId, found.site.track.id, {
    id: keyframeId,
    timeMs: local.localMs,
    value: input.value as number,
    easing: normalizeShowEasing(input.easing as ShowTransitionEasing | undefined),
  })
  if (result === resolved.composition) {
    return engineIdentityRefusal(
      'add_keyframe',
      'A keyframe may already sit at that time, or the value may be invalid.',
    )
  }
  return {
    ok: true,
    record: withComposition(record, result),
    changes: [{
      command: 'add_keyframe',
      details: { trackId: found.site.track.id, ...describeShowPropertyTrack(result.scenes.find(scene => scene.sceneId === found.site.sceneId)!.propertyTracks!.find(track => track.id === found.site.track.id)!, found.site.sceneStartMs) },
      targetId: keyframeId,
      description: `Keyframe added to ${found.site.track.id} at ${Math.round(input.time_ms as number)} ms.`,
    }],
  }
}

const updateKeyframe: ShowCommandDescriptor = {
  name: 'update_keyframe',
  description:
    'Change a keyframe\'s value, global time, or easing; give at least one. Times convert to the ' +
    'owning Scene\'s local time.',
  touches: ['/composition/scenes/*/propertyTracks', '/updatedAt'],
  fields: {
    track_id: { kind: 'string', description: 'The property track' },
    keyframe_id: { kind: 'string', description: 'The keyframe to change' },
    value: { kind: 'number', optional: true, description: 'New value' },
    time_ms: { kind: 'number', optional: true, description: 'New global time' },
    easing: { kind: 'easing', optional: true, description: 'New preset or structured easing' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveTrack(record, input.track_id as string)
    if (!found.ok) return found
    const keyframe = resolveKeyframe(found.site, input.keyframe_id as string)
    if (!keyframe.ok) return keyframe
    if (input.value === undefined && input.time_ms === undefined && input.easing === undefined) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: 'update_keyframe: give at least one of value, time_ms, or easing.',
      })
    }
    let localMs: number | undefined
    if (input.time_ms !== undefined) {
      const local = toSceneLocal(found.site, 'update_keyframe', input.time_ms as number)
      if (!local.ok) return local
      localMs = local.localMs
      const collision = found.site.track.keyframes.find(candidate => candidate.id !== keyframe.keyframe.id && candidate.timeMs === localMs)
      if (collision) return refuseShowCommand({ code: 'duplicate-keyframe-time', message: `Keyframe ${collision.id} already sits at this time.`, candidates: [collision.id] })
    }
    const result = updateShowPropertyKeyframe(
      record,
      resolved.composition,
      found.site.sceneId,
      found.site.track.id,
      keyframe.keyframe.id,
      {
        ...(input.value !== undefined ? { value: input.value as number } : {}),
        ...(localMs !== undefined ? { timeMs: localMs } : {}),
        ...(input.easing !== undefined
          ? { easing: normalizeShowEasing(input.easing as ShowTransitionEasing) }
          : {}),
      },
    )
    if (result === resolved.composition) {
      return engineIdentityRefusal(
        'update_keyframe',
        'The change may collide with another keyframe\'s time or fail validation.',
      )
    }
    if ((input.value === undefined || input.value === keyframe.keyframe.value)
      && (localMs === undefined || localMs === keyframe.keyframe.timeMs)
      && (input.easing === undefined || JSON.stringify(normalizeShowEasing(input.easing as ShowTransitionEasing)) === JSON.stringify(keyframe.keyframe.easing))) {
      return { ok: true, record, changes: [] }
    }
    return {
      ok: true,
      record: withComposition(record, result),
      changes: [{
        command: 'update_keyframe',
        before: { timeMs: keyframe.keyframe.timeMs, value: keyframe.keyframe.value, easing: keyframe.keyframe.easing },
        details: { trackId: found.site.track.id, ...describeShowPropertyTrack(result.scenes.find(scene => scene.sceneId === found.site.sceneId)!.propertyTracks!.find(track => track.id === found.site.track.id)!, found.site.sceneStartMs) },
        targetId: keyframe.keyframe.id,
        description: `Keyframe ${keyframe.keyframe.id} on ${found.site.track.id} updated.`,
      }],
    }
  },
}

const deleteKeyframe: ShowCommandDescriptor = {
  name: 'delete_keyframe',
  description:
    'Delete a keyframe from a property track. A track keeps at least two keyframes; deleting past ' +
    'that refuses.',
  touches: ['/composition/scenes/*/propertyTracks', '/updatedAt'],
  fields: {
    track_id: { kind: 'string', description: 'The property track' },
    keyframe_id: { kind: 'string', description: 'The keyframe to delete' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveTrack(record, input.track_id as string)
    if (!found.ok) return found
    const keyframe = resolveKeyframe(found.site, input.keyframe_id as string)
    if (!keyframe.ok) return keyframe
    if (found.site.track.keyframes.length <= 2) {
      return refuseShowCommand({
        code: 'minimum-keyframes',
        message: `Track ${found.site.track.id} keeps at least two keyframes.`,
        remedy: 'Delete the whole track with delete_property_track instead.',
      })
    }
    const result = deleteShowPropertyKeyframe(
      resolved.composition,
      found.site.sceneId,
      found.site.track.id,
      keyframe.keyframe.id,
    )
    if (result === resolved.composition) {
      return engineIdentityRefusal('delete_keyframe', '')
    }
    return {
      ok: true,
      record: withComposition(record, result),
      changes: [{
        command: 'delete_keyframe',
        details: { trackId: found.site.track.id, ...describeShowPropertyTrack(result.scenes.find(scene => scene.sceneId === found.site.sceneId)!.propertyTracks!.find(track => track.id === found.site.track.id)!, found.site.sceneStartMs) },
        targetId: keyframe.keyframe.id,
        description: `Keyframe ${keyframe.keyframe.id} deleted from ${found.site.track.id}.`,
      }],
    }
  },
}

const deletePropertyTrack: ShowCommandDescriptor = {
  name: 'delete_property_track',
  description: 'Delete a whole property track from its Scene; the animated property returns to its static value.',
  touches: ['/composition/scenes/*/propertyTracks', '/updatedAt'],
  fields: {
    track_id: { kind: 'string', description: 'The property track to delete' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveTrack(record, input.track_id as string)
    if (!found.ok) return found
    const result = deleteShowPropertyTrack(resolved.composition, found.site.sceneId, found.site.track.id)
    if (result === resolved.composition) {
      return engineIdentityRefusal('delete_property_track', '')
    }
    return {
      ok: true,
      record: withComposition(record, result),
      changes: [{
        command: 'delete_property_track',
        targetId: found.site.track.id,
        description: `Property track ${found.site.track.id} deleted from ${found.site.sceneId}.`,
      }],
    }
  },
}

export const SHOW_ANIMATION_COMMANDS: ShowCommandDescriptor[] = [
  addPropertyTrack,
  editPropertyKeyframes,
  addKeyframe,
  updateKeyframe,
  deleteKeyframe,
  deletePropertyTrack,
]

// Property-animation command family: Scene-owned property tracks through the
// pure track functions. Commands speak global milliseconds; tracks store
// Scene-local times, so every command converts through the timeline's Scene
// ranges. Group-definition tracks are out of scope here; they edit through
// the Group animation functions.
import { newPersonalContentId } from '../personalContentMetadata'
import { declaredPatternSliderNames } from '../showPatternControls'
import { normalizeShowEasing, validateShowEasing } from '../showEasing'
import type {
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
    target: { kind: 'json', description: 'Persisted seven-kind target record, or opacity/control/time-scale/view-brightness/view-phase with clip_id' },
    clip_id: { kind: 'string', optional: true, description: 'Logical Clip for a short target name; multi-Scene Clips refuse' },
    control_export_name: { kind: 'string', optional: true, description: 'Exported slider name for short control target' },
    initial_value: { kind: 'number', optional: true, description: 'Constant value seeded at both Scene endpoints, instead of keyframes' },
    keyframes: { kind: 'json', optional: true, description: 'Array of { time_ms (global), value, easing? }, at least two, instead of initial_value' },
    scene_id: { kind: 'string', optional: true, description: 'Owning Scene for instance targets (default: the first Scene using the instance)' },
  },
  apply: (record, input, context) => addPropertyTrackCommandOutcome(record, input, context),
}

export function addPropertyTrackCommandOutcome(record: ShowRecord, input: Record<string, unknown>, context?: ShowCommandContext, idFactory: (kind: 'kf' | 'track') => string = () => newPersonalContentId()): ShowCommandOutcome {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const composition = resolved.composition
  let target = input.target as ShowPropertyAnimationTarget
  if (typeof input.target === 'string') {
    if (typeof input.clip_id !== 'string') return refuseShowCommand({ code: 'invalid-argument', message: 'A short target name requires clip_id.' })
    const found = resolveCommandClip(record, composition, input.clip_id)
    if (!found.ok) return found
    const clip = found.context.clip
    if (clip.startSceneId !== clip.endSceneId) return refuseShowCommand({ code: 'multi-segment-clip', message: 'Property tracks edit one Scene; target a Clip contained in one Scene.' })
    switch (input.target) {
      case 'opacity': target = { kind: 'placement-opacity', placementId: clip.startPlacementId }; break
      case 'control': target = { kind: 'instance-control', instanceId: clip.instanceId, exportName: input.control_export_name as string }; break
      case 'time-scale': target = { kind: 'instance-time-scale', instanceId: clip.instanceId }; break
      case 'view-brightness': case 'view-phase': target = { kind: 'placement-view', placementId: clip.startPlacementId, property: input.target === 'view-brightness' ? 'brightness' : 'phase' }; break
      default: return refuseShowCommand({ code: 'invalid-argument', message: 'Unknown short animation target.' })
    }
    if (input.scene_id !== undefined && input.scene_id !== clip.sceneId) return refuseShowCommand({ code: 'invalid-argument', message: 'scene_id must match the Clip owner.' })
    input = { ...input, scene_id: clip.sceneId }
  } else if (input.clip_id !== undefined || input.control_export_name !== undefined) {
    return refuseShowCommand({ code: 'invalid-argument', message: 'Use clip_id and control_export_name only with a short target name.' })
  }
  if (!isTrackTarget(target)) {
    return refuseShowCommand({
      code: 'invalid-argument',
      message:
        `add_property_track: target.kind must be one of ${[...TARGET_KINDS].join(', ')}.`,
    })
  }
  if (target.kind === 'instance-control') {
    const instance = composition.patternInstances.find(candidate => candidate.id === target.instanceId)
    let names: ReadonlySet<string>
    try { names = declaredPatternSliderNames(instance && context?.source(instance.pattern)) }
    catch { return refuseShowCommand({ code: 'unknown-control', message: 'Pattern control metadata cannot be inspected.' }) }
    if (!names.has(target.exportName)) return refuseShowCommand({ code: 'unknown-control', message: `No known exported slider named ${target.exportName}.`, candidates: [...names] })
  }
  const ranges = projectShowTimeline(record).scenes
  let sceneId: string | undefined
  if ('placementId' in target) {
    sceneId = composition.scenes.find((scene) => scene.zones.some((zone) => (
      zone.main.some((placement) => placement.id === target.placementId)
      || zone.overlays.some((layer) => layer.placements.some((placement) => placement.id === target.placementId))
    )))?.sceneId
    if (!sceneId) {
      return refuseShowCommand({
        code: 'unknown-clip',
        message: `add_property_track: no placement has id "${target.placementId}".`,
      })
    }
    if (input.scene_id !== undefined && input.scene_id !== sceneId) return refuseShowCommand({ code: 'invalid-argument', message: 'scene_id must match the target placement owner.' })
  } else {
    sceneId = (input.scene_id as string | undefined)
      ?? composition.scenes.find((scene) => scene.zones.some((zone) => (
        zone.main.some((placement) => placement.instanceId === target.instanceId)
        || zone.overlays.some((layer) => layer.placements.some((placement) => placement.instanceId === target.instanceId))
      )))?.sceneId
    if (!sceneId || !composition.scenes.some((scene) => scene.sceneId === sceneId)) {
      return refuseShowCommand({
        code: 'unknown-clip',
        message:
          `add_property_track: no Scene uses instance "${target.instanceId}"` +
          `${input.scene_id ? ` (or scene_id "${input.scene_id}" does not exist)` : ''}.`,
      })
    }
  }
  const existing = composition.scenes.find(scene => scene.sceneId === sceneId)?.propertyTracks?.find(track => propertyTargetKey(track.target) === propertyTargetKey(target))
  if (existing) return refuseShowCommand({ code: 'duplicate-target', message: `Track ${existing.id} already animates this target.`, candidates: [existing.id] })
  const range = ranges.find((scene) => scene.sceneId === sceneId)
  if (!range) return refuseShowCommand({ code: 'unknown-scene', message: `Scene ${sceneId} has no authored timeline range.` })
  if ((input.keyframes === undefined) === (input.initial_value === undefined)) return refuseShowCommand({ code: 'invalid-argument', message: 'Give exactly one of keyframes or initial_value.' })
  const rawKeyframes = (input.initial_value === undefined ? input.keyframes : [
    { time_ms: range.startMs, value: input.initial_value },
    { time_ms: range.endMs, value: input.initial_value },
  ]) as Array<{ time_ms: number; value: number; easing?: unknown }>
  if (!Array.isArray(rawKeyframes) || rawKeyframes.length < 2
    || rawKeyframes.some((keyframe) => typeof keyframe?.time_ms !== 'number' || typeof keyframe?.value !== 'number')) {
    return refuseShowCommand({
      code: 'invalid-argument',
      message: 'add_property_track: keyframes must be at least two { time_ms, value } entries.',
    })
  }
  const site = { sceneId, sceneStartMs: range.startMs, sceneEndMs: range.endMs }
  const keyframes: ShowPropertyAnimationKeyframe[] = []
  for (const keyframe of rawKeyframes) {
    if (keyframe.easing !== undefined && !(typeof keyframe.easing === 'string' ? ['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(keyframe.easing) : validateShowEasing(keyframe.easing).valid)) return refuseShowCommand({ code: 'invalid-argument', message: 'Invalid keyframe easing.' })
    const local = toSceneLocal(site, 'add_property_track', keyframe.time_ms)
    if (!local.ok) return local
    keyframes.push({
      id: idFactory('kf'),
      timeMs: local.localMs,
      value: keyframe.value,
      easing: normalizeShowEasing(keyframe.easing as ShowTransitionEasing | undefined),
    })
  }
  keyframes.sort((left, right) => left.timeMs - right.timeMs)
  if (keyframes.some((keyframe, index) => index > 0 && keyframe.timeMs === keyframes[index - 1].timeMs)) return refuseShowCommand({ code: 'duplicate-keyframe-time', message: 'Keyframe times must differ.' })
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
      details: { sceneId, keyframeIds: keyframes.map(keyframe => keyframe.id), ...describeShowPropertyTrack({ id: trackId, target, keyframes }, range.startMs) },
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
  addKeyframe,
  updateKeyframe,
  deleteKeyframe,
  deletePropertyTrack,
]

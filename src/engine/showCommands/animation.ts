// Property-animation command family: Scene-owned property tracks through the
// pure track functions. Commands speak global milliseconds; tracks store
// Scene-local times, so every command converts through the timeline's Scene
// ranges. Group-definition tracks are out of scope here; they edit through
// the Group animation functions.
import { newPersonalContentId } from '../personalContentMetadata'
import type {
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from '../personalContentRecords'
import { projectShowTimeline } from '../showModel'
import {
  addShowPropertyKeyframe,
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
  type ShowCommandRefusal,
} from './registry'
import { engineIdentityRefusal } from './support'

const TARGET_KINDS = new Set([
  'instance-time-scale', 'instance-control', 'placement-opacity',
  'placement-view', 'placement-transform', 'placement-viewport', 'placement-effect',
])

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
    target: { kind: 'json', description: 'The persisted ShowPropertyAnimationTarget record' },
    keyframes: { kind: 'json', description: 'Array of { time_ms (global), value, easing? }, at least two' },
    scene_id: { kind: 'string', optional: true, description: 'Owning Scene for instance targets (default: the first Scene using the instance)' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const composition = resolved.composition
    const target = input.target as ShowPropertyAnimationTarget
    if (typeof target !== 'object' || target === null || !TARGET_KINDS.has((target as { kind?: string }).kind ?? '')) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message:
          `add_property_track: target.kind must be one of ${[...TARGET_KINDS].join(', ')}.`,
      })
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
    const range = ranges.find((scene) => scene.sceneId === sceneId)!
    const rawKeyframes = input.keyframes as Array<{ time_ms: number; value: number; easing?: unknown }>
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
      const local = toSceneLocal(site, 'add_property_track', keyframe.time_ms)
      if (!local.ok) return local
      keyframes.push({
        id: newPersonalContentId(),
        timeMs: local.localMs,
        value: keyframe.value,
        easing: (keyframe.easing as ShowPropertyAnimationKeyframe['easing']) ?? { curve: 'linear' },
      })
    }
    const trackId = newPersonalContentId()
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
        description:
          `Property track added in ${sceneId} (${target.kind}) with ${keyframes.length} keyframes.`,
      }],
    }
  },
}

const addKeyframe: ShowCommandDescriptor = {
  name: 'add_keyframe',
  description: 'Add a keyframe to a property track at a global time inside the track\'s Scene.',
  touches: ['/composition/scenes/*/propertyTracks', '/updatedAt'],
  fields: {
    track_id: { kind: 'string', description: 'The property track' },
    time_ms: { kind: 'number', description: 'Global time; converted to the owning Scene\'s local time' },
    value: { kind: 'number', description: 'The keyframe value' },
    easing: { kind: 'json', optional: true, description: 'Structured easing (default linear)' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveTrack(record, input.track_id as string)
    if (!found.ok) return found
    const local = toSceneLocal(found.site, 'add_keyframe', input.time_ms as number)
    if (!local.ok) return local
    const keyframeId = newPersonalContentId()
    const result = addShowPropertyKeyframe(record, resolved.composition, found.site.sceneId, found.site.track.id, {
      id: keyframeId,
      timeMs: local.localMs,
      value: input.value as number,
      easing: (input.easing as ShowPropertyAnimationKeyframe['easing']) ?? { curve: 'linear' },
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
        targetId: keyframeId,
        description: `Keyframe added to ${found.site.track.id} at ${Math.round(input.time_ms as number)} ms.`,
      }],
    }
  },
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
    easing: { kind: 'json', optional: true, description: 'New structured easing' },
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
          ? { easing: input.easing as ShowPropertyAnimationKeyframe['easing'] }
          : {}),
      },
    )
    if (result === resolved.composition) {
      return engineIdentityRefusal(
        'update_keyframe',
        'The change may collide with another keyframe\'s time or fail validation.',
      )
    }
    return {
      ok: true,
      record: withComposition(record, result),
      changes: [{
        command: 'update_keyframe',
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

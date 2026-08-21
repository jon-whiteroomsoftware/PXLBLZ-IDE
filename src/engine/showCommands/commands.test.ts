import { describe, expect, it } from 'vitest'
import {
  boundaryFreeInstanceTrackedFixture,
  boundaryFreeTrackedFixture,
  showCommandFixture,
  singleClipCommandFixture,
  stampedCommandFixture,
  trackedCommandFixture,
} from '../../test/showCommandFixture'
import type { ShowRecord } from '../personalContentRecords'
import { showLoopDurationMs } from '../showModel'
import { projectShowSummary } from '../showSummaryProjection'
import { insertShowLayerTransition } from '../showLayerTransitionAuthoring'
import { projectShowLayoutIntervals } from '../showLayoutIntervals'
import { SHOW_COMMANDS, applyShowCommand, type ShowCommandChange } from './registry'

// Golden accepted case and refusal partitions per registry entry, plus the
// touch-path faithfulness sweep: every golden's actual changed paths must
// fall inside the entry's declared `touches`, and every declared pattern
// must be exercised by at least one golden.

interface AppliedRecord {
  command: string
  before: ShowRecord
  after: ShowRecord
}
const APPLIED: AppliedRecord[] = []

function applyOk(
  record: ShowRecord,
  command: string,
  input: Record<string, unknown> = {},
): { record: ShowRecord; changes: ShowCommandChange[] } {
  const outcome = applyShowCommand(record, command, input)
  expect(outcome.ok, `${command} refused: ${JSON.stringify(!outcome.ok && outcome.issues)}`).toBe(true)
  if (!outcome.ok) throw new Error('unreachable')
  expect(outcome.record).not.toBe(record)
  APPLIED.push({ command, before: record, after: outcome.record })
  return outcome
}

function applyRefused(
  record: ShowRecord,
  command: string,
  input: Record<string, unknown>,
  code: string,
) {
  const frozen = JSON.stringify(record)
  const outcome = applyShowCommand(record, command, input)
  expect(outcome.ok, `${command} unexpectedly accepted`).toBe(false)
  if (outcome.ok) throw new Error('unreachable')
  expect(outcome.issues[0].code, outcome.issues[0].message).toBe(code)
  expect(outcome.issues[0].message.length).toBeGreaterThan(10)
  expect(JSON.stringify(record)).toBe(frozen)
  return outcome.issues
}

function summaryClips(record: ShowRecord) {
  return projectShowSummary(record, record.composition!).zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
}

/**
 * A transition-connected chain whose last clip ends exactly at the Scene
 * boundary, with a Scene-2 clip on the far side of the boundary crossfade -
 * so shifting the chain earlier breaks the boundary junction and exercises
 * the Cut canonicalization of ShowRecord.transitions.
 */
function boundaryPinnedChain(): { record: ShowRecord; transitionId: string } {
  const adjacent = applyOk(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 14_000 })
  const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
    from_clip_id: 'clip-b',
    to_clip_id: 'clip-c',
    duration_ms: 1_000,
  })
  // Chain (clip-b, clip-c): slide it so clip-c ends at the boundary...
  const pinned = applyOk(inserted.record, 'move_connected_clip', { clip_id: 'clip-c', start_ms: 24_000 })
  // ...then add the far-side clip after the boundary crossfade window.
  const farSide = applyOk(pinned.record, 'add_clip', {
    zone_id: 'zone-1',
    start_ms: 32_000,
    duration_ms: 5_000,
    pattern_kind: 'stock',
    pattern_id: 'CometLoom',
  })
  expect(summaryClips(farSide.record).find((clip) => clip.clipId === 'clip-c')?.endMs).toBe(30_000)
  const junctions = projectShowSummary(farSide.record, farSide.record.composition!).zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.junctions))
  expect(junctions.some((junction) => junction.boundary)).toBe(true)
  return { record: farSide.record, transitionId: inserted.changes[0].targetId as string }
}

function effectsOf(record: ShowRecord, placementId: string) {
  for (const scene of record.composition?.scenes ?? []) {
    for (const zone of scene.zones) {
      const main = zone.main.find((candidate) => candidate.id === placementId)
      if (main) return main.effects ?? []
      for (const layer of zone.overlays) {
        const overlay = layer.placements.find((candidate) => candidate.id === placementId)
        if (overlay) return overlay.effects ?? []
      }
    }
  }
  return []
}

/** clip-a carrying one brightness Effect. */
function withEffect(): { record: ShowRecord; effectId: string } {
  const { record, changes } = applyOk(showCommandFixture(), 'add_clip_effect', {
    clip_id: 'clip-a',
    kind: 'brightness',
    parameters: { brightness: 0.4 },
  })
  return { record, effectId: changes[0].targetId as string }
}

/** A brightness track on clip-a with keyframes at global 0 and 8000 ms. */
function withTrack(): { record: ShowRecord; trackId: string } {
  const { record, changes } = applyOk(showCommandFixture(), 'add_property_track', {
    target: { kind: 'placement-view', placementId: 'clip-a', property: 'brightness' },
    keyframes: [
      { time_ms: 0, value: 1 },
      { time_ms: 8_000, value: 0.2 },
    ],
  })
  return { record, trackId: changes[0].targetId as string }
}

function record0Track(record: ShowRecord, trackId: string) {
  const track = record.composition?.scenes
    .flatMap((scene) => scene.propertyTracks ?? [])
    .find((candidate) => candidate.id === trackId)
  expect(track).toBeDefined()
  return track!
}

function trackTimes(record: ShowRecord, trackId: string): number[] {
  return record0Track(record, trackId).keyframes.map((keyframe) => keyframe.timeMs)
}

export const GOLDEN_RUNS: Record<string, () => void> = {
  add_clip: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'add_clip', {
      zone_id: 'zone-1',
      start_ms: 34_000,
      duration_ms: 5_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
    })
    const added = summaryClips(record).find((clip) => clip.startMs === 34_000)
    expect(added?.clipId).toBe(changes[0].targetId)
    expect(added?.durationMs).toBe(5_000)

    // At Show End with extend_show, the Show grows to fit.
    const extended = applyOk(record, 'add_clip', {
      zone_id: 'zone-1',
      start_ms: 62_000,
      duration_ms: 4_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
      extend_show: true,
    })
    expect(showLoopDurationMs(extended.record)).toBe(66_000)

    // An overlay layer accepts a clip by index.
    const overlay = applyOk(showCommandFixture(), 'add_clip', {
      zone_id: 'zone-1',
      start_ms: 10_000,
      duration_ms: 4_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
      overlay_layer_index: 0,
    })
    const overlayClip = summaryClips(overlay.record)
      .find((clip) => clip.kind === 'overlay' && clip.startMs === 10_000)
    expect(overlayClip?.layerId).toBe('overlay-1')

    // A cast change forfeits the deterministic-loop proof.
    const stamped = applyOk(stampedCommandFixture(), 'add_clip', {
      zone_id: 'zone-1',
      start_ms: 34_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
    })
    expect(stamped.record.composition?.executionModel).toBeUndefined()
  },
  move_clip: () => {
    const { record } = applyOk(showCommandFixture(), 'move_clip', {
      clip_id: 'clip-b',
      start_ms: 34_000,
    })
    const moved = summaryClips(record).find((clip) => clip.clipId === 'clip-b')
    expect(moved?.startMs).toBe(34_000)
    expect(moved?.sceneId).toBe('scene-2')

    // A tracked clip carries its property track with it (within its Scene).
    const tracked = applyOk(trackedCommandFixture(), 'move_clip', {
      clip_id: 'clip-b',
      start_ms: 13_000,
    })
    const trackTimes = tracked.record.composition?.scenes
      .find((scene) => scene.sceneId === 'scene-1')?.propertyTracks
      ?.find((track) => track.id === 'track-b')?.keyframes.map((keyframe) => keyframe.timeMs)
    expect(trackTimes).toEqual([13_000, 20_000])
  },
  resize_clip: () => {
    const { record } = applyOk(showCommandFixture(), 'resize_clip', {
      clip_id: 'clip-b',
      duration_ms: 9_000,
    })
    expect(summaryClips(record).find((clip) => clip.clipId === 'clip-b')?.durationMs).toBe(9_000)

    // A generous request clamps to the free time before the next clip.
    const clamped = applyOk(showCommandFixture(), 'resize_clip', {
      clip_id: 'clip-b',
      duration_ms: 20_000,
    })
    expect(clamped.changes[0].description).toContain('clamped')
    expect(summaryClips(clamped.record).find((clip) => clip.clipId === 'clip-b')?.durationMs).toBe(10_000)

    const overlay = applyOk(showCommandFixture(), 'resize_clip', {
      clip_id: 'clip-ov',
      duration_ms: 4_000,
    })
    expect(summaryClips(overlay.record).find((clip) => clip.clipId === 'clip-ov')?.durationMs).toBe(4_000)

    // Overlay layers join across Scenes by index: the clamp sees the next
    // Scene's overlay clip even though its Scene-local layer id differs.
    const base = boundaryFreeTrackedFixture()
    const crossScene = {
      ...base,
      composition: {
        ...base.composition!,
        scenes: base.composition!.scenes.map((scene) => scene.sceneId === 'scene-2'
          ? {
              ...scene,
              zones: scene.zones.map((zone) => ({
                ...zone,
                overlays: [{
                  id: 'overlay-2',
                  name: 'Overlay 2',
                  placements: [{
                    id: 'clip-ov2',
                    instanceId: 'instance-ov',
                    startMs: 6_000,
                    durationMs: 4_000,
                    opacity: 1,
                    view: { mirror: false, phase: 0, brightness: 1 },
                  }],
                }],
              })),
            }
          : scene),
      },
    }
    const crossClamped = applyOk(crossScene, 'resize_clip', { clip_id: 'clip-ov', duration_ms: 90_000 })
    expect(crossClamped.changes[0].description).toContain('clamped')
    expect(summaryClips(crossClamped.record).find((clip) => clip.clipId === 'clip-ov')?.durationMs)
      .toBe(34_000)

    // Growing a clip whose sole-use instance carries an instance track
    // across the Scene boundary splits that track segment per Scene.
    const grown = applyOk(boundaryFreeInstanceTrackedFixture(), 'resize_clip', {
      clip_id: 'clip-b',
      duration_ms: 20_000,
    })
    const grownClip = summaryClips(grown.record).find((clip) => clip.clipId === 'clip-b')
    expect(grownClip?.endMs).toBe(32_000)
    const scene2Tracks = grown.record.composition?.scenes
      .find((scene) => scene.sceneId === 'scene-2')?.propertyTracks ?? []
    expect(scene2Tracks.length).toBe(1)
  },
  split_clip: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'split_clip', {
      clip_id: 'clip-a',
      at_ms: 4_000,
    })
    const left = summaryClips(record).find((clip) => clip.clipId === 'clip-a')
    const right = summaryClips(record).find((clip) => clip.clipId === changes[0].details?.rightClipId)
    expect(left?.endMs).toBe(4_000)
    expect(right?.startMs).toBe(4_000)
    expect(right?.endMs).toBe(10_000)
    expect(right?.instanceId).toBe('instance-a')

    // Splitting a tracked clip leaves a track on each half.
    const tracked = applyOk(trackedCommandFixture(), 'split_clip', {
      clip_id: 'clip-b',
      at_ms: 16_000,
    })
    const scene1 = tracked.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    expect((scene1?.propertyTracks ?? []).filter((track) => (
      'placementId' in track.target
    )).length).toBeGreaterThanOrEqual(2)
  },
  duplicate_clip: () => {
    const independent = applyOk(showCommandFixture(), 'duplicate_clip', { clip_id: 'clip-ov' })
    const copy = summaryClips(independent.record)
      .find((clip) => clip.clipId === independent.changes[0].targetId)
    expect(copy?.startMs).toBe(8_000)
    expect(copy?.instanceId).not.toBe('instance-ov')

    const linked = applyOk(showCommandFixture(), 'duplicate_clip', { clip_id: 'clip-ov', linked: true })
    expect(summaryClips(linked.record).find((clip) => clip.clipId === linked.changes[0].targetId)?.instanceId)
      .toBe('instance-ov')

    // Duplicating a tracked clip clones its tracks; an independent copy of a
    // stamped Show forfeits the deterministic-loop proof.
    const base = boundaryFreeTrackedFixture()
    const tracked = applyOk({
      ...base,
      composition: { ...base.composition!, executionModel: 'deterministic-loop' as const },
    }, 'duplicate_clip', { clip_id: 'clip-b' })
    const scene1 = tracked.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    expect((scene1?.propertyTracks ?? []).length).toBeGreaterThan(3)
    expect(tracked.record.composition?.executionModel).toBeUndefined()
  },
  remove_clip: () => {
    const { record } = applyOk(showCommandFixture(), 'remove_clip', { clip_id: 'clip-b' })
    expect(summaryClips(record).some((clip) => clip.clipId === 'clip-b')).toBe(false)

    const overlay = applyOk(showCommandFixture(), 'remove_clip', { clip_id: 'clip-ov' })
    expect(summaryClips(overlay.record).some((clip) => clip.clipId === 'clip-ov')).toBe(false)

    // Removing a tracked clip removes its placement-owned tracks.
    const tracked = applyOk(trackedCommandFixture(), 'remove_clip', { clip_id: 'clip-b' })
    const scene1 = tracked.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    expect((scene1?.propertyTracks ?? []).some((track) => track.id === 'track-b')).toBe(false)

    // Removing a transition-connected clip deletes the transition too.
    const base = showCommandFixture()
    const adjacent = applyOk(base, 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const withTransition = insertShowLayerTransition(adjacent.record, adjacent.record.composition!, {
      id: 'lt-1',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'snapshot-live',
    })
    expect(withTransition).not.toBe(adjacent.record.composition)
    const connected = { ...adjacent.record, composition: withTransition }
    const removedConnected = applyOk(connected, 'remove_clip', { clip_id: 'clip-b' })
    expect(removedConnected.record.composition?.transitions ?? []).toEqual([])
  },
  make_clip_pattern_independent: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'make_clip_pattern_independent', {
      clip_id: 'clip-c',
    })
    const changed = summaryClips(record).find((clip) => clip.clipId === 'clip-c')
    expect(changed?.instanceId).toBe(changes[0].details?.newInstanceId)
    expect(summaryClips(record).find((clip) => clip.clipId === 'clip-a')?.instanceId).toBe('instance-a')

    // Instance-targeted tracks in the clip's Scenes clone onto the new instance.
    const tracked = applyOk(trackedCommandFixture(), 'make_clip_pattern_independent', {
      clip_id: 'clip-c',
    })
    const scene1 = tracked.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    const instanceTargets = (scene1?.propertyTracks ?? [])
      .filter((track) => track.target.kind === 'instance-time-scale')
      .map((track) => ('instanceId' in track.target ? track.target.instanceId : null))
    expect(instanceTargets.length).toBeGreaterThanOrEqual(2)

    const stamped = applyOk(stampedCommandFixture(), 'make_clip_pattern_independent', {
      clip_id: 'clip-c',
    })
    expect(stamped.record.composition?.executionModel).toBeUndefined()
  },
  rejoin_clip_pattern_instance: () => {
    const { record } = applyOk(showCommandFixture(), 'rejoin_clip_pattern_instance', {
      clip_id: 'clip-b',
      target_clip_id: 'clip-a',
    })
    expect(summaryClips(record).find((clip) => clip.clipId === 'clip-b')?.instanceId).toBe('instance-a')

    // Rejoining the sole user of an instance discards that instance, its
    // instance-targeted tracks, and any deterministic-loop proof.
    const tracked = applyOk({
      ...trackedCommandFixture(),
      composition: { ...trackedCommandFixture().composition!, executionModel: 'deterministic-loop' as const },
    }, 'rejoin_clip_pattern_instance', { clip_id: 'clip-b', target_clip_id: 'clip-a' })
    expect(tracked.record.composition?.patternInstances.some((instance) => instance.id === 'instance-b'))
      .toBe(false)
    const scene1 = tracked.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    expect((scene1?.propertyTracks ?? []).some((track) => track.id === 'track-inst-b')).toBe(false)
    expect(tracked.record.composition?.executionModel).toBeUndefined()
  },
  insert_time: () => {
    const base = showCommandFixture()
    const { record, changes } = applyOk(base, 'insert_time', { at_ms: 4_000, duration_ms: 3_000 })
    expect(showLoopDurationMs(record)).toBe(65_000)
    const left = summaryClips(record).find((clip) => clip.clipId === 'clip-a')
    expect(left?.endMs).toBe(4_000)
    const rightId = Object.values(
      (changes[0].details?.splitClipIdsBySourceId ?? {}) as Record<string, string>,
    )[0]
    expect(summaryClips(record).find((clip) => clip.clipId === rightId)?.startMs).toBe(7_000)
  },
  set_show_end: () => {
    const { record } = applyOk(showCommandFixture(), 'set_show_end', { end_ms: 70_000 })
    expect(showLoopDurationMs(record)).toBe(70_000)
  },
  add_marker: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'add_marker', {
      at_ms: 15_000,
      name: 'Chorus',
      color: '#ff8800',
    })
    expect(record.composition?.markers?.find((marker) => marker.id === changes[0].targetId))
      .toMatchObject({ timeMs: 15_000, name: 'Chorus', color: '#ff8800' })

    // The change list reports the clamped time the engine stores.
    const clamped = applyOk(showCommandFixture(), 'add_marker', { at_ms: -50 })
    expect(clamped.changes[0].description).toContain('at 0 ms')
    expect(clamped.record.composition?.markers?.some((marker) => marker.timeMs === 0)).toBe(true)
  },
  move_marker: () => {
    const { record } = applyOk(showCommandFixture(), 'move_marker', {
      marker_id: 'marker-1',
      at_ms: 20_000,
    })
    expect(record.composition?.markers?.[0].timeMs).toBe(20_000)
  },
  update_marker: () => {
    const { record } = applyOk(showCommandFixture(), 'update_marker', {
      marker_id: 'marker-1',
      name: 'Bridge',
    })
    expect(record.composition?.markers?.[0].name).toBe('Bridge')
  },
  remove_marker: () => {
    const { record } = applyOk(showCommandFixture(), 'remove_marker', { marker_id: 'marker-1' })
    expect(record.composition?.markers ?? []).toEqual([])
  },
  set_boundary_transition: () => {
    const { record } = applyOk(showCommandFixture(), 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'wipe',
      duration_ms: 1_500,
    })
    const transition = record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')
    expect(transition?.kind).toBe('wipe')
    expect(transition?.durationMs).toBe(1_500)

    // Setting cut removes the visual transition.
    const cut = applyOk(record, 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'cut',
    })
    expect(cut.record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')?.kind)
      .not.toBe('wipe')
  },
  set_boundary_transition_timing: () => {
    const { record } = applyOk(showCommandFixture(), 'set_boundary_transition_timing', {
      transition_id: 'transition-scene-1',
      duration_ms: 3_500,
    })
    expect(record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')?.durationMs)
      .toBe(3_500)
  },
  update_boundary_transition_parameter: () => {
    const wipe = applyOk(showCommandFixture(), 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'wipe',
    })
    const { record } = applyOk(wipe.record, 'update_boundary_transition_parameter', {
      transition_id: 'transition-scene-1',
      parameter: 'feather',
      value: 0.4,
    })
    const transition = record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')
    expect(transition && 'feather' in transition && transition.feather).toBe(0.4)
  },
  insert_layer_transition: () => {
    const adjacent = applyOk(trackedCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
      from_clip_id: 'clip-a',
      to_clip_id: 'clip-b',
      duration_ms: 1_000,
    })
    const transition = inserted.record.composition?.transitions
      ?.find((candidate) => candidate.id === inserted.changes[0].targetId)
    expect(transition?.kind).toBe('crossfade')
    expect(transition?.durationMs).toBe(1_000)
    expect(summaryClips(inserted.record).find((clip) => clip.clipId === 'clip-b')?.startMs).toBe(11_000)
  },
  resize_layer_transition: () => {
    const adjacent = applyOk(trackedCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
      from_clip_id: 'clip-a',
      to_clip_id: 'clip-b',
      duration_ms: 1_000,
    })
    const resized = applyOk(inserted.record, 'resize_layer_transition', {
      transition_id: inserted.changes[0].targetId as string,
      duration_ms: 2_000,
    })
    expect(resized.record.composition?.transitions?.[0].durationMs).toBe(2_000)
    expect(summaryClips(resized.record).find((clip) => clip.clipId === 'clip-b')?.startMs).toBe(12_000)

    // Shrinking pulls the chain off the Scene boundary; the broken boundary
    // transition canonicalizes to a Cut.
    const pinned = boundaryPinnedChain()
    const shrunk = applyOk(pinned.record, 'resize_layer_transition', {
      transition_id: pinned.transitionId,
      duration_ms: 500,
    })
    expect(shrunk.record.transitions?.some((candidate) => candidate.kind === 'crossfade')).toBe(false)
  },
  reset_layer_transition_to_cut: () => {
    const adjacent = applyOk(trackedCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
      from_clip_id: 'clip-a',
      to_clip_id: 'clip-b',
      duration_ms: 1_000,
    })
    const reset = applyOk(inserted.record, 'reset_layer_transition_to_cut', {
      transition_id: inserted.changes[0].targetId as string,
    })
    expect(reset.record.composition?.transitions ?? []).toEqual([])
    expect(summaryClips(reset.record).find((clip) => clip.clipId === 'clip-b')?.startMs).toBe(10_000)

    // Closing the transition pulls the chain off the Scene boundary; the
    // broken boundary transition canonicalizes to a Cut.
    const pinned = boundaryPinnedChain()
    const closed = applyOk(pinned.record, 'reset_layer_transition_to_cut', {
      transition_id: pinned.transitionId,
    })
    expect(closed.record.transitions?.some((candidate) => candidate.kind === 'crossfade')).toBe(false)
  },
  add_clip_effect: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'add_clip_effect', {
      clip_id: 'clip-a',
      kind: 'brightness',
      parameters: { brightness: 0.4 },
    })
    const effects = effectsOf(record, 'clip-a')
    expect(effects).toHaveLength(1)
    expect(effects[0].id).toBe(changes[0].targetId)
    expect('brightness' in effects[0] && effects[0].brightness).toBe(0.4)

    const overlay = applyOk(showCommandFixture(), 'add_clip_effect', { clip_id: 'clip-ov', kind: 'hue' })
    expect(effectsOf(overlay.record, 'clip-ov')).toHaveLength(1)
  },
  update_clip_effect: () => {
    const base = withEffect()
    const { record } = applyOk(base.record, 'update_clip_effect', {
      clip_id: 'clip-a',
      effect_id: base.effectId,
      parameter: 'brightness',
      value: 0.7,
    })
    const effect = effectsOf(record, 'clip-a')[0]
    expect('brightness' in effect && effect.brightness).toBe(0.7)
  },
  duplicate_clip_effect: () => {
    const base = withEffect()
    const { record, changes } = applyOk(base.record, 'duplicate_clip_effect', {
      clip_id: 'clip-a',
      effect_id: base.effectId,
    })
    expect(effectsOf(record, 'clip-a').map((effect) => effect.id))
      .toEqual([base.effectId, changes[0].targetId])
  },
  move_clip_effect: () => {
    const base = withEffect()
    const withHue = applyOk(base.record, 'add_clip_effect', { clip_id: 'clip-a', kind: 'hue' })
    const hueId = withHue.changes[0].targetId as string
    const { record } = applyOk(withHue.record, 'move_clip_effect', {
      clip_id: 'clip-a',
      effect_id: hueId,
      direction: 'earlier',
    })
    expect(effectsOf(record, 'clip-a').map((effect) => effect.id)).toEqual([hueId, base.effectId])
  },
  remove_clip_effect: () => {
    const base = withEffect()
    const { record } = applyOk(base.record, 'remove_clip_effect', {
      clip_id: 'clip-a',
      effect_id: base.effectId,
    })
    expect(effectsOf(record, 'clip-a')).toEqual([])
  },
  add_property_track: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'add_property_track', {
      target: { kind: 'placement-view', placementId: 'clip-a', property: 'brightness' },
      keyframes: [
        { time_ms: 0, value: 1 },
        { time_ms: 8_000, value: 0.2 },
      ],
    })
    const track = record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
      ?.propertyTracks?.find((candidate) => candidate.id === changes[0].targetId)
    expect(track?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, 8_000])

    // A Scene-2 target converts global times to that Scene's local time.
    const moved = applyOk(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 34_000 })
    const sceneTwo = applyOk(moved.record, 'add_property_track', {
      target: { kind: 'placement-view', placementId: 'clip-b', property: 'brightness' },
      keyframes: [
        { time_ms: 34_000, value: 1 },
        { time_ms: 40_000, value: 0.5 },
      ],
    })
    const track2 = sceneTwo.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-2')
      ?.propertyTracks?.find((candidate) => candidate.id === sceneTwo.changes[0].targetId)
    expect(track2?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([2_000, 8_000])
  },
  add_keyframe: () => {
    const base = withTrack()
    const { record } = applyOk(base.record, 'add_keyframe', {
      track_id: base.trackId,
      time_ms: 5_000,
      value: 0.6,
    })
    expect(trackTimes(record, base.trackId)).toEqual([0, 5_000, 8_000])
  },
  update_keyframe: () => {
    const base = withTrack()
    const track = record0Track(base.record, base.trackId)
    const { record } = applyOk(base.record, 'update_keyframe', {
      track_id: base.trackId,
      keyframe_id: track.keyframes[1].id,
      value: 0.4,
      time_ms: 7_000,
    })
    const updated = record0Track(record, base.trackId)
    expect(updated.keyframes[1]).toMatchObject({ timeMs: 7_000, value: 0.4 })
  },
  delete_keyframe: () => {
    const base = withTrack()
    const middle = applyOk(base.record, 'add_keyframe', { track_id: base.trackId, time_ms: 5_000, value: 0.6 })
    const { record } = applyOk(middle.record, 'delete_keyframe', {
      track_id: base.trackId,
      keyframe_id: middle.changes[0].targetId as string,
    })
    expect(trackTimes(record, base.trackId)).toEqual([0, 8_000])
  },
  delete_property_track: () => {
    const base = withTrack()
    const { record } = applyOk(base.record, 'delete_property_track', { track_id: base.trackId })
    expect(record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')?.propertyTracks ?? [])
      .toEqual([])
  },
  set_output_contract: () => {
    const { record } = applyOk(showCommandFixture(), 'set_output_contract', {
      kind: 'portable-2d',
      map_id: 'plane',
      pixel_count: 512,
    })
    expect(record.outputContract.kind).toBe('portable-2d')
    expect(record.outputContract.kind === 'portable-2d' && record.outputContract.referencePixelCount)
      .toBe(512)
    expect(record.stageMapId).toBe('plane')
  },
  set_output_trails: () => {
    const { record } = applyOk(showCommandFixture(), 'set_output_trails', {
      enabled: true,
      retention: 0.5,
    })
    expect(record.outputEffects).toEqual([{ id: 'trails', kind: 'trails', retention: 0.5 }])
    const off = applyOk(record, 'set_output_trails', { enabled: false })
    expect(off.record.outputEffects).toEqual([])
  },
  add_layout_interval: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'add_layout_interval', {
      layout_id: 'layout-1',
      duration_ms: 10_000,
    })
    expect(showLoopDurationMs(record)).toBe(72_000)
    const intervals = projectShowLayoutIntervals(record)
    expect(intervals[intervals.length - 1].id).toBe(changes[0].details?.intervalId)

    // Inserting at a clip boundary splits the held Scene, and the legacy
    // compatibility cells split with it.
    const inserted = applyOk(showCommandFixture(), 'add_layout_interval', {
      layout_id: 'layout-1',
      duration_ms: 5_000,
      at_ms: 10_000,
    })
    expect(projectShowLayoutIntervals(inserted.record).length).toBeGreaterThanOrEqual(2)
  },
  duplicate_layout_interval: () => {
    const { record } = applyOk(showCommandFixture(), 'duplicate_layout_interval', {
      interval_id: 'layout-occurrence-scene-1',
    })
    expect(projectShowLayoutIntervals(record)).toHaveLength(2)

    // Duplicating with content copies the occurrence's cells too.
    const withContent = applyOk(showCommandFixture(), 'duplicate_layout_interval', {
      interval_id: 'layout-occurrence-scene-1',
      with_content: true,
    })
    expect(withContent.record.cells.length).toBeGreaterThan(showCommandFixture().cells.length)
  },
  make_layout_interval_unique: () => {
    const appended = applyOk(showCommandFixture(), 'add_layout_interval', {
      layout_id: 'layout-1',
      duration_ms: 10_000,
    })
    const { record } = applyOk(appended.record, 'make_layout_interval_unique', {
      interval_id: appended.changes[0].details?.intervalId as string,
    })
    expect(record.routingLayouts).toHaveLength(2)

    // Making the content-bearing occurrence unique mints new Zones, and its
    // cells remap onto them.
    const contentUnique = applyOk(appended.record, 'make_layout_interval_unique', {
      interval_id: 'layout-occurrence-scene-1',
    })
    expect(contentUnique.record.zones.length).toBeGreaterThan(1)
  },
  move_connected_clip: () => {
    const adjacent = applyOk(trackedCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
      from_clip_id: 'clip-a',
      to_clip_id: 'clip-b',
      duration_ms: 1_000,
    })
    const moved = applyOk(inserted.record, 'move_connected_clip', {
      clip_id: 'clip-a',
      start_ms: 2_000,
    })
    expect(summaryClips(moved.record).find((clip) => clip.clipId === 'clip-a')?.startMs).toBe(2_000)
    expect(summaryClips(moved.record).find((clip) => clip.clipId === 'clip-b')?.startMs).toBe(13_000)
    expect(moved.record.composition?.transitions).toHaveLength(1)

    // Moving the chain off the Scene boundary canonicalizes the broken
    // boundary transition to a Cut through the Show-level wrapper.
    const pinned = boundaryPinnedChain()
    const pulled = applyOk(pinned.record, 'move_connected_clip', { clip_id: 'clip-b', start_ms: 11_000 })
    expect(pulled.record.transitions?.some((candidate) => candidate.kind === 'crossfade')).toBe(false)
  },
}

describe('Show command goldens (#885)', () => {
  it('every registered command has a golden accepted case', () => {
    const missing = SHOW_COMMANDS.map((command) => command.name)
      .filter((name) => !(name in GOLDEN_RUNS))
    expect(missing).toEqual([])
  })

  for (const [name, run] of Object.entries(GOLDEN_RUNS)) {
    it(`${name}: golden accepted case`, run)
  }
})

describe('Show command refusal partitions (#885)', () => {
  it('add_clip refuses occupied time, invalid time, and a Transition window with the plan reason', () => {
    const base = { pattern_kind: 'stock', pattern_id: 'CometLoom' }
    applyRefused(showCommandFixture(), 'add_clip', { ...base, zone_id: 'zone-1', start_ms: 5_000 }, 'occupied')
    applyRefused(showCommandFixture(), 'add_clip', { ...base, zone_id: 'zone-1', start_ms: 100_000 }, 'invalid-time')
    applyRefused(showCommandFixture(), 'add_clip', { ...base, zone_id: 'zone-1', start_ms: 30_500 }, 'transition')
    applyRefused(showCommandFixture(), 'add_clip', { ...base, zone_id: 'no-zone', start_ms: 1_000 }, 'missing-owner')
  })

  it('clip commands refuse an unknown clip with candidates', () => {
    const issues = applyRefused(showCommandFixture(), 'move_clip', { clip_id: 'nope', start_ms: 0 }, 'unknown-clip')
    expect(issues[0].candidates).toContain('clip-a')
    applyRefused(showCommandFixture(), 'resize_clip', { clip_id: 'nope', duration_ms: 1_000 }, 'unknown-clip')
    applyRefused(showCommandFixture(), 'remove_clip', { clip_id: 'nope' }, 'unknown-clip')
  })

  it('move_clip refuses an occupied destination as an engine refusal', () => {
    applyRefused(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 2_000 }, 'engine-refused')
  })

  it('split_clip refuses a point outside the clip', () => {
    applyRefused(showCommandFixture(), 'split_clip', { clip_id: 'clip-a', at_ms: 0 }, 'outside-clip')
    applyRefused(showCommandFixture(), 'split_clip', { clip_id: 'clip-a', at_ms: 11_000 }, 'outside-clip')
  })

  it('duplicate_clip refuses an occupied tail with the plan reason', () => {
    applyRefused(showCommandFixture(), 'duplicate_clip', { clip_id: 'clip-a' }, 'occupied')
  })

  it('remove_clip refuses the last clip of a Show', () => {
    applyRefused(singleClipCommandFixture(), 'remove_clip', { clip_id: 'clip-a' }, 'last-clip')
  })

  it('pattern-instance commands refuse already-independent and incompatible targets', () => {
    applyRefused(
      showCommandFixture(),
      'make_clip_pattern_independent',
      { clip_id: 'clip-b' },
      'already-independent',
    )
    applyRefused(
      showCommandFixture(),
      'rejoin_clip_pattern_instance',
      { clip_id: 'clip-b', target_clip_id: 'clip-ov' },
      'incompatible-target',
    )
    applyRefused(
      showCommandFixture(),
      'rejoin_clip_pattern_instance',
      { clip_id: 'clip-c', target_clip_id: 'clip-a' },
      'already-shared',
    )
  })

  it('insert_time refuses a Transition window and a non-positive duration', () => {
    applyRefused(showCommandFixture(), 'insert_time', { at_ms: 31_000, duration_ms: 1_000 }, 'transition')
    applyRefused(showCommandFixture(), 'insert_time', { at_ms: 1_000, duration_ms: 0 }, 'invalid-duration')
  })

  it('set_show_end refuses when nothing would change', () => {
    applyRefused(showCommandFixture(), 'set_show_end', { end_ms: 62_000 }, 'no-change')
  })

  it('marker commands refuse an unknown marker with candidates', () => {
    const issues = applyRefused(showCommandFixture(), 'move_marker', { marker_id: 'nope', at_ms: 0 }, 'unknown-marker')
    expect(issues[0].candidates).toEqual(['marker-1'])
    applyRefused(showCommandFixture(), 'update_marker', { marker_id: 'nope', name: 'X' }, 'unknown-marker')
    applyRefused(showCommandFixture(), 'remove_marker', { marker_id: 'nope' }, 'unknown-marker')
    applyRefused(showCommandFixture(), 'update_marker', { marker_id: 'marker-1' }, 'invalid-argument')
  })

  it('boundary transition commands refuse unknown ids, bad durations, and inapplicable parameters', () => {
    const issues = applyRefused(
      showCommandFixture(),
      'set_boundary_transition',
      { transition_id: 'nope', kind: 'wipe' },
      'unknown-transition',
    )
    expect(issues[0].candidates).toEqual(['transition-scene-1'])
    applyRefused(
      showCommandFixture(),
      'set_boundary_transition_timing',
      { transition_id: 'transition-scene-1', duration_ms: 0 },
      'invalid-duration',
    )
    applyRefused(
      showCommandFixture(),
      'set_boundary_transition_timing',
      { transition_id: 'transition-scene-1', duration_ms: 2_000 },
      'no-change',
    )
    applyRefused(
      showCommandFixture(),
      'update_boundary_transition_parameter',
      { transition_id: 'transition-scene-1', parameter: 'sparkles', value: 1 },
      'unknown-parameter',
    )
    // feather does not apply to a crossfade; normalization drops it.
    applyRefused(
      showCommandFixture(),
      'update_boundary_transition_parameter',
      { transition_id: 'transition-scene-1', parameter: 'feather', value: 0.4 },
      'unknown-parameter',
    )
  })

  it('a cut boundary requires an explicit duration and refuses retiming and bad enum values', () => {
    const cut = applyOk(showCommandFixture(), 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'cut',
    })
    applyRefused(
      cut.record,
      'set_boundary_transition',
      { transition_id: 'transition-scene-1', kind: 'wipe' },
      'invalid-duration',
    )
    applyRefused(
      cut.record,
      'set_boundary_transition_timing',
      { transition_id: 'transition-scene-1', duration_ms: 1_000 },
      'invalid-argument',
    )
    const restored = applyOk(cut.record, 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'crossfade',
      duration_ms: 1_500,
    })
    const stored = restored.record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')
    expect(stored?.kind).toBe('crossfade')
    expect(stored && 'crossfadePolicy' in stored && stored.crossfadePolicy).toBe('snapshot-live')
    applyRefused(
      showCommandFixture(),
      'update_boundary_transition_parameter',
      { transition_id: 'transition-scene-1', parameter: 'crossfadePolicy', value: 'typo' },
      'invalid-argument',
    )
    // An applicable parameter already at the requested value is a no-change,
    // not an inapplicable parameter.
    applyRefused(
      showCommandFixture(),
      'update_boundary_transition_parameter',
      { transition_id: 'transition-scene-1', parameter: 'crossfadePolicy', value: 'snapshot-live' },
      'no-change',
    )
    // So is re-selecting the current kind, and a request normalization
    // clamps back to the current value.
    applyRefused(
      showCommandFixture(),
      'set_boundary_transition',
      { transition_id: 'transition-scene-1', kind: 'crossfade' },
      'no-change',
    )
    const wiped = applyOk(showCommandFixture(), 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'wipe',
    })
    const feathered = applyOk(wiped.record, 'update_boundary_transition_parameter', {
      transition_id: 'transition-scene-1',
      parameter: 'feather',
      value: 1,
    })
    applyRefused(
      feathered.record,
      'update_boundary_transition_parameter',
      { transition_id: 'transition-scene-1', parameter: 'feather', value: 2 },
      'no-change',
    )
  })

  it('layer transition commands refuse unknown ids, non-touching clips, and excessive durations', () => {
    applyRefused(
      showCommandFixture(),
      'resize_layer_transition',
      { transition_id: 'nope', duration_ms: 500 },
      'unknown-transition',
    )
    applyRefused(
      showCommandFixture(),
      'reset_layer_transition_to_cut',
      { transition_id: 'nope' },
      'unknown-transition',
    )
    // clip-a and clip-b do not touch (12 s vs 10 s), so insertion refuses.
    applyRefused(
      showCommandFixture(),
      'insert_layer_transition',
      { from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 500 },
      'transition-refused',
    )
    const adjacent = applyOk(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    applyRefused(
      adjacent.record,
      'insert_layer_transition',
      { from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 999_999 },
      'invalid-duration',
    )
  })

  it('move_connected_clip refuses a colliding chain move', () => {
    const adjacent = applyOk(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
      from_clip_id: 'clip-a',
      to_clip_id: 'clip-b',
      duration_ms: 1_000,
    })
    applyRefused(
      inserted.record,
      'move_connected_clip',
      { clip_id: 'clip-a', start_ms: 5_000 },
      'engine-refused',
    )
    applyRefused(inserted.record, 'move_connected_clip', { clip_id: 'nope', start_ms: 0 }, 'unknown-clip')
  })

  it('effect commands refuse unknown effects, unknown parameters, no-changes, and stage edges', () => {
    const base = withEffect()
    const issues = applyRefused(
      base.record,
      'update_clip_effect',
      { clip_id: 'clip-a', effect_id: 'nope', parameter: 'brightness', value: 0.5 },
      'unknown-effect',
    )
    expect(issues[0].candidates).toEqual([base.effectId])
    applyRefused(
      base.record,
      'update_clip_effect',
      { clip_id: 'clip-a', effect_id: base.effectId, parameter: 'sparkle', value: 1 },
      'unknown-parameter',
    )
    applyRefused(
      base.record,
      'update_clip_effect',
      { clip_id: 'clip-a', effect_id: base.effectId, parameter: 'brightness', value: 0.4 },
      'no-change',
    )
    applyRefused(
      showCommandFixture(),
      'add_clip_effect',
      { clip_id: 'clip-a', kind: 'brightness', parameters: { sparkle: 1 } },
      'unknown-parameter',
    )
    applyRefused(
      base.record,
      'move_clip_effect',
      { clip_id: 'clip-a', effect_id: base.effectId, direction: 'earlier' },
      'no-change',
    )
    applyRefused(base.record, 'remove_clip_effect', { clip_id: 'nope', effect_id: base.effectId }, 'unknown-clip')
  })

  it('animation commands refuse unknown ids, out-of-Scene times, duplicate targets, and the keyframe floor', () => {
    applyRefused(
      showCommandFixture(),
      'add_keyframe',
      { track_id: 'nope', time_ms: 1_000, value: 1 },
      'unknown-track',
    )
    const base = withTrack()
    applyRefused(
      base.record,
      'add_keyframe',
      { track_id: base.trackId, time_ms: 45_000, value: 1 },
      'outside-scene',
    )
    applyRefused(
      base.record,
      'update_keyframe',
      { track_id: base.trackId, keyframe_id: 'nope', value: 1 },
      'unknown-keyframe',
    )
    const track = base.record.composition!.scenes
      .flatMap((scene) => scene.propertyTracks ?? [])
      .find((candidate) => candidate.id === base.trackId)!
    applyRefused(
      base.record,
      'update_keyframe',
      { track_id: base.trackId, keyframe_id: track.keyframes[0].id },
      'invalid-argument',
    )
    applyRefused(
      base.record,
      'delete_keyframe',
      { track_id: base.trackId, keyframe_id: track.keyframes[0].id },
      'minimum-keyframes',
    )
    // A second track on the same target refuses through the validator.
    applyRefused(
      base.record,
      'add_property_track',
      {
        target: { kind: 'placement-view', placementId: 'clip-a', property: 'brightness' },
        keyframes: [
          { time_ms: 0, value: 1 },
          { time_ms: 4_000, value: 0.5 },
        ],
      },
      'engine-refused',
    )
    applyRefused(
      showCommandFixture(),
      'add_property_track',
      { target: { kind: 'imaginary' }, keyframes: [{ time_ms: 0, value: 1 }, { time_ms: 1_000, value: 0 }] },
      'invalid-argument',
    )
  })

  it('structure commands refuse no-change contracts, unknown layouts and intervals, and window insertions', () => {
    const portable = applyOk(showCommandFixture(), 'set_output_contract', {
      kind: 'portable-2d',
      map_id: 'plane',
      pixel_count: 512,
    })
    applyRefused(
      portable.record,
      'set_output_contract',
      { kind: 'portable-2d', map_id: 'plane', pixel_count: 512 },
      'no-change',
    )
    applyRefused(showCommandFixture(), 'set_output_trails', { enabled: false }, 'no-change')
    applyRefused(
      showCommandFixture(),
      'add_layout_interval',
      { layout_id: 'nope', duration_ms: 5_000 },
      'unknown-layout',
    )
    // Inserting inside the boundary Transition window refuses via the engine.
    applyRefused(
      showCommandFixture(),
      'add_layout_interval',
      { layout_id: 'layout-1', duration_ms: 5_000, at_ms: 31_000 },
      'engine-refused',
    )
    applyRefused(showCommandFixture(), 'duplicate_layout_interval', { interval_id: 'nope' }, 'unknown-interval')
    applyRefused(showCommandFixture(), 'make_layout_interval_unique', { interval_id: 'nope' }, 'unknown-interval')
  })

  it('group children refuse the direct clip commands', () => {
    const record = showCommandFixture()
    const composition = record.composition!
    const grouped: ShowRecord = {
      ...record,
      composition: {
        ...composition,
        groupDefinitions: [{
          id: 'group-1',
          name: 'Pair',
          patternInstances: [{
            id: 'inst-g',
            pattern: { kind: 'stock', id: 'Rings' },
            patternName: 'Rings',
            time: { timeScale: 1, timeOffsetMs: 0 },
          }],
          placements: [{
            id: 'g-a',
            instanceId: 'inst-g',
            startMs: 0,
            durationMs: 3_000,
            opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
            layerOffset: 0,
          }],
        }],
        groupOccurrences: [{
          id: 'occ-1',
          definitionId: 'group-1',
          sceneId: 'scene-2',
          zoneId: 'zone-1',
          startMs: 5_000,
          baseLayer: 0,
          translationX: 0,
          translationY: 0,
        }],
      },
    }
    const issues = applyRefused(grouped, 'move_clip', { clip_id: 'occ-1:g-a', start_ms: 40_000 }, 'group')
    expect(issues[0].remedy).toContain('Group')
  })
})

// --- Touch-path faithfulness -----------------------------------------------

/** Leaf-level JSON-pointer paths where two values differ. */
function changedPaths(before: unknown, after: unknown, prefix = ''): string[] {
  if (before === after) return []
  const bothObjects =
    before !== null && after !== null &&
    typeof before === 'object' && typeof after === 'object' &&
    Array.isArray(before) === Array.isArray(after)
  if (!bothObjects) {
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix || '/']
  }
  const keys = new Set([
    ...Object.keys(before as Record<string, unknown>),
    ...Object.keys(after as Record<string, unknown>),
  ])
  const paths: string[] = []
  for (const key of keys) {
    paths.push(...changedPaths(
      (before as Record<string, unknown>)[key],
      (after as Record<string, unknown>)[key],
      `${prefix}/${key}`,
    ))
  }
  return paths
}

/** A path matches a pattern when one is a prefix of the other, '*' matching any segment. */
function pathMatches(path: string, pattern: string): boolean {
  const pathSegments = path.split('/').slice(1)
  const patternSegments = pattern.split('/').slice(1)
  const shared = Math.min(pathSegments.length, patternSegments.length)
  for (let index = 0; index < shared; index += 1) {
    const patternSegment = patternSegments[index]
    if (patternSegment !== '*' && patternSegment !== pathSegments[index]) return false
  }
  return true
}

describe('Show command touch-path faithfulness (#885)', () => {
  it('every declared touches pattern is exact against the golden fixtures', () => {
    APPLIED.length = 0
    for (const run of Object.values(GOLDEN_RUNS)) run()
    const IGNORED = ['/updatedAt']
    const violations: string[] = []
    for (const command of SHOW_COMMANDS) {
      const records = APPLIED.filter((record) => record.command === command.name)
      expect(records.length, `${command.name} has no recorded golden run`).toBeGreaterThan(0)
      const changed = new Set(
        records
          .flatMap((record) => changedPaths(record.before, record.after))
          .filter((path) => !IGNORED.some((ignored) => pathMatches(path, ignored))),
      )
      for (const path of changed) {
        if (!command.touches.some((pattern) => pathMatches(path, pattern))) {
          violations.push(`${command.name} changed undeclared path ${path}`)
        }
      }
      for (const pattern of command.touches.filter((candidate) => !IGNORED.includes(candidate))) {
        if (![...changed].some((path) => pathMatches(path, pattern))) {
          violations.push(`${command.name} declares ${pattern} but no golden fixture changes it`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

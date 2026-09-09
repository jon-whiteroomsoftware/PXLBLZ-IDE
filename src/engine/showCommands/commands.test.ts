import { showBoundaryCommandFixture, BOUNDARY_PARAMETER_CASES, withAllTransitionFields } from '@/test/showBoundaryCommandFixture'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import type { ShowCommandContext } from './registry'
import { showSplitClipFixture } from '../../test/showSplitClipFixture'
import { describe, expect, it } from 'vitest'
import {
  boundaryFreeInstanceTrackedFixture,
  boundaryFreeTrackedFixture,
  showCommandFixture,
  singleClipCommandFixture,
  stampedCommandFixture,
  trackedCommandFixture,
} from '../../test/showCommandFixture'
import { showOverlayLayerFixture } from '../../test/showOverlayLayerFixture'
import { validateShowComposition } from '../showCompositionModel'
import type { ShowRecord } from '../personalContentRecords'
import { showLoopDurationMs } from '../showModel'
import { projectShowSummary } from '../showSummaryProjection'
import { insertShowLayerTransition } from '../showLayerTransitionAuthoring'
import { projectShowLayoutIntervals } from '../showLayoutIntervals'
import { SHOW_COMMANDS, applyShowCommand, type ShowCommandChange } from './registry'
import { isDeepStrictEqual } from 'node:util'

// Golden accepted case and refusal partitions per registry entry, plus the
// touch-path faithfulness sweep: every golden's actual changed paths must
// fall inside the entry's declared `touches`, and every declared pattern
// must be exercised by at least one golden.

interface AppliedRecord {
  command: string
  input: Record<string, unknown>
  changes: ShowCommandChange[]
  before: ShowRecord
  after: ShowRecord
}
const APPLIED: AppliedRecord[] = []
const propertyContext: ShowCommandContext = { source: ref => ref.kind === 'stock' ? DEMOS[resolveStockPatternId(ref.id)] : undefined, libraries: LIBRARIES }


function applyOk(
  record: ShowRecord,
  command: string,
  input: Record<string, unknown> = {},
  context?: ShowCommandContext,
): { record: ShowRecord; changes: ShowCommandChange[] } {
  const outcome = applyShowCommand(record, command, input, context)
  expect(outcome.ok, `${command} refused: ${JSON.stringify(!outcome.ok && outcome.issues)}`).toBe(true)
  if (!outcome.ok) throw new Error('unreachable')
  expect(outcome.record).not.toBe(record)
  APPLIED.push({ command, input, changes: outcome.changes, before: record, after: outcome.record })
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
/**
 * Every field the visual-transition write set declares, authored onto one
 * record at once. Collapsing this transition to a Cut removes them all, so
 * a single removal golden exercises every declared leaf - kind-accurate
 * combinations are covered by the kind and parameter sweeps.
 */

function boundaryPinnedChain(): { record: ShowRecord; transitionId: string } {
  const adjacent = applyOk(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 14_000 })
  const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
    from_clip_id: 'clip-b',
    to_clip_id: 'clip-c',
    duration_ms: 1_000,
  })
  // Chain (clip-b, clip-c): slide it so clip-c ends at the boundary...
  const pinned = applyOk(inserted.record, 'move_clip', { clip_id: 'clip-c', start_ms: 24_000 })
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
  set_clip_view: () => {
    for (const clip_id of ['clip-a', 'clip-ov']) {
      const before = showOverlayLayerFixture()
      const { record } = applyOk(before, 'set_clip_view', { clip_id, mirror: true, phase: 0.25, brightness: 0.5 })
      const clips = record.composition!.scenes[0].zones[0]
      expect((clip_id === 'clip-a' ? clips.main[0] : clips.overlays[0].placements[0]).view).toEqual({ mirror: true, phase: 0.25, brightness: 0.5 })
      expect(record.composition!.patternInstances).toEqual(before.composition!.patternInstances)
    }
  },
  set_clip_control_target: () => {
    const before = showOverlayLayerFixture()
    const set = applyOk(before, 'set_clip_control_target', { clip_id: 'clip-a', export_name: 'sliderSpeed', value: 0.5 }, propertyContext).record
    expect(set.composition!.patternInstances[0].controlTargets).toEqual({ sliderSpeed: 0.5 })
    const tracked = structuredClone(set)
    tracked.composition!.scenes[0].propertyTracks!.push({ id: 'control-track', target: { kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderSpeed' }, keyframes: [{ id: 'control-key-1', timeMs: 0, value: 0.1, easing: { curve: 'linear' } }, { id: 'control-key-2', timeMs: 1000, value: 0.9, easing: { curve: 'linear' } }] })
    const cleared = applyOk(tracked, 'set_clip_control_target', { clip_id: 'clip-a', export_name: 'sliderSpeed', value: null }, propertyContext).record
    expect(cleared.composition!.patternInstances[0].controlTargets).toBeUndefined()
    expect(cleared.composition!.scenes[0].propertyTracks!.some(track => track.id === 'control-track')).toBe(false)
  },
  set_clip_time: () => {
    const before = showOverlayLayerFixture()
    const { record } = applyOk(before, 'set_clip_time', { clip_id: 'clip-a', time_scale: 0.5, time_offset_ms: 200 })
    expect(record.composition!.patternInstances[0].time).toEqual({ timeScale: 0.5, timeOffsetMs: 200 })
    expect(record.composition!.scenes).toEqual(before.composition!.scenes)
  },
  set_clip_evaluation: () => {
    const { record } = applyOk(showOverlayLayerFixture(), 'set_clip_evaluation', { clip_id: 'clip-a', policy: 'rolling-refresh' })
    expect(record.composition!.patternInstances[0].evaluationPolicy).toBe('rolling-refresh')
  },
  add_overlay_layer: () => {
    for (const sparse of [false, true]) {
      const before = showOverlayLayerFixture()
      if (sparse) before.composition!.scenes[1].zones[0].overlays = []
      const original = structuredClone(before)
      const { record, changes } = applyOk(before, 'add_overlay_layer', { zone_id: 'zone-1' })
      const ids = changes[0].details?.layerIdsBySceneId as Record<string, string>
      expect(Object.keys(ids)).toEqual(['scene-1', 'scene-2'])
      expect(new Set(Object.values(ids)).size).toBe(2)
      for (const id of Object.values(ids)) {
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
        expect(JSON.stringify(original)).not.toContain(id)
      }
      const expected = structuredClone(original)
      if (sparse) expected.composition!.scenes[1].zones[0].overlays = [
        { id: 'scene-2:zone-1:group-layer:1', name: 'Layer 1', placements: [] },
      ]
      expected.composition!.scenes[0].zones[0].overlays.unshift({ id: ids['scene-1'], name: 'Layer 3', placements: [] })
      expected.composition!.scenes[1].zones[0].overlays.unshift({ id: ids['scene-2'], name: 'Layer 3', placements: [] })
      expect(record).toEqual({ ...expected, updatedAt: record.updatedAt })
      expect(record.updatedAt).toBeGreaterThan(before.updatedAt)
      expect(before).toEqual(original)
      expect(validateShowComposition(record, record.composition!)).toEqual([])
    }
  },
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
    const adjacent = applyOk(trackedCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 1_000,
    })
    const movedChain = applyOk(inserted.record, 'move_clip', { clip_id: 'clip-a', start_ms: 2_000 })
    expect(summaryClips(movedChain.record).find((clip) => clip.clipId === 'clip-a')?.startMs).toBe(2_000)
    expect(summaryClips(movedChain.record).find((clip) => clip.clipId === 'clip-b')?.startMs).toBe(13_000)
    expect(movedChain.record.composition?.transitions).toHaveLength(1)
    const pinned = boundaryPinnedChain()
    applyRefused(withAllTransitionFields(pinned.record), 'move_clip', { clip_id: 'clip-b', start_ms: 11_000 }, 'unsupported-topology')
    const crossing = showCommandFixture()
    crossing.transitions = []
    const crossingComposition = crossing.composition!
    const crossingZone = crossingComposition.scenes[0].zones[0]
    crossingZone.main = [
      { ...crossingZone.main[0], id: 'cross-a', startMs: 24_000, durationMs: 2_000 },
      { ...crossingZone.main[0], id: 'cross-b', startMs: 27_000, durationMs: 2_000 },
    ]
    for (const scene of crossingComposition.scenes.slice(1)) for (const zone of scene.zones) zone.main = []
    crossingComposition.transitions = [{ id: 'cross-ab', fromPlacementId: 'cross-a', toPlacementId: 'cross-b', kind: 'crossfade', durationMs: 1_000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
    const crossed = applyOk(crossing, 'move_clip', { clip_id: 'cross-a', start_ms: 29_000 })
    expect(crossed.record.composition?.transitions?.[0]).toMatchObject({ id: 'cross-ab', fromPlacementId: 'cross-a--span-scene-2', toPlacementId: 'cross-b', durationMs: 1_000 })
  },
  resize_clip: () => {
    const { record } = applyOk(showCommandFixture(), 'resize_clip', {
      clip_id: 'clip-b',
      duration_ms: 9_000,
    })
    expect(summaryClips(record).find((clip) => clip.clipId === 'clip-b')?.durationMs).toBe(9_000)

    // Exact resize refuses a generous request instead of silently clamping.
    applyRefused(showCommandFixture(), 'resize_clip', { clip_id: 'clip-b', duration_ms: 20_000 }, 'no-space')
    const exact = applyOk(showCommandFixture(), 'resize_clip', { clip_id: 'clip-b', duration_ms: 10_000 })
    expect(summaryClips(exact.record).find((clip) => clip.clipId === 'clip-b')?.durationMs).toBe(10_000)

    const overlay = applyOk(showCommandFixture(), 'resize_clip', {
      clip_id: 'clip-ov',
      duration_ms: 4_000,
    })
    expect(summaryClips(overlay.record).find((clip) => clip.clipId === 'clip-ov')?.durationMs).toBe(4_000)

    // Overlay layers join across Scenes by index; Scene-local ids differ.
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
    applyRefused(crossScene, 'resize_clip', { clip_id: 'clip-ov', duration_ms: 90_000 }, 'no-space')
    const crossExact = applyOk(crossScene, 'resize_clip', { clip_id: 'clip-ov', duration_ms: 34_000 })
    expect(summaryClips(crossExact.record).find((clip) => clip.clipId === 'clip-ov')?.durationMs).toBe(34_000)

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
    const adjacent = applyOk(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const connectedComposition = insertShowLayerTransition(adjacent.record, adjacent.record.composition!, {
      id: 'resize-transition', fromPlacementId: 'clip-a', toPlacementId: 'clip-b', kind: 'crossfade',
      durationMs: 1000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    })
    const connected = { ...adjacent.record, composition: connectedComposition }
    const clip = summaryClips(connected).find(clip => clip.clipId === 'clip-b')!
    const leading = applyOk(connected, 'resize_clip', { clip_id: 'clip-b', start_ms: clip.startMs + 500, end_ms: clip.endMs })
    expect(leading.changes[0].details?.transitionChanges).toEqual([{ transitionId: 'resize-transition', previousDurationMs: 1000, durationMs: 1500 }])
  },
  split_clip: () => {
    const connected = applyOk(showSplitClipFixture(), 'split_clip', { clip_id: 'clip-b', at_ms: 16000 })
    expect(connected.changes[0].details?.transitionChanges).toEqual([{ transitionId: 'outgoing', fromPlacementId: `${connected.changes[0].details?.rightClipId}--span-scene-2`, toPlacementId: 'clip-c' }])
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
    const stamped = applyOk(stampedCommandFixture(), 'remove_clip', { clip_id: 'clip-b' })
    expect(stamped.record.composition!.executionModel).toBeUndefined()

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

    applyRefused(showCommandFixture(), 'add_marker', { at_ms: -50 }, 'invalid-argument')
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
    const custom = showCommandFixture()
    custom.transitions[0].easing = { curve: 'sine', direction: 'in' }
    const explicit = applyOk(custom, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'wipe', variant: 'linear' })
    expect(explicit.record.transitions[0].easing).toStrictEqual({ curve: 'linear' })
    const { record } = applyOk(showCommandFixture(), 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'wipe',
      duration_ms: 1_500,
    })
    const transition = record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')
    expect(transition?.kind).toBe('wipe')
    expect(transition?.durationMs).toBe(1_500)

    // Every kind stores with its parameter defaults filled.
    let swept = showCommandFixture()
    for (const kind of ['wipe', 'fade-color', 'dither', 'portal', 'motion', 'crossfade'] as const) {
      swept = applyOk(swept, 'set_boundary_transition', {
        transition_id: 'transition-scene-1',
        kind,
      }).record
      expect(swept.transitions?.find((candidate) => candidate.id === 'transition-scene-1')?.kind)
        .toBe(kind)
    }

    // Setting cut removes the visual transition.
    const cut = applyOk(record, 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'cut',
    })
    expect(cut.record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')?.kind)
      .not.toBe('wipe')

    // Collapsing to a cut removes authored property ramps too.
    const rampBase = showCommandFixture()
    const withRamp = {
      ...rampBase,
      transitions: rampBase.transitions?.map((candidate) => candidate.id === 'transition-scene-1'
        ? {
            ...candidate,
            propertyTransitions: { brightness: { durationMs: 500, easing: { curve: 'linear' as const } } },
          }
        : candidate),
    } as ShowRecord
    const rampCut = applyOk(withRamp, 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'cut',
    })
    expect(rampCut.record.transitions?.find((candidate) => candidate.id === 'transition-scene-1'))
      .not.toHaveProperty('propertyTransitions')

    // Collapsing a fully-authored transition removes every parameter field.
    const allCut = applyOk(withAllTransitionFields(showCommandFixture()), 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'cut',
    })
    const cutStored = allCut.record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')
    expect(cutStored && 'feather' in cutStored).toBe(false)

    // Kind switches remove the previous kind's stale parameters wholesale.
    const removalSetups: Array<{ kind: string; sets: Array<[string, unknown]>; next: string }> = [
      { kind: 'wipe', sets: [['wipeVariant', 'blinds'], ['count', 5], ['orientation', 'horizontal']], next: 'fade-color' },
      { kind: 'wipe', sets: [['wipeVariant', 'barn-doors'], ['wipeMode', 'center-in']], next: 'crossfade' },
      { kind: 'dither', sets: [['dissolveVariant', 'soft-threshold'], ['softness', 0.3]], next: 'motion' },
    ]
    for (const setup of removalSetups) {
      let staged = applyOk(showCommandFixture(), 'set_boundary_transition', {
        transition_id: 'transition-scene-1',
        kind: setup.kind,
      }).record
      for (const [parameter, value] of setup.sets) {
        staged = applyOk(staged, 'update_boundary_transition_parameter', {
          transition_id: 'transition-scene-1',
          parameter,
          value,
        }).record
      }
      const switched = applyOk(staged, 'set_boundary_transition', {
        transition_id: 'transition-scene-1',
        kind: setup.next,
      })
      expect(switched.record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')?.kind)
        .toBe(setup.next)
    }
  },
  set_boundary_transition_timing: () => {
    const { record } = applyOk(showCommandFixture(), 'set_boundary_transition_timing', {
      transition_id: 'transition-scene-1',
      duration_ms: 3_500,
    })
    expect(record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')?.durationMs)
      .toBe(3_500)

    // Retiming clamps authored property ramps to the new duration.
    const base = showCommandFixture()
    const withRamp = {
      ...base,
      transitions: base.transitions?.map((candidate) => candidate.id === 'transition-scene-1'
        ? {
            ...candidate,
            propertyTransitions: { brightness: { durationMs: 1_500, easing: { curve: 'linear' as const } } },
          }
        : candidate),
    } as ShowRecord
    const retimed = applyOk(withRamp, 'set_boundary_transition_timing', {
      transition_id: 'transition-scene-1',
      duration_ms: 1_000,
    })
    const stored = retimed.record.transitions?.find((candidate) => candidate.id === 'transition-scene-1')
    expect(stored && 'propertyTransitions' in stored
      && (stored.propertyTransitions as { brightness?: { durationMs: number } }).brightness?.durationMs)
      .toBe(1_000)
    const eased = applyOk(record, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', easing: 'ease-in' })
    expect(eased.record.transitions[0].easing).toStrictEqual({ curve: 'quadratic', direction: 'in' })
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

    // A representative parameter per kind stores through the same command.
    const reset = applyOk(withAllTransitionFields(showCommandFixture()), 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'durationMs', value: 0 })
    expect(reset.record.transitions[0].kind).toBe('cut')
    const sweep = BOUNDARY_PARAMETER_CASES
    const eased = applyOk(showCommandFixture(), 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'easing', value: 'sine-in' })
    expect(eased.record.transitions[0].easing).toStrictEqual({ curve: 'sine', direction: 'in' })
    let swept = showCommandFixture()
    for (const step of sweep) {
      swept = applyOk(swept, 'set_boundary_transition', {
        transition_id: 'transition-scene-1',
        kind: step.kind,
      }).record
      for (const [parameter, value] of step.sets) {
        const outcome = applyShowCommand(swept, 'update_boundary_transition_parameter', {
          transition_id: 'transition-scene-1',
          parameter,
          value,
        })
        if (outcome.ok) {
          APPLIED.push({ command: 'update_boundary_transition_parameter', input: { transition_id: 'transition-scene-1', parameter, value }, changes: outcome.changes, before: swept, after: outcome.record })
          swept = outcome.record
          const stored = swept.transitions?.find((candidate) => candidate.id === 'transition-scene-1') as
            | Record<string, unknown>
            | undefined
          expect(stored?.[parameter]).toEqual(value)
        }
      }
    }
  },
  set_boundary_layout: () => {
    const changed = applyOk(showBoundaryCommandFixture(), 'set_boundary_layout', { after_clip_id: 'clip-c', layout_id: 'layout-2' })
    expect(changed.record.transitions.find(item => item.kind === 'routing')?.layoutId).toBe('layout-2')
    const cleared = applyOk(changed.record, 'set_boundary_layout', { transition_id: 'transition-scene-1', layout_id: null })
    expect(cleared.record.transitions.some(item => item.kind === 'routing')).toBe(false)
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
    // transition canonicalizes to a Cut, whatever it carried.
    const pinned = boundaryPinnedChain()
    const shrunk = applyOk(withAllTransitionFields(pinned.record), 'resize_layer_transition', {
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
    // broken boundary transition canonicalizes to a Cut, whatever it carried.
    const pinned = boundaryPinnedChain()
    const closed = applyOk(withAllTransitionFields(pinned.record), 'reset_layer_transition_to_cut', {
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
  rename_show: () => {
    const { record } = applyOk(showCommandFixture(), 'rename_show', { name: '  Night Set  ' })
    expect(record.name).toBe('Night Set')
  },
  set_target_controller_profile: () => {
    const { record } = applyOk(showCommandFixture(), 'set_target_controller_profile', {
      profile_id: 'profile-pi',
    })
    expect(record.targetControllerProfileId).toBe('profile-pi')
    const cleared = applyOk(record, 'set_target_controller_profile', { profile_id: null })
    expect('targetControllerProfileId' in cleared.record).toBe(false)
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

    // Inserting at time zero with a different layout reorders the layouts so
    // the selected one leads the Show.
    const appended = applyOk(showCommandFixture(), 'add_layout_interval', {
      layout_id: 'layout-1',
      duration_ms: 10_000,
    })
    const unique = applyOk(appended.record, 'make_layout_interval_unique', {
      interval_id: appended.changes[0].details?.intervalId as string,
    })
    const secondLayoutId = unique.record.routingLayouts[1].id
    const leading = applyOk(unique.record, 'add_layout_interval', {
      layout_id: secondLayoutId,
      duration_ms: 5_000,
      at_ms: 0,
    })
    expect(leading.record.routingLayouts[0].id).toBe(secondLayoutId)
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
    applyRefused(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 2_000 }, 'occupied')
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
    { const before = showCommandFixture(); expect(applyShowCommand(before, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', duration_ms: 2_000 })).toStrictEqual({ ok: true, record: before, changes: [] }) }
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
    { const before = showCommandFixture(); expect(applyShowCommand(before, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'crossfadePolicy', value: 'snapshot-live' })).toStrictEqual({ ok: true, record: before, changes: [] }) }
    // So is re-selecting the current kind, and a request normalization
    // clamps back to the current value.
    { const before = showCommandFixture(); expect(applyShowCommand(before, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'crossfade' })).toStrictEqual({ ok: true, record: before, changes: [] }) }
    const wiped = applyOk(showCommandFixture(), 'set_boundary_transition', {
      transition_id: 'transition-scene-1',
      kind: 'wipe',
    })
    const feathered = applyOk(wiped.record, 'update_boundary_transition_parameter', {
      transition_id: 'transition-scene-1',
      parameter: 'feather',
      value: 1,
    })
    { const before = feathered.record; expect(applyShowCommand(before, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'feather', value: 2 })).toStrictEqual({ ok: true, record: before, changes: [] }) }
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

  it('move_clip refuses a colliding chain move', () => {
    const adjacent = applyOk(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 10_000 })
    const inserted = applyOk(adjacent.record, 'insert_layer_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 1_000,
    })
    applyRefused(inserted.record, 'move_clip', { clip_id: 'clip-a', start_ms: 5_000 }, 'occupied')
    applyRefused(inserted.record, 'move_clip', { clip_id: 'nope', start_ms: 0 }, 'unknown-clip')
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
    applyRefused(showCommandFixture(), 'rename_show', { name: '   ' }, 'invalid-argument')
    applyRefused(showCommandFixture(), 'rename_show', { name: 'Command fixture' }, 'no-change')
    applyRefused(showCommandFixture(), 'set_target_controller_profile', { profile_id: null }, 'no-change')
    applyRefused(showCommandFixture(), 'set_target_controller_profile', { profile_id: '   ' }, 'invalid-argument')
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
    const issues = applyRefused(grouped, 'move_clip', { clip_id: 'occ-1:g-a', start_ms: 40_000 }, 'unsupported-topology')
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

/**
 * A declared pattern matches a changed path only when it generalizes it:
 * shallower or equal depth, '*' matching any segment, literals matching
 * exactly. A pattern deeper than the changed node never matches, so a
 * declaration cannot hide behind a narrower claim than the write.
 */
function pathMatches(path: string, pattern: string): boolean {
  const pathSegments = path.split('/').slice(1)
  const patternSegments = pattern.split('/').slice(1)
  if (patternSegments.length > pathSegments.length) return false
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index]
    if (patternSegment === '*') continue
    if (patternSegment !== pathSegments[index]) return false
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

// Entity-owned fields exclude nested entities; their membership and order are
// checked independently. Scene/Zone references stabilize paths without granting
// permission to change the referenced entity. The Show envelope is not an entity.
type EntityObject = Record<string, unknown>
const entityCollections = new Set(['scenes', 'zones', 'main', 'overlays', 'placements', 'patternInstances', 'propertyTracks', 'keyframes', 'markers', 'transitions', 'effects', 'cells', 'routingLayouts', 'groupDefinitions', 'groupOccurrences', 'outputEffects'])
function isObject(value: unknown): value is EntityObject { return !!value && typeof value === 'object' && !Array.isArray(value) }
function entityInventory(record: ShowRecord) {
  const entities = new Map<string, { id: string; own: unknown }>()
  const orders = new Map<string, string[]>()
  function own(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => own(item))
    if (!isObject(value)) return value
    return Object.fromEntries(Object.entries(value).flatMap(([name, child]) => {
      if (isObject(child) && typeof child.id === 'string') return [[name, { id: child.id }]]
      if (Array.isArray(child) && entityCollections.has(name) && child.every(item => isObject(item) && typeof item.id === 'string')) return []
      return [[name, own(child)]]
    }))
  }
  function visit(value: unknown, path: string) {
    if (Array.isArray(value)) {
      const ids = value.flatMap(item => isObject(item) && typeof item.id === 'string' ? [item.id] : [])
      if (ids.length) orders.set(path, ids)
      value.forEach((item, index) => {
        const identity = isObject(item) ? item.id ?? item.sceneId ?? item.zoneId ?? index : index
        visit(item, `${path}/${identity}`)
      })
    } else if (isObject(value)) {
      if (path && typeof value.id === 'string') entities.set(path, { id: value.id, own: own(value) })
      for (const [key, child] of Object.entries(value)) visit(child, `${path}/${key}`)
    }
  }
  visit(record, '')
  return { entities, orders }
}

/** Semantic permission comes from request identities, receipts and the preimage,
 * never from observed differences or broad descriptor touch paths. */
function permittedEntityIds({ command, input, changes, before }: AppliedRecord): Set<string> {
  const ids = new Set<string>()
  const add = (value: unknown) => { if (typeof value === 'string') ids.add(value) }
  for (const key of ['clip_id', 'marker_id', 'effect_id', 'keyframe_id', 'transition_id']) add(input[key])
  for (const change of changes) {
    add(change.targetId)
    for (const key of ['leftClipId', 'rightClipId', 'newInstanceId', 'instanceId', 'intervalId']) add(change.details?.[key])
    for (const key of ['movedClipIds', 'changedClipIds']) for (const id of (change.details?.[key] as string[] | undefined) ?? []) add(id)
    for (const item of (change.details?.transitionChanges as { transitionId: string }[] | undefined) ?? []) add(item.transitionId)
  }
  if (command === 'set_boundary_layout') {
    const afterSceneId = changes[0]?.details?.afterSceneId
    for (const transition of before.transitions) if (transition.kind === 'routing' && transition.afterSceneId === afterSceneId) add(transition.id)
  }
  const composition = before.composition!
  const placements = composition.scenes.flatMap(scene => scene.zones.flatMap(zone => [
    ...zone.main.map(placement => ({ placement, sceneId: scene.sceneId })),
    ...zone.overlays.flatMap(layer => layer.placements.map(placement => ({ placement, sceneId: scene.sceneId }))),
  ]))
  const clipRoots = new Set<string>()
  if (['move_clip', 'resize_clip', 'split_clip', 'remove_clip', 'make_clip_pattern_independent', 'rejoin_clip_pattern_instance'].includes(command)) {
    if (typeof input.clip_id === 'string') clipRoots.add(input.clip_id)
    for (const id of ids) if (placements.some(({ placement }) => (placement.logicalClipId ?? placement.id) === id)) clipRoots.add(id)
  }
  if (['insert_layer_transition', 'resize_layer_transition', 'reset_layer_transition_to_cut'].includes(command)) {
    const target = composition.transitions?.find(item => item.id === input.transition_id)
    const start = command === 'insert_layer_transition' ? input.to_clip_id : target?.toPlacementId
    if (typeof start === 'string') clipRoots.add(start)
    let count = -1
    while (count !== clipRoots.size) {
      count = clipRoots.size
      for (const transition of composition.transitions ?? []) if (clipRoots.has(transition.fromPlacementId)) clipRoots.add(transition.toPlacementId)
    }
  }
  const selected = placements.filter(({ placement }) => clipRoots.has(placement.logicalClipId ?? placement.id))
  const affectedInstances = new Set<string>()
  for (const { placement } of selected) {
    add(placement.id)
    const soleUser = placements.every(other => other.placement.instanceId !== placement.instanceId || clipRoots.has(other.placement.logicalClipId ?? other.placement.id))
    if (soleUser && ['remove_clip', 'rejoin_clip_pattern_instance', 'move_clip', 'resize_clip', 'insert_layer_transition', 'resize_layer_transition', 'reset_layer_transition_to_cut'].includes(command)) affectedInstances.add(placement.instanceId)
  }
  if (['remove_clip', 'rejoin_clip_pattern_instance'].includes(command)) for (const id of affectedInstances) add(id)
  for (const transition of composition.transitions ?? []) {
    if (selected.some(({ placement }) => placement.id === transition.fromPlacementId || placement.id === transition.toPlacementId)) add(transition.id)
  }
  for (const scene of composition.scenes) for (const track of scene.propertyTracks ?? []) {
    const target = track.target
    const placementOwned = 'placementId' in target && selected.some(({ placement }) => placement.id === target.placementId)
    const instanceOwned = 'instanceId' in track.target && affectedInstances.has(track.target.instanceId)
    if (placementOwned || instanceOwned || (command === 'delete_property_track' && track.id === input.track_id)) {
      add(track.id)
      for (const keyframe of track.keyframes) add(keyframe.id)
    }
  }
  if (command === 'set_clip_control_target' && input.value === null) {
    const instanceId = placements.find(item => item.placement.id === input.clip_id)?.placement.instanceId
    for (const scene of composition.scenes) for (const track of scene.propertyTracks ?? []) {
      if (track.target.kind === 'instance-control' && track.target.instanceId === instanceId && track.target.exportName === input.export_name) {
        add(track.id)
        for (const keyframe of track.keyframes) add(keyframe.id)
      }
    }
  }
  // Boundary canonicalization is part of the existing Layer-transition owner.
  if (['insert_layer_transition', 'resize_layer_transition', 'reset_layer_transition_to_cut'].includes(command)) {
    for (const transition of before.transitions) if (selected.some(item => item.sceneId === transition.afterSceneId)) add(transition.id)
  }
  if (command === 'set_show_end' || (command === 'add_clip' && input.extend_show)) add(before.scenes[before.scenes.length - 1]?.id)
  if (command === 'insert_time') {
    const atMs = input.at_ms as number
    const ranges = projectShowSummary(before, composition).scenes
    for (const range of ranges) {
      if (range.startMs <= atMs && range.endMs >= atMs) add(range.sceneId)
      for (const item of placements.filter(item => item.sceneId === range.sceneId)) if (range.startMs + item.placement.startMs + item.placement.durationMs > atMs) add(item.placement.id)
      for (const track of composition.scenes.find(scene => scene.sceneId === range.sceneId)?.propertyTracks ?? []) {
        if (track.keyframes.some(frame => range.startMs + frame.timeMs >= atMs)) { add(track.id); for (const frame of track.keyframes) add(frame.id) }
      }
    }
    for (const marker of composition.markers ?? []) if (marker.timeMs >= atMs) add(marker.id)
  }
  // Layout occurrences own the Scenes/cells they split, remap or duplicate.
  if (['add_layout_interval', 'duplicate_layout_interval', 'make_layout_interval_unique'].includes(command)) {
    const intervals = projectShowLayoutIntervals(before)
    const interval = intervals.find(item => item.id === input.interval_id)
    const atMs = command === 'add_layout_interval' ? (input.at_ms as number | undefined) ?? showLoopDurationMs(before) : interval?.startMs
    const ownedScenes = new Set(command === 'make_layout_interval_unique' ? interval?.sceneIds : [])
    for (const range of projectShowSummary(before, composition).scenes) {
      if (ownedScenes.has(range.sceneId) || (atMs !== undefined && range.startMs <= atMs && range.endMs >= atMs)) {
        add(range.sceneId)
        for (const cell of before.cells) if (cell.sceneId === range.sceneId) add(cell.id)
        for (const item of placements) if (item.sceneId === range.sceneId) add(item.placement.id)
        if (command === 'make_layout_interval_unique') {
          for (const zone of composition.scenes.find(scene => scene.sceneId === range.sceneId)?.zones ?? []) for (const layer of zone.overlays) add(layer.id)
        }
        if (command === 'add_layout_interval') for (const transition of before.transitions) if (transition.afterSceneId === range.sceneId) add(transition.id)
      }
    }
    if (command === 'make_layout_interval_unique' && interval) {
      const prior = intervals[intervals.indexOf(interval) - 1]
      for (const transition of before.transitions) if (transition.kind === 'routing' && transition.afterSceneId === prior?.sceneIds[prior.sceneIds.length - 1]) add(transition.id)
    }
    if (command === 'add_layout_interval') add(input.layout_id)
  }
  return ids
}

function untouchedEntityViolations(run: AppliedRecord): string[] {
  const permitted = permittedEntityIds(run)
  const before = entityInventory(run.before)
  const after = entityInventory(run.after)
  const violations: string[] = []
  const deletedPermittedAncestor = (path: string) => [...before.entities].some(([ancestor, entity]) => path.startsWith(`${ancestor}/`) && permitted.has(entity.id) && !after.entities.has(ancestor))
  for (const [path, entity] of before.entities) {
    if (permitted.has(entity.id)) continue
    const next = after.entities.get(path)
    if (!next && deletedPermittedAncestor(path)) continue
    if (!next || !isDeepStrictEqual(next.own, entity.own)) violations.push(`${run.command}: unnamed entity ${path} changed`)
  }
  for (const [path, order] of before.orders) {
    if (deletedPermittedAncestor(path)) continue
    const unnamed = order.filter(id => !permitted.has(id))
    const next = (after.orders.get(path) ?? []).filter(id => unnamed.includes(id))
    if (JSON.stringify(unnamed) !== JSON.stringify(next)) violations.push(`${run.command}: unnamed order ${path} changed`)
  }
  return violations
}

describe('Show command untouched entities', () => {
  it('every golden preserves unnamed entity fields and sibling order', () => {
    APPLIED.length = 0
    for (const run of Object.values(GOLDEN_RUNS)) run()
    expect(APPLIED.flatMap(untouchedEntityViolations)).toEqual([])
  })
})

it.each(['entity field', 'nested keyframe', 'sibling order', 'missing entity', 'explicit undefined', 'owned reference array'] as const)('untouched oracle detects an unrelated %s fault', fault => {
  const before = trackedCommandFixture()
  const after = structuredClone(before)
  const composition = after.composition!
  if (fault === 'owned reference array') after.routingLayouts[0].zones[0].zoneId = 'corrupted-zone'
  if (fault === 'entity field') composition.patternInstances[0].patternName = 'Corrupted'
  if (fault === 'nested keyframe') composition.scenes[0].propertyTracks![0].keyframes[0].value = 999
  if (fault === 'sibling order') composition.scenes[0].zones[0].main.reverse()
  if (fault === 'missing entity') composition.scenes[0].zones[0].main.pop()
  if (fault === 'explicit undefined') Object.assign(composition.scenes[0].zones[0].main[0], { logicalClipId: undefined })
  const run: AppliedRecord = { command: 'update_marker', input: { marker_id: 'marker-1', name: 'Changed' }, changes: [{ command: 'update_marker', targetId: 'marker-1', description: 'Marker changed' }], before, after }
  expect(untouchedEntityViolations(run).length).toBeGreaterThan(0)
})

it('untouched oracle separates a keyframe insertion from its unchanged parent track', () => {
  const before = trackedCommandFixture()
  const after = structuredClone(before)
  const track = after.composition!.scenes[0].propertyTracks![0]
  track.keyframes.push({ ...track.keyframes[0], id: 'new-keyframe', timeMs: 19000 })
  expect(untouchedEntityViolations({ command: 'add_keyframe', input: { track_id: track.id, time_ms: 19000 }, changes: [{ command: 'add_keyframe', targetId: 'new-keyframe', description: 'Added' }], before, after })).toEqual([])
  track.target = { kind: 'placement-view', placementId: 'clip-a', property: 'brightness' }
  expect(untouchedEntityViolations({ command: 'add_keyframe', input: { track_id: track.id, time_ms: 19000 }, changes: [{ command: 'add_keyframe', targetId: 'new-keyframe', description: 'Added' }], before, after }).length).toBeGreaterThan(0)
})

it.each([
  ['add_clip', { zone_id: 'zone-1', start_ms: 10000, duration_ms: 1000, overlay_layer_index: 0, pattern_kind: 'stock', pattern_id: 'CometLoom' }],
  ['make_clip_pattern_independent', { clip_id: 'clip-c' }],
  ['rejoin_clip_pattern_instance', { clip_id: 'clip-b', target_clip_id: 'clip-a' }],
  ['insert_time', { at_ms: 29000, duration_ms: 1000 }],
  ['set_show_end', { end_ms: 70000 }],
  ['split_clip', { clip_id: 'clip-b', at_ms: 16000 }],
  ['split_clip', { clip_id: 'clip-ov', at_ms: 4000 }],
] as Array<[string, Record<string, unknown>]>)('%s preserves unrelated nonlexical authored order', (command, input) => {
  const before = showOverlayLayerFixture()
  before.composition!.patternInstances.reverse()
  before.composition!.patternInstances[0].evaluationPolicy = undefined
  before.composition!.scenes[0].propertyTracks!.reverse()
  before.composition!.scenes[1].propertyTracks = []
  const original = structuredClone(before)
  const outcome = applyShowCommand(before, command, input)
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  if (!outcome.ok) throw new Error('command refused')
  expect(untouchedEntityViolations({ command, input, before, after: outcome.record, changes: outcome.changes })).toEqual([])
  expect(outcome.record.composition!.scenes[1].propertyTracks).toEqual([])
  expect(before).toStrictEqual(original)
  expect(validateShowComposition(outcome.record, outcome.record.composition!)).toEqual([])
})

// Provenance: pxlblz-v3 test/support/grammarGoldens.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Golden accepted case per registry operation, shared by the breadth runner
// (test/grammarBreadth.test.ts) and the touch-path faithfulness test. The
// coverage test fails when a registry entry has no golden here, so new
// operations cannot land without one.
import { expect } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { showLoopDurationMs } from '@/engine/showModel'
import { projectShowLayoutIntervals } from '@/engine/showLayoutIntervals'
import type { ShowGrammarDocument } from '../../grammar/registry.js'
import {
  applyOk,
  clipAt,
  clips,
  findTrackById,
  fixture,
  instanceOf,
  trackTimes,
  withBrightnessTrack,
  withConsecutiveClips,
  withLayerTransition,
} from './grammarHarness.js'

function effectsOf(document: ShowGrammarDocument, startPlacementId: string) {
  const composition = document.show.composition as ShowCompositionV1
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      const main = zone.main.find((candidate) => candidate.id === startPlacementId)
      if (main) return main.effects ?? []
      for (const layer of zone.overlays) {
        const overlay = layer.placements.find((candidate) => candidate.id === startPlacementId)
        if (overlay) return overlay.effects ?? []
      }
    }
  }
  return []
}

/** An overlay clip carrying one brightness Effect. */
function withOverlayEffect() {
  const document = fixture({ overlay: true })
  const clip = clips(document).find((candidate) => candidate.layer.kind === 'overlay')!
  const { document: next, changes } = applyOk(document, 'add_clip_effect', {
    clip_id: clip.clipId,
    kind: 'brightness',
    parameters: { brightness: 0.4 },
  })
  return { document: next, clip, effectId: changes[0].targetId }
}

/** A clip carrying one brightness Effect. */
function withEffect() {
  const document = fixture()
  const clip = clipAt(document, 0)
  const { document: next, changes } = applyOk(document, 'add_clip_effect', {
    clip_id: clip.clipId,
    kind: 'brightness',
    parameters: { brightness: 0.4 },
  })
  return { document: next, clip, effectId: changes[0].targetId }
}

export const GOLDEN_RUNS: Record<string, () => void> = {
  add_clip: () => {
    const document = fixture({ emptySecondScene: true })
    const { document: next, changes } = applyOk(document, 'add_clip', {
      zone_id: 'z1',
      start_ms: 35_000,
      duration_ms: 10_000,
      pattern_kind: 'stock',
      pattern_id: 'TestPattern1D',
    })
    const added = clipAt(next, 35_000)
    expect(added.clipId).toBe(changes[0].targetId)
    expect(added.durationMs).toBe(10_000)
    expect(added.patternName).toBe('TestPattern1D')

    // Requested length beyond the free time clamps and says so.
    const clamped = applyOk(next, 'add_clip', {
      zone_id: 'z1',
      start_ms: 50_000,
      duration_ms: 999_999,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
    })
    expect(clamped.changes[0].description).toContain('clamped')
    expect(clipAt(clamped.document, 50_000).durationMs).toBe(10_000)

    // Placing at Show End with extend_show grows the Show to fit.
    const extended = applyOk(clamped.document, 'add_clip', {
      zone_id: 'z1',
      start_ms: 60_000,
      duration_ms: 5_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
      extend_show: true,
    })
    expect(showLoopDurationMs(extended.document.show)).toBe(65_000)
    expect(clipAt(extended.document, 60_000).durationMs).toBe(5_000)
  },
  move_clip: () => {
    // Moving across a Scene boundary keeps one logical clip.
    const document = fixture({ emptySecondScene: true })
    const clip = clipAt(document, 0)
    const { document: next } = applyOk(document, 'move_clip', {
      clip_id: clip.clipId,
      start_ms: 20_000,
    })
    const moved = clipAt(next, 20_000)
    expect(moved.clipId).toBe(clip.clipId)
    expect(moved.durationMs).toBe(30_000)
    expect(moved.endMs).toBe(50_000)
    expect(clips(next)).toHaveLength(1)

    // A clip's property track moves with it (within the owning Scene; the
    // engine cannot carry a track across a Scene boundary).
    const base = fixture({ emptySecondScene: true })
    const { document: short } = applyOk(base, 'resize_clip', {
      clip_id: clipAt(base, 0).clipId,
      duration_ms: 10_000,
    })
    const tracked = applyOk(short, 'add_property_track', {
      clip_id: clipAt(short, 0).clipId,
      target: 'view-brightness',
      keyframes: [
        { time_ms: 1_000, value: 1 },
        { time_ms: 9_000, value: 0.2 },
      ],
    })
    const trackedClip = clipAt(tracked.document, 0)
    const { document: shifted } = applyOk(tracked.document, 'move_clip', {
      clip_id: trackedClip.clipId,
      start_ms: 2_000,
    })
    expect(trackTimes(shifted, tracked.changes[0].targetId)).toEqual([3_000, 11_000])
  },
  resize_clip: () => {
    // Growing across the Scene boundary keeps one logical clip; shrinking
    // back collapses it again.
    const document = fixture({ emptySecondScene: true })
    const clip = clipAt(document, 0)
    const { document: grown } = applyOk(document, 'resize_clip', {
      clip_id: clip.clipId,
      duration_ms: 45_000,
    })
    expect(clips(grown)).toHaveLength(1)
    expect(clipAt(grown, 0).durationMs).toBe(45_000)

    const { document: shrunk } = applyOk(grown, 'resize_clip', {
      clip_id: clip.clipId,
      duration_ms: 20_000,
    })
    expect(clipAt(shrunk, 0).durationMs).toBe(20_000)
    expect(clips(shrunk)).toHaveLength(1)

    // Overlay clips resize through the same operation.
    const withOverlay = fixture({ overlay: true })
    const overlayClip = clips(withOverlay).find((candidate) => candidate.layer.kind === 'overlay')!
    const { document: overlayResized } = applyOk(withOverlay, 'resize_clip', {
      clip_id: overlayClip.clipId,
      duration_ms: 12_000,
    })
    expect(clips(overlayResized).find((candidate) => candidate.clipId === overlayClip.clipId)?.durationMs)
      .toBe(12_000)
  },
  split_clip: () => {
    // Splitting a multi-Scene clip at a point inside its second Scene.
    const document = fixture({ emptySecondScene: true })
    const clip = clipAt(document, 0)
    const { document: grown } = applyOk(document, 'resize_clip', {
      clip_id: clip.clipId,
      duration_ms: 45_000,
    })
    const { document: next, changes } = applyOk(grown, 'split_clip', {
      clip_id: clip.clipId,
      at_ms: 35_000,
    })
    const left = clipAt(next, 0)
    const right = clipAt(next, 35_000)
    expect(left.clipId).toBe(clip.clipId)
    expect(left.endMs).toBe(35_000)
    expect(right.clipId).toBe(changes[0].details?.rightClipId)
    expect(right.endMs).toBe(45_000)

    // Splitting a clip with a property track keeps a track on each half.
    const tracked = withBrightnessTrack()
    const trackedClip = clipAt(tracked.document, 0)
    const { document: splitTracked } = applyOk(tracked.document, 'split_clip', {
      clip_id: trackedClip.clipId,
      at_ms: 12_000,
    })
    const scene1 = (splitTracked.show.composition as ShowCompositionV1).scenes
      .find((candidate) => candidate.sceneId === 's1')
    expect((scene1?.propertyTracks ?? []).length).toBeGreaterThanOrEqual(2)
  },
  duplicate_clip: () => {
    const document = fixture({ emptySecondScene: true })
    const clip = clipAt(document, 0)
    const independent = applyOk(document, 'duplicate_clip', { clip_id: clip.clipId })
    const copy = clipAt(independent.document, 30_000)
    expect(copy.durationMs).toBe(30_000)
    expect(copy.instanceId).not.toBe(clip.instanceId)

    const linked = applyOk(document, 'duplicate_clip', { clip_id: clip.clipId, linked: true })
    expect(clipAt(linked.document, 30_000).instanceId).toBe(clip.instanceId)

    // Placement-targeted tracks are copied for the duplicate.
    const tracked = applyOk(fixture({ emptySecondScene: true }), 'add_property_track', {
      clip_id: clipAt(fixture({ emptySecondScene: true }), 0).clipId,
      target: 'view-brightness',
      keyframes: [
        { time_ms: 1_000, value: 1 },
        { time_ms: 9_000, value: 0.2 },
      ],
    })
    const trackedClip = clipAt(tracked.document, 0)
    const { document: duplicated } = applyOk(tracked.document, 'duplicate_clip', {
      clip_id: trackedClip.clipId,
    })
    // The copy lands in Scene 2, so its track copy is Scene-2-owned.
    const totalTracks = (duplicated.show.composition as ShowCompositionV1).scenes
      .flatMap((candidate) => candidate.propertyTracks ?? [])
    expect(totalTracks.length).toBe(2)
  },
  remove_clip: () => {
    // Removing a multi-Scene clip removes every segment.
    const document = fixture({ emptySecondScene: true })
    const clip = clipAt(document, 0)
    const { document: grown } = applyOk(document, 'resize_clip', { clip_id: clip.clipId, duration_ms: 45_000 })
    const { document: withSecond } = applyOk(grown, 'add_clip', {
      zone_id: 'z1',
      start_ms: 50_000,
      duration_ms: 5_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
    })
    const { document: next } = applyOk(withSecond, 'remove_clip', { clip_id: clip.clipId })
    expect(clips(next)).toHaveLength(1)
    expect(clipAt(next, 50_000)).toBeDefined()

    // Removing a clip with a property track leaves no dangling track.
    const tracked = withBrightnessTrack()
    const trackedClip = clipAt(tracked.document, 0)
    const { document: removed } = applyOk(tracked.document, 'remove_clip', { clip_id: trackedClip.clipId })
    const scene1Tracks = (removed.show.composition as ShowCompositionV1).scenes
      .find((candidate) => candidate.sceneId === 's1')?.propertyTracks ?? []
    expect(scene1Tracks).toEqual([])
  },
  make_clip_pattern_independent: () => {
    const document = fixture({ emptySecondScene: true })
    const clip = clipAt(document, 0)
    const { document: shared } = applyOk(document, 'duplicate_clip', { clip_id: clip.clipId, linked: true })
    const copy = clipAt(shared, 30_000)
    const { document: next, changes } = applyOk(shared, 'make_clip_pattern_independent', {
      clip_id: copy.clipId,
    })
    expect(instanceOf(next, copy.clipId).id).toBe(changes[0].details?.newInstanceId)
    expect(instanceOf(next, copy.clipId).id).not.toBe(instanceOf(next, clip.clipId).id)
  },
  rejoin_clip_pattern_instance: () => {
    const document = fixture({ emptySecondScene: true })
    const clip = clipAt(document, 0)
    const { document: withCopy } = applyOk(document, 'duplicate_clip', { clip_id: clip.clipId })
    const copy = clipAt(withCopy, 30_000)
    const { document: next } = applyOk(withCopy, 'rejoin_clip_pattern_instance', {
      clip_id: copy.clipId,
      target_clip_id: clip.clipId,
    })
    expect(instanceOf(next, copy.clipId).id).toBe(instanceOf(next, clip.clipId).id)
  },
  restart_clip: () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: next, changes } = applyOk(document, 'restart_clip', { clip_id: clip.clipId })
    expect(instanceOf(next, clip.clipId).id).toBe(changes[0].details?.newInstanceId)
  },
  set_clip_view: () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: next } = applyOk(document, 'set_clip_view', {
      clip_id: clip.clipId,
      brightness: 0.5,
      mirror: true,
    })
    const composition = next.show.composition as ShowCompositionV1
    const placement = composition.scenes.find((scene) => scene.sceneId === 's1')!
      .zones[0].main.find((candidate) => candidate.id === clip.startPlacementId)
    expect(placement?.view).toEqual({ mirror: true, phase: 0, brightness: 0.5 })

    const withOverlay = fixture({ overlay: true })
    const overlayClip = clips(withOverlay).find((candidate) => candidate.layer.kind === 'overlay')!
    const { document: overlayNext } = applyOk(withOverlay, 'set_clip_view', {
      clip_id: overlayClip.clipId,
      brightness: 0.8,
    })
    const overlayComposition = overlayNext.show.composition as ShowCompositionV1
    const overlayPlacement = overlayComposition.scenes
      .find((candidate) => candidate.sceneId === 's1')!
      .zones[0].overlays[0].placements[0]
    expect(overlayPlacement.view.brightness).toBe(0.8)
  },
  set_clip_control_target: () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: next } = applyOk(document, 'set_clip_control_target', {
      clip_id: clip.clipId,
      export_name: 'sliderSpeed',
      value: 0.3,
    })
    expect(instanceOf(next, clip.clipId).controlTargets).toEqual({ sliderSpeed: 0.3 })

    const { document: cleared } = applyOk(next, 'set_clip_control_target', {
      clip_id: clip.clipId,
      export_name: 'sliderSpeed',
      value: null,
    })
    expect(instanceOf(cleared, clip.clipId).controlTargets ?? {}).toEqual({})
  },
  set_clip_time: () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: next } = applyOk(document, 'set_clip_time', {
      clip_id: clip.clipId,
      time_scale: 0.25,
      time_offset_ms: 1_500,
    })
    expect(instanceOf(next, clip.clipId).time).toMatchObject({ timeScale: 0.25, timeOffsetMs: 1_500 })
  },
  set_clip_evaluation: () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: next } = applyOk(document, 'set_clip_evaluation', {
      clip_id: clip.clipId,
      policy: 'freeze-at-entry',
    })
    expect(instanceOf(next, clip.clipId).evaluationPolicy).toBe('freeze-at-entry')
  },
  add_overlay_layer: () => {
    const document = fixture()
    const { document: next } = applyOk(document, 'add_overlay_layer', { zone_id: 'z1' })
    const composition = next.show.composition as ShowCompositionV1
    for (const scene of composition.scenes) {
      expect(scene.zones[0].overlays).toHaveLength(1)
    }
    // The new topmost layer accepts a clip.
    const { document: withClip } = applyOk(next, 'add_clip', {
      zone_id: 'z1',
      start_ms: 5_000,
      duration_ms: 8_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
      overlay_layer_index: 0,
    })
    const overlayClip = clips(withClip).find((candidate) => candidate.layer.kind === 'overlay')
    expect(overlayClip?.startMs).toBe(5_000)
  },
  insert_time: () => {
    const document = fixture({ emptySecondScene: true })
    const clip = clipAt(document, 0)
    const { document: next, changes } = applyOk(document, 'insert_time', {
      at_ms: 15_000,
      duration_ms: 5_000,
    })
    expect(showLoopDurationMs(next.show)).toBe(65_000)
    const left = clipAt(next, 0)
    expect(left.clipId).toBe(clip.clipId)
    expect(left.endMs).toBe(15_000)
    const rightId = Object.values(
      (changes[0].details?.splitClipIdsBySourceId ?? {}) as Record<string, string>,
    )[0]
    expect(clipAt(next, 20_000).clipId).toBe(rightId)
  },
  set_show_end: () => {
    const document = fixture()
    const { document: next } = applyOk(document, 'set_show_end', { end_ms: 70_000 })
    expect(showLoopDurationMs(next.show)).toBe(70_000)
    expect(next.show.scenes[1].durationMs).toBe(40_000)
  },
  add_marker: () => {
    const document = fixture()
    const { document: next, changes } = applyOk(document, 'add_marker', {
      at_ms: 12_000,
      name: 'Drop',
    })
    const composition = next.show.composition as ShowCompositionV1
    expect(composition.markers).toEqual([
      { id: changes[0].targetId, timeMs: 12_000, name: 'Drop' },
    ])
  },
  move_marker: () => {
    const document = fixture()
    const { document: withMarker, changes } = applyOk(document, 'add_marker', { at_ms: 12_000 })
    const { document: next } = applyOk(withMarker, 'move_marker', {
      marker_id: changes[0].targetId,
      at_ms: 20_000,
    })
    expect((next.show.composition as ShowCompositionV1).markers?.[0].timeMs).toBe(20_000)
  },
  update_marker: () => {
    const document = fixture()
    const { document: withMarker, changes } = applyOk(document, 'add_marker', { at_ms: 12_000 })
    const { document: next } = applyOk(withMarker, 'update_marker', {
      marker_id: changes[0].targetId,
      name: 'Chorus',
      color: '#ff8800',
    })
    expect((next.show.composition as ShowCompositionV1).markers?.[0]).toMatchObject({
      name: 'Chorus',
      color: '#ff8800',
    })
  },
  remove_marker: () => {
    const document = fixture()
    const { document: withMarker, changes } = applyOk(document, 'add_marker', { at_ms: 12_000 })
    const { document: next } = applyOk(withMarker, 'remove_marker', { marker_id: changes[0].targetId })
    expect((next.show.composition as ShowCompositionV1).markers ?? []).toEqual([])
  },
  add_property_track: () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: next, changes } = applyOk(document, 'add_property_track', {
      clip_id: clip.clipId,
      target: 'view-brightness',
      keyframes: [
        { time_ms: 0, value: 1 },
        { time_ms: 10_000, value: 0.2, easing: 'ease-out' },
      ],
    })
    const scene = (next.show.composition as ShowCompositionV1).scenes.find((candidate) => candidate.sceneId === 's1')
    expect(scene?.propertyTracks?.[0].id).toBe(changes[0].targetId)
    expect(scene?.propertyTracks?.[0].target).toEqual({
      kind: 'placement-view',
      placementId: clip.startPlacementId,
      property: 'brightness',
    })
  },
  add_keyframe: () => {
    const { document, trackId } = withBrightnessTrack()
    const { document: next } = applyOk(document, 'add_keyframe', {
      track_id: trackId,
      time_ms: 5_000,
      value: 0.6,
    })
    expect(trackTimes(next, trackId)).toEqual([0, 5_000, 10_000])
  },
  update_keyframe: () => {
    const { document, trackId, keyframeIds } = withBrightnessTrack()
    const { document: next } = applyOk(document, 'update_keyframe', {
      track_id: trackId,
      keyframe_id: keyframeIds[1],
      value: 0.4,
    })
    const track = findTrackById(next, trackId)
    expect(track.keyframes.find((keyframe) => keyframe.id === keyframeIds[1])?.value).toBe(0.4)
  },
  move_keyframe: () => {
    const { document, trackId, keyframeIds } = withBrightnessTrack()
    const { document: next } = applyOk(document, 'move_keyframe', {
      track_id: trackId,
      keyframe_id: keyframeIds[0],
      time_ms: 2_000,
    })
    expect(trackTimes(next, trackId)).toEqual([2_000, 10_000])
  },
  delete_keyframe: () => {
    const { document, trackId } = withBrightnessTrack(3)
    const track = findTrackById(document, trackId)
    const { document: next } = applyOk(document, 'delete_keyframe', {
      track_id: trackId,
      keyframe_id: track.keyframes[1].id,
    })
    expect(trackTimes(next, trackId)).toHaveLength(2)
  },
  delete_property_track: () => {
    const { document, trackId } = withBrightnessTrack()
    const { document: next } = applyOk(document, 'delete_property_track', { track_id: trackId })
    const scene = (next.show.composition as ShowCompositionV1).scenes.find((candidate) => candidate.sceneId === 's1')
    expect(scene?.propertyTracks ?? []).toEqual([])
  },
  set_junction_transition: () => {
    const document = fixture({ boundaryCrossfade: true })
    const { document: next } = applyOk(document, 'set_junction_transition', {
      at_ms: 30_000,
      kind: 'wipe',
      duration_ms: 1_500,
    })
    const transition = next.show.transitions?.find((candidate) => candidate.afterSceneId === 's1')
    expect(transition?.kind).toBe('wipe')
    expect(transition?.durationMs).toBe(1_500)
  },
  set_junction_timing: () => {
    const document = fixture({ boundaryCrossfade: true })
    const first = clipAt(document, 0)
    const { document: next } = applyOk(document, 'set_junction_timing', {
      after_clip_id: first.clipId,
      duration_ms: 2_500,
      easing: 'ease-in-out',
    })
    const transition = next.show.transitions?.find((candidate) => candidate.afterSceneId === 's1')
    expect(transition?.durationMs).toBe(2_500)
    expect(transition?.easing).toEqual({ curve: 'quadratic', direction: 'in-out' })
  },
  update_junction_parameter: () => {
    const document = fixture({ boundaryCrossfade: true })
    const { document: asWipe } = applyOk(document, 'set_junction_transition', {
      at_ms: 30_000,
      kind: 'wipe',
    })
    const { document: next } = applyOk(asWipe, 'update_junction_parameter', {
      at_ms: 30_000,
      parameter: 'feather',
      value: 0.3,
    })
    const transition = next.show.transitions?.find((candidate) => candidate.afterSceneId === 's1')
    expect(transition && 'feather' in transition && transition.feather).toBe(0.3)
  },
  set_junction_layout: () => {
    const document = fixture({ boundaryCrossfade: true })
    const { document: next } = applyOk(document, 'set_junction_layout', {
      at_ms: 30_000,
      layout_id: 'l1',
    })
    const routing = next.show.transitions?.find((candidate) => candidate.kind === 'routing')
    expect(routing?.afterSceneId).toBe('s1')
    expect(routing && 'layoutId' in routing && routing.layoutId).toBe('l1')
  },
  insert_layer_transition: () => {
    const base = withConsecutiveClips()
    const { document: next, changes } = applyOk(base.document, 'insert_layer_transition', {
      from_clip_id: base.firstClipId,
      to_clip_id: base.secondClipId,
      duration_ms: 2_000,
    })
    const composition = next.show.composition as ShowCompositionV1
    const transition = composition.transitions?.find((candidate) => candidate.id === changes[0].targetId)
    expect(transition?.kind).toBe('crossfade')
    expect(transition?.durationMs).toBe(2_000)
    expect(clipAt(next, 12_000).clipId).toBe(base.secondClipId)
  },
  resize_layer_transition: () => {
    const base = withLayerTransition()
    const { document: next } = applyOk(base.document, 'resize_layer_transition', {
      transition_id: base.transitionId,
      duration_ms: 3_000,
    })
    const composition = next.show.composition as ShowCompositionV1
    expect(composition.transitions?.find((candidate) => candidate.id === base.transitionId)?.durationMs)
      .toBe(3_000)
    expect(clipAt(next, 13_000).clipId).toBe(base.secondClipId)
  },
  reset_layer_transition_to_cut: () => {
    const base = withLayerTransition()
    const { document: next } = applyOk(base.document, 'reset_layer_transition_to_cut', {
      transition_id: base.transitionId,
    })
    expect((next.show.composition as ShowCompositionV1).transitions ?? []).toEqual([])
    expect(clipAt(next, 10_000).clipId).toBe(base.secondClipId)
  },
  move_connected_clip: () => {
    const base = withLayerTransition()
    const { document: next } = applyOk(base.document, 'move_connected_clip', {
      clip_id: base.firstClipId,
      start_ms: 5_000,
    })
    expect(clipAt(next, 5_000).clipId).toBe(base.firstClipId)
    expect(clipAt(next, 17_000).clipId).toBe(base.secondClipId)
    expect((next.show.composition as ShowCompositionV1).transitions).toHaveLength(1)
  },
  resize_connected_clip: () => {
    const base = withLayerTransition()
    const { document: next } = applyOk(base.document, 'resize_connected_clip', {
      clip_id: base.firstClipId,
      duration_ms: 8_000,
    })
    expect(clipAt(next, 0).durationMs).toBe(8_000)
    expect(clipAt(next, 10_000).clipId).toBe(base.secondClipId)
    expect((next.show.composition as ShowCompositionV1).transitions).toHaveLength(1)
  },
  add_clip_effect: () => {
    const { document, clip, effectId } = withEffect()
    const stack = effectsOf(document, clip.startPlacementId)
    expect(stack).toHaveLength(1)
    expect(stack[0].id).toBe(effectId)
    expect(stack[0].kind).toBe('brightness')
    expect('brightness' in stack[0] && stack[0].brightness).toBe(0.4)

    const overlay = withOverlayEffect()
    expect(effectsOf(overlay.document, overlay.clip.startPlacementId)).toHaveLength(1)
  },
  update_clip_effect: () => {
    const { document, clip, effectId } = withEffect()
    const { document: next } = applyOk(document, 'update_clip_effect', {
      clip_id: clip.clipId,
      effect_id: effectId,
      parameter: 'brightness',
      value: 0.7,
    })
    const effect = effectsOf(next, clip.startPlacementId)[0]
    expect(effect && 'brightness' in effect && effect.brightness).toBe(0.7)

    const overlay = withOverlayEffect()
    const { document: overlayNext } = applyOk(overlay.document, 'update_clip_effect', {
      clip_id: overlay.clip.clipId,
      effect_id: overlay.effectId,
      parameter: 'brightness',
      value: 0.9,
    })
    const overlayEffect = effectsOf(overlayNext, overlay.clip.startPlacementId)[0]
    expect(overlayEffect && 'brightness' in overlayEffect && overlayEffect.brightness).toBe(0.9)
  },
  duplicate_clip_effect: () => {
    const { document, clip, effectId } = withEffect()
    const { document: next, changes } = applyOk(document, 'duplicate_clip_effect', {
      clip_id: clip.clipId,
      effect_id: effectId,
    })
    const stack = effectsOf(next, clip.startPlacementId)
    expect(stack.map((effect) => effect.id)).toEqual([effectId, changes[0].targetId])

    const overlay = withOverlayEffect()
    const { document: overlayNext } = applyOk(overlay.document, 'duplicate_clip_effect', {
      clip_id: overlay.clip.clipId,
      effect_id: overlay.effectId,
    })
    expect(effectsOf(overlayNext, overlay.clip.startPlacementId)).toHaveLength(2)
  },
  move_clip_effect: () => {
    const { document, clip, effectId } = withEffect()
    const { document: withHue, changes } = applyOk(document, 'add_clip_effect', {
      clip_id: clip.clipId,
      kind: 'hue',
    })
    const hueId = changes[0].targetId
    const { document: next } = applyOk(withHue, 'move_clip_effect', {
      clip_id: clip.clipId,
      effect_id: hueId,
      direction: 'earlier',
    })
    expect(effectsOf(next, clip.startPlacementId).map((effect) => effect.id)).toEqual([hueId, effectId])

    const overlay = withOverlayEffect()
    const { document: withSecond, changes: hue } = applyOk(overlay.document, 'add_clip_effect', {
      clip_id: overlay.clip.clipId,
      kind: 'hue',
    })
    const { document: overlayNext } = applyOk(withSecond, 'move_clip_effect', {
      clip_id: overlay.clip.clipId,
      effect_id: hue[0].targetId,
      direction: 'earlier',
    })
    expect(effectsOf(overlayNext, overlay.clip.startPlacementId)[0].id).toBe(hue[0].targetId)
  },
  remove_clip_effect: () => {
    const { document, clip, effectId } = withEffect()
    const { document: next } = applyOk(document, 'remove_clip_effect', {
      clip_id: clip.clipId,
      effect_id: effectId,
    })
    expect(effectsOf(next, clip.startPlacementId)).toEqual([])

    const overlay = withOverlayEffect()
    const { document: overlayNext } = applyOk(overlay.document, 'remove_clip_effect', {
      clip_id: overlay.clip.clipId,
      effect_id: overlay.effectId,
    })
    expect(effectsOf(overlayNext, overlay.clip.startPlacementId)).toEqual([])
  },
  set_output_contract: () => {
    const document = fixture()
    const { document: next } = applyOk(document, 'set_output_contract', {
      kind: 'portable-2d',
      map_id: 'plane',
      pixel_count: 512,
    })
    const contract = next.show.outputContract
    expect(contract.kind).toBe('portable-2d')
    expect(contract.kind === 'portable-2d' && contract.referencePixelCount).toBe(512)
  },
  set_output_trails: () => {
    const document = fixture()
    const { document: next } = applyOk(document, 'set_output_trails', {
      enabled: true,
      retention: 0.5,
    })
    expect(next.show.outputEffects).toEqual([{ id: 'trails', kind: 'trails', retention: 0.5 }])
    const { document: off } = applyOk(next, 'set_output_trails', { enabled: false })
    expect(off.show.outputEffects).toEqual([])
  },
  add_layout_interval: () => {
    const document = fixture()
    const { document: next, changes } = applyOk(document, 'add_layout_interval', {
      layout_id: 'l1',
      duration_ms: 10_000,
    })
    expect(showLoopDurationMs(next.show)).toBe(70_000)
    const intervals = projectShowLayoutIntervals(next.show)
    expect(intervals[intervals.length - 1].id).toBe(changes[0].details?.intervalId)
  },
  duplicate_layout_interval: () => {
    const document = fixture()
    const interval = projectShowLayoutIntervals(document.show)[0]
    const { document: next } = applyOk(document, 'duplicate_layout_interval', {
      interval_id: interval.id,
    })
    expect(showLoopDurationMs(next.show)).toBe(120_000)
    expect(projectShowLayoutIntervals(next.show)).toHaveLength(2)
  },
  make_layout_interval_unique: () => {
    const document = fixture()
    const { document: withSecond } = applyOk(document, 'add_layout_interval', {
      layout_id: 'l1',
      duration_ms: 10_000,
    })
    const intervals = projectShowLayoutIntervals(withSecond.show)
    const { document: next } = applyOk(withSecond, 'make_layout_interval_unique', {
      interval_id: intervals[1].id,
    })
    expect(next.show.routingLayouts.length).toBe(2)
  },
  rename_show: () => {
    const document = fixture()
    const { document: next, changes } = applyOk(document, 'rename_show', { name: '  Night Set  ' })
    expect(next.show.name).toBe('Night Set')
    expect(changes[0].description).toContain('Grammar fixture')
  },
  set_stage_map: () => {
    const document = fixture()
    const { document: next } = applyOk(document, 'set_stage_map', {
      stage_map_id: 'map-garage',
      target_controller_profile_id: 'profile-pi',
    })
    expect(next.show.stageMapId).toBe('map-garage')
    expect(next.show.targetControllerProfileId).toBe('profile-pi')

    // null clears: the stage map to null, the profile off the record entirely.
    const { document: cleared } = applyOk(next, 'set_stage_map', {
      stage_map_id: null,
      target_controller_profile_id: null,
    })
    expect(cleared.show.stageMapId).toBeNull()
    expect('targetControllerProfileId' in cleared.show).toBe(false)
  },
  update_zone: () => {
    const document = fixture()
    const { document: next, changes } = applyOk(document, 'update_zone', {
      zone_id: 'z1',
      name: 'Ceiling',
      nominal_pixel_count: 256.4,
      color: '#22aa66',
    })
    expect(next.show.zones[0]).toMatchObject({
      id: 'z1',
      name: 'Ceiling',
      nominalPixelCount: 256,
      color: '#22aa66',
    })
    expect(changes[0].description).toContain('renamed "Main"')
  },
  set_field: () => {
    const document = fixture()
    const { document: next } = applyOk(document, 'set_field', {
      pointer: '/name',
      value: 'Renamed by set_field',
    })
    expect(next.show.name).toBe('Renamed by set_field')

    // The Trails output Effect is the canonical generic-only path (#19 gap).
    const { document: withTrails } = applyOk(next, 'set_field', {
      pointer: '/outputEffects',
      value: [{ id: 'trails-1', kind: 'trails', retention: 0.6 }],
    })
    expect(withTrails.show.outputEffects).toEqual([{ id: 'trails-1', kind: 'trails', retention: 0.6 }])
  },
  apply_patch: () => {
    const document = fixture()
    const { document: next } = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'test', path: '/name', value: 'Grammar fixture' },
        { op: 'replace', path: '/name', value: 'Patched' },
        { op: 'add', path: '/outputEffects', value: [{ id: 'trails-1', kind: 'trails', retention: 0.4 }] },
      ],
    })
    expect(next.show.name).toBe('Patched')
    expect(next.show.outputEffects?.[0].retention).toBe(0.4)
  },
}

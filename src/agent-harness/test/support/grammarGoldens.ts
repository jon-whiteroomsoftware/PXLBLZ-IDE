import { showLayerTransitionCommandFixture } from '@/test/showLayerTransitionCommandFixture'
import { boundaryClipDeletionFixture } from '@/test/showBoundaryClipDeletionFixture'
// Provenance: pxlblz-v3 test/support/grammarGoldens.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Golden accepted case per registry operation, shared by the breadth runner
// (test/grammarBreadth.test.ts) and the touch-path faithfulness test. The
// coverage test fails when a registry entry has no golden here, so new
// operations cannot land without one.
import { expect } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { showLoopDurationMs } from '@/engine/showModel'
import { projectShowLayoutIntervals } from '@/engine/showLayoutIntervals'
import { applyShowGrammarOperation, type ShowGrammarDocument } from '../../grammar/registry.js'
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
import { showBoundaryCommandFixture, BOUNDARY_PARAMETER_CASES, BOUNDARY_VARIANT_CASES } from '@/test/showBoundaryCommandFixture'
import { showOverlayLayerFixture } from '@/test/showOverlayLayerFixture'
import { showLayerCommandFixture } from '@/test/showLayerCommandFixture'
import { openShowDocument } from '../../grammar/openShow'

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
  create_clips: () => {
    const document = fixture({ emptySecondScene: true })
    const layered = applyOk(document, 'add_overlay_layer', { zone_id: 'z1' })
    const { document: next, changes } = applyOk(layered.document, 'create_clips', {
      schema_version: 1,
      clips: [
        { zone_id: 'z1', layer: 'main', start_ms: 30_000, duration_ms: 5_000, pattern: { kind: 'stock', id: 'TestPattern1D' } },
        { zone_id: 'z1', layer: 0, start_ms: 5_000, duration_ms: 4_000, pattern: { kind: 'stock', id: 'CometLoom' } },
      ],
    })
    expect(changes[0].details?.results).toHaveLength(2)
    expect(clipAt(next, 30_000).patternName).toBe('TestPattern1D')
    expect(clips(next).find(clip => clip.layer.kind === 'overlay' && clip.startMs === 5_000)?.durationMs).toBe(4_000)
  },
  create_layers: () => {
    const document = fixture()
    const { document: next, changes } = applyOk(document, 'create_layers', {
      schema_version: 1,
      layers: [{
        zone_id: 'z1',
        clips: [{ start_ms: 5_000, duration_ms: 4_000, pattern: { kind: 'stock', id: 'CometLoom' } }],
      }],
    })
    expect(changes[0].details?.layers).toHaveLength(1)
    expect(clips(next).find(clip => clip.layer.kind === 'overlay' && clip.startMs === 5_000)?.durationMs).toBe(4_000)
  },
  update_clips: () => {
    const mainDocument = fixture()
    const main = clipAt(mainDocument, 0)
    const { document: mainUpdated } = applyOk(mainDocument, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: main.clipId, properties: { view: { brightness: 0.5 } } }],
    })
    expect(mainUpdated.show.composition!.scenes[0].zones[0].main[0].view.brightness).toBe(0.5)

    const overlayDocument = fixture({ overlay: true })
    const overlay = clips(overlayDocument).find(clip => clip.layer.kind === 'overlay')!
    const { document: overlayUpdated } = applyOk(overlayDocument, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: overlay.clipId, properties: { opacity: 0.5 } }],
    })
    expect(overlayUpdated.show.composition!.scenes[0].zones[0].overlays[0].placements[0].opacity).toBe(0.5)

    const controlDocument = fixture()
    const controlled = applyOk(controlDocument, 'set_clip_control_target', {
      clip_id: main.clipId,
      export_name: 'sliderSpeed',
      value: 0.3,
    })
    const tracked = applyOk(controlled.document, 'add_property_track', {
      clip_id: main.clipId,
      target: 'control',
      control_export_name: 'sliderSpeed',
      keyframes: [{ time_ms: 0, value: 0.3 }, { time_ms: 1_000, value: 0.6 }],
    })
    const { document: cleared } = applyOk(tracked.document, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: main.clipId, properties: { controls: { sliderSpeed: null } } }],
    })
    expect(instanceOf(cleared, main.clipId).controlTargets ?? {}).toEqual({})
    expect(cleared.show.composition!.scenes.flatMap(scene => scene.propertyTracks ?? [])).toEqual([])
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
    const connectedBase = withLayerTransition()
    const { document: connectedNext } = applyOk(connectedBase.document, 'move_clip', {
      clip_id: connectedBase.firstClipId,
      start_ms: 5_000,
    })
    expect(clipAt(connectedNext, 5_000).clipId).toBe(connectedBase.firstClipId)
    expect(clipAt(connectedNext, 17_000).clipId).toBe(connectedBase.secondClipId)
    expect((connectedNext.show.composition as ShowCompositionV1).transitions).toHaveLength(1)
    const crossing = fixture({ emptySecondScene: true })
    const composition = crossing.show.composition!
    const zone = composition.scenes[0].zones[0]
    zone.main = [
      { ...zone.main[0], id: 'cross-a', startMs: 24_000, durationMs: 2_000 },
      { ...zone.main[0], id: 'cross-b', startMs: 27_000, durationMs: 2_000 },
    ]
    composition.transitions = [{ id: 'cross-ab', fromPlacementId: 'cross-a', toPlacementId: 'cross-b', kind: 'crossfade', durationMs: 1_000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
    const crossed = applyOk(crossing, 'move_clip', { clip_id: 'cross-a', start_ms: 29_000 })
    expect(crossed.document.show.composition?.transitions?.[0]).toMatchObject({ id: 'cross-ab', fromPlacementId: `cross-a--span-${composition.scenes[1].sceneId}`, toPlacementId: 'cross-b', durationMs: 1_000 })
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
    const connected = withLayerTransition()
    const shorter = applyOk(connected.document, 'resize_clip', { clip_id: connected.firstClipId, duration_ms: 8000 })
    expect(clipAt(shorter.document, 0).durationMs).toBe(8000)
    expect(clipAt(shorter.document, 10000).clipId).toBe(connected.secondClipId)
    expect(shorter.document.show.composition!.transitions).toHaveLength(1)
    const leading = applyOk(connected.document, 'resize_clip', { clip_id: connected.secondClipId, start_ms: 12500, end_ms: 22000 })
    expect(leading.changes[0].details?.transitionChanges).toEqual([{ transitionId: connected.transitionId, previousDurationMs: 2000, durationMs: 2500 }])
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

    const connected = withLayerTransition()
    const beforeTransition = (connected.document.show.composition as ShowCompositionV1).transitions![0]
    const splitConnected = applyOk(connected.document, 'split_clip', {
      clip_id: connected.firstClipId,
      at_ms: 5_000,
    })
    const rightClipId = splitConnected.changes[0].details?.rightClipId
    expect((splitConnected.document.show.composition as ShowCompositionV1).transitions).toEqual([
      { ...beforeTransition, fromPlacementId: rightClipId },
    ])
    expect(splitConnected.changes[0].details?.transitionChanges).toEqual([{
      transitionId: connected.transitionId,
      fromPlacementId: rightClipId,
      toPlacementId: connected.secondClipId,
    }])

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
    const connected = withLayerTransition()
    const removedConnected = applyOk(connected.document, 'remove_clip', { clip_id: connected.secondClipId })
    expect(removedConnected.document.show.composition!.transitions).toEqual([])

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

    // Removing the incoming boundary Clip preserves the Transition's time in
    // Scene 2, including a delayed destination Group occurrence.
    const boundaryShow = boundaryClipDeletionFixture('grammar-boundary-delete')
    boundaryShow.composition!.groupDefinitions = [{
      id: 'group-definition',
      name: 'Delayed destination group',
      patternInstances: [{
        id: 'group-instance',
        pattern: { kind: 'stock', id: 'CometLoom' },
        patternName: 'CometLoom',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'group-placement',
        instanceId: 'group-instance',
        startMs: 0,
        durationMs: 1_000,
        layerOffset: 0,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    boundaryShow.composition!.groupOccurrences = [{
      id: 'group-occurrence',
      definitionId: 'group-definition',
      sceneId: 'scene-2',
      zoneId: 'zone-1',
      startMs: 1_000,
      baseLayer: 1,
      translationX: 0,
      translationY: 0,
    }]
    const boundary = openShowDocument(boundaryShow)
    if (!boundary.ok) throw new Error(`boundary fixture failed to open: ${JSON.stringify(boundary.issues)}`)
    const repaired = applyOk(boundary.document, 'remove_clip', { clip_id: 'starter-b' })
    expect(repaired.document.show.scenes[1].durationMs).toBe(32_000)
    expect(repaired.document.show.transitions[0]).toMatchObject({ kind: 'cut', durationMs: 0 })
    expect(repaired.document.show.composition!.groupOccurrences![0].startMs).toBe(3_000)
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
    const tracked = openShowDocument(showOverlayLayerFixture())
    if (!tracked.ok) throw new Error('tracked fixture')
    const independent = applyOk(tracked.document, 'make_clip_pattern_independent', { clip_id: 'clip-c' })
    expect(independent.document.show.composition!.scenes[0].propertyTracks!.some(track => track.id === 'track-inst-instance-1')).toBe(true)
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
    const record = showOverlayLayerFixture()
    record.composition!.executionModel = 'deterministic-loop'
    const tracked = openShowDocument(record)
    if (!tracked.ok) throw new Error('tracked fixture')
    const rejoined = applyOk(tracked.document, 'rejoin_clip_pattern_instance', { clip_id: 'clip-b', target_clip_id: 'clip-a' })
    expect(rejoined.document.show.composition!.scenes[0].propertyTracks!.some(track => track.id === 'track-inst-b')).toBe(false)
    expect(rejoined.document.show.composition!.executionModel).toBeUndefined()
  },
  restart_clip: () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: next, changes } = applyOk(document, 'restart_clip', { clip_id: clip.clipId })
    expect(instanceOf(next, clip.clipId).id).toBe(changes[0].details?.newInstanceId)
  },
  set_clip_aperture: () => {
    const document = fixture({ overlay: true })
    const main = clips(document).find((candidate) => candidate.layer.kind === 'main')!
    const { document: framed } = applyOk(document, 'set_clip_aperture', {
      clip_id: main.clipId,
      enabled: true,
      x: 0.1,
      y: 0.2,
      width: 0.7,
      height: 0.6,
      aperture: 'ellipse',
      edge: 'hard',
    })
    const mainPlacement = framed.show.composition!.scenes[0].zones[0].main
      .find((candidate) => candidate.id === main.startPlacementId)!
    expect(mainPlacement.viewport).toMatchObject({ enabled: true, aperture: 'ellipse', edge: 'hard' })

    const overlay = clips(framed).find((candidate) => candidate.layer.kind === 'overlay')!
    const { document: overlayFramed } = applyOk(framed, 'set_clip_aperture', {
      clip_id: overlay.clipId,
      enabled: true,
      aperture: 'ring',
      ring_width: 0.4,
    })
    expect(overlayFramed.show.composition!.scenes[0].zones[0].overlays[0].placements[0].viewport)
      .toMatchObject({ enabled: true, aperture: 'ring', ringWidth: 0.4 })
  },
  set_clip_opacity: () => {
    const document = fixture({ overlay: true })
    const main = clips(document).find((candidate) => candidate.layer.kind === 'main')!
    const { document: faded } = applyOk(document, 'set_clip_opacity', { clip_id: main.clipId, opacity: 0.4 })
    const mainPlacement = faded.show.composition!.scenes[0].zones[0].main
      .find((candidate) => candidate.id === main.startPlacementId)!
    expect(mainPlacement.opacity).toBe(0.4)

    const overlay = clips(faded).find((candidate) => candidate.layer.kind === 'overlay')!
    const { document: overlayFaded } = applyOk(faded, 'set_clip_opacity', { clip_id: overlay.clipId, opacity: 0.6 })
    expect(overlayFaded.show.composition!.scenes[0].zones[0].overlays[0].placements[0].opacity).toBe(0.6)
  },
  set_clip_transform: () => {
    const document = fixture({ overlay: true })
    const main = clips(document).find((candidate) => candidate.layer.kind === 'main')!
    const { document: placed } = applyOk(document, 'set_clip_transform', {
      clip_id: main.clipId,
      position_x: 0.25,
      rotation: 0.125,
      scale_x: 0.5,
    })
    const mainPlacement = placed.show.composition!.scenes[0].zones[0].main
      .find((candidate) => candidate.id === main.startPlacementId)!
    expect(mainPlacement.transform).toMatchObject({ positionX: 0.25, rotation: 0.125, scaleX: 0.5 })

    const overlay = clips(placed).find((candidate) => candidate.layer.kind === 'overlay')!
    const { document: overlayPlaced } = applyOk(placed, 'set_clip_transform', {
      clip_id: overlay.clipId,
      position_y: -0.25,
      scale_y: 2,
    })
    expect(overlayPlaced.show.composition!.scenes[0].zones[0].overlays[0].placements[0].transform)
      .toMatchObject({ positionY: -0.25, scaleY: 2 })
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

    const { document: automated, changes: trackChanges } = applyOk(next, 'add_property_track', {
      clip_id: clip.clipId, target: 'control', control_export_name: 'sliderSpeed',
      keyframes: [{ time_ms: 0, value: 0.3 }, { time_ms: 1000, value: 0.6 }],
    })
    const { document: cleared } = applyOk(automated, 'set_clip_control_target', {
      clip_id: clip.clipId,
      export_name: 'sliderSpeed',
      value: null,
    })
    expect(instanceOf(cleared, clip.clipId).controlTargets ?? {}).toEqual({})
    expect(cleared.show.composition!.scenes.flatMap(scene => scene.propertyTracks ?? []).some(track => track.id === trackChanges[0].targetId)).toBe(false)
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
  reorder_overlay_layer: () => {
    const opened = openShowDocument(showLayerCommandFixture())
    if (!opened.ok) throw new Error('Layer command fixture')
    const { document: next, changes } = applyOk(opened.document, 'reorder_overlay_layer', {
      zone_id: 'zone-1', layer_index: 2, target_index: 0,
    })
    const composition = next.show.composition as ShowCompositionV1
    expect(composition.scenes.map(scene => scene.zones[0].overlays.map(layer => layer.id))).toEqual([
      ['bottom-scene-1', 'top-scene-1', 'middle-scene-1'],
      ['bottom-scene-2', 'top-scene-2', 'middle-scene-2'],
    ])
    expect(changes[0].details?.indexMap).toEqual({ 0: 1, 1: 2, 2: 0 })
  },
  remove_overlay_layer: () => {
    const opened = openShowDocument(showLayerCommandFixture())
    if (!opened.ok) throw new Error('Layer command fixture')
    const { document: next, changes } = applyOk(opened.document, 'remove_overlay_layer', {
      zone_id: 'zone-1', layer_index: 1,
    })
    const composition = next.show.composition as ShowCompositionV1
    expect(composition.scenes.map(scene => scene.zones[0].overlays.map(layer => layer.id))).toEqual([
      ['top-scene-1', 'bottom-scene-1'],
      ['top-scene-2', 'bottom-scene-2'],
    ])
    expect(changes[0].details?.indexMap).toEqual({ 0: 0, 1: null, 2: 1 })
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
  edit_property_keyframes: () => {
    const { document, trackId, keyframeIds } = withBrightnessTrack()
    const { document: next, changes } = applyOk(document, 'edit_property_keyframes', {
      track_id: trackId,
      edits: [
        { operation: 'update', keyframe_id: keyframeIds[0], time_ms: 10_000 },
        { operation: 'update', keyframe_id: keyframeIds[1], time_ms: 0 },
        { operation: 'add', time_ms: 5_000, value: 0.6 },
        { operation: 'add', time_ms: 7_500, value: 0.7, easing: 'ease-in' },
      ],
    })
    expect(trackTimes(next, trackId)).toEqual([0, 5_000, 7_500, 10_000])
    expect(changes[0].details?.results).toMatchObject([
      { operation: 'update', keyframeId: keyframeIds[0] },
      { operation: 'update', keyframeId: keyframeIds[1] },
      { operation: 'add', keyframeId: expect.any(String) },
      { operation: 'add', keyframeId: expect.any(String) },
    ])
    const addedIds = (changes[0].details?.results as Array<{ keyframeId: string }>).slice(2).map(result => result.keyframeId)
    expect(new Set(addedIds).size).toBe(2)
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
    {
    const { document, trackId, keyframeIds } = withBrightnessTrack()
    const { document: next } = applyOk(document, 'update_keyframe', {
      track_id: trackId,
      keyframe_id: keyframeIds[0],
      time_ms: 2_000,
    })
    expect(trackTimes(next, trackId)).toEqual([2_000, 10_000])
    }
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
  set_boundary_transition: () => {
    const document = fixture({ boundaryCrossfade: true })
    const { document: next } = applyOk(document, 'set_boundary_transition', {
      at_ms: 30_000,
      kind: 'wipe',
      duration_ms: 1_500,
    })
    const transition = next.show.transitions?.find((candidate) => candidate.afterSceneId === 's1')
    expect(transition?.kind).toBe('wipe')
    expect(transition?.durationMs).toBe(1_500)
    const all = openShowDocument(showBoundaryCommandFixture())
    if (!all.ok) throw new Error('Boundary fixture')
    for (const { kind, variant } of BOUNDARY_VARIANT_CASES) {
      const base = structuredClone(all.document)
      base.show.transitions[0].easing = { curve: 'sine', direction: 'in' }
      const selected = applyOk(base, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind, variant, duration_ms: 1500 }).document
      applyOk(selected, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'cut' })
    }
    let swept = all.document
    swept.show.transitions[0].propertyTransitions = { brightness: { durationMs: 500, easing: { curve: 'linear' }, fromByCellId: {} } }
    for (const step of BOUNDARY_PARAMETER_CASES) {
      swept = applyOk(swept, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: step.kind }).document
      for (const [parameter, value] of step.sets) {
        const args = { transition_id: 'transition-scene-1', parameter, value }
        const parameterResult = applyShowGrammarOperation(swept, 'update_boundary_transition_parameter', args)
        expect(parameterResult.ok).toBe(true)
        if (!parameterResult.ok) throw new Error('Boundary parameter refused')
        if (parameterResult.changes.length === 0) expect(parameterResult.document.show).toStrictEqual(swept.show)
        else swept = applyOk(swept, 'update_boundary_transition_parameter', args).document
        applyOk(swept, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'durationMs', value: 0 })
        applyOk(swept, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'cut' })
      }
    }
  },
  set_boundary_transition_timing: () => {
    const document = fixture({ boundaryCrossfade: true })
    const first = clipAt(document, 0)
    const { document: next } = applyOk(document, 'set_boundary_transition_timing', {
      after_clip_id: first.clipId,
      duration_ms: 2_500,
      easing: 'ease-in-out',
    })
    const transition = next.show.transitions?.find((candidate) => candidate.afterSceneId === 's1')
    expect(transition?.durationMs).toBe(2_500)
    expect(transition?.easing).toEqual({ curve: 'quadratic', direction: 'in-out' })
    const tracked = showBoundaryCommandFixture()
    tracked.transitions[0].propertyTransitions = { brightness: { durationMs: 1500, easing: { curve: 'linear' }, fromByCellId: {} } }
    const opened = openShowDocument(tracked)
    if (!opened.ok) throw new Error('Boundary fixture')
    applyOk(opened.document, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', duration_ms: 1000 })
  },
  update_boundary_transition_parameter: () => {
    const document = fixture({ boundaryCrossfade: true })
    const { document: asWipe } = applyOk(document, 'set_boundary_transition', {
      at_ms: 30_000,
      kind: 'wipe',
    })
    const { document: next } = applyOk(asWipe, 'update_boundary_transition_parameter', {
      at_ms: 30_000,
      parameter: 'feather',
      value: 0.3,
    })
    const transition = next.show.transitions?.find((candidate) => candidate.afterSceneId === 's1')
    expect(transition && 'feather' in transition && transition.feather).toBe(0.3)
    const opened = openShowDocument(showBoundaryCommandFixture())
    if (!opened.ok) throw new Error('Boundary fixture')
    for (const { kind, variant } of BOUNDARY_VARIANT_CASES) {
      const selected = applyOk(opened.document, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind, variant, duration_ms: 1500 }).document
      applyOk(selected, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'durationMs', value: 0 })
    }
    let swept = opened.document
    for (const step of BOUNDARY_PARAMETER_CASES) {
      swept = applyOk(swept, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: step.kind }).document
      for (const [parameter, value] of step.sets) {
        const args = { transition_id: 'transition-scene-1', parameter, value }
        const result = applyShowGrammarOperation(swept, 'update_boundary_transition_parameter', args)
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('Boundary parameter refused')
        if (result.changes.length === 0) expect(result.document.show).toStrictEqual(swept.show)
        else swept = applyOk(swept, 'update_boundary_transition_parameter', args).document
        applyOk(swept, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'durationMs', value: 0 })
      }
    }
    applyOk(swept, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'easing', value: 'sine-in' })
  },
  set_boundary_layout: () => {
    const document = fixture({ boundaryCrossfade: true })
    const { document: next } = applyOk(document, 'set_boundary_layout', {
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
    for (const { kind, variant } of BOUNDARY_VARIANT_CASES) {
      const source = showLayerTransitionCommandFixture(false, false, true)
      source.transitions[0].propertyTransitions = { brightness: { durationMs: 500, easing: { curve: 'linear' }, fromByCellId: {} } }
      const opened = openShowDocument(source)
      if (!opened.ok) throw new Error('Boundary-pinned Layer fixture')
      const selected = applyOk(opened.document, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind, variant, duration_ms: 1500 }).document
      const reset = applyOk(selected, 'resize_layer_transition', { transition_id: 'connected-transition', duration_ms: 1000 })
      expect(reset.document.show.transitions[0].kind).toBe('cut')
    }
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
    for (const { kind, variant } of BOUNDARY_VARIANT_CASES) {
      const source = showLayerTransitionCommandFixture(false, false, true)
      source.transitions[0].propertyTransitions = { brightness: { durationMs: 500, easing: { curve: 'linear' }, fromByCellId: {} } }
      const opened = openShowDocument(source)
      if (!opened.ok) throw new Error('Boundary-pinned Layer fixture')
      const selected = applyOk(opened.document, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind, variant, duration_ms: 1500 }).document
      const reset = applyOk(selected, 'reset_layer_transition_to_cut', { transition_id: 'connected-transition' })
      expect(reset.document.show.transitions[0].kind).toBe('cut')
    }
    const base = withLayerTransition()
    const { document: next } = applyOk(base.document, 'reset_layer_transition_to_cut', {
      transition_id: base.transitionId,
    })
    expect((next.show.composition as ShowCompositionV1).transitions ?? []).toEqual([])
    expect(clipAt(next, 10_000).clipId).toBe(base.secondClipId)
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
    const tracked = { ...document, show: structuredClone(document.show) }
    tracked.show.composition!.scenes[0].propertyTracks = [{ id: 'effect-track', target: { kind: 'placement-effect', placementId: clip.startPlacementId, effectId, effectKind: 'brightness', parameterId: 'brightness' }, keyframes: [{ id: 'effect-key', timeMs: 2000, value: 0.4, easing: { curve: 'linear' } }, { id: 'effect-key-end', timeMs: 3000, value: 0.6, easing: { curve: 'linear' } }] }]
    const { document: next } = applyOk(tracked, 'remove_clip_effect', {
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
    applyOk(document, 'add_layout_interval', { layout_id: 'l1', duration_ms: 1000, at_ms: 15000 })
    const unique = applyOk(next, 'make_layout_interval_unique', { interval_id: projectShowLayoutIntervals(next.show)[1].id })
    applyOk(unique.document, 'add_layout_interval', { layout_id: unique.document.show.routingLayouts[1].id, duration_ms: 1000, at_ms: 0 })
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
    applyOk(document, 'duplicate_layout_interval', { interval_id: interval.id, with_content: true })
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
    applyOk(withSecond, 'make_layout_interval_unique', { interval_id: intervals[0].id })
    expect(next.show.routingLayouts.length).toBe(2)
  },
  rename_show: () => {
    const document = fixture()
    const { document: next, changes } = applyOk(document, 'rename_show', { name: '  Night Set  ' })
    expect(next.show.name).toBe('Night Set')
    expect(changes[0].description).toContain('Grammar fixture')
  },
  set_target_controller_profile: () => {
    const { document } = applyOk(fixture(), 'set_target_controller_profile', { profile_id: 'test-profile' })
    expect(document.show.targetControllerProfileId).toBe('test-profile')
    expect(applyOk(document, 'set_target_controller_profile', { profile_id: null }).document.show.targetControllerProfileId).toBeUndefined()
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
    expect(changes[0]).toMatchObject({ targetId: 'z1', before: { name: 'Main' }, after: { name: 'Ceiling' } })
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

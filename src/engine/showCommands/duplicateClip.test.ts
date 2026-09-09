import { expect, it } from 'vitest'
import { showOverlayLayerFixture } from '../../test/showOverlayLayerFixture'
import { duplicateLinkedShowClipAfter, duplicateShowClipAtGlobalTime, duplicateShowClipAfter } from '../showTimelineClipAuthoring'
import { validateShowComposition } from '../showCompositionModel'

it('duplicates only the requested placement and instance without normalizing unrelated authored records', () => {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  composition.markers!.push({ id: 'early', timeMs: 1000 })
  composition.scenes[1].propertyTracks = []
  composition.transitions = []
  const before = structuredClone(composition)
  const expected = structuredClone(before)
  expected.patternInstances.push({ ...structuredClone(before.patternInstances[2]), id: 'copy-instance' })
  expected.scenes[0].zones[0].overlays[0].placements.push({ id: 'copy', instanceId: 'copy-instance', startMs: 8000, durationMs: 6000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } })
  const result = duplicateShowClipAfter(show, composition, { owner: { kind: 'overlay', sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: 'clip-ov' }, newPlacementId: 'copy', newInstanceId: 'copy-instance' })
  expect(result).toStrictEqual(expected)
  expect(composition).toStrictEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
})


it.each([false, true])('copies complete Main settings and supported curves (linked %s)', linked => {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  composition.scenes[0].zones[0].main.pop()
  composition.patternInstances[1].time = { timeScale: 0.8, timeOffsetMs: 25 }
  composition.transitions = [{ id: 'incoming', fromPlacementId: 'clip-a', toPlacementId: 'clip-b', kind: 'crossfade', durationMs: 2000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live' }]
  const before = structuredClone(composition)
  const expected = structuredClone(before)
  if (!linked) expected.patternInstances.push({ ...structuredClone(before.patternInstances[1]), id: 'copy-instance' })
  expected.scenes[0].zones[0].main.push({ id: 'copy', instanceId: linked ? 'instance-b' : 'copy-instance', startMs: 20000, durationMs: 8000, view: { mirror: false, phase: 0, brightness: 1 } })
  expected.scenes[0].propertyTracks!.push({ id: 'track-b-copy', target: { kind: 'placement-view', placementId: 'copy', property: 'brightness' }, keyframes: [
    { id: 'kf-1-copy', timeMs: 20000, value: 1, easing: { curve: 'linear' } }, { id: 'kf-2-copy', timeMs: 27000, value: 0.2, easing: { curve: 'linear' } },
  ] })
  if (!linked) expected.scenes[0].propertyTracks!.push({ id: 'track-inst-b-copy-instance', target: { kind: 'instance-time-scale', instanceId: 'copy-instance' }, keyframes: [
    { id: 'kf-5-copy-instance', timeMs: 20000, value: 1, easing: { curve: 'linear' } }, { id: 'kf-6-copy-instance', timeMs: 27000, value: 0.75, easing: { curve: 'linear' } },
  ] })
  const owner = { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }
  const result = linked ? duplicateLinkedShowClipAfter(show, composition, { owner, newPlacementId: 'copy' }) : duplicateShowClipAfter(show, composition, { owner, newPlacementId: 'copy', newInstanceId: 'copy-instance' })
  expect(result).toStrictEqual(expected)
  expect(composition).toStrictEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
})

it('preserves the full multi-Scene span and original records at its free tail', async () => {
  const { showSplitClipFixture } = await import('../../test/showSplitClipFixture')
  const show = showSplitClipFixture()
  const composition = show.composition!
  composition.scenes[1].zones[0].main.pop()
  composition.groupOccurrences![0].zoneId = 'zone-2'
  composition.transitions!.pop()
  for (const scene of composition.scenes) scene.propertyTracks = []
  const before = structuredClone(composition)
  const expected = structuredClone(before)
  expected.patternInstances.push({ ...structuredClone(before.patternInstances[1]), id: 'copy-instance' })
  expected.scenes[1].zones[0].main.push({ id: 'copy', instanceId: 'copy-instance', startMs: 6000, durationMs: 24000, view: { mirror: false, phase: 0, brightness: 1 } })
  const result = duplicateShowClipAfter(show, composition, { owner: { kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }, newPlacementId: 'copy', newInstanceId: 'copy-instance' })
  expect(result).toStrictEqual(expected)
  expect(composition).toStrictEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
})

it('rejects malformed ownership, occupied tail, Group children and fresh identity collisions immutably', () => {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  const before = structuredClone(composition)
  const owner = { kind: 'overlay' as const, sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: 'clip-ov' }
  for (const patch of [{ sceneId: 'absent' }, { sceneId: 'scene-2' }, { zoneId: 'absent' }, { layerId: 'absent' }, { placementId: 'group-use:group-main' }]) {
    expect(duplicateShowClipAfter(show, composition, { owner: { ...owner, ...patch }, newPlacementId: 'copy', newInstanceId: 'copy-instance' })).toBe(composition)
  }
  for (const newPlacementId of ['', 'clip-a', 'clip-ov']) expect(duplicateShowClipAfter(show, composition, { owner, newPlacementId, newInstanceId: 'copy-instance' })).toBe(composition)
  for (const newInstanceId of ['', 'instance-a', 'instance-ov']) expect(duplicateShowClipAfter(show, composition, { owner, newPlacementId: 'copy', newInstanceId })).toBe(composition)
  expect(duplicateShowClipAfter(show, composition, { owner: { kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }, newPlacementId: 'copy', newInstanceId: 'copy-instance' })).toBe(composition)
  expect(composition).toStrictEqual(before)
  const malformed = structuredClone(composition)
  malformed.scenes[0].zones[0].main[0].instanceId = 'absent'
  expect(duplicateShowClipAfter(show, malformed, { owner, newPlacementId: 'copy', newInstanceId: 'copy-instance' })).toBe(malformed)
})

it('copies supported animation between single Scenes with local-time shifts and leaves surviving shared users unchanged', () => {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  const before = structuredClone(composition)
  const result = duplicateShowClipAtGlobalTime(show, composition, { owner: { kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-c' }, target: { kind: 'main', zoneId: 'zone-2', globalStartMs: 42000 }, newPlacementId: 'copy', newInstanceId: 'copy-instance' })
  const expected = structuredClone(before)
  expected.patternInstances.push({ ...structuredClone(before.patternInstances[0]), id: 'copy-instance' })
  expected.scenes[1].zones[1].main.push({ id: 'copy', instanceId: 'copy-instance', startMs: 10000, durationMs: 6000, view: { mirror: false, phase: 0, brightness: 1 } })
  expected.scenes[1].propertyTracks = [{ id: 'track-inst-copy-instance', target: { kind: 'instance-time-scale', instanceId: 'copy-instance' }, keyframes: [
    { id: 'kf-3-copy-instance', timeMs: 10500, value: 1, easing: { curve: 'linear' } }, { id: 'kf-4-copy-instance', timeMs: 15000, value: 0.5, easing: { curve: 'linear' } },
  ] }]
  expect(result).toStrictEqual(expected)
  expect(composition).toStrictEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
})


it.each([false, true])('manual duplication forfeits cast proof only for independent copies (linked %s)', linked => {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  composition.executionModel = 'deterministic-loop'
  const before = structuredClone(composition)
  const owner = { kind: 'overlay' as const, sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: 'clip-ov' }
  const result = linked ? duplicateLinkedShowClipAfter(show, composition, { owner, newPlacementId: 'copy' }) : duplicateShowClipAfter(show, composition, { owner, newPlacementId: 'copy', newInstanceId: 'copy-instance' })
  expect(result.executionModel).toBe(linked ? 'deterministic-loop' : undefined)
  expect(composition).toStrictEqual(before)
})


it('refuses derived track identity collisions instead of returning a repaired copy', () => {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  composition.scenes[0].zones[0].main.pop()
  const owner = { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }
  composition.scenes[0].propertyTracks![1].id = 'track-b-copy'
  const before = structuredClone(composition)
  expect(duplicateShowClipAfter(show, composition, { owner, newPlacementId: 'copy', newInstanceId: 'copy-instance' })).toBe(composition)
  expect(composition).toStrictEqual(before)
})

it.each([false, true])('preserves supported Cut copies and refuses multi-Scene placement animation (linked %s)', linked => {
  const show = showOverlayLayerFixture()
  show.transitions = [{ id: 'cut', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } }]
  const composition = show.composition!
  composition.scenes[0].zones[0].main = [{ id: 'source', instanceId: 'instance-a', startMs: 18000, durationMs: 8000, view: { brightness: 0.6, mirror: true, phase: 0.2 } }]
  for (const scene of composition.scenes) scene.propertyTracks = []
  composition.groupOccurrences = []
  const owner = { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'source' }
  const run = () => linked ? duplicateLinkedShowClipAfter(show, composition, { owner, newPlacementId: 'copy' }) : duplicateShowClipAfter(show, composition, { owner, newPlacementId: 'copy', newInstanceId: 'copy-instance' })
  const before = structuredClone(composition)
  const expected = structuredClone(before)
  if (!linked) expected.patternInstances.push({ ...structuredClone(before.patternInstances[0]), id: 'copy-instance' })
  expected.scenes[0].zones[0].main.push({ id: 'copy', instanceId: linked ? 'instance-a' : 'copy-instance', startMs: 26000, durationMs: 4000, view: { brightness: 0.6, mirror: true, phase: 0.2 } })
  expected.scenes[1].zones[0].main.push({ id: 'copy--span-scene-2', logicalClipId: 'copy', instanceId: linked ? 'instance-a' : 'copy-instance', startMs: 0, durationMs: 4000, view: { brightness: 0.6, mirror: true, phase: 0.2 } })
  expect(run()).toStrictEqual(expected)
  expect(composition).toStrictEqual(before)
  composition.scenes[0].propertyTracks = [{ id: 'animation', target: { kind: 'placement-view', placementId: 'source', property: 'brightness' }, keyframes: [{ id: 'a', timeMs: 18000, value: 0, easing: { curve: 'linear' } }, { id: 'b', timeMs: 26000, value: 1, easing: { curve: 'linear' } }] }]
  expect(run()).toBe(composition)
  composition.scenes[0].propertyTracks[0].target = { kind: 'instance-time-scale', instanceId: 'instance-a' }
  expect(run() === composition).toBe(!linked)
  if (linked) expect(run().scenes[0].propertyTracks).toStrictEqual(composition.scenes[0].propertyTracks)
  composition.scenes[0].propertyTracks = []
  composition.scenes[1].zones[0].main.push({ id: 'copy--span-scene-2', instanceId: 'instance-a', startMs: 10000, durationMs: 1000, view: { brightness: 1, mirror: false, phase: 0 } })
  expect(run()).toBe(composition)
})

it.each([28000, 59000, -1000, NaN])('refuses protected/out-of-Show direct destinations %s', globalStartMs => {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  const before = structuredClone(composition)
  expect(duplicateShowClipAtGlobalTime(show, composition, { owner: { kind: 'overlay', sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: 'clip-ov' }, target: { kind: 'main', zoneId: 'zone-2', globalStartMs }, newPlacementId: 'copy', newInstanceId: 'copy-instance' })).toBe(composition)
  expect(composition).toStrictEqual(before)
})

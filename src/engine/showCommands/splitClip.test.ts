import { expect, it } from 'vitest'
import { trackedCommandFixture } from '../../test/showCommandFixture'
import { splitShowClipAtGlobalTime } from '../showTimelineClipAuthoring'
import { validateShowComposition } from '../showCompositionModel'

it('splits a tracked Clip without normalizing unrelated authored order or changing shared state', () => {
  const show = trackedCommandFixture()
  const composition = show.composition!
  composition.markers = [{ id: 'late', timeMs: 2000 }, { id: 'early', timeMs: 1000 }]
  const before = structuredClone(composition)
  const expected = structuredClone(before)
  expected.scenes[0].zones[0].main.splice(1, 1,
    { id: 'clip-b', instanceId: 'instance-b', startMs: 12000, durationMs: 4000, view: { mirror: false, phase: 0, brightness: 1 } },
    { id: 'right', instanceId: 'instance-b', startMs: 16000, durationMs: 4000, view: { mirror: false, phase: 0, brightness: 1 } })
  expected.scenes[0].propertyTracks!.push({
    id: 'track-b-right', target: { kind: 'placement-view', placementId: 'right', property: 'brightness' },
    keyframes: [
      { id: 'kf-1-right', timeMs: 12000, value: 1, easing: { curve: 'linear' } },
      { id: 'kf-2-right', timeMs: 19000, value: 0.2, easing: { curve: 'linear' } },
    ],
  })
  const result = splitShowClipAtGlobalTime(show, composition, { owner: { kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }, globalTimeMs: 16000, newPlacementId: 'right' })
  expect(result).toEqual(expected)
  expect(composition).toEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
})

it('preserves complete multi-Scene order, Groups, instance tracks and Transition identities', async () => {
  const { showSplitClipFixture } = await import('../../test/showSplitClipFixture')
  const show = showSplitClipFixture()
  const composition = show.composition!
  composition.markers!.push({ id: 'early', timeMs: 1000 })
  const before = structuredClone(composition)
  const expected = structuredClone(before)
  expected.scenes[0].zones[0].main[1].durationMs = 4000
  expected.scenes[0].zones[0].main.push({ id: 'right', instanceId: 'instance-b', startMs: 16000, durationMs: 14000, view: { mirror: false, phase: 0, brightness: 1 } })
  expected.scenes[1].zones[0].main[0] = { id: 'right--span-scene-2', logicalClipId: 'right', instanceId: 'instance-b', startMs: 0, durationMs: 6000, view: { mirror: false, phase: 0, brightness: 1 } }
  expected.scenes[0].propertyTracks!.splice(1, 0, {
    id: 'track-b-right', target: { kind: 'placement-view', placementId: 'right', property: 'brightness' },
    keyframes: [
      { id: 'kf-1-right', timeMs: 12000, value: 1, easing: { curve: 'linear' } },
      { id: 'kf-2-right', timeMs: 19000, value: 0.2, easing: { curve: 'linear' } },
    ],
  })
  expected.scenes[1].propertyTracks![0].target = { kind: 'placement-view', placementId: 'right--span-scene-2', property: 'brightness' }
  expected.transitions![1].fromPlacementId = 'right--span-scene-2'
  expect(validateShowComposition(show, composition)).toEqual([])
  const result = splitShowClipAtGlobalTime(show, composition, { owner: { kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }, globalTimeMs: 16000, newPlacementId: 'right' })
  expect(result).toEqual(expected)
  expect(composition).toEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
})

it('refuses malformed owners and collisions without repairing input', async () => {
  const { showSplitClipFixture } = await import('../../test/showSplitClipFixture')
  const show = showSplitClipFixture()
  const composition = show.composition!
  const before = structuredClone(composition)
  const owner = { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }
  for (const patch of [{ sceneId: 'absent' }, { sceneId: 'scene-2' }, { zoneId: 'absent' }, { placementId: 'group-use:group-main' }]) {
    expect(splitShowClipAtGlobalTime(show, composition, { owner: { ...owner, ...patch }, globalTimeMs: 16000, newPlacementId: 'right' })).toBe(composition)
  }
  for (const newPlacementId of ['', 'clip-b', 'clip-ov', 'clip-b--span-scene-2']) {
    expect(splitShowClipAtGlobalTime(show, composition, { owner, globalTimeMs: 16000, newPlacementId })).toBe(composition)
  }
  expect(composition).toEqual(before)
  const malformed = structuredClone(composition)
  malformed.scenes[0].zones[0].main[0].instanceId = 'absent'
  expect(splitShowClipAtGlobalTime(show, malformed, { owner, globalTimeMs: 16000, newPlacementId: 'right' })).toBe(malformed)
})

it.each([0, 12000, 11999, 30000, 36000, 36001, 12000.1, 29999.6, 35999.6])('refuses the rounded endpoint/outside/internal Cut boundary %s', async atMs => {
  const { showSplitClipFixture } = await import('../../test/showSplitClipFixture')
  const { applyShowCommand } = await import('./registry')
  const show = showSplitClipFixture()
  const before = structuredClone(show)
  expect(applyShowCommand(show, 'split_clip', { clip_id: 'clip-b', at_ms: atMs }).ok).toBe(false)
  expect(show).toEqual(before)
})

it('retains hidden Scene Transition gap refusal', async () => {
  const { showSplitClipFixture } = await import('../../test/showSplitClipFixture')
  const { applyShowCommand } = await import('./registry')
  const { createDefaultShow } = await import('../showModel')
  const show = showSplitClipFixture()
  show.transitions = createDefaultShow('gap', 'gap', 1).transitions
  const before = structuredClone(show)
  for (const at_ms of [30000, 31000, 32000]) expect(applyShowCommand(show, 'split_clip', { clip_id: 'clip-b', at_ms }).ok).toBe(false)
  expect(show).toEqual(before)
})

it.each([12000.6, 15999.6, 33000.4])('reports truthful rounded split time %s and preserves unrelated fields', async atMs => {
  const { showSplitClipFixture } = await import('../../test/showSplitClipFixture')
  const { splitClipCommandOutcome } = await import('./splitClip')
  const show = showSplitClipFixture()
  const before = structuredClone(show)
  const result = splitClipCommandOutcome(show, { clip_id: 'clip-b', at_ms: atMs }, () => 'right')
  expect(result.ok, JSON.stringify(result)).toBe(true)
  if (!result.ok) throw new Error('split')
  expect(result.changes[0].details).toEqual({ leftClipId: 'clip-b', rightClipId: 'right', atMs: Math.round(atMs), transitionChanges: [{ transitionId: 'outgoing', fromPlacementId: atMs < 30000 ? 'right--span-scene-2' : 'right', toPlacementId: 'clip-c' }] })
  expect({ ...result.record, composition: before.composition, updatedAt: before.updatedAt }).toEqual(before)
  expect(result.record.composition!.patternInstances).toEqual(before.composition!.patternInstances)
  expect(validateShowComposition(result.record, result.record.composition!)).toEqual([])
  expect(show).toEqual(before)
})

it('splits an overlay with copied placement curves and preserves every other field', () => {
  const show = trackedCommandFixture()
  const composition = show.composition!
  composition.scenes[0].propertyTracks!.push({ id: 'opacity', target: { kind: 'placement-opacity', placementId: 'clip-ov' }, keyframes: [{ id: 'o1', timeMs: 2000, value: 0, easing: { curve: 'linear' } }, { id: 'o2', timeMs: 8000, value: 1, easing: { curve: 'linear' } }] })
  const before = structuredClone(composition)
  const expected = structuredClone(before)
  expected.scenes[0].zones[0].overlays[0].placements = [
    { id: 'clip-ov', instanceId: 'instance-ov', startMs: 2000, durationMs: 2000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
    { id: 'right', instanceId: 'instance-ov', startMs: 4000, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
  ]
  expected.scenes[0].propertyTracks!.push({ id: 'opacity-right', target: { kind: 'placement-opacity', placementId: 'right' }, keyframes: [{ id: 'o1-right', timeMs: 2000, value: 0, easing: { curve: 'linear' } }, { id: 'o2-right', timeMs: 8000, value: 1, easing: { curve: 'linear' } }] })
  const owner = { kind: 'overlay' as const, sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: 'clip-ov' }
  const result = splitShowClipAtGlobalTime(show, composition, { owner, globalTimeMs: 4000.4, newPlacementId: 'right' })
  expect(result).toStrictEqual(expected)
  expect(composition).toStrictEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
  expect(splitShowClipAtGlobalTime(show, composition, { owner: { ...owner, layerId: 'absent' }, globalTimeMs: 4000, newPlacementId: 'right' })).toBe(composition)
})

it('does not add absent Transition or track properties during a multi-Scene split', async () => {
  const { showSplitClipFixture } = await import('../../test/showSplitClipFixture')
  const show = showSplitClipFixture()
  const composition = show.composition!
  delete composition.transitions
  for (const scene of composition.scenes) delete scene.propertyTracks
  const result = splitShowClipAtGlobalTime(show, composition, { owner: { kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }, globalTimeMs: 16000, newPlacementId: 'right' })
  expect(result).not.toBe(composition)
  expect(Object.prototype.hasOwnProperty.call(result, 'transitions')).toBe(false)
  expect(result.scenes.every(scene => !Object.prototype.hasOwnProperty.call(scene, 'propertyTracks'))).toBe(true)
})

it('preserves an explicitly empty unrelated track collection', async () => {
  const { showSplitClipFixture } = await import('../../test/showSplitClipFixture')
  const show = showSplitClipFixture()
  show.composition!.scenes[1].propertyTracks = []
  const result = splitShowClipAtGlobalTime(show, show.composition!, { owner: { kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-b' }, globalTimeMs: 16000, newPlacementId: 'right' })
  expect(result.scenes[1].propertyTracks).toEqual([])
})

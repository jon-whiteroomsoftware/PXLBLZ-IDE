import { expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import type { ShowCompositionV1 } from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'
import { moveShowConnectedClipAtGlobalTime, resetShowLayerTransitionToCut } from './showLayerTransitionAuthoring'
import { moveShowClipExactly } from './showExactClipMove'

function fixture() {
  const show = createDefaultShow('move', 'Move', 1_000)
  show.scenes = [{ ...show.scenes[0], durationMs: 20_000 }]
  show.transitions = []
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [{ id: 'instance', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'Rings', time: { timeScale: 1, timeOffsetMs: 0 } }],
    scenes: [{ sceneId: show.scenes[0].id, zones: [{ zoneId: show.zones[0].id, main: [{ id: 'a', instanceId: 'instance', startMs: 0, durationMs: 2_000, view: { mirror: false, phase: 0, brightness: 1 } }], overlays: [] }] }],
  }
  return { show, composition }
}

it('moves the named Clip exactly and validates an already satisfied request without changes', () => {
  const { show, composition } = fixture()
  const before = structuredClone(composition)
  const result = moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 5_000 })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const expected = structuredClone(before)
  expected.scenes[0].zones[0].main[0].startMs = 5_000
  expect(result.composition).toEqual(expected)
  expect(validateShowComposition(show, result.composition)).toEqual([])
  expect(moveShowClipExactly(show, result.composition, { clipId: 'a', globalStartMs: 5_000 })).toEqual({ status: 'noop', composition: result.composition })
  expect(composition).toEqual(before)
})

for (const overlay of [false, true]) it(`preserves a ${overlay ? 'overlay' : 'Main'} chain in both directions`, () => {
  const { show, composition } = fixture()
  const zone = composition.scenes[0].zones[0]
  zone.main.push({ ...zone.main[0], id: 'b', startMs: 3_000 })
  composition.transitions = [{ id: 'ab', fromPlacementId: 'a', toPlacementId: 'b', durationMs: 1_000, kind: 'crossfade', easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
  if (overlay) { zone.overlays = [{ id: 'overlay', name: 'Overlay', placements: zone.main.map(p => ({ ...p, opacity: 1 })) }]; zone.main = [] }
  const original = structuredClone(composition)
  const moved = moveShowClipExactly(show, composition, { clipId: 'b', globalStartMs: 8_000 })
  expect(moved.status, JSON.stringify(moved)).toBe('changed')
  if (moved.status !== 'changed') return
  const returned = moveShowClipExactly(show, moved.composition, { clipId: 'b', globalStartMs: 6_000 })
  expect(returned.status).toBe('changed')
  if (returned.status !== 'changed') return
  const expected = structuredClone(original)
  const placements = overlay ? expected.scenes[0].zones[0].overlays[0].placements : expected.scenes[0].zones[0].main
  placements[0].startMs = 3_000; placements[1].startMs = 6_000
  expect(returned.composition).toEqual(expected)
  const owner = overlay ? { kind: 'overlay' as const, sceneId: show.scenes[0].id, zoneId: zone.zoneId, placementId: 'b', layerId: 'overlay' } : { kind: 'main' as const, sceneId: show.scenes[0].id, zoneId: zone.zoneId, placementId: 'b' }
  const target = overlay ? { kind: 'overlay' as const, zoneId: zone.zoneId, layerIndex: 0, globalStartMs: 6_000 } : { kind: 'main' as const, zoneId: zone.zoneId, globalStartMs: 6_000 }
  expect(returned.composition).toEqual(moveShowConnectedClipAtGlobalTime(show, composition, { owner, target }))
  expect(returned.movedClipIds).toEqual(['a', 'b'])
  expect(validateShowComposition(show, returned.composition)).toEqual([])
  expect(composition).toEqual(original)
})

it('retains destination forms and refuses connected detachment atomically', () => {
  const { show, composition } = fixture()
  const zone = composition.scenes[0].zones[0]
  zone.overlays = [{ id: 'overlay', name: 'Overlay', placements: [] }]
  const original = structuredClone(composition)
  const moved = moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 5_000, layer: 0 })
  expect(moved.status, JSON.stringify(moved)).toBe('changed')
  if (moved.status !== 'changed') return
  expect(moved.composition.scenes[0].zones[0].main).toEqual([])
  expect(moved.composition.scenes[0].zones[0].overlays[0].placements).toEqual([{ ...zone.main[0], startMs: 5_000, opacity: 1 }])
  expect(moveShowClipExactly(show, moved.composition, { clipId: 'a', globalStartMs: 5_000, layer: 0 }).status).toBe('noop')
  zone.main.push({ ...zone.main[0], id: 'b', startMs: 3_000 })
  composition.transitions = [{ id: 'ab', fromPlacementId: 'a', toPlacementId: 'b', durationMs: 1_000, kind: 'crossfade', easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
  const connected = structuredClone(composition)
  expect(moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 5_000, layer: 0 })).toMatchObject({ status: 'refused', code: 'unsupported-topology' })
  expect(composition).toEqual(connected)
  for (const request of [{ layer: 9 }, { zoneId: 'missing' }, { layer: -1 }, { layer: 0.5 }]) {
    expect(moveShowClipExactly(show, original, { clipId: 'a', globalStartMs: 0, ...request }).status).toBe('refused')
  }
})

it('refuses visual boundary destruction but supports crossing an implicit Cut', () => {
  const { show, composition } = fixture()
  show.scenes[0].durationMs = 10_000
  show.scenes.push({ id: 'second', name: 'Second', durationMs: 10_000 })
  const zone = composition.scenes[0].zones[0]
  composition.scenes.push({ sceneId: 'second', zones: [{ zoneId: zone.zoneId, main: [], overlays: [] }] })
  const crossing = moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 9_000 })
  expect(crossing.status).toBe('changed')
  if (crossing.status !== 'changed') return
  expect(crossing.composition.scenes[0].zones[0].main[0]).toMatchObject({ id: 'a', startMs: 9_000, durationMs: 1_000 })
  expect(crossing.composition.scenes[1].zones[0].main[0]).toMatchObject({ logicalClipId: 'a', startMs: 0, durationMs: 1_000 })
  expect(validateShowComposition(show, crossing.composition)).toEqual([])
  zone.main[0].durationMs = 10_000
  zone.overlays = [{ id: 'overlay', name: 'Overlay', placements: [] }]
  composition.scenes[1].zones[0].main = [{ ...zone.main[0], id: 'b' }]
  composition.scenes[1].zones[0].overlays = [{ id: 'overlay-second', name: 'Overlay', placements: [] }]
  show.transitions = [{ id: 'boundary', afterSceneId: show.scenes[0].id, kind: 'crossfade', durationMs: 1_000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
  const original = structuredClone({ show, composition })
  expect(moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 0, layer: 0 })).toMatchObject({ status: 'refused', code: 'unsupported-topology' })
  expect({ show, composition }).toEqual(original)
})

it('rejects Group targets before no-op and reports moves that change only Layer', () => {
  const { show, composition } = fixture()
  const zone = composition.scenes[0].zones[0]
  zone.overlays = [{ id: 'overlay', name: 'Overlay', placements: [] }]
  const moved = moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 0, layer: 0 })
  expect(moved).toMatchObject({ status: 'changed', movedClipIds: ['a'] })
  composition.groupDefinitions = [{ id: 'definition', name: 'Group', patternInstances: structuredClone(composition.patternInstances), placements: [{ ...zone.main[0], id: 'inside', layerOffset: 0, opacity: 1 }] }]
  zone.main = []
  composition.groupOccurrences = [{ id: 'occurrence', definitionId: 'definition', sceneId: show.scenes[0].id, zoneId: show.zones[0].id, startMs: 0, baseLayer: 0, translationX: 0, translationY: 0 }]
  expect(validateShowComposition(show, composition)).toEqual([])
  for (const globalStartMs of [0, 5_000]) expect(moveShowClipExactly(show, composition, { clipId: 'occurrence:inside', globalStartMs })).toMatchObject({ status: 'refused', code: 'unsupported-topology' })
})

for (const shared of [false, true]) it(`moves owned animation across Scene and Zone, preserving ${shared ? 'shared' : 'sole-use'} instance ownership`, () => {
  const { show, composition } = fixture()
  show.scenes[0].durationMs = 10_000
  show.scenes.push({ id: 'second', name: 'Second', durationMs: 10_000 })
  show.zones.push({ ...show.zones[0], id: 'other-zone', name: 'Other' })
  const zone = composition.scenes[0].zones[0]
  composition.scenes[0].zones.push({ zoneId: 'other-zone', main: [], overlays: [] })
  composition.scenes.push({ sceneId: 'second', zones: show.zones.map(z => ({ zoneId: z.id, main: [], overlays: [] })) })
  if (shared) zone.main.push({ ...zone.main[0], id: 'untouched', startMs: 6_000 })
  composition.scenes[0].propertyTracks = [
    { id: 'view', target: { kind: 'placement-view', placementId: 'a', property: 'brightness' }, keyframes: [{ id: 'view-key', timeMs: 1_000, value: 0.5, easing: { curve: 'linear' } }, { id: 'view-end', timeMs: 2_000, value: 1, easing: { curve: 'linear' } }] },
    { id: 'time', target: { kind: 'instance-time-scale', instanceId: 'instance' }, keyframes: [{ id: 'time-key', timeMs: 1_000, value: 1, easing: { curve: 'linear' } }, { id: 'time-end', timeMs: 2_000, value: 2, easing: { curve: 'linear' } }] },
  ]
  expect(validateShowComposition(show, composition)).toEqual([])
  const original = structuredClone(composition)
  const moved = moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 12_000, zoneId: 'other-zone', layer: 'main' })
  expect(moved.status, JSON.stringify(moved)).toBe('changed')
  if (moved.status !== 'changed') return
  const expected = structuredClone(original)
  expected.scenes[0].zones[0].main.shift()
  expected.scenes[1].zones[1].main.push({ ...zone.main[0], startMs: 2_000 })
  const tracks = expected.scenes[0].propertyTracks!
  expected.scenes[1].propertyTracks = tracks.filter(track => !shared || track.id === 'view').map(track => ({ ...track, keyframes: track.keyframes.map(key => ({ ...key, timeMs: key.timeMs + 2_000 })) }))
  if (shared) expected.scenes[0].propertyTracks = [tracks[1]]
  else { delete expected.scenes[0].propertyTracks; expected.scenes[1].propertyTracks.reverse() }
  expect(moved.composition).toEqual(expected)
  expect(validateShowComposition(show, moved.composition)).toEqual([])
  expect(composition).toEqual(original)
})

it('requires explicit reset-to-Cut before moving a connected Clip to another Layer', () => {
  const { show, composition } = fixture()
  const zone = composition.scenes[0].zones[0]
  zone.main.push({ ...zone.main[0], id: 'b', startMs: 3_000 })
  zone.overlays = [{ id: 'overlay', name: 'Overlay', placements: [] }]
  composition.transitions = [{ id: 'ab', fromPlacementId: 'a', toPlacementId: 'b', durationMs: 1_000, kind: 'crossfade', easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
  const cut = resetShowLayerTransitionToCut(show, composition, 'ab')
  expect(cut.transitions ?? []).toEqual([])
  const moved = moveShowClipExactly(show, cut, { clipId: 'b', globalStartMs: 6_000, layer: 0 })
  expect(moved.status, JSON.stringify(moved)).toBe('changed')
  if (moved.status !== 'changed') return
  expect(moved.composition.scenes[0].zones[0].main).toEqual([zone.main[0]])
  expect(moved.composition.scenes[0].zones[0].overlays[0].placements).toEqual([{ ...zone.main[1], startMs: 6_000, opacity: 1 }])
  expect(validateShowComposition(show, moved.composition)).toEqual([])
})

it('refuses invalid, occupied and outside-Show requests without partial changes or clamping', () => {
  const { show, composition } = fixture()
  const zone = composition.scenes[0].zones[0]
  zone.main.push({ ...zone.main[0], id: 'neighbor', startMs: 8_000 })
  const original = structuredClone({ show, composition })
  for (const globalStartMs of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 7_000, 19_000, 20_000]) {
    expect(moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs }).status).toBe('refused')
    expect({ show, composition }).toEqual(original)
  }
  expect(moveShowClipExactly(show, composition, { clipId: 'missing', globalStartMs: 0 })).toMatchObject({ status: 'refused', code: 'missing-target' })
  zone.main[1].startMs = 1_000
  const invalid = structuredClone(composition)
  expect(moveShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 0 })).toMatchObject({ status: 'refused', code: 'domain-refusal' })
  expect(composition).toEqual(invalid)
})

it('bounds the entire chain and leaves an unrelated neighbor unchanged', () => {
  const { show, composition } = fixture()
  const zone = composition.scenes[0].zones[0]
  zone.main.push({ ...zone.main[0], id: 'b', startMs: 3_000 }, { ...zone.main[0], id: 'neighbor', startMs: 15_000 })
  composition.transitions = [{ id: 'ab', fromPlacementId: 'a', toPlacementId: 'b', durationMs: 1_000, kind: 'crossfade', easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
  const original = structuredClone(composition)
  for (const globalStartMs of [2_999, 14_000, 19_000]) expect(moveShowClipExactly(show, composition, { clipId: 'b', globalStartMs }).status).toBe('refused')
  const moved = moveShowClipExactly(show, composition, { clipId: 'b', globalStartMs: 8_000 })
  expect(moved.status).toBe('changed')
  if (moved.status !== 'changed') return
  expect(moved.composition.scenes[0].zones[0].main[2]).toEqual(original.scenes[0].zones[0].main[2])
  expect(composition).toEqual(original)
})

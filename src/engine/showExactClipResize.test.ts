import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import type { ShowCompositionV1 } from './personalContentRecords'
import { projectFlatShowToCompositionV1, validateShowComposition } from './showCompositionModel'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import { resizeShowClipExactly } from './showExactClipResize'

function fixture(overlay = false) {
  const show = createDefaultShow('exact-resize', 'Exact resize', 1_000)
  show.scenes = [{ ...show.scenes[0], durationMs: 20_000 }]
  show.transitions = []
  const placements = [placement('a', 0, 4_000), placement('b', 8_000, 2_000)]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [{ id: 'instance', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'Rings', time: { timeScale: 1, timeOffsetMs: 0 } }],
    scenes: [{ sceneId: show.scenes[0].id, zones: [{ zoneId: show.zones[0].id,
      main: overlay ? [] : placements,
      overlays: overlay ? [{ id: 'layer', name: 'Overlay', placements: placements.map(clip => ({ ...clip, opacity: 1 })) }] : [],
    }] }],
  }
  return { show, composition }
}
function placement(id: string, startMs: number, durationMs: number) {
  return { id, instanceId: 'instance', startMs, durationMs, view: { mirror: false, phase: 0, brightness: 1 } }
}
function ranges(show: ReturnType<typeof createDefaultShow>, composition: ShowCompositionV1) {
  return projectShowUnifiedTimeline(show, composition).zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])))
}

function connectedFixture(overlay = false) {
  const value = fixture()
  value.composition.scenes[0].zones[0].main = [placement('a', 0, 2_000), placement('b', 3_000, 2_000), placement('c', 6_000, 2_000), placement('obstruction', 9_000, 1_000)]
  value.composition.transitions = [['ab', 'a', 'b'], ['bc', 'b', 'c']].map(([id, fromPlacementId, toPlacementId]) => ({ id, fromPlacementId, toPlacementId, kind: 'crossfade', durationMs: 1_000, easing: { curve: 'sine', direction: 'in-out' }, crossfadePolicy: 'live-live' }))
  if (overlay) {
    const zone = value.composition.scenes[0].zones[0]
    zone.overlays = [{ id: 'connected-overlay', name: 'Connected', placements: zone.main.map(clip => ({ ...clip, opacity: 1 })) }]
    zone.main = []
  }
  return value
}

describe('exact Clip resize semantic owner', () => {
  it('resizes a logical Clip across Scenes and preserves original segment identities', () => {
    const { show, composition } = fixture()
    show.scenes[0].durationMs = 10_000
    show.scenes.push({ id: 'second', name: 'Second', durationMs: 10_000 })
    const zone = composition.scenes[0].zones[0]
    zone.main = [placement('a', 9_000, 1_000)]
    composition.scenes.push({ sceneId: 'second', zones: [{ zoneId: zone.zoneId, main: [{ ...placement('a--span-second', 0, 3_000), logicalClipId: 'a' }, placement('b', 8_000, 2_000)], overlays: [] }] })
    const original = structuredClone(composition)
    const result = resizeShowClipExactly(show, composition, { clipId: 'a', globalEndMs: 15_000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(original)
    expected.scenes[1].zones[0].main[0].durationMs = 5_000
    expect(result.composition).toEqual(expected)
    expect(ranges(show, result.composition)).toEqual([['a', 9_000, 6_000], ['b', 18_000, 2_000]])
    expect(validateShowComposition(show, result.composition)).toEqual([])
    expect(resizeShowClipExactly(show, result.composition, { clipId: 'a', durationMs: 6_000 }).status).toBe('noop')
    expect(resizeShowClipExactly(show, result.composition, { clipId: 'a--span-second', durationMs: 6_000 })).toMatchObject({ status: 'refused', code: 'missing-target' })
    expect(composition).toEqual(original)
  })
  it('retargets a connected logical Clip end when growth enters another Scene', () => {
    const { show, composition } = fixture()
    show.scenes = [show.scenes[0], { id: 'second', name: 'Second', durationMs: 10_000 }, { id: 'third', name: 'Third', durationMs: 10_000 }]
    show.scenes[0].durationMs = 10_000
    const zoneId = show.zones[0].id
    composition.scenes = show.scenes.map((scene, index) => ({ sceneId: scene.id, zones: [{ zoneId, main: index === 0 ? [placement('a', 9_000, 1_000)] : index === 1 ? [{ ...placement('a--span-second', 0, 3_000), logicalClipId: 'a' }, placement('b', 4_000, 2_000)] : [], overlays: [] }] }))
    composition.transitions = [{ id: 'ab', fromPlacementId: 'a--span-second', toPlacementId: 'b', kind: 'crossfade', durationMs: 1_000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
    const original = structuredClone(composition)
    const result = resizeShowClipExactly(show, composition, { clipId: 'a', durationMs: 12_000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(original)
    expected.scenes[1].zones[0].main = [{ ...placement('a--span-second', 0, 10_000), logicalClipId: 'a' }]
    expected.scenes[2].zones[0].main = [{ ...placement('a--span-third', 0, 1_000), logicalClipId: 'a' }, placement('b', 2_000, 2_000)]
    expected.transitions![0].fromPlacementId = 'a--span-third'
    expect(result.composition).toEqual(expected)
    expect(ranges(show, result.composition)).toEqual([['a', 9_000, 12_000], ['b', 22_000, 2_000]])
    expect(result.changedClipIds).toEqual(['a', 'b'])
    expect(result.movedClipIds).toEqual(['b'])
    expect(result.transitionChanges).toEqual([])
    expect(validateShowComposition(show, result.composition)).toEqual([])
    expect(composition).toEqual(original)
  })
  it('refuses Group-owned Clips even when the requested range is already satisfied', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].main = []
    composition.groupDefinitions = [{ id: 'definition', name: 'Group', patternInstances: structuredClone(composition.patternInstances), placements: [{ ...placement('inside', 0, 4_000), layerOffset: 0, opacity: 1 }] }]
    composition.groupOccurrences = [{ id: 'occurrence', definitionId: 'definition', sceneId: show.scenes[0].id, zoneId: show.zones[0].id, startMs: 0, baseLayer: 0, translationX: 0, translationY: 0 }]
    const original = structuredClone(composition)
    expect(validateShowComposition(show, composition)).toEqual([])
    for (const durationMs of [4_000, 5_000]) {
      expect(resizeShowClipExactly(show, composition, { clipId: 'occurrence:inside', durationMs }))
        .toMatchObject({ status: 'refused', code: 'unsupported-topology' })
    }
    expect(composition).toEqual(original)
  })
  it('refuses a broken visual Scene-boundary junction without changing the Show', () => {
    const show = createDefaultShow('boundary', 'Boundary', 1_000)
    const composition = projectFlatShowToCompositionV1(show, { byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, 'export function render(index) { rgb(1, 0, 0) }'])), stageDimension: 1 })
    const original = structuredClone({ show, composition })
    expect(resizeShowClipExactly(show, composition, { clipId: 'placement-cell-2-scene-2', globalStartMs: 36_000, durationMs: 26_000 }))
      .toMatchObject({ status: 'refused', code: 'unsupported-topology' })
    expect({ show, composition }).toEqual(original)
  })
  it.each([[false, 1_000], [false, 3_000], [true, 1_000], [true, 3_000]] as const)('resizes a middle connected Clip exactly and reports its moved successor (overlay=%s, duration=%s)', (overlay, durationMs) => {
    const { show, composition } = connectedFixture(overlay)
    const original = structuredClone(composition)
    const result = resizeShowClipExactly(show, composition, { clipId: 'b', durationMs })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(original)
    const zone = expected.scenes[0].zones[0]
    const placements = overlay ? zone.overlays[0].placements : zone.main
    placements[1].durationMs = durationMs
    placements[2].startMs = durationMs === 1_000 ? 5_000 : 7_000
    expect(result.composition).toEqual(expected)
    expect(result.changedClipIds).toEqual(['b', 'c'])
    expect(result.movedClipIds).toEqual(['c'])
    expect(validateShowComposition(show, result.composition)).toEqual([])
    expect(composition).toEqual(original)
  })
  it('bounds the whole connected chain at Show End and preserves an incoming-only connection', () => {
    const { show, composition } = connectedFixture()
    composition.scenes[0].zones[0].main.pop()
    show.scenes[0].durationMs = 8_000
    const original = structuredClone(composition)
    expect(resizeShowClipExactly(show, composition, { clipId: 'a', durationMs: 2_001 }))
      .toMatchObject({ status: 'refused', code: 'no-space', availableRange: { startMs: 0, endMs: 2_000 } })
    const result = resizeShowClipExactly(show, composition, { clipId: 'c', durationMs: 1_000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(original)
    expected.scenes[0].zones[0].main[2].durationMs = 1_000
    expect(result.composition).toEqual(expected)
    expect(result.movedClipIds).toEqual([])
    expect(composition).toEqual(original)
  })
  it('preserves a multi-Clip chain and refuses insufficient space atomically', () => {
    const { show, composition } = connectedFixture()
    const original = structuredClone(composition)
    const result = resizeShowClipExactly(show, composition, { clipId: 'a', durationMs: 3_000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(ranges(show, result.composition)).toEqual([['a', 0, 3_000], ['b', 4_000, 2_000], ['c', 7_000, 2_000], ['obstruction', 9_000, 1_000]])
    expect(result.composition.transitions).toEqual(original.transitions)
    expect(result.changedClipIds).toEqual(['a', 'b', 'c'])
    expect(result.movedClipIds).toEqual(['b', 'c'])
    expect(resizeShowClipExactly(show, composition, { clipId: 'a', durationMs: 3_001 }))
      .toMatchObject({ status: 'refused', code: 'no-space', availableRange: { startMs: 0, endMs: 3_000 } })
    expect(resizeShowClipExactly(show, composition, { clipId: 'b', durationMs: 3_001 }))
      .toMatchObject({ status: 'refused', code: 'no-space', availableRange: { startMs: 3_000, endMs: 6_000 } })
    expect(resizeShowClipExactly(show, composition, { clipId: 'b', durationMs: 2_000 })).toEqual({ status: 'noop', composition })
    expect(composition).toEqual(original)
  })
  it('preserves explicit leading-edge timing adjustment and refuses Transition removal', () => {
    const { show, composition } = connectedFixture()
    const original = structuredClone(composition)
    const result = resizeShowClipExactly(show, composition, { clipId: 'b', globalStartMs: 3_500, durationMs: 1_500 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(original)
    expected.scenes[0].zones[0].main[1] = placement('b', 3_500, 1_500)
    expected.transitions![0].durationMs = 1_500
    expect(result.composition).toEqual(expected)
    expect(result.transitionChanges).toEqual([{ transitionId: 'ab', previousDurationMs: 1_000, durationMs: 1_500 }])
    expect(resizeShowClipExactly(show, composition, { clipId: 'b', globalStartMs: 2_000, durationMs: 3_000 }))
      .toMatchObject({ status: 'refused', code: 'unsupported-topology' })
    expect(composition).toEqual(original)
  })
  it.each([false, true])('reports exact same-Layer and Show capacity without clamping (overlay=%s)', overlay => {
    const { show, composition } = fixture(overlay)
    const original = structuredClone(composition)
    for (const durationMs of [7_999, 8_000]) {
      expect(resizeShowClipExactly(show, composition, { clipId: 'a', durationMs }).status).toBe('changed')
    }
    for (const durationMs of [8_001, 12_000]) {
      expect(resizeShowClipExactly(show, composition, { clipId: 'a', durationMs }))
        .toMatchObject({ status: 'refused', code: 'no-space', availableRange: { startMs: 0, endMs: 8_000 } })
    }
    expect(composition).toEqual(original)
    const zone = composition.scenes[0].zones[0]
    if (overlay) zone.overlays[0].placements.pop()
    else zone.main.pop()
    expect(resizeShowClipExactly(show, composition, { clipId: 'a', globalEndMs: 20_000 }).status).toBe('changed')
    expect(resizeShowClipExactly(show, composition, { clipId: 'a', durationMs: 20_001 }))
      .toMatchObject({ status: 'refused', code: 'no-space', availableRange: { startMs: 0, endMs: 20_000 } })
  })
  it('accepts overlap on another Layer and exact explicit start/end input', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].overlays.push({ id: 'other', name: 'Other', placements: [{ ...placement('other', 1_000, 5_000), opacity: 1 }] })
    composition.scenes[0].propertyTracks = ['a', 'b'].map((id, index) => ({
      id: `track-${id}`, target: { kind: 'placement-view', placementId: id, property: 'brightness' },
      keyframes: [
        { id: `key-${id}-1`, timeMs: index === 0 ? 500 : 8_500, value: 0.2, easing: { curve: 'linear' } },
        { id: `key-${id}-2`, timeMs: index === 0 ? 1_500 : 9_500, value: 0.8, easing: { curve: 'linear' } },
      ],
    }))
    const original = structuredClone(composition)
    const result = resizeShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 1_000, globalEndMs: 8_000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(original)
    expected.scenes[0].zones[0].main[0] = placement('a', 1_000, 7_000)
    expected.scenes[0].propertyTracks![0].keyframes[0].timeMs = 1_500
    expected.scenes[0].propertyTracks![0].keyframes[1].timeMs = 2_500
    expect(result.composition).toEqual(expected)
    expect(result.movedClipIds).toEqual(['a'])
    expect(composition).toEqual(original)
  })
  it('recognizes only a valid already-satisfied request as no-op', () => {
    const { show, composition } = fixture()
    expect(resizeShowClipExactly(show, composition, { clipId: 'a', durationMs: 4_000 }))
      .toEqual({ status: 'noop', composition })
    for (const durationMs of [0, -1, NaN, Infinity, 4_000.1]) {
      expect(resizeShowClipExactly(show, composition, { clipId: 'a', durationMs }))
        .toMatchObject({ status: 'refused', code: 'invalid-request' })
    }
    expect(resizeShowClipExactly(show, composition, { clipId: 'a', globalStartMs: 0.5, durationMs: 3_999.5 }))
      .toMatchObject({ status: 'refused', code: 'invalid-request' })
    expect(resizeShowClipExactly(show, composition, { clipId: 'missing', durationMs: 4_000 }))
      .toMatchObject({ status: 'refused', code: 'missing-target' })
    expect(resizeShowClipExactly(show, composition, { clipId: 'a', durationMs: 4_000, globalEndMs: 4_000 } as never))
      .toMatchObject({ status: 'refused', code: 'invalid-request' })
    const invalid = structuredClone(composition)
    invalid.scenes[0].zones[0].main[1].startMs = 3_000
    expect(resizeShowClipExactly(show, invalid, { clipId: 'a', durationMs: 4_000 }))
      .toMatchObject({ status: 'refused', code: 'domain-refusal' })
  })
  it.each([false, true])('accepts an exact neighbor boundary and preserves the complete composition (overlay=%s)', overlay => {
    const { show, composition } = fixture(overlay)
    const original = structuredClone(composition)
    const result = resizeShowClipExactly(show, composition, { clipId: 'a', durationMs: 8_000 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(original)
    const zone = expected.scenes[0].zones[0]
    ;(overlay ? zone.overlays[0].placements : zone.main)[0].durationMs = 8_000
    expect(result.composition).toEqual(expected)
    expect(ranges(show, result.composition)).toEqual([['a', 0, 8_000], ['b', 8_000, 2_000]])
    expect(validateShowComposition(show, result.composition)).toEqual([])
    expect(result.changedClipIds).toEqual(['a'])
    expect(result.movedClipIds).toEqual([])
    expect(composition).toEqual(original)
  })
})

it.each([false, true])('preserves authored Transition positions through both resize reattachments, reversed=%s', reversed => {
  for (const request of [{ clipId: 'a', durationMs: 3000 }, { clipId: 'b', globalStartMs: 3500, durationMs: 1500 }]) {
    const { show, composition } = connectedFixture()
    if (reversed) composition.transitions!.reverse()
    const original = structuredClone(composition)
    const result = resizeShowClipExactly(show, composition, request)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') continue
    const expected = structuredClone(original)
    const clips = expected.scenes[0].zones[0].main
    if (request.clipId === 'a') {
      clips[0].durationMs = 3000
      clips[1].startMs = 4000
      clips[2].startMs = 7000
    } else {
      clips[1].startMs = 3500
      clips[1].durationMs = 1500
      expected.transitions!.find(transition => transition.id === 'ab')!.durationMs = 1500
    }
    expect(result.composition).toStrictEqual(expected)
    expect(result.composition.transitions!.map(transition => transition.id)).toEqual(original.transitions!.map(transition => transition.id))
    expect(validateShowComposition(show, result.composition)).toEqual([])
    expect(composition).toStrictEqual(original)
  }
})

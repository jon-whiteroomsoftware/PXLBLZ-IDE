import { expect, it } from 'vitest'
import { showCommandFixture } from '../../test/showCommandFixture'
import { addShowOverlayLayerAcrossTimeline } from '../showTimelineClipAuthoring'
import { validateShowComposition } from '../showCompositionModel'

it('inserts a fresh topmost Layer without normalizing unrelated authored content', () => {
  const show = showCommandFixture()
  const composition = show.composition!
  composition.markers = [{ id: 'late', timeMs: 2000 }, { id: 'early', timeMs: 1000 }]
  const before = structuredClone(composition)
  const result = addShowOverlayLayerAcrossTimeline(show, composition, { zoneId: 'zone-1', layers: [
    { sceneId: 'scene-1', layerId: 'new-1' }, { sceneId: 'scene-2', layerId: 'new-2' },
  ] })
  const expected = structuredClone(before)
  expected.scenes[0].zones[0].overlays.unshift({ id: 'new-1', name: 'Layer 2', placements: [] })
  expected.scenes[1].zones[0].overlays.unshift({ id: 'new-2', name: 'Layer 2', placements: [] })
  expect(result).toEqual(expected)
  expect(validateShowComposition(show, result)).toEqual([])
  expect(composition).toEqual(before)
})

it('refuses malformed Scene mappings and fresh identity collisions atomically', () => {
  const show = showCommandFixture()
  const composition = show.composition!
  const before = structuredClone(show)
  const good = [{ sceneId: 'scene-1', layerId: 'new-1' }, { sceneId: 'scene-2', layerId: 'new-2' }]
  const cases = [[], good.slice(0, 1), [...good, good[0]], [good[0], { sceneId: 'absent', layerId: 'new-2' }],
    [good[0], { sceneId: 'scene-2', layerId: 'new-1' }],
    [good[0], { sceneId: 'scene-2', layerId: 'overlay-1' }],
    [good[0], { sceneId: 'scene-2', layerId: '' }],
  ]
  for (const layers of cases) expect(addShowOverlayLayerAcrossTimeline(show, composition, { zoneId: 'zone-1', layers })).toBe(composition)
  expect(addShowOverlayLayerAcrossTimeline(show, composition, { zoneId: 'absent', layers: good })).toBe(composition)
  expect(show).toEqual(before)
})

it('exposes a fresh canonical creation on every invocation and refuses missing composition', async () => {
  const { applyShowCommand } = await import('./registry')
  const show = showCommandFixture()
  const result = applyShowCommand(show, 'add_overlay_layer', { zone_id: 'zone-1' })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  const again = applyShowCommand(result.record, 'add_overlay_layer', { zone_id: 'zone-1' })
  expect(again.ok).toBe(true)
  if (again.ok) {
    expect(again.record.composition!.scenes[0].zones[0].overlays).toHaveLength(3)
    expect(again.record.composition!.scenes[0].zones[0].overlays[0].id).not.toBe(result.record.composition!.scenes[0].zones[0].overlays[0].id)
  }
  expect(applyShowCommand({ ...show, composition: undefined }, 'add_overlay_layer', { zone_id: 'zone-1' })).toMatchObject({ ok: false, issues: [{ code: 'missing-composition' }] })
})

it('preserves complete two-Zone content and mixed Group materialized Layer identities', async () => {
  const { showOverlayLayerFixture } = await import('../../test/showOverlayLayerFixture')
  const { materializeShowGroupOccurrences } = await import('../showGroupModel')
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  const before = structuredClone(show)
  const result = addShowOverlayLayerAcrossTimeline(show, composition, { zoneId: 'zone-1', layers: [
    { sceneId: 'scene-2', layerId: 'new-2' }, { sceneId: 'scene-1', layerId: 'new-1' },
  ] })
  const expected = structuredClone(composition)
  expected.scenes[0].zones[0].overlays.unshift({ id: 'new-1', name: 'Layer 3', placements: [] })
  expected.scenes[1].zones[0].overlays.unshift({ id: 'new-2', name: 'Layer 3', placements: [] })
  expect(result).toEqual(expected)
  expect(show).toEqual(before)
  expect(validateShowComposition(show, result)).toEqual([])
  const materializedBefore = materializeShowGroupOccurrences(composition)
  const materializedAfter = materializeShowGroupOccurrences(result)
  expect(materializedAfter.scenes[1].zones[0].main).toEqual(materializedBefore.scenes[1].zones[0].main)
  expect(materializedAfter.scenes[1].zones[0].overlays[1]).toEqual(materializedBefore.scenes[1].zones[0].overlays[0])
  expect(materializedAfter.scenes[1].zones[0].overlays[1].placements[0].id).toBe('group-use:group-overlay')
})

it('refuses empty, invalid and missing Scene owners without mutation', () => {
  for (const modify of [
    (show: ReturnType<typeof showCommandFixture>) => { show.composition!.scenes = [] },
    (show: ReturnType<typeof showCommandFixture>) => { show.composition!.scenes[1].zones = [] },
    (show: ReturnType<typeof showCommandFixture>) => { show.composition!.scenes[1].sceneId = 'absent' },
    (show: ReturnType<typeof showCommandFixture>) => { show.composition!.scenes[0].zones[0].main[0].instanceId = 'absent' },
  ]) {
    const show = showCommandFixture()
    modify(show)
    const composition = show.composition!
    const before = structuredClone(show)
    expect(addShowOverlayLayerAcrossTimeline(show, composition, { zoneId: 'zone-1', layers: composition.scenes.map((scene, index) => ({ sceneId: scene.sceneId, layerId: `new-${index}` })) })).toBe(composition)
    expect(show).toEqual(before)
  }
})

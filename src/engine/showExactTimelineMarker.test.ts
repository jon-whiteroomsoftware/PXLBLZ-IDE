import { expect, it } from 'vitest'
import { showCommandFixture, trackedCommandFixture } from '../test/showCommandFixture'
import { validateShowComposition } from './showCompositionModel'
import { addShowTimelineMarker, moveShowTimelineMarker, updateShowTimelineMarker, removeShowTimelineMarker } from './showTimelineAuthoring'
import { editShowMarkerExactly, editShowMarkerFromUI, type ShowMarkerRequest } from './showExactTimelineMarker'

it('preserves complete unrelated records and references across add move update remove and no-op sequences', () => {
  let show = trackedCommandFixture()
  show.zones.push({ id: 'zone-2', name: 'Second', nominalPixelCount: 10 })
  show.composition!.scenes.forEach(scene => {
    scene.zones.push({ zoneId: 'zone-2', main: [], overlays: [] })
    scene.zones[0].overlays.push({ id: `second-overlay-${scene.sceneId}`, name: 'Second overlay', placements: [] })
  })
  show.composition!.patternInstances[2].pattern = { kind: 'stock', id: 'pre-existing-missing' }
  // Authoring order is intentionally non-normalized; a marker edit does not own it.
  show.composition!.patternInstances.reverse()
  const original = structuredClone(show)
  const requests: ShowMarkerRequest[] = [
    { kind: 'add', marker: { id: 'new', timeMs: 0, name: 'Start', color: 'custom' } },
    { kind: 'move', markerId: 'new', timeMs: 62_000 },
    { kind: 'move', markerId: 'new', timeMs: 70_000 },
    { kind: 'move', markerId: 'new', timeMs: 1_000 },
    { kind: 'update', markerId: 'new', patch: { name: 'Changed' } },
    { kind: 'update', markerId: 'new', patch: { color: 'anything' } },
    { kind: 'update', markerId: 'new', patch: { timeMs: Number.MAX_SAFE_INTEGER, name: 'End', color: '' } },
  ]
  const expectedMarkers = [
    { id: 'new', timeMs: 0, name: 'Start', color: 'custom' },
    { id: 'new', timeMs: 62_000, name: 'Start', color: 'custom' },
    { id: 'new', timeMs: 70_000, name: 'Start', color: 'custom' },
    { id: 'new', timeMs: 1_000, name: 'Start', color: 'custom' },
    { id: 'new', timeMs: 1_000, name: 'Changed', color: 'custom' },
    { id: 'new', timeMs: 1_000, name: 'Changed', color: 'anything' },
    { id: 'new', timeMs: Number.MAX_SAFE_INTEGER, name: 'End', color: '' },
  ]
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(show)
    const result = editShowMarkerExactly(show, request)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') throw new Error('refused')
    expect(show).toEqual(before)
    expect(result.record.composition!.markers!.find(marker => marker.id === 'new')).toEqual(expectedMarkers[index])
    expect(result.record).toEqual({ ...show, updatedAt: result.record.updatedAt, composition: { ...show.composition, markers: result.record.composition!.markers } })
    expect(result.record.composition!.markers!.find(m => m.id === 'marker-1')).toEqual(original.composition!.markers![0])
    expect(validateShowComposition(result.record, result.record.composition!)).toEqual([])
    expect(result.record.composition!.scenes).toBe(show.composition!.scenes)
    show = result.record
  }
  expect(editShowMarkerExactly(show, requests[requests.length - 1])).toEqual({ status: 'noop', record: show })
  const removed = editShowMarkerExactly(show, { kind: 'remove', markerId: 'new' })
  expect(removed.status).toBe('changed')
  if (removed.status === 'changed') expect(removed.record).toEqual({ ...original, updatedAt: removed.record.updatedAt })
})

it('refuses invalid requests and missing or duplicate identities without touching input', () => {
  const show = showCommandFixture()
  const original = structuredClone(show)
  const bad: ShowMarkerRequest[] = [
    { kind: 'add', marker: { id: 'marker-1', timeMs: 1 } },
    { kind: 'add', marker: { id: '', timeMs: 1 } },
    { kind: 'remove', markerId: 'missing' },
    { kind: 'move', markerId: 'missing', timeMs: 1 },
    { kind: 'update', markerId: 'marker-1', patch: {} },
    { kind: 'update', markerId: 'missing', patch: { name: 'A' } },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].flatMap(timeMs => [
      { kind: 'add' as const, marker: { id: 'new', timeMs } },
      { kind: 'move' as const, markerId: 'marker-1', timeMs },
      { kind: 'update' as const, markerId: 'marker-1', patch: { timeMs } },
    ]),
  ]
  for (const request of bad) expect(editShowMarkerExactly(show, request).status).toBe('refused')
  expect(show).toEqual(original)
  show.composition!.markers!.push({ ...show.composition!.markers![0] })
  expect(editShowMarkerExactly(show, { kind: 'move', markerId: 'marker-1', timeMs: 12_000 })).toMatchObject({ status: 'refused', code: 'duplicate-marker' })
})

it('keeps manual rounding and explicit name clearing and pairs supported exact results', () => {
  const show = showCommandFixture()
  const rounded = editShowMarkerFromUI(show, { kind: 'move', markerId: 'marker-1', timeMs: 10.7 })
  const exact = editShowMarkerExactly(show, { kind: 'move', markerId: 'marker-1', timeMs: 11 })
  expect(rounded.status).toBe('changed')
  expect(exact.status).toBe('changed')
  if (rounded.status === 'changed' && exact.status === 'changed') {
    expect({ ...rounded.record, updatedAt: exact.record.updatedAt }).toEqual(exact.record)
  }
  const cleared = editShowMarkerFromUI(show, { kind: 'update', markerId: 'marker-1', patch: { name: undefined } })
  expect(cleared.status).toBe('changed')
  if (cleared.status !== 'changed') throw new Error('refused')
  expect(cleared.record.composition!.markers![0]).not.toHaveProperty('name')
  expect(editShowMarkerFromUI(cleared.record, { kind: 'update', markerId: 'marker-1', patch: { name: undefined } })).toEqual({ status: 'noop', record: cleared.record })
})

it('shares tie-time ordering, optional field clearing and empty collection behavior with legacy manual entrypoints', () => {
  const show = showCommandFixture()
  const marker = { id: 'a-first', timeMs: 12_000, name: 'Tie' }
  const added = addShowTimelineMarker(show, marker)
  expect(added.composition!.markers!.map(value => value.id)).toEqual(['a-first', 'marker-1'])
  expect(moveShowTimelineMarker(added, 'a-first', 12_000)).toBe(added)
  const updated = updateShowTimelineMarker(added, 'a-first', { name: undefined })
  expect(updated.composition!.markers![0]).toEqual({ id: 'a-first', timeMs: 12_000 })
  const removed = removeShowTimelineMarker(removeShowTimelineMarker(updated, 'a-first'), 'marker-1')
  expect(removed.composition).not.toHaveProperty('markers')
  expect(removeShowTimelineMarker(removed, 'absent')).toBe(removed)
  for (const timeMs of [NaN, Infinity, -Infinity]) expect(editShowMarkerFromUI(show, { kind: 'move', markerId: 'marker-1', timeMs }).status).toBe('refused')
})

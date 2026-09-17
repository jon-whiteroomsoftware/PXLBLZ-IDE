import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { editShowMarkerV2, type ShowMarkerEditIntentV2 } from './showMarkersV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { buildShowEpeExport } from './showEpeExport'

function record(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  converted.record.composition.markers = [{ id: 'early', timeMs: 0, name: 'Opening' }, { id: 'later', timeMs: 500, name: 'Later', color: '#ff8800' }]
  return converted.record
}
function reopen(source: ShowRecordV2): ShowRecordV2 {
  expect(validateShowRecordV2(source)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(source))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  expect(opened.record).toEqual(source)
  return opened.record
}
function unchangedContent(actual: ShowRecordV2, expected: ShowRecordV2): void {
  const projection = structuredClone(actual)
  projection.composition.markers = structuredClone(expected.composition.markers)
  expect(projection).toEqual(expected)
}
function emptyOtherAffected(result: ReturnType<typeof editShowMarkerV2>): void {
  for (const [key, value] of Object.entries(result)) if ((key.startsWith('affected') && key !== 'affectedMarkerIds') || key === 'discardedControlTargets') expect(value, key).toEqual([])
}

it('adds equal-time and dormant Markers with stable ordering and complete unaliased results', () => {
  const source = record()
  const before = structuredClone(source)
  const added = editShowMarkerV2(source, { kind: 'add', marker: { id: 'before-later', timeMs: 500, name: 'Equal time', color: '' } })
  expect(added.status).toBe('changed')
  if (added.status !== 'changed') return
  expect(reopen(added.record).composition.markers.map(marker => marker.id)).toEqual(['early', 'before-later', 'later'])
  expect(added.affectedMarkerIds).toEqual(['before-later'])
  expect(added.removedIds).toEqual([])
  emptyOtherAffected(added)
  expect(added.record.updatedAt).toBe(source.updatedAt)
  unchangedContent(added.record, before)
  expect(source).toEqual(before)
  expect(added.record.composition.clips).not.toBe(source.composition.clips)
  expect(added.record.composition.markers[0]).not.toBe(source.composition.markers[0])
  added.record.composition.clips[0].appearance.keys[0].value.view.brightness = 0.7
  expect(source).toEqual(before)

  const dormant = editShowMarkerV2(source, { kind: 'add', marker: { id: 'dormant', timeMs: Number.MAX_SAFE_INTEGER } })
  expect(dormant.status).toBe('changed')
  if (dormant.status !== 'changed') return
  expect(reopen(dormant.record).composition.markers[dormant.record.composition.markers.length - 1]).toEqual({ id: 'dormant', timeMs: Number.MAX_SAFE_INTEGER })
  expect(dormant.record.composition.showEndMs).toBe(source.composition.showEndMs)
})

it('moves exact Marker time across peers and Show End without touching choreography', () => {
  const source = record()
  const moved = editShowMarkerV2(source, { kind: 'move', markerId: 'early', timeMs: 10000 })
  expect(moved.status).toBe('changed')
  if (moved.status !== 'changed') return
  const actual = reopen(moved.record)
  expect(actual.composition.markers.map(marker => [marker.id, marker.timeMs])).toEqual([['later', 500], ['early', 10000]])
  expect(actual.composition.markers[1].name).toBe('Opening')
  expect(moved.affectedMarkerIds).toEqual(['early'])
  emptyOtherAffected(moved)
  unchangedContent(actual, source)
})

it.each([
  ['canonically equivalent strings remain distinct', ['é', 'é'], ['é', 'é']],
  ['locale-sensitive strings use code-unit order', ['ä', 'z'], ['z', 'ä']],
] as const)('orders equal-time IDs deterministically: %s', (_name, ids, expected) => {
  const outputs: ShowRecordV2['composition']['markers'][] = []
  for (const insertionOrder of [ids, [...ids].reverse()]) {
    const source = record()
    const before = structuredClone(source)
    let candidate = source
    for (const id of insertionOrder) {
      const result = editShowMarkerV2(candidate, { kind: 'add', marker: { id, timeMs: 250 } })
      expect(result.status).toBe('changed')
      if (result.status !== 'changed') throw new Error('Marker add refused')
      expect(result.affectedMarkerIds).toEqual([id])
      emptyOtherAffected(result)
      candidate = reopen(result.record)
    }
    expect(candidate.composition.markers.map(marker => marker.id)).toEqual(['early', ...expected, 'later'])
    outputs.push(candidate.composition.markers)
    unchangedContent(candidate, before)
    expect(source).toEqual(before)
    const noOp = editShowMarkerV2(candidate, { kind: 'move', markerId: ids[0], timeMs: 250 })
    expect(noOp.status).toBe('unchanged')
    expect(noOp.record).toBe(candidate)
    expect(noOp.affectedMarkerIds).toEqual([])
  }
  expect(outputs[0]).toEqual(outputs[1])
})

it('updates and clears optional fields explicitly while retaining exact Marker identity', () => {
  const source = record()
  const updated = editShowMarkerV2(source, { kind: 'update', markerId: 'later', patch: { name: '', color: undefined, timeMs: 0 } })
  expect(updated.status).toBe('changed')
  if (updated.status !== 'changed') return
  expect(reopen(updated.record).composition.markers).toEqual([{ id: 'early', timeMs: 0, name: 'Opening' }, { id: 'later', timeMs: 0, name: '' }])
  expect('color' in updated.record.composition.markers[1]).toBe(false)
  const cleared = editShowMarkerV2(updated.record, { kind: 'update', markerId: 'later', patch: { name: undefined } })
  expect(cleared.status).toBe('changed')
  if (cleared.status !== 'changed') return
  expect(reopen(cleared.record).composition.markers[1]).toEqual({ id: 'later', timeMs: 0 })
  unchangedContent(cleared.record, source)
  expect(source.composition.markers[1]).toEqual({ id: 'later', timeMs: 500, name: 'Later', color: '#ff8800' })
})

it('removes only the selected Marker and retains required empty v2 storage', () => {
  let source = record()
  for (const markerId of ['early', 'later']) {
    const before = structuredClone(source)
    const result = editShowMarkerV2(source, { kind: 'remove', markerId })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.affectedMarkerIds).toEqual([markerId])
    expect(result.removedIds).toEqual([markerId])
    emptyOtherAffected(result)
    unchangedContent(result.record, before)
    expect(source).toEqual(before)
    source = reopen(result.record)
  }
  expect(source.composition.markers).toEqual([])
  expect(Object.prototype.hasOwnProperty.call(source.composition, 'markers')).toBe(true)
})

it.each([
  { kind: 'move', markerId: 'early', timeMs: 0 },
  { kind: 'update', markerId: 'later', patch: { name: 'Later', color: '#ff8800', timeMs: 500 } },
  { kind: 'update', markerId: 'early', patch: { color: undefined } },
] satisfies ShowMarkerEditIntentV2[])('returns exact no-op identity and empty affected collections for %j', intent => {
  const source = record()
  const before = structuredClone(source)
  const result = editShowMarkerV2(source, intent)
  expect(result.status).toBe('unchanged')
  expect(result.record).toBe(source)
  expect(result.affectedMarkerIds).toEqual([])
  expect(result.removedIds).toEqual([])
  emptyOtherAffected(result)
  expect(source).toEqual(before)
})

it.each([
  { kind: 'add', marker: { id: 'later', timeMs: 100 } },
  { kind: 'add', marker: { id: '', timeMs: 100 } },
  { kind: 'add', marker: { id: 'new', timeMs: -1 } },
  { kind: 'move', markerId: 'early', timeMs: 0.5 },
  { kind: 'move', markerId: 'early', timeMs: Number.MAX_SAFE_INTEGER + 1 },
  { kind: 'move', markerId: 'missing', timeMs: 100 },
  { kind: 'remove', markerId: 'missing' },
  { kind: 'update', markerId: 'later', patch: {} },
  { kind: 'update', markerId: 'later', patch: { timeMs: undefined } },
  { kind: 'update', markerId: 'later', patch: { id: 'hijack' } },
  { kind: 'update', markerId: 'later', patch: { role: 'act' } },
  { kind: 'add', marker: { id: 'new', timeMs: 100, role: 'verse' } },
  { kind: 'add', marker: { id: 'new', timeMs: 100, name: 42 } },
  { kind: 'remove', markerId: 'later', extra: true },
  { kind: 'move', markerId: 'later', timeMs: Infinity },
  { kind: 'add', marker: null },
  { kind: 'unknown', markerId: 'later' },
  null,
])('refuses strict invalid/duplicate/missing Marker intent %j atomically', intent => {
  const source = record()
  const before = structuredClone(source)
  const result = editShowMarkerV2(source, intent as unknown as ShowMarkerEditIntentV2)
  expect(result.status).toBe('refused')
  expect(result.record).toBe(source)
  expect(result.affectedMarkerIds).toEqual([])
  expect(result.removedIds).toEqual([])
  emptyOtherAffected(result)
  expect(source).toEqual(before)
})

it('refuses an invalid preimage without repairing or collecting Markers', () => {
  const source = record()
  source.composition.markers.push(structuredClone(source.composition.markers[0]))
  const before = structuredClone(source)
  expect(editShowMarkerV2(source, { kind: 'remove', markerId: 'early' })).toMatchObject({ status: 'refused', code: 'invalid-record', record: source, affectedMarkerIds: [] })
  expect(source).toEqual(before)
})

it.each(['fast', 'fidelity'] as const)('reopens Marker CRUD with unchanged playback recipe/.epe source and state in %s', fidelity => {
  const source = reopen(record())
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render(index){rgb(elapsed/1000,index/pixelCount,0)}' } }
  const initial = prepareShowV2ForCompile(source, lookup, { libraries: LIBRARIES })
  if (initial.status !== 'ready') throw new Error(JSON.stringify(initial.issues))
  const artifact = compileShow(initial.recipe, LIBRARIES)
  const exportOptions = { id: 'markers', stampedAt: '2026-09-16T00:00:00.000Z' }
  const initialEpe = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, exportOptions).text)
  let candidate = source
  for (const intent of [
    { kind: 'add', marker: { id: 'dormant', timeMs: 10000, name: 'Guide' } },
    { kind: 'move', markerId: 'dormant', timeMs: 500 },
    { kind: 'update', markerId: 'dormant', patch: { name: undefined, color: '#00ff00' } },
    { kind: 'remove', markerId: 'dormant' },
  ] satisfies ShowMarkerEditIntentV2[]) {
    const result = editShowMarkerV2(candidate, intent)
    if (result.status !== 'changed') throw new Error(JSON.stringify(result))
    candidate = reopen(result.record)
    const prepared = prepareShowV2ForCompile(candidate, lookup, { libraries: LIBRARIES })
    expect(prepared).toEqual(initial)
    if (prepared.status !== 'ready') return
    const currentArtifact = compileShow(prepared.recipe, LIBRARIES)
    expect(currentArtifact.code).toBe(artifact.code)
    const opened = parseEpe(buildShowEpeExport(convertibleV1Show(), currentArtifact.code, exportOptions).text)
    expect(opened.src).toBe(initialEpe.src)
    const left = createFastReplayRuntime({ ...artifact, dimension: 1 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25], pos: [0.25, 0.5] }, { sample: [0.75], pos: [0.75, 0.5] }] })
    const right = createFastReplayRuntime({ ...currentArtifact, code: opened.src, dimension: 1 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25], pos: [0.25, 0.5] }, { sample: [0.75], pos: [0.75, 0.5] }] })
    for (const atMs of [0, 125, 500, 999, 1000, 1125]) {
      const a = left.advanceTo(atMs, { stepMs: 125 })
      const b = right.advanceTo(atMs, { stepMs: 125 })
      expect(a.frame).toHaveLength(6)
      expect(Array.from(a.frame)).toEqual(Array.from(b.frame))
      expect(a.exports).toEqual(b.exports)
    }
  }
  expect(candidate).toEqual(source)
})

it('refuses unsafe existing dormant Marker time without normalizing or removing it', () => {
  const source = record()
  source.composition.markers[1].timeMs = Number.MAX_SAFE_INTEGER + 1
  const before = structuredClone(source)
  const result = editShowMarkerV2(source, { kind: 'remove', markerId: 'later' })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-record', affectedMarkerIds: [] })
  expect(result.record).toBe(source)
  expect(source).toEqual(before)
})

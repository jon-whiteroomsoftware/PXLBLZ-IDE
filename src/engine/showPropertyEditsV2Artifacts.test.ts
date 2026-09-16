import { expect, it } from 'vitest'
import { propertyEditRecord, propertyEditTrack, propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2, type ShowPropertyTargetV2 } from './showCompositionV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import { evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
const source = 'export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,.1+.6*x,.1+.6*y)}'
const families: ShowPropertyTargetV2[] = [
  { kind: 'instance-time-scale', instanceId: 'instance' }, { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderGain' },
  { kind: 'clip-opacity', clipId: 'clip' }, { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
  { kind: 'clip-transform', clipId: 'clip', property: 'positionX' }, { kind: 'clip-aperture', clipId: 'clip', property: 'width' },
  { kind: 'clip-effect', clipId: 'clip', effectId: 'turn', effectKind: 'rotate', parameterId: 'turns' },
  { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'layout:occurrence:1' }, { kind: 'show-repeat-scale' },
]
function fixture(target: ShowPropertyTargetV2): ShowRecordV2 {
  const record = propertyEditRecord(); record.composition.executionModel = 'continuous'
  if (target.kind === 'layout-occurrence-split-position') {
    record.zones.push({ id: 'right', name: 'Right', nominalPixelCount: 16 })
    record.zoneLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'right'] }
    record.composition.layers.push({ id: 'right-layer', zoneId: 'right', name: 'Right', rank: 0 })
    target.layoutOccurrenceId = record.composition.layoutOccurrences[0].id
  }
  record.composition.clips[0].appearance.keys[0].value.aperture = { enabled: true, x: 0.5, y: 0.5, width: 1, height: 1, edge: 'hard' }
  return record
}
function runtime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const decoded = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record)); expect(decoded.status).toBe('opened')
  if (decoded.status !== 'opened') throw Error('Reopen')
  const prepared = prepareShowV2ForCompile(decoded.record, { byCellId: {}, byPatternInstanceId: { instance: source }, stageDimension: 2 }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready'); if (prepared.status !== 'ready') throw Error('Prepare')
  const compiled = compileShow(prepared.recipe, LIBRARIES)
  const exported = buildShowEpeExportV2(decoded.record, compiled.code, { stampedAt: '2026-09-16T00:00:00.000Z' }); expect(exported.status).toBe('exported')
  if (exported.status !== 'exported') throw Error(exported.message)
  const opened = parseEpe(exported.text); expect(opened.stamp?.kind).toBe('show')
  return createFastReplayRuntime({ ...compiled, code: opened.src, fxCode: emitFixedPoint(opened.src), dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.45, 0.5], pos: [0.45, 0.5] }, { sample: [0.75, 0.25], pos: [0.75, 0.25] }] })
}
it.each(families.flatMap(target => (['fast', 'fidelity'] as const).map(fidelity => ({ target, fidelity }))))('native $target.kind CRUD preserves independent authored EPE output/state ($fidelity)', ({ target, fidelity }) => {
  const input = fixture(structuredClone(target)); const concreteTarget = target.kind === 'layout-occurrence-split-position' ? { ...target, layoutOccurrenceId: input.composition.layoutOccurrences[0].id } : target
  const authored = propertyEditTrack(concreteTarget); const repeat = target.kind === 'show-repeat-scale'; const base = repeat ? 2 : 0.2; const delta = repeat ? 2 : 0.6
  authored.keyframes[0].value = base + delta * 0.01; authored.keyframes[1].value = base + delta * 0.81
  authored.keyframes[0].curveSegment = { baseValue: base, deltaValue: delta, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 100 }
  authored.keyframes[1].timeMs = 800
  const added = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track: authored }); expect(added.status).toBe('changed')
  const retained = added.record.composition.propertyTracks[0]
  expect(evaluateShowPropertyTrackV2(retained, 399)).toBeCloseTo(base + delta * 0.499 ** 2)
  expect(evaluateShowPropertyTrackV2(retained, 800)).toBeCloseTo(base + delta * 0.81)
  expect(evaluateShowPropertyTrackV2(retained, 1000)).toBeUndefined()
  const independent = structuredClone(input); independent.composition.propertyTracks = [structuredClone(authored)]
  const a = runtime(added.record, fidelity); const b = runtime(independent, fidelity)
  for (const atMs of [0, 125, 250, 375, 500, 625, 750, 875]) {
    const actual = a.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true }); const expected = b.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true })
    expect(actual.frame).toEqual(expected.frame); expect(Object.keys(actual.exports).length).toBeGreaterThan(0); expect(actual.exports).toEqual(expected.exports)
  }
  const updated = editShowPropertyV2(added.record, { kind: 'show' }, { kind: 'update-key', trackId: authored.id, keyId: 'left', patch: { value: base, easing: { curve: 'linear' } } }); expect(updated.status).toBe('changed')
  const manual = structuredClone(input); manual.composition.propertyTracks = [{ ...propertyEditTrack(concreteTarget), keyframes: [{ id: 'left', timeMs: 0, value: base, easing: { curve: 'linear' } }, { id: 'right', timeMs: 800, value: base + delta * 0.81, easing: { curve: 'linear' } }] }]
  const edited = runtime(updated.record, fidelity); const reference = runtime(manual, fidelity)
  for (const atMs of [0, 125, 250, 375, 500, 625, 750, 875]) {
    const actual = edited.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true }); const expected = reference.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true })
    expect(actual.frame).toEqual(expected.frame); expect(Object.keys(actual.exports).length).toBeGreaterThan(0); expect(actual.exports).toEqual(expected.exports)
  }
  const removed = editShowPropertyV2(updated.record, { kind: 'show' }, { kind: 'remove-track', trackId: authored.id }); expect(removed.status).toBe('changed')
  expect(removed.record).toEqual(input)
})

it.each(['fast', 'fidelity'] as const)('linked held definition edit preserves independently authored shared-state EPE (%s)', fidelity => {
  const input = propertyEditGroupRecord(); input.composition.executionModel = 'continuous'
  const local = propertyEditTrack({ kind: 'clip-view', clipId: 'child', property: 'brightness' }); local.activeDurationMs = 400
  local.keyframes = [
    { id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'linear' }, curveSegment: { baseValue: 0.2, deltaValue: 0.6, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 400, elapsedOffsetMs: 0 } },
    { id: 'b', timeMs: 200, value: 0.35, easing: { curve: 'linear' }, curveSegment: { baseValue: 0.2, deltaValue: 0.6, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 400, elapsedOffsetMs: 200 } },
    { id: 'c', timeMs: 400, value: 0.8, easing: { curve: 'linear' } },
  ]
  input.composition.groupDefinitions[0].propertyTracks = [local]
  const edited = editShowPropertyV2(input, { kind: 'group-definition', definitionId: 'definition' }, { kind: 'update-key', trackId: local.id, keyId: 'b', patch: { value: 0.35 } })
  expect(edited.status).toBe('changed'); expect(edited.affectedGroupOccurrenceIds).toEqual(['occ-0', 'occ-1'])
  const independent = structuredClone(input)
  independent.composition.groupDefinitions[0].propertyTracks = [{ ...propertyEditTrack(local.target), activeDurationMs: 400, keyframes: [{ id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'b', timeMs: 200, value: 0.35, easing: { curve: 'linear' } }, { id: 'c', timeMs: 400, value: 0.8, easing: { curve: 'linear' } }] }]
  const actual = runtime(edited.record, fidelity); const expected = runtime(independent, fidelity)
  for (const atMs of [0, 125, 250, 375, 500, 625, 750, 875]) {
    const a = actual.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true }); const b = expected.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true })
    expect(a.frame).toEqual(b.frame); expect(Object.keys(a.exports).length).toBeGreaterThan(0); expect(a.exports).toEqual(b.exports)
  }
  expect(edited.record.composition.patternInstances).toEqual(input.composition.patternInstances)
  expect(edited.record.composition.groupOccurrences).toEqual(input.composition.groupOccurrences)
})

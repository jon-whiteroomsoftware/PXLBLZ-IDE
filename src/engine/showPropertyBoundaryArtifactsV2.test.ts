import { expect, it } from 'vitest'
import { propertyEditRecord, propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2, type ShowPropertyTargetV2, type ShowPropertyTrackV2 } from './showCompositionV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { evaluateShowPropertyKeysV2 } from './showPropertyTrackTimeMappingV2'
import { LIBRARIES } from '../pixelblaze/libs'
const source = 'export var elapsed=0;export var roll=0;var gain=.4;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d;roll=random(1)}export function render2D(i,x,y){rgb(gain,.25+.5*x,.25+.5*y)}'
function runtime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record)); expect(opened.status).toBe('opened'); if (opened.status !== 'opened') throw Error('Reopen')
  const prepared = prepareShowV2ForCompile(opened.record, { byCellId: {}, byPatternInstanceId: { instance: source }, stageDimension: 2 }, { libraries: LIBRARIES }); expect(prepared.status, JSON.stringify(prepared)).toBe('ready'); if (prepared.status !== 'ready') throw Error('Prepare')
  const compiled = compileShow(prepared.recipe, LIBRARIES)
  const exported = buildShowEpeExportV2(opened.record, compiled.code, { stampedAt: '2026-09-16T00:00:00.000Z' }); expect(exported.status).toBe('exported'); if (exported.status !== 'exported') throw Error('Export')
  const epe = parseEpe(exported.text)
  return createFastReplayRuntime({ ...compiled, code: epe.src, fxCode: emitFixedPoint(epe.src), dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.45, 0.5], pos: [0.45, 0.5] }, { sample: [0.75, 0.25], pos: [0.75, 0.25] }] })
}
const targets: ShowPropertyTargetV2[] = [
  { kind: 'instance-time-scale', instanceId: 'instance' }, { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderGain' },
  { kind: 'clip-opacity', clipId: 'clip' }, { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
  { kind: 'clip-transform', clipId: 'clip', property: 'positionX' }, { kind: 'clip-aperture', clipId: 'clip', property: 'width' },
  { kind: 'clip-effect', clipId: 'clip', effectId: 'turn', effectKind: 'rotate', parameterId: 'turns' },
  { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'layout:occurrence:1' }, { kind: 'show-repeat-scale' },
]
function authored(target: ShowPropertyTargetV2, activeDurationMs: number): ShowPropertyTrackV2 {
  const repeat = target.kind === 'show-repeat-scale'
  return { id: 'curve', target, activeStartMs: 0, activeDurationMs, keyframes: [
    { id: 'first', timeMs: 0, value: repeat ? 3 : 0.5, easing: { curve: 'linear' } },
    { id: 'boundary', timeMs: 250, value: repeat ? 3 : 0.5, easing: { curve: 'linear' }, curveSegment: { baseValue: repeat ? 2 : 0.125, deltaValue: repeat ? 2 : 0.5, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 250 } },
    { id: 'last', timeMs: 500, value: repeat ? 4 : 0.75, easing: { curve: 'linear' } },
  ] }
}
// Independently authored exact 125ms checkpoint values, with no retained descriptors.
// Fine strict-interior formulas are separately checked by the public evaluator tests.
function checkpointOracle(track: ShowPropertyTrackV2): ShowPropertyTrackV2 {
  const repeat = track.target.kind === 'show-repeat-scale'
  return { ...structuredClone(track), keyframes: [0, 125, 250, 375, 500].map(timeMs => ({ id: `oracle-${timeMs}`, timeMs, value: repeat ? timeMs <= 250 ? 3 : timeMs === 375 ? 2.28125 : 4 : timeMs <= 250 ? 0.5 : timeMs === 375 ? 0.1953125 : 0.75, easing: { curve: 'linear' } })) }
}
it.each(targets.flatMap(target => (['fast', 'fidelity'] as const).map(fidelity => ({ target, fidelity }))))('native $target.kind exact key and strict descriptor checkpoint output/state ($fidelity)', ({ target, fidelity }) => {
  const record = propertyEditRecord(); record.composition.executionModel = 'continuous'
  if (target.kind === 'layout-occurrence-split-position') {
    record.zones.push({ id: 'right', name: 'Right', nominalPixelCount: 16 }); record.zoneLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'right'] }; record.composition.layers.push({ id: 'right-layer', name: 'Right', zoneId: 'right', rank: 0 }); target = { ...target, layoutOccurrenceId: record.composition.layoutOccurrences[0].id }
  }
  record.composition.clips[0].appearance.keys[0].value.aperture = { enabled: true, x: 0.5, y: 0.5, width: 1, height: 1, edge: 'hard' }
  record.composition.propertyTracks = [authored(target, 1000)]
  const independent = structuredClone(record); independent.composition.propertyTracks = [checkpointOracle(record.composition.propertyTracks[0])]
  const actual = runtime(record, fidelity); const expected = runtime(independent, fidelity)
  for (const atMs of [0, 125, 250, 375, 500, 625, 750, 875]) {
    const a = actual.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true }); const b = expected.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true })
    expect(a.frame, String(atMs)).toEqual(b.frame); expect(Object.keys(a.exports).length).toBeGreaterThan(0); expect(a.exports, String(atMs)).toEqual(b.exports)
  }
})
it.each((['fast', 'fidelity'] as const).flatMap(fidelity => (['continue', 'restart'] as const).map(entryPolicy => ({ fidelity, entryPolicy }))))('linked held Group preserves exact authored discontinuity, shared state and $entryPolicy native EPE ($fidelity)', ({ fidelity, entryPolicy }) => {
  const record = propertyEditGroupRecord(); record.composition.executionModel = 'continuous'; record.composition.showEndMs = 1500; record.composition.layoutOccurrences[0].durationMs = 1500
  record.composition.groupDefinitions[0].clips[0].durationMs = 500; record.composition.groupDefinitions[0].clips[0].entryPolicy = entryPolicy
  record.composition.groupOccurrences.forEach((occurrence, index) => { occurrence.startMs = index * 750; occurrence.holds = [{ id: 'exact', localTimeMs: 250, durationMs: 125 }] })
  const track = authored({ kind: 'clip-view', clipId: 'child', property: 'brightness' }, 500)
  record.composition.groupDefinitions[0].propertyTracks = [track]
  const independent = structuredClone(record); independent.composition.groupDefinitions[0].propertyTracks = [checkpointOracle(track)]
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record)); expect(opened.status).toBe('opened'); if (opened.status !== 'opened') throw Error('Reopen')
  const projected = materializeShowGroupsV2(opened.record).composition.propertyTracks.find(candidate => candidate.id === 'occ-0:curve')!
  for (const [atMs, expected] of [[249, 0.5], [250, 0.5], [251, 0.5], [374, 0.5], [375, 0.5], [376, 0.125 + 0.5 * (0.251 ** 2)], [624, 0.125 + 0.5 * (0.499 ** 2)], [625, 0.75]]) expect(evaluateShowPropertyKeysV2(projected.keyframes, atMs)).toBeCloseTo(expected, 12)
  const a = runtime(record, fidelity); const b = runtime(independent, fidelity)
  for (const atMs of [0, 125, 250, 375, 500, 625, 750, 875, 1000, 1125, 1250, 1375]) {
    const actual = a.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true }); const expected = b.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true })
    expect(actual.frame, String(atMs)).toEqual(expected.frame); expect(Object.keys(actual.exports).length).toBeGreaterThan(0); expect(actual.exports, String(atMs)).toEqual(expected.exports)
  }
})

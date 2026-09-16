import { expect, it } from 'vitest'
import { propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { evaluateShowScalarRampBaselineV2 } from './showScalarPropertyTrackLoweringV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import { LIBRARIES } from '../pixelblaze/libs'
const source = 'export var elapsed=0;export var roll=0;export function sliderGain(v){}export function beforeRender(d){elapsed+=d;roll=random(1)}export function render2D(i,x,y){rgb(x,y,.2)}'
function runtime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record)); expect(opened.status).toBe('opened'); if (opened.status !== 'opened') throw Error('Reopen')
  const prepared = prepareShowV2ForCompile(opened.record, { byCellId: {}, byPatternInstanceId: { instance: source }, stageDimension: 2 }, { libraries: LIBRARIES }); expect(prepared.status, JSON.stringify(prepared)).toBe('ready'); if (prepared.status !== 'ready') throw Error('Prepare')
  const compiled = compileShow(prepared.recipe, LIBRARIES); const result = buildShowEpeExportV2(opened.record, compiled.code, { stampedAt: '2026-09-16T00:00:00.000Z' }); expect(result.status).toBe('exported'); if (result.status !== 'exported') throw Error('Export')
  const epe = parseEpe(result.text)
  return createFastReplayRuntime({ ...compiled, code: epe.src, fxCode: emitFixedPoint(epe.src), dimension: 2 }, { fidelity, mapPoints: [{ sample: [0.4, 0.5], pos: [0.4, 0.5] }, { sample: [0.75, 0.25], pos: [0.75, 0.25] }], randomSeed: 1038 })
}
it('scalar baseline gives positive descriptor ramp its exact authored from value', () => {
  const baseline = { initial: 0.5, ramps: [{ atMs: 250, from: 0.5, to: 0.7, durationMs: 250, easing: { curve: 'linear' as const }, curveSegment: { baseValue: 0.1, deltaValue: 0.8, easing: { curve: 'quadratic' as const, direction: 'in' as const }, sourceDurationMs: 2000, elapsedOffsetMs: 500 } }] }
  expect(evaluateShowScalarRampBaselineV2(baseline, 249)).toBe(0.5)
  expect(evaluateShowScalarRampBaselineV2(baseline, 250)).toBe(0.5)
  expect(evaluateShowScalarRampBaselineV2(baseline, 251)).toBeCloseTo(0.1502002, 12)
  expect(evaluateShowScalarRampBaselineV2(baseline, 500)).toBe(0.7)
})
it.each((['repeat', 'split'] as const).flatMap(kind => (['fast', 'fidelity'] as const).map(fidelity => ({ kind, fidelity }))))('native $kind ramp exact authored boundary matches independent static-scalar EPE at probes ($fidelity)', ({ kind, fidelity }) => {
  const record = propertyEditRecord(); record.composition.executionModel = 'continuous'; const repeat = kind === 'repeat'; const first = repeat ? 3 : 0.5; const last = repeat ? 4 : 0.7; const base = repeat ? 2 : 0.1; const delta = repeat ? 2 : 0.8
  if (!repeat) {
    record.zones.push({ id: 'right', name: 'Right', nominalPixelCount: 16 }); record.zoneLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'right'] }; record.composition.layers.push({ id: 'right-layer', name: 'Right', zoneId: 'right', rank: 0 })
  }
  record.composition.propertyTracks = [{ id: 'scalar', target: repeat ? { kind: 'show-repeat-scale' } : { kind: 'layout-occurrence-split-position', layoutOccurrenceId: record.composition.layoutOccurrences[0].id }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'first', timeMs: 0, value: first, easing: { curve: 'linear' } }, { id: 'boundary', timeMs: 250, value: first, easing: { curve: 'linear' }, curveSegment: { baseValue: base, deltaValue: delta, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 2000, elapsedOffsetMs: 500 } }, { id: 'last', timeMs: 500, value: last, easing: { curve: 'linear' } }] }]
  expect(validateShowRecordV2(record)).toEqual([])
  const actual = runtime(record, fidelity)
  for (const atMs of [0, 125, 250, 375, 500, 625, 750, 875]) {
    const expectedScalar = atMs <= 250 ? first : atMs >= 500 ? last : base + delta * ((500 + atMs - 250) / 2000) ** 2
    const independent = structuredClone(record); independent.composition.propertyTracks = []
    if (repeat) independent.composition.sampleRemap.repeatScale = expectedScalar
    else independent.composition.layoutOccurrences[0].parameters.splitPosition = expectedScalar
    const expected = runtime(independent, fidelity).advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true }); const delivered = actual.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true })
    expect(delivered.frame).toEqual(expected.frame); expect(Object.keys(delivered.exports).length).toBeGreaterThan(0); expect(Object.fromEntries(Object.entries(delivered.exports).filter(([key]) => !/^__pxlblz_show_c[0-9]+_[rgb]$/.test(key)))).toEqual(Object.fromEntries(Object.entries(expected.exports).filter(([key]) => !/^__pxlblz_show_c[0-9]+_[rgb]$/.test(key))))
  }
})

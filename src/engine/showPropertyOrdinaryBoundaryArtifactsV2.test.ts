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
import { insertShowTimeV2 } from './showTimelineV2'
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
function ordinary(target: ShowPropertyTargetV2, activeDurationMs: number, curve: 'steps' | 'hold' = 'steps'): ShowPropertyTrackV2 {
  const repeat = target.kind === 'show-repeat-scale'
  return { id: 'ordinary', target, activeStartMs: 0, activeDurationMs, keyframes: [
    { id: 'first', timeMs: 0, value: repeat ? 2 : .125, easing: { curve: 'linear' } },
    { id: 'middle', timeMs: 250, value: repeat ? 3 : .25, easing: curve === 'steps' ? { curve: 'steps', steps: 4, position: 'start' } : { curve: 'hold', at: 0 } },
    { id: 'last', timeMs: 500, value: repeat ? 7 : .75, easing: { curve: 'linear' } },
  ] }
}
// Literal original checkpoint arithmetic: stepped right boundary .375 (repeat4),
// midpoint third step .625 (repeat6). Holding250 for125 preserves those original values.
function heldOracle(track: ShowPropertyTrackV2): ShowPropertyTrackV2 {
  const repeat = track.target.kind === 'show-repeat-scale'
  const held = track.keyframes.find(key => key.id === 'middle')?.easing.curve === 'hold'
  const numbers = repeat ? held ? [2,2.5,7,7,7,7] : [2,2.5,4,4,6,7] : held ? [.125,.1875,.75,.75,.75,.75] : [.125,.1875,.375,.375,.625,.75]
  return { ...structuredClone(track), keyframes: [0,125,250,375,500,625].map((timeMs,index) => ({ id: `oracle-${timeMs}`, timeMs, value: numbers[index], easing: { curve: 'linear' } })) }
}
it.each(targets.flatMap(target => (['fast', 'fidelity'] as const).map(fidelity => ({ target, fidelity }))))('Insert Time preserves ordinary $target.kind stepped boundary in native reopened EPE ($fidelity)', ({ target, fidelity }) => {
  const record = propertyEditRecord(); record.composition.executionModel = 'continuous'
  if (target.kind === 'layout-occurrence-split-position') {
    record.zones.push({ id: 'right', name: 'Right', nominalPixelCount: 16 }); record.zoneLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'right'] }; record.composition.layers.push({ id: 'right-layer', name: 'Right', zoneId: 'right', rank: 0 }); target = { ...target, layoutOccurrenceId: record.composition.layoutOccurrences[0].id }
  }
  record.composition.clips[0].appearance.keys[0].value.aperture = { enabled: true, x: .5, y: .5, width: 1, height: 1, edge: 'hard' }
  record.composition.propertyTracks = [ordinary(target, 1000)]
  runtime(record, fidelity) // Explicit ready preimage premise.
  const changed = insertShowTimeV2(record, { atMs: 250, durationMs: 125 }); expect(changed.status, JSON.stringify(changed)).toBe('changed'); if (changed.status !== 'changed') throw Error('Insert')
  const independent = structuredClone(changed.record); independent.composition.propertyTracks = [heldOracle(changed.record.composition.propertyTracks[0])]
  const actual = runtime(changed.record, fidelity); const expected = runtime(independent, fidelity)
  for (const atMs of [0,125,250,375,500,625,750,875,1000]) {
    const a=actual.advanceTo(atMs,{stepMs:125,forceFullIntermediateRender:true}); const b=expected.advanceTo(atMs,{stepMs:125,forceFullIntermediateRender:true})
    expect(a.frame,String(atMs)).toEqual(b.frame); expect(Object.keys(a.exports).length).toBeGreaterThan(0); expect(a.exports,String(atMs)).toEqual(b.exports)
  }
})
it.each((['fast','fidelity'] as const).flatMap(fidelity=>(['continue','restart'] as const).flatMap(entryPolicy=>(['steps','hold'] as const).map(curve=>({fidelity,entryPolicy,curve})))))('linked held Group retains ordinary $curve boundary and shared $entryPolicy state ($fidelity)', ({fidelity,entryPolicy,curve})=>{
  const record=propertyEditGroupRecord(); record.composition.executionModel='continuous'; record.composition.showEndMs=1500; record.composition.layoutOccurrences[0].durationMs=1500
  record.composition.groupDefinitions[0].clips[0].durationMs=500; record.composition.groupDefinitions[0].clips[0].entryPolicy=entryPolicy
  record.composition.groupOccurrences.forEach((occ,index)=>{occ.startMs=index*750;occ.holds=[{id:'exact',localTimeMs:250,durationMs:125}]})
  record.composition.groupDefinitions[0].propertyTracks=[ordinary({kind:'clip-view',clipId:'child',property:'brightness'},500,curve)]
  const independent=structuredClone(record); independent.composition.groupOccurrences.forEach(occ=>{occ.holds=[]}); independent.composition.groupDefinitions[0].clips[0].durationMs=625; independent.composition.groupDefinitions[0].propertyTracks=[heldOracle({...record.composition.groupDefinitions[0].propertyTracks[0],activeDurationMs:625})]
  const projected=materializeShowGroupsV2(record).composition.propertyTracks.find(track=>track.id==='occ-0:ordinary')!
  for(const [atMs,expected] of [[249,.2495],[250,.375],[251,.375],[374,.375],[375,.375],[376,.375],[500,.625],[625,.75]])expect(evaluateShowPropertyKeysV2(projected.keyframes,atMs)).toBeCloseTo(curve === 'hold' && atMs >= 250 ? .75 : expected,12)
  const actual=runtime(record,fidelity);const expected=runtime(independent,fidelity)
  for(const atMs of [0,125,250,375,500,625,750,875,1000,1125,1250,1375]){
    const a=actual.advanceTo(atMs,{stepMs:125,forceFullIntermediateRender:true});const b=expected.advanceTo(atMs,{stepMs:125,forceFullIntermediateRender:true})
    expect(a.frame,String(atMs)).toEqual(b.frame);expect(Object.keys(a.exports).length).toBeGreaterThan(0);expect(a.exports,String(atMs)).toEqual(b.exports)
  }
})

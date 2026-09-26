import { expect, it } from 'vitest'
import { propertyEditRecord, propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { editShowPropertyV2, type ShowPropertyTrackOwnerV2 } from './showPropertyEditsV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2, type ShowPropertyTargetV2 } from './showCompositionV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
const source='export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,.1+.6*x,.1+.6*y)}'
const families: ShowPropertyTargetV2[]=[
 {kind:'instance-time-scale',instanceId:'instance'},{kind:'instance-control',instanceId:'instance',exportName:'sliderGain'},
 {kind:'clip-opacity',clipId:'clip'},{kind:'clip-view',clipId:'clip',property:'brightness'},
 {kind:'clip-transform',clipId:'clip',property:'positionX'},{kind:'clip-aperture',clipId:'clip',property:'width'},
 {kind:'clip-effect',clipId:'clip',effectId:'turn',effectKind:'rotate',parameterId:'turns'},
 {kind:'layout-occurrence-split-position',layoutOccurrenceId:'placeholder'},{kind:'show-repeat-scale'},
]
function runtime(record:ShowRecordV2,fidelity:'fast'|'fidelity'){
 const reopened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record));expect(reopened.status).toBe('opened');if(reopened.status!=='opened')throw Error('reopen')
 const prepared=prepareShowV2ForCompile(reopened.record,{byCellId:{},byPatternInstanceId:{instance:source},stageDimension:2},{libraries:LIBRARIES});expect(prepared.status,JSON.stringify(prepared)).toBe('ready');if(prepared.status!=='ready')throw Error('prepare')
 const compiled=compileShow(prepared.recipe,LIBRARIES),exported=buildShowEpeExportV2(reopened.record,compiled.code,{stampedAt:'2026-09-16T00:00:00.000Z'});expect(exported.status).toBe('exported');if(exported.status!=='exported')throw Error(exported.message)
 const opened=parseEpe(exported.text);expect(opened.stamp?.kind).toBe('show')
 return createFastReplayRuntime({...compiled,code:opened.src,fxCode:emitFixedPoint(opened.src),dimension:2},{fidelity,randomSeed:1038,mapPoints:[{sample:[.45,.5],pos:[.45,.5]},{sample:[.75,.25],pos:[.75,.25]}]})
}
const cases=[...families.map(target=>({scope:'show' as const,target})),...families.slice(0,7).map(target=>({scope:'group' as const,target}))].flatMap(value=>(['fast','fidelity'] as const).map(fidelity=>({...value,fidelity})))
it.each(cases)('native $scope $target.kind Property edit reopens exact independent EPE/state ($fidelity)',({scope,target,fidelity})=>{
 const record=scope==='show'?propertyEditRecord():propertyEditGroupRecord();record.composition.executionModel='continuous';record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 const concrete=structuredClone(target)
 if(scope==='group'){
  if('instanceId' in concrete)concrete.instanceId='slot'
  if('clipId' in concrete)concrete.clipId='child'
  record.composition.groupDefinitions[0].clips[0].appearance.keys[0].value.aperture={enabled:true,x:.5,y:.5,width:1,height:1,edge:'hard'}
 }else record.composition.clips[0].appearance.keys[0].value.aperture={enabled:true,x:.5,y:.5,width:1,height:1,edge:'hard'}
 if(concrete.kind==='layout-occurrence-split-position'){
  concrete.layoutOccurrenceId=record.composition.layoutOccurrences[0].id;record.zones.push({id:'right',name:'Right',nominalPixelCount:16});record.zoneLayouts[0].logical={kind:'split',axis:'x',zoneIds:['zone','right']};record.composition.layers.push({id:'right-layer',zoneId:'right',name:'Right',rank:0})
 }
 const owner:ShowPropertyTrackOwnerV2=scope==='show'?{kind:'show'}:{kind:'group-definition',definitionId:'definition'},duration=scope==='show'?1000:400
 const values=concrete.kind==='show-repeat-scale'?[2,4]:[.25,.75]
 const track={id:'new-1',target:concrete,activeStartMs:0,activeDurationMs:duration,keyframes:[{id:'new-2',timeMs:0,value:values[0],easing:{curve:'quadratic' as const,direction:'in' as const}},{id:'new-3',timeMs:duration,value:values[1],easing:{curve:'linear' as const}}]}
 const actual=editShowPropertyV2(record,owner,{kind:'add-track',track});expect(actual.status).toBe('changed')
 const independent=structuredClone(record),tracks=scope==='show'?independent.composition.propertyTracks:independent.composition.groupDefinitions[0].propertyTracks
 tracks.push({id:'new-1',target:concrete,activeStartMs:0,activeDurationMs:duration,keyframes:[{id:'new-2',timeMs:0,value:values[0],easing:{curve:'quadratic',direction:'in'}},{id:'new-3',timeMs:duration,value:values[1],easing:{curve:'linear'}}]})
 expect(actual.record).toEqual(independent);expect(actual.record.composition.patternInstances).toEqual(record.composition.patternInstances);expect(actual.record.composition.groupOccurrences).toEqual(record.composition.groupOccurrences)
 const a=runtime(actual.record,fidelity),b=runtime(independent,fidelity)
 for(const atMs of [0,125,250,375,500,625,750,875]){const result=a.advanceTo(atMs,{stepMs:125,forceFullIntermediateRender:true}),expected=b.advanceTo(atMs,{stepMs:125,forceFullIntermediateRender:true});expect(result.frame).toEqual(expected.frame);expect(Object.keys(result.exports).length).toBeGreaterThan(0);expect(result.exports).toEqual(expected.exports)}
})

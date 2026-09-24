import { expect, it } from 'vitest'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { editShowTransitionV2 } from './showTransitionsV2'
import { createShowClipV2 } from './showClipCreationV2'
import { propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
const source='export var elapsed=0;export var calls=0;var gain=.4;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d;calls+=1}export function render2D(i,x,y){rgb(gain,elapsed/3000,.1+.6*y)}'
function fixture(){
 const record=propertyEditGroupRecord();const clip=record.composition.clips[0];clip.durationMs=200;clip.entryPolicy='restart';clip.appearance.keys[0].id='source-appearance'
 record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 record.composition.groupDefinitions[0].clips[0].appearance.keys[0].value.opacity=.25
 record.composition.propertyTracks=[{id:'gain',target:{kind:'instance-control',instanceId:'instance',exportName:'sliderGain'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'gain-a',timeMs:0,value:.4,easing:{curve:'sine',direction:'in-out'}},{id:'gain-b',timeMs:1000,value:.8,easing:{curve:'linear'}}]},
 {id:'brightness',target:{kind:'clip-view',clipId:'clip',property:'brightness'},activeStartMs:0,activeDurationMs:200,keyframes:[{id:'left',timeMs:0,value:.2,easing:{curve:'quadratic',direction:'in'}},{id:'right',timeMs:200,value:.8,easing:{curve:'linear'}}]}]
 return record
}
function runtime(record:ShowRecordV2,fidelity:'fast'|'fidelity'){
 const reopened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record));expect(reopened.status).toBe('opened');if(reopened.status!=='opened')throw Error('reopen')
 const byPatternInstanceId=Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance=>[instance.id,source]))
 const prepared=prepareShowV2ForCompile(reopened.record,{byCellId:{},byPatternInstanceId,stageDimension:2},{libraries:LIBRARIES});expect(prepared.status,JSON.stringify(prepared)).toBe('ready');if(prepared.status!=='ready')throw Error('prepare')
 const compiled=compileShow(prepared.recipe,LIBRARIES),exported=buildShowEpeExportV2(reopened.record,compiled.code,{stampedAt:'2026-09-16T00:00:00.000Z'});expect(exported.status).toBe('exported');if(exported.status!=='exported')throw Error(exported.message)
 const opened=parseEpe(exported.text);expect(opened.stamp?.kind).toBe('show')
 return {artifact:compiled,replay:createFastReplayRuntime({...compiled,code:opened.src,fxCode:emitFixedPoint(opened.src),dimension:2},{fidelity,randomSeed:1038,mapPoints:[{sample:[.45,.5],pos:[.45,.5]},{sample:[.75,.25],pos:[.75,.25]}]})}
}
it.each(['fast','fidelity'] as const)('deletion preserves surviving held shared users and imported EPE state against authored removal (%s)',fidelity=>{
 const original=fixture(),before=structuredClone(original);runtime(original,fidelity)
 const result=editShowTransitionV2(original,{kind:'delete-clip',clipId:'clip'});expect(result.status).toBe('changed');if(result.status!=='changed')throw Error('delete')
 const expected=structuredClone(original);expected.composition.clips=[];expected.composition.propertyTracks=expected.composition.propertyTracks.filter(track=>!('clipId'in track.target&&track.target.clipId==='clip'))
 expect(result.record).toEqual(expected);expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
 const a=runtime(result.record,fidelity),b=runtime(expected,fidelity);expect(a.artifact.summary.clips).toHaveLength(1)
 for(const atMs of [0,100,200,300,400,500,600,900]){const actual=a.replay.advanceTo(atMs,{stepMs:100,forceFullIntermediateRender:true}),wanted=b.replay.advanceTo(atMs,{stepMs:100,forceFullIntermediateRender:true});expect(actual.frame).toEqual(wanted.frame);expect(actual.exports).toEqual(wanted.exports);expect(Object.keys(actual.exports).length).toBeGreaterThan(0)}
 expect(original).toEqual(before)
})
it.each(['fast','fidelity'] as const)('empty delete collects its instance; re-add sets up a fresh default runtime without reviving appearance or Clip animation (%s)',fidelity=>{
 const original=propertyEditRecord();original.composition.patternInstances[0].pattern={kind:'user',id:'voice'};original.composition.patternInstances[0].controlTargets={sliderGain:.4};original.composition.clips[0].appearance.keys[0].value.opacity=.25
 original.composition.propertyTracks=[{id:'deleted-animation',target:{kind:'clip-view',clipId:'clip',property:'brightness'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'deleted-key',timeMs:0,value:.2,easing:{curve:'linear'}},{id:'deleted-last',timeMs:1000,value:.8,easing:{curve:'linear'}}]}]
 const deleted=editShowTransitionV2(original,{kind:'delete-clip',clipId:'clip'});expect(deleted.status,JSON.stringify(deleted)).toBe('changed');if(deleted.status!=='changed')throw Error('delete')
 expect(deleted.record.composition.patternInstances).toEqual([]);expect(deleted.removedIds).toContain('instance')
 const reopened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(deleted.record));expect(reopened.status).toBe('opened');if(reopened.status!=='opened')throw Error('empty reopen')
 const old=original.composition.clips[0],clip={id:'new-clip',zoneId:old.zoneId,layerId:old.layerId,startMs:0,durationMs:1000,zoneSampleMode:old.zoneSampleMode,entryPolicy:'continue' as const,appearance:{keys:[{id:'new-appearance',timeMs:0,value:{opacity:1,view:{mirror:false,phase:0,brightness:1},effects:[]}}]}}
 const fresh={id:'fresh-instance',pattern:{kind:'user' as const,id:'voice'},patternName:original.composition.patternInstances[0].patternName,time:{timeScale:1,timeOffsetMs:0},controlTargets:{}}
 const added=createShowClipV2(reopened.record,{kind:'create-clip',patternReference:{kind:'user',id:'voice'},runtime:{kind:'first',instance:fresh},clip});expect(added.status,JSON.stringify(added)).toBe('changed');if(added.status!=='changed')throw Error('add')
 const expected=structuredClone(deleted.record);expected.composition.clips=[{...clip,instanceId:'fresh-instance'}];expected.composition.patternInstances=[fresh]
 expect(added.record).toEqual(expected);expect(added.record.composition.propertyTracks).toEqual([]);expect(added.record.composition.patternInstances).toEqual([fresh])
 const a=runtime(added.record,fidelity),b=runtime(expected,fidelity);expect(a.artifact.summary.clips).toHaveLength(1)
 for(const atMs of [0,100,200,500,900]){const actual=a.replay.advanceTo(atMs,{stepMs:100,forceFullIntermediateRender:true}),wanted=b.replay.advanceTo(atMs,{stepMs:100,forceFullIntermediateRender:true});expect(actual.frame).toEqual(wanted.frame);expect(actual.exports).toEqual(wanted.exports)}
})

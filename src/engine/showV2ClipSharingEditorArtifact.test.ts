import { expect, it } from 'vitest'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { createShowV2LinkedDuplicateIntent, createShowV2IndependentIntent, createShowV2RejoinIntent } from './showV2ClipSharingEditorModel'
import { deriveShowRestartEventsV2 } from './showPropertyAnimationV2'
import { editShowClipV2 } from './showClipsV2'
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
function capture(record:ShowRecordV2){return captureShowStageEditV2(record,{patterns:[{id:'voice',name:'Voice',src:source,controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null})}
function runtime(record:ShowRecordV2,fidelity:'fast'|'fidelity'){
 const reopened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record));expect(reopened.status).toBe('opened');if(reopened.status!=='opened')throw Error('reopen')
 const byPatternInstanceId=Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance=>[instance.id,source]))
 const prepared=prepareShowV2ForCompile(reopened.record,{byCellId:{},byPatternInstanceId,stageDimension:2},{libraries:LIBRARIES});expect(prepared.status,JSON.stringify(prepared)).toBe('ready');if(prepared.status!=='ready')throw Error('prepare')
 const compiled=compileShow(prepared.recipe,LIBRARIES),exported=buildShowEpeExportV2(reopened.record,compiled.code,{stampedAt:'2026-09-16T00:00:00.000Z'});expect(exported.status).toBe('exported');if(exported.status!=='exported')throw Error(exported.message)
 const opened=parseEpe(exported.text);expect(opened.stamp?.kind).toBe('show')
 return {artifact:compiled,replay:createFastReplayRuntime({...compiled,code:opened.src,fxCode:emitFixedPoint(opened.src),dimension:2},{fidelity,randomSeed:1038,mapPoints:[{sample:[.45,.5],pos:[.45,.5]},{sample:[.75,.25],pos:[.75,.25]}]})}
}
it.each(['fast','fidelity'] as const)('sharing UI plans preserve held Group users, nonlinear authored copies, Restart and exact independent EPE state (%s)',fidelity=>{
 const original=fixture(),before=structuredClone(original);runtime(original,fidelity)
 let n=0;const clip=original.composition.clips[0],linked=createShowV2LinkedDuplicateIntent(capture(original),'clip',{zoneId:clip.zoneId,layerId:clip.layerId,startMs:'200'},()=>`copy-${++n}`)
 if(linked.status!=='ready')throw Error('duplicate plan');const copied=editShowClipV2(original,linked.intent);expect(copied.status).toBe('changed')
 const expectedCopy=structuredClone(original);expectedCopy.composition.clips.push({...structuredClone(clip),id:'copy-1',startMs:200,appearance:{keys:[{...structuredClone(clip.appearance.keys[0]),id:'copy-2',timeMs:200}]}})
 expectedCopy.composition.propertyTracks.push({id:'copy-3',target:{kind:'clip-view',clipId:'copy-1',property:'brightness'},activeStartMs:200,activeDurationMs:200,keyframes:[{id:'copy-4',timeMs:200,value:.2,easing:{curve:'quadratic',direction:'in'}},{id:'copy-5',timeMs:400,value:.8,easing:{curve:'linear'}}]})
 expect(copied.record).toEqual(expectedCopy)
 expect(deriveShowRestartEventsV2(copied.record)).toMatchObject({status:'derived',events:[{instanceId:'instance',atMs:0,clipIds:['clip']},{instanceId:'instance',atMs:200,clipIds:['copy-1']}]})
 n=0;const plan=createShowV2IndependentIntent(capture(copied.record),'clip',()=>`independent-${++n}`);if(plan.status!=='ready')throw Error('independent plan')
 const independent=editShowClipV2(copied.record,plan.intent);expect(independent.status).toBe('changed')
 const expectedIndependent=structuredClone(expectedCopy);expectedIndependent.composition.executionModel='continuous';expectedIndependent.composition.clips[0].instanceId='independent-1';expectedIndependent.composition.patternInstances.push({...structuredClone(original.composition.patternInstances[0]),id:'independent-1'})
 expectedIndependent.composition.propertyTracks.push({id:'independent-2',target:{kind:'instance-control',instanceId:'independent-1',exportName:'sliderGain'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'independent-3',timeMs:0,value:.4,easing:{curve:'sine',direction:'in-out'}},{id:'independent-4',timeMs:1000,value:.8,easing:{curve:'linear'}}]})
 expect(independent.record).toEqual(expectedIndependent)
 expect(deriveShowRestartEventsV2(independent.record)).toMatchObject({status:'derived',events:[{instanceId:'independent-1',atMs:0,clipIds:['clip']},{instanceId:'instance',atMs:200,clipIds:['copy-1']}]})
 const rejoinPlan=createShowV2RejoinIntent(capture(independent.record),'clip','instance');if(rejoinPlan.status!=='ready')throw Error('Rejoin plan')
 const rejoined=editShowClipV2(independent.record,rejoinPlan.intent);expect(rejoined.status).toBe('changed');const expectedRejoined=structuredClone(expectedCopy);expectedRejoined.composition.executionModel='continuous';expect(rejoined.record).toEqual(expectedRejoined)
 for(const [actual,expected,runtimes] of [[copied.record,expectedCopy,1],[independent.record,expectedIndependent,2],[rejoined.record,expectedRejoined,1]] as const){
  expect(actual.composition.groupDefinitions).toEqual(before.composition.groupDefinitions);expect(actual.composition.groupOccurrences).toEqual(before.composition.groupOccurrences)
  const activeShared=materializeShowGroupsV2(actual).composition.clips.filter(clip=>clip.instanceId==='instance'&&clip.startMs<=250&&clip.startMs+clip.durationMs>=375);expect(activeShared).toHaveLength(2)
  const counter=runtime(actual,fidelity),prefix=counter.artifact.summary.clips.find(member=>member.id==='instance')!.prefix
  const first=counter.replay.advanceTo(250,{stepMs:125,forceFullIntermediateRender:true}),firstCount=Number(first.exports[`${prefix}_calls`])
  const second=counter.replay.advanceTo(375,{stepMs:125,forceFullIntermediateRender:true})
  // These consecutive 125-ms frames sit inside two visible sharing users,
  // strictly after Restart200 and before the next contributor boundary400.
  expect(Number(second.exports[`${prefix}_calls`])-firstCount).toBe(fidelity==='fast'?1:65536)
  const a=runtime(actual,fidelity),b=runtime(expected,fidelity);expect(a.artifact.summary.clips).toHaveLength(runtimes)
  for(const atMs of [0,100,200,300,400,500,600,900]){const result=a.replay.advanceTo(atMs,{stepMs:100,forceFullIntermediateRender:true}),wanted=b.replay.advanceTo(atMs,{stepMs:100,forceFullIntermediateRender:true});expect(result.frame).toEqual(wanted.frame);expect(Object.keys(result.exports).length).toBeGreaterThan(0);expect(result.exports).toEqual(wanted.exports)}
 }
 expect(original).toEqual(before)
})

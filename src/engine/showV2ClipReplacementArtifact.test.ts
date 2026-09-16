import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { createShowV2ClipReplacementIntent } from './showV2ClipReplacementModel'
import { admitShowV2PilotClipReplacementEdit } from '../store/showV2PreparedEditAdmission'
import { getPersonalContentProvider, setPersonalContentProvider, resetPersonalContentProvider } from './personalContentProvider'
import { showInitialState, useShowStore } from '../store/showStore'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import { buildDeliveredShowSourceInventory } from './showSourceInventory'
const original:ShowRecordV2=JSON.parse(readFileSync(new URL('../../e2e/fixtures/showV2ClipReplace.json',import.meta.url),'utf8'))
const oldSource='export var elapsed=0;export var observedCount=0;export var gain=.4;var lost=.2;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function beforeRender(d){elapsed+=d;observedCount=pixelCount}export function render2D(i,x,y){rgb(gain,observedCount/16,.1+.6*y)}'
const newSource='export var elapsed=0;export var gain=.9;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(.1+.6*x,.1+.6*y,gain)}'
const dependencies={patterns:[{id:'replacement-voice',name:'Replacement Voice',src:oldSource,controls:{},updatedAt:1},{id:'replacement-other',name:'Replacement Other',src:newSource,controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
function runtime(record:ShowRecordV2,fidelity:'fast'|'fidelity'){
 const opened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record));if(opened.status!=='opened')throw Error('reopen');expect(opened.record).toEqual(record)
 const capture=captureShowStageEditV2(opened.record,dependencies);expect(capture.prepared.status,JSON.stringify(capture.prepared)).toBe('ready');if(capture.prepared.status!=='ready')throw Error('prepare')
 const artifact=capture.prepared.bundle.artifact,exported=buildShowEpeExportV2(opened.record,artifact.code,{stampedAt:'2026-09-16T00:00:00Z'});if(exported.status!=='exported')throw Error(exported.message)
 const epe=parseEpe(exported.text),inventory=buildDeliveredShowSourceInventory(artifact.summary.sourceInventory,artifact.code,epe.src),bytes=new TextEncoder().encode(epe.src)
 const member=inventory.chunks.filter(chunk=>chunk.ownerId==='instance'&&chunk.patternPart==='compiled-pattern').map(chunk=>new TextDecoder().decode(bytes.slice(chunk.startByte,chunk.endByte))).join('')
 const aliases=new Map<string,string>();const normalizedMember=member.replace(/\b__pxlblz_[A-Za-z0-9_$]+\b/g,name=>{if(!aliases.has(name))aliases.set(name,`private_${aliases.size}`);return aliases.get(name)!})
 return {normalizedMember, prefix:artifact.summary.clips.find(member=>member.id==='instance')!.prefix,replay:createFastReplayRuntime({...artifact,code:epe.src,fxCode:emitFixedPoint(epe.src),dimension:2},{fidelity,randomSeed:1038,mapPoints:[{sample:[.25,.5],pos:[.25,.5]},{sample:[.75,.25],pos:[.75,.25]}]})}
}
it.each((['fast','fidelity'] as const).flatMap(fidelity=>(['same-entry','later-entry','invisible-survivor'] as const).map(entry=>[fidelity,entry] as const)))('captured replacement matches authored animation/lifecycle and preserves retained member (%s/%s)',async(fidelity,entry)=>{
 resetPersonalContentProvider();useShowStore.setState(showInitialState);const record=structuredClone(original);if(entry==='same-entry'){record.composition.clips[1].startMs=0;record.composition.clips[1].durationMs=20000;record.composition.clips[1].layerId=record.composition.layers[1].id;record.composition.clips[0].entryPolicy='continue';record.composition.clips[0].appearance.keys.forEach(key=>{key.value.opacity=0});record.composition.clips[1].entryPolicy='restart';record.composition.clips[1].appearance.keys=[{...record.composition.clips[1].appearance.keys[0],timeMs:0,value:{...record.composition.clips[1].appearance.keys[0].value,opacity:1}}];}if(entry==='invisible-survivor'){record.composition.clips[1].startMs=0;record.composition.clips[1].durationMs=20000;record.composition.clips[1].layerId=record.composition.layers[1].id;record.composition.clips[1].appearance.keys=[{...record.composition.clips[1].appearance.keys[0],timeMs:0,value:{...record.composition.clips[1].appearance.keys[0].value,opacity:0}}];}const before=structuredClone(record);setPersonalContentProvider({...getPersonalContentProvider(),replaceShowV2:async()=>{}});useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 try{
 const capture=captureShowStageEditV2(record,dependencies);expect(capture.prepared.status).toBe('ready');let n=0;const plan=createShowV2ClipReplacementIntent(capture,'voice',{kind:'user',id:'replacement-other'},()=>`replacement-${++n}`);if(plan.status!=='ready')throw Error(plan.message)
 const outcome=await admitShowV2PilotClipReplacementEdit({showId:record.id,baseRevision:0,capture,intent:plan.intent,isCurrent:()=>true,onAdopted:()=>{}});expect(outcome.status).toBe('applied');const changed=useShowStore.getState().showV2Pilots[record.id]
 const expected=structuredClone(record),identity=plan.intent.independence!;expected.composition.executionModel='continuous';expected.composition.clips[0].instanceId=identity.instanceId;expected.composition.patternInstances.push({...structuredClone(record.composition.patternInstances[0]),id:identity.instanceId,pattern:{kind:'user',id:'replacement-other'},patternName:'Replacement Other',controlTargets:{sliderGain:.4}})
 const gain=record.composition.propertyTracks.find(track=>track.id==='gain')!,ids=identity.identitiesBySourceTrackId.gain;expected.composition.propertyTracks.push({...structuredClone(gain),id:ids.trackId,target:{kind:'instance-control',instanceId:identity.instanceId,exportName:'sliderGain'},keyframes:gain.keyframes.map(key=>({...structuredClone(key),id:ids.keyframeIdsBySourceId[key.id]}))})
 expect({...changed,updatedAt:record.updatedAt}).toEqual(expected);expect(record).toEqual(before)
 const a=runtime(changed,fidelity),b=runtime(expected,fidelity),old=runtime(record,fidelity);expect(a.normalizedMember).not.toBe('');expect(a.normalizedMember).toBe(old.normalizedMember)
 for(const atMs of [0,1000,5000,9000,10000,15000,20000,24000,25000,29000]){
  const actual=a.replay.advanceTo(atMs,{stepMs:250,forceFullIntermediateRender:true}),wanted=b.replay.advanceTo(atMs,{stepMs:250,forceFullIntermediateRender:true});expect(actual.frame).toEqual(wanted.frame);expect(actual.exports).toEqual(wanted.exports)
  const prior=old.replay.advanceTo(atMs,{stepMs:250,forceFullIntermediateRender:true});if(entry==='invisible-survivor'&&atMs===15000){expect(actual.exports[`${a.prefix}_observedCount`]).toBe(fidelity==='fast'?1:65536);expect(prior.exports[`${old.prefix}_observedCount`]).toBe(fidelity==='fast'?1:65536)};if(atMs>=10000){if(entry==='same-entry')expect(actual.frame).toEqual(prior.frame);const sourceState=['gain','elapsed','lost','observedCount'].map(variable=>[`${old.prefix}_${variable}`,prior.exports[`${old.prefix}_${variable}`]] as const);expect(sourceState.map(([,value])=>typeof value)).toEqual(['number','number','number','number']);if(entry==='same-entry')for(const [name,value] of sourceState){expect(actual.exports[a.prefix+name.slice(old.prefix.length)],name).toEqual(value)};if(entry==='later-entry'&&atMs===10000){expect(actual.exports[`${a.prefix}_elapsed`]).toBe(fidelity==='fast'?250:250*65536);expect(prior.exports[`${old.prefix}_elapsed`]).toBe(fidelity==='fast'?10000:10000*65536)}}
 }
 expect(changed.composition.groupDefinitions).toEqual(record.composition.groupDefinitions);expect(changed.composition.groupOccurrences).toEqual(record.composition.groupOccurrences);expect(changed.composition.patternInstances[0]).toEqual(record.composition.patternInstances[0]);expect(changed.composition.propertyTracks.slice(0,record.composition.propertyTracks.length)).toEqual(record.composition.propertyTracks)
 }finally{resetPersonalContentProvider()}
})

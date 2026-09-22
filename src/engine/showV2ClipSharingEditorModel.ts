import type { ShowRecordV2 } from './showCompositionV2'
import type { ShowClipEditIntentV2 } from './showClipsV2'
import { defaultGroupRuntimeIdV2, effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowPreparedStageInputCaptureResultV2 } from './showPreparedStageV2'
import type { ShowV2TimelineCapture } from './showV2TimelineEditorModel'

export interface ShowV2ClipSharingCapture extends ShowV2TimelineCapture { inputCapture?: ShowPreparedStageInputCaptureResultV2 }
export type ShowV2ClipSharingIntent = Extract<ShowClipEditIntentV2, { kind: 'duplicate' | 'make-independent' | 'rejoin' }>
export type ShowV2ClipSharingPlan = { status: 'ready'; intent: ShowV2ClipSharingIntent } | { status: 'unchanged' } | { status: 'refused'; message: string }
function capturedRecord(capture: ShowV2ClipSharingCapture): ShowRecordV2 | null {
 if(capture.inputCapture) return capture.inputCapture.status==='qualified'?capture.inputCapture.inputs.record:null
 return capture.prepared.status==='ready'?capture.prepared.bundle.record:capture.prepared.status==='empty'?capture.prepared.record:null
}
function selected(capture: ShowV2ClipSharingCapture,clipId:string) {
 const record=capturedRecord(capture),clip=record?.composition.clips.find(value=>value.id===clipId)
 if(!record||!clip)return null
 try{return {record,clip,effective:materializeShowGroupsV2(record)}}catch{return null}
}
export function buildShowV2ClipSharingEditorModel(capture:ShowV2ClipSharingCapture,clipId:string) {
 const context=selected(capture,clipId)
 if(!context)return null
 const {record,clip,effective}=context,instance=record.composition.patternInstances.find(value=>value.id===clip.instanceId)!
 return {
  clip:structuredClone(clip),instance:structuredClone(instance),useCount:effectiveShowInstanceUseCountV2(record,instance.id),
  zones:structuredClone(record.zones),layers:structuredClone(record.composition.layers),
  rejoinTargets:record.composition.patternInstances.filter(value=>value.pattern.kind===instance.pattern.kind&&value.pattern.id===instance.pattern.id)
   .map(value=>({instanceId:value.id,patternName:value.patternName,useCount:effectiveShowInstanceUseCountV2(record,value.id)})),
  unavailableGroupRuntimeIds:effective.composition.patternInstances.filter(value=>value.pattern.kind===instance.pattern.kind&&value.pattern.id===instance.pattern.id&&!record.composition.patternInstances.some(authored=>authored.id===value.id)).map(value=>value.id),
 }
}
function identityAllocator(record:ShowRecordV2,effective:ShowRecordV2,allocate:()=>string) {
 const used=new Set<string>()
 const visit=(value:unknown):void=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){const raw=value as Record<string,unknown>;if((raw.kind==='user'||raw.kind==='stock')&&Object.keys(raw).length===2)return;if(typeof raw.id==='string')used.add(raw.id);Object.values(raw).forEach(visit)}}
 visit(record);visit(effective)
 for(const definition of record.composition.groupDefinitions)for(const slot of definition.patternInstances)used.add(defaultGroupRuntimeIdV2(definition.id,slot.id))
 return ()=>{const id=allocate();if(typeof id!=='string'||!id.trim()||used.has(id))throw Error('Fresh sharing identities conflict. Try the edit again.');used.add(id);return id}
}
const refusal=(message:string):ShowV2ClipSharingPlan=>({status:'refused',message})
export function checkShowV2LinkedDuplicateDraft(capture:ShowV2ClipSharingCapture,clipId:string,draft:{zoneId:string;layerId:string;startMs:string}):{status:'ready'}|{status:'refused';message:string} {
 const context=selected(capture,clipId)
 if(!context)return {status:'refused',message:'Select an available ordinary Clip.'}
 const {record,clip}=context,startMs=draft.startMs.trim()?Number(draft.startMs):NaN,endMs=startMs+clip.durationMs
 if(!Number.isSafeInteger(startMs)||startMs<0||!Number.isSafeInteger(endMs)||endMs>record.composition.showEndMs
  ||!record.zones.some(zone=>zone.id===draft.zoneId)||!record.composition.layers.some(layer=>layer.id===draft.layerId&&layer.zoneId===draft.zoneId))return {status:'refused',message:'Choose a destination Zone, Layer and integer start within Show End.'}
 return {status:'ready'}
}
export function createShowV2LinkedDuplicateIntent(capture:ShowV2ClipSharingCapture,clipId:string,draft:{zoneId:string;layerId:string;startMs:string},allocate:()=>string):ShowV2ClipSharingPlan {
 const checked=checkShowV2LinkedDuplicateDraft(capture,clipId,draft)
 if(checked.status==='refused')return checked
 const context=selected(capture,clipId)
 if(!context)return refusal('Select an available ordinary Clip.')
 const {record,clip,effective}=context,startMs=draft.startMs.trim()?Number(draft.startMs):NaN
 try{
  const mint=identityAllocator(record,effective,allocate),newClipId=mint()
  const appearanceKeyIdsBySourceId=Object.fromEntries(clip.appearance.keys.map(key=>[key.id,mint()]))
  const clipTrackIdentitiesBySourceTrackId=Object.fromEntries(record.composition.propertyTracks.filter(track=>'clipId'in track.target&&track.target.clipId===clip.id).map(track=>[track.id,{trackId:mint(),keyframeIdsBySourceId:Object.fromEntries(track.keyframes.map(key=>[key.id,mint()]))}]))
  return {status:'ready',intent:{kind:'duplicate',clipId,zoneId:draft.zoneId,layerId:draft.layerId,startMs,identities:{clipId:newClipId,appearanceKeyIdsBySourceId,clipTrackIdentitiesBySourceTrackId}}}
 }catch(error){return refusal(error instanceof Error?error.message:'Fresh sharing identities are unavailable.')}
}
export function createShowV2IndependentIntent(capture:ShowV2ClipSharingCapture,clipId:string,allocate:()=>string):ShowV2ClipSharingPlan {
 const context=selected(capture,clipId)
 if(!context)return refusal('Select an available ordinary Clip.')
 const {record,clip,effective}=context
 if(effectiveShowInstanceUseCountV2(record,clip.instanceId)===1)return {status:'unchanged'}
 try{
  const mint=identityAllocator(record,effective,allocate),instanceId=mint()
  const identitiesBySourceTrackId=Object.fromEntries(effective.composition.propertyTracks.filter(track=>'instanceId'in track.target&&track.target.instanceId===clip.instanceId).map(track=>[track.id,{trackId:mint(),keyframeIdsBySourceId:Object.fromEntries(track.keyframes.map(key=>[key.id,mint()]))}]))
  return {status:'ready',intent:{kind:'make-independent',clipId,independence:{instanceId,identitiesBySourceTrackId}}}
 }catch(error){return refusal(error instanceof Error?error.message:'Fresh sharing identities are unavailable.')}
}
export function createShowV2RejoinIntent(capture:ShowV2ClipSharingCapture,clipId:string,targetInstanceId:string):ShowV2ClipSharingPlan {
 const model=buildShowV2ClipSharingEditorModel(capture,clipId)
 if(!model||!model.rejoinTargets.some(target=>target.instanceId===targetInstanceId))return refusal('Choose an existing compatible Pattern instance.')
 return {status:'ready',intent:{kind:'rejoin',clipId,targetInstanceId}}
}

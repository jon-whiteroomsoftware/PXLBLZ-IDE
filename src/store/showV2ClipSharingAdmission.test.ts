import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { propertyEditGroupRecord, propertyEditTrack } from '../test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from '../engine/showPreparedStageV2'
import { createShowV2LinkedDuplicateIntent, createShowV2IndependentIntent, createShowV2RejoinIntent, type ShowV2ClipSharingIntent } from '../engine/showV2ClipSharingEditorModel'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotClipSharingEdit } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState)})
afterEach(()=>resetPersonalContentProvider())
let serial=0
function setup(){
 const record=propertyEditGroupRecord();record.id=`sharing-${++serial}`;record.composition.clips[0].durationMs=200;record.composition.clips[0].appearance.keys[0].id='appearance-original';record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 const track=propertyEditTrack();track.activeDurationMs=200;track.keyframes[1].timeMs=200;record.composition.propertyTracks=[track,{id:'gain',target:{kind:'instance-control',instanceId:'instance',exportName:'sliderGain'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'gain-a',timeMs:0,value:.4,easing:{curve:'sine',direction:'in-out'}},{id:'gain-b',timeMs:1000,value:.8,easing:{curve:'linear'}}]}]
 const dependencies={patterns:[{id:'voice',name:'Voice',src:'var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
 let saved=structuredClone(record);const write=vi.fn(async(_id:string,next:ShowRecordV2)=>{saved=structuredClone(next)})
 setPersonalContentProvider({...getPersonalContentProvider(),replaceShowV2:write,listShowDocumentsV2:async()=>[structuredClone(saved)]})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const context=()=>{const provider=getPersonalContentProvider();return {showId:record.id,baseRevision:useShowStore.getState().showRevisions[record.id]??0,capture:captureShowStageEditV2(useShowStore.getState().showV2Pilots[record.id],dependencies),isCurrent:()=>getPersonalContentProvider()===provider,onAdopted:vi.fn()}}
 const duplicate=(start='200')=>{let n=0;const clip=record.composition.clips[0],plan=createShowV2LinkedDuplicateIntent(context().capture,'clip',{zoneId:clip.zoneId,layerId:clip.layerId,startMs:start},()=>`duplicate-${++n}`);if(plan.status!=='ready')throw Error('plan');return plan.intent}
 return {record,write,context,duplicate,saved:()=>saved}
}
const empty={affectedClipIds:[],affectedInstanceIds:[],affectedTransitionIds:[],affectedTrackIds:[],affectedLayoutDefinitionIds:[],affectedLayoutOccurrenceIds:[],affectedGroupDefinitionIds:[],affectedGroupOccurrenceIds:[],affectedLayerIds:[],affectedMarkerIds:[],affectedAppearanceKeyIds:[],affectedPropertyKeyIds:[],removedIds:[],discardedControlTargets:[]}
function effects(value:object){return Object.fromEntries(Object.entries(value).filter(([key])=>key in empty))}
it('adopts duplicate/independent/Rejoin with exact fourteen effects and one write/history transition each',async()=>{
 const {record,write,context,duplicate,saved}=setup();const request=context();expect(request.capture.prepared.status).toBe('ready')
 const copied=await admitShowV2PilotClipSharingEdit({...request,intent:duplicate()});expect(copied.status).toBe('applied');expect(effects(copied)).toEqual({...empty,affectedClipIds:['duplicate-1'],affectedTrackIds:['duplicate-3'],affectedAppearanceKeyIds:['duplicate-2'],affectedPropertyKeyIds:['duplicate-4','duplicate-5']});expect(request.onAdopted).toHaveBeenCalledTimes(1)
 let n=0;const plan=createShowV2IndependentIntent(context().capture,'clip',()=>`independent-${++n}`);if(plan.status!=='ready')throw Error('independent')
 const made=await admitShowV2PilotClipSharingEdit({...context(),intent:plan.intent});expect(made.status).toBe('applied');expect(effects(made)).toEqual({...empty,affectedClipIds:['clip'],affectedInstanceIds:['independent-1'],affectedTrackIds:['independent-2'],affectedPropertyKeyIds:['independent-3','independent-4']})
 const rejoin=createShowV2RejoinIntent(context().capture,'clip','instance');if(rejoin.status!=='ready')throw Error('Rejoin')
 const joined=await admitShowV2PilotClipSharingEdit({...context(),intent:rejoin.intent});expect(joined.status).toBe('applied');expect(effects(joined)).toEqual({...empty,affectedClipIds:['clip'],affectedInstanceIds:['instance','independent-1'],affectedTrackIds:['independent-2'],affectedPropertyKeyIds:['independent-3','independent-4'],removedIds:['independent-1','independent-2','independent-3','independent-4']})
 expect(write).toHaveBeenCalledTimes(3);expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(3);expect(saved().composition.groupOccurrences).toEqual(record.composition.groupOccurrences)
 expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true);expect(saved().composition.clips[0].instanceId).toBe('independent-1');expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true);expect(saved().composition.clips[0].instanceId).toBe('instance');expect(write).toHaveBeenCalledTimes(5)
})
it('strict ingress rejects foreign operations and malformed/extraneous nested identities before adoption',async()=>{
 const {record,context,write,duplicate}=setup(),valid=duplicate()
 const malformed=[undefined,{}, {...valid,kind:'move'},{...valid,extra:true},{...valid,identities:{clipId:'x'}},{...valid,identities:{...(valid.kind==='duplicate'?valid.identities:{}),appearanceKeyIdsBySourceId:{x:[]}}},{kind:'make-independent',clipId:'clip',independence:{instanceId:'x',identitiesBySourceTrackId:{a:{trackId:'t',keyframeIdsBySourceId:{k:42}}}}},{kind:'rejoin',clipId:'clip',targetInstanceId:'instance',independence:{}}]
 for(const intent of malformed){const outcome=await admitShowV2PilotClipSharingEdit({...context(),intent:intent as ShowV2ClipSharingIntent});expect(outcome).toMatchObject({status:'refused',source:'owner',code:'invalid-intent'});expect(effects(outcome)).toEqual(empty)}
 expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})
it.each(['provider','revision','record','route','no-op','collision'] as const)('refuses or preserves %s with zero writes and empty fourteen effects',async partition=>{
 const {record,context,write,duplicate}=setup(),request=context();let intent:ShowV2ClipSharingIntent=duplicate(partition==='collision'?'199':'200')
 if(partition==='provider')setPersonalContentProvider({...getPersonalContentProvider(),id:'new-provider'})
 if(partition==='revision')useShowStore.setState({showRevisions:{[record.id]:1}})
 if(partition==='record')useShowStore.setState({showV2Pilots:{[record.id]:structuredClone(record)}})
 if(partition==='route')request.isCurrent=()=>false
 if(partition==='no-op')intent={kind:'rejoin',clipId:'clip',targetInstanceId:'instance'}
 const result=await admitShowV2PilotClipSharingEdit({...request,intent});expect(result.status).toBe(partition==='no-op'?'unchanged':'refused');expect(effects(result)).toEqual(empty);expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
it('owned failed save rolls back exactly, preserves failure receipt, and retry adds one successful history transition',async()=>{
 const {record,write,context,duplicate}=setup();write.mockRejectedValueOnce(Error('sharing-save-failed'));const request=context()
 await expect(admitShowV2PilotClipSharingEdit({...request,intent:duplicate()})).rejects.toThrow('sharing-save-failed')
 expect(request.onAdopted).toHaveBeenCalledTimes(1);expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([]);expect(useShowStore.getState().showV2SaveFailure?.showId).toBe(record.id)
 expect((await admitShowV2PilotClipSharingEdit({...context(),intent:duplicate()})).status).toBe('applied');expect(write).toHaveBeenCalledTimes(2);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
})
it('an already adopted sharing write settles superseded after provider switch without publishing a current completion',async()=>{
 const {record,write,context,duplicate}=setup();let resolve!:()=>void;write.mockImplementationOnce(async()=>new Promise<void>(done=>{resolve=done}))
 const request=context(),promise=admitShowV2PilotClipSharingEdit({...request,intent:duplicate()});await vi.waitFor(()=>expect(write).toHaveBeenCalledTimes(1));expect(request.onAdopted).toHaveBeenCalledTimes(1)
 setPersonalContentProvider({...getPersonalContentProvider(),id:'provider-B'});resolve();expect(await promise).toMatchObject({status:'applied',settlement:'superseded'});expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
})

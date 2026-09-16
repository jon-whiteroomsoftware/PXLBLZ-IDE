import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { propertyEditGroupRecord, propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from '../engine/showPreparedStageV2'
import { createShowV2ClipReplacementIntent } from '../engine/showV2ClipReplacementModel'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotClipReplacementEdit } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState)})
afterEach(()=>resetPersonalContentProvider())
let serial=0
function setup(group=false){
 const record=group?propertyEditGroupRecord():propertyEditRecord();record.id=`replacement-${++serial}`;record.composition.patternInstances[0].pattern={kind:'user',id:'voice'};record.composition.patternInstances[0].patternName='Voice';record.composition.patternInstances[0].controlTargets={sliderGain:.4,sliderLost:.2}
 const src='export var gain=.4;var lost=.2;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function render2D(i,x,y){rgb(gain,lost,y)}'
 const dependencies={patterns:[{id:'voice',name:'Voice',src,controls:{},updatedAt:1},{id:'other',name:'Other',src:'export var gain=.9;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(0,gain,y)}',controls:{},updatedAt:1},{id:'bad',name:'Bad',src:'invalid source !!!',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
 record.composition.propertyTracks=[{id:'lost',target:{kind:'instance-control',instanceId:'instance',exportName:'sliderLost'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'lost-a',timeMs:0,value:.2,easing:{curve:'linear'}},{id:'lost-b',timeMs:1000,value:.3,easing:{curve:'linear'}}]}]
 let saved=structuredClone(record);const write=vi.fn(async(_id:string,next:ShowRecordV2)=>{saved=structuredClone(next)});setPersonalContentProvider({...getPersonalContentProvider(),replaceShowV2:write,listShowDocumentsV2:async()=>[structuredClone(saved)]})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const context=()=>{const provider=getPersonalContentProvider();return {showId:record.id,baseRevision:useShowStore.getState().showRevisions[record.id]??0,capture:captureShowStageEditV2(useShowStore.getState().showV2Pilots[record.id],dependencies),isCurrent:()=>getPersonalContentProvider()===provider,onAdopted:vi.fn()}}
 return {record,dependencies,write,context,saved:()=>saved}
}
const empty={affectedClipIds:[],affectedInstanceIds:[],affectedTransitionIds:[],affectedTrackIds:[],affectedLayoutDefinitionIds:[],affectedLayoutOccurrenceIds:[],affectedGroupDefinitionIds:[],affectedGroupOccurrenceIds:[],affectedLayerIds:[],affectedMarkerIds:[],affectedAppearanceKeyIds:[],affectedPropertyKeyIds:[],removedIds:[],discardedControlTargets:[]}
function effects(value:object){return Object.fromEntries(Object.entries(value).filter(([key])=>key in empty))}
it('resolves trusted captured sliders/name, retains sole runtime and prunes only incompatible animation in one save/history',async()=>{
 const {record,dependencies,write,context,saved}=setup(),request=context();expect(request.capture.prepared.status).toBe('ready');dependencies.patterns[1].src='export function sliderGuessed(v){}';dependencies.patterns[1].name='Guessed'
 const result=await admitShowV2PilotClipReplacementEdit({...request,intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'}}});expect(result.status).toBe('applied');expect(write).toHaveBeenCalledTimes(1);expect(request.onAdopted).toHaveBeenCalledTimes(1)
 expect(saved().composition.patternInstances[0]).toMatchObject({id:'instance',patternName:'Other',controlTargets:{sliderGain:.4}});expect(saved().composition.patternInstances[0].controlTargets).not.toHaveProperty('sliderLost');expect(saved().composition.clips).toEqual(record.composition.clips);expect(saved().composition.transitions).toEqual(record.composition.transitions)
 expect(effects(result)).toEqual({...empty,affectedClipIds:['clip'],affectedInstanceIds:['instance'],affectedTrackIds:['lost'],affectedPropertyKeyIds:['lost-a','lost-b'],removedIds:['lost','lost-a','lost-b'],discardedControlTargets:[{kind:'instance-control',instanceId:'instance',exportName:'sliderLost'}]})
 expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1);await useShowStore.getState().undoShowV2Pilot(record.id);expect({...saved(),updatedAt:record.updatedAt}).toEqual(record);await useShowStore.getState().redoShowV2Pilot(record.id);expect(saved().composition.patternInstances[0].pattern.id).toBe('other')
})
it('shared held Group users remain exact while selected ordinary replacement uses one explicit fresh runtime',async()=>{
 const {record,context,write,saved}=setup(true),request=context();let n=0;const plan=createShowV2ClipReplacementIntent(request.capture,'clip',{kind:'user',id:'other'},()=>`fresh-${++n}`);if(plan.status!=='ready')throw Error(plan.message)
 const result=await admitShowV2PilotClipReplacementEdit({...request,intent:plan.intent});expect(result.status).toBe('applied');expect(write).toHaveBeenCalledTimes(1);expect(saved().composition.patternInstances[0]).toEqual(record.composition.patternInstances[0]);expect(saved().composition.groupDefinitions).toEqual(record.composition.groupDefinitions);expect(saved().composition.groupOccurrences).toEqual(record.composition.groupOccurrences);expect(saved().composition.propertyTracks).toEqual(record.composition.propertyTracks);expect(saved().composition.clips[0]).toEqual({...record.composition.clips[0],instanceId:'fresh-1'});expect(effects(result)).toEqual({...empty,affectedClipIds:['clip'],affectedInstanceIds:['fresh-1'],discardedControlTargets:[{kind:'instance-control',instanceId:'instance',exportName:'sliderLost'}]})
})
it('same source no-op, malformed ingress and unavailable source all preserve record/history and zero writes',async()=>{
 const {record,context,write}=setup();const request=context();expect(await admitShowV2PilotClipReplacementEdit({...request,intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'voice'}}})).toMatchObject({status:'unchanged',...empty})
 for(const intent of [{kind:'replace-pattern',clipId:'clip',replacement:{exportedSliders:[]}},{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other',src:'guess'}},{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'},independence:{instanceId:'new',identitiesBySourceTrackId:{x:{trackId:'y',keyframeIdsBySourceId:{},extra:true}}}},{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'missing'}},{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'bad'}},{kind:'replace-pattern',clipId:' ' ,patternReference:{kind:'stock',id:'Blink'}}]){const result=await admitShowV2PilotClipReplacementEdit({...request,intent:intent as never});expect(result.status).toBe('refused');expect(effects(result)).toEqual(empty)}
 expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
it('stale record/provider callbacks refuse before adoption and fresh callback saves once',async()=>{
 const {context,write}=setup();const request=context();setPersonalContentProvider({...getPersonalContentProvider(),id:'provider-B'});expect(await admitShowV2PilotClipReplacementEdit({...request,intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'}}})).toMatchObject({status:'refused',code:'stale-edit',...empty});expect(write).not.toHaveBeenCalled()
 expect((await admitShowV2PilotClipReplacementEdit({...context(),intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'}}})).status).toBe('applied');expect(write).toHaveBeenCalledTimes(1)
 expect(await admitShowV2PilotClipReplacementEdit({...request,intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'}}})).toMatchObject({status:'refused',code:'stale-edit',...empty})
})
it('failed save restores prior composition/history and retry uses the rolled-back current record',async()=>{
 const {record,context,write,saved}=setup();write.mockRejectedValueOnce(Error('replace-failed'));await expect(admitShowV2PilotClipReplacementEdit({...context(),intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'}}})).rejects.toThrow('replace-failed');expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
 expect((await admitShowV2PilotClipReplacementEdit({...context(),intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'}}})).status).toBe('applied');expect(saved().composition.patternInstances[0].pattern.id).toBe('other');expect(write).toHaveBeenCalledTimes(2)
})
it('admitted sole runtime with incompatible animation owned by an unused Group slot refuses without changing any owner',async()=>{
 const {record,context,write}=setup(true);record.composition.propertyTracks=[];const group=record.composition.groupDefinitions[0];group.patternInstances.push({...structuredClone(group.patternInstances[0]),id:'active'});group.clips[0].instanceId='active';record.composition.patternInstances.push({...structuredClone(record.composition.patternInstances[0]),id:'other-runtime'})
 record.composition.groupOccurrences.forEach(occurrence=>{occurrence.instanceBindings={slot:'instance',active:'other-runtime'}})
 group.propertyTracks=[{id:'local-lost',target:{kind:'instance-control',instanceId:'slot',exportName:'sliderLost'},activeStartMs:0,activeDurationMs:400,keyframes:[{id:'local-a',timeMs:0,value:.2,easing:{curve:'linear'}},{id:'local-b',timeMs:400,value:.3,easing:{curve:'linear'}}]}]
 const request=context();expect(request.capture.prepared.status,JSON.stringify(request.capture.prepared)).toBe('ready');const result=await admitShowV2PilotClipReplacementEdit({...request,intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'}}});expect(result).toMatchObject({status:'refused',code:'compiler-ineligible',...empty});expect(result.status==='refused'&&result.message).toMatch(/Group/);expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})

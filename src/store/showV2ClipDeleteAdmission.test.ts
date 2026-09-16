import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { propertyEditRecord, propertyEditTrack, propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, setPersonalContentProvider, resetPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotClipDelete } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState)})
afterEach(()=>resetPersonalContentProvider())
let serial=0
function setup(group=false, supplied?:ShowRecordV2){
 const record=supplied??(group?propertyEditGroupRecord():propertyEditRecord());record.id=`delete-${++serial}`;record.composition.patternInstances[0].pattern={kind:'user',id:'voice'};record.composition.propertyTracks=supplied?.composition.propertyTracks??[propertyEditTrack()]
 const dependencies={patterns:[{id:'voice',name:'Voice',src:'var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
 let saved=structuredClone(record);const write=vi.fn(async(_id:string,next:ShowRecordV2)=>{saved=structuredClone(next)})
 setPersonalContentProvider({...getPersonalContentProvider(),replaceShowV2:write,listShowDocumentsV2:async()=>[structuredClone(saved)]})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const context=()=>{const provider=getPersonalContentProvider();return {showId:record.id,baseRevision:useShowStore.getState().showRevisions[record.id]??0,capture:captureShowStageEditV2(useShowStore.getState().showV2Pilots[record.id],dependencies),isCurrent:()=>getPersonalContentProvider()===provider,onAdopted:vi.fn()}}
 return {record,write,context,saved:()=>saved}
}
const empty={affectedClipIds:[],affectedInstanceIds:[],affectedTransitionIds:[],affectedTrackIds:[],affectedLayoutDefinitionIds:[],affectedLayoutOccurrenceIds:[],affectedGroupDefinitionIds:[],affectedGroupOccurrenceIds:[],affectedLayerIds:[],affectedMarkerIds:[],affectedAppearanceKeyIds:[],affectedPropertyKeyIds:[],removedIds:[],discardedControlTargets:[]}
function effects(value:object){return Object.fromEntries(Object.entries(value).filter(([key])=>key in empty))}
it('deletes final ordinary content through validated empty admission and reports exactly fourteen collections',async()=>{
 const {record,write,context,saved}=setup();const request=context();expect(request.capture.prepared.status).toBe('ready')
 const result=await admitShowV2PilotClipDelete({...request,intent:{kind:'delete-clip',clipId:'clip'}})
 expect(result).toMatchObject({status:'applied',settlement:'saved'});expect(effects(result)).toEqual({...empty,affectedClipIds:['clip'],affectedTrackIds:['animation'],affectedAppearanceKeyIds:record.composition.clips[0].appearance.keys.map(k=>k.id),affectedPropertyKeyIds:['left','right'],removedIds:['animation','clip']})
 expect(write).toHaveBeenCalledTimes(1);expect(saved().composition.clips).toEqual([]);expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances);expect(saved().composition.showEndMs).toBe(record.composition.showEndMs);expect(context().capture.prepared.status).toBe('empty');expect(request.onAdopted).toHaveBeenCalledTimes(1)
 expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true);expect({...saved(),updatedAt:record.updatedAt}).toEqual(record);expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true);expect(saved().composition.clips).toEqual([])
})
it('preserves shared held Group uses, definitions, runtime payloads and positions',async()=>{
 const {record,write,context,saved}=setup(true);expect(context().capture.prepared.status).toBe('ready');expect((await admitShowV2PilotClipDelete({...context(),intent:{kind:'delete-clip',clipId:'clip'}})).status).toBe('applied')
 expect(saved().composition.groupOccurrences).toEqual(record.composition.groupOccurrences);expect(saved().composition.groupDefinitions).toEqual(record.composition.groupDefinitions);expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances);expect(context().capture.prepared.status).toBe('ready');expect(write).toHaveBeenCalledTimes(1)
})
it('rejects malformed ingress, missing/materialized targets and stale captures without writes or effects',async()=>{
 const {record,write,context}=setup(true)
 for(const intent of [{kind:'delete-clip',clipId:'clip',extra:true},{kind:'delete-clip',clipId:' '},{kind:'move',clipId:'clip'},{kind:'delete-clip',clipId:'occ-0:child'},{kind:'delete-clip',clipId:'missing'}]){const result=await admitShowV2PilotClipDelete({...context(),intent:intent as never});expect(result.status).toBe('refused');expect(effects(result)).toEqual(empty)}
 const request=context();request.isCurrent=()=>false;expect(await admitShowV2PilotClipDelete({...request,intent:{kind:'delete-clip',clipId:'clip'}})).toMatchObject({status:'refused',code:'stale-edit'});expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})
it('failed deletion rolls back content/history and allows one explicit retry',async()=>{
 const {record,write,context,saved}=setup();write.mockRejectedValueOnce(Error('delete-failed'));await expect(admitShowV2PilotClipDelete({...context(),intent:{kind:'delete-clip',clipId:'clip'}})).rejects.toThrow('delete-failed')
 expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([]);expect((await admitShowV2PilotClipDelete({...context(),intent:{kind:'delete-clip',clipId:'clip'}})).status).toBe('applied');expect(write).toHaveBeenCalledTimes(2);expect(saved().composition.clips).toEqual([])
})

it.each([false,true])('deletes attached Transition or refuses its owned Property ramp (%s)',async ramp=>{
 const converted=convertShowRecordV1ToV2(transitionV1Show('crossfade'));if(converted.status!=='converted')throw Error('fixture')
 const source=converted.record;source.composition.patternInstances.forEach(instance=>{instance.pattern={kind:'user',id:'voice'};instance.controlTargets={sliderGain:.4}})
 const track=propertyEditTrack({kind:'clip-view',clipId:'in',property:'brightness'});track.activeStartMs=600;track.activeDurationMs=400;track.keyframes[0].timeMs=600;source.composition.propertyTracks=[track]
 if(ramp)source.composition.transitions[0].propertyRamps=[{participantId:source.composition.transitions[0].participants[0].id,target:{kind:'clip-view',clipId:'in',property:'brightness'},from:.2,easing:{curve:'linear'}}]
 const {record,context,write,saved}=setup(false,source);expect(context().capture.inputCapture?.status).toBe('qualified')
 const result=await admitShowV2PilotClipDelete({...context(),intent:{kind:'delete-clip',clipId:'in'}})
 if(ramp){expect(result).toMatchObject({status:'refused',code:'unsupported-property-carrier'});expect(effects(result)).toEqual(empty);expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)}
 else{expect(result).toMatchObject({status:'applied',affectedTransitionIds:['transition-crossfade'],affectedTrackIds:['animation'],affectedPropertyKeyIds:['left','right']});expect(saved().composition.transitions).toEqual([]);expect(saved().composition.clips).toEqual([record.composition.clips[0]]);expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances)}
})
it('retained duplicate deletion request is stale after first adoption and writes once',async()=>{
 const {context,write}=setup();const request={...context(),intent:{kind:'delete-clip' as const,clipId:'clip'}};expect((await admitShowV2PilotClipDelete(request)).status).toBe('applied');expect(await admitShowV2PilotClipDelete(request)).toMatchObject({status:'refused',code:'stale-edit'});expect(write).toHaveBeenCalledTimes(1)
})
it('provider replacement supersedes an adopted deletion completion',async()=>{
 const {context,write}=setup();let finish!:()=>void;write.mockImplementationOnce(async()=>new Promise<void>(resolve=>{finish=resolve}));const promise=admitShowV2PilotClipDelete({...context(),intent:{kind:'delete-clip',clipId:'clip'}});await vi.waitFor(()=>expect(write).toHaveBeenCalledTimes(1));setPersonalContentProvider({...getPersonalContentProvider(),id:'other'});finish();expect(await promise).toMatchObject({status:'applied',settlement:'superseded'})
})

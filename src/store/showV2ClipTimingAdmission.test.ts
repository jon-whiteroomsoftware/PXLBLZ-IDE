import {evaluateShowPropertyTrackV2} from '../engine/showPropertyAnimationV2'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {convertShowRecordV1ToV2} from '../engine/showRecordV1ToV2'
import {convertibleV1Show} from '../test/showV2TracerFixture'
import * as stage from '../engine/showPreparedStageV2'
import {getPersonalContentProvider,resetPersonalContentProvider,setPersonalContentProvider} from '../engine/personalContentProvider'
import {showInitialState,useShowStore} from './showStore'
import {admitShowV2PilotCreateClip,admitShowV2PilotClipTemporal,admitShowV2PilotInsertTime,admitShowV2PilotSetShowEnd} from './showV2PreparedEditAdmission'
import type {CreateShowClipIntentV2} from '../engine/showClipCreationV2'
import type {ShowRecordV2} from '../engine/showCompositionV2'
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState)})
afterEach(()=>resetPersonalContentProvider())
let index=0
function setup(empty=false){
 const c=convertShowRecordV1ToV2(convertibleV1Show());if(c.status!=='converted')throw Error('Conversion')
 const record=c.record;record.id=`timing-${++index}`;record.composition.showEndMs=30000;record.composition.layoutOccurrences[0].durationMs=30000
 record.composition.transitions=[];record.composition.propertyTracks=[];record.composition.clips=record.composition.clips.slice(0,1);record.composition.clips[0].durationMs=10000
 for(const instance of record.composition.patternInstances)instance.pattern={kind:'user',id:'voice'}
 if(empty){record.composition.clips=[];record.composition.patternInstances=[]}
 const dependencies:stage.ShowPreparedStageDependenciesV2={patterns:[{id:'voice',name:'Voice',src:'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
 let saved=structuredClone(record);const write=vi.fn(async(_id:string,next:ShowRecordV2)=>{saved=structuredClone(next)})
 setPersonalContentProvider({...getPersonalContentProvider(),id:'timing-test',replaceShowV2:write,listShowDocumentsV2:async()=>[structuredClone(saved)]})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const prepared=stage.prepareShowStageV2(record,dependencies);if(prepared.status==='refused')throw Error(prepared.message)
 const context={showId:record.id,baseRevision:0,capture:{record,dependencies,prepared},isCurrent:()=>true,onAdopted:vi.fn()}
 return {record,context,write,readSaved:()=>saved}
}
function create(record:ShowRecordV2):CreateShowClipIntentV2{return {kind:'create-clip',patternReference:{kind:'user',id:'voice'},clip:{id:'added',zoneId:record.zones[0].id,layerId:record.composition.layers[0].id,startMs:10000,durationMs:10000,entryPolicy:'continue',zoneSampleMode:'span',appearance:{keys:[{id:'added-key',timeMs:10000,value:{opacity:1,view:{mirror:false,phase:0,brightness:1},effects:[]}}]}},runtime:record.composition.patternInstances.length?{kind:'existing',instanceId:record.composition.clips[0].instanceId}:{kind:'first',instance:{id:'first-runtime',pattern:{kind:'user',id:'voice'},patternName:'Voice',time:{timeScale:1,timeOffsetMs:0},controlTargets:{}}}}}
it.each([false,true])('creates explicit content from empty=%s with one preparation/history/save and exact runtime ownership',async empty=>{
 const {record,context,write,readSaved}=setup(empty);const before=structuredClone(record);const factory=vi.spyOn(stage,'prepareShowStageV2')
 try{const result=await admitShowV2PilotCreateClip({...context,intent:create(record)})
 expect(result).toMatchObject({status:'applied',settlement:'saved',affectedClipIds:['added']});expect(factory).toHaveBeenCalledTimes(1);expect(write).toHaveBeenCalledTimes(1)
 expect(record).toEqual(before);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before]);expect(readSaved().composition.clips.find(c=>c.id==='added')).toMatchObject({startMs:10000,durationMs:10000,instanceId:empty?'first-runtime':record.composition.clips[0].instanceId})
 expect(stage.prepareShowStageV2(readSaved(),context.capture.dependencies).status).toBe('ready')
 }finally{factory.mockRestore()}
})

it('commits the native move/trim/extend/split/insert/end sequence once per action, preserving exact animation and runtime',async()=>{
 const {record,context,write,readSaved}=setup();const runtime=record.composition.clips[0].instanceId
 record.composition.propertyTracks=[{id:'clock',target:{kind:'instance-time-scale',instanceId:runtime},activeStartMs:0,activeDurationMs:10000,keyframes:[{id:'a',timeMs:0,value:2,easing:{curve:'quadratic',direction:'in'}},{id:'b',timeMs:10000,value:4,easing:{curve:'linear'}}]}]
 const invoke=async(intent:import('../engine/showClipTemporalV2').ShowClipTemporalIntentV2)=>admitShowV2PilotClipTemporal({...freshContext(context),intent})
 const id=record.composition.clips[0].id
 expect((await invoke({kind:'move',clipId:id,startMs:1000})).status).toBe('applied')
 expect((await invoke({kind:'trim',clipId:id,startMs:2000,endMs:10000})).status).toBe('applied')
 expect((await invoke({kind:'extend',clipId:id,startMs:1000,endMs:11000})).status).toBe('applied')
 expect((await invoke({kind:'split',clipId:id,atMs:6000,rightClipId:'right'})).status).toBe('applied')
 const inserted=await admitShowV2PilotInsertTime({...freshContext(context),intent:{atMs:4000,durationMs:1000}});expect(inserted.status).toBe('applied');expect(inserted.affectedTrackIds).toEqual(['clock']);expect(inserted.affectedPropertyKeyIds.length).toBeGreaterThan(0)
 expect((await admitShowV2PilotSetShowEnd({...freshContext(context),intent:{kind:'set-show-end',showEndMs:40000}})).status).toBe('applied')
 const saved=readSaved();expect(write).toHaveBeenCalledTimes(6);expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(6)
 expect(saved.composition.clips.map(c=>[c.id,c.startMs,c.durationMs,c.instanceId,c.entryPolicy])).toEqual([[id,1000,6000,runtime,'continue'],['right',7000,5000,runtime,'continue']])
 expect(saved.composition.showEndMs).toBe(40000);expect(saved.composition.layoutOccurrences[0].durationMs).toBe(40000)
 const track=saved.composition.propertyTracks[0]
 for(const [at,value] of [[1000,2.02],[1999,2.02],[4000,2.18],[4999,2.18],[5000,2.18],[6000,2.32],[11000,3.62],[11999,3.62]] as const)expect(evaluateShowPropertyTrackV2(track,at)).toBeCloseTo(value,12)
 expect(evaluateShowPropertyTrackV2(track,12000)).toBeUndefined()
})
it('re-places a Clip onto another Layer through the closed admission with one history and save',async()=>{
 const {record,context,write,readSaved}=setup();const id=record.composition.clips[0].id
 record.composition.layers.push({id:'overlay',zoneId:record.zones[0].id,name:'Over',rank:Math.max(...record.composition.layers.map(layer=>layer.rank))+1})
 const applied=await admitShowV2PilotClipTemporal({...freshContext(context),intent:{kind:'replace-placement',clipId:id,layerId:'overlay',startMs:2000}})
 expect(applied).toMatchObject({status:'applied',settlement:'saved',affectedClipIds:[id]})
 expect(write).toHaveBeenCalledTimes(1);expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
 expect(readSaved().composition.clips[0]).toMatchObject({id,layerId:'overlay',startMs:2000,durationMs:10000})
 expect(readSaved().composition.patternInstances).toEqual(record.composition.patternInstances)
 expect(stage.prepareShowStageV2(readSaved(),context.capture.dependencies).status).toBe('ready')
 // An unknown destination is a typed owner refusal that writes nothing.
 const refused=await admitShowV2PilotClipTemporal({...freshContext(context),intent:{kind:'replace-placement',clipId:id,layerId:'absent'}})
 expect(refused).toMatchObject({status:'refused',source:'owner',code:'missing-target'});expect(write).toHaveBeenCalledTimes(1)
 for(const [name,value]of Object.entries(refused))if(name.startsWith('affected')||name.startsWith('removed'))expect(value).toEqual([])
})
function freshContext(context:ReturnType<typeof setup>['context']){
 const record=useShowStore.getState().showV2Pilots[context.showId]
 return {...context,baseRevision:useShowStore.getState().showRevisions[context.showId]??0,capture:{...context.capture,record,prepared:stage.prepareShowStageV2(record,context.capture.dependencies)}}
}

const attempts = [
 {name:'Create',call:(c:ReturnType<typeof setup>['context'])=>admitShowV2PilotCreateClip({...c,intent:create(c.capture.record)})},
 {name:'Move',call:(c:ReturnType<typeof setup>['context'])=>admitShowV2PilotClipTemporal({...c,intent:{kind:'move',clipId:c.capture.record.composition.clips[0]?.id??'missing',startMs:1000}})},
 {name:'Insert',call:(c:ReturnType<typeof setup>['context'])=>admitShowV2PilotInsertTime({...c,intent:{atMs:5000,durationMs:1000}})},
 {name:'End',call:(c:ReturnType<typeof setup>['context'])=>admitShowV2PilotSetShowEnd({...c,intent:{kind:'set-show-end',showEndMs:40000}})},
]
it.each(attempts)('$name refuses stale revision before any history/provider write or candidate preparation',async({call})=>{
 const {context,record,write}=setup();useShowStore.setState({showRevisions:{[record.id]:1}});const factory=vi.spyOn(stage,'prepareShowStageV2')
 try{const result=await call(context);expect(result).toMatchObject({status:'refused',source:'admission',code:'stale-edit'});expect(write).not.toHaveBeenCalled();expect(factory).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([]);for(const [name,value]of Object.entries(result))if(name.startsWith('affected')||name.startsWith('removed')||name==='discardedControlTargets'||name==='hoistedInstanceIds')expect(value).toEqual([])}finally{factory.mockRestore()}
})
it.each(['Insert','End'] as const)('preserves explicit empty capability on %s with no runtime',async name=>{
 const {context,record,write,readSaved}=setup(true);const action=attempts.find(a=>a.name===name)!
 const result=await action.call(context);expect(result.status).toBe('applied');expect(write).toHaveBeenCalledTimes(1);expect(readSaved().composition.clips).toEqual([]);expect(readSaved().composition.patternInstances).toEqual([]);expect(stage.prepareShowStageV2(readSaved(),context.capture.dependencies).status).toBe('empty');expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
})
it('retains exact owner refusal and unchanged collections without writes',async()=>{
 const {context,record,write}=setup();const id=record.composition.clips[0].id
 const noop=await admitShowV2PilotClipTemporal({...context,intent:{kind:'move',clipId:id,startMs:0}});expect(noop.status).toBe('unchanged')
 const mixed=await admitShowV2PilotClipTemporal({...context,intent:{kind:'trim',clipId:id,startMs:1000,endMs:11000}});expect(mixed).toMatchObject({status:'refused',source:'owner',code:'invalid-intent'})
 const protectedEnd=await admitShowV2PilotSetShowEnd({...context,intent:{kind:'set-show-end',showEndMs:5000}});expect(protectedEnd).toMatchObject({status:'refused',source:'owner',code:'protected-content'})
 expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
 for(const result of [noop,mixed,protectedEnd])for(const [name,value]of Object.entries(result))if(name.startsWith('affected')||name.startsWith('removed')||name==='discardedControlTargets')expect(value).toEqual([])
})
it('does not accept hidden Layout commands or extra Insert fields through narrowed wrappers',async()=>{
 const {context,record,write}=setup()
 const hidden=await admitShowV2PilotSetShowEnd({...context,intent:{kind:'remove',occurrenceId:record.composition.layoutOccurrences[0].id} as never});expect(hidden).toMatchObject({status:'refused',code:'invalid-intent'})
 const extra=await admitShowV2PilotInsertTime({...context,intent:{atMs:0,durationMs:1000,secret:true} as never});expect(extra).toMatchObject({status:'refused',code:'invalid-intent'});expect(write).not.toHaveBeenCalled()
})
it('refuses ambiguous source runtimes rather than choosing by equal display name',async()=>{
 const {context,record,write}=setup();record.composition.patternInstances.push({...structuredClone(record.composition.patternInstances[0]),id:'second-runtime',patternName:'Voice'})
 const intent=create(record);intent.runtime={kind:'existing'}
 const result=await admitShowV2PilotCreateClip({...freshContext(context),intent});expect(result).toMatchObject({status:'refused',source:'owner',code:'invalid-intent'});expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})
it('keeps collision refusal atomic and does not silently pick a different source with the same name',async()=>{
 const {context,record,write}=setup();const intent=create(record);intent.clip.id=record.composition.clips[0].id
 expect(await admitShowV2PilotCreateClip({...context,intent})).toMatchObject({status:'refused',source:'owner',code:'invalid-intent'})
 const wrongSource=create(record);wrongSource.patternReference={kind:'user',id:'different-voice'}
 expect(await admitShowV2PilotCreateClip({...context,intent:wrongSource})).toMatchObject({status:'refused',source:'owner',code:'invalid-intent'});expect(write).not.toHaveBeenCalled()
})

it.each(['fast','fidelity'] as const)('opens saved native choreography and matches independent manual clock/Clip oracle in %s',async fidelity=>{
 const {record,context}=setup();const runtime=record.composition.clips[0].instanceId;const id=record.composition.clips[0].id;const before=structuredClone(record)
 record.composition.propertyTracks=[{id:'clock',target:{kind:'instance-time-scale',instanceId:runtime},activeStartMs:0,activeDurationMs:10000,keyframes:[{id:'a',timeMs:0,value:2,easing:{curve:'quadratic',direction:'in'}},{id:'b',timeMs:10000,value:4,easing:{curve:'linear'}}]}]
 for(const intent of [{kind:'move',clipId:id,startMs:1000},{kind:'trim',clipId:id,startMs:2000,endMs:10000},{kind:'extend',clipId:id,startMs:1000,endMs:11000},{kind:'split',clipId:id,atMs:6000,rightClipId:'right'}] as const)expect((await admitShowV2PilotClipTemporal({...freshContext(context),intent})).status).toBe('applied')
 const inserted=await admitShowV2PilotInsertTime({...freshContext(context),intent:{atMs:4000,durationMs:1000}});expect(inserted.status).toBe('applied');expect(inserted.affectedTrackIds).toEqual(['clock']);expect(inserted.affectedPropertyKeyIds.length).toBeGreaterThan(0)
 expect((await admitShowV2PilotSetShowEnd({...freshContext(context),intent:{kind:'set-show-end',showEndMs:40000}})).status).toBe('applied')
 const {parseProvisionalShowRecordV2,serializeProvisionalShowRecordV2}=await import('../engine/showCompositionV2')
 const opened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(useShowStore.getState().showV2Pilots[record.id]));expect(opened.status).toBe('opened');if(opened.status!=='opened')throw Error('native reopen')
 const expected=structuredClone(before);expected.composition.showEndMs=40000;expected.composition.layoutOccurrences[0].durationMs=40000
 const original=before.composition.clips[0];expected.composition.clips=[{...structuredClone(original),startMs:1000,durationMs:6000,appearance:{keys:[{...structuredClone(original.appearance.keys[0]),timeMs:1000}]}},{...structuredClone(original),id:'right',startMs:7000,durationMs:5000,entryPolicy:'continue',appearance:{keys:[{...structuredClone(original.appearance.keys[0]),timeMs:7000}]}}]
 const q=(offset:number)=>2+2*(offset/10000)**2
 const segment=(offset:number)=>({baseValue:2,deltaValue:2,easing:{curve:'quadratic' as const,direction:'in' as const},sourceDurationMs:10000,elapsedOffsetMs:offset})
 expected.composition.propertyTracks=[{id:'clock',target:{kind:'instance-time-scale',instanceId:runtime},activeStartMs:1000,activeDurationMs:11000,keyframes:[
 {id:'one',timeMs:1000,value:q(1000),easing:{curve:'linear'}},{id:'two',timeMs:2000,value:q(1000),easing:{curve:'quadratic',direction:'in'},curveSegment:segment(1000)},
 {id:'hold',timeMs:4000,value:q(3000),easing:{curve:'linear'}},{id:'resume',timeMs:5000,value:q(3000),easing:{curve:'quadratic',direction:'in'},curveSegment:segment(3000)},
 {id:'last-held',timeMs:11000,value:q(9000),easing:{curve:'linear'}},{id:'end',timeMs:12000,value:q(9000),easing:{curve:'linear'}}]}]
 const actual=stage.prepareShowStageV2(opened.record,context.capture.dependencies);const oracle=stage.prepareShowStageV2(expected,context.capture.dependencies);expect(actual.status,JSON.stringify(actual)).toBe('ready');expect(oracle.status,JSON.stringify(oracle)).toBe('ready');if(actual.status!=='ready'||oracle.status!=='ready')throw Error('compile ready')
 const {buildShowEpeExportV2}=await import('../engine/showEpeExportV2');const {parseEpe}=await import('../engine/epeImport');const {createFastReplayRuntime}=await import('../engine/fastReplay')
 const exported=buildShowEpeExportV2(opened.record,actual.bundle.artifact.code,{id:'timing-proof',stampedAt:'2026-09-16T00:00:00Z'});expect(exported.status).toBe('exported');if(exported.status!=='exported')throw Error('export')
 const reopened=parseEpe(exported.text);expect(reopened.stamp?.kind).toBe('show')
 const options={fidelity,randomSeed:1038,mapPoints:[{sample:[.25,.5] as [number,number],pos:[.25,.5] as [number,number]}]}
 const actualRuntime=createFastReplayRuntime({...actual.bundle.artifact,code:reopened.src,dimension:2},options);const expectedRuntime=createFastReplayRuntime({...oracle.bundle.artifact,dimension:2},options)
 for(const at of [0,875,1000,2000,3875,4000,4875,5000,6000,7000,11000,11875,12000,30000,40000]){
 const a=actualRuntime.advanceTo(at,{stepMs:125,forceFullIntermediateRender:true});const e=expectedRuntime.advanceTo(at,{stepMs:125,forceFullIntermediateRender:true});expect(Array.from(a.frame),`${fidelity} at ${at}`).toEqual(Array.from(e.frame));expect(a.exports,`${fidelity} state at ${at}`).toEqual(e.exports)
 }
})
it.each(attempts)('$name retains current ready preimage when changed candidate preparation refuses',async({call})=>{
 const {context,record,write}=setup();const factory=vi.spyOn(stage,'prepareShowStageV2').mockReturnValue({status:'refused',message:'Typed candidate boundary'})
 try{const outcome=await call(context);expect(outcome).toMatchObject({status:'refused',source:'admission',code:'unsupported-pilot-record',message:'Typed candidate boundary'});expect(factory).toHaveBeenCalledTimes(1);expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])}finally{factory.mockRestore()}
})

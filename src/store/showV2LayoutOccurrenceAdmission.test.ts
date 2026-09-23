import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { showV2LayoutEditorFixture } from '../test/showV2LayoutEditorFixture'
import { editShowLayoutIntervalsV2 } from '../engine/showLayoutIntervalsV2'
import { insertShowLayoutIntervalV2 } from '../engine/showLayoutIntervalInsertV2'
import { planShowV2LayoutEdit } from '../engine/showV2LayoutEditorModel'
import type { ShowV2LayoutEditorIntent } from '../engine/showV2LayoutEditorModel'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import * as stage from '../engine/showPreparedStageV2'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotLayoutOccurrenceEdit } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { qualifyShowV2PilotArtifacts } from '../engine/showV2Pilot'
import { createFastReplayRuntime } from '../engine/fastReplay'
import { emitFixedPoint } from '../engine/fxEmit'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState)})
afterEach(()=>resetPersonalContentProvider())
let fixtureId=0
function setup() {
 const {record,dependencies}=showV2LayoutEditorFixture();record.id=`layout-admission-${++fixtureId}`;let saved=structuredClone(record)
 const write=vi.fn(async(_id:string,next:ShowRecordV2)=>{saved=structuredClone(next)})
 setPersonalContentProvider({...getPersonalContentProvider(),id:'layout-admission-provider',replaceShowV2:write})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const capture=stage.captureShowStageEditV2(record,dependencies);expect(capture.prepared.status,capture.prepared.status==='refused'?capture.prepared.message:'').toBe('ready')
 return{record,dependencies,write,saved:()=>saved,context:{showId:record.id,baseRevision:0,capture,isCurrent:()=>true,onAdopted:vi.fn()}}
}
const actions:ShowV2LayoutEditorIntent[]=[{kind:'select-layout',occurrenceId:'later-layout',layoutId:'alternate-layout'},{kind:'make-unique',occurrenceId:'later-layout',layoutId:'solo',name:'Solo'},{kind:'move',occurrenceId:'later-layout',startMs:6000},{kind:'remove',occurrenceId:'later-layout'}]
function effects(value:object) {return Object.entries(value).filter(([key])=>key.startsWith('affected')||key==='removedLayoutOccurrenceIds')}
function empty(value:object) {expect(effects(value)).toHaveLength(8);for(const[,array]of effects(value)) expect(array).toEqual([])}
it.each(actions)('checked $kind preserves every owner effect and one preparation/history/save',async intent=>{
 const {record,context,write,saved,dependencies}=setup(),expected=editShowLayoutIntervalsV2(record,intent);expect(expected.status).toBe('changed')
 const prepare=vi.spyOn(stage,'prepareShowStageFromCapturedInputsV2')
 try{const result=await admitShowV2PilotLayoutOccurrenceEdit({...context,intent});expect(result).toMatchObject({status:'applied',settlement:'saved'});expect(effects(result)).toEqual(effects(expected));expect(prepare).toHaveBeenCalledTimes(1);expect(write).toHaveBeenCalledTimes(1);expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1);expect(saved().composition).toEqual(expected.record.composition);expect(stage.prepareShowStageV2(saved(),dependencies).status).toBe('ready')}finally{prepare.mockRestore()}
})
it('keeps unrelated authored owners exact and refuses initial/owned-track/transfer edits atomically',async()=>{
 const {record,context,write}=setup(),initial=record.composition.layoutOccurrences[0].id
 const noOp=await admitShowV2PilotLayoutOccurrenceEdit({...context,intent:{kind:'move',occurrenceId:'later-layout',startMs:5000}});expect(noOp.status).toBe('unchanged');empty(noOp)
 const bad=await admitShowV2PilotLayoutOccurrenceEdit({...context,intent:{kind:'move',occurrenceId:initial,startMs:1000}});expect(bad).toMatchObject({status:'refused',source:'owner',code:'invalid-intent'});empty(bad)
 expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
 for(const partition of ['track','transfer'] as const){
  const fixture=setup(),later=fixture.record.composition.layoutOccurrences[1]
  if(partition==='track') fixture.record.composition.propertyTracks.push({id:'split-owned',target:{kind:'layout-occurrence-split-position',layoutOccurrenceId:later.id},activeStartMs:5500,activeDurationMs:1000,keyframes:[{id:'split',timeMs:5500,value:.5,easing:{curve:'linear'}},{id:'split-end',timeMs:6500,value:.5,easing:{curve:'linear'}}]})
  else later.incomingTransfer={id:'incoming',fromOccurrenceId:fixture.record.composition.layoutOccurrences[0].id,durationMs:1000,direction:'forward',easing:{curve:'linear'}}
  const capture=stage.captureShowStageEditV2(fixture.record,fixture.dependencies)
  const intent:ShowV2LayoutEditorIntent=partition==='track'?{kind:'move',occurrenceId:later.id,startMs:6000}:{kind:'remove',occurrenceId:later.id}
  const result=await admitShowV2PilotLayoutOccurrenceEdit({...fixture.context,capture,intent});expect(result).toMatchObject({status:'refused',source:'owner',code:partition==='track'?'owned-track-out-of-bounds':'meaningful-occurrence-data'});empty(result);expect(fixture.write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[fixture.record.id]).toBe(fixture.record)
 }
})
it.each(['record','revision','route','provider','dependencies'] as const)('refuses stale $0 with zero writes',async partition=>{
 const {record,context,write}=setup()
 if(partition==='record') useShowStore.setState({showV2Pilots:{[record.id]:structuredClone(record)}})
 if(partition==='revision') useShowStore.setState({showRevisions:{[record.id]:1}})
 if(partition==='route') context.isCurrent=()=>false
 if(partition==='provider'){const provider=getPersonalContentProvider();context.isCurrent=()=>provider===getPersonalContentProvider();setPersonalContentProvider({...provider,id:'changed'})}
 if(partition==='dependencies'&&context.capture.inputCapture.status==='qualified') Object.assign(context.capture,{inputCapture:{status:'qualified',inputs:{...context.capture.inputCapture.inputs,identity:{...context.capture.inputCapture.inputs.identity,dependencies:{...context.capture.dependencies}}}}})
 const outcome=await admitShowV2PilotLayoutOccurrenceEdit({...context,intent:actions[0]});expect(outcome).toMatchObject({status:'refused',source:'admission',code:'stale-edit'});empty(outcome);expect(write).not.toHaveBeenCalled()
})
it.each([null,{kind:'remove',occurrenceId:'later-layout',extra:true},{kind:'move',occurrenceId:'later-layout',startMs:5000n},...[NaN,Infinity,5000.5,Number.MAX_SAFE_INTEGER+1,'5000',{}].map(startMs=>({kind:'move',occurrenceId:'later-layout',startMs})),{kind:'make-unique',occurrenceId:'later-layout',layoutId:[],name:'Solo'},{kind:'set-show-end',showEndMs:40000}])('malformed/foreign intent refuses without owner throw',async intent=>{
 const {context,record,write}=setup();const result=await admitShowV2PilotLayoutOccurrenceEdit({...context,intent:intent as unknown as ShowV2LayoutEditorIntent});expect(result).toMatchObject({status:'refused',source:'owner',code:'invalid-intent'});empty(result);expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})
it('save failure restores complete prior coverage and history',async()=>{
 const {record,context,write}=setup();write.mockRejectedValueOnce(Error('offline'))
 await expect(admitShowV2PilotLayoutOccurrenceEdit({...context,intent:actions[1]})).rejects.toThrow('offline');expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
it.each(['fast','fidelity'] as const)('reopened native $0 switch edits preserve one continuous shared runtime and held Restart schedule',async fidelity=>{
 for(const intent of actions){
  const {record,dependencies}=showV2LayoutEditorFixture();record.composition.propertyTracks[0].keyframes.forEach(key=>{key.value=.4;delete key.curveSegment})
  const before=stage.prepareShowStageV2(record,dependencies),changed=editShowLayoutIntervalsV2(record,intent);expect(changed.status).toBe('changed');const after=stage.prepareShowStageV2(changed.record,dependencies)
  if(before.status!=='ready'||after.status!=='ready') throw Error('Expected ready native premise')
  const bundles=[before.bundle,after.bundle],files=await Promise.all(bundles.map(bundle=>qualifyShowV2PilotArtifacts(bundle)))
  expect(files[1].importedShow.composition).toEqual(changed.record.composition)
  const artifacts=bundles.map((bundle,index)=>({...bundle.artifact,dimension:bundle.presentation.stageDimension,code:files[index].epeSource,fxCode:emitFixedPoint(files[index].epeSource)}));expect(artifacts.map(x=>x.summary.clips.length)).toEqual([1,1])
  const runtimes=artifacts.map(artifact=>createFastReplayRuntime(artifact,{fidelity,randomSeed:1038,mapPoints:[{sample:[.25,.5],pos:[.25,.5]}]}))
  for(const time of [125,2000,3875,4000,4125,4875,5000,5125,5875,6000,6125,8000,16000,30000]){
   const frames=runtimes.map(runtime=>runtime.advanceTo(time,{stepMs:125,forceFullIntermediateRender:true}))
   const elapsed=frames.map((frame,index)=>Number(frame.exports[`${artifacts[index].summary.clips[0].prefix}_elapsed`])/(fidelity==='fidelity'?65536:1))
   expect(elapsed).toEqual([time-(time>=4000?4000:0),time-(time>=4000?4000:0)]);expect(Array.from(frames[1].frame)).toEqual(Array.from(frames[0].frame))
  }
 }
})
it('reports Group association rebinding when a switch moves before its start without moving held choreography',async()=>{
 const {record,context,saved}=setup(),group=record.composition.groupOccurrences[0],intent={kind:'move' as const,occurrenceId:'later-layout',startMs:1000},expected=editShowLayoutIntervalsV2(record,intent)
 expect(expected.status).toBe('changed');const result=await admitShowV2PilotLayoutOccurrenceEdit({...context,intent});expect(result.status).toBe('applied');expect(result).toHaveProperty('affectedGroupOccurrenceIds',[group.id]);expect(saved().composition.groupOccurrences[0]).toEqual({...group,layoutOccurrenceId:'later-layout'});expect(saved().composition.propertyTracks).toEqual(record.composition.propertyTracks);expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances)
})
it('preserves validated empty capability without constructing a runtime or adding content',async()=>{
 const {record,context,dependencies,write,saved}=setup();record.composition.clips=[];record.composition.groupOccurrences=[]
 const capture=stage.captureShowStageEditV2(record,dependencies);expect(capture.prepared.status).toBe('empty')
 const result=await admitShowV2PilotLayoutOccurrenceEdit({...context,capture,intent:actions[1]});expect(result.status).toBe('applied');expect(write).toHaveBeenCalledTimes(1);expect(stage.prepareShowStageV2(saved(),dependencies).status).toBe('empty');expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances);expect(saved().composition.clips).toEqual([]);expect(saved().composition.groupOccurrences).toEqual([])
})
it('suppresses obsolete settlement after an external replacement during the sole save',async()=>{
 const {record,context,write}=setup();let settle!:()=>void;write.mockImplementationOnce(()=>new Promise<void>(resolve=>{settle=resolve}))
 const pending=admitShowV2PilotLayoutOccurrenceEdit({...context,intent:actions[1]});await vi.waitFor(()=>expect(write).toHaveBeenCalledTimes(1))
 const external=structuredClone(record);external.name='External replacement';useShowStore.setState({showV2Pilots:{[record.id]:external}});settle();expect(await pending).toMatchObject({status:'applied',settlement:'superseded'});expect(useShowStore.getState().showV2Pilots[record.id]).toBe(external);expect(write).toHaveBeenCalledTimes(1)
})

it('refuses unqualified continuous independent Layout routing with zero adoption/history/write',async()=>{
 const source=transitionV1Show('crossfade','live-live');source.composition!.scenes[0].zones[0].overlays=[]
 const converted=convertShowRecordV1ToV2(source);if(converted.status!=='converted')throw Error('Conversion fixture refused')
 const record=converted.record,{dependencies}=showV2LayoutEditorFixture();record.id='continuous-independent-layout-refusal';record.composition.executionModel='continuous'
 for(const clip of record.composition.clips)clip.zoneSampleMode='independent'
 for(const instance of record.composition.patternInstances)instance.pattern={kind:'user',id:dependencies.patterns[0].id}
 record.zoneLayouts=[{id:'layout',name:'Both',zones:[{zoneId:'zone',ranges:[{start:0,end:1}]}]},{id:'second',name:'Tail',zones:[{zoneId:'zone',ranges:[{start:1,end:1}]}]}]
 record.composition.layoutOccurrences[0].durationMs=600
 record.composition.layoutOccurrences.push({...structuredClone(record.composition.layoutOccurrences[0]),id:'later',layoutId:'second',startMs:600,durationMs:400})
 const capture=stage.captureShowStageEditV2(record,dependencies);expect(capture.inputCapture.status).toBe('qualified');expect(capture.prepared.status).toBe('refused')
 const write=vi.fn(),adopted=vi.fn();setPersonalContentProvider({...getPersonalContentProvider(),replaceShowV2:write})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const result=await admitShowV2PilotLayoutOccurrenceEdit({showId:record.id,baseRevision:0,capture,isCurrent:()=>true,onAdopted:adopted,intent:{kind:'move',occurrenceId:'later',startMs:800}})
 expect(result.status).toBe('refused');empty(result);expect(write).not.toHaveBeenCalled();expect(adopted).not.toHaveBeenCalled()
 expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(useShowStore.getState().showV2Histories[record.id]).toEqual({past:[],future:[]})
})

it('admits a well-formed insert-interval and refuses malformed variants before the owner runs (#1066 slice 8b-2b)',async()=>{
 const {record,context,saved}=setup()
 let allocated=0
 const plan=planShowV2LayoutEdit(record,{kind:'insert-interval',atMs:1000,durationMs:500,sourceLayoutId:'layout'},()=>`insert-${allocated+=1}`)
 if(plan.status!=='ready')throw Error(plan.message)
 expect(allocated).toBe(3)
 const expected=insertShowLayoutIntervalV2(record,structuredClone(plan.intent))
 expect(expected.status,expected.status==='refused'?expected.message:'').toBe('changed')
 const result=await admitShowV2PilotLayoutOccurrenceEdit({...context,intent:plan.intent})
 expect(result.status).toBe('applied')
 expect(saved().composition).toEqual(expected.record.composition)
 const base=structuredClone(plan.intent) as unknown as {kind:'insert-interval';atMs:number;durationMs:number;layoutId:string;definition:{kind:string;layoutId:string;name:string;sourceLayoutId?:string};occurrenceIds:{interval:string;resume?:string};rightClipIds:Record<string,string>}
 const variants:unknown[]=[
  {...base,occurrenceIds:{interval:base.occurrenceIds.interval}},
  {...base,definition:{...base.definition,layoutId:'other-layout'}},
  {...base,extra:true},
 ]
 for(const intent of variants){
  const fixture=setup()
  const refused=await admitShowV2PilotLayoutOccurrenceEdit({...fixture.context,intent:intent as never})
  expect(refused).toMatchObject({status:'refused',source:'owner',code:'invalid-intent'})
  empty(refused)
  expect(fixture.write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[fixture.record.id]).toBe(fixture.record)
 }
})

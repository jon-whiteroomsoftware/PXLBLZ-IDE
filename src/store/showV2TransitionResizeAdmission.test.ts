import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { transitionV1Show } from '../test/showV2TracerFixture'
import * as stage from '../engine/showPreparedStageV2'
import { editShowTransitionV2 } from '../engine/showTransitionsV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { insertShowTimeV2 } from '../engine/showTimelineV2'
import { createFastReplayRuntime } from '../engine/fastReplay'
import { qualifyShowV2PilotArtifacts } from '../engine/showV2Pilot'
import { parseShowFileBundle } from '../engine/showFileBundle'
import { admitShowV2PilotTransitionResize } from './showV2PreparedEditAdmission'
beforeEach(() => { useShowStore.setState(showInitialState); resetPersonalContentProvider() })
afterEach(() => resetPersonalContentProvider())
let fixtureIndex = 0
function setup(customize?: (record: import('../engine/showCompositionV2').ShowRecordV2) => void) {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw Error('Conversion refused')
  const record = converted.record
  record.id = `prepared-transition-${++fixtureIndex}`
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const dependencies: stage.ShowPreparedStageDependenciesV2 = { patterns: [{ id: 'voice', name: 'Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
  customize?.(record)
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: typeof record) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'transition-admission', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const prepared = stage.prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw Error(prepared.status === 'refused' ? prepared.message : prepared.status)
  const intent = { kind: 'resize-transition' as const, transitionId: record.composition.transitions[0].id, durationMs: 100 }
  const request = { showId: record.id, baseRevision: 0, intent, capture: { record, dependencies, prepared }, isCurrent: () => true, onAdopted: vi.fn() }
  return { record, request, write, readSaved: () => saved }
}
it('admits ready resize with exact pure cascade, one candidate preparation and one history/save', async () => {
 const {record, request, write, readSaved} = setup()
 const before = structuredClone(record)
 const expected = editShowTransitionV2(record, request.intent)
 if (expected.status !== 'changed') throw Error(expected.status)
 const factory = vi.spyOn(stage, 'prepareShowStageV2')
 try {
  const outcome = await admitShowV2PilotTransitionResize(request)
  expect(outcome).toMatchObject({status:'applied',settlement:'saved',affectedClipIds:expected.affectedClipIds,affectedTransitionIds:expected.affectedTransitionIds})
  expect(factory).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledTimes(1)
  expect(readSaved().composition).toEqual(expected.record.composition)
  expect(record).toEqual(before)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
  expect(request.onAdopted).toHaveBeenCalledExactlyOnceWith({showId:record.id,record:useShowStore.getState().showV2Pilots[record.id],revision:1,provider:getPersonalContentProvider()})
 } finally {factory.mockRestore()}
})

it.each(['record','revision','route','Pattern','Map','Library','profile','provider'] as const)('refuses %s replacement during preparation without history/save', async partition => {
 const {record,request,write} = setup()
 let live = true
 let context = request.capture.dependencies
 const actual = stage.prepareShowStageV2
 const factory = vi.spyOn(stage,'prepareShowStageV2').mockImplementation((candidate, inputs) => {
  const prepared = actual(candidate,inputs)
  switch(partition){
   case 'record': useShowStore.setState({showV2Pilots:{[record.id]:{...record,name:'External'}}}); break
   case 'revision': useShowStore.setState({showRevisions:{[record.id]:1}}); break
   case 'route': live=false; break
   case 'provider': setPersonalContentProvider({...getPersonalContentProvider(),id:'External'}); break
   case 'Pattern': context={...context,patterns:[]}; break
   case 'Map': context={...context,maps:[]}; break
   case 'Library': context={...context,libraries:[]}; break
   case 'profile': context={...context,profiles:[]}; break
  }
  return prepared
 })
 try {
  const outcome=await admitShowV2PilotTransitionResize({...request,isCurrent:()=>live && context===request.capture.dependencies})
  expect(outcome).toMatchObject({status:'refused',source:'admission',code:'stale-edit',affectedClipIds:[],affectedTransitionIds:[],affectedTrackIds:[],removedIds:[]})
  expect(write).not.toHaveBeenCalled();expect(request.onAdopted).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual({past:[],future:[]})
 } finally {factory.mockRestore()}
})
it.each([200,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('has atomic no-op/refusal for duration%s',async durationMs=>{
 const {record,request,write}=setup();const before=structuredClone(record)
 const factory=vi.spyOn(stage,'prepareShowStageV2')
 try{
  const outcome=await admitShowV2PilotTransitionResize({...request,intent:{...request.intent,durationMs}})
  expect(outcome.status).toBe(durationMs===200?'unchanged':'refused')
  expect(outcome).toMatchObject({affectedClipIds:[],affectedTransitionIds:[],affectedTrackIds:[],removedIds:[]})
  expect(factory).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(request.onAdopted).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(record).toEqual(before)
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual({past:[],future:[]})
 }finally{factory.mockRestore()}
})
it('rejects hidden delete/insert commands and retains pure missing/carrier refusal reasons',async()=>{
 const {record,request,write}=setup()
 for(const intent of [{kind:'delete-clip',clipId:'in'},{...request.intent,candidate:record},{...request.intent,transitionId:'missing'}]){
  const outcome=await admitShowV2PilotTransitionResize({...request,intent:intent as typeof request.intent})
  expect(outcome).toMatchObject({status:'refused',source:'transition',code:'transitionId' in intent && intent.transitionId==='missing'?'missing-transition':'invalid-intent',affectedClipIds:[],affectedTransitionIds:[],affectedTrackIds:[],removedIds:[]})
 }
 expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})

it.each(['participants','whole-output'] as const)('persists and reopens ready%s resize with held animation/Restart and exact Fast/Precise expected output',async partition=>{
 const {record,request,write,readSaved}=setup(record=>{
  record.composition.executionModel='continuous';record.composition.showEndMs=30000
  record.composition.layoutOccurrences[0].durationMs=30000
  const outgoing=record.composition.clips.find(c=>c.id==='out')!;const incoming=record.composition.clips.find(c=>c.id==='in')!
  outgoing.durationMs=12000;for(const key of incoming.appearance.keys) key.timeMs+=13400;incoming.startMs=14000;incoming.durationMs=16000;incoming.entryPolicy='restart'
  const transition=record.composition.transitions[0];transition.durationMs=2000
  if(partition==='whole-output'){transition.participants=[];transition.wholeOutput={startMs:12000,fromClipIds:['out'],toClipIds:['in']}}
  record.composition.propertyTracks.push({id:'repeat',target:partition==='whole-output'?{kind:'show-repeat-scale'}:{kind:'instance-time-scale',instanceId:'out-instance'},activeStartMs:0,activeDurationMs:30000,keyframes:[{id:'first',timeMs:0,value:2,easing:{curve:'quadratic',direction:'in'}},{id:'last',timeMs:30000,value:4,easing:{curve:'linear'}}]})
  const inserted=insertShowTimeV2(record,{atMs:7500,durationMs:1000});if(inserted.status!=='changed')throw Error(inserted.message)
  Object.assign(record,inserted.record)
 })
 request.intent.durationMs=1000
 const expected=editShowTransitionV2(record,request.intent);if(expected.status!=='changed')throw Error(expected.status)
 expect(expected.record.composition.clips.map(c=>[c.id,c.startMs,c.durationMs])).toEqual([['out',0,13000],['in',14000,16000]])
 const reference=stage.prepareShowStageV2(expected.record,request.capture.dependencies);if(reference.status!=='ready')throw Error(reference.status==='refused'?reference.message:reference.status)
 expect(await admitShowV2PilotTransitionResize(request)).toMatchObject({status:'applied',settlement:'saved'})
 expect(write).toHaveBeenCalledTimes(1)
 const saved=readSaved();expect(saved.composition).toEqual(expected.record.composition)
 const delivered=stage.prepareShowStageV2(saved,request.capture.dependencies);if(delivered.status!=='ready')throw Error(delivered.status)
 expect(delivered.bundle.artifact.code).toBe(reference.bundle.artifact.code)
 for(const fidelity of ['fast','fidelity'] as const){
  const options={fidelity,randomSeed:1038,mapPoints:delivered.bundle.presentation.layout.mapPoints}
  const a=createFastReplayRuntime({...reference.bundle.artifact,dimension:2},options)
  const b=createFastReplayRuntime({...delivered.bundle.artifact,dimension:2},options)
  for(const time of [7375,7500,8375,8500,12875,13000,13875,14000,15000,30000,31000]){
   const expected=a.advanceTo(time,{stepMs:125,forceFullIntermediateRender:true});const actual=b.advanceTo(time,{stepMs:125,forceFullIntermediateRender:true})
   expect(actual.frame).toEqual(expected.frame);expect(actual.exports).toEqual(expected.exports)
  }
 }
 const artifacts=await qualifyShowV2PilotArtifacts(delivered.bundle)
 expect((await parseShowFileBundle(artifacts.pxlshowBytes,{acceptV2:true})).show).toEqual(delivered.bundle.record)
 await useShowStore.getState().undoShowV2Pilot(record.id);expect(readSaved().composition).toEqual(record.composition)
 await useShowStore.getState().redoShowV2Pilot(record.id);expect(readSaved().composition).toEqual(expected.record.composition)
 expect(write).toHaveBeenCalledTimes(3)
 expect((await useShowStore.getState().reloadShowV2Pilot(record.id))?.composition).toEqual(expected.record.composition)
})

it('preserves existing zero resize Reset and exact removed Transition identity without adding a UI command',async()=>{
 const {record,request,write,readSaved}=setup()
 const intent={...request.intent,durationMs:0};const expected=editShowTransitionV2(record,intent);if(expected.status!=='changed')throw Error(expected.status)
 expect(await admitShowV2PilotTransitionResize({...request,intent})).toMatchObject({status:'applied',settlement:'saved',removedIds:expected.removedIds})
 expect(readSaved().composition).toEqual(expected.record.composition);expect(write).toHaveBeenCalledTimes(1)
})
it('retains typed pure Property carrier refusal and provider recovery without a hidden failed adoption',async()=>{
 const {record,request,write}=setup();const provider=getPersonalContentProvider()
 const unsupported={...provider};delete unsupported.replaceShowV2;setPersonalContentProvider(unsupported)
 expect(await admitShowV2PilotTransitionResize(request)).toMatchObject({status:'refused',source:'admission',code:'unsupported-provider'})
 expect(write).not.toHaveBeenCalled();expect(request.onAdopted).not.toHaveBeenCalled()
 setPersonalContentProvider(provider)
 const transition=record.composition.transitions[0];const participant=transition.participants[0]
 transition.propertyRamps=[{participantId:participant.id,target:{kind:'clip-view',clipId:participant.toClipId,property:'brightness'},from:0.2,easing:{curve:'quadratic',direction:'in'}}]
 expect(await admitShowV2PilotTransitionResize(request)).toMatchObject({status:'refused',source:'transition',code:'unsupported-property-carrier',affectedTrackIds:[],removedIds:[]})
 expect(write).not.toHaveBeenCalled();transition.propertyRamps=[]
 expect(await admitShowV2PilotTransitionResize(request)).toMatchObject({status:'applied',settlement:'saved'})
 expect(write).toHaveBeenCalledTimes(1);expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
})

it('keeps explicit empty and refused nonempty capabilities from becoming an admission bypass',async()=>{
 const {record,request,write}=setup()
 record.composition.clips=[];record.composition.transitions=[]
 const empty=stage.prepareShowStageV2(record,request.capture.dependencies);expect(empty.status).toBe('empty')
 expect(await admitShowV2PilotTransitionResize({...request,capture:{...request.capture,prepared:empty}})).toMatchObject({status:'refused',source:'transition',code:'missing-transition',affectedClipIds:[],affectedTransitionIds:[],affectedTrackIds:[],removedIds:[]})
 expect(write).not.toHaveBeenCalled();expect(request.onAdopted).not.toHaveBeenCalled()
 const fresh=setup();const unsupported=stage.prepareShowStageV2(fresh.record,{...fresh.request.capture.dependencies,patterns:[]});expect(unsupported.status).toBe('refused')
 expect(await admitShowV2PilotTransitionResize({...fresh.request,capture:{...fresh.request.capture,prepared:unsupported}})).toMatchObject({status:'refused',source:'admission',code:'unsupported-pilot-record'})
 expect(fresh.write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[fresh.record.id]).toBe(fresh.record)
})

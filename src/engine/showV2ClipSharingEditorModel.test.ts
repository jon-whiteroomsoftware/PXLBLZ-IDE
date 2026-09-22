import { describe, expect, it, vi } from 'vitest'
import { propertyEditGroupRecord, propertyEditRecord, propertyEditTrack } from '../test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { editShowClipV2 } from './showClipsV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { validateShowRecordV2 } from './showCompositionV2'
import { buildShowV2ClipSharingEditorModel, checkShowV2LinkedDuplicateDraft, createShowV2LinkedDuplicateIntent, createShowV2IndependentIntent, createShowV2RejoinIntent } from './showV2ClipSharingEditorModel'
function capture(group=false) {
 const record=group?propertyEditGroupRecord():propertyEditRecord()
 const clip=record.composition.clips[0];clip.durationMs=200;clip.appearance.keys[0].id='source-appearance'
 record.composition.propertyTracks=[{...propertyEditTrack(),activeDurationMs:200,keyframes:[{id:'left',timeMs:0,value:.2,easing:{curve:'quadratic',direction:'in'},curveSegment:{baseValue:.1,deltaValue:.8,easing:{curve:'quadratic',direction:'in'},sourceDurationMs:1000,elapsedOffsetMs:200}},{id:'right',timeMs:200,value:.228,easing:{curve:'linear'}}]}]
 record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 return captureShowStageEditV2(record,{patterns:[{id:'voice',name:'Voice',src:'var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null})
}
describe('ordinary Clip sharing projection and linked duplicate identities',()=>{
 it('builds an exact once-allocated linked duplicate plan and keeps nonlinear Clip tracks and runtime ownership',()=>{
  const c=capture(),before=structuredClone(c.record),allocate=vi.fn(()=>`fresh-${allocate.mock.calls.length}`)
  const layer=c.record.composition.clips[0].layerId,zone=c.record.composition.clips[0].zoneId
  const plan=createShowV2LinkedDuplicateIntent(c,'clip',{zoneId:zone,layerId:layer,startMs:'200'},allocate)
  expect(plan.status).toBe('ready');expect(allocate).toHaveBeenCalledTimes(5)
  if(plan.status!=='ready')throw Error('Missing linked plan')
  expect(plan.intent).toEqual({kind:'duplicate',clipId:'clip',zoneId:zone,layerId:layer,startMs:200,identities:{clipId:'fresh-1',appearanceKeyIdsBySourceId:{'source-appearance':'fresh-2'},clipTrackIdentitiesBySourceTrackId:{animation:{trackId:'fresh-3',keyframeIdsBySourceId:{left:'fresh-4',right:'fresh-5'}}}}})
  const edited=editShowClipV2(c.record,plan.intent);expect(edited.status).toBe('changed');expect(validateShowRecordV2(edited.record)).toEqual([])
  expect(edited.record.composition.clips[1]).toMatchObject({instanceId:'instance',startMs:200,durationMs:200,entryPolicy:c.record.composition.clips[0].entryPolicy})
  const copy=edited.record.composition.propertyTracks.find(track=>track.id==='fresh-3')!
  expect(copy.activeStartMs).toBe(200);expect(copy.keyframes.map(key=>key.timeMs)).toEqual([200,400]);expect(copy.keyframes[0].curveSegment).toEqual(c.record.composition.propertyTracks[0].keyframes[0].curveSegment)
  expect(edited.record.composition.patternInstances).toEqual(before.composition.patternInstances);expect(c.record).toEqual(before)
 })
})

it('copies every held Group-qualified instance animation identity for explicit independence while all other users remain exact',()=>{
 const c=capture(true),definition=c.record.composition.groupDefinitions[0]
 definition.propertyTracks=[{id:'control',target:{kind:'instance-control',instanceId:'slot',exportName:'sliderGain'},activeStartMs:0,activeDurationMs:400,keyframes:[{id:'gain-a',timeMs:0,value:.4,easing:{curve:'sine',direction:'in-out'}},{id:'gain-b',timeMs:400,value:.8,easing:{curve:'linear'}}]}]
 // Capture qualified inputs after authoring; the original frozen capture is never edited.
 const fresh=captureShowStageEditV2(c.record,c.dependencies),before=structuredClone(fresh.record),effective=materializeShowGroupsV2(fresh.record)
 expect(buildShowV2ClipSharingEditorModel(fresh,'clip')?.useCount).toBe(3)
 const allocate=vi.fn(()=>`independent-${allocate.mock.calls.length}`),plan=createShowV2IndependentIntent(fresh,'clip',allocate)
 expect(plan.status).toBe('ready');if(plan.status!=='ready'||plan.intent.kind!=='make-independent')throw Error('Missing independence plan')
 const tracks=effective.composition.propertyTracks.filter(track=>'instanceId'in track.target&&track.target.instanceId==='instance')
 expect(Object.keys(plan.intent.independence.identitiesBySourceTrackId)).toEqual(tracks.map(track=>track.id))
 expect(allocate).toHaveBeenCalledTimes(1+tracks.reduce((sum,track)=>sum+1+track.keyframes.length,0))
 for(const track of tracks)expect(Object.keys(plan.intent.independence.identitiesBySourceTrackId[track.id].keyframeIdsBySourceId)).toEqual(track.keyframes.map(key=>key.id))
 const result=editShowClipV2(fresh.record,plan.intent);expect(result.status).toBe('changed');expect(validateShowRecordV2(result.record)).toEqual([])
 expect(result.record.composition.clips[0].instanceId).toBe('independent-1');expect(result.record.composition.patternInstances[1]).toEqual({...before.composition.patternInstances[0],id:'independent-1'})
 expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions);expect(result.record.composition.groupOccurrences).toEqual(before.composition.groupOccurrences);expect(fresh.record).toEqual(before)
})

it('offers only explicit compatible authored Rejoin targets, including Group-bound targets, never unhoisted defaults or equal text',()=>{
 const c=capture(true),target={...structuredClone(c.record.composition.patternInstances[0]),id:'chosen',patternName:'Different display name',controlTargets:{sliderGain:.9}}
 c.record.composition.patternInstances.push(target);c.record.composition.groupOccurrences[0].instanceBindings={slot:'chosen'}
 const fresh=captureShowStageEditV2(c.record,c.dependencies),model=buildShowV2ClipSharingEditorModel(fresh,'clip')!
 expect(model.rejoinTargets).toEqual([{instanceId:'instance',patternName:'TestPattern1D',useCount:2},{instanceId:'chosen',patternName:'Different display name',useCount:1}])
 expect(createShowV2RejoinIntent(fresh,'clip','').status).toBe('refused');expect(createShowV2RejoinIntent(fresh,'clip','unknown').status).toBe('refused')
 const plan=createShowV2RejoinIntent(fresh,'clip','chosen');expect(plan).toEqual({status:'ready',intent:{kind:'rejoin',clipId:'clip',targetInstanceId:'chosen'}})
 if(plan.status!=='ready')throw Error('Missing Rejoin plan')
 const result=editShowClipV2(fresh.record,plan.intent);expect(result.status).toBe('changed');expect(result.record.composition.clips[0].instanceId).toBe('chosen');expect(result.record.composition.patternInstances).toEqual(fresh.record.composition.patternInstances)
 // A future/invisible Group user retains the source payload; Rejoin never steals animation.
 expect(result.record.composition.groupOccurrences).toEqual(fresh.record.composition.groupOccurrences)
 c.record.composition.groupDefinitions[0].patternInstances[0].pattern={kind:'user',id:'voice'}
 c.record.composition.groupOccurrences.forEach(occurrence=>{occurrence.instanceBindings={}})
 const defaults=captureShowStageEditV2(c.record,c.dependencies),projection=buildShowV2ClipSharingEditorModel(defaults,'clip')!
 expect(projection.unavailableGroupRuntimeIds).toEqual(['group:["definition","slot"]']);expect(projection.rejoinTargets.map(target=>target.instanceId)).toEqual(['instance','chosen'])
 expect(createShowV2RejoinIntent(defaults,'clip','group:["definition","slot"]').status).toBe('refused')
})
it('refuses incomplete, foreign and unsafe destination drafts before allocating, with exact adjacency accepted by the owner',()=>{
 const c=capture(),clip=c.record.composition.clips[0],allocate=vi.fn(()=>'unused')
 for(const draft of [{zoneId:'',layerId:clip.layerId,startMs:'200'},{zoneId:'foreign',layerId:clip.layerId,startMs:'200'},{zoneId:clip.zoneId,layerId:'foreign',startMs:'200'},...['','-1','.5','Infinity','9007199254740992','1000'].map(startMs=>({zoneId:clip.zoneId,layerId:clip.layerId,startMs}))])expect(createShowV2LinkedDuplicateIntent(c,'clip',draft,allocate).status).toBe('refused')
 expect(allocate).not.toHaveBeenCalled()
 let n=0;const overlap=createShowV2LinkedDuplicateIntent(c,'clip',{zoneId:clip.zoneId,layerId:clip.layerId,startMs:'199'},()=>`overlap-${++n}`)
 if(overlap.status!=='ready')throw Error('Explicit placement plan unavailable')
 const before=structuredClone(c.record),result=editShowClipV2(c.record,overlap.intent);expect(result.status).toBe('refused');expect(result.record).toBe(c.record);expect(result.affectedClipIds).toEqual([]);expect(c.record).toEqual(before)
})
it('uses immutable qualified ownership and keeps every returned projection unaliased',()=>{
 const c=capture(true),original=structuredClone(c.record),model=buildShowV2ClipSharingEditorModel(c,'clip')!
 model.clip.appearance.keys[0].value.opacity=.1;model.instance.controlTargets!.sliderGain=.9;model.layers[0].name='changed';expect(c.record).toEqual(original)
 c.record.composition.clips[0].durationMs=900;c.record.composition.patternInstances[0].controlTargets={sliderGain:.99};c.dependencies.patterns[0].src='export function render2D(i,x,y){rgb(0,0,0)}'
 const frozen=buildShowV2ClipSharingEditorModel(c,'clip')!;expect(frozen.clip.durationMs).toBe(200);expect(frozen.instance.controlTargets).toEqual({sliderGain:.4});expect(frozen.useCount).toBe(3)
 expect(buildShowV2ClipSharingEditorModel(c,'occ-0:child')).toBeNull();expect(buildShowV2ClipSharingEditorModel({...c,inputCapture:{status:'invalid',message:'Invalid captured source'}},'clip')).toBeNull()
})
it('never retries colliding, blank or unavailable identity allocation and sole-user independence allocates nothing',()=>{
 const c=capture(),clip=c.record.composition.clips[0]
 for(const value of ['clip','source-appearance','animation','left',' ',undefined]){const allocate=vi.fn(()=>value as string);expect(createShowV2LinkedDuplicateIntent(c,'clip',{zoneId:clip.zoneId,layerId:clip.layerId,startMs:'200'},allocate).status).toBe('refused');expect(allocate).toHaveBeenCalledTimes(1)}
 const throws=vi.fn(()=>{throw Error('Identity provider unavailable')});expect(createShowV2LinkedDuplicateIntent(c,'clip',{zoneId:clip.zoneId,layerId:clip.layerId,startMs:'200'},throws)).toEqual({status:'refused',message:'Identity provider unavailable'})
 const allocate=vi.fn(()=>'new-runtime');expect(createShowV2IndependentIntent(c,'clip',allocate)).toEqual({status:'unchanged'});expect(allocate).not.toHaveBeenCalled()
 const rejoin=createShowV2RejoinIntent(c,'clip','instance');if(rejoin.status!=='ready')throw Error('Missing explicit current target')
 expect(editShowClipV2(c.record,rejoin.intent)).toMatchObject({status:'unchanged',record:c.record,affectedClipIds:[],affectedTrackIds:[],affectedInstanceIds:[],affectedKeyframeIds:[],removedIds:[]})
})
it('checks a linked duplicate draft without allocating and matches the intent refusal message',()=>{
 const c=capture(),clip=c.record.composition.clips[0]
 const valid={zoneId:clip.zoneId,layerId:clip.layerId,startMs:'200'}
 expect(checkShowV2LinkedDuplicateDraft(c,'clip',valid)).toEqual({status:'ready'})
 const fresh=vi.fn(()=>`draft-${fresh.mock.calls.length}`)
 expect(createShowV2LinkedDuplicateIntent(c,'clip',valid,fresh).status).toBe('ready')
 for(const draft of [{zoneId:clip.zoneId,layerId:clip.layerId,startMs:'-1'},{zoneId:clip.zoneId,layerId:clip.layerId,startMs:'1000'},{zoneId:clip.zoneId,layerId:'foreign',startMs:'200'}]){
  const checked=checkShowV2LinkedDuplicateDraft(c,'clip',draft)
  const allocate=vi.fn(()=>'unused')
  const planned=createShowV2LinkedDuplicateIntent(c,'clip',draft,allocate)
  expect(checked.status).toBe('refused');expect(planned.status).toBe('refused')
  if(checked.status!=='refused'||planned.status!=='refused')throw Error('Missing draft refusal')
  expect(checked.message).toBe(planned.message);expect(allocate).not.toHaveBeenCalled()
 }
})

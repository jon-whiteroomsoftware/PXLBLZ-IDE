import { expect, it, vi } from 'vitest'
import { propertyEditGroupRecord, propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { resolveCapturedShowPatternReplacementV2, createShowV2ClipReplacementIntent, previewShowV2ClipReplacement } from './showV2ClipReplacementModel'
import { editShowClipV2 } from './showClipsV2'
function setup(group=false){
 const record=group?propertyEditGroupRecord():propertyEditRecord();record.composition.patternInstances[0].pattern={kind:'user',id:'voice'};record.composition.patternInstances[0].patternName='Voice';record.composition.patternInstances[0].controlTargets={sliderGain:.4,sliderLost:.2}
 record.composition.propertyTracks=[{id:'gain',target:{kind:'instance-control',instanceId:'instance',exportName:'sliderGain'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'gain-a',timeMs:0,value:.4,easing:{curve:'quadratic',direction:'in'}},{id:'gain-b',timeMs:1000,value:.8,easing:{curve:'linear'}}]},{id:'lost',target:{kind:'instance-control',instanceId:'instance',exportName:'sliderLost'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'lost-a',timeMs:0,value:.2,easing:{curve:'linear'}},{id:'lost-b',timeMs:1000,value:.3,easing:{curve:'linear'}}]}]
 const src='var gain=.4;var lost=.2;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function render2D(i,x,y){rgb(gain,lost,y)}'
 const dependencies={patterns:[{id:'voice',name:'Voice',src,controls:{},updatedAt:1},{id:'other',name:'Other',src:'var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(0,gain,y)}',controls:{},updatedAt:1},{id:'equal-text',name:'Equal Text',src,controls:{},updatedAt:1},{id:'bad',name:'Bad',src:'invalid source !!!',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
 return {record,dependencies,capture:captureShowStageEditV2(record,dependencies)}
}
it('resolves exact captured source metadata and ignores later live name/source mutation',()=>{
 const {capture,dependencies}=setup();dependencies.patterns[1].name='Changed';dependencies.patterns[1].src='export function sliderGuessed(v){}'
 const result=resolveCapturedShowPatternReplacementV2(capture,{kind:'user',id:'other'});expect(result).toMatchObject({status:'ready',replacement:{patternReference:{kind:'user',id:'other'},patternName:'Other',exportedSliders:[{kind:'slider',exportName:'sliderGain'}]}})
})
it('sole replacement prunes incompatible values/tracks through owner without allocating runtime identities',()=>{
 const {record,capture}=setup(),mint=vi.fn(()=>{throw Error('not needed')});const plan=createShowV2ClipReplacementIntent(capture,'clip',{kind:'user',id:'other'},mint);expect(plan.status).toBe('ready');if(plan.status!=='ready')throw Error('plan');expect(plan.intent.independence).toBeUndefined();expect(mint).not.toHaveBeenCalled()
 const metadata=resolveCapturedShowPatternReplacementV2(capture,plan.intent.patternReference);if(metadata.status!=='ready')throw Error('metadata');const changed=editShowClipV2(record,{kind:'replace-pattern',clipId:'clip',replacement:metadata.replacement});expect(changed).toMatchObject({status:'changed',affectedTrackIds:['lost'],affectedKeyframeIds:['lost-a','lost-b']});expect(changed.record.composition.patternInstances[0].id).toBe('instance');expect(changed.record.composition.patternInstances[0].controlTargets).toEqual({sliderGain:.4})
})
it('shared Group users require only compatible effective track/key identities allocated exactly once',()=>{
 const {record,capture}=setup(true);record.composition.groupDefinitions[0].propertyTracks=[{id:'local-clock',target:{kind:'instance-time-scale',instanceId:'slot'},activeStartMs:0,activeDurationMs:400,keyframes:[{id:'local-a',timeMs:0,value:1,easing:{curve:'linear'}},{id:'local-b',timeMs:400,value:2,easing:{curve:'linear'}}]}]
 const current=captureShowStageEditV2(record,capture.dependencies);let n=0;const mint=vi.fn(()=>`fresh-${++n}`),plan=createShowV2ClipReplacementIntent(current,'clip',{kind:'user',id:'other'},mint);expect(plan.status).toBe('ready');if(plan.status!=='ready')throw Error('plan')
 expect(Object.keys(plan.intent.independence!.identitiesBySourceTrackId)).toEqual(['gain','occ-0:local-clock','occ-1:local-clock']);expect(mint).toHaveBeenCalledTimes(14);expect(plan.intent.independence!.instanceId).toBe('fresh-1');expect(Object.keys(plan.intent.independence!.identitiesBySourceTrackId['occ-0:local-clock'].keyframeIdsBySourceId)).toHaveLength(4)
 const metadata=resolveCapturedShowPatternReplacementV2(current,plan.intent.patternReference);if(metadata.status!=='ready')throw Error('metadata');expect(editShowClipV2(record,{kind:'replace-pattern',clipId:'clip',replacement:metadata.replacement,independence:plan.intent.independence}).status).toBe('changed')
})
it('same reference/name compatible no-op allocates nothing while equal text with different identity changes source',()=>{
 const {record,capture}=setup(true),mint=vi.fn(()=>{throw Error('no-op allocation')});expect(createShowV2ClipReplacementIntent(capture,'clip',{kind:'user',id:'voice'},mint)).toMatchObject({status:'ready',intent:{patternReference:{kind:'user',id:'voice'}}});expect(mint).not.toHaveBeenCalled()
 let n=0;const equal=createShowV2ClipReplacementIntent(capture,'clip',{kind:'user',id:'equal-text'},()=>`equal-${++n}`);expect(equal).toMatchObject({status:'ready',intent:{independence:{instanceId:'equal-1'}}});expect(record.composition.patternInstances[0].pattern.id).toBe('voice')
})
it.each(['missing','bad','blank','materialized','collision'] as const)('refuses %s without guessing source or retrying identity allocation',partition=>{
 const {capture}=setup(true),mint=vi.fn(()=>partition==='collision'?'instance':'fresh');const ref=partition==='blank'?{kind:'user' as const,id:' '}: {kind:'user' as const,id:partition==='missing'?'missing':partition==='bad'?'bad':'other'}
 expect(createShowV2ClipReplacementIntent(capture,partition==='materialized'?'occ-0:child':'clip',ref,mint).status).toBe('refused');expect(mint).toHaveBeenCalledTimes(partition==='collision'?1:0)
})
it('reports the incompatible controls one ordinary replacement would drop, before anything is adopted',()=>{
 const {record,capture}=setup(true),before=structuredClone(record)
 expect(previewShowV2ClipReplacement(capture,'clip',{kind:'user',id:'other'})).toEqual({status:'ready',discardedControlTargets:[{kind:'instance-control',instanceId:'instance',exportName:'sliderLost'}],lostControls:[{exportName:'sliderLost',animated:true}]})
 // A compatible destination reports no loss, so the adapter never confirms one.
 expect(previewShowV2ClipReplacement(capture,'clip',{kind:'user',id:'equal-text'})).toEqual({status:'ready',discardedControlTargets:[],lostControls:[]})
 expect(record).toEqual(before)
})
it('classifies value-only, animated-only, and mixed losses once per export name in discarded order',()=>{
 const {record,dependencies}=setup()
 const instance=record.composition.patternInstances[0]
 instance.controlTargets={sliderLost:.2,sliderValue:.7}
 const preview=previewShowV2ClipReplacement(captureShowStageEditV2(record,dependencies),'clip',{kind:'user',id:'other'})
 expect(preview.status).toBe('ready')
 if(preview.status!=='ready')return
 expect(preview.discardedControlTargets.map(target=>target.kind==='instance-control'?target.exportName:target.kind)).toEqual(['sliderLost','sliderValue'])
 expect(preview.lostControls).toEqual([{exportName:'sliderLost',animated:true},{exportName:'sliderValue',animated:false}])
 const animatedOnly=structuredClone(record)
 delete animatedOnly.composition.patternInstances[0].controlTargets
 const animated=previewShowV2ClipReplacement(captureShowStageEditV2(animatedOnly,dependencies),'clip',{kind:'user',id:'other'})
 expect(animated.status==='ready'?animated.lostControls:[]).toEqual([{exportName:'sliderLost',animated:true}])
 const valueOnly=structuredClone(record)
 valueOnly.composition.propertyTracks=[]
 const value=previewShowV2ClipReplacement(captureShowStageEditV2(valueOnly,dependencies),'clip',{kind:'user',id:'other'})
 expect(value.status==='ready'?value.lostControls:[]).toEqual([{exportName:'sliderLost',animated:false},{exportName:'sliderValue',animated:false}])
})
it.each(['missing-clip','materialized','unresolvable'] as const)('refuses a %s replacement preview instead of reporting an empty loss',partition=>{
 const {capture}=setup(true)
 expect(previewShowV2ClipReplacement(capture,partition==='materialized'?'occ-0:child':partition==='missing-clip'?'absent':'clip',
  partition==='unresolvable'?{kind:'user',id:'bad'}:{kind:'user',id:'other'}).status).toBe('refused')
})
it('resolves stock and captured Library-dependent personal sources through actual bundle metadata',()=>{
 const {record,dependencies}=setup();const library={id:'fixture-library',name:'Fixture',src:'function signal(){return .5}',updatedAt:1}
 const context={...dependencies,libraries:[library],patterns:[...dependencies.patterns,{id:'library-pattern',name:'Library Pattern',src:'export function sliderLibrary(v){}export function render2D(i,x,y){rgb(Fixture.signal(),x,y)}',controls:{},updatedAt:1}]}
 const capture=captureShowStageEditV2(record,context);library.src='invalid !!!'
 expect(resolveCapturedShowPatternReplacementV2(capture,{kind:'user',id:'library-pattern'})).toMatchObject({status:'ready',replacement:{patternName:'Library Pattern',exportedSliders:[{exportName:'sliderLibrary',kind:'slider'}]}})
 expect(resolveCapturedShowPatternReplacementV2(capture,{kind:'stock',id:'LumaStripes'}).status).toBe('ready')
 expect(resolveCapturedShowPatternReplacementV2(capture,{kind:'stock',id:'not-a-stock-pattern'}).status).toBe('refused')
})
it('qualifies exact committed browser sources and all replacement states before capture',async()=>{
 const {clipReplaceRecord,clipReplacePatterns}=await import('../../e2e/fixtures/showV2ClipReplace')
 const dependencies={patterns:clipReplacePatterns,maps:[],libraries:[],profiles:[],stageMap:null};let record=structuredClone(clipReplaceRecord),n=0
 for(const reference of [{kind:'user' as const,id:'replacement-other'},{kind:'stock' as const,id:'LumaStripes'}]){
  const capture=captureShowStageEditV2(record,dependencies);expect(capture.prepared.status).toBe('ready');const plan=createShowV2ClipReplacementIntent(capture,'voice',reference,()=>`qualified-${++n}`);if(plan.status!=='ready')throw Error(plan.message)
  const resolved=resolveCapturedShowPatternReplacementV2(capture,reference);if(resolved.status!=='ready')throw Error(resolved.message)
  const result=editShowClipV2(record,{kind:'replace-pattern',clipId:'voice',replacement:resolved.replacement,...(plan.intent.independence?{independence:plan.intent.independence}:{})});expect(result.status).toBe('changed');record=result.record;const prepared=captureShowStageEditV2(record,dependencies).prepared;expect(prepared.status,JSON.stringify(prepared)).toBe('ready')
 }
})

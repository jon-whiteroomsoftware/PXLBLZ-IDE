import { expect,it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile, lowerShowCompositionV2ForCompile, ShowV2PreparedRecipeRequiredError } from './showCompositionLoweringV2'
import { compileShow,type ShowRecipe } from './showCompiler'
import { validateShowRecordV2,parseProvisionalShowRecordV2,serializeProvisionalShowRecordV2,type ShowRecordV2 } from './showCompositionV2'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { LIBRARIES } from '../pixelblaze/libs'
const lookup={byCellId:{},byPatternInstanceId:{
 'out-instance':'export var elapsed=0;export var calls=0;export function beforeRender(d){elapsed+=d;calls++}export function render2D(i,x,y){rgb(1,x,y)}',
 'in-instance':'export var elapsed=0;export var calls=0;export function beforeRender(d){elapsed+=d;calls++}export function render2D(i,x,y){rgb(x,y,1)}',
},stageDimension:2 as const}
function fixture(whole=false){
 const source=transitionV1Show('crossfade','live-live');source.zones.push({id:'other',name:'Other',nominalPixelCount:16});source.composition!.scenes[0].zones.push({zoneId:'other',main:[],overlays:[]})
 source.routingLayouts=[{id:'layout',name:'Vertical',zones:[],logical:{kind:'split',axis:'x',zoneIds:['zone','other']}},{id:'second',name:'Horizontal',zones:[],logical:{kind:'split',axis:'y',zoneIds:['zone','other']}}]
 const converted=convertShowRecordV1ToV2(source);if(converted.status!=='converted')throw Error(JSON.stringify(converted.issues))
 const record=converted.record
 if(whole){const transition=record.composition.transitions[0],pair=transition.participants[0];transition.wholeOutput={startMs:400,fromClipIds:[pair.fromClipId],toClipIds:[pair.toClipId]};transition.participants=[]}
 expect(validateShowRecordV2(record)).toEqual([])
 const prepared=prepare(record);if(prepared.status!=='ready')throw Error(JSON.stringify(prepared.issues))
 return {record,recipe:prepared.recipe}
}
function prepare(record:ShowRecordV2){
 const opened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
 expect(opened.status).toBe('opened');if(opened.status!=='opened')throw Error('v2 reopen refused')
 expect(opened.record).toEqual(record)
 return prepareShowV2ForCompile(opened.record,lookup)
}
function frames(recipe:ShowRecipe,mode:'fast'|'fidelity',record?:ShowRecordV2,times=[125,250,375,400,425,500,575,600,625,750,875]){
 const artifact=compileShow(recipe,LIBRARIES),file=record?buildShowEpeExportV2(record,artifact.code,{stampedAt:'2026-09-16T00:00:00Z'}):null
 if(file)expect(file.status).toBe('exported')
 const code=file?.status==='exported'?parseEpe(file.text).src:artifact.code
 const runtime=createFastReplayRuntime({...artifact,code,dimension:nativeDimension(artifact.metadata.renderFns)},{fidelity:mode,randomSeed:1038,mapPoints:[{sample:[.25,.75],pos:[.25,.75]},{sample:[.75,.25],pos:[.75,.25]}]})
 return times.map(time=>{const frame=runtime.advanceTo(time,{stepMs:25,forceFullIntermediateRender:true});const state=Object.fromEntries(Object.entries(frame.exports).filter(([name,value])=>/elapsed|calls/.test(name)&&typeof value==='number'));expect(Object.keys(state).length).toBeGreaterThan(0);return {frame:Array.from(frame.frame),state}})
}
function repeatRecipe(recipe:ShowRecipe){const result=structuredClone(recipe);result.samplePropertyRamps={repeatScale:{initial:1,ramps:[{atMs:250,from:1,to:2,durationMs:0,easing:{curve:'linear'}},{atMs:250,from:2,to:4,durationMs:500,easing:{curve:'quadratic',direction:'in'}},{atMs:750,from:2+2*(499/500)**2,to:1,durationMs:0,easing:{curve:'linear'}}]}};return result}
it.each(['fast','fidelity'] as const)('existing compiler scalar channel preserves participant schedule/state (%s)',mode=>{
 const {recipe}=fixture(),changed=repeatRecipe(recipe),before=frames(recipe,mode),after=frames(changed,mode)
 expect(changed.routedSceneSequence).toEqual(recipe.routedSceneSequence)
 expect(after[2].frame).not.toEqual(before[2].frame)
 expect(after.map(frame=>frame.state)).toEqual(before.map(frame=>frame.state))
})
it.each(['fast','fidelity'] as const)('existing whole-output compiler recipe supports interior Layout edge (%s)',mode=>{
 const {recipe}=fixture(true),changed=structuredClone(recipe);changed.routingSwitches=[{atMs:500,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}]
 const before=frames(recipe,mode),after=frames(changed,mode)
 expect(changed.routedSceneSequence).toEqual(recipe.routedSceneSequence)
 expect(after[6].frame).not.toEqual(before[6].frame)
 expect(after.map(frame=>frame.state)).toEqual(before.map(frame=>frame.state))
})
it.each(['ordinary','retained','held'] as const)('prepares participant repeat animation through existing global channel (%s)',kind=>{
 const {record,recipe}=fixture();record.composition.propertyTracks=[{id:'repeat',target:{kind:'show-repeat-scale'},activeStartMs:250,activeDurationMs:500,keyframes:[{id:'first',timeMs:250,value:2,easing:{curve:'quadratic',direction:'in'}},{id:'last',timeMs:750,value:4,easing:{curve:'linear'}}]}]
 const expected=repeatRecipe(recipe)
 if(kind==='retained'){
 const keys=record.composition.propertyTracks[0].keyframes;keys[0].value=2+2*.25**2;keys[1].value=2+2*.75**2
 keys[0].curveSegment={baseValue:2,deltaValue:2,sourceDurationMs:1000,elapsedOffsetMs:250,easing:{curve:'quadratic',direction:'in'}}
 expected.samplePropertyRamps={repeatScale:{initial:1,ramps:[{atMs:250,from:1,to:2+2*.25**2,durationMs:0,easing:{curve:'linear'}},{atMs:250,from:2+2*.25**2,to:2+2*.75**2,durationMs:500,easing:{curve:'quadratic',direction:'in'},curveSegment:{baseValue:2,deltaValue:2,sourceDurationMs:1000,elapsedOffsetMs:250,easing:{curve:'quadratic',direction:'in'}}},{atMs:750,from:2+2*.749**2,to:1,durationMs:0,easing:{curve:'linear'}}]}}
 }else if(kind==='held'){
 record.composition.propertyTracks[0]={id:'repeat',target:{kind:'show-repeat-scale'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'first',timeMs:0,value:2,easing:{curve:'hold',at:1}},{id:'middle',timeMs:500,value:4,easing:{curve:'hold',at:1}},{id:'last',timeMs:1000,value:4,easing:{curve:'hold',at:1}}]}
 expected.samplePropertyRamps={repeatScale:{initial:2,ramps:[{atMs:500,from:2,to:4,durationMs:0,easing:{curve:'linear'}},{atMs:1000,from:4,to:4,durationMs:0,easing:{curve:'linear'}}]}}
 }
 expect(validateShowRecordV2(record)).toEqual([]);const before=structuredClone(record),prepared=prepare(record)
 expect(record).toEqual(before);expect(prepared.status,prepared.status==='refused'?JSON.stringify(prepared.issues):'').toBe('ready')
 if(prepared.status!=='ready')return
 for(const mode of ['fast','fidelity'] as const)expect(frames(prepared.recipe,mode,record)).toEqual(frames(expected,mode))
 expect(prepared.recipe.samplePropertyRamps).toEqual(expected.samplePropertyRamps)
})
it.each([425,500,575,600])('prepares whole-output Layout edge at%s without changing contributor timing',atMs=>{
 const {record,recipe}=fixture(true),first=record.composition.layoutOccurrences[0];first.durationMs=atMs;record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',layoutId:'second',startMs:atMs,durationMs:1000-atMs})
 expect(validateShowRecordV2(record)).toEqual([])
 const expected=structuredClone(recipe);expected.routingSwitches=[{atMs,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}]
 expected.routingPropertyRamps={splitPosition:{initial:.5,ramps:[{atMs,from:.5,to:.5,durationMs:0,easing:{curve:'linear'}}]}}
 const before=structuredClone(record),prepared=prepare(record);expect(record).toEqual(before)
 expect(prepared.status,prepared.status==='refused'?JSON.stringify(prepared.issues):'').toBe('ready');if(prepared.status!=='ready')return
 for(const mode of ['fast','fidelity'] as const)expect(frames(prepared.recipe,mode,record)).toEqual(frames(expected,mode))
 expect(prepared.recipe).toEqual(expected)
})
it.each([1,99,100,200])('preserves explicit whole-output split carrier across interior Layout (%s)',durationMs=>{
 const {record,recipe}=fixture(true),first=record.composition.layoutOccurrences[0];first.durationMs=500;first.parameters.splitPosition=.25
 record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',layoutId:'second',startMs:500,durationMs:500,parameters:{splitPosition:.75}})
 record.composition.transitions[0].propertyRamps=[{target:{kind:'layout-occurrence-split-position',layoutOccurrenceId:'later'},from:.25,durationMs,easing:{curve:'quadratic',direction:'in'}}]
 expect(validateShowRecordV2(record)).toEqual([])
 const expected=structuredClone(recipe);expected.routingSwitches=[{atMs:500,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}]
 expected.routingPropertyRamps={splitPosition:{initial:.25,ramps:[{atMs:400,from:.25,to:.75,durationMs,easing:{curve:'quadratic',direction:'in'}},...(durationMs<=100?[{atMs:500,from:.25,to:.75,durationMs:0,easing:{curve:'linear' as const}}]:[])]}}
 const prepared=prepare(record);expect(prepared.status,prepared.status==='refused'?JSON.stringify(prepared.issues):'').toBe('ready');if(prepared.status!=='ready')return
 for(const mode of ['fast','fidelity'] as const)expect(frames(prepared.recipe,mode,record)).toEqual(frames(expected,mode))
 expect(prepared.recipe).toEqual(expected)
})
it.each([1,99,100,200,500])('bounds the whole-output split carrier to its Transition window and keeps the later occurrence cut (%s)',durationMs=>{
 const times=[575,600,750,799,800,801,875,975]
 const {record}=fixture(true),first=record.composition.layoutOccurrences[0];first.durationMs=500;first.parameters.splitPosition=.25
 record.composition.layoutOccurrences.push({...structuredClone(first),id:'middle',layoutId:'second',startMs:500,durationMs:300,parameters:{splitPosition:.75}})
 record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',layoutId:'second',startMs:800,durationMs:200,parameters:{splitPosition:.25}})
 const base=prepare(record);expect(base.status).toBe('ready');if(base.status!=='ready')return
 expect(base.recipe.routingSwitches).toEqual([{atMs:500,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}])
 expect(base.recipe.routingPropertyRamps).toEqual({splitPosition:{initial:.25,ramps:[
  {atMs:500,from:.25,to:.75,durationMs:0,easing:{curve:'linear'}},{atMs:800,from:.75,to:.25,durationMs:0,easing:{curve:'linear'}}]}})
 record.composition.transitions[0].propertyRamps=[{target:{kind:'layout-occurrence-split-position',layoutOccurrenceId:'middle'},from:.25,durationMs,easing:{curve:'quadratic',direction:'in'}}]
 expect(validateShowRecordV2(record)).toEqual([])
 const bounded=Math.min(durationMs,200),expected=structuredClone(base.recipe)
 expected.routingPropertyRamps={splitPosition:{initial:.25,ramps:[
  {atMs:400,from:.25,to:.75,durationMs:bounded,easing:{curve:'quadratic',direction:'in'}},
  ...(500>=400+bounded?[{atMs:500,from:.25,to:.75,durationMs:0,easing:{curve:'linear' as const}}]:[]),
  {atMs:800,from:.75,to:.25,durationMs:0,easing:{curve:'linear' as const}},
 ]}}
 const before=structuredClone(record),prepared=prepare(record);expect(record).toEqual(before)
 expect(prepared.status,prepared.status==='refused'?JSON.stringify(prepared.issues):'').toBe('ready');if(prepared.status!=='ready')return
 for(const mode of ['fast','fidelity'] as const){
  const actual=frames(prepared.recipe,mode,record,times)
  expect(actual).toEqual(frames(expected,mode,undefined,times))
  expect(actual[3].frame).toEqual(actual[2].frame)
  expect(actual[5].frame).not.toEqual(actual[3].frame)
  expect(actual[6].frame).toEqual(actual[5].frame);expect(actual[7].frame).toEqual(actual[5].frame)
  if(durationMs<=200)continue
  const unbounded=structuredClone(expected)
  unbounded.routingPropertyRamps={splitPosition:{initial:.25,ramps:[{atMs:400,from:.25,to:.75,durationMs,easing:{curve:'quadratic',direction:'in'}}]}}
  const leaked=frames(unbounded,mode,undefined,times)
  expect(leaked[5].frame).not.toEqual(actual[5].frame);expect(leaked[6].frame).not.toEqual(actual[6].frame)
 }
 expect(prepared.recipe).toEqual(expected)
})

it.each([false,true])('preserves exact timed transfer through a whole-output window (%s)',timed=>{
 const {record,recipe}=fixture(true),first=record.composition.layoutOccurrences[0];first.durationMs=500
 record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',layoutId:'second',startMs:500,durationMs:500,...(timed?{incomingTransfer:{id:'transfer',fromOccurrenceId:first.id,durationMs:125,easing:{curve:'quadratic' as const,direction:'in' as const},direction:'reverse' as const}}:{})})
 const expected=structuredClone(recipe);expected.routingSwitches=[{atMs:500,layoutId:'second',durationMs:timed?125:0,easing:timed?{curve:'quadratic',direction:'in'}:{curve:'linear'},direction:timed?'reverse':'forward'}]
 expected.routingPropertyRamps={splitPosition:{initial:.5,ramps:[{atMs:500,from:.5,to:.5,durationMs:0,easing:{curve:'linear'}}]}}
 const before=structuredClone(record),result=prepare(record);expect(record).toEqual(before);expect(result.status).toBe('ready');if(result.status!=='ready')return
 for(const mode of ['fast','fidelity'] as const)expect(frames(result.recipe,mode,record)).toEqual(frames(expected,mode))
 expect(()=>lowerShowCompositionV2ForCompile(record,lookup)).toThrow(ShowV2PreparedRecipeRequiredError)
})
it('fails direct lowering closed for newly supported held participant repeat without changing persisted data',()=>{
 const {record}=fixture();record.composition.propertyTracks=[{id:'held',target:{kind:'show-repeat-scale'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'first',timeMs:0,value:2,easing:{curve:'hold',at:1}},{id:'last',timeMs:1000,value:2,easing:{curve:'hold',at:1}}]}]
 const before=structuredClone(record)
 expect(prepare(record).status).toBe('ready')
 expect(()=>lowerShowCompositionV2ForCompile(record,lookup)).toThrow(ShowV2PreparedRecipeRequiredError)
 expect(record).toEqual(before)
})
it('refuses overlapping global repeat owners and unavailable contribution Zones atomically',()=>{
 const {record}=fixture();record.composition.propertyTracks=[{id:'a',target:{kind:'show-repeat-scale'},activeStartMs:250,activeDurationMs:500,keyframes:[{id:'first',timeMs:250,value:2,easing:{curve:'linear'}},{id:'last',timeMs:750,value:4,easing:{curve:'linear'}}]}]
 record.composition.propertyTracks.push({...structuredClone(record.composition.propertyTracks[0]),id:'b'})
 const before=structuredClone(record);expect(prepareShowV2ForCompile(record,lookup).status).toBe('refused');expect(record).toEqual(before)
 const other=fixture(true).record;other.zoneLayouts.push({id:'absent',name:'Absent',zones:[],logical:{kind:'single',zoneIds:['other']}});other.composition.layoutOccurrences[0].durationMs=500
 other.composition.layoutOccurrences.push({...structuredClone(other.composition.layoutOccurrences[0]),id:'later',layoutId:'absent',startMs:500,durationMs:500})
 const original=structuredClone(other);expect(prepareShowV2ForCompile(other,lookup).status).toBe('refused');expect(other).toEqual(original)
})
it('preserves shared runtime first-contribution Restart under global participant repeat animation',()=>{
 const {record}=fixture(),[out,incoming]=record.composition.clips;incoming.instanceId=out.instanceId;incoming.entryPolicy='restart'
 const base=prepare(record);expect(base.status).toBe('ready');if(base.status!=='ready')return
 expect(base.recipe.clips.filter(clip=>!clip.compilerOwnedEmpty)).toHaveLength(1)
 expect(base.recipe.restartEvents).toEqual([{atMs:400,clipId:out.instanceId}])
 record.composition.propertyTracks=[{id:'repeat',target:{kind:'show-repeat-scale'},activeStartMs:250,activeDurationMs:500,keyframes:[{id:'first',timeMs:250,value:2,easing:{curve:'quadratic',direction:'in'}},{id:'last',timeMs:750,value:4,easing:{curve:'linear'}}]}]
 const result=prepare(record);expect(result.status).toBe('ready');if(result.status!=='ready')return
 for(const mode of ['fast','fidelity'] as const)expect(frames(result.recipe,mode,record)).toEqual(frames(repeatRecipe(base.recipe),mode))
})
it('preserves retained repeat kernels even when authored easing fields resemble a held full-Show track',()=>{
 const {record,recipe}=fixture(),segment={baseValue:2,deltaValue:2,sourceDurationMs:1000,elapsedOffsetMs:0,easing:{curve:'quadratic' as const,direction:'in' as const}}
 record.composition.propertyTracks=[{id:'retained-held',target:{kind:'show-repeat-scale'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'first',timeMs:0,value:2,easing:{curve:'hold',at:1},curveSegment:segment},{id:'last',timeMs:1000,value:4,easing:{curve:'hold',at:1}}]}]
 const expected=structuredClone(recipe);expected.samplePropertyRamps={repeatScale:{initial:2,ramps:[{atMs:0,from:2,to:2,durationMs:0,easing:{curve:'linear'}},{atMs:0,from:2,to:4,durationMs:1000,easing:{curve:'hold',at:1},curveSegment:segment}]}}
 const result=prepare(record);expect(result.status).toBe('ready');if(result.status!=='ready')return
 expect(result.recipe.samplePropertyRamps).toEqual(expected.samplePropertyRamps)
 for(const mode of ['fast','fidelity'] as const)expect(frames(result.recipe,mode,record)).toEqual(frames(expected,mode))
})

it.each(['span','independent'] as const)('keeps oneZone continuous repeat animation on the complete nonflat route (%s)',sampling=>{
 const source=transitionV1Show('crossfade','live-live');source.composition!.scenes[0].zones[0].overlays=[]
 const converted=convertShowRecordV1ToV2(source);expect(converted.status).toBe('converted');if(converted.status!=='converted')return
 const record=converted.record;record.composition.clips.forEach(clip=>{clip.zoneSampleMode=sampling})
 const base=prepare(record);expect(base.status).toBe('ready');if(base.status!=='ready')return
 record.composition.executionModel='continuous'
 record.composition.propertyTracks=[{id:'repeat',target:{kind:'show-repeat-scale'},activeStartMs:250,activeDurationMs:500,keyframes:[{id:'first',timeMs:250,value:2,easing:{curve:'quadratic',direction:'in'}},{id:'last',timeMs:750,value:4,easing:{curve:'linear'}}]}]
 const original=structuredClone(record),result=prepare(record);expect(record).toEqual(original);expect(result.status).toBe('ready');if(result.status!=='ready')return
 expect(result.provenance.route).toBe('transition')
 for(const mode of ['fast','fidelity'] as const)expect(frames(result.recipe,mode,record)).toEqual(frames(repeatRecipe(base.recipe),mode))
 expect(()=>lowerShowCompositionV2ForCompile(record,lookup)).toThrow('Repeat-scale animation requires prepareShowV2ForCompile')
})
it.each(['span','independent'] as const)('keeps oneZone continuous whole-output interior Layout on the complete nonflat route (%s)',sampling=>{
 const source=transitionV1Show('crossfade','live-live');source.composition!.scenes[0].zones[0].overlays=[]
 source.routingLayouts=[{id:'layout',name:'Both',zones:[{zoneId:'zone',ranges:[{start:0,end:1}]}]},{id:'second',name:'Tail',zones:[{zoneId:'zone',ranges:[{start:1,end:1}]}]}]
 const converted=convertShowRecordV1ToV2(source);expect(converted.status).toBe('converted');if(converted.status!=='converted')return
 const record=converted.record,transition=record.composition.transitions[0],pair=transition.participants[0]
 transition.wholeOutput={startMs:400,fromClipIds:[pair.fromClipId],toClipIds:[pair.toClipId]};transition.participants=[]
 record.composition.clips.forEach(clip=>{clip.zoneSampleMode=sampling})
 const base=prepare(record);expect(base.status).toBe('ready');if(base.status!=='ready')return
 record.composition.executionModel='continuous'
 const first=record.composition.layoutOccurrences[0];first.durationMs=500;record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',layoutId:'second',startMs:500,durationMs:500})
 const expected=structuredClone(base.recipe);expected.routingSwitches=[{atMs:500,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}]
 expected.routingPropertyRamps={splitPosition:{initial:.5,ramps:[{atMs:500,from:.5,to:.5,durationMs:0,easing:{curve:'linear'}}]}}
 const original=structuredClone(record),result=prepare(record);expect(record).toEqual(original);expect(result.status).toBe('ready');if(result.status!=='ready')return
 expect(result.provenance.route).toBe('global-sections')
 for(const mode of ['fast','fidelity'] as const)expect(frames(result.recipe,mode,record)).toEqual(frames(expected,mode))
 expect(()=>lowerShowCompositionV2ForCompile(record,lookup)).toThrow(ShowV2PreparedRecipeRequiredError)
})

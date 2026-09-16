import { expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile, lowerShowCompositionV2ForCompile, ShowV2PreparedRecipeRequiredError } from './showCompositionLoweringV2'
import { compileShow, type ShowRecipe } from './showCompiler'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { showRecordToCompileRecipe } from './showModel'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { showV2GroupOccurrenceEditorFixture } from '../test/showV2GroupOccurrenceEditorFixture'
import { prepareShowStageV2 } from './showPreparedStageV2'
import { LIBRARIES } from '../pixelblaze/libs'

const lookup = { byCellId: {}, byPatternInstanceId: {
  'out-instance': 'export var elapsed=0; export var calls=0; export function beforeRender(delta){elapsed+=delta/1000;calls++} export function render2D(index,x,y){rgb(1,x,y)}',
  'in-instance': 'export var elapsed=0; export var calls=0; export function beforeRender(delta){elapsed+=delta/1000;calls++} export function render2D(index,x,y){rgb(x,y,1)}',
}, stageDimension: 2 as const }
function prepare(record:ShowRecordV2){
 const opened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
 if(opened.status!=='opened')throw Error('Public v2 reopen failed')
 expect(opened.record).toEqual(record)
 return prepareShowV2ForCompile(opened.record,lookup)
}
function fixture() {
 const source=transitionV1Show('crossfade','live-live')
 source.zones.push({id:'other',name:'Other',nominalPixelCount:16})
 source.composition!.scenes[0].zones.push({zoneId:'other',main:[],overlays:[]})
 source.routingLayouts=[{id:'layout',name:'Vertical',zones:[],logical:{kind:'split',axis:'x',zoneIds:['zone','other']}},{id:'second',name:'Horizontal',zones:[],logical:{kind:'split',axis:'y',zoneIds:['zone','other']}}]
 const converted=convertShowRecordV1ToV2(source)
 if(converted.status!=='converted') throw Error(JSON.stringify(converted.issues))
 const prepared=prepareShowV2ForCompile(converted.record,lookup)
 if(prepared.status!=='ready') throw Error(JSON.stringify(prepared.issues))
 return {record:converted.record,recipe:prepared.recipe}
}
function replay(recipe:ShowRecipe,fidelity:'fast'|'fidelity',record?:ShowRecordV2) {
 const artifact=compileShow(recipe,LIBRARIES)
 const file=record?buildShowEpeExportV2(record,artifact.code,{stampedAt:'2026-09-16T00:00:00Z'}):null
 if(file)expect(file.status).toBe('exported')
 const code=file?.status==='exported'?parseEpe(file.text).src:artifact.code
 return createFastReplayRuntime({...artifact,code,dimension:nativeDimension(artifact.metadata.renderFns)},{fidelity,randomSeed:1038,mapPoints:[{sample:[.25,.75],pos:[.25,.75]},{sample:[.75,.25],pos:[.75,.25]}]})
}
function snapshots(recipe:ShowRecipe,fidelity:'fast'|'fidelity',record?:ShowRecordV2,times:readonly number[]=[125,375,400,425,500,575,600,625,750,875]) {
 const runtime=replay(recipe,fidelity,record)
 return times.map(time=>{
 const frame=runtime.advanceTo(time,{stepMs:25,forceFullIntermediateRender:true})
 // Export getters are live: clone at this frame before any subsequent advance.
 return {frame:Array.from(frame.frame),state:Object.fromEntries(Object.entries(frame.exports).filter(([name,value])=>/elapsed|calls/.test(name)&&typeof value==='number'))}
 })
}
it.each(['fast','fidelity'] as const)('existing global routing recipe changes Layout independently of participant schedule in %s',fidelity=>{
 const {recipe}=fixture(), switched=structuredClone(recipe)
 switched.routingSwitches=[{atMs:500,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}]
 expect(switched.routedSceneSequence).toEqual(recipe.routedSceneSequence)
 const baseline=snapshots(recipe,fidelity),actual=snapshots(switched,fidelity)
 expect(Object.keys(actual[4].state).length).toBeGreaterThan(0)
 expect(actual.slice(0,4)).toEqual(baseline.slice(0,4))
 expect(actual[8].frame).not.toEqual(baseline[8].frame)
 expect(actual.map(value=>value.state)).toEqual(baseline.map(value=>value.state))
})
it.each([375,400,500,600,625])('prepares an exact Layout switch at%s across the participant window',atMs=>{
 const {record,recipe}=fixture(),input=structuredClone(record)
 record.composition.layoutOccurrences[0].durationMs=atMs
 record.composition.layoutOccurrences.push({...structuredClone(record.composition.layoutOccurrences[0]),id:'later',layoutId:'second',startMs:atMs,durationMs:1000-atMs})
 expect(validateShowRecordV2(record)).toEqual([])
 const expected=structuredClone(recipe)
 expected.routingSwitches=[{atMs,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}]
 expected.routingPropertyRamps={splitPosition:{initial:.5,ramps:[{atMs,from:.5,to:.5,durationMs:0,easing:{curve:'linear'}}]}}
 const before=structuredClone(record),prepared=prepare(record)
 expect(record).toEqual(before)
 expect(input.composition.layoutOccurrences).toHaveLength(1)
 expect(prepared.status,prepared.status==='refused'?JSON.stringify(prepared.issues):'').toBe('ready')
 if(prepared.status!=='ready')return
 expect(prepared.recipe).toEqual(expected)
 for(const mode of ['fast','fidelity'] as const)expect(snapshots(prepared.recipe,mode,record)).toEqual(snapshots(expected,mode))
 const artifact=compileShow(prepared.recipe,LIBRARIES),file=buildShowEpeExportV2(record,artifact.code,{stampedAt:'2026-09-16T00:00:00Z'})
 expect(file.status).toBe('exported')
 if(file.status==='exported')expect(parseEpe(file.text).src).toContain(artifact.code)
 expect(()=>lowerShowCompositionV2ForCompile(record,lookup)).toThrow(ShowV2PreparedRecipeRequiredError)
 try{lowerShowCompositionV2ForCompile(record,lookup)}catch(error){expect(error).toMatchObject({code:'requires-prepared-recipe'})}
})

it.each([false,true].flatMap(same=>[false,true].map(timed=>({same,timed}))))('preserves repeated/changed definitions and exact timed Layout transfer ($same/$timed)',({same,timed})=>{
 const {record,recipe}=fixture(),first=record.composition.layoutOccurrences[0];first.durationMs=500
 record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',layoutId:same?'layout':'second',startMs:500,durationMs:500,...(timed?{incomingTransfer:{id:'transfer',fromOccurrenceId:first.id,durationMs:125,easing:{curve:'quadratic' as const,direction:'in' as const},direction:'reverse' as const}}:{})})
 expect(validateShowRecordV2(record)).toEqual([])
 const expected=structuredClone(recipe)
 expected.routingSwitches=timed||!same?[{atMs:500,layoutId:same?'layout':'second',durationMs:timed?125:0,easing:timed?{curve:'quadratic',direction:'in'}:{curve:'linear'},direction:timed?'reverse':'forward'}]:[]
 expected.routingPropertyRamps={splitPosition:{initial:.5,ramps:[{atMs:500,from:.5,to:.5,durationMs:0,easing:{curve:'linear'}}]}}
 const prepared=prepare(record)
 expect(prepared.status,prepared.status==='refused'?JSON.stringify(prepared.issues):'').toBe('ready')
 if(prepared.status==='ready'){expect(prepared.recipe.routingSwitches).toEqual(expected.routingSwitches);for(const mode of ['fast','fidelity'] as const)expect(snapshots(prepared.recipe,mode,record)).toEqual(snapshots(expected,mode))}
})
it.each([false,true])('maps occurrence baselines and nonlinear active split-position tracks without Scene resets (retained:%s)',retained=>{
 const {record,recipe}=fixture(),first=record.composition.layoutOccurrences[0];first.durationMs=500;first.parameters.splitPosition=.25
 record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',startMs:500,durationMs:500,parameters:{splitPosition:.75}})
 record.composition.propertyTracks=[{id:'split',target:{kind:'layout-occurrence-split-position',layoutOccurrenceId:'later'},activeStartMs:500,activeDurationMs:375,keyframes:[{id:'first',timeMs:500,value:.25,easing:{curve:'quadratic',direction:'in'}},{id:'last',timeMs:875,value:.5,easing:{curve:'linear'}}]}]
 if(retained){
 const keys=record.composition.propertyTracks[0].keyframes
 keys[0].value=.2+.6*.25**2;keys[1].value=.2+.6*.625**2
 keys[0].curveSegment={baseValue:.2,deltaValue:.6,sourceDurationMs:1000,elapsedOffsetMs:250,easing:{curve:'quadratic',direction:'in'}}
 }
 expect(validateShowRecordV2(record)).toEqual([])
 const expected=structuredClone(recipe);expected.routingSwitches=[]
 expected.routingPropertyRamps={splitPosition:{initial:.25,ramps:[{atMs:500,from:.75,to:.25,durationMs:0,easing:{curve:'linear'}},{atMs:500,from:.25,to:.5,durationMs:375,easing:{curve:'quadratic',direction:'in'}},{atMs:875,from:.25+.25*(374/375)**2,to:.75,durationMs:0,easing:{curve:'linear'}}]}}
 if(retained)expected.routingPropertyRamps={splitPosition:{initial:.25,ramps:[
 {atMs:500,from:.75,to:.2+.6*.25**2,durationMs:0,easing:{curve:'linear'}},
 {atMs:500,from:.2+.6*.25**2,to:.2+.6*.625**2,durationMs:375,easing:{curve:'quadratic',direction:'in'},curveSegment:{baseValue:.2,deltaValue:.6,sourceDurationMs:1000,elapsedOffsetMs:250,easing:{curve:'quadratic',direction:'in'}}},
 {atMs:875,from:.2+.6*.624**2,to:.75,durationMs:0,easing:{curve:'linear'}}
 ]}}
 const prepared=prepare(record)
 expect(prepared.status,prepared.status==='refused'?JSON.stringify(prepared.issues):'').toBe('ready')
 if(prepared.status!=='ready')return
 expect(prepared.recipe.routingPropertyRamps).toEqual(expected.routingPropertyRamps)
 for(const mode of ['fast','fidelity'] as const)expect(snapshots(prepared.recipe,mode,record)).toEqual(snapshots(expected,mode))
})
it('rejects disappearing contribution Zones and preserves the complete saved input',()=>{
 const {record}=fixture(),first=record.composition.layoutOccurrences[0];first.durationMs=500
 record.zoneLayouts.push({id:'absent',name:'Absent',zones:[],logical:{kind:'single',zoneIds:['other']}})
 record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',layoutId:'absent',startMs:500,durationMs:500})
 const before=structuredClone(record)
 expect(prepare(record)).toMatchObject({status:'refused',issues:[{code:'invalid-record'}]})
 expect(record).toEqual(before)
})
it.each([false,true].flatMap(shared=>[false,true].map(restart=>({shared,restart}))))('preserves effective runtime identity and first-contribution Restart ($shared/$restart)',({shared,restart})=>{
 const {record}=fixture()
 if(shared)record.composition.clips[1].instanceId=record.composition.clips[0].instanceId
 if(restart)record.composition.clips[1].entryPolicy='restart'
 const original=prepare(record)
 expect(original.status,original.status==='refused'?JSON.stringify(original.issues):'').toBe('ready')
 if(original.status!=='ready')return
 record.composition.layoutOccurrences[0].durationMs=500
 record.composition.layoutOccurrences.push({...structuredClone(record.composition.layoutOccurrences[0]),id:'later',startMs:500,durationMs:500})
 const prepared=prepare(record)
 expect(prepared.status,prepared.status==='refused'?JSON.stringify(prepared.issues):'').toBe('ready')
 if(prepared.status!=='ready')return
 expect(prepared.recipe.clips.filter(clip=>!clip.compilerOwnedEmpty)).toHaveLength(shared?1:2)
 expect(prepared.recipe.restartEvents).toEqual(original.recipe.restartEvents)
 if(restart)expect(prepared.recipe.restartEvents).toEqual([{atMs:400,clipId:shared?'out-instance':'in-instance'}])
 for(const mode of ['fast','fidelity'] as const)expect(snapshots(prepared.recipe,mode,record)).toEqual(snapshots(original.recipe,mode))
})

it.each(['fast','fidelity'] as const)('held linked Group spans repeated Layouts with exact shared controls and Restart in %s',mode=>{
 const {record,dependencies}=showV2GroupOccurrenceEditorFixture(true),original=prepareShowStageV2(record,dependencies)
 expect(original.status).toBe('ready')
 if(original.status!=='ready')return
 const first=record.composition.layoutOccurrences[0];first.durationMs=17000
 record.composition.layoutOccurrences.push({...structuredClone(first),id:'later',startMs:17000,durationMs:14000})
 const before=structuredClone(record),changed=prepareShowStageV2(record,dependencies)
 expect(changed.status,changed.status==='refused'?changed.message:'').toBe('ready')
 expect(record).toEqual(before)
 if(changed.status!=='ready')return
 expect(changed.bundle.recipe.restartEvents).toEqual(original.bundle.recipe.restartEvents)
 expect(changed.bundle.artifact.summary.clips.filter(clip=>!clip.id.includes('empty'))).toHaveLength(1)
 const actual=replay(changed.bundle.recipe,mode,record),expected=replay(original.bundle.recipe,mode)
 for(const time of [125,2000,3000,4000,5000,6000,7000,10000,11000,12000,14000,17000,30000]){
  const snapshots=[expected,actual].map(runtime=>{const frame=runtime.advanceTo(time,{stepMs:125,forceFullIntermediateRender:true});return {frame:Array.from(frame.frame),state:Object.fromEntries(Object.entries(frame.exports).filter(([name,value])=>/elapsed|gain/.test(name)&&typeof value==='number'))}})
  expect(Object.keys(snapshots[0].state).length).toBeGreaterThan(0)
  expect(snapshots[1],`native output/state@${time}`).toEqual(snapshots[0])
 }
})

function continuousParticipantFixture(splitIncoming:boolean,sharedRestart=false){
 const source=transitionV1Show('crossfade','live-live');source.composition!.scenes[0].zones[0].overlays=[]
 const converted=convertShowRecordV1ToV2(source);if(converted.status!=='converted')throw Error(JSON.stringify(converted.issues))
 const record=converted.record;record.composition.executionModel='continuous'
 for(const clip of record.composition.clips)clip.zoneSampleMode='independent'
 record.zoneLayouts=[{id:'layout',name:'Both',zones:[{zoneId:'zone',ranges:[{start:0,end:1}]}]},{id:'second',name:'Tail',zones:[{zoneId:'zone',ranges:[{start:1,end:1}]}]}]
 const incoming=record.composition.clips[1]
 if(sharedRestart){incoming.instanceId=record.composition.clips[0].instanceId;incoming.entryPolicy='restart'}
 if(splitIncoming){incoming.durationMs=200;const later=structuredClone(incoming);later.id='in2';later.startMs=800;later.entryPolicy='continue';later.appearance.keys[0].timeMs=800;record.composition.clips.push(later)}
 expect(validateShowRecordV2(record)).toEqual([])
 return record
}
const continuousTimes=[125,375,400,425,500,575,600,625,700,725,750,800,825,875,900,925,975]
it.each([false,true].flatMap(splitIncoming=>[600,700,800,900].map(atMs=>({splitIncoming,atMs}))))('continuous independent participant Layout refuses atomically pending lossless sampling ($splitIncoming/$atMs)',({splitIncoming,atMs})=>{
 const record=continuousParticipantFixture(splitIncoming)
 record.composition.layoutOccurrences[0].durationMs=atMs
 record.composition.layoutOccurrences.push({...structuredClone(record.composition.layoutOccurrences[0]),id:'later',layoutId:'second',startMs:atMs,durationMs:1000-atMs})
 const before=structuredClone(record),actual=prepare(record)
 expect(actual).toMatchObject({status:'refused',issues:[{code:'unsupported-layout-occurrences',path:'composition.layoutOccurrences'}]})
 if(actual.status==='refused')expect(actual.issues[0].message).toContain('Independent Clip sampling')
 expect(record).toEqual(before)
 expect(()=>lowerShowCompositionV2ForCompile(record,lookup)).toThrow('Independent Clip sampling')
})
it('continuous shared participant Restart keeps its first-contribution event while Layout switches independently',()=>{
 const record=continuousParticipantFixture(false,true),before=prepare(record);expect(before.status).toBe('ready');if(before.status!=='ready')return
 record.composition.layoutOccurrences[0].durationMs=800
 record.composition.layoutOccurrences.push({...structuredClone(record.composition.layoutOccurrences[0]),id:'later',layoutId:'second',startMs:800,durationMs:200})
 const expected=structuredClone(before.recipe);expected.routingSwitches=[{atMs:800,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}]
 if(expected.routingPropertyRamps)expected.routingPropertyRamps={splitPosition:{initial:.5,ramps:[{atMs:800,from:.5,to:.5,durationMs:0,easing:{curve:'linear'}}]}}
 const actual=prepare(record);expect(actual.status).toBe('ready');if(actual.status!=='ready')return
 expect(actual.recipe.clips.filter(clip=>!clip.compilerOwnedEmpty)).toHaveLength(1)
 expect(actual.recipe.restartEvents).toEqual([{atMs:400,clipId:'out-instance'}])
 for(const fidelity of ['fast','fidelity'] as const)expect(snapshots(actual.recipe,fidelity,record,continuousTimes)).toEqual(snapshots(expected,fidelity,undefined,continuousTimes))
})

it('keeps the previously admitted single-Layout continuous control byte-identical',()=>{
 const record=continuousParticipantFixture(false),prepared=prepare(record),direct=lowerShowCompositionV2ForCompile(record,lookup)
 expect(prepared.status).toBe('ready');if(prepared.status!=='ready')return
 expect(prepared.recipe.routedSceneSequence).toBeUndefined()
 const expected=showRecordToCompileRecipe(direct.show,direct.lookup)
 expect(compileShow(prepared.recipe,LIBRARIES).code).toBe(compileShow(expected,LIBRARIES).code)
 for(const fidelity of ['fast','fidelity'] as const)expect(snapshots(prepared.recipe,fidelity,record,continuousTimes)).toEqual(snapshots(expected,fidelity,undefined,continuousTimes))
})
it('records the existing physical2D independent/span sampling mismatch without treating it as equivalence',()=>{
 const independent=continuousParticipantFixture(false),span=structuredClone(independent);for(const clip of span.composition.clips)clip.zoneSampleMode='span'
 const flat=prepare(independent),routed=prepare(span);expect(flat.status).toBe('ready');expect(routed.status).toBe('ready');if(flat.status!=='ready'||routed.status!=='ready')return
 const values=[flat.recipe,routed.recipe].map(recipe=>snapshots(recipe,'fast',undefined,[125])[0])
 expect(values[0].frame).toEqual([1,.25,.75,1,.75,.25]);expect(values[1].frame).toEqual([1,0,.5,1,1,.5]);expect(values[0].state).toEqual(values[1].state)
})
it('records the complete flat routing recipe rejection as an unresolved preparation obligation',()=>{
 const record=continuousParticipantFixture(false),baseline=prepare(record);expect(baseline.status).toBe('ready');if(baseline.status!=='ready')return
 const global=structuredClone(baseline.recipe)
 global.zones=[{id:'zone',name:'Main',ranges:[{start:0,end:1}]}]
 global.routingLayouts=record.zoneLayouts.map(layout=>({id:layout.id,name:layout.name,zones:[{id:'zone',name:'Main',ranges:structuredClone(layout.zones[0].ranges)}]}))
 global.clips=global.clips.map(clip=>({...clip,zone:'Main',zoneMode:'independent'}))
 global.routingSwitches=[{atMs:800,layoutId:'second',durationMs:0,easing:{curve:'linear'},direction:'forward'}]
 expect(()=>compileShow(global,LIBRARIES)).toThrow('routed clips cannot use scene boundary modes yet')
})

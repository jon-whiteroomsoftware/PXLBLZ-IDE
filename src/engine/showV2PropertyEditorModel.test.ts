import { describe, expect, it } from 'vitest'
import { propertyEditGroupRecord, propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { buildShowV2PropertyEditorModel, createShowV2PropertyTrackIntent, propertyKeyPatchFromDraft, propertyEasingDraft, propertyEasingFromDraft } from './showV2PropertyEditorModel'
import {defaultGroupRuntimeIdV2} from './showGroupsV2'
import type { ShowV2TimelineCapture } from './showV2TimelineEditorModel'
const sliderSource='export function sliderGain(v){} export function render2D(i,x,y){rgb(x,y,0)}'
function capture(record=propertyEditRecord()): ShowV2TimelineCapture { record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}; return {record,dependencies:{patterns:[{id:record.composition.patternInstances[0].pattern.id,name:'Voice',src:sliderSource,controls:{},updatedAt:1}],libraries:[],maps:[],profiles:[],stageMap:null},prepared:{status:'empty',record}} }
describe('native persisted Property projection',()=>{
 it('offers explicit owners and all nine Show target families without materialized writable aliases',()=>{
  const c=capture();c.record.zones.push({id:'right',name:'Right',nominalPixelCount:16});c.record.zoneLayouts[0].logical={kind:'split',axis:'x',zoneIds:['zone','right']}
  const m=buildShowV2PropertyEditorModel(c,{kind:'show'},{activeStartMs:0,activeDurationMs:1000})
  expect(new Set(m.targets.map(t=>t.target.kind))).toEqual(new Set(['instance-time-scale','instance-control','clip-opacity','clip-view','clip-transform','clip-aperture','clip-effect','layout-occurrence-split-position','show-repeat-scale']))
  expect(m.targets.find(t=>t.target.kind==='instance-control')?.target).toEqual({kind:'instance-control',instanceId:'instance',exportName:'sliderGain'})
  expect(buildShowV2PropertyEditorModel(c).targets).toEqual([])
 })
 it('checks every authoritative linked Group binding and never invents missing control baselines',()=>{
  const c=capture(propertyEditGroupRecord());const second=structuredClone(c.record.composition.patternInstances[0]);second.id='other';second.pattern={kind:'user',id:'other-pattern'};second.controlTargets={};c.record.composition.patternInstances.push(second);c.record.composition.groupOccurrences[1].instanceBindings={slot:'other'}
  c.dependencies.patterns=[...c.dependencies.patterns,{id:'other-pattern',name:'Other',src:sliderSource,controls:{},updatedAt:1}]
  const owner={kind:'group-definition' as const,definitionId:'definition'}
  expect(buildShowV2PropertyEditorModel(c,owner,{activeStartMs:0,activeDurationMs:400}).targets.filter(t=>t.target.kind==='instance-control')).toEqual([])
  second.controlTargets={sliderGain:.7}
  expect(buildShowV2PropertyEditorModel(c,owner,{activeStartMs:0,activeDurationMs:400}).targets.filter(t=>t.target.kind==='instance-control').map(t=>t.target)).toEqual([{kind:'instance-control',instanceId:'slot',exportName:'sliderGain'}])
  second.pattern={kind:'user',id:'missing-source'}
  expect(buildShowV2PropertyEditorModel(c,owner).targets.filter(t=>t.target.kind==='instance-control')).toEqual([])
 })
 it('admits Effect choices only over held stacks intersecting activation, excluding numeric-ineligible parameters',()=>{
  const c=capture(),clip=c.record.composition.clips[0];const later=structuredClone(clip.appearance.keys[0]);later.id='later';later.timeMs=500;later.value.effects=[];clip.appearance.keys.push(later)
  expect(buildShowV2PropertyEditorModel(c,{kind:'show'},{activeStartMs:0,activeDurationMs:500}).targets.some(t=>t.target.kind==='clip-effect')).toBe(true)
  expect(buildShowV2PropertyEditorModel(c,{kind:'show'},{activeStartMs:0,activeDurationMs:501}).targets.some(t=>t.target.kind==='clip-effect')).toBe(false)
 })
 it('preserves custom easing and descriptors when merely projecting exact persisted tracks',()=>{
  const c=capture();const track={id:'track',target:{kind:'clip-opacity' as const,clipId:'clip'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'a',timeMs:0,value:.2,easing:{curve:'cubic-bezier' as const,x1:.2,y1:9,x2:.8,y2:-9},curveSegment:{baseValue:.1,deltaValue:.7,easing:{curve:'quadratic' as const,direction:'in' as const},sourceDurationMs:1000,elapsedOffsetMs:0}},{id:'b',timeMs:1000,value:.8,easing:{curve:'linear' as const}}]};c.record.composition.propertyTracks=[track]
  const m=buildShowV2PropertyEditorModel(c,{kind:'show'});expect(m.tracks).toEqual([track]);m.tracks[0].keyframes[0].value=.9;expect(track.keyframes[0].value).toBe(.2)
  expect(propertyKeyPatchFromDraft({value:'.3'})).toEqual({value:.3});expect(propertyKeyPatchFromDraft({timeMs:''}).timeMs).toBeNaN()
 })
 it('allocates complete identities once only after explicit valid track data; collision never retries',()=>{
  let n=0;const allocate=()=>`new-${++n}`;const draft=[{timeMs:'0',value:'.2',easing:{curve:'linear' as const}},{timeMs:'1000',value:'.8',easing:{curve:'linear' as const}}]
  const plan=createShowV2PropertyTrackIntent([],{kind:'clip-opacity',clipId:'clip'},'0','1000',draft,allocate);expect(plan.status).toBe('ready');expect(n).toBe(3)
  if(plan.status==='ready')expect(plan.intent.track.keyframes.map(k=>k.id)).toEqual(['new-2','new-3'])
  const bad=createShowV2PropertyTrackIntent([],undefined,'0','1000',draft,allocate);expect(bad.status).toBe('refused');expect(n).toBe(3)
  expect(createShowV2PropertyTrackIntent([],{kind:'show-repeat-scale'},'0','1000',draft,()=> 'same').status).toBe('refused')
 })
})

describe('exact structured easing drafts',()=>{
 it('retains custom coefficients until an explicit field changes, with no preset normalization',()=>{
  const easing={curve:'cubic-bezier' as const,x1:.2,y1:9,x2:.8,y2:-9}
  const draft=propertyEasingDraft(easing)
  expect(propertyEasingFromDraft(draft)).toEqual(easing)
  expect(propertyEasingFromDraft({...draft,y1:'12'})).toEqual({...easing,y1:12})
  expect(propertyEasingFromDraft({...draft,x1:''})).toBeUndefined()
  expect(propertyEasingFromDraft({...draft,y1:'Infinity'})).toBeUndefined()
 })
 it('requires each curve-dependent option explicitly and preserves equality boundaries',()=>{
  expect(propertyEasingFromDraft({curve:'steps',steps:'4',position:'start'})).toEqual({curve:'steps',steps:4,position:'start'})
  expect(propertyEasingFromDraft({curve:'steps',steps:'2.5',position:'start'})).toBeUndefined()
  expect(propertyEasingFromDraft({curve:'hold',at:'0'})).toEqual({curve:'hold',at:0})
  expect(propertyEasingFromDraft({curve:'hold',at:'1'})).toEqual({curve:'hold',at:1})
  expect(propertyEasingFromDraft({curve:'quadratic'})).toBeUndefined()
 })
})

it('offers all seven Group-local families and resolves dormant hoisted authority without editing payloads',()=>{
 const c=capture(propertyEditGroupRecord()),owner={kind:'group-definition' as const,definitionId:'definition'}
 const m=buildShowV2PropertyEditorModel(c,owner,{activeStartMs:0,activeDurationMs:400})
 expect(new Set(m.targets.map(t=>t.target.kind))).toEqual(new Set(['instance-time-scale','instance-control','clip-opacity','clip-view','clip-transform','clip-aperture','clip-effect']))
 c.record.composition.groupOccurrences=[]
 const authority=structuredClone(c.record.composition.patternInstances[0]);authority.id=defaultGroupRuntimeIdV2('definition','slot');authority.pattern={kind:'user',id:'silent'};authority.controlTargets={sliderGain:.75};c.record.composition.patternInstances.push(authority)
 c.dependencies.patterns=[...c.dependencies.patterns,{id:'silent',name:'Silent',src:'export function render2D(i,x,y){rgb(x,y,0)}',controls:{},updatedAt:1}]
 const before=structuredClone(c.record)
 expect(buildShowV2PropertyEditorModel(c,owner).targets.filter(t=>t.target.kind==='instance-control')).toEqual([])
 expect(c.record).toEqual(before)
})
it('inherits numeric Effect eligibility from the first held value during incoming contribution',()=>{
 const c=capture(),clip=c.record.composition.clips[0]
 clip.startMs=400;clip.durationMs=600;clip.appearance.keys[0].timeMs=400
 const from=structuredClone(clip);from.id='from';from.startMs=0;from.durationMs=100;from.appearance.keys[0].id='from-key';from.appearance.keys[0].timeMs=0
 c.record.composition.clips.unshift(from)
 c.record.composition.transitions=[{id:'blend',kind:'crossfade',durationMs:300,easing:{curve:'linear'},participants:[{id:'pair',zoneId:clip.zoneId,layerId:clip.layerId,fromClipId:'from',toClipId:clip.id}],propertyRamps:[]}]
 const model=buildShowV2PropertyEditorModel(c,{kind:'show'},{activeStartMs:100,activeDurationMs:100})
 expect(model.targets.some(t=>t.target.kind==='clip-effect'&&t.target.clipId===clip.id&&t.target.effectId==='turn')).toBe(true)
})

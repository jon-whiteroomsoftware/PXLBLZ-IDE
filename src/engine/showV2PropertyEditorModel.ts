import { bundle } from './bundle'
import { compileLibraries } from './libraries'
import { LIBRARIES } from '../pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { defaultGroupRuntimeIdV2, groupDuration, groupDefinitionAsRecord, groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
import { clipContributionInterval } from './showLayoutIntervalsV2'
import { showClipEffectParameters } from './showEffectAuthoring'
import { validateShowEasing } from './showEasing'
import type { ShowPatternInstance, ShowStructuredEasing } from './personalContentRecords'
import type { ShowPropertyTargetV2, ShowPropertyTrackV2 } from './showCompositionV2'
import type { ShowPropertyEditIntentV2, ShowPropertyTrackOwnerV2 } from './showPropertyEditsV2'
import type { ShowV2TimelineCapture } from './showV2TimelineEditorModel'

export interface ShowV2PropertyTargetChoice { key: string; label: string; target: ShowPropertyTargetV2; sharedClipIds: string[] }
export interface ShowV2PropertyKeyDraft { timeMs: string; value: string; easing: ShowStructuredEasing }
export interface ShowV2PropertyOwnerChoice { key: string; label: string; owner: ShowPropertyTrackOwnerV2; durationMs: number; linkedOccurrenceIds: string[] }
const number = (value: string): number => value.trim() ? Number(value) : NaN
const id = (value: string): boolean => typeof value === 'string' && value.trim().length > 0
export function propertyKeyPatchFromDraft(draft: Partial<{ timeMs: string; value: string; easing: ShowStructuredEasing }>): Extract<ShowPropertyEditIntentV2, {kind:'update-key'}>['patch'] {
  return { ...(draft.timeMs !== undefined ? {timeMs:number(draft.timeMs)} : {}), ...(draft.value !== undefined ? {value:number(draft.value)} : {}), ...(draft.easing !== undefined ? {easing:structuredClone(draft.easing)} : {}) }
}
export function propertyTrackPatchFromDraft(draft: Partial<{ target: ShowPropertyTargetV2; activeStartMs: string; activeDurationMs: string }>): Extract<ShowPropertyEditIntentV2, {kind:'update-track'}>['patch'] {
  return { ...(draft.target !== undefined ? {target:structuredClone(draft.target)} : {}), ...(draft.activeStartMs !== undefined ? {activeStartMs:number(draft.activeStartMs)} : {}), ...(draft.activeDurationMs !== undefined ? {activeDurationMs:number(draft.activeDurationMs)} : {}) }
}
/** Read-only persisted target choices. Effective bindings provide eligibility, never writable IDs. */
export function buildShowV2PropertyEditorModel(capture: ShowV2TimelineCapture, owner?: ShowPropertyTrackOwnerV2, activation?: Pick<ShowPropertyTrackV2,'activeStartMs'|'activeDurationMs'>) {
  const record=capture.record
  const owners:ShowV2PropertyOwnerChoice[]=[{key:JSON.stringify({kind:'show'}),label:'Show',owner:{kind:'show'},durationMs:record.composition.showEndMs,linkedOccurrenceIds:[]},...record.composition.groupDefinitions.map(definition=>({key:JSON.stringify({kind:'group-definition',definitionId:definition.id}),label:definition.name,owner:{kind:'group-definition' as const,definitionId:definition.id},durationMs:groupDuration(definition),linkedOccurrenceIds:record.composition.groupOccurrences.filter(o=>o.definitionId===definition.id).map(o=>o.id)}))]
  const definition=owner?.kind==='group-definition'?record.composition.groupDefinitions.find(d=>d.id===owner.definitionId):undefined
  const selected=owners.find(choice=>choice.owner.kind===owner?.kind&&(choice.owner.kind==='show'||(owner?.kind==='group-definition'&&choice.owner.definitionId===owner.definitionId)))
  const tracks=structuredClone(owner?.kind==='show'?record.composition.propertyTracks:definition?.propertyTracks??[])
  const targets:ShowV2PropertyTargetChoice[]=[]
  if(!selected)return {owners,selected,tracks,targets}
  let effective: typeof record
  try{effective=materializeShowGroupsV2(record)}catch{return {owners,selected,tracks,targets}}
  const add=(target:ShowPropertyTargetV2,label:string,sharedClipIds:string[]=[])=>targets.push({key:JSON.stringify(target),label,target:structuredClone(target),sharedClipIds})
  const assets=capture.prepared.status==='ready'?capture.prepared.bundle.assets:capture.dependencies
  let libraries:Record<string,string>
  try{libraries=capture.prepared.status==='ready'?capture.prepared.bundle.libraries:compileLibraries(LIBRARIES,assets.libraries)}catch{return {owners,selected,tracks,targets}}
  const sliders=(instance:ShowPatternInstance):Set<string>=>{
    const ref=instance.pattern,source=ref.kind==='stock'?DEMOS[resolveStockPatternId(ref.id)]:assets.patterns.find(p=>p.id===ref.id)?.src
    if(source===undefined)return new Set()
    try{return new Set(bundle(source,libraries).metadata.controls.filter(control=>control.kind==='slider'&&typeof instance.controlTargets?.[control.exportName]==='number'&&Number.isFinite(instance.controlTargets[control.exportName])).map(control=>control.exportName))}catch{return new Set()}
  }
  const bindings=groupRuntimeBindings(record)
  const contributionRecord=definition?groupDefinitionAsRecord(record,definition):effective
  for(const instance of definition?.patternInstances??record.composition.patternInstances){
    const related=definition?bindings.filter(binding=>binding.definitionId===definition.id&&binding.slotId===instance.id):[]
    const dormantAuthority=definition?record.composition.patternInstances.find(candidate=>candidate.id===defaultGroupRuntimeIdV2(definition.id,instance.id)):undefined
    const authorities=related.length?related.map(binding=>binding.instance):[dormantAuthority??instance]
    const runtimeIds=related.length?related.map(binding=>binding.runtimeId):[definition?defaultGroupRuntimeIdV2(definition.id,instance.id):instance.id]
    const consumers=effective.composition.clips.filter(clip=>runtimeIds.includes(clip.instanceId)).map(clip=>clip.id)
    const prefix=`${instance.patternName??instance.id} · ${instance.id}`
    add({kind:'instance-time-scale',instanceId:instance.id},`${prefix} / Animation speed`,consumers)
    const choices=sliders(authorities[0])
    for(const authority of authorities.slice(1)){const eligible=sliders(authority);for(const name of choices)if(!eligible.has(name))choices.delete(name)}
    for(const exportName of choices)add({kind:'instance-control',instanceId:instance.id,exportName},`${prefix} / ${exportName}`,consumers)
  }
  for(const clip of definition?.clips??record.composition.clips){
    const prefix=`Clip ${clip.id}`
    add({kind:'clip-opacity',clipId:clip.id},`${prefix} / Opacity`)
    for(const property of ['brightness','phase'] as const)add({kind:'clip-view',clipId:clip.id,property},`${prefix} / View ${property}`)
    for(const property of ['positionX','positionY','rotation','scaleX','scaleY'] as const)add({kind:'clip-transform',clipId:clip.id,property},`${prefix} / Transform ${property}`)
    for(const property of ['x','y','width','height'] as const)add({kind:'clip-aperture',clipId:clip.id,property},`${prefix} / Aperture ${property}`)
    if(!activation||!Number.isSafeInteger(activation.activeStartMs)||!Number.isSafeInteger(activation.activeDurationMs)||activation.activeDurationMs<=0)continue
    const end=activation.activeStartMs+activation.activeDurationMs
    const contribution=clipContributionInterval(contributionRecord,contributionRecord.composition.clips.find(candidate=>candidate.id===clip.id)!)
    const stacks=clip.appearance.keys.filter((key,index)=>(index===0?contribution.startMs:key.timeMs)<end&&(clip.appearance.keys[index+1]?.timeMs??contribution.endMs)>activation.activeStartMs).map(key=>key.value.effects??[])
    if(!stacks.length)continue
    for(const effect of stacks[0]){
      if(!stacks.every(stack=>stack.some(candidate=>candidate.id===effect.id&&candidate.kind===effect.kind)))continue
      for(const parameter of showClipEffectParameters(effect))if(parameter.kind==='number'&&stacks.every(stack=>showClipEffectParameters(stack.find(candidate=>candidate.id===effect.id&&candidate.kind===effect.kind)!).some(candidate=>candidate.id===parameter.id&&candidate.kind==='number')))add({kind:'clip-effect',clipId:clip.id,effectId:effect.id,effectKind:effect.kind,parameterId:parameter.id},`${prefix} / ${effect.kind} ${effect.id} / ${parameter.label}`)
    }
  }
  if(owner?.kind==='show'){
    for(const occurrence of record.composition.layoutOccurrences)if(record.zoneLayouts.find(layout=>layout.id===occurrence.layoutId)?.logical?.kind==='split')add({kind:'layout-occurrence-split-position',layoutOccurrenceId:occurrence.id},`Layout ${occurrence.id} / Split position`)
    add({kind:'show-repeat-scale'},'Show / Repeat scale')
  }
  return {owners,selected,tracks,targets}
}
export type ShowV2PropertyCreatePlan<T extends ShowPropertyEditIntentV2>={status:'ready';intent:T}|{status:'refused';message:string}
function authoredKey(draft:ShowV2PropertyKeyDraft){const timeMs=number(draft.timeMs),value=number(draft.value);return Number.isSafeInteger(timeMs)&&timeMs>=0&&Number.isFinite(value)&&validateShowEasing(draft.easing).valid?{timeMs,value,easing:structuredClone(draft.easing)}:undefined}
export function createShowV2PropertyTrackIntent(tracks:readonly ShowPropertyTrackV2[],target:ShowPropertyTargetV2|undefined,start:string,duration:string,drafts:readonly ShowV2PropertyKeyDraft[],allocate:()=>string):ShowV2PropertyCreatePlan<Extract<ShowPropertyEditIntentV2,{kind:'add-track'}>>{
  const activeStartMs=number(start),activeDurationMs=number(duration),end=activeStartMs+activeDurationMs,keys=drafts.map(authoredKey)
  if(!target||!Number.isSafeInteger(activeStartMs)||activeStartMs<0||!Number.isSafeInteger(activeDurationMs)||activeDurationMs<=0||!Number.isSafeInteger(end)||keys.length<2||keys.some((key,index)=>!key||key.timeMs<activeStartMs||key.timeMs>end||(index>0&&key.timeMs<=keys[index-1]!.timeMs)))return {status:'refused',message:'Give an explicit target, activation and at least two ordered finite keys.'}
  const trackId=allocate(),keyIds=keys.map(()=>allocate())
  if(!id(trackId)||tracks.some(track=>track.id===trackId)||keyIds.some(keyId=>!id(keyId))||new Set(keyIds).size!==keyIds.length)return {status:'refused',message:'The new track and key identities are unavailable.'}
  return {status:'ready',intent:{kind:'add-track',track:{id:trackId,target:structuredClone(target),activeStartMs,activeDurationMs,keyframes:keys.map((key,index)=>({...key!,id:keyIds[index]}))}}}
}
export function createShowV2PropertyKeyIntent(track:ShowPropertyTrackV2,draft:ShowV2PropertyKeyDraft,allocate:()=>string):ShowV2PropertyCreatePlan<Extract<ShowPropertyEditIntentV2,{kind:'add-key'}>>{
  const key=authoredKey(draft);if(!key)return {status:'refused',message:'Give a whole-millisecond key time, finite value and valid easing.'}
  const keyId=allocate();if(!id(keyId)||track.keyframes.some(existing=>existing.id===keyId))return {status:'refused',message:'The new key identity is unavailable.'}
  return {status:'ready',intent:{kind:'add-key',trackId:track.id,key:{...key,id:keyId}}}

}

export interface ShowV2PropertyEasingDraft {
  curve: ShowStructuredEasing['curve']; direction?: string; position?: string
  x1?: string; y1?: string; x2?: string; y2?: string; steps?: string; at?: string; overshoot?: string
}
export function propertyEasingDraft(easing: ShowStructuredEasing): ShowV2PropertyEasingDraft {
  return Object.fromEntries(Object.entries(easing).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value])) as unknown as ShowV2PropertyEasingDraft
}
/** Raw authored coefficients use the validator's full domain, never preset slider bounds. */
export function propertyEasingFromDraft(draft: ShowV2PropertyEasingDraft): ShowStructuredEasing | undefined {
  const numeric = (field: keyof ShowV2PropertyEasingDraft) => number(draft[field] ?? '')
  let easing: unknown
  if (draft.curve === 'linear') easing = { curve: draft.curve }
  else if (draft.curve === 'quadratic' || draft.curve === 'cubic' || draft.curve === 'sine') easing = { curve: draft.curve, direction: draft.direction }
  else if (draft.curve === 'cubic-bezier') easing = { curve: draft.curve, x1: numeric('x1'), y1: numeric('y1'), x2: numeric('x2'), y2: numeric('y2') }
  else if (draft.curve === 'steps') easing = { curve: draft.curve, steps: numeric('steps'), position: draft.position }
  else if (draft.curve === 'hold') easing = { curve: draft.curve, at: numeric('at') }
  else if (draft.curve === 'back') easing = { curve: draft.curve, direction: draft.direction, overshoot: numeric('overshoot') }
  return validateShowEasing(easing).valid ? easing as ShowStructuredEasing : undefined
}

import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { buildShowV2ClipSharingEditorModel, createShowV2IndependentIntent, createShowV2LinkedDuplicateIntent, createShowV2RejoinIntent,
 type ShowV2ClipSharingCapture, type ShowV2ClipSharingIntent, type ShowV2ClipSharingPlan } from '@/engine/showV2ClipSharingEditorModel'
import type { ShowV2PilotAdoptionReceipt } from '@/store/showV2PreparedEditAdmission'
export interface ShowV2ClipSharingSubmission { intent:ShowV2ClipSharingIntent;isCurrent:()=>boolean;onAdopted:(receipt:ShowV2PilotAdoptionReceipt)=>void }
type SubmissionOutcome={status:'applied';settlement:'saved'|'superseded'}|{status:'unchanged'}|{status:'refused';message:string}
interface Props {
 clipId:string;capture:ShowV2ClipSharingCapture;submitSharingEdit:(request:ShowV2ClipSharingSubmission)=>Promise<SubmissionOutcome>
 isCurrentCapture:()=>boolean;isCurrentCompletion:(receipt:ShowV2PilotAdoptionReceipt,phase:'saved'|'save-failed')=>boolean;onStatus:(status:string)=>void
}
const fieldStyle='mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle='border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
/** Intent-only controls; the Route binds shared prepared adoption and persistence. */
export function ShowV2ClipSharingEditor({clipId,capture,submitSharingEdit,isCurrentCapture,isCurrentCompletion,onStatus}:Props) {
 const model=buildShowV2ClipSharingEditorModel(capture,clipId),[zoneId,setZoneId]=useState(''),[layerId,setLayerId]=useState(''),[startMs,setStartMs]=useState(''),[targetId,setTargetId]=useState('')
 const [busy,setBusy]=useState(false),[draftRecord,setDraftRecord]=useState(capture.record),[draftClipId,setDraftClipId]=useState(clipId)
 const pending=useRef(false),live=useRef(true)
 useLayoutEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 const reset=()=>{setZoneId('');setLayerId('');setStartMs('');setTargetId('')}
 if(!busy&&(draftRecord!==capture.record||draftClipId!==clipId)){setDraftRecord(capture.record);setDraftClipId(clipId);reset()}
 const available=!busy&&Boolean(model)&&(capture.inputCapture?.status==='qualified'||(!capture.inputCapture&&capture.prepared.status!=='refused'))
 const submit=async(build:()=>ShowV2ClipSharingPlan)=>{
  if(pending.current||!available||!isCurrentCapture())return
  const plan=build()
  if(plan.status!=='ready'){if(live.current&&isCurrentCapture())onStatus(plan.status==='refused'?plan.message:'Clip sharing is unchanged.');return}
  pending.current=true;setBusy(true)
  const adopted:{current:ShowV2PilotAdoptionReceipt|null}={current:null}
  try{
   const outcome=await submitSharingEdit({intent:plan.intent,isCurrent:()=>live.current&&isCurrentCapture(),onAdopted:receipt=>{adopted.current=receipt}})
   const current=outcome.status==='applied'?adopted.current!==null&&outcome.settlement==='saved'&&isCurrentCompletion(adopted.current,'saved'):isCurrentCapture()
   if(!live.current||!current)return
   onStatus(outcome.status==='refused'?outcome.message:outcome.status==='unchanged'?'Clip sharing is unchanged.':'Clip sharing saved.');reset()
  }catch(error){const current=adopted.current?isCurrentCompletion(adopted.current,'save-failed'):isCurrentCapture();if(live.current&&current){reset();onStatus(error instanceof Error?`Save failed: ${error.message}`:'Save failed.')}}
  finally{pending.current=false;if(live.current)setBusy(false)}
 }
 if(!model)return null
 const target=model.rejoinTargets.find(value=>value.instanceId===targetId)
 return <section aria-label="Pattern sharing" className="mt-7 space-y-3">
  <h2 className="text-sm font-medium text-zinc-200">Pattern sharing</h2>
  <p className="break-words text-xs text-zinc-400">Instance {model.instance.id} · {model.useCount} Clip uses</p>
  <form className="space-y-3" onSubmit={event=>{event.preventDefault();void submit(()=>createShowV2LinkedDuplicateIntent(capture,clipId,{zoneId,layerId,startMs},newPersonalContentId))}}>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="min-w-0 text-xs text-zinc-400">Zone<select aria-label="Duplicate Zone" className={fieldStyle} disabled={!available} value={zoneId} onChange={event=>{setZoneId(event.target.value);setLayerId('')}}><option value="">Choose Zone</option>{model.zones.map(zone=><option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
    <label className="min-w-0 text-xs text-zinc-400">Layer<select aria-label="Duplicate Layer" className={fieldStyle} disabled={!available||!zoneId} value={layerId} onChange={event=>setLayerId(event.target.value)}><option value="">Choose Layer</option>{model.layers.filter(layer=>layer.zoneId===zoneId).map(layer=><option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
   </div>
   <label className="block text-xs text-zinc-400">Start (ms)<input aria-label="Duplicate start" className={fieldStyle} type="text" inputMode="numeric" disabled={!available} value={startMs} onChange={event=>setStartMs(event.target.value)}/></label>
   <p className="text-xs text-zinc-500">Linked Clips share controls, clock and private state.</p>
   <Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available||!zoneId||!layerId||!startMs.trim()}>Duplicate linked Clip</Button>
  </form>
  <Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={!available||model.useCount<=1} onClick={()=>void submit(()=>createShowV2IndependentIntent(capture,clipId,newPersonalContentId))}>Make Pattern Independent</Button>
  <form className="space-y-3" onSubmit={event=>{event.preventDefault();void submit(()=>createShowV2RejoinIntent(capture,clipId,targetId))}}>
   <label className="block text-xs text-zinc-400">Rejoin instance<select aria-label="Rejoin instance" className={fieldStyle} disabled={!available} value={target?.instanceId??''} onChange={event=>setTargetId(event.target.value)}><option value="">Choose Pattern instance</option>{model.rejoinTargets.map(value=><option key={value.instanceId} value={value.instanceId}>{value.patternName} · {value.instanceId} · {value.useCount} Clip uses</option>)}</select></label>
   {target&&<p className="text-xs text-zinc-500">Rejoin uses the chosen instance's state and animation.</p>}
   <Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available||!target}>Rejoin Pattern</Button>
  </form>
 </section>
}

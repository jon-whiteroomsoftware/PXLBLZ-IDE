import type { ShowRecordV2 } from './showCompositionV2'
import type { ShowLayoutEditIntentV2 } from './showLayoutIntervalsV2'
export type ShowV2LayoutEditorIntent = Extract<ShowLayoutEditIntentV2,{kind:'select-layout'|'move'|'remove'|'make-unique'}>
export type ShowV2LayoutEditorRequest = Exclude<ShowV2LayoutEditorIntent,{kind:'make-unique'}> | {kind:'make-unique';occurrenceId:string;name:string}
export function buildShowV2LayoutEditorModel(record:ShowRecordV2) {
 return {layouts:record.zoneLayouts.map(layout=>({id:layout.id,name:layout.name})),occurrences:[...record.composition.layoutOccurrences].sort((a,b)=>a.startMs-b.startMs||a.id.localeCompare(b.id)).map((occurrence,index)=>({id:occurrence.id,layoutId:occurrence.layoutId,name:record.zoneLayouts.find(layout=>layout.id===occurrence.layoutId)!.name,startMs:occurrence.startMs,endMs:occurrence.startMs+occurrence.durationMs,isInitial:index===0,shared:record.composition.layoutOccurrences.filter(value=>value.layoutId===occurrence.layoutId).length>1}))}
}
/** Only allocates definition identity; exact existing owner owns timing and validation. */
export function planShowV2LayoutEdit(record:ShowRecordV2,request:ShowV2LayoutEditorRequest,allocate:()=>string):{status:'ready';intent:ShowV2LayoutEditorIntent}|{status:'refused';message:string} {
 if(!record.composition.layoutOccurrences.some(occurrence=>occurrence.id===request.occurrenceId)) return {status:'refused',message:'Select an existing Layout occurrence.'}
 if(request.kind!=='make-unique') return {status:'ready',intent:structuredClone(request)}
 const layoutId=allocate()
 if(typeof layoutId!=='string'||!layoutId.trim()||record.zoneLayouts.some(layout=>layout.id===layoutId)) return {status:'refused',message:'Fresh Layout identity conflicts. Try the edit again.'}
 return {status:'ready',intent:{...request,layoutId}}
}

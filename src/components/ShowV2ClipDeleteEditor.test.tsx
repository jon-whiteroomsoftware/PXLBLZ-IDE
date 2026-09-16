// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { propertyEditRecord } from '@/test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { ShowV2ClipDeleteEditor, type ShowV2ClipDeleteSubmission } from './ShowV2ClipDeleteEditor'
import type { ShowV2PilotAdoptionReceipt, ShowV2PilotClipDeleteOutcome } from '@/store/showV2PreparedEditAdmission'
const record=propertyEditRecord()
function setup(){
 const capture=captureShowStageEditV2(record,{patterns:[],maps:[],libraries:[],profiles:[],stageMap:null})
 const submit=vi.fn<(request:ShowV2ClipDeleteSubmission)=>Promise<ShowV2PilotClipDeleteOutcome>>()
 const deleted=vi.fn(),status=vi.fn(),receipt:ShowV2PilotAdoptionReceipt={showId:record.id,record,revision:1,provider:getPersonalContentProvider()}
 const current={value:true};const props={capture,clipId:'clip',submitClipDelete:submit,isCurrentCapture:()=>true,isCurrentCompletion:()=>current.value,onDeleted:deleted,onStatus:status}
 return {capture,submit,deleted,status,receipt,props,current,view:render(<ShowV2ClipDeleteEditor {...props}/>)}
}
it('submits one selected ordinary deletion, retains lifetime across optimistic removal and clears only saved selection',async()=>{
 const {submit,deleted,receipt,props,view}=setup();let finish!:(result:ShowV2PilotClipDeleteOutcome)=>void
 submit.mockImplementation(async request=>{request.onAdopted(receipt);return new Promise(resolve=>{finish=resolve})})
 fireEvent.click(screen.getByRole('button',{name:'Delete Clip'}));fireEvent.click(screen.getByRole('button',{name:'Delete Clip'}));expect(submit).toHaveBeenCalledTimes(1);expect(submit.mock.calls[0][0].intent).toEqual({kind:'delete-clip',clipId:'clip'});expect(deleted).not.toHaveBeenCalled()
 view.rerender(<ShowV2ClipDeleteEditor {...props} clipId=""/>);finish({status:'applied',settlement:'saved'} as ShowV2PilotClipDeleteOutcome)
 await waitFor(()=>expect(deleted).toHaveBeenCalledWith('clip'))
})
it.each(['refused','unchanged','superseded','failure','obsolete','unmount'] as const)('never clears selection on %s',async partition=>{
 const {submit,deleted,receipt,current,view}=setup();let finish!:(result:ShowV2PilotClipDeleteOutcome)=>void,fail!:(error:Error)=>void
 submit.mockImplementation(async request=>{request.onAdopted(receipt);return new Promise((resolve,reject)=>{finish=resolve;fail=reject})})
 fireEvent.click(screen.getByRole('button',{name:'Delete Clip'}))
 if(partition==='unmount')view.unmount()
 if(partition==='obsolete')current.value=false
 await act(async()=>{if(partition==='failure')fail(Error('failed'))
 else finish({status:partition==='refused'?'refused':partition==='unchanged'?'unchanged':'applied',settlement:partition==='superseded'?'superseded':'saved',message:'refused'} as unknown as ShowV2PilotClipDeleteOutcome);await Promise.resolve()})
 await waitFor(()=>expect(deleted).not.toHaveBeenCalled())
})
it('does not offer materialized Group children or invoke stale captures',()=>{
 const {submit,props,view}=setup();view.rerender(<ShowV2ClipDeleteEditor {...props} isCurrentCapture={()=>false}/>);fireEvent.click(screen.getByRole('button',{name:'Delete Clip'}));expect(submit).not.toHaveBeenCalled()
 view.rerender(<ShowV2ClipDeleteEditor {...props} clipId="occ-0:child"/>);expect(screen.queryByRole('button',{name:'Delete Clip'})).not.toBeInTheDocument()
})

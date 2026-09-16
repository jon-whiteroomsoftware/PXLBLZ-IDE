import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { showV2LayoutEditorFixture } from '@/test/showV2LayoutEditorFixture'
import { ShowV2LayoutEditor, type ShowV2LayoutSubmission } from './ShowV2LayoutEditor'
function setup(submit=vi.fn(async (_request:ShowV2LayoutSubmission)=>({status:'unchanged' as const})),current=()=>true) {
 const {record,dependencies}=showV2LayoutEditorFixture(),status=vi.fn()
 render(<ShowV2LayoutEditor capture={captureShowStageEditV2(record,dependencies)} submitLayoutEdit={submit} isCurrentCapture={current} isCurrentCompletion={()=>true} onStatus={status}/>);return{record,submit,status}
}
it('selects exact persisted coverage and forwards an unrounded switch draft',async()=>{
 const {submit}=setup(); fireEvent.change(screen.getByLabelText('Layout occurrence'),{target:{value:'later-layout'}})
 expect(screen.getByLabelText('Layout switch (ms)')).toHaveValue('5000')
 fireEvent.change(screen.getByLabelText('Layout switch (ms)'),{target:{value:'6000.5'}});fireEvent.keyDown(screen.getByLabelText('Layout switch (ms)'),{key:'Enter'})
 fireEvent.click(screen.getByRole('button',{name:'Move switch'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));expect(submit.mock.calls[0][0].intent).toEqual({kind:'move',occurrenceId:'later-layout',startMs:6000.5})
})
it.each([['Apply Layout','select-layout'],['Make Layout Unique','make-unique'],['Remove occurrence','remove']] as const)('submits only explicit selected %s',async(label,kind)=>{
 const {submit}=setup();fireEvent.change(screen.getByLabelText('Layout occurrence'),{target:{value:'later-layout'}})
 fireEvent.change(screen.getByLabelText('Layout definition'),{target:{value:'alternate-layout'}});fireEvent.change(screen.getByLabelText('Unique Layout name'),{target:{value:'Solo'}})
 fireEvent.click(screen.getByRole('button',{name:label}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));expect(submit.mock.calls[0][0].intent).toMatchObject({kind,occurrenceId:'later-layout'})
 if(kind==='make-unique') expect(submit.mock.calls[0][0].intent).toHaveProperty('name','Solo')
})
it('keeps first start immovable and preserves draft after failure for retry',async()=>{
 const submit=vi.fn(async (_request:ShowV2LayoutSubmission)=>({status:'unchanged' as const})).mockRejectedValueOnce(Error('offline'));const {record,status}=setup(submit)
 fireEvent.change(screen.getByLabelText('Layout occurrence'),{target:{value:record.composition.layoutOccurrences[0].id}});expect(screen.getByRole('button',{name:'Move switch'})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Layout occurrence'),{target:{value:'later-layout'}});fireEvent.change(screen.getByLabelText('Layout switch (ms)'),{target:{value:'6000'}});fireEvent.keyDown(screen.getByLabelText('Layout switch (ms)'),{key:'Enter'})
 fireEvent.click(screen.getByRole('button',{name:'Move switch'}));await waitFor(()=>expect(status).toHaveBeenCalledWith('Save failed: offline'));expect(screen.getByLabelText('Layout switch (ms)')).toHaveValue('6000')
 fireEvent.click(screen.getByRole('button',{name:'Move switch'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(2))
})
it('guards pending actions and suppresses obsolete feedback',async()=>{
 let done!:(value:{status:'unchanged'})=>void,current=true
 const submit=vi.fn((_request:ShowV2LayoutSubmission)=>new Promise<{status:'unchanged'}>(resolve=>{done=resolve})),{status}=setup(submit,()=>current)
 fireEvent.change(screen.getByLabelText('Layout occurrence'),{target:{value:'later-layout'}});fireEvent.click(screen.getByRole('button',{name:'Remove occurrence'}));fireEvent.click(screen.getByRole('button',{name:'Remove occurrence'}));expect(submit).toHaveBeenCalledTimes(1)
 current=false;done({status:'unchanged'});await waitFor(()=>expect(screen.getByRole('button',{name:'Remove occurrence'})).toBeEnabled());expect(status).not.toHaveBeenCalled()
})

import { useMemo, useState } from 'react'
import { afterEach, beforeEach } from 'vitest'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { admitShowV2PilotLayoutOccurrenceEdit } from '@/store/showV2PreparedEditAdmission'
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState)})
afterEach(()=>resetPersonalContentProvider())
let actualId=0
function actualHarness() {
 const {record,dependencies}=showV2LayoutEditorFixture();record.id=`layout-component-${++actualId}`
 const write=vi.fn(async()=>{});setPersonalContentProvider({...getPersonalContentProvider(),id:'layout-component-provider',replaceShowV2:write})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 function Harness(){const current=useShowStore(state=>state.showV2Pilots[record.id]),[status,setStatus]=useState(''),capture=useMemo(()=>captureShowStageEditV2(current,dependencies),[current])
 return <><ShowV2LayoutEditor capture={capture} submitLayoutEdit={request=>admitShowV2PilotLayoutOccurrenceEdit({showId:record.id,baseRevision:useShowStore.getState().showRevisions[record.id]??0,capture,...request})} isCurrentCapture={()=>useShowStore.getState().showV2Pilots[record.id]===current} isCurrentCompletion={(receipt,phase)=>phase==='saved'?useShowStore.getState().showV2Pilots[record.id]===receipt.record:useShowStore.getState().showV2SaveFailure?.record===receipt.record} onStatus={setStatus}/><output>{status}</output></>}
 render(<Harness/>);return{record,write}
}
it('real parent callback preserves own adopted selection/definition and removal clears it',async()=>{
 const {record,write}=actualHarness();fireEvent.change(screen.getByLabelText('Layout occurrence'),{target:{value:'later-layout'}});fireEvent.change(screen.getByLabelText('Unique Layout name'),{target:{value:'Solo'}});fireEvent.click(screen.getByRole('button',{name:'Make Layout Unique'}));expect(await screen.findByText('Layout saved.')).toBeInTheDocument()
 const current=useShowStore.getState().showV2Pilots[record.id];expect(screen.getByLabelText('Layout occurrence')).toHaveValue('later-layout');expect(screen.getByLabelText('Layout definition')).toHaveValue(current.composition.layoutOccurrences[1].layoutId);expect(current.composition.patternInstances).toEqual(record.composition.patternInstances)
 fireEvent.click(screen.getByRole('button',{name:'Remove occurrence'}));await waitFor(()=>expect(write).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.getByLabelText('Layout occurrence')).toHaveValue(''));expect(useShowStore.getState().showV2Pilots[record.id].composition.layoutOccurrences).toHaveLength(1)
})
it('real current failed save restores history/coverage and retains exact switch draft for retry',async()=>{
 const {record,write}=actualHarness();write.mockRejectedValueOnce(Error('offline'));fireEvent.change(screen.getByLabelText('Layout occurrence'),{target:{value:'later-layout'}});fireEvent.change(screen.getByLabelText('Layout switch (ms)'),{target:{value:'6000'}});fireEvent.keyDown(screen.getByLabelText('Layout switch (ms)'),{key:'Enter'});fireEvent.click(screen.getByRole('button',{name:'Move switch'}))
 expect(await screen.findByText('Save failed: offline')).toBeInTheDocument();expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([]);expect(screen.getByLabelText('Layout switch (ms)')).toHaveValue('6000');fireEvent.click(screen.getByRole('button',{name:'Move switch'}));await waitFor(()=>expect(write).toHaveBeenCalledTimes(2));expect(await screen.findByText('Layout saved.')).toBeInTheDocument()
})

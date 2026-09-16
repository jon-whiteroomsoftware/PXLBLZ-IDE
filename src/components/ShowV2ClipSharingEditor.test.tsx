// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { propertyEditGroupRecord, propertyEditRecord } from '@/test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { ShowV2ClipSharingEditor, type ShowV2ClipSharingSubmission } from './ShowV2ClipSharingEditor'
function setup(group=true) {
 const record=group?propertyEditGroupRecord():propertyEditRecord();record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 const capture=captureShowStageEditV2(record,{patterns:[{id:'voice',name:'Voice',src:'var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null})
 const submit=vi.fn(async(_request:ShowV2ClipSharingSubmission)=>({status:'unchanged' as const})),status=vi.fn()
 const view=render(<ShowV2ClipSharingEditor clipId="clip" capture={capture} submitSharingEdit={submit} isCurrentCapture={()=>true} isCurrentCompletion={()=>true} onStatus={status}/>)
 return {record,capture,submit,status,view}
}
describe('ordinary Clip sharing controls',()=>{
 it('requires explicit duplicate destinations and submits one linked owner intent with complete fresh identities',async()=>{
  const {record,submit}=setup();expect(screen.getByRole('button',{name:'Duplicate linked Clip'})).toBeDisabled()
  expect(screen.getByLabelText('Duplicate Zone')).toHaveValue('');expect(screen.getByLabelText('Duplicate Layer')).toHaveValue('');expect(screen.getByLabelText('Rejoin instance')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('Duplicate Zone'),{target:{value:record.composition.clips[0].zoneId}})
  fireEvent.change(screen.getByLabelText('Duplicate Layer'),{target:{value:record.composition.clips[0].layerId}})
  fireEvent.change(screen.getByLabelText('Duplicate start'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'Duplicate linked Clip'}))
  await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1))
  const {intent}=submit.mock.calls[0][0];expect(intent).toMatchObject({kind:'duplicate',clipId:'clip',startMs:0,zoneId:record.composition.clips[0].zoneId,layerId:record.composition.clips[0].layerId})
  if(intent.kind!=='duplicate')throw Error('Expected linked duplicate')
  expect(intent.identities.clipId).not.toBe('clip');expect(Object.keys(intent.identities.appearanceKeyIdsBySourceId)).toEqual(record.composition.clips[0].appearance.keys.map(key=>key.id));expect(intent.identities.clipTrackIdentitiesBySourceTrackId).toEqual({})
  expect(screen.getByText('Instance instance · 3 Clip uses',{exact:true})).toBeInTheDocument();expect(submit.mock.calls[0][0].isCurrent()).toBe(true)
 })
})
it('allocates an explicit independent runtime for effective Group sharing and never defaults a Rejoin target',async()=>{
 const {submit}=setup();expect(screen.getByRole('button',{name:'Make Pattern Independent'})).toBeEnabled();expect(screen.getByRole('button',{name:'Rejoin Pattern'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'Make Pattern Independent'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1))
 const independent=submit.mock.calls[0][0].intent;expect(independent.kind).toBe('make-independent');if(independent.kind!=='make-independent')throw Error('Missing independence intent')
 expect(independent.independence.instanceId.trim()).not.toBe('');expect(independent.independence.instanceId).not.toBe('instance');expect(independent.independence.identitiesBySourceTrackId).toEqual({})
 fireEvent.change(screen.getByLabelText('Rejoin instance'),{target:{value:'instance'}});fireEvent.click(screen.getByRole('button',{name:'Rejoin Pattern'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(2))
 expect(submit.mock.calls[1][0].intent).toEqual({kind:'rejoin',clipId:'clip',targetInstanceId:'instance'})
})
it('preserves raw invalid time and blocks incomplete destination, sole-user independence and stale callbacks',async()=>{
 const {record,submit,status,view,capture}=setup(false);expect(screen.getByRole('button',{name:'Make Pattern Independent'})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Duplicate Zone'),{target:{value:record.composition.clips[0].zoneId}});fireEvent.change(screen.getByLabelText('Duplicate Layer'),{target:{value:record.composition.clips[0].layerId}});fireEvent.change(screen.getByLabelText('Duplicate start'),{target:{value:'0.5'}});fireEvent.click(screen.getByRole('button',{name:'Duplicate linked Clip'}))
 expect(submit).not.toHaveBeenCalled();expect(screen.getByLabelText('Duplicate start')).toHaveValue('0.5');expect(status).toHaveBeenCalledWith(expect.stringMatching(/integer start/))
 view.rerender(<ShowV2ClipSharingEditor clipId="clip" capture={capture} submitSharingEdit={submit} isCurrentCapture={()=>false} isCurrentCompletion={()=>true} onStatus={status}/>)
 fireEvent.change(screen.getByLabelText('Duplicate start'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'Duplicate linked Clip'}));expect(submit).not.toHaveBeenCalled()
})
it('locks a pending sharing request and retires completion/status after unmount',async()=>{
 const {submit,status,view}=setup();let finish:(value:{status:'unchanged'})=>void=()=>{}
 submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 fireEvent.click(screen.getByRole('button',{name:'Make Pattern Independent'}));fireEvent.click(screen.getByRole('button',{name:'Make Pattern Independent'}));expect(submit).toHaveBeenCalledTimes(1)
 expect(screen.getByRole('button',{name:'Make Pattern Independent'})).toBeDisabled();expect(screen.getByLabelText('Rejoin instance')).toBeDisabled()
 const request=submit.mock.calls[0][0];view.unmount();expect(request.isCurrent()).toBe(false);finish({status:'unchanged'});await Promise.resolve();expect(status).not.toHaveBeenCalled()
})
it('resets explicit destinations and Rejoin choice on selected Clip or authored record replacement',()=>{
 const {record,capture,submit,status,view}=setup();fireEvent.change(screen.getByLabelText('Duplicate Zone'),{target:{value:record.composition.clips[0].zoneId}});fireEvent.change(screen.getByLabelText('Duplicate Layer'),{target:{value:record.composition.clips[0].layerId}});fireEvent.change(screen.getByLabelText('Duplicate start'),{target:{value:'12'}});fireEvent.change(screen.getByLabelText('Rejoin instance'),{target:{value:'instance'}})
 const replacement=captureShowStageEditV2(structuredClone(record),capture.dependencies)
 view.rerender(<ShowV2ClipSharingEditor clipId="clip" capture={replacement} submitSharingEdit={submit} isCurrentCapture={()=>true} isCurrentCompletion={()=>true} onStatus={status}/>)
 expect(screen.getByLabelText('Duplicate Zone')).toHaveValue('');expect(screen.getByLabelText('Duplicate Layer')).toHaveValue('');expect(screen.getByLabelText('Duplicate start')).toHaveValue('');expect(screen.getByLabelText('Rejoin instance')).toHaveValue('')
 view.rerender(<ShowV2ClipSharingEditor clipId="occ-0:child" capture={replacement} submitSharingEdit={submit} isCurrentCapture={()=>true} isCurrentCompletion={()=>true} onStatus={status}/>);expect(screen.queryByRole('region',{name:'Pattern sharing'})).not.toBeInTheDocument()
})

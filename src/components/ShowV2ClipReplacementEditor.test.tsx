// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { propertyEditRecord } from '@/test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { buildShowV2TimelineEditorModel } from '@/engine/showV2TimelineEditorModel'
import { ShowV2ClipReplacementEditor, type ShowV2ClipReplacementSubmission } from './ShowV2ClipReplacementEditor'
function setup(){
 const record=propertyEditRecord();record.composition.patternInstances[0].pattern={kind:'user',id:'voice'};record.composition.patternInstances[0].patternName='Voice'
 const src='var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}'
 const capture=captureShowStageEditV2(record,{patterns:[{id:'voice',name:'Voice',src,controls:{},updatedAt:1},{id:'other',name:'Other',src,controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null})
 const submit=vi.fn(async(_request:ShowV2ClipReplacementSubmission)=>({status:'unchanged' as const})),status=vi.fn()
 const props={clipId:'clip',capture,sources:buildShowV2TimelineEditorModel(capture).sources,submitReplacement:submit,isCurrentCapture:()=>true,isCurrentCompletion:()=>true,onStatus:status}
 return {props,submit,status,view:render(<ShowV2ClipReplacementEditor {...props}/>)}
}
it('requires explicit source and submits only identity/reference through closed replacement boundary',async()=>{
 const {submit}=setup();expect(screen.getByRole('button',{name:'Replace Pattern'})).toBeDisabled();expect(screen.getByRole('combobox',{name:'Replacement Pattern'})).toHaveValue('')
 fireEvent.focus(screen.getByRole('combobox',{name:'Replacement Pattern'}));fireEvent.change(screen.getByRole('combobox',{name:'Replacement Pattern'}),{target:{value:'Other'}});fireEvent.click(screen.getByRole('option',{name:'Other'}));fireEvent.click(screen.getByRole('button',{name:'Replace Pattern'}))
 await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));expect(submit.mock.calls[0][0].intent).toEqual({kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'}});expect(submit.mock.calls[0][0]).not.toHaveProperty('candidate')
})
it('pending operation locks once, and retained submit retires after unmount',async()=>{
 const {submit,status,view}=setup();let finish!:(result:{status:'unchanged'})=>void;submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 fireEvent.focus(screen.getByRole('combobox',{name:'Replacement Pattern'}));fireEvent.change(screen.getByRole('combobox',{name:'Replacement Pattern'}),{target:{value:'Other'}});fireEvent.click(screen.getByRole('option',{name:'Other'}));fireEvent.click(screen.getByRole('button',{name:'Replace Pattern'}));fireEvent.click(screen.getByRole('button',{name:'Replace Pattern'}));expect(submit).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Replace Pattern'})).toBeDisabled()
 const request=submit.mock.calls[0][0];view.unmount();expect(request.isCurrent()).toBe(false);await act(async()=>{finish({status:'unchanged'});await Promise.resolve()});expect(status).not.toHaveBeenCalled()
})
it('stale callbacks write nothing and authored record replacement resets explicit draft',()=>{
 const {submit,props,view}=setup();fireEvent.focus(screen.getByRole('combobox',{name:'Replacement Pattern'}));fireEvent.change(screen.getByRole('combobox',{name:'Replacement Pattern'}),{target:{value:'Other'}});fireEvent.click(screen.getByRole('option',{name:'Other'}))
 view.rerender(<ShowV2ClipReplacementEditor {...props} isCurrentCapture={()=>false}/>);fireEvent.click(screen.getByRole('button',{name:'Replace Pattern'}));expect(submit).not.toHaveBeenCalled()
 view.rerender(<ShowV2ClipReplacementEditor {...props} capture={{...props.capture,record:structuredClone(props.capture.record)}}/>);expect(screen.getByRole('combobox',{name:'Replacement Pattern'})).toHaveValue('');expect(screen.getByRole('button',{name:'Replace Pattern'})).toBeDisabled()
})

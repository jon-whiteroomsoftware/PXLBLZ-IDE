import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { propertyEditGroupRecord, propertyEditTrack } from '@/test/showV2PropertyEditsFixture'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import * as admission from '@/store/showV2PreparedEditAdmission'
import { ShowEditorV2Route } from './ShowEditorV2Route'
vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => <div data-testid="prepared-stage" /> }))
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState); usePatternStore.setState(patternInitialState); useMapStore.setState(mapInitialState); useLibraryStore.setState(libraryInitialState); useControllerProfileStore.setState(controllerProfileInitialState) })
afterEach(() => { resetPersonalContentProvider(); vi.restoreAllMocks() })
let index=0
function setup() {
  const record=propertyEditGroupRecord();record.id=`property-parent-${++index}`
  for(const instance of [...record.composition.patternInstances,...record.composition.groupDefinitions.flatMap(d=>d.patternInstances)])instance.pattern={kind:'user',id:'voice'}
  record.composition.propertyTracks=[propertyEditTrack()]
  usePatternStore.setState({userPatterns:[{id:'voice',name:'Voice',src:'export var elapsed=0;var level=.4;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,x,y)}',controls:{},updatedAt:1}]})
  useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
  const write=vi.fn(async()=>{});setPersonalContentProvider({...getPersonalContentProvider(),id:'property-A',replaceShowV2:write})
  const view=render(<ShowEditorV2Route showId={record.id}/>),editor=within(screen.getByRole('region',{name:'Properties'}))
  fireEvent.change(editor.getByLabelText('Property owner'),{target:{value:'show'}})
  fireEvent.change(editor.getByLabelText('Property track'),{target:{value:'animation'}})
  return {record,write,view,editor}
}
it('real parent delegates exact dirty key patch once and retains all14 affected collections',async()=>{
  const {record,write,editor}=setup(),owner=vi.spyOn(admission,'admitShowV2PilotPropertyEdit')
  fireEvent.change(editor.getByLabelText('Property key'),{target:{value:'left'}});fireEvent.change(editor.getByLabelText('Property key value'),{target:{value:'.35'}})
  fireEvent.click(editor.getByRole('button',{name:'Apply key'}))
  expect(await screen.findByText('Property saved.')).toBeInTheDocument();expect(write).toHaveBeenCalledTimes(1)
  const current=useShowStore.getState().showV2Pilots[record.id]
  expect(current.composition.propertyTracks[0].keyframes[0]).toEqual({...record.composition.propertyTracks[0].keyframes[0],value:.35})
  expect(current.composition.groupDefinitions).toEqual(record.composition.groupDefinitions);expect(current.composition.groupOccurrences).toEqual(record.composition.groupOccurrences)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
  expect(owner.mock.calls[0][0]).toMatchObject({propertyOwner:{kind:'show'},intent:{kind:'update-key',trackId:'animation',keyId:'left',patch:{value:.35}}})
  const outcome=await owner.mock.results[0].value;expect(outcome.status).toBe('applied')
  if(outcome.status==='applied')expect(Object.keys(outcome).filter(key=>key.endsWith('Ids')||key==='discardedControlTargets')).toHaveLength(14)
})
it('untouched Apply and malformed activation refuse or no-op without write/history',async()=>{
  const {record,write,editor}=setup()
  fireEvent.click(editor.getByRole('button',{name:'Apply track'}));expect(await screen.findByText('Property is unchanged.')).toBeInTheDocument()
  fireEvent.change(editor.getByLabelText('Property activation duration'),{target:{value:'-1'}});fireEvent.click(editor.getByRole('button',{name:'Apply track'}))
  await waitFor(()=>expect(editor.getByLabelText('Property activation duration')).toHaveValue('1000'))
  expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
it('retained parent callback rejects provider change before invocation, fresh capture works',async()=>{
  const {record,write,view,editor}=setup(),other=vi.fn(async()=>{}),owner=vi.spyOn(admission,'admitShowV2PilotPropertyEdit')
  fireEvent.change(editor.getByLabelText('Property key'),{target:{value:'left'}});fireEvent.change(editor.getByLabelText('Property key value'),{target:{value:'.35'}})
  setPersonalContentProvider({...getPersonalContentProvider(),id:'property-B',replaceShowV2:other})
  fireEvent.click(editor.getByRole('button',{name:'Apply key'}));await waitFor(()=>expect(owner).toHaveBeenCalledTimes(1))
  expect(await owner.mock.results[0].value).toMatchObject({status:'refused',code:'stale-edit'});expect(write).not.toHaveBeenCalled();expect(other).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  view.rerender(<ShowEditorV2Route showId={record.id}/>);fireEvent.click(editor.getByRole('button',{name:'Apply key'}))
  expect(await screen.findByText('Property saved.')).toBeInTheDocument();expect(other).toHaveBeenCalledTimes(1)
})
it('pending save disables repeats and owned failure restores exact current key/history',async()=>{
  const {record,write,editor}=setup();let reject!:(error:Error)=>void
  const pending=new Promise<void>((_resolve,fail)=>{reject=fail});write.mockImplementation(()=>pending)
  fireEvent.change(editor.getByLabelText('Property key'),{target:{value:'left'}});fireEvent.change(editor.getByLabelText('Property key value'),{target:{value:'.5'}});fireEvent.click(editor.getByRole('button',{name:'Apply key'}))
  await waitFor(()=>expect(write).toHaveBeenCalledTimes(1));expect(editor.getByRole('button',{name:'Apply key'})).toBeDisabled();fireEvent.click(editor.getByRole('button',{name:'Apply key'}));expect(write).toHaveBeenCalledTimes(1)
  await act(async()=>{reject(Error('offline'));await pending.catch(()=>{})})
  expect(await screen.findByText('Save failed: offline')).toBeInTheDocument();fireEvent.change(editor.getByLabelText('Property key'),{target:{value:'left'}});expect(editor.getByLabelText('Property key value')).toHaveValue('0.2');expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
it.each(['Pattern','Map','Library','profile','provider','route','unmount'] as const)('obsolete Property completion after %s cannot publish saved feedback',async partition=>{
  const {record,write,view,editor}=setup();let release!:()=>void
  const pending=new Promise<void>(resolve=>{release=resolve});write.mockImplementation(()=>pending)
  fireEvent.change(editor.getByLabelText('Property key'),{target:{value:'left'}});fireEvent.change(editor.getByLabelText('Property key value'),{target:{value:'.35'}});fireEvent.click(editor.getByRole('button',{name:'Apply key'}));await waitFor(()=>expect(write).toHaveBeenCalledTimes(1))
  act(()=>{
    if(partition==='Pattern')usePatternStore.setState({userPatterns:[...usePatternStore.getState().userPatterns]})
    if(partition==='Map')useMapStore.setState({userMaps:[]})
    if(partition==='Library')useLibraryStore.setState({userLibraries:[]})
    if(partition==='profile')useControllerProfileStore.setState({profiles:[]})
    if(partition==='provider')setPersonalContentProvider({...getPersonalContentProvider(),id:'property-B'})
    if(partition==='route'){useShowStore.setState({showV2Pilots:{...useShowStore.getState().showV2Pilots,other:{...record,id:'other'}}});view.rerender(<ShowEditorV2Route showId="other"/>)}
    if(partition==='unmount')view.unmount()
  })
  await act(async()=>{release();await pending});expect(screen.queryByText('Property saved.')).not.toBeInTheDocument()
})

it('explicit definition owner writes local track once while every linked binding and Show track stays exact',async()=>{
 const {record,write,editor}=setup()
 fireEvent.change(editor.getByLabelText('Property owner'),{target:{value:'group:definition'}});fireEvent.click(editor.getByRole('button',{name:'New track'}))
 fireEvent.change(editor.getByLabelText('Property target'),{target:{value:JSON.stringify({kind:'clip-view',clipId:'child',property:'brightness'})}})
 fireEvent.change(editor.getByLabelText('Property activation start'),{target:{value:'0'}});fireEvent.change(editor.getByLabelText('Property activation duration'),{target:{value:'400'}})
 for(const [index,time,value] of [[1,'0','.3'],[2,'400','.8']] as const){fireEvent.change(editor.getByLabelText(`New key ${index} time`),{target:{value:time}});fireEvent.change(editor.getByLabelText(`New key ${index} value`),{target:{value}})}
 fireEvent.click(editor.getByRole('button',{name:'Create track'}));expect(await screen.findByText('Property saved.')).toBeInTheDocument();expect(write).toHaveBeenCalledTimes(1)
 const current=useShowStore.getState().showV2Pilots[record.id]
 expect(current.composition.groupDefinitions[0].propertyTracks[0].target).toEqual({kind:'clip-view',clipId:'child',property:'brightness'})
 expect(current.composition.groupOccurrences).toEqual(record.composition.groupOccurrences);expect(current.composition.patternInstances).toEqual(record.composition.patternInstances);expect(current.composition.propertyTracks).toEqual(record.composition.propertyTracks)
 expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
})

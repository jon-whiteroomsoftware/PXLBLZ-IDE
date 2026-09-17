import {useMemo,useState} from 'react'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {convertShowRecordV1ToV2} from '@/engine/showRecordV1ToV2'
import {convertibleV1Show} from '@/test/showV2TracerFixture'
import {prepareShowStageV2} from '@/engine/showPreparedStageV2'
import {buildShowV2TimelineEditorModel} from '@/engine/showV2TimelineEditorModel'
import {getPersonalContentProvider,resetPersonalContentProvider,setPersonalContentProvider} from '@/engine/personalContentProvider'
import {showInitialState,useShowStore} from '@/store/showStore'
import {parseProvisionalShowRecordV2,serializeProvisionalShowRecordV2} from '@/engine/showCompositionV2'
import {ShowV2AddClipEditor} from './ShowV2AddClipEditor'
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState)})
afterEach(()=>resetPersonalContentProvider())
function setup(matches=0){
 const converted=convertShowRecordV1ToV2(convertibleV1Show());if(converted.status!=='converted')throw Error('convert');const record=converted.record
 record.composition.clips=record.composition.clips.slice(0,1);record.composition.transitions=[];record.composition.propertyTracks=[];record.composition.clips[0].durationMs=10000;record.composition.showEndMs=30000;record.composition.layoutOccurrences[0].durationMs=30000
 record.composition.patternInstances=record.composition.patternInstances.filter(i=>i.id===record.composition.clips[0].instanceId);record.composition.patternInstances[0].pattern={kind:'user',id:'old'}
 const fresh=()=>({...structuredClone(record.composition.patternInstances[0]),id:'fresh1',pattern:{kind:'user' as const,id:'fresh'},patternName:'Fresh Voice'})
 for(let index=0;index<matches;index++)record.composition.patternInstances.push({...fresh(),id:`fresh${index+1}`})
 const dependencies={patterns:[{id:'old',name:'Old Voice',src:'export function render2D(i,x,y){rgb(x,y,0)}',controls:{},updatedAt:1},{id:'fresh',name:'Fresh Voice',src:'export var elapsed=0;export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(x,y,elapsed/100000)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null}
 const write=vi.fn(async()=>{});setPersonalContentProvider({...getPersonalContentProvider(),id:'runtime-choice',replaceShowV2:write});useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 function Harness(){const current=useShowStore(s=>s.showV2Pilots[record.id]);const[,setSelected]=useState('');const[status,setStatus]=useState('');const capture=useMemo(()=>({record:current,dependencies,prepared:prepareShowStageV2(current,dependencies)}),[current]);const model=buildShowV2TimelineEditorModel(capture);return <><ShowV2AddClipEditor capture={capture} sources={model.sources} onCreated={setSelected} isCurrentCapture={()=>useShowStore.getState().showV2Pilots[record.id]===current} isCurrentCompletion={receipt=>useShowStore.getState().showV2Pilots[record.id]===receipt.record} onStatus={setStatus}/><output>{status}</output></>}
 expect(prepareShowStageV2(record,dependencies).status).toBe('ready');render(<Harness/>);return{record,write,fresh}
}
function number(label:string,value:string){fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.keyDown(screen.getByLabelText(label),{key:'Enter'})}
function chooseSource(){fireEvent.click(screen.getByRole('button',{name:'Add Clip'}));fireEvent.focus(screen.getByRole('combobox',{name:'Clip Pattern'}));fireEvent.change(screen.getByRole('combobox',{name:'Clip Pattern'}),{target:{value:'Fresh Voice'}});fireEvent.click(screen.getByRole('option',{name:'Fresh Voice'}))}
async function addAt(start:number,count:number,write:ReturnType<typeof vi.fn>){number('New Clip start',String(start));number('New Clip duration','4000');fireEvent.click(screen.getByRole('button',{name:'Add'}));await waitFor(()=>expect(write).toHaveBeenCalledTimes(count));await waitFor(()=>expect(screen.queryByRole('combobox',{name:'Clip runtime'})).not.toBeInTheDocument())}
it('reopens first-created source and saves a second Clip on its exact sole shared runtime',async()=>{
 const{record,write}=setup();chooseSource();expect(screen.getByRole('combobox',{name:'Clip runtime'})).toHaveValue('first');await addAt(12000,1,write)
 const first=useShowStore.getState().showV2Pilots[record.id];const instance=first.composition.patternInstances.find(i=>i.pattern.id==='fresh')!;expect(instance).toBeDefined();expect(first.composition.patternInstances).toHaveLength(2)
 fireEvent.click(screen.getByRole('button',{name:'Add Clip'}));expect(screen.getByRole('combobox',{name:'Clip runtime'})).toHaveValue(`runtime:${instance.id}`);await addAt(16000,2,write)
 const result=useShowStore.getState().showV2Pilots[record.id];expect(result.composition.patternInstances).toEqual(first.composition.patternInstances);expect(result.composition.clips.filter(c=>c.instanceId===instance.id).map(c=>[c.startMs,c.durationMs])).toEqual([[12000,4000],[16000,4000]]);expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(2);expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result)).status).toBe('opened')
})
it('clears an automatic sole choice when fresh capture has several matches and retains a user-explicit choice on reopen',async()=>{
 const{record,write,fresh}=setup(1);chooseSource();expect(screen.getByRole('combobox',{name:'Clip runtime'})).toHaveValue('runtime:fresh1')
 await act(async()=>{const next=structuredClone(useShowStore.getState().showV2Pilots[record.id]);next.composition.patternInstances.push({...fresh(),id:'fresh2'});useShowStore.setState({showV2Pilots:{[record.id]:next}})})
 expect(screen.getByRole('combobox',{name:'Clip runtime'})).toHaveValue('');expect(screen.getByRole('button',{name:'Add'})).toBeDisabled();expect(write).not.toHaveBeenCalled()
 fireEvent.change(screen.getByRole('combobox',{name:'Clip runtime'}),{target:{value:'runtime:fresh2'}});await addAt(12000,1,write);fireEvent.click(screen.getByRole('button',{name:'Add Clip'}));expect(screen.getByRole('combobox',{name:'Clip runtime'})).toHaveValue('runtime:fresh2');await addAt(16000,2,write);expect(useShowStore.getState().showV2Pilots[record.id].composition.clips.slice(1).map(c=>c.instanceId)).toEqual(['fresh2','fresh2'])
})
it('requires an explicit choice for initial multiple matches and clears it when that runtime disappears',async()=>{
 const{record,write}=setup(3);chooseSource();expect(screen.getByRole('combobox',{name:'Clip runtime'})).toHaveValue('');expect(screen.getByRole('button',{name:'Add'})).toBeDisabled();fireEvent.change(screen.getByRole('combobox',{name:'Clip runtime'}),{target:{value:'runtime:fresh2'}})
 await act(async()=>{const next=structuredClone(useShowStore.getState().showV2Pilots[record.id]);next.composition.patternInstances=next.composition.patternInstances.filter(i=>i.id!=='fresh2');useShowStore.setState({showV2Pilots:{[record.id]:next}})})
 expect(screen.getByRole('combobox',{name:'Clip runtime'})).toHaveValue('');expect(screen.getByRole('button',{name:'Add'})).toBeDisabled();expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

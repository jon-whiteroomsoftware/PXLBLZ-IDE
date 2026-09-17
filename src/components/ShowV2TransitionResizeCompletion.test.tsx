import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import {convertShowRecordV1ToV2} from '@/engine/showRecordV1ToV2'
import {transitionV1Show} from '@/test/showV2TracerFixture'
import {getPersonalContentProvider,resetPersonalContentProvider,setPersonalContentProvider} from '@/engine/personalContentProvider'
import {showInitialState,useShowStore} from '@/store/showStore'
import {patternInitialState,usePatternStore} from '@/store/patternStore'
import {mapInitialState,useMapStore} from '@/store/mapStore'
import {libraryInitialState,useLibraryStore} from '@/store/libraryStore'
import {controllerProfileInitialState,useControllerProfileStore} from '@/store/controllerProfileStore'
import {ShowEditorV2Route} from './ShowEditorV2Route'
vi.mock('./ShowStagePreview',()=>({ShowStagePreview:()=> <div data-testid="prepared-stage"/>}))
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState);usePatternStore.setState(patternInitialState);useMapStore.setState(mapInitialState);useLibraryStore.setState(libraryInitialState);useControllerProfileStore.setState(controllerProfileInitialState)})
let fixtureIndex=0
function setup(){
 const converted=convertShowRecordV1ToV2(transitionV1Show('crossfade'));if(converted.status!=='converted')throw Error('Fixture refused')
 const record=converted.record;record.id=`transition-completion-${++fixtureIndex}`
 for(const instance of record.composition.patternInstances) instance.pattern={kind:'user',id:'voice'}
 usePatternStore.setState({userPatterns:[{id:'voice',name:'Voice',src:'export function render2D(i,x,y){rgb(x,y,0)}',controls:{},updatedAt:1}]})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 let release!:()=>void;let reject!:(e:Error)=>void
 const pending=new Promise<void>((resolve,fail)=>{release=resolve;reject=fail})
 const write=vi.fn(()=>pending);setPersonalContentProvider({...getPersonalContentProvider(),id:'resize-completion',replaceShowV2:write})
 return {record,write,pending,release,reject}
}
/** The editor selects the drawn boundary, then resizes it in seconds. */
function selectBoundary(){fireEvent.click(screen.getByRole('button',{name:/^crossfade Transition on Layer/}))}
function duration(){return screen.getByLabelText('Transition duration exact time')}
function resize(){selectBoundary();fireEvent.change(duration(),{target:{value:'0.1'}});fireEvent.keyDown(duration(),{key:'Enter'})}
it('suppresses obsolete resize saved status after external replacement while persistence awaits',async()=>{
 const {record,write,pending,release}=setup();render(<ShowEditorV2Route showId={record.id}/>);resize()
 await waitFor(()=>expect(write).toHaveBeenCalledTimes(1))
 const adopted=useShowStore.getState().showV2Pilots[record.id];const external={...adopted,name:'External'}
 act(()=>useShowStore.setState({showV2Pilots:{[record.id]:external},showRevisions:{[record.id]:2}}))
 await act(async()=>{release();await pending})
 expect(screen.queryByText('Transition duration saved.')).not.toBeInTheDocument()
 expect(useShowStore.getState().showV2Pilots[record.id]).toBe(external)
})

it('keeps normal saved duration/status across own recapture and serializes repeated pending resize',async()=>{
 const {record,write,pending,release}=setup();render(<ShowEditorV2Route showId={record.id}/>);resize()
 await waitFor(()=>expect(write).toHaveBeenCalledTimes(1))
 expect(duration()).toBeDisabled()
 resize();expect(write).toHaveBeenCalledTimes(1)
 await act(async()=>{release();await pending})
 expect(await screen.findByText('Transition duration saved.')).toBeInTheDocument()
 expect(duration()).toHaveValue('0.1')
 expect(duration()).not.toBeDisabled()
 expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
})
it('restores own rejected resize draft through existing durable rollback',async()=>{
 const {record,write,pending,reject}=setup();render(<ShowEditorV2Route showId={record.id}/>);resize()
 await waitFor(()=>expect(write).toHaveBeenCalledTimes(1))
 await act(async()=>{reject(Error('offline'));await pending.catch(()=>{})})
 expect(await screen.findByText('Save failed: offline')).toBeInTheDocument()
 expect(duration()).toHaveValue('0.2')
 expect(useShowStore.getState().showV2Pilots[record.id].composition).toEqual(record.composition)
 expect(useShowStore.getState().showV2Histories[record.id]).toEqual({past:[],future:[]})
})
it.each(['Pattern','Map','Library','profile','provider','revision','navigation','unmount'] as const)('retires resize completion after%s replacement',async partition=>{
 const {record,write,pending,release}=setup();const view=render(<ShowEditorV2Route showId={record.id}/>);resize()
 await waitFor(()=>expect(write).toHaveBeenCalledTimes(1))
 act(()=>{switch(partition){
 case 'Pattern':usePatternStore.setState({userPatterns:[]});break
 case 'Map':useMapStore.setState({userMaps:[]});break
 case 'Library':useLibraryStore.setState({userLibraries:[]});break
 case 'profile':useControllerProfileStore.setState({profiles:[]});break
 case 'provider':setPersonalContentProvider({...getPersonalContentProvider(),id:'External'});break
 case 'revision':useShowStore.setState({showRevisions:{[record.id]:2}});break
 case 'navigation':view.rerender(<ShowEditorV2Route showId="external-show"/>);break
 case 'unmount':view.unmount();break
 }})
 await act(async()=>{release();await pending})
 expect(screen.queryByText('Transition duration saved.')).not.toBeInTheDocument()
})

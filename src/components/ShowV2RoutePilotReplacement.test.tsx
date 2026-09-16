import { render } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { ShowV2ClipReplacementEditor } from './ShowV2ClipReplacementEditor'
import { ShowV2RoutePilot } from './ShowV2RoutePilot'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { showInitialState, useShowStore } from '../store/showStore'
import { patternInitialState, usePatternStore } from '../store/patternStore'
import { mapInitialState, useMapStore } from '../store/mapStore'
import { libraryInitialState, useLibraryStore } from '../store/libraryStore'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
const retained=vi.hoisted(()=>({props:null as ComponentProps<typeof ShowV2ClipReplacementEditor>|null}))
vi.mock('./ShowV2ClipReplacementEditor',()=>({ShowV2ClipReplacementEditor:(props:ComponentProps<typeof ShowV2ClipReplacementEditor>)=>{retained.props=props;return null}}))
vi.mock('./ShowStagePreview',()=>({ShowStagePreview:()=>null}))
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState);usePatternStore.setState(patternInitialState);useMapStore.setState(mapInitialState);useLibraryStore.setState(libraryInitialState);retained.props=null})
let serial=0
function setup(){
 const record=propertyEditGroupRecord();record.id=`route-sharing-${++serial}`;record.composition.clips[0].durationMs=200;record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 usePatternStore.setState({userPatterns:[{id:'voice',name:'Voice',src:'var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}',controls:{},updatedAt:1},{id:'other',name:'Other',src:'var gain=.9;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(0,gain,y)}',controls:{},updatedAt:1}]})
 const write=vi.fn(async(_id:string,_next:ShowRecordV2)=>{});setPersonalContentProvider({...getPersonalContentProvider(),id:'sharing-A',replaceShowV2:write})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const view=render(<ShowV2RoutePilot showId={record.id}/>),props=retained.props;if(!props)throw Error('Missing selected ordinary deletion mount')
 const submit=()=>props.submitReplacement({intent:{kind:'replace-pattern',clipId:'clip',patternReference:{kind:'user',id:'other'},independence:{instanceId:'fresh',identitiesBySourceTrackId:{}}},isCurrent:props.isCurrentCapture,onAdopted:vi.fn()})
 return {record,write,view,props,submit}
}
it('actual Route replacement callback adopts once with trusted metadata and native history',async()=>{
 const {record,write,submit}=setup();const outcome=await submit();expect(outcome).toMatchObject({status:'applied',settlement:'saved',affectedClipIds:['clip'],affectedInstanceIds:['fresh']})
 expect(write).toHaveBeenCalledTimes(1);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record]);expect(useShowStore.getState().showV2Pilots[record.id].composition.groupOccurrences).toEqual(record.composition.groupOccurrences)
})
it.each(['provider','dependency','unmount'] as const)('retained real parent replacement callback refuses %s replacement without writes/history',async partition=>{
 const {record,write,view,submit}=setup()
 if(partition==='provider')setPersonalContentProvider({...getPersonalContentProvider(),id:'sharing-B'})
 if(partition==='dependency')usePatternStore.setState({userPatterns:[...usePatternStore.getState().userPatterns]})
 if(partition==='unmount')view.unmount()
 expect(await submit()).toMatchObject({status:'refused',code:'stale-edit'});expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

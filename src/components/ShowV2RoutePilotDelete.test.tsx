import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { ShowV2ClipDeleteEditor } from './ShowV2ClipDeleteEditor'
import { ShowV2RoutePilot } from './ShowV2RoutePilot'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { showInitialState, useShowStore } from '../store/showStore'
import { patternInitialState, usePatternStore } from '../store/patternStore'
import { mapInitialState, useMapStore } from '../store/mapStore'
import { libraryInitialState, useLibraryStore } from '../store/libraryStore'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
const retained=vi.hoisted(()=>({props:null as ComponentProps<typeof ShowV2ClipDeleteEditor>|null}))
vi.mock('./ShowV2ClipDeleteEditor',()=>({ShowV2ClipDeleteEditor:(props:ComponentProps<typeof ShowV2ClipDeleteEditor>)=>{retained.props=props;return null}}))
vi.mock('./ShowStagePreview',()=>({ShowStagePreview:()=>null}))
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState);usePatternStore.setState(patternInitialState);useMapStore.setState(mapInitialState);useLibraryStore.setState(libraryInitialState);retained.props=null})
let serial=0
function setup(){
 const record=propertyEditGroupRecord();record.id=`route-sharing-${++serial}`;record.composition.clips[0].durationMs=200;record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 usePatternStore.setState({userPatterns:[{id:'voice',name:'Voice',src:'var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}',controls:{},updatedAt:1}]})
 const write=vi.fn(async(_id:string,_next:ShowRecordV2)=>{});setPersonalContentProvider({...getPersonalContentProvider(),id:'sharing-A',replaceShowV2:write})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const view=render(<ShowV2RoutePilot showId={record.id}/>),props=retained.props;if(!props)throw Error('Missing selected ordinary deletion mount')
 const submit=()=>props.submitClipDelete({intent:{kind:'delete-clip',clipId:'clip'},isCurrent:props.isCurrentCapture,onAdopted:vi.fn()})
 return {record,write,view,props,submit}
}
it('actual Route deletion callback adopts exactly once with complete fresh key reports and native history',async()=>{
 const {record,write,submit}=setup();const outcome=await submit();expect(outcome).toMatchObject({status:'applied',settlement:'saved',affectedClipIds:['clip'],affectedAppearanceKeyIds:record.composition.clips[0].appearance.keys.map(key=>key.id)})
 expect(write).toHaveBeenCalledTimes(1);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record]);expect(useShowStore.getState().showV2Pilots[record.id].composition.groupOccurrences).toEqual(record.composition.groupOccurrences)
})
it.each(['provider','dependency','unmount'] as const)('retained real parent deletion callback refuses %s replacement without writes/history',async partition=>{
 const {record,write,view,submit}=setup()
 if(partition==='provider')setPersonalContentProvider({...getPersonalContentProvider(),id:'sharing-B'})
 if(partition==='dependency')usePatternStore.setState({userPatterns:[...usePatternStore.getState().userPatterns]})
 if(partition==='unmount')view.unmount()
 expect(await submit()).toMatchObject({status:'refused',code:'stale-edit'});expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('current saved deletion clears only its obsolete selected identity, preserving a newer explicit selection',()=>{
 const {record,view}=setup();const second={...structuredClone(record.composition.clips[0]),id:'later',startMs:600,appearance:{keys:[{...structuredClone(record.composition.clips[0].appearance.keys[0]),id:'later-appearance',timeMs:600}]}}
 act(()=>useShowStore.setState({showV2Pilots:{[record.id]:{...record,composition:{...record.composition,clips:[record.composition.clips[0],second]}}}}))
 const first=retained.props;if(!first)throw Error('mount')
 const later=screen.getByTestId('show-v2-timeline').querySelector<HTMLButtonElement>('button[aria-label$="600–800 ms"]');if(!later)throw Error('later selection')
 fireEvent.click(later);expect(later).toHaveAttribute('aria-pressed','true')
 act(()=>first.onDeleted('clip'));expect(later).toHaveAttribute('aria-pressed','true')
 const current=retained.props;if(!current)throw Error('current')
 act(()=>current.onDeleted('later'));expect(later).toHaveAttribute('aria-pressed','false');view.unmount()
})

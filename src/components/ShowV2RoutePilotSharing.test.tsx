import { render } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { ShowV2ClipSharingEditor } from './ShowV2ClipSharingEditor'
import { ShowV2RoutePilot } from './ShowV2RoutePilot'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { showInitialState, useShowStore } from '../store/showStore'
import { patternInitialState, usePatternStore } from '../store/patternStore'
import { mapInitialState, useMapStore } from '../store/mapStore'
import { libraryInitialState, useLibraryStore } from '../store/libraryStore'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { createShowV2LinkedDuplicateIntent } from '../engine/showV2ClipSharingEditorModel'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
const retained=vi.hoisted(()=>({props:null as ComponentProps<typeof ShowV2ClipSharingEditor>|null}))
vi.mock('./ShowV2ClipSharingEditor',()=>({ShowV2ClipSharingEditor:(props:ComponentProps<typeof ShowV2ClipSharingEditor>)=>{retained.props=props;return null}}))
vi.mock('./ShowStagePreview',()=>({ShowStagePreview:()=>null}))
beforeEach(()=>{resetPersonalContentProvider();useShowStore.setState(showInitialState);usePatternStore.setState(patternInitialState);useMapStore.setState(mapInitialState);useLibraryStore.setState(libraryInitialState);retained.props=null})
let serial=0
function setup(){
 const record=propertyEditGroupRecord();record.id=`route-sharing-${++serial}`;record.composition.clips[0].durationMs=200;record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 usePatternStore.setState({userPatterns:[{id:'voice',name:'Voice',src:'var gain=.4;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(gain,x,y)}',controls:{},updatedAt:1}]})
 const write=vi.fn(async(_id:string,_next:ShowRecordV2)=>{});setPersonalContentProvider({...getPersonalContentProvider(),id:'sharing-A',replaceShowV2:write})
 useShowStore.setState({showV2Pilots:{[record.id]:record},showV2Histories:{[record.id]:{past:[],future:[]}}})
 const view=render(<ShowV2RoutePilot showId={record.id}/>),props=retained.props;if(!props)throw Error('Missing selected ordinary sharing mount')
 let n=0;const clip=record.composition.clips[0],plan=createShowV2LinkedDuplicateIntent(props.capture,'clip',{zoneId:clip.zoneId,layerId:clip.layerId,startMs:'200'},()=>`route-copy-${++n}`);if(plan.status!=='ready')throw Error('plan')
 const submit=()=>props.submitSharingEdit({intent:plan.intent,isCurrent:props.isCurrentCapture,onAdopted:vi.fn()})
 return {record,write,view,props,submit}
}
it('actual Route sharing callback adopts exactly once with complete fresh key reports and native history',async()=>{
 const {record,write,submit}=setup();const outcome=await submit();expect(outcome).toMatchObject({status:'applied',settlement:'saved',affectedClipIds:['route-copy-1'],affectedAppearanceKeyIds:['route-copy-2']})
 expect(write).toHaveBeenCalledTimes(1);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record]);expect(useShowStore.getState().showV2Pilots[record.id].composition.groupOccurrences).toEqual(record.composition.groupOccurrences)
})
it.each(['provider','dependency','unmount'] as const)('retained real parent sharing callback refuses %s replacement without writes/history',async partition=>{
 const {record,write,view,submit}=setup()
 if(partition==='provider')setPersonalContentProvider({...getPersonalContentProvider(),id:'sharing-B'})
 if(partition==='dependency')usePatternStore.setState({userPatterns:[...usePatternStore.getState().userPatterns]})
 if(partition==='unmount')view.unmount()
 expect(await submit()).toMatchObject({status:'refused',code:'stale-edit'});expect(write).not.toHaveBeenCalled();expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record);expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

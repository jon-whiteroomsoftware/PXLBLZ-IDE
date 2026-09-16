// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { propertyEditGroupRecord, propertyEditRecord } from '@/test/showV2PropertyEditsFixture'
import { ShowV2PropertyEditor, type ShowV2PropertySubmission } from './ShowV2PropertyEditor'
import type { ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'
function setup(group=false) {
 const record=group?propertyEditGroupRecord():propertyEditRecord()
 record.composition.patternInstances[0].pattern={kind:'user',id:'voice'}
 const capture:ShowV2PilotPreparedCapture={record,dependencies:{patterns:[{id:'voice',name:'Voice',src:'export function sliderGain(v){} export function render2D(i,x,y){rgb(x,y,0)}',controls:{},updatedAt:1}],maps:[],libraries:[],profiles:[],stageMap:null},prepared:{status:'empty',record}}
 const submit=vi.fn(async(_request:ShowV2PropertySubmission)=>({status:'unchanged' as const})),status=vi.fn()
 const view=render(<ShowV2PropertyEditor capture={capture} isCurrentCapture={()=>true} isCurrentCompletion={()=>true} submitPropertyEdit={submit} onStatus={status} />)
 return {record,capture,submit,status,view}
}
function owner(){fireEvent.change(screen.getByLabelText('Property owner'),{target:{value:'show'}})}
describe('native explicit Property panel',()=>{
 it('starts unselected and emits only dirty exact activation patches, preserving keys and easing',async()=>{
  const {record,submit}=setup();record.composition.propertyTracks=[{id:'track',target:{clipId:'clip',kind:'clip-opacity'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'a',timeMs:0,value:.2,easing:{curve:'cubic-bezier',x1:.2,y1:9,x2:.8,y2:-9}},{id:'b',timeMs:1000,value:.8,easing:{curve:'linear'}}]}]
  expect(screen.getByLabelText('Property track')).toBeDisabled();owner();fireEvent.change(screen.getByLabelText('Property track'),{target:{value:'track'}})
  expect(screen.getByLabelText('Property target')).toHaveValue(JSON.stringify({kind:'clip-opacity',clipId:'clip'}))
  fireEvent.change(screen.getByLabelText('Property activation duration'),{target:{value:'1200'}});fireEvent.click(screen.getByRole('button',{name:'Apply track'}))
  await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));expect(submit.mock.calls[0][0]).toMatchObject({propertyOwner:{kind:'show'},intent:{kind:'update-track',trackId:'track',patch:{activeDurationMs:1200}}})
 })
 it('preserves custom easing when editing only a key value and shows retained-curve consequences',async()=>{
  const {record,submit}=setup();record.composition.propertyTracks=[{id:'track',target:{kind:'clip-opacity',clipId:'clip'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'a',timeMs:0,value:.2,easing:{curve:'cubic-bezier',x1:.2,y1:9,x2:.8,y2:-9},curveSegment:{baseValue:.1,deltaValue:.7,easing:{curve:'quadratic',direction:'in'},sourceDurationMs:1000,elapsedOffsetMs:0}},{id:'b',timeMs:1000,value:.8,easing:{curve:'linear'}}]}]
  owner();fireEvent.change(screen.getByLabelText('Property track'),{target:{value:'track'}});fireEvent.change(screen.getByLabelText('Property key'),{target:{value:'a'}})
  expect(screen.getByLabelText('Key Control 1 Y')).toHaveValue('9');expect(screen.getByText(/retained curve/i)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Property key value'),{target:{value:'.3'}});fireEvent.click(screen.getByRole('button',{name:'Apply key'}))
  await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));expect(submit.mock.calls[0][0]).toMatchObject({intent:{kind:'update-key',trackId:'track',keyId:'a',patch:{value:.3}}})
 })
 it('creates complete track identities once and sends raw invalid drafts to no write',async()=>{
  const {submit,status}=setup();owner();fireEvent.click(screen.getByRole('button',{name:'New track'}))
  fireEvent.change(screen.getByLabelText('Property target'),{target:{value:JSON.stringify({kind:'clip-opacity',clipId:'clip'})}})
  fireEvent.change(screen.getByLabelText('Property activation start'),{target:{value:'0'}});fireEvent.change(screen.getByLabelText('Property activation duration'),{target:{value:'1000'}})
  for(const [index,time,value] of [[1,'0','.2'],[2,'1000','.8']] as const){fireEvent.change(screen.getByLabelText(`New key ${index} time`),{target:{value:time}});fireEvent.change(screen.getByLabelText(`New key ${index} value`),{target:{value}});fireEvent.change(screen.getByLabelText(`New key ${index} curve`),{target:{value:'linear'}})}
  fireEvent.click(screen.getByRole('button',{name:'Create track'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1))
  const intent=submit.mock.calls[0][0].intent;expect(intent.kind).toBe('add-track');if(intent.kind==='add-track'){expect(intent.track.keyframes).toHaveLength(2);expect(new Set([intent.track.id,...intent.track.keyframes.map(k=>k.id)]).size).toBe(3)}
  fireEvent.change(screen.getByLabelText('Property activation start'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Create track'}));expect(submit).toHaveBeenCalledTimes(1);expect(status).toHaveBeenCalledWith(expect.stringMatching(/explicit/i))
 })
 it('uses exact persisted Group-local owner identities and exposes all seven families',()=>{
  const {record}=setup(true);fireEvent.change(screen.getByLabelText('Property owner'),{target:{value:'group:definition'}});fireEvent.click(screen.getByRole('button',{name:'New track'}))
  expect(screen.getByText(/definition-local milliseconds/i)).toBeInTheDocument();expect(screen.getByText(/2 linked occurrences/i)).toBeInTheDocument()
  expect(screen.getByLabelText('Property target').textContent).toContain('slot');expect(record.composition.groupDefinitions[0].propertyTracks).toEqual([])
 })
})

it('submits exact persisted key/track removals and one explicitly authored new key',async()=>{
 const {record,submit}=setup();record.composition.propertyTracks=[{id:'track',target:{kind:'clip-opacity',clipId:'clip'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'a',timeMs:0,value:.2,easing:{curve:'linear'}},{id:'b',timeMs:500,value:.5,easing:{curve:'hold',at:.5}},{id:'c',timeMs:1000,value:.8,easing:{curve:'linear'}}]}]
 owner();fireEvent.change(screen.getByLabelText('Property track'),{target:{value:'track'}});fireEvent.change(screen.getByLabelText('Property key'),{target:{value:'b'}});fireEvent.click(screen.getByRole('button',{name:'Remove key'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));expect(submit.mock.calls[0][0]).toMatchObject({propertyOwner:{kind:'show'},intent:{kind:'remove-key',trackId:'track',keyId:'b'}})
 fireEvent.click(screen.getByRole('button',{name:'Add key'}));fireEvent.change(screen.getByLabelText('Property key time'),{target:{value:'750'}});fireEvent.change(screen.getByLabelText('Property key value'),{target:{value:'.6'}});fireEvent.change(screen.getByLabelText('Key curve'),{target:{value:'steps'}});fireEvent.change(screen.getByLabelText('Key Steps'),{target:{value:'4'}});fireEvent.change(screen.getByLabelText('Key position'),{target:{value:'start'}});fireEvent.click(screen.getByRole('button',{name:'Create key'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(2));expect(submit.mock.calls[1][0]).toMatchObject({intent:{kind:'add-key',trackId:'track',key:{timeMs:750,value:.6,easing:{curve:'steps',steps:4,position:'start'}}}})
 fireEvent.click(screen.getByRole('button',{name:'Remove track'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(3));expect(submit.mock.calls[2][0]).toMatchObject({intent:{kind:'remove-track',trackId:'track'}})
})
it('opening a persisted key and applying without dirty fields never sends a descriptor or easing patch',async()=>{
 const {record,submit}=setup();record.composition.propertyTracks=[{id:'track',target:{kind:'clip-opacity',clipId:'clip'},activeStartMs:0,activeDurationMs:1000,keyframes:[{id:'a',timeMs:0,value:.2,easing:{curve:'cubic-bezier',x1:.2,y1:9,x2:.8,y2:-9}},{id:'b',timeMs:1000,value:.8,easing:{curve:'linear'}}]}]
 owner();fireEvent.change(screen.getByLabelText('Property track'),{target:{value:'track'}});fireEvent.change(screen.getByLabelText('Property key'),{target:{value:'a'}});fireEvent.click(screen.getByRole('button',{name:'Apply key'}));await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));expect(submit.mock.calls[0][0].intent).toEqual({kind:'update-key',trackId:'track',keyId:'a',patch:{}})
})

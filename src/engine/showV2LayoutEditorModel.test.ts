import { expect, it } from 'vitest'
import { showV2LayoutEditorFixture } from '../test/showV2LayoutEditorFixture'
import { buildShowV2LayoutEditorModel, planShowV2LayoutEdit } from './showV2LayoutEditorModel'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2 } from './showCompositionV2'
it('orders exact persisted occurrence coverage and definition sharing without editing children', () => {
 const { record } = showV2LayoutEditorFixture(), model = buildShowV2LayoutEditorModel(record)
 expect(model.occurrences.map(x => [x.id,x.startMs,x.endMs,x.isInitial,x.shared])).toEqual([[record.composition.layoutOccurrences[0].id,0,5000,true,true],['later-layout',5000,31000,false,true]])
 expect(model.layouts.map(x=>x.id)).toEqual(record.zoneLayouts.map(x=>x.id))
})
it.each([{kind:'move' as const,occurrenceId:'later-layout',startMs:6000},{kind:'select-layout' as const,occurrenceId:'later-layout',layoutId:'alternate-layout'},{kind:'make-unique' as const,occurrenceId:'later-layout',name:'Solo'},{kind:'remove' as const,occurrenceId:'later-layout'}])('plans $kind through the unchanged owner and valid reopen', request => {
 const { record } = showV2LayoutEditorFixture(), original=structuredClone(record)
 const plan=planShowV2LayoutEdit(record,request,()=> 'fresh-layout'); if(plan.status!=='ready') throw Error(plan.message)
 const result=editShowLayoutIntervalsV2(record,plan.intent); expect(result.status).toBe('changed'); expect(record).toEqual(original)
 const reopened=parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record)); expect(reopened.status).toBe('opened'); expect(validateShowRecordV2(result.record)).toEqual([])
 expect(result.record.composition.clips).toEqual(record.composition.clips); expect(result.record.composition.propertyTracks).toEqual(record.composition.propertyTracks); expect(result.record.composition.patternInstances).toEqual(record.composition.patternInstances)
 if(request.kind==='make-unique') expect(result.record.zoneLayouts[result.record.zoneLayouts.length - 1]).toEqual({...record.zoneLayouts[0],id:'fresh-layout',name:'Solo'})
 if(request.kind==='move') expect(result.record.composition.layoutOccurrences[1]).toMatchObject({id:'later-layout',startMs:6000,durationMs:25000})
 if(request.kind==='select-layout') expect(result.record.composition.layoutOccurrences[1].layoutId).toBe('alternate-layout')
 if(request.kind==='make-unique') expect(result.record.composition.layoutOccurrences[1].layoutId).toBe('fresh-layout')
 if(request.kind==='remove') expect(result.record.composition.layoutOccurrences.map(x=>[x.id,x.startMs,x.durationMs])).toEqual([[record.composition.layoutOccurrences[0].id,0,31000]])
})
it('refuses missing selection and conflicting fresh identity without retry or arbitrary timing',()=>{
 const {record}=showV2LayoutEditorFixture(),allocate=()=>record.zoneLayouts[0].id
 expect(planShowV2LayoutEdit(record,{kind:'make-unique',occurrenceId:'later-layout',name:'Solo'},allocate).status).toBe('refused')
 expect(planShowV2LayoutEdit(record,{kind:'remove',occurrenceId:'child'},allocate).status).toBe('refused')
 const plan=planShowV2LayoutEdit(record,{kind:'move',occurrenceId:'later-layout',startMs:5000.5},allocate)
 if(plan.status!=='ready') throw Error(plan.message)
 expect(plan.intent).toHaveProperty('startMs',5000.5); expect(editShowLayoutIntervalsV2(record,plan.intent).status).toBe('refused')
})
it('accepted neighboring move preserves meaningful transfer/track times and explicit references',()=>{
 const {record}=showV2LayoutEditorFixture(),first=record.composition.layoutOccurrences[0],later=record.composition.layoutOccurrences[1]
 later.incomingTransfer={id:'layout-transfer',fromOccurrenceId:first.id,durationMs:500,direction:'reverse',easing:{curve:'sine',direction:'in-out'}}
 const track={id:'layout-animation',target:{kind:'layout-occurrence-split-position' as const,layoutOccurrenceId:later.id},activeStartMs:5500,activeDurationMs:1000,keyframes:[{id:'baseline',timeMs:5500,value:.5,easing:{curve:'linear' as const}},{id:'end',timeMs:6500,value:.5,easing:{curve:'linear' as const}}]}
 record.composition.propertyTracks.push(track)
 const result=editShowLayoutIntervalsV2(record,{kind:'move',occurrenceId:later.id,startMs:4000});expect(result.status,result.status==='refused'?result.message:'').toBe('changed')
 expect(result.record.composition.layoutOccurrences[1].incomingTransfer).toEqual(later.incomingTransfer)
 expect(result.record.composition.propertyTracks).toEqual(record.composition.propertyTracks)
 expect(result.record.composition.groupOccurrences).toEqual(record.composition.groupOccurrences)
 expect(result.record.composition.patternInstances).toEqual(record.composition.patternInstances)
 expect(editShowLayoutIntervalsV2(record,{kind:'remove',occurrenceId:later.id})).toMatchObject({status:'refused',record,code:'meaningful-occurrence-data'})
})

import browserFixture from '../../e2e/fixtures/showV2LayoutOccurrences.json'
import { captureShowStageEditV2 } from './showPreparedStageV2'
it('qualifies the actual thirty-second stock-plane browser fixture before seeding',()=>{
 const decoded=parseProvisionalShowRecordV2(JSON.stringify(browserFixture.record));if(decoded.status!=='opened') throw Error(JSON.stringify(decoded.issues));const record=decoded.record
 expect(validateShowRecordV2(record)).toEqual([])
 const capture=captureShowStageEditV2(record,{patterns:browserFixture.patterns,maps:[],libraries:[],profiles:[],stageMap:null})
 expect(capture.inputCapture.status).toBe('qualified');expect(capture.prepared.status,capture.prepared.status==='refused'?capture.prepared.message:'').toBe('ready')
 expect(record.composition.groupOccurrences[0].holds).toEqual([{id:'initial-hold',localTimeMs:2500,durationMs:1000}])
})

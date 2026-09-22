import { expect, it } from 'vitest'
import { showV2LayoutEditorFixture } from '../test/showV2LayoutEditorFixture'
import { buildShowV2LayoutEditorModel, planShowV2LayoutEdit, showV2MakeUniqueLayoutName } from './showV2LayoutEditorModel'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import { createDefaultShow } from './showModel'
import { appendShowLayoutInterval, duplicateShowLayoutInterval, projectShowLayoutIntervals } from './showLayoutIntervals'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'
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
it('names a Make Unique copy after its source definition with v1 uniqueness (#1066 slice 8a)', () => {
 const record = commandFixtureV2()
 expect(showV2MakeUniqueLayoutName(record, 'interval-2')).toBe('Both copy')
 const taken = structuredClone(record)
 taken.zoneLayouts.push({ ...taken.zoneLayouts[0], id: 'both-copy', name: 'Both copy' })
 expect(showV2MakeUniqueLayoutName(taken, 'interval-2')).toBe('Both copy 2')
 expect(showV2MakeUniqueLayoutName(record, 'missing')).toBeNull()
})
function twoSceneDuplicateV1Show(): ShowRecord {
 const show = createDefaultShow('show-layout-duplicate-timing', 'Layout duplicate timing', 1)
 const sourceCell = show.cells[0]
 const composition: ShowCompositionV1 = {
  version: 1,
  patternInstances: [{
   id: 'instance-1',
   pattern: { ...sourceCell.pattern },
   patternName: sourceCell.patternName,
   time: { timeScale: 1, timeOffsetMs: 0 },
  }],
  scenes: [{
   sceneId: show.scenes[0].id,
   zones: [{
    zoneId: show.zones[0].id,
    main: [{
     id: 'placement-1',
     instanceId: 'instance-1',
     startMs: 0,
     durationMs: show.scenes[0].durationMs,
     view: { brightness: 1, phase: 0, mirror: false },
    }],
    overlays: [],
   }],
  }],
 }
 const base = {
  ...show,
  scenes: [{ ...show.scenes[0], durationMs: 30_000 }],
  cells: [{ ...sourceCell, sceneId: show.scenes[0].id, sceneSpan: 1 }],
  transitions: [],
  composition,
 }
 return appendShowLayoutInterval(base, { durationMs: 5_000, layoutId: 'layout-1' })
}
function duplicateTiming(record: ShowRecordV2): { showEndMs: number; occurrences: unknown[]; clips: unknown[] } {
 return {
  showEndMs: record.composition.showEndMs,
  occurrences: record.composition.layoutOccurrences.map(occurrence => [occurrence.startMs, occurrence.durationMs]).sort(),
  clips: record.composition.clips.map(clip => [clip.zoneId, clip.startMs, clip.durationMs]).sort(),
 }
}
it.each([false, true])('duplicates withContent=%s with v1 timing after conversion (#1066 slice 8a)', (withContent) => {
 const base = twoSceneDuplicateV1Show()
 const intervalId = projectShowLayoutIntervals(base)[0].id
 const v1Next = duplicateShowLayoutInterval(base, intervalId, { withContent })
 expect(v1Next).not.toBe(base)
 // v1 duplicate-with-content leaves an explicit `propertyTracks: undefined` key that JSON persistence erases; convert the stored shape.
 const convertedNext = convertShowRecordV1ToV2(JSON.parse(JSON.stringify(v1Next)))
 if (convertedNext.status !== 'converted') throw new Error(JSON.stringify(convertedNext.issues))
 const convertedBase = convertShowRecordV1ToV2(base)
 if (convertedBase.status !== 'converted') throw new Error(JSON.stringify(convertedBase.issues))
 const occurrence = convertedBase.record.composition.layoutOccurrences.find(candidate => candidate.startMs === 0)
 if (!occurrence) throw new Error('converted base has no first Layout occurrence')
 let counter = 0
 const plan = planShowV2LayoutEdit(convertedBase.record, { kind: 'duplicate', occurrenceId: occurrence.id, content: withContent ? 'copy' : 'empty' }, () => `fresh-${counter += 1}`)
 if (plan.status !== 'ready') throw new Error(plan.message)
 const applied = editShowLayoutIntervalsV2(structuredClone(convertedBase.record), plan.intent)
 if (applied.status !== 'changed') throw new Error(applied.status === 'refused' ? applied.message : applied.status)
 const v1First = duplicateTiming(convertedNext.record), v2First = duplicateTiming(applied.record)
 if (JSON.stringify(v1First) !== JSON.stringify(v2First)) throw new Error(`BRIEF GAP: Duplicate withContent=${withContent} timing differs v1-then-convert ${JSON.stringify(v1First)} vs convert-then-v2 ${JSON.stringify(v2First)}`)
 expect(v2First).toEqual(v1First)
})
it('makes one reused occurrence unique by cloning only its Layout definition (#1066 slice 8a)', () => {
 const record = commandFixtureV2()
 const name = showV2MakeUniqueLayoutName(record, 'interval-2')
 expect(name).toBe('Both copy')
 if (name === null) throw new Error('expected a Make Unique name')
 let counter = 0
 const plan = planShowV2LayoutEdit(record, { kind: 'make-unique', occurrenceId: 'interval-2', name }, () => `fresh-${counter += 1}`)
 if (plan.status !== 'ready') throw new Error(plan.message)
 const result = editShowLayoutIntervalsV2(record, plan.intent)
 if (result.status !== 'changed') throw new Error(result.status === 'refused' ? result.message : result.status)
 const both = record.zoneLayouts.find(layout => layout.id === 'both')
 const copy = result.record.zoneLayouts.find(layout => layout.id !== 'both' && layout.id !== 'left-only')
 expect(copy?.name).toBe('Both copy')
 expect({ ...copy, id: 'layout', name: 'Layout' }).toEqual({ ...both, id: 'layout', name: 'Layout' })
 expect(result.record.composition.layoutOccurrences.find(occurrence => occurrence.id === 'interval-2')?.layoutId).toBe(copy?.id)
 expect(result.record.composition.layoutOccurrences.find(occurrence => occurrence.id === 'interval-1')?.layoutId).toBe('both')
 expect(result.record.zones).toEqual(record.zones)
})

import { expect, it } from 'vitest'
import { showV2GroupOccurrenceEditorFixture } from '../test/showV2GroupOccurrenceEditorFixture'
import { serializeProvisionalShowRecordV2, parseProvisionalShowRecordV2 } from './showCompositionV2'
import { moveShowGroupOccurrenceV2, duplicateShowGroupOccurrenceV2, makeShowGroupUniqueV2, ungroupShowGroupOccurrenceV2, deleteShowGroupOccurrenceV2 } from './showGroupEditsV2'
import { buildShowV2GroupOccurrenceEditorModel, planShowV2GroupOccurrenceEdit } from './showV2GroupOccurrenceEditorModel'

it('presents held effective timing and submits an exact complete placement to existing owners', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const occurrence = record.composition.groupOccurrences[0]
  const model = buildShowV2GroupOccurrenceEditorModel(record)
  expect(model.occurrences[0]).toMatchObject({ id: occurrence.id, name: 'Verse', startMs: 2000, endMs: 8000, holdDurationMs: 1000 })
  const placement = { startMs: 9000, zoneId: occurrence.zoneId, layerBindings: occurrence.layerBindings, translationX: 0.2, translationY: -0.1 }
  const movedPlan = planShowV2GroupOccurrenceEdit(record, { kind: 'move-occurrence', occurrenceId: occurrence.id, placement }, () => 'unused')
  expect(movedPlan.status).toBe('ready'); if (movedPlan.status !== 'ready' || movedPlan.intent.kind !== 'move-occurrence') throw Error('plan')
  expect(movedPlan.intent).toMatchObject({ ...placement, layoutOccurrenceId: record.composition.layoutOccurrences[0].id })
  const moved = moveShowGroupOccurrenceV2(record, movedPlan.intent)
  expect(moved.status).toBe('changed'); const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(moved.record)); if (opened.status !== 'opened') throw Error('reopen'); expect(opened.record.composition.groupOccurrences[0]).toMatchObject({ startMs: 9000, holds: occurrence.holds, instanceBindings: occurrence.instanceBindings })
  const duplicatedPlan = planShowV2GroupOccurrenceEdit(record, { kind: 'duplicate-occurrence', occurrenceId: occurrence.id, placement }, () => 'new-occurrence')
  if (duplicatedPlan.status !== 'ready' || duplicatedPlan.intent.kind !== 'duplicate-occurrence') throw Error('plan')
  const duplicated = duplicateShowGroupOccurrenceV2(record, duplicatedPlan.intent)
  expect(duplicated.status).toBe('changed'); expect(duplicated.record.composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(duplicated.record.composition.groupOccurrences[1]).toMatchObject({ id: 'new-occurrence', holds: occurrence.holds, instanceBindings: occurrence.instanceBindings })
})

it('plans every Make Unique identity without changing runtime authority or the linked occurrence', () => {
  const { record } = showV2GroupOccurrenceEditorFixture(true)
  const before = structuredClone(record), occurrence = record.composition.groupOccurrences[0]
  let count = 0
  const plan = planShowV2GroupOccurrenceEdit(record, { kind: 'make-unique', occurrenceId: occurrence.id }, () => `unique-${++count}`)
  if (plan.status !== 'ready' || plan.intent.kind !== 'make-unique') throw Error('plan')
  expect(count).toBe(8)
  const unique = makeShowGroupUniqueV2(record, plan.intent)
  expect(unique.status, unique.status === 'refused' ? unique.message : '').toBe('changed')
  expect(unique.record.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(unique.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(unique.record.composition.groupOccurrences[1]).toEqual(before.composition.groupOccurrences[1])
  expect(Object.values(unique.record.composition.groupOccurrences[0].instanceBindings!)).toEqual(['instance'])
  expect(unique.record.composition.groupOccurrences[0].holds).toEqual(occurrence.holds)
  expect(record).toEqual(before)
})
it.each(['missing', 'uncovered', 'blank-id', 'collision'] as const)('refuses planner partition %s without mutation', partition => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const before = structuredClone(record), occurrence = record.composition.groupOccurrences[0]
  const plan = planShowV2GroupOccurrenceEdit(record, { kind: 'duplicate-occurrence', occurrenceId: partition === 'missing' ? 'missing' : occurrence.id,
    placement: { startMs: partition === 'uncovered' ? 31000 : 9000, zoneId: occurrence.zoneId, layerBindings: occurrence.layerBindings, translationX: 0, translationY: 0 } }, () => partition === 'blank-id' ? ' ' : occurrence.id)
  expect(plan.status).toBe('refused'); expect(record).toEqual(before)
})
it('forwards incomplete explicit Layer bindings to owner refusal rather than guessing a destination', () => {
  const { record } = showV2GroupOccurrenceEditorFixture(), occurrence = record.composition.groupOccurrences[0]
  const plan = planShowV2GroupOccurrenceEdit(record, { kind: 'move-occurrence', occurrenceId: occurrence.id, placement: { startMs: 9000, zoneId: occurrence.zoneId, layerBindings: [], translationX: 0, translationY: 0 } }, () => 'unused')
  if (plan.status !== 'ready' || plan.intent.kind !== 'move-occurrence') throw Error('plan')
  const result = moveShowGroupOccurrenceV2(record, plan.intent)
  expect(result).toMatchObject({ status: 'refused', record, affectedGroupOccurrenceIds: [] })
  expect(result.record).toBe(record)
})
it('selects exact shell IDs for Ungroup/Delete and retains definitions and dormant payloads', () => {
  const { record } = showV2GroupOccurrenceEditorFixture(true), occurrence = record.composition.groupOccurrences[0]
  const ungroupPlan = planShowV2GroupOccurrenceEdit(record, { kind: 'ungroup-occurrence', occurrenceId: occurrence.id }, () => 'unused')
  if (ungroupPlan.status !== 'ready' || ungroupPlan.intent.kind !== 'ungroup-occurrence') throw Error('plan')
  const ungrouped = ungroupShowGroupOccurrenceV2(record, ungroupPlan.intent)
  expect(ungrouped.status).toBe('changed'); expect(ungrouped.record.composition.groupOccurrences.map(value => value.id)).toEqual(['linked'])
  const deletePlan = planShowV2GroupOccurrenceEdit(record, { kind: 'delete-occurrence', occurrenceId: occurrence.id }, () => 'unused')
  if (deletePlan.status !== 'ready' || deletePlan.intent.kind !== 'delete-occurrence') throw Error('plan')
  const deleted = deleteShowGroupOccurrenceV2(record, deletePlan.intent)
  expect(deleted.status).toBe('changed'); expect(deleted.record.composition.groupDefinitions).toEqual(record.composition.groupDefinitions)
  expect(deleted.record.composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(deleted.record.composition.groupOccurrences[0]).toEqual(record.composition.groupOccurrences[1])
})
it('derives the repeated destination Layout at its exact switch instead of retaining the source association', () => {
  const { record } = showV2GroupOccurrenceEditorFixture(), occurrence = record.composition.groupOccurrences[0]
  const first = record.composition.layoutOccurrences[0]; first.durationMs = 17000
  const later = { ...structuredClone(first), id: 'later-layout', startMs: 17000, durationMs: 14000 }; record.composition.layoutOccurrences.push(later)
  const plan = planShowV2GroupOccurrenceEdit(record, { kind: 'duplicate-occurrence', occurrenceId: occurrence.id, placement: { startMs: 17000, zoneId: occurrence.zoneId, layerBindings: occurrence.layerBindings, translationX: 0, translationY: 0 } }, () => 'later-copy')
  if (plan.status !== 'ready' || plan.intent.kind !== 'duplicate-occurrence') throw Error('plan')
  expect(plan.intent.layoutOccurrenceId).toBe('later-layout')
  expect(duplicateShowGroupOccurrenceV2(record, plan.intent).status).toBe('changed')
})

it('plans set-child-timing by converting Show time to definition-local time', () => {
  const { record } = showV2GroupOccurrenceEditorFixture(true)
  const occurrence = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const child = definition.clips[0]
  const showStartMs = occurrence.startMs + child.startMs + 40
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-timing', occurrenceId: occurrence.id, clipId: child.id, startMs: showStartMs, durationMs: child.durationMs + 0.6,
  } as unknown as Parameters<typeof planShowV2GroupOccurrenceEdit>[1], () => { throw new Error('no allocate') })
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready') return
  expect(plan.intent).toMatchObject({ kind: 'set-definition-clip-timing', definitionId: definition.id, clipId: child.id })
})

it('refuses set-child-timing for a missing Clip or an empty patch', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const occurrence = record.composition.groupOccurrences[0]
  const before = structuredClone(record)
  const missing = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-timing', occurrenceId: occurrence.id, clipId: 'missing', durationMs: 100,
  } as unknown as Parameters<typeof planShowV2GroupOccurrenceEdit>[1], () => 'unused')
  expect(missing.status).toBe('refused')
  const empty = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-timing', occurrenceId: occurrence.id, clipId: record.composition.groupDefinitions[0].clips[0].id,
  } as unknown as Parameters<typeof planShowV2GroupOccurrenceEdit>[1], () => 'unused')
  expect(empty.status).toBe('refused')
  expect(record).toEqual(before)
})

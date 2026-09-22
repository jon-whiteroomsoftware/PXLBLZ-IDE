import { expect, it } from 'vitest'
import { showV2GroupOccurrenceEditorFixture } from '../test/showV2GroupOccurrenceEditorFixture'
import { serializeProvisionalShowRecordV2, parseProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { moveShowGroupOccurrenceV2, duplicateShowGroupOccurrenceV2, makeShowGroupUniqueV2, ungroupShowGroupOccurrenceV2, deleteShowGroupOccurrenceV2, editShowGroupDefinitionClipAppearanceV2, setShowGroupDefinitionClipTimingV2, writeShowGroupDefinitionInstancePropertiesV2 } from './showGroupEditsV2'
import { buildShowV2GroupOccurrenceEditorModel, planShowV2GroupOccurrenceEdit } from './showV2GroupOccurrenceEditorModel'
import { projectShowEditorInspectorPresentationV2 } from './showEditorInspectorPresentation'
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { completeShowGroupSelection, createShowGroupFromSelection, duplicateShowGroupOccurrence, validateShowGroupSelection } from './showGroupModel'
import { updateShowGroupClipInspector } from './showGroupClipInspectorModel'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { normalizeShowClipEffects } from './showEffects'
import type { ShowClipEffect, ShowRecord } from './personalContentRecords'

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

it('converts a held Group Clip Duration from Show time back to local time (#1075 G2a corrective)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const occurrence = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const child = definition.clips[0]
  child.startMs = 0
  child.durationMs = 800
  definition.transitions = []
  occurrence.holds = [{ id: 'hold-test', localTimeMs: 400, durationMs: 1000 }]
  const shown = projectShowEditorInspectorPresentationV2(record, occurrence.startMs).groupsByOccurrenceId[occurrence.id]!.clipsById[child.id]!.value.local.durationMs
  expect(shown).toBe(1800)
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-timing', occurrenceId: occurrence.id, clipId: child.id, durationMs: 2000,
  }, () => 'unused')
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready' || plan.intent.kind !== 'set-definition-clip-timing') throw Error('plan')
  expect(plan.intent.durationMs).toBe(1000)
  const applied = setShowGroupDefinitionClipTimingV2(record, plan.intent)
  expect(applied.status).toBe('changed')
  if (applied.status !== 'changed') throw Error('apply')
  const reshown = projectShowEditorInspectorPresentationV2(applied.record, occurrence.startMs).groupsByOccurrenceId[occurrence.id]!.clipsById[child.id]!.value.local.durationMs
  expect(reshown).toBe(2000)
})

it('keeps an unchanged held Group Clip Duration as local time (#1075 G2a corrective)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const occurrence = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const child = definition.clips[0]
  child.startMs = 0
  child.durationMs = 800
  definition.transitions = []
  occurrence.holds = [{ id: 'hold-test', localTimeMs: 400, durationMs: 1000 }]
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-timing', occurrenceId: occurrence.id, clipId: child.id, durationMs: 1800,
  }, () => 'unused')
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready' || plan.intent.kind !== 'set-definition-clip-timing') throw Error('plan')
  expect(plan.intent.durationMs).toBe(800)
  const applied = setShowGroupDefinitionClipTimingV2(record, plan.intent)
  expect(applied.status).toBe('unchanged')
})

it('refuses a held Group Clip Duration that ends at or before its start (#1075 G2a corrective)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const occurrence = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const child = definition.clips[0]
  child.startMs = 0
  child.durationMs = 800
  definition.transitions = []
  occurrence.holds = [{ id: 'hold-test', localTimeMs: 400, durationMs: 1000 }]
  const before = structuredClone(record)
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-timing', occurrenceId: occurrence.id, clipId: child.id, durationMs: 0,
  }, () => 'unused')
  expect(plan).toEqual({ status: 'refused', message: "Duration must end after the Clip's start outside a hold." })
  expect(record).toEqual(before)
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

function g2bBaseShow(id: string): ShowRecord {
  const source = resizeBoundaryShow(id)
  const view = { mirror: false, phase: 0, brightness: 1 }
  source.composition!.patternInstances.push(
    { id: 'instance-overlay', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Overlay pulse', time: { timeScale: 1, timeOffsetMs: 0 } },
  )
  const zone = source.composition!.scenes[0].zones[0]
  zone.main = [{ id: 'clip-main', instanceId: 'resize-instance', startMs: 0, durationMs: 5_000, view }]
  zone.overlays = [{ id: 'overlay-1', name: 'Overlay 1', placements: [{ id: 'clip-overlay', instanceId: 'instance-overlay', startMs: 0, durationMs: 5_000, opacity: 1, view }] }]
  return source
}

function g2bGroupedBefore(): ShowRecord {
  const show = g2bBaseShow('g2b-oracle')
  const selection = completeShowGroupSelection(show.composition!, ['clip-main', 'clip-overlay'])
  const plan = validateShowGroupSelection(show.composition!, selection)
  if (!plan.enabled) throw new Error('selection not enabled')
  let composition = createShowGroupFromSelection(show.composition!, { selection, definitionId: 'def-1', occurrenceId: 'occ-1', name: 'Group' })
  composition = duplicateShowGroupOccurrence(composition, { occurrenceId: 'occ-1', newOccurrenceId: 'occ-2', startMs: 5_000 })
  return { ...show, composition }
}

function g2bConvertedBefore(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(g2bGroupedBefore())
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') throw new Error('conversion failed')
  return converted.record
}

function speedTestDependencies() {
  return {
    resolvePattern: () => ({
      status: 'ready' as const,
      replacement: {
        patternReference: { kind: 'stock' as const, id: 'CometLoom' },
        patternName: 'CometLoom',
        exportedSliders: [{ exportName: 'speedTest', kind: 'slider' as const, label: 'Speed' }],
      },
    }),
  }
}

it('matches the v1-then-convert oracle for Group Clip brightness (#1075 G2b)', () => {
  const before = g2bGroupedBefore()
  const edited = updateShowGroupClipInspector(before, { occurrenceId: 'occ-1', placementId: 'clip-main' }, { view: { brightness: 0.5 } })
  expect(edited).not.toBe(before)
  const convertedEdited = convertShowRecordV1ToV2(edited)
  expect(convertedEdited.status).toBe('converted')
  if (convertedEdited.status !== 'converted') return
  const convertedBefore = convertShowRecordV1ToV2(before)
  expect(convertedBefore.status).toBe('converted')
  if (convertedBefore.status !== 'converted') return
  const planned = planShowV2GroupOccurrenceEdit(convertedBefore.record, {
    kind: 'set-child-inspector-patch', occurrenceId: 'occ-1', clipId: 'clip-main', patch: { view: { brightness: 0.5 } },
  }, () => { throw new Error('no allocate') })
  expect(planned.status).toBe('ready')
  if (planned.status !== 'ready') return
  expect(planned.intent.kind).toBe('edit-definition-clip-appearance')
  if (planned.intent.kind !== 'edit-definition-clip-appearance') return
  const applied = editShowGroupDefinitionClipAppearanceV2(convertedBefore.record, planned.intent)
  expect(applied.status).toBe('changed')
  if (applied.status !== 'changed') return
  expect({ ...applied.record, updatedAt: 0 }.composition.groupDefinitions).toEqual({ ...convertedEdited.record, updatedAt: 0 }.composition.groupDefinitions)
  expect(applied.record.composition.groupOccurrences).toEqual(convertedBefore.record.composition.groupOccurrences)
  expect(applied.record.composition.clips).toEqual(convertedBefore.record.composition.clips)
  expect(applied.record.composition.patternInstances).toEqual(convertedBefore.record.composition.patternInstances)
})

it('matches the v1-then-convert oracle for a Group Clip control value (#1075 G2b)', () => {
  const before = g2bGroupedBefore()
  const edited = updateShowGroupClipInspector(before, { occurrenceId: 'occ-1', placementId: 'clip-main' }, { simulation: { controlTargets: { speedTest: 0.5 } } })
  expect(edited).not.toBe(before)
  const convertedEdited = convertShowRecordV1ToV2(edited)
  expect(convertedEdited.status).toBe('converted')
  if (convertedEdited.status !== 'converted') return
  const convertedBefore = convertShowRecordV1ToV2(before)
  expect(convertedBefore.status).toBe('converted')
  if (convertedBefore.status !== 'converted') return
  const planned = planShowV2GroupOccurrenceEdit(convertedBefore.record, {
    kind: 'set-child-inspector-patch', occurrenceId: 'occ-1', clipId: 'clip-main', patch: { simulation: { controlTargets: { speedTest: 0.5 } } },
  }, () => { throw new Error('no allocate') })
  expect(planned.status).toBe('ready')
  if (planned.status !== 'ready') return
  expect(planned.intent.kind).toBe('write-definition-instance-properties')
  if (planned.intent.kind !== 'write-definition-instance-properties') return
  const applied = writeShowGroupDefinitionInstancePropertiesV2(convertedBefore.record, planned.intent, speedTestDependencies())
  expect(applied.status).toBe('changed')
  if (applied.status !== 'changed') return
  expect({ ...applied.record, updatedAt: 0 }.composition.groupDefinitions).toEqual({ ...convertedEdited.record, updatedAt: 0 }.composition.groupDefinitions)
  expect(applied.record.composition.groupOccurrences).toEqual(convertedBefore.record.composition.groupOccurrences)
  expect(applied.record.composition.clips).toEqual(convertedBefore.record.composition.clips)
})

it('matches the v1-then-convert oracle for a Group Clip Effect add (#1075 G2b)', () => {
  const effect = normalizeShowClipEffects([{ id: 'ripple', kind: 'ripple' } as ShowClipEffect])[0] as ShowClipEffect
  const before = g2bGroupedBefore()
  const edited = updateShowGroupClipInspector(before, { occurrenceId: 'occ-1', placementId: 'clip-main' }, { effects: [effect] })
  expect(edited).not.toBe(before)
  const convertedEdited = convertShowRecordV1ToV2(edited)
  expect(convertedEdited.status).toBe('converted')
  if (convertedEdited.status !== 'converted') return
  const convertedBefore = convertShowRecordV1ToV2(before)
  expect(convertedBefore.status).toBe('converted')
  if (convertedBefore.status !== 'converted') return
  const planned = planShowV2GroupOccurrenceEdit(convertedBefore.record, {
    kind: 'set-child-inspector-patch', occurrenceId: 'occ-1', clipId: 'clip-main', patch: { effects: [effect] },
  }, () => { throw new Error('no allocate') })
  expect(planned.status).toBe('ready')
  if (planned.status !== 'ready') return
  expect(planned.intent.kind).toBe('edit-definition-clip-appearance')
  if (planned.intent.kind !== 'edit-definition-clip-appearance') return
  const applied = editShowGroupDefinitionClipAppearanceV2(convertedBefore.record, planned.intent)
  expect(applied.status).toBe('changed')
  if (applied.status !== 'changed') return
  expect({ ...applied.record, updatedAt: 0 }.composition.groupDefinitions).toEqual({ ...convertedEdited.record, updatedAt: 0 }.composition.groupDefinitions)
})

it('matches the v1-then-convert oracle for a Group Clip Viewport enable (#1075 G2b)', () => {
  const before = g2bGroupedBefore()
  const edited = updateShowGroupClipInspector(before, { occurrenceId: 'occ-1', placementId: 'clip-main' }, { viewport: { enabled: true, x: 0.25 } })
  expect(edited).not.toBe(before)
  const convertedEdited = convertShowRecordV1ToV2(edited)
  expect(convertedEdited.status).toBe('converted')
  if (convertedEdited.status !== 'converted') return
  const convertedBefore = convertShowRecordV1ToV2(before)
  expect(convertedBefore.status).toBe('converted')
  if (convertedBefore.status !== 'converted') return
  const planned = planShowV2GroupOccurrenceEdit(convertedBefore.record, {
    kind: 'set-child-inspector-patch', occurrenceId: 'occ-1', clipId: 'clip-main', patch: { viewport: { enabled: true, x: 0.25 } },
  }, () => { throw new Error('no allocate') })
  expect(planned.status).toBe('ready')
  if (planned.status !== 'ready') return
  expect(planned.intent.kind).toBe('edit-definition-clip-appearance')
  if (planned.intent.kind !== 'edit-definition-clip-appearance') return
  const applied = editShowGroupDefinitionClipAppearanceV2(convertedBefore.record, planned.intent)
  expect(applied.status).toBe('changed')
  if (applied.status !== 'changed') return
  expect({ ...applied.record, updatedAt: 0 }.composition.groupDefinitions).toEqual({ ...convertedEdited.record, updatedAt: 0 }.composition.groupDefinitions)
})

it('refuses Group Clip Pattern and entry-policy patches without an intent (#1075 G2b)', () => {
  const record = g2bConvertedBefore()
  const before = structuredClone(record)
  const pattern = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-inspector-patch', occurrenceId: 'occ-1', clipId: 'clip-main', patch: { pattern: { ref: { kind: 'stock', id: 'TestPattern1D' }, name: 'TestPattern1D' } },
  }, () => 'unused')
  expect(pattern.status).toBe('refused')
  const entry = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-inspector-patch', occurrenceId: 'occ-1', clipId: 'clip-main', patch: { entryPolicy: 'restart' },
  }, () => 'unused')
  expect(entry.status).toBe('refused')
  expect(record).toEqual(before)
})

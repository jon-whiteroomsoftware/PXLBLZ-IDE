import { expect, it } from 'vitest'
import { showV2GroupOccurrenceEditorFixture } from '../test/showV2GroupOccurrenceEditorFixture'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { serializeProvisionalShowRecordV2, parseProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { moveShowGroupOccurrenceV2, duplicateShowGroupOccurrenceV2, makeShowGroupUniqueV2, ungroupShowGroupOccurrenceV2, deleteShowGroupOccurrenceV2, editShowGroupDefinitionClipAppearanceV2, setShowGroupDefinitionClipTimingV2, writeShowGroupDefinitionInstancePropertiesV2, insertShowGroupDefinitionLayerTransitionV2 } from './showGroupEditsV2'
import { insertShowGroupLayerTransition } from './showGroupModel'
import { planShowV2GroupLayerTransitionInsertion } from './showV2LayerTransitionInsertion'
import { buildShowV2GroupOccurrenceEditorModel, planShowV2GroupOccurrenceEdit, showV2GroupBaseLayerMax } from './showV2GroupOccurrenceEditorModel'
import { projectShowEditorInspectorPresentationV2 } from './showEditorInspectorPresentation'
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { completeShowGroupSelection, createShowGroupFromSelection, duplicateShowGroupOccurrence, validateShowGroupSelection } from './showGroupModel'
import { updateShowGroupClipInspector } from './showGroupClipInspectorModel'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '../pixelblaze/libs'
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
  expect(plan).toEqual({ status: 'refused', code: 'ends-in-hold', message: "Duration must end after the Clip's start outside a hold." })
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

it('exposes removedControls when a Group child untick removes a laned control (#1069)', () => {
  const record = g2bConvertedBefore()
  const occurrence = record.composition.groupOccurrences.find(value => value.id === 'occ-1')!
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const child = definition.clips.find(value => value.id === 'clip-main')!
  const slot = definition.patternInstances.find(value => value.id === child.instanceId)!
  slot.controlTargets = { speedTest: 0.5 }
  definition.propertyTracks.push({ id: 'lane-speed', target: { kind: 'instance-control', instanceId: slot.id, exportName: 'speedTest' },
    activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'lane-speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'lane-speed-b', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] })
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-inspector-patch', occurrenceId: occurrence.id, clipId: child.id, patch: { simulation: { controlTargets: {} } },
  }, () => 'unused')
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready' || plan.intent.kind !== 'write-definition-instance-properties') throw Error('plan')
  expect(plan.intent.properties).toEqual({ remove_controls: ['speedTest'] })
  expect(plan.removedControls).toEqual([{ exportName: 'speedTest', label: 'speedTest' }])
})

it('exposes no removedControls when a Group child untick removes an unlaned control (#1069)', () => {
  const record = g2bConvertedBefore()
  const occurrence = record.composition.groupOccurrences.find(value => value.id === 'occ-1')!
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const child = definition.clips.find(value => value.id === 'clip-main')!
  const slot = definition.patternInstances.find(value => value.id === child.instanceId)!
  slot.controlTargets = { speedTest: 0.5 }
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-inspector-patch', occurrenceId: occurrence.id, clipId: child.id, patch: { simulation: { controlTargets: {} } },
  }, () => 'unused')
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready' || plan.intent.kind !== 'write-definition-instance-properties') throw Error('plan')
  expect(plan.intent.properties).toEqual({ remove_controls: ['speedTest'] })
  expect(plan.removedControls).toEqual([])
})

it('exposes overwritten held segments for a Group child Brightness write (#1069)', () => {
  const record = g2bConvertedBefore()
  const occurrence = record.composition.groupOccurrences.find(value => value.id === 'occ-1')!
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const child = definition.clips.find(value => value.id === 'clip-main')!
  const first = child.appearance.keys[0]!
  child.appearance.keys = [first, { ...structuredClone(first), id: 'held-appearance', timeMs: Math.floor(child.durationMs / 2),
    value: { ...structuredClone(first.value), view: { ...first.value.view, brightness: 0.8 } } }]
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-inspector-patch', occurrenceId: occurrence.id, clipId: child.id, patch: { view: { brightness: 0.5 } },
  }, () => 'unused')
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready' || plan.intent.kind !== 'edit-definition-clip-appearance') throw Error('plan')
  expect(plan.overwritesHeldSegments).toBe(2)
})

it('does not flag a single-key Group child Brightness write as a held-segment overwrite (#1069)', () => {
  const record = g2bConvertedBefore()
  const occurrence = record.composition.groupOccurrences.find(value => value.id === 'occ-1')!
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const child = definition.clips.find(value => value.id === 'clip-main')!
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-inspector-patch', occurrenceId: occurrence.id, clipId: child.id, patch: { view: { brightness: 0.5 } },
  }, () => 'unused')
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready' || plan.intent.kind !== 'edit-definition-clip-appearance') throw Error('plan')
  expect(plan.overwritesHeldSegments).toBeUndefined()
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

it('plans a Group-local Layer Transition resize through the definition id (#1075 G4b-1)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const before = structuredClone(record)
  const occurrence = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const transition = definition.transitions[0]!
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'resize-definition-layer-transition', occurrenceId: occurrence.id, transitionId: transition.id, durationMs: transition.durationMs + 1500.4,
  }, () => 'unused')
  expect(plan).toEqual({ status: 'ready', intent: { kind: 'resize-definition-layer-transition', definitionId: definition.id, transitionId: transition.id, durationMs: transition.durationMs + 1500 } })
  expect(record).toEqual(before)
})

it('plans a Group-local Layer Transition Reset to Cut as duration zero (#1075 G4b-1)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const before = structuredClone(record)
  const occurrence = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const transition = definition.transitions[0]!
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'resize-definition-layer-transition', occurrenceId: occurrence.id, transitionId: transition.id, durationMs: 0,
  }, () => 'unused')
  expect(plan).toEqual({ status: 'ready', intent: { kind: 'resize-definition-layer-transition', definitionId: definition.id, transitionId: transition.id, durationMs: 0 } })
  expect(record).toEqual(before)
})

it('refuses a Group-local Layer Transition resize for an unknown Transition (#1075 G4b-1)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const before = structuredClone(record)
  const occurrence = record.composition.groupOccurrences[0]
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'resize-definition-layer-transition', occurrenceId: occurrence.id, transitionId: 'missing', durationMs: 2000,
  }, () => 'unused')
  expect(plan.status).toBe('refused')
  expect(record).toEqual(before)
})

it('keeps an unchanged Group-local Layer Transition duration a no-op (#1075 G4b-1)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const before = structuredClone(record)
  const occurrence = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const transition = definition.transitions[0]!
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'resize-definition-layer-transition', occurrenceId: occurrence.id, transitionId: transition.id, durationMs: transition.durationMs,
  }, () => 'unused')
  expect(plan).toEqual({ status: 'refused', code: 'no-change', message: 'No change.' })
  expect(record).toEqual(before)
})

it('refuses a negative or non-finite Group-local Layer Transition duration (#1075 G4b-1)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const before = structuredClone(record)
  const occurrence = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const transition = definition.transitions[0]!
  for (const durationMs of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const plan = planShowV2GroupOccurrenceEdit(record, {
      kind: 'resize-definition-layer-transition', occurrenceId: occurrence.id, transitionId: transition.id, durationMs,
    }, () => 'unused')
    expect(plan.status).toBe('refused')
  }
  expect(record).toEqual(before)
})

function g4b2cV1Before(): ShowRecord {
  const source = convertibleV1Show()
  source.scenes[0].durationMs = 30000
  source.composition!.durationMs = 30000
  source.composition!.scenes[0].zones[0].overlays = [{ id: 'ov1', name: 'ov', placements: [] }]
  const inst = { ...structuredClone(source.composition!.patternInstances[0]), id: 'g-inst' }
  source.composition!.groupDefinitions = [{
    id: 'def-1',
    name: 'D',
    patternInstances: [inst],
    placements: [
      { id: 'g-a', instanceId: 'g-inst', layerOffset: 0, startMs: 0, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
      { id: 'g-b', instanceId: 'g-inst', layerOffset: 0, startMs: 4000, durationMs: 3000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
    ],
  }]
  source.composition!.groupOccurrences = [
    { id: 'occ-1', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 0, baseLayer: 1, translationX: 0, translationY: 0 },
    { id: 'occ-2', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 10000, baseLayer: 1, translationX: 0, translationY: 0 },
  ]
  return source
}

function g4b2cV2Before(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(g4b2cV1Before())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

it('plans a Group-local Layer Transition insert with definition-local ids (#1075 G4b-2c)', () => {
  const record = g4b2cV2Before()
  const before = structuredClone(record)
  const definition = record.composition.groupDefinitions.find(value => value.id === 'def-1')!
  const layerId = definition.layers[0]!.id
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'insert-definition-layer-transition', occurrenceId: 'occ-1', fromClipId: 'g-a', toClipId: 'g-b',
    kindKey: 'transition:blend:crossfade', durationMs: 1000,
  }, () => 'lt-1')
  expect(plan).toEqual({
    status: 'ready',
    intent: {
      kind: 'insert-definition-layer-transition',
      definitionId: 'def-1',
      transition: {
        id: 'lt-1',
        kind: 'crossfade',
        durationMs: 1000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
        participants: [{ id: 'lt-1:participant', zoneId: 'definition-zone', layerId, fromClipId: 'g-a', toClipId: 'g-b' }],
        propertyRamps: [],
      },
    },
  })
  expect(record).toEqual(before)
  if (plan.status !== 'ready' || plan.intent.kind !== 'insert-definition-layer-transition') throw new Error('plan')
  const applied = insertShowGroupDefinitionLayerTransitionV2(record, plan.intent)
  expect(applied.status, applied.status === 'refused' ? applied.message : '').toBe('changed')
  if (applied.status !== 'changed') return
  const v1before = g4b2cV1Before()
  const v1transition = { id: 'lt-1', fromPlacementId: 'g-a', toPlacementId: 'g-b', kind: 'crossfade' as const, durationMs: 1000, easing: { curve: 'linear' as const }, crossfadePolicy: 'live-live' as const }
  const v1afterComposition = insertShowGroupLayerTransition({ scenes: v1before.scenes, zones: v1before.zones }, structuredClone(v1before.composition!), { occurrenceId: 'occ-1', transition: v1transition })
  const oracle = convertShowRecordV1ToV2({ ...structuredClone(v1before), composition: v1afterComposition })
  expect(oracle.status).toBe('converted')
  if (oracle.status !== 'converted') return
  const edited = applied.record.composition.groupDefinitions.find(value => value.id === 'def-1')!
  expect(edited.clips).toEqual(oracle.record.composition.groupDefinitions[0]!.clips)
  expect(edited.transitions).toEqual(oracle.record.composition.groupDefinitions[0]!.transitions)
})

it('clamps a Group-local Layer Transition insert to the plan maximum (#1075 G4b-2c)', () => {
  const record = g4b2cV2Before()
  const maximum = planShowV2GroupLayerTransitionInsertion(record, 'occ-1', 'g-a', 'g-b')
  if (!maximum.enabled) throw new Error('expected room at the Group Cut')
  const before = structuredClone(record)
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'insert-definition-layer-transition', occurrenceId: 'occ-1', fromClipId: 'g-a', toClipId: 'g-b',
    kindKey: 'transition:blend:crossfade', durationMs: maximum.maxDurationMs + 5000,
  }, () => 'lt-2')
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready' || plan.intent.kind !== 'insert-definition-layer-transition') throw new Error('plan')
  expect(plan.intent.transition.durationMs).toBe(maximum.maxDurationMs)
  expect(record).toEqual(before)
})

it('refuses a Group-local Layer Transition insert with the disabled plan reason (#1075 G4b-2c)', () => {
  const record = g4b2cV2Before()
  record.composition.groupDefinitions.find(value => value.id === 'def-1')!
    .clips.find(value => value.id === 'g-b')!.startMs = 5000
  const disabled = planShowV2GroupLayerTransitionInsertion(record, 'occ-1', 'g-a', 'g-b')
  if (disabled.enabled) throw new Error('expected a disabled plan')
  const before = structuredClone(record)
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'insert-definition-layer-transition', occurrenceId: 'occ-1', fromClipId: 'g-a', toClipId: 'g-b',
    kindKey: 'transition:blend:crossfade', durationMs: 100,
  }, () => 'unused')
  expect(plan).toEqual({ status: 'refused', message: disabled.reason })
  expect(record).toEqual(before)
})

it('refuses a Group-local Layer Transition insert across definition layers (#1075 G4b-2c)', () => {
  const record = g4b2cV2Before()
  const definition = record.composition.groupDefinitions.find(value => value.id === 'def-1')!
  definition.layers.push({ id: 'def-layer-2', name: 'Second', rank: 1 })
  definition.clips.find(value => value.id === 'g-b')!.layerId = 'def-layer-2'
  const before = structuredClone(record)
  const plan = planShowV2GroupOccurrenceEdit(record, {
    kind: 'insert-definition-layer-transition', occurrenceId: 'occ-1', fromClipId: 'g-a', toClipId: 'g-b',
    kindKey: 'transition:blend:crossfade', durationMs: 100,
  }, () => 'unused')
  expect(plan.status).toBe('refused')
  expect(record).toEqual(before)
})

it('compares v1-then-convert with the v2 Group replacement owner for a same-controls Pattern (#1075 G2c)', async () => {
  const { captureShowStageEditV2 } = await import('./showPreparedStageV2')
  const { planShowV2GroupReplacementEdit } = await import('./showV2GroupReplacementEditorModel')
  const { resolveCapturedShowPatternReplacementV2 } = await import('./showV2ClipReplacementModel')
  const { replaceShowGroupDefinitionClipPatternV2 } = await import('./showGroupReplacementV2')
  const before = g2bGroupedBefore()
  const edited = updateShowGroupClipInspector(before, { occurrenceId: 'occ-1', placementId: 'clip-main' }, { pattern: { ref: { kind: 'stock', id: 'TestPattern2D' }, name: 'TestPattern2D' } })
  expect(edited).not.toBe(before)
  const convertedBefore = convertShowRecordV1ToV2(before)
  expect(convertedBefore.status).toBe('converted')
  if (convertedBefore.status !== 'converted') return
  const definitionId = convertedBefore.record.composition.groupDefinitions[0]!.id
  const deps = { patterns: [], maps: [], libraries: [], profiles: [], stageMap: null }
  const capture = captureShowStageEditV2(convertedBefore.record, deps as never)
  expect(capture.prepared.status).not.toBe('refused')
  let serial = 0
  const plan = planShowV2GroupReplacementEdit(capture as never, definitionId, 'clip-main', { kind: 'stock', id: 'TestPattern2D' }, () => `g2c-${++serial}`)
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready') return
  const resolved = resolveCapturedShowPatternReplacementV2(capture as never, { kind: 'stock', id: 'TestPattern2D' })
  expect(resolved.status).toBe('ready')
  if (resolved.status !== 'ready') return
  const { kind: _kind, patternReference: _reference, ...owned } = plan.intent as unknown as Record<string, unknown>
  const applied = replaceShowGroupDefinitionClipPatternV2(structuredClone(convertedBefore.record), { ...owned, replacement: resolved.replacement } as never)
  expect(applied.status).toBe('changed')
  if (applied.status !== 'changed') return
  // The v2 owner stores occurrence runtimes at top level where v1-then-convert stores none; that representation difference is accepted because both compile to the same bytes (#1075 G2c).
  const editedNormalized = (() => {
    const copy = structuredClone(edited) as unknown as Record<string, unknown>
    const composition = copy.composition as Record<string, unknown>
    if ('executionModel' in composition && composition.executionModel === undefined) delete composition.executionModel
    return copy
  })()
  const reconverted = convertShowRecordV1ToV2(editedNormalized as unknown as ShowRecord)
  expect(reconverted.status).toBe('converted')
  if (reconverted.status !== 'converted') return
  expect({ ...applied.record, updatedAt: 0 }.composition.groupDefinitions).toEqual({ ...reconverted.record, updatedAt: 0 }.composition.groupDefinitions)
  // Same stock-pattern lookup construction as src/engine/showV2LayoutConversion.test.ts:136-142,
  // unioned across both records so both occurrence runtimes resolve.
  const lookup = {
    byCellId: {},
    byPatternInstanceId: Object.fromEntries(
      [...applied.record.composition.patternInstances, ...reconverted.record.composition.patternInstances,
        ...applied.record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances),
        ...reconverted.record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)].map(
        (instance) => [instance.id, DEMOS[instance.pattern.id]],
      ),
    ),
  }
  const preparedApplied = prepareShowV2ForCompile(applied.record, lookup)
  expect(preparedApplied.status).toBe('ready')
  if (preparedApplied.status !== 'ready') return
  const preparedReconverted = prepareShowV2ForCompile(reconverted.record, lookup)
  expect(preparedReconverted.status).toBe('ready')
  if (preparedReconverted.status !== 'ready') return
  expect(compileShow(preparedReconverted.recipe, LIBRARIES).code).toBe(compileShow(preparedApplied.recipe, LIBRARIES).code)
})

it('bounds the Base Layer at the highest rank offset where every definition Layer finds a Zone Layer (#1098)', () => {
  const { record } = showV2GroupOccurrenceEditorFixture()
  const occurrence = record.composition.groupOccurrences[0]!
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const zoneRanks = record.composition.layers.filter(layer => layer.zoneId === occurrence.zoneId).map(layer => layer.rank)
  const top = Math.max(...definition.layers.map(layer => layer.rank))
  expect(showV2GroupBaseLayerMax(record, occurrence.id)).toBe(Math.max(...zoneRanks) - top)
  expect(showV2GroupBaseLayerMax(record, 'missing')).toBeNull()
})

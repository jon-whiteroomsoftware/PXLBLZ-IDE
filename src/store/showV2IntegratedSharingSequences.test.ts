import { afterEach, beforeEach, expect, it } from 'vitest'
import { showV2GroupEditorFixture } from '../test/showV2GroupEditorFixture'
import { exportedScalar, nativeShowV2Artifacts, openIntegratedShowV2Pilot } from '../test/showV2IntegratedSequenceHarness'
import { effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from '../engine/showGroupsV2'
import { planShowV2GroupCreation } from '../engine/showV2GroupCreationEditorModel'
import { planShowV2GroupOccurrenceEdit } from '../engine/showV2GroupOccurrenceEditorModel'
import { createShowV2IndependentIntent, createShowV2LinkedDuplicateIntent, createShowV2RejoinIntent } from '../engine/showV2ClipSharingEditorModel'
import { createShowV2ClipReplacementIntent } from '../engine/showV2ClipReplacementModel'
import { planShowV2GroupReplacementEdit } from '../engine/showV2GroupReplacementEditorModel'
import { resetPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotClipReplacementEdit, admitShowV2PilotClipSharingEdit, admitShowV2PilotCreateGroup,
  admitShowV2PilotGroupOccurrenceEdit, admitShowV2PilotGroupReplacementEdit,
} from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

/**
 * #1038 integrated SHARING and REPLACE sequences. Each runs the complete §12
 * sequence against one fixture through the real prepared-edit admission path and
 * judges the reopened native `.pxlshow`/`.epe` artifacts.
 */
function sequenceFixture() {
  const { record, dependencies } = showV2GroupEditorFixture(true)
  // Leave ordinary room after the bottom-Layer Clip so plain duplication has an
  // exact adjacent destination inside the authored Show End.
  record.composition.clips[0].durationMs = 8000
  expect(record.composition.patternInstances.map(instance => instance.id)).toEqual(['instance'])
  return { record, dependencies }
}

/** Effective runtime identities, ordered, including every materialized Group use. */
function effectiveRuntimes(record: ShowRecordV2): string[] {
  return [...new Set(materializeShowGroupsV2(record).composition.clips.map(clip => clip.instanceId))].sort()
}

it('runs plain duplicate, Group repeat, Make Group Unique, independence and Rejoin as one admitted sequence', { timeout: 60_000 }, async () => {
  const { record, dependencies } = sequenceFixture()
  const pilot = openIntegratedShowV2Pilot(record, dependencies)
  const clip = record.composition.clips[0]
  let allocated = 0
  const allocate = () => `sequence-${++allocated}`

  // 1. Plain duplicate of the shared ordinary Clip never creates a runtime.
  const duplicate = createShowV2LinkedDuplicateIntent(pilot.context().capture, clip.id, { zoneId: clip.zoneId, layerId: clip.layerId, startMs: '8000' }, allocate)
  if (duplicate.status !== 'ready') throw Error(duplicate.status === 'refused' ? duplicate.message : 'duplicate plan')
  expect((await admitShowV2PilotClipSharingEdit({ ...pilot.context(), intent: duplicate.intent })).status).toBe('applied')
  const duplicatedClipId = duplicate.intent.kind === 'duplicate' ? duplicate.intent.identities.clipId : ''
  expect(effectiveRuntimes(pilot.current())).toEqual(['instance'])
  expect(effectiveShowInstanceUseCountV2(pilot.current(), 'instance')).toBe(4)

  // 2. Group the selected pair and its Transition, then repeat that occurrence.
  const created = planShowV2GroupCreation(pilot.current(), { clipIds: ['verse-a', 'verse-b'], transitionIds: ['verse-transition'], name: 'Verse' }, allocate)
  if (created.status !== 'ready') throw Error(created.message)
  expect((await admitShowV2PilotCreateGroup({ ...pilot.context(), intent: created.intent })).status).toBe('applied')
  const firstOccurrence = pilot.current().composition.groupOccurrences[0]
  expect(effectiveRuntimes(pilot.current())).toEqual(['instance'])

  const repeat = planShowV2GroupOccurrenceEdit(pilot.current(), {
    kind: 'duplicate-occurrence', occurrenceId: firstOccurrence.id,
    placement: { startMs: 12000, zoneId: firstOccurrence.zoneId, layerBindings: firstOccurrence.layerBindings, translationX: 0, translationY: 0 },
  }, allocate)
  if (repeat.status !== 'ready') throw Error(repeat.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: repeat.intent })).status).toBe('applied')
  const repeatedId = repeat.intent.kind === 'duplicate-occurrence' ? repeat.intent.newOccurrenceId : ''
  expect(pilot.current().composition.groupOccurrences.map(occurrence => occurrence.definitionId)).toEqual([firstOccurrence.definitionId, firstOccurrence.definitionId])
  expect(effectiveRuntimes(pilot.current())).toEqual(['instance'])
  expect(effectiveShowInstanceUseCountV2(pilot.current(), 'instance')).toBe(6)

  // 3. Make Group Unique clones choreography identity, never a runtime.
  const unique = planShowV2GroupOccurrenceEdit(pilot.current(), { kind: 'make-unique', occurrenceId: repeatedId }, allocate)
  if (unique.status !== 'ready') throw Error(unique.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: unique.intent })).status).toBe('applied')
  const definitionIds = pilot.current().composition.groupOccurrences.map(occurrence => occurrence.definitionId)
  expect(new Set(definitionIds).size).toBe(2)
  expect(effectiveRuntimes(pilot.current())).toEqual(['instance'])
  expect(effectiveShowInstanceUseCountV2(pilot.current(), 'instance')).toBe(6)
  expect(pilot.current().composition.patternInstances.map(instance => instance.id)).toEqual(['instance'])

  // 4. Only explicit independence creates the second runtime.
  const independent = createShowV2IndependentIntent(pilot.context().capture, duplicatedClipId, allocate)
  if (independent.status !== 'ready') throw Error(independent.status === 'refused' ? independent.message : 'independence plan')
  expect((await admitShowV2PilotClipSharingEdit({ ...pilot.context(), intent: independent.intent })).status).toBe('applied')
  const independentId = independent.intent.kind === 'make-independent' ? independent.intent.independence.instanceId : ''
  expect(effectiveRuntimes(pilot.current())).toEqual([independentId, 'instance'].sort())
  expect(effectiveShowInstanceUseCountV2(pilot.current(), 'instance')).toBe(5)
  expect(effectiveShowInstanceUseCountV2(pilot.current(), independentId)).toBe(1)

  // 5. Explicit Rejoin returns to the original runtime and collects the orphan.
  const rejoin = createShowV2RejoinIntent(pilot.context().capture, duplicatedClipId, 'instance')
  if (rejoin.status !== 'ready') throw Error(rejoin.status === 'refused' ? rejoin.message : 'Rejoin plan')
  expect((await admitShowV2PilotClipSharingEdit({ ...pilot.context(), intent: rejoin.intent })).status).toBe('applied')
  expect(effectiveRuntimes(pilot.current())).toEqual(['instance'])
  expect(pilot.current().composition.patternInstances.map(instance => instance.id)).toEqual(['instance'])

  expect(pilot.writes()).toBe(6)
  expect(pilot.history().past).toHaveLength(6)
  expect(pilot.saved()).toEqual(pilot.current())

  const native = await nativeShowV2Artifacts(pilot.saved(), dependencies)
  expect(native.importedShow.composition).toEqual(pilot.saved().composition)
  // Exactly one authored runtime member survived the whole sequence; the other
  // compiled member is the compiler's empty routed filler for blank Show time.
  expect(native.members.filter(member => member.id === 'instance')).toHaveLength(1)
  expect(native.members.filter(member => !member.id.startsWith('__pxlblz_')).map(member => member.id)).toEqual(['instance'])
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const replay = native.replay(fidelity)
    const prefix = native.prefixFor('instance')
    // 2000 and 2125 sit inside both the ordinary Clip and the first Group child,
    // strictly before the Group-local Restart contribution at 3000.
    const first = exportedScalar(replay.advanceTo(2000, { stepMs: 125, forceFullIntermediateRender: true }).exports, `${prefix}_elapsed`, fidelity)
    const second = exportedScalar(replay.advanceTo(2125, { stepMs: 125, forceFullIntermediateRender: true }).exports, `${prefix}_elapsed`, fidelity)
    const visible = materializeShowGroupsV2(pilot.saved()).composition.clips.filter(item => item.instanceId === 'instance' && item.startMs <= 2000 && item.startMs + item.durationMs > 2125)
    expect(visible.length).toBeGreaterThanOrEqual(2)
    expect(second - first, `shared advance ${fidelity}`).toBe(125)
  }
})

it('replaces a shared ordinary Clip and a unique Group occurrence, then Undo/Redo and reopens', { timeout: 60_000 }, async () => {
  const { record, dependencies } = sequenceFixture()
  dependencies.patterns = [...dependencies.patterns, {
    id: 'other-voice', name: 'Other voice',
    src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(.1,.2,elapsed/30000)}',
    controls: {}, updatedAt: 1,
  }]
  const pilot = openIntegratedShowV2Pilot(record, dependencies)
  let allocated = 0
  const allocate = () => `replace-${++allocated}`

  // Group the pair so a definition-local Clip and a unique occurrence exist.
  const created = planShowV2GroupCreation(pilot.current(), { clipIds: ['verse-a', 'verse-b'], transitionIds: ['verse-transition'], name: 'Verse' }, allocate)
  if (created.status !== 'ready') throw Error(created.message)
  expect((await admitShowV2PilotCreateGroup({ ...pilot.context(), intent: created.intent })).status).toBe('applied')
  const occurrence = pilot.current().composition.groupOccurrences[0]
  const repeat = planShowV2GroupOccurrenceEdit(pilot.current(), {
    kind: 'duplicate-occurrence', occurrenceId: occurrence.id,
    placement: { startMs: 12000, zoneId: occurrence.zoneId, layerBindings: occurrence.layerBindings, translationX: 0, translationY: 0 },
  }, allocate)
  if (repeat.status !== 'ready') throw Error(repeat.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: repeat.intent })).status).toBe('applied')
  const repeatedId = repeat.intent.kind === 'duplicate-occurrence' ? repeat.intent.newOccurrenceId : ''
  const unique = planShowV2GroupOccurrenceEdit(pilot.current(), { kind: 'make-unique', occurrenceId: repeatedId }, allocate)
  if (unique.status !== 'ready') throw Error(unique.message)
  expect((await admitShowV2PilotGroupOccurrenceEdit({ ...pilot.context(), intent: unique.intent })).status).toBe('applied')
  const uniqueDefinitionId = pilot.current().composition.groupOccurrences.find(item => item.id === repeatedId)!.definitionId

  const sharedBefore = structuredClone(pilot.current())
  const linkedDefinition = pilot.current().composition.groupOccurrences.find(item => item.id === occurrence.id)!.definitionId
  const linkedChildren = pilot.current().composition.groupDefinitions.find(item => item.id === linkedDefinition)!.clips.map(item => item.id)

  // 1. Shared ordinary Clip replacement forks exactly one runtime for that Clip.
  const ordinary = createShowV2ClipReplacementIntent(pilot.context().capture, record.composition.clips[0].id, { kind: 'user', id: 'other-voice' }, allocate)
  if (ordinary.status !== 'ready') throw Error(ordinary.message)
  expect((await admitShowV2PilotClipReplacementEdit({ ...pilot.context(), intent: ordinary.intent })).status).toBe('applied')
  const forked = pilot.current().composition.clips.find(item => item.id === record.composition.clips[0].id)!
  expect(forked.instanceId).not.toBe('instance')
  expect(pilot.current().composition.patternInstances.find(item => item.id === forked.instanceId)!.pattern).toEqual({ kind: 'user', id: 'other-voice' })
  // Other users of the original runtime keep their payload and compiled member.
  expect(pilot.current().composition.patternInstances.find(item => item.id === 'instance')).toEqual(sharedBefore.composition.patternInstances.find(item => item.id === 'instance'))
  expect(pilot.current().composition.groupDefinitions).toEqual(sharedBefore.composition.groupDefinitions)

  // 2. Definition-local replacement on the unique occurrence leaves the linked
  //    definition, its children and the ordinary sharing users exact.
  const group = planShowV2GroupReplacementEdit(pilot.context().capture, uniqueDefinitionId,
    pilot.current().composition.groupDefinitions.find(item => item.id === uniqueDefinitionId)!.clips[0].id,
    { kind: 'user', id: 'other-voice' }, allocate)
  if (group.status !== 'ready') throw Error(group.message)
  expect((await admitShowV2PilotGroupReplacementEdit({ ...pilot.context(), intent: group.intent })).status).toBe('applied')
  expect(pilot.current().composition.groupDefinitions.find(item => item.id === linkedDefinition)).toEqual(sharedBefore.composition.groupDefinitions.find(item => item.id === linkedDefinition))
  expect(pilot.current().composition.groupDefinitions.find(item => item.id === linkedDefinition)!.clips.map(item => item.id)).toEqual(linkedChildren)
  expect(pilot.current().composition.transitions).toEqual(sharedBefore.composition.transitions)

  const afterBoth = structuredClone(pilot.current())
  const writesAfterEdits = pilot.writes()
  const uniqueChild = (record: ShowRecordV2) => record.composition.groupDefinitions.find(item => item.id === uniqueDefinitionId)!.clips[0]

  // 3. Undo/Redo restores and reapplies each complete composition through history.
  expect(await pilot.undo()).toBe(true)
  expect(pilot.current().composition).not.toEqual(afterBoth.composition)
  expect(uniqueChild(pilot.current()).instanceId).toBe(uniqueChild(sharedBefore).instanceId)
  expect(await pilot.redo()).toBe(true)
  expect(pilot.current().composition).toEqual(afterBoth.composition)
  expect(pilot.writes()).toBe(writesAfterEdits + 2)

  // 4. The saved bytes reopen through the ordinary importers with both sources.
  const native = await nativeShowV2Artifacts(pilot.saved(), dependencies)
  expect(native.importedShow.composition).toEqual(pilot.saved().composition)
  const replacedReferences = native.importedShow.composition.patternInstances.map(item => item.pattern.id)
  expect(replacedReferences).toContain('other-voice')
  expect(replacedReferences).toContain('group-voice')
  expect(native.members.filter(member => !member.id.startsWith('__pxlblz_')).length).toBeGreaterThanOrEqual(2)
})

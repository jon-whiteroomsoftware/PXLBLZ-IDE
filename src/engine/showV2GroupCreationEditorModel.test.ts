import { expect, it } from 'vitest'
import { propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { createShowGroupFromSelectionV2 } from './showGroupCreationV2'
import { buildShowV2GroupCreationEditorModel, planShowV2GroupCreation } from './showV2GroupCreationEditorModel'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } from './showCompositionV2'

it('builds an explicit complete plan with one allocation per local identity, binding the same runtime', () => {
  const record = propertyEditRecord(), clip = record.composition.clips[0]
  const before = structuredClone(record); let count = 0
  const plan = planShowV2GroupCreation(record, { clipIds: [clip.id], transitionIds: [], name: 'Verse' }, () => `fresh-${++count}`)
  expect(plan.status).toBe('ready'); if (plan.status !== 'ready') throw Error('plan')
  expect(count).toBe(6)
  expect(plan.intent).toMatchObject({ kind: 'create-group', selectedClipIds: [clip.id], transitionIds: [], name: 'Verse', originMs: clip.startMs })
  const created = createShowGroupFromSelectionV2(record, plan.intent); expect(created.status, created.status === 'refused' ? created.message : '').toBe('changed')
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(created.record))
  expect(opened.status).toBe('opened'); if (opened.status !== 'opened') throw Error('reopen')
  const reopened = opened.record
  expect(reopened.composition.groupOccurrences[0].instanceBindings).toEqual({ [plan.intent.identities.patternInstanceIds[clip.instanceId]]: clip.instanceId })
  expect(reopened.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(record).toEqual(before)
  expect(buildShowV2GroupCreationEditorModel(reopened, [], []).clips).toEqual([])
})
it('does not absorb an unselected attached Transition or expand Clip selection', () => {
  const record = propertyEditRecord(), clip = record.composition.clips[0]
  const second = structuredClone(clip); second.id = 'second'; second.startMs = 700; second.durationMs = 300; second.appearance.keys[0].timeMs = 700
  clip.durationMs = 500; record.composition.clips.push(second)
  record.composition.transitions = [{ id: 'attached', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, participants: [{ id: 'pair', zoneId: clip.zoneId, layerId: clip.layerId, fromClipId: clip.id, toClipId: second.id }], propertyRamps: [] }]
  const model = buildShowV2GroupCreationEditorModel(record, [clip.id], [])
  expect(model.transitions.map(transition => transition.id)).toEqual(['attached'])
  let count = 0
  const plan = planShowV2GroupCreation(record, { clipIds: [clip.id], transitionIds: [], name: 'Partial' }, () => `fresh-${++count}`)
  expect(plan.status).toBe('ready'); if (plan.status !== 'ready') throw Error('plan')
  expect(plan.intent.selectedClipIds).toEqual([clip.id]); expect(plan.intent.transitionIds).toEqual([])
  expect(createShowGroupFromSelectionV2(record, plan.intent)).toMatchObject({ status: 'refused', code: 'invalid-selection', record })
})
it.each(['', 'missing', 'collision'] as const)('rejects malformed or stale selection/allocation %s before submission', partition => {
  const record = propertyEditRecord(); const clip = record.composition.clips[0]
  const request = { clipIds: partition === 'missing' ? ['gone'] : [clip.id], transitionIds: [], name: partition === '' ? '' : 'Verse' }
  const result = planShowV2GroupCreation(record, request, () => clip.id)
  expect(result.status).toBe('refused')
})

it('allocates Clip-owned track keys completely, without copying global instance animation', () => {
  const record = propertyEditRecord(); const clip = record.composition.clips[0]
  record.composition.propertyTracks = [{ id: 'clip-track', target: { kind: 'clip-opacity', clipId: clip.id }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'first', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'last', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] }, { id: 'global', target: { kind: 'instance-time-scale', instanceId: clip.instanceId }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'first', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'last', timeMs: 1000, value: 1, easing: { curve: 'linear' } }] }]
  let count = 0; const plan = planShowV2GroupCreation(record, { clipIds: [clip.id], transitionIds: [], name: 'Verse' }, () => `fresh-${++count}`)
  expect(plan.status).toBe('ready'); if (plan.status !== 'ready') throw Error('plan')
  expect(count).toBe(9)
  expect(Object.keys(plan.intent.identities.propertyTrackIds)).toEqual(['clip-track'])
  expect(Object.keys(plan.intent.identities.propertyKeyIdsByTrackId['clip-track'])).toEqual(['first', 'last'])
  const created = createShowGroupFromSelectionV2(record, plan.intent); expect(created.status, created.status === 'refused' ? created.message : '').toBe('changed')
  expect(created.record.composition.propertyTracks).toEqual([record.composition.propertyTracks[1]])
})
it('preserves independent identity namespaces instead of globally banning equal allocated IDs', () => {
  const record = propertyEditRecord()
  const plan = planShowV2GroupCreation(record, { clipIds: [record.composition.clips[0].id], transitionIds: [], name: 'Verse' }, () => 'allocated')
  expect(plan.status).toBe('ready'); if (plan.status !== 'ready') throw Error('plan')
  expect(createShowGroupFromSelectionV2(record, plan.intent).status).toBe('changed')
})

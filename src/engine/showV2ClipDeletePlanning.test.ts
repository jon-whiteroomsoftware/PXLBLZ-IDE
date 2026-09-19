import { describe, expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2 } from './showCompositionV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { propertyEditRecord } from '@/test/showV2PropertyEditsFixture'
import type { ShowRecord } from './personalContentRecords'
import {
  planShowV2ClipDelete,
  showV2ClipCount,
  showV2ConnectedTransitionIds,
} from './showV2ClipDeletePlanning'

function twoClipRecord(id: string) {
  const source: ShowRecord = resizeBoundaryShow(id)
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

describe('planShowV2ClipDelete', () => {
  it('plans a free Clip as a bare delete-clip intent', () => {
    const record = twoClipRecord('delete-plan-free')
    const target = record.composition.clips[0].id
    const plan = planShowV2ClipDelete(record, target, { confirmed: false, allocate: () => 'fresh-1' })
    expect(plan).toEqual({ kind: 'ready', intent: { kind: 'delete-clip', clipId: target } })
    expect(showV2ConnectedTransitionIds(record, target)).toEqual([])
  })
  it('asks for confirmation when the Clip carries a joined Transition', () => {
    const record = twoClipRecord('delete-plan-joined')
    const first = record.composition.clips[0]
    const second = record.composition.clips[1]
    first.startMs = 0
    first.durationMs = 4000
    second.startMs = 4000
    second.durationMs = 4000
    const target = first.id
    record.composition.transitions = [{
      id: 'join',
      kind: 'crossfade',
      durationMs: 500,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      participants: [{ id: 'join-p', fromClipId: first.id, toClipId: second.id, zoneId: first.zoneId, layerId: first.layerId }],
      wholeOutput: undefined as never,
      propertyRamps: [],
    }]
    const connected = showV2ConnectedTransitionIds(record, target)
    expect(connected).toEqual(['join'])
    expect(planShowV2ClipDelete(record, target, { confirmed: false, allocate: () => 'x' })).toEqual({ kind: 'needs-confirm', clipId: target, connectedTransitionIds: ['join'] })
    expect(planShowV2ClipDelete(record, target, { confirmed: true, allocate: () => 'x' }).kind).toBe('ready')
  })
  it('counts a converted-boundary participant as joined, pending the #1068 owner repair', () => {
    const record = twoClipRecord('delete-plan-boundary')
    const first = record.composition.clips[0]
    const second = record.composition.clips[1]
    record.composition.transitions = [{
      id: 'transition-scene-1',
      kind: 'crossfade',
      durationMs: 2000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'snapshot-live',
      origin: 'converted-boundary-transition',
      participants: [{ id: 'transition-scene-1:participant:1', fromClipId: first.id, toClipId: second.id, zoneId: first.zoneId, layerId: first.layerId }],
      wholeOutput: undefined as never,
      propertyRamps: [],
    }]
    expect(showV2ConnectedTransitionIds(record, first.id)).toEqual(['transition-scene-1'])
    expect(planShowV2ClipDelete(record, first.id, { confirmed: false, allocate: () => 'x' })).toEqual({
      kind: 'needs-confirm', clipId: first.id, connectedTransitionIds: ['transition-scene-1'],
    })
  })
  it('refuses the final remaining Clip', () => {
    const record = propertyEditRecord()
    const single = structuredClone(record)
    single.composition.clips = [single.composition.clips[0]]
    single.composition.groupOccurrences = []
    single.composition.groupDefinitions = []
    expect(showV2ClipCount(single)).toBe(1)
    expect(planShowV2ClipDelete(single, single.composition.clips[0].id, { confirmed: true, allocate: () => 'x' })).toEqual({ kind: 'refuse', reason: 'final-clip', message: 'A Show must contain at least one Clip.' })
  })
  it('refuses group-child and missing identities without allocating', () => {
    const record = twoClipRecord('delete-plan-group-missing')
    let allocated = 0
    const counting = () => `fresh-${++allocated}`
    expect(planShowV2ClipDelete(record, 'occ-0:child', { confirmed: true, allocate: counting })).toMatchObject({ kind: 'refuse', reason: 'group-child' })
    expect(planShowV2ClipDelete(record, 'missing', { confirmed: true, allocate: counting })).toMatchObject({ kind: 'refuse', reason: 'missing-clip' })
    expect(planShowV2ClipDelete(record, '  ', { confirmed: true, allocate: counting })).toMatchObject({ kind: 'refuse', reason: 'invalid-request' })
    expect(allocated).toBe(0)
  })
  it('carries ramp projections for a property-carrying Transition', async () => {
    const { transitionV1Show } = await import('@/test/showV2TracerFixture')
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const record = converted.record
    record.composition.transitions = [{
      id: 'boundary', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
      crossfadePolicy: 'live-live', participants: [],
      wholeOutput: { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] },
      propertyRamps: [{ target: { kind: 'show-repeat-scale' }, from: 2, easing: { curve: 'quadratic', direction: 'in' } }],
    }]
    expect(validateShowRecordV2(record)).toEqual([])
    let serial = 0
    const plan = planShowV2ClipDelete(record, 'out', { confirmed: true, allocate: () => `ramp-${++serial}` })
    expect(plan.kind).toBe('ready')
    if (plan.kind !== 'ready') return
    expect(plan.intent.propertyRampProjections).toHaveLength(1)
    expect(editShowTransitionV2(record, plan.intent).status).toBe('changed')
  })
})

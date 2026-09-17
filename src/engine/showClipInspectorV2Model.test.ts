import { describe, expect, it } from 'vitest'
import { propertyEditGroupRecord, propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { buildShowClipInspectorModelV2, showClipInspectorChoicesV2 } from './showClipInspectorV2Model'
import type { ShowRecordV2 } from './showCompositionV2'

function sharedRecord(): ShowRecordV2 {
  const record = propertyEditGroupRecord()
  record.composition.clips[0].entryPolicy = 'restart'
  return record
}

describe('the v2 Clip inspector model', () => {
  it('counts every effective use of the selected Clip instance, Group Clip uses included', () => {
    const record = sharedRecord()
    const model = buildShowClipInspectorModelV2(record, { kind: 'clip', clipId: 'clip' })
    expect(model?.ownership.useCount).toBe(3)
    expect(model?.users.map((user) => [user.clipId, user.groupOccurrenceId])).toEqual([
      ['clip', undefined],
      ['occ-0:child', 'occ-0'],
      ['occ-1:child', 'occ-1'],
    ])
    // Every use resolves through its own Zone and Layer names, not an id.
    expect(model?.users.every((user) => user.zoneName === 'Main')).toBe(true)
    expect(model?.editable).toBe(true)
  })

  it('reports the authored entry policy and timing of the selected Clip', () => {
    const record = sharedRecord()
    const clip = record.composition.clips[0]
    const model = buildShowClipInspectorModelV2(record, { kind: 'clip', clipId: 'clip' })
    expect(model?.entryPolicy).toBe('restart')
    expect([model?.startMs, model?.durationMs, model?.endMs])
      .toEqual([clip.startMs, clip.durationMs, clip.startMs + clip.durationMs])
    expect(buildShowClipInspectorModelV2(propertyEditRecord(), { kind: 'clip', clipId: 'clip' })?.entryPolicy)
      .toBe('continue')
  })

  it('offers only explicit existing instances as Rejoin destinations', () => {
    const record = sharedRecord()
    const source = record.composition.patternInstances[0]
    record.composition.patternInstances.push({ ...structuredClone(source), id: 'other' })
    record.composition.patternInstances.push({
      ...structuredClone(source),
      id: 'foreign',
      pattern: { kind: 'stock', id: 'CometLoom' },
    })
    const model = buildShowClipInspectorModelV2(record, { kind: 'clip', clipId: 'clip' })
    expect(model?.ownership.compatibleTargets.map((target) => target.instanceId)).toEqual(['other'])
    expect(model?.ownership.compatibleTargets[0].useCount).toBe(0)
  })

  it('resolves a Group occurrence selection to an inspected, non-editable Group Clip use', () => {
    const model = buildShowClipInspectorModelV2(sharedRecord(), { kind: 'group', occurrenceId: 'occ-1' })
    expect(model?.clipId).toBe('occ-1:child')
    expect(model?.groupOccurrenceId).toBe('occ-1')
    expect(model?.editable).toBe(false)
    expect(model?.ownership.useCount).toBe(3)
  })

  it('returns nothing for a selection this inspector does not own', () => {
    const record = sharedRecord()
    expect(buildShowClipInspectorModelV2(record, null)).toBeNull()
    expect(buildShowClipInspectorModelV2(record, { kind: 'clip', clipId: 'absent' })).toBeNull()
    expect(buildShowClipInspectorModelV2(record, { kind: 'marker', markerId: 'any' })).toBeNull()
    expect(buildShowClipInspectorModelV2(record, { kind: 'layout-occurrence', occurrenceId: 'any' })).toBeNull()
  })

  it('leaves the record untouched and lists ordinary Clips in timeline order', () => {
    const record = sharedRecord()
    const before = structuredClone(record)
    const later = structuredClone(record.composition.clips[0])
    later.id = 'later'
    later.startMs = record.composition.showEndMs - 100
    later.durationMs = 100
    later.appearance.keys = [{ ...structuredClone(later.appearance.keys[0]), id: 'later:key', timeMs: later.startMs }]
    record.composition.clips.push(later)
    const choices = showClipInspectorChoicesV2(record)
    expect(choices.map((choice) => choice.clipId)).toEqual(['clip', 'later'])
    expect(choices[0].label).toContain('Main / Main')
    record.composition.clips.pop()
    buildShowClipInspectorModelV2(record, { kind: 'clip', clipId: 'clip' })
    expect(record).toEqual(before)
  })
})

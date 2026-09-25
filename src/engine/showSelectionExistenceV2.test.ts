import { describe, expect, it } from 'vitest'
import { convertForTest } from '../test/showEditorV2Harness'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import type { ShowRecordV2 } from './showCompositionV2'
import { showSelectionExistsV2 } from './showSelectionExistenceV2'

function recordWithGroup(): ShowRecordV2 {
  const record = convertForTest(convertibleV1Show())
  const { zoneId: _zoneId, ...childClip } = record.composition.clips[0]
  record.composition.groupDefinitions = [{
    id: 'definition', name: 'Phrase',
    patternInstances: structuredClone(record.composition.patternInstances),
    layers: [{ id: 'group-layer', name: 'Main', rank: 0 }],
    clips: [{ ...childClip, id: 'child', layerId: 'group-layer' }],
    transitions: [], propertyTracks: [],
  }]
  record.composition.groupOccurrences = [{
    id: 'occurrence', definitionId: 'definition',
    layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    zoneId: record.zones[0].id, startMs: 0, translationX: 0, translationY: 0,
    layerBindings: [{ definitionLayerId: 'group-layer', layerId: record.composition.layers[0].id }],
    holds: [],
  }]
  return record
}

describe('showSelectionExistsV2', () => {
  it('resolves the Show selection', () => {
    expect(showSelectionExistsV2(convertForTest(convertibleV1Show()), { kind: 'show' })).toBe(true)
  })

  it('resolves a Clip and rejects a missing Clip', () => {
    const record = convertForTest(convertibleV1Show())
    expect(showSelectionExistsV2(record, { kind: 'clip', clipId: record.composition.clips[0].id })).toBe(true)
    expect(showSelectionExistsV2(record, { kind: 'clip', clipId: 'missing' })).toBe(false)
  })

  it('resolves a v2 Transition only while its owner exists (#1124)', () => {
    const record = convertForTest(transitionV1Show('crossfade'))
    expect(record.composition.transitions.length).toBeGreaterThan(0)
    expect(showSelectionExistsV2(record, {
      kind: 'transition', transitionId: record.composition.transitions[0].id,
    })).toBe(true)
    expect(showSelectionExistsV2(record, { kind: 'transition', transitionId: 'missing' })).toBe(false)
    expect(showSelectionExistsV2(record, { kind: 'transition', transitionId: 'layout-cut:occurrence' })).toBe(false)

    const first = record.composition.layoutOccurrences[0]
    const second = structuredClone(first)
    second.id = 'layout-second'
    second.startMs = first.startMs + first.durationMs
    delete second.incomingTransfer
    delete second.incomingSwitch
    record.composition.layoutOccurrences = [first, second]
    expect(showSelectionExistsV2(record, {
      kind: 'transition', transitionId: `layout-cut:${second.id}`,
    })).toBe(true)
    expect(showSelectionExistsV2(record, {
      kind: 'transition', transitionId: `layout-cut:${first.id}`,
    })).toBe(false)

    const grouped = recordWithGroup()
    grouped.composition.groupDefinitions[0].transitions = [{
      id: 'phrase-transition',
      fromPlacementId: 'child',
      toPlacementId: 'child',
      kind: 'crossfade',
      durationMs: 250,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]
    const groupTransitionId = 'occurrence:phrase-transition'
    expect(showSelectionExistsV2(grouped, { kind: 'transition', transitionId: groupTransitionId })).toBe(true)
    grouped.composition.groupOccurrences = []
    expect(showSelectionExistsV2(grouped, { kind: 'transition', transitionId: groupTransitionId })).toBe(false)
  })

  it('resolves a Zone and rejects a missing Zone', () => {
    const record = convertForTest(convertibleV1Show())
    expect(showSelectionExistsV2(record, { kind: 'zone', zoneId: record.zones[0].id })).toBe(true)
    expect(showSelectionExistsV2(record, { kind: 'zone', zoneId: 'missing' })).toBe(false)
  })

  it('resolves a Zone Layout from record.zoneLayouts and rejects a missing one', () => {
    const record = convertForTest(convertibleV1Show())
    expect(showSelectionExistsV2(record, { kind: 'zone-layout', layoutId: record.zoneLayouts[0].id })).toBe(true)
    expect(showSelectionExistsV2(record, { kind: 'zone-layout', layoutId: 'missing' })).toBe(false)
  })

  it('resolves a Group only while its occurrence and Zone remain', () => {
    const record = recordWithGroup()
    const selection = { kind: 'group', occurrenceId: 'occurrence' } as const
    expect(showSelectionExistsV2(record, selection)).toBe(true)
    record.zones = []
    expect(showSelectionExistsV2(record, selection)).toBe(false)
    record.zones = [{ id: 'zone', name: 'Main', nominalPixelCount: 16 }]
    record.composition.groupOccurrences = []
    expect(showSelectionExistsV2(record, selection)).toBe(false)
  })

  it('resolves a Group child only while its occurrence, Zone, and definition child remain', () => {
    const record = recordWithGroup()
    const selection = { kind: 'group-clip', occurrenceId: 'occurrence', placementId: 'child' } as const
    expect(showSelectionExistsV2(record, selection)).toBe(true)
    record.composition.groupDefinitions[0].clips = []
    expect(showSelectionExistsV2(record, selection)).toBe(false)
    record.composition.groupDefinitions[0].clips = recordWithGroup().composition.groupDefinitions[0].clips
    record.composition.groupOccurrences = []
    expect(showSelectionExistsV2(record, selection)).toBe(false)
  })

  it('resolves a multi selection only while every placement is an ordinary Clip', () => {
    const record = convertForTest(convertibleV1Show())
    const clipId = record.composition.clips[0].id
    expect(showSelectionExistsV2(record, {
      kind: 'multi', groupSelection: { placementIds: [clipId], transitionIds: [] },
    })).toBe(true)
    expect(showSelectionExistsV2(record, {
      kind: 'multi', groupSelection: { placementIds: [clipId, 'missing'], transitionIds: [] },
    })).toBe(false)
  })
})

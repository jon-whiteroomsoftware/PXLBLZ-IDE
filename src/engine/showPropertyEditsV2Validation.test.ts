import { describe, expect, it } from 'vitest'
import { propertyEditRecord, propertyEditTrack, propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { editShowPropertyV2, type ShowPropertyEditIntentV2, type ShowPropertyTrackOwnerV2 } from './showPropertyEditsV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
function refused(input: ShowRecordV2, owner: unknown, intent: unknown) {
  const before = structuredClone(input)
  const result = editShowPropertyV2(input, owner as ShowPropertyTrackOwnerV2, intent as ShowPropertyEditIntentV2)
  expect(result.status).toBe('refused'); expect(result.record).toBe(input); expect(input).toEqual(before)
  for (const [name, values] of Object.entries(result)) if (name.startsWith('affected') || name === 'removedIds' || name === 'discardedControlTargets') expect(values).toEqual([])
  return result
}
describe('strict Property scopes and operation partitions', () => {
  it('runs add/update activation/add/move/remove key/remove track through complete valid outputs', () => {
    const input = propertyEditRecord(); const authored = propertyEditTrack(); authored.keyframes[0].timeMs = 100; authored.keyframes[1].timeMs = 900
    let result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track: authored })
    expect(result.status).toBe('changed')
    result = editShowPropertyV2(result.record, { kind: 'show' }, { kind: 'update-track', trackId: 'animation', patch: { activeStartMs: 100, activeDurationMs: 800 } })
    expect(result.status).toBe('changed'); expect(result.record.composition.propertyTracks[0].keyframes).toEqual(authored.keyframes); expect(result.affectedPropertyKeyIds).toEqual([])
    result = editShowPropertyV2(result.record, { kind: 'show' }, { kind: 'add-key', trackId: 'animation', key: { id: 'middle', timeMs: 500, value: 0.5, easing: { curve: 'quadratic', direction: 'in' } } })
    expect(result.status).toBe('changed'); expect(result.affectedPropertyKeyIds).toEqual(['middle'])
    result = editShowPropertyV2(result.record, { kind: 'show' }, { kind: 'update-key', trackId: 'animation', keyId: 'middle', patch: { timeMs: 600, value: 0.6 } })
    expect(result.status).toBe('changed'); expect(result.record.composition.propertyTracks[0].keyframes.map(key => key.id)).toEqual(['left', 'middle', 'right'])
    result = editShowPropertyV2(result.record, { kind: 'show' }, { kind: 'remove-key', trackId: 'animation', keyId: 'middle' })
    expect(result.status).toBe('changed'); expect(result.removedIds).toEqual(['middle']); expect(validateShowRecordV2(result.record)).toEqual([])
    result = editShowPropertyV2(result.record, { kind: 'show' }, { kind: 'remove-track', trackId: 'animation' })
    expect(result.status).toBe('changed'); expect(result.removedIds).toEqual(['animation', 'left', 'right']); expect(result.record.composition.propertyTracks).toEqual([])
    expect(result.record.composition.patternInstances).toEqual(input.composition.patternInstances)
  })
  it.each([{}, { activeStartMs: 0 }, { activeDurationMs: 1000 }])('preserves exact identity for actual equal track data %j', patch => {
    const input = propertyEditRecord(); input.composition.propertyTracks = [propertyEditTrack()]
    const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'update-track', trackId: 'animation', patch })
    expect(result.status).toBe('unchanged'); expect(result.record).toBe(input); expect(result.affectedTrackIds).toEqual([])
  })
  it.each([null, [], {}, { kind: 'bogus' }, { kind: 'show', definitionId: 'extra' }, { kind: 'group-definition', definitionId: 'missing' }])('refuses explicit malformed/missing scope %j', owner => {
    refused(propertyEditRecord(), owner, { kind: 'add-track', track: propertyEditTrack() })
  })
  it.each([
    null, [], {}, { kind: 'bogus' }, { kind: 'remove-track', trackId: 'missing' }, { kind: 'add-track', track: { id: 'bad' } },
    { kind: 'update-track', trackId: 'animation', patch: { keyframes: [] } }, { kind: 'update-track', trackId: 'animation', patch: { activeStartMs: undefined } },
    { kind: 'add-key', trackId: 'animation', key: { id: 'left', timeMs: 500, value: 0.5, easing: { curve: 'linear' } } },
    { kind: 'add-key', trackId: 'animation', key: { id: 'new', timeMs: 500, value: NaN, easing: { curve: 'linear' } } },
    { kind: 'add-key', trackId: 'animation', key: { id: 'new', timeMs: 0, value: 0.5, easing: { curve: 'linear' } } },
    { kind: 'update-key', trackId: 'animation', keyId: 'left', patch: { curveSegment: {} } },
    { kind: 'update-key', trackId: 'animation', keyId: 'left', patch: { timeMs: 0.5 } },
    { kind: 'update-key', trackId: 'animation', keyId: 'right', patch: { easing: { curve: 'unknown' } } },
    { kind: 'remove-key', trackId: 'animation', keyId: 'missing' }, { kind: 'remove-key', trackId: 'animation', keyId: 'left' },
    { kind: 'update-track', trackId: 'animation', patch: { activeStartMs: 100, activeDurationMs: 800 } },
    { kind: 'update-track', trackId: 'animation', patch: { activeDurationMs: Number.MAX_SAFE_INTEGER } },
    { kind: 'update-track', trackId: 'animation', patch: { target: { kind: 'clip-opacity', clipId: 'missing' } } },
    { kind: 'update-track', trackId: 'animation', patch: { target: { kind: 'clip-opacity', clipId: 'clip', extra: 1 } } },
    { kind: 'remove-track', trackId: 'animation', extra: 1 },
  ])('refuses malformed/domain-invalid operations without throw or mutation %j', intent => {
    const input = propertyEditRecord(); input.composition.propertyTracks = [propertyEditTrack()]
    refused(input, { kind: 'show' }, intent)
  })
  it('edits all held linked occurrences without changing authoritative runtime payloads or other templates', () => {
    const input = propertyEditGroupRecord(); expect(validateShowRecordV2(input)).toEqual([])
    const local = propertyEditTrack({ kind: 'clip-transform', clipId: 'child', property: 'positionX' }); local.activeDurationMs = 400; local.keyframes[1].timeMs = 400
    const added = editShowPropertyV2(input, { kind: 'group-definition', definitionId: 'definition' }, { kind: 'add-track', track: local })
    expect(added.status).toBe('changed'); expect(added.affectedGroupDefinitionIds).toEqual(['definition']); expect(added.affectedGroupOccurrenceIds).toEqual(['occ-0', 'occ-1']); expect(added.affectedClipIds).toEqual(['occ-0:child', 'occ-1:child'])
    expect(added.record.composition.patternInstances).toEqual(input.composition.patternInstances)
    const materialized = materializeShowGroupsV2(added.record)
    expect(evaluateShowPropertyTrackV2(materialized.composition.propertyTracks.find(track => track.id === 'occ-0:animation')!, 250)).toBeCloseTo(0.5)
    expect(evaluateShowPropertyTrackV2(materialized.composition.propertyTracks.find(track => track.id === 'occ-1:animation')!, 750)).toBeCloseTo(0.7)
    const missing = editShowPropertyV2(added.record, { kind: 'show' }, { kind: 'remove-track', trackId: 'occ-0:animation' })
    expect(missing.status).toBe('refused'); expect(missing.record).toBe(added.record)
    const dormant = structuredClone(input); dormant.composition.groupOccurrences = []
    expect(editShowPropertyV2(dormant, { kind: 'group-definition', definitionId: 'definition' }, { kind: 'add-track', track: local }).affectedGroupOccurrenceIds).toEqual([])
  })
  it('refuses top-level and effective Group shared-owner conflicts but accepts half-open adjacency', () => {
    const input = propertyEditGroupRecord(); const local = propertyEditTrack({ kind: 'instance-time-scale', instanceId: 'slot' }); local.activeDurationMs = 400; local.keyframes[1].timeMs = 400
    input.composition.groupDefinitions[0].propertyTracks = [local]
    const overlap = propertyEditTrack({ kind: 'instance-time-scale', instanceId: 'instance' }); overlap.activeStartMs = 200; overlap.activeDurationMs = 100; overlap.keyframes[0].timeMs = 200; overlap.keyframes[1].timeMs = 300
    refused(input, { kind: 'show' }, { kind: 'add-track', track: overlap })
    input.composition.groupOccurrences.splice(1)
    overlap.activeStartMs = 500; overlap.keyframes[0].timeMs = 500; overlap.keyframes[1].timeMs = 600
    const adjacent = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track: overlap })
    expect(adjacent.status).toBe('changed'); expect(validateShowRecordV2(adjacent.record)).toEqual([])
  })
  it.each([
    { kind: 'update-key', trackId: 'animation', keyId: 'left', patch: { value: () => 1 } },
    { kind: 'update-track', trackId: 'animation', patch: { target: () => 1 } },
    { kind: 'add-track', track: { ...propertyEditTrack(), target: { kind: 'show-repeat-scale', unknown: () => 1 } } },
  ])('refuses non-data malformed intent values without throwing', intent => {
    const input = propertyEditRecord(); input.composition.propertyTracks = [propertyEditTrack()]
    refused(input, { kind: 'show' }, intent)
  })

  it('recognizes equal target data despite caller object field order', () => {
    const input = propertyEditRecord(); input.composition.propertyTracks = [propertyEditTrack()]
    const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'update-track', trackId: 'animation', patch: { target: { property: 'brightness', clipId: 'clip', kind: 'clip-view' } } })
    expect(result.status).toBe('unchanged'); expect(result.record).toBe(input); expect(result.affectedTrackIds).toEqual([])
  })

  it('distinguishes control export owners and preserves authoritative bound payload over stale local copies', () => {
    const input = propertyEditGroupRecord(); input.composition.groupDefinitions[0].patternInstances[0].controlTargets = { sliderGain: 0.99 }
    const local = propertyEditTrack({ kind: 'instance-control', instanceId: 'slot', exportName: 'sliderGain' }); local.activeDurationMs = 400; local.keyframes[1].timeMs = 400
    input.composition.groupDefinitions[0].propertyTracks = [local]
    const other = propertyEditTrack({ kind: 'instance-control', instanceId: 'instance', exportName: 'sliderOther' })
    const added = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track: other })
    expect(added.status).toBe('changed'); expect(added.affectedClipIds).toEqual(['clip', 'occ-0:child', 'occ-1:child'])
    expect(materializeShowGroupsV2(added.record).composition.patternInstances.find(instance => instance.id === 'instance')!.controlTargets).toEqual({ sliderGain: 0.4 })
    expect(added.record.composition.groupDefinitions[0].patternInstances).toEqual(input.composition.groupDefinitions[0].patternInstances)
  })

})

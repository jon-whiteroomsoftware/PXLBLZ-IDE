import { expect, it } from 'vitest'
import { propertyEditRecord, propertyEditTrack, propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { validateShowRecordV2 } from './showCompositionV2'
it('keeps source-dependent controls outside persisted CRUD validation and never seeds their payload', () => {
  const input = propertyEditRecord(); delete input.composition.patternInstances[0].controlTargets
  const authored = propertyEditTrack({ kind: 'instance-control', instanceId: 'instance', exportName: 'sliderGain' })
  const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track: authored })
  expect(result.status).toBe('changed'); expect(validateShowRecordV2(result.record)).toEqual([])
  expect(result.record.composition.patternInstances).toEqual(input.composition.patternInstances)
  const prepared = prepareShowV2ForCompile(result.record, { byCellId: {}, byPatternInstanceId: { instance: 'export function sliderGain(v){} export function render2D(i,x,y){rgb(1,0,0)}' }, stageDimension: 2 })
  expect(prepared.status).toBe('refused')
})
it.each(['show-repeat-scale', 'layout-occurrence-split-position'] as const)('refuses definition-local global-only target %s even with zero linked uses', kind => {
  const input = propertyEditGroupRecord(); input.composition.groupOccurrences = []
  const authored = propertyEditTrack(kind === 'show-repeat-scale' ? { kind } : { kind, layoutOccurrenceId: input.composition.layoutOccurrences[0].id }); authored.activeDurationMs = 400; authored.keyframes[1].timeMs = 400
  const result = editShowPropertyV2(input, { kind: 'group-definition', definitionId: 'definition' }, { kind: 'add-track', track: authored })
  expect(result.status).toBe('refused'); expect(result.record).toBe(input); expect(result.affectedTrackIds).toEqual([])
})
it('does not admit a repair operation on a malformed complete preimage', () => {
  const input = propertyEditRecord(); input.composition.propertyTracks = [propertyEditTrack()]; input.composition.propertyTracks[0].keyframes[0].timeMs = -1
  const before = structuredClone(input); const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'remove-track', trackId: 'animation' })
  expect(result.status).toBe('refused'); expect(result.record).toBe(input); expect(input).toEqual(before); expect(result.affectedTrackIds).toEqual([])
})
it('requires complete-candidate Layout availability even for an equal no-op', () => {
  const input = propertyEditRecord(); input.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 }); input.zoneLayouts[0].logical = { kind: 'single', zoneIds: ['other'] }; input.composition.propertyTracks = [propertyEditTrack()]
  const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'update-track', trackId: 'animation', patch: {} })
  expect(result.status).toBe('refused'); expect(result.record).toBe(input); expect(result.affectedTrackIds).toEqual([])
})
it('retargets explicitly while preserving unrelated key data and exact old/new owner effects', () => {
  const input = propertyEditRecord(); input.composition.propertyTracks = [propertyEditTrack()]
  const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'update-track', trackId: 'animation', patch: { target: { kind: 'instance-time-scale', instanceId: 'instance' } } })
  expect(result.status).toBe('changed'); expect(result.affectedClipIds).toEqual(['clip']); expect(result.affectedInstanceIds).toEqual(['instance']); expect(result.affectedPropertyKeyIds).toEqual([])
  expect(result.record.composition.propertyTracks[0].keyframes).toEqual(input.composition.propertyTracks[0].keyframes)
})
it('does not apply the repeat restriction range policy to complete endpoint authoring', () => {
  const input = propertyEditRecord(); const authored = propertyEditTrack({ kind: 'show-repeat-scale' }); authored.keyframes[0].value = 0.5
  const added = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track: authored })
  expect(added.status).toBe('changed'); expect(added.record.composition.propertyTracks[0]).toEqual(authored)
  const edited = editShowPropertyV2(added.record, { kind: 'show' }, { kind: 'update-key', trackId: authored.id, keyId: 'left', patch: { value: 0.4 } })
  expect(edited.status).toBe('changed'); expect(edited.record.composition.propertyTracks[0].keyframes[0].value).toBe(0.4)
})

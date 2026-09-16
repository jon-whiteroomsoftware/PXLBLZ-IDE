import { expect, it } from 'vitest'
import { propertyEditRecord, propertyEditTrack, propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { editShowPropertyV2, type ShowPropertyEditIntentV2 } from './showPropertyEditsV2'
import { reauthorShowPropertyKeyframeV2, evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { validateShowRecordV2, type ShowPropertyTrackV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
function retained(): ShowPropertyTrackV2 {
  const track = propertyEditTrack()
  track.keyframes = [0, 200, 400, 600, 800].map((timeMs, index) => ({ id: ['a', 'b', 'c', 'd', 'e'][index], timeMs, value: 0.1 + index * 0.2, easing: { curve: 'linear' }, ...(index < 4 ? { curveSegment: { baseValue: 0.1, deltaValue: 0.8, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 2000, elapsedOffsetMs: 100 + index * 200 } } : {}) }))
  return track
}
it('easing-only reauthor preserves preceding descriptor and agrees with existing record wrapper', () => {
  const input = propertyEditRecord(); input.composition.propertyTracks = [retained()]
  const patch = { easing: { curve: 'steps', steps: 2, position: 'end' } as const }
  const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'update-key', trackId: 'animation', keyId: 'b', patch })
  expect(result.status).toBe('changed'); const keys = result.record.composition.propertyTracks[0].keyframes
  expect(keys[0]).toEqual(input.composition.propertyTracks[0].keyframes[0]); expect(keys[1]).not.toHaveProperty('curveSegment'); expect(keys.slice(2)).toEqual(input.composition.propertyTracks[0].keyframes.slice(2))
  expect(evaluateShowPropertyTrackV2(result.record.composition.propertyTracks[0], 100)).toBeCloseTo(0.108)
  expect(evaluateShowPropertyTrackV2(result.record.composition.propertyTracks[0], 300)).toBeCloseTo(0.4)
  expect(result.record).toEqual(reauthorShowPropertyKeyframeV2(input, 'animation', 'b', patch).record)
})
it.each([
  { kind: 'update-key', trackId: 'animation', keyId: 'b', patch: { timeMs: 700 } },
  { kind: 'add-key', trackId: 'animation', key: { id: 'new', timeMs: 500, value: 0.6, easing: { curve: 'linear' } } },
  { kind: 'remove-key', trackId: 'animation', keyId: 'c' },
] as ShowPropertyEditIntentV2[])('only reauthors old/new adjacent retained kernels for $kind', intent => {
  const input = propertyEditRecord(); input.composition.propertyTracks = [retained()]
  const before = structuredClone(input); const result = editShowPropertyV2(input, { kind: 'show' }, intent); expect(result.status).toBe('changed'); expect(input).toEqual(before); expect(validateShowRecordV2(result.record)).toEqual([])
  const keys = result.record.composition.propertyTracks[0].keyframes
  const descriptors = keys.filter(key => key.curveSegment).map(key => key.id)
  expect(descriptors).toEqual(intent.kind === 'update-key' ? ['c'] : intent.kind === 'add-key' ? ['a', 'b', 'd'] : ['a', 'd'])
  if (intent.kind === 'update-key') { expect(keys.map(key => key.id)).toEqual(['a', 'c', 'd', 'b', 'e']); expect(keys.find(key => key.id === 'c')).toEqual(before.composition.propertyTracks[0].keyframes[2]) }
  if (intent.kind === 'remove-key') expect(result.affectedPropertyKeyIds).toEqual(['b', 'c'])
})
it('definition-local reauthor retains distant source kernel through both held linked projections', () => {
  const input = propertyEditGroupRecord(); const local = retained(); local.target = { kind: 'clip-view', clipId: 'child', property: 'brightness' }; local.activeDurationMs = 400; local.keyframes = local.keyframes.slice(0, 4).map((key, index) => ({ ...key, timeMs: [0, 100, 200, 400][index] })); delete local.keyframes[3].curveSegment; local.keyframes[2].value = 0.15
  input.composition.groupDefinitions[0].propertyTracks = [local]
  const before = structuredClone(input); const result = editShowPropertyV2(input, { kind: 'group-definition', definitionId: 'definition' }, { kind: 'update-key', trackId: 'animation', keyId: 'b', patch: { value: 0.5 } })
  expect(result.status).toBe('changed'); expect(result.affectedPropertyKeyIds).toEqual(['a', 'b']); expect(result.affectedGroupOccurrenceIds).toEqual(['occ-0', 'occ-1']); expect(input).toEqual(before)
  const edited = result.record.composition.groupDefinitions[0].propertyTracks[0]
  expect(edited.keyframes[0]).not.toHaveProperty('curveSegment'); expect(edited.keyframes[1]).not.toHaveProperty('curveSegment'); expect(edited.keyframes[2]).toEqual(local.keyframes[2])
  const effective = materializeShowGroupsV2(result.record)
  for (const start of [0, 500]) {
    const track = effective.composition.propertyTracks.find(track => track.id === `occ-${start / 500}:animation`)!
    expect(evaluateShowPropertyTrackV2(track, start + 50)).toBeCloseTo(0.3)
    expect(evaluateShowPropertyTrackV2(track, start + 199)).toBeCloseTo(0.1535)
    expect(evaluateShowPropertyTrackV2(track, start + 300)).toBeCloseTo(local.keyframes[2].value)
    expect(evaluateShowPropertyTrackV2(track, start + 301)).toBeCloseTo(0.1 + 0.8 * (501 / 2000) ** 2)
  }
})
it('nested key IDs are track-scoped and effects preserve repeated raw identities', () => {
  const input = propertyEditRecord(); const first = propertyEditTrack(); const second = propertyEditTrack({ kind: 'clip-view', clipId: 'clip', property: 'phase' }); second.id = 'phase'
  input.composition.propertyTracks = [first, second]
  const removed = editShowPropertyV2(input, { kind: 'show' }, { kind: 'remove-track', trackId: 'animation' })
  expect(removed.status).toBe('changed'); expect(removed.affectedPropertyKeyIds).toEqual(['left', 'right']); expect(removed.record.composition.propertyTracks).toEqual([second]); expect(removed.record.composition.patternInstances).toEqual(input.composition.patternInstances)
  const group = propertyEditGroupRecord(); const local = propertyEditTrack({ kind: 'clip-view', clipId: 'child', property: 'phase' }); local.id = 'animation'; local.activeDurationMs = 400; local.keyframes[1].timeMs = 400
  group.composition.propertyTracks = [first]
  expect(editShowPropertyV2(group, { kind: 'group-definition', definitionId: 'definition' }, { kind: 'add-track', track: local }).status).toBe('changed')
})
it.each([
  { id: 'last-descriptor', mutate: (track: ShowPropertyTrackV2) => { track.keyframes[1].curveSegment = { baseValue: 0, deltaValue: 1, easing: { curve: 'linear' }, sourceDurationMs: 1000, elapsedOffsetMs: 0 } } },
  { id: 'offset-overflow', mutate: (track: ShowPropertyTrackV2) => { track.keyframes[0].curveSegment = { baseValue: 0, deltaValue: 1, easing: { curve: 'linear' }, sourceDurationMs: 1000, elapsedOffsetMs: 1 } } },
  { id: 'duplicate-key-id', mutate: (track: ShowPropertyTrackV2) => { track.keyframes[1].id = 'left' } },
])('complete add-track refuses malformed retained source: $id', ({ mutate }) => {
  const input = propertyEditRecord(); const track = propertyEditTrack(); mutate(track)
  const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track }); expect(result.status).toBe('refused'); expect(result.record).toBe(input); expect(result.affectedTrackIds).toEqual([])
})

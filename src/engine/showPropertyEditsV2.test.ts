import { describe, expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { validateShowRecordV2, serializeProvisionalShowRecordV2, parseProvisionalShowRecordV2, type ShowRecordV2, type ShowPropertyTrackV2 } from './showCompositionV2'
import { editShowPropertyV2 } from './showPropertyEditsV2'
function record(): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(convertibleV1Show())
  if (result.status !== 'converted') throw Error('Fixture conversion')
  return result.record
}
function track(): ShowPropertyTrackV2 {
  return { id: 'brightness', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'left', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'right', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] }
}
function reopen(value: ShowRecordV2): ShowRecordV2 {
  const result = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(value))
  if (result.status !== 'opened') throw Error(JSON.stringify(result.issues))
  return result.record
}
describe('native persisted Property CRUD', () => {
  it('adds a complete track without changing runtime payload or aliasing caller/input', () => {
    const input = record(); const before = structuredClone(input); const payload = track()
    const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track: payload })
    expect(result.status).toBe('changed'); expect(validateShowRecordV2(result.record)).toEqual([])
    expect(reopen(result.record).composition.propertyTracks).toEqual([payload])
    expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
    expect(result.affectedTrackIds).toEqual(['brightness']); expect(result.affectedClipIds).toEqual(['clip'])
    expect(result.affectedPropertyKeyIds).toEqual(['left', 'right'])
    result.record.composition.propertyTracks[0].keyframes[0].value = 0.9
    expect(payload).toEqual(track()); expect(input).toEqual(before)
  })
  it('reauthors only endpoint-adjacent kernels, including an explicitly equal value', () => {
    const input = record(); const authored = track()
    authored.keyframes = [
      { id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'linear' }, curveSegment: { baseValue: 0, deltaValue: 1, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 100 } },
      { id: 'b', timeMs: 300, value: 0.4, easing: { curve: 'linear' }, curveSegment: { baseValue: 0, deltaValue: 1, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 400 } },
      { id: 'c', timeMs: 600, value: 0.7, easing: { curve: 'linear' }, curveSegment: { baseValue: 0, deltaValue: 1, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 700 } },
      { id: 'd', timeMs: 900, value: 1, easing: { curve: 'linear' } },
    ]
    input.composition.propertyTracks = [authored]
    const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'update-key', trackId: authored.id, keyId: 'b', patch: { value: 0.4 } })
    expect(result.status).toBe('changed')
    const keys = reopen(result.record).composition.propertyTracks[0].keyframes
    expect(keys[0]).not.toHaveProperty('curveSegment'); expect(keys[1]).not.toHaveProperty('curveSegment')
    expect(keys[2]).toEqual(authored.keyframes[2]); expect(input.composition.propertyTracks[0]).toEqual(authored)
    expect(result.affectedPropertyKeyIds).toEqual(['a', 'b'])
    const again = editShowPropertyV2(result.record, { kind: 'show' }, { kind: 'update-key', trackId: authored.id, keyId: 'b', patch: { value: 0.4 } })
    expect(again.status).toBe('unchanged'); expect(again.record).toBe(result.record)
  })

})

import { describe, expect, it } from 'vitest'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { validateShowRecordV2 } from './showCompositionV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show, flatV1Show } from '../test/showV2TracerFixture'

const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render(index) { rgb(1, 0, 0) }' } }

describe('Show v2 preparation admission', () => {
  it('refuses a valid track whose activation is outside its target Clip without throwing or mutating', () => {
    const result = convertShowRecordV1ToV2(convertibleV1Show())
    if (result.status !== 'converted') throw new Error('Fixture conversion failed')
    const record = result.record
    record.composition.clips[0].durationMs = 400
    record.composition.propertyTracks = [{
      id: 'outside', target: { kind: 'clip-opacity', clipId: record.composition.clips[0].id },
      activeStartMs: 400, activeDurationMs: 600,
      keyframes: [
        { id: 'a', timeMs: 400, value: 1, easing: { curve: 'linear' } },
        { id: 'b', timeMs: 1000, value: 0, easing: { curve: 'linear' } },
      ],
    }]
    expect(validateShowRecordV2(record)).toEqual([])
    const before = structuredClone(record)
    expect(prepareShowV2ForCompile(record, lookup)).toMatchObject({ status: 'refused', issues: [{ code: 'unsupported-track-activation', path: 'composition.propertyTracks[0]' }] })
    expect(record).toEqual(before)
  })
})


it('refuses shared flat runtime appearance changes that the legacy recipe would split', () => {
  const converted = convertShowRecordV1ToV2(flatV1Show(false), { byCellId: { 'cell-a': lookup.byPatternInstanceId.instance } })
  if (converted.status !== 'converted') throw new Error('Fixture conversion failed')
  const record = converted.record
  record.composition.clips[1].appearance.keys[0].value.view.brightness = 0.5
  expect(validateShowRecordV2(record)).toEqual([])
  expect(prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: { 'cell-a': lookup.byPatternInstanceId.instance } })).toMatchObject({ status: 'refused', issues: [{ code: 'unsupported-runtime-sharing' }] })
})

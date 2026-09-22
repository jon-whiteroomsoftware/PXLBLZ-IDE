import { describe, expect, it } from 'vitest'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { createDefaultShow } from './showModel'
import { withoutUnusedInstanceTracksV2 } from './showFlatLoweringV2'

function convertedDefaultShow(): ShowRecordV2 {
  const source = createDefaultShow('flat-filter', 'Flat filter', 1)
  const converted = convertShowRecordV1ToV2(source, { byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.status === 'refused' ? converted.issues : []))
  return converted.record
}

function keyframes(startMs: number, endMs: number, prefix: string) {
  return [
    { id: `${prefix}-k0`, timeMs: startMs, value: 0.2, easing: { curve: 'linear' as const } },
    { id: `${prefix}-k1`, timeMs: endMs, value: 0.8, easing: { curve: 'linear' as const } },
  ]
}

describe('withoutUnusedInstanceTracksV2', () => {
  it('drops only unused instance-control and instance-time-scale tracks', () => {
    const record = convertedDefaultShow()
    const usedId = record.composition.patternInstances[0].id
    const clipId = record.composition.clips[0].id
    record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'unused-instance' })
    record.composition.propertyTracks.push(
      { id: 'used-control', target: { kind: 'instance-control', instanceId: usedId, exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: keyframes(0, 1000, 'used-control') },
      { id: 'unused-control', target: { kind: 'instance-control', instanceId: 'unused-instance', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: keyframes(0, 1000, 'unused-control') },
      { id: 'unused-scale', target: { kind: 'instance-time-scale', instanceId: 'unused-instance' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: keyframes(0, 1000, 'unused-scale') },
      { id: 'clip-track', target: { kind: 'clip-view', clipId, property: 'brightness' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: keyframes(0, 1000, 'clip-track') },
    )
    expect(validateShowRecordV2(record)).toEqual([])
    const filtered = withoutUnusedInstanceTracksV2(record)
    expect(filtered).not.toBe(record)
    expect(filtered.composition.propertyTracks.map(track => track.id).sort()).toEqual(['clip-track', 'used-control'])
    expect(record.composition.propertyTracks.map(track => track.id).sort()).toEqual(['clip-track', 'unused-control', 'unused-scale', 'used-control'])
  })

  it('returns the same object when nothing is filtered', () => {
    const record = convertedDefaultShow()
    expect(withoutUnusedInstanceTracksV2(record)).toBe(record)
    const usedId = record.composition.patternInstances[0].id
    record.composition.propertyTracks.push(
      { id: 'used-control', target: { kind: 'instance-control', instanceId: usedId, exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: keyframes(0, 1000, 'used-control') },
    )
    expect(validateShowRecordV2(record)).toEqual([])
    expect(withoutUnusedInstanceTracksV2(record)).toBe(record)
  })
})

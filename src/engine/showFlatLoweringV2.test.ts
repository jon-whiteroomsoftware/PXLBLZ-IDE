import { describe, expect, it } from 'vitest'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { addShowZone, createDefaultShow, createShowWithOutputContract, updateShowBoundaryTransition, updateShowRoutingLayout } from './showModel'
import { createInstallationShowOutputContract } from './showOutputContract'
import { canLowerShowV2ToFlat, withoutUnusedInstanceTracksV2 } from './showFlatLoweringV2'

function convertedDefaultShow(): ShowRecordV2 {
  const source = createDefaultShow('flat-filter', 'Flat filter', 1)
  const converted = convertShowRecordV1ToV2(source, { byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.status === 'refused' ? converted.issues : []))
  return converted.record
}

function wholeOutputRecord(): ShowRecordV2 {
  let show = createShowWithOutputContract('fresh-id', 'Fresh Show', createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }))
  show = addShowZone(show)
  show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
    logical: { kind: 'split', zoneIds: [show.zones[0].id, show.zones[1].id] as [string, string], axis: 'x' },
  })
  show = updateShowBoundaryTransition(show, 'transition-scene-1', {
    propertyTransitions: { routing: { splitPosition: { from: 0.5, durationMs: 2000, easing: { curve: 'linear' } } } },
  })
  const converted = convertShowRecordV1ToV2(show, { byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.status === 'refused' ? converted.issues : []))
  return converted.record
}

function participantRecord(): ShowRecordV2 {
  let show = createShowWithOutputContract('fresh-id', 'Fresh Show', createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }))
  show = addShowZone(show)
  show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
    logical: { kind: 'split', zoneIds: [show.zones[0].id, show.zones[1].id] as [string, string], axis: 'x' },
  })
  const converted = convertShowRecordV1ToV2(show, { byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.status === 'refused' ? converted.issues : []))
  return converted.record
}

function withUnrelatedClip(record: ShowRecordV2, startMs: number, durationMs: number): ShowRecordV2 {
  const next = structuredClone(record)
  const zone2Main = next.composition.layers.find(layer => layer.zoneId === next.zones[1].id && layer.rank === 0)!
  const template = next.composition.patternInstances[0]
  next.composition.patternInstances.push({ ...structuredClone(template), id: 'unrelated-instance' })
  next.composition.clips.push({
    id: 'unrelated-clip',
    instanceId: 'unrelated-instance',
    zoneId: next.zones[1].id,
    layerId: zone2Main.id,
    startMs,
    durationMs,
    entryPolicy: 'continue',
    zoneSampleMode: 'independent',
    appearance: { keys: [{ id: 'unrelated-clip:appearance:1', timeMs: startMs, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
  })
  return next
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

describe('whole-output boundary admission on the flat route (#1082)', () => {
  it('admits contributors abutting the window with the flag and refuses without it', () => {
    const record = wholeOutputRecord()
    expect(validateShowRecordV2(record)).toEqual([])
    expect(record.composition.transitions).toHaveLength(1)
    expect(record.composition.transitions[0].wholeOutput).toBeDefined()
    expect(canLowerShowV2ToFlat(record)).toBe(false)
    expect(canLowerShowV2ToFlat(record, true, false)).toBe(false)
    expect(canLowerShowV2ToFlat(record, false, true)).toBe(true)
    expect(canLowerShowV2ToFlat(record, true, true)).toBe(true)
  })

  it.each([
    ['touching at the window start', 0, 30000],
    ['touching at the window end', 32000, 30000],
    ['overlapping the window', 20000, 20000],
  ])('refuses an unrelated Clip %s either way', (_name, startMs, durationMs) => {
    const record = withUnrelatedClip(wholeOutputRecord(), startMs, durationMs)
    expect(canLowerShowV2ToFlat(record)).toBe(false)
    expect(canLowerShowV2ToFlat(record, false, true)).toBe(false)
    expect(canLowerShowV2ToFlat(record, true, true)).toBe(false)
  })

  it('leaves participant admission unchanged', () => {
    const record = participantRecord()
    expect(record.composition.transitions[0].wholeOutput).toBeUndefined()
    expect(canLowerShowV2ToFlat(record)).toBe(true)
    expect(canLowerShowV2ToFlat(record, false, true)).toBe(true)
    expect(canLowerShowV2ToFlat(record, true, true)).toBe(true)
  })

  it('still refuses a touching Clip on the participant route either way', () => {
    const record = withUnrelatedClip(participantRecord(), 0, 30000)
    expect(canLowerShowV2ToFlat(record)).toBe(false)
    expect(canLowerShowV2ToFlat(record, false, true)).toBe(false)
  })
})

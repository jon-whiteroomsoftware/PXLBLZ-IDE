import { describe, expect, it } from 'vitest'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import type { ShowRecord } from './personalContentRecords'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { removeShowBoundaryTransition, updateShowBoundaryTransition } from './showModel'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { convertedBoundaryRepairSpecV2, editShowTransitionV2 } from './showTransitionsV2'

/**
 * #1066 slice 5e2a1: a converted Scene boundary in a two-Zone Show lands at
 * whole-output scope with one Clip per Zone on each side. v1 retimes and
 * resets that one Scene edge for every Zone, so v2's resize and Reset to Cut
 * must equal v1 then convert. The stock property-animation Show's two
 * Crossfade boundaries are such boundaries; their scalar ramps are cleared
 * through v1's own edit, because ramp carriers are a later slice.
 */
const BOUNDARIES = ['transition-effect-parameter', 'transition-split-position'] as const

function twoZoneV1(): ShowRecord {
  let show = structuredClone(STOCK_SHOWS.find(candidate => candidate.id === 'stock-show-reference-property-animation')!.show) as ShowRecord
  for (const id of BOUNDARIES) show = updateShowBoundaryTransition(show, id, { propertyTransitions: undefined })
  return show
}

function convert(show: ShowRecord): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(show, {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
  })
  if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
  expect(validateShowRecordV2(result.record)).toEqual([])
  return result.record
}

function shape(record: ShowRecordV2) {
  return {
    showEndMs: record.composition.showEndMs,
    clips: record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs]),
    transitions: record.composition.transitions,
    occurrences: record.composition.layoutOccurrences.map(occurrence => [occurrence.id, occurrence.startMs, occurrence.durationMs]),
    markers: record.composition.markers.map(marker => [marker.id, marker.timeMs]),
    tracks: record.composition.propertyTracks,
  }
}

describe('multi-Zone converted boundary repair (#1066 slice 5e2a1)', () => {
  it.each(BOUNDARIES)('converts %s to whole-output with one Clip per Zone on each side and no ramps', (id) => {
    const boundary = convert(twoZoneV1()).composition.transitions.find(transition => transition.id === id)!
    expect(boundary.wholeOutput?.fromClipIds).toHaveLength(2)
    expect(boundary.wholeOutput?.toClipIds).toHaveLength(2)
    expect(boundary.propertyRamps).toEqual([])
  })

  it.each(BOUNDARIES.flatMap(id => [500, 1000, 3000].map(durationMs => ({ id, durationMs }))))('retimes $id to $durationMs ms exactly as v1 then convert', ({ id, durationMs }) => {
    const v1 = twoZoneV1()
    const expected = convert(updateShowBoundaryTransition(v1, id, { durationMs }))
    const result = editShowTransitionV2(convert(v1), { kind: 'resize-transition', transitionId: id, durationMs })
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    expect(shape(result.record)).toEqual(shape(expected))
  })

  it.each(BOUNDARIES)('resets %s to a Cut exactly as v1 then convert', (id) => {
    const v1 = twoZoneV1()
    const expected = convert(removeShowBoundaryTransition(v1, id))
    const result = editShowTransitionV2(convert(v1), { kind: 'reset-to-cut', transitionId: id })
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    expect(shape(result.record)).toEqual(shape(expected))
  })

  it('keeps the Clip-edge gestures single-contributor', () => {
    expect(convertedBoundaryRepairSpecV2(convert(twoZoneV1()), BOUNDARIES[0])).toEqual({ status: 'ignore' })
    expect(convertedBoundaryRepairSpecV2(convert(twoZoneV1()), BOUNDARIES[0], { multiContributor: true }).status).toBe('ready')
  })
})

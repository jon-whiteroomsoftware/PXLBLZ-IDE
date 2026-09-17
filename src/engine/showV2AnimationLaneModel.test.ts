import { describe, expect, it } from 'vitest'
import { buildShowV2AnimationLanes } from './showV2AnimationLaneModel'
import { evaluateShowPropertyKeysV2 } from './showPropertyTrackTimeMappingV2'
import { restrictShowPropertyTrackV2 } from './showPropertyTrackTimeMappingV2'
import { projectShowTimelineV2 } from './showTimelineViewModelV2'
import { propertyEditGroupRecord, propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { validateShowRecordV2, type ShowPropertyTrackV2, type ShowRecordV2 } from './showCompositionV2'

/**
 * Lane geometry for the v2 animation lanes.
 *
 * The one behaviour worth a dedicated oracle is honesty about a retained curve:
 * specification section 6 says a restricted interval keeps the mathematical
 * coefficients of the original curve, so the lane must draw what the authored
 * curve did over that interval. Re-normalizing it to a straight line between the
 * retained endpoints is the failure this test exists to catch.
 */
const SOURCE: ShowPropertyTrackV2 = {
  id: 'brightness',
  target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
  activeStartMs: 0,
  activeDurationMs: 4000,
  keyframes: [
    { id: 'left', timeMs: 0, value: 0, easing: { curve: 'quadratic', direction: 'in' } },
    { id: 'right', timeMs: 4000, value: 1, easing: { curve: 'linear' } },
  ],
}

function recordWith(tracks: ShowPropertyTrackV2[]): ShowRecordV2 {
  const record = propertyEditRecord()
  record.composition.showEndMs = 4000
  record.composition.layoutOccurrences[0].durationMs = 4000
  record.composition.clips[0].durationMs = 4000
  record.composition.propertyTracks = tracks
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function laneValueAt(lane: ReturnType<typeof buildShowV2AnimationLanes>[number], timeMs: number): number {
  const sample = lane.samples.find(candidate => candidate.timeMs === timeMs)
  expect(sample, `no lane sample at ${timeMs} ms`).toBeDefined()
  return sample!.value
}

describe('v2 animation lane model', () => {
  it('draws a restricted curve from its retained descriptor, not from its endpoints', () => {
    const restricted = restrictShowPropertyTrackV2([SOURCE], SOURCE, 1000, 3000)
    expect(restricted).toBeDefined()
    expect(restricted!.keyframes[0].curveSegment).toBeDefined()

    // Nine samples across the 2000 ms retained interval land on exact 250 ms
    // probes, so the oracle compares values rather than nearest neighbours.
    const lanes = buildShowV2AnimationLanes(projectShowTimelineV2(recordWith([restricted!])), { sampleCount: 9 })
    expect(lanes).toHaveLength(1)
    const lane = lanes[0]
    expect(lane.retainedCurveKeyIds).toEqual([restricted!.keyframes[0].id])

    // The oracle is the original authored curve, evaluated over the retained
    // interval; the restriction promised to preserve exactly that.
    for (const timeMs of [1250, 1500, 2000, 2500, 2750]) {
      expect(laneValueAt(lane, timeMs)).toBeCloseTo(evaluateShowPropertyKeysV2(SOURCE.keyframes, timeMs), 10)
    }
    // A two-point re-normalization would put the midpoint halfway between the
    // retained endpoints; the quadratic ease-in does not.
    const [startValue, endValue] = [lane.keys[0].value, lane.keys[lane.keys.length - 1].value]
    expect(laneValueAt(lane, 2000)).not.toBeCloseTo((startValue + endValue) / 2, 4)
  })

  it('samples an ordinary curve at its own easing and marks no retained key', () => {
    const lanes = buildShowV2AnimationLanes(projectShowTimelineV2(recordWith([SOURCE])), { sampleCount: 9 })
    const lane = lanes[0]

    expect(lane.retainedCurveKeyIds).toEqual([])
    expect(laneValueAt(lane, 2000)).toBeCloseTo(0.25, 10)
    expect(lane.keys.map(key => key.id)).toEqual(['left', 'right'])
  })

  it('places the lane in its own owner time domain and normalizes its display', () => {
    const record = propertyEditGroupRecord()
    record.composition.groupDefinitions[0].propertyTracks = [{
      ...structuredClone(SOURCE),
      id: 'local',
      target: { kind: 'clip-opacity', clipId: 'child' },
      activeDurationMs: 400,
      keyframes: [
        { id: 'local-left', timeMs: 0, value: 0.25, easing: { curve: 'linear' } },
        { id: 'local-right', timeMs: 400, value: 0.75, easing: { curve: 'linear' } },
      ],
    }]
    expect(validateShowRecordV2(record)).toEqual([])
    const lanes = buildShowV2AnimationLanes(projectShowTimelineV2(record), { sampleCount: 8 })
    const lane = lanes.find(candidate => candidate.trackId === 'local')

    expect(lane).toBeDefined()
    expect(lane!.ownerKind).toBe('group-definition')
    expect(lane!.alignedToShowTime).toBe(false)
    expect(lane!.ownerLabel).toBe('Definition')
    expect(lane!.domainMs).toBe(400)
    // The display ordinate is inverted: the highest authored value draws highest.
    expect(lane!.keys[0].displayY).toBeCloseTo(1, 10)
    expect(lane!.keys[1].displayY).toBeCloseTo(0, 10)
  })

  it('draws a constant track mid-lane instead of dividing by a zero range', () => {
    const flat: ShowPropertyTrackV2 = {
      ...structuredClone(SOURCE),
      id: 'flat',
      keyframes: [
        { id: 'a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
        { id: 'b', timeMs: 4000, value: 0.5, easing: { curve: 'linear' } },
      ],
    }
    const lane = buildShowV2AnimationLanes(projectShowTimelineV2(recordWith([flat])), { sampleCount: 8 })[0]

    expect(lane.valueMin).toBe(0.5)
    expect(lane.valueMax).toBe(0.5)
    expect(lane.samples.every(sample => sample.displayY === 0.5)).toBe(true)
    expect(lane.points.split(' ')).toHaveLength(lane.samples.length)
  })

  it('returns no lanes for a view that resolves no Property tracks', () => {
    expect(buildShowV2AnimationLanes({ ...projectShowTimelineV2(recordWith([])), propertyTracks: undefined }))
      .toEqual([])
  })
})

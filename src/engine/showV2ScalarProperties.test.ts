import { describe, expect, it } from 'vitest'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import type { ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import { showV2SampleRepeatLaneVisible } from './showV2ScalarProperties'

/** #1066 slice 9c1: the lane shows whenever any repeat-scale source exists, one partition per source. */
describe('showV2SampleRepeatLaneVisible', () => {
  function transition(record: ShowRecordV2): ShowTransitionV2 {
    return {
      id: 'join', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live', propertyRamps: [],
      participants: [{ id: 'pair', zoneId: record.zones[0].id, layerId: record.composition.layers[0].id, fromClipId: 'a', toClipId: 'b' }],
    }
  }

  it('hides the lane with no repeat-scale source', () => {
    const record = commandFixtureV2()
    record.composition.transitions = [transition(record)]
    expect(showV2SampleRepeatLaneVisible(record)).toBe(false)
  })

  it('shows the lane for converted repeat-scale provenance at scale 1', () => {
    const record = commandFixtureV2()
    record.composition.sampleRemap = { repeatScale: 1, origin: 'converted-authored-repeat-scale' }
    expect(showV2SampleRepeatLaneVisible(record)).toBe(true)
  })

  it('shows the lane for a non-unit base repeat scale', () => {
    const record = commandFixtureV2()
    record.composition.sampleRemap = { repeatScale: 2 }
    expect(showV2SampleRepeatLaneVisible(record)).toBe(true)
  })

  it('shows the lane for a Show repeat-scale track', () => {
    const record = commandFixtureV2()
    record.composition.propertyTracks = [{ id: 'held', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 1_000, keyframes: [{ id: 'held-k0', timeMs: 0, value: 1, easing: { curve: 'hold', at: 1 } }] }]
    expect(showV2SampleRepeatLaneVisible(record)).toBe(true)
  })

  it('shows the lane for a boundary repeat-scale ramp', () => {
    const record = commandFixtureV2()
    const join = transition(record)
    join.propertyRamps = [{ target: { kind: 'show-repeat-scale' }, from: 1 }]
    record.composition.transitions = [join]
    expect(showV2SampleRepeatLaneVisible(record)).toBe(true)
  })
})

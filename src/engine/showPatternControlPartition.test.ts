import { describe, expect, it } from 'vitest'
import type { ShowPropertyAnimationTarget, ShowPropertyAnimationTrack } from './personalContentRecords'
import { partitionShowPatternControls } from './showPatternControlPartition'

function track(id: string, target: ShowPropertyAnimationTarget): ShowPropertyAnimationTrack {
  return {
    id,
    target,
    keyframes: [
      { id: `${id}-start`, timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
      { id: `${id}-end`, timeMs: 1_000, value: 0.8, easing: { curve: 'linear' } },
    ],
  }
}

describe('Show Pattern control partition', () => {
  it('keeps only control state the incoming Pattern exports', () => {
    const controlTargets = { sliderShared: 0.4, sliderOrphaned: 0.7 }
    const propertyTracks = [
      track('track-shared', {
        kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderShared',
      }),
      track('track-orphaned', {
        kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderOrphaned',
      }),
      track('track-time', { kind: 'instance-time-scale', instanceId: 'instance-a' }),
    ]
    const originalTargets = structuredClone(controlTargets)
    const originalTracks = structuredClone(propertyTracks)

    const partition = partitionShowPatternControls(
      'instance-a',
      controlTargets,
      propertyTracks,
      new Set(['sliderShared']),
    )

    expect(partition).toEqual({
      keptControlTargets: { sliderShared: 0.4 },
      removedControlTargets: { sliderOrphaned: 0.7 },
      keptPropertyTracks: [propertyTracks[0], propertyTracks[2]],
      removedPropertyTracks: [propertyTracks[1]],
    })
    expect(controlTargets).toEqual(originalTargets)
    expect(propertyTracks).toEqual(originalTracks)
  })

  it('removes every target-instance control for an empty slider manifest', () => {
    const targetControl = track('track-target-control', {
      kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderSpeed',
    })
    const otherControl = track('track-other-control', {
      kind: 'instance-control', instanceId: 'instance-b', exportName: 'sliderSpeed',
    })
    const transform = track('track-transform', {
      kind: 'placement-transform', placementId: 'placement-a', property: 'positionX',
    })

    expect(partitionShowPatternControls(
      'instance-a',
      { sliderSpeed: 0.4 },
      [targetControl, otherControl, transform],
      new Set(),
    )).toEqual({
      removedControlTargets: { sliderSpeed: 0.4 },
      keptPropertyTracks: [otherControl, transform],
      removedPropertyTracks: [targetControl],
    })
  })

  it('keeps base values without tracks when every control is shared', () => {
    expect(partitionShowPatternControls(
      'instance-a',
      { sliderSpeed: 0.4, sliderScale: 0.6 },
      undefined,
      new Set(['sliderSpeed', 'sliderScale']),
    )).toEqual({
      keptControlTargets: { sliderSpeed: 0.4, sliderScale: 0.6 },
    })
  })

  it('returns an empty partition when the instance has no control state', () => {
    expect(partitionShowPatternControls(
      'instance-a',
      undefined,
      undefined,
      new Set(['sliderSpeed']),
    )).toEqual({})
  })
})

import { describe, expect, it } from 'vitest'
import type { ShowPropertyAnimationTrack } from './personalContentRecords'
import { propertyTargetKey } from './showPropertyAnimation'
import { projectShowPropertyAnimationOverview, type ShowPropertyAnimationOption } from './showPropertyAnimationEditorModel'
import { showPropertyKeyframeInsertion } from './showPropertyAnimationEditorModel'

describe('Add-keyframe insertion policy (#363)', () => {
  const keyframe = (
    id: string,
    timeMs: number,
    value: number,
    easing: ShowPropertyAnimationTrack['keyframes'][number]['easing'] = { curve: 'linear' },
  ) => ({ id, timeMs, value, easing })
  const percentOption = { min: 0, max: 1, step: 0.01 }

  it('splits the largest linear segment at its midpoint with the evaluated value', () => {
    const track: ShowPropertyAnimationTrack = {
      id: 'track',
      target: { kind: 'placement-opacity', placementId: 'p' },
      keyframes: [
        keyframe('a', 0, 0),
        keyframe('b', 2_000, 0.5),
        keyframe('c', 10_000, 1),
      ],
    }
    expect(showPropertyKeyframeInsertion(track, percentOption)).toMatchObject({
      timeMs: 6_000,
      value: 0.75,
      easing: { curve: 'linear' },
    })
  })

  it('treats an eased hold between equal values as lossless', () => {
    const track: ShowPropertyAnimationTrack = {
      id: 'track',
      target: { kind: 'placement-opacity', placementId: 'p' },
      keyframes: [
        keyframe('a', 2_000, 0.65, { curve: 'sine', direction: 'in-out' }),
        keyframe('b', 9_000, 0.65, { curve: 'sine', direction: 'in-out' }),
        keyframe('c', 12_000, 0, { curve: 'sine', direction: 'in-out' }),
      ],
    }
    // The 2s-9s hold is the only lossless gap: it is eased but constant.
    expect(showPropertyKeyframeInsertion(track, percentOption)).toMatchObject({
      timeMs: 5_500,
      value: 0.65,
      easing: { curve: 'sine', direction: 'in-out' },
    })
  })

  it('offers nothing when every segment is a moving eased curve', () => {
    const track: ShowPropertyAnimationTrack = {
      id: 'track',
      target: { kind: 'placement-opacity', placementId: 'p' },
      keyframes: [
        keyframe('a', 0, 0, { curve: 'quadratic', direction: 'in' }),
        keyframe('b', 10_000, 1, { curve: 'quadratic', direction: 'in' }),
      ],
    }
    // Splitting a moving eased segment re-eases each half and reshapes the
    // animation, so no silent insertion is offered.
    expect(showPropertyKeyframeInsertion(track, percentOption)).toBeNull()
  })

  it('skips a linear gap whose midpoint does not land on an integer step grid', () => {
    const track: ShowPropertyAnimationTrack = {
      id: 'track',
      target: {
        kind: 'placement-effect',
        placementId: 'p',
        effectId: 'posterize',
        effectKind: 'posterize',
        parameterId: 'levels',
      },
      keyframes: [
        keyframe('a', 0, 8),
        keyframe('b', 10_000, 9),
        keyframe('c', 12_000, 9),
      ],
    }
    // The big 8-to-9 ramp has no representable midpoint at step 1, so the
    // insertion falls through to the constant tail instead of quantizing a
    // curve change in or letting validation reject the keyframe.
    expect(showPropertyKeyframeInsertion(track, { min: 2, max: 16, step: 1 })).toMatchObject({
      timeMs: 11_000,
      value: 9,
    })
  })
})

describe('Add-keyframe rotation grid tolerance (#363)', () => {
  it('accepts whole-degree Rotation holds despite the irrational 1/360 step', () => {
    const track: ShowPropertyAnimationTrack = {
      id: 'track',
      target: { kind: 'placement-transform', placementId: 'p', property: 'rotation' },
      keyframes: [
        { id: 'a', timeMs: 0, value: 30 / 360, easing: { curve: 'sine', direction: 'in-out' } },
        { id: 'b', timeMs: 8_000, value: 30 / 360, easing: { curve: 'sine', direction: 'in-out' } },
      ],
    }
    const insertion = showPropertyKeyframeInsertion(track, { min: -8, max: 8, step: 1 / 360 })
    expect(insertion?.timeMs).toBe(4_000)
    // Snapping to the float step grid may differ from the endpoint value by
    // an ulp; the contract is sub-visual closeness, not bit equality.
    expect(insertion?.value).toBeCloseTo(30 / 360, 12)
  })
})

describe('Add-keyframe odd-duration snapping (#363)', () => {
  it('snaps a hair-off-grid integer midpoint to the exact integer', () => {
    const track: ShowPropertyAnimationTrack = {
      id: 'track',
      target: {
        kind: 'placement-effect',
        placementId: 'p',
        effectId: 'posterize',
        effectKind: 'posterize',
        parameterId: 'levels',
      },
      keyframes: [
        { id: 'a', timeMs: 0, value: 8, easing: { curve: 'linear' } },
        { id: 'b', timeMs: 1_000_001, value: 10, easing: { curve: 'linear' } },
      ],
    }
    // The float midpoint of an odd-length 8-to-10 ramp evaluates a hair off
    // 9; the stored value must be the exact integer or validation rejects it.
    const insertion = showPropertyKeyframeInsertion(track, { min: 2, max: 16, step: 1 })
    expect(insertion?.value).toBe(9)
    expect(Number.isInteger(insertion?.value)).toBe(true)
  })
})

describe('Seconds-presented pattern controls (#819)', () => {
  const target = { kind: 'instance-control', instanceId: 'i', exportName: 'sliderLoopInterval' } as const
  const secondsOption: ShowPropertyAnimationOption = {
    key: propertyTargetKey(target),
    label: 'sliderLoopInterval',
    target,
    value: 0.237,
    min: 0,
    max: 1,
    step: 0.001 / 10,
    presentation: 'percentage',
    secondsPresentation: { scale: 10, minSeconds: 0.1 },
  }

  it('inserts a lossless keyframe on a constant seconds hold', () => {
    // 2.37 s stores as raw 0.237. The percentage grid (step 0.01) would
    // quantize the midpoint to 0.24 and reject it; the seconds grid keeps the
    // exact value representable.
    const track: ShowPropertyAnimationTrack = {
      id: 'track',
      target,
      keyframes: [
        { id: 'a', timeMs: 0, value: 0.237, easing: { curve: 'linear' } },
        { id: 'b', timeMs: 8_000, value: 0.237, easing: { curve: 'linear' } },
      ],
    }
    const insertion = showPropertyKeyframeInsertion(track, secondsOption)
    expect(insertion?.timeMs).toBe(4_000)
    expect(insertion?.value).toBeCloseTo(0.237, 9)
  })

  it('formats overview values as the seconds that actually play', () => {
    // Legacy raw-zero targets are valid records; the Luma runtime floors the
    // loop at minSeconds, so the overview reports 0.1s, not 0s.
    const rows = projectShowPropertyAnimationOverview(
      {
        tracks: [{
          id: 'track',
          target,
          keyframes: [
            { id: 'a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
            { id: 'b', timeMs: 4_000, value: 0.237, easing: { curve: 'linear' } },
          ],
        }],
        trackIssues: {},
        showTimeOffsetMs: 0,
        instanceUseCount: 1,
      },
      [secondsOption],
    )
    expect(rows[0]?.valueRange).toBe('0.1s → 2.37s')
  })
})

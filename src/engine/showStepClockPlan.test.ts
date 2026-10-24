import { describe, expect, it } from 'vitest'
import type { ShowStructuredEasing } from './personalContentRecords'
import type { ShowPropertyCurveSegment } from './showPropertyAnimation'
import {
  isShowStepClockValue,
  planShowStepClock,
  validateShowStepClockTrack,
  type ShowStepClockTrack,
} from './showStepClockPlan'

const HOLD = { curve: 'hold', at: 1 } as const
const VALUE_MESSAGE = 'Step length must be 0 (continuous) or an integer from 16 to 60000 ms.'
const EASING_MESSAGE = 'Step-length changes require Hold easing at the next key.'
const SEGMENT_MESSAGE = 'Retained step-length segments must preserve a held value.'

function track(id: string, start: number, duration: number, pairs: [number, number][]): ShowStepClockTrack {
  return {
    id,
    activeStartMs: start,
    activeDurationMs: duration,
    keyframes: pairs.map(([timeMs, value], index) => ({ id: `${id}-${index}`, timeMs, value, easing: HOLD })),
  }
}

function segment(patch: Partial<ShowPropertyCurveSegment> = {}): ShowPropertyCurveSegment {
  return { baseValue: 250, deltaValue: 250, easing: HOLD, sourceDurationMs: 1000, elapsedOffsetMs: 100, ...patch }
}

function freezeTrack(input: ShowStepClockTrack): ShowStepClockTrack {
  for (const key of input.keyframes) {
    Object.freeze(key.easing)
    if (key.curveSegment) {
      Object.freeze(key.curveSegment.easing)
      Object.freeze(key.curveSegment)
    }
    Object.freeze(key)
  }
  Object.freeze(input.keyframes)
  return Object.freeze(input)
}

describe('step-clock request value validation (#1211)', () => {
  it.each([0, 16, 125, 250, 500, 31_999, 32_000, 32_001, 40_000, 60_000])('accepts %s without changing it', value => {
    const original = value
    expect(isShowStepClockValue(value)).toBe(true)
    expect(value).toBe(original)
  })

  it.each([NaN, Infinity, -Infinity, -1, 1, 15, 16.5, 60_001, Number.MAX_SAFE_INTEGER])('rejects %s without changing it', value => {
    const original = value
    expect(isShowStepClockValue(value)).toBe(false)
    expect(value).toBe(original)
  })

  it('reports every illegal key value, including the terminal value', () => {
    const input = track('invalid', 0, 300, [[0, -1], [100, 16.5], [200, Infinity], [300, 60_001]])
    expect(validateShowStepClockTrack(input)).toEqual([0, 1, 2, 3].map(keyframeIndex => ({
      keyframeIndex, field: 'value', message: VALUE_MESSAGE,
    })))
  })

  it.each<ShowStructuredEasing>([{ curve: 'linear' }, { curve: 'hold', at: 0.5 }])(
    'rejects outgoing $curve easing even between equal values', easing => {
      const input = track('easing', 0, 100, [[0, 250], [100, 250]])
      input.keyframes[0].easing = easing
      expect(validateShowStepClockTrack(input)).toEqual([
        { keyframeIndex: 0, field: 'easing', message: EASING_MESSAGE },
      ])
    })

  it('accepts held keys and ignores otherwise-valid terminal easing', () => {
    const input = track('terminal', 0, 200, [[0, 0], [100, 250], [200, 500]])
    input.keyframes[2].easing = { curve: 'linear' }
    expect(validateShowStepClockTrack(input)).toEqual([])
  })

  it.each([
    { name: 'rising held source', retained: segment() },
    { name: 'constant held source', retained: segment({ deltaValue: 0 }) },
    { name: 'continuous endpoint', retained: segment({ deltaValue: -250 }) },
    { name: 'maximum endpoint', retained: segment({ deltaValue: 59_750 }) },
    { name: 'zero base', retained: segment({ baseValue: 0, deltaValue: 16 }), value: 0 },
  ])('preserves a legal retained descriptor: $name', ({ retained, value = 250 }) => {
    const input = track('retained', 0, 500, [[0, value], [500, 500]])
    input.keyframes[0].curveSegment = retained
    const original = structuredClone(input)
    expect(validateShowStepClockTrack(freezeTrack(input))).toEqual([])
    expect(input).toEqual(original)
  })

  it.each([
    { name: 'different base', retained: segment({ baseValue: 125 }) },
    { name: 'fractional base', retained: segment({ baseValue: 250.5 }), value: 250.5 },
    { name: 'fractional endpoint', retained: segment({ deltaValue: 0.5 }) },
    { name: 'endpoint below minimum', retained: segment({ deltaValue: -249 }) },
    { name: 'endpoint above maximum', retained: segment({ deltaValue: 60_000 }) },
    { name: 'nonfinite endpoint', retained: segment({ deltaValue: Infinity }) },
    { name: 'linear source', retained: segment({ easing: { curve: 'linear' } }) },
    { name: 'early source hold', retained: segment({ easing: { curve: 'hold', at: 0.5 } }) },
    { name: 'multiple descriptor faults', retained: segment({ baseValue: 1, deltaValue: 0.5, easing: { curve: 'linear' } }) },
  ])('reports one retained-descriptor issue: $name', ({ retained, value = 250 }) => {
    const input = track('retained', 0, 500, [[0, value], [500, 500]])
    input.keyframes[0].curveSegment = retained
    expect(validateShowStepClockTrack(input)).toEqual([
      ...(value === 250.5 ? [{ keyframeIndex: 0, field: 'value', message: VALUE_MESSAGE }] : []),
      { keyframeIndex: 0, field: 'curveSegment', message: SEGMENT_MESSAGE },
    ])
  })

  it('reports value, outgoing easing and retained descriptor issues together', () => {
    const input = track('combined', 0, 500, [[0, 1], [500, 250]])
    input.keyframes[0].easing = { curve: 'linear' }
    input.keyframes[0].curveSegment = segment({ baseValue: 1, easing: { curve: 'linear' } })
    expect(validateShowStepClockTrack(input)).toEqual([
      { keyframeIndex: 0, field: 'value', message: VALUE_MESSAGE },
      { keyframeIndex: 0, field: 'easing', message: EASING_MESSAGE },
      { keyframeIndex: 0, field: 'curveSegment', message: SEGMENT_MESSAGE },
    ])
  })
})

describe('held step-clock request planning (#1211)', () => {
  it('leaves records without tracks on their existing path', () => {
    expect(planShowStepClock({ instanceId: 'instance', baseStepMs: 500, tracks: [] })).toBeNull()
  })

  it.each([
    {
      name: 'half-open end excludes the final key', baseStepMs: 500,
      tracks: [track('a', 200, 1000, [[200, 250], [700, 0], [1200, 60_000]])],
      initialStepMs: 500,
      changes: [{ atMs: 200, stepMs: 250 }, { atMs: 700, stepMs: 0 }, { atMs: 1200, stepMs: 500 }],
    },
    {
      name: 'synthetic continuous-to-stepped requests', baseStepMs: 0,
      tracks: [track('a', 36_000, 26_000, [[36_000, 0], [44_000, 125], [48_000, 250], [52_000, 500], [62_000, 500]])],
      initialStepMs: 0,
      changes: [{ atMs: 44_000, stepMs: 125 }, { atMs: 48_000, stepMs: 250 }, { atMs: 52_000, stepMs: 500 }, { atMs: 62_000, stepMs: 0 }],
    },
    {
      name: 'first and last keys hold to activation bounds', baseStepMs: 500,
      tracks: [track('a', 100, 900, [[300, 125], [600, 250]])],
      initialStepMs: 500,
      changes: [{ atMs: 100, stepMs: 125 }, { atMs: 600, stepMs: 250 }, { atMs: 1000, stepMs: 500 }],
    },
    {
      name: 'activation at zero resolves the initial request', baseStepMs: 500,
      tracks: [track('a', 0, 1000, [[200, 0], [600, 250]])],
      initialStepMs: 0,
      changes: [{ atMs: 600, stepMs: 250 }, { atMs: 1000, stepMs: 500 }],
    },
    {
      name: 'adjacent activation selects the starting track', baseStepMs: 500,
      tracks: [track('a', 100, 400, [[100, 125], [500, 60_000]]), track('b', 500, 500, [[500, 250], [1000, 0]])],
      initialStepMs: 500,
      changes: [{ atMs: 100, stepMs: 125 }, { atMs: 500, stepMs: 250 }, { atMs: 1000, stepMs: 500 }],
    },
    {
      name: 'equal adjacent tracks coalesce without fallback', baseStepMs: 500,
      tracks: [track('a', 100, 400, [[100, 125], [500, 0]]), track('b', 500, 500, [[500, 125], [1000, 0]])],
      initialStepMs: 500,
      changes: [{ atMs: 100, stepMs: 125 }, { atMs: 1000, stepMs: 500 }],
    },
    {
      name: 'constant matching track remains an explicit opt-in', baseStepMs: 500,
      tracks: [track('a', 100, 900, [[100, 500], [500, 500], [1000, 500]])],
      initialStepMs: 500, changes: [],
    },
    {
      name: 'fractional legacy fallback stays unchanged', baseStepMs: 16.5,
      tracks: [track('a', 100, 900, [[100, 16], [1000, 16]])],
      initialStepMs: 16.5,
      changes: [{ atMs: 100, stepMs: 16 }, { atMs: 1000, stepMs: 16.5 }],
    },
  ])('$name', ({ baseStepMs, tracks, initialStepMs, changes }) => {
    expect(planShowStepClock({ instanceId: 'instance', baseStepMs, tracks })).toEqual({
      instanceId: 'instance', baseStepMs, initialStepMs, changes,
    })
  })

  it('restores fallback in gaps and preserves frozen inputs in either track order', () => {
    const first = track('a', 100, 400, [[100, 125], [300, 250], [500, 0]])
    first.keyframes[0].curveSegment = segment({ baseValue: 125, deltaValue: 125 })
    const second = track('b', 700, 300, [[700, 0], [900, 125]])
    const tracks = [first, second]
    const original = structuredClone(tracks)
    tracks.forEach(freezeTrack)
    Object.freeze(tracks)
    const expected = {
      instanceId: 'instance', baseStepMs: 500, initialStepMs: 500,
      changes: [{ atMs: 100, stepMs: 125 }, { atMs: 300, stepMs: 250 }, { atMs: 500, stepMs: 500 },
        { atMs: 700, stepMs: 0 }, { atMs: 900, stepMs: 125 }, { atMs: 1000, stepMs: 500 }],
    }
    const forward = planShowStepClock({ instanceId: 'instance', baseStepMs: 500, tracks })
    const reverse = planShowStepClock({ instanceId: 'instance', baseStepMs: 500, tracks: Object.freeze([second, first]) })
    expect(forward).toEqual(expected)
    expect(reverse).toEqual(expected)
    expect(reverse).not.toBe(forward)
    expect(reverse?.changes).not.toBe(forward?.changes)
    expect(tracks).toEqual(original)
  })
})

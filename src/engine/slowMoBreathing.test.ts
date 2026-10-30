import { describe, expect, it } from 'vitest'
import {
  advanceSlowMoBreathing,
  createSlowMoBreathingState,
  DEFAULT_SLOW_MO_BREATHING,
  restartSlowMoBreathing,
  slowMoBreathingAmplitude,
  slowMoBreathingRate,
  type SlowMoBreathingSettings,
} from './slowMoBreathing'

const full: SlowMoBreathingSettings = { ...DEFAULT_SLOW_MO_BREATHING, depth: 1 }

describe('breathing rate', () => {
  it.each([0, 0.0001, 0.3, 0.5, 1])('bounds a full cycle at base %s', base => {
    for (let i = 0; i <= 800; i++) {
      const rate = slowMoBreathingRate(base, i / 800, full)
      expect(rate).toBeGreaterThanOrEqual(0)
      expect(rate).toBeLessThanOrEqual(1)
      expect(slowMoBreathingRate(base, i / 800, { ...full, depth: 0 })).toBe(base)
    }
  })

  it('reaches the bounded extrema without a clipped plateau', () => {
    expect(slowMoBreathingRate(0.3, 0.25, full)).toBeCloseTo(0.6, 12)
    expect(slowMoBreathingRate(0.3, 0.75, full)).toBeCloseTo(0, 12)
    expect(slowMoBreathingRate(0.3, 0.74, full)).toBeGreaterThan(0)
    expect(slowMoBreathingRate(0.3, 0.76, full)).toBeGreaterThan(0)
    expect(slowMoBreathingAmplitude(1, full)).toBe(0)
  })

  it('clips into flat limits and allows the lab ceiling of 2×', () => {
    const clipped = { ...full, limits: 'clipped' as const }
    expect([0.7, 0.75, 0.8].map(phase => slowMoBreathingRate(0.3, phase, clipped))).toEqual([0, 0, 0])
    expect([0.2, 0.25, 0.3].map(phase => slowMoBreathingRate(0.3, phase, clipped))).toEqual([1, 1, 1])
    for (const limits of ['bounded', 'clipped'] as const) {
      const settings = { ...full, limits, allowAboveOne: true }
      expect(slowMoBreathingRate(1, 0.25, settings)).toBe(2)
      expect(slowMoBreathingRate(1, 0.75, settings)).toBe(0)
    }
  })
})

describe('breathing Pattern-time integration', () => {
  it.each([2, 20, 120])('matches an independent analytic integral at period %ss', periodSeconds => {
    const settings = { ...full, periodSeconds }
    const periodMs = periodSeconds * 1000
    let state = createSlowMoBreathingState()
    for (let frame = 0; frame < 1200; frame++) {
      const previous = state
      const before = { ...state }
      state = advanceSlowMoBreathing(state, frame % 3 === 0 ? 33 : 16, 0.3, settings)
      const expected = 0.3 * state.realMs
        + 0.3 * periodMs / (2 * Math.PI) * (1 - Math.cos(2 * Math.PI * state.realMs / periodMs))
      expect(Math.abs(state.patternMs - expected)).toBeLessThan(1e-6)
      expect(state.patternMs).toBeGreaterThanOrEqual(previous.patternMs)
      expect(previous).toEqual(before)
    }
  })

  it('integrates clipped whole cycles and irregular frame partitions identically', () => {
    const settings = { ...full, limits: 'clipped' as const, periodSeconds: 2 }
    const one = advanceSlowMoBreathing(createSlowMoBreathingState(), 2000, 0, settings)
    expect(one.patternMs).toBeCloseTo(2000 / Math.PI, 9)
    let partitioned = createSlowMoBreathingState()
    for (const delta of [17, 411, 920, 13, 2900, 671, 1769]) {
      partitioned = advanceSlowMoBreathing(partitioned, delta, 0.3, settings)
    }
    const together = advanceSlowMoBreathing(createSlowMoBreathingState(), partitioned.realMs, 0.3, settings)
    expect(partitioned.patternMs).toBeCloseTo(together.patternMs, 9)
    expect(partitioned.phase).toBeCloseTo(together.phase, 12)
  })

  it('integrates a smooth extremum that only touches a bound', () => {
    const state = { ...createSlowMoBreathingState(), phase: 0.5 }
    const next = advanceSlowMoBreathing(state, 10000, 0.3, full)
    expect(next.patternDeltaMs).toBeCloseTo(3000 - 6000 / Math.PI, 9)
  })

  it('keeps time monotone through every live setting, including restart', () => {
    let settings = { ...full }
    let state = advanceSlowMoBreathing(createSlowMoBreathingState(), 7300, 0.3, settings)
    const edits: Array<Partial<SlowMoBreathingSettings>> = [
      { depth: 0 }, { depth: 0.5 }, { periodSeconds: 2 }, { periodSeconds: 120 },
      { limits: 'clipped' }, { allowAboveOne: true }, { dreamyClock: 'pattern' },
      { dreamyClock: 'real' }, { allowAboveOne: false }, { limits: 'bounded' },
    ]
    for (const base of [0, 0.0001, 0.5, 1, 0.3]) {
      for (const edit of edits) {
        settings = { ...settings, ...edit }
        const previous = state
        state = advanceSlowMoBreathing(state, 16, base, settings)
        expect(state.patternMs).toBeGreaterThanOrEqual(previous.patternMs)
        expect(state.realMs).toBe(previous.realMs + 16)
        const restarted = restartSlowMoBreathing(state)
        expect(restarted).toEqual({ ...state, phase: 0 })
        expect(state.phase).not.toBe(0)
      }
    }
  })

  it('preserves phase when period changes and uses the new period from that point', () => {
    const first = advanceSlowMoBreathing(createSlowMoBreathingState(), 5000, 0.3, full)
    expect(first.phase).toBe(0.25)
    const settings = { ...full, periodSeconds: 2 }
    const sameInstant = advanceSlowMoBreathing(first, 0, 0.3, settings)
    expect(sameInstant.phase).toBe(first.phase)
    expect(sameInstant.patternMs).toBe(first.patternMs)
    expect(sameInstant.rate).toBe(first.rate)
    const next = advanceSlowMoBreathing(sameInstant, 500, 0.3, settings)
    expect(next.phase).toBe(0.5)
  })

  it('selects real or Pattern delta for Dreamy without changing the clock', () => {
    const state = advanceSlowMoBreathing(createSlowMoBreathingState(), 3210, 0.3, full)
    const real = advanceSlowMoBreathing(state, 16, 0.3, full)
    const pattern = advanceSlowMoBreathing(state, 16, 0.3, { ...full, dreamyClock: 'pattern' })
    expect(real.dreamyDeltaMs).toBe(16)
    expect(pattern.dreamyDeltaMs).toBe(pattern.patternDeltaMs)
    expect(pattern).toEqual({ ...real, dreamyDeltaMs: real.patternDeltaMs })
  })

  it('rejects invalid inputs without changing the prior state', () => {
    const state = Object.freeze(advanceSlowMoBreathing(createSlowMoBreathingState(), 20, 0.3, full))
    const before = { ...state }
    for (const delta of [-1, NaN, Infinity]) {
      expect(() => advanceSlowMoBreathing(state, delta, 0.3, full)).toThrow(RangeError)
    }
    for (const base of [-0.1, 1.1, NaN, Infinity]) {
      expect(() => advanceSlowMoBreathing(state, 16, base, full)).toThrow(RangeError)
    }
    for (const edit of [{ depth: -1 }, { depth: NaN }, { depth: 1.1 }, { periodSeconds: 0 }, { periodSeconds: 121 }]) {
      expect(() => advanceSlowMoBreathing(state, 16, 0.3, { ...full, ...edit })).toThrow(RangeError)
    }
    expect(state).toEqual(before)
  })
})

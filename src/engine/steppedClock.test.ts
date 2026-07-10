import { advanceSteppedClock, steppedClockInitialState } from './steppedClock'

describe('advanceSteppedClock (#379)', () => {
  it('holds private time between boundaries and delivers accumulated time as one jump', () => {
    const first = advanceSteppedClock(steppedClockInitialState, 37, 100)
    const second = advanceSteppedClock(first.state, 29, 100)
    const boundary = advanceSteppedClock(second.state, 41, 100)
    const nextBoundary = advanceSteppedClock(boundary.state, 93, 100)

    expect(first).toEqual({
      state: { elapsedMs: 0, pendingMs: 37 },
      deliveredDeltaMs: 0,
    })
    expect(second).toEqual({
      state: { elapsedMs: 0, pendingMs: 66 },
      deliveredDeltaMs: 0,
    })
    expect(boundary).toEqual({
      state: { elapsedMs: 100, pendingMs: 7 },
      deliveredDeltaMs: 100,
    })
    expect(nextBoundary).toEqual({
      state: { elapsedMs: 200, pendingMs: 0 },
      deliveredDeltaMs: 100,
    })
  })

  it('keeps final quantized time deterministic across variable frame partitions', () => {
    const irregular = [17, 33, 8, 142].reduce(
      (result, delta) => advanceSteppedClock(result.state, delta, 50),
      { state: steppedClockInitialState, deliveredDeltaMs: 0 },
    )
    const batched = advanceSteppedClock(steppedClockInitialState, 200, 50)

    expect(irregular.state).toEqual(batched.state)
    expect(irregular.state).toEqual({ elapsedMs: 200, pendingMs: 0 })
    expect(batched.deliveredDeltaMs).toBe(200)
  })

  it('never delivers negative or non-finite time', () => {
    const seeded = advanceSteppedClock(steppedClockInitialState, 75, 100)
    const negative = advanceSteppedClock(seeded.state, -50, 100)
    const nonFinite = advanceSteppedClock(negative.state, Number.NaN, 100)

    expect(negative).toEqual({ state: seeded.state, deliveredDeltaMs: 0 })
    expect(nonFinite).toEqual({ state: seeded.state, deliveredDeltaMs: 0 })
  })
})

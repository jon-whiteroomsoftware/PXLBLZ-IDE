import {
  advancePowerTelemetryEstimator,
  initialPowerTelemetryEstimatorState,
  POWER_SINCE_START_MAX_FRAMES,
} from './powerTelemetry'

describe('power telemetry estimator', () => {
  it('publishes recent duty only at the two-second block boundary while since-start advances per frame', () => {
    let state = initialPowerTelemetryEstimatorState()

    for (let frame = 0; frame < 99; frame += 1) {
      state = advancePowerTelemetryEstimator(state, {
        frameDuty: 0.8,
        deltaMs: 20,
        maxDuty: 1,
      })
    }

    expect(state.recentDuty).toBe(0)
    expect(state.sinceStartDuty).toBeCloseTo(0.8)

    state = advancePowerTelemetryEstimator(state, {
      frameDuty: 0.8,
      deltaMs: 20,
      maxDuty: 1,
    })

    expect(state.recentDuty).toBeCloseTo(0.8)
    expect(state.recentElapsedMs).toBe(0)
  })

  it('keeps the cap signal responsive after a long run without overflowing its since-start counter', () => {
    let early = advancePowerTelemetryEstimator(initialPowerTelemetryEstimatorState(), {
      frameDuty: 0,
      deltaMs: 16,
      maxDuty: 0.25,
    })
    let long = early

    for (let frame = 0; frame < 20_000; frame += 1) {
      long = advancePowerTelemetryEstimator(long, {
        frameDuty: 0,
        deltaMs: 16,
        maxDuty: 0.25,
      })
    }
    for (let frame = 0; frame < 5; frame += 1) {
      early = advancePowerTelemetryEstimator(early, {
        frameDuty: 1,
        deltaMs: 16,
        maxDuty: 0.25,
      })
      long = advancePowerTelemetryEstimator(long, {
        frameDuty: 1,
        deltaMs: 16,
        maxDuty: 0.25,
      })
    }

    expect(long.capDuty).toBeCloseTo(early.capDuty)
    expect(long.scale).toBeLessThan(1)
    expect(long.sinceStartFrames).toBe(POWER_SINCE_START_MAX_FRAMES)
  })
})

export const POWER_RECENT_WINDOW_MS = 2_000
export const POWER_CAP_RESPONSE_MS = 250
export const POWER_SINCE_START_MAX_FRAMES = 16_384

export interface PowerTelemetryEstimatorState {
  recentDuty: number
  sinceStartDuty: number
  recentElapsedMs: number
  recentWeightedDutyMs: number
  sinceStartFrames: number
  capDuty: number
  capInitialized: boolean
  scale: number
  clipping: boolean
}

export interface PowerTelemetryFrame {
  frameDuty: number
  deltaMs: number
  maxDuty?: number
}

export function initialPowerTelemetryEstimatorState(): PowerTelemetryEstimatorState {
  return {
    recentDuty: 0,
    sinceStartDuty: 0,
    recentElapsedMs: 0,
    recentWeightedDutyMs: 0,
    sinceStartFrames: 0,
    capDuty: 0,
    capInitialized: false,
    scale: 1,
    clipping: false,
  }
}

export function advancePowerTelemetryEstimator(
  state: PowerTelemetryEstimatorState,
  frame: PowerTelemetryFrame,
): PowerTelemetryEstimatorState {
  const duty = clamp(frame.frameDuty, 0, 1)
  const deltaMs = Math.max(0, frame.deltaMs)
  const sinceStartFrames = Math.min(
    POWER_SINCE_START_MAX_FRAMES,
    state.sinceStartFrames + 1,
  )
  const sinceStartDuty = state.sinceStartDuty
    + (duty - state.sinceStartDuty) / sinceStartFrames
  const recentElapsedMs = state.recentElapsedMs + deltaMs
  const recentWeightedDutyMs = state.recentWeightedDutyMs + duty * deltaMs
  const capAlpha = Math.min(1, deltaMs / POWER_CAP_RESPONSE_MS)
  const capDuty = state.capInitialized
    ? state.capDuty + (duty - state.capDuty) * capAlpha
    : duty
  const maxDuty = clamp(frame.maxDuty ?? 1, 0, 1)
  const scale = capDuty > maxDuty && capDuty > 0
    ? clamp(maxDuty / capDuty, 0, 1)
    : 1
  const common = {
    sinceStartDuty,
    sinceStartFrames,
    capDuty,
    capInitialized: true,
    scale,
    clipping: scale < 1,
  }

  if (recentElapsedMs >= POWER_RECENT_WINDOW_MS) {
    return {
      recentDuty: recentElapsedMs > 0 ? recentWeightedDutyMs / recentElapsedMs : duty,
      recentElapsedMs: 0,
      recentWeightedDutyMs: 0,
      ...common,
    }
  }

  return {
    ...state,
    recentElapsedMs,
    recentWeightedDutyMs,
    ...common,
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

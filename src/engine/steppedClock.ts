export interface SteppedClockState {
  elapsedMs: number
  pendingMs: number
}

export interface SteppedClockAdvance {
  state: SteppedClockState
  deliveredDeltaMs: number
}

export const steppedClockInitialState: SteppedClockState = {
  elapsedMs: 0,
  pendingMs: 0,
}

const MIN_STEP_MS = 16
const MAX_STEP_MS = 60000

export function steppedClockRateHz(stepMs: number): number {
  return 1000 / normalizeStepMs(stepMs)
}

export function steppedClockStepMs(rateHz: number): number {
  if (!Number.isFinite(rateHz) || rateHz <= 0) return MAX_STEP_MS
  return normalizeStepMs(1000 / rateHz)
}

function normalizeStepMs(stepMs: number): number {
  if (!Number.isFinite(stepMs)) return MAX_STEP_MS
  return Math.max(MIN_STEP_MS, Math.min(MAX_STEP_MS, stepMs))
}

export function advanceSteppedClock(
  state: SteppedClockState,
  deltaMs: number,
  stepMs: number,
): SteppedClockAdvance {
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0
  if (!Number.isFinite(stepMs) || stepMs <= 0 || safeDelta === 0) {
    return { state, deliveredDeltaMs: 0 }
  }

  const accumulatedMs = state.pendingMs + safeDelta
  const deliveredDeltaMs = Math.floor(accumulatedMs / stepMs) * stepMs
  if (deliveredDeltaMs === 0) {
    return {
      state: { ...state, pendingMs: accumulatedMs },
      deliveredDeltaMs: 0,
    }
  }

  return {
    state: {
      elapsedMs: state.elapsedMs + deliveredDeltaMs,
      pendingMs: accumulatedMs - deliveredDeltaMs,
    },
    deliveredDeltaMs,
  }
}

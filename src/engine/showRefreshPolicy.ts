export interface WholeFrameRefreshState {
  cadenceMs: number
  ownerToken: number
  epoch: number
  ready: boolean
  previousElapsedMs: number
}

export interface WholeFrameRefreshStep {
  mode: 'capture' | 'replay'
  state: WholeFrameRefreshState
}

export function createWholeFrameRefreshState(cadenceMs: number): WholeFrameRefreshState {
  return {
    cadenceMs: normalizeRefreshCadenceMs(cadenceMs),
    ownerToken: -1,
    epoch: -1,
    ready: false,
    previousElapsedMs: -1,
  }
}

export function stepWholeFrameRefresh(
  state: WholeFrameRefreshState,
  input: { ownerToken: number; elapsedMs: number },
): WholeFrameRefreshStep {
  const elapsedMs = Math.max(0, input.elapsedMs)
  const epoch = Math.floor(elapsedMs / state.cadenceMs)
  const invalidated = input.ownerToken !== state.ownerToken
    || elapsedMs < state.previousElapsedMs
    || epoch !== state.epoch
  const next = {
    ...state,
    ownerToken: input.ownerToken,
    epoch,
    ready: invalidated ? false : state.ready,
    previousElapsedMs: elapsedMs,
  }
  return { mode: next.ready ? 'replay' : 'capture', state: next }
}

export function completeWholeFrameRefreshCapture(
  state: WholeFrameRefreshState,
): WholeFrameRefreshState {
  return { ...state, ready: true }
}

function normalizeRefreshCadenceMs(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1_000
}

export interface RollingRefreshState {
  slices: number
  ownerToken: number
  phase: number
  ready: boolean
  previousElapsedMs: number
}

export interface RollingRefreshStep {
  state: RollingRefreshState
  maxPixelAgeFrames: number
}

export function createRollingRefreshState(slices: number): RollingRefreshState {
  return {
    slices: normalizeRollingRefreshSlices(slices),
    ownerToken: -1,
    phase: 0,
    ready: false,
    previousElapsedMs: -1,
  }
}

export function stepRollingRefresh(
  state: RollingRefreshState,
  input: { ownerToken: number; elapsedMs: number },
): RollingRefreshStep {
  const elapsedMs = Math.max(0, input.elapsedMs)
  const invalidated = input.ownerToken !== state.ownerToken || elapsedMs < state.previousElapsedMs
  const ready = invalidated ? false : state.ready
  const phase = ready ? (state.phase + 1) % state.slices : 0
  return {
    state: {
      ...state,
      ownerToken: input.ownerToken,
      phase,
      ready,
      previousElapsedMs: elapsedMs,
    },
    maxPixelAgeFrames: state.slices - 1,
  }
}

export function completeRollingRefreshCapture(state: RollingRefreshState): RollingRefreshState {
  return { ...state, ready: true }
}

export function rollingRefreshPixelMode(
  step: RollingRefreshStep,
  index: number,
): 'capture' | 'replay' {
  if (!step.state.ready) return 'capture'
  return Math.max(0, Math.floor(index)) % step.state.slices === step.state.phase ? 'capture' : 'replay'
}

function normalizeRollingRefreshSlices(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(256, Math.round(value))) : 4
}

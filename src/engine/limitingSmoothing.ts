export interface LimitingSmoothingState {
  samples: boolean[]
  active: boolean
}

const LIMITING_SAMPLE_WINDOW = 3

export function createLimitingSmoothingState(initial: boolean): LimitingSmoothingState {
  return { samples: [initial], active: initial }
}

/**
 * Keep the last three limiter polls and publish their strict majority. A tied
 * partial window retains the previous result, so the second sample cannot flip
 * the UI before a majority exists.
 */
export function updateLimitingSmoothing(
  state: LimitingSmoothingState,
  sample: boolean,
): LimitingSmoothingState {
  const samples = [...state.samples, sample].slice(-LIMITING_SAMPLE_WINDOW)
  const activeVotes = samples.filter(Boolean).length
  const inactiveVotes = samples.length - activeVotes
  const active = activeVotes === inactiveVotes
    ? state.active
    : activeVotes > inactiveVotes
  return { samples, active }
}

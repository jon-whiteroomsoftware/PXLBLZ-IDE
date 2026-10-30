export interface SlowMoBreathingSettings {
  depth: number
  periodSeconds: number
  limits: 'bounded' | 'clipped'
  allowAboveOne: boolean
  dreamyClock: 'real' | 'pattern'
}

export const DEFAULT_SLOW_MO_BREATHING: Readonly<SlowMoBreathingSettings> = {
  depth: 0.5,
  periodSeconds: 20,
  limits: 'bounded',
  allowAboveOne: false,
  dreamyClock: 'real',
}

export interface SlowMoBreathingState {
  /** Real-time oscillator phase, in cycles. Period edits never rebase it. */
  phase: number
  realMs: number
  patternMs: number
  rate: number
  patternDeltaMs: number
  dreamyDeltaMs: number
}

const TAU = 2 * Math.PI
const cyclePhase = (phase: number): number => phase - Math.floor(phase)

function validate(base: number, settings: SlowMoBreathingSettings): void {
  if (!Number.isFinite(base) || base < 0 || base > 1) {
    throw new RangeError('Breathing base must be finite and between 0 and 1.')
  }
  if (!Number.isFinite(settings.depth) || settings.depth < 0 || settings.depth > 1) {
    throw new RangeError('Breathing depth must be finite and between 0 and 1.')
  }
  if (!Number.isFinite(settings.periodSeconds) || settings.periodSeconds < 2 || settings.periodSeconds > 120) {
    throw new RangeError('Breathing period must be finite and between 2 and 120 seconds.')
  }
}

export function slowMoBreathingAmplitude(base: number, settings: SlowMoBreathingSettings): number {
  validate(base, settings)
  const ceiling = settings.allowAboveOne ? 2 : 1
  return settings.depth * (settings.limits === 'bounded' ? Math.min(base, ceiling - base) : 1)
}

export function slowMoBreathingRate(base: number, phase: number, settings: SlowMoBreathingSettings): number {
  if (!Number.isFinite(phase)) throw new RangeError('Breathing phase must be finite.')
  const amplitude = slowMoBreathingAmplitude(base, settings)
  return Math.max(0, Math.min(settings.allowAboveOne ? 2 : 1, base + amplitude * Math.sin(TAU * cyclePhase(phase))))
}

export function createSlowMoBreathingState(): SlowMoBreathingState {
  return { phase: 0, realMs: 0, patternMs: 0, rate: 0, patternDeltaMs: 0, dreamyDeltaMs: 0 }
}

/** Integrate a portion of one cycle, split wherever the sine crosses a limit. */
function integrateSection(start: number, end: number, base: number, amplitude: number, ceiling: number): number {
  const cuts = [start, end]
  if (amplitude > 0) {
    for (const limit of [0, ceiling]) {
      const ratio = (limit - base) / amplitude
      if (ratio <= -1 || ratio >= 1) continue
      const angle = Math.asin(ratio)
      for (const crossing of [cyclePhase(angle / TAU), cyclePhase((Math.PI - angle) / TAU)]) {
        if (crossing > start && crossing < end) cuts.push(crossing)
      }
    }
  }
  cuts.sort((a, b) => a - b)
  let integral = 0
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i]
    const middleRate = base + amplitude * Math.sin(TAU * (a + b) / 2)
    if (middleRate < 0) continue
    integral += middleRate > ceiling ? ceiling * (b - a)
      : base * (b - a) + amplitude / TAU * (Math.cos(TAU * a) - Math.cos(TAU * b))
  }
  return Math.max(0, integral)
}

/** Advance by real elapsed time; every edit takes effect from this state onward. */
export function advanceSlowMoBreathing(
  state: Readonly<SlowMoBreathingState>,
  deltaMs: number,
  base: number,
  settings: SlowMoBreathingSettings,
): SlowMoBreathingState {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Breathing delta must be finite and nonnegative.')
  const amplitude = slowMoBreathingAmplitude(base, settings)
  const ceiling = settings.allowAboveOne ? 2 : 1
  const periodMs = settings.periodSeconds * 1000
  const cycles = deltaMs / periodMs
  const wholeCycles = Math.floor(cycles)
  const remainder = cycles - wholeCycles
  const end = state.phase + remainder
  let integral = wholeCycles * integrateSection(0, 1, base, amplitude, ceiling)
  integral += end <= 1 ? integrateSection(state.phase, end, base, amplitude, ceiling)
    : integrateSection(state.phase, 1, base, amplitude, ceiling) + integrateSection(0, end - 1, base, amplitude, ceiling)
  const patternDeltaMs = Math.max(0, integral * periodMs)
  const phase = cyclePhase(end)
  return {
    phase,
    realMs: state.realMs + deltaMs,
    patternMs: state.patternMs + patternDeltaMs,
    rate: slowMoBreathingRate(base, phase, settings),
    patternDeltaMs,
    dreamyDeltaMs: settings.dreamyClock === 'real' ? deltaMs : patternDeltaMs,
  }
}

/** Restart the oscillator without rewinding either elapsed-time accumulator. */
export function restartSlowMoBreathing(state: Readonly<SlowMoBreathingState>): SlowMoBreathingState {
  return { ...state, phase: 0 }
}

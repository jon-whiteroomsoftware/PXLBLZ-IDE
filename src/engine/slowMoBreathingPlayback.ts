import type { PatternHandle } from './loadPattern'
import type { ShimContext } from './shim'
import { SLOW_MO_LAB_VARS, slowMoRateFromPosition, type SlowMoSettings } from './slowMo'
import {
  advanceSlowMoBreathing, createSlowMoBreathingState, restartSlowMoBreathing,
  slowMoBreathingAmplitude, type SlowMoBreathingSettings,
} from './slowMoBreathing'

export interface SlowMoBreathingTelemetry {
  phase: number
  rate: number
  amplitude: number
  realMs: number
  patternMs: number
  trace: ReadonlyArray<{ realMs: number; rate: number }>
}

interface PlaybackInputs {
  settings: SlowMoSettings
  breathing: SlowMoBreathingSettings
  restart: number
}

/** Browser-only adapter. The ordinary emitted wrapper leaves labDrive off. */
export function createSlowMoBreathingPlayback(
  shim: Pick<ShimContext, 'encodeScalar' | 'decodeScalar'>,
  readInputs: () => PlaybackInputs,
) {
  let state = createSlowMoBreathingState()
  let baseBypass = false
  let restart = readInputs().restart
  let amplitude = 0
  let trace: SlowMoBreathingTelemetry['trace'] = []
  return {
    wrap(handle: PatternHandle): PatternHandle {
      return {
        ...handle,
        beforeRender(rawDelta) {
          const inputs = readInputs()
          if (inputs.restart !== restart) {
            state = restartSlowMoBreathing(state)
            restart = inputs.restart
          }
          const { position } = inputs.settings
          if (position >= 0.97) baseBypass = true
          else if (position < 0.94) baseBypass = false
          const base = baseBypass ? 1 : slowMoRateFromPosition(position)
          amplitude = slowMoBreathingAmplitude(base, inputs.breathing)
          state = advanceSlowMoBreathing(state, shim.decodeScalar(rawDelta), base, inputs.breathing)
          const globals = {
            [SLOW_MO_LAB_VARS.drive]: 1,
            [SLOW_MO_LAB_VARS.delta]: state.patternDeltaMs,
            [SLOW_MO_LAB_VARS.rate]: state.rate,
            [SLOW_MO_LAB_VARS.bypass]: Number(baseBypass && amplitude === 0),
            [SLOW_MO_LAB_VARS.patternDreamy]: Number(inputs.breathing.dreamyClock === 'pattern'),
          }
          for (const [name, value] of Object.entries(globals)) {
            if (!handle.setRuntimeVar(name, shim.encodeScalar(value))) {
              throw new Error(`Breathing preview is missing runtime global ${name}.`)
            }
          }
          handle.beforeRender(rawDelta)
          const last = trace[trace.length - 1]
          if (!last || state.realMs - last.realMs >= inputs.breathing.periodSeconds * 1000 / 80) {
            trace = [...trace.filter(point => point.realMs >= state.realMs - inputs.breathing.periodSeconds * 2000),
              { realMs: state.realMs, rate: state.rate }].slice(-161)
          }
        },
      }
    },
    telemetry(patternMs: number): SlowMoBreathingTelemetry {
      return { phase: state.phase, rate: state.rate, amplitude, realMs: state.realMs, patternMs, trace }
    },
  }
}

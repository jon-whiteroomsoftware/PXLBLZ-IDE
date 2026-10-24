import { describe, expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV2Record, exportShowEpeV2ForTest } from '../test/showEpeV2TestSupport'
import {
  CalendarOracle, FastRegister, PreciseRegister, Q, Q0, expectedBeforeRenderCalls,
  oracleCalls, quantizedRequest, type OracleSpec,
} from '../test/showStepCalendarOracle'
import { compileShow, type ShowRecipe, type ShowLightShutter } from './showCompiler'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import type { ShowStepCalendar } from './showStepClockPlan'
import { normalizeAdaptation } from './showMemberLowering'
import type { MapPoint } from './maps/types'

// AF9's bit probe: bounded carries keep every intermediate representable in 16.16.
// Bit 15 uses two divisions so pow(2, 15) never overflows the signed register.
const PROBE = `export var calls = 0
export var ms = 0
export var blocks = 0
export function beforeRender(delta) {
  calls = calls + 1
  blocks = blocks + floor(delta / 16384)
  ms = ms + delta % 16384
  if (ms >= 16384) {
    blocks = blocks + 1
    ms = ms - 16384
  }
}
export function render(index) {
  var divisor = pow(2, min(index, 14))
  var c = calls / divisor
  var m = ms / divisor
  var b = blocks / divisor
  if (index == 15) { c = c / 2; m = m / 2; b = b / 2 }
  rgb(floor(c) % 2, floor(m) % 2, floor(b) % 2)
}`
const MAP: MapPoint[] = Array.from({ length: 16 }, (_, i) => ({ sample: [i / 15], pos: [i / 15, 0.5] }))
type Interval = { startMs: number; endMs: number }
interface Fixture {
  loopMs: number
  calendar: ShowStepCalendar
  intervals?: Interval[]
  deterministic?: boolean
  shutter?: ShowLightShutter
}

function recipe(f: Fixture): ShowRecipe {
  const intervals = f.intervals ?? [{ startMs: 0, endMs: f.loopMs }]
  const cuts = [...new Set([0, f.loopMs, ...intervals.flatMap(w => [w.startMs, w.endMs])])].sort((a, b) => a - b)
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 15 }] }]
  return {
    clips: [
      { id: 'probe', source: PROBE, adaptation: { stepCalendar: f.calendar, lightShutter: f.shutter } },
      { id: 'gap', source: 'export function render(index) { rgb(0, 0, 0) }' },
    ],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: { scenes: cuts.slice(0, -1).map((start, i) => ({
      holdMs: cuts[i + 1] - start,
      placements: [{ zoneName: 'main', clipId: intervals.some(w => w.startMs <= start && start < w.endMs) ? 'probe' : 'gap' }],
      ...(i < cuts.length - 2 ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } } : {}),
    })) },
    loopDurationMs: f.loopMs,
    ...(f.deterministic ? { deterministicLoopReset: true } : {}),
  }
}

/** Derived only from the authored fixture, never a compiler window or runtime variable. */
function oracleSpec(f: Fixture): OracleSpec {
  const intervals = f.intervals ?? [{ startMs: 0, endMs: f.loopMs }]
  const windows = f.deterministic && intervals.length > 1
    ? [{ startMs: intervals[0].startMs, endMs: intervals[intervals.length - 1].endMs }] : intervals
  return {
    loopMs: Q.int(f.loopMs),
    windows: windows.map(w => ({ start: Q.int(w.startMs), end: Q.int(w.endMs) })),
    initial: quantizedRequest(f.calendar.initialStepMs),
    changes: f.calendar.changes.map(c => ({ at: Q.int(c.atMs), step: quantizedRequest(c.stepMs) })),
  }
}

function decode(frame: Float64Array) {
  const values = [0, 0, 0]
  for (let i = 0; i < 16; i++) for (let channel = 0; channel < 3; channel++) {
    const bit = frame[i * 3 + channel]
    expect(bit, `pixel ${i}, channel ${channel} must be a bit`).toBeOneOf([0, 1])
    values[channel] += bit * 2 ** i
  }
  return { calls: values[0], total: values[2] * 16384 + values[1] }
}

function run(f: Fixture, fidelity: 'fast' | 'fidelity', deltas: number[]) {
  const artifact = compileShow(recipe(f), LIBRARIES, { patternSlotSharing: 'none' })
  const reopened = parseEpe(exportShowEpeV2ForTest(convertibleV2Record(), artifact.code).text)
  const runtime = createFastReplayRuntime({
    code: reopened.src, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: MAP, randomSeed: 1211, fidelity })
  const spec = oracleSpec(f)
  const register = fidelity === 'fast' ? new FastRegister(f.loopMs) : new PreciseRegister(f.loopMs)
  let oracle = new CalendarOracle(spec, Q0)
  let ticks: Q[] = []
  let totalCalls = 0
  const outputs: Array<{ calls: number; total: number; tick: bigint }> = []
  for (const delta of deltas) {
    const step = register.step(delta, [])
    if (f.deterministic && step.wraps > 0) {
      oracle = new CalendarOracle(spec, Q0)
      ticks = []
      totalCalls = 0
    }
    const tick = Q.int(f.deterministic ? step.tick : step.abs)
    const local = register instanceof FastRegister ? register.e * 1000 : Number(register.raw) * 1000 / 65536
    const visible = (f.intervals ?? [{ startMs: 0, endMs: f.loopMs }]).some(w => w.startMs <= local && local < w.endMs)
    const advancing = spec.windows.some(w => w.start.le(Q.ofDouble(local)) && Q.ofDouble(local).lt(w.end))
    if (advancing) {
      ticks.push(tick)
      const expected = oracleCalls(oracle, ticks)[ticks.length - 1]
      totalCalls += expected.called ? expectedBeforeRenderCalls(expected.delivered.toNumber()) : 0
    }
    const result = runtime.advanceLive(delta)
    const open = !f.shutter || ((local / 1000 * f.shutter.rateHz + f.shutter.phase) % 1) < f.shutter.duty
    if (visible && open) {
      const actual = decode(result.frame)
      const expected = ticks.length ? oracle.stateAt(ticks[ticks.length - 1]).D.toNumber() : 0
      expect(actual, `${fidelity}, delta ${delta}, tick ${tick}`).toEqual({ calls: totalCalls % 65536, total: expected })
      outputs.push({ ...actual, tick: step.tick })
    }
  }
  return { artifact, outputs }
}

describe.each(['fast', 'fidelity'] as const)('routed step calendars reopened from EPE (%s)', fidelity => {
  it.each([125, 1000 / 60])('holds 500 until its boundary, then samples 250 at 200, cadence %s', cadence => {
    run({ loopMs: 15000, calendar: { initialStepMs: 500, changes: [{ atMs: 200, stepMs: 250 }] } },
      fidelity, [0, ...Array.from({ length: Math.ceil(1100 / cadence) }, () => cadence)])
  })

  it('owns the exact 500/750/1000 boundaries and primes with beforeRender(0)', () => {
    const { outputs } = run({ loopMs: 15000, calendar: { initialStepMs: 500, changes: [{ atMs: 200, stepMs: 250 }] } },
      fidelity, [0, 199, 1, 299, 1, 249, 1, 249, 1])
    expect(outputs.map(o => o.total)).toEqual([0, 0, 0, 0, 500, 500, 750, 750, 1000])
    expect(outputs[0].calls).toBe(1)
  })

  it('delivers per frame in continuous mode, then owns 450/700/950', () => {
    const { outputs } = run({ loopMs: 15000, calendar: { initialStepMs: 0, changes: [{ atMs: 200, stepMs: 250 }] } },
      fidelity, [0, 100, 100, 249, 1, 249, 1, 249, 1])
    expect(outputs.map(o => o.total)).toEqual([0, 100, 200, 200, 450, 450, 700, 700, 950])
  })

  it('retains the request and remainder over a hidden gap without gap delivery', () => {
    run({ loopMs: 2000, calendar: { initialStepMs: 500, changes: [{ atMs: 400, stepMs: 250 }] },
      intervals: [{ startMs: 0, endMs: 300 }, { startMs: 800, endMs: 2000 }] },
    fidelity, [0, 125, 125, 100, 200, 200, 50, 125, 75, 250, 250])
  })

  it('advances the deterministic continuity window and resets to zero for three loops', () => {
    run({ loopMs: 2000, deterministic: true,
      calendar: { initialStepMs: 500, changes: [{ atMs: 200, stepMs: 250 }] },
      intervals: [{ startMs: 0, endMs: 300 }, { startMs: 800, endMs: 2000 }] },
    fidelity, [0, ...Array.from({ length: 48 }, () => 125)])
  })

  it('carries request and residue through ten continuous loops at 60 Hz', () => {
    run({ loopMs: 1500, calendar: { initialStepMs: 1000 / 7, changes: [{ atMs: 1000, stepMs: 333 }] } },
      fidelity, [0, ...Array.from({ length: 910 }, () => 1000 / 60)])
  })

  it('keeps Continue shutter timing at open frames', () => {
    run({ loopMs: 2000, calendar: { initialStepMs: 500, changes: [{ atMs: 200, stepMs: 250 }] },
      shutter: { rateHz: 2, duty: 0.5, phase: 0, clockBehavior: 'continue' } },
    fidelity, [0, ...Array.from({ length: 15 }, () => 125)])
  })

  it('keeps constant calendars whole-step and boundary-zero behavior distinct from static Stutter', () => {
    const { outputs, artifact } = run({ loopMs: 2000, calendar: { initialStepMs: 500, changes: [] } },
      fidelity, [125, 125, 250])
    expect(outputs.map(o => o.total)).toEqual([0, 0, 500])
    expect(artifact.summary.clips.find(c => c.id === 'probe')).toMatchObject({ temporalPolicy: 'stepped-clock', stepMs: null })
  })

  it('accepts a non-integer base and rounds motion up against the quantized-request oracle', () => {
    const { outputs } = run({ loopMs: 15000, calendar: { initialStepMs: 1000 / 7, changes: [] } },
      fidelity, [0, ...Array.from({ length: 100 }, () => 125)])
    expect(outputs.some(o => o.total === 143)).toBe(true)
  })

  it('aggregates long-frame boundaries and preserves bounded beforeRender chunk counts', () => {
    // Precise's input delta is signed 16.16; use its largest safe multi-wrap frame.
    const delta = fidelity === 'fast' ? 100000 : 32000
    const { outputs } = run({ loopMs: 15000, calendar: { initialStepMs: 500, changes: [] } }, fidelity, [0, delta, 500])
    expect(outputs[1]).toMatchObject({ total: delta, calls: 1 + expectedBeforeRenderCalls(delta) })
  })

  it('chunks a held 60000-ms delivery after multiple frames and loop seams', () => {
    const { outputs } = run({ loopMs: 15000, calendar: { initialStepMs: 60000, changes: [] } },
      fidelity, [0, 32000, 32000])
    expect(outputs.map(o => o.total)).toEqual([0, 0, 60000])
    expect(outputs[2].calls - outputs[1].calls).toBe(expectedBeforeRenderCalls(60000))
  })
})

describe('calendar compiler admission and normalization', () => {
  it('refuses a non-routed calendar at the compiler dispatch boundary', () => {
    const nonRouted = recipe({ loopMs: 1000, calendar: { initialStepMs: 500, changes: [] } })
    delete nonRouted.routedSceneSequence
    delete nonRouted.routingLayouts
    delete nonRouted.zones
    nonRouted.clips = nonRouted.clips.slice(0, 1)
    expect(() => compileShow(nonRouted, LIBRARIES)).toThrow('compileShow step calendars require a routed Scene sequence.')
  })

  it('defensively refuses freeze shutters during emission', () => {
    expect(() => compileShow(recipe({ loopMs: 1000, calendar: { initialStepMs: 500, changes: [] },
      shutter: { rateHz: 2, duty: 0.5, phase: 0, clockBehavior: 'freeze' } }), LIBRARIES))
      .toThrow('compileShow step calendars do not support freeze shutters.')
  })

  it('clones a calendar without clamping its non-integer base or aliasing changes', () => {
    const calendar = { initialStepMs: 1000 / 7, changes: [{ atMs: 200, stepMs: 0 }] }
    const normalized = normalizeAdaptation({ stepCalendar: calendar })
    expect(normalized.stepCalendar).toEqual(calendar)
    expect(normalized.stepCalendar).not.toBe(calendar)
    expect(normalized.stepCalendar?.changes).not.toBe(calendar.changes)
    expect(normalizeAdaptation(undefined)).not.toHaveProperty('stepCalendar')
  })
})

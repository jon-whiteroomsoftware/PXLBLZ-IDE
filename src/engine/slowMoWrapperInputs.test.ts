import { bundle } from './bundle'
import { fx } from './fixedpoint'
import { loadPattern } from './loadPattern'
import { bundleWithPasses, type PassRecipe } from './passEngine'
import { createFxShim, createShim } from './shim'
import { PIXELBLAZE_ARRAY_HEADER_WORDS, PIXELBLAZE_VM_ARRAY_WORDS } from './showVmResourceLedger'
import {
  emitPatternWrappers,
  WRAPPER_INPUT_OFF_BELOW,
  type PatternWrapper,
  type WrapperInputSample,
} from './slowMo'

// #1278: an input sample drives a bound Wrapper in place of its slider. The
// oracle is rendered frames: the bound artifact against the same Pattern
// wrapped with its slider at the value the input should produce.

type Inputs = Partial<Record<PatternWrapper, WrapperInputSample>>
const both = ['slow-mo', 'dreamy'] as const
const modes = ['fast', 'fidelity'] as const
const points = [{ sample: [0, 0.1, 0.3] }, { sample: [0.5, 0.3, 0.7] }, { sample: [0.9, 0.8, 0.5] }]
// Includes a frame with no inner Slow-mo tick (0, 8.7) and one with several (102.25).
const deltas = [0, 8.7, 33.3, 17, 0, 102.25, 16, 9, 47.9, 27]
const SLOW_PIN = 36
const DREAM_PIN = 39
const timeDriven = `var t = 0
export function beforeRender(d) { t = time(0.029) }
export function render(i) { rgb(t, i/4, 0.3) }`

const sample = (pin: number, overrides: Partial<WrapperInputSample> = {}): WrapperInputSample => ({
  pin, smoothing: 1, fallback: 0, invert: false, ...overrides,
})

function wrapped(source: string, enabled: readonly PatternWrapper[], inputs?: Inputs) {
  return bundleWithPasses(source, {}, [{ kind: 'wrappers', enabled, pixelCount: points.length, ...(inputs ? { inputs } : {}) }])
}

function frames(artifact: ReturnType<typeof bundle>, mode: typeof modes[number]) {
  let clock = 0
  const readings = new Map<number, number>()
  const readCounts = new Map<number, number>()
  const config = { mapPoints: points, pixelCount: points.length, dimensions: 1 as const, getVirtualTime: () => clock }
  const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
  const pinOf = (pin: number) => Math.round(shim.decodeScalar(pin))
  const analogRead = (pin: number) => {
    const decoded = pinOf(pin)
    readCounts.set(decoded, (readCounts.get(decoded) ?? 0) + 1)
    return shim.encodeScalar(readings.get(decoded) ?? 0)
  }
  const handle = loadPattern(
    mode === 'fast' ? artifact.code : artifact.fxCode, artifact.metadata, { ...shim.builtins, analogRead },
  )
  return {
    read(pin: number, value: number) { readings.set(pin, value) },
    readCount(pin: number) { return readCounts.get(pin) ?? 0 },
    set(name: string, value: number) { handle.controls[name](shim.encodeScalar(value)) },
    frame(delta: number) {
      clock += delta
      handle.beforeRender(shim.encodeScalar(delta))
      return points.map((_, index) => {
        shim.resetCapturedPixel()
        handle.render(shim.encodeScalar(index))
        return [...shim.capturedPixel()]
      })
    },
  }
}

describe('Wrapper input emission (E1)', () => {
  it.each([
    { bound: ['slow-mo'] as PatternWrapper[], slider: ['sliderDreamy'] },
    { bound: ['dreamy'] as PatternWrapper[], slider: ['sliderSlowMo'] },
    { bound: [...both], slider: [] },
  ])('replaces the slider of bound $bound and keeps every other export', ({ bound, slider }) => {
    const inputs: Inputs = Object.fromEntries(bound.map((type) => [type, sample(type === 'slow-mo' ? SLOW_PIN : DREAM_PIN)]))
    const unbound = emitPatternWrappers(timeDriven, points.length, both)
    const result = emitPatternWrappers(timeDriven, points.length, both, inputs)
    expect({ applied: result.applied, skipped: result.skipped, arrayWords: result.arrayWords })
      .toEqual({ applied: unbound.applied, skipped: unbound.skipped, arrayWords: unbound.arrayWords })
    expect(result.inputs).toEqual(bound)
    const artifact = wrapped(timeDriven, both, inputs)
    expect(artifact.metadata.controls.map((control) => control.exportName)).toEqual(slider)
    for (const type of bound) {
      expect(result.code).not.toContain(type === 'slow-mo' ? 'sliderSlowMo' : 'sliderDreamy')
    }
    const outer = result.code.slice(result.code.indexOf('export function beforeRender(delta) {'))
    for (const type of bound) {
      const read = outer.indexOf(`analogRead(${type === 'slow-mo' ? SLOW_PIN : DREAM_PIN})`)
      expect(read).toBeGreaterThan(0)
      expect(read).toBeLessThan(outer.indexOf('__pxlblz_slowmo_in_beforeRender('))
      expect(read).toBeLessThan(outer.indexOf('__pxlblz_slowmo_kDn ='))
    }
  })

  it('keeps the skip decision and emits no sample for a skipped Wrapper', () => {
    const source = `export function sliderSlowMo(v) {}\n${timeDriven}`
    const result = emitPatternWrappers(source, points.length, both, { 'slow-mo': sample(SLOW_PIN) })
    expect(result.applied).toEqual(['dreamy'])
    expect(result.skipped['slow-mo']?.reason).toBe('control-name-taken')
    expect(result.inputs).toBeUndefined()
    expect(result.code).toBe(emitPatternWrappers(source, points.length, both).code)
  })

  it('keeps the array budget decision when a Wrapper has an input', () => {
    const pixels = Math.floor((PIXELBLAZE_VM_ARRAY_WORDS - 6 * PIXELBLAZE_ARRAY_HEADER_WORDS) / 6)
    const result = emitPatternWrappers(timeDriven, pixels, both, { dreamy: sample(DREAM_PIN) })
    const unbound = emitPatternWrappers(timeDriven, pixels, both)
    expect(result.applied).toEqual(['slow-mo'])
    expect(result.skipped.dreamy?.reason).toBe('array-budget')
    expect(result).toEqual(unbound)
  })

  it('emits identical bytes with no inputs, an empty map, or inputs for disabled Wrappers', () => {
    const plain = emitPatternWrappers(timeDriven, points.length, ['dreamy'])
    expect(emitPatternWrappers(timeDriven, points.length, ['dreamy'], {})).toEqual(plain)
    expect(emitPatternWrappers(timeDriven, points.length, ['dreamy'], { 'slow-mo': sample(SLOW_PIN) })).toEqual(plain)
  })
})

for (const mode of modes) {
  describe(`Wrapper input frames (${mode})`, () => {
    // Slow-mo's reading steps; with both bound, Dreamy's pin holds 0.5, which
    // inverts to itself.
    const cases: Array<{
      name: string; enabled: readonly PatternWrapper[]; inputs: Inputs
      reads: (r: number) => Record<number, number>; sliders: (a: number) => Record<string, number>
    }> = [
      { name: 'Slow-mo alone', enabled: ['slow-mo'], inputs: { 'slow-mo': sample(SLOW_PIN) }, reads: (r) => ({ [SLOW_PIN]: r }), sliders: (a) => ({ sliderSlowMo: a }) },
      { name: 'Dreamy alone', enabled: ['dreamy'], inputs: { dreamy: sample(DREAM_PIN) }, reads: (r) => ({ [DREAM_PIN]: r }), sliders: (a) => ({ sliderDreamy: a }) },
      {
        name: 'both, Dreamy held at 0.5',
        enabled: both,
        inputs: { 'slow-mo': sample(SLOW_PIN), dreamy: sample(DREAM_PIN) },
        reads: (r) => ({ [SLOW_PIN]: r, [DREAM_PIN]: 0.5 }),
        sliders: (a) => ({ sliderSlowMo: a, sliderDreamy: 0.5 }),
      },
    ]

    it.each(cases.flatMap((entry) => [false, true].map((invert) => ({ ...entry, invert }))))(
      'B2: $name renders as its slider at the reading (invert $invert)',
      ({ enabled, inputs, reads, sliders, invert }) => {
        const invertedInputs = Object.fromEntries(
          Object.entries(inputs).map(([type, input]) => [type, { ...input!, invert }]),
        )
        for (const reading of [0.25, 0.5, 1]) {
          const bound = frames(wrapped(timeDriven, enabled, invertedInputs), mode)
          const slider = frames(wrapped(timeDriven, enabled), mode)
          for (const [pin, value] of Object.entries(reads(reading))) bound.read(Number(pin), value)
          for (const [name, value] of Object.entries(sliders(invert ? 1 - reading : reading))) slider.set(name, value)
          for (const delta of deltas) expect(bound.frame(delta)).toEqual(slider.frame(delta))
          for (const input of Object.values(inputs)) expect(bound.readCount(input.pin)).toBe(deltas.length)
        }
      },
    )

    it.each([
      { name: 'Slow-mo', inputs: { 'slow-mo': sample(SLOW_PIN) } },
      { name: 'Dreamy', inputs: { dreamy: sample(DREAM_PIN) } },
      { name: 'both', inputs: { 'slow-mo': sample(SLOW_PIN), dreamy: sample(DREAM_PIN) } },
    ])('B3, D2: $name below 0.03 renders as the untouched slider', ({ inputs }) => {
      for (const reading of [0, 0.01, 0.029]) {
        const bound = frames(wrapped(timeDriven, both, inputs), mode)
        const untouched = frames(wrapped(timeDriven, both), mode)
        bound.read(SLOW_PIN, reading)
        bound.read(DREAM_PIN, reading)
        for (const delta of deltas) expect(bound.frame(delta)).toEqual(untouched.frame(delta))
      }
    })

    it.each([0.03, 0.06])('renders a reading of %s as the slider at that value', (reading) => {
      const bound = frames(wrapped(timeDriven, both, { 'slow-mo': sample(SLOW_PIN), dreamy: sample(DREAM_PIN) }), mode)
      const slider = frames(wrapped(timeDriven, both), mode)
      bound.read(SLOW_PIN, reading)
      bound.read(DREAM_PIN, reading)
      slider.set('sliderSlowMo', reading)
      slider.set('sliderDreamy', reading)
      for (const delta of deltas) expect(bound.frame(delta)).toEqual(slider.frame(delta))
    })
  })
}

describe('Wrapper input smoothing and fallback (E2 sequence, E4)', () => {
  // The expected value follows the hardware-brightness sample exactly: it
  // starts at the fallback and moves toward each reading once per outer frame.
  function smoothedAgainstSlider(
    type: PatternWrapper, input: WrapperInputSample, readings: number[], mode: typeof modes[number],
  ) {
    const control = type === 'slow-mo' ? 'sliderSlowMo' : 'sliderDreamy'
    const bound = frames(wrapped(timeDriven, both, { [type]: input }), mode)
    const slider = frames(wrapped(timeDriven, both), mode)
    let value = input.fallback
    readings.forEach((reading, index) => {
      const target = input.invert ? 1 - reading : reading
      if (mode === 'fidelity') {
        const prior = fx.fromFloat(value)
        value = fx.toFloat(fx.add(prior, fx.mul(fx.sub(fx.fromFloat(target), prior), fx.fromFloat(input.smoothing))))
      } else {
        value += (target - value) * input.smoothing
      }
      bound.read(input.pin, reading)
      const offBelow = mode === 'fidelity' ? fx.toFloat(fx.fromFloat(WRAPPER_INPUT_OFF_BELOW)) : WRAPPER_INPUT_OFF_BELOW
      slider.set(control, value < offBelow ? 0 : value)
      const delta = deltas[index % deltas.length]
      expect(bound.frame(delta)).toEqual(slider.frame(delta))
      expect(bound.readCount(input.pin)).toBe(index + 1)
    })
  }

  const stepped = [...Array(12).fill(0), ...Array(24).fill(0.5), ...Array(30).fill(0)]

  for (const mode of modes) {
    it.each(both)(`%s follows a stepped reading 0, 0.5, 0 with smoothing 0.2 (${mode})`, (type) => {
      smoothedAgainstSlider(type, sample(type === 'slow-mo' ? SLOW_PIN : DREAM_PIN, { smoothing: 0.2 }), stepped, mode)
    })
  }

  it.each([
    { fallback: 0.5, smoothing: 0.2, invert: false },
    { fallback: 0, smoothing: 0.2, invert: true },
    { fallback: 0.5, smoothing: 0, invert: false },
  ])('D4: starts at fallback $fallback and converges by smoothing $smoothing (invert $invert)', (settings) => {
    for (const type of both) {
      for (const mode of modes) {
        smoothedAgainstSlider(type, sample(type === 'slow-mo' ? SLOW_PIN : DREAM_PIN, settings), Array(20).fill(1), mode)
      }
    }
  })
})

describe('Wrapper input order (R1)', () => {
  it('samples with the Wrapper, inside Brightness and Power limit', () => {
    const source = 'export var level = 0; export function render(i) { rgb(level, 0, 0) }'
    const recipe: PassRecipe = [
      { kind: 'bind', target: 'level', value: 1 },
      { kind: 'wrappers', enabled: ['dreamy'], pixelCount: points.length, inputs: { dreamy: sample(DREAM_PIN) } },
      { kind: 'inject', id: 'brightness-sample', source: `var gain = 1; function beforeRender(delta) { gain = analogRead(${SLOW_PIN}) }` },
      { kind: 'intercept', id: 'brightness', target: 'rgb', source: 'function scale(r,g,b) { rgb(r*gain,g*gain,b*gain) }' },
      { kind: 'intercept', id: 'power', target: 'rgb', source: 'function cap(r,g,b) { rgb(min(r,0.5),min(g,0.5),min(b,0.5)) }' },
    ]
    const artifact = bundleWithPasses(source, {}, recipe)
    expect(artifact.warnings).toEqual([])
    expect(artifact.metadata.controls).toEqual([])
    const runtime = frames(artifact, 'fast')
    runtime.read(DREAM_PIN, 1)
    runtime.read(SLOW_PIN, 1)
    expect(runtime.frame(0)).toEqual(points.map(() => [0.5, 0, 0]))
    // A Dreamy trail persists, yet Brightness scales what the Wrapper emits,
    // so the next frame after Brightness drops to 0 is dark.
    runtime.read(SLOW_PIN, 0)
    expect(runtime.frame(16)).toEqual(points.map(() => [0, 0, 0]))
    runtime.read(SLOW_PIN, 1)
    for (const [red] of runtime.frame(16)) expect(red).toBeLessThanOrEqual(0.5)
  })
})

import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { createFastReplayRuntime } from './fastReplay'
import { loadPattern, nativeDimension } from './loadPattern'
import { createFxShim, createShim } from './shim'
import { slowMoTunables, type SlowMoSettings } from './slowMo'

const modes = ['fast', 'fidelity'] as const
type Mode = typeof modes[number]
const rates = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 16, 1 / 32]
const prefix = '__pxlblz_slowmo_'
const settings: SlowMoSettings = {
  rate: 1, stepMs: 16, inBetween: 'clock', stagger: { shape: 'sweep', width: 0 },
  persistence: { attackMs: 0, decayMs: 0 },
}
const target = `export var red=1, green=0.5, blue=0.25, count=0, renders=0, elapsed=0, tick=0
export function beforeRender(delta){count+=1;elapsed+=delta;tick=time(1)}
export function render(index){renders+=1;rgb(red,green,blue)}
export function sliderRed(v){red=v}`
const channels = [1, 0.5, 0.25]
function points(n: number) {
  return Array.from({ length: n }, (_, i) => ({ sample: [i / n, 0.25, 0.75] }))
}
function artifact(source: string, input = settings, n = 5) {
  return bundleWithPasses(source, {}, [{ kind: 'slowmo', settings: input, pixelCount: n }])
}
function direct(source: string, mode: Mode, input = settings, n = 5, wrapped = true) {
  const a = wrapped ? artifact(source, input, n) : bundle(source, {})
  const dimension = nativeDimension(a.metadata.renderFns)
  const mapPoints = points(n)
  let virtualTime = 0
  let currentRate = input.rate
  const config = { mapPoints, pixelCount: n, dimensions: dimension, randomSeed: 7, getVirtualTime: () => virtualTime }
  const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
  const arrays: number[][] = []
  const realArray = shim.builtins.array as (size: number) => number[]
  shim.builtins.array = (size: number) => {
    const array = realArray(size)
    arrays.push(array)
    return array
  }
  const handle = loadPattern(mode === 'fast' ? a.code : a.fxCode, a.metadata, shim.builtins)
  const enc = shim.encodeScalar
  return {
    handle, shim, arrays,
    value(name: string) { return shim.decodeScalar(handle.getExports()[name] as number) },
    frame(displayDelta: number) {
      const delta = displayDelta * currentRate
      virtualTime += delta
      handle.beforeRender(enc(delta))
      return mapPoints.map(({ sample }, i) => {
        shim.resetCapturedPixel()
        if (dimension === 1) handle.render(enc(i))
        else if (dimension === 2) handle.render2D(enc(i), enc(sample[0]), enc(sample[1]))
        else handle.render3D(enc(i), enc(sample[0]), enc(sample[1]), enc(sample[2]))
        return [...shim.capturedPixel()]
      })
    },
    set(name: string, value: number) {
      if (name === 'rate') currentRate = value
      expect(handle.setRuntimeVar(['rate', 'attack', 'decay'].includes(name) ? prefix + name : name, enc(value))).toBe(true)
    },
    target(rgb: number[]) { ['red', 'green', 'blue'].forEach((name, i) => this.set(name, rgb[i])) },
  }
}
function close(actual: number[][], expected: number[][], tolerance: number) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((pixel, i) => {
    expect(pixel).toHaveLength(3)
    pixel.forEach((v, c) => {
      expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true)
      expect(Math.abs(v - expected[i][c]), `pixel ${i} channel ${c}: ${v} vs ${expected[i][c]}`).toBeLessThanOrEqual(tolerance)
    })
  })
}
const pixels = (rgb: number[], n = 5) => Array.from({ length: n }, () => [...rgb])
function advance(run: ReturnType<typeof direct>, wallMs: number, delta: number) {
  let result: number[][] = []
  for (let t = 0; t < wallMs;) {
    const d = Math.min(delta, wallMs - t)
    result = run.frame(d)
    t += d
  }
  return result
}
function decayRun(mode: Mode, rate: number, tau: number) {
  const run = direct(target, mode, { ...settings, rate, persistence: { attackMs: 0, decayMs: tau } })
  close(run.frame(0), pixels(channels), mode === 'fast' ? 0 : 2 ** -16)
  run.target([0, 0, 0])
  return run
}

for (const mode of modes) describe(`clock persistence ${mode}`, () => {
  const tolerance = mode === 'fast' ? 2 ** -10 : 2 ** -8
  for (const rate of rates) {
    for (const tau of [1000, 5000]) it(`I9 analytic wall-time attack rate${rate} tau${tau}`, () => {
      const run = direct(target, mode, { ...settings, rate, persistence: { attackMs: tau, decayMs: 0 } })
      close(run.frame(0), pixels([0, 0, 0]), 0)
      close(advance(run, tau, 16), pixels(channels.map(v => v * (1 - Math.exp(-1)))), 0.02)
    })
    for (const tau of [1000, 10000]) it(`I9 analytic wall-time decay rate${rate} tau${tau}`, () => {
      close(advance(decayRun(mode, rate, tau), tau, 16), pixels(channels.map(v => v * Math.exp(-1))), 0.02)
    })
    for (const direction of ['attack', 'decay'] as const) it(`I9 wall-time agreement ${direction} rate${rate}`, () => {
      const results = [5, 16, 33].map(delta => {
        const run = direction === 'decay' ? decayRun(mode, rate, 10000)
          : direct(target, mode, { ...settings, rate, persistence: { attackMs: 5000, decayMs: 0 } })
        if (direction === 'attack') run.frame(0)
        const result = advance(run, 1500, delta)
        result.forEach(pixel => pixel.forEach((v, c) => expect(Number.isFinite(v) && v >= 0 && v <= channels[c]).toBe(true)))
        const factor = direction === 'attack' ? 1 - Math.exp(-1500 / 5000) : Math.exp(-1500 / 10000)
        close(result, pixels(channels.map(v => v * factor)), 0.02)
        return result
      })
      results.slice(1).forEach(result => close(result, results[0], 1 / 255))
    })
    if (mode === 'fidelity') it(`I9 Precise tail decay10000 d5 rate${rate}`, () => {
      close(advance(decayRun(mode, rate, 10000), 70000, 5), pixels([0, 0, 0]), 1 / 255)
    })

    for (const dimension of [1, 2, 3]) for (const sink of ['rgb', 'hsv', 'hsv24', 'none']) {
      it(`I9 direct unwrapped tau0 parity rate${rate} ${dimension}D ${sink}`, () => {
        const name = dimension === 1 ? 'render' : `render${dimension}D`
        const args = dimension === 1 ? 'i' : dimension === 2 ? 'i,x,y' : 'i,x,y,z'
        const call = sink === 'none' ? '' : `${sink}(0.2+elapsed/10000+tick,0.5,0.25+elapsed/100000)`
        const source = `export var count=0,elapsed=0,tick=0,top=time(0.25)
export function beforeRender(d){count+=1;elapsed+=d;tick=time(0.25)}
export function ${name}(${args}){${call}}`
        const wrapped = direct(source, mode, { ...settings, rate })
        const plain = direct(source, mode, { ...settings, rate }, 5, false)
        for (const delta of [0, 5, 16, 33, 0, 100]) {
          close(wrapped.frame(delta), plain.frame(delta), tolerance)
          for (const key of ['count', 'elapsed', 'tick', 'top']) expect(wrapped.value(key)).toBe(plain.value(key))
        }
      })
    }
  }

  it('I9 paused d0 holds shown light while inner counters run exactly once, including nonzero first frame', () => {
    const run = direct(target, mode, { ...settings, rate: 1 / 4, persistence: { attackMs: 1000, decayMs: 1000 } })
    const shown = run.frame(33)
    close(shown, pixels(channels.map(v => v * (1 - Math.exp(-33 / 1000)))), 0.001)
    expect(run.value('count')).toBe(1)
    expect(run.value('elapsed')).toBe(33 / 4)
    expect(run.value('renders')).toBe(5)
    run.target([0, 1, 0])
    for (const tau of [0, 5000]) {
      run.set('attack', tau); run.set('decay', tau)
      for (let i = 0; i < 3; i++) close(run.frame(0), shown, 0)
    }
    expect(run.value('count')).toBe(7)
    expect(run.value('renders')).toBe(35)
    expect(run.value('elapsed')).toBe(33 / 4)
  })

  it('I9 exact clock-free RGB and scope-aware sinks/cross-renderer references', () => {
    const source = `function local(time,hsv){return hsv(time())}
export var count=0
export function beforeRender(d){count+=1}
export function render2D(i,x,y){rgb(0.5,0.25,0.125)}
export function render3D(i,x,y,z){local(function(){return 0.5},function(v){return v});render2D(i,x,y)}`
    const run = direct(source, mode)
    for (const delta of [0, 5, 16, 33]) close(run.frame(delta), pixels([0.5, 0.25, 0.125]), 0)
    // An absent beforeRender is synthesized; a locally shadowed hsv remains authored.
    const scoped = `export function render(i){function hsv(v){rgb(v,0,0)};hsv(0.5)}`
    close(direct(scoped, mode).frame(5), pixels([0.5, 0, 0]), 0)
  })

  it('I9 inlined library and top-level time retain the unwrapped clock', () => {
    const source = `export var top=time(0.25)
export function render(i){clocklib.shade(time(0.25))}`
    const libraries = { clocklib: 'function shade(v){rgb(v+time(0.25),0.25,0.125)}' }
    const bundled = bundle(source, libraries)
    const wrapped = direct(bundled.code, mode, { ...settings, rate: 1 / 4 })
    const plain = direct(bundled.code, mode, { ...settings, rate: 1 / 4 }, 5, false)
    for (const delta of [5, 16, 33, 0, 100]) close(wrapped.frame(delta), plain.frame(delta), tolerance)
    expect(wrapped.value('top')).toBe(plain.value('top'))
  })

  it('I11 metadata, slider, exact live globals and unchanged input', () => {
    const input = structuredClone(settings)
    const base = bundle(target, {})
    const a = artifact(target, input)
    for (const key of ['renderFns', 'controls', 'exportedVars', 'patternVars'] as const) expect(a.metadata[key]).toEqual(base.metadata[key])
    const names = ['rate', 'attack', 'decay'].map(name => prefix + name)
    expect(a.metadata.runtimeVars).toEqual([...(base.metadata.runtimeVars ?? base.metadata.patternVars), ...names])
    expect(a.summary.passes[0].slowMo).toEqual({ arrayWords: 27, tunables: names })
    expect(Object.keys(slowMoTunables(input))).toEqual(names)
    const run = direct(target, mode)
    run.handle.controls.sliderRed(run.shim.encodeScalar(0.25))
    close(run.frame(16), pixels([0.25, 0.5, 0.25]), tolerance)
    expect(input).toEqual(settings)
    expect(bundle(target, {})).toEqual(base)
  })

  it('I11 live rate/taus respond next frame without resetting authored time or counters', () => {
    const run = direct(target, mode)
    run.frame(16)
    run.set('attack', 1000); run.set('decay', 1000)
    run.target([0, 0, 0])
    const first = run.frame(16)[0]
    close([first], [channels.map(v => v * Math.exp(-16 / 1000))], 0.001)
    run.set('rate', 1 / 4)
    const second = run.frame(16)[0]
    close([second], [first.map(v => v * Math.exp(-16 / 1000))], 0.001)
    expect(run.value('elapsed')).toBe(36)
    expect(run.value('count')).toBe(3)
    expect(run.value('tick')).toBeGreaterThan(0)
    run.set('decay', 0)
    close(run.frame(16), pixels([0, 0, 0]), 0)
    run.target(channels); run.set('attack', 5000)
    close(run.frame(16), pixels(channels.map(v => v * (1 - Math.exp(-16 / 5000)))), 0.001)
    run.set('attack', 0)
    close(run.frame(16), pixels(channels), tolerance)
    expect(run.value('elapsed')).toBe(48)
    expect(run.value('count')).toBe(6)
  })

  it('I12 real allocations accept N3409 and render every pixel with tau0', () => {
    const source = 'export function render(i){rgb(0.5,0.25,0.125)}'
    const a = artifact(source, settings, 3409)
    expect(a.summary.passes[0].slowMo).toEqual({ arrayWords: 10239, tunables: ['rate', 'attack', 'decay'].map(name => prefix + name) })
    const run = direct(source, mode, settings, 3409)
    expect(run.arrays.map(array => array.length)).toEqual([3409, 3409, 3409])
    close(run.frame(16), pixels([0.5, 0.25, 0.125], 3409), 0)
  })

  it('I9 real replay artifact receives host-scaled clock delta', () => {
    const rate = 1 / 32
    const a = artifact('export function render(i){rgb(1,0.5,0.25)}', { ...settings, rate, persistence: { attackMs: 1000, decayMs: 0 } })
    const runtime = createFastReplayRuntime({ ...a, dimension: 1 }, { mapPoints: points(5), randomSeed: 7, fidelity: mode })
    close(runtime.advanceLive(0).pixels, pixels([0, 0, 0]), 0)
    let result = runtime.advanceLive(16 * rate)
    for (let i = 1; i < 100; i++) result = runtime.advanceLive(16 * rate)
    close(result.pixels, pixels(channels.map(v => v * (1 - Math.exp(-1.6)))), 0.02)
  })
})

it('I12 N3410 declines unchanged with empty tunables; clock off and empty recipe preserve identity', () => {
  const source = 'export function render(i){rgb(1,0,0)}'
  const input = structuredClone(settings)
  const base = bundle(source, {})
  const declined = artifact(source, input, 3410)
  expect(declined.code).toBe(base.code)
  expect(declined.fxCode).toBe(base.fxCode)
  expect(declined.metadata).toEqual(base.metadata)
  expect(declined.summary.passes[0]).toMatchObject({ declined: { reason: 'array-budget' }, slowMo: { arrayWords: 10242, tunables: [] } })
  const off = { ...input, persistence: null }
  expect(artifact(source, off)).toMatchObject({ ...base, summary: { passes: [] } })
  expect(bundleWithPasses(source, {}, [])).toMatchObject({ ...base, summary: { passes: [] } })
  expect(slowMoTunables(off)).toEqual({})
  expect(off).toEqual({ ...settings, persistence: null })
  expect(input).toEqual(settings)
})

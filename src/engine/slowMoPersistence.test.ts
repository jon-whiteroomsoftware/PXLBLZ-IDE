import identity from '@/test/fixtures/slowMoStaggerIdentity.js?raw'
import baseline from '@/test/fixtures/slowMoSliceBIdentity.js?raw'
import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { createFastReplayRuntime } from './fastReplay'
import { loadPattern } from './loadPattern'
import { createFxShim, createShim } from './shim'
import { slowMoTunables, type SlowMoSettings } from './slowMo'

const modes = ['fast', 'fidelity'] as const
type Mode = typeof modes[number]
const prefix = '__pxlblz_slowmo_'
const points = [
  [0, 0, 0], [0.25, 0.5, 0.5], [0.5, 0.5, 0.5], [0.75, 0.25, 1], [1, 1, 1],
].map(sample => ({ sample }))
const settings: SlowMoSettings = { position: 0.75, dreamy: Math.sqrt(1500 / 10000) }
const target = `export var red=1, green=0.5, blue=0.25, count=0, tick=0
export function beforeRender(){count+=1;tick=time(1)}
export function render(index){rgb(red,green,blue)}`
function artifact(source: string, input = settings, n = points.length) {
  return bundleWithPasses(source, {}, [{ kind: 'slowmo', settings: input, pixelCount: n }])
}
function direct(source: string, mode: Mode, input = settings) {
  const a = artifact(source, input)
  const config = { mapPoints: points, pixelCount: points.length, dimensions: 1 as const, getVirtualTime: () => 0 }
  const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
  const handle = loadPattern(mode === 'fast' ? a.code : a.fxCode, a.metadata, shim.builtins)
  const enc = shim.encodeScalar
  return {
    handle, shim,
    value(name: string) { return shim.decodeScalar(handle.getExports()[name] as number) },
    frame(delta: number) {
      handle.beforeRender(enc(delta))
      return points.map((_, i) => { handle.render(enc(i)); return [...shim.capturedPixel()] })
    },
    set(name: string, value: number) { expect(handle.setRuntimeVar(prefix + name, enc(value))).toBe(true) },
    target(rgb: number[]) {
      for (const [i, name] of ['red', 'green', 'blue'].entries()) {
        expect(handle.setRuntimeVar(name, enc(rgb[i]))).toBe(true)
      }
    },
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
const pixels = (rgb: number[]) => points.map(() => [...rgb])
function advance(run: ReturnType<typeof direct>, elapsed: number, delta: number) {
  let result: number[][] = []
  for (let t = 0; t < elapsed;) {
    const d = Math.min(delta, elapsed - t)
    result = run.frame(d)
    t += d
  }
  return result
}
function decayRun(mode: Mode, tau: number) {
  const run = direct(target, mode, { ...settings, dreamy: Math.sqrt(tau / 10000) })
  run.target([1, 1, 1])
  close(run.frame(0), pixels([1, 1, 1]), 0)
  run.target([0, 0, 0])
  close(run.frame(32), pixels([1, 1, 1]), 0) // Blend starts at the previous capture.
  return run
}

for (const mode of modes) {
  const tolerance = mode === 'fast' ? 2 ** -10 : 2 ** -8
  describe(`decay persistence ${mode}`, () => {
    for (const tau of [2500, 10000]) for (const delta of [5, 16, 33]) {
      it(`I9 analytic wall-time decay tau${tau} d${delta}`, () => {
        const run = decayRun(mode, tau)
        // Reach the dark capture first; subsequent time is an independent exponential.
        run.frame(32)
        const start = run.frame(0)[0][0]
        close(advance(run, tau, delta), pixels([start, start, start].map(v => v * Math.exp(-1))), 0.02)
        const end = advance(run, 6 * tau, delta)
        for (const pixel of end) for (const v of pixel) expect(v).toBeLessThanOrEqual(1 / 255)
      })
    }
    it('I9 rises immediately per channel, holds at delta zero, and keeps decay through bypass', () => {
      const run = direct(target, mode, { position: 1, dreamy: 1 })
      close(run.frame(0), pixels([1, 0.5, 0.25]), tolerance)
      run.target([0, 1, 0])
      expect(run.frame(0)).toEqual(pixels([1, 0.5, 0.25]))
      close(run.frame(16), pixels([Math.exp(-16/10000), 1, 0.25*Math.exp(-16/10000)]), tolerance)
      const previous = run.frame(0)
      run.target([1, 0, 1])
      expect(run.frame(0)).toEqual(previous)
    })
    it('I11 changes decay in place without re-priming clocks or authored controls', () => {
      const input = Object.freeze({ position: 1, dreamy: 0 })
      const a = artifact(target, input), base = bundle(target, {})
      for (const key of ['renderFns', 'exportedVars', 'patternVars'] as const) expect(a.metadata[key]).toEqual(base.metadata[key])
      expect(a.metadata.controls).toEqual([...base.metadata.controls, { exportName: 'slider__pxlblz_slowmo_speed', kind: 'slider', label: 'Slow-mo speed' }])
      expect(a.summary.passes[0].slowMo?.tunables).toEqual(Object.keys(slowMoTunables(input)))
      const run = direct(target, mode, input)
      run.frame(0)
      const count = run.value('count')
      run.set('decay', 10000)
      run.target([0, 1, 0])
      const fading = run.frame(16)
      expect(fading[0][0]).toBeGreaterThan(0.99)
      expect(fading[0][1]).toBe(1)
      run.set('decay', 0)
      close(run.frame(16), pixels([0, 1, 0]), tolerance)
      expect(run.value('count')).toBe(count + 2)
      expect(input).toEqual({ position: 1, dreamy: 0 })
    })
    it('I12 runs every pixel at N1133 and declines N1134 without changing the artifact', () => {
      const source = 'export function render(index){rgb(1,0.5,0.25)}'
      const accepted = artifact(source, settings, 1133)
      expect(accepted.summary.passes[0].slowMo?.arrayWords).toBe(10233)
      const runtime = createFastReplayRuntime({ ...accepted, dimension: 1 }, {
        mapPoints: Array.from({ length: 1133 }, (_, i) => ({ sample: [i / 1133] })), fidelity: mode, randomSeed: 7,
      })
      close(runtime.advanceLive(0).pixels, Array.from({ length: 1133 }, () => [1, 0.5, 0.25]), tolerance)
      const declined = artifact(source, settings, 1134), base = bundle(source, {})
      expect(declined.code).toBe(base.code)
      expect(declined.fxCode).toBe(base.fxCode)
      expect(declined.metadata).toEqual(base.metadata)
      expect(declined.summary.passes[0]).toMatchObject({
        declined: { reason: 'array-budget' }, slowMo: { arrayWords: 10242, tunables: [] },
      })
    })
    for (const dimension of [1, 2, 3] as const) {
      it(`I9 dreamy zero equals frozen plain Blend within one LED level, d${dimension}, every sink`, () => {
        for (const sink of [0, 1, 2, 3]) {
          const source = identity.replace('sinkMode = 0', `sinkMode = ${sink}`)
          const frozen = baseline.replace('sinkMode = 0', `sinkMode = ${sink}`)
            .replace('var __pxlblz_slowmo_width = 0.5', 'var __pxlblz_slowmo_width = 0')
          const prior = createFastReplayRuntime({ ...bundle(frozen, {}), dimension }, { mapPoints: points, fidelity: mode, randomSeed: 7 })
          const current = createFastReplayRuntime({ ...artifact(source, { position: 0.5, dreamy: 0 }), dimension }, { mapPoints: points, fidelity: mode, randomSeed: 7 })
          for (const delta of [0, 64, 4, 12, 16, 32, 64, 100, 0, 16, 48]) {
            close(current.advanceLive(delta).pixels, prior.advanceLive(delta).pixels, 1 / 255)
          }
        }
      })
    }
  })
}

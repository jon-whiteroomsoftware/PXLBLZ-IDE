import identity from '@/test/fixtures/slowMoStaggerIdentity.js?raw'
import baseline from '@/test/fixtures/slowMoSliceBIdentity.js?raw'
import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { createFastReplayRuntime } from './fastReplay'
import { loadPattern } from './loadPattern'
import { createFxShim, createShim } from './shim'
import { emitSlowMoWrapper, slowMoTunables, type SlowMoSettings } from './slowMo'

const modes = ['fast', 'fidelity'] as const
type Mode = typeof modes[number]
const prefix = '__pxlblz_slowmo_'
const curves = ['hold', 'blend', 'eased'] as const
const shapes = ['sweep', 'radial', 'scatter'] as const
const points = [
  [0, 0, 0], [0.25, 0.5, 0.5], [0.5, 0.5, 0.5], [0.75, 0.25, 1], [1, 1, 1],
].map(sample => ({ sample }))
const settings: SlowMoSettings = {
  rate: 1, stepMs: 16, inBetween: 'hold', stagger: { shape: 'sweep', width: 0 },
  persistence: { attackMs: 1500, decayMs: 1500 },
}
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
  const run = direct(target, mode, { ...settings, persistence: { attackMs: 0, decayMs: tau } })
  run.target([1, 1, 1])
  close(run.frame(0), pixels([1, 1, 1]), 0)
  run.target([0, 0, 0])
  close(run.frame(16), pixels([1, 1, 1]), 0) // Hold displays the previous capture.
  return run
}

for (const mode of modes) {
  const tolerance = mode === 'fast' ? 2 ** -10 : 2 ** -8
  describe(`blend persistence ${mode}`, () => {
    for (const tau of [1000, 5000]) for (const delta of [5, 16]) {
      it(`I9 analytic attack tau${tau} d${delta}`, () => {
        const run = direct(target, mode, { ...settings, persistence: { attackMs: tau, decayMs: 0 } })
        close(run.frame(0), pixels([0, 0, 0]), 0)
        close(advance(run, tau, delta), pixels([1, 0.5, 0.25].map(v => v * (1 - Math.exp(-1)))), 0.02)
      })
    }
    for (const tau of [1000, 10000]) for (const delta of [5, 16]) {
      it(`I9 analytic decay tau${tau} d${delta}`, () => {
        const run = decayRun(mode, tau)
        close(run.frame(16), pixels([1, 1, 1].map(v => v * Math.exp(-16 / tau))), tolerance)
        close(advance(run, tau - 16, delta), pixels([1, 1, 1].map(v => v * Math.exp(-1))), 0.02)
        const end = advance(run, 6 * tau, delta)
        close(end, pixels([1, 1, 1].map(v => v * Math.exp(-7))), tolerance)
        for (const pixel of end) for (const v of pixel) expect(v).toBeLessThanOrEqual(1 / 255)
      })
    }
    it('I9 wall-time attack and decay agree at W1500 for d5/16/33, with mixed channels', () => {
      const attacks: number[][][] = [], decays: number[][][] = []
      for (const delta of [5, 16, 33]) {
        const attack = direct(target, mode)
        attack.frame(0)
        attacks.push(advance(attack, 1500, delta))
        const decay = direct(target, mode, { ...settings, persistence: { attackMs: 0, decayMs: 1500 } })
        decay.frame(0)
        decay.target([0, 0, 0])
        decay.frame(16)
        decay.frame(16) // First 16 ms of the fade is included in W.
        decays.push(advance(decay, 1500 - 16, delta))
      }
      for (const result of attacks) close(result, attacks[0], 1 / 255)
      for (const result of decays) close(result, decays[0], 1 / 255)
      for (const result of [...attacks, ...decays]) result.forEach(pixel => pixel.forEach((v, c) => {
        expect(v).toBeLessThanOrEqual([1, 0.5, 0.25][c])
      }))
    })
    for (const tau of [0, 1500]) {
      it(`I9 d0 freezes an existing shown frame with changed target, tau${tau}`, () => {
        const run = direct(target, mode, { ...settings, inBetween: 'blend', persistence: { attackMs: tau, decayMs: tau } })
        run.frame(0)
        run.target([0, 0, 0])
        run.frame(16)
        const previous = run.frame(8)
        run.target([0, 1, 0])
        run.set('curve', 0) // Changes the in-between target even while the capture is paused.
        expect(run.frame(0)).toEqual(previous)
        expect(run.frame(0)).toEqual(previous)
      })
    }
    it('I11 live attack/decay change the next response without re-priming authored clocks', () => {
      const input = structuredClone(settings), snapshot = structuredClone(input)
      const a = artifact(target, input), base = bundle(target, {})
      for (const key of ['renderFns', 'exportedVars', 'patternVars'] as const) {
        expect(a.metadata[key]).toEqual(base.metadata[key])
      }
      expect(a.metadata.controls).toEqual([...base.metadata.controls, { exportName: 'slider__pxlblz_slowmo_speed', kind: 'slider', label: 'Slow-mo speed' }])
      const names = Object.keys(slowMoTunables(input))
      expect(names).toHaveLength(7)
      expect(a.metadata.runtimeVars).toEqual(expect.arrayContaining(names))
      expect(a.summary.passes[0].slowMo?.tunables).toEqual(names)
      expect(a.code.match(/array\(pixelCount\)/g)).toHaveLength(9)
      expect(Object.keys(slowMoTunables({ ...input, persistence: null }))).toHaveLength(5)
      const run = direct(target, mode, input)
      run.frame(0)
      const before = run.frame(64)
      const count = run.value('count'), tick = run.value('tick')
      run.set('attack', 0)
      close(run.frame(16), pixels([1, 0.5, 0.25]), tolerance)
      expect(before[0][0]).toBeLessThan(0.1)
      expect(run.value('count')).toBe(count + 1)
      expect(run.value('tick')).toBeGreaterThan(tick)
      run.target([0, 1, 0])
      run.set('attack', 5000)
      run.set('decay', 10000)
      run.frame(16)
      const fading = run.frame(16)
      expect(fading[0][0]).toBeGreaterThan(0.99)
      expect(fading[0][1]).toBeGreaterThan(0.5)
      expect(fading[0][1]).toBeLessThan(0.51)
      run.set('decay', 0)
      const next = run.frame(16)
      close(next, pixels([0, next[0][1], 0]), tolerance)
      expect(run.value('count')).toBe(count + 4)
      expect(input).toEqual(snapshot)
      expect(target).toContain('red=1, green=0.5, blue=0.25')
    })
    it('I12 runs every pixel at N1133 and declines N1134 without changing the artifact', () => {
      const source = 'export function render(index){rgb(1,0.5,0.25)}'
      const accepted = artifact(source, { ...settings, persistence: { attackMs: 0, decayMs: 0 } }, 1133)
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
    for (const dimension of [1, 2, 3] as const) for (const inBetween of curves) {
      it(`I9 tau0 pass-through d${dimension} ${inBetween}, every sink`, () => {
        for (const sink of [0, 1, 2, 3]) {
          const source = identity.replace('sinkMode = 0', `sinkMode = ${sink}`)
          const input = { ...settings, rate: 0.25, inBetween, stagger: { shape: 'scatter' as const, width: 0.5 } }
          const make = (persistence: SlowMoSettings['persistence']) => createFastReplayRuntime({
            ...artifact(source, { ...input, persistence }), dimension,
          }, { mapPoints: points, fidelity: mode, randomSeed: 7 })
          const on = make({ attackMs: 0, decayMs: 0 }), off = make(null)
          for (const d of [0, 64, 4, 12, 16, 32, 64, 100, 0, 16, 48]) {
            close(on.advanceLive(d).pixels, off.advanceLive(d).pixels, tolerance)
          }
        }
      })
    }
    for (const dimension of [1, 2, 3] as const) for (const shape of shapes) for (const inBetween of curves) {
      it(`B null bit identity d${dimension} ${shape} ${inBetween}`, () => {
        for (const width of [0, 0.5, 0.9]) for (const sink of [0, 1, 2, 3]) {
          const source = identity.replace('sinkMode = 0', `sinkMode = ${sink}`)
          let frozen = baseline.replace('sinkMode = 0', `sinkMode = ${sink}`)
          for (const [name, value] of Object.entries({ curve: curves.indexOf(inBetween), shape: shapes.indexOf(shape), width })) {
            frozen = frozen.replace(new RegExp(`var ${prefix}${name} = [0-9.]+`), `var ${prefix}${name} = ${value}`)
          }
          const input: SlowMoSettings = { ...settings, rate: 0.25, inBetween, stagger: { shape, width }, persistence: null }
          const old = createFastReplayRuntime({ ...bundleWithPasses(frozen, {}, []), dimension }, { mapPoints: points, fidelity: mode, randomSeed: 7 })
          const current = createFastReplayRuntime({ ...artifact(source, input), dimension }, { mapPoints: points, fidelity: mode, randomSeed: 7 })
          for (const d of [0, 64, 4, 12, 16, 32, 64, 100, 0, 16, 48]) {
            expect(current.advanceLive(d).pixels).toEqual(old.advanceLive(d).pixels)
          }
        }
      })
    }
  })
}

describe('persistence tunable validation', () => {
  for (const [key, max] of [['attackMs', 5000], ['decayMs', 10000]] as const) {
    it.each([-1, max + 1, NaN, Infinity, -Infinity])(`rejects ${key} %s`, value => {
      const input = { ...settings, persistence: { attackMs: 0, decayMs: 0, [key]: value } }
      expect(() => slowMoTunables(input)).toThrow(RangeError)
      expect(() => emitSlowMoWrapper(target, input, 5)).toThrow(RangeError)
    })
    it.each([0, max])(`accepts ${key} endpoint %s`, value => {
      expect(slowMoTunables({ ...settings, persistence: { attackMs: 0, decayMs: 0, [key]: value } })[
        prefix + (key === 'attackMs' ? 'attack' : 'decay')
      ]).toBe(value)
    })
  }
})

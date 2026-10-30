import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { loadPattern } from './loadPattern'
import { createFxShim, createShim } from './shim'
import * as slowMo from './slowMo'

type Settings = slowMo.SlowMoSettings
const slider = 'slider__pxlblz_slowmo_speed'
const settings: Settings = { position: 0.5, dreamy: 0 }
const source = `export var receivedMs=0
export function beforeRender(d){receivedMs+=d}
export function render(i){rgb(receivedMs/4096,0,0)}`
const points = [0, 0.5, 1].map(x => ({ sample: [x, 0.5, 0.75] }))
const api = slowMo as typeof slowMo & {
  slowMoRateFromPosition: (p: number) => number
  slowMoPositionFromRate: (r: number) => number
  SLOW_MO_SPEED_SLIDER: string
}
function runtime(mode: 'fast' | 'fidelity', input: Settings = settings, text = source, wrapped = true) {
  const artifact = wrapped ? bundleWithPasses(text, {}, [{ kind: 'slowmo', settings: input, pixelCount: 3 }]) : bundle(text, {})
  const shim = (mode === 'fast' ? createShim : createFxShim)({ pixelCount: 3, mapPoints: points, dimensions: 1, getVirtualTime: () => 0 })
  const handle = loadPattern(mode === 'fast' ? artifact.code : artifact.fxCode, artifact.metadata, shim.builtins)
  const enc = shim.encodeScalar
  return {
    artifact, handle, shim,
    set(p: number) { handle.controls[slider](enc(p)) },
    time() { return shim.decodeScalar(handle.getExports().receivedMs as number) },
    frame(delta: number, entry: 'render' | 'render2D' | 'render3D' = 'render') {
      handle.beforeRender(enc(delta))
      return points.map((_, i) => {
        handle[entry](enc(i), enc(i / 2), enc(0.5), enc(0.75))
        return [...shim.capturedPixel()]
      })
    },
  }
}

it('T1 maps logarithmic position with clamping, inversion and finite validation', () => {
  expect(api.SLOW_MO_SPEED_SLIDER).toBe(slider)
  for (const [p, rate] of [[-1, 1 / 16], [0, 1 / 16], [0.25, 1 / 8], [0.5, 1 / 4], [0.75, 1 / 2], [1, 1], [2, 1]]) {
    expect(api.slowMoRateFromPosition(p)).toBe(rate)
    expect(api.slowMoPositionFromRate(rate)).toBe(Math.max(0, Math.min(1, p)))
  }
  const samples = Array.from({ length: 101 }, (_, i) => api.slowMoRateFromPosition(i / 100))
  expect(samples).toEqual([...samples].sort((a, b) => a - b))
  for (const p of [NaN, Infinity, -Infinity]) {
    expect(() => api.slowMoRateFromPosition(p)).toThrow(RangeError)
    expect(() => slowMo.emitSlowMoWrapper(source, { ...settings, position: p }, 3)).toThrow(RangeError)
  }
  expect(api.slowMoPositionFromRate(1 / 32)).toBe(0)
})

for (const mode of ['fast', 'fidelity'] as const) {
  const tolerance = mode === 'fast' ? 1e-8 : 0.004
  describe(`knob emitted artifact ${mode}`, () => {
    it.each([-1, 0, 0.25, 0.5, 0.75, 1, 2])('T1 actual elapsed time at position %s', p => {
      const r = runtime(mode)
      r.frame(0); r.set(p)
      for (let i = 0; i < 64; i++) r.frame(16)
      const rate = 2 ** (-4 * (1 - Math.max(0, Math.min(1, p))))
      expect(Math.abs(r.time() - 1024 * rate)).toBeLessThanOrEqual(16.1)
    })

    for (const dreamy of [0, 0.5, 1]) {
      const input: Settings = { ...settings, dreamy }
      it(`T2 integrates sweeps, long bypass, per-frame and boundary changes: dreamy ${dreamy}`, () => {
        const r = runtime(mode, input)
        r.frame(0)
        const sequence = [
          ...Array.from({ length: 101 }, (_, i) => 1 - i / 100),
          ...Array.from({ length: 101 }, (_, i) => i / 100),
          ...Array<number>(200).fill(1), 0,
          ...Array.from({ length: 100 }, (_, i) => i % 2 ? 0.75 : 0),
        ]
        let integrated = 0, bypass = false
        sequence.forEach((p, i) => {
          const delta = [7, 9, 16, 32][i % 4]
          bypass = bypass ? p >= 0.94 : p >= 0.97
          integrated += delta * (bypass ? 1 : 2 ** (-4 * (1 - p)))
          r.set(p); const pixels = r.frame(delta)
          // 0.15 ms bounds accumulated position/pow quantization over this sequence.
          expect(Math.abs(r.time() - integrated)).toBeLessThanOrEqual(16.15)
          expect(pixels.flat().every(Number.isFinite)).toBe(true)
        })
      })

      it.each([0, 256])(`T5 reseeds both endpoints on exit: dreamy ${dreamy}, delta %s`, delta => {
        const discontinuous = `export var receivedMs=0; export function beforeRender(d){receivedMs+=d}
export function render(i){rgb(receivedMs>=128,receivedMs<128,0)}`
        const r = runtime(mode, input, discontinuous)
        r.frame(0); r.frame(64); r.set(1)
        for (let i = 0; i < 200; i++) r.frame(16)
        const before = r.time()
        const previousPixels = r.frame(0)
        r.set(0)
        const exit = r.frame(delta)
        expect(r.time()).toBeGreaterThanOrEqual(before)
        expect(r.time() - before).toBeLessThanOrEqual(16)
        for (const [i, pixel] of exit.entries()) {
          expect(pixel[0]).toBeCloseTo(1, 2)
          expect(pixel[1]).toBeLessThanOrEqual(previousPixels[i][1] + tolerance)
          if (dreamy === 0) expect(pixel[1]).toBeCloseTo(0, 2)
        }
        for (let i = 0; i < 8; i++) {
          for (const pixel of r.frame(16)) expect(pixel[0]).toBeCloseTo(1, 2)
        }
      })
    }

    it('T3 speed changes have no extra smooth-color jump', () => {
      for (const phaseDelta of [0, 8]) {
        const positions = [0.75, 0, 0.5, 0.25]
        const deltas = [0, 64, phaseDelta, ...positions.flatMap(() => [0, 16])]
        const maxUnchangedStep = (position: number) => {
          const unchanged = runtime(mode, { ...settings, position })
          let previous = unchanged.frame(deltas[0])[0][0], maxStep = 0
          for (const delta of deltas.slice(1)) {
            const next = unchanged.frame(delta)[0][0]
            maxStep = Math.max(maxStep, Math.abs(next - previous))
            previous = next
          }
          return maxStep
        }
        const r = runtime(mode, settings)
        r.frame(0); r.set(0.5); r.frame(64); r.frame(phaseDelta)
        let previousPosition = 0.5
        for (const p of positions) {
          const before = r.frame(0)[0][0]
          // #1241 c6478641283: compare exactly the pre/post unchanged runs,
          // with the same arithmetic mode, structure and complete delta sequence.
          const maxStep = Math.max(maxUnchangedStep(previousPosition), maxUnchangedStep(p))
          r.set(p)
          // This ramp uses exact dyadic values in both arithmetic modes.
          expect.soft(Math.abs(r.frame(16)[0][0] - before), `phase ${phaseDelta}, position ${p}`).toBeLessThanOrEqual(maxStep + 1e-8)
          previousPosition = p
        }
      }
    })

    {
      it('T3 bypass entry catches up by at most one capture step', () => {
        const r = runtime(mode, settings)
        r.frame(0)
        let before = 0
        for (let i = 0; i < 16; i++) before = r.frame(16)[0][0]
        const timeBefore = r.time()
        r.set(1)
        const after = r.frame(16)[0][0]
        const elapsed = r.time() - timeBefore
        expect(elapsed).toBe(16)
        expect(after).toBe(r.time() / 4096)
        expect(after - before - elapsed / 4096).toBeLessThanOrEqual(16 / 4096 + 1e-8)
        expect(after - before).toBe(32 / 4096)
      })
    }

    for (const entry of ['render', 'render2D', 'render3D'] as const) {
      it.each(['rgb', 'hsv', 'hsv24'])(`T4 ${entry}/%s full-speed equals native exactly including first delta`, sink => {
        const text = `export var receivedMs=0; export function beforeRender(d){receivedMs+=d}
export function ${entry}(i,x,y,z){${sink}(receivedMs/256,0.75,0.8)}`
        for (const deltas of [[0, 7, 9, 16, 33, 1, 15, 64], [7, 9, 16]]) {
          const r = runtime(mode, settings, text)
          const base = runtime(mode, settings, text, false)
          r.set(1)
          for (const delta of deltas) {
            expect(r.frame(delta, entry)).toEqual(base.frame(delta, entry))
            expect(r.time()).toBe(base.time())
          }
        }
      })
    }

    it('T6 hysteresis stays direct after entry until below the exit boundary', () => {
      const r = runtime(mode)
      r.frame(0)
      let before = r.time()
      r.set(0.95); r.frame(1)
      expect(r.time()).toBe(before)
      for (const p of [0.99, ...Array.from({ length: 60 }, (_, i) => i % 2 ? 0.95 : 0.99)]) {
        before = r.time(); r.set(p)
        const pixels = r.frame(1)
        expect(r.time() - before).toBe(1)
        expect(Math.abs(pixels[0][0] - r.time() / 4096)).toBeLessThanOrEqual(tolerance)
      }
      before = r.time(); r.set(0.93); r.frame(1)
      expect(r.time()).toBe(before)
    })

    it('T7 preserves authored controls/defaults and T8 array budget', () => {
      const text = `export var speed=0.2, receivedMs=0; export function sliderSpeed(v){speed=v}
export function beforeRender(d){receivedMs+=d} export function render(i){rgb(speed,0,0)}`
      const r = runtime(mode, { ...settings, position: 0 }, text)
      expect(r.artifact.metadata.controls.filter(c => c.exportName === slider)).toHaveLength(1)
      r.handle.controls.sliderSpeed(r.shim.encodeScalar(0.75))
      expect(r.frame(0)[0][0]).toBe(0.75)
      for (let i = 0; i < 32; i++) r.frame(16)
      expect(r.time()).toBe(32)
      expect(slowMo.planSlowMo(text, settings, 3).arrayWords).toBe(9 * 3 + 36)
      expect(r.artifact.code.match(/= array\(pixelCount\)/g)).toHaveLength(9)
    })
  })
}

it('T7 declines every exact reserved-slider identifier collision without modifying source', () => {
  for (const text of [`var ${slider}=0; ${source}`, `function f(${slider}){return ${slider}} ${source}`]) {
    const result = slowMo.emitSlowMoWrapper(text, settings, 3)
    expect(result.code).toBe(text)
    expect(result.plan.declined).toEqual({ reason: 'reserved-prefix', message: `Slow-mo source uses the reserved ${slider} name.` })
  }
})

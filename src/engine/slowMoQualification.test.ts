import sparkle from '@/test/fixtures/slowMoSparkle.js?raw'
import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { createFastReplayRuntime, type FastReplayResult } from './fastReplay'
import type { SlowMoSettings } from './slowMo'

const settings: SlowMoSettings = {
  rate: 0.25, stepMs: 16, inBetween: 'hold',
  stagger: { shape: 'sweep', width: 0 }, persistence: null,
}
const modes = ['fast', 'fidelity'] as const
type Mode = typeof modes[number]
const points = Array.from({ length: 3 }, (_, i) => ({ sample: [i / 4, 0.5, 0.75] }))
const counter = (scale: number) => `export var count=0;
export function beforeRender(){count+=1} export function render(i){rgb(count/${scale},0,0)}`
const scalar = (value: unknown, mode: Mode) => Number(value) / (mode === 'fidelity' ? 65536 : 1)
const pixels = (result: FastReplayResult) => result.pixels.map(pixel => [...pixel])
function runtime(source: string, mode: Mode, input = settings, wrapped = true, exposeClock = false) {
  const prepared = wrapped
    ? bundleWithPasses(source, {}, [{ kind: 'slowmo', settings: input, pixelCount: points.length }])
    : bundle(source, {})
  const metadata = exposeClock ? {
    ...prepared.metadata,
    runtimeVars: [...(prepared.metadata.runtimeVars ?? []), '__pxlblz_slowmo_T'],
  } : prepared.metadata
  const replay = createFastReplayRuntime({ ...prepared, metadata, dimension: 1 }, {
    mapPoints: points, randomSeed: 7, fidelity: mode,
  })
  return { ...replay, advanceLive: (delta: number) => replay.advanceLive(delta * (wrapped ? 1 : input.rate)) }
}
function close(actual: number[][], expected: number[][], tolerance: number) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((pixel, i) => {
    expect(pixel).toHaveLength(expected[i].length)
    pixel.forEach((value, channel) => {
      expect(Number.isFinite(value)).toBe(true)
      expect(Math.abs(value - expected[i][channel])).toBeLessThanOrEqual(tolerance)
    })
  })
}
const solid = (red: number, blue = 0) => points.map(() => [red, 0, blue])

// Pixels are the consumer oracle; exported counters characterize exact pacing.
// All schedules below cross at most one real step per display frame (I2 remains separate).
for (const mode of modes) {
  const tolerance = mode === 'fast' ? 2 ** -10 : 2 ** -8
  describe(`slow-mo qualification (${mode})`, () => {
    it('I3 preserves complete boundary pixels across display rates', () => {
      const sequences = [4, 8, 16, 32].map(delta => {
        const r = runtime(counter(64), mode)
        r.advanceLive(0)
        return Array.from({ length: 12 }, () => {
          let result = r.advanceLive(delta)
          for (let wall = delta; wall < 64; wall += delta) result = r.advanceLive(delta)
          return pixels(result)
        })
      })
      sequences.forEach(sequence => sequence.forEach((frame, i) => {
        close(frame, sequences[0][i], mode === 'fast' ? 0 : tolerance)
        close(frame, solid((i + 1) / 64), tolerance)
      }))
    })

    it('I3 characterizes 16.67ms display pacing and lagged pixels', () => {
      const r = runtime(counter(64), mode)
      const prime = scalar(r.advanceLive(0).exports.count, mode)
      let result = r.advanceLive(16.67)
      for (let i = 1; i < 120; i++) result = r.advanceLive(16.67)
      const count = scalar(result.exports.count, mode)
      expect(Math.abs(count - prime - Math.floor(2000.4 * settings.rate / 16))).toBeLessThanOrEqual(1)
      expect((count - 1) / 64).toBeGreaterThanOrEqual(0)
      expect((count - 1) / 64).toBeLessThanOrEqual(1)
      close(pixels(result), solid((count - 1) / 64), tolerance)
    })

    for (const rate of [1, 1 / 4, 1 / 32]) {
      for (const delta of [4, 16]) {
        it(`I4 measures wrapped and clock per-frame pace at rate ${rate}, d=${delta}`, () => {
          for (const wrapped of [true, false]) {
            const r = runtime(counter(1024), mode, { ...settings, rate }, wrapped)
            const prime = scalar(r.advanceLive(0).exports.count, mode)
            let result = r.advanceLive(delta)
            for (let wall = delta; wall < 1024; wall += delta) result = r.advanceLive(delta)
            const count = scalar(result.exports.count, mode)
            expect(count - prime).toBe(wrapped ? Math.floor(1024 * rate / 16) : 1024 / delta)
            close(pixels(result), solid((count - (wrapped ? 1 : 0)) / 1024), tolerance)
          }
        })
      }
    }

    for (const inBetween of ['blend', 'eased'] as const) {
      it(`I7 ${inBetween} follows analytic crossfades through interval boundaries`, () => {
        const r = runtime(`var count=0; export function beforeRender(){count+=1}
export function render(i){rgb(count%2,0,1-count%2)}`, mode, { ...settings, inBetween })
        r.advanceLive(0)
        let result = r.advanceLive(64)
        for (let interval = 0; interval < 4; interval++) {
          let previous = pixels(result)
          let previousC = 0
          for (const f of [0, 0.25, 0.5, 0.75, 1]) {
            if (f > 0) result = r.advanceLive(16)
            const c = inBetween === 'blend' ? f : f * f * (3 - 2 * f)
            const red = interval % 2 === 0 ? 1 - c : c
            const current = pixels(result)
            close(current, solid(red, 1 - red), tolerance)
            current.forEach((pixel, i) => pixel.forEach((value, channel) => {
              expect(Math.abs(value - previous[i][channel])).toBeLessThanOrEqual(c - previousC + tolerance)
            }))
            expect(current.every(pixel => pixel[1] === 0)).toBe(true)
            previous = current
            previousC = c
          }
        }
      })
    }

    it('I10 wraps the exposed clock with finite, hold-lagged emitted phases', () => {
      const r = runtime('export function render(i){rgb(time(0.25),time(1),time(0.1))}', mode,
        { ...settings, rate: 1 }, true, true)
      const initial = 16384 - 16 / 65536
      const snapshot = r.snapshot()
      r.restore({ ...snapshot, runtimeState: {
        ...snapshot.runtimeState, __pxlblz_slowmo_T: initial * (mode === 'fidelity' ? 65536 : 1),
      } })
      const times = [initial, 0, 16 / 65536, 32 / 65536]
      const lagged = [initial, initial, 0, 16 / 65536]
      let previous: number[][] | undefined
      times.forEach((time, i) => {
        const frame = pixels(r.advanceLive(i === 0 ? 0 : 16))
        const actualTime = scalar(r.snapshot().runtimeState.__pxlblz_slowmo_T, mode)
        expect(actualTime).toBe(time)
        expect(Number.isFinite(actualTime)).toBe(true)
        expect(actualTime).toBeGreaterThanOrEqual(0)
        expect(actualTime).toBeLessThan(16384)
        frame.forEach((pixel, index) => {
          for (const [channel, interval] of [0.25, 1].entries()) {
            expect(Math.abs(pixel[channel] - (lagged[i] % interval) / interval)).toBeLessThanOrEqual(tolerance)
            if (i === 2 && previous) {
              const difference = Math.abs(pixel[channel] - previous[index][channel])
              expect(Math.min(difference, 1 - difference)).toBeLessThanOrEqual(16 / (65536 * interval) + tolerance)
            }
          }
          pixel.forEach(value => {
            expect(Number.isFinite(value)).toBe(true)
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(1)
          })
        })
        previous = frame
      })
    })

    it('sparkle fades once per frame and seeded clock pixels ignore rate', () => {
      const sequences = [1, 1 / 4, 1 / 32].map(rate => {
        const r = runtime(sparkle, mode, { ...settings, rate }, false)
        let previous = pixels(r.advanceLive(0))
        expect(previous.filter(pixel => pixel[0] === 1)).toHaveLength(1)
        expect(previous.filter(pixel => pixel[0] === 0)).toHaveLength(points.length - 1)
        const sequence = [previous]
        for (let i = 0; i < 12; i++) {
          const current = pixels(r.advanceLive(16))
          expect(current.filter(pixel => pixel[0] === 1)).toHaveLength(1)
          current.forEach((pixel, index) => {
            const expected = pixel[0] === 1 ? 1 : previous[index][0] * 0.875
            // Precise truncates the product to one raw 16.16 unit.
            close([pixel], [[expected, expected, expected]], mode === 'fast' ? 0 : 1 / 65536)
          })
          sequence.push(current)
          previous = current
        }
        return sequence
      })
      expect(sequences[1]).toEqual(sequences[0])
      expect(sequences[2]).toEqual(sequences[0])
    })

    it('sparkle hold matches complete seeded real-frame buffers with one-frame lag', () => {
      const base = runtime(sparkle, mode, { ...settings, rate: 1 }, false)
      const wrapped = runtime(sparkle, mode)
      let previous = pixels(base.advanceLive(0))
      close(pixels(wrapped.advanceLive(0)), previous, 0)
      for (let i = 0; i < 12; i++) {
        const next = pixels(base.advanceLive(16))
        close(pixels(wrapped.advanceLive(64)), previous, 0)
        previous = next
      }
    })
  })
}

describe('slow-mo Precise fixed-point qualification', () => {
  it.each(['hold', 'blend', 'eased'] as const)('I5 %s avoids tiny-delta stall over 102400ms', inBetween => {
    const source = `var phase=0; export function beforeRender(delta){phase+=delta/1000*0.05}
export function render(i){rgb(phase,0,0)}`
    const input = { ...settings, rate: 1 / 32, inBetween }
    const expected = 102400 * input.rate * 0.05 / 1000
    for (const wrapped of [true, false]) {
      const r = runtime(source, 'fidelity', input, wrapped)
      r.advanceLive(0)
      let result = r.advanceLive(5)
      for (let wall = 5; wall < 102400; wall += 5) result = r.advanceLive(5)
      pixels(result).forEach(pixel => {
        pixel.forEach(value => { expect(Number.isFinite(value)).toBe(true) })
        const error = Math.abs(pixel[0] - expected) / expected
        if (wrapped) expect(error).toBeLessThanOrEqual(0.02)
        else expect(error).toBeGreaterThan(0.1)
      })
    }
  })
})

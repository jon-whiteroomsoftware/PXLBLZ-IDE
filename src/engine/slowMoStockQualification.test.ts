import { DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { createFastReplayRuntime, type FastReplayResult } from './fastReplay'
import { nativeDimension } from './loadPattern'
import type { SlowMoSettings } from './slowMo'
import plainKaleidoBloom from '@/test/fixtures/slowMoPlainBlendKaleidoBloom.js?raw'
import plainWavyBands from '@/test/fixtures/slowMoPlainBlendWavyBands.js?raw'
import plainAuroraSphere from '@/test/fixtures/slowMoPlainBlendAuroraSphere.js?raw'

const settings: SlowMoSettings = { position: 0.5, dreamy: 0 }
const paletteIds = new Set(['FastPaletteBlending', 'NebulaSphere', 'PlasmaNebula'])
const stockFor = (dreamy: number) => Object.entries(DEMOS).sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) => {
  const base = bundle(source, LIBRARIES)
  const dimension = nativeDimension(base.metadata.renderFns)
  const points = Array.from({ length: 16 }, (_, i) => ({
    sample: dimension === 1 ? [(i + 0.5) / 16]
      : dimension === 2 ? [(i % 4 + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4]
        : [(i % 4 + 0.5) / 4, (Math.floor(i / 4) % 2 + 0.5) / 2, (Math.floor(i / 8) + 0.5) / 2],
  }))
  const wrapped = bundleWithPasses(source, LIBRARIES, [{ kind: 'slowmo', settings: { ...settings, dreamy }, pixelCount: points.length }])
  return { id, base, wrapped, dimension, points }
})

function assertPixels(result: FastReplayResult, length: number, context: string) {
  expect(result.pixels.length, context).toBeGreaterThan(0)
  expect(result.pixels, context).toHaveLength(length)
  result.pixels.forEach((pixel, index) => {
    expect(pixel, `${context} pixel ${index}`).toHaveLength(3)
    pixel.forEach((value, channel) => {
      expect(Number.isFinite(value) && value >= 0 && value <= 1,
        `${context} pixel ${index} channel ${channel}: ${value}; RGB ${JSON.stringify(pixel)}`).toBe(true)
    })
  })
}

// These executable baselines were emitted by the pre-product wrapper, independently
// of the implementation under test; their source commit is pinned in each fixture.
describe('dreamy zero preserves plain Blend stock pixels', () => {
  const baselines: Record<string, string> = {
    KaleidoBloom: plainKaleidoBloom, WavyBands: plainWavyBands, AuroraSphere: plainAuroraSphere,
  }
  for (const { id, wrapped, dimension, points } of stockFor(0).filter(({ id }) => id in baselines)) {
    for (const fidelity of ['fast', 'fidelity'] as const) {
      it(`${id} matches frozen plain Blend within one LED level (${fidelity})`, () => {
        const options = { mapPoints: points, randomSeed: 7, fidelity }
        const schedule = [0, ...Array.from({ length: 120 }, (_, i) => [4, 12, 16, 33, 64, 100, 0][i % 7])]
        const trace = (prepared: ReturnType<typeof bundle>) => {
          const runtime = createFastReplayRuntime({ ...prepared, dimension }, options)
          return schedule.map(delta => runtime.advanceLive(delta).pixels.map(pixel => [...pixel]))
        }
        // WavyBands uses implicit globals. Match browser execution: finish one
        // Pattern run, then instantiate the next; interleaving shares timebase.
        const expectedTrace = trace(bundle(baselines[id], {}))
        const actualTrace = trace(wrapped)
        for (const [frame, actual] of actualTrace.entries()) {
          const expected = expectedTrace[frame]
          assertPixels({ pixels: actual } as FastReplayResult, points.length, `${id}/${fidelity}`)
          for (const [i, pixel] of actual.entries()) for (const [channel, value] of pixel.entries()) {
            expect(Math.abs(value - expected[i][channel]), `${id}/${fidelity} frame ${frame} pixel ${i} channel ${channel}`)
              .toBeLessThanOrEqual(1 / 255)
          }
        }
      })
    }
  }
})

describe.each([0, 0.5, 1])('I16 full stock sweep dreamy %s', dreamy => {
  const stock = stockFor(dreamy)
  it('declines exactly the three palette callers and wraps AuroraSphere despite its paint comment', () => {
    expect(stock.length).toBeGreaterThan(0)
    const declined = stock.filter(({ wrapped }) => wrapped.summary.passes[0].declined).map(({ id }) => id)
    expect(declined.sort()).toEqual(['FastPaletteBlending', 'NebulaSphere', 'PlasmaNebula'])
    const aurora = stock.find(({ id }) => id === 'AuroraSphere')
    expect(aurora).toBeDefined()
    expect(aurora!.wrapped.summary.passes[0].declined).toBeUndefined()
  })

  for (const { id, base, wrapped, dimension, points } of stock) {
    const decline = wrapped.summary.passes[0].declined
    if (decline) {
      it(`${id} declines transparently with palette-output`, () => {
        expect(paletteIds.has(id), id).toBe(true)
        expect(decline.reason, id).toBe('palette-output')
        expect(decline.message.trim().length, id).toBeGreaterThan(0)
        expect(wrapped.code, id).toBe(base.code)
        expect(wrapped.fxCode, id).toBe(base.fxCode)
        expect(wrapped.metadata, id).toEqual(base.metadata)
      })
      continue
    }
    for (const fidelity of ['fast', 'fidelity'] as const) {
      it(`${id} runs prime + 120 display frames (${fidelity})`, () => {
        const runtime = createFastReplayRuntime({ ...wrapped, dimension }, {
          mapPoints: points, randomSeed: 7, fidelity,
        })
        assertPixels(runtime.advanceLive(0), points.length, `${id}/${fidelity}/prime`)
        for (let frame = 1; frame <= 120; frame++) {
          assertPixels(runtime.advanceLive(16), points.length, `${id}/${fidelity}/frame ${frame}`)
        }
      })
    }
  }
})

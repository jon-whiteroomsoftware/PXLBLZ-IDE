import { DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { createFastReplayRuntime, type FastReplayResult } from './fastReplay'
import { nativeDimension } from './loadPattern'
import type { SlowMoSettings } from './slowMo'

const settings: SlowMoSettings = {
  rate: 1 / 4, stepMs: 16, inBetween: 'blend',
  stagger: { shape: 'sweep', width: 0 }, persistence: null,
}
const paletteIds = new Set(['FastPaletteBlending', 'NebulaSphere', 'PlasmaNebula'])
const stockFor = (persistence: SlowMoSettings['persistence']) => Object.entries(DEMOS).sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) => {
  const base = bundle(source, LIBRARIES)
  const dimension = nativeDimension(base.metadata.renderFns)
  const points = Array.from({ length: 16 }, (_, i) => ({
    sample: dimension === 1 ? [(i + 0.5) / 16]
      : dimension === 2 ? [(i % 4 + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4]
        : [(i % 4 + 0.5) / 4, (Math.floor(i / 4) % 2 + 0.5) / 2, (Math.floor(i / 8) + 0.5) / 2],
  }))
  const wrapped = bundleWithPasses(source, LIBRARIES, [{ kind: 'slowmo', settings: { ...settings, persistence }, pixelCount: points.length }])
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

describe.each([null, { attackMs: 1500, decayMs: 1500 }])('I16 full stock sweep persistence %j', persistence => {
  const stock = stockFor(persistence)
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

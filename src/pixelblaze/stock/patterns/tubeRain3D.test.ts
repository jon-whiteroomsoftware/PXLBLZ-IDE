import { describe, expect, it } from 'vitest'
import { bundle } from '@/engine/bundle'
import { loadPattern } from '@/engine/loadPattern'
import { createFxShim, createShim } from '@/engine/shim'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '../patterns'
import { SOURCE_STOCK_MAPS } from '../maps/stockCatalogue'
import { DEMO_SECTIONS, GALLERY_PATTERNS } from '@/engine/galleryCatalog'

const points = SOURCE_STOCK_MAPS.find((map) => map.id === 'cloudburst-chandelier')!.resolve(960)

function rain(mode: 'fast' | 'fidelity', density: number) {
  const { code, fxCode, metadata } = bundle(DEMOS.TubeRain3D, LIBRARIES)
  const config = { mapPoints: points, pixelCount: 960, dimensions: 3 as const, getVirtualTime: () => 0 }
  const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
  const handle = loadPattern(mode === 'fast' ? code : fxCode, metadata, shim.builtins)
  const enc = shim.encodeScalar
  handle.controls.sliderDensity(enc(density))
  const sample = (tube: number, y: number) => {
    const [x, , z] = points[tube * 20].sample
    handle.render3D(enc(tube * 20), enc(x), enc(y), enc(z))
    return Math.max(...shim.capturedPixel())
  }
  return { sample, advance: (ms: number) => handle.beforeRender(enc(ms)) }
}

describe('TubeRain3D (#1200)', () => {
  it('is a Show Ingredient outside the Gallery', () => {
    expect(DEMO_SECTIONS.find((s) => s.label === 'Show Ingredients')?.names).toContain('TubeRain3D')
    expect(GALLERY_PATTERNS.some((p) => p.name === 'TubeRain3D')).toBe(false)
  })

  for (const mode of ['fast', 'fidelity'] as const) {
    it(`wraps negative phases positively in ${mode}`, () => {
      const runtime = rain(mode, 1)
      runtime.advance(0)
      for (const y of [-10.01, -2.3, -0.8, -0.01]) for (let tube = 0; tube < 48; tube++) {
        const value = runtime.sample(tube, y)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
        expect(value).toBeCloseTo(runtime.sample(tube, y + 20), mode === 'fast' ? 8 : 2)
      }
    })

    it.each([0.15, 0.5, 0.85])(`rains on all 48 tubes, downwards without mid-tube births in ${mode} at density %f`, (density) => {
      const runtime = rain(mode, density)
      const seen = new Set<number>()
      let downward = 0
      let appearances = 0
      let minValue = 1, maxValue = 0
      const previous: (number | null)[] = Array(48).fill(null)
      // Sample densely along each physical tube: a head must enter at its top,
      // move toward lower world y, then leave at its bottom. Tail threshold
      // crossings alone are not head births. 10 s at 30 fps resolves entry.
      for (let frame = 0; frame <= 300; frame++) {
        runtime.advance(frame ? 1000 / 30 : 0)
        for (let tube = 0; tube < 48; tube++) {
          const top = points[tube * 20].sample[1]
          const bottom = points[tube * 20 + 19].sample[1]
          let best = 0, head: number | null = null
          for (let p = 0; p <= 20; p++) {
            const y = top - (top - bottom) * p / 20
            const value = runtime.sample(tube, y)
            minValue = Math.min(minValue, value)
            maxValue = Math.max(maxValue, value)
            if (value > best) { best = value; head = y }
          }
          if (best > 0.8 && head !== null) {
            seen.add(tube)
            if (previous[tube] === null) {
              if (frame) {
                appearances++
                expect(top - head, `tube ${tube} frame ${frame} birth`).toBeLessThan(0.04)
              }
            } else {
              const dy = head - previous[tube]!
              // A replacement drop can only enter at the physical top.
              if (dy > 0.04) expect(top - head).toBeLessThan(0.04)
              else { expect(dy).toBeLessThanOrEqual(0.0001); if (dy < 0) downward++ }
            }
            previous[tube] = head
          } else previous[tube] = null
        }
      }
      expect(seen.size).toBe(48)
      expect(minValue).toBeGreaterThanOrEqual(0)
      expect(maxValue).toBeLessThanOrEqual(1)
      expect(downward).toBeGreaterThan(100)
      expect(appearances).toBeGreaterThan(48)
    })
  }
})

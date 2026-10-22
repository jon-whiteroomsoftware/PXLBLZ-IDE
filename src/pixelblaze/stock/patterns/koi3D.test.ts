import { describe, expect, it } from 'vitest'
import { bundle } from '@/engine/bundle'
import { loadPattern } from '@/engine/loadPattern'
import { createFxShim, createShim } from '@/engine/shim'
import { DEMO_SECTIONS, GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '../patterns'
import { SOURCE_STOCK_MAPS } from '../maps/stockCatalogue'

describe('Koi3D (#1200)', () => {
  it('is a Show Ingredient outside the Gallery', () => {
    expect(DEMO_SECTIONS.find((s) => s.label === 'Show Ingredients')?.names).toContain('Koi3D')
    expect(GALLERY_PATTERNS.some((p) => p.name === 'Koi3D')).toBe(false)
  })

  it.each(['fast', 'fidelity'] as const)('keeps a bright gold body on one or two adjacent Middle tubes throughout a lap in %s', (mode) => {
    const points = SOURCE_STOCK_MAPS.find((map) => map.id === 'cloudburst-chandelier')!.resolve(960)
    const { code, fxCode, metadata } = bundle(DEMOS.Koi3D, LIBRARIES)
    const config = { mapPoints: points, pixelCount: 960, dimensions: 3 as const, getVirtualTime: () => 0 }
    const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
    const handle = loadPattern(mode === 'fast' ? code : fxCode, metadata, shim.builtins)
    const enc = shim.encodeScalar
    // Defaults must deliver the specified Size 0.75 and gold Hue 0.12.
    const sample = (x: number, y: number, z: number, index = 0) => {
      handle.render3D(enc(index), enc(x), enc(y), enc(z))
      return [...shim.capturedPixel()]
    }
    handle.beforeRender(enc(0))
    for (let frame = 0; frame < 300; frame++) {
      const tubes = new Set<number>()
      points.forEach(({ sample: [x, y, z] }, index) => {
        const rgb = sample(x, y, z, index)
        if (Math.max(...rgb) > 0.3) tubes.add(Math.floor(index / 20))
      })
      expect(tubes.size, `frame ${frame}`).toBeGreaterThanOrEqual(1)
      expect(tubes.size, `frame ${frame}`).toBeLessThanOrEqual(2)
      for (const tube of tubes) { expect(tube).toBeGreaterThanOrEqual(8); expect(tube).toBeLessThan(24) }
      if (tubes.size === 2) {
        const [a, b] = [...tubes].sort((a, b) => a - b)
        expect([1, 15], `adjacent tubes at frame ${frame}`).toContain(b - a)
      }
      const angle = frame / 300 * Math.PI * 2
      const radius = 0.3333 + 0.02 * Math.sin(angle * 3)
      const x = 0.5 + radius * Math.cos(angle), z = 0.5 + radius * Math.sin(angle)
      const y = 0.35 + 0.03 * Math.sin(angle * 3)
      const [r, g, b] = sample(x, y, z)
      expect(Math.max(r, g, b), `gold body frame ${frame}`).toBeGreaterThanOrEqual(0.9)
      expect(g / r).toBeGreaterThanOrEqual(0.65)
      expect(g / r).toBeLessThanOrEqual(0.85)
      // The default body radius reaches 0.10 normalized units.
      expect(sample(x, y + 0.095, z)[0]).toBeGreaterThan(0.05)
      handle.beforeRender(enc(10000 / 300))
    }
  })
})

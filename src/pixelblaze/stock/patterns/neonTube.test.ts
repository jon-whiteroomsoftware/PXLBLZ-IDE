import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundle } from '@/engine/bundle'
import { DEMO_SECTIONS, GALLERY_CATEGORIES, GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import { loadPattern } from '@/engine/loadPattern'
import { createFxShim, createShim, planeShimConfig } from '@/engine/shim'
import { LIBRARIES } from '@/pixelblaze/libs'

type Mode = 'fast' | 'fidelity'
function makeHarness(health: number, mode: Mode = 'fast') {
  const source = readFileSync(join(process.cwd(), 'src/pixelblaze/stock/patterns/NeonTube.js'), 'utf8')
  const { code, fxCode, metadata } = bundle(source, LIBRARIES)
  let vt = 0
  const config = { ...planeShimConfig({ rows: 1, cols: 60 }), getVirtualTime: () => vt }
  const shim = mode === 'fidelity' ? createFxShim(config) : createShim(config)
  const handle = loadPattern(mode === 'fidelity' ? fxCode : code, metadata, shim.builtins)
  const enc = shim.encodeScalar
  handle.controls.sliderHealth(enc(health))
  handle.controls.sliderSeed(enc(0.37))
  return {
    advance(deltaMs: number) {
      vt += deltaMs
      handle.beforeRender(enc(deltaMs))
    },
    seek(ms: number) {
      vt = ms
      handle.beforeRender(enc(0))
    },
    frame() {
      return Array.from({ length: 60 }, (_, index) => {
        handle.render(enc(index))
        return [...shim.capturedPixel()]
      })
    },
  }
}

describe('Neon Tube (#1196)', () => {
  for (const mode of ['fast', 'fidelity'] as const) {
    it.each([0, 1])(`${mode}: Health %i holds every pixel steady for ten seconds`, (health) => {
      const h = makeHarness(health, mode)
      for (let frame = 0; frame < 300; frame++) {
        h.advance(1000 / 30)
        for (const [r, g, b] of h.frame()) {
          expect(r).toBe(g)
          expect(g).toBe(b)
          if (health === 1) expect(r).toBeGreaterThan(0.99)
          else expect(r).toBe(0)
        }
      }
    })

    it.each(mode === 'fast' ? [0.2, 0.5, 0.8] : [0.5])(`${mode}: Health %s has its specified off fraction`, (health) => {
      const h = makeHarness(health, mode)
      let off = 0
      for (let frame = 0; frame < 1800; frame++) {
        h.advance(1000 / 30)
        if (h.frame()[0][0] < 0.5) off++
      }
      const fraction = off / 1800
      console.info(`NeonTube ${mode} Health ${health}: off fraction ${fraction}`)
      expect(Math.abs(fraction - (1 - health))).toBeLessThanOrEqual(mode === 'fast' ? 0.05 : 0.08)
    })
  }

  it('holds all sixty pixels uniform within each failing frame', () => {
    const h = makeHarness(0.5)
    for (let frame = 0; frame < 300; frame++) {
      h.advance(1000 / 30)
      const pixels = h.frame()
      for (const pixel of pixels) expect(pixel).toEqual(pixels[0])
    }
  })

  it.each([0, 1000, 7000, 13000, 20000, 27000, 34000, 41000, 50000, 60000])('seeks forward and backward to the same frame at %i ms', (ms) => {
    const stepped = makeHarness(0.5)
    const frames = Math.round(ms * 30 / 1000)
    for (let i = 0; i < frames; i++) stepped.advance(1000 / 30)
    // A zero-time beforeRender also exercises the t=0 endpoint.
    if (frames === 0) stepped.advance(0)
    const expected = stepped.frame()
    const direct = makeHarness(0.5)
    direct.seek(ms)
    expect(direct.frame()).toEqual(expected)
    const backward = makeHarness(0.5)
    for (let i = 0; i < Math.max(1200, frames + 300); i++) backward.advance(1000 / 30)
    backward.seek(ms)
    expect(backward.frame()).toEqual(expected)
  })

  it('lives in the Show Ingredients rail section and stays out of the Gallery', () => {
    expect(DEMO_SECTIONS.find((section) => section.label === 'Show Ingredients')?.names).toContain('NeonTube')
    expect(GALLERY_CATEGORIES).not.toContain('Show Ingredients')
    expect(GALLERY_PATTERNS.some((pattern) => pattern.name === 'NeonTube')).toBe(false)
  })
})

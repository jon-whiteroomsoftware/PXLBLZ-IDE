import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundle } from '@/engine/bundle'
import {
  DEMO_SECTIONS,
  GALLERY_CATEGORIES,
  GALLERY_PATTERNS,
  LUMA_DEMOS,
} from '@/engine/galleryCatalog'
import { loadPattern } from '@/engine/loadPattern'
import { createFxShim, createShim, planeShimConfig } from '@/engine/shim'
import { LIBRARIES } from '@/pixelblaze/libs'

const here = join(process.cwd(), 'src/pixelblaze/stock/patterns')

// The Luma family contract (#819): every member is a periodic grayscale
// waveform over a phase geometry, driven by one shared control ontology, with
// an exact loop and phase continuity under animated controls. Members are Show
// ingredients: they appear in the pattern rail but never in the gallery.
const FAMILY = [
  'LumaStripes',
  'LumaChevron',
  'LumaRings',
  'LumaPinwheel',
  'LumaDots',
  'LumaWeave',
  'LumaSpiral',
] as const

// Shared ontology: identical exported control names wherever a control appears.
const SHARED_SLIDERS = [
  'sliderLoopInterval',
  'sliderDirection',
  'sliderSpacing',
  'sliderWidth',
  'sliderFeather',
  'sliderLean',
] as const
const HEADING_MEMBERS = new Set(['LumaStripes', 'LumaChevron', 'LumaDots', 'LumaWeave'])

interface Harness {
  handle: ReturnType<typeof loadPattern>
  shim: ReturnType<typeof createShim>
  enc: (v: number) => number
  advance: (deltaMs: number) => void
  frame: () => number[]
}

function makeHarness(name: string, mode: 'fast' | 'fidelity' = 'fast'): Harness {
  const src = readFileSync(join(here, `${name}.js`), 'utf8')
  const { code, fxCode, metadata } = bundle(src, LIBRARIES)
  let vt = 0
  const config = { ...planeShimConfig({ rows: 16, cols: 16 }), getVirtualTime: () => vt }
  const shim = mode === 'fidelity' ? createFxShim(config) : createShim(config)
  const handle = loadPattern(mode === 'fidelity' ? fxCode : code, metadata, shim.builtins)
  const enc = shim.encodeScalar
  const advance = (deltaMs: number) => {
    vt += deltaMs * 65.536
    handle.beforeRender(enc(deltaMs))
  }
  const frame = () => {
    const values: number[] = []
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 16; col++) {
        const [tx, ty] = shim.transformPoint(col / 15, row / 15, 0)
        handle.render2D(enc(row * 16 + col), tx, ty)
        const [r, g, b] = shim.capturedPixel()
        expect(r, `${name} grayscale r==g`).toBeCloseTo(g, 8)
        expect(g, `${name} grayscale g==b`).toBeCloseTo(b, 8)
        values.push(r)
      }
    }
    return values
  }
  return { handle, shim, enc, advance, frame }
}

describe('Luma family catalogue placement (#819)', () => {
  it('registers all six members as a rail section excluded from the gallery', () => {
    const section = DEMO_SECTIONS.find((candidate) => candidate.label === 'Luma Sources')
    expect(section?.names).toEqual([...FAMILY].sort((a, b) => a.localeCompare(b)))
    expect(LUMA_DEMOS).toEqual([...FAMILY])
    expect(GALLERY_CATEGORIES).not.toContain('Luma Sources')
    for (const name of FAMILY) {
      expect(GALLERY_PATTERNS.some((pattern) => pattern.name === name), name).toBe(false)
    }
  })
})

describe('Luma family shared ontology (#819)', () => {
  it.each(FAMILY)('%s exposes the shared control set', (name) => {
    const src = readFileSync(join(here, `${name}.js`), 'utf8')
    const { metadata } = bundle(src, LIBRARIES)
    const exports = metadata.controls.map((control) => control.exportName)
    for (const slider of SHARED_SLIDERS) {
      expect(exports, `${name}: ${slider}`).toContain(slider)
    }
    expect(exports, `${name}: toggleInvert`).toContain('toggleInvert')
    expect(exports.includes('sliderAngle'), `${name}: sliderAngle`).toBe(
      HEADING_MEMBERS.has(name),
    )
  })
})

describe('Luma family output contract (#819)', () => {
  it.each(FAMILY)('%s renders full-range grayscale at defaults', (name) => {
    const { advance, frame } = makeHarness(name)
    advance(0)
    let lo = 1
    let hi = 0
    for (let f = 0; f < 5; f++) {
      advance(33)
      for (const v of frame()) {
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
        expect(v, name).toBeGreaterThanOrEqual(0)
        expect(v, name).toBeLessThanOrEqual(1)
      }
    }
    expect(hi, `${name} reaches white`).toBeGreaterThan(0.9)
    expect(lo, `${name} reaches black`).toBeLessThan(0.05)
  })

  it.each(FAMILY)('%s inverts figure and ground', (name) => {
    const { handle, enc, advance, frame } = makeHarness(name)
    advance(0)
    advance(33)
    const plain = frame()
    handle.controls.toggleInvert(enc(1))
    const inverted = frame()
    for (let i = 0; i < plain.length; i++) {
      expect(inverted[i], `${name} pixel ${i}`).toBeCloseTo(1 - plain[i], 6)
    }
  })
})

describe('Luma family motion contract (#819)', () => {
  // Closure must hold in both numeric modes: the fidelity (16.16 Precise)
  // pass is what catches a rate-biased clock constant, which float64 hides.
  for (const mode of ['fast', 'fidelity'] as const) {
    it.each(FAMILY)(`%s closes its loop exactly in ${mode} mode`, (name) => {
      const { handle, enc, advance, frame } = makeHarness(name, mode)
      // sliderLoopInterval maps v -> 250 + 7750 * v * v ms; v = 0.6 gives
      // 3040 ms, which divides into whole-millisecond steps.
      handle.controls.sliderLoopInterval(enc(0.6))
      const loopMs = 250 + 7750 * 0.6 * 0.6
      advance(0)
      advance(50)
      const before = frame()
      const steps = 40
      for (let i = 0; i < steps; i++) advance(loopMs / steps)
      const after = frame()
      for (let i = 0; i < before.length; i++) {
        expect(after[i], `${name} pixel ${i}`).toBeCloseTo(before[i], mode === 'fast' ? 4 : 2)
      }
    })
  }

  it('LumaStripes travels from the compass origin: Angle 0 moves crests down-screen', () => {
    const { handle, enc, advance, shim } = makeHarness('LumaStripes')
    handle.controls.sliderAngle(enc(0))
    handle.controls.sliderLoopInterval(enc(0.6))
    advance(0)
    const sample = (y: number) => {
      handle.render2D(enc(0), enc(0.5), enc(y))
      return shim.capturedPixel()[0]
    }
    // At phase 0 the crest peak (lean 0.5) sits at y = 0.5 + pitch * (c + k);
    // default spacing 0.5 -> pitch 0.425, k = -1 -> y = 0.2875.
    const pitch = 0.05 + 0.5 * 0.75
    const y0 = 0.5 + pitch * (0.5 - 1)
    expect(sample(y0)).toBeGreaterThan(0.99)
    // Advance a quarter loop: with Angle 0 (from the top) the crest must move
    // DOWN-screen, i.e. toward larger sample y.
    advance(760)
    const y1 = y0 + pitch * 0.25
    expect(sample(y1)).toBeGreaterThan(0.99)
    expect(sample(y0)).toBeLessThan(0.9)
  })

  it('LumaPinwheel rotates counterclockwise on screen when forward', () => {
    const { handle, enc, advance, shim } = makeHarness('LumaPinwheel')
    handle.controls.sliderLoopInterval(enc(0.6))
    handle.controls.sliderFeather(enc(0))
    advance(0)
    const ringMax = () => {
      let bestAngle = 0
      let best = -1
      for (let i = 0; i < 720; i++) {
        const theta = (i / 720) * 2 * Math.PI
        const x = 0.5 + 0.35 * Math.cos(theta)
        const y = 0.5 + 0.35 * Math.sin(theta)
        handle.render2D(enc(0), enc(x), enc(y))
        const v = shim.capturedPixel()[0]
        if (v > best) {
          best = v
          bestAngle = theta
        }
      }
      return bestAngle
    }
    const a0 = ringMax()
    advance(760) // quarter loop = 1/4 spoke period
    const a1 = ringMax()
    // Screen y grows downward, so counterclockwise on screen means the
    // brightest spoke's atan2 angle DECREASES (mod one spoke period of 60deg).
    const spokePeriod = (2 * Math.PI) / 6
    const delta = ((a1 - a0) % spokePeriod + spokePeriod * 1.5) % spokePeriod - spokePeriod / 2
    expect(delta).toBeLessThan(0)
    expect(delta).toBeGreaterThan(-spokePeriod / 2)
  })

  it.each(FAMILY)('%s holds still and reverses under Direction', (name) => {
    const { handle, enc, advance, frame } = makeHarness(name)
    handle.controls.sliderDirection(enc(0.5))
    advance(0)
    advance(33)
    const held = frame()
    advance(500)
    expect(frame(), `${name} hold`).toEqual(held)
    handle.controls.sliderDirection(enc(0))
    advance(500)
    expect(frame(), `${name} reverse`).not.toEqual(held)
  })

  // Pinwheel is the one member whose Spacing quantizes (fractional spokes
  // cannot close around the circle), so a spoke-count boundary is a discrete
  // re-tessellation rather than a smooth slide; it is covered separately.
  const CONTINUOUS_SPACING = FAMILY.filter((name) => name !== 'LumaPinwheel')

  it.each(CONTINUOUS_SPACING)('%s animates Spacing without a phase reset', (name) => {
    const { handle, enc, advance, frame } = makeHarness(name)
    handle.controls.sliderSpacing(enc(0.3))
    advance(0)
    advance(33)
    let previous = frame()
    // Ramp Spacing over ~1.5 s at 60 fps, the way a Show property track
    // animates. Phase accumulates separately from settings, so each frame may
    // only move the image slightly; a reset shows up as a near-full flip.
    for (let step = 1; step <= 90; step++) {
      handle.controls.sliderSpacing(enc(0.3 + (0.5 * step) / 90))
      advance(16.7)
      const current = frame()
      let worst = 0
      for (let i = 0; i < current.length; i++) {
        worst = Math.max(worst, Math.abs(current[i] - previous[i]))
      }
      expect(worst, `${name} step ${step}`).toBeLessThan(0.45)
      previous = current
    }
  })

  it('LumaPinwheel quantizes Spacing to whole spokes', () => {
    const { handle, enc, advance, frame } = makeHarness('LumaPinwheel')
    handle.controls.sliderDirection(enc(0.5))
    advance(0)
    advance(33)
    // Values inside one quantization band render identically; crossing a band
    // boundary re-tessellates to a new whole spoke count.
    handle.controls.sliderSpacing(enc(0.45))
    advance(0)
    const six = frame()
    handle.controls.sliderSpacing(enc(0.5))
    advance(0)
    expect(frame()).toEqual(six)
    handle.controls.sliderSpacing(enc(0.55))
    advance(0)
    expect(frame()).not.toEqual(six)
  })

  it('LumaPinwheel reaches both documented spoke endpoints', () => {
    const { handle, enc, advance, shim } = makeHarness('LumaPinwheel')
    handle.controls.sliderDirection(enc(0.5))
    handle.controls.sliderFeather(enc(0))
    handle.controls.sliderWidth(enc(0.5))
    advance(0)
    advance(33)
    const countSpokes = () => {
      // Rising edges around a mid-radius circle count the spokes exactly once
      // each (hard edges via Feather 0).
      let rises = 0
      let previous = 0
      for (let i = 0; i <= 1440; i++) {
        const theta = (i / 1440) * 2 * Math.PI
        handle.render2D(enc(0), enc(0.5 + 0.35 * Math.cos(theta)), enc(0.5 + 0.35 * Math.sin(theta)))
        const v = shim.capturedPixel()[0]
        if (i > 0 && previous < 0.5 && v >= 0.5) rises++
        previous = v
      }
      return rises
    }
    handle.controls.sliderSpacing(enc(1))
    advance(0)
    expect(countSpokes(), 'Spacing 1 reaches 12 spokes').toBe(12)
    handle.controls.sliderSpacing(enc(0))
    advance(0)
    expect(countSpokes(), 'Spacing 0 is a single spoke').toBe(1)
  })
})

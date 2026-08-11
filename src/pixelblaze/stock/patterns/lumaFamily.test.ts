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
import { createShim, planeShimConfig } from '@/engine/shim'
import { LIBRARIES } from '@/pixelblaze/libs'

const here = join(process.cwd(), 'src/pixelblaze/stock/patterns')

// The Luma family contract (#819): every member is a periodic grayscale
// waveform over a phase geometry, driven by one shared control ontology, with
// an exact loop and phase continuity under animated controls. Members are Show
// ingredients: they appear in the pattern rail but never in the gallery.
const FAMILY = [
  'LumaStripes',
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
const HEADING_MEMBERS = new Set(['LumaStripes', 'LumaDots', 'LumaWeave'])

interface Harness {
  handle: ReturnType<typeof loadPattern>
  shim: ReturnType<typeof createShim>
  enc: (v: number) => number
  advance: (deltaMs: number) => void
  frame: () => number[]
}

function makeHarness(name: string): Harness {
  const src = readFileSync(join(here, `${name}.js`), 'utf8')
  const { code, metadata } = bundle(src, LIBRARIES)
  let vt = 0
  const shim = createShim({ ...planeShimConfig({ rows: 16, cols: 16 }), getVirtualTime: () => vt })
  const handle = loadPattern(code, metadata, shim.builtins)
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
  it.each(FAMILY)('%s closes its loop exactly', (name) => {
    const { handle, enc, advance, frame } = makeHarness(name)
    // sliderLoopInterval maps v -> 0.25 + 7.75 * v * v seconds; v = 0.6 gives
    // 3.04 s. Any value works: the contract is closure at the mapped length.
    handle.controls.sliderLoopInterval(enc(0.6))
    const loopMs = (0.25 + 7.75 * 0.6 * 0.6) * 1000
    advance(0)
    advance(50)
    const before = frame()
    const steps = 40
    for (let i = 0; i < steps; i++) advance(loopMs / steps)
    const after = frame()
    for (let i = 0; i < before.length; i++) {
      expect(after[i], `${name} pixel ${i}`).toBeCloseTo(before[i], 4)
    }
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
    handle.controls.sliderSpacing(enc(0.5))
    advance(0)
    const six = frame()
    handle.controls.sliderSpacing(enc(0.52))
    advance(0)
    expect(frame()).toEqual(six)
    handle.controls.sliderSpacing(enc(0.6))
    advance(0)
    expect(frame()).not.toEqual(six)
  })
})

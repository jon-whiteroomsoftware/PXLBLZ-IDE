import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareVisualDrift } from './benchCore'
import {
  assertProbeTarget,
  buildVariant,
  compareRestore,
  defaultsVerdict,
  FPS_VERSIONS,
  LABEL_PROBE_NAMES,
  sliderProbeSource,
  summarizeFreshFps,
  survivalSource,
} from './issue1273Core'

const stock = (name: string) => readFileSync(`src/pixelblaze/stock/patterns/${name}.js`, 'utf8')
const PROBE_PATTERNS = {
  WavyBands: stock('WavyBands'),
  LineDancer2D: stock('LineDancer2D'),
  IridescentFibers: stock('IridescentFibers'),
  VoronoiMix2D: stock('VoronoiMix2D'),
  slowMoSparkle: readFileSync('src/test/fixtures/slowMoSparkle.js', 'utf8'),
  FastPaletteBlending: stock('FastPaletteBlending'),
}

describe('#1273 variants', () => {
  it('leaves the unwrapped version byte-identical', () => {
    const source = PROBE_PATTERNS.WavyBands
    expect(buildVariant(source, null, 256)).toEqual({ code: source, plan: null, readback: [] })
  })

  it('bakes each version\'s settings and exposes them for read-back', () => {
    const variant = buildVariant(PROBE_PATTERNS.WavyBands, { position: 0.5, dreamy: 0.5 }, 256)
    expect(variant.code).toContain('var __pxlblz_slowmo_position = 0.5')
    expect(variant.code).toContain('var __pxlblz_slowmo_decay = 2500')
    expect(variant.code).toMatch(/export function beforeRender\(delta\) \{\n {2}probePos = __pxlblz_slowmo_position; probeDecay = __pxlblz_slowmo_decay\n/)
    expect(variant.code).toContain('export function slider__pxlblz_slowmo_speed(v)')
    expect(variant.code).toContain('export function sliderDreamy(v) { v = clamp(v,0,1); __pxlblz_slowmo_decay = 10000*v*v }')
    expect(variant.readback).toEqual(['probePos', 'probeDecay'])
  })

  it('swaps today\'s speed export for an amount slider when asked', () => {
    const variant = buildVariant(PROBE_PATTERNS.WavyBands, { position: 1, dreamy: 0 }, 256, { amountSpeedSlider: 'sliderSlowMo' })
    expect(variant.code).not.toContain('export function slider__pxlblz_slowmo_speed(')
    expect(variant.code).toContain('function slider__pxlblz_slowmo_speed(v)')
    expect(variant.code).toContain('export function sliderSlowMo(a) { __pxlblz_slowmo_position = 1 - clamp(a,0,1) }')
  })

  it.each(Object.keys(PROBE_PATTERNS))('the wrapper accepts %s at 256 pixels', (name) => {
    const variant = buildVariant(PROBE_PATTERNS[name as keyof typeof PROBE_PATTERNS], { position: 1, dreamy: 0 }, 256)
    expect(variant.plan?.declined).toBeUndefined()
    expect(variant.plan?.arrayWords).toBe(2340)
  })

  it('names five versions with defaults at full speed and Dreamy off', () => {
    expect(FPS_VERSIONS.map((v) => [v.key, v.settings])).toEqual([
      ['U', null],
      ['D', { position: 1, dreamy: 0 }],
      ['S', { position: 0.5, dreamy: 0 }],
      ['R', { position: 1, dreamy: 0.5 }],
      ['B', { position: 0.5, dreamy: 0.5 }],
    ])
  })
})

describe('#1273 bypass output (emulator evidence for the defaults row)', () => {
  // The wrapper at (1, 0) takes the bypass path. Its output should equal the
  // unwrapped Pattern's for the same clock and random seed.
  const grid = { rows: 16, cols: 16 }
  const usesTime = (source: string) => /\btime\(/.test(source)

  it.each(Object.keys(PROBE_PATTERNS))('%s wrapped at defaults matches unwrapped in Fast', (name) => {
    const source = PROBE_PATTERNS[name as keyof typeof PROBE_PATTERNS]
    const wrapped = buildVariant(source, { position: 1, dreamy: 0 }, 256).code
    expect(compareVisualDrift(source, wrapped, {}, 'fast', { frames: 30, warmup: 0, grid }).max).toBe(0)
  }, 60_000)

  it.each(Object.keys(PROBE_PATTERNS).filter((name) => !usesTime(PROBE_PATTERNS[name as keyof typeof PROBE_PATTERNS])))(
    '%s, which never calls time(), matches unwrapped in Precise', (name) => {
      const source = PROBE_PATTERNS[name as keyof typeof PROBE_PATTERNS]
      const wrapped = buildVariant(source, { position: 1, dreamy: 0 }, 256).code
      expect(compareVisualDrift(source, wrapped, {}, 'precise', { frames: 30, warmup: 0, grid }).max).toBe(0)
    }, 60_000)

  // Finding (#1273): in 16.16 the bypass path's own clock, T += delta * 2^-16,
  // loses a fraction of an ulp every frame, so its time() falls behind the
  // native one. Equal on frame 1, apart by frame 2, and the gap grows. This
  // pins the divergence; a fix to the wrapper's clock should update it.
  it('characterises the Precise time() divergence on the bypass path', () => {
    const source = 'export function beforeRender(delta) { t = time(0.05) }\nvar t = 0\nexport function render(index) { rgb(t, t, t) }'
    const wrapped = buildVariant(source, { position: 1, dreamy: 0 }, 256).code
    const at = (frames: number) => compareVisualDrift(source, wrapped, {}, 'precise', { frames, warmup: 0, grid }).max
    expect(at(1)).toBe(0)
    expect(at(120)).toBeGreaterThan(at(2))
    expect(compareVisualDrift(source, wrapped, {}, 'fast', { frames: 120, warmup: 0, grid }).max).toBe(0)
  }, 60_000)
})

describe('#1273 probe sources', () => {
  it('records every name form with a sentinel and a call count', () => {
    const source = sliderProbeSource(LABEL_PROBE_NAMES)
    LABEL_PROBE_NAMES.forEach((name, i) => {
      expect(source).toContain(`export var got${i} = 12345, n${i} = 0`)
      expect(source).toContain(`export function ${name}(v) { got${i} = v; n${i} += 1 }`)
    })
  })

  it('changes code but not sliders for (b), and swaps B for C in (c) before restoring B', () => {
    const initial = survivalSource('a', 'initial')
    expect(survivalSource('a', 'rewrite')).toEqual(initial)
    const changed = survivalSource('b', 'rewrite')
    expect(changed.sliders).toEqual(initial.sliders)
    expect(initial.source).toContain('1, 0.1 + 0.8 * v')
    expect(changed.source).toContain('1, 0.2 + 0.8 * v')
    expect(survivalSource('c', 'rewrite').sliders).toEqual(['sliderSlowMo', 'sliderPxlblzDreamy'])
    expect(survivalSource('c', 'restore').sliders).toEqual(['sliderSlowMo', 'sliderPxlblzDreamy', 'sliderDreamy'])
  })
})

describe('#1273 FPS window', () => {
  const frames = [{ at: 100, fps: 50 }, { at: 1100, fps: 40 }, { at: 2100, fps: 0 }, { at: 3100, fps: 60 }]

  it('ignores frames from before the window, the stale-cache case', () => {
    expect(summarizeFreshFps(frames, 1000, 4000)).toEqual({ n: 3, mean: 100 / 3, min: 0, max: 60 })
  })

  it('reports a window with no fresh frame as unmeasured', () => {
    expect(summarizeFreshFps(frames, 4000, 9000)).toBeNull()
  })

  it('passes defaults at exactly 90% and fails just below', () => {
    expect(defaultsVerdict(100, 90).pass).toBe(true)
    expect(defaultsVerdict(100, 89.9).pass).toBe(false)
  })
})

describe('#1273 restore', () => {
  const before = {
    activeProgramId: 'x', brightness: 0.18, pixelCount: 256, mapSha256: 'm',
    programs: [{ id: 'x', name: 'Top' }, { id: 'y', name: 'Line' }],
  }

  it('accepts the same list in another order', () => {
    expect(compareRestore(before, { ...before, programs: [...before.programs].reverse() })).toEqual({ ok: true, differences: [] })
  })

  it('names a renamed, missing or extra Pattern and every changed field', () => {
    const after = { ...before, brightness: 0.2, programs: [{ id: 'x', name: 'Top2' }, { id: 'z', name: 'Probe' }] }
    expect(compareRestore(before, after).differences).toEqual([
      'brightness: 0.18 -> 0.2', 'missing x Top', 'missing y Line', 'extra x Top2', 'extra z Probe',
    ])
  })

  it('refuses writes to baseline ids', () => {
    expect(() => assertProbeTarget('x', new Set(['x']))).toThrow('refusing a write to baseline Pattern x')
    expect(() => assertProbeTarget('p', new Set(['x']))).not.toThrow()
  })
})

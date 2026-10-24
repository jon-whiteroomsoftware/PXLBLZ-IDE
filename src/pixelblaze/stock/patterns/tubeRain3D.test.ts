import { describe, expect, it } from 'vitest'
import { bundle } from '@/engine/bundle'
import { loadPattern } from '@/engine/loadPattern'
import { createFxShim, createShim } from '@/engine/shim'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '../patterns'
import { SOURCE_STOCK_MAPS } from '../maps/stockCatalogue'
import { DEMO_SECTIONS, GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import incoming from '@/test/fixtures/tubeRain3D-preSplash.js?raw'
import { createFastReplayRuntime, prepareFastReplay } from '@/engine/fastReplay'
import type { MapPoint } from '@/engine/maps/types'

// Exact incoming TubeRain3D at 3a75ae3ff06320a024911fa2bba3af2ab3f5fb0d;
// frozen independently of DEMOS so default-off preservation compares full RGB.

const points = SOURCE_STOCK_MAPS.find((map) => map.id === 'cloudburst-chandelier')!.resolve(960)

function rain(mode: 'fast' | 'fidelity', density: number, options: {
  source?: string, splash?: number, landingGlow?: number, speed?: number, seed?: number, map?: MapPoint[],
} = {}) {
  const { code, fxCode, metadata } = bundle(options.source ?? DEMOS.TubeRain3D, LIBRARIES)
  const map = options.map ?? points
  const config = { mapPoints: map, pixelCount: map.length, dimensions: 3 as const, getVirtualTime: () => 0, randomSeed: options.seed ?? 7 }
  const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
  const handle = loadPattern(mode === 'fast' ? code : fxCode, metadata, shim.builtins)
  const enc = shim.encodeScalar
  handle.controls.sliderDensity(enc(density))
  if (options.splash !== undefined) handle.controls.sliderSplash?.(enc(options.splash))
  if (options.landingGlow !== undefined) handle.controls.sliderLandingGlow?.(enc(options.landingGlow))
  if (options.speed !== undefined) handle.controls.sliderSpeed(enc(options.speed))
  const rgb = (index: number, y = map[index].sample[1]) => {
    const [x, , z] = map[index].sample
    handle.render3D(enc(index), enc(x), enc(y), enc(z))
    return [...shim.capturedPixel()]
  }
  const sample = (tube: number, y: number) => {
    const [x, , z] = points[tube * 20].sample
    handle.render3D(enc(tube * 20), enc(x), enc(y), enc(z))
    return Math.max(...shim.capturedPixel())
  }
  return { sample, rgb, frame: () => map.map((_, i) => rgb(i)), advance: (ms: number) => handle.beforeRender(enc(ms)) }
}

const value = (rgb: number[]) => Math.max(...rgb)
const delta = (on: number[], off: number[]) => value(on) - value(off)
const modulo = (n: number, d: number) => ((n % d) + d) % d

// Deliberately shuffled, regularly spaced tubes with different floors/steps.
// x/z hashes all start in slot zero (in Fast and Precise), forcing probing.
const shuffled: MapPoint[] = [2, 0, 3, 1].flatMap(level => [2, 0, 1].map(tube => {
  const sample: [number, number, number] = [tube * 0.0001, -0.3 + tube * 0.07 + level * (0.04 + tube * 0.01), 0]
  return { sample, pos: sample }
}))

for (const mode of ['fast', 'fidelity'] as const) {
  describe(`TubeRain3D splash rendered contract (${mode})`, () => {
    it.each([[points], [shuffled]])('holds only physical landing points still with rain and splash off on map %#', map => {
      const runtime = rain(mode, 0, { map, splash: 0, landingGlow: 0.08 })
      const bottoms = map.map(({ sample: [x, , z] }) => Math.min(...map.filter(p => p.sample[0] === x && p.sample[2] === z).map(p => p.sample[1])))
      let first: number[][] | undefined
      for (const ms of [0, 17, 625, 9000, 14000, 14000]) {
        runtime.advance(ms)
        const frame = runtime.frame()
        if (first) expect(frame).toEqual(first)
        first = frame
        expect(frame.filter(rgb => value(rgb) > 0.0001)).toHaveLength(map === points ? 48 : 3)
        frame.forEach((rgb, i) => {
          if (map[i].sample[1] === bottoms[i]) expect(value(rgb)).toBeCloseTo(0.08, 4)
          else expect(value(rgb)).toBeLessThanOrEqual(0.0001)
          const levels = map.filter(p => p.sample[0] === map[i].sample[0] && p.sample[2] === map[i].sample[2]).map(p => p.sample[1]).sort((a, b) => a - b)
          expect(value(runtime.rgb(i, bottoms[i] - (levels[1] - levels[0])))).toBeLessThanOrEqual(0.0001)
        })
      }
    })

    it('defaults landing glow off and clamps its control at both bounds', () => {
      const off = rain(mode, 0), negative = rain(mode, 0, { landingGlow: -1 })
      const full = rain(mode, 0, { landingGlow: 2 })
      for (const runtime of [off, negative, full]) runtime.advance(0)
      expect(off.frame().flat().every(v => v === 0)).toBe(true)
      expect(negative.frame()).toEqual(off.frame())
      expect(Math.max(...full.frame().flat())).toBe(1)
    })

    it.each([undefined, 0])('preserves every incoming RGB channel with splash %s, including flow wrap', splash => {
      const old = rain(mode, 0.61, { source: incoming })
      const next = rain(mode, 0.61, { splash, landingGlow: splash })
      for (const ms of [0, 17, 625, 9000, 14000, 14000]) {
        old.advance(ms); next.advance(ms)
        expect(next.frame()).toEqual(old.frame())
      }
    })

    it('replays and restores calibrated geometry and deterministic splash deltas on the real map', () => {
      const source = `${DEMOS.TubeRain3D}\nsliderSplash(1); sliderDensity(1); sliderSpeed(1);`
      const prepared = prepareFastReplay(source, LIBRARIES)
      const runtime = (seed = 7) => createFastReplayRuntime(prepared, { mapPoints: points, randomSeed: seed, fidelity: mode })
      const live = runtime(), second = runtime(), otherSeed = runtime(99)
      const off = rain(mode, 1, { speed: 1, splash: 0 })
      const deltas: number[][] = []
      for (let i = 0; i < 40; i++) {
        off.advance(20)
        const pixels = live.advanceLive(20).pixels
        deltas.push(pixels.map((rgb, index) => delta(rgb, off.rgb(index))))
        expect(second.advanceLive(20).pixels).toEqual(pixels)
        expect(otherSeed.advanceLive(20).pixels).toEqual(pixels)
      }
      expect(Math.max(...deltas.flat())).toBeGreaterThan(0.05)
      const checkpoint = live.snapshot()
      const played = live.advanceTo(1200, { stepMs: 20 }).pixels
      expect(runtime().advanceTo(1200, { stepMs: 20 }).pixels).toEqual(played)
      live.restore(checkpoint)
      expect(live.advanceTo(1200, { stepMs: 20 }).pixels).toEqual(played)
      live.restore(checkpoint)
      expect(live.advanceTo(1200, { stepMs: 20 }).pixels).toEqual(played)
    })

    it.each([0, 0.1, 0.4, 1])('selects the requested fraction %s of complete landing events and repeats identities', splash => {
      const on = rain(mode, 1, { splash, speed: 1 })
      const off = rain(mode, 1, { splash: 0, speed: 1 })
      const seen = [new Set<string>(), new Set<string>()]
      // 32 complete identities per tube, 20 ms frames; inspect only floor
      // neighbours, where the hop is observable. Small dt avoids skipped hops.
      for (let frame = 0; frame < 1010; frame++) {
        on.advance(20); off.advance(20)
        const flow = (frame + 1) * 0.02 * 1.65
        for (let tube = 0; tube < 48; tube++) {
          const bottomIndex = tube * 20 + 19
          const [x, bottom, z] = points[bottomIndex].sample
          const phase = bottom * 1.6 + flow + modulo(x * 91.7 + z * 53.3 + 0.5, 1)
          const identity = Math.floor(phase)
          // Keep well inside each hop to avoid Precise clock rounding at seams.
          const age = modulo(phase, 1) / 1.65
          if (identity < 1 || identity > 32 || age < 0.08 || age > 0.33) continue
          if ([0, 1, 2].some(n => delta(on.rgb(bottomIndex - n), off.rgb(bottomIndex - n)) > 0.0001)) {
            seen[identity <= 16 ? 0 : 1].add(`${tube}:${identity % 16}`)
          }
        }
      }
      expect(seen[0].size / (48 * 16)).toBeCloseTo(splash, 1)
      expect(Math.abs(seen[0].size / (48 * 16) - splash)).toBeLessThanOrEqual(0.035)
      expect(seen[1]).toEqual(seen[0])
      if (splash === 1) expect(seen[0].size).toBe(48 * 16)
      if (splash === 0) expect(seen[0].size).toBe(0)
    })

    it.each([[points], [shuffled]])('bounds the dim hop to actual floor neighbours and 450 ms on map %#', map => {
      const on = rain(mode, 1, { map, splash: 1, speed: 1 })
      const off = rain(mode, 1, { map, splash: 0, speed: 1 })
      const geometry = map.map(({ sample: [x, , z] }) => {
        const tube = map.filter(p => p.sample[0] === x && p.sample[2] === z).map(p => p.sample[1]).sort((a, b) => a - b)
        return { bottom: tube[0], step: tube[1] - tube[0] }
      })
      let apex = 0, peak = 0, visible = 0
      for (let frame = 0; frame < 90; frame++) {
        on.advance(10); off.advance(10)
        for (let index = 0; index < map.length; index++) {
          const [x, y, z] = map[index].sample
          const { bottom, step } = geometry[index]
          const height = (y - bottom) / step
          const added = delta(on.rgb(index), off.rgb(index))
          expect(added).toBeGreaterThanOrEqual(-0.0001)
          expect(added).toBeLessThanOrEqual(0.3501)
          if (added > 0.0001) {
            visible++; peak = Math.max(peak, added); apex = Math.max(apex, height)
            expect(height).toBeGreaterThanOrEqual(0)
            expect(height).toBeLessThanOrEqual(2.001)
            const phase = bottom * 1.6 + (frame + 1) * 0.01 * 1.65 + modulo(x * 91.7 + z * 53.3 + 0.5, 1)
            const nominalAge = modulo(phase, 1) / 1.65
            // Fixed-point rounding can cross the next landing a few ms before
            // the float64 reference. Allow that seam, never a late residual.
            expect(nominalAge < 0.46 || nominalAge > 1 / 1.65 - 0.01).toBe(true)
          }
          expect(delta(on.rgb(index, bottom - step), off.rgb(index, bottom - step))).toBe(0)
        }
      }
      expect(visible).toBeGreaterThan(0)
      expect(apex).toBeGreaterThanOrEqual(0.99)
      expect(peak).toBeGreaterThan(0.05)
      expect(peak).toBeLessThan(1)
    })

    it('does not splash drops rejected by density or singleton geometry', () => {
      for (const map of [points, [shuffled[0]]]) {
        const density = map.length === 1 ? 1 : 0
        const on = rain(mode, density, { map, splash: 1, speed: 1 })
        const off = rain(mode, density, { map, splash: 0, speed: 1 })
        for (let i = 0; i < 10; i++) {
          on.advance(100); off.advance(100)
          expect(on.frame()).toEqual(off.frame())
        }
      }
    })

    it('has no residual beyond 450 ms after a landing', () => {
      const map: MapPoint[] = [0, 0.05, 0.1].map(y => ({ sample: [0, y, 0], pos: [0, y, 0] }))
      const on = rain(mode, 1, { map, splash: 1, speed: 1 })
      const off = rain(mode, 1, { map, splash: 0, speed: 1 })
      // x=z=bottom=0 gives the first complete landing at flow=0.5.
      const landingMs = 0.5 / 1.65 * 1000
      let previous = 0
      for (const age of [0.15, 0.25, 0.451, 0.48, 0.55]) {
        const target = landingMs + age * 1000
        on.advance(target - previous); off.advance(target - previous)
        const added = map.map((_, i) => delta(on.rgb(i), off.rgb(i)))
        if (age < 0.45) expect(Math.max(...added)).toBeGreaterThan(0.01)
        else expect(added).toEqual([0, 0, 0])
        previous = target
      }
    })
  })
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

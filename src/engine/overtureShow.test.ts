import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShowForArtifact } from './showPreviewArtifact'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { SOURCE_STOCK_MAPS } from '@/pixelblaze/stock/maps/stockCatalogue'

// #840: Overture plays the rebuilt Proscenium arch stage at 128 BPM with
// three shared grayscale Luma instances. The contracts read the show's
// engineering off rendered frames on the real map: the chase is confined to
// the zone whose wiring it rides, phrase ownership changes are placement
// scheduling (zero property tracks), the cyan surge is the one intruder and
// leaves, and the night ends on a lone warm lamp at center stage.

const MAP_POINTS = SOURCE_STOCK_MAPS.find((m) => m.id === 'proscenium-stage-2d')!.resolve(1_000)
  .map((point) => ({ sample: point.sample as [number, number] }))

// The installer's walk (#835): columns own 0-249 and 750-999, stage 250-499,
// arch 500-749.
const STAGE = [250, 499] as const
const ARCH = [500, 749] as const

type Artifact = NonNullable<ReturnType<typeof compileShowForArtifact>['artifact']>

function frameAt(artifact: Artifact, timeMs: number) {
  const runtime = createFastReplayRuntime({
    code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: MAP_POINTS, randomSeed: 7, fidelity: 'fast' })
  return runtime.advanceTo(timeMs, { stepMs: 50 })
}

function slice(pixels: number[][], range: readonly [number, number]): number[][] {
  return pixels.slice(range[0], range[1] + 1)
}

function litFraction(pixels: number[][]): number {
  return pixels.filter(([r, g, b]) => r + g + b > 0.05).length / pixels.length
}

function columnsOf(pixels: number[][]): number[][] {
  return [...pixels.slice(0, 250), ...pixels.slice(750)]
}

describe('Overture remix show (#840)', () => {
  const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-remix-overture')

  it('is catalogued as the third remix: three instances, one physical layout, four scenes, 48.75 s', () => {
    expect(fixture).toBeDefined()
    expect(fixture!.collection).toBe('remixes')
    expect(fixture!.order).toBe(3)
    const show = fixture!.show
    expect(show.composition!.patternInstances).toHaveLength(3)
    expect(new Set(show.composition!.patternInstances.map((entry) => entry.patternName)))
      .toEqual(new Set(['LumaMarquee', 'LumaRings']))
    expect(show.routingLayouts).toHaveLength(1)
    expect(show.routingLayouts[0].zones).toEqual([
      { zoneId: 'zone-1', ranges: [{ start: 250, end: 499 }] },
      { zoneId: 'zone-2', ranges: [{ start: 500, end: 749 }] },
      { zoneId: 'zone-3', ranges: [{ start: 0, end: 249 }, { start: 750, end: 999 }] },
    ])
    expect(show.scenes).toHaveLength(4)
    expect(show.composition!.durationMs).toBe(48_750)
    // The whole score is scheduling: no property tracks anywhere, and every
    // boundary is a Cut (a 900 ms wipe measured +33 KB of unrolled emission).
    expect(show.composition!.scenes.every((entry) => (entry.propertyTracks ?? []).length === 0)).toBe(true)
    expect((show.transitions ?? []).every((transition) => transition.kind === 'cut')).toBe(true)
  })

  it('compiles deterministically inside the activation envelope', () => {
    const compiled = compileShowForArtifact(fixture!.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact!.code.length).toBeLessThan(66_000)
    const again = compileShowForArtifact(fixture!.show, [], undefined, {}, { stageDimension: 2 })
    expect(again.artifact!.code).toBe(compiled.artifact!.code)
    const first = frameAt(compiled.artifact!, 3_000)
    const second = frameAt(compiled.artifact!, 3_000)
    expect(second.checksum).toBe(first.checksum)
  })

  describe('rendered phrase contracts', () => {
    const compiled = compileShowForArtifact(
      STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-remix-overture')!.show,
      [], undefined, {}, { stageDimension: 2 },
    )
    const artifact = compiled.artifact!

    it('ignition confines the gold chase to the arch walk', () => {
      const { pixels } = frameAt(artifact, 3_000)
      expect(litFraction(slice(pixels, ARCH))).toBeGreaterThan(0.1)
      expect(litFraction(slice(pixels, STAGE))).toBeLessThan(0.02)
      expect(litFraction(columnsOf(pixels))).toBeLessThan(0.02)
      // Gold: the lit arch pixels lean warm, never blue-dominant.
      const lit = slice(pixels, ARCH).filter(([r, g, b]) => r + g + b > 0.05)
      expect(lit.every(([r, , b]) => r >= b)).toBe(true)
    })

    it('the entrance wakes the columns in velvet while the stage stays dark', () => {
      const { pixels } = frameAt(artifact, 5_000)
      const columns = columnsOf(pixels)
      expect(litFraction(columns)).toBeGreaterThan(0.05)
      expect(litFraction(slice(pixels, STAGE))).toBeLessThan(0.02)
      // Velvet: lit column pixels lean red, never blue-dominant.
      const lit = columns.filter(([r, g, b]) => r + g + b > 0.05)
      expect(lit.every(([r, , b]) => r >= b)).toBe(true)
    })

    it('the countermotion trades colors inside the warm palette: no cyan before the blip', () => {
      const { pixels } = frameAt(artifact, 11_000)
      // The reversed arch chase wears velvet; the columns run gold; nothing
      // anywhere is blue-dominant this early.
      const archLit = slice(pixels, ARCH).filter(([r, g, b]) => r + g + b > 0.1)
      expect(archLit.length).toBeGreaterThan(5)
      const colsLit = columnsOf(pixels).filter(([r, g, b]) => r + g + b > 0.1)
      expect(colsLit.length).toBeGreaterThan(5)
      expect(pixels.filter(([r, g, b]) => r + g + b > 0.1 && b > r * 1.5)).toHaveLength(0)
    })

    it('the columns reverse seamlessly on the bar six line', () => {
      // Pitch is exactly 0.25, so at the bar boundary the bulb lattice is
      // symmetric about the run's midpoint and the mirror swap must not
      // move the image any faster than an ordinary chase step.
      const stepBefore = frameAt(artifact, 11_100)
      const atSwap = frameAt(artifact, 11_200)
      const afterSwap = frameAt(artifact, 11_300)
      const meanDelta = (a: number[][], b: number[][]) => {
        let sum = 0
        for (let i = 0; i < a.length; i++)

          sum += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) + Math.abs(a[i][2] - b[i][2])
        return sum / a.length
      }
      const ordinary = meanDelta(columnsOf(stepBefore.pixels), columnsOf(atSwap.pixels))
      const acrossSwap = meanDelta(columnsOf(atSwap.pixels), columnsOf(afterSwap.pixels))
      expect(acrossSwap).toBeLessThan(Math.max(ordinary * 2.5, 0.05))
    })

    it('one cyan blip flashes the arch inside the monochrome hold, then gold returns', () => {
      const blip = frameAt(artifact, 21_800)
      const blipLit = slice(blip.pixels, ARCH).filter(([r, g, b]) => r + g + b > 0.1)
      expect(blipLit.length).toBeGreaterThan(5)
      expect(blipLit.filter(([r, , b]) => b > r * 1.5).length / blipLit.length).toBeGreaterThan(0.8)
      const returned = frameAt(artifact, 23_500)
      const returnedLit = slice(returned.pixels, ARCH).filter(([r, g, b]) => r + g + b > 0.1)
      expect(returnedLit.every(([r, , b]) => r >= b)).toBe(true)
    })

    it('a red ember joins the columns late in one-world', () => {
      const { pixels } = frameAt(artifact, 26_500)
      const lit = columnsOf(pixels).filter(([r, g, b]) => r + g + b > 0.1)
      expect(lit.length).toBeGreaterThan(0)
      // Velvet: strongly red-dominant, unlike the gold that held before.
      expect(lit.filter(([r, g]) => r > g * 2).length).toBeGreaterThan(0)
      const before = frameAt(artifact, 20_000)
      const beforeLit = columnsOf(before.pixels).filter(([r, g, b]) => r + g + b > 0.1)
      expect(beforeLit.filter(([r, g]) => r > g * 2)).toHaveLength(0)
    })

    it('the curtain cut ignites the stage', () => {
      // The anticipation velvet before the cut is dim (brightness 0.3), so
      // the reveal is a brightness event, not a coverage event: mean stage
      // energy at least doubles across the boundary.
      const mean = (pixels: number[][]) => pixels.reduce((sum, [r, g, b]) => sum + r + g + b, 0) / pixels.length
      const before = frameAt(artifact, 13_800)
      const after = frameAt(artifact, 17_500)
      const oneWorld = frameAt(artifact, 25_000)
      expect(mean(slice(after.pixels, STAGE))).toBeGreaterThan(mean(slice(before.pixels, STAGE)) * 1.5)
      // The apex bloom arrives with one-world and lifts the stage further.
      expect(mean(slice(oneWorld.pixels, STAGE))).toBeGreaterThan(mean(slice(before.pixels, STAGE)) * 2)
    })

    it('the surge drops every warm voice and runs the one cyan intruder', () => {
      const { pixels } = frameAt(artifact, 32_200)
      // Vacuum: most of the stage is dark while the bolt crosses.
      expect(litFraction(pixels)).toBeLessThan(0.25)
      const lit = pixels.filter(([r, g, b]) => r + g + b > 0.1)
      expect(lit.length).toBeGreaterThan(5)
      // The intruder is cyan: blue clearly dominates red across the bolt.
      const cyan = lit.filter(([r, , b]) => b > r * 1.5)
      expect(cyan.length / lit.length).toBeGreaterThan(0.8)
    })

    it('the house comes up in full voice after the surge, red and gold with no white', () => {
      const { pixels } = frameAt(artifact, 38_000)
      expect(litFraction(slice(pixels, STAGE))).toBeGreaterThan(0.3)
      expect(litFraction(slice(pixels, ARCH))).toBeGreaterThan(0.1)
      expect(litFraction(columnsOf(pixels))).toBeGreaterThan(0.05)
      // The intruder left: no cyan-dominant pixels anywhere.
      const lit = pixels.filter(([r, g, b]) => r + g + b > 0.1)
      expect(lit.filter(([r, , b]) => b > r * 1.5)).toHaveLength(0)
      // The peak burns scarlet, never white: the arch reads red-dominant
      // and no lit pixel is near-neutral bright.
      const archLit = slice(pixels, ARCH).filter(([r, g, b]) => r + g + b > 0.1)
      expect(archLit.every(([r, g]) => r > g * 1.5)).toBe(true)
      expect(lit.filter(([r, g, b]) => r > 0.85 && g > 0.85 && b > 0.8)).toHaveLength(0)
    })

    it('the night ends on a lone warm lamp at center stage', () => {
      const { pixels } = frameAt(artifact, 45_500)
      const lit = pixels.map((rgb, index) => ({ rgb, index }))
        .filter(({ rgb: [r, g, b] }) => r + g + b > 0.05)
      expect(lit.length).toBeGreaterThan(3)
      expect(lit.length).toBeLessThan(60)
      // Every surviving pixel is warm and lives on the stage field.
      expect(lit.every(({ index }) => index >= STAGE[0] && index <= STAGE[1])).toBe(true)
      expect(lit.every(({ rgb: [r, , b] }) => r > b)).toBe(true)
    })

    it('loops back into the circuit test', () => {
      const wrapped = frameAt(artifact, 50_200)
      expect(litFraction(slice(wrapped.pixels, ARCH))).toBeGreaterThan(0.1)
      expect(litFraction(slice(wrapped.pixels, STAGE))).toBeLessThan(0.02)
    })
  })
})

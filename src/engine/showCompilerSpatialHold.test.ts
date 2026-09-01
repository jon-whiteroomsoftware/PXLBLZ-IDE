// #937: the compile option wraps eligible Shows, declines the rest with a
// reason, keeps anchors equal to the baseline sample, and is byte-identical
// when off. Oracle: replay frames of the compiled artifacts.
import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import type { MapPoint } from './maps/types'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from './showCompiler'
import { compileShowForArtifact } from './showPreviewArtifact'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'

const SIDE = 16
const MAP_POINTS: MapPoint[] = Array.from({ length: SIDE * SIDE }, (_, index) => ({
  sample: [(index % SIDE) / (SIDE - 1), Math.floor(index / SIDE) / (SIDE - 1)],
}))

function singleZone(pattern: string): ShowRecipe {
  const stage = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 1999 }] }
  return {
    masterPixelCount: 2_000,
    clips: [{ id: 'member', source: DEMOS[pattern] }, { id: 'cheap', source: DEMOS.EasedSweep }],
    zones: [stage],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stage] }],
    routedSceneSequence: {
      scenes: [
        { holdMs: 20_000, placements: [{ placementId: 'p', zoneName: 'stage', clipId: 'member' }] },
        { holdMs: 20_000, placements: [{ placementId: 'q', zoneName: 'stage', clipId: 'cheap' }] },
      ],
    },
    loopDurationMs: 42_000,
  }
}

function frames(artifact: Pick<GeneratedShowArtifact, 'code' | 'fxCode' | 'metadata'>, fidelity: 'fast' | 'fidelity'): Float64Array[] {
  const replay = createFastReplayRuntime({ code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: 2 }, { mapPoints: MAP_POINTS, randomSeed: 937, fidelity })
  return [500, 1_500].map((timeMs) => Float64Array.from(replay.advanceTo(timeMs, { stepMs: 250 }).frame))
}

describe('spatial hold-and-lerp compile option (#937)', () => {
  it('is off by default and byte-identical to a compile without the option', () => {
    const plain = compileShow(singleZone('Caustics'), LIBRARIES, {})
    const explicit = compileShow(singleZone('Caustics'), LIBRARIES, { spatialHold: undefined })
    expect(explicit.code).toBe(plain.code)
    expect(plain.summary.specializations.spatialHold).toEqual({ selected: false, reason: 'disabled', stride: null, latchedPaints: 0 })
  })

  it.each([2, 4] as const)('stride %i: anchors equal the direct-sink-off baseline sample, in both modes', (stride) => {
    const base = compileShow(singleZone('Caustics'), LIBRARIES, { directColorSinks: false })
    const held = compileShow(singleZone('Caustics'), LIBRARIES, { spatialHold: { stride, mode: 'lerp' } })
    expect(held.summary.specializations.spatialHold).toMatchObject({ selected: true, reason: 'selected', stride })
    expect(held.summary.resources.blockers).toEqual([])
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const reference = frames(base, fidelity)
      const output = frames(held, fidelity)
      for (let f = 0; f < reference.length; f += 1) {
        for (let pixel = 0; pixel < SIDE * SIDE; pixel += stride) {
          for (let channel = 0; channel < 3; channel += 1) {
            expect(output[f][pixel * 3 + channel], `${fidelity} frame ${f} pixel ${pixel}`).toBeCloseTo(reference[f][pixel * 3 + channel], 6)
          }
        }
      }
    }
  })

  it('returns the ordinary direct-sink artifact when the hold is declined', () => {
    const portable = STOCK_SHOWS.find((item) => item.id === 'stock-show-105-portable-zones')!
    const plain = compileShowForArtifact(portable.show, [], undefined, {}, { stageDimension: 2 }).artifact!
    const declined = compileShowForArtifact(portable.show, [], undefined, {}, { stageDimension: 2, spatialHold: { stride: 2, mode: 'lerp' } }).artifact!
    expect(declined.summary.specializations.spatialHold).toMatchObject({ selected: false, reason: 'coordinate-routed' })
    expect(declined.code).toBe(plain.code)
  })

  it('wraps or declines every stock Show with a recorded reason', () => {
    const reasons: Record<string, number> = {}
    for (const item of STOCK_SHOWS) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2, spatialHold: { stride: 2, mode: 'lerp' } })
      if (!compiled.artifact) throw new Error(`${item.id}: ${compiled.error}`)
      const summary = compiled.artifact.summary.specializations.spatialHold
      reasons[summary.reason] = (reasons[summary.reason] ?? 0) + 1
      expect(compiled.artifact.summary.resources.blockers, item.id).toEqual([])
      if (summary.selected) {
        // Total latch coverage: the entry's blend is the only native paint.
        expect((compiled.artifact.expandedCode.match(/\brgb\(/g) ?? []).length, item.id).toBe(1)
      }
    }
    console.log('#937 stock catalogue reasons', JSON.stringify(reasons))
    expect(reasons.selected ?? 0).toBeGreaterThan(0)
  }, 120_000)
})

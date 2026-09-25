// #937: the compile option wraps eligible Shows, declines the rest with a
// reason, keeps anchors equal to the baseline sample, and is byte-identical
// when off. Oracle: replay frames of the compiled artifacts.
import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import type { MapPoint } from './maps/types'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from './showCompiler'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { STOCK_SHOWS_V2, stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '@/pixelblaze/stock/showsV2Compile'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'

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
    const record = stockShowV2ById('stock-show-105-portable-zones')!
    const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
    if (prepared.status !== 'ready') throw new Error(record.id + ': ' + prepared.issues.map((issue) => issue.path + ': ' + issue.message).join('; '))
    const plain = compileShow(prepared.recipe, LIBRARIES)
    const declined = compileShow(prepared.recipe, LIBRARIES, { spatialHold: { stride: 2, mode: 'lerp' } })
    expect(declined.summary.specializations.spatialHold).toMatchObject({ selected: false, reason: 'coordinate-routed' })
    expect(declined.code).toBe(plain.code)
  })

  it('wraps or declines every stock Show with a recorded reason', () => {
    const reasons: Record<string, number> = {}
    for (const item of STOCK_SHOWS_V2) {
      const itemPrepared = prepareShowV2ForCompile(item, nativeStockSourceLookupV2(item), { libraries: LIBRARIES })
      if (itemPrepared.status !== 'ready') throw new Error(item.id + ': ' + itemPrepared.issues.map((issue) => issue.path + ': ' + issue.message).join('; '))
      const artifact = compileShow(itemPrepared.recipe, LIBRARIES, { spatialHold: { stride: 2, mode: 'lerp' } })
      const summary = artifact.summary.specializations.spatialHold
      reasons[summary.reason] = (reasons[summary.reason] ?? 0) + 1
      expect(artifact.summary.resources.blockers, item.id).toEqual([])
      if (summary.selected) {
        // Total latch coverage: the entry's blend is the only native paint.
        expect((artifact.expandedCode.match(/\brgb\(/g) ?? []).length, item.id).toBe(1)
      }
    }
    console.log('#937 stock catalogue reasons', JSON.stringify(reasons))
    expect(reasons.selected ?? 0).toBeGreaterThan(0)
  }, 120_000)
})

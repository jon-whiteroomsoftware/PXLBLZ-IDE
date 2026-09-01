// #931: member loop rewrites are exact and reach the stock catalogue.
// Oracle: compiled-artifact Fast and Precise replay checksums with the pass
// on versus off, over single-member Shows of the loop-bearing stock
// Patterns and over the whole stock catalogue.
import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import type { MapPoint } from './maps/types'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from './showCompiler'
import { compileShowForArtifact } from './showPreviewArtifact'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'

const MAP_SIDE = 16
const MAP_POINTS: MapPoint[] = Array.from({ length: MAP_SIDE * MAP_SIDE }, (_, index) => ({
  sample: [(index % MAP_SIDE) / (MAP_SIDE - 1), Math.floor(index / MAP_SIDE) / (MAP_SIDE - 1)],
}))
const CHECKSUM_TIMES_MS = [0, 1_500, 4_000]

function singleZoneRecipe(pattern: string): ShowRecipe {
  const stage = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 255 }] }
  return {
    masterPixelCount: 256,
    clips: [{ id: 'member', source: DEMOS[pattern] }, { id: 'cheap', source: DEMOS.EasedSweep }],
    zones: [stage],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stage] }],
    routedSceneSequence: {
      scenes: [
        { holdMs: 20_000, placements: [{ placementId: 'p', zoneName: 'stage', clipId: 'member' }] },
        { holdMs: 20_000, placements: [{ placementId: 'q', zoneName: 'stage', clipId: 'cheap' }] },
      ],
    },
    loopDurationMs: 40_000,
  }
}

function checksums(artifact: Pick<GeneratedShowArtifact, 'code' | 'fxCode' | 'metadata'>, fidelity: 'fast' | 'fidelity'): string[] {
  const replay = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 2,
  }, { mapPoints: MAP_POINTS, randomSeed: 931, fidelity })
  return CHECKSUM_TIMES_MS.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 250 }).checksum)
}

describe('member loop unrolling in compiled Shows (#931)', () => {
  it.each([
    // Literal or never-written-constant bounds the pass must unroll.
    ['IridescentFibers', true],
    ['NeonSquircles', true],
    ['PulseLoom', true],
    // Slider-driven bounds stay loops; only the idiom rewrite applies.
    ['Kishimisu', false],
    ['PhantomStar', false],
  ])('%s: exact in both modes, unrolled=%s', (pattern, unrolled) => {
    const off = compileShow(singleZoneRecipe(pattern), LIBRARIES, { loopUnrolling: false })
    const on = compileShow(singleZoneRecipe(pattern), LIBRARIES, { loopUnrolling: true })
    // Member functions sit before the exported entry points, so count loops
    // across the whole artifact.
    const offLoops = (off.expandedCode.match(/\bfor \(/g) ?? []).length
    const onLoops = (on.expandedCode.match(/\bfor \(/g) ?? []).length
    if (unrolled) expect(onLoops, pattern).toBeLessThan(offLoops)
    else expect(onLoops, pattern).toBe(offLoops)
    expect(on.expandedCode).not.toMatch(/for \([^)]*; \w+ = \w+ \+ 1\)/)
    expect(checksums(on, 'fast'), pattern).toEqual(checksums(off, 'fast'))
    expect(checksums(on, 'fidelity'), pattern).toEqual(checksums(off, 'fidelity'))
    expect(on.summary.resources.blockers, pattern).toEqual([])
  })

  it('is exact across the stock catalogue in both preview modes', () => {
    let changed = 0
    for (const item of STOCK_SHOWS) {
      const compile = (loopUnrolling: boolean) => {
        const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2, loopUnrolling })
        if (!compiled.artifact) throw new Error(`${item.id}: ${compiled.error}`)
        return compiled.artifact
      }
      const off = compile(false)
      const on = compile(true)
      if (on.code !== off.code) changed += 1
      expect(on.summary.resources.blockers, item.id).toEqual([])
      expect(checksums(on, 'fast'), item.id).toEqual(checksums(off, 'fast'))
      expect(checksums(on, 'fidelity'), item.id).toEqual(checksums(off, 'fidelity'))
    }
    expect(changed).toBeGreaterThan(0)
  }, 300_000)
})

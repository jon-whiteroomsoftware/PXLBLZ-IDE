import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { showEffectsAreIdentity } from './showEffects'
import { compileShowForArtifact } from './showPreviewArtifact'

// #820: a member whose effect union includes luma/chroma keys must not be
// keyed in scenes that author no key. identityShowEffect had no case for the
// key kinds, so every scene applied both keys at live template values; the
// Compositing and Key Effects showcase's dark+green subject lost every pixel
// and the composite equaled the bed exactly, in all five scenes.
//
// The seam is compile+replay: the bug lives in the per-scene parameter
// resolution of the shared member effect stage, which only exists in a
// compiled multi-scene artifact.

const MAP_POINTS = Array.from({ length: 256 }, (_, index) => ({
  sample: [(index % 16) / 15, Math.floor(index / 16) / 15] as [number, number],
}))

interface FrameStats {
  meanRed: number
  greenDominant: number
  checksum: string
}

function sceneStats(timeMs: number, artifact: NonNullable<ReturnType<typeof compileShowForArtifact>['artifact']>): FrameStats {
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: MAP_POINTS, randomSeed: 7, fidelity: 'fast' })
  const result = runtime.advanceTo(timeMs, { stepMs: 50 })
  const pixels = result.pixels
  return {
    meanRed: pixels.reduce((sum, [r]) => sum + r, 0) / pixels.length,
    greenDominant: pixels.filter(([r, g, b]) => g > r * 1.3 && g > b * 1.3 && g > 0.08).length,
    checksum: result.checksum,
  }
}

describe('key effects stay scene-local in shared member stages (#820)', () => {
  const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-compositing-key-effects')!

  it('compiles the Compositing and Key Effects showcase with a visible subject', () => {
    const compiled = compileShowForArtifact(fixture.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    const artifact = compiled.artifact!

    // Scene midpoints: Reference 0-3s, Opacity 3-7s, Luma Key 7-10s,
    // Chroma Key 10-13s, Vignette 13-16s.
    const reference = sceneStats(1_500, artifact)
    const opacity = sceneStats(5_000, artifact)
    const lumaKey = sceneStats(8_500, artifact)
    const chromaKey = sceneStats(11_500, artifact)
    const vignette = sceneStats(14_500, artifact)

    // Reference: the garden is fully opaque over the bed. Its green blobs
    // must dominate the frame (solo it measures ~250/256; keyed to nothing
    // it measured 24 - the bed's own greens).
    expect(reference.greenDominant).toBeGreaterThan(100)

    // Luma Key: dark subject pixels vanish and the warm bed glows through,
    // so the frame warms up relative to Reference.
    expect(lumaKey.meanRed).toBeGreaterThan(reference.meanRed + 0.02)

    // Chroma Key: green vanishes; far fewer green-dominant pixels remain
    // than the Reference shows.
    expect(chromaKey.greenDominant).toBeLessThan(reference.greenDominant / 2)

    // Every scene must produce a distinct composite: the bug collapsed
    // Reference, Luma Key, and Chroma Key into one identical dispatch block.
    const checksums = [reference, opacity, lumaKey, chromaKey, vignette].map((stats) => stats.checksum)
    expect(new Set(checksums).size).toBe(checksums.length)
  })
})

describe('identity-valued keys classify as identity (#820)', () => {
  it('recognizes the sentinel before normalization clamps it', () => {
    expect(showEffectsAreIdentity([
      { id: 'k1', kind: 'luma-key', target: 0, tolerance: -1, softness: 0 },
      { id: 'k2', kind: 'chroma-key', color: '#22c55e', tolerance: -1, softness: 0 },
    ])).toBe(true)
    expect(showEffectsAreIdentity([
      { id: 'k1', kind: 'luma-key', target: 0, tolerance: 0.32, softness: 0.18 },
    ])).toBe(false)
    expect(showEffectsAreIdentity([
      { id: 'k2', kind: 'chroma-key', color: '#22c55e', tolerance: 0.3, softness: 0.2 },
    ])).toBe(false)
  })
})

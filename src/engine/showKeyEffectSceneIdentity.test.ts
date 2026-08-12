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
  grayish: number
  dark: number
  cornerMean: number
  centerMean: number
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
  const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const at = (col: number, row: number) => pixels[row * 16 + col]
  const cornerMean = [at(0, 0), at(15, 0), at(0, 15), at(15, 15)].reduce((sum, p) => sum + luma(p), 0) / 4
  const centerMean = [at(7, 7), at(8, 7), at(7, 8), at(8, 8)].reduce((sum, p) => sum + luma(p), 0) / 4
  return {
    meanRed: pixels.reduce((sum, [r]) => sum + r, 0) / pixels.length,
    greenDominant: pixels.filter(([r, g, b]) => g > r * 1.3 && g > b * 1.3 && g > 0.08).length,
    grayish: pixels.filter(([r, g, b]) => Math.abs(r - g) < 0.02 && Math.abs(g - b) < 0.02).length,
    dark: pixels.filter(([r, g, b]) => r + g + b < 0.1).length,
    cornerMean,
    centerMean,
    checksum: result.checksum,
  }
}

describe('key effects stay scene-local in shared member stages (#820)', () => {
  const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-compositing-key-effects')!

  it('compiles the Compositing and Key Effects showcase with every beat distinct', () => {
    const compiled = compileShowForArtifact(fixture.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    const artifact = compiled.artifact!

    // Rebuilt beats (#821): Reference 0-3s, Layer Opacity 3-6s, Opacity
    // Effect 6-9s, Luma Key 9-12.5s, Chroma Key 12.5-16s, Vignette 16-19s,
    // Layered 19-22.5s.
    const reference = sceneStats(1_500, artifact)
    const opacity = sceneStats(4_500, artifact)
    const opacityEffect = sceneStats(7_500, artifact)
    const lumaKey = sceneStats(10_750, artifact)
    const chromaKey = sceneStats(15_600, artifact)
    const vignette = sceneStats(17_500, artifact)
    const layered = sceneStats(20_750, artifact)

    // Reference: grayscale Luma Rings fully opaque - the frame is overwhelmingly
    // achromatic (white rings on black), not the colored bed.
    expect(reference.grayish).toBeGreaterThan(200)

    // Opacity: the warm bed glows through everywhere, so color floods in.
    expect(opacity.grayish).toBeLessThan(reference.grayish - 60)

    // Opacity Effect: an animated fade-out toward black. Early in the beat
    // the rings are near-full; late they are nearly gone - and the frame
    // stays achromatic throughout (the bed does not return).
    const fadeEarly = sceneStats(6_900, artifact)
    const fadeLate = sceneStats(8_700, artifact)
    expect(fadeEarly.grayish).toBeGreaterThan(200)
    expect(fadeLate.grayish).toBeGreaterThan(200)
    expect(fadeLate.centerMean).toBeLessThan(fadeEarly.centerMean * 0.5)

    // Luma Key: dark ring gaps vanish and the colored bed shows through
    // them, so the frame loses its all-achromatic character.
    expect(lumaKey.grayish).toBeLessThan(reference.grayish - 60)

    // Chroma Key: DoomFire's orange body carves out over the bed. The fire
    // layer must remain VISIBLE - its black field stays opaque (a matte wide
    // enough to swallow the field makes the whole layer vanish into the
    // bed; Jon caught exactly that failure on the garden). Substantial dark
    // pixels prove the field covers the bed; warm mean proves fire and bed.
    expect(chromaKey.dark).toBeGreaterThan(60)
    expect(chromaKey.meanRed).toBeGreaterThan(0.15)

    // Vignette: the frame closes hard on the marching waves. Averaging
    // corner and center luminance across four spread samples washes out the
    // wave phase; corners must sit far below the center.
    const vignetteSamples = [16_300, 17_050, 17_800, 18_550].map((timeMs) => sceneStats(timeMs, artifact))
    const meanCorner = vignetteSamples.reduce((sum, stats) => sum + stats.cornerMean, 0) / vignetteSamples.length
    const meanCenter = vignetteSamples.reduce((sum, stats) => sum + stats.centerMean, 0) / vignetteSamples.length
    // The waves are also luma-keyed here, so bed troughs bleed through at
    // the corners; the vignette eats the wave crests, which still leaves
    // corners well below the center.
    expect(meanCorner).toBeLessThan(meanCenter * 0.5)

    // Every beat must produce a distinct composite; the #820 bug collapsed
    // three beats into one identical dispatch block.
    const checksums = [reference, opacity, opacityEffect, lumaKey, chromaKey, vignette, layered].map((stats) => stats.checksum)
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

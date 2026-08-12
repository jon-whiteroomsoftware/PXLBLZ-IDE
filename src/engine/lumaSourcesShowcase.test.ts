import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShowForArtifact } from './showPreviewArtifact'

// #822: every Luma Sources beat is bare for its first half, then brought
// alive by one animated property. Compiling a trackless clone gives the
// exact bare baseline: the first half must match it frame-for-frame, and
// the second half must diverge (the animation is real, not decorative).

const MAP_POINTS = Array.from({ length: 256 }, (_, index) => ({
  sample: [(index % 16) / 15, Math.floor(index / 16) / 15] as [number, number],
}))

function checksumAt(artifact: NonNullable<ReturnType<typeof compileShowForArtifact>['artifact']>, timeMs: number): string {
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: MAP_POINTS, randomSeed: 7, fidelity: 'fast' })
  return runtime.advanceTo(timeMs, { stepMs: 50 }).checksum
}

describe('Luma Sources showcase animation contract (#822)', () => {
  it('holds each beat bare for its first half and animates its second half', () => {
    const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-luma-sources')!
    const animated = compileShowForArtifact(fixture.show, [], undefined, {}, { stageDimension: 2 })
    expect(animated.error).toBeNull()

    const bareShow = structuredClone(fixture.show)
    for (const sceneEntry of bareShow.composition!.scenes) delete sceneEntry.propertyTracks
    const bare = compileShowForArtifact(bareShow, [], undefined, {}, { stageDimension: 2 })
    expect(bare.error).toBeNull()

    for (let index = 0; index < 8; index++) {
      const start = index * 4_000
      // 1.5 s in: still inside the bare half - identical to the trackless clone.
      expect(
        checksumAt(animated.artifact!, start + 1_500),
        `beat ${index + 1} bare half`,
      ).toBe(checksumAt(bare.artifact!, start + 1_500))
      // 3.5 s in: the animation must have moved the image away from bare.
      expect(
        checksumAt(animated.artifact!, start + 3_500),
        `beat ${index + 1} animated half`,
      ).not.toBe(checksumAt(bare.artifact!, start + 3_500))
    }
  })
})

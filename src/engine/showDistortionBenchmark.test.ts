import {
  SHOW_DISTORTION_CANDIDATES,
  benchmarkShowDistortionCandidates,
} from './showDistortionBenchmark'
import { benchmarkSelectedShowDistortionArtifacts } from './showVisualToolkitFixtures'

describe('Show distortion candidate benchmark (#456)', () => {
  it('records the bounded candidate set and the provisional production recommendation', () => {
    expect(SHOW_DISTORTION_CANDIDATES.map((candidate) => candidate.id)).toEqual([
      'ripple',
      'swirl',
      'stretch',
      'bulge',
      'pinch',
      'pixelate',
      'kaleidoscope',
      'glitch',
    ])
    expect(SHOW_DISTORTION_CANDIDATES.filter((candidate) => candidate.recommendation === 'ship')
      .map((candidate) => candidate.id)).toEqual([
      'ripple', 'swirl', 'bulge', 'pinch', 'pixelate', 'kaleidoscope',
    ])
    expect(SHOW_DISTORTION_CANDIDATES.find((candidate) => candidate.id === 'stretch'))
      .toMatchObject({ recommendation: 'covered-by-affine' })
    expect(SHOW_DISTORTION_CANDIDATES.find((candidate) => candidate.id === 'glitch'))
      .toMatchObject({ recommendation: 'defer' })
  })

  it('produces deterministic code-size, operation, and preview evidence without inventing hardware results', () => {
    const first = benchmarkShowDistortionCandidates()
    expect(first).toEqual(benchmarkShowDistortionCandidates())
    expect(first).toHaveLength(8)

    for (const result of first) {
      expect(result.generatedCodeBytes).toBeGreaterThan(0)
      expect(result.operations.scalar).toBeGreaterThan(0)
      expect(result.previewChecksum).toMatch(/^[0-9a-f]{8}$/)
      expect(result.representativeHardwareFps).toBeNull()
    }
    expect(new Set(first.map((result) => result.previewChecksum)).size).toBe(8)
  })

  it('measures selected Effects through the real compiler and cost path', () => {
    const results = benchmarkSelectedShowDistortionArtifacts()
    expect(results.map((result) => result.id)).toEqual([
      'ripple', 'swirl', 'bulge', 'pinch', 'pixelate', 'kaleidoscope',
    ])
    for (const result of results) {
      expect(result.artifactBytes).toBeGreaterThan(0)
      expect(result.addedBytes).toBeGreaterThan(0)
      expect(result.cost.distortionEffectsPerEvaluatedPixel).toBe(1)
    }
    expect(results.find((result) => result.id === 'pixelate')?.cost.distortionPolicies)
      .toEqual({ cheap: 1, smooth: 0 })
    expect(results.find((result) => result.id === 'ripple')?.cost.distortionPolicies)
      .toEqual({ cheap: 0, smooth: 1 })
  })
})

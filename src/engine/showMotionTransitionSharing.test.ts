import { describe, expect, it } from 'vitest'
import { compilerVintageOptions } from './showCompilerVintages'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShowForArtifact } from './showPreviewArtifact'

// The 2026-08-02 repartition split the twenty-boundary Motion reference into
// the all-motion Slide (6 boundaries) and Zoom and Spin (7 boundaries)
// references; both remain fully motion-family sequences and keep the shared
// kernels. The frozen-vintage pins are re-measured against them.
const motionReference = (id = 'stock-show-reference-zoom-spin-transitions') => {
  const fixture = STOCK_SHOWS.find((candidate) => candidate.id === id)
  if (!fixture) throw new Error(`Motion reference Show ${id} is missing.`)
  return fixture.show
}

describe('shared routed motion-transition emission (#525)', () => {
  it.each([
    ['stock-show-reference-slide-transitions', { none: 23_930, structure: 19_059, exact: 19_513, boundaries: 6, exactKernels: 4 }],
    ['stock-show-reference-zoom-spin-transitions', { none: 26_706, structure: 20_922, exact: 20_872, boundaries: 7, exactKernels: 5 }],
  ] as const)('fits the two-instance %s under the activation budget', (id, pins) => {
    // Historical #525 boundary: pin passes that postdate its pinned bytes.
    // Re-pinned 2026-08-22 when the references dropped their backdrop (#63).
    const baseline = compileShowForArtifact(motionReference(id), [], undefined, {}, {
      stageDimension: 2,
      motionTransitionSharing: 'none',
      ...compilerVintageOptions('motion-transition-sharing'),
    })
    const selected = compileShowForArtifact(motionReference(id), [], undefined, {}, {
      stageDimension: 2,
      motionTransitionSharing: 'exact',
      ...compilerVintageOptions('motion-transition-sharing'),
    })
    const structural = compileShowForArtifact(motionReference(id), [], undefined, {}, {
      stageDimension: 2,
      motionTransitionSharing: 'structure',
      ...compilerVintageOptions('motion-transition-sharing'),
    })
    const production = compileShowForArtifact(motionReference(id), [], undefined, {}, { stageDimension: 2, ...compilerVintageOptions('motion-transition-sharing') })

    expect(baseline.artifact?.summary.clipCount).toBe(2)
    expect(baseline.artifact?.summary.artifactBytes).toBe(pins.none)
    expect(structural.error).toBeNull()
    expect(structural.artifact?.summary.artifactBytes).toBe(pins.structure)
    expect(structural.artifact?.summary.specializations.motionTransitions).toMatchObject({
      selected: true,
      representation: 'exact-shared-environment',
      kernelCount: pins.boundaries,
      parameterScalarGlobals: 0,
    })
    expect(selected.error).toBeNull()
    expect(selected.artifact?.summary.artifactBytes).toBe(pins.exact)
    expect(selected.artifact?.summary.specializations.motionTransitions).toMatchObject({
      selected: true,
      representation: 'exact-family-kernels',
      boundaryCount: pins.boundaries,
      kernelCount: pins.exactKernels,
      stackPlanCount: 2,
      parameterWords: 0,
      dynamicBranchesAddedPerPixel: 0,
    })
    expect(production.artifact?.code).toBe(selected.artifact?.code)
  })

  it.each([
    'stock-show-reference-slide-transitions',
    'stock-show-reference-zoom-spin-transitions',
  ] as const)('matches every %s boundary in Fast and Precise playback', (id) => {
    const show = motionReference(id)
    const compile = (motionTransitionSharing: 'none' | 'structure' | 'exact') => {
      const result = compileShowForArtifact(show, [], undefined, {}, {
        stageDimension: 2,
        motionTransitionSharing,
      })
      if (!result.artifact) throw new Error(result.error ?? 'Motion Transitions did not compile.')
      return result.artifact
    }
    const baseline = compile('none')
    const structural = compile('structure')
    const selected = compile('exact')
    const transitionByScene = new Map((show.transitions ?? []).map((transition) => [transition.afterSceneId, transition]))
    let cursorMs = 0
    const sampleTimesMs = show.scenes.flatMap((scene) => {
      cursorMs += scene.durationMs
      const transition = transitionByScene.get(scene.id)
      if (!transition || transition.durationMs <= 0) return []
      const startMs = cursorMs
      cursorMs += transition.durationMs
      return [startMs + 1, startMs + transition.durationMs / 2, cursorMs - 1]
    })
    const mapPoints = Array.from({ length: 64 }, (_, index) => ({
      sample: [(index % 8) / 7, Math.floor(index / 8) / 7],
    }))
    const checksums = (artifact: typeof baseline, fidelity: 'fast' | 'fidelity') => {
      const runtime = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: nativeDimension(artifact.metadata.renderFns),
      }, { mapPoints, randomSeed: 525, fidelity })
      return sampleTimesMs.map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 100 }).checksum)
    }

    const baselineFast = checksums(baseline, 'fast')
    const baselinePrecise = checksums(baseline, 'fidelity')
    expect(checksums(structural, 'fast')).toEqual(baselineFast)
    expect(checksums(structural, 'fidelity')).toEqual(baselinePrecise)
    expect(checksums(selected, 'fast')).toEqual(baselineFast)
    expect(checksums(selected, 'fidelity')).toEqual(baselinePrecise)
  }, 20_000)

  it('falls back to unrolled emission when a sequence mixes motion and non-motion boundaries', () => {
    const show = structuredClone(motionReference())
    show.transitions![0] = {
      ...show.transitions![0],
      kind: 'wipe',
    }

    const baseline = compileShowForArtifact(show, [], undefined, {}, {
      stageDimension: 2,
      motionTransitionSharing: 'none',
    })
    const production = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
    const forced = compileShowForArtifact(show, [], undefined, {}, {
      stageDimension: 2,
      motionTransitionSharing: 'exact',
    })

    expect(production.artifact?.summary.artifactBytes).toBe(baseline.artifact?.summary.artifactBytes)
    expect(forced.artifact?.summary.artifactBytes).toBe(baseline.artifact?.summary.artifactBytes)
    for (const result of [production, forced]) {
      expect(result.artifact?.summary.specializations.motionTransitions).toMatchObject({
        selected: false,
        representation: 'unrolled',
        reason: 'incompatible',
        parameterWords: 0,
        dynamicBranchesAddedPerPixel: 0,
      })
    }
  }, 20_000)

  it('preserves every motion family across Clip/Wrap and hard/blend policies', () => {
    const variants = [
      'cover', 'reveal', 'push', 'content-grow', 'content-shrink', 'zoom-in', 'zoom-out',
    ] as const
    const configurations = variants.flatMap((motionVariant, variantIndex) => (
      (['clip', 'wrap'] as const).flatMap((addressPolicy) => (
        (['hard', 'blend'] as const).map((edgePolicy, policyIndex) => ({
          motionVariant,
          addressPolicy,
          edgePolicy,
          direction: (variantIndex * 0.1375 + policyIndex * 0.0625) % 1,
          anchorX: 0.27,
          anchorY: 0.68,
          contentScale: 0.34,
          rotation: 0.42,
          spinDirection: policyIndex % 2 === 0 ? 'clockwise' as const : 'counterclockwise' as const,
        }))
      ))
    ))
    const mapPoints = Array.from({ length: 16 }, (_, index) => ({
      sample: [(index % 4) / 3, Math.floor(index / 4) / 3],
    }))

    for (const offset of [0, 20]) {
      const show = structuredClone(motionReference())
      ;(show.transitions ?? []).forEach((transition, index) => {
        Object.assign(transition, configurations[(offset + index) % configurations.length])
      })
      const compile = (motionTransitionSharing: 'none' | 'exact') => {
        const result = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2, motionTransitionSharing })
        if (!result.artifact) throw new Error(result.error ?? 'Motion policy sweep did not compile.')
        return result.artifact
      }
      const baseline = compile('none')
      const selected = compile('exact')
      const transitionByScene = new Map((show.transitions ?? []).map((transition) => [transition.afterSceneId, transition]))
      let cursorMs = 0
      const sampleTimesMs = show.scenes.flatMap((scene) => {
        cursorMs += scene.durationMs
        const transition = transitionByScene.get(scene.id)
        if (!transition || transition.durationMs <= 0) return []
        const startMs = cursorMs
        cursorMs += transition.durationMs
        return [startMs + 1, startMs + transition.durationMs / 2, cursorMs - 1]
      })
      const checksums = (artifact: typeof baseline, fidelity: 'fast' | 'fidelity') => {
        const runtime = createFastReplayRuntime({
          code: artifact.code,
          fxCode: artifact.fxCode,
          metadata: artifact.metadata,
          dimension: nativeDimension(artifact.metadata.renderFns),
        }, { mapPoints, randomSeed: 525, fidelity })
        return sampleTimesMs.map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 100 }).checksum)
      }

      expect(checksums(selected, 'fast'), `Fast sweep offset ${offset}`).toEqual(checksums(baseline, 'fast'))
      expect(checksums(selected, 'fidelity'), `Precise sweep offset ${offset}`).toEqual(checksums(baseline, 'fidelity'))
    }
  }, 30_000)
})

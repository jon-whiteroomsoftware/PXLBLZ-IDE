import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShowForArtifact } from './showPreviewArtifact'

const motionReference = () => {
  const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-motion-transitions')
  if (!fixture) throw new Error('Motion Transitions reference Show is missing.')
  return fixture.show
}

describe('shared routed motion-transition emission (#525)', () => {
  it('fits the corrected three-instance reference Show under the activation budget', () => {
    // Historical #525 boundary: pin passes that postdate its pinned bytes.
    const baseline = compileShowForArtifact(motionReference(), [], undefined, {}, {
      stageDimension: 2,
      motionTransitionSharing: 'none',
      inlineCallHoisting: false,
      hsvCaptureChainSpecialization: false,
    })
    const selected = compileShowForArtifact(motionReference(), [], undefined, {}, {
      stageDimension: 2,
      motionTransitionSharing: 'exact',
      inlineCallHoisting: false,
      hsvCaptureChainSpecialization: false,
    })
    const structural = compileShowForArtifact(motionReference(), [], undefined, {}, {
      stageDimension: 2,
      motionTransitionSharing: 'structure',
      inlineCallHoisting: false,
      hsvCaptureChainSpecialization: false,
    })
    const production = compileShowForArtifact(motionReference(), [], undefined, {}, { stageDimension: 2, inlineCallHoisting: false, hsvCaptureChainSpecialization: false })

    expect(baseline.artifact?.summary.clipCount).toBe(3)
    expect(baseline.artifact?.summary.artifactBytes).toBe(108_533)
    expect(structural.error).toBeNull()
    expect(structural.artifact?.summary.artifactBytes).toBe(73_324)
    expect(structural.artifact?.summary.specializations.motionTransitions).toMatchObject({
      selected: true,
      representation: 'exact-shared-environment',
      kernelCount: 20,
      parameterScalarGlobals: 0,
    })
    expect(selected.error).toBeNull()
    expect(selected.artifact?.summary.artifactBytes).toBe(67_694)
    expect(selected.artifact?.summary.specializations.motionTransitions).toMatchObject({
      selected: true,
      representation: 'exact-family-kernels',
      boundaryCount: 20,
      stackPlanCount: 2,
      parameterWords: 0,
      dynamicBranchesAddedPerPixel: 0,
    })
    expect(production.artifact?.code).toBe(selected.artifact?.code)
  })

  it('matches every motion boundary in Fast and Precise playback', () => {
    const show = motionReference()
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
  })

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

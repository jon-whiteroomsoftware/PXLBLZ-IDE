import { describe, expect, it } from 'vitest'
import { compilerVintageOptions } from './showCompilerVintages'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { LIBRARIES } from '../pixelblaze/libs'
import { stockShowV2ById } from '../pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '../pixelblaze/stock/showsV2Compile'

// The 2026-08-02 repartition split the twenty-boundary Motion reference into
// the all-motion Slide (6 boundaries) and Zoom and Spin (7 boundaries)
// references; both remain fully motion-family sequences and keep the shared
// kernels. The frozen-vintage pins are re-measured against them.
const motionReference = (id = 'stock-show-reference-zoom-spin-transitions'): ShowRecordV2 => {
  const record = stockShowV2ById(id)
  if (!record) throw new Error('Motion reference Show ' + id + ' is missing.')
  return record
}

function compileMotionV2(show: ShowRecordV2, options: { motionTransitionSharing?: 'none' | 'structure' | 'exact' }) {
  const prepared = prepareShowV2ForCompile(show, nativeStockSourceLookupV2(show), { libraries: LIBRARIES })
  if (prepared.status !== 'ready') throw new Error(show.id + ': ' + prepared.issues.map((issue) => issue.path + ': ' + issue.message).join('; '))
  return { artifact: compileShow(prepared.recipe, LIBRARIES, { ...compilerVintageOptions('motion-transition-sharing'), ...options }), error: null as string | null }
}

function boundarySampleTimesMsV2(record: ShowRecordV2): number[] {
  const clips = new Map(record.composition.clips.map((clip) => [clip.id, clip]))
  const times: number[] = []
  for (const transition of record.composition.transitions) {
    if (transition.durationMs <= 0) continue
    const wholeOutputStart = transition.wholeOutput?.startMs
    if (wholeOutputStart !== undefined) {
      times.push(wholeOutputStart + 1, wholeOutputStart + transition.durationMs / 2, wholeOutputStart + transition.durationMs - 1)
      continue
    }
    const from = clips.get(transition.participants[0]?.fromClipId ?? '')
    if (!from) continue
    const startMs = from.startMs + from.durationMs
    times.push(startMs + 1, startMs + transition.durationMs / 2, startMs + transition.durationMs - 1)
  }
  return times
}

describe('shared routed motion-transition emission (#525)', () => {
  it.each([
    ['stock-show-reference-slide-transitions', { none: 20_591, structure: 15_720, exact: 16_174, boundaries: 6, exactKernels: 4 }],
    ['stock-show-reference-zoom-spin-transitions', { none: 28_548, structure: 22_755, exact: 22_716, boundaries: 7, exactKernels: 5 }],
  ] as const)('fits the two-instance %s under the activation budget', (id, pins) => {
    // Historical #525 boundary: pin passes that postdate its pinned bytes.
    // Re-pinned 2026-08-22 when the references dropped their backdrop (#63).
    const baseline = compileMotionV2(motionReference(id), { motionTransitionSharing: 'none' })
    const selected = compileMotionV2(motionReference(id), { motionTransitionSharing: 'exact' })
    const structural = compileMotionV2(motionReference(id), { motionTransitionSharing: 'structure' })
    const production = compileMotionV2(motionReference(id), {})

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
      const prepared = prepareShowV2ForCompile(show, nativeStockSourceLookupV2(show), { libraries: LIBRARIES })
      if (prepared.status !== 'ready') throw new Error(show.id + ': ' + prepared.issues.map((issue) => issue.path + ': ' + issue.message).join('; '))
      return compileShow(prepared.recipe, LIBRARIES, { motionTransitionSharing })
    }
    const baseline = compile('none')
    const structural = compile('structure')
    const selected = compile('exact')
    const sampleTimesMs = boundarySampleTimesMsV2(show)
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
    const firstTransition = show.composition.transitions[0]
    if (!firstTransition) throw new Error('Motion reference has no transitions.')
    show.composition.transitions[0] = {
      ...firstTransition,
      kind: 'wipe',
    }

    const baseline = compileMotionV2(show, { motionTransitionSharing: 'none' })
    const production = compileMotionV2(show, {})
    const forced = compileMotionV2(show, { motionTransitionSharing: 'exact' })

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
      show.composition.transitions.forEach((transition, index) => {
        Object.assign(transition, configurations[(offset + index) % configurations.length])
      })
      const compile = (motionTransitionSharing: 'none' | 'exact') => {
        const prepared = prepareShowV2ForCompile(show, nativeStockSourceLookupV2(show), { libraries: LIBRARIES })
        if (prepared.status !== 'ready') throw new Error(show.id + ': ' + prepared.issues.map((issue) => issue.path + ': ' + issue.message).join('; '))
        return compileShow(prepared.recipe, LIBRARIES, { motionTransitionSharing })
      }
      const baseline = compile('none')
      const selected = compile('exact')
      const sampleTimesMs = boundarySampleTimesMsV2(show)
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

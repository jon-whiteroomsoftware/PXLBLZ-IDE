import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { LIBRARIES } from '../pixelblaze/libs'
import { stockShowV2ById } from '../pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '../pixelblaze/stock/showsV2Compile'

function reference(id: string): ShowRecordV2 {
  const record = stockShowV2ById(id)
  if (!record) throw new Error('Missing stock Show ' + id)
  return record
}

function compileShowForArtifactV2(record: ShowRecordV2, showScoreSharing: 'none' | 'force') {
  const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
  if (prepared.status !== 'ready') throw new Error(record.id + ': ' + prepared.issues.map((issue) => issue.path + ': ' + issue.message).join('; '))
  return { artifact: compileShow(prepared.recipe, LIBRARIES, { showScoreSharing }), error: null as string | null }
}

type CompiledArtifact = GeneratedShowArtifact

const SCORE_MAP_POINTS = Array.from({ length: 64 }, (_, index) => ({
  sample: [(index % 8) / 7, Math.floor(index / 8) / 7],
}))

function boundarySampleTimesMs(record: ShowRecordV2): number[] {
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

function boundaryChecksums(
  artifact: CompiledArtifact,
  record: ShowRecordV2,
  fidelity: 'fast' | 'fidelity',
): string[] {
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: SCORE_MAP_POINTS, randomSeed: 542, fidelity })
  return boundarySampleTimesMs(record).map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 100 }).checksum)
}

describe('table-driven routed Show score emission (#542)', () => {
  it('compiles the Easing reference as two stacks, one kernel, and frame-time easing data', () => {
    const show = reference('stock-show-reference-easing')
    const baseline = compileShowForArtifactV2(show, 'none')
    const candidate = compileShowForArtifactV2(show, 'force')

    expect(baseline.error).toBeNull()
    // Refreshed 2026-07-20 after the wave-2 emission changes (#557-#566),
    // again 2026-08-02 when the reference pair recast to the measured
    // MetaballGarden/IQPalettes diagnostic over a Murmuration backdrop, and
    // 2026-08-22 when every Transition reference dropped that backdrop (#63).
    expect(baseline.artifact?.summary.artifactBytes).toBe(24_598)
    expect(candidate.error).toBeNull()
    expect(candidate.artifact?.summary.specializations.showScore).toMatchObject({
      selected: true,
      representation: 'table-driven',
      reason: 'selected',
      boundaryCount: 20,
      stackPlanCount: 2,
      kernelCount: 1,
      easingCount: 20,
      timing: 'regular-cadence',
      loopBehavior: 'modulo-show-duration',
      perPixelSceneBranches: 2,
    })
    expect(candidate.artifact!.summary.artifactBytes).toBeLessThan(baseline.artifact!.summary.artifactBytes)
    expect(candidate.artifact!.summary.artifactBytes).toBeLessThanOrEqual(68_384)
  })

  it('leaves incompatible Property Animation byte-for-byte on the unrolled emitter', () => {
    const show = reference('stock-show-reference-property-animation')
    const baseline = compileShowForArtifactV2(show, 'none')
    const forced = compileShowForArtifactV2(show, 'force')

    expect(forced.artifact?.code).toBe(baseline.artifact?.code)
    expect(forced.artifact?.summary.specializations.showScore).toMatchObject({
      selected: false,
      representation: 'unrolled',
      reason: 'incompatible',
    })
  })

  it('matches the unrolled emitter at every Easing boundary in Fast and Precise playback', () => {
    const show = reference('stock-show-reference-easing')
    const compile = (showScoreSharing: 'none' | 'force') => {
      const result = compileShowForArtifactV2(show, showScoreSharing)
      if (!result.artifact) throw new Error(result.error ?? 'Easing reference did not compile.')
      return result.artifact
    }
    const baseline = compile('none')
    const selected = compile('force')
    expect(boundaryChecksums(selected, show, 'fast')).toEqual(boundaryChecksums(baseline, show, 'fast'))
    expect(boundaryChecksums(selected, show, 'fidelity')).toEqual(boundaryChecksums(baseline, show, 'fidelity'))
  }, 20_000)

  it.each([
    'stock-show-reference-blend-fade-transitions',
    'stock-show-reference-wipe-transitions',
    'stock-show-reference-dissolve-transitions',
    'stock-show-reference-shape-reveal-transitions',
    'stock-show-reference-shape-reveal-figures',
    'stock-show-reference-slide-transitions',
    'stock-show-reference-zoom-spin-transitions',
  ] as const)('keeps the paced %s on the unrolled emitter under the activation ceiling', { timeout: 30_000 }, (id) => {
    // Editor pacing (2026-08-02) gives every split Transition reference one
    // study-tempo exemplar and quick-cut siblings, which makes the boundary
    // cadence irregular and disqualifies the table-driven score by design.
    // The trade is deliberate: Easing keeps uniform cadence - identical
    // durations are its control variable - and keeps the optimization, while
    // the paced references pay unrolled bytes and must still fit the
    // activation ceiling.
    const show = reference(id)
    const baseline = compileShowForArtifactV2(show, 'none')
    const forced = compileShowForArtifactV2(show, 'force')

    expect(forced.artifact?.code).toBe(baseline.artifact?.code)
    expect(forced.artifact?.summary.specializations.showScore).toMatchObject({
      selected: false,
      representation: 'unrolled',
      reason: 'incompatible',
      incompatibilityReason: 'transition-family',
    })
    expect(forced.artifact!.summary.artifactBytes).toBeLessThanOrEqual(68_384)
  })
})

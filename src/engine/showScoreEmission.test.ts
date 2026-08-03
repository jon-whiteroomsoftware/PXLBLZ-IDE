import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShowForArtifact } from './showPreviewArtifact'

function reference(id: string) {
  const fixture = STOCK_SHOWS.find((candidate) => candidate.id === id)
  if (!fixture) throw new Error(`Missing stock Show ${id}`)
  return fixture.show
}

type CompiledArtifact = NonNullable<ReturnType<typeof compileShowForArtifact>['artifact']>

const SCORE_MAP_POINTS = Array.from({ length: 64 }, (_, index) => ({
  sample: [(index % 8) / 7, Math.floor(index / 8) / 7],
}))

function boundarySampleTimesMs(show: ReturnType<typeof reference>): number[] {
  const transitionByScene = new Map((show.transitions ?? []).map((transition) => [transition.afterSceneId, transition]))
  let cursorMs = 0
  return show.scenes.flatMap((scene) => {
    cursorMs += scene.durationMs
    const transition = transitionByScene.get(scene.id)
    if (!transition || transition.durationMs <= 0) return []
    const startMs = cursorMs
    cursorMs += transition.durationMs
    return [startMs + 1, startMs + transition.durationMs / 2, cursorMs - 1]
  })
}

function boundaryChecksums(
  artifact: CompiledArtifact,
  show: ReturnType<typeof reference>,
  fidelity: 'fast' | 'fidelity',
): string[] {
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: SCORE_MAP_POINTS, randomSeed: 542, fidelity })
  return boundarySampleTimesMs(show).map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 100 }).checksum)
}

describe('table-driven routed Show score emission (#542)', () => {
  it('compiles the Easing reference as two stacks, one kernel, and frame-time easing data', () => {
    const show = reference('stock-show-reference-easing')
    const baseline = compileShowForArtifact(show, [], undefined, {}, {
      stageDimension: 2,
      showScoreSharing: 'none',
    })
    const candidate = compileShowForArtifact(show, [], undefined, {}, {
      stageDimension: 2,
      showScoreSharing: 'force',
    })

    expect(baseline.error).toBeNull()
    // Refreshed 2026-07-20 after the wave-2 emission changes (#557-#566),
    // and again 2026-08-02 when the reference pair recast to the measured
    // MetaballGarden/IQPalettes diagnostic over a Murmuration backdrop.
    expect(baseline.artifact?.summary.artifactBytes).toBe(101_692)
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
    const baseline = compileShowForArtifact(show, [], undefined, {}, {
      stageDimension: 2,
      showScoreSharing: 'none',
    })
    const forced = compileShowForArtifact(show, [], undefined, {}, {
      stageDimension: 2,
      showScoreSharing: 'force',
    })

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
      const result = compileShowForArtifact(show, [], undefined, {}, {
        stageDimension: 2,
        showScoreSharing,
      })
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
  ] as const)('keeps the paced %s on the unrolled emitter under the activation ceiling', (id) => {
    // Editor pacing (2026-08-02) gives every split Transition reference one
    // study-tempo exemplar and quick-cut siblings, which makes the boundary
    // cadence irregular and disqualifies the table-driven score by design.
    // The trade is deliberate: Easing keeps uniform cadence - identical
    // durations are its control variable - and keeps the optimization, while
    // the paced references pay unrolled bytes and must still fit the
    // activation ceiling.
    const show = reference(id)
    const baseline = compileShowForArtifact(show, [], undefined, {}, {
      stageDimension: 2,
      showScoreSharing: 'none',
    })
    const forced = compileShowForArtifact(show, [], undefined, {}, {
      stageDimension: 2,
      showScoreSharing: 'force',
    })

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

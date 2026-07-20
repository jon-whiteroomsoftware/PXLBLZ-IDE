// #559: per-member HSV capture-chain specialization. The slot argument is a
// compile-time constant at every call site, so the two-call dispatch chain
// collapses into a per-member conversion writing the member's own capture
// globals; each sextant arm computes only the values it uses.
import { createFastReplayRuntime } from './fastReplay'
import { compileShow, type ShowRecipe } from './showCompiler'

const HSV_SOURCE = 'export function render(index) { hsv(index / pixelCount, 0.7, 0.8) }'
const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 63 }] }

function hsvRecipe(overrides: {
  memberCount?: number
  placementExtras?: Record<string, unknown>
  keyed?: boolean
} = {}): ShowRecipe {
  const count = overrides.memberCount ?? 2
  const keyEffects = overrides.keyed
    ? [{ id: 'key', kind: 'luma-key' as const, target: 1, tolerance: 0.2, softness: 0.1 }]
    : undefined
  const clips = Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    // Distinct sources so Pattern-slot sharing cannot merge the members.
    source: HSV_SOURCE.replace('0.8', `0.${80 + index}`),
    ...(index === 0 && keyEffects ? { effects: keyEffects } : {}),
  }))
  return {
    clips,
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: clips.map((clip, index) => ({
        holdMs: 5_000,
        placements: [{
          placementId: `p${index}`,
          zoneName: 'stage',
          clipId: clip.id,
          ...(index === 0 && keyEffects ? { effects: keyEffects } : {}),
          ...(index === 0 ? overrides.placementExtras ?? {} : {}),
        }],
        ...(index < clips.length - 1
          ? { transitionOut: { kind: 'crossfade' as const, durationMs: 1_000 } }
          : {}),
      })),
    },
    loopDurationMs: count * 6_000,
  }
}

describe('per-member HSV capture-chain specialization (#559)', () => {
  it('emits per-member conversions with no runtime slot dispatch', () => {
    const artifact = compileShow(hsvRecipe(), {})
    const code = artifact.expandedCode
    expect(code).not.toContain('__pxlblz_show_capture_hsv')
    expect(code).not.toContain('__pxlblz_show_capture_rgb')
    // The specialized body writes the member's own globals per sextant arm.
    expect(code).toMatch(/function __pxlblz_show_c0_hsv\(h, s, v\) \{[\s\S]*?if \(i == 0\) \{ __pxlblz_show_c0_r = v; __pxlblz_show_c0_g = v \* \(1 - \(1 - f\) \* s\); __pxlblz_show_c0_b = p \}/)
    // Each arm computes only what it uses: no precomputed q/t temps.
    const body = code.slice(code.indexOf('function __pxlblz_show_c0_hsv'), code.indexOf('function __pxlblz_show_c0_hsv') + 900)
    expect(body).not.toMatch(/var q = /)
    expect(body).not.toMatch(/var t = /)
    const summary = artifact.summary.specializations.hsvCaptureChain
    expect(summary).toMatchObject({ policy: 'per-member', memberCount: 2 })
  })

  it('strips the phase add under the identity proof and keeps it otherwise', () => {
    const identity = compileShow(hsvRecipe(), {})
    expect(identity.expandedCode).toMatch(/function __pxlblz_show_c0_hsv\(h, s, v\) \{(?![\s\S]*?c0_adapt_phase)/)
    const phased = compileShow(hsvRecipe({ placementExtras: { phase: 0.25 } }), {})
    const body = phased.expandedCode.slice(
      phased.expandedCode.indexOf('function __pxlblz_show_c0_hsv'),
      phased.expandedCode.indexOf('function __pxlblz_show_c0_hsv') + 200,
    )
    expect(body).toContain('h + __pxlblz_show_c0_adapt_phase')
  })

  it('sets alpha in every arm for content-keyed members', () => {
    const artifact = compileShow(hsvRecipe({ keyed: true }), {})
    const start = artifact.expandedCode.indexOf('function __pxlblz_show_c0_hsv')
    const body = artifact.expandedCode.slice(start, artifact.expandedCode.indexOf('\n}', start))
    expect(body.match(/__pxlblz_show_c0_alpha = 1/g)?.length).toBe(6)
  })

  it('falls back to the shared conversion past the byte threshold', () => {
    const artifact = compileShow(hsvRecipe({ memberCount: 10 }), {})
    expect(artifact.expandedCode).toContain('__pxlblz_show_capture_hsv')
    expect(artifact.summary.specializations.hsvCaptureChain).toMatchObject({ policy: 'shared', memberCount: 10 })
  })

  it('restores the previous emission under the benchmark counterfactual option', () => {
    const artifact = compileShow(hsvRecipe(), {}, { hsvCaptureChainSpecialization: false })
    expect(artifact.expandedCode).toContain('__pxlblz_show_capture_hsv')
    expect(artifact.summary.specializations.hsvCaptureChain).toMatchObject({ policy: 'shared' })
  })

  it('replays with identical checksums to the shared-conversion build in both fidelities', () => {
    const recipe = hsvRecipe()
    const specialized = compileShow(recipe, {})
    const shared = compileShow(recipe, {}, { hsvCaptureChainSpecialization: false })
    const times = [0, 2_500, 5_500, 8_000, 11_500]
    const sums = (artifact: typeof specialized, fidelity: 'fast' | 'fidelity') => {
      const replay = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: 1,
      }, {
        mapPoints: Array.from({ length: 64 }, (_, index) => ({ sample: [index / 63] })),
        randomSeed: 559,
        fidelity,
      })
      return times.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
    }
    expect(sums(specialized, 'fast')).toEqual(sums(shared, 'fast'))
    expect(sums(specialized, 'fidelity')).toEqual(sums(shared, 'fidelity'))
  })
})

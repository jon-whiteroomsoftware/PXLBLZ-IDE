import { createFastReplayRuntime } from './fastReplay'
import {
  compileShow,
  type GeneratedShowArtifact,
  type ShowRecipe,
  type ShowSceneSequenceTransitionRecipe,
} from './showCompiler'

const HSV_SOURCE = `
export function render(index) {
  hsv(index / pixelCount, 1, 0.8)
}
`
const RGB_SOURCE = `
export function render(index) {
  rgb(index / pixelCount, 0.5, 0.25)
}
`
// A render path that does not paint on every branch: the clear-elision proof
// fails, so the direct path must not be selected.
const PARTIAL_SOURCE = `
export function render(index) {
  if (index / pixelCount < 0.5) hsv(index / pixelCount, 1, 0.8)
}
`

const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 63 }] }

function steadyRecipe(overrides: {
  sources?: [string, string]
  transitionOut?: ShowSceneSequenceTransitionRecipe
  placementExtras?: Record<string, unknown>
  clipExtras?: Record<string, unknown>
  secondClipExtras?: Record<string, unknown>
  secondPlacementExtras?: Record<string, unknown>
  outputEffects?: ShowRecipe['outputEffects']
  secondPlacement?: boolean
} = {}): ShowRecipe {
  const [cheap, heavy] = overrides.sources ?? [HSV_SOURCE, RGB_SOURCE]
  return {
    clips: [
      { id: 'first', source: cheap, ...(overrides.clipExtras ?? {}) },
      { id: 'second', source: heavy, ...(overrides.secondClipExtras ?? {}) },
    ],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 10_000,
          placements: [
            { placementId: 'p0', zoneName: 'stage', clipId: 'first', ...(overrides.placementExtras ?? {}) },
            ...(overrides.secondPlacement
              ? [{ placementId: 'p0b', zoneName: 'stage', clipId: 'second', stackOrder: 1, opacity: 0.5 }]
              : []),
          ],
          transitionOut: overrides.transitionOut ?? { kind: 'crossfade', durationMs: 2_000 },
        },
        {
          holdMs: 10_000,
          placements: [{
            placementId: 'p1',
            zoneName: 'stage',
            clipId: 'second',
            ...(overrides.secondPlacementExtras ?? {}),
          }],
        },
      ],
    },
    loopDurationMs: 22_000,
    ...(overrides.outputEffects ? { outputEffects: overrides.outputEffects } : {}),
  }
}

function compilePair(recipe: ShowRecipe): { on: GeneratedShowArtifact; off: GeneratedShowArtifact } {
  return {
    on: compileShow(recipe, {}, { directColorSinks: true }),
    off: compileShow(recipe, {}, { directColorSinks: false }),
  }
}

function expectByteNeutral(recipe: ShowRecipe): void {
  const { on, off } = compilePair(recipe)
  expect(on.expandedCode).toBe(off.expandedCode)
  expect(on.code).toBe(off.code)
  expect(on.summary.specializations.directColorSinks?.members ?? []).toEqual([])
}

describe('steady-state direct color sinks (#557)', () => {
  it('emits flag-branch direct sinks and skips emit for eligible members', () => {
    const { on, off } = compilePair(steadyRecipe())
    expect(on.expandedCode).toContain('var __pxlblz_show_direct = 0')
    // #559 reshaped the wrapper into the per-member conversion; the direct
    // branch now leads the multi-line body.
    expect(on.expandedCode).toMatch(/function __pxlblz_show_c0_hsv\(h, s, v\) \{\n {2}if \(__pxlblz_show_direct\) \{ hsv\(/)
    expect(on.expandedCode).toMatch(/function __pxlblz_show_c1_rgb\(r, g, b\) \{ if \(__pxlblz_show_direct\) \{ rgb\(/)
    expect(on.expandedCode).toContain('__pxlblz_show_direct = 1')
    expect(off.expandedCode).not.toContain('__pxlblz_show_direct')
    // The eligible steady arms must not re-emit captured values.
    const steadyArms = on.expandedCode.split('__pxlblz_show_direct = 1').slice(1)
    expect(steadyArms.length).toBeGreaterThanOrEqual(2)
    for (const arm of steadyArms) {
      const tail = arm.slice(0, arm.indexOf('__pxlblz_show_direct = 0'))
      expect(tail).not.toContain('_emit()')
    }
    const summary = on.summary.specializations.directColorSinks
    expect(summary?.enabled).toBe(true)
    expect(summary?.members.map((member) => member.id).sort()).toEqual(['first', 'second'])
  })

  it('defaults on after the qualified Controller matrix; option false restores the capture build', () => {
    // Qualified 2026-07-19: +68.6% to +69.6% median FPS on the #555 HSV
    // steady-state fixture at 256/1,000/2,000 px (wave2-baselines ledger).
    const artifact = compileShow(steadyRecipe(), {})
    expect(artifact.expandedCode).toContain('var __pxlblz_show_direct = 0')
    const disabled = compileShow(steadyRecipe(), {}, { directColorSinks: false })
    expect(disabled.expandedCode).not.toContain('__pxlblz_show_direct')
  })

  it('keeps members without the clear-elision proof on the capture path', () => {
    expectByteNeutral(steadyRecipe({ sources: [PARTIAL_SOURCE, PARTIAL_SOURCE] }))
  })

  it('keeps members with color Effects on the capture path, member by member', () => {
    const { on } = compilePair(steadyRecipe({
      placementExtras: { effects: [{ id: 'poster', kind: 'posterize', levels: 6, amount: 1 }] },
      clipExtras: { effects: [{ id: 'poster', kind: 'posterize', levels: 6, amount: 1 }] },
    }))
    expect(on.summary.specializations.directColorSinks?.members.map((member) => member.id)).toEqual(['second'])
    // The effect-bearing first member keeps its unbranched capture conversion
    // (#559 per-member shape): no direct flag anywhere in the body.
    const start = on.expandedCode.indexOf('function __pxlblz_show_c0_hsv(')
    expect(start).toBeGreaterThanOrEqual(0)
    const body = on.expandedCode.slice(start, on.expandedCode.indexOf('\n}', start))
    expect(body).not.toContain('__pxlblz_show_direct')
    expect(body).toContain('__pxlblz_show_c0_r = v')
  })

  it('keeps content-keyed members on the capture path, member by member', () => {
    const { on } = compilePair(steadyRecipe({
      placementExtras: { effects: [{ id: 'key', kind: 'luma-key', target: 1, tolerance: 0.2, softness: 0.1 }] },
      clipExtras: { effects: [{ id: 'key', kind: 'luma-key', target: 1, tolerance: 0.2, softness: 0.1 }] },
    }))
    expect(on.summary.specializations.directColorSinks?.members.map((member) => member.id)).toEqual(['second'])
    expect(on.expandedCode).toMatch(/function __pxlblz_show_c0_rgb\(r, g, b\) \{ __pxlblz_show_c0_r = r/)
  })

  it('keeps stacked placements on the capture path while lone scenes stay direct', () => {
    const { on } = compilePair(steadyRecipe({ secondPlacement: true }))
    const summary = on.summary.specializations.directColorSinks
    // Scene 0 is a two-placement stack (capture); scene 1's lone second member stays direct.
    expect(summary?.members).toEqual([{ id: 'second', sinks: ['rgb'], scenes: [1] }])
  })

  it('stays byte-neutral when every scene is disqualified', () => {
    expectByteNeutral(steadyRecipe({
      sources: [HSV_SOURCE, RGB_SOURCE],
      placementExtras: { effects: [{ id: 'poster', kind: 'posterize', levels: 6, amount: 1 }] },
      clipExtras: { effects: [{ id: 'poster', kind: 'posterize', levels: 6, amount: 1 }] },
      secondClipExtras: { effects: [{ id: 'poster2', kind: 'posterize', levels: 6, amount: 1 }] },
      secondPlacementExtras: { effects: [{ id: 'poster2', kind: 'posterize', levels: 6, amount: 1 }] },
    }))
  })

  it('keeps every member on the capture path when Trails is active', () => {
    expectByteNeutral(steadyRecipe({ outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.8 }] }))
  })

  it('keeps freeze-at-entry members on the capture path', () => {
    expectByteNeutral(steadyRecipe({ clipExtras: { evaluationPolicy: 'freeze-at-entry' } }))
  })

  it('keeps scenes adjacent to snapshot-live crossfades on the capture path', () => {
    const recipe = steadyRecipe({
      transitionOut: { kind: 'crossfade', durationMs: 2_000, crossfadePolicy: 'snapshot-live' },
    })
    const { on } = compilePair(recipe)
    // Both scenes touch the snapshot transition, so nothing is eligible.
    expect(on.summary.specializations.directColorSinks?.members ?? []).toEqual([])
  })

  it('replays with identical checksums in Fast and Precise across steady, transition, and boundary frames', () => {
    const recipe = steadyRecipe()
    const { on, off } = compilePair(recipe)
    const times = [0, 5_000, 10_500, 11_000, 12_100, 16_000, 21_500]
    const checksums = (artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') => {
      const replay = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: 1,
      }, {
        mapPoints: Array.from({ length: 64 }, (_, index) => ({ sample: [index / 63] })),
        randomSeed: 557,
        fidelity,
      })
      return times.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
    }
    // Fast mode is exact: the shim's float hsv and the generated conversion
    // are the same formula up to commutation.
    expect(checksums(on, 'fast')).toEqual(checksums(off, 'fast'))
    // Precise mode is the parity referee for the NAMED approximation: steady
    // HSV frames route through the shim's fixed-point native hsv while the
    // capture build quantizes through the generated conversion, mirroring the
    // measured on-device divergence (~0.1 of a 16.16 LSB at boundaries, see
    // issue557-continuity-report.json). Transition frames and RGB-member
    // steady frames never change conversion and must stay bit-equal.
    const preciseOn = checksums(on, 'fidelity')
    const preciseOff = checksums(off, 'fidelity')
    // times: [0, 5_000] HSV steady (approximation window), [10_500, 11_000]
    // crossfade transition, [12_100, 16_000, 21_500] RGB-member steady.
    for (const exactIndex of [2, 3, 4, 5, 6]) {
      expect(preciseOn[exactIndex]).toBe(preciseOff[exactIndex])
    }
  })
})

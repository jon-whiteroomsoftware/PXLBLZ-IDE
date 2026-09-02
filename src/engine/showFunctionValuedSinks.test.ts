// #572 recorded negative: rebinding direct color sinks through
// function-valued scalars adds one user-call hop (~1.9-3.4 us, #556) per
// sink call, exceeding the ~1.5 us #557 flag branch it removes. Measured
// -3.82/-3.92/-3.91% median FPS on the hsv-steady envelope at 256/1,000/
// 2,000 px (+116 bytecode bytes). The flag build stays the production
// default; `functionValuedSinkRebinding: true` reproduces the measured
// counterfactual and this suite pins its emission and exactness.
import { createFastReplayRuntime } from './fastReplay'
import { compileShow, type ShowRecipe } from './showCompiler'

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
const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 63 }] }

function steadyRecipe(): ShowRecipe {
  return {
    clips: [
      { id: 'first', source: HSV_SOURCE },
      { id: 'second', source: RGB_SOURCE },
    ],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 10_000,
          placements: [{ placementId: 'p0', zoneName: 'stage', clipId: 'first' }],
          transitionOut: { kind: 'crossfade', durationMs: 2_000 },
        },
        {
          holdMs: 10_000,
          placements: [{ placementId: 'p1', zoneName: 'stage', clipId: 'second' }],
        },
      ],
    },
    loopDurationMs: 22_000,
  }
}

function checksums(recipe: ShowRecipe, options: Record<string, boolean>, fidelity: 'fast' | 'fidelity') {
  const artifact = compileShow(recipe, {}, options)
  const replay = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 1,
  }, {
    mapPoints: Array.from({ length: 64 }, (_, index) => ({ sample: [index / 63] })),
    randomSeed: 572,
    fidelity,
  })
  return [0, 2_500, 9_500, 11_000, 11_900, 15_000, 21_500]
    .map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

describe('function-valued direct color sinks (#572, recorded negative)', () => {
  it('defaults to the #557 flag-branch build', () => {
    const artifact = compileShow(steadyRecipe(), {})
    expect(artifact.expandedCode).toContain('var __pxlblz_show_direct = 0')
    expect(artifact.expandedCode).not.toContain('_hsv_direct')
    expect(artifact.summary.specializations.directColorSinks?.representation).toBe('flag-branch')
  })

  it('reproduces the measured rebound build under the counterfactual option', () => {
    // The #572 rebound shape is asserted on the wrapper form: production
    // folds pass-through wrappers into their call sites (#929), which would
    // hide the rebinding sequence this recorded negative documents.
    const artifact = compileShow(steadyRecipe(), {}, { functionValuedSinkRebinding: true, generatedWrapperInlining: false })
    const code = artifact.expandedCode
    expect(code).not.toContain('__pxlblz_show_direct')
    // Capture/direct pairs plus the function-valued binding.
    expect(code).toContain('function __pxlblz_show_c0_hsv_capture(h, s, v)')
    expect(code).toContain('function __pxlblz_show_c0_hsv_direct(h, s, v) { hsv(h, s, v) }')
    expect(code).toContain('var __pxlblz_show_c0_hsv = __pxlblz_show_c0_hsv_capture')
    expect(code).toContain('function __pxlblz_show_c1_rgb_capture(r, g, b)')
    expect(code).toContain('function __pxlblz_show_c1_rgb_direct(r, g, b) { rgb(r, g, b) }')
    expect(code).toContain('var __pxlblz_show_c1_rgb = __pxlblz_show_c1_rgb_capture')
    // The steady arms rebind around the capture call and restore afterwards.
    expect(code).toMatch(/__pxlblz_show_c0_hsv = __pxlblz_show_c0_hsv_direct[\s\S]{0,200}?__pxlblz_show_c0_renderCapture\([\s\S]{0,200}?__pxlblz_show_c0_hsv = __pxlblz_show_c0_hsv_capture/)
    const summary = artifact.summary.specializations.directColorSinks
    expect(summary?.enabled).toBe(true)
    expect(summary?.representation).toBe('function-valued')
    expect(summary?.members.map((member) => member.id).sort()).toEqual(['first', 'second'])
  })

  it('replays the rebound build with checksums identical to the flag build in both fidelities', () => {
    const recipe = steadyRecipe()
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const rebound = checksums(recipe, { functionValuedSinkRebinding: true }, fidelity)
      expect(rebound).toEqual(checksums(recipe, {}, fidelity))
      expect(new Set(rebound).size).toBeGreaterThan(1)
    }
  })
})

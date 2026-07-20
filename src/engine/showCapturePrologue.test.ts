// #562: assignment-count reduction in generated capture prologues. Scalar
// reads are free on this VM; every scalar write costs ~1.47 us. Dynamic
// mirror becomes a branch-free per-frame coefficient form, and single-use
// temps inline into their consumers.
import {
  compileShow,
  shouldMaterialize,
  type ShowRecipe,
} from './showCompiler'

const SOURCE = 'export function render(index) { hsv(index / pixelCount, 1, 0.8) }'
const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 63 }] }

function mirrorRecipe(overrides: {
  placementExtras?: Record<string, unknown>
  clipEffects?: Array<Record<string, unknown>>
  secondMirrorPlacement?: boolean
} = {}): ShowRecipe {
  return {
    clips: [
      { id: 'a', source: SOURCE, ...(overrides.clipEffects ? { effects: overrides.clipEffects as never } : {}) },
      { id: 'b', source: SOURCE },
    ],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 8_000,
          placements: [
            { placementId: 'p0', zoneName: 'stage', clipId: 'a', mirror: true, ...(overrides.placementExtras ?? {}) },
            ...(overrides.secondMirrorPlacement
              ? [{ placementId: 'p0b', zoneName: 'stage', clipId: 'a', stackOrder: 1, opacity: 0.5 }]
              : []),
          ],
          transitionOut: { kind: 'crossfade', durationMs: 2_000 },
        },
        { holdMs: 8_000, placements: [{ placementId: 'p1', zoneName: 'stage', clipId: 'b' }] },
      ],
    },
    loopDurationMs: 18_000,
  }
}

function captureBody(expandedCode: string, name: string): string {
  const start = expandedCode.indexOf(`function ${name}(`)
  expect(start, name).toBeGreaterThanOrEqual(0)
  const end = expandedCode.indexOf('\n}', start)
  return expandedCode.slice(start, end)
}

describe('capture prologue assignment reduction (#562)', () => {
  describe('shouldMaterialize', () => {
    it('never materializes single-use values', () => {
      expect(shouldMaterialize(1, 10)).toBe(false)
      expect(shouldMaterialize(0, 10)).toBe(false)
    })

    it('materializes only when recomputation across extra uses beats one scalar write', () => {
      // Two uses of a multiply-class value: recompute (0.81) < write (1.47).
      expect(shouldMaterialize(2, 0.81)).toBe(false)
      // Two uses of a heavier value: recompute (2.0) > write (1.47).
      expect(shouldMaterialize(2, 2.0)).toBe(true)
      // Three uses of a multiply-class value: 2 x 0.81 > 1.47.
      expect(shouldMaterialize(3, 0.81)).toBe(true)
    })
  })

  it('replaces the dynamic-mirror branch with the per-frame coefficient form (1D)', () => {
    const artifact = compileShow(mirrorRecipe(), {})
    const body = captureBody(artifact.expandedCode, '__pxlblz_show_c0_renderCapture')
    expect(body).not.toContain('if (__pxlblz_show_c0_adapt_mirror >= 0.5)')
    expect(body).not.toContain('var mappedIndex')
    expect(body).toContain('__pxlblz_show_c0_mir_base_i + __pxlblz_show_c0_mir_sign * index')
    expect(artifact.expandedCode).toContain('var __pxlblz_show_c0_mir_base_i = ')
    expect(artifact.expandedCode).toContain('var __pxlblz_show_c0_mir_sign = ')
  })

  it('writes mirror coefficients wherever adapt_mirror or the member pixel count changes', () => {
    const artifact = compileShow(mirrorRecipe(), {})
    const code = artifact.expandedCode
    // The scheduler's per-frame setup carries literal coefficients for the
    // mirrored placement (64-pixel zone: base 63, sign -1).
    expect(code).toMatch(/__pxlblz_show_c0_mir_base_i = 63/)
    expect(code).toMatch(/__pxlblz_show_c0_mir_sign = -1/)
  })

  it('keeps the branch form for members without uniform binding', () => {
    const artifact = compileShow(mirrorRecipe({ secondMirrorPlacement: true }), {})
    const body = captureBody(artifact.expandedCode, '__pxlblz_show_c0_renderCapture')
    expect(body).toContain('var mappedIndex = index')
    expect(body).toContain('if (__pxlblz_show_c0_adapt_mirror >= 0.5)')
  })

  it('restores the previous emission under the benchmark counterfactual option', () => {
    const artifact = compileShow(mirrorRecipe(), {}, { capturePrologueSimplification: false })
    const body = captureBody(artifact.expandedCode, '__pxlblz_show_c0_renderCapture')
    expect(body).toContain('var mappedIndex = index')
    expect(artifact.expandedCode).not.toContain('_mir_base_i')
  })

  it('inlines the single-use effect coordinate temps around ordering barriers', () => {
    const artifact = compileShow(mirrorRecipe({
      clipEffects: [{ id: 'sc', kind: 'scale', x: 0.8, y: 0.9 }],
      placementExtras: { effects: [{ id: 'sc', kind: 'scale', x: 0.8, y: 0.9 }] },
    }), {})
    const body = captureBody(artifact.expandedCode, '__pxlblz_show_c0_renderCapture')
    // effectPosition feeds two affine expressions: materialized (division-class recompute).
    expect(body).toContain('var effectPosition = ')
    // The final index write inlines into the renderer call (single consumer).
    expect(body).not.toMatch(/mappedIndex = min\(/)
    // The out-of-bounds guard and mutable effect coordinates stay materialized.
    expect(body).toContain('var effectInside = ')
    expect(body).toContain('var effectX = ')
  })

  it('emits no coefficient globals for members without dynamic mirror', () => {
    const recipe = mirrorRecipe()
    recipe.routedSceneSequence!.scenes[0].placements[0].mirror = undefined as never
    const artifact = compileShow(recipe, {})
    expect(artifact.expandedCode).not.toContain('_mir_base_i')
  })
})

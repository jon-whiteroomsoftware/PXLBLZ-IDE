// #565: bounded, exact call-site inlining of tiny pure member helpers.
// #532 priced user-function calls at 1.899-3.449 us of pure boundary cost;
// a single-return pure helper called per pixel multiplies that tax. The
// transform substitutes argument expressions for parameters in a
// parenthesized copy of the return expression - arithmetic unchanged.
import { DEMOS } from '../pixelblaze/stock/patterns'
import { LIBRARIES } from '../pixelblaze/libs'
import { createFastReplayRuntime } from './fastReplay'
import { compileShow, type ShowRecipe } from './showCompiler'
import { inlineShowMemberHelpers } from './showHelperInlining'

describe('tiny pure helper inlining (#565)', () => {
  it('inlines identifier-argument calls and removes the dead helper', () => {
    const source = `function inside(v, lo, hi) {
  return v >= lo && v <= hi ? 1 : 0
}
export function render(index) {
  var x = index / pixelCount
  rgb(inside(x, 0.2, 0.8), 0, 0)
}
`
    const result = inlineShowMemberHelpers(source)
    expect(result.source).toContain('rgb((x >= 0.2 && x <= 0.8 ? 1 : 0), 0, 0)')
    expect(result.source).not.toContain('function inside')
    expect(result.inlinedCallCount).toBe(1)
    expect(result.removedHelperCount).toBe(1)
  })

  it('parenthesizes substituted arguments to preserve precedence', () => {
    const source = `function scale(x) {
  return x * 0.5
}
export function render(index) {
  rgb(scale(index + 1), 0, 0)
}
`
    const result = inlineShowMemberHelpers(source)
    expect(result.source).toContain('rgb(((index + 1) * 0.5), 0, 0)')
  })

  it('refuses a non-trivial argument for a parameter used more than once', () => {
    const source = `function inside(v, lo, hi) {
  return v >= lo && v <= hi ? 1 : 0
}
export function render(index) {
  rgb(inside(abs(index - 1), 0, 1), inside(index, 0, 1), 0)
}
`
    const result = inlineShowMemberHelpers(source)
    // The abs() argument would be duplicated across v's two uses: refused.
    expect(result.source).toContain('inside(abs(index - 1), 0, 1)')
    // The identifier-argument site still inlines; the helper stays declared.
    expect(result.source).toContain('(index >= 0 && index <= 1 ? 1 : 0)')
    expect(result.source).toContain('function inside')
    expect(result.inlinedCallCount).toBe(1)
    expect(result.removedHelperCount).toBe(0)
  })

  it('refuses entry points, exported helpers, multi-statement bodies, and value references', () => {
    const source = `export function exported(x) {
  return x + 1
}
function multi(x) {
  var y = x + 1
  return y
}
function valueRef(x) {
  return x * 2
}
function stateful(x) {
  return x + (state = x)
}
var state = 0
var fn = valueRef
export function render(index) {
  rgb(exported(index), multi(index), valueRef(index) + stateful(index))
}
`
    const result = inlineShowMemberHelpers(source)
    expect(result.inlinedCallCount).toBe(0)
    expect(result.source).toBe(source)
  })

  it('refuses call sites whose arguments call impure functions', () => {
    const source = `function double(x) {
  return x * 2
}
function impure() {
  state = state + 1
  return state
}
var state = 0
export function render(index) {
  rgb(double(impure()), double(index), 0)
}
`
    const result = inlineShowMemberHelpers(source)
    expect(result.source).toContain('double(impure())')
    expect(result.source).toContain('(index * 2)')
    expect(result.inlinedCallCount).toBe(1)
  })

  it('inlines helper-calling-helper chains within the depth bound', () => {
    const source = `function half(x) {
  return x * 0.5
}
function quarter(x) {
  return half(x) * 0.5
}
export function render(index) {
  rgb(quarter(index), 0, 0)
}
`
    const result = inlineShowMemberHelpers(source)
    expect(result.source).toContain('((index * 0.5) * 0.5)')
    expect(result.source).not.toContain('function half')
    expect(result.source).not.toContain('function quarter')
    expect(result.inlinedCallCount).toBe(2)
    expect(result.removedHelperCount).toBe(2)
  })

  it('stops at the per-member growth allowance in source order', () => {
    const longBody = 'v + 0.123456789 * 0.987654321 + 0.111111111 * 0.222222222 + 0.333333333'
    const calls = Array.from({ length: 40 }, (_, index) => `big(l${index})`).join(' + ')
    const locals = Array.from({ length: 40 }, (_, index) => `  var l${index} = index + ${index}`).join('\n')
    const source = `function big(v) {
  return ${longBody}
}
export function render(index) {
${locals}
  rgb(${calls}, 0, 0)
}
`
    const result = inlineShowMemberHelpers(source, { growthAllowanceBytes: 256 })
    expect(result.inlinedCallCount).toBeGreaterThan(0)
    expect(result.inlinedCallCount).toBeLessThan(40)
    expect(result.addedSourceBytes).toBeLessThanOrEqual(256)
    // Later call sites keep the helper, so its declaration must remain.
    expect(result.source).toContain('function big')
  })

  it('returns the source unchanged when nothing qualifies', () => {
    const source = `export function render(index) {
  rgb(index / pixelCount, 0, 0)
}
`
    const result = inlineShowMemberHelpers(source)
    expect(result.source).toBe(source)
    expect(result.inlinedCallCount).toBe(0)
    expect(result.addedSourceBytes).toBe(0)
  })
})

describe('helper inlining inside compileShow (#565)', () => {
  const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 63 }] }

  function redlineRecipe(): ShowRecipe {
    return {
      clips: [{ id: 'redline', source: DEMOS.RedlineMachine }],
      zones: [stageZone],
      routingLayouts: [{ id: 'stage', name: 'stage', zones: [stageZone] }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 10_000,
            placements: [{ placementId: 'p0', zoneName: 'stage', clipId: 'redline' }],
            transitionOut: { kind: 'cut' as const, durationMs: 0 },
          },
          {
            holdMs: 10_000,
            placements: [{ placementId: 'p1', zoneName: 'stage', clipId: 'redline' }],
          },
        ],
      },
      loopDurationMs: 20_000,
    }
  }

  it('inlines the Redline inside() call sites and reports them in the summary', () => {
    const artifact = compileShow(redlineRecipe(), LIBRARIES)
    const summary = artifact.summary.specializations.helperInlining
    expect(summary).toHaveLength(1)
    expect(summary[0].clipId).toBe('redline')
    expect(summary[0].inlinedCallCount).toBeGreaterThanOrEqual(8)
    // The two abs(...) argument sites for the twice-used parameter remain.
    expect(artifact.expandedCode).toContain('__pxlblz_show_c0_inside(')
  })

  it('restores the previous emission under the benchmark counterfactual option', () => {
    const artifact = compileShow(redlineRecipe(), LIBRARIES, { helperCallInlining: false })
    expect(artifact.summary.specializations.helperInlining[0]).toMatchObject({
      inlinedCallCount: 0,
      removedHelperCount: 0,
      addedSourceBytes: 0,
    })
  })

  it('replays with identical checksums to the call build in both fidelities', () => {
    const recipe = redlineRecipe()
    const sums = (options: Record<string, boolean>, fidelity: 'fast' | 'fidelity') => {
      const artifact = compileShow(recipe, LIBRARIES, options)
      const replay = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: 1,
      }, {
        mapPoints: Array.from({ length: 64 }, (_, index) => ({ sample: [index / 63] })),
        randomSeed: 565,
        fidelity,
      })
      return [0, 2_500, 5_000, 9_500].map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
    }
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const inlined = sums({}, fidelity)
      expect(inlined).toEqual(sums({ helperCallInlining: false }, fidelity))
      expect(new Set(inlined).size).toBeGreaterThan(1)
    }
  })
})

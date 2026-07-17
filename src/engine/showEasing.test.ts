import {
  SHOW_EASING_OPTIONS,
  applyShowEasing,
  emitShowEasingExpression,
  normalizeShowEasing,
  showEasingFromOptionId,
  showEasingOptionId,
  showCubicBezierRuntimeSource,
  validateShowEasing,
} from './showEasing'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'

describe('show easing', () => {
  it.each([
    ['linear', [0, 0.25, 0.5, 0.75, 1]],
    ['ease-in', [0, 0.0625, 0.25, 0.5625, 1]],
    ['ease-out', [0, 0.4375, 0.75, 0.9375, 1]],
    ['ease-in-out', [0, 0.125, 0.5, 0.875, 1]],
  ] as const)('samples %s deterministically', (easing, expected) => {
    expect([0, 0.25, 0.5, 0.75, 1].map((value) => applyShowEasing(easing, value)))
      .toEqual(expected)
  })

  it('clamps progress before easing', () => {
    expect(applyShowEasing('ease-in-out', -1)).toBe(0)
    expect(applyShowEasing('ease-in-out', 2)).toBe(1)
  })

  it('emits an expression with the same sampled values as the editor', () => {
    for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      const expression = emitShowEasingExpression(easing, 't')
      const evaluate = new Function('t', `return ${expression}`) as (t: number) => number
      for (const progress of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
        expect(evaluate(progress)).toBeCloseTo(applyShowEasing(easing, progress), 12)
      }
    }
  })

  it('evaluates CSS cubic Bezier by inverting x before sampling y (#455)', () => {
    const easing = { curve: 'cubic-bezier' as const, x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }
    expect(applyShowEasing(easing, 0)).toBe(0)
    expect(applyShowEasing(easing, 0.5)).toBeCloseTo(0.8024, 3)
    expect(applyShowEasing(easing, 1)).toBe(1)
  })

  it('returns precise cubic Bezier validation issues without restricting CSS y overshoot (#455)', () => {
    expect(validateShowEasing({ curve: 'cubic-bezier', x1: -0.1, y1: 2, x2: 1.1, y2: -2 })).toEqual({
      valid: false,
      issues: [
        expect.objectContaining({ path: 'x1', code: 'out-of-range' }),
        expect.objectContaining({ path: 'x2', code: 'out-of-range' }),
      ],
    })
    expect(validateShowEasing({ curve: 'cubic-bezier', x1: 0.2, y1: 2, x2: 0.8, y2: -2 })).toEqual({ valid: true, issues: [] })
  })

  it('evaluates structured Steps, Hold, and Back semantics at boundaries (#455)', () => {
    expect([0, 0.24, 0.25, 0.99, 1].map((t) => applyShowEasing({ curve: 'steps', steps: 4, position: 'end' }, t)))
      .toEqual([0, 0, 0.25, 0.75, 1])
    expect([0, 0.24, 0.25, 1].map((t) => applyShowEasing({ curve: 'steps', steps: 4, position: 'start' }, t)))
      .toEqual([0.25, 0.25, 0.5, 1])
    expect([0.49, 0.5].map((t) => applyShowEasing({ curve: 'hold', at: 0.5 }, t))).toEqual([0, 1])
    expect(applyShowEasing({ curve: 'back', direction: 'in', overshoot: 1.70158 }, 0.25)).toBeLessThan(0)
    expect(applyShowEasing({ curve: 'back', direction: 'out', overshoot: 1.70158 }, 0.75)).toBeGreaterThan(1)
  })

  it('validates structured discrete and overshoot parameters by field (#455)', () => {
    expect(validateShowEasing({ curve: 'steps', steps: 0.5, position: 'middle' })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'steps', code: 'not-integer' }),
        expect.objectContaining({ path: 'position', code: 'invalid-option' }),
      ]),
    })
    expect(validateShowEasing({ curve: 'hold', at: 2 })).toMatchObject({ issues: [expect.objectContaining({ path: 'at' })] })
    expect(validateShowEasing({ curve: 'back', direction: 'in-out', overshoot: -1 })).toMatchObject({ issues: [expect.objectContaining({ path: 'overshoot' })] })
  })

  it('round-trips named and custom curves without visual drift (#455)', () => {
    expect(showEasingFromOptionId('css-ease')).toEqual({ curve: 'cubic-bezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 })
    expect(showEasingOptionId(showEasingFromOptionId('back-out'))).toBe('back-out')
    const custom = { curve: 'cubic-bezier' as const, x1: 0.13, y1: -0.5, x2: 0.87, y2: 1.5 }
    expect(normalizeShowEasing(JSON.parse(JSON.stringify(custom)))).toEqual(custom)
    expect(showEasingOptionId(custom)).toBe('custom')
  })

  it('publishes deterministic preset samples and parameter constraints (#455)', () => {
    const cssEase = SHOW_EASING_OPTIONS.find((option) => option.id === 'css-ease')!
    expect(cssEase.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'x1', min: 0, max: 1 }),
      expect.objectContaining({ id: 'y1' }),
    ]))
    expect(cssEase.samples).toEqual([0, 0.25, 0.5, 0.75, 1].map((progress) => ({
      progress,
      value: applyShowEasing(cssEase.easing, progress),
    })))
  })

  it('hoists cubic Bezier inversion into frame-level generated evaluation (#455)', () => {
    const easing = { curve: 'cubic-bezier' as const, x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }
    const artifact = compileShow({
      clips: [{ id: 'clip', source: 'export function render(index) { rgb(1, 0, 0) }' }],
      adaptationRamp: {
        startMs: 1000, durationMs: 1000,
        from: { brightness: 0 }, to: { brightness: 1 }, easing,
      },
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: [{ sample: [0.5] }], randomSeed: 455 })

    expect(runtime.advanceTo(1500, { stepMs: 50 }).pixels[0][0]).toBeCloseTo(applyShowEasing(easing, 0.5), 3)
    expect(artifact.expandedCode.match(/function __pxlblz_show_cubicBezier\(/g)).toHaveLength(1)
    expect(artifact.expandedCode.indexOf('__pxlblz_show_cubicBezier(')).toBeLessThan(artifact.expandedCode.indexOf('export function beforeRender'))
    expect(artifact.summary.cost.code.artifactBytes).toBe(artifact.summary.artifactBytes)

    const linear = compileShow({
      clips: [{ id: 'clip', source: 'export function render(index) { rgb(1, 0, 0) }' }],
      adaptationRamp: { startMs: 1000, durationMs: 1000, from: { brightness: 0 }, to: { brightness: 1 } },
    }, {})
    expect(linear.expandedCode).not.toContain('function __pxlblz_show_cubicBezier(')
    expect(artifact.summary.artifactBytes).toBeGreaterThan(linear.summary.artifactBytes)
  })

  it('keeps every named pure and generated easing sample equivalent (#455)', () => {
    for (const option of SHOW_EASING_OPTIONS) {
      const expression = emitShowEasingExpression(option.easing, 't')
      const evaluate = new Function(
        't', 'floor', 'min', 'cos', 'PI',
        `${showCubicBezierRuntimeSource()}\nreturn ${expression}`,
      ) as (t: number, floor: typeof Math.floor, min: typeof Math.min, cos: typeof Math.cos, pi: number) => number
      for (const progress of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
        expect(evaluate(progress, Math.floor, Math.min, Math.cos, Math.PI))
          .toBeCloseTo(applyShowEasing(option.easing, progress), option.easing.curve === 'cubic-bezier' ? 3 : 12)
      }
    }
  })
})

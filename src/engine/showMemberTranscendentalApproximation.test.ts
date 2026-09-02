import * as acorn from 'acorn'
import { describe, expect, it } from 'vitest'
import { approximateShowMemberTranscendentals, intervalBound, quadraticFitCoefficient } from './showMemberTranscendentalApproximation'

const render = (body: string) => `export function render2D(index, x, y) {\n${body}\n}\n`

describe('approximate transcendentals (#934)', () => {
  it('replaces exp of a provably non-positive argument with the reciprocal quintic on a clamped temp', () => {
    const out = approximateShowMemberTranscendentals(render('  var dist = max(abs(x - 0.5), 0.02)\n  var a = exp(-dist * 3)\n  rgb(a, a, a)'))
    expect(out.rewritten).toEqual({ exp: 1, pow: 0, tanh: 0 })
    expect(out.source).toContain('  var __pxlblz_tx_0 = clamp(-(-dist * 3), 0, 8)\n  var a = (1 / (1 + __pxlblz_tx_0 * (1 + __pxlblz_tx_0 * (0.5 + __pxlblz_tx_0 * (0.16666667 + __pxlblz_tx_0 * (0.041666667 + __pxlblz_tx_0 * 0.0083333333))))))')
    expect(out.skipped).toEqual([])
  })

  it('declines exp whose argument could be positive, is impure, or has no statement context', () => {
    const out = approximateShowMemberTranscendentals(`function noisy() { return 1 }\n${render('  var a = exp(x - 0.5)\n  var b = exp(-noisy())\n  if (x > 0.5) rgb(exp(-x), 0, 0)\n  rgb(a, b, 0)')}`)
    expect(out.rewritten.exp).toBe(0)
    expect(out.skipped.map((entry) => entry.reason)).toEqual(['unproven-domain', 'impure-argument', 'no-statement-context'])
  })

  it('fits a non-integer pow on a proven [0, 1] base with the closed-form quadratic and leaves integer or unproven ones', () => {
    const out = approximateShowMemberTranscendentals(render('  var density = clamp((x - 0.2) * 1.7, 0, 1)\n  var d = pow(density, 1.3)\n  var e = pow(wave(x * 3), 2.5) + pow(x - 1, 1.5) + pow(x, 2) + pow(x, y)\n  rgb(d, e, 0)'))
    const a = quadraticFitCoefficient(1.3)
    expect(a).toBeCloseTo(0.614, 2)
    expect(out.source).toContain(`var d = (density * (${Number(a.toFixed(6))} + ${Number((1 - a).toFixed(6))} * density))`)
    expect(out.source).toContain('var __pxlblz_tx_0 = wave(x * 3)\n  var e = (__pxlblz_tx_0 * (')
    expect(out.rewritten.pow).toBe(2)
    expect(out.skipped.map((entry) => [entry.kind, entry.reason])).toEqual([
      ['pow', 'unproven-domain'],       // x - 1 is negative
      ['pow', 'exponent-out-of-range'], // integer exponent belongs to #933
      ['pow', 'non-literal-exponent'],
    ])
  })

  it('rewrites the library tanh helper body into the rational form and leaves other functions alone', () => {
    const lib = `function tanh(x) {\n  var e = exp(2 * clamp(x, -5, 5));\n  return (e - 1) / (e + 1);\n}\nfunction other(x) {\n  var e = exp(2 * clamp(x, -5, 5));\n  return (e - 1) / (e + 2);\n}\n`
    const out = approximateShowMemberTranscendentals(`${lib}${render('  var v = tanh(x * 4 - 2) + other(x)\n  rgb(v, v, v)')}`)
    expect(out.rewritten.tanh).toBe(1)
    expect(out.source).toContain('function tanh(x) {\n  x = clamp(x, -3, 3)\n  var __pxlblz_tx_x2 = x * x\n  return x * (27 + __pxlblz_tx_x2) / (27 + 9 * __pxlblz_tx_x2)\n}')
    expect(out.source).toContain('return (e - 1) / (e + 2)')
    // The exp inside `other` has an argument in [-10, 10]: unproven sign.
    expect(out.skipped).toEqual([{ line: 6, kind: 'exp', reason: 'unproven-domain' }])
  })

  it('honours shadowed built-ins, authored transforms, and the per-kind switches', () => {
    const shadowed = approximateShowMemberTranscendentals(`function exp(v) { return v }\n${render('  var a = exp(-x)\n  rgb(a, a, a)')}`)
    expect(shadowed.skipped).toEqual([{ line: 3, kind: 'exp', reason: 'shadowed-builtin' }])
    const transformed = approximateShowMemberTranscendentals(`export function beforeRender(delta) { translate(0.5, 0) }\n${render('  var a = exp(-x)\n  rgb(a, a, a)')}`)
    expect(transformed.skipped).toEqual([{ line: 3, kind: 'exp', reason: 'unproven-domain' }])
    const off = approximateShowMemberTranscendentals(render('  var a = exp(-x)\n  var d = pow(x, 1.3)\n  rgb(a, d, 0)'), { exp: false, pow: false })
    expect(off.rewritten).toEqual({ exp: 0, pow: 0, tanh: 0 })
    expect(off.source).toContain('exp(-x)')
  })

  it('interval analysis: arithmetic, abs, clamp, min/max, hypot, comparisons, and unbounded names', () => {
    const scope = { coordinateParams: new Set(['x', 'y']), singleAssignments: new Map() }
    const parse = (expression: string) => {
      const ast = acorn.parse(`(${expression})`, { ecmaVersion: 2020 }) as unknown as { body: Array<{ expression: unknown }> }
      return ast.body[0].expression as Record<string, unknown>
    }
    expect(intervalBound(parse('x * 2 - 1'), scope)).toEqual([-1, 1])
    expect(intervalBound(parse('abs(x - 0.5) * 4'), scope)).toEqual([0, 2])
    expect(intervalBound(parse('clamp(x * 9, -3, 3)'), scope)).toEqual([0, 3])
    expect(intervalBound(parse('max(abs(x), 0.02)'), scope)).toEqual([0.02, 1])
    expect(intervalBound(parse('-hypot(x, y) * 3'), scope)?.[1]).toBeCloseTo(0, 12)
    expect(intervalBound(parse('x > 0.5'), scope)).toEqual([0, 1])
    expect(intervalBound(parse('q * 2'), scope)).toBeNull()
    expect(intervalBound(parse('x / 0'), scope)).toBeNull()
  })

  it('proves domains through abs/sqrt of unknowns and through a straight-line earlier assignment in the same block', () => {
    const phantom = approximateShowMemberTranscendentals(`var ifsD = 0\nfunction map() { ifsD = ifsD * 0.5 - 1 }\n${render('  map()\n  var dist = max(abs(ifsD), 0.02)\n  var a = exp(-dist * 3)\n  rgb(a, a, a)')}`)
    expect(phantom.rewritten.exp).toBe(1)
    const plasma = approximateShowMemberTranscendentals(render('  var density = x * 2\n  density = clamp((density - 0.2) * 1.7, 0, 1)\n  density = pow(density, 1.3)\n  rgb(density, 0, 0)'))
    expect(plasma.rewritten.pow).toBe(1)
    // A branch or a user call between the fact and the site drops it.
    const broken = approximateShowMemberTranscendentals(`function tweak() { return 1 }\n${render('  var density = clamp(x, 0, 1)\n  tweak()\n  density = pow(density, 1.3)\n  var v = clamp(x, 0, 1)\n  if (x > 0.5) v = 5\n  v = pow(v, 1.3)\n  rgb(density, v, 0)')}`)
    expect(broken.rewritten.pow).toBe(0)
    expect(broken.skipped.map((entry) => entry.reason)).toEqual(['unproven-domain', 'unproven-domain'])
  })
})

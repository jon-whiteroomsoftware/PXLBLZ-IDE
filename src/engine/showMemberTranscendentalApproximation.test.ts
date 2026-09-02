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
    const out = approximateShowMemberTranscendentals(render('  var density = clamp((x - 0.2) * 1.7, 0, 1)\n  var d = pow(density, 1.3)\n  var e = pow(wave(x * 3), 1.5) + pow(x - 1, 1.5) + pow(x, 2) + pow(x, y)\n  rgb(d, e, 0)'))
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
    expect(out.source).toContain('function tanh(x) {\n  x = clamp(x, -3, 3)\n  var __pxlblz_tx_0 = x * x\n  return x * (27 + __pxlblz_tx_0) / (27 + 9 * __pxlblz_tx_0)\n}')
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

  it('declines a site nested inside another rewritten site instead of corrupting the source', () => {
    const out = approximateShowMemberTranscendentals(render('  var d = clamp(x, 0, 1)\n  var a = exp(-pow(d, 1.3))\n  rgb(a, a, a)'))
    expect(out.rewritten).toEqual({ exp: 1, pow: 0, tanh: 0 })
    expect(out.skipped).toEqual([{ line: 3, kind: 'pow', reason: 'nested-site' }])
    // The result must parse.
    expect(() => acorn.parse(out.source, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
    expect(out.source).toContain('clamp(-(-pow(d, 1.3)), 0, 8)')
  })

  it('never uses an initializer fact before its declaration has executed', () => {
    const out = approximateShowMemberTranscendentals(render('  var a = exp(b + 1)\n  var b = -1\n  var c = exp(b + 1)\n  rgb(a, c, 0)'))
    // Before the declaration, b reads as 0 on the device: exp(1) is not
    // provably non-positive. After it, b + 1 == 0 and the site qualifies.
    expect(out.rewritten.exp).toBe(1)
    expect(out.skipped).toEqual([{ line: 2, kind: 'exp', reason: 'unproven-domain' }])
    expect(out.source).toContain('var a = exp(b + 1)')
  })

  it('treats a shadowed built-in call as user code that invalidates straight-line facts', () => {
    const out = approximateShowMemberTranscendentals(`var density = 0\nfunction sin() { density = 300 }\n${render('  density = clamp(x, 0, 1)\n  sin()\n  var d = pow(density, 1.3)\n  rgb(d, 0, 0)')}`)
    expect(out.rewritten.pow).toBe(0)
    expect(out.skipped).toEqual([{ line: 6, kind: 'pow', reason: 'unproven-domain' }])
  })

  it('names the tanh temporary clear of the helper parameter', () => {
    const lib = 'function tanh(__pxlblz_tx_0) {\n  var e = exp(2 * clamp(__pxlblz_tx_0, -5, 5));\n  return (e - 1) / (e + 1);\n}\n'
    const out = approximateShowMemberTranscendentals(`${lib}${render('  var v = tanh(x)\n  rgb(v, v, v)')}`)
    expect(out.rewritten.tanh).toBe(1)
    expect(out.source).toContain('var __pxlblz_tx_1 = __pxlblz_tx_0 * __pxlblz_tx_0')
  })

  it('resolves straight-line facts at their statement, so a later write to an input cannot change them', () => {
    const out = approximateShowMemberTranscendentals(render('  var a = 2\n  var b = a\n  a = 0\n  var d = pow(b, 1.3)\n  rgb(d, 0, 0)'))
    // b is 2 at runtime; the pass must not read it as 0 through the later a = 0.
    expect(out.rewritten.pow).toBe(0)
    expect(out.skipped).toEqual([{ line: 5, kind: 'pow', reason: 'unproven-domain' }])
  })

  it('treats a named function expression\'s own name as a declaration and reversed clamp bounds as the upper bound', () => {
    const recursive = approximateShowMemberTranscendentals(`var f = function exp(v) { return v < 0 ? 7 : exp(-abs(v)) }\n${render('  var a = f(x)\n  rgb(a, a, a)')}`)
    expect(recursive.rewritten.exp).toBe(0)
    expect(recursive.skipped).toEqual([{ line: 1, kind: 'exp', reason: 'shadowed-builtin' }])
    const reversed = approximateShowMemberTranscendentals(render('  var b = clamp(x * 9, 1, -1)\n  var d = pow(b, 1.3)\n  rgb(d, 0, 0)'))
    // clamp(v, 1, -1) is -1 on the device: outside [0, 1].
    expect(reversed.rewritten.pow).toBe(0)
    expect(reversed.skipped).toEqual([{ line: 3, kind: 'pow', reason: 'unproven-domain' }])
  })

  it('keeps straight-line facts out of nested closures and out of chains through rewritable calls', () => {
    const closure = approximateShowMemberTranscendentals(render('  var a = x\n  var f = () => pow(a, 1.3)\n  a = 2\n  var d = f()\n  rgb(d, 0, 0)'))
    expect(closure.rewritten.pow).toBe(0)
    expect(closure.skipped).toEqual([{ line: 3, kind: 'pow', reason: 'unproven-domain' }])
    const chain = approximateShowMemberTranscendentals(render('  var a = x\n  var d = pow(a, 1.3)\n  var e = pow(d, 1.3)\n  rgb(d, e, 0)'))
    // d's fact would come through a call this pass rewrites: not recorded.
    expect(chain.rewritten.pow).toBe(1)
    expect(chain.skipped).toEqual([{ line: 4, kind: 'pow', reason: 'unproven-domain' }])
  })

  it('offers the quadratic only for 1 < k < 2, where its coefficient stays inside [0, 1]', () => {
    expect(quadraticFitCoefficient(0.1)).toBeGreaterThan(1)
    expect(quadraticFitCoefficient(1.3)).toBeLessThan(1)
    expect(quadraticFitCoefficient(1.3)).toBeGreaterThan(0)
    expect(quadraticFitCoefficient(2.5)).toBeLessThan(0)
    const out = approximateShowMemberTranscendentals(render('  var d = pow(x, 0.1) + pow(x, 0.5) + pow(x, 1.01) + pow(x, 2.5) + pow(x, 1.99)\n  rgb(d, 0, 0)'))
    expect(out.rewritten.pow).toBe(2)
    expect(out.skipped.map((entry) => entry.reason)).toEqual(['exponent-out-of-range', 'exponent-out-of-range', 'exponent-out-of-range'])
  })
})

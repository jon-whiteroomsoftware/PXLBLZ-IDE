import { describe, expect, it } from 'vitest'
import { lowerShowMemberPow } from './showMemberPowLowering'

const render = (body: string) => `export function render2D(index, x, y) {\n${body}\n}\n`

describe('member integer-pow lowering (#933)', () => {
  it('rewrites a plain-name base for k = 2, 3, 4 without a temp', () => {
    const out = lowerShowMemberPow(render('  var a = x * 2\n  var b = pow(a, 2) + pow(a, 3) + pow(a, 4) + pow(0.5, 3)\n  rgb(b, b, b)'))
    expect(out.source).toContain('(a * a) + (a * a * a) + (a * a * a * a) + (0.5 * 0.5 * 0.5)')
    expect(out.rewrittenSites).toBe(4)
    expect(out.hoistedTemps).toBe(0)
    expect(out.skipped).toEqual([])
  })

  it('declines non-integer, out-of-range, and 2.0-style-but-larger exponents with reasons', () => {
    const out = lowerShowMemberPow(render('  var v = pow(x, 1.3) + pow(x, 5) + pow(x, 1) + pow(x, -2) + pow(x, y)\n  rgb(v, v, v)'))
    expect(out.rewrittenSites).toBe(0)
    expect(out.skipped.map((entry) => entry.reason)).toEqual([
      'non-integer-exponent', 'exponent-out-of-range', 'exponent-out-of-range', 'non-integer-exponent', 'non-integer-exponent',
    ])
  })

  it('accepts a 2.0 literal as the integer 2 and keeps the render coordinate bound', () => {
    const out = lowerShowMemberPow(render('  var v = pow(x, 2.0)\n  rgb(v, v, v)'))
    expect(out.source).toContain('var v = (x * x)')
  })

  it('hoists a complex base into one temp for k = 3 and 4, and leaves k = 2 alone (measured loss)', () => {
    const out = lowerShowMemberPow(render('  var v = pow(abs(x - 0.5), 3)\n  v = v + pow(wave(y), 4)\n  var w = pow(abs(x), 2)\n  rgb(v, w, v)'))
    expect(out.source).toContain('  var __pxlblz_pow_0 = abs(x - 0.5)\n  var v = (__pxlblz_pow_0 * __pxlblz_pow_0 * __pxlblz_pow_0)')
    expect(out.source).toContain('  var __pxlblz_pow_1 = wave(y)\n  v = v + (__pxlblz_pow_1 * __pxlblz_pow_1 * __pxlblz_pow_1 * __pxlblz_pow_1)')
    expect(out.source).toContain('var w = pow(abs(x), 2)')
    expect(out.rewrittenSites).toBe(2)
    expect(out.hoistedTemps).toBe(2)
    expect(out.skipped).toEqual([{ line: 4, reason: 'k2-needs-temp' }])
  })

  it('gives every site in one statement its own temp, in source order, and hoists in a return', () => {
    const out = lowerShowMemberPow(`function f(a, b) {\n  return pow(sin(a) * 2, 3) + pow(cos(b), 3) + pow(abs(a), 3)\n}\nexport function render2D(index, x, y) {\n  var v = f(x, y)\n  rgb(v, v, v)\n}\n`)
    expect(out.source).toContain('  var __pxlblz_pow_0 = sin(a) * 2\n  var __pxlblz_pow_1 = cos(b)\n  return (__pxlblz_pow_0 * __pxlblz_pow_0 * __pxlblz_pow_0) + (__pxlblz_pow_1 * __pxlblz_pow_1 * __pxlblz_pow_1) + pow(abs(a), 3)')
    // Helper parameters are unbounded names, so abs(a) stays a pow call.
    expect(out.skipped).toEqual([{ line: 2, reason: 'unbounded-base' }])
  })

  it('bounds a single-assignment local or module constant through its initializer, never a written or exported name', () => {
    const out = lowerShowMemberPow(`var K = 3\nvar W = 2\nexport var E = 1\nexport function beforeRender(delta) { W = W + 1 }\n${render('  var a = x * 2\n  var b = a + K\n  var c = 1\n  c = c + x\n  var v = pow(a, 2) + pow(b, 3) + pow(K, 4) + pow(c, 2) + pow(W, 2) + pow(E, 2)\n  rgb(v, v, v)')}`)
    expect(out.source).toContain('var v = (a * a) + (b * b * b) + (K * K * K * K) + pow(c, 2) + pow(W, 2) + pow(E, 2)')
    expect(out.skipped.map((entry) => entry.reason)).toEqual(['unbounded-base', 'unbounded-base', 'unbounded-base'])
  })

  it('declines an unbounded base, an impure base, and a range that overflows 16.16', () => {
    const out = lowerShowMemberPow(`var g = 3\nfunction user() { g = g + 1; return 2 }\n${render('  var v = pow(g, 3) + pow(user(), 3) + pow(clamp(x, 0, 100), 3) + pow(x * 200, 2) + pow(index, 2)\n  rgb(v, v, v)')}`)
    expect(out.rewrittenSites).toBe(0)
    expect(out.skipped.map((entry) => entry.reason)).toEqual([
      'unbounded-base', 'impure-base', 'range-overflow', 'range-overflow', 'unbounded-base',
    ])
  })

  it('bounds the base through arithmetic, abs, clamp, mod, sqrt, min/max, hypot, and the conditional', () => {
    const body = [
      '  var a = pow(abs(x - 0.5) * 2 + 1, 3)',          // bound 2
      '  var b = pow(clamp(x * 9, -3, 3), 4)',           // bound 3, 81
      '  var c = pow(mod(x * 100, 7), 3)',               // bound 7, 343
      '  var d = pow(sqrt(x * 16), 4)',                  // bound 4, 256
      '  var e = pow(x > 0.5 ? x * 5 : x * 3, 3)',       // bound 5, 125
      '  var f = pow(hypot(x * 3, y * 4), 3)',           // bound 5
      '  var g = pow(max(x, y * 2), 4)',                 // bound 2
      '  var h = pow(floor(x * 30), 3)',                 // bound 31, 29791
      '  var i2 = pow(floor(x * 32), 3)',                // bound 33, 35937 > 32767
      '  rgb(a + b + c + d + e + f + g + h + i2, 0, 0)',
    ].join('\n')
    const out = lowerShowMemberPow(render(body))
    expect(out.rewrittenSites).toBe(8)
    expect(out.skipped).toEqual([{ line: 10, reason: 'range-overflow' }])
  })

  it('refuses to hoist where no statement can precede the site, and hoists before a compound assignment', () => {
    const out = lowerShowMemberPow(render('  if (x > 0.5) rgb(pow(abs(x), 3), 0, 0)\n  for (var i = 0; i < pow(abs(x), 3); i++) {}\n  var q = 0\n  q += pow(abs(x), 3)\n  var r = 1, s = pow(abs(x), 3)'))
    expect(out.rewrittenSites).toBe(1)
    expect(out.source).toContain('  var __pxlblz_pow_0 = abs(x)\n  q += (__pxlblz_pow_0 * __pxlblz_pow_0 * __pxlblz_pow_0)')
    expect(out.skipped.every((entry) => entry.reason === 'no-statement-context')).toBe(true)
    expect(out.skipped).toHaveLength(3)
  })

  it('never hoists above a write in the same statement', () => {
    const out = lowerShowMemberPow(`var t = 0\nfunction bump() { t = t + 1; return t }\n${render('  var v = bump() + pow(abs(x), 3)\n  var w = (t = 2) + pow(abs(x), 3)\n  rgb(v, w, 0)')}`)
    expect(out.rewrittenSites).toBe(0)
    expect(out.skipped.map((entry) => entry.reason)).toEqual(['no-statement-context', 'no-statement-context'])
  })

  it('keeps a temp name clear of existing identifiers and returns the source unchanged on a parse failure', () => {
    const out = lowerShowMemberPow(`var __pxlblz_pow_0 = 1\n${render('  var v = pow(abs(x), 3) + __pxlblz_pow_0\n  rgb(v, v, v)')}`)
    expect(out.source).toContain('var __pxlblz_pow_1 = abs(x)')
    const broken = lowerShowMemberPow('export function render2D(index, x, y) { var v = pow(x, 3 ')
    expect(broken.source).toBe('export function render2D(index, x, y) { var v = pow(x, 3 ')
    expect(broken.rewrittenSites).toBe(0)
  })

  it('leaves an authored pow alone, treats a shadowed built-in as impure and unbounded, and drops the coordinate bound under authored transforms', () => {
    const authored = lowerShowMemberPow(`function pow(b, k) { return b + k }\n${render('  var v = pow(x, 3)\n  rgb(v, v, v)')}`)
    expect(authored.rewrittenSites).toBe(0)
    expect(authored.skipped).toEqual([{ line: 3, reason: 'shadowed-builtin' }])
    const shadowedAbs = lowerShowMemberPow(`function abs(v) { return v * 1000 }\n${render('  var v = pow(abs(x), 3) + pow(wave(abs(x)), 3)\n  rgb(v, v, v)')}`)
    expect(shadowedAbs.rewrittenSites).toBe(0)
    expect(shadowedAbs.skipped.map((entry) => entry.reason)).toEqual(['impure-base', 'impure-base'])
    const transformed = lowerShowMemberPow(`export function beforeRender(delta) { translate(200, 0) }\n${render('  var v = pow(x, 2) + pow(wave(x), 3)\n  rgb(v, v, v)')}`)
    expect(transformed.source).toContain('pow(x, 2)')
    expect(transformed.source).toContain('var __pxlblz_pow_0 = wave(x)')
    expect(transformed.skipped).toEqual([{ line: 3, reason: 'unbounded-base' }])
  })

  it('drops the bound for a reassigned coordinate, an implicitly rebound built-in, and an aliased transform', () => {
    const reassigned = lowerShowMemberPow(render('  x = x * 300\n  var v = pow(x, 2) + pow(y, 2)\n  rgb(v, v, v)'))
    expect(reassigned.source).toContain('pow(x, 2) + (y * y)')
    expect(reassigned.skipped).toEqual([{ line: 3, reason: 'unbounded-base' }])
    const redeclared = lowerShowMemberPow(render('  var x = 200\n  var v = pow(x, 2) + pow(y, 2)\n  rgb(v, v, v)'))
    expect(redeclared.source).toContain('pow(x, 2) + (y * y)')
    expect(redeclared.skipped).toEqual([{ line: 3, reason: 'unbounded-base' }])
    const rebound = lowerShowMemberPow(`function custom(b, k) { return b + k }\nexport function beforeRender(delta) { pow = custom; abs = custom }\n${render('  var v = pow(y, 3) + pow(abs(x), 3)\n  rgb(v, v, v)')}`)
    expect(rebound.rewrittenSites).toBe(0)
    expect(rebound.skipped.map((entry) => entry.reason)).toEqual(['shadowed-builtin', 'shadowed-builtin'])
    const aliased = lowerShowMemberPow(`var move = translate\nexport function beforeRender(delta) { move(200, 0) }\n${render('  var v = pow(x, 2)\n  rgb(v, v, v)')}`)
    expect(aliased.rewrittenSites).toBe(0)
    expect(aliased.skipped).toEqual([{ line: 4, reason: 'unbounded-base' }])
  })
})

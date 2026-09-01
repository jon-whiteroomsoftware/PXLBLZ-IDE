import { describe, expect, it } from 'vitest'
import { unrollShowMemberLoops } from './showMemberLoopUnrolling'

const wrap = (render: string, extra = '') => `${extra}
export function beforeRender(delta) {
  for (var j = 0; j < 4; j = j + 1) acc = acc + j
}
export function render2D(index, x, y) {
${render}
}
`

describe('member loop machinery rewrites (#931)', () => {
  it('rewrites the i = i + 1 idiom everywhere and unrolls a literal-bound render loop', () => {
    const source = wrap(`  var v = 0
  for (var i = 0; i < 3; i = i + 1) {
    var w = sin(x + i * 0.1)
    v = v + w
  }
  rgb(v, 0, 0)`, 'var acc = 0')
    const result = unrollShowMemberLoops(source)
    expect(result.rewrittenIncrements).toBe(2)
    expect(result.unrolledLoops).toBe(1)
    expect(result.unrolledTrips).toBe(3)
    expect(result.source).toContain('for (var j = 0; j < 4; j++) acc = acc + j')
    expect(result.source).toContain(`{
var w = sin(x + 0 * 0.1)
    v = v + w
{ w = sin(x + 1 * 0.1); }
    v = v + w
{ w = sin(x + 2 * 0.1); }
    v = v + w
}`)
    expect(result.source).not.toContain('for (var i')
  })

  it('accepts a never-written module constant as the bound and <= tests', () => {
    const source = wrap(`  var v = 0
  for (var i = 1; i <= RINGS; i++) v = v + i
  rgb(v, 0, 0)`, 'var acc = 0\nvar RINGS = 3')
    const result = unrollShowMemberLoops(source)
    expect(result.unrolledLoops).toBe(1)
    expect(result.unrolledTrips).toBe(3)
    expect(result.source).toContain('{\nv = v + 1\nv = v + 2\nv = v + 3\n}')
  })

  it('refuses a constant that a control handler writes, a local shadow, or a variable bound', () => {
    const source = wrap(`  var v = 0
  for (var i = 0; i < RINGS; i++) v = v + i
  var STEPS = 2
  for (var k = 0; k < STEPS; k++) v = v + k
  for (var m = 0; m < count; m++) v = v + m
  rgb(v, 0, 0)`, 'var acc = 0\nvar RINGS = 3\nvar count = 3\nexport function sliderRings(t) { RINGS = floor(t * 8); count = count + 1 }')
    const result = unrollShowMemberLoops(source)
    expect(result.unrolledLoops).toBe(0)
    expect(result.source).toBe(source.replace('j = j + 1', 'j++'))
    expect(result.skipped.map((entry) => entry.reason)).toEqual([])
  })

  it('refuses control flow, induction writes, nested loops, and trips beyond the cap', () => {
    const source = wrap(`  var v = 0
  for (var a = 0; a < 3; a++) { if (v > 1) break; v = v + a }
  for (var b = 0; b < 3; b++) { v = v + b; b = b + 0 }
  for (var c = 0; c < 3; c++) { for (var d = 0; d < 2; d++) v = v + c * d }
  for (var e = 0; e < 40; e++) v = v + e
  rgb(v, 0, 0)`, 'var acc = 0')
    const result = unrollShowMemberLoops(source)
    // The inner loop `d` is eligible in round 1; its parent `c` loses its
    // nested-loop hazard in round 2 and unrolls too.
    expect(result.unrolledLoops).toBe(2)
    expect(result.source).toContain('for (var a = 0; a < 3; a++) { if (v > 1) break; v = v + a }')
    expect(result.source).toContain('for (var b = 0; b < 3; b++) { v = v + b; b = b + 0 }')
    expect(result.source).toContain('for (var e = 0; e < 40; e++) v = v + e')
    expect(result.source).not.toContain('for (var c')
    expect(result.source).not.toContain('for (var d')
    expect(result.source).toContain('v = v + 1 * 1')
    expect(result.skipped.map((entry) => entry.reason).sort()).toEqual(['control-flow', 'trip-count', 'writes-induction'])
  })

  it('splits multi-declarator vars into one assignment statement per declarator in later copies', () => {
    // The Controller compiler rejects comma expressions ("Unsupported type
    // SequenceExpression"), so `var a = .., b = ..` must not become `a = .., b = ..`.
    const source = wrap(`  var v = 0
  for (var i = 0; i < 2; i++) {
    var a = i * 2, b = a + i, c
    v = v + a + b
  }
  rgb(v, 0, 0)`, 'var acc = 0')
    const result = unrollShowMemberLoops(source)
    expect(result.source).toContain('var a = 0 * 2, b = a + 0, c\n    v = v + a + b\n{ a = 1 * 2; b = a + 1; }\n    v = v + a + b')
    expect(result.source).not.toMatch(/,\s*b = a \+ 1/)
  })

  it('never erases a module-global induction variable that other functions observe, and skips empty bodies', () => {
    const source = wrap(`  var v = 0
  for (i = 0; i < 3; i++) add()
  for (var k = 0; k < 3; k++) {}
  for (var m = 0; m < 3; m++);
  rgb(total, v, 0)`, 'var acc = 0\nvar i = 0\nvar total = 0\nfunction add() { total = total + i }')
    const result = unrollShowMemberLoops(source)
    expect(result.unrolledLoops).toBe(0)
    expect(result.source).toContain('for (i = 0; i < 3; i++) add()')
    expect(result.source).toContain('for (var k = 0; k < 3; k++) {}')
    expect(result.source).toContain('for (var m = 0; m < 3; m++);')
    expect(result.skipped.map((entry) => entry.reason).sort()).toEqual(['empty-body', 'empty-body', 'global-induction'])
    // A function-local assigned in the init is still eligible.
    const local = wrap(`  var v = 0
  var i
  for (i = 0; i < 2; i++) v = v + i
  rgb(v, 0, 0)`, 'var acc = 0')
    expect(unrollShowMemberLoops(local).unrolledLoops).toBe(1)
  })

  it('stays a single statement in an unbraced conditional and never joins a following line', () => {
    const source = wrap(`  var v = 0
  if (x > 0.5) for (var i = 0; i < 2; i++) { var a = i, b = i * 2
    v = v + a + b }
  else v = 9
  for (var j = 0; j < 2; j++) v = v + j
  rgb(v, i, 0)`, 'var acc = 0')
    const result = unrollShowMemberLoops(source)
    expect(result.unrolledLoops).toBe(2)
    // The if keeps one consequent (a block) and its else.
    expect(result.source).toMatch(/if \(x > 0\.5\) \{\n[\s\S]*?\n\}\n {2}else v = 9/)
    // Later-copy declarators are braced and terminated; the exit is
    // terminated; the expansion is one block, so a following line can never
    // continue an unterminated assignment.
    expect(result.source).toContain('{ a = 1; b = 1 * 2; }')
    expect(result.source).toContain('i = 2;\n}')
    expect(result.source).toContain('v = v + 1\n}\n  rgb(v, i, 0)')
  })

  it('refuses a loop whose induction variable a nested function observes, a loop inside a nested function, and a 16.16 overflow range', () => {
    const source = wrap(`  var total = 0
  function add() { total = total + i }
  for (var i = 0; i < 3; i++) add()
  function inner(N) { var s = 0; for (var k = 0; k < N; k++) s = s + k; return s }
  for (var m = 32760; m <= 32767; m++) total = total + m
  rgb(total, inner(0), 0)`, 'var acc = 0\nvar N = 3')
    const result = unrollShowMemberLoops(source)
    expect(result.unrolledLoops).toBe(0)
    expect(result.source).toContain('for (var i = 0; i < 3; i++) add()')
    expect(result.source).toContain('for (var k = 0; k < N; k++) s = s + k')
    expect(result.source).toContain('for (var m = 32760; m <= 32767; m++)')
    expect(result.skipped.map((entry) => entry.reason).sort()).toEqual(['closure-observes-induction', 'fixed-point-range'])
  })

  it('keeps the exit value when the induction variable is read after the loop', () => {
    const source = wrap(`  var v = 0
  for (var i = 0; i < 2; i++) v = v + i
  rgb(v, i, 0)`, 'var acc = 0')
    const result = unrollShowMemberLoops(source)
    expect(result.source).toContain('{\nvar i;\nv = v + 0\nv = v + 1\ni = 2;\n}\n  rgb(v, i, 0)')
  })

  it('does not unroll outside render-reachable functions and respects the growth allowance', () => {
    const source = wrap(`  rgb(helper(x), 0, 0)`, `var acc = 0
function helper(x) { var v = 0; for (var i = 0; i < 4; i++) v = v + sin(x + i); return v }
function unused() { var v = 0; for (var i = 0; i < 4; i++) v = v + i; return v }`)
    const result = unrollShowMemberLoops(source)
    expect(result.unrolledLoops).toBe(1)
    expect(result.source).toContain('function unused() { var v = 0; for (var i = 0; i < 4; i++) v = v + i; return v }')
    expect(result.source).not.toContain('for (var i = 0; i < 4; i++) v = v + sin')
    const capped = unrollShowMemberLoops(source, { growthAllowanceBytes: 10 })
    expect(capped.unrolledLoops).toBe(0)
    expect(capped.skipped.map((entry) => entry.reason)).toEqual(['growth-allowance'])
    const off = unrollShowMemberLoops(source, { unroll: false })
    expect(off.unrolledLoops).toBe(0)
    expect(off.rewrittenIncrements).toBe(1)
    expect(off.source).toBe(source.replace('j = j + 1', 'j++'))
  })
})

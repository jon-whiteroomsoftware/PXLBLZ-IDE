import { describe, expect, it } from 'vitest'
import { inlineGeneratedWrappers } from './showGeneratedWrapperInlining'

describe('generated wrapper inlining (#929)', () => {
  it('inlines pass-through, emit, and clear wrappers at standalone call sites and removes dead wrappers', () => {
    const source = `var c_r = 0
var c_g = 0
var c_b = 0
function c_clear() { c_r = 0; c_g = 0; c_b = 0 }
function c_renderCapture2D(index, x, y) {

  c_render2D(index, x, y)

}
function c_emit() { rgb(c_r, c_g, c_b) }
function c_render2D(index, x, y) { c_r = x; c_g = y; c_b = 0.5 }
export function beforeRender(delta) {}
export function render2D(index, x, y) {
  var zx = x * 2
  if (index >= 0) {
    c_clear()
    c_renderCapture2D(index, zx, y)
    c_emit()
    return
  }
  rgb(0, 0, 0)
}
`
    // The member's own render function is authored source in a real artifact.
    const member = 'function c_render2D(index, x, y) { c_r = x; c_g = y; c_b = 0.5 }'
    const result = inlineGeneratedWrappers(source, { excludeSources: [member] })
    expect(result.inlinedCalls).toBe(3)
    expect(result.removedWrappers).toBe(3)
    const render = result.code.slice(result.code.indexOf('export function render2D'))
    expect(render).toContain(`  if (index >= 0) {
    c_r = 0
    c_g = 0
    c_b = 0
    c_render2D(index, zx, y)
    rgb(c_r, c_g, c_b)
    return
  }`)
    expect(result.code).not.toContain('function c_clear()')
    expect(result.code).not.toContain('function c_renderCapture2D(')
    expect(result.code).not.toContain('function c_emit()')
    expect(result.code).toContain('function c_render2D(index, x, y) { c_r = x; c_g = y; c_b = 0.5 }')
  })

  it('refuses non-simple arguments, expression-position calls, shadowed globals, and non-trivial bodies', () => {
    const source = `var g = 0
function w(a) { sink(a, g) }
function branchy(a) { if (a) sink(a, g) }
function valued() { return g }
export function beforeRender(delta) {}
export function render2D(index, x, y) {
  w(x + 1)
  var g = 2
  w(x)
  branchy(x)
  var v = valued()
  rgb(v, g, 0)
}
export function render(index) {
  w(index)
  w(index)
}
`
    const result = inlineGeneratedWrappers(source)
    // render2D: the first call has a compound argument, the second is shadowed by a local `g`.
    expect(result.code).toContain('  w(x + 1)\n  var g = 2\n  w(x)\n  branchy(x)')
    // render: both sites inline; the wrapper stays because render2D still calls it.
    expect(result.code).toContain('export function render(index) {\n  sink(index, g)\n  sink(index, g)\n}')
    expect(result.inlinedCalls).toBe(2)
    expect(result.removedWrappers).toBe(0)
    expect(result.code).toContain('function w(a) { sink(a, g) }')
  })

  it('never rewrites authored member source or exported control handlers', () => {
    const member = `function __pxlblz_show_c0_render2D(index, x, y) {
  __pxlblz_show_c0_emit()
}`
    const source = `var r = 0
function __pxlblz_show_c0_emit() { rgb(r, r, r) }
${member}
export function sliderSpeed(v) { __pxlblz_show_c0_emit() }
export function beforeRender(delta) {}
export function render2D(index, x, y) {
  __pxlblz_show_c0_emit()
}
`
    const result = inlineGeneratedWrappers(source, { excludeSources: [member] })
    expect(result.code).toContain(member)
    expect(result.code).toContain('export function sliderSpeed(v) { __pxlblz_show_c0_emit() }')
    expect(result.code).toContain('export function render2D(index, x, y) {\n  rgb(r, r, r)\n}')
    expect(result.removedWrappers).toBe(0)
  })

  it('keeps a multi-statement wrapper call that is a bare branch consequent', () => {
    const source = `var r = 0
function two() { r = 1; sink(r) }
function one() { sink(r) }
export function beforeRender(delta) {}
export function render2D(index, x, y) {
  if (index > 3) two()
  else one()
  if (index > 5) { two() }
}
`
    const result = inlineGeneratedWrappers(source)
    expect(result.code).toContain('  if (index > 3) two()\n  else sink(r)\n  if (index > 5) { r = 1\nsink(r) }')
    expect(result.code).toContain('function two() { r = 1; sink(r) }')
    expect(result.code).not.toContain('function one()')
  })

  it('refuses a site whose argument the wrapper body writes, and a wrapper that references itself', () => {
    const source = `var x = 1
function w(a) { x = 2; sink(a) }
function self() { sink(self) }
export function beforeRender(delta) {}
export function render2D(index, x2, y) {
  w(x)
  w(y)
  self()
}
`
    const result = inlineGeneratedWrappers(source)
    // w(x): x is assigned by the body before the use -> kept as a call.
    expect(result.code).toContain('  w(x)\n')
    // w(y): y is untouched by the body -> inlined.
    expect(result.code).toContain('  x = 2\n  sink(y)\n')
    // self references its own name as a value -> never a candidate, never removed.
    expect(result.code).toContain('function self() { sink(self) }')
    expect(result.code).toContain('  self()\n')
    expect(result.code).toContain('function w(a) { x = 2; sink(a) }')
    expect(result.inlinedCalls).toBe(1)
    expect(result.removedWrappers).toBe(0)
  })

  it('returns the source unchanged when nothing qualifies', () => {
    const source = 'export function beforeRender(delta) {}\nexport function render(index) { rgb(0, 0, 0) }\n'
    expect(inlineGeneratedWrappers(source).code).toBe(source)
  })
})

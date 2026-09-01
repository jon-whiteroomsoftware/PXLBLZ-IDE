import { describe, expect, it } from 'vitest'
import { hoistGeneratedFrameConstants } from './showGeneratedFrameConstantHoisting'

const PREFIX = '__pxlblz_show_frame_const_'

function beforeRenderSlice(code: string): string {
  const start = code.indexOf('export function beforeRender')
  const end = code.indexOf('\n}\n', start)
  return code.slice(start, end + 3)
}

describe('generated frame-constant hoisting (#928)', () => {
  it('hoists pixelCount-only and scheduler-written-global subtrees, dedupes, and leaves per-pixel-written globals alone', () => {
    const source = `var g = 0
var h = 0
var q = 0
export function beforeRender(delta) {
  g = delta
  helper()
}
function helper() { h = g * 2 }
export function render2D(index, x, y) {
  var side = ceil(sqrt(pixelCount))
  var n = max(1, floor(pixelCount * g))
  var m = max(1, pixelCount - floor(pixelCount * h))
  var k = ceil(sqrt(pixelCount))
  var bad = ceil(sqrt(pixelCount * q))
  q = index
  rgb(side, n, m + k + bad)
}
`
    const result = hoistGeneratedFrameConstants(source)
    expect(result.hoists.map((hoist) => hoist.expression)).toEqual([
      'ceil(sqrt(pixelCount))',
      'max(1, floor(pixelCount * g))',
      'max(1, pixelCount - floor(pixelCount * h))',
    ])
    expect(result.replacedSites).toBe(4)
    const render = result.code.slice(result.code.indexOf('export function render2D'))
    expect(render).not.toContain('ceil(sqrt(pixelCount))')
    expect(render).toContain(`var side = ${PREFIX}0`)
    expect(render).toContain(`var k = ${PREFIX}0`)
    expect(render).toContain(`var n = ${PREFIX}1`)
    expect(render).toContain(`var m = ${PREFIX}2`)
    // q is written per pixel, so its subtree stays.
    expect(render).toContain('var bad = ceil(sqrt(pixelCount * q))')
    // Declarations precede beforeRender; the refresh is the last thing it does.
    expect(result.code.indexOf(`var ${PREFIX}0 = 0`)).toBeLessThan(result.code.indexOf('export function beforeRender'))
    const before = beforeRenderSlice(result.code)
    expect(before.trimEnd().endsWith(`${PREFIX}2 = max(1, pixelCount - floor(pixelCount * h))\n}`)).toBe(true)
    expect(before.indexOf('helper()')).toBeLessThan(before.indexOf(`${PREFIX}0 =`))
  })

  it('never rewrites functions reachable from beforeRender, control exports, or shadowed identifiers', () => {
    const source = `var g = 0
export function sliderSpeed(v) { g = ceil(sqrt(pixelCount)) * v }
export function beforeRender(delta) {
  shared()
  g = g + delta
}
function shared() { return ceil(sqrt(pixelCount)) }
function shadow(pixelCount) { return ceil(sqrt(pixelCount)) }
export function render2D(index, x, y) {
  rgb(shared() + shadow(4), floor(pixelCount / 2), 0)
}
`
    const result = hoistGeneratedFrameConstants(source)
    // g is written by a control handler, so it is unstable; the only hoist is
    // the pixelCount-only subtree inside render2D itself.
    expect(result.hoists.map((hoist) => hoist.expression)).toEqual(['floor(pixelCount / 2)'])
    expect(result.code).toContain('function shared() { return ceil(sqrt(pixelCount)) }')
    expect(result.code).toContain('function shadow(pixelCount) { return ceil(sqrt(pixelCount)) }')
    expect(result.code).toContain('export function sliderSpeed(v) { g = ceil(sqrt(pixelCount)) * v }')
  })

  it('does not treat a global written by a helper that per-pixel code also calls as stable', () => {
    const source = `var g = 0
export function beforeRender(delta) { bump() }
function bump() { g = g + 1 }
export function render2D(index, x, y) {
  if (index == 0) bump()
  rgb(max(1, floor(pixelCount * g)), 0, 0)
}
`
    const result = hoistGeneratedFrameConstants(source)
    expect(result.hoists).toEqual([])
    expect(result.code).toBe(source)
  })

  it('refreshes in front of every early return in beforeRender as well as at its end', () => {
    const source = `var g = 0
export function beforeRender(delta) {
  if (delta < 0) return
  g = delta
}
export function render2D(index, x, y) {
  rgb(max(1, floor(pixelCount * g)), 0, 0)
}
`
    const result = hoistGeneratedFrameConstants(source)
    expect(result.hoists).toHaveLength(1)
    expect(result.code).toContain(`export function beforeRender(delta) {\n  if (delta < 0) {\n  ${PREFIX}0 = max(1, floor(pixelCount * g))\nreturn\n}\n  g = delta\n  ${PREFIX}0 = max(1, floor(pixelCount * g))\n}`)
  })

  it('leaves excluded member source untouched and caps new globals by the budget', () => {
    const member = `function __pxlblz_show_c0_render2D(index, x, y) {
  var side = ceil(sqrt(pixelCount))
  rgb(side, 0, 0)
}`
    const source = `var g = 0
${member}
export function beforeRender(delta) { g = delta }
export function render2D(index, x, y) {
  var a = ceil(sqrt(pixelCount))
  var b = max(1, floor(pixelCount * g))
  var c = max(1, floor(pixelCount * g))
  __pxlblz_show_c0_render2D(index, a, b + c)
}
`
    const excluded = hoistGeneratedFrameConstants(source, { excludeSources: [member] })
    expect(excluded.code).toContain(member)
    expect(excluded.hoists.map((hoist) => hoist.expression)).toEqual(['max(1, floor(pixelCount * g))', 'ceil(sqrt(pixelCount))'])
    // One global left in the budget: the two-site expression wins.
    const capped = hoistGeneratedFrameConstants(source, { excludeSources: [member], maxHoists: 1 })
    expect(capped.hoists.map((hoist) => [hoist.expression, hoist.sites])).toEqual([['max(1, floor(pixelCount * g))', 2]])
    expect(capped.code).toContain('var a = ceil(sqrt(pixelCount))')
    expect(hoistGeneratedFrameConstants(source, { maxHoists: 0 }).code).toBe(source)
  })

  it('only rewrites value positions and requires a call inside the subtree', () => {
    const source = `var arr = array(4)
export function beforeRender(delta) {}
export function render2D(index, x, y) {
  arr[floor(pixelCount / 2)] = pixelCount - 1
  rgb(pixelCount - 1, arr[0], 0)
}
`
    const result = hoistGeneratedFrameConstants(source)
    expect(result.hoists.map((hoist) => hoist.expression)).toEqual(['floor(pixelCount / 2)'])
    expect(result.code).toContain(`arr[${PREFIX}0] = pixelCount - 1`)
    expect(result.code).toContain('rgb(pixelCount - 1, arr[0], 0)')
  })

  it('returns the source unchanged without a beforeRender export or without candidates', () => {
    expect(hoistGeneratedFrameConstants('export function render(index) { rgb(ceil(sqrt(pixelCount)), 0, 0) }').replacedSites).toBe(0)
    const noSites = 'export function beforeRender(delta) {}\nexport function render(index) { rgb(index / pixelCount, 0, 0) }\n'
    expect(hoistGeneratedFrameConstants(noSites).code).toBe(noSites)
  })
})

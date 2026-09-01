import { describe, expect, it } from 'vitest'
import { parse } from 'acorn'
import { applySpatialHold } from './showSpatialHold'

describe('spatial hold-and-lerp pass (#937)', () => {
  const eligible = `var c_r = 0
var c_g = 0
var c_b = 0
function c_render2D(index, x, y) { c_r = x; c_g = y; c_b = 0.5 }
export function beforeRender(delta) {}
export function render2D(index, x, y) {
  if (index <= 255) {
    var zx = (index % 16) / 15
    var zy = floor(index / 16) / 15
    c_render2D(index, zx, zy)
    rgb(c_r, c_g, c_b)
    return
  }
  rgb(0, 0, 0)
}
`
  it('wraps an index-synthesizing dispatcher: every generated paint latches, the entry lerps between lookahead anchors', () => {
    const member = 'function c_render2D(index, x, y) { c_r = x; c_g = y; c_b = 0.5 }'
    const result = applySpatialHold(eligible, { stride: 2, mode: 'lerp' }, [member])
    expect(result).toMatchObject({ selected: true, reason: 'selected', latchedPaints: 2 })
    expect(() => parse(result.code, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
    expect(result.code).toContain('function __pxlblz_show_hold_inner(index, x, y) {')
    expect(result.code).toContain('__pxlblz_show_hold_emit(c_r, c_g, c_b)')
    expect(result.code).toContain('__pxlblz_show_hold_emit(0, 0, 0)')
    // Only the entry's blend paints natively.
    expect((result.code.match(/\brgb\(/g) ?? []).length).toBe(1)
    expect(result.code).toContain('__pxlblz_show_hold_inner(min(index + 2, pixelCount - 1), x, y)')
    expect(result.code).toContain(member)
  })

  it('declines a dispatcher that reads the firmware coordinates, and any native hsv paint', () => {
    const coordinateRouted = eligible.replace('var zx = (index % 16) / 15', 'var zx = clamp(x, 0, 1)')
    expect(applySpatialHold(coordinateRouted, { stride: 2, mode: 'lerp' })).toMatchObject({ selected: false, reason: 'coordinate-routed' })
    const hsvPaint = eligible.replace('rgb(0, 0, 0)', 'hsv(0, 0, 0)')
    expect(applySpatialHold(hsvPaint, { stride: 2, mode: 'lerp' })).toMatchObject({ selected: false, reason: 'hsv-direct-paint' })
    expect(applySpatialHold('export function beforeRender(delta) {}\n', { stride: 2, mode: 'lerp' })).toMatchObject({ selected: false, reason: 'no-dispatcher' })
  })

  it('follows pass-through coordinates into generated callees and declines only where one is consumed', () => {
    const passThrough = eligible.replace('  rgb(0, 0, 0)\n}', '  helper(index, x, y)\n}\nfunction helper(i, hx, hy) { rgb(i, 0, 0) }')
    expect(applySpatialHold(passThrough, { stride: 2, mode: 'lerp' })).toMatchObject({ selected: true })
    const consumed = passThrough.replace('function helper(i, hx, hy) { rgb(i, 0, 0) }', 'function helper(i, hx, hy) { rgb(i, hx, 0) }')
    expect(applySpatialHold(consumed, { stride: 2, mode: 'lerp' })).toMatchObject({ selected: false, reason: 'coordinate-routed' })
    // Handing the firmware coordinates to a member (excluded source) is a read.
    const member = 'function c_render2D(index, x, y) { c_r = x; c_g = y; c_b = 0.5 }'
    const toMember = eligible.replace('c_render2D(index, zx, zy)', 'c_render2D(index, x, zy)')
    expect(applySpatialHold(toMember, { stride: 2, mode: 'lerp' }, [member])).toMatchObject({ selected: false, reason: 'coordinate-routed' })
  })

  it('declines generated stateful caches and clamps the lookahead to the last pixel', () => {
    const trails = eligible.replace('export function beforeRender(delta) {}', 'var __pxlblz_show_trails_ready = 0\nexport function beforeRender(delta) {}')
    expect(applySpatialHold(trails, { stride: 2, mode: 'lerp' })).toMatchObject({ selected: false, reason: 'stateful-cache' })
    const result = applySpatialHold(eligible, { stride: 4, mode: 'lerp' }, ['function c_render2D(index, x, y) { c_r = x; c_g = y; c_b = 0.5 }'])
    expect(result.code).toContain('__pxlblz_show_hold_inner(min(index + 4, pixelCount - 1), x, y)')
  })

  it('wraps a 1D dispatcher too', () => {
    const oneD = 'export function beforeRender(delta) {}\nexport function render(index) { rgb(index / pixelCount, 0, 0) }\n'
    const result = applySpatialHold(oneD, { stride: 4, mode: 'lerp' })
    expect(result.selected).toBe(true)
    expect(result.code).toContain('export function render(index) {')
    expect(result.code).toContain('__pxlblz_show_hold_inner(min(index + 4, pixelCount - 1))')
  })
})

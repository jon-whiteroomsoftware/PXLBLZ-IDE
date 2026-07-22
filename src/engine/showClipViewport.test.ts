import { describe, expect, it } from 'vitest'
import {
  compactShowClipViewport,
  normalizeShowClipViewport,
  showClipViewportMaskExpression,
} from './showClipViewport'

describe('Clip Viewport geometry (#585)', () => {
  it('defaults disabled and preserves a disabled authored rectangle', () => {
    expect(normalizeShowClipViewport(undefined)).toEqual({
      enabled: false,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
    expect(compactShowClipViewport({ enabled: false, x: 0.2, y: -0.1, width: 0.6, height: 0.5 })).toEqual({
      enabled: false,
      x: 0.2,
      y: -0.1,
      width: 0.6,
      height: 0.5,
    })
  })

  it('emits no mask while disabled and a bounded 2D predicate while enabled', () => {
    expect(showClipViewportMaskExpression(undefined, 'x', 'y')).toBeNull()
    expect(showClipViewportMaskExpression({ enabled: true, x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, 'x', 'y'))
      .toBe('((x) >= 0.1 && (x) <= 0.6 && (y) >= 0.2 && (y) <= 0.6)')
  })
})

import { describe, expect, it } from 'vitest'
import {
  SHOW_CLIP_APERTURE_DEFAULT_FEATHER,
  compactShowClipViewport,
  normalizeShowClipViewport,
  showClipViewportEffectiveEdge,
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

describe('Clip Viewport aperture shape and edge (#591)', () => {
  const frame = { enabled: true, x: 0.1, y: 0.2, width: 0.5, height: 0.4 }

  it('normalizes rectangle and invalid apertures away and keeps ellipse', () => {
    expect(normalizeShowClipViewport({ ...frame, aperture: 'rectangle' }).aperture).toBeUndefined()
    expect(normalizeShowClipViewport({ ...frame, aperture: 'ellipse' }).aperture).toBe('ellipse')
    expect(normalizeShowClipViewport({
      ...frame,
      aperture: 'blob' as never,
      edge: 'fuzzy' as never,
    })).toEqual(frame)
  })

  it('clamps an authored feather into normalized Zone units and drops non-finite values', () => {
    expect(normalizeShowClipViewport({ ...frame, feather: 4 }).feather).toBe(1)
    expect(normalizeShowClipViewport({ ...frame, feather: 0 }).feather).toBe(0.001)
    expect(normalizeShowClipViewport({ ...frame, feather: Number.NaN }).feather).toBeUndefined()
  })

  it('treats an authored aperture as durable even on an otherwise default frame', () => {
    expect(compactShowClipViewport({ enabled: false, x: 0, y: 0, width: 1, height: 1 })).toBeUndefined()
    expect(compactShowClipViewport({
      enabled: false, x: 0, y: 0, width: 1, height: 1, aperture: 'ellipse',
    })).toEqual({ enabled: false, x: 0, y: 0, width: 1, height: 1, aperture: 'ellipse' })
    expect(compactShowClipViewport({
      enabled: false, x: 0, y: 0, width: 1, height: 1, edge: 'soft',
    })).toEqual({ enabled: false, x: 0, y: 0, width: 1, height: 1, edge: 'soft' })
  })

  it('defaults the edge from the shape: rectangles hard, ellipses soft', () => {
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport(frame))).toBe('hard')
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport({ ...frame, aperture: 'ellipse' }))).toBe('soft')
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport({ ...frame, aperture: 'ellipse', edge: 'hard' }))).toBe('hard')
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport({ ...frame, edge: 'soft' }))).toBe('soft')
  })

  it('keeps the unedited enabled rectangle emission byte-identical', () => {
    expect(showClipViewportMaskExpression({ ...frame }, 'x', 'y'))
      .toBe('((x) >= 0.1 && (x) <= 0.6 && (y) >= 0.2 && (y) <= 0.6)')
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'rectangle', edge: 'hard' }, 'x', 'y'))
      .toBe('((x) >= 0.1 && (x) <= 0.6 && (y) >= 0.2 && (y) <= 0.6)')
  })

  it('emits a folded squared-distance predicate for a static hard ellipse', () => {
    // cx 0.35, cy 0.4, rx 0.25, ry 0.2 -> rx^2 0.0625, ry^2 0.04
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'ellipse', edge: 'hard' }, 'x', 'y'))
      .toBe('(((x) - 0.35) * ((x) - 0.35) / 0.0625 + ((y) - 0.4) * ((y) - 0.4) / 0.04 <= 1)')
  })

  it('emits a bounded scaled-space soft band for a static ellipse with the density default', () => {
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'ellipse' }, 'x', 'y'))
      .toBe(`clamp(0.5 - ((hypot(((x) - 0.35) / 0.25, ((y) - 0.4) / 0.2) - 1) * 0.2) / ${SHOW_CLIP_APERTURE_DEFAULT_FEATHER}, 0, 1)`)
  })

  it('uses the authored feather width when present', () => {
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'ellipse', feather: 0.05 }, 'x', 'y'))
      .toBe('clamp(0.5 - ((hypot(((x) - 0.35) / 0.25, ((y) - 0.4) / 0.2) - 1) * 0.2) / 0.05, 0, 1)')
  })

  it('emits a soft rectangle band from the axis-aligned box distance', () => {
    expect(showClipViewportMaskExpression({ ...frame, edge: 'soft', feather: 0.05 }, 'x', 'y'))
      .toBe('clamp(0.5 - (max(abs((x) - 0.35) - 0.25, abs((y) - 0.4) - 0.2)) / 0.05, 0, 1)')
  })

  it('supports animated frame expressions for the shaped and soft paths', () => {
    const animated = showClipViewportMaskExpression(
      { ...frame, aperture: 'ellipse', feather: 0.05 },
      'x',
      'y',
      { width: 'W', x: 'X' },
    )
    expect(animated).toContain('(X) + (W) * 0.5')
    expect(animated).toContain('(W) * 0.5')
    expect(animated).toContain('min(')
    expect(animated).toContain('hypot(')
    expect(animated).toContain('clamp(0.5 - ')
    // The unanimated frame properties stay folded constants.
    expect(animated).toContain('0.4')
  })

  it('keeps the animated hard rectangle emission byte-identical', () => {
    expect(showClipViewportMaskExpression(frame, 'x', 'y', { x: 'X' }))
      .toBe('((x) >= (X) && (x) <= ((X) + (0.5)) && (y) >= (0.2) && (y) <= ((0.2) + (0.4)))')
  })
})

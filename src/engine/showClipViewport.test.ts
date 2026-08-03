import { describe, expect, it } from 'vitest'
import {
  SHOW_CLIP_APERTURE_DEFAULT_FEATHER,
  compactShowClipViewport,
  normalizeShowClipViewport,
  showClipViewportEffectiveEdge,
  showClipViewportMaskExpression,
} from './showClipViewport'
import { injectSpatialGaugeHelpers } from './spatialShapeGauge'

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

  it('emits no mask while disabled and a density-soft band while enabled', () => {
    expect(showClipViewportMaskExpression(undefined, 'x', 'y')).toBeNull()
    expect(showClipViewportMaskExpression({ enabled: true, x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, 'x', 'y'))
      .toBe(`clamp(0.5 - (max(abs((x) - 0.35) - 0.25, abs((y) - 0.4) - 0.2)) / ${SHOW_CLIP_APERTURE_DEFAULT_FEATHER}, 0, 1)`)
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

  it('defaults every aperture edge to soft while preserving explicit choices (#689)', () => {
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport(frame))).toBe('soft')
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport({ ...frame, aperture: 'ellipse' }))).toBe('soft')
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport({ ...frame, aperture: 'ellipse', edge: 'hard' }))).toBe('hard')
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport({ ...frame, edge: 'soft' }))).toBe('soft')
    expect(showClipViewportEffectiveEdge(normalizeShowClipViewport({ ...frame, edge: 'dither' }))).toBe('dither')
  })

  it('defaults an unedited rectangle to Soft and preserves explicit Hard', () => {
    expect(showClipViewportMaskExpression({ ...frame }, 'x', 'y'))
      .toBe(`clamp(0.5 - (max(abs((x) - 0.35) - 0.25, abs((y) - 0.4) - 0.2)) / ${SHOW_CLIP_APERTURE_DEFAULT_FEATHER}, 0, 1)`)
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

  it('animates the default Soft rectangle and preserves explicit Hard emission', () => {
    expect(showClipViewportMaskExpression(frame, 'x', 'y', { x: 'X' }))
      .toBe(`clamp(0.5 - (max(abs((x) - ((X) + 0.25)) - 0.25, abs((y) - 0.4) - 0.2)) / ${SHOW_CLIP_APERTURE_DEFAULT_FEATHER}, 0, 1)`)
    expect(showClipViewportMaskExpression({ ...frame, edge: 'hard' }, 'x', 'y', { x: 'X' }))
      .toBe('((x) >= (X) && (x) <= ((X) + (0.5)) && (y) >= (0.2) && (y) <= ((0.2) + (0.4)))')
  })
})

describe('Clip Viewport aperture catalogue (#678)', () => {
  const frame = { enabled: true, x: 0.1, y: 0.2, width: 0.5, height: 0.4 }
  // cx 0.35, cy 0.4, rx 0.25, ry 0.2, minR 0.2

  it('normalizes catalogue shapes and drops params that do not belong to the shape', () => {
    expect(normalizeShowClipViewport({ ...frame, aperture: 'diamond' }).aperture).toBe('diamond')
    expect(normalizeShowClipViewport({ ...frame, aperture: 'ring', ringWidth: 0.5 }))
      .toMatchObject({ aperture: 'ring', ringWidth: 0.5 })
    expect(normalizeShowClipViewport({ ...frame, aperture: 'rounded-box', cornerRadius: 0.3 }))
      .toMatchObject({ aperture: 'rounded-box', cornerRadius: 0.3 })
    // Params are shape-owned: they normalize away when the shape leaves.
    expect(normalizeShowClipViewport({ ...frame, aperture: 'ellipse', ringWidth: 0.5, cornerRadius: 0.3 }))
      .toEqual({ ...frame, aperture: 'ellipse' })
    expect(normalizeShowClipViewport({ ...frame, aperture: 'ring', ringWidth: 9 }).ringWidth).toBe(1)
    expect(normalizeShowClipViewport({ ...frame, aperture: 'rounded-box', cornerRadius: 0 }).cornerRadius).toBe(0.05)
  })

  it('defaults every shaped aperture to the soft edge', () => {
    for (const aperture of ['diamond', 'ring', 'rounded-box'] as const) {
      expect(showClipViewportEffectiveEdge(normalizeShowClipViewport({ ...frame, aperture }))).toBe('soft')
    }
  })

  it('emits a sqrt-free hard diamond predicate', () => {
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'diamond', edge: 'hard' }, 'x', 'y'))
      .toBe('(abs(((x) - 0.35) / 0.25) + abs(((y) - 0.4) / 0.2) <= 1)')
  })

  it('emits a soft diamond band scaled toward real distance', () => {
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'diamond', feather: 0.05 }, 'x', 'y'))
      .toBe('clamp(0.5 - ((abs(((x) - 0.35) / 0.25) + abs(((y) - 0.4) / 0.2) - 1) * 0.141421356237) / 0.05, 0, 1)')
  })

  it('emits a sqrt-free hard ring annulus from the squared radius', () => {
    const quadratic = '((x) - 0.35) * ((x) - 0.35) / 0.0625 + ((y) - 0.4) * ((y) - 0.4) / 0.04'
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'ring', ringWidth: 0.5, edge: 'hard' }, 'x', 'y'))
      .toBe(`(${quadratic} <= 1 && ${quadratic} >= 0.25)`)
  })

  it('emits a soft ring band centred on the annulus midline', () => {
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'ring', ringWidth: 0.5, feather: 0.05 }, 'x', 'y'))
      .toBe('clamp(0.5 - ((abs(hypot(((x) - 0.35) / 0.25, ((y) - 0.4) / 0.2) - 0.75) - 0.25) * 0.2) / 0.05, 0, 1)')
  })

  it('emits the rounded-box signed distance for both edges', () => {
    const qx = '(abs(((x) - 0.35) / 0.25) - 0.5)'
    const qy = '(abs(((y) - 0.4) / 0.2) - 0.5)'
    const signed = `(min(max(${qx}, ${qy}), 0) + hypot(max(${qx}, 0), max(${qy}, 0)) - 0.5) * 0.2`
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'rounded-box', cornerRadius: 0.5, edge: 'hard' }, 'x', 'y'))
      .toBe(`(${signed} <= 0)`)
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'rounded-box', cornerRadius: 0.5, feather: 0.05 }, 'x', 'y'))
      .toBe(`clamp(0.5 - (${signed}) / 0.05, 0, 1)`)
  })

  it('keeps catalogue shapes working with animated frame expressions', () => {
    const animated = showClipViewportMaskExpression(
      { ...frame, aperture: 'ring', ringWidth: 0.5, feather: 0.05 },
      'x',
      'y',
      { width: 'W' },
    )
    expect(animated).toContain('(W) * 0.5')
    expect(animated).toContain('min(')
    expect(animated).toContain('0.75')
  })
})

describe('unified aperture silhouette catalogue (#690)', () => {
  const frame = { enabled: true, x: 0.1, y: 0.2, width: 0.5, height: 0.4 }
  // cx 0.35, cy 0.4, rx 0.25, ry 0.2, minR 0.2

  /** Runs a mask expression the way the generated program would. */
  const evaluateMask = (expression: string | null, x: number, y: number): number => {
    const program = injectSpatialGaugeHelpers(`__pxlblz_mask_result = (${expression})`)
    const runner = new Function('x', 'y', 'index', 'pixelCount', `
      var abs = Math.abs, max = Math.max, min = Math.min, sqrt = Math.sqrt
      var sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, hypot = Math.hypot
      var frac = function (value) { return value - Math.floor(value) }
      var clamp = function (value, low, high) { return Math.max(low, Math.min(high, value)) }
      var __pxlblz_mask_result = 0
      ${program}
      return Number(__pxlblz_mask_result)
    `)
    return runner(x, y, 0, 10_000) as number
  }

  it('normalizes catalogue silhouettes with their shape-owned parameters', () => {
    expect(normalizeShowClipViewport({ ...frame, aperture: 'star', starPoints: 6.4, starInner: 0.9 }))
      .toMatchObject({ aperture: 'star', starPoints: 6, starInner: 0.8 })
    expect(normalizeShowClipViewport({ ...frame, aperture: 'polygon', polygonSides: 11 }).polygonSides).toBe(8)
    expect(normalizeShowClipViewport({ ...frame, aperture: 'cross', crossWidth: 0.05 }).crossWidth).toBe(0.1)
    expect(normalizeShowClipViewport({ ...frame, aperture: 'crescent', crescentOffset: 0.9 }).crescentOffset).toBe(0.8)
    expect(normalizeShowClipViewport({ ...frame, aperture: 'cloud' }).aperture).toBe('cloud')
    // Shape-owned parameters normalize away with a different shape.
    expect(normalizeShowClipViewport({ ...frame, aperture: 'ellipse', starPoints: 5 }).starPoints).toBeUndefined()
  })

  it('keeps rotation and invert as durable aperture styling', () => {
    expect(normalizeShowClipViewport({ ...frame, aperture: 'star', rotation: 0.125, invert: true }))
      .toMatchObject({ rotation: 0.125, invert: true })
    expect(normalizeShowClipViewport({ ...frame, rotation: 5 }).rotation).toBe(1)
    expect(normalizeShowClipViewport({ ...frame, rotation: 0 }).rotation).toBeUndefined()
    expect(normalizeShowClipViewport({ ...frame, invert: false }).invert).toBeUndefined()
    expect(compactShowClipViewport({ enabled: false, x: 0, y: 0, width: 1, height: 1, invert: true }))
      .toMatchObject({ invert: true })
    expect(compactShowClipViewport({ enabled: false, x: 0, y: 0, width: 1, height: 1, rotation: 0.25 }))
      .toMatchObject({ rotation: 0.25 })
  })

  it('emits gauge-helper predicates for the catalogue silhouettes', () => {
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'star', edge: 'hard' }, 'x', 'y'))
      .toBe('(__pxlblz_show_gauge_star(((x) - 0.35) / 0.25, ((y) - 0.4) / 0.2, 5, 0.45) <= 1)')
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'cloud', edge: 'hard' }, 'x', 'y'))
      .toBe('(__pxlblz_show_gauge_cloud(((x) - 0.35) / 0.25, ((y) - 0.4) / 0.2) <= 1)')
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'heart', feather: 0.05 }, 'x', 'y'))
      .toBe('clamp(0.5 - ((__pxlblz_show_gauge_heart(((x) - 0.35) / 0.25, ((y) - 0.4) / 0.2) - 1) * 0.2) / 0.05, 0, 1)')
  })

  it('cuts the crescent hole inline in frame-normalized space', () => {
    const u = '((x) - 0.35) / 0.25'
    const v = '((y) - 0.4) / 0.2'
    expect(showClipViewportMaskExpression({ ...frame, aperture: 'crescent', edge: 'hard' }, 'x', 'y'))
      .toBe(`(max(hypot(${u}, ${v}) - 1, 0.78 - hypot((${u}) - 0.45, ${v})) * 0.2 <= 0)`)
  })

  it('admits inside the silhouette and cuts out when inverted', () => {
    const star = showClipViewportMaskExpression({ ...frame, aperture: 'star', edge: 'hard' }, 'x', 'y')
    const inverted = showClipViewportMaskExpression({ ...frame, aperture: 'star', edge: 'hard', invert: true }, 'x', 'y')
    expect(evaluateMask(star, 0.35, 0.4)).toBe(1)
    expect(evaluateMask(star, 0.1, 0.2)).toBe(0)
    expect(evaluateMask(inverted, 0.35, 0.4)).toBe(0)
    expect(evaluateMask(inverted, 0.1, 0.2)).toBe(1)
    // The soft band flips around the same boundary.
    const soft = showClipViewportMaskExpression({ ...frame, aperture: 'star', feather: 0.05 }, 'x', 'y')
    const softInverted = showClipViewportMaskExpression({ ...frame, aperture: 'star', feather: 0.05, invert: true }, 'x', 'y')
    expect(evaluateMask(soft, 0.35, 0.4)).toBe(1)
    expect(evaluateMask(softInverted, 0.35, 0.4)).toBe(0)
    expect(evaluateMask(soft, 0.35, 0.4) + evaluateMask(softInverted, 0.35, 0.4)).toBeCloseTo(1, 10)
  })

  it('rotates the silhouette inside its frame', () => {
    const unrotated = showClipViewportMaskExpression({ ...frame, aperture: 'star', edge: 'hard' }, 'x', 'y')
    const rotated = showClipViewportMaskExpression({ ...frame, aperture: 'star', edge: 'hard', rotation: 0.15 }, 'x', 'y')
    const theta = 0.15 * Math.PI * 2
    for (const [dx, dy] of [[0.2, 0.05], [0.05, -0.15], [-0.18, 0.1]] as const) {
      const worldX = 0.35 + dx * Math.cos(theta) - dy * Math.sin(theta)
      const worldY = 0.4 + dx * Math.sin(theta) + dy * Math.cos(theta)
      expect(evaluateMask(rotated, worldX, worldY)).toBe(evaluateMask(unrotated, 0.35 + dx, 0.4 + dy))
    }
    // Rotation reaches the frame default rectangle too.
    const rectangle = showClipViewportMaskExpression({ ...frame, edge: 'hard', rotation: 0.25 }, 'x', 'y')
    // A quarter turn swaps the half-extents: x reach shrinks to ry 0.2.
    expect(evaluateMask(rectangle, 0.35 + 0.24, 0.4)).toBe(0)
    expect(evaluateMask(rectangle, 0.35 + 0.19, 0.4)).toBe(1)
  })

  it('keeps gauge silhouettes working with animated frame expressions and dither', () => {
    const animated = showClipViewportMaskExpression(
      { ...frame, aperture: 'cloud', feather: 0.05 },
      'x',
      'y',
      { width: 'W' },
    )
    expect(animated).toContain('__pxlblz_show_gauge_cloud(')
    expect(animated).toContain('(W) * 0.5')
    const dithered = showClipViewportMaskExpression(
      { ...frame, aperture: 'star', edge: 'dither' },
      'x',
      'y',
      {},
      { indexExpression: 'index' },
    )
    expect(dithered).toContain('__pxlblz_show_hash01(index)')
    expect(dithered).toContain('__pxlblz_show_gauge_star(')
  })
})

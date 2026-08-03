import { describe, expect, it } from 'vitest'
import {
  injectSpatialGaugeHelpers,
  spatialGaugeCallExpression,
  type SpatialGaugeShape,
} from './spatialShapeGauge'
import { showShapeRevealDistance } from './showShapeReveal'

/**
 * Runs an emitted gauge expression the way the preview runtime would: the
 * helper sources are plain Pixelblaze code, which is also valid JavaScript
 * once the built-ins are shimmed.
 */
function evaluateGauge(expression: string, u: number, v: number): number {
  const program = injectSpatialGaugeHelpers(`__pxlblz_gauge_result = (${expression})`)
  const runner = new Function('u', 'v', `
    var abs = Math.abs, max = Math.max, min = Math.min
    var sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, hypot = Math.hypot
    var frac = function (value) { return value - Math.floor(value) }
    var __pxlblz_gauge_result = 0
    ${program}
    return __pxlblz_gauge_result
  `)
  return runner(u, v) as number
}

describe('shared spatial gauge helpers (#690)', () => {
  const CASES: Array<[SpatialGaugeShape, Record<string, number>]> = [
    ['cross', { crossWidth: 0.3 }],
    ['heart', {}],
    ['star', { starPoints: 5, starInner: 0.45 }],
    ['polygon', { polygonSides: 3 }],
    ['polygon', { polygonSides: 8 }],
    ['cloud', {}],
    ['cat-head', {}],
    ['cat-side-profile', {}],
    ['bastet', {}],
  ]

  it.each(CASES)('emits a %s gauge matching the float64 reveal metric', (shape, parameters) => {
    // Unit-frame samples: showShapeRevealDistance over centered coordinates
    // with aspect 1 and rotation 0 IS the gauge over (u, v).
    const samples: Array<[number, number]> = []
    for (let angleStep = 0; angleStep < 12; angleStep += 1) {
      for (const radius of [0.2, 0.7, 1.3]) {
        const angle = (angleStep / 12) * Math.PI * 2 + 0.05
        samples.push([radius * Math.cos(angle), radius * Math.sin(angle)])
      }
    }
    const expression = spatialGaugeCallExpression(shape, 'u', 'v', parameters)
    for (const [u, v] of samples) {
      const reference = showShapeRevealDistance({
        x: u, y: v, centerX: 0, centerY: 0, shape, aspect: 1, rotation: 0, ...parameters,
      })
      expect(evaluateGauge(expression, u, v)).toBeCloseTo(reference, 10)
    }
  })

  it('injects only referenced helpers, closed over their dependencies', () => {
    const untouched = 'var x = 1'
    expect(injectSpatialGaugeHelpers(untouched)).toBe(untouched)

    const star = injectSpatialGaugeHelpers('var m = __pxlblz_show_gauge_star(0.1, 0.2, 5, 0.45)')
    expect(star).toContain('function __pxlblz_show_gauge_star(')
    expect(star).not.toContain('function __pxlblz_show_gauge_cloud(')
    expect(star).not.toContain('function __pxlblz_show_gauge_bump(')

    const cloud = injectSpatialGaugeHelpers('var m = __pxlblz_show_gauge_cloud(0.1, 0.2)')
    expect(cloud).toContain('function __pxlblz_show_gauge_cloud(')
    expect(cloud).toContain('function __pxlblz_show_gauge_bump(')
    expect(cloud.indexOf('function __pxlblz_show_gauge_bump('))
      .toBeLessThan(cloud.indexOf('function __pxlblz_show_gauge_cloud('))
  })
})

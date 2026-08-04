import {
  normalizeShowRevealMode,
  showShapeRevealDistance,
  showShapeRevealMaxDistance,
  showShapeRevealSignedDistance,
} from './showShapeReveal'
import { createDefaultShow, normalizeShowTransitionState, showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'

describe('Grow Incoming and Shrink Outgoing shape reveals (#448)', () => {
  it('uses explicit reveal language and a safe authoring default', () => {
    expect(normalizeShowRevealMode(undefined)).toBe('grow-incoming')
    expect(normalizeShowRevealMode('shrink-outgoing')).toBe('shrink-outgoing')
    expect(normalizeShowRevealMode('grow-incoming')).toBe('grow-incoming')
  })

  it('grows incoming Circle coverage and shrinks outgoing Circle coverage', () => {
    const shared = { x: 0.5, y: 0.5, centerX: 0.5, centerY: 0.5, shape: 'circle' as const }
    expect(showShapeRevealSignedDistance({ ...shared, progress: 0.25, revealMode: 'grow-incoming' })).toBeLessThan(0)
    expect(showShapeRevealSignedDistance({ ...shared, x: 0, progress: 0.25, revealMode: 'grow-incoming' })).toBeGreaterThan(0)
    expect(showShapeRevealSignedDistance({ ...shared, progress: 0.75, revealMode: 'shrink-outgoing' })).toBeGreaterThan(0)
    expect(showShapeRevealSignedDistance({ ...shared, x: 0, progress: 0.75, revealMode: 'shrink-outgoing' })).toBeLessThan(0)
  })

  it('supports a rotated Box with aspect changing only its mask', () => {
    const wide = showShapeRevealSignedDistance({
      x: 0.8, y: 0.5, centerX: 0.5, centerY: 0.5,
      shape: 'box', progress: 0.4, revealMode: 'grow-incoming', aspect: 2, rotation: 0,
    })
    const tall = showShapeRevealSignedDistance({
      x: 0.8, y: 0.5, centerX: 0.5, centerY: 0.5,
      shape: 'box', progress: 0.4, revealMode: 'grow-incoming', aspect: 0.5, rotation: 0,
    })
    expect(wide).toBeLessThan(tall)
    expect(showShapeRevealSignedDistance({
      x: 0.8, y: 0.5, centerX: 0.5, centerY: 0.5,
      shape: 'box', progress: 0.4, revealMode: 'grow-incoming', aspect: 2, rotation: 0.25,
    })).toBeCloseTo(tall, 12)
  })

  it('normalizes explicit reveal modes and Box parameters', () => {
    const show = { ...createDefaultShow('shape', 'Shape', 448), stageMapId: 'plane' }
    show.transitions[0] = {
      ...show.transitions[0], kind: 'portal', durationMs: 1000,
      revealMode: 'grow-incoming', shape: 'box', aspect: 9, rotation: 1.25,
      edgePolicy: 'blend',
    }
    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions![0]).toMatchObject({
      revealMode: 'grow-incoming', shape: 'box', aspect: 4, rotation: 1,
      edgePolicy: 'blend',
    })
    const recipe = showRecordToCompileRecipe(normalized, {
      stageDimension: 2,
      byCellId: Object.fromEntries(normalized.cells.map((cell) => [cell.id, 'export function render2D(index, x, y) { rgb(x, y, 0) }'])),
    })
    expect(recipe.routeTransition).toMatchObject({
      kind: 'portal', revealMode: 'grow-incoming', shape: 'box', aspect: 4, rotation: 1, edgePolicy: 'blend',
    })
    expect(compileShow(recipe, {}).summary.cost.cpu.patternEvaluations).toEqual({
      formula: 'N + E', basePerPixel: 1, additionalPerEdgePixel: 1,
    })
  })
})

describe('common and signature SDF catalogue (#452)', () => {
  it('evaluates every common, polygon, and signature metric deterministically', () => {
    const shapes = [
      'ellipse', 'rounded-box', 'cross', 'heart', 'star', 'crescent',
      'polygon', 'cloud', 'cat-head', 'cat-side-profile', 'bastet',
    ] as const
    const metrics = shapes.map((shape) => showShapeRevealDistance({
      x: 0.76, y: 0.31, centerX: 0.5, centerY: 0.5, shape,
      aspect: 1.4, rotation: 0.125, cornerRadius: 0.35, crossWidth: 0.3,
      starPoints: 5, starInner: 0.45, polygonSides: 6,
    }))
    metrics.forEach((metric) => {
      expect(metric).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(metric)).toBe(true)
    })
    expect(new Set(metrics.map((metric) => metric.toFixed(6))).size).toBeGreaterThanOrEqual(8)
    expect(showShapeRevealDistance({
      x: 0.76, y: 0.31, centerX: 0.5, centerY: 0.5,
      shape: 'polygon', polygonSides: 3,
    })).not.toBe(showShapeRevealDistance({
      x: 0.76, y: 0.31, centerX: 0.5, centerY: 0.5,
      shape: 'polygon', polygonSides: 8,
    }))
  })

  it('shapes the Cloud with a flat bottom under a scalloped crown (#690)', () => {
    const at = (dx: number, dy: number) => showShapeRevealDistance({
      x: 0.5 + dx, y: 0.5 + dy, centerX: 0.5, centerY: 0.5, shape: 'cloud', aspect: 1,
    })
    // The bottom line sits nearer the center than the crown: straight up
    // reaches deeper inside than straight down at the same radius.
    expect(at(0, -0.5)).toBeLessThan(at(0, 0.5))
    // The bottom edge crosses 1 at the same height across a wide span.
    expect(at(-0.1, 0.4)).toBeLessThan(1)
    expect(at(0.1, 0.4)).toBeLessThan(1)
    expect(at(-0.1, 0.46)).toBeGreaterThan(1)
    expect(at(0.1, 0.46)).toBeGreaterThan(1)
    // Scallops: the valley between the top and side lobes sits closer to the
    // boundary than either adjacent lobe peak at the same radius.
    const radius = 0.5
    const metricAt = (angle: number) => showShapeRevealDistance({
      x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle),
      centerX: 0.5, centerY: 0.5, shape: 'cloud', aspect: 1,
    })
    expect(metricAt(-2.0)).toBeGreaterThan(metricAt(-Math.PI / 2))
    expect(metricAt(-2.0)).toBeGreaterThan(metricAt(-2.3))
  })

  it('normalizes the Cloud with a wide default aspect (#690)', () => {
    const show = { ...createDefaultShow('cloud', 'Cloud', 690), stageMapId: 'plane' }
    show.transitions[0] = {
      ...show.transitions[0], kind: 'portal', durationMs: 1000,
      shape: 'cloud', rotation: 3,
    }
    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions![0]).toMatchObject({
      shape: 'cloud', aspect: 1.4, rotation: 1,
    })
  })

  it('shapes the Heart with lobes, a cleft, and a sharp point (#692)', () => {
    const radius = 0.5
    const metricAt = (angle: number) => showShapeRevealDistance({
      x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle),
      centerX: 0.5, centerY: 0.5, shape: 'heart', aspect: 1,
    })
    // Cleft: the up-center boundary dips below both lobe peaks.
    expect(metricAt(-Math.PI / 2)).toBeGreaterThan(metricAt(-Math.PI / 2 - 0.72))
    expect(metricAt(-Math.PI / 2)).toBeGreaterThan(metricAt(-Math.PI / 2 + 0.72))
    // Point: down-center reaches farther than the down-diagonals.
    expect(metricAt(Math.PI / 2)).toBeLessThan(metricAt(Math.PI / 2 - 0.7))
    expect(metricAt(Math.PI / 2)).toBeLessThan(metricAt(Math.PI / 2 + 0.7))
    // The point is farther out than the lobes: hearts are bottom-heavy.
    expect(metricAt(Math.PI / 2)).toBeLessThan(metricAt(-Math.PI / 2 - 0.72))
  })

  // ~17s solo; full-suite worker contention has been observed to stretch it
  // past 40s, so the allowance carries real headroom (pre-push flake, #672).
  it('covers the whole stage for off-center concave silhouettes (#692 review P2)', { timeout: 90_000 }, () => {
    // A heart near the bottom edge points its cleft at the top edge midpoint,
    // where the gauge peaks between the four corners; a cross's notches do the
    // same. At full progress every stage point must be revealed.
    for (const [shape, settings] of [
      ['heart', { centerX: 0.5, centerY: 0.9 }],
      ['cross', { centerX: 0.15, centerY: 0.5 }],
      // The reviewer's narrow rotated star: a 12-point, 0.2-inner star whose
      // notch peak defeats any fixed boundary lattice.
      ['star', { centerX: 0.5, centerY: 0.5, rotation: 0.130859375, starPoints: 12, starInner: 0.2 }],
      // The reviewer's stretched rotated Bastet, whose maximum falls between
      // uniform sweep angles under the extreme aspect mapping.
      ['bastet', { centerX: 0.68, centerY: 0.4, aspect: 3.25, rotation: 0.72 }],
    ] as const) {
      for (let step = 0; step <= 24; step += 1) {
        const t = step / 24
        for (const [x, y] of [[t, 0], [t, 1], [0, t], [1, t]] as const) {
          expect(showShapeRevealSignedDistance({
            x, y, shape, progress: 1, revealMode: 'grow-incoming', aspect: 1, ...settings,
          }), `${shape} at ${x},${y}`).toBeLessThanOrEqual(0)
        }
      }
    }
  })

  it('keeps the concave coverage bound tight as well as complete (#692 review P2)', () => {
    // The reviewer's collapsing-cross scenario: the exact stage maximum is
    // 2.5, and the bound must stay within the sweep margin of it rather than
    // falling back to a gross radial-over-floor estimate.
    const cases = [
      { shape: 'cross', centerX: 0, centerY: 0.5, aspect: 0.25, rotation: 0, crossWidth: 0.1 },
      { shape: 'star', centerX: 0.5, centerY: 0.5, rotation: 0.130859375, starPoints: 12, starInner: 0.2, aspect: 1 },
      { shape: 'heart', centerX: 0.5, centerY: 0.9, aspect: 1 },
      { shape: 'bastet', centerX: 0.68, centerY: 0.4, aspect: 3.25, rotation: 0.72 },
      { shape: 'cloud', centerX: 0.2, centerY: 0.8, aspect: 2.5, rotation: 0.3 },
    ] as const
    for (const settings of cases) {
      let exact = 0
      for (let step = 0; step <= 4096; step += 1) {
        const t = step / 4096
        for (const [x, y] of [[t, 0], [t, 1], [0, t], [1, t]] as const) {
          exact = Math.max(exact, showShapeRevealDistance({ ...settings, x, y }))
        }
      }
      const bound = showShapeRevealMaxDistance(settings)
      expect(bound, `${settings.shape} covers`).toBeGreaterThanOrEqual(exact)
      expect(bound, `${settings.shape} stays tight`).toBeLessThanOrEqual(exact * 1.05)
    }
  })

  it('keeps each concave Lipschitz constant above the observed slope (#692)', () => {
    // The interval bound is only rigorous while the documented constants
    // dominate |d(unit gauge)/d(angle)|; estimate the slope numerically.
    const shapes = [
      ['heart', 4.7, {}],
      ['cloud', 26, {}],
      ['cat-head', 4.3, {}],
      ['cat-side-profile', 6.7, {}],
      ['bastet', 9.4, {}],
      ['cross', 10, { crossWidth: 0.1 }],
      ['star', 76.5, { starPoints: 12, starInner: 0.2 }],
    ] as const
    const epsilon = 1e-4
    for (const [shape, constant, parameters] of shapes) {
      let steepest = 0
      for (let step = 0; step < 4096; step += 1) {
        const angle = (step / 4096) * Math.PI * 2
        const gaugeAt = (a: number) => showShapeRevealDistance({
          x: Math.cos(a), y: Math.sin(a), centerX: 0, centerY: 0, shape, aspect: 1, ...parameters,
        })
        steepest = Math.max(steepest, Math.abs(gaugeAt(angle + epsilon) - gaugeAt(angle)) / epsilon)
      }
      expect(steepest, `${shape} slope`).toBeLessThanOrEqual(constant)
    }
  })

  it('cuts a real crescent hole while preserving Grow and Shrink polarity', () => {
    const shared = {
      centerX: 0.5, centerY: 0.5, shape: 'crescent' as const,
      progress: 0.65, scale: 1, crescentOffset: 0.45,
    }
    const litCrescent = showShapeRevealSignedDistance({ ...shared, x: 0.32, y: 0.5, revealMode: 'grow-incoming' })
    const cutout = showShapeRevealSignedDistance({ ...shared, x: 0.58, y: 0.5, revealMode: 'grow-incoming' })
    expect(litCrescent).toBeLessThan(0)
    expect(cutout).toBeGreaterThan(0)
    expect(showShapeRevealSignedDistance({ ...shared, x: 0.32, y: 0.5, revealMode: 'shrink-outgoing' }))
      .toBeGreaterThan(0)
  })
})

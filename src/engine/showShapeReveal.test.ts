import {
  normalizeShowRevealMode,
  showShapeRevealDistance,
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

  it('covers the whole stage for off-center concave silhouettes (#692 review P2)', () => {
    // A heart near the bottom edge points its cleft at the top edge midpoint,
    // where the gauge peaks between the four corners; a cross's notches do the
    // same. At full progress every stage point must be revealed.
    for (const [shape, settings] of [
      ['heart', { centerX: 0.5, centerY: 0.9 }],
      ['cross', { centerX: 0.15, centerY: 0.5 }],
      // The reviewer's narrow rotated star: a 12-point, 0.2-inner star whose
      // notch peak defeats any fixed boundary lattice.
      ['star', { centerX: 0.5, centerY: 0.5, rotation: 0.130859375, starPoints: 12, starInner: 0.2 }],
    ] as const) {
      for (let step = 0; step <= 64; step += 1) {
        const t = step / 64
        for (const [x, y] of [[t, 0], [t, 1], [0, t], [1, t]] as const) {
          expect(showShapeRevealSignedDistance({
            x, y, shape, progress: 1, revealMode: 'grow-incoming', aspect: 1, ...settings,
          }), `${shape} at ${x},${y}`).toBeLessThanOrEqual(0)
        }
      }
    }
  })

  it('keeps every concave boundary floor at or above its coverage constant (#692)', () => {
    const floors = [
      ['heart', 0.54], ['cloud', 0.44],
      ['cat-head', 0.72], ['cat-side-profile', 0.62], ['bastet', 0.55],
    ] as const
    for (const [shape, floor] of floors) {
      for (let step = 0; step < 720; step += 1) {
        const angle = (step / 720) * Math.PI * 2
        const gauge = showShapeRevealDistance({
          x: Math.cos(angle), y: Math.sin(angle), centerX: 0, centerY: 0, shape, aspect: 1,
        })
        // boundary(angle) = radial / gauge with radial 1.
        expect(1 / gauge, `${shape} at ${angle}`).toBeGreaterThanOrEqual(floor - 1e-9)
      }
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

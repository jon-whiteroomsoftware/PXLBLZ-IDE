import { describe, expect, it } from 'vitest'
import {
  buildMapDiagnosticViewport,
  prepareMapDiagnosticGeometry,
  projectMapDiagnosticGeometry,
} from './mapDiagnosticViewport'

describe('Map diagnostic viewport', () => {
  it('sizes 2D geometry from its physical aspect instead of a fixed frame', () => {
    const square = buildMapDiagnosticViewport({
      positions: [[0, 0], [1, 1]],
      displayDimension: 2,
      containerWidth: 460,
    })
    const wide = buildMapDiagnosticViewport({
      positions: [[0, 0], [1, 0.5]],
      displayDimension: 2,
      containerWidth: 460,
    })

    expect(square).toMatchObject({ width: 460, height: 460 })
    expect(wide).toMatchObject({ width: 460, height: 230 })
    // 2D maps draw +y downward — min y at the top — matching the show
    // preview's projection and the stock sources' authoring convention.
    expect(square.points.map(({ x, y }) => [x, y])).toEqual([
      [23, 23],
      [437, 437],
    ])
    expect(wide.points.map(({ x, y }) => [x, y])).toEqual([
      [23, 11.5],
      [437, 218.5],
    ])
  })

  it('contains an extreme 2D aspect without stretching the geometry or burying facts', () => {
    const viewport = buildMapDiagnosticViewport({
      positions: [[0, 0], [1, 36]],
      displayDimension: 2,
      containerWidth: 400,
    })

    expect(viewport).toMatchObject({ width: 400, height: 500 })
    expect(viewport.points.map(({ x, y }) => [x, y])).toEqual([
      [193.75, 25],
      [206.25, 475],
    ])
  })

  it('centers and fits 3D geometry around its actual bounds', () => {
    const viewport = buildMapDiagnosticViewport({
      positions: [[0.1, 0.5, 0.1], [0.1, 0.5, 0.3]],
      displayDimension: 3,
      containerWidth: 460,
      camera: { azimuth: Math.PI / 2, elevation: 0, roll: 0 },
    })

    expect(viewport).toMatchObject({ width: 460, height: 460 })
    expect(viewport.points.map(({ x, y }) => [x, y])).toEqual([
      [23, 230],
      [437, 230],
    ])
  })

  it('magnifies 3D geometry and markers over the diagnostic auto-fit', () => {
    const geometry = prepareMapDiagnosticGeometry({
      positions: [[0.1, 0.5, 0.1], [0.1, 0.5, 0.3]],
      displayDimension: 3,
    })
    const fitted = projectMapDiagnosticGeometry({
      geometry,
      containerWidth: 460,
      camera: { azimuth: Math.PI / 2, elevation: 0, roll: 0 },
    })
    const zoomed = projectMapDiagnosticGeometry({
      geometry,
      containerWidth: 460,
      camera: { azimuth: Math.PI / 2, elevation: 0, roll: 0 },
      zoom: 2,
    })

    expect(zoomed.points.map(({ x, y }) => [x, y])).toEqual([
      [-184, 230],
      [644, 230],
    ])
    expect(zoomed.pointDiameterPx).toBe(12)
    expect(zoomed.labels).toEqual([])
    expect(zoomed.points.map(({ depth }) => depth)).toEqual(fitted.points.map(({ depth }) => depth))
    expect(zoomed.coordinateSummary).toBe(fitted.coordinateSummary)
  })

  it('accounts for coincident coordinates instead of making them look missing', () => {
    const viewport = buildMapDiagnosticViewport({
      positions: [[0, 0], [0, 0], [1, 1], [0, 0]],
      displayDimension: 2,
      containerWidth: 400,
    })

    expect(viewport.coordinateSummary).toEqual({
      pointCount: 4,
      uniquePointCount: 2,
      overlappingPointCount: 2,
      overlapLocationCount: 1,
      maxStack: 3,
    })
  })

  it('keeps index labels bounded and spatially separated', () => {
    const viewport = buildMapDiagnosticViewport({
      positions: Array.from({ length: 128 }, (_, index) => [index / 127, 0.5] as const),
      displayDimension: 2,
      containerWidth: 400,
    })

    expect(viewport.labels.length).toBeLessThanOrEqual(12)
    expect(viewport.labels.map(({ index }) => index)).toEqual(
      expect.arrayContaining([0, 127]),
    )
    for (let left = 0; left < viewport.labels.length; left += 1) {
      for (let right = left + 1; right < viewport.labels.length; right += 1) {
        expect(Math.hypot(
          viewport.labels[left].x - viewport.labels[right].x,
          viewport.labels[left].y - viewport.labels[right].y,
        )).toBeGreaterThanOrEqual(30)
      }
    }
  })

  it('chooses a readable marker diameter from map density alone', () => {
    const sparse = buildMapDiagnosticViewport({
      positions: Array.from({ length: 16 }, (_, index) => [index / 15, 0.5] as const),
      displayDimension: 2,
      containerWidth: 400,
    })
    const dense = buildMapDiagnosticViewport({
      positions: Array.from({ length: 4096 }, (_, index) => [index / 4095, 0.5] as const),
      displayDimension: 2,
      containerWidth: 400,
    })

    expect(sparse.pointDiameterPx).toBe(6)
    expect(dense.pointDiameterPx).toBeCloseTo(2.1875)
  })

  it('reuses static coordinate analysis while an orbit camera moves', () => {
    const geometry = prepareMapDiagnosticGeometry({
      positions: [[0, 0, 0], [1, 1, 1]],
      displayDimension: 3,
    })
    const first = projectMapDiagnosticGeometry({
      geometry,
      containerWidth: 400,
      camera: { azimuth: 0, elevation: 0, roll: 0 },
    })
    const moved = projectMapDiagnosticGeometry({
      geometry,
      containerWidth: 400,
      camera: { azimuth: 1, elevation: 0.5, roll: 0 },
    })

    expect(moved.coordinateSummary).toBe(first.coordinateSummary)
    expect(moved.points).not.toEqual(first.points)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { paintMapDiagnosticCanvas } from './mapDiagnosticRenderer'
import type { MapDiagnosticViewport } from './mapDiagnosticViewport'

describe('Map diagnostic renderer', () => {
  it('draws every projected index additively, including coincident points', () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
      globalCompositeOperation: 'source-over',
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement
    const viewport: MapDiagnosticViewport = {
      width: 320,
      height: 320,
      pointDiameterPx: 4,
      points: [
        { index: 0, x: 160, y: 160, depth: -0.2 },
        { index: 1, x: 160, y: 160, depth: 0.2 },
      ],
      labels: [],
      coordinateSummary: {
        pointCount: 2,
        uniquePointCount: 1,
        overlappingPointCount: 1,
        overlapLocationCount: 1,
        maxStack: 2,
      },
    }

    paintMapDiagnosticCanvas(canvas, viewport, [[0.2, 0.2, 0.2], [1, 0.75, 0.14]])

    expect(canvas).toMatchObject({ width: 320, height: 320 })
    expect(context.globalCompositeOperation).toBe('lighter')
    expect(context.arc).toHaveBeenCalledTimes(2)
    expect(context.arc).toHaveBeenNthCalledWith(1, 160, 160, 2, 0, Math.PI * 2)
    expect(context.arc).toHaveBeenNthCalledWith(2, 160, 160, 2, 0, Math.PI * 2)
  })
})

import { describe, expect, it } from 'vitest'
import { buildShowStageDiagnosticRects } from '@/engine/showStageDiagnostics'

describe('buildShowStageDiagnosticRects (#491)', () => {
  it('projects each staged Zone into a restrained bounding rectangle', () => {
    const rects = buildShowStageDiagnosticRects(
      [[0, 0], [0.4, 0.5], [0.6, 0.2], [1, 1]],
      {
        zones: [
          { id: 'left', name: 'Left', color: '#00f', pixelCount: 2, offStage: false },
          { id: 'right', name: 'Right', color: '#f00', pixelCount: 2, offStage: false },
        ],
        pixelZoneIds: ['left', 'left', 'right', 'right'],
        unstagedPixelCount: 0,
      },
    )

    expect(rects).toEqual([
      { zoneId: 'left', name: 'Left', color: '#00f', x: 0, y: 0, width: 0.4, height: 0.5 },
      { zoneId: 'right', name: 'Right', color: '#f00', x: 0.6, y: 0.2, width: 0.4, height: 0.8 },
    ])
  })

  it('omits off-stage and empty Zones and gives one-dimensional geometry a visible extent', () => {
    const rects = buildShowStageDiagnosticRects(
      [[0.5, 0.1], [0.5, 0.9]],
      {
        zones: [
          { id: 'line', name: 'Line', color: '#0f0', pixelCount: 2, offStage: false },
          { id: 'gone', name: 'Gone', color: '#fff', pixelCount: 0, offStage: true },
        ],
        pixelZoneIds: ['line', 'line'],
        unstagedPixelCount: 0,
      },
    )

    expect(rects).toHaveLength(1)
    expect(rects[0].width).toBeGreaterThan(0)
  })
})

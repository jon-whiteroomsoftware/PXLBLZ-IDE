import {
  explicitPatternMapUsers,
  labelStyle,
  mapFacts,
  wireGeometry,
  wireLabelIndices,
  wireLabels2D,
  wireLabels3D,
  wireOrderColors,
} from './mapContext'
import { DEFAULT_ORBIT } from './camera'
import type { MapPoint } from './maps'

describe('map context wiring helpers', () => {
  it('builds the mock wire-order label cadence as one-based labels', () => {
    expect(wireLabelIndices(256)).toEqual([0, 31, 63, 95, 127, 159, 191, 223, 255])
    expect(wireLabelIndices(33)).toEqual([0, 31, 32])
  })

  it('creates an amber wire-order gradient', () => {
    const colors = wireOrderColors(3)
    expect(colors[0]).toEqual([42 / 255, 42 / 255, 48 / 255])
    expect(colors[2]).toEqual([251 / 255, 191 / 255, 36 / 255])
    expect(colors[1][0]).toBeGreaterThan(colors[0][0])
  })

  it('converts 1D maps into a horizontal strip geometry', () => {
    const points: MapPoint[] = [{ sample: [0] }, { sample: [0.5] }, { sample: [1] }]
    expect(wireGeometry(points, 1)).toEqual({
      kind: '2d',
      displayDim: 1,
      positions: [[0, 0.5], [0.5, 0.5], [1, 0.5]],
    })
  })

  it('reports grid facts ahead of numeric bounds', () => {
    const points: MapPoint[] = [
      { sample: [0, 0], pos: [0, 0] },
      { sample: [1, 0], pos: [1, 0] },
      { sample: [0, 1], pos: [0, 1] },
      { sample: [1, 1], pos: [1, 1] },
    ]
    expect(mapFacts(points, 2, { cols: 2, rows: 2 })).toEqual({
      pixels: 4,
      arity: '2D',
      bounds: '2 x 2',
    })
  })

  it('projects labels for 2D and 3D geometry into canvas space', () => {
    const points2d: [number, number][] = [[0, 0], [1, 1]]
    expect(wireLabels2D(points2d, 100, 100, [0, 1])).toEqual([
      expect.objectContaining({ label: '1' }),
      expect.objectContaining({ label: '2' }),
    ])

    const points3d: [number, number, number][] = [[0, 0, 0], [1, 1, 1]]
    expect(wireLabels3D(points3d, 100, DEFAULT_ORBIT, [0, 1])).toEqual([
      expect.objectContaining({ label: '1' }),
      expect.objectContaining({ label: '2' }),
    ])
  })

  it('finds only patterns with explicit map settings', () => {
    const users = explicitPatternMapUsers([
      { name: 'Default map' },
      { name: 'Cube user', settings: { mapId: 'cube' } },
      { name: 'Plane user', settings: { mapId: 'plane' } },
    ], 'cube')
    expect(users.map((pattern) => pattern.name)).toEqual(['Cube user'])
  })

  it('clamps label styles to the canvas box', () => {
    expect(labelStyle({ index: 0, label: '1', x: -10, y: 200 }, 100, 100)).toEqual({
      left: '0%',
      top: '100%',
    })
  })
})

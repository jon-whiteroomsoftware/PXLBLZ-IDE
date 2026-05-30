import {
  canvasSize,
  clampGridDim,
  clampPixelCount,
  fitSpacing,
  MAX_GRID_AXIS,
  MAX_PIXEL_COUNT,
  pointSize,
  projectIndex,
  type Locked2DGrid,
} from './camera'

describe('camera — freeze guard', () => {
  it('caps total pixel count at 65,536', () => {
    expect(MAX_PIXEL_COUNT).toBe(65536)
    expect(clampPixelCount(1_000_000)).toBe(65536)
    expect(clampPixelCount(100)).toBe(100)
  })

  it('keeps a sane per-axis generator cap at 256', () => {
    expect(MAX_GRID_AXIS).toBe(256)
    expect(clampGridDim(1000)).toBe(256)
    expect(clampGridDim(32)).toBe(32)
  })

  it('clamps non-positive / non-finite to 1', () => {
    expect(clampGridDim(0)).toBe(1)
    expect(clampGridDim(NaN)).toBe(1)
    expect(clampPixelCount(0)).toBe(1)
  })
})

describe('camera — fit-to-container & sizing', () => {
  it('derives spacing so cols fill the container width', () => {
    expect(fitSpacing(640, 32)).toBe(20)
    expect(fitSpacing(100, 1)).toBe(100)
  })

  it('never produces a sub-pixel spacing', () => {
    expect(fitSpacing(10, 1000)).toBe(1)
  })

  it('sizes the canvas to cols×rows of dots at spacing apart', () => {
    expect(canvasSize({ rows: 16, cols: 32, spacing: 20 })).toEqual({ width: 640, height: 320 })
  })

  it('point size matches the dot diameter (dots just touch)', () => {
    expect(pointSize({ rows: 8, cols: 8, spacing: 20 })).toBe(20)
    expect(pointSize({ rows: 8, cols: 8, spacing: 0.4 })).toBe(1)
  })
})

describe('camera — locked-2D projection', () => {
  const grid: Locked2DGrid = { rows: 2, cols: 2, spacing: 20 }

  it('maps the default grid to the expected clip-space layout', () => {
    // Dot centres at fractions (0.25, 0.75) of each axis; y is flipped (up).
    expect(projectIndex(0, grid)).toEqual([-0.5, 0.5]) // col 0, row 0 (top-left)
    expect(projectIndex(1, grid)).toEqual([0.5, 0.5]) // col 1, row 0 (top-right)
    expect(projectIndex(2, grid)).toEqual([-0.5, -0.5]) // col 0, row 1 (bottom-left)
    expect(projectIndex(3, grid)).toEqual([0.5, -0.5]) // col 1, row 1 (bottom-right)
  })

  it('returns null for indices beyond the grid row count', () => {
    expect(projectIndex(4, grid)).toBeNull()
  })

  it('is coordinate-identical to the legacy cx = col*spacing + spacing/2 centres', () => {
    const g: Locked2DGrid = { rows: 4, cols: 8, spacing: 13 }
    const { width, height } = canvasSize(g)
    for (let i = 0; i < g.rows * g.cols; i++) {
      const col = i % g.cols
      const row = Math.floor(i / g.cols)
      const cx = col * g.spacing + g.spacing / 2
      const cy = row * g.spacing + g.spacing / 2
      const expected: [number, number] = [(cx / width) * 2 - 1, 1 - (cy / height) * 2]
      const got = projectIndex(i, g)!
      expect(got[0]).toBeCloseTo(expected[0], 10)
      expect(got[1]).toBeCloseTo(expected[1], 10)
    }
  })

  it('projection is independent of spacing (spacing only scales the canvas)', () => {
    expect(projectIndex(1, { rows: 2, cols: 2, spacing: 20 })).toEqual(
      projectIndex(1, { rows: 2, cols: 2, spacing: 5 })
    )
  })
})

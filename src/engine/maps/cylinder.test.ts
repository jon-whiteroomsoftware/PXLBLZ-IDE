import { createCylinderMap, cylinderPoint, cylinderDims } from './cylinder'

describe('cylinderDims', () => {
  it('makes the circumference ~π× denser than the height (square surface dots)', () => {
    const { rows, cols } = cylinderDims(1000)
    expect(cols / rows).toBeGreaterThan(2.5)
    expect(cols / rows).toBeLessThan(3.7)
  })

  it('holds at least the requested count', () => {
    const { rows, cols } = cylinderDims(512)
    expect(rows * cols).toBeGreaterThanOrEqual(512)
  })

  it('stays valid for a degenerate count', () => {
    expect(cylinderDims(1)).toEqual({ rows: 1, cols: 2 })
  })
})

describe('cylinderPoint', () => {
  it('samples flat 2D grid coords but draws a 3D position', () => {
    const p = cylinderPoint(0, { rows: 4, cols: 4 })
    expect(p.sample).toHaveLength(2)
    expect(p.pos).toHaveLength(3)
  })

  it('wraps the circumference: col 0 sits at angle 0 on the +x seam', () => {
    const p = cylinderPoint(0, { rows: 2, cols: 4 })
    // u=0 → cos0=1, sin0=0 → x=1, z=0.5 (radius 0.5 centred at 0.5)
    expect(p.pos![0]).toBeCloseTo(1)
    expect(p.pos![2]).toBeCloseTo(0.5)
  })

  it('climbs y with the row (height channel)', () => {
    const lo = cylinderPoint(0, { rows: 3, cols: 2 }) // row 0
    const hi = cylinderPoint(4, { rows: 3, cols: 2 }) // row 2
    expect(lo.pos![1]).toBeCloseTo(0)
    expect(hi.pos![1]).toBeCloseTo(1)
    // pos.y mirrors the sample's v.
    expect(hi.pos![1]).toBeCloseTo(hi.sample[1])
  })

  it('keeps every drawn position inside the unit cube', () => {
    for (let i = 0; i < 16; i++) {
      const { pos } = cylinderPoint(i, { rows: 4, cols: 4 })
      for (const c of pos!) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('createCylinderMap', () => {
  it('is a 2D-sample / 3D-display map so it lists for 2D patterns but orbits', () => {
    const m = createCylinderMap({ rows: 4, cols: 4 })
    expect(m.dim).toBe(2)
    expect(m.displayDim).toBe(3)
    expect(m.builtin).toBe(true)
  })

  it('resolves one point per modeled index', () => {
    const m = createCylinderMap({ rows: 4, cols: 4 })
    expect(m.resolve(16)).toHaveLength(16)
  })
})

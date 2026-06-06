import { describe, it, expect } from 'vitest'
import { detectGridDims, bakeMapSource } from './bake'

describe('detectGridDims', () => {
  it('recognises a regular 2D lattice as cols×rows (x-fastest)', () => {
    // 3 cols × 2 rows, row-major
    const coords = [
      [0, 0], [1, 0], [2, 0],
      [0, 1], [1, 1], [2, 1],
    ]
    expect(detectGridDims(coords)).toEqual({ cols: 3, rows: 2 })
  })

  it('treats a single row as an N×1 grid', () => {
    expect(detectGridDims([[0, 0], [1, 0], [2, 0]])).toEqual({ cols: 3, rows: 1 })
  })

  it('recognises a regular 3D lattice as cols×rows×depth', () => {
    const coords: number[][] = []
    for (let z = 0; z < 2; z++)
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 4; x++) coords.push([x, y, z])
    expect(detectGridDims(coords)).toEqual({ cols: 4, rows: 3, depth: 2 })
  })

  it('returns null for an irregular cloud (ring)', () => {
    const coords = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2
      return [Math.cos(a), Math.sin(a)]
    })
    expect(detectGridDims(coords)).toBeNull()
  })

  it('returns null for a diagonal (distinct-product overshoots count)', () => {
    expect(detectGridDims([[0, 0], [1, 1], [2, 2]])).toBeNull()
  })

  it('returns null when the lattice product matches but a cell is doubled', () => {
    // 2×2 product = 4 points, but (0,0) twice and (1,1) missing → not a full grid
    expect(detectGridDims([[0, 0], [0, 0], [1, 0], [0, 1]])).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(detectGridDims([])).toBeNull()
  })
})

describe('bakeMapSource', () => {
  it('bakes a regular 2D grid: normalized points, dim 2, grid dims', () => {
    const src = `function(pixelCount) {
      var coords = []
      for (var i = 0; i < pixelCount; i++) coords.push([i % 4, Math.floor(i / 4)])
      return coords
    }`
    const baked = bakeMapSource(src, 8) // 4 cols × 2 rows
    expect(baked.dim).toBe(2)
    expect(baked.gridDims).toEqual({ cols: 4, rows: 2 })
    expect(baked.points).toHaveLength(8)
    // aspect-preserving: the 4-wide axis (range 3, longest) fills [0,1];
    // the 2-tall axis (range 1) scales by the same factor → 1/3, so the baked
    // rectangle is 3:1, not stretched to a unit square.
    expect(baked.points[0]).toEqual([0, 0])
    expect(baked.points[7]).toEqual([1, 1 / 3])
  })

  it('bakes a "twice as wide" authored grid to a ~2:1 rectangle (aspect preserved)', () => {
    // The user-facing "aim for 2× wide" map: rows ≈ sqrt(count/2), cols fills the rest.
    const src = `function(pixelCount) {
      var rows = Math.max(1, Math.round(Math.sqrt(pixelCount / 2)))
      var cols = Math.ceil(pixelCount / rows)
      var coords = []
      for (var i = 0; i < pixelCount; i++) coords.push([i % cols, Math.floor(i / cols)])
      return coords
    }`
    const baked = bakeMapSource(src, 4096) // → 92 cols × 45 rows (last row partial)
    let maxX = 0, maxY = 0
    for (const [x, y] of baked.points) { if (x > maxX) maxX = x; if (y > maxY) maxY = y }
    expect(maxX).toBe(1) // long axis fills [0,1]
    // short axis lands near 0.5 → the drawn rectangle is about twice as wide as tall.
    expect(maxY).toBeGreaterThan(0.45)
    expect(maxY).toBeLessThan(0.5)
  })

  it('bakes a 3D source with dim 3 and depth', () => {
    const src = `function(pixelCount) {
      var coords = []
      for (var z = 0; z < 2; z++)
        for (var y = 0; y < 2; y++)
          for (var x = 0; x < 2; x++) coords.push([x, y, z])
      return coords
    }`
    const baked = bakeMapSource(src, 8)
    expect(baked.dim).toBe(3)
    expect(baked.gridDims).toEqual({ cols: 2, rows: 2, depth: 2 })
  })

  it('bakes an irregular cloud with null grid dims', () => {
    const src = `function(pixelCount) {
      var coords = []
      for (var i = 0; i < pixelCount; i++) {
        var a = i / pixelCount * 6.283
        coords.push([Math.cos(a), Math.sin(a)])
      }
      return coords
    }`
    const baked = bakeMapSource(src, 12)
    expect(baked.dim).toBe(2)
    expect(baked.gridDims).toBeNull()
  })

  it('throws when the source returns mixed arity', () => {
    const src = `function(pixelCount) { return [[0, 0], [0, 0, 0]] }`
    expect(() => bakeMapSource(src, 2)).toThrow(/arity/)
  })

  it('throws when the source throws while generating', () => {
    const src = `function(pixelCount) { throw new Error('boom') }`
    expect(() => bakeMapSource(src, 4)).toThrow(/boom/)
  })

  it('throws when the source does not compile', () => {
    expect(() => bakeMapSource('function(pixelCount) { return [[', 4)).toThrow(/compile/)
  })
})

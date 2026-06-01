import { describe, it, expect } from 'vitest'
import { cylinderWallRadius, cylinderWallDiameter } from './cylinderWall'

describe('cylinderWall (shared pi-cell geometry, #159)', () => {
  it('derives the square-cell radius rho = cols/(2π(rows-1))', () => {
    expect(cylinderWallRadius(20, 10)).toBeCloseTo(20 / (2 * Math.PI * 9), 12)
    expect(cylinderWallDiameter(20, 10)).toBeCloseTo(2 * (20 / (2 * Math.PI * 9)), 12)
  })

  it('diameter is exactly twice the radius', () => {
    const rho = cylinderWallRadius(7, 5)!
    expect(cylinderWallDiameter(7, 5)).toBeCloseTo(2 * rho, 12)
  })

  it('degenerates to no wall for a single-row ring', () => {
    expect(cylinderWallRadius(8, 1)).toBeNull()
    expect(cylinderWallDiameter(8, 1)).toBe(Infinity)
  })
})

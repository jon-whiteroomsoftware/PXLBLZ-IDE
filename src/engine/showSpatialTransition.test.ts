import { spatialSignedDistance, spatialTransitionMask } from './showSpatialTransition'

describe('Show spatial transition shapes', () => {
  it('evaluates circle, diamond, and ring signed distances', () => {
    expect(spatialSignedDistance('circle', 0.5, 0.5, {
      centerX: 0.5, centerY: 0.5, radius: 0.5,
    })).toBeCloseTo(-0.5)
    expect(spatialSignedDistance('diamond', 1, 0.5, {
      centerX: 0.5, centerY: 0.5, radius: 0.5,
    })).toBeCloseTo(0)
    expect(spatialSignedDistance('ring', 0.5, 0.5, {
      centerX: 0.5, centerY: 0.5, radius: 0.5, ringWidth: 0.2,
    })).toBeCloseTo(0.4)
    expect(spatialSignedDistance('ring', 1, 0.5, {
      centerX: 0.5, centerY: 0.5, radius: 0.5, ringWidth: 0.2,
    })).toBeCloseTo(-0.1)
  })

  it('rotates the diamond deterministically in turns', () => {
    expect(spatialSignedDistance('diamond', 1, 0.5, {
      centerX: 0.5,
      centerY: 0.5,
      radius: 0.5,
      rotationTurns: 0.125,
    })).toBeCloseTo(Math.SQRT1_2 - 0.5)
  })

  it.each([
    ['circle', [
      '.....',
      '..#..',
      '.###.',
      '..#..',
      '.....',
    ]],
    ['diamond', [
      '..#..',
      '.###.',
      '#####',
      '.###.',
      '..#..',
    ]],
    ['ring', [
      '.###.',
      '#...#',
      '#...#',
      '#...#',
      '.###.',
    ]],
  ] as const)('keeps a frame-stable %s mask example', (shape, expected) => {
    const options = {
      centerX: 0.5,
      centerY: 0.5,
      radius: shape === 'circle' ? 0.3 : shape === 'diamond' ? 0.5 : 0.5,
      ringWidth: 0.2,
    }
    const rows = Array.from({ length: 5 }, (_, row) => (
      Array.from({ length: 5 }, (_, column) => (
        spatialTransitionMask(shape, column / 4, row / 4, options) ? '#' : '.'
      )).join('')
    ))
    expect(rows).toEqual(expected)
  })
})

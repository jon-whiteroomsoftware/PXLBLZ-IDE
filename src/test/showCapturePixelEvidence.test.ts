import { describe, expect, it } from 'vitest'
import { changedPixelsBetween, samplesAt, type RgbaImage } from './showCapturePixelEvidence'

/** Two 3x2 captures, so a difference can be placed exactly rather than counted. */
function image(fill: number[][]): RgbaImage {
  return { width: 3, height: 2, pixels: fill.flat() }
}

const BASE = [
  [10, 10, 10, 255], [20, 20, 20, 255], [30, 30, 30, 255],
  [40, 40, 40, 255], [50, 50, 50, 255], [60, 60, 60, 255],
]

describe('reading a difference out of the retained captures', () => {
  it('finds no difference between one capture and itself', () => {
    expect(changedPixelsBetween(image(BASE), image(BASE))).toEqual([])
  })

  it('reports the exact position and both values of every changed pixel, in row order', () => {
    const other = BASE.map((pixel, index) => (index === 4 ? [50, 50, 49, 255] : index === 1 ? [21, 20, 20, 255] : pixel))
    expect(changedPixelsBetween(image(BASE), image(other))).toEqual([
      { x: 1, y: 0, left: [20, 20, 20, 255], right: [21, 20, 20, 255] },
      { x: 1, y: 1, left: [50, 50, 50, 255], right: [50, 50, 49, 255] },
    ])
  })

  it('treats an alpha-only difference as a difference, with no channel threshold anywhere', () => {
    const alpha = BASE.map((pixel, index) => (index === 0 ? [10, 10, 10, 254] : pixel))
    expect(changedPixelsBetween(image(BASE), image(alpha))).toHaveLength(1)
  })

  it('refuses to compare captures of different sizes', () => {
    const taller: RgbaImage = { width: 3, height: 3, pixels: [...BASE.flat(), 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255] }
    expect(() => changedPixelsBetween(image(BASE), taller)).toThrow(/never a pixel difference/)
  })
})

describe('sampling a capture at the implicated positions', () => {
  it('returns what the image holds there', () => {
    expect(samplesAt(image(BASE), [{ x: 2, y: 1 }, { x: 0, y: 0 }])).toEqual([
      { x: 2, y: 1, rgba: [60, 60, 60, 255] },
      { x: 0, y: 0, rgba: [10, 10, 10, 255] },
    ])
  })

  it('leaves out a position the capture does not cover rather than guessing one', () => {
    expect(samplesAt(image(BASE), [{ x: 3, y: 0 }, { x: 0, y: 2 }, { x: -1, y: 0 }])).toEqual([])
  })
})

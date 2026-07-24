import { describe, expect, it } from 'vitest'
import {
  colorValueToNormalizedRgb,
  formatColorValue,
  normalizedRgbToColorValue,
  parseColorValue,
} from './colorValue'

describe('authored Color values', () => {
  it.each([
    ['#000000', '#000000'],
    ['#FFFFFF', '#ffffff'],
    ['#ff0000', '#ff0000'],
    ['#00ff00', '#00ff00'],
    ['#0000ff', '#0000ff'],
    ['#12aBcF', '#12abcf'],
  ])('parses canonical six-digit hex (%s)', (input, expected) => {
    expect(parseColorValue(input)).toBe(expected)
  })

  it.each(['', '#fff', 'ffffff', '#gg0000', '#00000000', ' #000000'])('rejects invalid exact drafts (%s)', (input) => {
    expect(parseColorValue(input)).toBeNull()
  })

  it('formats invalid stored input with an explicit canonical fallback', () => {
    expect(formatColorValue(undefined, '#ABCDEF')).toBe('#abcdef')
    expect(formatColorValue('nope', '#123456')).toBe('#123456')
  })

  it.each([
    ['#000000', [0, 0, 0]],
    ['#ffffff', [1, 1, 1]],
    ['#ff0000', [1, 0, 0]],
    ['#00ff00', [0, 1, 0]],
    ['#0000ff', [0, 0, 1]],
    ['#123456', [0x12 / 255, 0x34 / 255, 0x56 / 255]],
  ] as const)('converts %s to normalized channels', (color, expected) => {
    expect(colorValueToNormalizedRgb(color)).toEqual(expected)
  })

  it('clamps channels and rounds at the nearest 8-bit boundary', () => {
    expect(normalizedRgbToColorValue([-1, 1.5, Number.NaN])).toBe('#00ff00')
    expect(normalizedRgbToColorValue([127.49 / 255, 127.5 / 255, 127.51 / 255])).toBe('#7f8080')
  })

  it('round-trips every 8-bit channel exactly through normalized storage', () => {
    for (let channel = 0; channel <= 255; channel += 1) {
      const hex = channel.toString(16).padStart(2, '0')
      const color = `#${hex}${hex}${hex}`
      expect(normalizedRgbToColorValue(colorValueToNormalizedRgb(color))).toBe(color)
    }
  })
})

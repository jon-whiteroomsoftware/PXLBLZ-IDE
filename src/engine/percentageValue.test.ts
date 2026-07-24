import {
  clampPercentageValue,
  formatPercentageValue,
  parsePercentageValue,
  percentageSliderPlacement,
  percentageValueFromPointer,
} from './percentageValue'

describe('authored percentage values (#608)', () => {
  it('parses percentage and normalized-decimal exact entry into real stored units', () => {
    expect(parsePercentageValue('72%')).toBe(0.72)
    expect(parsePercentageValue(' 72.5 % ')).toBe(0.725)
    expect(parsePercentageValue('0.72')).toBe(0.72)
    expect(parsePercentageValue('1.5')).toBe(1.5)
  })

  it('rejects incomplete and invalid drafts without inventing a value', () => {
    for (const draft of ['', ' ', '-', '.', '72%%', 'percent', Number.NaN, null]) {
      expect(parsePercentageValue(draft)).toBeNull()
    }
  })

  it('formats canonical percentage text across endpoints, gain values, and fine steps', () => {
    expect(formatPercentageValue(0)).toBe('0%')
    expect(formatPercentageValue(1)).toBe('100%')
    expect(formatPercentageValue(1.5)).toBe('150%')
    expect(formatPercentageValue(0.725, 0.001)).toBe('72.5%')
    expect(formatPercentageValue(1 / 3, 0.01)).toBe('33.333333%')
    expect(formatPercentageValue(-0)).toBe('0%')
  })

  it('clamps only at the explicit storage boundary', () => {
    expect(clampPercentageValue(-0.2, 0, 1)).toBe(0)
    expect(clampPercentageValue(0.72, 0, 1)).toBe(0.72)
    expect(clampPercentageValue(2.4, 0, 2)).toBe(2)
  })

  it('aligns the transient slider thumb to the initiating pointer without changing the value', () => {
    const placement = percentageSliderPlacement({
      pointerX: 400,
      anchorTop: 300,
      anchorBottom: 328,
      viewportWidth: 1_000,
      viewportHeight: 700,
      value: 0.72,
      min: 0,
      max: 1,
    })

    expect(placement.top).toBe(334)
    expect(placement.trackLeft + placement.trackWidth * 0.72).toBeCloseTo(400, 10)
    expect(percentageValueFromPointer(400, placement.trackLeft, placement.trackWidth, 0, 1, 0.01)).toBe(0.72)
  })

  it('clamps the overlay at viewport edges and keeps pointer scrubbing high-resolution', () => {
    const leftEdge = percentageSliderPlacement({
      pointerX: 2,
      anchorTop: 4,
      anchorBottom: 32,
      viewportWidth: 280,
      viewportHeight: 90,
      value: 0.5,
      min: 0,
      max: 1,
    })
    expect(leftEdge.left).toBe(8)
    expect(leftEdge.top).toBe(38)
    expect(leftEdge.left + leftEdge.width).toBeLessThanOrEqual(272)

    expect(percentageValueFromPointer(149.432, 20, 240, 0, 1, 0.01)).toBe(0.539)
    expect(percentageValueFromPointer(-100, 20, 240, 0, 1, 0.01)).toBe(0)
    expect(percentageValueFromPointer(500, 20, 240, 0, 1, 0.01)).toBe(1)
  })
})

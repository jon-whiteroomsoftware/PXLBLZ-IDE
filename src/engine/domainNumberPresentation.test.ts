import {
  formatDomainNumber,
  parseDomainNumber,
  resolveDomainNumberPresentation,
} from './domainNumberPresentation'

describe('multiplier and ratio presentation metadata (#610)', () => {
  it('parses multiplier and ratio exact entry into unchanged real numeric units', () => {
    expect(parseDomainNumber('multiplier', '1.5')).toBe(1.5)
    expect(parseDomainNumber('multiplier', ' 1.5x ')).toBe(1.5)
    expect(parseDomainNumber('multiplier', '0x')).toBe(0)
    expect(parseDomainNumber('ratio', '16:9')).toBeCloseTo(16 / 9, 12)
    expect(parseDomainNumber('ratio', ' 3 : 2 ')).toBe(1.5)
    expect(parseDomainNumber('ratio', '1.5')).toBe(1.5)
  })

  it('rejects partial drafts, misplaced suffixes, and invalid ratio denominators', () => {
    for (const draft of ['', ' ', '-', '.', '1xx', 'x1', 'ratio']) {
      expect(parseDomainNumber('multiplier', draft)).toBeNull()
    }
    for (const draft of ['', '16:', ':9', '16/9', '16:0', '16:-0', '1:2:3']) {
      expect(parseDomainNumber('ratio', draft)).toBeNull()
    }
  })

  it('formats canonical multiplier and recognizable ratio text with stable round trips', () => {
    expect(formatDomainNumber('multiplier', 0, 0.1)).toBe('0x')
    expect(formatDomainNumber('multiplier', 1, 0.1)).toBe('1x')
    expect(formatDomainNumber('multiplier', 1.5, 0.01)).toBe('1.5x')
    expect(formatDomainNumber('ratio', 1, 0.01)).toBe('1:1')
    expect(formatDomainNumber('ratio', 1.5, 0.01)).toBe('3:2')
    expect(formatDomainNumber('ratio', 16 / 9, 0.01)).toBe('16:9')
    expect(formatDomainNumber('ratio', 1.37, 0.01)).toBe('1.37')

    for (const value of [0, 0.125, 0.5, 1, 1.5, 4, 8]) {
      const formatted = formatDomainNumber('multiplier', value, 0.01)
      expect(parseDomainNumber('multiplier', formatted)).toBeCloseTo(value, 6)
    }
  })

  it('resolves bounds, step, neutral, and exact zero into one multiplier contract', () => {
    const presentation = resolveDomainNumberPresentation('multiplier', {
      min: 0,
      max: 4,
      step: 0.1,
    })

    expect(presentation).toMatchObject({
      kind: 'multiplier',
      min: 0,
      max: 4,
      step: 0.1,
      neutral: 1,
      neutralPosition: 0.5,
    })
    expect(presentation.fromSliderPosition(0)).toBe(0)
    expect(presentation.fromSliderPosition(0.5)).toBe(1)
    expect(presentation.fromSliderPosition(1)).toBe(4)
    expect(presentation.toSliderPosition(0)).toBe(0)
    expect(presentation.toSliderPosition(1)).toBe(0.5)
    expect(presentation.toSliderPosition(4)).toBe(1)
  })

  it('keeps useful multiplier precision on both sides of neutral and remains monotonic and invertible', () => {
    const presentation = resolveDomainNumberPresentation('multiplier', {
      min: 0,
      max: 4,
      step: 0.1,
    })
    const positions = Array.from({ length: 101 }, (_, index) => index / 100)
    const values = positions.map((position) => presentation.fromSliderPosition(position))

    expect(presentation.fromSliderPosition(0.45)).toBeGreaterThan(0.9)
    expect(presentation.fromSliderPosition(0.55)).toBeLessThan(1.1)
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true)
    positions.forEach((position) => {
      expect(presentation.toSliderPosition(presentation.fromSliderPosition(position))).toBeCloseTo(position, 8)
    })
  })

  it('handles neutral at either multiplier endpoint without losing exact bounds', () => {
    const aboveNeutral = resolveDomainNumberPresentation('multiplier', { min: 1, max: 8, step: 0.1 })
    const belowNeutral = resolveDomainNumberPresentation('multiplier', { min: 0.01, max: 1, step: 0.01 })

    expect(aboveNeutral.neutralPosition).toBe(0)
    expect(aboveNeutral.fromSliderPosition(0)).toBe(1)
    expect(aboveNeutral.fromSliderPosition(1)).toBe(8)
    expect(belowNeutral.neutralPosition).toBe(1)
    expect(belowNeutral.fromSliderPosition(0)).toBe(0.01)
    expect(belowNeutral.fromSliderPosition(1)).toBe(1)
  })

  it('uses multiplicative ratio travel with exact endpoints and neutral', () => {
    const presentation = resolveDomainNumberPresentation('ratio', {
      min: 0.25,
      max: 4,
      step: 0.01,
    })

    expect(presentation.neutralPosition).toBeCloseTo(0.5, 12)
    expect(presentation.fromSliderPosition(0)).toBe(0.25)
    expect(presentation.fromSliderPosition(presentation.neutralPosition)).toBeCloseTo(1, 12)
    expect(presentation.fromSliderPosition(1)).toBe(4)
    for (const position of [0, 0.1, 0.4, 0.5, 0.8, 1]) {
      expect(presentation.toSliderPosition(presentation.fromSliderPosition(position))).toBeCloseTo(position, 8)
    }
  })
})

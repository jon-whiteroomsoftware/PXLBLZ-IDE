import { describe, expect, it } from 'vitest'
import {
  PROPERTY_LANE_FAMILIES,
  propertyLaneFamilyColor,
  propertyLaneFamilyName,
  qualifiedPropertyLabel,
} from './showPropertyLaneFamilies'

describe('Show property lane families (#631)', () => {
  it('gives every family its own colour so stacked lanes are not uniformly violet', () => {
    const colors = PROPERTY_LANE_FAMILIES.map((family) => propertyLaneFamilyColor(family))
    expect(new Set(colors).size).toBe(PROPERTY_LANE_FAMILIES.length)
    expect(colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true)
  })

  it('names each family for hover text', () => {
    expect(propertyLaneFamilyName('time')).toBe('Animation speed')
    expect(propertyLaneFamilyName('control')).toBe('Pattern control')
    expect(propertyLaneFamilyName('appearance')).toBe('Appearance')
    expect(propertyLaneFamilyName('transform')).toBe('Transform')
    expect(propertyLaneFamilyName('effect')).toBe('Effect parameter')
  })

  it('keeps the accessible name unambiguous where the visible label is bare', () => {
    // 'speed' reads bare on the lane, but a Pattern control named 'speed' and
    // the Clip's animation speed must stay distinguishable to assistive tech.
    expect(qualifiedPropertyLabel('time', 'speed')).toBe('animation speed')
    expect(qualifiedPropertyLabel('control', 'speed')).toBe('speed control')
    expect(qualifiedPropertyLabel('appearance', 'brightness')).toBe('brightness')
    expect(qualifiedPropertyLabel('transform', 'translate X')).toBe('translate X')
    expect(qualifiedPropertyLabel('effect', 'translate translateX')).toBe('translate translateX')
  })
})

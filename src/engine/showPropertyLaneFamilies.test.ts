import { describe, expect, it } from 'vitest'
import {
  PROPERTY_LANE_FAMILIES,
  propertyLaneFamilyColor,
  propertyLaneFamilyName,
  propertyLanePresentation,
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

describe('propertyLanePresentation (#63)', () => {
  it.each([
    ['transform', 'position x', 'move', 'X'],
    ['transform', 'positionY', 'move', 'Y'],
    ['transform', 'rotation', 'rotate', 'turns'],
    ['transform', 'scale y', 'scale', 'Y'],
    ['transform', 'scaleX', 'scale', 'X'],
    ['effect', 'translate X', 'move', 'X'],
    ['effect', 'rotate turns', 'rotate', 'turns'],
    ['effect', 'scale X', 'scale', 'X'],
    ['effect', 'shear Y', 'shear', 'Y'],
  ] as const)('%s %s reads as a %s glyph with %s', (family, propertyLabel, glyph, displayProperty) => {
    expect(propertyLanePresentation(family, propertyLabel)).toEqual({ glyph, displayProperty })
  })

  it.each([
    ['transform', 'viewport width'],
    ['effect', 'ripple frequency'],
    ['appearance', 'brightness'],
    ['control', 'speed'],
  ] as const)('keeps %s %s as text', (family, propertyLabel) => {
    expect(propertyLanePresentation(family, propertyLabel)).toEqual({ glyph: null, displayProperty: propertyLabel })
  })
})

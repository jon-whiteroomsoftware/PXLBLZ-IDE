import { describe, expect, it } from 'vitest'
import { resolvePropertyLaneDisplayLabels } from './showPropertyLaneLabels'

describe('resolvePropertyLaneDisplayLabels (#631)', () => {
  it('names a lane by its property alone when that property is unambiguous in the Zone', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'animation speed', ownerName: 'CompassRose' },
      { propertyLabel: 'brightness', ownerName: 'CompassRose' },
      { propertyLabel: 'opacity', ownerName: 'SignalMandala' },
      { propertyLabel: 'translate X', ownerName: 'CompassRose' },
    ])).toEqual(['animation speed', 'brightness', 'opacity', 'translate X'])
  })

  it('leaves Zone-level lanes that have no owning Clip bare', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'animation speed' },
      { propertyLabel: 'brightness' },
    ])).toEqual(['animation speed', 'brightness'])
  })

  it('abbreviates the owning Clip only on the lanes that would otherwise collide', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'brightness', ownerName: 'CompassRose' },
      { propertyLabel: 'brightness', ownerName: 'SignalMandala' },
      { propertyLabel: 'opacity', ownerName: 'CompassRose' },
    ])).toEqual(['CR brightness', 'SM brightness', 'opacity'])
  })

  it('distinguishes a Zone-level lane from a Clip lane animating the same property', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'brightness' },
      { propertyLabel: 'brightness', ownerName: 'CompassRose' },
    ])).toEqual(['brightness', 'CR brightness'])
  })

  it('falls back to full Clip names when abbreviations would themselves collide', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'brightness', ownerName: 'CompassRose' },
      { propertyLabel: 'brightness', ownerName: 'ColorRipple' },
    ])).toEqual(['CompassRose brightness', 'ColorRipple brightness'])
  })

  it('abbreviates single-word Clip names without internal capitals', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'brightness', ownerName: 'Caustics' },
      { propertyLabel: 'brightness', ownerName: 'SignalMandala' },
    ])).toEqual(['Ca brightness', 'SM brightness'])
  })
})

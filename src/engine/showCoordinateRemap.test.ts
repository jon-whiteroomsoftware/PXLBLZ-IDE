import { describe, expect, it } from 'vitest'
import {
  clampShowRepeatScale,
  remapShowIndex,
  remapShowSample,
} from './showCoordinateRemap'

describe('Show coordinate remapping', () => {
  it('keeps repeat scale one as an exact identity, including the closed edge', () => {
    expect(remapShowSample([1], 1)).toEqual([1])
    expect(remapShowSample([0.25, 0.75], 1)).toEqual([0.25, 0.75])
  })

  it('tiles one- and two-dimensional local sample domains', () => {
    expect(remapShowSample([0.25], 2)).toEqual([0.5])
    expect(remapShowSample([0.25, 0.75], 2)).toEqual([0.5, 0.5])
    expect(remapShowSample([1, 1], 2)).toEqual([0, 0])
  })

  it('clamps the authored repeat scale to the product range', () => {
    expect(clampShowRepeatScale(0)).toBe(1)
    expect(clampShowRepeatScale(20)).toBe(8)
    expect(remapShowSample([0.2], 20)[0]).toBeCloseTo(0.6)
  })

  it('maps a 1D local index through the same repeated domain', () => {
    expect(remapShowIndex(3, 5, 1)).toBe(3)
    expect(remapShowIndex(2, 5, 2)).toBe(0)
    expect(remapShowIndex(4, 5, 2)).toBe(0)
  })

  it('rejects an undefined 3D remapping policy', () => {
    expect(() => remapShowSample([0.1, 0.2, 0.3], 2)).toThrow('1D or 2D')
  })
})

import { describe, expect, it } from 'vitest'
import {
  formatShowBoundaryIdentity,
  formatShowClipIdentity,
} from './showClipIdentity'

describe('Show Clip identity (#634)', () => {
  it('identifies one Clip by its Show-global start and Pattern name', () => {
    expect(formatShowClipIdentity(15_000, 'CompassRose')).toBe('15.0: CompassRose')
  })

  it('keeps a boundary with several incoming Clips compact', () => {
    expect(formatShowBoundaryIdentity(15_000, ['CompassRose', 'CometLoom', 'Rings']))
      .toBe('15.0: CompassRose + 2')
  })

  it('uses the boundary time alone when no incoming Pattern is available', () => {
    expect(formatShowBoundaryIdentity(75_250, [])).toBe('1:15.3')
  })

})

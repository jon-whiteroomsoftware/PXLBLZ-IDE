import { describe, expect, it } from 'vitest'
import { addShowZone, createDefaultShow, placeShowClip } from './showModel'
import {
  formatShowBoundaryIdentity,
  formatShowClipIdentity,
  showBoundaryClipIdentity,
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

  it('projects one incoming Clip from an internal boundary', () => {
    const show = createDefaultShow('boundary-identity', 'Boundary identity', 100)

    expect(showBoundaryClipIdentity(show, 'scene-1')).toBe('32.0: CometLoom')
  })

  it('counts additional incoming Clips without listing them', () => {
    const withZone = addShowZone(
      createDefaultShow('multi-boundary-identity', 'Multi boundary identity', 100),
      { name: 'right', nominalPixelCount: 60 },
    )
    const show = placeShowClip(withZone, withZone.zones[1].id, 'scene-2', {
      pattern: { kind: 'stock', id: 'Rings' },
      patternName: 'Rings',
    })

    expect(showBoundaryClipIdentity(show, 'scene-1')).toBe('32.0: CometLoom + 1')
  })

  it('falls back to Show End when an internal boundary cannot be resolved', () => {
    const show = createDefaultShow('missing-boundary-identity', 'Missing boundary identity', 100)

    expect(showBoundaryClipIdentity(show, 'missing-boundary')).toBe('1:02.0')
  })
})

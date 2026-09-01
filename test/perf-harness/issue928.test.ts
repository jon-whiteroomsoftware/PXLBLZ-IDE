import { describe, expect, it } from 'vitest'
import { issue928Fixtures } from './issue928'

describe('#928 paired fixtures', () => {
  it('differs only where the census found per-pixel route constants', () => {
    const fixtures = issue928Fixtures()
    const byId = Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture.byteIdentical]))
    expect(byId).toEqual({
      'portable-zones': false,
      'aperture-shapes': false,
      'zone-layouts-stripes-grid': false,
      // Index-routed Installation Shows synthesize zone-local coordinates
      // from literal zone sizes, so they carry no route-constant sites.
      'redline-reference': true,
      'five-pattern-acceptance': true,
      'hsv-steady-light': true,
    })
    for (const fixture of fixtures) {
      expect(fixture.on.summary.resources.blockers, fixture.id).toEqual([])
    }
  })
})

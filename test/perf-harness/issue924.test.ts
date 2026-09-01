import { describe, expect, it } from 'vitest'
import {
  ISSUE924_DISPATCH_PROBES,
  dispatchProbeCode,
  issue924Fixtures,
} from './issue924'

describe('wave-5 attribution fixtures (#924)', () => {
  it('builds every ladder rung for every fixture with the member under test first', () => {
    const fixtures = issue924Fixtures()
    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      'redline-reference',
      'hsv-steady-light',
      'heavy-steady-zippyzaps',
      'heavy-steady-caustics',
      'heavy-steady-kishimisu',
      'heavy-steady-phantomstar',
      'effect-tax',
      'mirror',
      'portable-zones',
      'aperture-shapes',
      'five-pattern-acceptance',
    ])
    for (const fixture of fixtures) {
      expect(fixture.artifacts.full.code.length, fixture.id).toBeGreaterThan(0)
      expect(fixture.artifacts.constantMembers.code.length, fixture.id).toBeGreaterThan(0)
      // The constant rung keeps the generated machinery and replaces member
      // bodies with constants; it is a different artifact that still owns
      // the Show's own scheduler. (It is not always smaller: constant members
      // can lose specializations the real members qualified for, which the
      // report discloses per fixture.)
      expect(fixture.artifacts.constantMembers.code, fixture.id).not.toBe(fixture.artifacts.full.code)
      expect(fixture.artifacts.constantMembers.code, fixture.id).toContain('export function beforeRender')
      expect(fixture.artifacts.production.summary.resources.blockers, fixture.id).toEqual([])
    }
    // Heavy steady fixtures put the heavy member in the first Scene so the
    // measurement window (settle + sample after activation) sees it alone.
    for (const member of ['ZippyZaps', 'Caustics', 'Kishimisu', 'PhantomStar']) {
      const fixture = fixtures.find((candidate) => candidate.id === `heavy-steady-${member.toLowerCase()}`)!
      expect(fixture.artifacts.production.summary.resources.blockers, fixture.id).toEqual([])
      expect(fixture.sampleMs).toBeGreaterThanOrEqual(6_000)
    }
  })

  it('bundles each dispatch probe to a single native paint', () => {
    for (const probe of ISSUE924_DISPATCH_PROBES) {
      const code = dispatchProbeCode(probe.source)
      expect(code, probe.id).toMatch(/export function render(2D|3D)?\(/)
      expect((code.match(/\brgb\(/g) ?? []).length, probe.id).toBe(1)
    }
  })
})

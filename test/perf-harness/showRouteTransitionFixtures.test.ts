import {
  buildRouteTransitionFixtureSource,
  routeTransitionFixtureNames,
} from './showRouteTransitionFixtures'

describe('show route transition fixtures', () => {
  it('builds every #332 fixture with exported watch variables', () => {
    expect(routeTransitionFixtureNames).toEqual([
      'plain-wipe',
      'plain-dither',
      'pattern-wipe',
      'pattern-dither',
      'pattern-crossfade-baseline',
      'pattern-decimate',
    ])

    for (const name of routeTransitionFixtureNames) {
      const fixture = buildRouteTransitionFixtureSource(name)

      expect(fixture).not.toBeNull()
      expect(fixture?.description).toContain(name.includes('crossfade') ? 'baseline' : '')
      expect(fixture?.source).toContain('export var frames = 0')
      expect(fixture?.source).toContain('export var calls = 0')
      expect(fixture?.source).toContain('export function beforeRender(delta)')
      expect(fixture?.source).toContain('export function render(index)')
    }
  })

  it('keeps route transitions to one member renderer choice per pixel', () => {
    const wipe = buildRouteTransitionFixtureSource('pattern-wipe')?.source ?? ''
    const dither = buildRouteTransitionFixtureSource('pattern-dither')?.source ?? ''
    const baseline = buildRouteTransitionFixtureSource('pattern-crossfade-baseline')?.source ?? ''

    expect(wipe).toContain('var chooseB = x < progress')
    expect(wipe).toContain('if (chooseB) {\n    renderB(index)\n  } else {\n    renderA(index)\n  }')
    expect(wipe).not.toContain('r0 * (1 - progress)')

    expect(dither).toContain('var chooseB = hash01(index) < progress')
    expect(dither).toContain('if (chooseB) {\n    renderB(index)\n  } else {\n    renderA(index)\n  }')
    expect(dither).not.toContain('r0 * (1 - progress)')

    expect(baseline).toContain('renderA(index)\n  var r0 = captureR')
    expect(baseline).toContain('renderB(index)\n  rgb(')
    expect(baseline).toContain('r0 * (1 - progress) + captureR * progress')
  })

  it('returns null for non-route-transition fixture names', () => {
    expect(buildRouteTransitionFixtureSource('diagnostic')).toBeNull()
  })

  it('generates decimation as a cached block renderer', () => {
    const source = buildRouteTransitionFixtureSource('pattern-decimate')?.source ?? ''

    expect(source).toContain('export var heldPixels = 4')
    expect(source).toContain('lastBlock = -1')
    expect(source).toContain('if (block != lastBlock) {')
    expect(source).toContain('renderSource(block * heldPixels)')
  })
})

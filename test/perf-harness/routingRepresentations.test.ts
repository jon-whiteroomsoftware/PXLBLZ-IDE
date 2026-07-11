import { benchOne } from './benchCore'
import {
  buildRoutingProbe,
  makeRoutingFixture,
  representationKindsFor,
  type RoutingFixtureKind,
} from './routingRepresentations'

const FIXTURE_KINDS: RoutingFixtureKind[] = [
  'contiguous',
  'serpentine-bands',
  'interleaved',
  'sparse-exceptions',
]

describe('routing representation spike fixtures', () => {
  it.each(FIXTURE_KINDS)('assigns every pixel exactly once in %s layouts', (kind) => {
    const fixture = makeRoutingFixture({ kind, pixelCount: 256, layoutCount: 8 })

    expect(fixture.layouts).toHaveLength(8)
    for (const layout of fixture.layouts) {
      expect(layout).toHaveLength(256)
      expect(layout.every((entry) => entry.route >= 0 && entry.localIndex >= 0)).toBe(true)
    }
  })

  it.each(FIXTURE_KINDS)('keeps every %s encoder visually equivalent', (kind) => {
    const fixture = makeRoutingFixture({ kind, pixelCount: 64, layoutCount: 4 })
    const results = representationKindsFor(fixture).map((representation) => {
      const probe = buildRoutingProbe(fixture, representation)
      return {
        representation,
        checksum: benchOne(probe.source, {}, 'fast', {
          frames: fixture.layoutCount,
          warmup: 0,
          grid: { rows: 1, cols: fixture.pixelCount },
        }).checksum,
      }
    })

    expect(new Set(results.map((result) => result.checksum))).toHaveLength(1)
  })

  it('accounts for the runtime memory bought by table representations', () => {
    const fixture = makeRoutingFixture({ kind: 'interleaved', pixelCount: 256, layoutCount: 8 })
    const branch = buildRoutingProbe(fixture, 'range-branches')
    const rle = buildRoutingProbe(fixture, 'rle-table')
    const packed = buildRoutingProbe(fixture, 'packed-pixels')

    expect(branch.pressure).toEqual({ globals: 1, arrays: 0, arrayElements: 0 })
    expect(rle.pressure.arrays).toBeGreaterThan(0)
    expect(rle.pressure.arrayElements).toBeGreaterThan(fixture.pixelCount)
    expect(packed.pressure).toEqual({
      globals: 2,
      arrays: 1,
      arrayElements: fixture.pixelCount * fixture.layoutCount,
    })
  })

  it('only offers generated formulas for regular fixtures', () => {
    const regular = makeRoutingFixture({ kind: 'contiguous', pixelCount: 256, layoutCount: 2 })
    const irregular = makeRoutingFixture({ kind: 'sparse-exceptions', pixelCount: 256, layoutCount: 2 })

    expect(representationKindsFor(regular)).toContain('generated-formula')
    expect(representationKindsFor(irregular)).not.toContain('generated-formula')
  })
})

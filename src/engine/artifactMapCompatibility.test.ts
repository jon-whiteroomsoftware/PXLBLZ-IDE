import type { ParsedPxlblzBanner } from './artifactStamp'
import { resolveArtifactPreferredMap } from './artifactMapCompatibility'
import type { MapRecord } from './personalContentRecords'

const baseStamp: ParsedPxlblzBanner = {
  version: 1,
  kind: 'show',
  id: 'show-1',
  hash: 'abc12345',
  stamped: '2026-07-12T00:00:00.000Z',
  transforms: [],
}

const customMap = (id: string, name: string): MapRecord => ({
  id,
  name,
  dim: 2,
  generator: 'custom',
  params: {},
  points: [[0, 0]],
  updatedAt: 1,
})

describe('artifact map compatibility (#411)', () => {
  it('resolves a stable stock reference directly', () => {
    expect(resolveArtifactPreferredMap({
      ...baseStamp,
      preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
    }, [])).toEqual({
      status: 'resolved',
      mapId: 'plane',
      message: 'Using the artifact preferred map: Square.',
    })
  })

  it('reconnects a custom map only through one exact name match', () => {
    expect(resolveArtifactPreferredMap({
      ...baseStamp,
      preferredMap: { kind: 'custom', name: 'Measured wall' },
    }, [customMap('map-1', 'Measured wall')])).toEqual({
      status: 'resolved',
      mapId: 'map-1',
      message: 'Using the matching custom map: Measured wall.',
    })
  })

  it('preserves useful missing and ambiguous custom-map states', () => {
    const stamp = { ...baseStamp, preferredMap: { kind: 'custom' as const, name: 'Measured wall' } }
    expect(resolveArtifactPreferredMap(stamp, [])).toEqual({
      status: 'missing',
      mapId: null,
      message: 'Preferred custom map "Measured wall" is not available; preview is using its normal fallback map.',
    })
    expect(resolveArtifactPreferredMap(stamp, [customMap('a', 'Measured wall'), customMap('b', 'Measured wall')])).toEqual({
      status: 'ambiguous',
      mapId: null,
      message: '2 custom maps are named "Measured wall"; preview is using its normal fallback map.',
    })
  })
})

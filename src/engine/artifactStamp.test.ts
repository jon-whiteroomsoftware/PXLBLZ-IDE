import { bundle } from './bundle'
import {
  artifactHash,
  parsePxlblzBanner,
  stampArtifact,
  stripPxlblzBanner,
} from './artifactStamp'

const SOURCE = 'export function render(index) { hsv(index / pixelCount, 1, 1) }'

describe('artifactStamp', () => {
  it('stamps and parses a versioned PXLBLZ banner', () => {
    const stamped = stampArtifact(SOURCE, {
      kind: 'pattern',
      id: 'pat-1',
      name: 'Sunset Arch',
      transforms: ['hardware-brightness', 'power-cap'],
      stampedAt: '2026-07-08T00:00:00.000Z',
    })

    expect(parsePxlblzBanner(stamped)).toEqual({
      version: 1,
      kind: 'pattern',
      id: 'pat-1',
      name: 'Sunset Arch',
      hash: artifactHash(SOURCE),
      stamped: '2026-07-08T00:00:00.000Z',
      transforms: ['hardware-brightness', 'power-cap'],
    })
  })

  it('round-trips preferred-map and compatibility metadata for portable Show artifacts (#411)', () => {
    const stamped = stampArtifact(SOURCE, {
      kind: 'show',
      id: 'show-1',
      name: 'Adaptive stage',
      preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
      compatibility: {
        portability: 'adaptive',
        dimensions: [2],
        mapClasses: ['surface'],
        resolution: 'adaptive',
        aspectRatio: { min: 0.75, max: 1.33 },
        exactMap: false,
      },
      stampedAt: '2026-07-12T00:00:00.000Z',
    })

    expect(stamped).toContain('// pxlblz:map preferred=stock:plane name="Square"')
    expect(parsePxlblzBanner(stamped)).toMatchObject({
      preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
      compatibility: {
        portability: 'adaptive',
        dimensions: [2],
        mapClasses: ['surface'],
        resolution: 'adaptive',
        aspectRatio: { min: 0.75, max: 1.33 },
        exactMap: false,
      },
    })
  })

  it('hashes the artifact body, not the banner, so restamping is stable', () => {
    const first = stampArtifact(SOURCE, {
      kind: 'pattern',
      id: 'pat-1',
      name: 'Sunset Arch',
      stampedAt: '2026-07-08T00:00:00.000Z',
    })
    const second = stampArtifact(first, {
      kind: 'pattern',
      id: 'pat-1',
      name: 'Sunset Arch',
      stampedAt: '2026-07-09T00:00:00.000Z',
    })

    expect(parsePxlblzBanner(first)?.hash).toBe(artifactHash(SOURCE))
    expect(parsePxlblzBanner(second)?.hash).toBe(artifactHash(SOURCE))
    expect(stripPxlblzBanner(second)).toBe(SOURCE)
  })

  it('detects source drift by comparing the parsed hash with the stripped body hash', () => {
    const stamped = stampArtifact(SOURCE, {
      kind: 'pattern',
      id: 'pat-1',
      stampedAt: '2026-07-08T00:00:00.000Z',
    })
    const drifted = stamped.replace('hsv(index', 'hsv((index')

    expect(parsePxlblzBanner(stamped)?.hash).toBe(artifactHash(stripPxlblzBanner(stamped)))
    expect(parsePxlblzBanner(drifted)?.hash).not.toBe(artifactHash(stripPxlblzBanner(drifted)))
  })

  it('returns null for unstamped source', () => {
    expect(parsePxlblzBanner(SOURCE)).toBeNull()
  })

  it('keeps comments harmless to the pattern compiler', () => {
    const stamped = stampArtifact(SOURCE, {
      kind: 'show',
      id: 'show-1',
      preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
      compatibility: {
        portability: 'adaptive',
        dimensions: [2],
        mapClasses: ['surface'],
        resolution: 'adaptive',
        exactMap: false,
      },
      stampedAt: '2026-07-08T00:00:00.000Z',
    })

    expect(bundle(stamped, {}).metadata.renderFns).toEqual(bundle(SOURCE, {}).metadata.renderFns)
  })

  it('ignores malformed optional map lines without invalidating version-1 identity', () => {
    const stamped = stampArtifact(SOURCE, {
      kind: 'show',
      id: 'show-legacy-safe',
      stampedAt: '2026-07-12T00:00:00.000Z',
    }).replace(
      SOURCE,
      `// pxlblz:map preferred=custom name=""\n// pxlblz:compat portability=maybe dimensions=x exact=sometimes\n${SOURCE}`,
    )

    expect(parsePxlblzBanner(stamped)).toMatchObject({
      version: 1,
      kind: 'show',
      id: 'show-legacy-safe',
    })
    expect(parsePxlblzBanner(stamped)).not.toHaveProperty('preferredMap')
    expect(parsePxlblzBanner(stamped)).not.toHaveProperty('compatibility')
  })
})

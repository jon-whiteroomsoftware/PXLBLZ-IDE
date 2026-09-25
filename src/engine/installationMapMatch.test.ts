import { describe, expect, it } from 'vitest'
import type { ArtifactShowOutputContract } from './artifactStamp'
import type { LiveInstalledMapState } from './installedMapObservation'
import { verifiedInstallationMapMatch } from './installationMapMatch'

const installation: ArtifactShowOutputContract = {
  version: 1,
  kind: 'installation',
  pixelCount: 8,
  outputMap: { kind: 'stock', id: 'plane', name: 'Square', fingerprint: 'aaaa' },
}

function present(fingerprint: string): LiveInstalledMapState {
  return {
    status: 'present',
    fingerprint,
    dimension: 2,
    pointCount: 8,
    observedAt: 0,
    bytes: new Uint8Array(),
  }
}

describe('verifiedInstallationMapMatch (#1129)', () => {
  it('returns the fingerprint when the installed map matches the contract', () => {
    expect(verifiedInstallationMapMatch(installation, present('aaaa'))).toBe('aaaa')
  })

  it('returns null for a Portable contract or no contract', () => {
    const portable: ArtifactShowOutputContract = {
      version: 1,
      kind: 'portable-2d',
      dimensions: [2],
      mapClasses: ['surface'],
      resolution: 'variable',
    }
    expect(verifiedInstallationMapMatch(portable, present('aaaa'))).toBeNull()
    expect(verifiedInstallationMapMatch(undefined, present('aaaa'))).toBeNull()
  })

  it('returns null when the contract names no map fingerprint', () => {
    expect(verifiedInstallationMapMatch({ ...installation, outputMap: undefined }, present('aaaa'))).toBeNull()
    expect(verifiedInstallationMapMatch(
      { ...installation, outputMap: { kind: 'custom', name: 'Wall' } },
      present('aaaa'),
    )).toBeNull()
  })

  it.each<[string, LiveInstalledMapState | undefined]>([
    ['loading', { status: 'loading' }],
    ['absent', { status: 'absent', observedAt: 0 }],
    ['error', { status: 'error', message: 'Network unavailable' }],
    ['undefined', undefined],
  ])('returns null when the installed map is %s', (_, installedMap) => {
    expect(verifiedInstallationMapMatch(installation, installedMap)).toBeNull()
  })

  it('returns null when the fingerprints differ', () => {
    expect(verifiedInstallationMapMatch(installation, present('bbbb'))).toBeNull()
  })
})

import {
  buildStudioMapFingerprintCandidates,
  mapDataHash,
  matchInstalledMapFingerprint,
  withMapFingerprintRecord,
} from './mapFingerprint'
import { encodeMapData } from './mapPush'
import type { ControllerProfile } from './controllerProfile'
import type { MapRecord } from './personalContentRecords'

const POINTS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [0, 1],
]

describe('map fingerprints', () => {
  it('hashes the encoded bytes deterministically', () => {
    const bytes = encodeMapData(POINTS)

    expect(mapDataHash(bytes)).toBe(mapDataHash(new Uint8Array(bytes)))
    expect(mapDataHash(encodeMapData([[0, 0], [1, 1]]))).not.toBe(mapDataHash(bytes))
  })

  it('keeps the newest push record per hash', () => {
    expect(withMapFingerprintRecord(
      [{ hash: 'same', mapId: 'old', mapName: 'Old', devicePixelCount: 4, pushedAt: 1 }],
      { hash: 'same', mapId: 'new', mapName: 'New', devicePixelCount: 4, pushedAt: 2 },
    )).toEqual([{ hash: 'same', mapId: 'new', mapName: 'New', devicePixelCount: 4, pushedAt: 2 }])
  })

  it('candidate-matches user maps by byte-exact encoded geometry', () => {
    const map: MapRecord = {
      id: 'grid',
      name: 'Grid',
      dim: 2,
      generator: 'custom',
      params: {},
      points: POINTS,
      updatedAt: 1,
    }

    const candidates = buildStudioMapFingerprintCandidates({ userMaps: [map], pixelCount: 4 })
    expect(matchInstalledMapFingerprint({
      hash: mapDataHash(encodeMapData(POINTS)),
      candidates,
    })).toMatchObject({ id: 'grid', name: 'Grid', kind: 'user', via: 'candidate' })
  })

  it('does not candidate-match frozen maps baked at a different pixel count', () => {
    const map: MapRecord = {
      id: 'grid',
      name: 'Grid',
      dim: 2,
      generator: 'custom',
      params: {},
      points: POINTS,
      updatedAt: 1,
    }

    const candidates = buildStudioMapFingerprintCandidates({ userMaps: [map], pixelCount: 3 })
    expect(candidates.find((candidate) => candidate.id === 'grid')).toBeUndefined()
  })

  it('prefers a profile push record when it points at an existing candidate', () => {
    const hash = mapDataHash(encodeMapData(POINTS))
    const profile = {
      id: 'ctrl',
      name: 'Controller',
      mapFingerprints: [
        { hash, mapId: 'map-1', mapName: 'Mapped name', devicePixelCount: 4, pushedAt: 1 },
      ],
    } as ControllerProfile

    expect(matchInstalledMapFingerprint({
      hash,
      profile,
      candidates: [{ id: 'map-1', name: 'Live name', kind: 'user', hash: 'different' }],
    })).toEqual({
      id: 'map-1',
      name: 'Live name',
      kind: 'user',
      hash,
      via: 'profile-record',
    })
  })
})

import { describe, expect, it } from 'vitest'
import { encodeMapData } from './mapPush'
import type { ControllerProfile } from './controllerProfile'
import {
  describeInstalledMap,
  inspectInstalledMapData,
  resolveInstalledMapIdentity,
  toInstalledMapSnapshot,
} from './installedMapObservation'

describe('installed map observation', () => {
  it.each([
    { points: [[0], [1]], dimension: 1 as const, fingerprint: 'cad23e5c' },
    { points: [[0, 0], [1, 1]], dimension: 2 as const, fingerprint: '9a0c9e7f' },
    { points: [[0, 0, 0], [1, 1, 1]], dimension: 3 as const, fingerprint: '826ad48e' },
  ])('derives one coherent $dimension-D fact from one raw blob', ({ points, dimension, fingerprint }) => {
    const bytes = encodeMapData(points)

    expect(inspectInstalledMapData(bytes, 123)).toEqual({
      status: 'present',
      bytes,
      fingerprint,
      dimension,
      pointCount: 2,
      observedAt: 123,
    })
  })

  it('represents confirmed absence without stale present facts', () => {
    expect(inspectInstalledMapData(null, 123)).toEqual({ status: 'absent', observedAt: 123 })
  })

  it.each([
    new Uint8Array(8),
    new Uint8Array(12),
    encodeMapData([[0, 0], [1, 1]]).slice(0, -1),
    Uint8Array.from([...encodeMapData([[0, 0]]), 0]),
  ])('rejects a malformed or internally inconsistent blob', (bytes) => {
    expect(() => inspectInstalledMapData(bytes, 123)).toThrow('Malformed installed map data')
  })

  it('persists successful facts without retaining the raw blob', () => {
    const present = inspectInstalledMapData(encodeMapData([[0], [1]]), 123)

    expect(toInstalledMapSnapshot(present)).toEqual({
      status: 'present',
      fingerprint: 'cad23e5c',
      dimension: 1,
      pointCount: 2,
      observedAt: 123,
    })
    expect(toInstalledMapSnapshot({ status: 'loading' })).toBeUndefined()
    expect(toInstalledMapSnapshot({ status: 'error', message: 'offline' })).toBeUndefined()
  })
})

describe('installed map identity', () => {
  const observation = {
    status: 'present' as const,
    fingerprint: 'same-hash',
    dimension: 2 as const,
    pointCount: 256,
    observedAt: 123,
  }

  it('uses a current map name for a profile-record match even after its bytes changed', () => {
    const profile = {
      mapFingerprints: [{
        hash: 'same-hash',
        mapId: 'personal-1',
        mapName: 'Push-time name',
        devicePixelCount: 256,
        pushedAt: 1,
      }],
    } as ControllerProfile

    expect(resolveInstalledMapIdentity({
      observation,
      profile,
      candidates: [{
        id: 'personal-1',
        name: 'Current name',
        kind: 'user',
        hash: 'edited-hash',
      }],
    })).toMatchObject({ name: 'Current name', via: 'profile-record' })
  })

  it('keeps the push-time name when the recorded map was deleted', () => {
    const profile = {
      mapFingerprints: [{
        hash: 'same-hash',
        mapId: 'deleted-1',
        mapName: 'Deleted wall',
        devicePixelCount: 256,
        pushedAt: 1,
      }],
    } as ControllerProfile

    expect(resolveInstalledMapIdentity({ observation, profile, candidates: [] })).toEqual({
      id: 'deleted-1',
      name: 'Deleted wall',
      kind: 'historical',
      hash: 'same-hash',
      via: 'profile-record',
    })
  })

  it('names exactly one byte-identical current Studio candidate', () => {
    expect(resolveInstalledMapIdentity({
      observation,
      candidates: [{ id: 'square', name: 'Square', kind: 'stock', hash: 'same-hash' }],
    })).toMatchObject({ id: 'square', name: 'Square', via: 'candidate' })
  })

  it('does not choose among byte-identical candidates', () => {
    expect(resolveInstalledMapIdentity({
      observation,
      candidates: [
        { id: 'a', name: 'A', kind: 'stock', hash: 'same-hash' },
        { id: 'b', name: 'B', kind: 'user', hash: 'same-hash' },
      ],
    })).toBeNull()
  })

  it('resolves a previously unknown observation when personal maps finish loading', () => {
    const candidates = [{
      id: 'personal-1',
      name: 'Late-loaded wall',
      kind: 'user' as const,
      hash: 'same-hash',
    }]

    expect(resolveInstalledMapIdentity({ observation, candidates: [] })).toBeNull()
    expect(resolveInstalledMapIdentity({ observation, candidates })).toMatchObject({
      id: 'personal-1',
      name: 'Late-loaded wall',
      via: 'candidate',
    })
  })
})

describe('installed map presentation', () => {
  it.each([
    [{ status: 'loading' as const }, 'Reading map...'],
    [{ status: 'absent' as const, observedAt: 1 }, 'No installed map'],
    [{ status: 'error' as const, message: 'timeout' }, 'Map unavailable'],
    [undefined, '-'],
  ])('uses the shared state copy', (observation, label) => {
    expect(describeInstalledMap({ observation, candidates: [] })).toEqual({
      kind: 'state',
      label,
    })
  })

  it('projects named and unknown present observations without confidence badges', () => {
    const observation = {
      status: 'present' as const,
      fingerprint: 'same-hash',
      dimension: 2 as const,
      pointCount: 256,
      observedAt: 1,
    }

    expect(describeInstalledMap({
      observation,
      candidates: [{ id: 'square', name: 'Square', kind: 'stock', hash: 'same-hash' }],
    })).toEqual({ kind: 'present', name: 'Square', dimension: 2, pointCount: 256 })
    expect(describeInstalledMap({ observation, candidates: [] })).toEqual({
      kind: 'present',
      name: 'Unknown map',
      dimension: 2,
      pointCount: 256,
    })
  })
})

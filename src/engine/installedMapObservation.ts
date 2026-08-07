import type { ControllerProfile } from './controllerProfile'
import {
  mapDataHash,
  matchInstalledMapFingerprint,
  type MapFingerprintMatch,
  type StudioMapFingerprintCandidate,
} from './mapFingerprint'

export interface InstalledMapPresentObservation {
  status: 'present'
  fingerprint: string
  dimension: 1 | 2 | 3
  pointCount: number
  observedAt: number
}

export interface LiveInstalledMapPresentObservation extends InstalledMapPresentObservation {
  /** Exact read-back bytes retained for Import map; never persisted to a profile. */
  bytes: Uint8Array
}

export interface InstalledMapAbsentObservation {
  status: 'absent'
  observedAt: number
}

export type InstalledMapSnapshot =
  | InstalledMapPresentObservation
  | InstalledMapAbsentObservation

export type LiveInstalledMapState =
  | { status: 'loading' }
  | LiveInstalledMapPresentObservation
  | InstalledMapAbsentObservation
  | { status: 'error'; message: string }

export type InstalledMapPresentation =
  | { kind: 'state'; label: 'Reading map...' | 'No installed map' | 'Map unavailable' | '-' }
  | { kind: 'present'; name: string; dimension: 1 | 2 | 3; pointCount: number }

/** Inspect one complete `/pixelmap.dat` blob. Header facts and fingerprint always
 * describe the same exact bytes; malformed/truncated blobs are failures, not
 * confirmed absence. */
export function inspectInstalledMapData(
  bytes: Uint8Array | null,
  observedAt = Date.now(),
): LiveInstalledMapPresentObservation | InstalledMapAbsentObservation {
  if (bytes === null) return { status: 'absent', observedAt }
  if (bytes.length < 12) throw malformedInstalledMapData()

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const formatVersion = view.getUint32(0, true)
  const dimension = view.getUint32(4, true)
  const bodyBytes = view.getUint32(8, true)
  if (
    formatVersion < 1
    || (dimension !== 1 && dimension !== 2 && dimension !== 3)
    || bodyBytes === 0
  ) {
    throw malformedInstalledMapData()
  }
  const bytesPerPoint = formatVersion * dimension
  if (bodyBytes % bytesPerPoint !== 0 || bytes.length !== 12 + bodyBytes) {
    throw malformedInstalledMapData()
  }
  const pointCount = bodyBytes / bytesPerPoint
  if (!Number.isSafeInteger(pointCount) || pointCount < 1) throw malformedInstalledMapData()

  return {
    status: 'present',
    bytes,
    fingerprint: mapDataHash(bytes),
    dimension,
    pointCount,
    observedAt,
  }
}

export function toInstalledMapSnapshot(
  observation: LiveInstalledMapState,
): InstalledMapSnapshot | undefined {
  if (observation.status === 'absent') return observation
  if (observation.status !== 'present') return undefined
  return {
    status: 'present',
    fingerprint: observation.fingerprint,
    dimension: observation.dimension,
    pointCount: observation.pointCount,
    observedAt: observation.observedAt,
  }
}

export function resolveInstalledMapIdentity(args: {
  observation: InstalledMapSnapshot | LiveInstalledMapState
  profile?: ControllerProfile | null
  candidates: StudioMapFingerprintCandidate[]
}): MapFingerprintMatch | null {
  if (args.observation.status !== 'present') return null
  return matchInstalledMapFingerprint({
    hash: args.observation.fingerprint,
    profile: args.profile,
    candidates: args.candidates,
  })
}

export function describeInstalledMap(args: {
  observation: InstalledMapSnapshot | LiveInstalledMapState | undefined
  profile?: ControllerProfile | null
  candidates: StudioMapFingerprintCandidate[]
}): InstalledMapPresentation {
  const observation = args.observation
  if (!observation) return { kind: 'state', label: '-' }
  if (observation.status === 'loading') return { kind: 'state', label: 'Reading map...' }
  if (observation.status === 'absent') return { kind: 'state', label: 'No installed map' }
  if (observation.status === 'error') return { kind: 'state', label: 'Map unavailable' }
  return {
    kind: 'present',
    name: resolveInstalledMapIdentity({
      observation,
      profile: args.profile,
      candidates: args.candidates,
    })?.name ?? 'Unknown map',
    dimension: observation.dimension,
    pointCount: observation.pointCount,
  }
}

function malformedInstalledMapData(): Error {
  return new Error('Malformed installed map data')
}

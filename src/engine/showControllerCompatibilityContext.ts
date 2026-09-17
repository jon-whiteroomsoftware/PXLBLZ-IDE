import type { ArtifactMapClass } from './artifactStamp'
import type { ControllerProfile } from './controllerProfile'
import {
  resolveInstalledMapIdentity,
  type InstalledMapSnapshot,
  type LiveInstalledMapState,
} from './installedMapObservation'
import { buildStudioMapFingerprintCandidates } from './mapFingerprint'
import type { PixelMap } from './maps/types'
import type { MapRecord } from './personalContentRecords'
import type { ShowControllerCompatibilityContext } from './showControllerArtifact'

/**
 * What a connected Controller is currently running, in the shape
 * `prepareShowControllerArtifact` compares a Show against: its pixel count and
 * the map it actually has installed, identified by fingerprint.
 *
 * Extracted from the v1 Show editor unchanged so the v2 editor route prepares
 * a delivery against the same observation rather than against an empty context
 * that would silently skip the compatibility comparison (#1056 slice 6). The
 * stock catalogue is passed in because it belongs to the map store, not here.
 */
export function buildShowControllerCompatibilityContext(
  profile: ControllerProfile | undefined,
  userMaps: readonly MapRecord[],
  observation: InstalledMapSnapshot | LiveInstalledMapState | undefined,
  stockMaps: readonly PixelMap[],
): ShowControllerCompatibilityContext {
  const pixelCount = profile?.lastKnownPixelCount
  const identity = observation?.status === 'present'
    ? resolveInstalledMapIdentity({
        observation,
        profile,
        candidates: buildStudioMapFingerprintCandidates({
          userMaps: [...userMaps],
          pixelCount: observation.pointCount,
        }),
      })
    : null
  const installedMap = identity && identity.kind !== 'historical'
    ? [...stockMaps, ...userMaps].find((map) => map.id === identity.id)
    : undefined
  const mapClass = installedMap
    ? ('kind' in installedMap ? installedMap.kind : 'custom') as ArtifactMapClass
    : undefined
  return {
    ...(pixelCount !== undefined ? { pixelCount } : {}),
    ...(observation?.status === 'present'
      ? {
          map: {
            ...(identity?.id ? { id: identity.id } : {}),
            ...(identity?.name ? { name: identity.name } : {}),
            fingerprint: observation.fingerprint,
            ...(mapClass ? { mapClass } : {}),
          },
        }
      : {}),
  }
}

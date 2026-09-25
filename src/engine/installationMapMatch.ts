import type { ArtifactShowOutputContract } from './artifactStamp'
import type { LiveInstalledMapState } from './installedMapObservation'

/** The map fingerprint an unattended Installation Show delivery may rely on:
 *  the Show's contract names one and the Controller's installed map reads
 *  present with the same one. Anything else returns null (#1129). */
export function verifiedInstallationMapMatch(
  contract: ArtifactShowOutputContract | undefined,
  installedMap: LiveInstalledMapState | undefined,
): string | null {
  if (contract?.kind !== 'installation') return null
  const fingerprint = contract.outputMap?.fingerprint
  if (!fingerprint) return null
  if (installedMap?.status !== 'present') return null
  return installedMap.fingerprint === fingerprint ? fingerprint : null
}

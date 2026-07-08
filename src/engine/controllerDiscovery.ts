import type { DiscoveredController } from './ControllerProvider'
import type { MapDimension } from './sendToController'

export interface KnownControllerForDiscovery {
  ip: string
  deviceId?: string | null
  phase: 'pending' | 'live' | 'error'
  mapDim: MapDimension
}

export function isConnectedDiscoveryDuplicate(
  candidate: DiscoveredController,
  known: Iterable<KnownControllerForDiscovery>,
): boolean {
  for (const entry of known) {
    if (entry.phase === 'error') continue
    if (entry.ip === candidate.address) return true
    if (entry.deviceId && entry.deviceId === candidate.id) return true
  }
  return false
}

export function availableDiscoveredControllers(
  discovered: DiscoveredController[],
  known: Iterable<KnownControllerForDiscovery>,
): DiscoveredController[] {
  const entries = [...known]
  return discovered.filter((candidate) => !isConnectedDiscoveryDuplicate(candidate, entries))
}

export function discoveredControllerMetadata(controller: DiscoveredController): string[] {
  return [controller.boardType, controller.version ? `v${controller.version}` : undefined].filter(
    (value): value is string => Boolean(value),
  )
}

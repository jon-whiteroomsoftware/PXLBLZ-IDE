import type { ControllerProfile } from './controllerProfile'
import type { ControllerEntry } from '@/store/controllerStore'

export function controllerForProfile(
  profile: ControllerProfile,
  controllers: Record<string, ControllerEntry>,
): ControllerEntry | null {
  const entries = Object.values(controllers)
  const byDeviceId = profile.deviceId
    ? entries.filter((entry) => entry.deviceId === profile.deviceId)
    : []
  const byLastSeenIp =
    byDeviceId.length === 0 && profile.lastSeenIp
      ? entries.filter((entry) => entry.ip === profile.lastSeenIp && (!profile.deviceId || !entry.deviceId))
      : []
  const candidates = byDeviceId.length > 0 ? byDeviceId : byLastSeenIp

  return (
    candidates.find((entry) => entry.phase === 'live') ??
    candidates.find((entry) => entry.phase === 'pending') ??
    candidates.find((entry) => entry.phase === 'error') ??
    null
  )
}

import type { ControllerProfile } from './controllerProfile'

export interface ControllerProfileJoinTarget {
  ip: string
  deviceId?: string | null
  nickname?: string
}

export function findControllerProfileForDevice(
  profiles: ControllerProfile[],
  deviceId: string | null | undefined,
): ControllerProfile | null {
  if (!deviceId) return null
  let match: ControllerProfile | null = null
  for (const profile of profiles) {
    if (profile.deviceId !== deviceId) continue
    if (match === null || profile.updatedAt > match.updatedAt) match = profile
  }
  return match
}

export function controllerProfileCreateSeed(target: ControllerProfileJoinTarget): {
  name: string
  deviceId?: string
  deviceName?: string
  ip: string
} {
  return {
    name: target.nickname ?? `Controller ${target.ip}`,
    ...(target.deviceId ? { deviceId: target.deviceId } : {}),
    ...(target.nickname ? { deviceName: target.nickname } : {}),
    ip: target.ip,
  }
}

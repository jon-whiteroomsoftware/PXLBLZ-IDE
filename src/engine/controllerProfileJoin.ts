import { canonicalControllerDeviceId, sameControllerDeviceId } from './controllerIdentity'
import {
  withControllerFirmwareUpdateReport,
  type ControllerProfile,
  type ControllerFirmwareUpdateObservation,
} from './controllerProfile'
import type { FirmwareUpdateState } from './firmwareUpdate'

export interface ControllerProfileJoinTarget {
  ip: string
  deviceId?: string | null
  nickname?: string
  firmwareVersion?: string
  firmwareUpdateState?: FirmwareUpdateState
  firmwareUpdateCheckedAt?: number
  firmwareUpdateObservedVersion?: string
}

export function findControllerProfileForDevice(
  profiles: ControllerProfile[],
  deviceId: string | null | undefined,
): ControllerProfile | null {
  if (!deviceId) return null
  let match: ControllerProfile | null = null
  for (const profile of profiles) {
    if (!sameControllerDeviceId(profile.deviceId, deviceId)) continue
    if (match === null || profile.updatedAt > match.updatedAt) match = profile
  }
  return match
}

export function controllerProfileCreateSeed(target: ControllerProfileJoinTarget): {
  name: string
  deviceId?: string
  deviceName?: string
  ip: string
  firmwareVersion?: string
  firmwareUpdate?: ControllerFirmwareUpdateObservation
} {
  const board = withControllerFirmwareUpdateReport({ kind: 'pixelblaze-v3-standard' }, {
    firmwareVersion: target.firmwareVersion,
    state: target.firmwareUpdateState,
    checkedAt: target.firmwareUpdateCheckedAt,
    observedFirmwareVersion: target.firmwareUpdateObservedVersion,
  })
  return {
    name: target.nickname ?? `Controller ${target.ip}`,
    ...(target.deviceId ? { deviceId: canonicalControllerDeviceId(target.deviceId) } : {}),
    ...(target.nickname ? { deviceName: target.nickname } : {}),
    ...(target.firmwareVersion ? { firmwareVersion: target.firmwareVersion } : {}),
    ...(board.firmwareUpdate ? { firmwareUpdate: board.firmwareUpdate } : {}),
    ip: target.ip,
  }
}

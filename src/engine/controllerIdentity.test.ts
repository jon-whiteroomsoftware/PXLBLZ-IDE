import { canonicalControllerDeviceId, sameControllerDeviceId, controllerMacAddress } from './controllerIdentity'
import { controllerForProfile } from './controllerProfileConnection'
import { isConnectedDiscoveryDuplicate } from './controllerDiscovery'
import type { ControllerProfile } from './controllerProfile'

const legacy = 'pixelblaze_pb32_aabbccdd02'
const canonical = 'pixelblaze_pb32_00aabbccdd02'

it.each([
  [legacy, canonical],
  [canonical, canonical],
  ['pixelblaze_pb32_AABBCCDD02', canonical],
  ['pixelblaze_pb32_0', 'pixelblaze_pb32_000000000000'],
  ['pixelblaze_pb32_123456789abcd', 'pixelblaze_pb32_123456789abcd'],
  ['opaque_ID', 'opaque_ID'],
  ['pixelblaze_pb32_xyz', 'pixelblaze_pb32_xyz'],
])('canonicalizes recognized MAC IDs without guessing opaque IDs: %s', (input, expected) => {
  expect(canonicalControllerDeviceId(input)).toBe(expected)
  expect(canonicalControllerDeviceId(canonicalControllerDeviceId(input))).toBe(expected)
})

it('compares both legacy directions while preserving separate hardware and unclaimed identities', () => {
  expect(sameControllerDeviceId(legacy, canonical)).toBe(true)
  expect(sameControllerDeviceId(canonical, legacy)).toBe(true)
  expect(sameControllerDeviceId(legacy, 'pixelblaze_pb32_aabbccdd03')).toBe(false)
  expect(sameControllerDeviceId(legacy, 'pixelblaze_pb3_aabbccdd02')).toBe(false)
  expect(sameControllerDeviceId('opaque_ID', 'opaque_id')).toBe(false)
  expect(sameControllerDeviceId(null, null)).toBe(false)
  expect(sameControllerDeviceId('', '')).toBe(false)
})

it('shows legacy profiles connected and suppresses discovery duplicates even after an IP change', () => {
  const profile = { deviceId: legacy, lastSeenIp: '192.168.8.193' } as ControllerProfile
  const live = { ip: '192.168.8.194', deviceId: canonical, phase: 'live' as const, mapDim: null }
  expect(controllerForProfile(profile, { [live.ip]: live })).toBe(live)
  expect(isConnectedDiscoveryDuplicate({ id: legacy, address: profile.lastSeenIp! }, [live])).toBe(true)
  expect(controllerForProfile({ ...profile, deviceId: 'pixelblaze_pb32_aabbccdd03' }, { [live.ip]: live })).toBeNull()
})

it('renders the same conventional MAC from padded and legacy device identities', () => {
  expect(controllerMacAddress(legacy)).toBe('02:DD:CC:BB:AA:00')
  expect(controllerMacAddress(canonical)).toBe('02:DD:CC:BB:AA:00')
  expect(controllerMacAddress('pixelblaze_pb32_0')).toBe('00:00:00:00:00:00')
  expect(controllerMacAddress('opaque_ID')).toBeNull()
  expect(controllerMacAddress(undefined)).toBeNull()
})

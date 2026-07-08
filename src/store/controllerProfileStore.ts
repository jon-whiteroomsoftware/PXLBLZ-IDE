import { create } from 'zustand'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { mapDimension } from '@/engine/sendToController'
import {
  controllerProfileCreateSeed,
  findControllerProfileForDevice,
  type ControllerProfileJoinTarget,
} from '@/engine/controllerProfileJoin'
import type {
  ControllerBindingTarget,
  ControllerInput,
  ControllerInputRole,
  ControllerInputSignal,
  ControllerProfile,
  ControllerZone,
  GlobalTransform,
  PatternBinding,
} from '@/engine/controllerProfile'
import { useControllerStore } from '@/store/controllerStore'

export type { ControllerProfile }

interface ControllerProfileState {
  profiles: ControllerProfile[]
  profilesLoaded: boolean
  loadProfiles: () => Promise<void>
  createProfile: (seed?: {
    name?: string
    deviceId?: string | null
    deviceName?: string
    ip?: string
    firmwareVersion?: string
  }) => Promise<ControllerProfile>
  removeProfile: (id: string) => Promise<void>
  ensureProfileForLiveController: (
    target: ControllerProfileJoinTarget & { phase: string; mapDim?: unknown },
  ) => Promise<ControllerProfile | null>
  updateProfile: (id: string, changes: Partial<Omit<ControllerProfile, 'id'>>) => Promise<void>
  addInput: (profileId: string) => Promise<void>
  updateInput: (profileId: string, inputId: string, changes: Partial<ControllerInput>) => Promise<void>
  removeInput: (profileId: string, inputId: string) => Promise<void>
  addZone: (profileId: string) => Promise<void>
  updateZone: (profileId: string, zoneId: string, changes: Partial<ControllerZone>) => Promise<void>
  removeZone: (profileId: string, zoneId: string) => Promise<void>
  toggleGlobalTransform: (profileId: string, transformId: string, enabled: boolean) => Promise<void>
  addPatternBinding: (profileId: string) => Promise<void>
  updatePatternBinding: (
    profileId: string,
    bindingId: string,
    changes: Partial<PatternBinding>,
  ) => Promise<void>
  removePatternBinding: (profileId: string, bindingId: string) => Promise<void>
  refreshLiveMetadata: (profileId: string) => Promise<void>
}

export const controllerProfileInitialState = {
  profiles: [] as ControllerProfile[],
  profilesLoaded: false,
}

const autoCreateSuppressedDeviceIds = new Set<string>()
const autoCreatePendingDeviceIds = new Set<string>()

export function __resetControllerProfileAutoCreateGuards(): void {
  autoCreateSuppressedDeviceIds.clear()
  autoCreatePendingDeviceIds.clear()
}

export function defaultControllerProfile(seed: {
  id?: string
  name?: string
  deviceId?: string | null
  deviceName?: string
  ip?: string
  firmwareVersion?: string
  now?: number
} = {}): ControllerProfile {
  const name = seed.name ?? seed.deviceName ?? 'Untitled Controller'
  const updatedAt = seed.now ?? Date.now()
  return {
    id: seed.id ?? newPersonalContentId(),
    name,
    ...(seed.deviceId ? { deviceId: seed.deviceId } : {}),
    ...(seed.deviceName ? { lastKnownDeviceName: seed.deviceName } : {}),
    ...(seed.ip ? { lastSeenIp: seed.ip } : {}),
    board: {
      kind: 'pixelblaze-v3-standard',
      ...(seed.firmwareVersion ? { firmwareVersion: seed.firmwareVersion } : {}),
    },
    inputs: [],
    globalTransforms: [
      {
        id: 'hardware-brightness',
        type: 'hardware-brightness',
        enabled: false,
        mixinId: 'builtin:hardware-brightness',
        inputId: '',
        mode: 'multiply-output',
      },
      {
        id: 'power-cap',
        type: 'power-cap',
        enabled: false,
        mixinId: 'builtin:power-cap',
        maxMilliamps: 3500,
      },
    ],
    patternBindings: [],
    zones: [],
    updatedAt,
  }
}

export function profileMatchesLive(
  profile: ControllerProfile,
  live: Record<string, { deviceId?: string | null; phase: string }>,
): boolean {
  if (!profile.deviceId) return false
  return Object.values(live).some((entry) => entry.phase === 'live' && entry.deviceId === profile.deviceId)
}

function nextId(prefix: string, existing: Array<{ id: string }>): string {
  let index = existing.length
  let id = `${prefix}${index}`
  const ids = new Set(existing.map((item) => item.id))
  while (ids.has(id)) {
    index += 1
    id = `${prefix}${index}`
  }
  return id
}

function patchProfile(
  profile: ControllerProfile,
  changes: Partial<Omit<ControllerProfile, 'id'>>,
): ControllerProfile {
  return { ...profile, ...changes, updatedAt: changes.updatedAt ?? Date.now() }
}

async function persistPatch(id: string, changes: Partial<Omit<ControllerProfile, 'id'>>): Promise<void> {
  await getPersonalContentProvider().updateControllerProfile(id, changes)
}

export const useControllerProfileStore = create<ControllerProfileState>()((set, get) => ({
  ...controllerProfileInitialState,

  loadProfiles: async () => {
    const profiles = await getPersonalContentProvider().listControllerProfiles()
    set({ profiles: profiles.sort((a, b) => b.updatedAt - a.updatedAt), profilesLoaded: true })
  },

  createProfile: async (seed = {}) => {
    const profile = defaultControllerProfile(seed)
    await getPersonalContentProvider().createControllerProfile(profile)
    set((s) => ({ profiles: [profile, ...s.profiles], profilesLoaded: true }))
    return profile
  },

  removeProfile: async (id) => {
    const profile = get().profiles.find((item) => item.id === id)
    if (profile?.deviceId) autoCreateSuppressedDeviceIds.add(profile.deviceId)
    await getPersonalContentProvider().deleteControllerProfile(id)
    set((s) => ({ profiles: s.profiles.filter((profile) => profile.id !== id) }))
  },

  ensureProfileForLiveController: async (target) => {
    if (target.phase !== 'live' || !target.deviceId) return null
    if (autoCreateSuppressedDeviceIds.has(target.deviceId)) return null

    const existing = findControllerProfileForDevice(get().profiles, target.deviceId)
    if (existing) {
      const firmwareVersion = target.firmwareVersion
      const changes: Partial<Omit<ControllerProfile, 'id'>> = {
        ...(target.nickname && (existing.lastKnownDeviceName !== target.nickname || existing.name !== target.nickname)
          ? { name: target.nickname, lastKnownDeviceName: target.nickname }
          : {}),
        ...(existing.lastSeenIp !== target.ip ? { lastSeenIp: target.ip } : {}),
        ...(firmwareVersion && existing.board.firmwareVersion !== firmwareVersion
          ? { board: { ...existing.board, firmwareVersion } }
          : {}),
      }
      if (Object.keys(changes).length > 0) await get().updateProfile(existing.id, changes)
      return get().profiles.find((profile) => profile.id === existing.id) ?? existing
    }

    if (autoCreatePendingDeviceIds.has(target.deviceId)) return null
    autoCreatePendingDeviceIds.add(target.deviceId)
    try {
      const profile = defaultControllerProfile(controllerProfileCreateSeed(target))
      await getPersonalContentProvider().createControllerProfile(profile)
      set((s) => ({ profiles: [profile, ...s.profiles], profilesLoaded: true }))
      return profile
    } finally {
      autoCreatePendingDeviceIds.delete(target.deviceId)
    }
  },

  updateProfile: async (id, changes) => {
    const updatedAt = Date.now()
    const patch = { ...changes, updatedAt }
    await persistPatch(id, patch)
    set((s) => ({
      profiles: s.profiles.map((profile) =>
        profile.id === id ? patchProfile(profile, patch) : profile,
      ),
    }))
  },

  addInput: async (profileId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    const id = nextId('input', profile.inputs)
    const input: ControllerInput = {
      id,
      name: `Input ${profile.inputs.length + 1}`,
      pin: 33,
      signal: 'analog',
      role: 'assignable',
      smoothing: 0.2,
      fallback: 0.5,
      invert: false,
    }
    await get().updateProfile(profileId, { inputs: [...profile.inputs, input] })
  },

  updateInput: async (profileId, inputId, changes) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    await get().updateProfile(profileId, {
      inputs: profile.inputs.map((input) =>
        input.id === inputId ? { ...input, ...changes } : input,
      ),
    })
  },

  removeInput: async (profileId, inputId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    await get().updateProfile(profileId, {
      inputs: profile.inputs.filter((input) => input.id !== inputId),
      patternBindings: profile.patternBindings.filter((binding) => binding.inputId !== inputId),
    })
  },

  addZone: async (profileId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    const id = nextId('zone', profile.zones)
    await get().updateProfile(profileId, {
      zones: [...profile.zones, { id, name: `Zone ${profile.zones.length + 1}`, start: 0, end: 0 }],
    })
  },

  updateZone: async (profileId, zoneId, changes) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    await get().updateProfile(profileId, {
      zones: profile.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...changes } : zone)),
    })
  },

  removeZone: async (profileId, zoneId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    await get().updateProfile(profileId, {
      zones: profile.zones.filter((zone) => zone.id !== zoneId),
    })
  },

  toggleGlobalTransform: async (profileId, transformId, enabled) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    await get().updateProfile(profileId, {
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.id === transformId ? { ...transform, enabled } : transform,
      ) as GlobalTransform[],
    })
  },

  addPatternBinding: async (profileId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    if (!profile.inputs[0]) return
    const id = nextId('binding', profile.patternBindings)
    const target: ControllerBindingTarget = { kind: 'call-exported-slider', name: 'sliderSpeed' }
    await get().updateProfile(profileId, {
      patternBindings: [
        ...profile.patternBindings,
        {
          id,
          patternId: '',
          inputId: profile.inputs[0].id,
          target,
        },
      ],
    })
  },

  updatePatternBinding: async (profileId, bindingId, changes) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    await get().updateProfile(profileId, {
      patternBindings: profile.patternBindings.map((binding) =>
        binding.id === bindingId ? { ...binding, ...changes } : binding,
      ),
    })
  },

  removePatternBinding: async (profileId, bindingId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    await get().updateProfile(profileId, {
      patternBindings: profile.patternBindings.filter((binding) => binding.id !== bindingId),
    })
  },

  refreshLiveMetadata: async (profileId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    const live = useControllerStore.getState()
    const active = live.activeIp ? live.controllers[live.activeIp] : undefined
    if (!profile || !active || active.phase !== 'live') return
    if (profile.deviceId && active.deviceId !== profile.deviceId) return

    const provider = getControllerProvider()
    const [config, map] = await Promise.all([
      provider.getConfig().catch(() => null),
      provider.getPixelMap().catch(() => null),
    ])
    const mapDim = mapDimension(map)
    const firmwareVersion = config?.firmwareVersion ?? active.firmwareVersion
    const liveName = config?.name ?? active.nickname
    const changes: Partial<Omit<ControllerProfile, 'id'>> = {
      ...(active.deviceId && profile.deviceId !== active.deviceId ? { deviceId: active.deviceId } : {}),
      ...(liveName && (profile.name !== liveName || profile.lastKnownDeviceName !== liveName)
        ? { name: liveName, lastKnownDeviceName: liveName }
        : {}),
      ...(profile.lastSeenIp !== active.ip ? { lastSeenIp: active.ip } : {}),
      ...(typeof config?.pixelCount === 'number' ? { lastKnownPixelCount: config.pixelCount } : {}),
      ...(mapDim ? { lastKnownMapDim: mapDim } : {}),
      ...(firmwareVersion && profile.board.firmwareVersion !== firmwareVersion
        ? { board: { ...profile.board, firmwareVersion } }
        : {}),
    }
    if (Object.keys(changes).length > 0) await get().updateProfile(profileId, changes)
  },
}))

export const CONTROLLER_INPUT_ROLES: ControllerInputRole[] = [
  'brightness',
  'assignable',
  'next-pattern',
]

export const CONTROLLER_INPUT_SIGNALS: ControllerInputSignal[] = ['analog', 'digital']

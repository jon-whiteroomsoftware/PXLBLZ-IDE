import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { queueControllerProfileWrite } from '@/engine/controllerProfileWriteQueue'
import {
  toInstalledMapSnapshot,
  type InstalledMapSnapshot,
  type LiveInstalledMapState,
} from '@/engine/installedMapObservation'
import { controllerProfileReconciliationSignature } from '@/engine/controllerProfilePassRecipe'
import {
  applyControllerPowerEdit,
  type ControllerPowerEdit,
} from '@/engine/controllerPowerAuthoring'
import {
  controllerProfileCreateSeed,
  findControllerProfileForDevice,
  type ControllerProfileJoinTarget,
} from '@/engine/controllerProfileJoin'
import {
  normalizeControllerInputs,
  withControllerFirmwareUpdateReport,
  type ControllerBindingTarget,
  type ControllerInput,
  type ControllerInputSignal,
  type ControllerProfile,
  type ControllerZone,
  type GlobalTransform,
  type PatternBinding,
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
    target: ControllerProfileJoinTarget & {
      phase: string
      mapDim?: unknown
      installedMap?: LiveInstalledMapState
    },
  ) => Promise<ControllerProfile | null>
  updateProfile: (id: string, changes: Partial<Omit<ControllerProfile, 'id'>>) => Promise<void>
  // The most recent profile write that failed and rolled back (#810). Holds the
  // rejected changes so the profile page's notice can offer a retry. Mirrors
  // the Show editor's showSaveFailure (#792).
  profileSaveFailure: { profileId: string; changes: Partial<Omit<ControllerProfile, 'id'>> } | null
  dismissProfileSaveFailure: () => void
  /** Re-applies the rolled-back changes; a still-failing write re-records the
   * failure, so the notice stays up. */
  retryProfileSaveFailure: () => Promise<void>
  addInput: (profileId: string) => Promise<void>
  updateInput: (profileId: string, inputId: string, changes: Partial<ControllerInput>) => Promise<void>
  removeInput: (profileId: string, inputId: string) => Promise<void>
  addZone: (profileId: string) => Promise<void>
  updateZone: (profileId: string, zoneId: string, changes: Partial<ControllerZone>) => Promise<void>
  removeZone: (profileId: string, zoneId: string) => Promise<void>
  toggleGlobalTransform: (profileId: string, transformId: string, enabled: boolean) => Promise<void>
  /** Point the profile's single hardware-brightness transform at an input, or
   * disable it with `null`. One transform per profile makes this exclusive. */
  assignHardwareBrightness: (profileId: string, inputId: string | null) => Promise<void>
  addPatternBinding: (profileId: string, patternId: string, inputId: string) => Promise<void>
  updatePatternBinding: (
    profileId: string,
    bindingId: string,
    changes: Partial<PatternBinding>,
  ) => Promise<void>
  removePatternBinding: (profileId: string, bindingId: string) => Promise<void>
  /** Apply one pure Controller power-policy operation and persist its resulting
   * profile fields through the ordinary optimistic write path. */
  editPower: (profileId: string, edit: ControllerPowerEdit) => Promise<void>
  refreshLiveMetadata: (profileId: string) => Promise<void>
}

export const controllerProfileInitialState = {
  profiles: [] as ControllerProfile[],
  profilesLoaded: false,
  profileSaveFailure: null as {
    profileId: string
    changes: Partial<Omit<ControllerProfile, 'id'>>
  } | null,
}

const autoCreateSuppressedDeviceIds = new Set<string>()
const autoCreatePendingProfiles = new Map<string, Promise<ControllerProfile>>()

// The last durably persisted state of each profile (#810), mirroring the Show
// editor's durable baseline (#792). Rollback restores these values — never a
// pre-write snapshot, which can contain another failed write's optimistic
// state — and Retry validates against them.
const lastDurableProfiles = new Map<string, ControllerProfile>()

export function __resetControllerProfileAutoCreateGuards(): void {
  autoCreateSuppressedDeviceIds.clear()
  autoCreatePendingProfiles.clear()
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
        mode: 'direct',
        maxDuty: 0.25,
      },
    ],
    keepPatternsUpToDate: false,
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

// Revert only the failed patch's keys, and only where the current value is
// still that patch's optimistic value (patchProfile spreads the patch values
// by reference); each reverts to its last durably persisted value. Keys a
// later queued edit already overwrote keep that newer optimistic state, so a
// failed edit really reverts instead of surviving locally as never-durable
// content (#810).
function revertFailedPatch(
  current: ControllerProfile,
  durable: ControllerProfile,
  patch: Partial<Omit<ControllerProfile, 'id'>>,
): ControllerProfile {
  let reverted: ControllerProfile = current
  for (const key of Object.keys(patch) as Array<keyof Omit<ControllerProfile, 'id'>>) {
    if (Object.is(reverted[key], patch[key])) {
      reverted = { ...reverted, [key]: durable[key] }
    }
  }
  return reverted
}

function sameInstalledMapSnapshot(
  left: InstalledMapSnapshot | undefined,
  right: InstalledMapSnapshot | undefined,
): boolean {
  if (!left || !right || left.status !== right.status) return left === right
  if (left.status === 'absent' && right.status === 'absent') {
    return left.observedAt === right.observedAt
  }
  if (left.status === 'present' && right.status === 'present') {
    return left.fingerprint === right.fingerprint
      && left.dimension === right.dimension
      && left.pointCount === right.pointCount
      && left.observedAt === right.observedAt
  }
  return false
}

async function persistPatch(id: string, changes: Partial<Omit<ControllerProfile, 'id'>>): Promise<void> {
  await queueControllerProfileWrite(id, () =>
    getPersonalContentProvider().updateControllerProfile(id, changes),
  )
}

export const useControllerProfileStore = create<ControllerProfileState>()((set, get) => ({
  ...controllerProfileInitialState,

  loadProfiles: async () => {
    const profiles = await getPersonalContentProvider().listControllerProfiles()
    const normalized = profiles.map((profile) => {
      const inputs = normalizeControllerInputs(profile.inputs)
      return inputs === profile.inputs ? profile : { ...profile, inputs }
    })
    lastDurableProfiles.clear()
    for (const profile of normalized) lastDurableProfiles.set(profile.id, profile)
    set({
      profiles: normalized
        .sort((a, b) => b.updatedAt - a.updatedAt),
      profilesLoaded: true,
    })
  },

  createProfile: async (seed = {}) => {
    const profile = defaultControllerProfile(seed)
    await getPersonalContentProvider().createControllerProfile(profile)
    lastDurableProfiles.set(profile.id, profile)
    trackEntityCreated('controller_profile', { has_device_id: Boolean(profile.deviceId) })
    set((s) => ({ profiles: [profile, ...s.profiles], profilesLoaded: true }))
    return profile
  },

  removeProfile: async (id) => {
    const profile = get().profiles.find((item) => item.id === id)
    if (profile?.deviceId) autoCreateSuppressedDeviceIds.add(profile.deviceId)
    await getPersonalContentProvider().deleteControllerProfile(id)
    lastDurableProfiles.delete(id)
    set((s) => ({ profiles: s.profiles.filter((profile) => profile.id !== id) }))
  },

  ensureProfileForLiveController: async (target) => {
    if (target.phase !== 'live' || !target.deviceId) return null
    if (autoCreateSuppressedDeviceIds.has(target.deviceId)) return null

    const existing = findControllerProfileForDevice(get().profiles, target.deviceId)
    if (existing) {
      const installedMap = target.installedMap
        ? toInstalledMapSnapshot(target.installedMap)
        : undefined
      const firmwareVersion = target.firmwareVersion
      const board = withControllerFirmwareUpdateReport(existing.board, {
        firmwareVersion,
        state: target.firmwareUpdateState,
        checkedAt: target.firmwareUpdateCheckedAt,
        observedFirmwareVersion: target.firmwareUpdateObservedVersion,
      })
      const changes: Partial<Omit<ControllerProfile, 'id'>> = {
        ...(target.nickname && (existing.lastKnownDeviceName !== target.nickname || existing.name !== target.nickname)
          ? { name: target.nickname, lastKnownDeviceName: target.nickname }
          : {}),
        ...(existing.lastSeenIp !== target.ip ? { lastSeenIp: target.ip } : {}),
        ...(board !== existing.board
          ? { board }
          : {}),
        ...(installedMap && !sameInstalledMapSnapshot(existing.lastKnownInstalledMap, installedMap)
          ? {
              lastKnownInstalledMap: installedMap,
              ...(installedMap.status === 'present'
                ? { lastKnownMapDim: installedMap.dimension }
                : {}),
            }
          : {}),
      }
      if (Object.keys(changes).length > 0) await get().updateProfile(existing.id, changes)
      return get().profiles.find((profile) => profile.id === existing.id) ?? existing
    }

    const pending = autoCreatePendingProfiles.get(target.deviceId)
    if (pending) return pending

    const creation = (async () => {
      const baseProfile = defaultControllerProfile(controllerProfileCreateSeed(target))
      const installedMap = target.installedMap
        ? toInstalledMapSnapshot(target.installedMap)
        : undefined
      const profile = {
        ...baseProfile,
        ...(installedMap
          ? {
              lastKnownInstalledMap: installedMap,
              ...(installedMap.status === 'present'
                ? { lastKnownMapDim: installedMap.dimension }
                : {}),
            }
          : {}),
        board: withControllerFirmwareUpdateReport(baseProfile.board, {
          firmwareVersion: target.firmwareVersion,
          state: target.firmwareUpdateState,
          checkedAt: target.firmwareUpdateCheckedAt,
          observedFirmwareVersion: target.firmwareUpdateObservedVersion,
        }),
      }
      await getPersonalContentProvider().createControllerProfile(profile)
      lastDurableProfiles.set(profile.id, profile)
      trackEntityCreated('controller_profile', { has_device_id: true })
      set((s) => ({ profiles: [profile, ...s.profiles], profilesLoaded: true }))
      return profile
    })()
    autoCreatePendingProfiles.set(target.deviceId, creation)
    try {
      return await creation
    } finally {
      if (autoCreatePendingProfiles.get(target.deviceId) === creation) {
        autoCreatePendingProfiles.delete(target.deviceId)
      }
    }
  },

  updateProfile: async (id, changes) => {
    const updatedAt = Date.now()
    const patch = { ...changes, updatedAt }
    const previous = get().profiles.find((profile) => profile.id === id)
    set((s) => ({
      profiles: s.profiles.map((profile) =>
        profile.id === id ? patchProfile(profile, patch) : profile,
      ),
    }))
    const optimistic = get().profiles.find((profile) => profile.id === id)
    try {
      await persistPatch(id, patch)
    } catch (error) {
      const durable = lastDurableProfiles.get(id) ?? previous
      set((s) => ({
        profiles: s.profiles.map((profile) =>
          profile.id === id && durable ? revertFailedPatch(profile, durable, patch) : profile,
        ),
        // Merge into an existing failure for this profile: with queued edits,
        // Retry must re-apply every failed change together. A different
        // profile's failure is replaced — its rollback already ran, so only
        // its notice is superseded, never its data.
        profileSaveFailure: {
          profileId: id,
          changes: s.profileSaveFailure?.profileId === id
            ? { ...s.profileSaveFailure.changes, ...changes }
            : changes,
        },
      }))
      throw error
    }
    lastDurableProfiles.set(id, patchProfile(lastDurableProfiles.get(id) ?? previous ?? optimistic!, patch))
    // A successful write that touches any of the failed keys supersedes the
    // whole failed intent: composite patches (an input removal edits inputs
    // AND patternBindings together) cannot be safely replayed piecemeal, so
    // Retry must never see a partially superseded failure. A write to
    // entirely different keys leaves the failure up — those changes are
    // still not durable.
    set((s) => {
      if (s.profileSaveFailure?.profileId !== id) return {}
      const overlaps = Object.keys(s.profileSaveFailure.changes)
        .some((failedKey) => failedKey in changes)
      return overlaps ? { profileSaveFailure: null } : {}
    })
    if (previous && optimistic) {
      const optInChanged = previous.keepPatternsUpToDate !== optimistic.keepPatternsUpToDate
      const generatedCodeChanged =
        controllerProfileReconciliationSignature(previous) !==
        controllerProfileReconciliationSignature(optimistic)
      if (optInChanged || (optimistic.keepPatternsUpToDate && generatedCodeChanged)) {
        useControllerStore.getState().scheduleControllerReconciliation(id)
      }
    }
  },

  dismissProfileSaveFailure: () => set({ profileSaveFailure: null }),

  retryProfileSaveFailure: async () => {
    const failure = get().profileSaveFailure
    if (!failure) return
    const current = get().profiles.find((profile) => profile.id === failure.profileId)
    const durable = lastDurableProfiles.get(failure.profileId)
    if (!current) {
      set({ profileSaveFailure: null })
      return
    }
    // Re-apply only keys still sitting at their durable value: a key a newer
    // optimistic edit owns is settled by that edit's own write, and retrying
    // the older value would clobber the newer intent. Shrink the failure to
    // the retried keys so a successful write clears it.
    const retryChanges = Object.fromEntries(
      Object.entries(failure.changes).filter(([key]) => {
        const profileKey = key as keyof Omit<ControllerProfile, 'id'>
        return !durable || Object.is(current[profileKey], durable[profileKey])
      }),
    ) as Partial<Omit<ControllerProfile, 'id'>>
    if (Object.keys(retryChanges).length === 0) {
      set({ profileSaveFailure: null })
      return
    }
    set({ profileSaveFailure: { profileId: failure.profileId, changes: retryChanges } })
    // A still-failing write re-records profileSaveFailure; the notice stays up.
    await get().updateProfile(failure.profileId, retryChanges).catch(() => {})
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
      zones: [...profile.zones, { id, name: `Zone ${profile.zones.length + 1}`, ranges: [{ start: 0, end: 0 }] }],
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

  assignHardwareBrightness: async (profileId, inputId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    if (inputId !== null && !profile.inputs.some((input) => input.id === inputId)) return
    await get().updateProfile(profileId, {
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.type === 'hardware-brightness'
          ? { ...transform, enabled: inputId !== null, inputId: inputId ?? '' }
          : transform,
      ),
    })
  },

  addPatternBinding: async (profileId, patternId, inputId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    if (!profile.inputs.some((input) => input.id === inputId)) return
    if (!patternId.trim()) return
    const id = nextId('binding', profile.patternBindings)
    const target: ControllerBindingTarget = { kind: 'call-exported-slider', name: 'sliderSpeed' }
    await get().updateProfile(profileId, {
      patternBindings: [
        ...profile.patternBindings,
        {
          id,
          patternId,
          inputId,
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

  editPower: async (profileId, edit) => {
    const profile = get().profiles.find((candidate) => candidate.id === profileId)
    if (!profile) return
    const edited = applyControllerPowerEdit(profile, edit)
    if (edited === profile) return
    await get().updateProfile(profileId, {
      globalTransforms: edited.globalTransforms,
      ...(edited.electricalProfile ? { electricalProfile: edited.electricalProfile } : {}),
    })
  },

  refreshLiveMetadata: async (profileId) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    const live = useControllerStore.getState()
    const active = live.activeIp ? live.controllers[live.activeIp] : undefined
    if (!profile || !active || active.phase !== 'live') return
    if (profile.deviceId && active.deviceId !== profile.deviceId) return

    const provider = getControllerProvider()
    const [config] = await Promise.all([
      provider.getConfig().catch(() => null),
      live.refreshInstalledMap(active.ip),
    ])
    const refreshedInstalledMap = useControllerStore.getState().controllers[active.ip]?.installedMap
    const installedMapSnapshot = refreshedInstalledMap
      ? toInstalledMapSnapshot(refreshedInstalledMap)
      : undefined
    const firmwareVersion = config?.firmwareVersion ?? active.firmwareVersion
    const liveName = config?.name ?? active.nickname
    const board = withControllerFirmwareUpdateReport(profile.board, { firmwareVersion })
    const changes: Partial<Omit<ControllerProfile, 'id'>> = {
      ...(active.deviceId && profile.deviceId !== active.deviceId ? { deviceId: active.deviceId } : {}),
      ...(liveName && (profile.name !== liveName || profile.lastKnownDeviceName !== liveName)
        ? { name: liveName, lastKnownDeviceName: liveName }
        : {}),
      ...(profile.lastSeenIp !== active.ip ? { lastSeenIp: active.ip } : {}),
      ...(typeof config?.pixelCount === 'number' ? { lastKnownPixelCount: config.pixelCount } : {}),
      ...(installedMapSnapshot
        ? {
            lastKnownInstalledMap: installedMapSnapshot,
            ...(installedMapSnapshot.status === 'present'
              ? { lastKnownMapDim: installedMapSnapshot.dimension }
              : {}),
          }
        : {}),
      ...(board !== profile.board
        ? { board }
        : {}),
    }
    if (Object.keys(changes).length > 0) await get().updateProfile(profileId, changes)
  },
}))

export const CONTROLLER_INPUT_SIGNALS: ControllerInputSignal[] = ['analog', 'digital']

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
  // Failed profile writes awaiting Retry (#810), one entry per profile, each
  // keeping its operations' patches separate: a later successful write can
  // supersede one failed operation without discarding another, and a failure
  // on one profile never erases another profile's notice. Mirrors the Show
  // editor's failure record (#792) at profile granularity.
  profileSaveFailures: Array<{
    profileId: string
    patches: Array<Partial<Omit<ControllerProfile, 'id'>>>
  }>
  dismissProfileSaveFailure: (profileId: string) => void
  /** Re-applies the profile's rolled-back patches together; a still-failing
   * write re-records the failure, so the notice stays up. */
  retryProfileSaveFailure: (profileId: string) => Promise<void>
  addInput: (profileId: string) => Promise<void>
  updateInput: (profileId: string, inputId: string, changes: Partial<ControllerInput>) => Promise<void>
  removeInput: (profileId: string, inputId: string) => Promise<void>
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
  profileSaveFailures: [] as Array<{
    profileId: string
    patches: Array<Partial<Omit<ControllerProfile, 'id'>>>
  }>,
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

// Per-key operation ownership (#810): each optimistic write stamps its keys
// with a monotonically increasing operation id. A failed write reverts only
// the keys it still owns — a later queued edit that overwrote a key (even
// with a value equal to the durable one) keeps its newer optimistic state.
// Value equality cannot prove provenance; ownership can.
let profileWriteSeq = 0
const profileKeyWriters = new Map<string, Map<string, number>>()

// Bumped whenever a durable profile mutation settles (#810). A loadProfiles
// snapshot requested before the latest settlement is stale — installing it
// would replace successfully persisted content with pre-write state — so it
// is discarded; the next refresh reads the current truth.
let profileSettleGeneration = 0
// Live-metadata refresh ordering (#876): each refresh takes a generation when
// it starts, and a refresh applies its device facts only if no refresh that
// started later has already applied. Overlapping refreshes may all land, in
// start order; an older read can never put older facts back over newer ones.
let liveMetadataRefreshGeneration = 0
const liveMetadataAppliedGeneration = new Map<string, number>()

function keyWritersFor(profileId: string): Map<string, number> {
  let writers = profileKeyWriters.get(profileId)
  if (!writers) {
    writers = new Map()
    profileKeyWriters.set(profileId, writers)
  }
  return writers
}

function revertOwnedKeys(
  current: ControllerProfile,
  durable: ControllerProfile,
  patch: Partial<Omit<ControllerProfile, 'id'>>,
  writers: Map<string, number>,
  op: number,
): ControllerProfile {
  let reverted: ControllerProfile = current
  for (const key of Object.keys(patch) as Array<keyof Omit<ControllerProfile, 'id'>>) {
    if (writers.get(key) === op) {
      reverted = { ...reverted, [key]: durable[key] }
      writers.delete(key)
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
    const generationAtRequest = profileSettleGeneration
    const profiles = await getPersonalContentProvider().listControllerProfiles()
    if (profileSettleGeneration !== generationAtRequest) return
    const normalized = profiles.map((profile) => {
      const inputs = normalizeControllerInputs(profile.inputs)
      return inputs === profile.inputs ? profile : { ...profile, inputs }
    })
    lastDurableProfiles.clear()
    // Ownership is NOT cleared here: a pending write keeps its claim across a
    // concurrent reload, so its settlement can still revert or re-assert its
    // own keys against the freshly installed durable snapshot.
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
    profileSettleGeneration += 1
    lastDurableProfiles.set(profile.id, profile)
    trackEntityCreated('controller_profile', { has_device_id: Boolean(profile.deviceId) })
    set((s) => ({ profiles: [profile, ...s.profiles], profilesLoaded: true }))
    return profile
  },

  removeProfile: async (id) => {
    const profile = get().profiles.find((item) => item.id === id)
    if (profile?.deviceId) autoCreateSuppressedDeviceIds.add(profile.deviceId)
    await getPersonalContentProvider().deleteControllerProfile(id)
    profileSettleGeneration += 1
    lastDurableProfiles.delete(id)
    profileKeyWriters.delete(id)
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
      profileSettleGeneration += 1
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
    const op = ++profileWriteSeq
    set((s) => ({
      profiles: s.profiles.map((profile) =>
        profile.id === id ? patchProfile(profile, patch) : profile,
      ),
    }))
    // The writer map is resolved at every use, never captured across awaits:
    // profile removal swaps the map out, and a stale capture would let a
    // detached claim revert another write's keys.
    for (const key of Object.keys(patch)) keyWritersFor(id).set(key, op)
    const optimistic = get().profiles.find((profile) => profile.id === id)
    try {
      await persistPatch(id, patch)
    } catch (error) {
      const durable = lastDurableProfiles.get(id) ?? previous
      set((s) => {
        const existing = s.profileSaveFailures.find((failure) => failure.profileId === id)
        return {
          profiles: s.profiles.map((profile) =>
            profile.id === id && durable
              ? revertOwnedKeys(profile, durable, patch, keyWritersFor(id), op)
              : profile,
          ),
          // Each operation's patch is kept separately so supersession and
          // Retry can treat composite patches atomically without coupling
          // independent failed edits to each other.
          profileSaveFailures: [
            ...s.profileSaveFailures.filter((failure) => failure.profileId !== id),
            { profileId: id, patches: [...(existing?.patches ?? []), changes] },
          ],
        }
      })
      throw error
    }
    profileSettleGeneration += 1
    lastDurableProfiles.set(id, patchProfile(lastDurableProfiles.get(id) ?? previous ?? optimistic!, patch))
    // Re-assert the keys this operation still owns, then release them: a
    // concurrent loadProfiles can have installed a pre-write durable snapshot
    // while the write was in flight, and ownership proves no newer edit holds
    // these keys.
    const writersAtSettle = keyWritersFor(id)
    set((s) => ({
      profiles: s.profiles.map((profile) => {
        if (profile.id !== id) return profile
        let asserted = profile
        for (const key of Object.keys(patch) as Array<keyof Omit<ControllerProfile, 'id'>>) {
          if (writersAtSettle.get(key) === op && !Object.is(asserted[key], patch[key])) {
            asserted = { ...asserted, [key]: patch[key] }
          }
        }
        return asserted
      }),
    }))
    for (const key of Object.keys(patch)) {
      if (writersAtSettle.get(key) === op) writersAtSettle.delete(key)
    }
    // A successful write supersedes exactly the failed patches it overlaps: a
    // composite patch (an input removal edits inputs AND patternBindings
    // together) dies whole because it cannot be safely replayed piecemeal,
    // while an independent failed edit to other keys stays retryable.
    set((s) => {
      const existing = s.profileSaveFailures.find((failure) => failure.profileId === id)
      if (!existing) return {}
      const remaining = existing.patches.filter(
        (failedPatch) => !Object.keys(failedPatch).some((failedKey) => failedKey in changes),
      )
      if (remaining.length === existing.patches.length) return {}
      return {
        profileSaveFailures: [
          ...s.profileSaveFailures.filter((failure) => failure.profileId !== id),
          ...(remaining.length > 0 ? [{ profileId: id, patches: remaining }] : []),
        ],
      }
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

  dismissProfileSaveFailure: (profileId) => set((s) => ({
    profileSaveFailures: s.profileSaveFailures.filter((failure) => failure.profileId !== profileId),
  })),

  retryProfileSaveFailure: async (profileId) => {
    const failure = get().profileSaveFailures.find((entry) => entry.profileId === profileId)
    if (!failure) return
    const drop = () => set((s) => ({
      profileSaveFailures: s.profileSaveFailures.filter((entry) => entry.profileId !== profileId),
    }))
    const current = get().profiles.find((profile) => profile.id === profileId)
    const durable = lastDurableProfiles.get(profileId)
    if (!current) {
      drop()
      return
    }
    // Re-apply the failed patches merged in order, but a patch is retried
    // only while EVERY one of its keys still sits at its durable value: a
    // key a newer optimistic edit owns is settled by that edit's own write,
    // and a composite patch (an input removal edits inputs AND
    // patternBindings together) must never be split into a partial write
    // that could persist dangling references.
    const keyAtDurable = (key: string) => {
      const profileKey = key as keyof Omit<ControllerProfile, 'id'>
      return !durable || Object.is(current[profileKey], durable[profileKey])
    }
    const retryable = failure.patches.filter(
      (failedPatch) => Object.keys(failedPatch).every(keyAtDurable),
    )
    const retryChanges = Object.assign({}, ...retryable) as Partial<Omit<ControllerProfile, 'id'>>
    drop()
    if (Object.keys(retryChanges).length === 0) return
    // A still-failing write re-records the failure; the notice stays up.
    await get().updateProfile(profileId, retryChanges).catch(() => {})
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
    liveMetadataRefreshGeneration += 1
    const generation = liveMetadataRefreshGeneration

    const provider = getControllerProvider()
    const [config] = await Promise.all([
      provider.getConfig().catch(() => null),
      live.refreshInstalledMap(active.ip),
    ])
    // Compare against the profile as it is *now*: profile writes are frequent
    // while a Controller is live (reconciliation, installed-map snapshots, other
    // refreshes), and device facts read moments ago are still true (#876). Only
    // the name is guarded against an intervening rename: a newer profile name
    // that no longer matches what this refresh started from wins outright, and
    // a refresh that started later and already applied outranks this one.
    const current = get().profiles.find((candidate) => candidate.id === profileId)
    if (!current) return
    if ((liveMetadataAppliedGeneration.get(profileId) ?? 0) > generation) return
    liveMetadataAppliedGeneration.set(profileId, generation)
    const nameUntouched = current.name === profile.name
      && current.lastKnownDeviceName === profile.lastKnownDeviceName
    const refreshedInstalledMap = useControllerStore.getState().controllers[active.ip]?.installedMap
    const installedMapSnapshot = refreshedInstalledMap
      ? toInstalledMapSnapshot(refreshedInstalledMap)
      : undefined
    const firmwareVersion = config?.firmwareVersion ?? active.firmwareVersion
    const liveName = config?.name ?? active.nickname
    const board = withControllerFirmwareUpdateReport(current.board, { firmwareVersion })
    const changes: Partial<Omit<ControllerProfile, 'id'>> = {
      ...(active.deviceId && current.deviceId !== active.deviceId ? { deviceId: active.deviceId } : {}),
      ...(nameUntouched && liveName
        && (current.name !== liveName || current.lastKnownDeviceName !== liveName)
        ? { name: liveName, lastKnownDeviceName: liveName }
        : {}),
      ...(current.lastSeenIp !== active.ip ? { lastSeenIp: active.ip } : {}),
      ...(typeof config?.pixelCount === 'number' && current.lastKnownPixelCount !== config.pixelCount
        ? { lastKnownPixelCount: config.pixelCount }
        : {}),
      ...(installedMapSnapshot
        ? {
            lastKnownInstalledMap: installedMapSnapshot,
            ...(installedMapSnapshot.status === 'present'
              ? { lastKnownMapDim: installedMapSnapshot.dimension }
              : {}),
          }
        : {}),
      ...(board !== current.board
        ? { board }
        : {}),
    }
    if (Object.keys(changes).length > 0) await get().updateProfile(profileId, changes)
  },
}))

export const CONTROLLER_INPUT_SIGNALS: ControllerInputSignal[] = ['analog', 'digital']

import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { MapRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import {
  NullControllerProvider,
  type ControllerConfig,
} from '@/engine/ControllerProvider'
import {
  resetControllerProvider,
  setControllerProvider,
} from '@/engine/controllerProviderRegistry'
import {
  defaultControllerProfile,
  __resetControllerProfileAutoCreateGuards,
  controllerProfileInitialState,
  useControllerProfileStore,
  type ControllerProfile,
} from './controllerProfileStore'
import { validateControllerProfile } from '@/engine/controllerProfile'
import { controllerInitialState, useControllerStore } from './controllerStore'
import { __resetControllerProfileWriteQueue } from '@/engine/controllerProfileWriteQueue'
import { encodeMapData } from '@/engine/mapPush'

class FakeControllerProvider extends NullControllerProvider {
  config: ControllerConfig = {
    name: 'Pixelblaze shelf',
    pixelCount: 256,
    firmwareVersion: '3.68',
  }

  getConfig(): Promise<ControllerConfig> {
    return Promise.resolve(this.config)
  }

  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve([
      [0, 0, 0],
      [1, 1, 1],
    ])
  }

  getPixelMapData(): Promise<Uint8Array | null> {
    return Promise.resolve(encodeMapData([
      [0, 0, 0],
      [1, 1, 1],
    ]))
  }
}

function memoryProvider(seed: ControllerProfile[] = []): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const maps = new Map<string, MapRecord>()
  const mixins = new Map()
  const shows = new Map<string, ShowRecord>()
  const controllers = new Map<string, ControllerProfile>(seed.map((profile) => [profile.id, profile]))
  return {
    id: 'memory-test',
    listPatterns: async () => [...patterns.values()],
    createPattern: async (record) => {
      patterns.set(record.id, record)
    },
    updatePattern: async (id, changes) => {
      const existing = patterns.get(id)
      if (existing) patterns.set(id, { ...existing, ...changes })
    },
    deletePattern: async (id) => {
      patterns.delete(id)
    },
    listMaps: async () => [...maps.values()],
    createMap: async (record) => {
      maps.set(record.id, record)
    },
    updateMap: async (id, changes) => {
      const existing = maps.get(id)
      if (existing) maps.set(id, { ...existing, ...changes })
    },
    deleteMap: async (id) => {
      maps.delete(id)
    },
    listMixins: async () => [...mixins.values()],
    createMixin: async (record) => {
      mixins.set(record.id, record)
    },
    updateMixin: async (id, changes) => {
      const existing = mixins.get(id)
      if (existing) mixins.set(id, { ...existing, ...changes })
    },
    deleteMixin: async (id) => {
      mixins.delete(id)
    },
    listShows: async () => [...shows.values()],
    createShow: async (record) => {
      shows.set(record.id, record)
    },
    updateShow: async (id, changes) => {
      const existing = shows.get(id)
      if (existing) shows.set(id, { ...existing, ...changes })
    },
    deleteShow: async (id) => {
      shows.delete(id)
    },
    listControllerProfiles: async () => [...controllers.values()],
    createControllerProfile: async (profile) => {
      controllers.set(profile.id, profile)
    },
    updateControllerProfile: async (id, changes) => {
      const existing = controllers.get(id)
      if (!existing) throw new Error(`Controller profile ${id} not found`)
      controllers.set(id, { ...existing, ...changes })
    },
    deleteControllerProfile: async (id) => {
      controllers.delete(id)
    },
    getLastActive: async () => undefined,
    setLastActive: async () => {},
    getDemoOverrides: async () => undefined,
    setDemoOverrides: async () => {},
  }
}

beforeEach(() => {
  resetPersonalContentProvider()
  resetControllerProvider()
  __resetControllerProfileAutoCreateGuards()
  __resetControllerProfileWriteQueue()
  useControllerProfileStore.setState(controllerProfileInitialState)
  useControllerStore.setState(controllerInitialState)
})

describe('controllerProfileStore', () => {
  it('defaults automatic managed-pattern reconciliation off', () => {
    expect(defaultControllerProfile({ id: 'profile-1' }).keepPatternsUpToDate).toBe(false)
  })

  it('creates a valid default profile with disabled global transforms', () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      deviceName: 'Pixelblaze shelf',
      ip: '192.168.8.224',
      firmwareVersion: '3.67',
      now: 100,
    })

    expect(profile).toMatchObject({
      id: 'ctrl-1',
      name: 'Pixelblaze shelf',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      lastKnownDeviceName: 'Pixelblaze shelf',
      lastSeenIp: '192.168.8.224',
      board: {
        firmwareVersion: '3.67',
      },
      globalTransforms: expect.arrayContaining([
        expect.objectContaining({
          type: 'power-cap',
          mode: 'direct',
          maxDuty: 0.25,
        }),
      ]),
    })
    expect(profile.globalTransforms.find((transform) => transform.type === 'power-cap'))
      .not.toHaveProperty('milliampsPerPixel')
    expect(validateControllerProfile(profile)).toEqual({ ok: true, errors: [] })
  })

  it('loads, creates, updates, and removes durable controller profiles', async () => {
    const oldProfile = defaultControllerProfile({ id: 'old', name: 'Old', now: 1 })
    const newProfile = defaultControllerProfile({ id: 'new', name: 'New', now: 2 })
    setPersonalContentProvider(memoryProvider([oldProfile, newProfile]))

    await useControllerProfileStore.getState().loadProfiles()
    expect(useControllerProfileStore.getState().profiles.map((profile) => profile.id)).toEqual(['new', 'old'])

    const created = await useControllerProfileStore.getState().createProfile({ deviceName: 'Live PB' })
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      id: created.id,
      name: 'Live PB',
      lastKnownDeviceName: 'Live PB',
    })

    await useControllerProfileStore.getState().updateProfile(created.id, { name: 'Road case' })
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({ name: 'Road case' })

    await useControllerProfileStore.getState().removeProfile(created.id)
    expect(useControllerProfileStore.getState().profiles.some((profile) => profile.id === created.id)).toBe(false)
  })

  it('shows an auto-saved profile edit immediately while persistence is pending', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    let releaseWrite!: () => void
    const provider = memoryProvider([profile])
    provider.updateControllerProfile = async () => {
      await new Promise<void>((resolve) => {
        releaseWrite = resolve
      })
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    const pending = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Immediate' })

    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Immediate')
    await Promise.resolve()
    await Promise.resolve()
    releaseWrite()
    await pending
  })

  it('rolls back the optimistic profile edit when auto-save fails', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    provider.updateControllerProfile = async () => {
      throw new Error('save failed')
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await expect(
      useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Unsaved' }),
    ).rejects.toThrow('save failed')

    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Original')
  })

  it('schedules reconciliation only when managed generated code or the opt-in changes', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', now: 1 })
    const scheduled: string[] = []
    setPersonalContentProvider(memoryProvider([profile]))
    useControllerStore.setState({
      scheduleControllerReconciliation: (profileId) => scheduled.push(profileId),
    })
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' })
    expect(scheduled).toEqual([])

    await useControllerProfileStore.getState().updateProfile('ctrl-1', {
      keepPatternsUpToDate: true,
    })
    expect(scheduled).toEqual(['ctrl-1'])

    const enabled = useControllerProfileStore.getState().profiles[0].globalTransforms.map(
      (transform) => transform.type === 'power-cap'
        ? { ...transform, enabled: true }
        : transform,
    )
    await useControllerProfileStore.getState().updateProfile('ctrl-1', {
      globalTransforms: enabled,
    })
    expect(scheduled).toEqual(['ctrl-1', 'ctrl-1'])
  })

  it('keeps bindings consistent when removing an input', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', now: 1 })
    setPersonalContentProvider(memoryProvider([profile]))
    await useControllerProfileStore.getState().loadProfiles()
    await useControllerProfileStore.getState().addInput('ctrl-1')
    await useControllerProfileStore.getState().addPatternBinding('ctrl-1', 'pat-1', 'input0')

    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toHaveLength(1)

    await useControllerProfileStore.getState().removeInput('ctrl-1', 'input0')

    expect(useControllerProfileStore.getState().profiles[0].inputs).toEqual([])
    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toEqual([])
  })

  it('drops the retired input role on load so later writes cannot persist it (#772)', async () => {
    const base = defaultControllerProfile({ id: 'ctrl-1', now: 1 })
    const legacy = {
      ...base,
      inputs: [{
        id: 'input0',
        name: 'Front pot',
        pin: 33,
        signal: 'analog',
        role: 'brightness',
        smoothing: 0.2,
        fallback: 0.5,
        invert: false,
      }],
    } as unknown as ControllerProfile
    const provider = memoryProvider([legacy])
    setPersonalContentProvider(provider)

    await useControllerProfileStore.getState().loadProfiles()
    expect(useControllerProfileStore.getState().profiles[0].inputs[0]).not.toHaveProperty('role')

    await useControllerProfileStore.getState().updateInput('ctrl-1', 'input0', { name: 'Renamed' })

    const stored = (await provider.listControllerProfiles())[0]
    expect(stored.inputs[0]).toEqual({
      id: 'input0',
      name: 'Renamed',
      pin: 33,
      signal: 'analog',
      smoothing: 0.2,
      fallback: 0.5,
      invert: false,
    })
  })

  it('assigns, moves, and clears hardware brightness through the real transform (#772)', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', now: 1 })
    setPersonalContentProvider(memoryProvider([profile]))
    await useControllerProfileStore.getState().loadProfiles()
    const store = () => useControllerProfileStore.getState()
    await store().addInput('ctrl-1')
    await store().addInput('ctrl-1')
    await store().updateInput('ctrl-1', 'input1', { pin: 34 })
    const brightness = () => store().profiles[0].globalTransforms
      .find((transform) => transform.type === 'hardware-brightness')

    expect(brightness()).toMatchObject({ enabled: false, inputId: '' })

    await store().assignHardwareBrightness('ctrl-1', 'input0')
    expect(brightness()).toMatchObject({ enabled: true, inputId: 'input0' })
    expect(validateControllerProfile(store().profiles[0])).toEqual({ ok: true, errors: [] })

    // Exactly one hardware-brightness transform exists, so moving it to another
    // input is inherently exclusive: the first input stops driving brightness.
    await store().assignHardwareBrightness('ctrl-1', 'input1')
    expect(brightness()).toMatchObject({ enabled: true, inputId: 'input1' })

    await store().assignHardwareBrightness('ctrl-1', null)
    expect(brightness()).toMatchObject({ enabled: false, inputId: '' })
    expect(validateControllerProfile(store().profiles[0])).toEqual({ ok: true, errors: [] })
  })

  it('leaves unrelated Pattern uses untouched across a brightness and binding sequence (#772)', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', now: 1 })
    setPersonalContentProvider(memoryProvider([profile]))
    await useControllerProfileStore.getState().loadProfiles()
    const store = () => useControllerProfileStore.getState()
    await store().addInput('ctrl-1')
    await store().addInput('ctrl-1')
    await store().updateInput('ctrl-1', 'input1', { pin: 34 })
    await store().addPatternBinding('ctrl-1', 'pat-other', 'input1')
    const untouched = store().profiles[0].patternBindings[0]

    await store().assignHardwareBrightness('ctrl-1', 'input0')
    await store().addPatternBinding('ctrl-1', 'pat-caustics', 'input0')
    expect(store().profiles[0].patternBindings).toMatchObject([
      { patternId: 'pat-other', inputId: 'input1' },
      { patternId: 'pat-caustics', inputId: 'input0' },
    ])
    expect(validateControllerProfile(store().profiles[0])).toEqual({ ok: true, errors: [] })

    const override = store().profiles[0].patternBindings[1]
    await store().removePatternBinding('ctrl-1', override.id)

    expect(store().profiles[0].patternBindings).toEqual([untouched])
    expect(store().profiles[0].globalTransforms
      .find((transform) => transform.type === 'hardware-brightness'))
      .toMatchObject({ enabled: true, inputId: 'input0' })
    expect(validateControllerProfile(store().profiles[0])).toEqual({ ok: true, errors: [] })
  })

  it('persists power authoring through the store while preserving unrelated profile state (#772)', async () => {
    const base = defaultControllerProfile({ id: 'ctrl-1', now: 1 })
    const profile: ControllerProfile = {
      ...base,
      lastKnownPixelCount: 100,
      globalTransforms: base.globalTransforms.map((transform) => (
        transform.type === 'power-cap'
          ? { ...transform, enabled: true, mode: 'derived', maxDuty: 0.25 }
          : transform
      )),
    }
    const provider = memoryProvider([profile])
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().editPower('ctrl-1', { type: 'configure-model' })

    const edited = useControllerProfileStore.getState().profiles[0]
    expect(edited.electricalProfile).toEqual({
      ledPresetId: 'ws2812-5v-individual',
      supplyBudget: { value: 3, unit: 'amps' },
    })
    expect(edited.globalTransforms.find((transform) => transform.type === 'power-cap'))
      .toMatchObject({ mode: 'derived', maxDuty: 0.5 })
    expect(edited.globalTransforms.find((transform) => transform.type === 'hardware-brightness'))
      .toEqual(profile.globalTransforms[0])
    expect((await provider.listControllerProfiles())[0]).toMatchObject({
      electricalProfile: edited.electricalProfile,
      globalTransforms: edited.globalTransforms,
    })
  })

  it('ignores a brightness assignment naming an input the profile does not have (#772)', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', now: 1 })
    setPersonalContentProvider(memoryProvider([profile]))
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().assignHardwareBrightness('ctrl-1', 'ghost')

    expect(useControllerProfileStore.getState().profiles[0].globalTransforms
      .find((transform) => transform.type === 'hardware-brightness'))
      .toMatchObject({ enabled: false, inputId: '' })
  })

  it('refreshes the durable profile name and last-known metadata from the active live controller', async () => {
    const baseProfile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      firmwareVersion: '3.67',
      now: 1,
    })
    const profile = {
      ...baseProfile,
      board: {
        ...baseProfile.board,
        firmwareUpdate: {
          state: 'available' as const,
          checkedAt: 100,
          firmwareVersion: '3.67',
        },
      },
    }
    setPersonalContentProvider(memoryProvider([profile]))
    setControllerProvider(new FakeControllerProvider())
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          deviceId: 'pixelblaze_pb32_3cd4ee549434',
          nickname: 'Pixelblaze shelf',
          mapDim: 3,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().refreshLiveMetadata('ctrl-1')

    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      name: 'Pixelblaze shelf',
      lastKnownDeviceName: 'Pixelblaze shelf',
      lastSeenIp: '192.168.8.224',
      lastKnownPixelCount: 256,
      lastKnownMapDim: 3,
      board: {
        firmwareVersion: '3.68',
      },
    })
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareUpdate).toBeUndefined()
  })

  it('auto-creates a default profile for a signed-in live controller with a stable device id', async () => {
    setPersonalContentProvider(memoryProvider())

    const created = await useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      nickname: 'Pixelblaze shelf',
      firmwareVersion: '3.67',
      phase: 'live',
      mapDim: 2,
    })

    expect(created).toMatchObject({
      name: 'Pixelblaze shelf',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      lastKnownDeviceName: 'Pixelblaze shelf',
      lastSeenIp: '192.168.8.224',
      board: {
        firmwareVersion: '3.67',
      },
    })
    expect(useControllerProfileStore.getState().profiles).toHaveLength(1)
  })

  it('shares one in-flight auto-create across background and explicit profile requests', async () => {
    const provider = memoryProvider()
    const create = vi.fn(provider.createControllerProfile)
    provider.createControllerProfile = create
    setPersonalContentProvider(provider)
    const target = {
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      nickname: 'Pixelblaze shelf',
      phase: 'live' as const,
      mapDim: 2 as const,
    }

    const [background, explicit] = await Promise.all([
      useControllerProfileStore.getState().ensureProfileForLiveController(target),
      useControllerProfileStore.getState().ensureProfileForLiveController(target),
    ])

    expect(background?.id).toBe(explicit?.id)
    expect(create).toHaveBeenCalledOnce()
    expect(useControllerProfileStore.getState().profiles).toHaveLength(1)
  })

  it('does not auto-create a durable profile for an unclaimed live controller', async () => {
    setPersonalContentProvider(memoryProvider())

    await expect(useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: null,
      nickname: 'Pixelblaze shelf',
      phase: 'live',
      mapDim: 2,
    })).resolves.toBeNull()

    expect(useControllerProfileStore.getState().profiles).toEqual([])
  })

  it('refreshes an existing profile instead of creating a duplicate', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      name: 'Road case',
      now: 1,
    })
    setPersonalContentProvider(memoryProvider([profile]))
    await useControllerProfileStore.getState().loadProfiles()

    const ensured = await useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      nickname: 'Pixelblaze shelf',
      firmwareVersion: '3.68',
      phase: 'live',
      mapDim: 2,
    })

    expect(ensured?.id).toBe('ctrl-1')
    expect(useControllerProfileStore.getState().profiles).toHaveLength(1)
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      id: 'ctrl-1',
      name: 'Pixelblaze shelf',
      lastKnownDeviceName: 'Pixelblaze shelf',
      lastSeenIp: '192.168.8.224',
      board: {
        firmwareVersion: '3.68',
      },
    })
  })

  it('persists successful installed-map snapshots and preserves them across read failure', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
    const provider = memoryProvider([profile])
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      phase: 'live',
      mapDim: 2,
      installedMap: {
        status: 'present',
        bytes: encodeMapData([[0, 0], [1, 1]]),
        fingerprint: '9a0c9e7f',
        dimension: 2,
        pointCount: 2,
        observedAt: 100,
      },
    })
    await useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      phase: 'live',
      mapDim: null,
      installedMap: { status: 'error', message: 'timeout' },
    })

    useControllerProfileStore.setState(controllerProfileInitialState)
    await useControllerProfileStore.getState().loadProfiles()
    expect(useControllerProfileStore.getState().profiles[0].lastKnownInstalledMap).toEqual({
      status: 'present',
      fingerprint: '9a0c9e7f',
      dimension: 2,
      pointCount: 2,
      observedAt: 100,
    })
  })

  it('persists confirmed installed-map absence over the previous snapshot', async () => {
    const profile = {
      ...defaultControllerProfile({
        id: 'ctrl-1',
        deviceId: 'pixelblaze_pb32_3cd4ee549434',
        now: 1,
      }),
      lastKnownInstalledMap: {
        status: 'present' as const,
        fingerprint: 'old',
        dimension: 2 as const,
        pointCount: 256,
        observedAt: 1,
      },
    }
    const provider = memoryProvider([profile])
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      phase: 'live',
      mapDim: null,
      installedMap: { status: 'absent', observedAt: 200 },
    })

    expect(useControllerProfileStore.getState().profiles[0].lastKnownInstalledMap).toEqual({
      status: 'absent',
      observedAt: 200,
    })
  })

  it('persists an available firmware observation for the offline Controller Profile', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      firmwareVersion: '3.67',
      now: 1,
    })
    const provider = memoryProvider([profile])
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      firmwareVersion: '3.67',
      firmwareUpdateState: 'available',
      firmwareUpdateCheckedAt: 123_456,
      phase: 'live',
      mapDim: 2,
    })

    useControllerProfileStore.setState(controllerProfileInitialState)
    await useControllerProfileStore.getState().loadProfiles()
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareUpdate).toEqual({
      state: 'available',
      checkedAt: 123_456,
      firmwareVersion: '3.67',
    })
  })

  it('includes an already-observed firmware update when auto-creating a Controller Profile', async () => {
    const provider = memoryProvider()
    setPersonalContentProvider(provider)

    await useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      nickname: 'Pixelblaze shelf',
      firmwareVersion: '3.67',
      firmwareUpdateState: 'available',
      firmwareUpdateCheckedAt: 123_456,
      firmwareUpdateObservedVersion: '3.67',
      phase: 'live',
      mapDim: 2,
    })

    useControllerProfileStore.setState(controllerProfileInitialState)
    await useControllerProfileStore.getState().loadProfiles()
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareUpdate).toEqual({
      state: 'available',
      checkedAt: 123_456,
      firmwareVersion: '3.67',
    })
  })

  it('preserves only firmware observations that remain conclusive for the installed version', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      firmwareVersion: '3.67',
      now: 1,
    })
    setPersonalContentProvider(memoryProvider([profile]))
    await useControllerProfileStore.getState().loadProfiles()
    const ensure = useControllerProfileStore.getState().ensureProfileForLiveController
    const target = {
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      firmwareVersion: '3.67',
      firmwareUpdateObservedVersion: '3.67',
      phase: 'live' as const,
      mapDim: 2 as const,
    }

    await ensure({
      ...target,
      firmwareUpdateState: 'available',
      firmwareUpdateCheckedAt: 100,
    })
    await ensure({
      ...target,
      firmwareUpdateState: 'unknown',
      firmwareUpdateCheckedAt: 200,
    })
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareUpdate).toEqual({
      state: 'available',
      checkedAt: 100,
      firmwareVersion: '3.67',
    })

    await ensure({
      ...target,
      firmwareUpdateState: 'current',
      firmwareUpdateCheckedAt: 300,
    })
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareUpdate).toEqual({
      state: 'current',
      checkedAt: 300,
      firmwareVersion: '3.67',
    })

    await ensure({
      ...target,
      firmwareVersion: '3.68',
      firmwareUpdateState: 'current',
      firmwareUpdateCheckedAt: 300,
    })
    expect(useControllerProfileStore.getState().profiles[0].board).toEqual({
      kind: 'pixelblaze-v3-standard',
      firmwareVersion: '3.68',
    })
  })

  it('does not immediately recreate a live controller profile after deleting it in the same session', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
    setPersonalContentProvider(memoryProvider([profile]))
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().removeProfile('ctrl-1')
    const ensured = await useControllerProfileStore.getState().ensureProfileForLiveController({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      nickname: 'Pixelblaze shelf',
      phase: 'live',
      mapDim: 2,
    })

    expect(ensured).toBeNull()
    expect(useControllerProfileStore.getState().profiles).toEqual([])
  })
})

describe('profile save-failure notice state (#810)', () => {
  it('records the rejected changes for the notice and clears them on dismiss', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    provider.updateControllerProfile = async () => {
      throw new Error('save failed')
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await expect(
      useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Unsaved' }),
    ).rejects.toThrow('save failed')
    expect(useControllerProfileStore.getState().profileSaveFailure).toEqual({
      profileId: 'ctrl-1',
      changes: { name: 'Unsaved' },
    })

    useControllerProfileStore.getState().dismissProfileSaveFailure()
    expect(useControllerProfileStore.getState().profileSaveFailure).toBeNull()
  })

  it('retry re-applies the rolled-back change once persistence recovers', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    provider.updateControllerProfile = async () => {
      throw new Error('save failed')
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' }).catch(() => {})

    provider.updateControllerProfile = durableUpdate
    await useControllerProfileStore.getState().retryProfileSaveFailure()

    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Renamed')
    expect(useControllerProfileStore.getState().profileSaveFailure).toBeNull()
  })

  it('a retry that still fails keeps the notice without rejecting', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    provider.updateControllerProfile = async () => {
      throw new Error('save failed')
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' }).catch(() => {})

    await useControllerProfileStore.getState().retryProfileSaveFailure()

    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Original')
    expect(useControllerProfileStore.getState().profileSaveFailure).toMatchObject({ profileId: 'ctrl-1' })
  })

  it('a later successful write to the profile clears a stale notice', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    provider.updateControllerProfile = async () => {
      throw new Error('save failed')
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' }).catch(() => {})
    expect(useControllerProfileStore.getState().profileSaveFailure).not.toBeNull()

    provider.updateControllerProfile = durableUpdate
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Road case' })

    expect(useControllerProfileStore.getState().profileSaveFailure).toBeNull()
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Road case')
  })
})

describe('profile save-failure clearing scope (#810 review round 3)', () => {
  it('an unrelated successful write leaves a still-valid failure notice up', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let failRenames = true
    provider.updateControllerProfile = async (id, changes) => {
      if (failRenames && 'name' in changes) throw new Error('save failed')
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Unsaved' }).catch(() => {})
    expect(useControllerProfileStore.getState().profileSaveFailure).not.toBeNull()

    // A different, successful edit to the same profile: the rename is still
    // not durable, so its notice must survive.
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { keepPatternsUpToDate: true })
    expect(useControllerProfileStore.getState().profileSaveFailure).toMatchObject({
      profileId: 'ctrl-1',
      changes: { name: 'Unsaved' },
    })

    // Re-doing the failed edit (manually or via Retry) clears it.
    failRenames = false
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Unsaved' })
    expect(useControllerProfileStore.getState().profileSaveFailure).toBeNull()
  })
})

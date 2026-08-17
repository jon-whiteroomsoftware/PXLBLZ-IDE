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
  __resetLiveMetadataRefreshOrdering,
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
  __resetLiveMetadataRefreshOrdering()
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

  it('discards a stale metadata refresh after a newer profile rename settles', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      name: 'Old alias',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
    const provider = new FakeControllerProvider()
    let resolveConfig!: (config: ControllerConfig) => void
    provider.getConfig = () => new Promise((resolve) => { resolveConfig = resolve })
    setPersonalContentProvider(memoryProvider([profile]))
    setControllerProvider(provider)
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          mapDim: null,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    const refresh = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    await useControllerProfileStore.getState().updateProfile(profile.id, {
      name: 'Road case',
      lastKnownDeviceName: 'Road case',
    })
    resolveConfig({ name: 'Burner bag', pixelCount: 256 })
    await refresh

    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      name: 'Road case',
      lastKnownDeviceName: 'Road case',
    })
  })

  it('still lands device facts when the profile changed during the read (#876)', async () => {
    // Profile writes are frequent while a Controller is live (reconciliation,
    // installed-map snapshots, other refreshes). A refresh must not drop the
    // device's reported pixel count just because some unrelated field moved
    // while it was reading; only a concurrent rename keeps its own name.
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
    const provider = new FakeControllerProvider()
    let resolveConfig!: (config: ControllerConfig) => void
    provider.getConfig = () => new Promise((resolve) => { resolveConfig = resolve })
    setPersonalContentProvider(memoryProvider([{ ...profile, lastKnownPixelCount: 256 }]))
    setControllerProvider(provider)
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          mapDim: null,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    const refresh = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    await useControllerProfileStore.getState().updateProfile(profile.id, { keepPatternsUpToDate: true })
    resolveConfig({ name: 'Burner bag', pixelCount: 200 })
    await refresh

    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      name: 'Burner bag',
      keepPatternsUpToDate: true,
      lastKnownPixelCount: 200,
      lastSeenIp: '192.168.8.224',
    })
  })

  it('never lets an older read overwrite the facts a newer refresh already landed (#876)', async () => {
    // Refresh A reads first but finishes last (slow map read); refresh B starts
    // later, reads a newer count, and lands. A must not put the older count back.
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
    const provider = new FakeControllerProvider()
    const pending: Array<(config: ControllerConfig) => void> = []
    provider.getConfig = () => new Promise((resolve) => { pending.push(resolve) })
    setPersonalContentProvider(memoryProvider([{ ...profile, lastKnownPixelCount: 256 }]))
    setControllerProvider(provider)
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          mapDim: null,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    const first = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    const second = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    expect(pending).toHaveLength(2)
    // The newer refresh answers first with the newer count and lands it.
    pending[1]({ name: 'Burner bag', pixelCount: 300 })
    await second
    expect(useControllerProfileStore.getState().profiles[0].lastKnownPixelCount).toBe(300)
    // The older refresh answers late with the older count and must be discarded.
    pending[0]({ name: 'Burner bag', pixelCount: 200 })
    await first
    expect(useControllerProfileStore.getState().profiles[0].lastKnownPixelCount).toBe(300)
  })

  it('does not let a newer refresh whose config read failed suppress an older valid read (#876)', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
    const provider = new FakeControllerProvider()
    const pending: Array<{ resolve: (config: ControllerConfig) => void; reject: (error: Error) => void }> = []
    provider.getConfig = () => new Promise((resolve, reject) => { pending.push({ resolve, reject }) })
    setPersonalContentProvider(memoryProvider([{ ...profile, lastKnownPixelCount: 256 }]))
    setControllerProvider(provider)
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          mapDim: null,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    const first = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    const second = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    // The newer refresh fails its config read and finishes first.
    pending[1].reject(new Error('timed out'))
    await second
    // The older refresh's valid read still lands.
    pending[0].resolve({ name: 'Burner bag', pixelCount: 200 })
    await first
    expect(useControllerProfileStore.getState().profiles[0].lastKnownPixelCount).toBe(200)

    // The same holds when the newer read succeeds but carries no pixel count.
    const third = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    const fourth = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    pending[3].resolve({ name: 'Burner bag' })
    await fourth
    pending[2].resolve({ name: 'Burner bag', pixelCount: 300 })
    await third
    expect(useControllerProfileStore.getState().profiles[0].lastKnownPixelCount).toBe(300)
  })

  it('orders each config-derived fact independently across overlapping refreshes (#876)', async () => {
    // Newer refresh B lands firmware only; older refresh A finishes later with a
    // pixel count and a stale firmware version. A's count lands, A's firmware
    // must not replace B's newer one.
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      firmwareVersion: '3.66',
      now: 1,
    })
    const provider = new FakeControllerProvider()
    const pending: Array<(config: ControllerConfig) => void> = []
    provider.getConfig = () => new Promise((resolve) => { pending.push(resolve) })
    setPersonalContentProvider(memoryProvider([{ ...profile, lastKnownPixelCount: 256 }]))
    setControllerProvider(provider)
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          mapDim: null,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    const first = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    const second = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    pending[1]({ name: 'Burner bag', firmwareVersion: '3.68' })
    await second
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareVersion).toBe('3.68')
    pending[0]({ name: 'Burner bag', firmwareVersion: '3.66', pixelCount: 200 })
    await first
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      lastKnownPixelCount: 200,
      board: { firmwareVersion: '3.68' },
    })

    // Once an actual firmware read has landed, a cached live-entry stand-in
    // never replaces it — in either completion order.
    useControllerStore.setState((state) => ({
      controllers: {
        ...state.controllers,
        '192.168.8.224': { ...state.controllers['192.168.8.224']!, firmwareVersion: '3.69' },
      },
    }))
    const third = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    const fourth = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    pending[3]({ name: 'Burner bag', pixelCount: 220 })
    await fourth
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareVersion).toBe('3.68')
    pending[2]({ name: 'Burner bag', firmwareVersion: '3.70' })
    await third
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      lastKnownPixelCount: 220,
      board: { firmwareVersion: '3.70' },
    })
    const fifth = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    const sixth = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    pending[4]({ name: 'Burner bag', firmwareVersion: '3.71' })
    await fifth
    pending[5]({ name: 'Burner bag' })
    await sixth
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareVersion).toBe('3.71')
  })

  it('lets an actual device name land after a cached stand-in renamed the profile first (#876)', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      name: 'Old',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
    const provider = new FakeControllerProvider()
    const pending: Array<(config: ControllerConfig) => void> = []
    provider.getConfig = () => new Promise((resolve) => { pending.push(resolve) })
    setPersonalContentProvider(memoryProvider([profile]))
    setControllerProvider(provider)
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          deviceId: profile.deviceId,
          nickname: 'Cached',
          mapDim: null,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    const first = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    const second = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    // The later refresh lacks a name and writes the cached one first...
    pending[1]({ pixelCount: 256 })
    await second
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Cached')
    // ...then the older actual read still lands the device's name.
    pending[0]({ name: 'Device' })
    await first
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      name: 'Device',
      lastKnownDeviceName: 'Device',
    })

    // A user rename in the same window is still never overwritten — even a
    // rename that lands back on the value a refresh once wrote.
    const third = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    await useControllerProfileStore.getState().updateProfile(profile.id, {
      name: 'Road case',
      lastKnownDeviceName: 'Road case',
    })
    await useControllerProfileStore.getState().updateProfile(profile.id, {
      name: 'Cached',
      lastKnownDeviceName: 'Cached',
    })
    pending[2]({ name: 'Device' })
    await third
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Cached')
  })

  it('fills a fact from the live entry only until the device has actually reported it (#876)', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
    const provider = new FakeControllerProvider()
    const pending: Array<(config: ControllerConfig) => void> = []
    provider.getConfig = () => new Promise((resolve) => { pending.push(resolve) })
    setPersonalContentProvider(memoryProvider([profile]))
    setControllerProvider(provider)
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          firmwareVersion: '3.60',
          mapDim: null,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    // No actual firmware read yet: the live entry stands in.
    const first = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    pending[0]({ name: 'Burner bag' })
    await first
    expect(useControllerProfileStore.getState().profiles[0].board.firmwareVersion).toBe('3.60')
  })

  it('does not take fallback facts from a replaced or disconnected session (#876)', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      firmwareVersion: '3.67',
      now: 1,
    })
    const provider = new FakeControllerProvider()
    const pending: Array<(config: ControllerConfig) => void> = []
    provider.getConfig = () => new Promise((resolve) => { pending.push(resolve) })
    setPersonalContentProvider(memoryProvider([{ ...profile, lastKnownPixelCount: 256 }]))
    setControllerProvider(provider)
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          liveEpoch: 1,
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          firmwareVersion: '3.67',
          mapDim: null,
        },
      },
      activeIp: '192.168.8.224',
    })
    await useControllerProfileStore.getState().loadProfiles()

    const refresh = useControllerProfileStore.getState().refreshLiveMetadata(profile.id)
    await Promise.resolve()
    // Another Controller takes the same IP before the read completes.
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          phase: 'live',
          liveEpoch: 2,
          deviceId: 'pixelblaze_other',
          nickname: 'Impostor',
          firmwareVersion: '9.99',
          mapDim: null,
        },
      },
    })
    pending[0]({ pixelCount: 200 })
    await refresh

    const after = useControllerProfileStore.getState().profiles[0]
    expect(after.lastKnownPixelCount).toBe(200)
    expect(after.name).toBe('Burner bag')
    expect(after.board.firmwareVersion).toBe('3.67')
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
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([
      { profileId: 'ctrl-1', patches: [{ name: 'Unsaved' }] },
    ])

    useControllerProfileStore.getState().dismissProfileSaveFailure('ctrl-1')
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
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
    await useControllerProfileStore.getState().retryProfileSaveFailure('ctrl-1')

    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Renamed')
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
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

    await useControllerProfileStore.getState().retryProfileSaveFailure('ctrl-1')

    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Original')
    expect(useControllerProfileStore.getState().profileSaveFailures).toMatchObject([{ profileId: 'ctrl-1' }])
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
    expect(useControllerProfileStore.getState().profileSaveFailures).toHaveLength(1)

    provider.updateControllerProfile = durableUpdate
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Road case' })

    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
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
    expect(useControllerProfileStore.getState().profileSaveFailures).toHaveLength(1)

    // A different, successful edit to the same profile: the rename is still
    // not durable, so its notice must survive.
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { keepPatternsUpToDate: true })
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([
      { profileId: 'ctrl-1', patches: [{ name: 'Unsaved' }] },
    ])

    // Re-doing the failed edit (manually or via Retry) clears it.
    failRenames = false
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Unsaved' })
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
  })
})

describe('concurrent profile failure merging (#810 review round 4)', () => {
  it('merges rapid failed edits into one retryable notice that re-applies both', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let offline = true
    provider.updateControllerProfile = async (id, changes) => {
      if (offline) throw new Error('save failed')
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await Promise.allSettled([
      useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' }),
      useControllerProfileStore.getState().updateProfile('ctrl-1', { keepPatternsUpToDate: true }),
    ])

    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([
      { profileId: 'ctrl-1', patches: [{ name: 'Renamed' }, { keepPatternsUpToDate: true }] },
    ])

    offline = false
    await useControllerProfileStore.getState().retryProfileSaveFailure('ctrl-1')
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      name: 'Renamed',
      keepPatternsUpToDate: true,
    })
  })
})

describe('key-level profile rollback (#810 review round 5)', () => {
  it('reverts a failed field while keeping a later queued edit optimistic', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    let rejectFirst!: (cause: Error) => void
    const firstGate = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    const durableUpdate = provider.updateControllerProfile
    let call = 0
    provider.updateControllerProfile = async (id, changes) => {
      call += 1
      if (call === 1) {
        await firstGate
        return
      }
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    const renamePending = useControllerProfileStore.getState()
      .updateProfile('ctrl-1', { name: 'Failing rename' }).catch(() => {})
    const togglePending = useControllerProfileStore.getState()
      .updateProfile('ctrl-1', { keepPatternsUpToDate: true })
    rejectFirst(new Error('save failed'))
    await renamePending
    await togglePending

    // The failed rename really reverted; the successful toggle survived.
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      name: 'Original',
      keepPatternsUpToDate: true,
    })
    // The rename stays retryable.
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([
      { profileId: 'ctrl-1', patches: [{ name: 'Failing rename' }] },
    ])
  })
})

describe('durable-baseline profile rollback (#810 review round 6)', () => {
  it('two failed edits to the same field revert to the durable value, not each other', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    let offline = true
    const durableUpdate = provider.updateControllerProfile
    provider.updateControllerProfile = async (id, changes) => {
      if (offline) throw new Error('save failed')
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await Promise.allSettled([
      useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'First fail' }),
      useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Second fail' }),
    ])

    // Neither optimistic value may survive: both writes failed, so the field
    // shows the durable value while the notice retains the latest intent.
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Original')
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([
      { profileId: 'ctrl-1', patches: [{ name: 'First fail' }, { name: 'Second fail' }] },
    ])

    offline = false
    await useControllerProfileStore.getState().retryProfileSaveFailure('ctrl-1')
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Second fail')
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
  })

  it('Retry skips a field a newer pending edit owns instead of clobbering it', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    let releaseNewer!: () => void
    const newerGate = new Promise<void>((resolve) => {
      releaseNewer = resolve
    })
    const durableUpdate = provider.updateControllerProfile
    let call = 0
    provider.updateControllerProfile = async (id, changes) => {
      call += 1
      if (call === 1) throw new Error('save failed')
      if (call === 2) await newerGate
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Old fail' }).catch(() => {})
    // A newer edit to the same field is pending when the user clicks Retry.
    const newerPending = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Newer intent' })
    const retried = useControllerProfileStore.getState().retryProfileSaveFailure('ctrl-1')
    releaseNewer()
    await newerPending
    await retried

    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Newer intent')
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
  })
})

describe('failure clearing and baseline normalization (#810 review round 7)', () => {
  it('a successful write touching any failed key clears the whole failure', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    const failComposite = true
    provider.updateControllerProfile = async (id, changes) => {
      if (failComposite && 'patternBindings' in changes) throw new Error('save failed')
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    // A composite edit (inputs + patternBindings together) fails.
    await useControllerProfileStore.getState().updateProfile('ctrl-1', {
      inputs: [],
      patternBindings: [],
    }).catch(() => {})
    expect(useControllerProfileStore.getState().profileSaveFailures).toHaveLength(1)

    // A later successful write touching one of those keys supersedes the
    // whole composite intent: replaying it piecemeal could destroy this edit.
    await useControllerProfileStore.getState().updateProfile('ctrl-1', {
      inputs: [{
        id: 'input-new', name: 'New input', pin: 33, signal: 'analog',
        smoothing: 0.2, fallback: 0.5, invert: false,
      }],
    })
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
    expect(useControllerProfileStore.getState().profiles[0].inputs).toHaveLength(1)
  })

  it('rollback restores normalized durable inputs, not raw provider records', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const legacyInputs = [{
      id: 'pot0', name: 'Front pot', pin: 33, signal: 'analog',
      smoothing: 0.2, fallback: 0.5, invert: false, role: 'retired-field',
    }] as unknown as ControllerProfile['inputs']
    const provider = memoryProvider([{ ...profile, inputs: legacyInputs }])
    const durableUpdate = provider.updateControllerProfile
    let offline = true
    provider.updateControllerProfile = async (id, changes) => {
      if (offline) throw new Error('save failed')
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()
    expect(useControllerProfileStore.getState().profiles[0].inputs[0]).not.toHaveProperty('role')

    await useControllerProfileStore.getState().updateProfile('ctrl-1', { inputs: [] }).catch(() => {})

    const rolledBack = useControllerProfileStore.getState().profiles[0].inputs
    expect(rolledBack).toHaveLength(1)
    expect(rolledBack[0]).not.toHaveProperty('role')
    offline = false
  })
})

describe('independent failed edits (#810 review round 8)', () => {
  it('redoing one failed edit keeps the other retryable', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let offline = true
    provider.updateControllerProfile = async (id, changes) => {
      if (offline) throw new Error('save failed')
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' }).catch(() => {})
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { keepPatternsUpToDate: true }).catch(() => {})

    // Connectivity returns; the user manually redoes only the rename. The
    // toggle's failed edit must keep its notice and Retry path.
    offline = false
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' })
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([
      { profileId: 'ctrl-1', patches: [{ keepPatternsUpToDate: true }] },
    ])

    await useControllerProfileStore.getState().retryProfileSaveFailure('ctrl-1')
    expect(useControllerProfileStore.getState().profiles[0].keepPatternsUpToDate).toBe(true)
    expect(useControllerProfileStore.getState().profileSaveFailures).toEqual([])
  })

  it('failures on different profiles keep independent notices', async () => {
    const profileA = defaultControllerProfile({ id: 'ctrl-a', name: 'Alpha', now: 1 })
    const profileB = defaultControllerProfile({ id: 'ctrl-b', name: 'Beta', now: 1 })
    const provider = memoryProvider([profileA, profileB])
    provider.updateControllerProfile = async () => {
      throw new Error('save failed')
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    await useControllerProfileStore.getState().updateProfile('ctrl-a', { name: 'Alpha 2' }).catch(() => {})
    await useControllerProfileStore.getState().updateProfile('ctrl-b', { name: 'Beta 2' }).catch(() => {})

    expect(useControllerProfileStore.getState().profileSaveFailures.map((f) => f.profileId).sort())
      .toEqual(['ctrl-a', 'ctrl-b'])

    useControllerProfileStore.getState().dismissProfileSaveFailure('ctrl-a')
    expect(useControllerProfileStore.getState().profileSaveFailures).toMatchObject([{ profileId: 'ctrl-b' }])
  })
})

describe('write repair and composite retry atomicity (#810 review round 9)', () => {
  it('a landed write re-asserts its keys after an identical-value rollback', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let rejectFirst!: (cause: Error) => void
    const firstGate = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    let call = 0
    provider.updateControllerProfile = async (id, changes) => {
      call += 1
      if (call === 1) {
        await firstGate
        return
      }
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    // Two queued writes assign the same value; the first fails, and its
    // value-based rollback cannot tell the second's optimistic state apart.
    const first = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Bench' }).catch(() => {})
    const second = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Bench' })
    rejectFirst(new Error('save failed'))
    await first
    await second

    // The landed second write is authoritative: the local profile must show it.
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Bench')
  })

  it('Retry drops a composite patch whole when a newer edit owns one of its keys', async () => {
    const profile = {
      ...defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 }),
      inputs: [{
        id: 'pot0', name: 'Front pot', pin: 33, signal: 'analog' as const,
        smoothing: 0.2, fallback: 0.5, invert: false,
      }],
    }
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let releaseNewer!: () => void
    const newerGate = new Promise<void>((resolve) => {
      releaseNewer = resolve
    })
    let call = 0
    provider.updateControllerProfile = async (id, changes) => {
      call += 1
      if (call === 1) throw new Error('save failed')
      if (call === 2) await newerGate
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    // A composite removal (inputs + patternBindings) fails.
    await useControllerProfileStore.getState().updateProfile('ctrl-1', {
      inputs: [],
      patternBindings: [],
    }).catch(() => {})
    // A newer pending edit owns patternBindings when the user clicks Retry.
    const newerPending = useControllerProfileStore.getState().updateProfile('ctrl-1', {
      patternBindings: [{
        id: 'binding-1', patternId: 'pat-1', inputId: 'pot0',
        target: { kind: 'call-exported-slider' as const, name: 'sliderSpeed' },
      }],
    })
    const retried = useControllerProfileStore.getState().retryProfileSaveFailure('ctrl-1')
    releaseNewer()
    await newerPending
    await retried

    // The composite must not split: the input referenced by the new binding
    // survives, and no partial write removed it.
    expect(useControllerProfileStore.getState().profiles[0].inputs).toHaveLength(1)
    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toHaveLength(1)
  })
})

describe('landed-write repair scope (#810 review round 10)', () => {
  it('a landed write never clobbers a newer optimistic edit of the same key', async () => {
    const profile = {
      ...defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 }),
      inputs: [{
        id: 'pot0', name: 'Front pot', pin: 33, signal: 'analog' as const,
        smoothing: 0.2, fallback: 0.5, invert: false,
      }],
    }
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let call = 0
    provider.updateControllerProfile = async (id, changes) => {
      call += 1
      if (call === 1) await firstGate
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    // A (smoothing) is slow; B (fallback) edits while A is pending. When A
    // lands, its repair must not replace B's optimistic inputs array.
    const first = useControllerProfileStore.getState().updateInput('ctrl-1', 'pot0', { smoothing: 0.4 })
    const second = useControllerProfileStore.getState().updateInput('ctrl-1', 'pot0', { fallback: 0.9 })
    releaseFirst()
    await first
    await second

    expect(useControllerProfileStore.getState().profiles[0].inputs[0]).toMatchObject({
      smoothing: 0.4,
      fallback: 0.9,
    })
  })
})

describe('operation-owned rollback (#810 review round 11)', () => {
  it('a newer edit back to the durable value survives an older write landing', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let call = 0
    provider.updateControllerProfile = async (id, changes) => {
      call += 1
      if (call === 1) await firstGate
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()
    expect(useControllerProfileStore.getState().profiles[0].keepPatternsUpToDate).toBe(false)

    // A sets true (slow); B sets it back to durable false while A is pending.
    // Neither A's landing nor any repair may resurrect true.
    const first = useControllerProfileStore.getState().updateProfile('ctrl-1', { keepPatternsUpToDate: true })
    const second = useControllerProfileStore.getState().updateProfile('ctrl-1', { keepPatternsUpToDate: false })
    releaseFirst()
    await first
    await second

    expect(useControllerProfileStore.getState().profiles[0].keepPatternsUpToDate).toBe(false)
  })

  it('a failed write does not revert a key a newer edit owns, even at equal values', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let rejectFirst!: (cause: Error) => void
    const firstGate = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    let call = 0
    provider.updateControllerProfile = async (id, changes) => {
      call += 1
      if (call === 1) {
        await firstGate
        return
      }
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    const first = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Bench' }).catch(() => {})
    const second = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Bench' })
    rejectFirst(new Error('save failed'))
    await first
    await second

    // B owns the key; A's rollback must skip it and B's landing keeps it.
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Bench')
  })
})

describe('ownership across concurrent reloads (#810 review round 12)', () => {
  it('a write that lands after a reload re-asserts its value locally', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let releaseWrite!: () => void
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    provider.updateControllerProfile = async (id, changes) => {
      await writeGate
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    const pending = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' })
    // A concurrent reload installs the pre-write durable snapshot.
    await useControllerProfileStore.getState().loadProfiles()
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Original')

    releaseWrite()
    await pending

    // The landed write re-asserts its still-owned key over the stale snapshot.
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Renamed')
  })

  it('a failure settling after a reload cannot revert a newer edit of the key', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableUpdate = provider.updateControllerProfile
    let rejectFirst!: (cause: Error) => void
    const firstGate = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    let call = 0
    provider.updateControllerProfile = async (id, changes) => {
      call += 1
      if (call === 1) {
        await firstGate
        return
      }
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    const first = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'First fail' }).catch(() => {})
    // Reload mid-flight, then a newer edit takes the key.
    await useControllerProfileStore.getState().loadProfiles()
    const second = useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Second wins' })
    rejectFirst(new Error('save failed'))
    await first
    await second

    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Second wins')
  })
})

describe('stale reload snapshots (#810 review round 13)', () => {
  it('a reload requested before a write settled is discarded, not installed', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', name: 'Original', now: 1 })
    const provider = memoryProvider([profile])
    const durableList = provider.listControllerProfiles
    let releaseLoad!: () => void
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve
    })
    setPersonalContentProvider(provider)
    await useControllerProfileStore.getState().loadProfiles()

    // A slow reload captures the pre-write snapshot...
    provider.listControllerProfiles = async () => {
      const snapshot = await durableList()
      await loadGate
      return snapshot
    }
    const staleReload = useControllerProfileStore.getState().loadProfiles()
    // ...then a write persists and settles while that response is in flight.
    await useControllerProfileStore.getState().updateProfile('ctrl-1', { name: 'Renamed' })
    releaseLoad()
    await staleReload

    // The stale snapshot must not roll the settled write back.
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Renamed')
  })
})

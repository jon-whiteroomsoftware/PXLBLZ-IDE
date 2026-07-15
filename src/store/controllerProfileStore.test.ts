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
          milliampsPerPixel: 60,
        }),
      ]),
    })
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
    await useControllerProfileStore.getState().addPatternBinding('ctrl-1', 'pat-1')

    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toHaveLength(1)

    await useControllerProfileStore.getState().removeInput('ctrl-1', 'input0')

    expect(useControllerProfileStore.getState().profiles[0].inputs).toEqual([])
    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toEqual([])
  })

  it('refreshes the durable profile name and last-known metadata from the active live controller', async () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      now: 1,
    })
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

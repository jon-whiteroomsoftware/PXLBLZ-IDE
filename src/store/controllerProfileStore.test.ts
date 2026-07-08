import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { MapRecord, PatternRecord } from '@/engine/personalContentRecords'
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
  controllerProfileInitialState,
  useControllerProfileStore,
  type ControllerProfile,
} from './controllerProfileStore'
import { validateControllerProfile } from '@/engine/controllerProfile'
import { controllerInitialState, useControllerStore } from './controllerStore'

class FakeControllerProvider extends NullControllerProvider {
  config: ControllerConfig = {
    name: 'Pixelblaze shelf',
    pixelCount: 256,
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
  useControllerProfileStore.setState(controllerProfileInitialState)
  useControllerStore.setState(controllerInitialState)
})

describe('controllerProfileStore', () => {
  it('creates a valid default profile with disabled global transforms', () => {
    const profile = defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      deviceName: 'Pixelblaze shelf',
      ip: '192.168.8.224',
      now: 100,
    })

    expect(profile).toMatchObject({
      id: 'ctrl-1',
      name: 'Pixelblaze shelf',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      lastKnownDeviceName: 'Pixelblaze shelf',
      lastSeenIp: '192.168.8.224',
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

    await useControllerProfileStore.getState().renameProfile(created.id, 'Road case')
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({ name: 'Road case' })

    await useControllerProfileStore.getState().removeProfile(created.id)
    expect(useControllerProfileStore.getState().profiles.some((profile) => profile.id === created.id)).toBe(false)
  })

  it('keeps bindings consistent when removing an input', async () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1', now: 1 })
    setPersonalContentProvider(memoryProvider([profile]))
    await useControllerProfileStore.getState().loadProfiles()
    await useControllerProfileStore.getState().addInput('ctrl-1')
    await useControllerProfileStore.getState().addPatternBinding('ctrl-1')

    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toHaveLength(1)

    await useControllerProfileStore.getState().removeInput('ctrl-1', 'input0')

    expect(useControllerProfileStore.getState().profiles[0].inputs).toEqual([])
    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toEqual([])
  })

  it('refreshes last-known metadata from the active live controller', async () => {
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
      lastKnownDeviceName: 'Pixelblaze shelf',
      lastSeenIp: '192.168.8.224',
      lastKnownPixelCount: 256,
      lastKnownMapDim: 3,
    })
  })
})

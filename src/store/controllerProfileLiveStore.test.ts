import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  demoControllerMetadataStorage,
  resetControllerMetadataStorage,
  setControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import type { BindingStore } from '@/engine/controllerBinding'
import { useControllerProfileStore } from './controllerProfileStore'
import {
  controllerProfileLiveInitialState,
  controllerProfileLiveReadKey,
  selectControllerProfilePatternChoices,
  useControllerProfileLiveStore,
} from './controllerProfileLiveStore'

const programs = [{ id: 'DEV_LINE', name: 'Line Dancer' }]

beforeEach(() => {
  resetControllerMetadataStorage()
  useControllerProfileLiveStore.setState(controllerProfileLiveInitialState)
  useControllerProfileStore.setState({ refreshLiveMetadata: vi.fn(async () => {}) })
})

describe('controllerProfileLiveStore', () => {
  it('loads installed managed Pattern choices behind one connection-scoped read', async () => {
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'profile-live-read',
      getControllerBindings: async () => ({
        '192.168.8.224': { 'pat-line': 'DEV_LINE' },
      }),
    })
    const request = { liveIp: '192.168.8.224', liveEpoch: 1, programs }

    await useControllerProfileLiveStore.getState().syncProfile('ctrl-1', request)

    const key = controllerProfileLiveReadKey(request)
    expect(selectControllerProfilePatternChoices(
      useControllerProfileLiveStore.getState(),
      'ctrl-1',
      key,
    )).toEqual([{ patternId: 'pat-line', name: 'Line Dancer' }])
    expect(useControllerProfileStore.getState().refreshLiveMetadata).toHaveBeenCalledWith('ctrl-1')
  })

  it('retires an earlier connection immediately and ignores its late answer', async () => {
    let resolveFirst!: (bindings: BindingStore) => void
    let resolveSecond!: (bindings: BindingStore) => void
    const reads = [
      new Promise<BindingStore>((resolve) => { resolveFirst = resolve }),
      new Promise<BindingStore>((resolve) => { resolveSecond = resolve }),
    ]
    let readIndex = 0
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'profile-live-reconnect',
      getControllerBindings: () => reads[readIndex++],
    })
    const first = { liveIp: '192.168.8.224', liveEpoch: 1, programs }
    const second = { liveIp: '192.168.8.224', liveEpoch: 2, programs }

    const firstRead = useControllerProfileLiveStore.getState().syncProfile('ctrl-1', first)
    const secondRead = useControllerProfileLiveStore.getState().syncProfile('ctrl-1', second)
    const secondKey = controllerProfileLiveReadKey(second)

    expect(selectControllerProfilePatternChoices(
      useControllerProfileLiveStore.getState(),
      'ctrl-1',
      secondKey,
    )).toEqual([])

    resolveFirst({ '192.168.8.224': { stale: 'DEV_LINE' } })
    await firstRead
    expect(selectControllerProfilePatternChoices(
      useControllerProfileLiveStore.getState(),
      'ctrl-1',
      secondKey,
    )).toEqual([])

    resolveSecond({ '192.168.8.224': { current: 'DEV_LINE' } })
    await secondRead
    expect(selectControllerProfilePatternChoices(
      useControllerProfileLiveStore.getState(),
      'ctrl-1',
      secondKey,
    )).toEqual([{ patternId: 'current', name: 'Line Dancer' }])
  })
})

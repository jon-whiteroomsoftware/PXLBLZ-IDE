import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BindingStore } from '@/engine/controllerBinding'
import type { ControllerPushRecords } from '@/engine/controllerPushRecord'
import {
  demoControllerMetadataStorage,
  resetControllerMetadataStorage,
  setControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import {
  controllerSavedProgramsLiveInitialState,
  controllerSavedProgramsReadKey,
  selectControllerSavedProgramsRead,
  useControllerSavedProgramsLiveStore,
  type ControllerSavedProgramsReadRequest,
} from './controllerSavedProgramsLiveStore'

const programs = [{ id: 'DEV_LINE', name: 'Line Dancer' }]

function request(
  overrides: Partial<ControllerSavedProgramsReadRequest> = {},
): ControllerSavedProgramsReadRequest {
  return {
    controllerId: '192.168.8.224',
    liveEpoch: 1,
    programs,
    pushRecordsRevision: 0,
    refreshGeneration: 0,
    ...overrides,
  }
}

beforeEach(() => {
  resetControllerMetadataStorage()
  useControllerSavedProgramsLiveStore.setState(controllerSavedProgramsLiveInitialState)
})

describe('controllerSavedProgramsLiveStore', () => {
  it('publishes bindings and push records only after the exact live read is ready', async () => {
    let resolveBindings!: (bindings: BindingStore) => void
    let resolvePushRecords!: (records: ControllerPushRecords) => void
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'saved-program-read',
      getControllerBindings: () => new Promise((resolve) => { resolveBindings = resolve }),
      getPushRecords: () => new Promise((resolve) => { resolvePushRecords = resolve }),
    })
    const current = request()
    const pending = useControllerSavedProgramsLiveStore.getState().syncProfile('ctrl-1', current)

    expect(selectControllerSavedProgramsRead(
      useControllerSavedProgramsLiveStore.getState(),
      'ctrl-1',
      controllerSavedProgramsReadKey(current),
    )).toMatchObject({ phase: 'loading', programs: [] })

    resolveBindings({ '192.168.8.224': { 'pat-line': 'DEV_LINE' } })
    resolvePushRecords({ '192.168.8.224': { 'pat-line': {
      transforms: [],
      artifactHash: 'hash',
      stampedAt: '2026-08-08T00:00:00.000Z',
      name: 'Line Dancer',
    } } })
    await pending

    expect(selectControllerSavedProgramsRead(
      useControllerSavedProgramsLiveStore.getState(),
      'ctrl-1',
      controllerSavedProgramsReadKey(current),
    )).toMatchObject({
      phase: 'ready',
      programs,
      bindings: { '192.168.8.224': { 'pat-line': 'DEV_LINE' } },
    })
  })

  it('retires an earlier connection immediately and ignores its late answer', async () => {
    const bindingReads: Array<(bindings: BindingStore) => void> = []
    const pushRecordReads: Array<(records: ControllerPushRecords) => void> = []
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'saved-program-reconnect',
      getControllerBindings: () => new Promise((resolve) => { bindingReads.push(resolve) }),
      getPushRecords: () => new Promise((resolve) => { pushRecordReads.push(resolve) }),
    })
    const first = request({ liveEpoch: 1 })
    const second = request({ liveEpoch: 2 })
    const firstRead = useControllerSavedProgramsLiveStore.getState().syncProfile('ctrl-1', first)
    const secondRead = useControllerSavedProgramsLiveStore.getState().syncProfile('ctrl-1', second)

    bindingReads[0]({ '192.168.8.224': { stale: 'DEV_LINE' } })
    pushRecordReads[0]({})
    await firstRead
    expect(selectControllerSavedProgramsRead(
      useControllerSavedProgramsLiveStore.getState(),
      'ctrl-1',
      controllerSavedProgramsReadKey(second),
    ).phase).toBe('loading')

    bindingReads[1]({ '192.168.8.224': { current: 'DEV_LINE' } })
    pushRecordReads[1]({})
    await secondRead
    expect(selectControllerSavedProgramsRead(
      useControllerSavedProgramsLiveStore.getState(),
      'ctrl-1',
      controllerSavedProgramsReadKey(second),
    )).toMatchObject({
      phase: 'ready',
      bindings: { '192.168.8.224': { current: 'DEV_LINE' } },
    })
  })

  it('invalidates an unchanged program list when the durable push-record revision advances', async () => {
    const getPushRecords = vi.fn(async () => ({}))
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'saved-program-revision',
      getControllerBindings: async () => ({}),
      getPushRecords,
    })
    const first = request({ pushRecordsRevision: 4 })
    await useControllerSavedProgramsLiveStore.getState().syncProfile('ctrl-1', first)

    const second = request({ pushRecordsRevision: 5 })
    const reread = useControllerSavedProgramsLiveStore.getState().syncProfile('ctrl-1', second)
    expect(selectControllerSavedProgramsRead(
      useControllerSavedProgramsLiveStore.getState(),
      'ctrl-1',
      controllerSavedProgramsReadKey(second),
    ).phase).toBe('loading')
    await reread

    expect(getPushRecords).toHaveBeenCalledTimes(2)
    expect(selectControllerSavedProgramsRead(
      useControllerSavedProgramsLiveStore.getState(),
      'ctrl-1',
      controllerSavedProgramsReadKey(second),
    ).phase).toBe('ready')
  })

  it('binds a manual program-list refresh to the new generation and reports failure', async () => {
    const refreshPrograms = vi.fn(async () => [{ id: 'DEV_NEW', name: 'New Pattern' }])
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'saved-program-manual-refresh',
      getControllerBindings: async () => ({}),
      getPushRecords: async () => ({}),
    })
    await useControllerSavedProgramsLiveStore.getState().syncProfile('ctrl-1', request())
    useControllerSavedProgramsLiveStore.getState().requestRefresh('ctrl-1')
    const refreshed = request({
      refreshGeneration: 1,
      refreshPrograms,
    })
    await useControllerSavedProgramsLiveStore.getState().syncProfile('ctrl-1', refreshed)
    const settled = { ...refreshed, programs: [{ id: 'DEV_NEW', name: 'New Pattern' }] }

    expect(refreshPrograms).toHaveBeenCalledTimes(1)
    expect(selectControllerSavedProgramsRead(
      useControllerSavedProgramsLiveStore.getState(),
      'ctrl-1',
      controllerSavedProgramsReadKey(settled),
    )).toMatchObject({ phase: 'ready', programs: settled.programs })

    useControllerSavedProgramsLiveStore.getState().requestRefresh('ctrl-1')
    const failed = request({
      refreshGeneration: 2,
      refreshPrograms: async () => { throw new Error('Controller offline') },
    })
    await useControllerSavedProgramsLiveStore.getState().syncProfile('ctrl-1', failed)
    expect(selectControllerSavedProgramsRead(
      useControllerSavedProgramsLiveStore.getState(),
      'ctrl-1',
      controllerSavedProgramsReadKey(failed),
    ).phase).toBe('failed')
  })
})

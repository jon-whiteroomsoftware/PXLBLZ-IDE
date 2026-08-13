import {
  useControllerStore,
  controllerInitialState,
  __resetControllerProviders,
} from './controllerStore'
import {
  setControllerProviderFactory,
  resetControllerProvider,
  getControllerProvider,
} from '@/engine/controllerProviderRegistry'
import {
  ControllerPermissionDeniedError,
  NullControllerProvider,
  type ControllerStatus,
  type ControllerTarget,
  type ControllerConfig,
  type ControllerCapabilities,
  type ProgramListEntry,
  type DiscoveredController,
} from '@/engine/ControllerProvider'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { useLibraryStore, libraryInitialState } from '@/store/libraryStore'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import { useControllerPanelStore, controllerPanelInitialState } from '@/store/controllerPanelStore'
import {
  getControllerBindings,
  getPushRecords,
  setControllerBindings,
  setPushRecords,
  getProgramLabels,
  resetControllerMetadataStorage,
  setControllerMetadataStorage,
  type ControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import {
  demoPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '@/engine/personalContentProvider'
import { bundle } from '@/engine/bundle'
import {
  __resetControllerProfileWriteQueue,
  queueControllerProfileWrite,
} from '@/engine/controllerProfileWriteQueue'
import {
  __resetControllerDeviceWriteQueue,
  queueControllerDeviceWrite,
} from '@/engine/controllerDeviceWriteQueue'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
  type ControllerProfile,
} from './controllerProfileStore'
import { controllerProfileArtifactSignature } from '@/engine/controllerProfilePassRecipe'
import { isAlreadyPushed } from '@/engine/sendToController'
import type { FirmwareUpdateState } from '@/engine/firmwareUpdate'
import { stampArtifact } from '@/engine/artifactStamp'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createShowWithOutputContract } from '@/engine/showModel'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { encodeMapData } from '@/engine/mapPush'

// A fake per-Controller provider with a real (if minimal) status machine, so we
// can assert the keyed store's orchestration end-to-end. detectHelper acks true
// so the global extension probe reports present.
class FakeProvider extends NullControllerProvider {
  status: ControllerStatus = { kind: 'extension-present' }
  subs = new Set<(s: ControllerStatus) => void>()
  shouldFailConnect = false
  // Mirror the real provider's per-IP permission decline (#229): reset to idle and
  // reject with the typed error the store resets on.
  denyPermission = false
  pendingAuthorization = false
  name: string | undefined = 'pixel-1'
  deviceId: string | null = null
  pixelCount: number | undefined = undefined
  pixelMap: number[][] | null = [
    [0, 0],
    [1, 1],
  ]
  connects: ControllerTarget[] = []
  disconnects = 0
  firmwareUpdateState: FirmwareUpdateState = 'current'
  firmwareUpdateChecks = 0
  rendererCommands: boolean[] = []
  rendererCommandError: Error | null = null

  detectHelper(): Promise<boolean> {
    return Promise.resolve(true)
  }
  getStatus(): ControllerStatus {
    return this.status
  }
  subscribe(listener: (s: ControllerStatus) => void): () => void {
    this.subs.add(listener)
    return () => this.subs.delete(listener)
  }
  private emit(status: ControllerStatus) {
    this.status = status
    this.subs.forEach((l) => l(status))
  }
  connect(target: ControllerTarget): Promise<void> {
    this.connects.push(target)
    this.emit({ kind: 'connecting', target })
    if (this.pendingAuthorization) {
      this.emit({ kind: 'connecting', target, authorizationNeededIp: target.address })
      return new Promise<void>(() => {})
    }
    if (this.denyPermission) {
      this.emit({ kind: 'extension-present' })
      return Promise.reject(new ControllerPermissionDeniedError(target.address))
    }
    if (this.shouldFailConnect) {
      this.emit({ kind: 'error', message: 'unreachable' })
      return Promise.reject(new Error('unreachable'))
    }
    const deviceId = target.deviceId ?? this.deviceId
    this.emit({
      kind: 'connected',
      controller: {
        id: deviceId ?? target.address,
        address: target.address,
        deviceId,
        ...(target.name ?? this.name ? { name: target.name ?? this.name } : {}),
      },
    })
    return Promise.resolve()
  }
  disconnect(): Promise<void> {
    this.disconnects++
    this.emit({ kind: 'extension-present' })
    return Promise.resolve()
  }
  getConfig(): Promise<ControllerConfig> {
    return Promise.resolve({ name: this.name, pixelCount: this.pixelCount })
  }
  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve(this.pixelMap)
  }
  getPixelMapData(): Promise<Uint8Array | null> {
    return Promise.resolve(this.pixelMap ? encodeMapData(this.pixelMap) : null)
  }
  checkFirmwareUpdate(): Promise<FirmwareUpdateState> {
    this.firmwareUpdateChecks++
    return Promise.resolve(this.firmwareUpdateState)
  }
  setRendererPaused(paused: boolean): Promise<void> {
    this.rendererCommands.push(paused)
    return this.rendererCommandError
      ? Promise.reject(this.rendererCommandError)
      : Promise.resolve()
  }

  // ── push surface (#202) ─────────────────────────────────────────────────────
  readonly capabilities: ControllerCapabilities = { push: true, compile: true }
  /** A header-reconciling 16-byte blob (opcode 8, export 0): 8 + 8 + 0 === 16. */
  compileResult: Uint8Array = makeReconcilingBytecode()
  activeProgramBytecodeSize: number | null = 0
  compileError: Error | null = null
  programs: ProgramListEntry[] = []
  pushed: { bytecode: Uint8Array; opts: { id: string; name?: string } }[] = []
  compiledSources: string[] = []
  pushBytecodeError: Error | null = null

  compile(source: string): Promise<Uint8Array> {
    this.compiledSources.push(source)
    if (this.compileError) return Promise.reject(this.compileError)
    return Promise.resolve(this.compileResult)
  }
  getActiveProgramBytecodeSize(): Promise<number | null> {
    return Promise.resolve(this.activeProgramBytecodeSize)
  }
  listPrograms(): Promise<ProgramListEntry[]> {
    return Promise.resolve(this.programs)
  }
  pushBytecode(bytecode: Uint8Array, opts: { id: string; name?: string }): Promise<void> {
    this.pushed.push({ bytecode, opts })
    this.activeProgramBytecodeSize = bytecode.length
    return this.pushBytecodeError
      ? Promise.reject(this.pushBytecodeError)
      : Promise.resolve()
  }
  saved: { blob: Uint8Array; opts: { id: string } }[] = []
  saveProgram(blob: Uint8Array, opts: { id: string }): Promise<void> {
    this.saved.push({ blob, opts })
    return Promise.resolve()
  }

  // ── map push surface (#204) ─────────────────────────────────────────────────
  pushedMaps: { points: number[][]; opts?: { save?: boolean } }[] = []
  setPixelMapError: Error | null = null
  setPixelMap(points: number[][], opts?: { save?: boolean }): Promise<void> {
    if (this.setPixelMapError) return Promise.reject(this.setPixelMapError)
    this.pushedMaps.push({ points, opts })
    this.pixelMap = points
    return Promise.resolve()
  }

  // ── coupled set-pixel-count remedy (#213) ───────────────────────────────────
  setPixelCounts: number[] = []
  setPixelCountError: Error | null = null
  setPixelCount(value: number): Promise<void> {
    if (this.setPixelCountError) return Promise.reject(this.setPixelCountError)
    this.setPixelCounts.push(value)
    this.pixelCount = value
    return Promise.resolve()
  }
}

function memoryControllerMetadataStorage(): ControllerMetadataStorage {
  let bindings = {}
  let labels = {}
  let pushRecords = {}
  return {
    id: 'memory-test',
    getControllerBindings: async () => bindings,
    setControllerBindings: async (next) => {
      bindings = next
    },
    getProgramLabels: async () => labels,
    setProgramLabels: async (next) => {
      labels = next
    },
    getPushRecords: async () => pushRecords,
    setPushRecords: async (next) => {
      pushRecords = next
    },
  }
}

function setControllerProfiles(profiles: ControllerProfile[]): void {
  setPersonalContentProvider({
    ...demoPersonalContentProvider,
    id: 'controller-profile-test',
    listControllerProfiles: async () => profiles,
  })
}

function makeReconcilingBytecode(byteLength = 16): Uint8Array {
  const bytes = new Uint8Array(byteLength)
  new DataView(bytes.buffer).setUint32(0, byteLength - 8, true)
  return bytes
}

const created = new Map<string, FakeProvider>()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(async () => {
  localStorage.clear()
  __resetControllerProviders()
  resetPersonalContentProvider()
  __resetControllerProfileWriteQueue()
  __resetControllerDeviceWriteQueue()
  resetControllerMetadataStorage()
  setControllerMetadataStorage(memoryControllerMetadataStorage())
  useControllerStore.setState(controllerInitialState)
  usePatternStore.setState(patternInitialState)
  useEditorStore.setState(editorInitialState)
  useLibraryStore.setState(libraryInitialState)
  useMapStore.setState(mapInitialState)
  useControllerPanelStore.setState(controllerPanelInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  useShowStore.setState(showInitialState)
  await setControllerBindings({})
  created.clear()
  setControllerProviderFactory((ip) => {
    const p = new FakeProvider()
    created.set(ip, p)
    return p
  })
})

afterEach(() => {
  __resetControllerProviders()
  resetControllerProvider()
  resetPersonalContentProvider()
})

const store = () => useControllerStore.getState()

describe('controllerStore (keyed)', () => {
  it('reconciles only managed saved Patterns and never writes foreign programs', async () => {
    const profile = {
      ...defaultControllerProfile({
        id: 'profile-1',
        deviceId: 'pixelblaze_pb32_managed',
        ip: '10.0.0.5',
      }),
      keepPatternsUpToDate: true,
    }
    setControllerProfiles([profile])
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-1',
        name: 'Managed Pattern',
        src: 'export function render(index) { hsv(index, 1, 1) }',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    await setControllerBindings({ '10.0.0.5': { 'pat-1': 'MANAGED1' } })
    await setPushRecords({
      '10.0.0.5': {
        'pat-1': {
          transforms: [],
          profileSignature: 'old-signature',
          artifactHash: 'old-hash',
          stampedAt: '2026-07-12T00:00:00.000Z',
          name: 'Managed Pattern',
        },
      },
    })

    await store().addController({
      id: 'pixelblaze_pb32_managed',
      address: '10.0.0.5',
      name: 'Managed Controller',
    })
    const provider = created.get('10.0.0.5')!
    provider.programs = [
      { id: 'MANAGED1', name: 'Managed Pattern' },
      { id: 'FOREIGN1', name: 'Someone else\'s Pattern' },
    ]

    await store().reconcileControllerProfile('profile-1')

    expect(provider.saved.map((write) => write.opts.id)).toEqual(['MANAGED1'])
    expect(provider.pushed).toEqual([])
    expect(store().controllerReconciliations['profile-1']).toMatchObject({
      phase: 'current',
      managedCount: 1,
      unmanagedCount: 1,
      completedCount: 1,
    })
  })

  it('excludes Portable Shows from reconciliation when the Controller exceeds 2,000 pixels (#514)', async () => {
    const profile = {
      ...defaultControllerProfile({
        id: 'profile-1',
        deviceId: 'pixelblaze_pb32_managed',
        ip: '10.0.0.5',
      }),
      keepPatternsUpToDate: true,
      lastKnownPixelCount: 2_001,
    }
    setControllerProfiles([profile])
    const show = createShowWithOutputContract(
      'show-portable',
      'Portable arena',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1_024 }),
      1,
    )
    show.cells = show.cells.map((cell) => ({
      ...cell,
      pattern: { kind: 'stock', id: 'ShapeShifter' },
      patternName: 'ShapeShifter',
    }))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    await setControllerBindings({ '10.0.0.5': { 'show:show-portable': 'SHOW0001' } })
    await setPushRecords({
      '10.0.0.5': {
        'show:show-portable': {
          transforms: [],
          profileSignature: 'old-signature',
          artifactHash: 'old-hash',
          stampedAt: '2026-07-12T00:00:00.000Z',
          name: 'Portable arena',
        },
      },
    })

    await store().addController({
      id: 'pixelblaze_pb32_managed',
      address: '10.0.0.5',
      name: 'Managed Controller',
    })
    const provider = created.get('10.0.0.5')!
    provider.programs = [{ id: 'SHOW0001', name: 'Portable arena' }]

    await store().reconcileControllerProfile('profile-1')

    expect(provider.saved).toEqual([])
    expect(provider.compiledSources).toEqual([])
  })

  it('detectExtension records global extension presence', async () => {
    await store().detectExtension()
    expect(store().extensionPresent).toBe(true)
  })

  it('addController connects and derives the installed-map observation from one raw read', async () => {
    await store().addController('10.0.0.5')
    const entry = store().controllers['10.0.0.5']
    expect(entry.phase).toBe('live')
    expect(entry.deviceId).toBeNull()
    expect(entry.nickname).toBe('pixel-1')
    expect(entry.mapDim).toBe(2)
    expect(entry.installedMap).toMatchObject({
      status: 'present',
      fingerprint: '9a0c9e7f',
      dimension: 2,
      pointCount: 2,
    })
    expect(store().activeIp).toBe('10.0.0.5')
    expect(created.get('10.0.0.5')!.connects).toEqual([{ address: '10.0.0.5' }])
  })

  it('keeps confirmed absence distinct from a read failure', async () => {
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      provider.pixelMap = null
      created.set(ip, provider)
      return provider
    })
    await store().addController('10.0.0.5')
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({ status: 'absent' })

    await store().removeController('10.0.0.5')
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      provider.getPixelMapData = () => Promise.reject(new Error('read failed'))
      created.set(ip, provider)
      return provider
    })
    await store().addController('10.0.0.5')
    expect(store().controllers['10.0.0.5'].installedMap).toEqual({
      status: 'error',
      message: 'read failed',
    })
  })

  it('publishes loading immediately and settles from the canonical raw read', async () => {
    const read = deferred<Uint8Array | null>()
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      provider.getPixelMapData = () => read.promise
      created.set(ip, provider)
      return provider
    })

    const connecting = store().addController('10.0.0.5')
    await Promise.resolve()
    await Promise.resolve()
    expect(store().controllers['10.0.0.5'].installedMap).toEqual({ status: 'loading' })

    read.resolve(encodeMapData([[0], [1]]))
    await connecting
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({
      status: 'present',
      dimension: 1,
      pointCount: 2,
    })
  })

  it('isolates Controller observations when an earlier Controller responds late', async () => {
    const firstRead = deferred<Uint8Array | null>()
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      if (ip === '10.0.0.5') provider.getPixelMapData = () => firstRead.promise
      created.set(ip, provider)
      return provider
    })

    const firstConnect = store().addController('10.0.0.5')
    await Promise.resolve()
    await store().addController('10.0.0.9')
    const secondObservation = store().controllers['10.0.0.9'].installedMap

    firstRead.resolve(encodeMapData([[0, 0, 0], [1, 1, 1]]))
    await firstConnect

    expect(store().activeIp).toBe('10.0.0.9')
    expect(store().controllers['10.0.0.9'].installedMap).toBe(secondObservation)
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({
      status: 'present',
      dimension: 3,
    })
  })

  it('retries a post-push read until the expected installed map becomes visible', async () => {
    await store().addController('10.0.0.5')
    const provider = created.get('10.0.0.5')!
    const stale = encodeMapData([[0], [1]])
    const installed = encodeMapData([[0, 0], [1, 1]])
    const reads = [stale, installed]
    provider.getPixelMapData = () => Promise.resolve(reads.shift() ?? installed)

    const refreshing = store().refreshInstalledMap('10.0.0.5', {
      expectedFingerprint: '9a0c9e7f',
    })

    expect(store().controllers['10.0.0.5'].installedMap).toEqual({ status: 'loading' })
    await refreshing
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({
      status: 'present',
      fingerprint: '9a0c9e7f',
      dimension: 2,
    })
  })

  it('preserves the last successful map dimension when a later map read fails', async () => {
    await store().addController('10.0.0.5')
    const provider = created.get('10.0.0.5')!
    useControllerStore.setState((state) => ({
      controllers: {
        ...state.controllers,
        '10.0.0.5': {
          ...state.controllers['10.0.0.5'],
          mapDim: 2,
          installedMap: {
            status: 'present',
            bytes: encodeMapData([[0, 0], [1, 1]]),
            fingerprint: '9a0c9e7f',
            dimension: 2,
            pointCount: 2,
            observedAt: 100,
          },
        },
      },
    }))
    provider.getPixelMapData = () => Promise.reject(new Error('map read timed out'))

    await store().refreshInstalledMap('10.0.0.5')

    expect(store().controllers['10.0.0.5'].installedMap).toEqual({
      status: 'error',
      message: 'map read timed out',
    })
    expect(store().controllers['10.0.0.5'].mapDim).toBe(2)
  })

  it('schedules opted-in managed Pattern reconciliation when a Controller reconnects', async () => {
    const scheduled: string[] = []
    setControllerProfiles([{
      ...defaultControllerProfile({ id: 'profile-1', ip: '10.0.0.5', now: 1 }),
      keepPatternsUpToDate: true,
    }])
    useControllerStore.setState({
      scheduleControllerReconciliation: (profileId) => scheduled.push(profileId),
    })

    await store().addController('10.0.0.5')

    expect(scheduled).toEqual(['profile-1'])
  })

  it('records an available firmware update after the Controller becomes live', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(123_456)
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      provider.firmwareUpdateState = 'available'
      created.set(ip, provider)
      return provider
    })

    await store().addController({
      id: 'pixelblaze_pb32_known',
      address: '10.0.0.5',
      name: 'Desk',
      version: '3.67',
    })

    await vi.waitFor(() => {
      expect(store().controllers['10.0.0.5'].firmwareUpdateState).toBe('available')
    })
    expect(store().controllers['10.0.0.5']).toMatchObject({
      firmwareUpdateCheckedAt: 123_456,
      firmwareUpdateObservedVersion: '3.67',
    })
    expect(created.get('10.0.0.5')!.firmwareUpdateChecks).toBe(1)
    clock.mockRestore()
  })

  it('reuses the firmware result when the same Controller reconnects within an hour', async () => {
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      provider.firmwareUpdateState = 'available'
      created.set(ip, provider)
      return provider
    })

    await store().addController('10.0.0.5')
    await vi.waitFor(() => {
      expect(store().controllers['10.0.0.5'].firmwareUpdateState).toBe('available')
    })
    await store().addController('10.0.0.5')

    expect(created.get('10.0.0.5')!.firmwareUpdateChecks).toBe(1)
    expect(store().controllers['10.0.0.5'].firmwareUpdateState).toBe('available')
  })

  it('checks the Controller again once the hourly window expires', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    try {
      await store().addController('10.0.0.5')
      await vi.waitFor(() => {
        expect(created.get('10.0.0.5')!.firmwareUpdateChecks).toBe(1)
      })

      clock.mockReturnValue(1_000 + 60 * 60 * 1000)
      await store().addController('10.0.0.5')

      await vi.waitFor(() => {
        expect(created.get('10.0.0.5')!.firmwareUpdateChecks).toBe(2)
      })
    } finally {
      clock.mockRestore()
    }
  })

  it('keeps the Controller live when its firmware check fails', async () => {
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      provider.checkFirmwareUpdate = () => Promise.reject(new Error('update service offline'))
      created.set(ip, provider)
      return provider
    })

    await store().addController('10.0.0.5')

    await vi.waitFor(() => {
      expect(store().controllers['10.0.0.5'].firmwareUpdateState).toBe('unknown')
    })
    expect(store().controllers['10.0.0.5'].phase).toBe('live')
  })

  it('threads a discovery-picked device id into the provider target and live entry', async () => {
    await store().addController({
      id: 'pixelblaze_pb32_known',
      address: '10.0.0.5',
      name: 'Desk',
      version: '3.67',
    })

    const provider = created.get('10.0.0.5')!
    expect(provider.connects).toEqual([
      {
        address: '10.0.0.5',
        deviceId: 'pixelblaze_pb32_known',
        name: 'Desk',
        firmwareVersion: '3.67',
      },
    ])
    expect(store().controllers['10.0.0.5']).toMatchObject({
      phase: 'live',
      deviceId: 'pixelblaze_pb32_known',
      firmwareVersion: '3.67',
      nickname: 'pixel-1',
    })
    expect(store().lastKnownControllerNames.pixelblaze_pb32_known).toBe('pixel-1')
    expect(store().lastKnownControllerIps.pixelblaze_pb32_known).toBe('10.0.0.5')
  })

  it('mirrors a recovered manual-IP device id from provider status', async () => {
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.deviceId = 'pixelblaze_pb32_recovered'
      created.set(ip, p)
      return p
    })

    await store().addController('10.0.0.5')

    expect(store().controllers['10.0.0.5'].deviceId).toBe('pixelblaze_pb32_recovered')
    expect(store().lastKnownControllerNames.pixelblaze_pb32_recovered).toBe('pixel-1')
    expect(store().lastKnownControllerIps.pixelblaze_pb32_recovered).toBe('10.0.0.5')
    expect(created.get('10.0.0.5')!.connects).toEqual([{ address: '10.0.0.5' }])
  })

  it('updates last-known name and IP when the same device id reconnects renamed', async () => {
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.deviceId = 'pixelblaze_pb32_same_device'
      p.name = ip === '10.0.0.5' ? 'Old Name' : 'New Name'
      created.set(ip, p)
      return p
    })

    await store().addController('10.0.0.5')
    await store().addController('10.0.0.9')

    expect(store().lastKnownControllerNames.pixelblaze_pb32_same_device).toBe('New Name')
    expect(store().lastKnownControllerIps.pixelblaze_pb32_same_device).toBe('10.0.0.9')
  })

  it('owns the installed-map observation before the panel ever opens', async () => {
    await store().addController('10.0.0.5')
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({
      status: 'present',
      pointCount: 2,
    })
  })

  it('does not move installed-map ownership into panel polling', async () => {
    await store().addController('10.0.0.5')
    const observation = store().controllers['10.0.0.5'].installedMap

    useControllerPanelStore.getState().start('10.0.0.5')

    expect(store().controllers['10.0.0.5'].installedMap).toBe(observation)
  })

  it('a nameless device leaves the nickname unset (pill falls back to IP)', async () => {
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.name = undefined
      created.set(ip, p)
      return p
    })
    await store().addController('10.0.0.7')
    expect(store().controllers['10.0.0.7'].nickname).toBeUndefined()
  })

  it('points the registry active provider at the connected Controller', async () => {
    await store().addController('10.0.0.5')
    expect(getControllerProvider()).toBe(created.get('10.0.0.5'))
  })

  it('a failed connect leaves the pill in error and does not persist it', async () => {
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.shouldFailConnect = true
      created.set(ip, p)
      return p
    })
    await store().addController('10.0.0.9')
    expect(store().controllers['10.0.0.9'].phase).toBe('error')
    expect(store().lastConnectedIp).toBeNull()
  })

  it('a declined permission grant drops the entry and resets to no-controller (#229)', async () => {
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.denyPermission = true
      created.set(ip, p)
      return p
    })
    await store().addController('10.0.0.9')
    // No lingering entry/pill — the UI is back to the pre-connect state, so the next
    // Connect re-prompts for the grant.
    expect(store().controllers['10.0.0.9']).toBeUndefined()
    expect(store().activeIp).toBeNull()
    expect(store().lastConnectedIp).toBeNull()
  })

  it('marks a pending controller when Chrome is waiting on the helper authorization grant (#235)', async () => {
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.pendingAuthorization = true
      created.set(ip, p)
      return p
    })

    void store().addController('10.0.0.9')
    await new Promise((r) => setTimeout(r, 0))

    expect(store().controllers['10.0.0.9']).toMatchObject({
      phase: 'pending',
      authorizationNeededIp: '10.0.0.9',
    })
  })

  it('persists only the last-connected IP', async () => {
    await store().addController('10.0.0.5')
    expect(store().lastConnectedIp).toBe('10.0.0.5')
    expect(localStorage.getItem('pixelblaze-controller')).toContain('10.0.0.5')
  })

  it('presents a newly connected Controller as playing before metadata settles and without a renderer command (#737)', async () => {
    let finishConfig!: () => void
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      provider.getConfig = () => new Promise<ControllerConfig>((resolve) => {
        finishConfig = () => resolve({ name: provider.name })
      })
      created.set(ip, provider)
      return provider
    })

    const connection = store().addController('10.0.0.5')
    await vi.waitFor(() => expect(finishConfig).toBeTypeOf('function'))

    expect(store().rendererStates['10.0.0.5']).toEqual({
      acknowledged: 'unknown',
      assumedPlaying: true,
      pending: null,
    })
    expect(created.get('10.0.0.5')!.rendererCommands).toEqual([])

    finishConfig()
    await connection
  })

  it('keeps Resume recovery after disconnect until PXLBLZ acknowledges Resume (#737)', async () => {
    await store().addController('10.0.0.5')
    await store().setRendererPaused('10.0.0.5', true)
    await store().removeController('10.0.0.5')

    await store().addController('10.0.0.5')

    expect(store().rendererStates['10.0.0.5']).toEqual({
      acknowledged: 'unknown',
      pending: null,
    })
    expect(store().rendererPausedByPxlblz).toEqual({ '10.0.0.5': true })
    expect(localStorage.getItem('pixelblaze-controller')).toContain('rendererPausedByPxlblz')

    await store().setRendererPaused('10.0.0.5', false)
    await store().removeController('10.0.0.5')
    await store().addController('10.0.0.5')

    expect(store().rendererPausedByPxlblz).toEqual({})
    expect(store().rendererStates['10.0.0.5']).toEqual({
      acknowledged: 'unknown',
      assumedPlaying: true,
      pending: null,
    })
  })

  it('supports a second Controller: it becomes active, the first stays connected', async () => {
    await store().addController('10.0.0.5')
    await store().addController('10.0.0.6')
    expect(Object.keys(store().controllers)).toEqual(['10.0.0.5', '10.0.0.6'])
    expect(store().activeIp).toBe('10.0.0.6')
    expect(store().controllers['10.0.0.5'].phase).toBe('live')
  })

  it('setActive re-points the registry provider', async () => {
    await store().addController('10.0.0.5')
    await store().addController('10.0.0.6')
    store().setActive('10.0.0.5')
    expect(store().activeIp).toBe('10.0.0.5')
    expect(getControllerProvider()).toBe(created.get('10.0.0.5'))
  })

  it('keeps acknowledged renderer state and commands independent per Controller', async () => {
    await store().addController('10.0.0.5')
    await store().addController('10.0.0.6')

    await store().setRendererPaused('10.0.0.5', true)
    expect(created.get('10.0.0.5')!.rendererCommands).toEqual([true])
    expect(created.get('10.0.0.6')!.rendererCommands).toEqual([])
    expect(store().rendererStates['10.0.0.5']).toEqual({
      acknowledged: 'paused',
      pending: null,
    })
    expect(store().rendererStates['10.0.0.6']).toEqual({
      acknowledged: 'unknown',
      assumedPlaying: true,
      pending: null,
    })

    await store().setRendererPaused('10.0.0.6', false)
    expect(created.get('10.0.0.6')!.rendererCommands).toEqual([false])
    expect(store().rendererStates['10.0.0.5'].acknowledged).toBe('paused')
    expect(store().rendererStates['10.0.0.6'].acknowledged).toBe('playing')
  })

  it('does not start renderer transport while the same Controller is receiving a Pattern push', async () => {
    await store().addController('10.0.0.5')
    useControllerStore.setState({ pushing: true })

    await store().setRendererPaused('10.0.0.5', true)

    expect(created.get('10.0.0.5')!.rendererCommands).toEqual([])
    expect(store().rendererStates['10.0.0.5']).toEqual({
      acknowledged: 'unknown',
      assumedPlaying: true,
      pending: null,
    })
  })

  it('serializes renderer transport behind other queued writes for the same Controller', async () => {
    await store().addController('10.0.0.5')
    let finishWrite!: () => void
    const existingWrite = queueControllerDeviceWrite(
      '10.0.0.5',
      () => new Promise<void>((resolve) => { finishWrite = resolve }),
    )
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'))

    const rendererCommand = store().setRendererPaused('10.0.0.5', false)
    expect(created.get('10.0.0.5')!.rendererCommands).toEqual([])

    finishWrite()
    await existingWrite
    await rendererCommand
    expect(created.get('10.0.0.5')!.rendererCommands).toEqual([false])
  })

  it('shows a pending renderer command but ignores its late acknowledgement after disconnect', async () => {
    await store().addController('10.0.0.5')
    const provider = created.get('10.0.0.5')!
    let acknowledge!: () => void
    provider.setRendererPaused = vi.fn(() => new Promise<void>((resolve) => {
      acknowledge = resolve
    }))

    const command = store().setRendererPaused('10.0.0.5', true)
    expect(store().rendererStates['10.0.0.5']).toEqual({
      acknowledged: 'unknown',
      pending: 'pause',
    })

    await store().removeController('10.0.0.5')
    acknowledge()
    await command

    expect(store().controllers['10.0.0.5']).toBeUndefined()
    expect(store().rendererStates['10.0.0.5']).toBeUndefined()
  })

  it('preserves the last acknowledgement and connection phase when a renderer command fails', async () => {
    await store().addController('10.0.0.5')
    const provider = created.get('10.0.0.5')!
    await store().setRendererPaused('10.0.0.5', false)
    provider.rendererCommandError = new Error('renderer acknowledgement lost')

    await store().setRendererPaused('10.0.0.5', true)

    expect(store().rendererStates['10.0.0.5']).toEqual({
      acknowledged: 'playing',
      pending: null,
      error: 'renderer acknowledgement lost',
    })
    expect(store().controllers['10.0.0.5'].phase).toBe('live')
  })

  it('resets renderer knowledge on reconnect and still allows an explicit Resume recovery', async () => {
    await store().addController('10.0.0.5')
    await store().setRendererPaused('10.0.0.5', true)
    expect(store().rendererStates['10.0.0.5'].acknowledged).toBe('paused')

    await store().addController('10.0.0.5')
    expect(store().rendererStates['10.0.0.5']).toEqual({
      acknowledged: 'unknown',
      pending: null,
    })

    await store().setRendererPaused('10.0.0.5', false)
    expect(store().rendererStates['10.0.0.5'].acknowledged).toBe('playing')
    expect(created.get('10.0.0.5')!.rendererCommands).toEqual([true, false])
  })

  it('stamps every arrival at live with a fresh liveEpoch (#772)', async () => {
    // Readers that cache something read from a live Controller cannot tell one
    // connection from the next by IP: the IP is the same, and so is every
    // per-IP collection retained across the gap. The epoch is the difference.
    await store().addController('10.0.0.5')
    const first = store().controllers['10.0.0.5'].liveEpoch
    expect(typeof first).toBe('number')

    await store().addController('10.0.0.5')
    const second = store().controllers['10.0.0.5'].liveEpoch!
    expect(second).toBeGreaterThan(first!)

    await store().removeController('10.0.0.5')
    await store().addController('10.0.0.5')
    const third = store().controllers['10.0.0.5'].liveEpoch!
    expect(third).toBeGreaterThan(second)

    // Only arriving at live is a new connection. Anything else the store learns
    // about a Controller it is already connected to leaves the epoch alone, or
    // every reader keyed to it would re-read on every observation.
    await store().refreshInstalledMap('10.0.0.5')
    expect(store().controllers['10.0.0.5'].liveEpoch).toBe(third)

    // Connecting re-asserts `live` more than once — the status subscription and
    // the post-getConfig patch both do — and that is one connection, not two.
    const seen = new Set<number>()
    const unsubscribe = useControllerStore.subscribe((s) => {
      const epoch = s.controllers['10.0.0.5']?.liveEpoch
      if (typeof epoch === 'number') seen.add(epoch)
    })
    await store().addController('10.0.0.5')
    unsubscribe()
    expect(seen.size).toBe(1)
  })

  it('removeController drops the entry, disconnects, and re-points active', async () => {
    await store().addController('10.0.0.5')
    await store().addController('10.0.0.6')
    await store().removeController('10.0.0.6')
    expect(store().controllers['10.0.0.6']).toBeUndefined()
    expect(store().activeIp).toBe('10.0.0.5')
    expect(getControllerProvider()).toBe(created.get('10.0.0.5'))
  })

  it('removing the last-connected Controller clears the remembered IP', async () => {
    await store().addController('10.0.0.5')
    await store().removeController('10.0.0.5')
    expect(store().activeIp).toBeNull()
    expect(store().lastConnectedIp).toBeNull()
  })

  it('autoConnect reconnects only the remembered Controller', async () => {
    useControllerStore.setState({ lastConnectedIp: '10.0.0.5' })
    await store().autoConnect()
    expect(store().controllers['10.0.0.5'].phase).toBe('live')
    expect(store().activeIp).toBe('10.0.0.5')
  })

  it('autoConnect with nothing remembered does nothing', async () => {
    await store().autoConnect()
    expect(Object.keys(store().controllers)).toHaveLength(0)
  })

  it('persists the nickname alongside the IP on connect (#215)', async () => {
    await store().addController('10.0.0.5')
    expect(store().lastConnectedNickname).toBe('pixel-1')
    expect(localStorage.getItem('pixelblaze-controller')).toContain('pixel-1')
  })

  it('autoConnect seeds the pill with the remembered name before reconnecting (#215)', async () => {
    // Mimic a reload: only the persisted slice is present, no live providers.
    useControllerStore.setState({
      lastConnectedIp: '10.0.0.5',
      lastConnectedNickname: 'living-room',
    })
    // A provider that never finishes connecting, so we observe the pending pill.
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.connect = () => new Promise<void>(() => {})
      created.set(ip, p)
      return p
    })
    void store().autoConnect()
    await new Promise((r) => setTimeout(r, 0))
    const entry = store().controllers['10.0.0.5']
    expect(entry.phase).toBe('pending')
    expect(entry.nickname).toBe('living-room')
  })

  it('a device rename overwrites the remembered name on reconnect (#215)', async () => {
    useControllerStore.setState({
      lastConnectedIp: '10.0.0.5',
      lastConnectedNickname: 'old-name',
    })
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.name = 'new-name'
      created.set(ip, p)
      return p
    })
    await store().autoConnect()
    expect(store().controllers['10.0.0.5'].nickname).toBe('new-name')
    expect(store().lastConnectedNickname).toBe('new-name')
  })

  it('seeds the pending pill from the cached name when reconnecting unseeded (#230)', async () => {
    // The last-connected controller, but addController called WITHOUT a seed (manual
    // IP re-entry / discovery click). The pill must be born named, not flash the IP.
    useControllerStore.setState({
      lastConnectedIp: '10.0.0.5',
      lastConnectedNickname: 'burner-bag',
    })
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.connect = () => new Promise<void>(() => {}) // never resolves: observe pending
      created.set(ip, p)
      return p
    })
    void store().addController('10.0.0.5')
    await new Promise((r) => setTimeout(r, 0))
    const entry = store().controllers['10.0.0.5']
    expect(entry.phase).toBe('pending')
    expect(entry.nickname).toBe('burner-bag')
  })

  it('keeps the known name when getConfig fails on connect — no IP flash (#230)', async () => {
    // Reconnect churn can reject getConfig on a torn-down socket. The pill must hold
    // the seeded name rather than clobbering back to the bare IP.
    useControllerStore.setState({
      lastConnectedIp: '10.0.0.5',
      lastConnectedNickname: 'burner-bag',
    })
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      // The real provider's `connected` status carries no name — only getConfig does.
      p.name = undefined
      p.getConfig = () => Promise.reject(new Error('socket gone'))
      created.set(ip, p)
      return p
    })
    await store().addController('10.0.0.5')
    expect(store().controllers['10.0.0.5'].phase).toBe('live')
    expect(store().controllers['10.0.0.5'].nickname).toBe('burner-bag')
    // The persisted seed must survive a transient failure for the next reload.
    expect(store().lastConnectedNickname).toBe('burner-bag')
  })

  it('does not seed a different IP from the cached name (#230)', async () => {
    useControllerStore.setState({
      lastConnectedIp: '10.0.0.5',
      lastConnectedNickname: 'burner-bag',
    })
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.connect = () => new Promise<void>(() => {})
      created.set(ip, p)
      return p
    })
    void store().addController('10.0.0.9')
    await new Promise((r) => setTimeout(r, 0))
    expect(store().controllers['10.0.0.9'].nickname).toBeUndefined()
  })

  describe('pushActivePattern (#202)', () => {
    const PATTERN_SRC = 'export function render(index) {\n  hsv(index, 1, 1)\n}\n'
    const GENERATED_ARTIFACT_PRESSURE = {
      budgetBytes: 1_000_000,
      worstInstantRenderersPerPixel: 1,
    }

    it('compiles + pushes the active pattern and records a created binding', async () => {
      await store().addController('10.0.0.5')
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      expect(provider.pushed).toHaveLength(1)
      // #237: the run path sends an empty setCode name — a run-only program is never
      // persisted, so the name lives in the local label cache instead, keyed by the
      // throwaway program id we pushed to.
      expect(provider.pushed[0].opts.name).toBe('')
      const pushedId = provider.pushed[0].opts.id
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toEqual({ ok: true, created: true })
      expect(store().artifactPushResult).toEqual({
        ok: true,
        created: true,
        artifactId: 'pat-1',
        mode: 'run',
      })
      // The pushed source is remembered (dirty gate) so a re-push is a no-op.
      expect(store().lastPushedSource['10.0.0.5']['pat-1']).toBe(PATTERN_SRC)
      expect(store().lastRunProgramId['10.0.0.5']['pat-1']).toBe(pushedId)
      expect(useControllerPanelStore.getState().activeProgramId).toBe(pushedId)
      // Run-only push mints a throwaway id and records NO overwrite binding (the #236
      // reframe — overwrite-in-place applies only to saved patterns, not run-only pushes).
      const bindings = await getControllerBindings()
      expect(bindings['10.0.0.5']).toBeUndefined()
      // ...but it DOES record the program label (#237) so the panel resolves the running
      // program's name instead of the raw generated id.
      const labels = await getProgramLabels()
      expect(labels['10.0.0.5'][pushedId]).toBe('Twinkle')
      expect(useControllerPanelStore.getState().programLabels[pushedId]).toBe('Twinkle')
    })

    it('presents the renderer as playing after Send resumes a previously paused Controller (#737)', async () => {
      await store().addController('10.0.0.5')
      await store().setRendererPaused('10.0.0.5', true)
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()

      expect(store().rendererStates['10.0.0.5']).toEqual({
        acknowledged: 'unknown',
        assumedPlaying: true,
        pending: null,
      })
      expect(store().rendererPausedByPxlblz).toEqual({})
    })

    it('retains Resume recovery across reconnect when Pattern activation fails (#737)', async () => {
      await store().addController('10.0.0.5')
      created.get('10.0.0.5')!.pushBytecodeError = new Error('socket gone during activation')
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()
      await store().removeController('10.0.0.5')
      await store().addController('10.0.0.5')

      expect(store().pushResult).toEqual({
        ok: false,
        message: 'Controller target activation failed: socket gone during activation',
      })
      expect(store().artifactPushResult).toEqual({
        ok: false,
        message: 'Controller target activation failed: socket gone during activation',
        artifactId: 'pat-1',
        mode: 'run',
      })
      expect(store().rendererPausedByPxlblz).toEqual({ '10.0.0.5': true })
      expect(store().rendererStates['10.0.0.5']).toEqual({
        acknowledged: 'unknown',
        pending: null,
      })
    })

    it('keeps the drain transport-only when a run replaces a known large program', async () => {
      await store().addController('10.0.0.5')
      const provider = created.get('10.0.0.5')!
      provider.activeProgramBytecodeSize = 49_426
      provider.compileResult = makeReconcilingBytecode(40_518)
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()

      expect(provider.pushed).toHaveLength(2)
      const [drain, target] = provider.pushed
      expect(drain.opts.name).toBe('')
      expect(target.opts.name).toBe('')
      expect(drain.opts.id).not.toBe(target.opts.id)
      expect((await getProgramLabels())['10.0.0.5']).toEqual({
        [target.opts.id]: 'Twinkle',
      })
      expect(store().lastPushedSource['10.0.0.5']['pat-1']).toBe(PATTERN_SRC)
      expect((await getControllerBindings())['10.0.0.5']).toBeUndefined()
    })

    it('save-armed: writes a persisted PBP record and records the save dirty-gate (#238)', async () => {
      await store().addController('10.0.0.5')
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })
      store().setSaveArmed(true)

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      // Save-and-run (#238): save mode persists via saveProgram AND runs the same id so
      // the device switches to the saved program (LEDs change, marker clears).
      expect(provider.saved).toHaveLength(1)
      expect(provider.pushed).toHaveLength(1)
      expect(provider.pushed[0].opts.id).toBe(provider.saved[0].opts.id)
      expect(store().pushResult).toEqual({ ok: true, created: true })
      // The dirty gate is recorded in the SAVE map, not the run map — so flipping the
      // toggle back to run leaves run-mode Send enabled.
      expect(store().lastSavedSource['10.0.0.5']['pat-1']).toBe(PATTERN_SRC)
      expect(store().lastPushedSource['10.0.0.5']).toBeUndefined()
      expect(store().lastRunProgramId['10.0.0.5']).toBeUndefined()
      expect(useControllerPanelStore.getState().activeProgramId).toBe(provider.saved[0].opts.id)
      // Save mode records the overwrite binding (#236).
      const bindings = await getControllerBindings()
      expect(bindings['10.0.0.5']['pat-1']).toBe(provider.saved[0].opts.id)
    })

    it('runs and overwrite-saves a generated Show under its own stable identity (#429)', async () => {
      await store().addController('10.0.0.5')
      const source = stampArtifact(PATTERN_SRC, {
        kind: 'show',
        id: 'show-1',
        name: 'Opening Night',
        transforms: ['show'],
        stampedAt: '2026-07-11T12:00:00.000Z',
      })
      const artifact = {
        artifactId: 'show:show-1',
        source,
        name: 'Opening Night',
        compilePressure: GENERATED_ARTIFACT_PRESSURE,
        artifactStamp: {
          kind: 'show' as const,
          id: 'show-1',
          name: 'Opening Night',
          transforms: ['show'],
          stampedAt: '2026-07-11T12:00:00.000Z',
        },
      }

      await store().pushGeneratedArtifact({ ...artifact, persist: false })
      const provider = created.get('10.0.0.5')!
      const runId = provider.pushed[0].opts.id
      expect(provider.compiledSources[0]).toBe(source)
      expect(store().lastPushedSource['10.0.0.5']['show:show-1']).toBe(source)
      expect(store().lastRunProgramId['10.0.0.5']['show:show-1']).toBe(runId)
      expect(useControllerPanelStore.getState().activeProgramId).toBe(runId)
      expect((await getProgramLabels())['10.0.0.5'][runId]).toBe('Opening Night')

      await store().pushGeneratedArtifact({ ...artifact, persist: true })
      const savedId = provider.saved[0].opts.id
      provider.programs = [{ id: savedId, name: 'Opening Night' }]
      await store().pushGeneratedArtifact({ ...artifact, persist: true })

      expect(provider.saved.map((entry) => entry.opts.id)).toEqual([savedId, savedId])
      expect(store().lastSavedSource['10.0.0.5']['show:show-1']).toBe(source)
      expect(store().lastRunProgramId['10.0.0.5']['show:show-1']).toBe(runId)
      expect(useControllerPanelStore.getState().activeProgramId).toBe(savedId)
      expect((await getControllerBindings())['10.0.0.5']['show:show-1']).toBe(savedId)
      expect((await getPushRecords())['10.0.0.5']['show:show-1'].profileSignature)
        .toBe(controllerProfileArtifactSignature(
          null,
          'show:show-1',
          { mapDim: store().controllers['10.0.0.5'].mapDim ?? null },
        ))
    })

    it('applies active profile transforms before signing a generated Show (#777)', async () => {
      await store().addController({
        id: 'pixelblaze_pb32_show',
        address: '10.0.0.5',
        name: 'Show Controller',
      })
      const profile = {
        ...defaultControllerProfile({
          id: 'show-profile',
          deviceId: 'pixelblaze_pb32_show',
          now: 1,
        }),
        globalTransforms: defaultControllerProfile().globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, maxDuty: 0.25 }
            : transform
        )),
      }
      setControllerProfiles([profile])
      const source = stampArtifact(PATTERN_SRC, {
        kind: 'show',
        id: 'show-1',
        name: 'Opening Night',
        transforms: ['show'],
        stampedAt: '2026-07-11T12:00:00.000Z',
      })

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-1',
        source,
        name: 'Opening Night',
        persist: true,
        compilePressure: GENERATED_ARTIFACT_PRESSURE,
        artifactStamp: {
          kind: 'show',
          id: 'show-1',
          name: 'Opening Night',
          transforms: ['show'],
          stampedAt: '2026-07-11T12:00:00.000Z',
        },
      })

      const controller = store().controllers['10.0.0.5']
      expect(created.get('10.0.0.5')!.compiledSources[0]).toContain('__px_cappedHsv')
      expect(store().lastSavedSource['10.0.0.5']['show:show-1']).toBe(source)
      expect((await getPushRecords())['10.0.0.5']['show:show-1']).toMatchObject({
        transforms: ['show', 'power-cap'],
        profileSignature: controllerProfileArtifactSignature(
          profile,
          'show:show-1',
          { mapDim: controller.mapDim ?? null },
        ),
      })
      expect(store().lastSavedProfileSignature['10.0.0.5']['show:show-1']).toBe(
        controllerProfileArtifactSignature(
          profile,
          'show:show-1',
          { mapDim: controller.mapDim ?? null },
        ),
      )
    })

    it('lets the Controller compile a generated Show when profile transforms cross the source proxy (#849)', async () => {
      await store().addController({
        id: 'pixelblaze_pb32_show',
        address: '10.0.0.5',
        name: 'Show Controller',
      })
      const profile = {
        ...defaultControllerProfile({
          id: 'show-profile',
          deviceId: 'pixelblaze_pb32_show',
          now: 1,
        }),
        globalTransforms: defaultControllerProfile().globalTransforms.map((transform) => (
          transform.type === 'power-cap' ? { ...transform, enabled: true } : transform
        )),
      }
      setControllerProfiles([profile])
      const source = stampArtifact(PATTERN_SRC, {
        kind: 'show',
        id: 'show-1',
        name: 'Opening Night',
        transforms: ['show'],
      })

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-1',
        source,
        name: 'Opening Night',
        persist: false,
        compilePressure: {
          budgetBytes: source.length + 1,
          worstInstantRenderersPerPixel: 1,
        },
        artifactStamp: { kind: 'show', id: 'show-1', name: 'Opening Night', transforms: ['show'] },
      })

      expect(created.get('10.0.0.5')!.compiledSources).toHaveLength(1)
      expect(created.get('10.0.0.5')!.compiledSources[0]).toContain('__px_cappedHsv')
      expect(store().pushResult).toEqual({ ok: true, created: true })
      expect(store().artifactPushResult).toEqual({
        ok: true,
        created: true,
        artifactId: 'show:show-1',
        mode: 'run',
      })
    })

    it('surfaces a generated Show compile failure without pushing (#429)', async () => {
      await store().addController('10.0.0.5')
      created.get('10.0.0.5')!.compileError = new Error('Show compile failed on device')

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-1',
        source: PATTERN_SRC,
        name: 'Opening Night',
        persist: false,
        compilePressure: GENERATED_ARTIFACT_PRESSURE,
        artifactStamp: { kind: 'show', id: 'show-1', name: 'Opening Night' },
      })

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
      expect(store().pushResult).toEqual({ ok: false, message: 'Show compile failed on device' })
      expect(store().artifactPushResult).toEqual({
        ok: false,
        message: 'Show compile failed on device',
        artifactId: 'show:show-1',
        mode: 'run',
      })
    })

    it('retains Resume recovery when generated-artifact activation fails (#737)', async () => {
      await store().addController('10.0.0.5')
      created.get('10.0.0.5')!.pushBytecodeError = new Error('activation timed out')

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-1',
        source: PATTERN_SRC,
        name: 'Opening Night',
        persist: false,
        compilePressure: GENERATED_ARTIFACT_PRESSURE,
        artifactStamp: { kind: 'show', id: 'show-1', name: 'Opening Night' },
      })

      expect(store().rendererPausedByPxlblz).toEqual({ '10.0.0.5': true })
      expect(store().rendererStates['10.0.0.5']).toEqual({
        acknowledged: 'unknown',
        pending: null,
      })
    })

    it('is a no-op when no pattern is active', async () => {
      await store().addController('10.0.0.5')
      useEditorStore.setState({ previewSource: PATTERN_SRC })
      // activePatternId stays null.

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toBeNull()
    })

    it('surfaces a compile failure as an error result without pushing', async () => {
      await store().addController('10.0.0.5')
      await store().setRendererPaused('10.0.0.5', true)
      created.get('10.0.0.5')!.compileError = new Error('compiler offline')
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC })

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toEqual({ ok: false, message: 'compiler offline' })
      expect(store().rendererStates['10.0.0.5']).toEqual({
        acknowledged: 'unknown',
        pending: null,
      })
    })

    it('keeps the compiled artifact unchanged when the active profile has hardware brightness off', async () => {
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        name: 'Desk PB',
      })
      const profile = defaultControllerProfile({
        id: 'ctrl-1',
        deviceId: 'pixelblaze_pb32_abc',
        now: 1,
      })
      setControllerProfiles([profile])
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      expect(provider.compiledSources).toEqual([bundle(PATTERN_SRC, {}).code])
      expect(store().lastTransformSummary['10.0.0.5']?.['pat-1']).toBeUndefined()
      expect(store().lastTransformArtifacts['10.0.0.5']?.['pat-1']).toBeUndefined()
    })

    it('adds a centered exact-arity adapter for the live Controller map and records it', async () => {
      const source = 'export function render3D(index, x, y, z) {\n  hsv(z, 1, 1)\n}\n'
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        version: '3.67',
      })
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: source, previewPatternName: 'Spatial' })

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      expect(provider.compiledSources[0]).toContain('export function render2D(index, x, y)')
      expect(provider.compiledSources[0]).toContain('render3D(index, x, y, 0.5)')
      expect(store().lastTransformSummary['10.0.0.5']['pat-1'].rendererAdaptations).toEqual([{
        mapDimension: 2,
        sourceRenderer: 'render3D',
        adapterRenderer: 'render2D',
        missingCoordinates: ['z'],
      }])
      expect(store().lastTransformArtifacts['10.0.0.5']['pat-1'].generatedSource).toContain(
        'render3D(index, x, y, 0.5)',
      )
    })

    it('keeps an exact renderer byte-identical and records no transform artifact', async () => {
      const source = 'export function render2D(index, x, y) {\n  hsv(x, 1, 1)\n}\n'
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        version: '3.67',
      })
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: source })

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.compiledSources).toEqual([bundle(source, {}).code])
      expect(store().lastTransformSummary['10.0.0.5']?.['pat-1']).toBeUndefined()
      expect(store().lastTransformArtifacts['10.0.0.5']?.['pat-1']).toBeUndefined()
    })

    it('allows a centered adapter on pre-3.66 firmware because the emitted renderer is exact', async () => {
      const source = 'export function render3D(index, x, y, z) { hsv(z, 1, 1) }'
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        version: '3.65',
      })
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: source })

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(1)
      expect(store().pushResult?.ok).toBe(true)
    })

    it('refuses an unadapted cross-dimensional fallback on pre-3.66 firmware', async () => {
      const source = 'export function render2D(index, x, y) { hsv(y, 1, 1) }'
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        version: '3.65',
      })
      useControllerStore.setState((state) => ({
        controllers: {
          ...state.controllers,
          '10.0.0.5': { ...state.controllers['10.0.0.5'], mapDim: 3 },
        },
      }))
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: source })

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.compiledSources).toHaveLength(0)
      expect(store().pushResult).toEqual({
        ok: false,
        message: 'This cross-dimensional renderer fallback requires Pixelblaze firmware 3.66 or newer.',
      })
    })

    it('refuses to push when the exact adapter renderer name is occupied', async () => {
      const source = [
        'var render2D = 1',
        'export function render3D(index, x, y, z) { hsv(z, 1, 1) }',
      ].join('\n')
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        version: '3.67',
      })
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: source })

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.compiledSources).toHaveLength(0)
      expect(store().pushResult).toEqual({
        ok: false,
        message: 'Cannot generate render2D because that name is already bound by the Pattern or a library.',
      })
    })

    it('waits for pending Controller Profile auto-saves before reading transforms', async () => {
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        name: 'Desk PB',
      })
      const profile = defaultControllerProfile({
        id: 'ctrl-1',
        deviceId: 'pixelblaze_pb32_abc',
        now: 1,
      })
      setControllerProfiles([profile])
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })
      let releaseWrite!: () => void
      void queueControllerProfileWrite(profile.id, async () => {
        await new Promise<void>((resolve) => {
          releaseWrite = resolve
        })
      })

      const push = store().pushActivePattern()
      await Promise.resolve()
      await Promise.resolve()
      expect(created.get('10.0.0.5')!.compiledSources).toEqual([])

      releaseWrite()
      await push
      expect(created.get('10.0.0.5')!.compiledSources).toHaveLength(1)
    })

    it('pushes patterns bundled with user cloud libraries', async () => {
      const source = 'export function render(index) { MyLib.paint(index) }'
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        name: 'Desk PB',
      })
      useLibraryStore.setState({
        userLibraries: [{
          id: 'lib-1',
          name: 'MyLib',
          src: 'function paint(index) { hsv(index / pixelCount, 1, 1) }',
          updatedAt: 1,
        }],
        librariesLoaded: true,
      })
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: source, previewPatternName: 'Cloudy' })

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      expect(provider.compiledSources[0]).toContain('function _MyLib_paint(')
      expect(provider.compiledSources[0]).toContain('_MyLib_paint(index)')
      expect(provider.compiledSources[0]).not.toContain('MyLib.paint')
    })

    it('applies matching per-pattern hardware input bindings during push', async () => {
      const source = [
        'export var speed = 0',
        'export function sliderSpeed(v) { speed = v }',
        'export function render(index) {',
        '  hsv(index, speed, 1)',
        '}',
      ].join('\n')
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        name: 'Desk PB',
      })
      const profile: ControllerProfile = {
        ...defaultControllerProfile({
          id: 'ctrl-1',
          deviceId: 'pixelblaze_pb32_abc',
          now: 1,
        }),
        inputs: [
          {
            id: 'speed-pot',
            name: 'Speed pot',
            pin: 33,
            signal: 'analog',
            smoothing: 0.2,
            fallback: 0.4,
            invert: false,
          },
        ],
        patternBindings: [
          {
            id: 'speed-binding',
            patternId: 'pat-1',
            inputId: 'speed-pot',
            target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
          },
        ],
      }
      setControllerProfiles([profile])
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: source, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      expect(provider.compiledSources[0]).toContain('analogRead(33)')
      expect(provider.compiledSources[0]).toContain('sliderSpeed(speedPotValue)')
      expect(provider.compiledSources[0]).not.toBe(bundle(source, {}).code)
      expect(store().lastTransformSummary['10.0.0.5']['pat-1'].bindingsApplied).toEqual([
        { target: 'sliderSpeed', mode: 'function-call' },
      ])
      expect(store().lastTransformArtifacts['10.0.0.5']['pat-1']).toMatchObject({
        patternName: 'Twinkle',
        warnings: [],
        summary: {
          bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
        },
      })
      expect(store().lastTransformArtifacts['10.0.0.5']['pat-1'].generatedSource).toContain('sliderSpeed(speedPotValue)')
    })

    it('injects hardware brightness for the active Controller profile and retains its summary', async () => {
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        name: 'Desk PB',
      })
      const profile: ControllerProfile = {
        ...defaultControllerProfile({
          id: 'ctrl-1',
          deviceId: 'pixelblaze_pb32_abc',
          now: 1,
        }),
        inputs: [
          {
            id: 'brightness-pot',
            name: 'Brightness pot',
            pin: 33,
            signal: 'analog',
            smoothing: 0.2,
            fallback: 0.4,
            invert: false,
          },
        ],
        globalTransforms: [
          {
            id: 'hardware-brightness',
            type: 'hardware-brightness',
            enabled: true,
            mixinId: 'builtin:hardware-brightness',
            inputId: 'brightness-pot',
            mode: 'multiply-output',
          },
        ],
      }
      setControllerProfiles([profile])
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      expect(provider.compiledSources[0]).toContain('analogRead(33)')
      expect(provider.compiledSources[0]).toContain('__px_hardwareBrightness(a, b, c)')
      expect(provider.compiledSources[0]).toContain('__pxlblz_hardware_brightness_hsv(index, 1, 1)')
      expect(provider.compiledSources[0]).not.toBe(bundle(PATTERN_SRC, {}).code)
      expect(store().lastTransformSummary['10.0.0.5']['pat-1'].callSitesWrapped).toEqual({ hsv: 1 })
    })

    it('re-arms Send after a persisted brightness edit and pushes the changed artifact (#772)', async () => {
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        name: 'Desk PB',
      })
      let persistedProfile: ControllerProfile = {
        ...defaultControllerProfile({
          id: 'ctrl-1',
          deviceId: 'pixelblaze_pb32_abc',
          now: 1,
        }),
        inputs: [{
          id: 'brightness-pot',
          name: 'Brightness pot',
          pin: 33,
          signal: 'analog',
          smoothing: 0.2,
          fallback: 0.4,
          invert: false,
        }],
      }
      setPersonalContentProvider({
        ...demoPersonalContentProvider,
        id: 'mutable-controller-profile-test',
        listControllerProfiles: async () => [persistedProfile],
        updateControllerProfile: async (id, changes) => {
          if (id === persistedProfile.id) persistedProfile = { ...persistedProfile, ...changes }
        },
      })
      useControllerProfileStore.setState({ profiles: [persistedProfile], profilesLoaded: true })
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      expect(provider.compiledSources[0]).not.toContain('analogRead(33)')
      const firstSignature = store().lastPushedProfileSignature['10.0.0.5']['pat-1']
      const firstProgramId = store().lastRunProgramId['10.0.0.5']['pat-1']

      await useControllerProfileStore.getState().assignHardwareBrightness(
        persistedProfile.id,
        'brightness-pot',
      )

      const activeController = store().controllers['10.0.0.5']
      const editedSignature = controllerProfileArtifactSignature(
        persistedProfile,
        'pat-1',
        { mapDim: activeController.mapDim ?? null },
      )
      expect(editedSignature).not.toBe(firstSignature)
      expect(isAlreadyPushed({
        mode: 'run',
        source: PATTERN_SRC,
        lastRunSource: store().lastPushedSource['10.0.0.5']['pat-1'],
        profileSignature: editedSignature,
        lastRunProfileSignature: firstSignature,
        lastRunProgramId: firstProgramId,
        activeProgramId: useControllerPanelStore.getState().activeProgramId,
      })).toBe(false)

      await store().pushActivePattern()

      expect(provider.compiledSources[1]).toContain('analogRead(33)')
      expect(provider.compiledSources[1]).toContain('__px_hardwareBrightness(a, b, c)')
      expect(store().lastPushedProfileSignature['10.0.0.5']['pat-1']).toBe(editedSignature)
      expect(store().lastTransformArtifacts['10.0.0.5']['pat-1'].generatedSource)
        .toContain('__pxlblz_hardware_brightness_hsv(index, 1, 1)')
    })
  })

  describe('requestPush (#239 — pattern push has no preflight)', () => {
    const PATTERN_SRC = 'export function render2D(index, x, y) {\n  hsv(x, 1, 1)\n}\n'

    async function arm(devicePixelCount: number | undefined) {
      await store().addController('10.0.0.5')
      created.get('10.0.0.5')!.pixelCount = devicePixelCount
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })
    }

    it('pushes straight through, opening no dialog, whatever the device count', async () => {
      // The preview resolution no longer factors in — a pattern runs on the device's
      // own pixels, so there is nothing to reconcile and the push is always one-click.
      await arm(256)
      await store().requestPush()
      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(1)
      expect(store().pushResult).toEqual({ ok: true, created: true })
    })

    it('pushes through when the device count is unknown', async () => {
      await arm(undefined)
      await store().requestPush()
      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(1)
    })
  })

  describe('pattern dim-mismatch preflight + recommended-map remedy (Option A)', () => {
    const SRC_3D = 'export function render3D(index, x, y, z) {\n  hsv(x, 1, 1)\n}\n'

    async function armMismatch() {
      await store().addController('10.0.0.5')
      // The device has a 2D map and drives 256 LEDs; the open pattern is the 3D
      // NebulaSphere demo.
      created.get('10.0.0.5')!.pixelCount = 256
      useControllerStore.setState((s) => ({
        controllers: {
          ...s.controllers,
          '10.0.0.5': { ...s.controllers['10.0.0.5'], mapDim: 2 },
        },
      }))
      usePatternStore.setState({ activePatternId: null, activeDemoName: 'NebulaSphere' })
      useEditorStore.setState({
        nativeDim: 3,
        previewSource: SRC_3D,
        previewPatternName: 'NebulaSphere',
      })
    }

    it('opens the dialog (no push) on a dim mismatch and arms the recommended-map remedy', async () => {
      await armMismatch()
      await store().requestPush()

      expect(store().preflight?.map((w) => w.kind)).toEqual(['pattern-dim-mismatch'])
      expect(store().mapPushRemedyCount).toBeNull() // never blocking
      expect(store().patternMapRemedy).toEqual({
        mapId: 'seed-sphere-3d',
        mapName: 'Sphere shell',
        mapDim: 3,
      })
      // Nothing pushed until the author confirms.
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
    })

    it('uses exact renderer capabilities rather than highest Pattern dimension', async () => {
      const source = [
        'export function render2D(index, x, y) { hsv(x, 1, 1) }',
        'export function render3D(index, x, y, z) { hsv(z, 1, 1) }',
      ].join('\n')
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        version: '3.67',
      })
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ nativeDim: 3, previewSource: source })

      await store().requestPush()

      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(1)
    })

    it('blocks a known-unsupported fallback before compile or push', async () => {
      const source = 'export function render2D(index, x, y) { hsv(y, 1, 1) }'
      await store().addController({
        id: 'pixelblaze_pb32_abc',
        address: '10.0.0.5',
        version: '3.65',
      })
      useControllerStore.setState((state) => ({
        controllers: {
          ...state.controllers,
          '10.0.0.5': { ...state.controllers['10.0.0.5'], mapDim: 3 },
        },
      }))
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ nativeDim: 2, previewSource: source })

      await store().requestPush()

      expect(store().patternPushBlocked).toBe(true)
      expect(store().preflight?.map((warning) => warning.kind)).toContain(
        'pattern-firmware-unsupported',
      )
      await store().confirmPatternPush()
      expect(created.get('10.0.0.5')!.compiledSources).toHaveLength(0)
    })

    it('confirmPatternPushWithMap materializes the map to the device count (no count change), updates mapDim, then pushes', async () => {
      await armMismatch()
      await store().requestPush()
      await store().confirmPatternPushWithMap()

      const provider = created.get('10.0.0.5')!
      // The hardware pixel count is left untouched; the sphere is baked to the device's
      // own 256 LEDs (not the preview's recommended size).
      expect(provider.setPixelCounts).toEqual([])
      expect(provider.pushedMaps).toHaveLength(1)
      expect(provider.pushedMaps[0].points).toHaveLength(256)
      // The controller entry now reflects the installed map's dimension.
      expect(store().controllers['10.0.0.5'].mapDim).toBe(3)
      // Then the pattern itself is pushed, and the dialog state is cleared.
      expect(provider.pushed).toHaveLength(1)
      expect(store().preflight).toBeNull()
      expect(store().patternMapRemedy).toBeNull()
    })

    it('confirmPatternPush sends the pattern without installing a map (Send anyway)', async () => {
      await armMismatch()
      await store().requestPush()
      await store().confirmPatternPush()

      const provider = created.get('10.0.0.5')!
      expect(provider.setPixelCounts).toEqual([])
      expect(provider.pushedMaps).toHaveLength(0)
      // The map is untouched, so the device stays 2D.
      expect(store().controllers['10.0.0.5'].mapDim).toBe(2)
      expect(provider.pushed).toHaveLength(1)
      expect(store().preflight).toBeNull()
    })

    it('aborts before the pattern push when the map install fails', async () => {
      await armMismatch()
      created.get('10.0.0.5')!.setPixelMapError = new Error('socket closed')
      await store().requestPush()
      await store().confirmPatternPushWithMap()

      const provider = created.get('10.0.0.5')!
      expect(provider.pushed).toHaveLength(0) // pattern never pushed
      expect(store().pushResult).toEqual({ ok: false, message: 'socket closed' })
    })
  })

  describe('map push (#204)', () => {
    const MAP: MapRecord = {
      id: 'm1',
      name: 'My Map',
      dim: 2,
      generator: 'custom',
      params: {},
      source: 'function(c){ return [[0,0],[1,1]] }',
      points: [
        [0, 0],
        [1, 1],
      ],
      updatedAt: 0,
    }

    async function armMap(devicePixelCount?: number) {
      await store().addController('10.0.0.5')
      created.get('10.0.0.5')!.pixelCount = devicePixelCount
      useMapStore.setState({ editingMap: { kind: 'existing', id: 'm1' }, userMaps: [MAP] })
    }

    it('requestMapPush always opens the dialog with the map-overwrite warning', async () => {
      await armMap(2)
      await store().requestMapPush()
      // Counts match (2 == 2), but the map-overwrite warning always shows.
      expect(store().preflight?.map((w) => w.kind)).toEqual(['map-overwrite'])
      // The map has NOT been written yet — it waits on confirmMapPush.
      expect(created.get('10.0.0.5')!.pushedMaps).toHaveLength(0)
    })

    it('blocks an unconformable count mismatch and arms the coupled remedy (#213)', async () => {
      await armMap(256) // device has 256 pixels, map hard-coded to 2 points
      await store().requestMapPush()
      // The fixed-count map can't re-bake to 256, so the firmware would silently drop
      // it: a blocking map-count mismatch, not a non-blocking pattern-fit warning.
      expect(store().preflight?.map((w) => w.kind)).toEqual(['map-count-mismatch', 'map-overwrite'])
      // Remedy armed: set the Controller to the map's own point count (2).
      expect(store().mapPushRemedyCount).toBe(2)
    })

    it('confirmMapPush couples setPixelCount(N) then the map write for a blocked map (#213)', async () => {
      await armMap(256)
      await store().requestMapPush()
      await store().confirmMapPush()

      const provider = created.get('10.0.0.5')!
      // Pixel count set to the map's point count first, then the map written.
      expect(provider.setPixelCounts).toEqual([2])
      expect(provider.pushedMaps).toHaveLength(1)
      expect(provider.pushedMaps[0].points).toEqual(MAP.points)
      expect(store().preflight).toBeNull()
      expect(store().mapPushRemedyCount).toBeNull()
      expect(store().pushResult).toEqual({ ok: true, created: false })
    })

    it('confirmMapPushOnly writes the map without touching the pixel count (#213)', async () => {
      await armMap(256)
      await store().requestMapPush()
      await store().confirmMapPushOnly()

      const provider = created.get('10.0.0.5')!
      // The escape hatch: map written, pixel count left alone (firmware may drop it).
      expect(provider.setPixelCounts).toEqual([])
      expect(provider.pushedMaps).toHaveLength(1)
      expect(store().preflight).toBeNull()
      expect(store().mapPushRemedyCount).toBeNull()
    })

    it('confirmSetPixelCountOnly sets the count without writing the map (#213)', async () => {
      await armMap(256)
      await store().requestMapPush()
      await store().confirmSetPixelCountOnly()

      const provider = created.get('10.0.0.5')!
      // The pixel-count-only combination: count set to the map's point count, no map write.
      expect(provider.setPixelCounts).toEqual([2])
      expect(provider.pushedMaps).toHaveLength(0)
      expect(store().preflight).toBeNull()
      expect(store().mapPushRemedyCount).toBeNull()
      expect(store().pushResult).toEqual({ ok: true, created: false })
    })

    it('confirmSetPixelCountOnly leaves the device map alone when it lowers the count (#222)', async () => {
      await armMap(256)
      const provider = created.get('10.0.0.5')!
      // The device currently runs 8 pixels with an 8-point map; the live panel count
      // reflects that. The count-only remedy drops it to the map's 2 points. The tail
      // is darkened by the blackout-then-shrink maneuver in applyControllerPixelCount,
      // NOT by rewriting the map — pushing a smaller map does not clear LEDs (verified
      // on hardware), so the device map is left untouched.
      provider.pixelMap = [
        [0, 0],
        [0.1, 0],
        [0.2, 0],
        [0.3, 0],
        [0.4, 0],
        [0.5, 0],
        [0.6, 0],
        [0.7, 0],
      ]
      const installedMap = {
        status: 'present' as const,
        bytes: encodeMapData(provider.pixelMap),
        fingerprint: 'existing-map',
        dimension: 2 as const,
        pointCount: 8,
        observedAt: 1,
      }
      useControllerPanelStore.setState({ pixelCount: 8 })
      useControllerStore.setState((state) => ({
        controllers: {
          ...state.controllers,
          '10.0.0.5': { ...state.controllers['10.0.0.5'], installedMap },
        },
      }))
      await store().requestMapPush()
      await store().confirmSetPixelCountOnly()

      expect(provider.setPixelCounts).toEqual([2])
      expect(provider.pushedMaps).toHaveLength(0)
      expect(store().controllers['10.0.0.5'].installedMap).toBe(installedMap)
      expect(store().pushResult).toEqual({ ok: true, created: false })
    })

    it('aborts the coupled push when setPixelCount fails — no dropped map (#213)', async () => {
      await armMap(256)
      created.get('10.0.0.5')!.setPixelCountError = new Error('socket closed')
      await store().requestMapPush()
      await store().confirmMapPush()

      const provider = created.get('10.0.0.5')!
      expect(provider.pushedMaps).toHaveLength(0)
      expect(store().pushResult).toEqual({ ok: false, message: 'socket closed' })
    })

    it('does not set pixel count for a clean (conformable) map push', async () => {
      await armMap(2) // counts already match
      await store().requestMapPush()
      expect(store().mapPushRemedyCount).toBeNull()
      await store().confirmMapPush()
      expect(created.get('10.0.0.5')!.setPixelCounts).toEqual([])
    })

    it('confirmMapPush clears the dialog and writes the baked coords', async () => {
      await armMap(2)
      await store().requestMapPush()
      await store().confirmMapPush()

      expect(store().preflight).toBeNull()
      const provider = created.get('10.0.0.5')!
      expect(provider.pushedMaps).toHaveLength(1)
      expect(provider.pushedMaps[0].points).toEqual(MAP.points)
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toEqual({ ok: true, created: false })
      // The pushed map signature is remembered (dirty gate).
      expect(store().lastPushedMap['10.0.0.5']['m1']).toBe(MAP.source)
    })

    it('shows loading after send and settles only from authoritative read-back', async () => {
      await armMap(2)
      await store().requestMapPush()
      const readBack = deferred<Uint8Array | null>()
      const provider = created.get('10.0.0.5')!
      provider.getPixelMapData = () => readBack.promise

      const pushing = store().confirmMapPush()
      for (let i = 0; i < 10 && store().controllers['10.0.0.5'].installedMap?.status !== 'loading'; i++) {
        await Promise.resolve()
      }
      expect(store().controllers['10.0.0.5'].installedMap).toEqual({ status: 'loading' })

      readBack.resolve(encodeMapData(MAP.points!))
      await pushing
      expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({
        status: 'present',
        fingerprint: '9a0c9e7f',
        dimension: 2,
        pointCount: 2,
      })
    })

    it('round-trips a pushed map fingerprint into the live Controller Profile (#803)', async () => {
      let persistedProfile = defaultControllerProfile({
        id: 'ctrl-1',
        ip: '10.0.0.5',
        now: 1,
      })
      setPersonalContentProvider({
        ...demoPersonalContentProvider,
        id: 'map-fingerprint-round-trip-test',
        listControllerProfiles: async () => [persistedProfile],
        updateControllerProfile: async (id, changes) => {
          if (id === persistedProfile.id) persistedProfile = { ...persistedProfile, ...changes }
        },
      })
      useControllerProfileStore.setState({
        profiles: [persistedProfile],
        profilesLoaded: true,
      })
      await armMap(2)

      await store().pushActiveMap()

      const observation = store().controllers['10.0.0.5'].installedMap
      const liveProfile = useControllerProfileStore.getState().profiles[0]
      expect(observation).toMatchObject({ status: 'present' })
      expect(liveProfile.mapFingerprints).toEqual([{
        hash: observation?.status === 'present' ? observation.fingerprint : '',
        mapId: MAP.id,
        mapName: MAP.name,
        devicePixelCount: 2,
        pushedAt: expect.any(Number),
      }])
      expect(persistedProfile.mapFingerprints).toEqual(liveProfile.mapFingerprints)
    })

    it('cancelPush dismisses the map dialog without writing', async () => {
      await armMap(2)
      await store().requestMapPush()
      store().cancelPush()
      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushedMaps).toHaveLength(0)
    })

    it('is a no-op when no map is open for editing', async () => {
      await store().addController('10.0.0.5')
      // editingMap stays null.
      await store().requestMapPush()
      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushedMaps).toHaveLength(0)
    })

    it('surfaces a write failure as an error result', async () => {
      await armMap(2)
      created.get('10.0.0.5')!.setPixelMapError = new Error('socket closed')
      await store().requestMapPush()
      await store().confirmMapPush()
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toEqual({ ok: false, message: 'socket closed' })
    })
  })

  describe('discover', () => {
    it('distinguishes an unreachable discovery service from a successful empty scan (#815)', async () => {
      setControllerProviderFactory((ip) => {
        const p = new FakeProvider()
        p.discover = () => Promise.reject(new Error('GET /discover -> 503'))
        created.set(ip, p)
        return p
      })

      await store().discover()

      expect(store().discovered).toEqual([])
      expect(store().discoveryUnavailable).toBe(true)
      expect(store().discovering).toBe(false)
    })

    it('keeps errored controllers discoverable so the user can retry from the network list', async () => {
      setControllerProviderFactory((ip) => {
        const p = new FakeProvider()
        p.discover = () =>
          Promise.resolve([
            { id: 'error-device', address: '10.0.0.9', name: 'Errored' },
            { id: 'live-device', address: '10.0.0.5', name: 'Live' },
          ])
        created.set(ip, p)
        return p
      })

      await store().addController('10.0.0.5')
      useControllerStore.setState((s) => ({
        controllers: {
          ...s.controllers,
          '10.0.0.9': {
            ip: '10.0.0.9',
            phase: 'error',
            error: 'WebSocket open timed out',
            mapDim: null,
            nickname: 'Errored',
            authorizationNeededIp: null,
          },
        },
      }))

      await store().discover()

      expect(store().discovered).toEqual([
        { id: 'error-device', address: '10.0.0.9', name: 'Errored' },
      ])
    })

    it('dedupes discovered Controllers against live Controllers by stable device id', async () => {
      setControllerProviderFactory((ip) => {
        const p = new FakeProvider()
        p.discover = () =>
          Promise.resolve([
            {
              id: 'pixelblaze_pb32_known',
              address: '10.0.0.99',
              name: 'Same hardware, new IP',
            },
            {
              id: 'pixelblaze_pb32_other',
              address: '10.0.0.8',
              name: 'Other',
            },
          ])
        created.set(ip, p)
        return p
      })
      useControllerStore.setState({
        controllers: {
          '10.0.0.5': {
            ip: '10.0.0.5',
            deviceId: 'pixelblaze_pb32_known',
            phase: 'live',
            mapDim: 2,
            nickname: 'Known',
          },
        },
      })

      await store().discover()

      expect(store().discovered).toEqual([
        {
          id: 'pixelblaze_pb32_other',
          address: '10.0.0.8',
          name: 'Other',
        },
      ])
    })

    it('ignores a concurrent call while a sweep is already in flight', async () => {
      // The dropdown now fires discovery on open, on a periodic tick, AND on the
      // manual refresh — the guard must keep those from stacking overlapping sweeps.
      let discoverCalls = 0
      let release!: () => void
      const gate = new Promise<DiscoveredController[]>((resolve) => {
        release = () => resolve([])
      })
      setControllerProviderFactory((ip) => {
        const p = new FakeProvider()
        p.discover = () => {
          discoverCalls++
          return gate
        }
        created.set(ip, p)
        return p
      })

      const first = store().discover() // starts the sweep; discovering latches true
      await store().discover() // re-entrant — guarded, must not start a second sweep
      expect(store().discovering).toBe(true)
      expect(discoverCalls).toBe(1)

      release()
      await first
      expect(store().discovering).toBe(false)
      expect(discoverCalls).toBe(1)
    })
  })
})

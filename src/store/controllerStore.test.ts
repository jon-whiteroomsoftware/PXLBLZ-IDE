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
  setControllerBindings,
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
import { defaultControllerProfile, type ControllerProfile } from './controllerProfileStore'
import type { FirmwareUpdateState } from '@/engine/firmwareUpdate'
import { stampArtifact } from '@/engine/artifactStamp'

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
  checkFirmwareUpdate(): Promise<FirmwareUpdateState> {
    this.firmwareUpdateChecks++
    return Promise.resolve(this.firmwareUpdateState)
  }

  // ── push surface (#202) ─────────────────────────────────────────────────────
  readonly capabilities: ControllerCapabilities = { push: true, compile: true }
  /** A header-reconciling 16-byte blob (opcode 8, export 0): 8 + 8 + 0 === 16. */
  compileResult: Uint8Array = makeReconcilingBytecode()
  compileError: Error | null = null
  programs: ProgramListEntry[] = []
  pushed: { bytecode: Uint8Array; opts: { id: string; name?: string } }[] = []
  compiledSources: string[] = []

  compile(source: string): Promise<Uint8Array> {
    this.compiledSources.push(source)
    if (this.compileError) return Promise.reject(this.compileError)
    return Promise.resolve(this.compileResult)
  }
  listPrograms(): Promise<ProgramListEntry[]> {
    return Promise.resolve(this.programs)
  }
  pushBytecode(bytecode: Uint8Array, opts: { id: string; name?: string }): Promise<void> {
    this.pushed.push({ bytecode, opts })
    return Promise.resolve()
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

function makeReconcilingBytecode(): Uint8Array {
  const bytes = new Uint8Array(16)
  new DataView(bytes.buffer).setUint32(0, 8, true) // opcodeBytes = 8 → 8 + 8 + 0 = 16
  return bytes
}

const created = new Map<string, FakeProvider>()

beforeEach(async () => {
  localStorage.clear()
  __resetControllerProviders()
  resetPersonalContentProvider()
  __resetControllerProfileWriteQueue()
  resetControllerMetadataStorage()
  setControllerMetadataStorage(memoryControllerMetadataStorage())
  useControllerStore.setState(controllerInitialState)
  usePatternStore.setState(patternInitialState)
  useEditorStore.setState(editorInitialState)
  useLibraryStore.setState(libraryInitialState)
  useMapStore.setState(mapInitialState)
  useControllerPanelStore.setState(controllerPanelInitialState)
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
  it('detectExtension records global extension presence', async () => {
    await store().detectExtension()
    expect(store().extensionPresent).toBe(true)
  })

  it('addController connects, becomes the active live pill, reads nickname + mapDim', async () => {
    await store().addController('10.0.0.5')
    const entry = store().controllers['10.0.0.5']
    expect(entry.phase).toBe('live')
    expect(entry.deviceId).toBeNull()
    expect(entry.nickname).toBe('pixel-1')
    expect(entry.mapDim).toBe(2)
    expect(store().activeIp).toBe('10.0.0.5')
    expect(created.get('10.0.0.5')!.connects).toEqual([{ address: '10.0.0.5' }])
  })

  it('records an available firmware update after the Controller becomes live', async () => {
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
    expect(created.get('10.0.0.5')!.firmwareUpdateChecks).toBe(1)
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

  it('warms the panel store on connect so it opens populated (#225)', async () => {
    await store().addController('10.0.0.5')
    // seed() fires the program-list/map/poll fetches; let their promises settle.
    await new Promise((r) => setTimeout(r, 0))
    // The installed map (2 coords on the fake) lands without the panel ever opening.
    expect(useControllerPanelStore.getState().mapPointCount).toBe(2)
  })

  it('keeps warmed panel values when the panel later starts polling that Controller (#225)', async () => {
    await store().addController('10.0.0.5')
    await new Promise((r) => setTimeout(r, 0))
    expect(useControllerPanelStore.getState().mapPointCount).toBe(2)

    useControllerPanelStore.getState().start('10.0.0.5')

    expect(useControllerPanelStore.getState().mapPointCount).toBe(2)
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
      // The pushed source is remembered (dirty gate) so a re-push is a no-op.
      expect(store().lastPushedSource['10.0.0.5']['pat-1']).toBe(PATTERN_SRC)
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
      expect((await getProgramLabels())['10.0.0.5'][runId]).toBe('Opening Night')

      await store().pushGeneratedArtifact({ ...artifact, persist: true })
      const savedId = provider.saved[0].opts.id
      provider.programs = [{ id: savedId, name: 'Opening Night' }]
      await store().pushGeneratedArtifact({ ...artifact, persist: true })

      expect(provider.saved.map((entry) => entry.opts.id)).toEqual([savedId, savedId])
      expect(store().lastSavedSource['10.0.0.5']['show:show-1']).toBe(source)
      expect((await getControllerBindings())['10.0.0.5']['show:show-1']).toBe(savedId)
    })

    it('surfaces a generated Show compile failure without pushing (#429)', async () => {
      await store().addController('10.0.0.5')
      created.get('10.0.0.5')!.compileError = new Error('Show compile failed on device')

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-1',
        source: PATTERN_SRC,
        name: 'Opening Night',
        persist: false,
        artifactStamp: { kind: 'show', id: 'show-1', name: 'Opening Night' },
      })

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
      expect(store().pushResult).toEqual({ ok: false, message: 'Show compile failed on device' })
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
      created.get('10.0.0.5')!.compileError = new Error('compiler offline')
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC })

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toEqual({ ok: false, message: 'compiler offline' })
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
            role: 'assignable',
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
            role: 'brightness',
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
      useControllerPanelStore.setState({ pixelCount: 8, mapPointCount: 8 })
      await store().requestMapPush()
      await store().confirmSetPixelCountOnly()

      expect(provider.setPixelCounts).toEqual([2])
      expect(provider.pushedMaps).toHaveLength(0)
      expect(useControllerPanelStore.getState().mapPointCount).toBe(8)
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

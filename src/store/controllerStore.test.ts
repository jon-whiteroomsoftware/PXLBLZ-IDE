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
  type ControllerSaveOptions,
  type ControllerSaveResult,
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
  getControllerMetadataStorage,
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
import { priceShowArtifact, sha256CompleteCompileInput } from '@/engine/showArtifactPricing'
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
import { controllerProfileArtifactSignature, controllerProfilePassRecipe } from '@/engine/controllerProfilePassRecipe'
import { bundleWithPasses } from '@/engine/passEngine'
import { isAlreadyPushed } from '@/engine/sendToController'
import type { FirmwareUpdateState } from '@/engine/firmwareUpdate'
import { artifactHash, parsePxlblzBanner, stampArtifact, stripPxlblzBanner } from '@/engine/artifactStamp'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createShowWithOutputContract } from '@/engine/showModel'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from '@/engine/showOutputContract'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { convertForTest } from '@/test/showEditorV2Harness'
import { prepareShowV2ControllerDelivery } from '@/engine/showV2ControllerDelivery'
import { encodeMapData } from '@/engine/mapPush'
import { bakeMapSource } from '@/engine/maps/bake'
import { mapFingerprintForPoints } from '@/engine/mapFingerprint'
import { stockMapSpec } from '@/pixelblaze/stock/maps/stockCatalogue'
import {
  ControllerActivationTimeoutError,
  ControllerRequestTimeoutError,
  controllerSaveDeadlineMs,
  FrameFlag,
  MessageType,
} from '@/engine/PixelblazeConnection'
import { ExtensionControllerProvider } from '@/engine/ExtensionControllerProvider'
import { base64ToBytes, RELAY_SOURCE, type RelayMessage, type RelayTransport } from '@/engine/RelayWebSocket'
import { decodePbp } from '@/engine/pbpEncode'

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
  nameCommands: string[] = []
  setNameError: Error | null = null
  applyNameCommands = true
  connectionGeneration = 0

  detectHelper(): Promise<'ready'> {
    return Promise.resolve('ready')
  }
  getStatus(): ControllerStatus {
    return this.status
  }
  subscribe(listener: (s: ControllerStatus) => void): () => void {
    this.subs.add(listener)
    return () => this.subs.delete(listener)
  }
  emit(status: ControllerStatus) {
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
      connectionGeneration: ++this.connectionGeneration,
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
  setName(name: string): Promise<void> {
    if (this.setNameError) return Promise.reject(this.setNameError)
    this.nameCommands.push(name)
    if (this.applyNameCommands) this.name = name
    return Promise.resolve()
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
  saved: { blob: Uint8Array; opts: ControllerSaveOptions }[] = []
  saveProgram(blob: Uint8Array, opts: ControllerSaveOptions): Promise<ControllerSaveResult> {
    this.saved.push({ blob, opts })
    return Promise.resolve('confirmed')
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

function setControllerProfiles(profiles: ControllerProfile[], showsV2: ShowRecordV2[] = []): void {
  setPersonalContentProvider({
    ...demoPersonalContentProvider,
    id: 'controller-profile-test',
    listControllerProfiles: async () => profiles,
    listShowDocumentsV2: async () => showsV2,
  })
}

function managedShowProfile(): ControllerProfile {
  return {
    ...defaultControllerProfile({
      id: 'profile-1',
      deviceId: 'pixelblaze_pb32_managed',
      ip: '10.0.0.5',
    }),
  }
}

// The #514 fixture as a saved v2 record: a Portable Show on stock ShapeShifter.
function portableShowV2(): ShowRecordV2 {
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
  return convertForTest(show)
}

async function bindManagedShow(profileSignature: string): Promise<void> {
  await setControllerBindings({ '10.0.0.5': { 'show:show-portable': 'SHOW0001' } })
  await setPushRecords({
    '10.0.0.5': {
      'show:show-portable': {
        transforms: [],
        profileSignature,
        artifactHash: 'old-hash',
        stampedAt: '2026-07-12T00:00:00.000Z',
        name: 'Portable arena',
      },
    },
  })
}

// An 8-pixel Installation Show authored on stock Square (`plane`); its stamp
// requires that map's fingerprint at 8 pixels.
function installationShowV2(): ShowRecordV2 {
  return convertForTest(createShowWithOutputContract(
    'show-installation',
    'Installed wall',
    createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
    1,
  ))
}

async function connectInstallationController(pixelMap: number[][]): Promise<FakeProvider> {
  await setControllerBindings({ '10.0.0.5': { 'show:show-installation': 'SHOW0002' } })
  await setPushRecords({
    '10.0.0.5': {
      'show:show-installation': {
        transforms: [],
        profileSignature: 'old-signature',
        artifactHash: 'old-hash',
        stampedAt: '2026-07-12T00:00:00.000Z',
        name: 'Installed wall',
      },
    },
  })
  setControllerProviderFactory((ip) => {
    const provider = new FakeProvider()
    provider.pixelMap = pixelMap
    created.set(ip, provider)
    return provider
  })
  await store().addController({
    id: 'pixelblaze_pb32_managed',
    address: '10.0.0.5',
    name: 'Managed Controller',
  })
  const provider = created.get('10.0.0.5')!
  provider.programs = [{ id: 'SHOW0002', name: 'Installed wall' }]
  return provider
}

function squareMapAt(pixelCount: number): number[][] {
  return bakeMapSource(stockMapSpec('plane')!.source, pixelCount).points
}

function markInstalledMapLoading(): void {
  useControllerStore.setState((state) => ({
    controllers: {
      ...state.controllers,
      '10.0.0.5': { ...state.controllers['10.0.0.5'], installedMap: { status: 'loading' } },
    },
  }))
}

async function connectManagedController(): Promise<FakeProvider> {
  await store().addController({
    id: 'pixelblaze_pb32_managed',
    address: '10.0.0.5',
    name: 'Managed Controller',
  })
  const provider = created.get('10.0.0.5')!
  provider.programs = [{ id: 'SHOW0001', name: 'Portable arena' }]
  return provider
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

describe('managed Controller reconciliation ownership (#1268)', () => {
  const ip = '10.0.0.5'
  const deviceId = 'pixelblaze_pb32_managed'
  const profileId = 'profile-1'
  const profile = defaultControllerProfile({ id: profileId, deviceId, ip })
  const timeout = () => new ControllerRequestTimeoutError('Controller reply overdue')
  const debounce = 600
  const retryDelay = 10_000
  const refresh = vi.fn<(controllerIp?: string) => Promise<boolean>>(async () => true)
  const reread = vi.fn<(controllerIp: string) => Promise<void>>(async () => {})
  const source = (factor: number) =>
    `export function render(index) { hsv(index * ${factor}, 1, 1) }`

  function author(first: number, second: number) {
    usePatternStore.setState({
      userPatterns: [first, second].map((factor, index) => ({
        id: `pat-${index + 1}`,
        name: `Managed ${index + 1}`,
        src: source(factor),
        controls: {},
        updatedAt: 1,
      })),
      patternsLoaded: true,
    })
  }

  async function fixture() {
    setControllerProfiles([])
    await store().addController({ id: deviceId, address: ip, name: 'Test Controller' })
    setControllerProfiles([profile])
    author(11, 12)
    const fake = created.get(ip)!
    fake.programs = [
      { id: 'MANAGED1', name: 'Managed 1' },
      { id: 'MANAGED2', name: 'Managed 2' },
    ]
    await setControllerBindings({ [ip]: { 'pat-1': 'MANAGED1', 'pat-2': 'MANAGED2' } })
    await setPushRecords({
      [ip]: Object.fromEntries(fake.programs.map((program, index) => [`pat-${index + 1}`, {
        name: program.name,
        profileSignature: 'outdated',
        artifactHash: 'outdated',
        stampedAt: '2026-11-23T00:00:00.000Z',
        transforms: [],
      }])),
    })
    return fake
  }

  const state = () => store().controllerReconciliations[profileId]
  const writesFor = (fake: FakeProvider, id: string) => fake.saved
    .filter(({ opts }) => opts.id === id)
    .map(({ blob }) => decodePbp(blob)?.sourceCode)

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(100_000)
    const original = useControllerPanelStore.getState()
    refresh.mockClear()
    reread.mockClear()
    useControllerPanelStore.setState({
      seed: () => {},
      refreshPrograms: refresh,
      rereadAfterFailedWrite: reread,
    })
    onTestFinished(() => {
      useControllerPanelStore.setState({
        seed: original.seed,
        refreshPrograms: original.refreshPrograms,
        rereadAfterFailedWrite: original.rereadAfterFailedWrite,
      })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function holdSecondJob() {
    const requested = deferred<void>()
    const secondJobProfile = deferred<ControllerProfile[]>()
    let reads = 0
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'hold-reconciliation-profile',
      listShowDocumentsV2: async () => [],
      async listControllerProfiles() {
        if (++reads !== 3) return [profile]
        requested.resolve()
        return secondJobProfile.promise
      },
    })
    return { requested, secondJobProfile }
  }

  it('uses the last of two durable edits in one pending run and writes nothing on a repeat', async () => {
    const fake = await fixture()
    let durable = profile
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'rewrite-rapid-profile-edits',
      listControllerProfiles: async () => [durable],
      listShowDocumentsV2: async () => [],
      updateControllerProfile: async (_id, changes) => { durable = { ...durable, ...changes } },
    })
    const config = vi.spyOn(fake, 'getConfig')
    const profiles = useControllerProfileStore.getState()
    await profiles.loadProfiles()
    const setCap = (maxDuty: number) => profiles.updateProfile(profileId, {
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.type === 'power-cap' ? { ...transform, enabled: true, maxDuty } : transform),
    })
    await setCap(0.4)
    await setCap(0.6)
    expect(fake.saved).toEqual([])

    await vi.advanceTimersByTimeAsync(debounce)
    expect(config).toHaveBeenCalledTimes(1)
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
    for (const [index, { blob }] of fake.saved.entries()) {
      const src = source(11 + index)
      const expected = bundleWithPasses(src, {}, controllerProfilePassRecipe(durable, src, `pat-${index + 1}`)).code
      expect(stripPxlblzBanner(decodePbp(blob)!.sourceCode)).toBe(expected)
    }

    await store().reconcileControllerProfile(profileId)
    expect(fake.saved).toHaveLength(2)
  })

  it.each([true, false, undefined])('rewrites on connect with legacy flag %s', async (legacy) => {
    const fake = await fixture()
    await store().removeController(ip)
    const stored = { ...profile, ...(legacy === undefined ? {} : { keepPatternsUpToDate: legacy }) }
    setControllerProfiles([stored])
    setControllerProviderFactory(() => fake)
    await store().addController({ id: deviceId, address: ip, name: 'Test Controller' })
    await vi.advanceTimersByTimeAsync(debounce)

    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
    expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
  })

  it('writes old captured jobs before the coalesced pass writes the latest authored source', async () => {
    const fake = await fixture()
    const { requested, secondJobProfile } = holdSecondJob()
    const first = store().reconcileControllerProfile(profileId)
    await requested.promise
    author(21, 22)

    store().scheduleControllerReconciliation(profileId)
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(600)
    const writesWhilePaused = fake.saved.map(({ opts }) => opts.id)

    secondJobProfile.resolve([profile])
    await first
    await vi.advanceTimersByTimeAsync(600)
    expect(writesWhilePaused).toEqual(['MANAGED1'])
    expect(writesFor(fake, 'MANAGED1')).toEqual([
      expect.stringContaining('index * 11'), expect.stringContaining('index * 21'),
    ])
    expect(writesFor(fake, 'MANAGED2')).toEqual([
      expect.stringContaining('index * 12'), expect.stringContaining('index * 22'),
    ])
    expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
  })

  it.each([false, true])('preserves a newer foreground Save when activation fails = %s', async (fails) => {
    const fake = await fixture()
    const { requested, secondJobProfile } = holdSecondJob()
    const reconciliation = store().reconcileControllerProfile(profileId)
    await requested.promise
    usePatternStore.setState({ activePatternId: 'pat-2' })
    useEditorStore.setState({ previewSource: source(22), previewPatternName: 'Managed 2' })
    store().setSaveArmed(true)
    if (fails) fake.pushBytecodeError = new Error('activation failed')
    await store().pushActivePattern()
    expect(store().pushResult?.ok).toBe(!fails)

    secondJobProfile.resolve([profile])
    await reconciliation
    expect(writesFor(fake, 'MANAGED2')).toEqual([expect.stringContaining('index * 22')])
    expect(state()).toMatchObject({
      phase: 'pending',
      completedCount: 1,
      programs: [expect.objectContaining({ state: 'current' }), expect.objectContaining({ state: 'queued' })],
    })
  })

  it('does not change a running or completed row on a failed trailing profile read', async () => {
    const fake = await fixture()
    fake.programs.splice(1)
    const entered = deferred<void>()
    const reply = deferred<void>()
    const save = fake.saveProgram.bind(fake)
    fake.saveProgram = async (...args) => {
      entered.resolve()
      await reply.promise
      return save(...args)
    }
    const first = store().reconcileControllerProfile(profileId)
    await entered.promise
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'profile-outage',
      listControllerProfiles: async () => { throw new Error('profile read unavailable') },
    })
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(debounce)
    expect(state()).toMatchObject({ phase: 'running', completedCount: 0 })
    reply.resolve()
    await first
    await vi.advanceTimersByTimeAsync(debounce)
    expect(state()).toMatchObject({
      phase: 'current',
      completedCount: 1,
      programs: [expect.objectContaining({ programId: 'MANAGED1', state: 'current' })],
    })
    expect(writesFor(fake, 'MANAGED1')).toHaveLength(1)
  })

  it.each([deviceId, undefined])('serializes profile aliases through the same Controller (device ID %s)', async (aliasId) => {
    const fake = await fixture()
    const alias = { ...profile, id: 'alias', deviceId: aliasId }
    setControllerProfiles([profile, alias])
    const entered = deferred<void>()
    const reply = deferred<ProgramListEntry[]>()
    const list = vi.spyOn(fake, 'listPrograms').mockImplementationOnce(() => {
      entered.resolve()
      return reply.promise
    })
    const first = store().reconcileControllerProfile(profileId)
    await entered.promise
    const second = store().reconcileControllerProfile(alias.id)
    await vi.advanceTimersByTimeAsync(0)
    const readsWhileHeld = list.mock.calls.length
    reply.resolve(fake.programs)
    await Promise.all([first, second])
    expect(readsWhileHeld).toBe(1)
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
    expect(store().controllerReconciliations[alias.id]?.phase).toBe('current')
  })

  it('coalesces Retry and repeated background triggers behind a held Save', async () => {
    const fake = await fixture()
    fake.programs.splice(1)
    const config = vi.spyOn(fake, 'getConfig')
    const entered = deferred<void>()
    const reply = deferred<void>()
    const save = fake.saveProgram.bind(fake)
    vi.spyOn(fake, 'saveProgram').mockImplementationOnce(async (...args) => {
      entered.resolve()
      await reply.promise
      return save(...args)
    })
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(debounce)
    await entered.promise
    author(21, 22)
    store().scheduleControllerReconciliation(profileId)
    const retry = store().reconcileControllerProfile(profileId)
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(debounce)
    expect(config).toHaveBeenCalledTimes(1)
    reply.resolve()
    await retry
    expect(config).toHaveBeenCalledTimes(2)
    expect(writesFor(fake, 'MANAGED1')).toEqual([
      expect.stringContaining('index * 11'), expect.stringContaining('index * 21'),
    ])
  })

  it('holds admission through the first profile read and releases it after a planning error', async () => {
    const fake = await fixture()
    const profilesComeBack = deferred<ControllerProfile[]>()
    let profileReads = 0
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'hold-first-profile-read',
      listControllerProfiles: async () => ++profileReads === 1 ? profilesComeBack.promise : [profile],
      listShowDocumentsV2: async () => [],
    })
    const list = vi.spyOn(fake, 'listPrograms').mockRejectedValueOnce(new Error('ordinary planning error'))
    const first = store().reconcileControllerProfile(profileId)
    const failed = expect(first).rejects.toThrow('ordinary planning error')
    await vi.advanceTimersByTimeAsync(0)
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(debounce)
    expect(list).not.toHaveBeenCalled()
    expect(profileReads).toBe(1)
    profilesComeBack.resolve([profile])
    await failed
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
    expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
  })

  it('protects a foreground Save whose activation is still pending when the pass starts', async () => {
    const fake = await fixture()
    const activation = deferred<void>()
    const entered = deferred<void>()
    fake.pushBytecode = () => {
      entered.resolve()
      return activation.promise
    }
    usePatternStore.setState({ activePatternId: 'pat-1' })
    useEditorStore.setState({ previewSource: source(21), previewPatternName: 'Managed 1' })
    store().setSaveArmed(true)
    const foreground = store().pushActivePattern()
    await entered.promise
    const reconciliation = store().reconcileControllerProfile(profileId)
    await vi.advanceTimersByTimeAsync(0)
    activation.reject(new Error('activation failed after Save'))
    await Promise.all([foreground, reconciliation])
    expect(writesFor(fake, 'MANAGED1')).toEqual([expect.stringContaining('index * 21')])
    expect(writesFor(fake, 'MANAGED2')).toEqual([expect.stringContaining('index * 12')])
    expect(state()).toMatchObject({ phase: 'pending', completedCount: 1 })
  })

  it('stops a captured job when the Controller session changes during compilation', async () => {
    const fake = await fixture()
    const compiled = deferred<Uint8Array>()
    const entered = deferred<void>()
    vi.spyOn(fake, 'compile').mockImplementationOnce(() => {
      entered.resolve()
      return compiled.promise
    })
    const reconciliation = store().reconcileControllerProfile(profileId)
    await entered.promise
    useControllerStore.setState((state) => ({
      controllers: {
        ...state.controllers,
        [ip]: { ...state.controllers[ip], liveEpoch: (state.controllers[ip].liveEpoch ?? 0) + 1 },
      },
    }))
    compiled.resolve(makeReconcilingBytecode())
    await reconciliation
    expect(fake.saved).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
    expect(state()).toMatchObject({ phase: 'pending', completedCount: 0 })
  })

  it('stops at the first job timeout, retries exactly once, then waits for manual Retry', async () => {
    const fake = await fixture()
    const save = vi.spyOn(fake, 'saveProgram')
      .mockRejectedValueOnce(new Error('wrapped request', { cause: timeout() }))
      .mockRejectedValueOnce(timeout())
    const start = Date.now()
    await store().reconcileControllerProfile(profileId)
    expect(save).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(state()).toMatchObject({
      phase: 'not-responding',
      retryAt: start + retryDelay,
      completedCount: 0,
      programs: [expect.objectContaining({ state: 'queued' }), expect.objectContaining({ state: 'queued' })],
    })

    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(retryDelay - 1)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(2)
    expect(state().retryAt).toBeUndefined()
    expect(state().phase).toBe('not-responding')
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(retryDelay * 2)
    expect(save).toHaveBeenCalledTimes(2)
    expect(refresh).not.toHaveBeenCalled()

    await Promise.all([
      store().reconcileControllerProfile(profileId), store().reconcileControllerProfile(profileId),
    ])
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
    expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('leaves an unconfirmed Save pending and re-pushes it on the next reconciliation', async () => {
    const fake = await fixture()
    const previousRecords = await getPushRecords()
    const entered = deferred<void>()
    const completion = deferred<'unconfirmed'>()
    const save = fake.saveProgram.bind(fake)
    vi.spyOn(fake, 'saveProgram').mockImplementationOnce(async (...args) => {
      await save(...args)
      entered.resolve()
      return completion.promise
    })
    const reconciliation = store().reconcileControllerProfile(profileId)
    await entered.promise
    expect(await getPushRecords()).toEqual(previousRecords)
    expect(state()).toMatchObject({ phase: 'running', completedCount: 0 })

    completion.resolve('unconfirmed')
    await reconciliation
    expect(await getPushRecords()).toEqual(previousRecords)
    expect(state()).toMatchObject({ phase: 'pending', completedCount: 0, retryAt: undefined })
    expect(state().programs.map(({ state }) => state)).toEqual(['queued', 'queued'])
    expect(reread).toHaveBeenCalledExactlyOnceWith(ip)
    expect(refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(retryDelay)
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1'])

    author(21, 12)
    await store().reconcileControllerProfile(profileId)
    expect(writesFor(fake, 'MANAGED1')).toEqual([
      expect.stringContaining('index * 11'), expect.stringContaining('index * 21'),
    ])
    expect(writesFor(fake, 'MANAGED2')).toEqual([expect.stringContaining('index * 12')])
    expect((await getPushRecords())[ip]['pat-1'].artifactHash).not.toBe('outdated')
    expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
    await store().reconcileControllerProfile(profileId)
    expect(fake.saved).toHaveLength(3)
  })

  function deferSaveCompletion(fake: FakeProvider) {
    const entered = deferred<ControllerSaveOptions>()
    const completion = deferred<ControllerSaveResult>()
    const save = fake.saveProgram.bind(fake)
    vi.spyOn(fake, 'saveProgram').mockImplementationOnce(async (blob, opts) => {
      await save(blob, opts)
      entered.resolve(opts)
      return completion.promise
    })
    return { entered: entered.promise, completion }
  }

  it.each([true, false])('reconciles the store after a deferred production-relay reply of %s', async (positive) => {
    const fake = await fixture()
    const listeners = new Set<(message: RelayMessage) => void>()
    const emit = (message: RelayMessage) => queueMicrotask(() => listeners.forEach((listener) => listener(message)))
    let connId = ''
    let saveBursts = 0
    const transport: RelayTransport = {
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      post(message) {
        switch (message.type) {
          case 'detect':
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' })
            break
          case 'connect':
            connId = message.connId
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId })
            break
          case 'send':
            if ('binary' in message.payload) {
              const frame = base64ToBytes(message.payload.binary)
              if (frame[0] === MessageType.putSourceCode && (frame[1] & FrameFlag.last)) saveBursts += 1
            }
            break
        }
      },
    }
    const provider = new ExtensionControllerProvider({ transport, pingIntervalMs: 0, maxReconnectAttempts: 0 })
    const connecting = provider.connect({ address: ip, deviceId })
    await vi.advanceTimersByTimeAsync(500)
    await connecting
    onTestFinished(() => provider.disconnect())
    const entered = deferred<{ confirmation: Promise<ControllerSaveResult>; deadline: number }>()
    const save = fake.saveProgram.bind(fake)
    vi.spyOn(fake, 'saveProgram').mockImplementationOnce((blob, opts) => {
      void save(blob, opts)
      const confirmation = provider.saveProgram(blob, opts)
      const deadline = controllerSaveDeadlineMs(blob.byteLength + opts.id.length)
      entered.resolve({ confirmation, deadline })
      return confirmation
    })

    const prior = await getPushRecords()
    const pass = store().reconcileControllerProfile(profileId)
    const { confirmation, deadline } = await entered.promise
    await vi.advanceTimersByTimeAsync(deadline)
    await expect(confirmation).resolves.toBe('unconfirmed')
    await pass
    expect(saveBursts).toBe(1)
    expect(await getPushRecords()).toEqual(prior)
    expect(reread).toHaveBeenCalledExactlyOnceWith(ip)

    const persisted = deferred<void>()
    if (positive) {
      const metadata = getControllerMetadataStorage()
      const write = metadata.setPushRecords.bind(metadata)
      vi.spyOn(metadata, 'setPushRecords').mockImplementationOnce(async (records) => {
        await write(records)
        persisted.resolve()
      })
    }
    emit({
      source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId,
      payload: { text: JSON.stringify({ saveProgramSourceFile: positive }) },
    })
    await vi.advanceTimersByTimeAsync(0)
    if (positive) await Promise.race([persisted.promise, vi.advanceTimersByTimeAsync(0)])
    expect((await getPushRecords())[ip]['pat-1'].artifactHash).toBe(
      positive ? parsePxlblzBanner(writesFor(fake, 'MANAGED1')[0]!)?.hash : 'outdated',
    )
    await store().reconcileControllerProfile(profileId)
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(
      positive ? ['MANAGED1', 'MANAGED2'] : ['MANAGED1', 'MANAGED1', 'MANAGED2'],
    )
  })

  async function expireReconciliationSave(fake: FakeProvider) {
    const { entered, completion } = deferSaveCompletion(fake)
    const pass = store().reconcileControllerProfile(profileId)
    const save = await entered
    completion.resolve('unconfirmed')
    await pass
    return () => save.onLateConfirmation?.()
  }

  it('records a late Save and does not repeat it while reconciling the remaining jobs', async () => {
    const fake = await fixture()
    const prior = await getPushRecords()
    const acknowledge = await expireReconciliationSave(fake)
    expect(await getPushRecords()).toEqual(prior)
    expect(state()).toMatchObject({ phase: 'pending', completedCount: 0 })
    expect(reread).toHaveBeenCalledExactlyOnceWith(ip)

    // An unrelated record written after the Save started must survive the late merge.
    const unrelated = { ...prior[ip]['pat-2'], name: 'Other Controller Pattern' }
    await setPushRecords({ ...prior, '10.0.0.9': { other: unrelated } })
    const request = deferred<void>()
    const release = deferred<void>()
    const metadata = getControllerMetadataStorage()
    const saveRecords = metadata.setPushRecords.bind(metadata)
    vi.spyOn(metadata, 'setPushRecords').mockImplementationOnce(async (records) => {
      request.resolve()
      await release.promise
      await saveRecords(records)
    })
    acknowledge()
    const nextPass = store().reconcileControllerProfile(profileId)
    await Promise.race([request.promise, nextPass])
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1'])
    release.resolve()
    await nextPass

    const savedArtifact = writesFor(fake, 'MANAGED1')[0]!
    const stamp = parsePxlblzBanner(savedArtifact)!
    expect(await getPushRecords()).toMatchObject({
      [ip]: { 'pat-1': {
        artifactHash: stamp.hash,
        sourceHash: artifactHash(source(11)),
        profileSignature: controllerProfileArtifactSignature(profile, 'pat-1', { mapDim: 2 }),
      } },
      '10.0.0.9': { other: unrelated },
    })
    expect(await getControllerBindings()).toEqual({ [ip]: { 'pat-1': 'MANAGED1', 'pat-2': 'MANAGED2' } })
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
    expect(state().phase).toBe('current')
  })

  it('skips a captured retry when its Save was confirmed during the push-record read', async () => {
    const fake = await fixture()
    const prior = await getPushRecords()
    const acknowledge = await expireReconciliationSave(fake)
    const entered = deferred<void>()
    const released = deferred<void>()
    vi.spyOn(getControllerMetadataStorage(), 'getPushRecords').mockImplementationOnce(async () => {
      entered.resolve()
      await released.promise
      return prior
    })
    const nextPass = store().reconcileControllerProfile(profileId)
    await entered.promise
    acknowledge()
    released.resolve()
    await nextPass
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
    expect(state().programs[0].state).toBe('current')
  })

  it('leaves an earlier Save pending after an authored edit instead of recording it late', async () => {
    const fake = await fixture()
    const prior = await getPushRecords()
    const acknowledge = await expireReconciliationSave(fake)
    author(21, 12)
    acknowledge()
    await vi.advanceTimersByTimeAsync(0)
    expect(await getPushRecords()).toEqual(prior)
    await store().reconcileControllerProfile(profileId)
    expect(writesFor(fake, 'MANAGED1')).toEqual([
      expect.stringContaining('index * 11'), expect.stringContaining('index * 21'),
    ])
  })

  it.each([false, true])('ignores a prior late Save across a live epoch change (during metadata read: %s)', async (duringRead) => {
    const fake = await fixture()
    const prior = await getPushRecords()
    const acknowledge = await expireReconciliationSave(fake)
    const entered = deferred<void>()
    const release = deferred<void>()
    if (duringRead) {
      vi.spyOn(getControllerMetadataStorage(), 'getPushRecords').mockImplementationOnce(async () => {
        entered.resolve()
        await release.promise
        return prior
      })
      acknowledge()
      const waiting = vi.fn()
      void entered.promise.then(waiting)
      await vi.advanceTimersByTimeAsync(0)
      expect(waiting).toHaveBeenCalledOnce()
    }
    useControllerStore.setState((s) => ({
      controllers: { ...s.controllers, [ip]: { ...s.controllers[ip], liveEpoch: 999 } },
    }))
    if (!duringRead) acknowledge()
    release.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(await getPushRecords()).toEqual(prior)
    expect(state().programs[0].state).toBe('queued')
  })

  it('reads back the edit to a completed Pattern after a later job timed out', async () => {
    const fake = await fixture()
    const save = fake.saveProgram.bind(fake)
    vi.spyOn(fake, 'saveProgram')
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(timeout())
    await store().reconcileControllerProfile(profileId)
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1'])
    author(21, 22)
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(retryDelay)
    expect(writesFor(fake, 'MANAGED1')).toEqual([
      expect.stringContaining('index * 11'), expect.stringContaining('index * 21'),
    ])
    expect(writesFor(fake, 'MANAGED2')).toEqual([expect.stringContaining('index * 22')])
    expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
  })

  async function stallThenEditFirstPattern(fake: FakeProvider) {
    const save = fake.saveProgram.bind(fake)
    vi.spyOn(fake, 'saveProgram').mockImplementationOnce(save).mockRejectedValueOnce(timeout())
    await store().reconcileControllerProfile(profileId)
    expect(state()).toMatchObject({ phase: 'not-responding', completedCount: 1 })
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1'])
    author(21, 12)
  }

  it.each(['count', 'profile', 'library'] as const)(
    'replans stale Wrapper jobs without consuming unwritten edits (%s)', async (changed) => {
      const fake = await fixture()
      fake.pixelCount = 64
      const wrapped: ControllerProfile = {
        ...profile,
        lastKnownPixelCount: 64,
        globalTransforms: [...profile.globalTransforms, { id: 'slow-mo', type: 'slow-mo', enabled: true }],
      }
      setControllerProfiles([wrapped])
      await store().reconcileControllerProfile(profileId)
      const savedV1 = await getPushRecords()
      expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
      expect(savedV1[ip]['pat-1'].wrapperOutcome?.applied).toEqual(['slow-mo'])
      expect(savedV1[ip]['pat-2'].wrapperOutcome?.applied).toEqual(['slow-mo'])

      const listPrograms = fake.listPrograms.bind(fake)
      const listing = vi.spyOn(fake, 'listPrograms').mockRejectedValueOnce(timeout())
      await store().reconcileControllerProfile(profileId)
      expect(state().phase).toBe('not-responding')
      author(21, 22)

      const getConfig = fake.getConfig.bind(fake)
      const config = vi.spyOn(fake, 'getConfig')
        .mockImplementationOnce(getConfig)
        .mockImplementationOnce(() => {
          if (changed === 'count') fake.pixelCount = 65
          if (changed === 'profile') setControllerProfiles([{ ...wrapped, lastKnownPixelCount: 65 }])
          if (changed === 'library') {
            useLibraryStore.setState({
              userLibraries: [{ id: 'lib-1', name: 'Lights', src: 'function level() { return 1 }', updatedAt: 1 }],
            })
          }
          return getConfig()
        })
      const replanning = deferred<void>()
      const releasePlan = deferred<void>()
      listing.mockImplementationOnce(listPrograms).mockImplementationOnce(async () => {
        replanning.resolve()
        await releasePlan.promise
        return listPrograms()
      })

      const recheck = store().reconcileControllerProfile(profileId)
      await replanning.promise
      const readsBeforeReplan = config.mock.calls.length
      const writesBeforeReplan = fake.saved.length
      const recordsBeforeReplan = await getPushRecords()
      releasePlan.resolve()
      await recheck

      expect(recordsBeforeReplan).toEqual(savedV1)
      expect(writesBeforeReplan).toBe(2)
      expect.soft(readsBeforeReplan).toBe(2)
      const savedV2 = await getPushRecords()
      for (const [index, id] of ['MANAGED1', 'MANAGED2'].entries()) {
        const writes = writesFor(fake, id)
        expect.soft(writes).toEqual([
          expect.stringContaining(`index * ${11 + index}`),
          expect.stringContaining(`index * ${21 + index}`),
        ])
        expect(writes[writes.length - 1]).toContain('export function sliderSlowMo')
        expect.soft(savedV2[ip][`pat-${index + 1}`]).toMatchObject({
          sourceHash: artifactHash(source(21 + index)),
          wrapperProgramId: id,
          wrapperPixelCount: changed === 'count' ? 65 : 64,
        })
      }
      expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
    },
  )

  it('retries an unconfirmed source-only reconciliation Save after the stall has cleared', async () => {
    const fake = await fixture()
    await stallThenEditFirstPattern(fake)
    const firstRecord = (await getPushRecords())[ip]['pat-1']
    const save = fake.saveProgram.bind(fake)
    vi.spyOn(fake, 'saveProgram').mockImplementationOnce(async (...args) => {
      await save(...args)
      return 'unconfirmed'
    })

    await store().reconcileControllerProfile(profileId)
    expect(state()).toMatchObject({ phase: 'pending', retryAt: undefined })
    expect((await getPushRecords())[ip]['pat-1']).toEqual(firstRecord)

    await store().reconcileControllerProfile(profileId)
    expect(writesFor(fake, 'MANAGED1')).toEqual([
      expect.stringContaining('index * 11'),
      expect.stringContaining('index * 21'),
      expect.stringContaining('index * 21'),
    ])
    expect((await getPushRecords())[ip]['pat-1'].sourceHash).not.toBe(firstRecord.sourceHash)
    expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
  })

  it('saves the edit on manual Retry after interrupted automatic recovery', async () => {
    const fake = await fixture()
    await stallThenEditFirstPattern(fake)
    const compiled = deferred<Uint8Array>()
    const compile = vi.spyOn(fake, 'compile').mockImplementationOnce(() => compiled.promise)

    await vi.advanceTimersByTimeAsync(retryDelay)
    expect(compile).toHaveBeenCalledTimes(1)
    expect(state()).toMatchObject({
      phase: 'running',
      programs: expect.arrayContaining([expect.objectContaining({ programId: 'MANAGED1', state: 'updating' })]),
    })
    useControllerStore.setState((state) => ({
      controllers: {
        ...state.controllers,
        [ip]: { ...state.controllers[ip], liveEpoch: (state.controllers[ip].liveEpoch ?? 0) + 1 },
      },
    }))
    compiled.resolve(makeReconcilingBytecode())
    await vi.advanceTimersByTimeAsync(0)
    expect(state()).toMatchObject({ phase: 'not-responding', retryAt: undefined })
    expect(writesFor(fake, 'MANAGED1')).toEqual([expect.stringContaining('index * 11')])

    await store().reconcileControllerProfile(profileId)
    expect(writesFor(fake, 'MANAGED1')).toEqual([
      expect.stringContaining('index * 11'), expect.stringContaining('index * 21'),
    ])
    expect(writesFor(fake, 'MANAGED2')).toEqual([expect.stringContaining('index * 12')])
    expect(state()).toMatchObject({
      phase: 'current',
      completedCount: 2,
      programs: expect.arrayContaining([
        expect.objectContaining({ programId: 'MANAGED1', state: 'current' }),
        expect.objectContaining({ programId: 'MANAGED2', state: 'current' }),
      ]),
    })
  })

  it('saves the pending edit after an alias pass during a stall', async () => {
    const fake = await fixture()
    const alias = { ...profile, id: 'alias', deviceId: undefined }
    setControllerProfiles([profile, alias])
    await stallThenEditFirstPattern(fake)
    const retryAt = state().retryAt

    await store().reconcileControllerProfile(alias.id)
    expect(store().controllerReconciliations[alias.id]).toMatchObject({ phase: 'current', completedCount: 2 })
    expect(writesFor(fake, 'MANAGED1')).toEqual([expect.stringContaining('index * 11')])
    expect(writesFor(fake, 'MANAGED2')).toEqual([expect.stringContaining('index * 12')])
    expect(state()).toMatchObject({ phase: 'not-responding', retryAt })

    await vi.advanceTimersByTimeAsync(retryDelay)
    expect(writesFor(fake, 'MANAGED1')).toEqual([
      expect.stringContaining('index * 11'), expect.stringContaining('index * 21'),
    ])
    expect(writesFor(fake, 'MANAGED2')).toEqual([expect.stringContaining('index * 12')])
    expect(state()).toMatchObject({
      phase: 'current',
      completedCount: 2,
      programs: expect.arrayContaining([
        expect.objectContaining({ programId: 'MANAGED1', state: 'current' }),
        expect.objectContaining({ programId: 'MANAGED2', state: 'current' }),
      ]),
    })
  })

  it('keeps triggers received during an automatic retry suppressed after its success', async () => {
    const fake = await fixture()
    const config = vi.spyOn(fake, 'getConfig')
    vi.spyOn(fake, 'saveProgram').mockRejectedValueOnce(timeout())
    await store().reconcileControllerProfile(profileId)
    const held = deferred<ProgramListEntry[]>()
    vi.spyOn(fake, 'listPrograms').mockImplementationOnce(() => held.promise)
    await vi.advanceTimersByTimeAsync(retryDelay)
    expect(state().phase).toBe('running')
    store().scheduleControllerReconciliation(profileId)
    store().scheduleControllerReconciliation(profileId)
    held.resolve(fake.programs)
    await vi.advanceTimersByTimeAsync(debounce)
    expect(config).toHaveBeenCalledTimes(2)
    expect(state().phase).toBe('current')
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
  })

  it('leaves a replacement Controller untouched by a due retry from the previous Controller', async () => {
    const fake = await fixture()
    const config = vi.spyOn(fake, 'getConfig')
    vi.spyOn(fake, 'saveProgram').mockRejectedValueOnce(timeout())
    await store().reconcileControllerProfile(profileId)
    await vi.advanceTimersByTimeAsync(retryDelay - 100)
    const replacement = 'pixelblaze_pb32_replacement'
    setControllerProfiles([{ ...profile, deviceId: replacement }])
    useControllerStore.setState((state) => ({
      controllers: {
        ...state.controllers,
        [ip]: { ...state.controllers[ip], deviceId: replacement },
      },
    }))
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(100)
    expect(config).toHaveBeenCalledTimes(1)
    expect(fake.saved).toEqual([])
    expect(state().phase).toBe('pending')
    await vi.advanceTimersByTimeAsync(debounce - 100)
    expect(config).toHaveBeenCalledTimes(2)
    expect(state().phase).toBe('current')
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED1', 'MANAGED2'])
  })

  it.each(['listPrograms', 'getConfig'] as const)('stalls on a planning timeout from %s', async (read) => {
    const fake = await fixture()
    vi.spyOn(fake, read).mockRejectedValueOnce(timeout())
    await store().reconcileControllerProfile(profileId)
    expect(fake.saved).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
    expect(state()).toMatchObject({
      phase: 'not-responding',
      retryAt: Date.now() + retryDelay,
    })
  })

  it('keeps an unconfirmed activation on the saved-and-re-read path', async () => {
    const fake = await fixture()
    vi.spyOn(fake, 'getConfig').mockResolvedValue({ activeProgramId: 'MANAGED1' })
    fake.pushBytecodeError = new ControllerActivationTimeoutError('MANAGED1')
    await store().reconcileControllerProfile(profileId)
    expect(fake.saved.map(({ opts }) => opts.id)).toEqual(['MANAGED2', 'MANAGED1'])
    expect(state()).toMatchObject({ phase: 'current', completedCount: 2 })
    expect(reread).toHaveBeenCalledExactlyOnceWith(ip)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('consumes the automatic attempt on a profile outage, then clears for a removed profile', async () => {
    const fake = await fixture()
    vi.spyOn(fake, 'saveProgram').mockRejectedValueOnce(timeout())
    await store().reconcileControllerProfile(profileId)
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'profile-outage',
      listControllerProfiles: async () => { throw new Error('profile read unavailable') },
    })
    await vi.advanceTimersByTimeAsync(retryDelay)
    expect(state().phase).toBe('not-responding')
    expect(state().retryAt).toBeUndefined()
    expect(fake.saved).toEqual([])
    setControllerProfiles([])
    store().scheduleControllerReconciliation(profileId)
    await vi.advanceTimersByTimeAsync(debounce)
    expect(state()).toMatchObject({ phase: 'idle', programs: [] })
  })
})

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
  it('renames a matching live Controller device-first, confirms it, then persists device truth', async () => {
    const profile = defaultControllerProfile({
      id: 'profile-rename',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_rename',
      deviceName: 'Burner bag',
      ip: '10.0.0.5',
    })
    const updates: Array<{ id: string; changes: Record<string, unknown> }> = []
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'rename-test',
      updateControllerProfile: async (id, changes) => {
        updates.push({ id, changes })
      },
    })
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
    await store().addController({
      id: profile.deviceId!,
      address: '10.0.0.5',
      name: profile.name,
    })

    await store().renameControllerProfile(profile.id, 'Road case')

    const provider = created.get('10.0.0.5')!
    expect(provider.nameCommands).toEqual(['Road case'])
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      id: profile.id,
      changes: { name: 'Road case', lastKnownDeviceName: 'Road case' },
    })
    expect(store().controllers['10.0.0.5'].nickname).toBe('Road case')
    expect(store().lastConnectedNickname).toBe('Road case')
    expect(store().lastKnownControllerNames[profile.deviceId!]).toBe('Road case')
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      name: 'Road case',
      lastKnownDeviceName: 'Road case',
    })
  })

  it('refuses offline profiles and preserves every name when the device write fails', async () => {
    const profile = defaultControllerProfile({
      id: 'profile-rename',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_rename',
      deviceName: 'Burner bag',
      ip: '10.0.0.5',
    })
    const updateControllerProfile = vi.fn(async () => {})
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'rename-failure-test',
      updateControllerProfile,
    })
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })

    await expect(store().renameControllerProfile(profile.id, 'Road case'))
      .rejects.toThrow('Connect this Controller')

    await store().addController({
      id: profile.deviceId!,
      address: '10.0.0.5',
      name: profile.name,
    })
    const provider = created.get('10.0.0.5')!
    const previousLiveName = store().controllers['10.0.0.5'].nickname
    provider.setNameError = new Error('socket closed')

    await expect(store().renameControllerProfile(profile.id, 'Road case'))
      .rejects.toThrow('socket closed')
    expect(store().controllers['10.0.0.5'].nickname).toBe(previousLiveName)
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Burner bag')
    expect(updateControllerProfile).not.toHaveBeenCalled()
  })

  it('rejects unconfirmed and reconnected renames without changing the durable profile', async () => {
    const profile = defaultControllerProfile({
      id: 'profile-rename',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_rename',
      deviceName: 'Burner bag',
      ip: '10.0.0.5',
    })
    const updateControllerProfile = vi.fn(async () => {})
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'rename-confirmation-test',
      updateControllerProfile,
    })
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
    await store().addController({
      id: profile.deviceId!,
      address: '10.0.0.5',
      name: profile.name,
    })
    const provider = created.get('10.0.0.5')!
    provider.applyNameCommands = false
    await expect(store().renameControllerProfile(profile.id, 'Road case'))
      .rejects.toThrow('did not confirm')
    expect(updateControllerProfile).not.toHaveBeenCalled()

    provider.applyNameCommands = true
    const confirmation = deferred<ControllerConfig>()
    provider.getConfig = () => confirmation.promise
    const rename = store().renameControllerProfile(profile.id, 'Road case')
    await Promise.resolve()
    provider.emit({ kind: 'connecting', target: { address: '10.0.0.5' } })
    provider.emit({
      kind: 'connected',
      connectionGeneration: ++provider.connectionGeneration,
      controller: {
        id: profile.deviceId!,
        address: '10.0.0.5',
        deviceId: profile.deviceId!,
      },
    })
    confirmation.resolve({ name: 'Road case' })

    await expect(rename).rejects.toThrow('connection changed')
    expect(updateControllerProfile).not.toHaveBeenCalled()
    expect(useControllerProfileStore.getState().profiles[0].name).toBe('Burner bag')
  })

  it('does not rename hardware when its profile is removed while the write is queued', async () => {
    const profile = defaultControllerProfile({
      id: 'profile-rename',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_rename',
      deviceName: 'Burner bag',
      ip: '10.0.0.5',
    })
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
    await store().addController({
      id: profile.deviceId!,
      address: '10.0.0.5',
      name: profile.name,
    })
    const blocker = deferred<void>()
    const existingWrite = queueControllerDeviceWrite('10.0.0.5', () => blocker.promise)
    const rename = store().renameControllerProfile(profile.id, 'Road case')

    useControllerProfileStore.setState({ profiles: [] })
    blocker.resolve()
    await existingWrite

    await expect(rename).rejects.toThrow('profile changed')
    expect(created.get('10.0.0.5')!.nameCommands).toEqual([])
  })

  it('reconciles only managed saved Patterns and never writes foreign programs', async () => {
    const profile = {
      ...defaultControllerProfile({
        id: 'profile-1',
        deviceId: 'pixelblaze_pb32_managed',
        ip: '10.0.0.5',
      }),
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

  it('reconciles a saved v2 Show and counts it as managed once current (#1129)', async () => {
    const profile = { ...managedShowProfile(), lastKnownPixelCount: 1_024 }
    const record = portableShowV2()
    setControllerProfiles([profile], [record])
    await bindManagedShow('old-signature')
    const provider = await connectManagedController()

    await store().reconcileControllerProfile('profile-1')

    const signature = controllerProfileArtifactSignature(profile, 'show:show-portable', { mapDim: 2 })
    const delivery = prepareShowV2ControllerDelivery({
      record,
      dependencies: { patterns: [], libraries: [], maps: [], profiles: [profile], stageMap: null },
      targetPixelCount: 1_024,
      controller: { mapDim: 2, firmwareVersion: undefined, compatibility: { pixelCount: 1_024 } },
    })
    if (delivery.status !== 'ready') throw new Error(`fixture refused: ${delivery.message}`)
    expect(provider.saved.map((write) => write.opts.id)).toEqual(['SHOW0001'])
    expect(provider.compiledSources).toHaveLength(1)
    expect(provider.compiledSources[0]).toContain(delivery.source)
    expect((await getPushRecords())['10.0.0.5']['show:show-portable']).toMatchObject({
      profileSignature: signature,
      name: 'Portable arena',
      showOutputContract: delivery.artifactStamp.showOutputContract,
    })
    expect(store().controllerReconciliations['profile-1']).toMatchObject({
      phase: 'current',
      managedCount: 1,
      unmanagedCount: 0,
    })

    provider.saved = []
    provider.compiledSources = []
    await store().reconcileControllerProfile('profile-1')

    expect(provider.saved).toEqual([])
    expect(provider.compiledSources).toEqual([])
    expect(store().controllerReconciliations['profile-1']).toMatchObject({
      phase: 'current',
      managedCount: 1,
      unmanagedCount: 0,
      completedCount: 1,
    })
  })

  it('excludes Portable v2 Shows from reconciliation when the Controller exceeds 2,000 pixels (#514, #1129)', async () => {
    setControllerProfiles([{ ...managedShowProfile(), lastKnownPixelCount: 2_001 }], [portableShowV2()])
    await bindManagedShow('old-signature')
    const provider = await connectManagedController()

    await store().reconcileControllerProfile('profile-1')

    expect(provider.saved).toEqual([])
    expect(provider.compiledSources).toEqual([])
  })

  it('skips an undeliverable v2 Show: not saved and not counted as managed (#1129)', async () => {
    const record = convertForTest(createShowWithOutputContract(
      'show-portable',
      'Portable arena',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      1,
    ))
    const layout = record.zoneLayouts.find((candidate) => !candidate.logical)!
    layout.zones = [{ ...layout.zones[0], ranges: [{ start: 0, end: 3 }] }]
    setControllerProfiles([{ ...managedShowProfile(), lastKnownPixelCount: 8 }], [record])
    await bindManagedShow('old-signature')
    const provider = await connectManagedController()

    await store().reconcileControllerProfile('profile-1')

    expect(provider.saved).toEqual([])
    expect(provider.compiledSources).toEqual([])
    expect(store().controllerReconciliations['profile-1']).toMatchObject({
      managedCount: 0,
      unmanagedCount: 1,
    })
  })

  it('never reconciles an Installation v2 Show, even when the installed map matches its required map (#1129)', async () => {
    setControllerProfiles([{ ...managedShowProfile(), lastKnownPixelCount: 8 }], [installationShowV2()])
    const provider = await connectInstallationController(squareMapAt(8))
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({
      status: 'present',
      fingerprint: mapFingerprintForPoints(squareMapAt(8)),
    })

    await store().reconcileControllerProfile('profile-1')

    expect(provider.saved).toEqual([])
    expect(provider.compiledSources).toEqual([])
    expect(store().controllerReconciliations['profile-1']).toMatchObject({
      managedCount: 0,
      unmanagedCount: 1,
    })
  })

  it('saves the Portable v2 Show and not the Installation v2 Show in one plan (#1129)', async () => {
    setControllerProfiles(
      [{ ...managedShowProfile(), lastKnownPixelCount: 8 }],
      [installationShowV2(), portableShowV2()],
    )
    const provider = await connectInstallationController(squareMapAt(8))
    await setControllerBindings({
      '10.0.0.5': { 'show:show-installation': 'SHOW0002', 'show:show-portable': 'SHOW0001' },
    })
    await setPushRecords({
      '10.0.0.5': {
        ...(await getPushRecords())['10.0.0.5'],
        'show:show-portable': {
          transforms: [],
          profileSignature: 'old-signature',
          artifactHash: 'old-hash',
          stampedAt: '2026-07-12T00:00:00.000Z',
          name: 'Portable arena',
        },
      },
    })
    provider.programs = [
      { id: 'SHOW0002', name: 'Installed wall' },
      { id: 'SHOW0001', name: 'Portable arena' },
    ]

    await store().reconcileControllerProfile('profile-1')

    expect(provider.saved.map((write) => write.opts.id)).toEqual(['SHOW0001'])
    expect(store().controllerReconciliations['profile-1']).toMatchObject({
      phase: 'current',
      managedCount: 1,
      unmanagedCount: 1,
    })
    expect(store().controllerReconciliations['profile-1'].programs.map((program) => program.programId))
      .toEqual(['SHOW0001'])
  })

  it('reconciles a Portable v2 Show while the installed map is still loading (#1129)', async () => {
    setControllerProfiles([{ ...managedShowProfile(), lastKnownPixelCount: 1_024 }], [portableShowV2()])
    await bindManagedShow('old-signature')
    const provider = await connectManagedController()
    markInstalledMapLoading()

    await store().reconcileControllerProfile('profile-1')

    expect(provider.saved.map((write) => write.opts.id)).toEqual(['SHOW0001'])
    expect(store().controllerReconciliations['profile-1']).toMatchObject({
      phase: 'current',
      managedCount: 1,
      unmanagedCount: 0,
    })
  })

  it('fails the reconciliation when the saved v2 Shows cannot be listed (#1129)', async () => {
    const profile = managedShowProfile()
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'controller-profile-test',
      listControllerProfiles: async () => [profile],
      listShowDocumentsV2: async () => { throw new Error('Show list unavailable') },
    })
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
    await bindManagedShow('old-signature')
    const bindings = { '10.0.0.5': { 'show:show-portable': 'SHOW0001', 'pat-1': 'MANAGED1' } }
    await setControllerBindings(bindings)
    const provider = await connectManagedController()
    provider.programs = [
      { id: 'SHOW0001', name: 'Portable arena' },
      { id: 'MANAGED1', name: 'Managed Pattern' },
    ]

    await expect(store().reconcileControllerProfile('profile-1')).rejects.toThrow('Show list unavailable')

    expect(provider.saved).toEqual([])
    expect(provider.compiledSources).toEqual([])
    // The pending state the connection scheduled is left as it was: no plan.
    expect(store().controllerReconciliations['profile-1']).toEqual({
      phase: 'pending',
      managedCount: 0,
      unmanagedCount: 0,
      completedCount: 0,
      programs: [],
    })
    expect(await getControllerBindings()).toEqual(bindings)
  })

  it('detectExtension records global extension presence', async () => {
    await store().detectExtension()
    expect(store().extensionPresent).toBe(true)
  })

  it('reports duplicate Helpers during startup and leaves the remembered Controller available for retry', async () => {
    vi.useFakeTimers()
    try {
      const posts: RelayMessage['type'][] = []
      const listeners = new Set<(message: RelayMessage) => void>()
      const transport: RelayTransport = {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        post(message) {
          posts.push(message.type)
          if (message.type !== 'detect') return
          const ack = () => listeners.forEach((listener) => {
            listener({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' })
          })
          queueMicrotask(ack)
          setTimeout(ack, 50)
        },
      }
      const ip = '10.0.0.5'
      setControllerProviderFactory(() => new ExtensionControllerProvider({ transport }))
      useControllerStore.setState({ lastConnectedIp: ip, lastConnectedNickname: 'Desk' })
      const startup = Promise.all([store().detectExtension(), store().autoConnect(), store().discover()])
      await vi.advanceTimersByTimeAsync(500)
      await startup
      expect(posts).toEqual(['detect'])
      expect(store()).toMatchObject({ extensionPresent: true, helperConflict: true, lastConnectedIp: ip })
      expect(store().controllers[ip]).toMatchObject({ phase: 'error', nickname: 'Desk' })
      expect(store().discovering).toBe(false)
    } finally {
      vi.useRealTimers()
    }
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

  it('does not let a stale connection bootstrap overwrite a confirmed rename', async () => {
    const mapRead = deferred<Uint8Array | null>()
    const profile = defaultControllerProfile({
      id: 'profile-bootstrap-rename',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_bootstrap',
      deviceName: 'Burner bag',
      ip: '10.0.0.5',
    })
    setControllerProviderFactory((ip) => {
      const provider = new FakeProvider()
      provider.name = 'Burner bag'
      provider.getPixelMapData = () => mapRead.promise
      created.set(ip, provider)
      return provider
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'bootstrap-rename-test',
      listControllerProfiles: async () => [profile],
      updateControllerProfile: async () => {},
    })
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })

    const connecting = store().addController({
      id: profile.deviceId!,
      address: '10.0.0.5',
      name: profile.name,
    })
    await vi.waitFor(() => expect(store().controllers['10.0.0.5']?.phase).toBe('live'))
    await store().renameControllerProfile(profile.id, 'Road case')
    mapRead.resolve(encodeMapData([[0], [1]]))
    await connecting

    expect(store().controllers['10.0.0.5'].nickname).toBe('Road case')
    expect(store().lastConnectedNickname).toBe('Road case')
    expect(store().lastKnownControllerNames[profile.deviceId!]).toBe('Road case')
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

  it('reuses a settled absent map for automatic readers but explicitly refreshes it', async () => {
    await store().addController('10.0.0.5')
    const provider = created.get('10.0.0.5')!
    const read = vi.spyOn(provider, 'getPixelMapData').mockResolvedValue(null)
    await store().refreshInstalledMap('10.0.0.5')
    const absent = store().controllers['10.0.0.5'].installedMap
    read.mockResolvedValue(encodeMapData([[0, 0], [1, 1]]))
    await store().refreshInstalledMap('10.0.0.5', { reuseObserved: true })
    expect(store().controllers['10.0.0.5'].installedMap).toBe(absent)
    expect(read).toHaveBeenCalledTimes(1)
    await store().refreshInstalledMap('10.0.0.5')
    expect(read).toHaveBeenCalledTimes(2)
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({ status: 'present', dimension: 2 })
  })

  it('shares pending automatic reads and keeps failed reads settled until an explicit retry', async () => {
    await store().addController('10.0.0.5')
    const provider = created.get('10.0.0.5')!
    const pending = deferred<Uint8Array | null>()
    const reads = vi.spyOn(provider, 'getPixelMapData').mockReturnValue(pending.promise)
    const fresh = store().refreshInstalledMap('10.0.0.5')
    const joining = store().refreshInstalledMap('10.0.0.5', { reuseObserved: true })
    await Promise.resolve()
    expect(reads).toHaveBeenCalledTimes(1)
    pending.reject(new Error('Network unavailable'))
    await Promise.all([fresh, joining])
    await store().refreshInstalledMap('10.0.0.5', { reuseObserved: true })
    expect(reads).toHaveBeenCalledTimes(1)
    expect(store().controllers['10.0.0.5'].installedMap).toEqual({ status: 'error', message: 'Network unavailable' })
    reads.mockResolvedValue(null)
    await store().refreshInstalledMap('10.0.0.5')
    expect(reads).toHaveBeenCalledTimes(2)
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({ status: 'absent' })
  })

  it('rereads a reconnected device and ignores an older connection response', async () => {
    await store().addController('10.0.0.5')
    const provider = created.get('10.0.0.5')!
    const oldRead = deferred<Uint8Array | null>()
    const reads = vi.spyOn(provider, 'getPixelMapData').mockReturnValueOnce(oldRead.promise).mockResolvedValue(null)
    const oldRefresh = store().refreshInstalledMap('10.0.0.5')
    await Promise.resolve()
    await provider.connect({ address: '10.0.0.5' })
    await store().refreshInstalledMap('10.0.0.5', { reuseObserved: true })
    const current = store().controllers['10.0.0.5'].installedMap
    oldRead.resolve(encodeMapData([[0, 0], [1, 1]]))
    await oldRefresh
    expect(reads).toHaveBeenCalledTimes(2)
    expect(current).toMatchObject({ status: 'absent' })
    expect(store().controllers['10.0.0.5'].installedMap).toBe(current)
  })

  it('lets post-push verification supersede a pending ordinary map read', async () => {
    await store().addController('10.0.0.5')
    const provider = created.get('10.0.0.5')!
    const oldRead = deferred<Uint8Array | null>()
    const reads = vi.spyOn(provider, 'getPixelMapData').mockReturnValueOnce(oldRead.promise)
      .mockResolvedValue(encodeMapData([[0, 0], [1, 1]]))
    const oldRefresh = store().refreshInstalledMap('10.0.0.5')
    await Promise.resolve()
    await store().refreshInstalledMap('10.0.0.5', { expectedFingerprint: '9a0c9e7f', reuseObserved: true })
    oldRead.resolve(null)
    await oldRefresh
    await store().refreshInstalledMap('10.0.0.5', { reuseObserved: true })
    expect(reads).toHaveBeenCalledTimes(2)
    expect(store().controllers['10.0.0.5'].installedMap).toMatchObject({ status: 'present', fingerprint: '9a0c9e7f' })
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

  it('schedules managed Pattern reconciliation when a Controller connects', async () => {
    const scheduled: string[] = []
    setControllerProfiles([{
      ...defaultControllerProfile({ id: 'profile-1', ip: '10.0.0.5', now: 1 }),
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

    // Repeating the same provider generation while live is only another
    // observation of the current connection.
    const provider = created.get('10.0.0.5')!
    const connected = provider.getStatus()
    if (connected.kind !== 'connected') throw new Error('Expected connected fixture')
    provider.emit({ ...connected, connectionGeneration: provider.connectionGeneration })
    expect(store().controllers['10.0.0.5'].liveEpoch).toBe(third)

    // A provider can then complete that obsolete generation after a replacement
    // has started. Its stale live observation gets an epoch because of the
    // pending gap; the replacement generation must mint another one even though
    // the stale completion already left the entry looking live (#851).
    provider.emit({ kind: 'connecting', target: { address: '10.0.0.5' } })
    provider.emit({ ...connected, connectionGeneration: provider.connectionGeneration })
    const staleCompletionEpoch = store().controllers['10.0.0.5'].liveEpoch!
    expect(staleCompletionEpoch).toBeGreaterThan(third)
    provider.emit({ ...connected, connectionGeneration: ++provider.connectionGeneration })
    const replacementEpoch = store().controllers['10.0.0.5'].liveEpoch!
    expect(replacementEpoch).toBeGreaterThan(staleCompletionEpoch)

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

  it('forgets deletion memos for exactly one Controller and Studio entity (#870)', () => {
    const memo = {
      '10.0.0.5': { 'pat-1': 'target', sibling: 'keep-a' },
      '10.0.0.6': { 'pat-1': 'keep-b' },
    }
    useControllerStore.setState({
      lastSavedSource: structuredClone(memo),
      lastSavedProfileSignature: structuredClone(memo),
      lastPushedSource: structuredClone(memo),
      lastPushedProfileSignature: structuredClone(memo),
      lastRunProgramId: structuredClone(memo),
    })

    store().forgetDeletedSavedProgram('10.0.0.5', 'pat-1')

    for (const field of [
      'lastSavedSource',
      'lastSavedProfileSignature',
      'lastPushedSource',
      'lastPushedProfileSignature',
      'lastRunProgramId',
    ] as const) {
      expect(store()[field]).toEqual({
        '10.0.0.5': { sibling: 'keep-a' },
        '10.0.0.6': { 'pat-1': 'keep-b' },
      })
    }
  })

  describe('pushActivePattern (#202)', () => {
    const PATTERN_SRC = 'export function render(index) {\n  hsv(index, 1, 1)\n}\n'
    const GENERATED_ARTIFACT_PRESSURE = {
      budgetBytes: 1_000_000,
      worstInstantRenderersPerPixel: 1,
    }

    const pricingArtifact = {
      artifactId: 'show:pricing', source: '// banner\n' + PATTERN_SRC,
      name: 'Pricing', persist: false, compilePressure: GENERATED_ARTIFACT_PRESSURE,
      artifactStamp: { kind: 'show' as const, id: 'pricing', name: 'Pricing' },
    }

    it('keeps exact compilation transient and falls back after a new live epoch', async () => {
      expect(store().lastShowArtifactCompilation).toBeNull()
      await store().addController('10.0.0.5')
      const provider = created.get('10.0.0.5')!
      await store().pushGeneratedArtifact(pricingArtifact)
      const sourceSha256 = await sha256CompleteCompileInput(provider.compiledSources[0])
      const measurement = store().lastShowArtifactCompilation
      const status = provider.getStatus()
      if (status.kind !== 'connected') throw new Error('Expected connected Controller')
      expect(measurement).toEqual({
        controllerId: status.controller.id,
        liveEpoch: store().controllers['10.0.0.5'].liveEpoch,
        sourceSha256, byteLength: provider.compileResult.byteLength,
      })
      expect(JSON.parse(localStorage.getItem('pixelblaze-controller')!).state)
        .not.toHaveProperty('lastShowArtifactCompilation')
      await provider.disconnect()
      await provider.connect({ address: '10.0.0.5' })
      expect(priceShowArtifact({ estimatedBytes: 100, sourceSha256, measurement,
        context: { controllerId: measurement!.controllerId,
          liveEpoch: store().controllers['10.0.0.5'].liveEpoch! },
      }).kind).toBe('estimate')
      useControllerStore.setState(controllerInitialState)
      expect(store().lastShowArtifactCompilation).toBeNull()
    })

    it.each(['reconnect', 'selection', 'reconnect-hash-failure'] as const)(
      'rejects a %s during hashing', async (change) => {
        await store().addController('10.0.0.5')
        const provider = created.get('10.0.0.5')!
        const started = deferred<void>()
        const digest = deferred<ArrayBuffer>()
        const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => {
          started.resolve()
          return digest.promise
        })
        try {
          const pushing = store().pushGeneratedArtifact(pricingArtifact)
          await started.promise
          if (change !== 'selection') {
            await provider.disconnect()
            await provider.connect({ address: '10.0.0.5' })
          } else {
            useControllerStore.setState({ activeIp: '10.0.0.6' })
          }
          if (change === 'reconnect-hash-failure') digest.reject(new Error('hash unavailable'))
          else digest.resolve(new Uint8Array(32).buffer)
          await pushing
          expect(store().lastShowArtifactCompilation).toBeNull()
          expect(provider.pushed).toHaveLength(0)
          expect(store().artifactPushResult).toMatchObject({
            ok: false, message: 'Controller session changed before Show delivery',
          })
        } finally { spy.mockRestore() }
      },
    )

    it('rejects a selection change during compilation without a prepared session', async () => {
      await store().addController('10.0.0.5')
      const provider = created.get('10.0.0.5')!
      provider.compile = async () => {
        useControllerStore.setState({ activeIp: '10.0.0.6' })
        return provider.compileResult
      }
      await store().pushGeneratedArtifact(pricingArtifact)
      expect(store().lastShowArtifactCompilation).toBeNull()
      expect(provider.pushed).toHaveLength(0)
      expect(store().artifactPushResult).toMatchObject({
        ok: false, message: 'Controller session changed before Show delivery',
      })
    })

    it('treats only a hash failure as advisory and clears the previous record before compilation', async () => {
      await store().addController('10.0.0.5')
      await store().pushGeneratedArtifact(pricingArtifact)
      expect(store().lastShowArtifactCompilation).not.toBeNull()
      const provider = created.get('10.0.0.5')!
      const originalCompile = provider.compile.bind(provider)
      provider.compile = (source) => {
        expect(store().lastShowArtifactCompilation).toBeNull()
        return originalCompile(source)
      }
      const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('hash unavailable'))
      try { await store().pushGeneratedArtifact(pricingArtifact) } finally { spy.mockRestore() }
      expect(store().lastShowArtifactCompilation).toBeNull()
      expect(store().artifactPushResult).toMatchObject({ ok: true })
      expect(provider.pushed).toHaveLength(2)
    })

    it('retains the compiled measurement when saving the upload fails', async () => {
      await store().addController('10.0.0.5')
      const provider = created.get('10.0.0.5')!
      provider.saveProgram = async () => { throw new Error('upload failed') }
      await store().pushGeneratedArtifact({ ...pricingArtifact, persist: true })
      expect(store().artifactPushResult).toMatchObject({ ok: false })
      expect(store().lastShowArtifactCompilation).toMatchObject({ byteLength: 16 })
    })

    describe('Controller re-read after a failed or unconfirmed Save (#1268)', () => {
      const IP = '10.0.0.5'
      const DEVICE_LIST = [{ id: 'DEVICE1', name: 'On Controller' }]
      const settle = async () => {
        for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
      }

      async function connectWithTruth() {
        await store().addController(IP)
        const provider = created.get(IP)!
        await settle()
        const reads = { list: 0, config: 0 }
        provider.programs = DEVICE_LIST
        const list = provider.listPrograms.bind(provider)
        provider.listPrograms = () => { reads.list += 1; return list() }
        provider.getConfig = () => {
          reads.config += 1
          return Promise.resolve({ name: provider.name, activeProgramId: 'DEVICE1' })
        }
        return { provider, reads }
      }

      function hold() {
        const gate = deferred<void>()
        const done = queueControllerDeviceWrite(IP, () => gate.promise)
        done.catch(() => {})
        return gate
      }

      const entryPoints = {
        pushActivePattern: async () => {
          usePatternStore.setState({ activePatternId: 'pat-1' })
          useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })
          store().setSaveArmed(true)
          await store().pushActivePattern()
          return store().pushResult
        },
        pushGeneratedArtifact: async () => {
          await store().pushGeneratedArtifact({ ...pricingArtifact, persist: true })
          return store().artifactPushResult
        },
      } as const

      describe.each(Object.keys(entryPoints) as Array<keyof typeof entryPoints>)('%s', (entry) => {
        it('leaves an unconfirmed Save ready to retry and re-reads after the queue drains', async () => {
          const { provider, reads } = await connectWithTruth()
          const previousRecords = await getPushRecords()
          const previousSource = store().lastSavedSource
          const previousSignature = store().lastSavedProfileSignature
          const started = deferred<void>()
          const completion = deferred<'unconfirmed'>()
          provider.saveProgram = async () => {
            started.resolve()
            return completion.promise
          }
          const push = entryPoints[entry]()
          await started.promise
          expect(store().pushing).toBe(true)
          expect(await getPushRecords()).toEqual(previousRecords)
          const nextWrite = hold()
          completion.resolve('unconfirmed')

          expect(await push).toBeNull()
          expect(store().pushing).toBe(false)
          expect(store().lastSavedSource).toEqual(previousSource)
          expect(store().lastSavedProfileSignature).toEqual(previousSignature)
          expect(await getPushRecords()).toEqual(previousRecords)
          expect(provider.pushed).toEqual([])
          const beforeReread = { ...reads }
          await settle()
          expect(reads).toEqual(beforeReread)

          nextWrite.resolve()
          await settle()
          expect(reads).toEqual({ list: beforeReread.list + 1, config: beforeReread.config + 1 })
          const panel = useControllerPanelStore.getState()
          expect(panel.activeProgramId).toBe('DEVICE1')
          expect(panel.programs).toEqual(DEVICE_LIST)
          expect(store().rendererStates[IP]?.assumedPlaying).not.toBe(true)
        })

        it('records a late flash confirmation without activating or re-reading again', async () => {
          const { provider } = await connectWithTruth()
          await setControllerBindings({ [IP]: { 'pat-1': 'DEVICE1' } })
          const started = deferred<ControllerSaveOptions>()
          provider.saveProgram = async (_blob, opts) => {
            started.resolve(opts)
            return 'unconfirmed'
          }
          const reread = vi.spyOn(useControllerPanelStore.getState(), 'rereadAfterFailedWrite').mockClear()
          await entryPoints[entry]()
          const opts = await started.promise
          expect(await getPushRecords()).toEqual({})
          const written = deferred<void>()
          const metadata = getControllerMetadataStorage()
          const writeRecords = metadata.setPushRecords.bind(metadata)
          vi.spyOn(metadata, 'setPushRecords').mockImplementationOnce(async (next) => {
            await writeRecords(next)
            written.resolve()
          })
          opts.onLateConfirmation?.()
          await Promise.race([written.promise, settle()])
          expect(Object.values((await getPushRecords())[IP] ?? {})).toHaveLength(1)
          expect(provider.pushed).toEqual([])
          expect(reread).toHaveBeenCalledExactlyOnceWith(IP)
        })

        it('ignores a late confirmation as soon as a newer Save for the same artifact starts', async () => {
          const { provider } = await connectWithTruth()
          const started = deferred<ControllerSaveOptions>()
          const latest = deferred<ControllerSaveResult>()
          vi.spyOn(provider, 'saveProgram')
            .mockImplementationOnce(async (_blob, opts) => {
              started.resolve(opts)
              return 'unconfirmed'
            })
            .mockImplementationOnce(() => latest.promise)
          await entryPoints[entry]()
          const opts = await started.promise
          const next = entryPoints[entry]()
          opts.onLateConfirmation?.()
          latest.resolve('unconfirmed')
          await next
          await settle()
          expect(await getPushRecords()).toEqual({})
        })

        if (entry === 'pushActivePattern') {
          it('does not accept a late confirmation after a raw edit and undo before preview changes', async () => {
            const { provider } = await connectWithTruth()
            useEditorStore.getState().setSource(PATTERN_SRC)
            const started = deferred<ControllerSaveOptions>()
            provider.saveProgram = async (_blob, opts) => {
              started.resolve(opts)
              return 'unconfirmed'
            }
            await entryPoints[entry]()
            const opts = await started.promise
            useEditorStore.getState().setEditedSource(PATTERN_SRC + '\n// edit')
            useEditorStore.getState().setEditedSource(PATTERN_SRC)
            opts.onLateConfirmation?.()
            await settle()
            expect(await getPushRecords()).toEqual({})
          })

          it('drops the prior late reply after switching Controllers away and back', async () => {
            const { provider } = await connectWithTruth()
            const started = deferred<ControllerSaveOptions>()
            provider.saveProgram = async (_blob, opts) => {
              started.resolve(opts)
              return 'unconfirmed'
            }
            await entryPoints[entry]()
            useControllerStore.setState({ activeIp: '10.0.0.9' })
            useControllerStore.setState({ activeIp: IP })
            const opts = await started.promise
            opts.onLateConfirmation?.()
            await settle()
            expect(await getPushRecords()).toEqual({})
          })
        }

        it('re-reads once, after the queue is idle, when the Save fails on the device', async () => {
          const { provider, reads } = await connectWithTruth()
          // A following write queues while the failing Save is still running.
          let after: ReturnType<typeof hold> | undefined
          provider.saveProgram = async () => {
            after = hold()
            throw new Error('upload failed')
          }
          const result = await entryPoints[entry]()
          expect(result).toMatchObject({ ok: false, message: 'upload failed' })

          const fromSettle = { ...reads }
          await settle()
          expect(reads).toEqual(fromSettle)

          after!.resolve()
          await settle()
          expect(reads).toEqual({ list: fromSettle.list + 1, config: fromSettle.config + 1 })
          const panel = useControllerPanelStore.getState()
          expect(panel.activeProgramId).toBe('DEVICE1')
          expect(panel.programs).toEqual(DEVICE_LIST)
          // The named failure survives the re-read.
          expect(entry === 'pushActivePattern' ? store().pushResult : store().artifactPushResult)
            .toMatchObject({ ok: false, message: 'upload failed' })
        })

        it('reports an activation deadline after a stored Save as saved and re-reads once', async () => {
          const { provider, reads } = await connectWithTruth()
          provider.pushBytecodeError = new ControllerActivationTimeoutError(
            'Controller program X did not activate within 15000ms (active program: DEVICE1)',
          )
          const start = { ...reads }

          const result = await entryPoints[entry]()
          await settle()

          expect(result).toMatchObject({ ok: true, created: true })
          expect(provider.saved).toHaveLength(1)
          // pushPattern's own list read, then exactly one re-read: no ordinary refresh.
          expect(reads).toEqual({ list: start.list + 2, config: start.config + 1 })
          expect(useControllerPanelStore.getState().activeProgramId).toBe('DEVICE1')
          expect(store().rendererStates[IP]?.assumedPlaying).not.toBe(true)
        })

        // Only a failure after pushPattern's first device write re-reads: a compiler
        // rejection or a failed read inside the queued Save left the Controller as
        // it was (#1268, lead ruling on B18 review).
        it.each([
          ['a compiler rejection', 0],
          ['a failed list read before any write', 0],
          ['a failed upload after the first write', 1],
        ] as const)('re-reads %s %i times', async (failure, rereads) => {
          const { provider } = await connectWithTruth()
          const reread = vi.fn(async () => {})
          const original = useControllerPanelStore.getState().rereadAfterFailedWrite
          onTestFinished(() => useControllerPanelStore.setState({ rereadAfterFailedWrite: original }))
          useControllerPanelStore.setState({ rereadAfterFailedWrite: reread })
          if (failure === 'a compiler rejection') provider.compileError = new Error('compile failed')
          else if (failure === 'a failed list read before any write') {
            provider.listPrograms = () => Promise.reject(new Error('list timed out'))
          } else provider.saveProgram = () => Promise.reject(new Error('upload failed'))

          const result = await entryPoints[entry]()
          await settle()

          expect(result).toMatchObject({ ok: false })
          expect(provider.compiledSources.length).toBeGreaterThan(0)
          expect(reread).toHaveBeenCalledTimes(rereads)
          if (rereads) expect(reread).toHaveBeenCalledWith(IP)
        })

        it('keeps the confirmed Save path: one ordinary list refresh and no re-read', async () => {
          const { provider, reads } = await connectWithTruth()
          const start = { ...reads }

          const result = await entryPoints[entry]()
          await settle()

          expect(result).toMatchObject({ ok: true, created: true })
          expect(reads).toEqual({ list: start.list + 2, config: start.config })
          expect(useControllerPanelStore.getState().activeProgramId).toBe(provider.saved[0].opts.id)
          expect(store().rendererStates[IP]?.assumedPlaying).toBe(true)
        })
      })

      it('does not re-read after a failure before any device write', async () => {
        const { reads } = await connectWithTruth()
        // Compile pressure blocks the Save before it reaches the device queue.
        const reread = vi.fn(async () => {})
        useControllerPanelStore.setState({ rereadAfterFailedWrite: reread })
        await store().pushGeneratedArtifact({
          ...pricingArtifact,
          persist: true,
          compilePressure: { budgetBytes: 1, worstInstantRenderersPerPixel: 1_000 },
        })
        await settle()
        expect(store().artifactPushResult).toMatchObject({ ok: false })
        expect(reread).not.toHaveBeenCalled()
        expect(reads.config).toBe(0)
      })
    })

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

    it('saves the same authored Pattern with Wrappers only on the Controller that enables them', async () => {
      const wrappedIp = '10.0.0.5'
      const plainIp = '10.0.0.6'
      const wrapped = defaultControllerProfile({ id: 'wrapped', ip: wrappedIp, now: 1 })
      wrapped.globalTransforms.push({ id: 'slow-mo', type: 'slow-mo', enabled: true })
      const plain = defaultControllerProfile({ id: 'plain', ip: plainIp, now: 1 })
      setControllerProfiles([wrapped, plain])
      setControllerProviderFactory((ip) => {
        const provider = new FakeProvider()
        provider.pixelMap = null
        if (ip === wrappedIp) provider.pixelCount = 64
        created.set(ip, provider)
        return provider
      })
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })
      store().setSaveArmed(true)

      await store().addController(wrappedIp)
      await store().pushActivePattern()
      expect(store().pushResult).toMatchObject({ ok: true })
      await store().addController(plainIp)
      await store().pushActivePattern()
      expect(store().pushResult).toMatchObject({ ok: true })

      const wrappedSave = created.get(wrappedIp)!.saved[0]
      const plainSave = created.get(plainIp)!.saved[0]
      expect(decodePbp(wrappedSave.blob)?.sourceCode).toContain('export function sliderSlowMo')
      expect(stripPxlblzBanner(decodePbp(plainSave.blob)!.sourceCode)).toBe(PATTERN_SRC)
      expect(useEditorStore.getState().previewSource).toBe(PATTERN_SRC)
      const pushRecords = await getPushRecords()
      expect(pushRecords[wrappedIp]['pat-1']).toMatchObject({
        wrapperProgramId: wrappedSave.opts.id,
        wrapperOutcome: { applied: ['slow-mo'], skipped: {} },
      })
      expect(pushRecords[plainIp]['pat-1']).toMatchObject({
        wrapperProgramId: plainSave.opts.id,
        wrapperOutcome: { applied: [], skipped: {} },
      })
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

    it('aborts a generated Show when its Controller session changes during device compilation (#851)', async () => {
      await store().addController('10.0.0.5')
      const provider = created.get('10.0.0.5')!
      const expectedControllerStatus = getControllerProvider().getStatus()
      if (expectedControllerStatus.kind !== 'connected') {
        throw new Error('Expected a connected Controller fixture')
      }
      provider.compile = async (source: string) => {
        provider.compiledSources.push(source)
        await provider.disconnect()
        return provider.compileResult
      }
      const source = stampArtifact(PATTERN_SRC, {
        kind: 'show',
        id: 'show-session-race',
        name: 'Session Race',
        transforms: ['show'],
        stampedAt: '2026-08-13T18:00:00.000Z',
      })

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-session-race',
        source,
        name: 'Session Race',
        persist: false,
        compilePressure: GENERATED_ARTIFACT_PRESSURE,
        artifactStamp: {
          kind: 'show',
          id: 'show-session-race',
          name: 'Session Race',
          transforms: ['show'],
          stampedAt: '2026-08-13T18:00:00.000Z',
        },
        expectedControllerSession: {
          id: expectedControllerStatus.controller.id,
          address: expectedControllerStatus.controller.address,
          liveEpoch: store().controllers['10.0.0.5'].liveEpoch ?? 0,
        },
      })

      expect(provider.pushed).toHaveLength(0)
      expect(provider.saved).toHaveLength(0)
      expect(store().lastShowArtifactCompilation).toBeNull()
      expect(store().artifactPushResult).toEqual({
        ok: false,
        message: 'Controller session changed before Show delivery',
        artifactId: 'show:show-session-race',
        mode: 'run',
      })
    })

    it('continues a generated Show when status refreshes for the same Controller (#851)', async () => {
      await store().addController('10.0.0.5')
      const provider = created.get('10.0.0.5')!
      const expectedControllerStatus = getControllerProvider().getStatus()
      if (expectedControllerStatus.kind !== 'connected') {
        throw new Error('Expected a connected Controller fixture')
      }
      provider.compile = async (source: string) => {
        provider.compiledSources.push(source)
        provider.status = {
          kind: 'connected',
          controller: { ...expectedControllerStatus.controller },
        }
        return provider.compileResult
      }
      const source = stampArtifact(PATTERN_SRC, {
        kind: 'show',
        id: 'show-session-refresh',
        name: 'Session Refresh',
        transforms: ['show'],
        stampedAt: '2026-08-13T18:00:00.000Z',
      })

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-session-refresh',
        source,
        name: 'Session Refresh',
        persist: false,
        compilePressure: GENERATED_ARTIFACT_PRESSURE,
        artifactStamp: {
          kind: 'show',
          id: 'show-session-refresh',
          name: 'Session Refresh',
          transforms: ['show'],
          stampedAt: '2026-08-13T18:00:00.000Z',
        },
        expectedControllerSession: {
          id: expectedControllerStatus.controller.id,
          address: expectedControllerStatus.controller.address,
          liveEpoch: store().controllers['10.0.0.5'].liveEpoch ?? 0,
        },
      })

      expect(provider.pushed).toHaveLength(1)
      expect(store().artifactPushResult).toEqual(expect.objectContaining({
        ok: true,
        artifactId: 'show:show-session-refresh',
        mode: 'run',
      }))
    })

    it('aborts a generated Show after a same-address Controller reconnect (#851)', async () => {
      await store().addController('10.0.0.5')
      const provider = created.get('10.0.0.5')!
      const expectedControllerStatus = getControllerProvider().getStatus()
      if (expectedControllerStatus.kind !== 'connected') {
        throw new Error('Expected a connected Controller fixture')
      }
      provider.compile = async (source: string) => {
        provider.compiledSources.push(source)
        await provider.disconnect()
        await provider.connect({ address: '10.0.0.5' })
        return provider.compileResult
      }
      const source = stampArtifact(PATTERN_SRC, {
        kind: 'show',
        id: 'show-session-reconnect',
        name: 'Session Reconnect',
        transforms: ['show'],
        stampedAt: '2026-08-13T18:00:00.000Z',
      })

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-session-reconnect',
        source,
        name: 'Session Reconnect',
        persist: false,
        compilePressure: GENERATED_ARTIFACT_PRESSURE,
        artifactStamp: {
          kind: 'show',
          id: 'show-session-reconnect',
          name: 'Session Reconnect',
          transforms: ['show'],
          stampedAt: '2026-08-13T18:00:00.000Z',
        },
        expectedControllerSession: {
          id: expectedControllerStatus.controller.id,
          address: expectedControllerStatus.controller.address,
          liveEpoch: store().controllers['10.0.0.5'].liveEpoch ?? 0,
        },
      })

      expect(provider.pushed).toHaveLength(0)
      expect(provider.saved).toHaveLength(0)
      expect(store().artifactPushResult).toEqual({
        ok: false,
        message: 'Controller session changed before Show delivery',
        artifactId: 'show:show-session-reconnect',
        mode: 'run',
      })
      expect(store().lastShowArtifactCompilation).toBeNull()
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
      expect(store().lastShowArtifactCompilation).toEqual({
        controllerId: 'pixelblaze_pb32_show', liveEpoch: controller.liveEpoch,
        sourceSha256: await sha256CompleteCompileInput(created.get('10.0.0.5')!.compiledSources[0]),
        byteLength: 16,
      })
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
      expect(store().pushResult).toBeNull()
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
      useControllerStore.setState({ lastShowArtifactCompilation: {
        controllerId: 'old', liveEpoch: 0, sourceSha256: 'a'.repeat(64), byteLength: 8,
      } })

      await store().pushGeneratedArtifact({
        artifactId: 'show:show-1',
        source: PATTERN_SRC,
        name: 'Opening Night',
        persist: false,
        compilePressure: GENERATED_ARTIFACT_PRESSURE,
        artifactStamp: { kind: 'show', id: 'show-1', name: 'Opening Night' },
      })

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
      expect(store().lastShowArtifactCompilation).toBeNull()
      expect(store().pushResult).toBeNull()
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
      expect(store().lastShowArtifactCompilation).toMatchObject({ byteLength: 16 })
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

    it('rejects a Pattern push when the active Controller changes during preparation', async () => {
      await store().addController('10.0.0.5')
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })
      let releaseWrite!: () => void
      void queueControllerProfileWrite('switch-race', async () => {
        await new Promise<void>((resolve) => {
          releaseWrite = resolve
        })
      })

      const push = store().pushActivePattern()
      await vi.waitFor(() => expect(releaseWrite).toBeTypeOf('function'))
      await store().addController('10.0.0.6')
      releaseWrite()
      await push

      expect(created.get('10.0.0.5')!.compiledSources).toEqual([])
      expect(created.get('10.0.0.6')!.compiledSources).toEqual([])
      expect(store().pushResult).toEqual({
        ok: false,
        message: 'Controller session changed before Pattern delivery',
      })
      expect(useControllerPanelStore.getState().configSourceIp).not.toBe('10.0.0.5')
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

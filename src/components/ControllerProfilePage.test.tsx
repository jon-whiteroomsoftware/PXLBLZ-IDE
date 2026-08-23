import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ControllerProfilePage } from './ControllerProfilePage'
import { ControllerProfileHeaderActions } from './ControllerProfileHeaderActions'
import { ControllerSavedProgramsPane } from './ControllerSavedProgramsPane'
import {
  NullControllerProvider,
  type ControllerConfig,
  type ControllerStatus,
} from '@/engine/ControllerProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { encodeMapData } from '@/engine/mapPush'
import {
  demoPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '@/engine/personalContentProvider'
import { assertValidControllerProfile } from '@/cloudflare/controllerProfiles'
import type { MapRecord, PatternRecord } from '@/engine/personalContentRecords'
import type { RecoveredSavedProgram } from '@/engine/controllerSavedProgramRead'
import type { BindingStore } from '@/engine/controllerBinding'
import type { ControllerPushRecord, ControllerPushRecords } from '@/engine/controllerPushRecord'
import {
  demoControllerMetadataStorage,
  resetControllerMetadataStorage,
  setControllerMetadataStorage,
  setPushRecords,
} from '@/engine/controllerMetadataStorage'
import { controllerProfileArtifactSignature } from '@/engine/controllerProfilePassRecipe'
import { artifactHash } from '@/engine/artifactStamp'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import {
  controllerInitialState,
  useControllerStore,
  type ControllerEntry,
} from '@/store/controllerStore'
import {
  controllerPanelInitialState,
  useControllerPanelStore,
} from '@/store/controllerPanelStore'
import {
  controllerProfileLiveInitialState,
  useControllerProfileLiveStore,
} from '@/store/controllerProfileLiveStore'
import {
  controllerSavedProgramsLiveInitialState,
  useControllerSavedProgramsLiveStore,
} from '@/store/controllerSavedProgramsLiveStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { routerInitialState, useRouterStore } from '@/store/routerStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import { stockShowById } from '@/pixelblaze/stock/shows'
import {
  __resetControllerDeviceWriteQueue,
  queueControllerDeviceWrite,
} from '@/engine/controllerDeviceWriteQueue'
import { expectDisabledReason } from '@/components/ui/disabled-reason.testing'

const READBACK_POINTS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [0, 1],
]
const READBACK_HASH = '06427689'

const statusDotName = {
  current: /^Current:/,
  stale: /^Push again:/,
  unmanaged: /^Unknown:/,
  queued: /^Queued:/,
  updating: /^Syncing:/,
  failed: /^Failed:/,
} as const

class MapReadbackProvider extends NullControllerProvider {
  readonly mapData = encodeMapData(READBACK_POINTS)

  getStatus(): ControllerStatus {
    return {
      kind: 'connected',
      controller: {
        id: '192.168.8.224',
        address: '192.168.8.224',
        deviceId: 'pixelblaze_pb32_abc',
        name: 'Burner bag',
      },
    }
  }

  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve(READBACK_POINTS)
  }

  getPixelMapData(): Promise<Uint8Array | null> {
    return Promise.resolve(this.mapData)
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

class ProgramListProvider extends MapReadbackProvider {
  programs: Array<{ id: string; name: string }> = []
  bindings: BindingStore = {}
  pushRecords: ControllerPushRecords = {}
  recoveredPrograms = new Map<string, RecoveredSavedProgram>()
  listCalls = 0
  deletedProgramIds: string[] = []
  bindingWrites = 0
  pushRecordWrites = 0
  activeProgramId: string | undefined
  configPromise: Promise<ControllerConfig> | undefined
  activationCalls: Array<{ programId: string; save: boolean | undefined }> = []

  listPrograms() {
    this.listCalls += 1
    return Promise.resolve(this.programs)
  }

  readSavedProgram(programId: string) {
    return Promise.resolve(this.recoveredPrograms.get(programId) ?? null)
  }

  setActiveProgram(programId: string, opts?: { save?: boolean }) {
    this.activationCalls.push({ programId, save: opts?.save })
    this.activeProgramId = programId
    return Promise.resolve()
  }

  deleteProgram(programId: string) {
    this.deletedProgramIds.push(programId)
    this.programs = this.programs.filter((program) => program.id !== programId)
    return Promise.resolve()
  }

  getConfig(): Promise<ControllerConfig> {
    if (this.configPromise) return this.configPromise
    return Promise.resolve({
      ...(this.activeProgramId ? { activeProgramId: this.activeProgramId } : {}),
    })
  }
}

beforeEach(() => {
  __resetControllerDeviceWriteQueue()
  window.history.replaceState(null, '', '/')
  useControllerProfileStore.setState(controllerProfileInitialState)
  useControllerProfileLiveStore.setState(controllerProfileLiveInitialState)
  useControllerSavedProgramsLiveStore.setState(controllerSavedProgramsLiveInitialState)
  useControllerStore.setState(controllerInitialState)
  useControllerPanelStore.setState(controllerPanelInitialState)
  useMapStore.setState(mapInitialState)
  useRouterStore.setState(routerInitialState)
  usePatternStore.setState(patternInitialState)
  useShowStore.setState(showInitialState)
  resetControllerProvider()
  resetControllerMetadataStorage()
  setPersonalContentProvider({
    ...demoPersonalContentProvider,
    updateControllerProfile: async () => {},
  })
})

function enableShowtime() {
  window.history.replaceState(null, '', '/studio/controllers?showtime')
  useRouterStore.getState().syncFromLocation()
}

afterEach(() => {
  __resetControllerDeviceWriteQueue()
  resetControllerProvider()
  resetControllerMetadataStorage()
  resetPersonalContentProvider()
})

function seedProfile() {
  const profile = defaultControllerProfile({
    id: 'ctrl-1',
    deviceId: 'pixelblaze_pb32_abc',
    deviceName: 'Burner bag',
    ip: '192.168.8.224',
    now: 1,
  })
  useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
  return profile
}

function renderLiveProgramInventory(
  profile: ReturnType<typeof seedProfile>,
  fixture: {
    storageId: string
    programs: ProgramListProvider['programs']
    bindings: Record<string, string>
    pushRecords: Record<string, ControllerPushRecord>
    mapDim?: ControllerEntry['mapDim']
    installedMap?: ControllerEntry['installedMap']
    activeProgramId?: string
    panelActiveProgramId?: string
    configSourceIp?: string | null
    configPromise?: Promise<ControllerConfig>
  },
) {
  const provider = new ProgramListProvider()
  provider.programs = fixture.programs
  provider.bindings = { '192.168.8.224': fixture.bindings }
  provider.pushRecords = { '192.168.8.224': fixture.pushRecords }
  provider.activeProgramId = fixture.activeProgramId
  provider.configPromise = fixture.configPromise
  setControllerMetadataStorage({
    ...demoControllerMetadataStorage,
    id: fixture.storageId,
    getControllerBindings: async () => provider.bindings,
    setControllerBindings: async (next) => {
      provider.bindingWrites += 1
      provider.bindings = next
    },
    getPushRecords: async () => provider.pushRecords,
    setPushRecords: async (next) => {
      provider.pushRecordWrites += 1
      provider.pushRecords = next
    },
  })
  setControllerProvider(provider)
  useControllerPanelStore.setState({
    activeProgramId: fixture.panelActiveProgramId ?? fixture.activeProgramId,
    configSourceIp: fixture.configSourceIp ?? null,
    programs: provider.programs,
    programsByController: { '192.168.8.224': provider.programs },
  })
  useControllerStore.setState({
    activeIp: '192.168.8.224',
    controllers: {
      '192.168.8.224': {
        ip: '192.168.8.224',
        deviceId: profile.deviceId,
        nickname: 'Burner bag',
        phase: 'live',
        liveEpoch: 1,
        mapDim: fixture.mapDim ?? 2,
        ...(fixture.installedMap ? { installedMap: fixture.installedMap } : {}),
      },
    },
  })
  const { rerender } = render(<ControllerSavedProgramsPane profile={profile} />)
  return Object.assign(provider, {
    rerender: (next: ReturnType<typeof seedProfile>) => rerender(<ControllerSavedProgramsPane profile={next} />),
  })
}

describe('ControllerProfilePage', () => {
  it('projects running state and profile evidence while keeping row Run isolated from Studio', async () => {
    const profile = seedProfile()
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-1',
        name: 'Twinkle',
        src: 'export function render(i) {}',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    const featureSignature = JSON.stringify({
      version: 1,
      transforms: [
        { type: 'power-cap', mixinId: 'builtin:power-cap', maxDuty: 0.4 },
        {
          type: 'hardware-brightness',
          mixinId: 'builtin:hardware-brightness',
          inputId: 'pot-1',
          mode: 'multiply-output',
        },
      ],
      inputs: [],
      bindings: [
        {
          id: 'binding-1',
          patternId: 'pat-1',
          inputId: 'pot-1',
          target: { kind: 'call-function', name: 'setSpeed' },
        },
        {
          id: 'binding-2',
          patternId: 'pat-1',
          inputId: 'pot-2',
          target: { kind: 'assign-variable', name: 'speed', min: 0, max: 4 },
        },
      ],
    })
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'inventory-affordances',
      activeProgramId: 'DEV1',
      programs: [
        { id: 'DEV1', name: 'Device Twinkle' },
        { id: 'FOREIGN1', name: 'sound bar kit' },
      ],
      bindings: { 'pat-1': 'DEV1' },
      pushRecords: {
        'pat-1': {
          transforms: ['hardware-brightness'],
          artifactHash: 'twinkle-hash',
          stampedAt: '2026-08-16T00:00:00.000Z',
          name: 'Twinkle',
          profileSignature: featureSignature,
        },
      },
    })

    const managed = await screen.findByRole('table', { name: 'Saved PXLBLZ Patterns' })
    const other = screen.getByRole('table', { name: 'Other Patterns' })
    expect(within(managed).queryByRole('columnheader', { name: 'Pattern ID' })).not.toBeInTheDocument()
    expect(within(other).queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument()
    const statusSort = within(managed).getByRole('button', { name: 'Status' })
    expect(statusSort).toHaveClass('h-5', 'w-5')
    expect(within(statusSort).getByTestId('controller-status-sort-target')).toBeInTheDocument()
    expect(screen.getByTitle(/Program id DEV1/)).toHaveTextContent('Twinkle')
    expect(screen.getByLabelText('Running now')).toBeInTheDocument()
    expect(screen.getByTitle('Power cap is baked into this saved Pattern')).toBeInTheDocument()
    expect(screen.getByTitle('Hardware brightness input is baked into this saved Pattern')).toBeInTheDocument()
    expect(screen.getByTitle("A hardware input drives one of this Pattern's controls")).toBeInTheDocument()
    expect(screen.getByTitle("A hardware input assigns one of this Pattern's variables")).toBeInTheDocument()

    const runningRun = screen.getByRole('button', { name: 'Run Twinkle on the Controller' })
    expect(runningRun).toBeDisabled()
    expect(runningRun).toHaveAttribute('title', 'Running now')
    // The running row's Delete explains itself to keyboard and assistive tech,
    // not only to a hovering mouse (#871): focusable, aria-disabled, described.
    const runningDelete = screen.getByRole('button', { name: 'Delete Twinkle from the Controller' })
    expectDisabledReason(runningDelete, 'Running now — switch to another Pattern first')
    expect(runningDelete).not.toHaveAttribute('title')
    act(() => runningDelete.focus())
    expect(document.activeElement).toBe(runningDelete)
    expect(document.getElementById(runningDelete.getAttribute('aria-describedby')!)).toBeVisible()
    fireEvent.click(runningDelete)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    const foreignRun = screen.getByRole('button', { name: 'Run sound bar kit on the Controller' })
    const foreignActions = foreignRun.parentElement!
    expect(foreignActions).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
    )
    const routeBefore = useRouterStore.getState().route
    fireEvent.click(foreignRun)
    await waitFor(() => expect(provider.activationCalls).toEqual([
      { programId: 'FOREIGN1', save: true },
    ]))
    expect(useRouterStore.getState().route).toEqual(routeBefore)
    expect(screen.getByRole('button', { name: 'Run sound bar kit on the Controller' })).toBeDisabled()
    expect(screen.getAllByLabelText('Running now')).toHaveLength(1)
  })

  it('clears a stale Run failure once the Controller reports the row running (#877)', async () => {
    const profile = seedProfile()
    const originalActivate = useControllerPanelStore.getState().activateProgram
    const activateProgram = vi.fn().mockRejectedValue(
      new Error('Controller session changed before Pattern activation could be confirmed.'),
    )
    try {
      renderLiveProgramInventory(profile, {
        storageId: 'run-failure-reconciles',
        activeProgramId: 'ACTIVE',
        configSourceIp: '192.168.8.224',
        programs: [
          { id: 'DEV1', name: 'Twinkle' },
          { id: 'ACTIVE', name: 'Running Pattern' },
        ],
        bindings: { 'pat-1': 'DEV1' },
        pushRecords: {},
      })
      useControllerPanelStore.setState({ activateProgram })
      fireEvent.click(await screen.findByRole('button', { name: 'Run Twinkle on the Controller' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Controller session changed before Pattern activation could be confirmed.',
      )

      // The next poll shows Twinkle running after all: the alert is stale and
      // clears rather than contradicting the running marker.
      act(() => useControllerPanelStore.setState({ activeProgramId: 'DEV1' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Run Twinkle on the Controller' })).toBeDisabled()

      // Cleared, not hidden: another Pattern taking over later does not bring
      // the old alert back.
      act(() => useControllerPanelStore.setState({ activeProgramId: 'ACTIVE' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      // A different Pattern taking over leaves a genuine failure in place.
      fireEvent.click(screen.getByRole('button', { name: 'Run Twinkle on the Controller' }))
      expect(await screen.findByRole('alert')).toBeInTheDocument()
      act(() => useControllerPanelStore.setState({ activeProgramId: 'OTHER' }))
      expect(screen.getByRole('alert')).toBeInTheDocument()
    } finally {
      useControllerPanelStore.setState({ activateProgram: originalActivate })
    }
  })

  it('deletes an inactive managed Pattern and clears only its metadata and Send memos', async () => {
    const profile = seedProfile()
    const targetRecord = {
      transforms: [],
      artifactHash: 'target-hash',
      stampedAt: '2026-08-16T00:00:00.000Z',
      name: 'Twinkle',
    }
    const siblingRecord = { ...targetRecord, artifactHash: 'sibling-hash', name: 'Sibling' }
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-1',
        name: 'Twinkle',
        src: 'export function render(i) {}',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    const memos = {
      '192.168.8.224': { 'pat-1': 'target', sibling: 'keep-a' },
      '10.0.0.9': { 'pat-1': 'keep-b' },
    }
    useControllerStore.setState({
      lastSavedSource: structuredClone(memos),
      lastSavedProfileSignature: structuredClone(memos),
      lastPushedSource: structuredClone(memos),
      lastPushedProfileSignature: structuredClone(memos),
      lastRunProgramId: structuredClone(memos),
    })
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'managed-delete',
      activeProgramId: 'ACTIVE',
      programs: [
        { id: 'DEV1', name: 'Device Twinkle' },
        { id: 'SIBLING', name: 'Sibling' },
        { id: 'ACTIVE', name: 'Running Pattern' },
      ],
      bindings: { 'pat-1': 'DEV1', sibling: 'SIBLING' },
      pushRecords: { 'pat-1': targetRecord, sibling: siblingRecord },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Twinkle from the Controller' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: 'Delete “Twinkle” from Burner bag?' }))
      .toBeInTheDocument()
    expect(dialog).toHaveTextContent(
      'This removes the saved Pattern from the Controller. The Studio Pattern is not deleted; Save sends it again.',
    )
    expect(within(dialog).getByText('DEV1')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete from Controller' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Twinkle' })).not.toBeInTheDocument())
    expect(provider.deletedProgramIds).toEqual(['DEV1'])
    expect(provider.bindings).toEqual({
      '192.168.8.224': { sibling: 'SIBLING' },
    })
    expect(provider.pushRecords).toEqual({
      '192.168.8.224': { sibling: siblingRecord },
    })
    expect(usePatternStore.getState().userPatterns.map((pattern) => pattern.id)).toEqual(['pat-1'])
    for (const field of [
      'lastSavedSource',
      'lastSavedProfileSignature',
      'lastPushedSource',
      'lastPushedProfileSignature',
      'lastRunProgramId',
    ] as const) {
      expect(useControllerStore.getState()[field]).toEqual({
        '192.168.8.224': { sibling: 'keep-a' },
        '10.0.0.9': { 'pat-1': 'keep-b' },
      })
    }
  })

  it('keeps a failed foreign delete retryable without touching metadata', async () => {
    const profile = seedProfile()
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'foreign-delete-failure',
      activeProgramId: 'ACTIVE',
      programs: [
        { id: 'FOREIGN1', name: 'sound bar kit' },
        { id: 'ACTIVE', name: 'Running Pattern' },
      ],
      bindings: {},
      pushRecords: {},
    })
    provider.deleteProgram = vi.fn().mockRejectedValueOnce(new Error('device timed out'))
      .mockImplementation(ProgramListProvider.prototype.deleteProgram.bind(provider))

    fireEvent.click(await screen.findByRole('button', { name: 'Delete sound bar kit from the Controller' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      'This removes the Pattern from the Controller. PXLBLZ holds no copy of it — Import first if you want to keep the source.',
    )
    expect(within(dialog).getByText('FOREIGN1')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete from Controller' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not delete “sound bar kit” from Burner bag. device timed out',
    )
    expect(screen.getByText('sound bar kit')).toBeInTheDocument()
    expect(provider.bindingWrites).toBe(0)
    expect(provider.pushRecordWrites).toBe(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry delete' }))
    await waitFor(() => expect(screen.queryByText('sound bar kit')).not.toBeInTheDocument())
    expect(provider.bindingWrites).toBe(0)
    expect(provider.pushRecordWrites).toBe(0)
  })

  it('keeps an unnamed row bound to its exact empty device name', async () => {
    const profile = seedProfile()
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'unnamed-delete-identity',
      activeProgramId: 'ACTIVE',
      programs: [
        { id: 'UNNAMED', name: '' },
        { id: 'ACTIVE', name: 'Running Pattern' },
      ],
      bindings: {},
      pushRecords: {},
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Unnamed program from the Controller' }))
    provider.programs = [
      { id: 'UNNAMED', name: 'Unnamed program' },
      { id: 'ACTIVE', name: 'Running Pattern' },
    ]
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete from Controller' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'now identifies Unnamed program',
    )
    expect(provider.deletedProgramIds).toEqual([])
  })

  it('keeps the delete dialog open and non-dismissible while the device operation is busy', async () => {
    const profile = seedProfile()
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'foreign-delete-busy',
      activeProgramId: 'ACTIVE',
      programs: [
        { id: 'FOREIGN1', name: 'sound bar kit' },
        { id: 'ACTIVE', name: 'Running Pattern' },
      ],
      bindings: {},
      pushRecords: {},
    })
    const pending = deferred<void>()
    provider.deleteProgram = vi.fn(async (programId: string) => {
      await pending.promise
      provider.deletedProgramIds.push(programId)
      provider.programs = provider.programs.filter((program) => program.id !== programId)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Delete sound bar kit from the Controller' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete from Controller' }))
    expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(dialog).toBeInTheDocument()

    pending.resolve()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('blocks confirmation if the row becomes active after its delete dialog opens', async () => {
    const profile = seedProfile()
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'delete-active-race',
      activeProgramId: 'ACTIVE',
      programs: [
        { id: 'DEV1', name: 'Twinkle' },
        { id: 'ACTIVE', name: 'Running Pattern' },
      ],
      bindings: { 'pat-1': 'DEV1' },
      pushRecords: {},
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Twinkle from the Controller' }))
    act(() => {
      useControllerPanelStore.getState().noteProgramActivated('DEV1', '192.168.8.224')
    })

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: 'Delete from Controller' })).toBeDisabled()
    expect(dialog).toHaveTextContent('Running now — switch to another Pattern first')
    expect(provider.deletedProgramIds).toEqual([])
  })

  it('serializes device deletion and metadata cleanup with Controller writes', async () => {
    const profile = seedProfile()
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'delete-write-queue',
      activeProgramId: 'ACTIVE',
      configSourceIp: '192.168.8.224',
      programs: [
        { id: 'DEV1', name: 'Twinkle' },
        { id: 'ACTIVE', name: 'Running Pattern' },
      ],
      bindings: { 'pat-1': 'DEV1' },
      pushRecords: {},
    })
    const priorWrite = deferred<void>()
    const queuedPrior = queueControllerDeviceWrite(
      '192.168.8.224',
      () => priorWrite.promise,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Twinkle from the Controller' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete from Controller',
    }))
    const observedBindings = queueControllerDeviceWrite('192.168.8.224', async () => (
      structuredClone(provider.bindings)
    ))
    await Promise.resolve()
    expect(provider.deletedProgramIds).toEqual([])

    priorWrite.resolve()
    await queuedPrior
    await expect(observedBindings).resolves.toEqual({ '192.168.8.224': {} })
    expect(provider.deletedProgramIds).toEqual(['DEV1'])
  })

  it('does not let a queued deletion cross to a newly active Controller', async () => {
    const profile = seedProfile()
    const providerA = renderLiveProgramInventory(profile, {
      storageId: 'delete-controller-session',
      activeProgramId: 'ACTIVE-A',
      configSourceIp: '192.168.8.224',
      programs: [
        { id: 'DEV1', name: 'Twinkle' },
        { id: 'ACTIVE-A', name: 'Running on A' },
      ],
      bindings: { 'pat-1': 'DEV1' },
      pushRecords: {},
    })
    const priorWrite = deferred<void>()
    const queuedPrior = queueControllerDeviceWrite(
      '192.168.8.224',
      () => priorWrite.promise,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Twinkle from the Controller' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete from Controller' }))

    const providerB = new ProgramListProvider()
    providerB.programs = [
      { id: 'DEV1', name: 'Different Pattern with colliding id' },
      { id: 'ACTIVE-B', name: 'Running on B' },
    ]
    providerB.activeProgramId = 'ACTIVE-B'
    setControllerProvider(providerB)
    useControllerStore.setState({ activeIp: '10.0.0.9' })
    priorWrite.resolve()
    await queuedPrior

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Controller session changed before Pattern deletion could start.',
    )
    expect(providerA.deletedProgramIds).toEqual([])
    expect(providerB.deletedProgramIds).toEqual([])
    expect(providerA.bindings).toEqual({ '192.168.8.224': { 'pat-1': 'DEV1' } })
  })

  it('does not let a queued deletion cross an in-place Controller reconnect', async () => {
    const profile = seedProfile()
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'delete-controller-epoch',
      activeProgramId: 'ACTIVE',
      configSourceIp: '192.168.8.224',
      programs: [
        { id: 'DEV1', name: 'Twinkle' },
        { id: 'ACTIVE', name: 'Running Pattern' },
      ],
      bindings: { 'pat-1': 'DEV1' },
      pushRecords: {},
    })
    const priorWrite = deferred<void>()
    const queuedPrior = queueControllerDeviceWrite(
      '192.168.8.224',
      () => priorWrite.promise,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Twinkle from the Controller' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete from Controller' }))

    act(() => {
      useControllerStore.setState((state) => ({
        controllers: {
          ...state.controllers,
          '192.168.8.224': {
            ...state.controllers['192.168.8.224']!,
            liveEpoch: 2,
          },
        },
      }))
    })
    priorWrite.resolve()
    await queuedPrior

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Controller session changed before Pattern deletion could start.',
    )
    expect(provider.deletedProgramIds).toEqual([])
  })

  it('rechecks the same Controller after a post-delete reconnect and finishes metadata cleanup', async () => {
    const profile = seedProfile()
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'delete-reconnect-recovery',
      activeProgramId: 'ACTIVE',
      configSourceIp: '192.168.8.224',
      programs: [
        { id: 'DEV1', name: 'Twinkle' },
        { id: 'ACTIVE', name: 'Running Pattern' },
      ],
      bindings: { 'pat-1': 'DEV1' },
      pushRecords: {
        'pat-1': {
          transforms: [],
          artifactHash: 'target-hash',
          stampedAt: '2026-08-16T00:00:00.000Z',
          name: 'Twinkle',
        },
      },
    })
    provider.deleteProgram = vi.fn(async (programId: string) => {
      provider.deletedProgramIds.push(programId)
      provider.programs = provider.programs.filter((program) => program.id !== programId)
      useControllerStore.setState((state) => ({
        controllers: {
          ...state.controllers,
          '192.168.8.224': {
            ...state.controllers['192.168.8.224']!,
            liveEpoch: 2,
          },
        },
      }))
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Twinkle from the Controller' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete from Controller' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Controller session changed before Pattern deletion could be confirmed.',
    )
    expect(provider.deletedProgramIds).toEqual(['DEV1'])
    expect(provider.bindings).toEqual({ '192.168.8.224': { 'pat-1': 'DEV1' } })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Recheck Controller' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry delete' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(provider.deletedProgramIds).toEqual(['DEV1'])
    expect(provider.bindings).toEqual({ '192.168.8.224': {} })
    expect(provider.pushRecords).toEqual({ '192.168.8.224': {} })
  })

  it('waits for Controller-scoped config before marking an inventory row as running', async () => {
    const profile = seedProfile()
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-1',
        name: 'Twinkle',
        src: 'export function render(i) {}',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    let resolveConfig!: (config: ControllerConfig) => void
    const configPromise = new Promise<ControllerConfig>((resolve) => {
      resolveConfig = resolve
    })
    renderLiveProgramInventory(profile, {
      storageId: 'inventory-config-provenance',
      activeProgramId: 'FOREIGN1',
      panelActiveProgramId: 'DEV1',
      configSourceIp: '10.0.0.1',
      configPromise,
      programs: [
        { id: 'DEV1', name: 'Device Twinkle' },
        { id: 'FOREIGN1', name: 'sound bar kit' },
      ],
      bindings: { 'pat-1': 'DEV1' },
      pushRecords: {},
    })

    await screen.findByRole('table', { name: 'Saved PXLBLZ Patterns' })
    expect(screen.queryByLabelText('Running now')).not.toBeInTheDocument()
    const pendingDelete = screen.getByRole('button', {
      name: 'Delete Twinkle from the Controller',
    })
    expectDisabledReason(pendingDelete, 'Waiting to confirm the running Pattern')

    act(() => {
      useControllerPanelStore.getState().noteProgramActivated('DEV1', '192.168.8.224')
    })
    const managed = screen.getByRole('table', { name: 'Saved PXLBLZ Patterns' })
    expect(await within(managed).findByLabelText('Running now')).toBeInTheDocument()

    await act(async () => {
      resolveConfig({ activeProgramId: 'FOREIGN1' })
    })
    const other = screen.getByRole('table', { name: 'Other Patterns' })
    expect(await within(other).findByLabelText('Running now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run sound bar kit on the Controller' }))
      .toBeDisabled()
  })

  it('keys ragged input columns to the center pane instead of the viewport (#772)', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        inputs: [{
          id: 'brightness-pot',
          name: 'Brightness knob',
          pin: 33,
          signal: 'analog',
          smoothing: 0.2,
          fallback: 0.5,
          invert: false,
        }],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByTestId('controller-profile-input-columns-container'))
      .toHaveClass('controller-profile-input-columns-container')
    expect(screen.getByTestId('controller-profile-input-columns'))
      .toHaveClass('controller-profile-input-columns')
  })

  it('shows the durable installed-map snapshot while the Controller is offline', () => {
    const base = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...base,
        lastKnownInstalledMap: {
          status: 'present',
          fingerprint: '9a0c9e7f',
          dimension: 2,
          pointCount: 256,
          observedAt: 1,
        },
        mapFingerprints: [{
          hash: '9a0c9e7f',
          mapId: 'deleted-square',
          mapName: 'Square',
          devicePixelCount: 256,
          pushedAt: 1,
        }],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByTestId('installed-map-presentation')).toHaveTextContent(
      'Square2D· 256 points',
    )
    expect(screen.getByLabelText('Installed map dimension: 2D')).toBeInTheDocument()
  })

  it('shows a dash offline when no installed-map observation has succeeded', () => {
    seedProfile()

    render(<ControllerProfilePage profileId="ctrl-1" />)

    const mapLabel = screen.getByText('Map')
    expect(mapLabel.parentElement).toHaveTextContent('Map-')
  })

  it('keeps set-once physical parameters behind Adjust and persists inversion (#772)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        inputs: [{
          id: 'brightness-pot',
          name: 'Brightness knob',
          pin: 33,
          signal: 'analog',
          smoothing: 0.2,
          fallback: 0.5,
          invert: false,
        }],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // The resting card states what the input is and what it does, not its knobs.
    expect(screen.getByText('IO33')).toBeInTheDocument()
    expect(screen.getByText('analog')).toBeInTheDocument()
    expect(screen.getByText('smooth 20%')).toBeInTheDocument()
    expect(screen.getByText('fallback 50%')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Brightness knob invert' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Adjust Brightness knob' }))

    const invert = screen.getByRole('checkbox', { name: 'Brightness knob invert' })
    expect(invert).not.toBeChecked()
    fireEvent.click(invert)

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].inputs[0].invert).toBe(true)
      expect(screen.getAllByText('1 -> 0').length).toBeGreaterThan(0)
    })
  })

  it('creates a per-Pattern use inside the input that drives it (#772)', async () => {
    const base = seedProfile()
    const profile = {
      ...base,
      keepPatternsUpToDate: true,
      inputs: [{
        id: 'green-pot',
        name: 'Green pot',
        pin: 36,
        signal: 'analog' as const,
        smoothing: 0.2,
        fallback: 0.5,
        invert: false,
      }],
      globalTransforms: base.globalTransforms.map((transform) =>
        transform.type === 'hardware-brightness'
          ? { ...transform, enabled: true, inputId: 'green-pot' }
          : transform,
      ),
    }
    const scheduleReconciliation = vi.fn()
    useControllerProfileStore.setState({ profiles: [profile] })
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-line',
        name: 'Line Dancer',
        src: 'export function render(index) { hsv(0, 1, 1) }',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      scheduleControllerReconciliation: scheduleReconciliation,
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })
    useControllerPanelStore.setState({
      programsByController: {
        '192.168.8.224': [
          { id: 'DEV_LINE', name: 'Line Dancer' },
          { id: 'FOREIGN', name: 'Foreign pattern' },
        ],
      },
    })
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'binding-pattern-choices',
      getControllerBindings: async () => ({
        '192.168.8.224': {
          'pat-line': 'DEV_LINE',
          'pat-not-installed': 'DEV_MISSING',
        },
      }),
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // Brightness states its own scope; there is no Pattern exception yet.
    expect(screen.getByText('Brightness')).toBeInTheDocument()
    expect(screen.getByText('every Pattern')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use Green pot for one Pattern' }))
    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toEqual([])
    expect(scheduleReconciliation).not.toHaveBeenCalled()

    const pattern = await screen.findByRole('combobox', { name: 'Pattern for Green pot' })
    expect(screen.getByRole('button', { name: 'Cancel new use for Green pot' })).toBeInTheDocument()
    expect(pattern).toHaveTextContent('Line Dancer')
    expect(pattern).not.toHaveTextContent('Foreign pattern')
    expect(pattern).not.toHaveTextContent('DEV_MISSING')

    fireEvent.change(pattern, { target: { value: 'pat-line' } })

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].patternBindings).toMatchObject([
        { patternId: 'pat-line', inputId: 'green-pot' },
      ])
      expect(scheduleReconciliation).toHaveBeenCalledTimes(1)
    })

    // The override is stated once, in the scope of the use it overrides.
    expect(await screen.findByText('every Pattern except Line Dancer')).toBeInTheDocument()
    expect(screen.getByText('Line Dancer')).toBeInTheDocument()
    expect(screen.getByText(/drives exported slider/)).toBeInTheDocument()
    expect(screen.getByText('sliderSpeed')).toBeInTheDocument()
    expect(screen.queryByText('Brightness override')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Line Dancer use of Green pot' }))
    expect(screen.getByRole('combobox', { name: 'Binding Pattern' })).toHaveTextContent('Line Dancer')
  })

  it('opens the owning Pattern-use editor directly from an invalid use (#772)', () => {
    const base = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...base,
        inputs: [{
          id: 'green-pot',
          name: 'Green pot',
          pin: 36,
          signal: 'analog',
          smoothing: 0.2,
          fallback: 0.5,
          invert: false,
        }],
        patternBindings: [{
          id: 'bad-range',
          patternId: 'pat-line',
          inputId: 'green-pot',
          target: { kind: 'assign-variable', name: 'speed', min: 1, max: 1 },
        }],
      }],
      profilesLoaded: true,
    })
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-line',
        name: 'Line Dancer',
        src: 'export function render(index) { hsv(0, 1, 1) }',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    const issue = screen.getByText(/assignment min must be less than max/)
    expect(issue.closest('article')).toContainElement(screen.getByText('Line Dancer'))
    fireEvent.click(screen.getByRole('button', { name: 'Fix Line Dancer use of Green pot' }))
    expect(screen.getByRole('textbox', { name: 'Binding minimum' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Binding maximum' })).toBeInTheDocument()
  })

  it('no longer presents a separate Pattern bindings or Global transforms section (#772)', () => {
    seedProfile()

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.queryByRole('heading', { name: 'Pattern bindings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Global transforms' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add binding' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Hardware brightness input' })).not.toBeInTheDocument()
  })

  it('mentions zones nowhere on the Controller profile page (#775)', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{ ...profile, lastKnownPixelCount: 256 }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // Zones retired outright in #775: no editor, no heading, no pointer text.
    expect(screen.queryByRole('heading', { name: 'Zones' })).not.toBeInTheDocument()
    expect(screen.queryByText(/zone/i)).not.toBeInTheDocument()
  })

  it('shows no role control anywhere on the redesigned page (#772)', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        inputs: [{
          id: 'pot0',
          name: 'Front pot',
          pin: 33,
          signal: 'analog',
          smoothing: 0.2,
          fallback: 0.5,
          invert: false,
        }],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Front pot' }))

    expect(screen.queryByRole('combobox', { name: 'Front pot role' })).not.toBeInTheDocument()
    expect(screen.queryByText('Role')).not.toBeInTheDocument()
  })

  it('assigns and clears hardware brightness from the input it belongs to (#772)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        inputs: [{
          id: 'pot0',
          name: 'Front pot',
          pin: 33,
          signal: 'analog',
          smoothing: 0.2,
          fallback: 0.5,
          invert: false,
        }],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
    expect(screen.getByText('no Pattern reads it yet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Front pot controls brightness' }))

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'hardware-brightness'))
        .toMatchObject({ enabled: true, inputId: 'pot0' })
    })
    expect(await screen.findByText('Brightness')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Front pot controls brightness' }))

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'hardware-brightness'))
        .toMatchObject({ enabled: false, inputId: '' })
    })
  })

  it('keeps brightness reachable on an input that already drives a Pattern (#772)', async () => {
    const base = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...base,
        inputs: [{
          id: 'pot0',
          name: 'Front pot',
          pin: 33,
          signal: 'analog',
          smoothing: 0.2,
          fallback: 0.5,
          invert: false,
        }],
        patternBindings: [{
          id: 'b1',
          patternId: 'pat-line',
          inputId: 'pot0',
          target: { kind: 'call-function', name: 'triggerBurst' },
        }],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // With a Pattern use present there is no "Nothing yet" row to carry the
    // switch, so the add row has to offer brightness instead.
    expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Front pot controls brightness' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use Front pot for brightness' }))

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'hardware-brightness'))
        .toMatchObject({ enabled: true, inputId: 'pot0' })
    })
    expect(await screen.findByText('every Pattern except pat-line')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use Front pot for brightness' })).not.toBeInTheDocument()
  })

  it('reports brightness on a digital input on that input with a direct correction (#772)', async () => {
    const base = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...base,
        inputs: [{
          id: 'btn0',
          name: 'Panel button',
          pin: 33,
          signal: 'digital',
          smoothing: 0,
          fallback: 0,
          invert: false,
        }],
        globalTransforms: base.globalTransforms.map((transform) =>
          transform.type === 'hardware-brightness'
            ? { ...transform, enabled: true, inputId: 'btn0' }
            : transform,
        ),
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByText(
      'Input "btn0" drives hardware brightness, which needs an analog signal. A digital input emits nothing.',
    )).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Switch this input to analog' }))

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].inputs[0].signal).toBe('analog')
    })
    expect(screen.queryByText(/needs an analog signal/)).not.toBeInTheDocument()
  })

  it('repairs a digital brightness input on a non-analog pin in one click (#772)', async () => {
    const base = seedProfile()
    const broken = {
      ...base,
      inputs: [{
        id: 'btn0',
        name: 'Panel button',
        pin: 25,
        signal: 'digital' as const,
        smoothing: 0,
        fallback: 0,
        invert: false,
      }],
      globalTransforms: base.globalTransforms.map((transform) =>
        transform.type === 'hardware-brightness'
          ? { ...transform, enabled: true, inputId: 'btn0' }
          : transform,
      ),
    }
    useControllerProfileStore.setState({ profiles: [broken], profilesLoaded: true })
    // Persist through the real record gate. A correction that only switches the
    // signal leaves IO25 unreadable, the PATCH is refused, and the store rolls
    // the optimistic edit back to digital (#772).
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async (_id, changes) => {
        assertValidControllerProfile({ ...broken, ...changes })
      },
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Switch to analog on IO33' }))

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].inputs[0]).toMatchObject({
        signal: 'analog',
        pin: 33,
      })
    })
    expect(screen.queryByText(/needs an analog signal/)).not.toBeInTheDocument()
  })

  it('does not resurrect the previous connection\'s metadata read on reconnect (#772)', async () => {
    const base = seedProfile()
    const profile = {
      ...base,
      inputs: [{
        id: 'pot0',
        name: 'Front pot',
        pin: 33,
        signal: 'analog' as const,
        smoothing: 0.2,
        fallback: 0.5,
        invert: false,
      }],
      patternBindings: [{
        id: 'b1',
        patternId: 'pat-line',
        inputId: 'pot0',
        target: { kind: 'call-exported-slider' as const, name: 'sliderSpeed' },
      }],
    }
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-line',
        name: 'Line Dancer',
        src: 'export function render(index) { hsv(0, 1, 1) }',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })

    // Two whole reads of the Controller's bindings: the one this connection
    // completed, and the replacement the reconnect starts and never finishes.
    const bindingReads: Array<() => Promise<BindingStore>> = [
      () => Promise.resolve({ '192.168.8.224': { 'pat-line': 'DEV_LINE' } }),
      () => new Promise(() => {}),
    ]
    let bindingReadIndex = 0
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'bindings-across-connections',
      getControllerBindings: () => bindingReads[bindingReadIndex++](),
    })

    // The panel store keeps a Controller's program list under its IP across a
    // disconnect and only replaces it when a new list arrives, so a reconnect
    // to the same Controller finds the very same array waiting. Seeded once,
    // never replaced — exactly what the page sees.
    act(() => {
      useControllerPanelStore.setState({
        programsByController: { '192.168.8.224': [{ id: 'DEV_LINE', name: 'Line Dancer' }] },
      })
    })
    const connect = (liveEpoch: number) => {
      act(() => {
        useControllerStore.setState({
          activeIp: '192.168.8.224',
          controllers: {
            '192.168.8.224': {
              ip: '192.168.8.224',
              deviceId: profile.deviceId,
              nickname: 'Burner bag',
              phase: 'live',
              liveEpoch,
              mapDim: 2,
            },
          },
        })
      })
    }
    connect(1)
    render(<ControllerProfilePage profileId="ctrl-1" />)

    // The installed-Pattern choices offered for a new use are exactly what the
    // completed bindings read found, so they are what this connection knows.
    fireEvent.click(screen.getByLabelText('Use Front pot for one Pattern'))
    expect(await screen.findByText('Choose an installed managed Pattern')).toBeInTheDocument()
    const retainedPrograms = useControllerPanelStore.getState().programsByController['192.168.8.224']

    // Disconnect. The entry goes; the bindings the page already read do not.
    act(() => {
      useControllerStore.setState({ activeIp: null, controllers: {} })
    })
    expect(screen.getByText('Connect this Controller to add a use')).toBeInTheDocument()

    // Reconnect to the same Controller, same retained program list. Every value
    // the page used to key the old read is identical again — only the
    // connection is new, and the replacement read has not landed.
    connect(2)
    expect(useControllerPanelStore.getState().programsByController['192.168.8.224'])
      .toBe(retainedPrograms)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(bindingReadIndex).toBe(2)
    expect(screen.getByText('No managed saved Patterns are installed')).toBeInTheDocument()

    // The replacement never resolves, so the page never regains an answer.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(screen.getByText('No managed saved Patterns are installed')).toBeInTheDocument()
    expect(screen.queryByText('Choose an installed managed Pattern')).not.toBeInTheDocument()
  })

  it('keeps input actions focusable and exposes native checkbox semantics (#772)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        inputs: [{
          id: 'pot0',
          name: 'Front pot',
          pin: 33,
          signal: 'analog',
          smoothing: 0.2,
          fallback: 0.5,
          invert: false,
        }],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // The browser flow proves native Space activation. This lighter component
    // oracle checks the semantic control, accessible name, focus, and action.
    const brightness = screen.getByRole('checkbox', { name: 'Front pot controls brightness' })
    expect(brightness).not.toHaveAttribute('tabindex', '-1')
    brightness.focus()
    expect(brightness).toHaveFocus()
    fireEvent.click(brightness)
    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'hardware-brightness'))
        .toMatchObject({ enabled: true })
    })

    const adjust = screen.getByRole('button', { name: 'Adjust Front pot' })
    adjust.focus()
    expect(adjust).toHaveFocus()
    fireEvent.click(adjust)
    expect(screen.getByRole('combobox', { name: 'Front pot pin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done adjusting Front pot' })).toBeInTheDocument()
  })

  it('does not expose the retired output declaration (#743)', () => {
    seedProfile()

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.queryByRole('combobox', { name: 'Declared output profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'About the declared output profile' })).not.toBeInTheDocument()
  })

  it('uses Power vocabulary and only calls out physical LEDs when they differ from addresses (#743)', async () => {
    const profile = seedProfile()
    const configuredProfile = {
      ...profile,
      lastKnownPixelCount: 256,
      electricalProfile: {
        ledPresetId: 'ws2812-5v-individual' as const,
        supplyBudget: { value: 10, unit: 'watts' as const },
      },
      globalTransforms: profile.globalTransforms.map((transform) => (
        transform.type === 'power-cap'
          ? { ...transform, enabled: true, mode: 'derived' as const }
          : transform
      )),
    }
    useControllerProfileStore.setState({ profiles: [configuredProfile], profilesLoaded: true })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    const powerSection = screen.getByRole('heading', { name: 'Power' }).closest('section')
    expect(powerSection).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Electrical' })).not.toBeInTheDocument()
    // One terse readout chain carries the preset assumption exactly once (#772).
    expect(within(powerSection!).getByText('256 addr')).toBeInTheDocument()
    expect(within(powerSection!).getByText('60 mA/addr @ 5V')).toBeInTheDocument()
    expect(within(powerSection!).getByText('76.8 W')).toBeInTheDocument()
    expect(within(powerSection!).getByText('10.0 W')).toBeInTheDocument()
    expect(within(powerSection!).queryByText(/\d LEDs/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Worldsemi reference' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Use the continuous rating available to the LEDs/i)).not.toBeInTheDocument()

    act(() => {
      useControllerProfileStore.setState({
        profiles: [{
          ...configuredProfile,
          electricalProfile: {
            ...configuredProfile.electricalProfile,
            ledPresetId: 'ws2811-12v-grouped',
          },
        }],
      })
    })

    await waitFor(() => {
      expect(within(powerSection!).getByText('768 LEDs')).toBeInTheDocument()
    })
  })

  it('switches the full-white load between estimate and measured total with one segment (#786)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 256,
        electricalProfile: {
          ledPresetId: 'ws2812-5v-individual',
          supplyBudget: { value: 10, unit: 'watts' },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'derived' as const }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByText('60 mA/addr @ 5V')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Full-white installation total' })).not.toBeInTheDocument()
    // The provenance select is gone: a measured total is just your total (#786).
    expect(screen.queryByRole('combobox', { name: 'Full-white load source' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Measured total' }))

    expect(await screen.findByRole('textbox', { name: 'Full-white installation total' })).toBeInTheDocument()
    // The preset assumption is no longer claimed once a real total replaces it.
    expect(screen.queryByText('60 mA/addr @ 5V')).not.toBeInTheDocument()
    expect(screen.getByText('measured total')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Construction estimate' }))

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Full-white installation total' })).not.toBeInTheDocument()
    })
  })

  it('uses the shared controller traffic-light vocabulary for profile status', () => {
    seedProfile()

    const { rerender } = render(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-zinc-700')

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'pending',
          mapDim: null,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Trying to connect')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-amber-400')
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('animate-blink-connect')

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'error',
          error: 'WebSocket open timed out',
          mapDim: null,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Connect failed')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-red-400')

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-ok')
  })

  it('shows the last-known firmware update state read-only while the Controller is offline', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        board: {
          ...profile.board,
          firmwareVersion: '3.67',
          firmwareUpdate: {
            state: 'available',
            checkedAt: 123_456,
            firmwareVersion: '3.67',
          },
        },
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('Update available')).toHaveAttribute(
      'title',
      'Last checked while this Controller was connected',
    )
    expect(screen.queryByRole('link', { name: 'Open Pixelblaze' })).not.toBeInTheDocument()
  })

  it('gates the pane-header controller actions on connection and refreshes metadata (#685)', () => {
    const profile = seedProfile()
    const refreshLiveMetadata = vi.fn(async () => {})
    useControllerProfileStore.setState({ refreshLiveMetadata })

    const { rerender } = render(<ControllerProfileHeaderActions profile={profile} />)
    expect(screen.getByTitle('Connect this controller to refresh its metadata')).toBeDisabled()
    expect(screen.getByTitle('Connect this controller to import its installed pixel map')).toBeDisabled()

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })
    rerender(<ControllerProfileHeaderActions profile={profile} />)
    const refresh = screen.getByTitle('Refresh controller metadata')
    expect(refresh).toBeEnabled()
    expect(screen.getByTitle('Import installed pixel map')).toBeEnabled()

    fireEvent.click(refresh)
    expect(refreshLiveMetadata).toHaveBeenCalledWith('ctrl-1')
  })

  it('shows the saved-program inventory offline state in its dedicated pane', () => {
    const profile = seedProfile()

    render(<ControllerSavedProgramsPane profile={profile} />)

    const empty = screen.getByText(/nothing to show while offline/i)
    expect(empty).not.toHaveClass('border', 'border-dashed', 'bg-zinc-950/30')
    expect(screen.getByRole('button', { name: 'Connect this Controller' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh saved Patterns' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: /Other Patterns/ })).not.toBeInTheDocument()
  })

  it('keeps reconciliation progress while reducing the update control to one concise line', () => {
    const profile = { ...seedProfile(), keepPatternsUpToDate: true }
    useControllerProfileStore.setState({ profiles: [profile] })
    useControllerStore.setState({
      controllerReconciliations: {
        'ctrl-1': {
          phase: 'running',
          managedCount: 3,
          unmanagedCount: 2,
          completedCount: 1,
          programs: [
            { programId: 'CURRENT', bindingKey: 'pat-1', name: 'Current', state: 'current' },
            { programId: 'WORKING', bindingKey: 'pat-2', name: 'Working', state: 'updating' },
            { programId: 'QUEUED', bindingKey: 'pat-3', name: 'Queued', state: 'queued' },
          ],
        },
      },
    })

    render(<ControllerSavedProgramsPane profile={profile} />)

    const updateLabel = 'Keep PXLBLZ Patterns up to date when Controller settings change'
    const updateControl = screen.getByRole('checkbox', { name: updateLabel })
    expect(updateControl).toBeChecked()
    for (const decoration of updateControl.parentElement?.querySelectorAll('span') ?? []) {
      expect(decoration).toHaveClass('pointer-events-none')
    }
    expect(screen.getByText(updateLabel)).toBeInTheDocument()
    expect(screen.queryByText(/managed Patterns current/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/unmanaged programs are exempt/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Managed Pattern refresh progress')).toHaveTextContent(
      '1 current, 0 to push again, 1 updating, 1 queued, 0 failed',
    )

    fireEvent.click(screen.getByRole('checkbox', { name: updateLabel }))
    expect(useControllerProfileStore.getState().profiles[0].keepPatternsUpToDate).toBe(false)
  })

  it('keeps offline work pending and removes the progress rail once current', () => {
    const profile = { ...seedProfile(), keepPatternsUpToDate: true }
    useControllerProfileStore.setState({ profiles: [profile] })
    useControllerStore.setState({
      controllerReconciliations: {
        'ctrl-1': {
          phase: 'pending',
          managedCount: 2,
          unmanagedCount: 1,
          completedCount: 0,
          programs: [
            { programId: 'A', bindingKey: 'pat-a', name: 'A', state: 'queued' },
            { programId: 'B', bindingKey: 'pat-b', name: 'B', state: 'queued' },
          ],
        },
      },
    })
    const { rerender } = render(<ControllerSavedProgramsPane profile={profile} />)

    expect(screen.queryByText(/updates pending/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Managed Pattern refresh progress')).toBeInTheDocument()

    useControllerStore.setState({
      controllerReconciliations: {
        'ctrl-1': {
          phase: 'current',
          managedCount: 2,
          unmanagedCount: 1,
          completedCount: 2,
          programs: [
            { programId: 'A', bindingKey: 'pat-a', name: 'A', state: 'current' },
            { programId: 'B', bindingKey: 'pat-b', name: 'B', state: 'current' },
          ],
        },
      },
    })
    rerender(<ControllerSavedProgramsPane profile={profile} />)

    expect(screen.queryByText(/managed Patterns current/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Managed Pattern refresh progress')).not.toBeInTheDocument()
  })

  it('groups saved programs by Studio ownership, links owned rows, and refreshes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const profile = seedProfile()
    const provider = new ProgramListProvider()
    provider.programs = [
      { id: 'DEV1', name: 'Device Twinkle' },
      { id: 'FOREIGN1', name: 'sound bar kit' },
      { id: 'DEV2', name: 'Device Aurora' },
      { id: 'SHOW1', name: 'Measured wall Show' },
    ]
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-1',
        name: 'Twinkle',
        src: 'export function render(i) {}',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'saved-program-test',
      getControllerBindings: async () => ({
        '192.168.8.224': {
          'pat-1': 'DEV1',
          'demo:AuroraSphere': 'DEV2',
          'show:show-1': 'SHOW1',
        },
      }),
      getPushRecords: async () => ({
        '192.168.8.224': {
          'pat-1': {
            transforms: [],
            artifactHash: 'twinkle-hash',
            stampedAt: '2026-07-09T00:00:00.000Z',
            name: 'Twinkle',
            profileSignature: controllerProfileArtifactSignature(profile, 'pat-1', { mapDim: 2 }),
          },
          'show:show-1': {
            transforms: ['show'],
            artifactHash: 'show-hash',
            stampedAt: '2026-07-12T00:00:00.000Z',
            name: 'Measured wall Show',
            profileSignature: controllerProfileArtifactSignature(profile, 'show:show-1', { mapDim: 3 }),
            showOutputContract: {
              version: 1,
              kind: 'installation',
              pixelCount: 256,
              outputMap: { kind: 'custom', name: 'Measured wall', fingerprint: '11111111' },
            },
          },
        },
      }),
    })
    setControllerProvider(provider)
    useControllerPanelStore.setState({
      programs: provider.programs,
      programsByController: { '192.168.8.224': provider.programs },
    })
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })

    const pane = (currentProfile: typeof profile) => (
      <div style={{ width: 520 }}>
        <ControllerSavedProgramsPane profile={currentProfile} />
      </div>
    )
    const { rerender } = render(pane(profile))

    expect(await screen.findByRole('button', { name: 'Twinkle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AuroraSphere' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Saved PXLBLZ Patterns (3)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other Patterns (1)' })).toBeInTheDocument()
    expect(screen.queryByText(/foreign programs/i)).not.toBeInTheDocument()
    expect(screen.getByText('sound bar kit')).toBeInTheDocument()
    expect(screen.getByTitle(/Program id DEV1/)).toHaveTextContent('Twinkle')
    expect(screen.getByTitle(/Program id FOREIGN1/)).toHaveTextContent('sound bar kit')
    expect(screen.getByText('Show output · Installation · 256 px')).toBeInTheDocument()
    expect(screen.queryByLabelText('Saved from a Show')).not.toBeInTheDocument()
    expect(screen.getByText('Source Show unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Source Pattern unavailable')).not.toBeInTheDocument()
    const savedInventory = screen.getByRole('table', { name: 'Saved PXLBLZ Patterns' })
    const otherInventory = screen.getByRole('table', { name: 'Other Patterns' })
    expect(within(savedInventory).getByRole('columnheader', { name: 'Pattern' })).toBeInTheDocument()
    expect(within(savedInventory).getByRole('columnheader', { name: 'Profile' })).toBeInTheDocument()
    expect(within(savedInventory).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(within(savedInventory).getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
    expect(within(otherInventory).queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(statusDotName.current)).toBeInTheDocument()
    expect(screen.getByLabelText(statusDotName.stale)).toBeInTheDocument()
    expect(screen.getByLabelText(statusDotName.unmanaged)).toBeInTheDocument()
    expect(provider.listCalls).toBe(1)

    expect(savedInventory).toHaveClass('table-fixed')
    expect(otherInventory).toHaveClass('table-fixed')
    expect(savedInventory.parentElement).not.toHaveClass('border', 'bg-zinc-950/25')
    expect(otherInventory.parentElement).not.toHaveClass('border', 'bg-zinc-950/25')
    expect(within(savedInventory).getByRole('columnheader', { name: 'Pattern' })).toHaveClass(
      'border-b',
      'text-[9px]',
      'tracking-[0.16em]',
    )
    expect(within(savedInventory).getByRole('button', { name: 'Twinkle' })).toHaveClass('font-sans')
    const columnClasses = (table: HTMLElement) => (
      Array.from(table.querySelectorAll('col')).map((column) => column.className)
    )
    expect(columnClasses(savedInventory)).toEqual(['w-[58%]', 'w-[16%]', 'w-[8%]', 'w-[18%]'])
    expect(columnClasses(otherInventory)).toEqual(['w-[76%]', 'w-[24%]'])
    const importButton = screen.getByRole('button', { name: 'Import sound bar kit' })
    expect(importButton).toHaveClass('h-6', 'w-6')
    expect(importButton.parentElement).toHaveClass('opacity-0', 'group-focus-within:opacity-100')
    expect(importButton.getBoundingClientRect().right).toBeLessThanOrEqual(
      importButton.closest('td')!.getBoundingClientRect().right,
    )
    expect(screen.queryByRole('button', { name: 'Import Twinkle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import AuroraSphere' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import sound bar kit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'A–Z' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Device' })).not.toBeInTheDocument()

    const savedRows = () => within(savedInventory).getAllByRole('row').slice(1).map((row) => row.textContent ?? '')
    const patternHeader = within(savedInventory).getByRole('columnheader', { name: 'Pattern' })
    expect(patternHeader).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(within(patternHeader).getByRole('button', { name: 'Pattern' }))
    expect(patternHeader).toHaveAttribute('aria-sort', 'descending')
    expect(savedRows()[0]).toContain('Twinkle')

    const statusHeader = within(savedInventory).getByRole('columnheader', { name: 'Status' })
    fireEvent.click(within(statusHeader).getByRole('button', { name: 'Status' }))
    expect(statusHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(savedRows().map((row) => row.match(/Twinkle|AuroraSphere|Measured wall Show/)?.[0]))
      .toEqual(['Twinkle', 'Measured wall Show', 'AuroraSphere'])
    fireEvent.click(within(statusHeader).getByRole('button', { name: 'Status' }))
    expect(statusHeader).toHaveAttribute('aria-sort', 'descending')
    expect(savedRows().map((row) => row.match(/Twinkle|AuroraSphere|Measured wall Show/)?.[0]))
      .toEqual(['AuroraSphere', 'Measured wall Show', 'Twinkle'])

    const changedProfile = {
      ...profile,
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.type === 'power-cap' ? { ...transform, enabled: true } : transform,
      ),
    }
    rerender(pane(changedProfile))
    expect(within(savedInventory).getAllByLabelText(statusDotName.stale)).toHaveLength(2)
    expect(provider.listCalls).toBe(1)

    useControllerStore.setState({
      controllerReconciliations: {
        'ctrl-1': {
          phase: 'attention',
          managedCount: 3,
          unmanagedCount: 1,
          completedCount: 0,
          programs: [
            { programId: 'DEV1', bindingKey: 'pat-1', name: 'Twinkle', state: 'queued' },
            { programId: 'DEV2', bindingKey: 'demo:AuroraSphere', name: 'AuroraSphere', state: 'updating' },
            { programId: 'SHOW1', bindingKey: 'show:show-1', name: 'Measured wall Show', state: 'failed' },
          ],
        },
      },
    })
    for (const status of [statusDotName.queued, statusDotName.updating, statusDotName.failed]) {
      expect(await screen.findByLabelText(status)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Twinkle' }))
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'pat-1' },
    })

    provider.programs = [...provider.programs, { id: 'FOREIGN2', name: 'New Pattern 14' }]
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved Patterns' }))
    expect(await screen.findByText('New Pattern 14')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other Patterns (2)' })).toBeInTheDocument()
    expect(provider.listCalls).toBe(2)
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key')
    consoleError.mockRestore()
  })

  it('retires a CURRENT claim while an unchanged saved-program id rereads its new push record (#777)', async () => {
    const profile = seedProfile()
    const provider = new ProgramListProvider()
    provider.programs = [{ id: 'DEV1', name: 'Twinkle' }]
    const currentRecords: ControllerPushRecords = {
      '192.168.8.224': {
        'pat-1': {
          transforms: [],
          artifactHash: 'first-hash',
          stampedAt: '2026-08-08T00:00:00.000Z',
          name: 'Twinkle',
          profileSignature: controllerProfileArtifactSignature(profile, 'pat-1', { mapDim: 2 }),
        },
      },
    }
    let records = currentRecords
    let readCount = 0
    let resolveReread!: (records: ControllerPushRecords) => void
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'saved-program-write-revision',
      getControllerBindings: async () => ({ '192.168.8.224': { 'pat-1': 'DEV1' } }),
      getPushRecords: () => {
        readCount += 1
        return readCount === 1
          ? Promise.resolve(records)
          : new Promise((resolve) => { resolveReread = resolve })
      },
      setPushRecords: async (next) => { records = next },
    })
    setControllerProvider(provider)
    useControllerPanelStore.setState({
      programs: provider.programs,
      programsByController: { '192.168.8.224': provider.programs },
    })
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
          liveEpoch: 7,
        },
      },
    })

    render(<ControllerSavedProgramsPane profile={profile} />)
    expect(await screen.findByLabelText(statusDotName.current)).toBeInTheDocument()

    useControllerStore.setState({
      controllerReconciliations: {
        'ctrl-1': {
          phase: 'running',
          managedCount: 1,
          unmanagedCount: 0,
          completedCount: 0,
          programs: [
            { programId: 'DEV1', bindingKey: 'pat-1', name: 'Twinkle', state: 'updating' },
          ],
        },
      },
    })

    await act(async () => {
      await setPushRecords({
        '192.168.8.224': {
          'pat-1': { ...currentRecords['192.168.8.224']['pat-1'], artifactHash: 'second-hash' },
        },
      })
    })
    expect(screen.queryByText(/reading saved Patterns/i)).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Saved PXLBLZ Patterns' })).toBeInTheDocument()
    expect(screen.getByLabelText(statusDotName.updating)).toBeInTheDocument()
    expect(screen.queryByLabelText(statusDotName.current)).not.toBeInTheDocument()

    resolveReread(records)
    useControllerStore.setState({ controllerReconciliations: {} })
    expect(await screen.findByLabelText(statusDotName.current)).toBeInTheDocument()
    expect(readCount).toBe(2)
  })

  it('derives PUSH AGAIN after a saved Pattern source PATCH follows completed reconciliation (#804)', async () => {
    const profile = seedProfile()
    const originalSource = 'export function render(index) { hsv(index / pixelCount, 1, 1) }'
    const editedSource = 'export function render(index) { hsv(index / pixelCount, 1, wave(time(0.1))) }'
    const pattern: PatternRecord = {
      id: 'pat-1',
      name: 'Twinkle',
      src: originalSource,
      controls: {},
      updatedAt: 1,
    }
    usePatternStore.setState({ userPatterns: [pattern] })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updatePattern: async () => {},
      updateControllerProfile: async () => {},
    })
    renderLiveProgramInventory(profile, {
      storageId: 'saved-program-source-patch',
      programs: [{ id: 'DEV1', name: pattern.name }],
      bindings: { [pattern.id]: 'DEV1' },
      pushRecords: {
        [pattern.id]: {
          transforms: [],
          artifactHash: 'saved-artifact',
          sourceHash: artifactHash(originalSource),
          stampedAt: '2026-08-10T00:00:00.000Z',
          name: pattern.name,
          profileSignature: controllerProfileArtifactSignature(profile, pattern.id, { mapDim: 2 }),
        },
      },
    })
    expect(await screen.findByLabelText(statusDotName.current)).toBeInTheDocument()

    useControllerStore.setState({
      controllerReconciliations: {
        [profile.id]: {
          phase: 'current',
          managedCount: 1,
          unmanagedCount: 0,
          completedCount: 1,
          programs: [{
            programId: 'DEV1',
            bindingKey: pattern.id,
            name: pattern.name,
            state: 'current',
          }],
        },
      },
    })
    await act(async () => {
      await usePatternStore.getState().updatePatternSrc(pattern.id, editedSource)
    })

    expect(await screen.findByLabelText(statusDotName.stale)).toBeInTheDocument()
    expect(screen.queryByLabelText(statusDotName.current)).not.toBeInTheDocument()
  })

  it('moves the aggregate summary and the rows to stale together on a profile change (#874)', async () => {
    const profile = { ...seedProfile(), keepPatternsUpToDate: true }
    useControllerProfileStore.setState({ profiles: [profile] })
    const names = ['Alpha', 'Bravo', 'Charlie'] as const
    const record = (name: string, bindingKey: string) => ({
      transforms: [],
      artifactHash: `${bindingKey}-artifact`,
      stampedAt: '2026-08-16T00:00:00.000Z',
      name,
      profileSignature: controllerProfileArtifactSignature(profile, bindingKey, { mapDim: 2 }),
    })
    const provider = renderLiveProgramInventory(profile, {
      storageId: 'saved-program-summary-freshness',
      programs: names.map((name, index) => ({ id: `DEV${index + 1}`, name })),
      bindings: { 'pat-1': 'DEV1', 'pat-2': 'DEV2', 'pat-3': 'DEV3' },
      pushRecords: {
        'pat-1': record('Alpha', 'pat-1'),
        'pat-2': record('Bravo', 'pat-2'),
        'pat-3': record('Charlie', 'pat-3'),
      },
    })
    expect(await screen.findAllByLabelText(statusDotName.current)).toHaveLength(3)

    // A completed reconciliation snapshot still says every row is current.
    act(() => {
      useControllerStore.setState({
        controllerReconciliations: {
          [profile.id]: {
            phase: 'running',
            managedCount: 3,
            unmanagedCount: 0,
            completedCount: 3,
            programs: names.map((name, index) => ({
              programId: `DEV${index + 1}`,
              bindingKey: `pat-${index + 1}`,
              name,
              state: 'current' as const,
            })),
          },
        },
      })
    })
    const summary = () => screen.getByLabelText('Managed Pattern refresh progress')
    expect(summary()).toHaveTextContent('3 current, 0 to push again, 0 updating, 0 queued, 0 failed')

    // A code-affecting profile edit moves every row to Push again; the summary
    // must say the same on the very same render, not after the queue catches up.
    const edited = {
      ...profile,
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.type === 'power-cap' ? { ...transform, enabled: true } : transform,
      ),
    }
    act(() => {
      useControllerProfileStore.setState({ profiles: [edited] })
      provider.rerender(edited)
    })
    expect(screen.getAllByLabelText(statusDotName.stale)).toHaveLength(3)
    expect(screen.queryByLabelText(statusDotName.current)).not.toBeInTheDocument()
    expect(summary()).toHaveTextContent('0 current, 3 to push again, 0 updating, 0 queued, 0 failed')

    // Once the reconciliation queues and syncs, rows and summary move together.
    act(() => {
      useControllerStore.setState({
        controllerReconciliations: {
          [profile.id]: {
            phase: 'running',
            managedCount: 3,
            unmanagedCount: 0,
            completedCount: 0,
            programs: [
              { programId: 'DEV1', bindingKey: 'pat-1', name: 'Alpha', state: 'updating' },
              { programId: 'DEV2', bindingKey: 'pat-2', name: 'Bravo', state: 'queued' },
              { programId: 'DEV3', bindingKey: 'pat-3', name: 'Charlie', state: 'queued' },
            ],
          },
        },
      })
    })
    expect(screen.getByLabelText(statusDotName.updating)).toBeInTheDocument()
    expect(screen.getAllByLabelText(statusDotName.queued)).toHaveLength(2)
    expect(summary()).toHaveTextContent('0 current, 0 to push again, 1 updating, 2 queued, 0 failed')
  })

  it('does not claim a saved Pattern needs another push while the installed map is unknown', async () => {
    const profile = seedProfile()
    renderLiveProgramInventory(profile, {
      storageId: 'saved-program-map-read-error',
      programs: [{ id: 'DEV1', name: 'Twinkle' }],
      bindings: { 'pat-1': 'DEV1' },
      pushRecords: {
        'pat-1': {
          transforms: [],
          artifactHash: 'twinkle-hash',
          stampedAt: '2026-08-08T00:00:00.000Z',
          name: 'Twinkle',
          profileSignature: controllerProfileArtifactSignature(profile, 'pat-1', { mapDim: 2 }),
        },
      },
      mapDim: 2,
      installedMap: { status: 'error', message: 'map read timed out' },
    })

    expect(await screen.findByLabelText(statusDotName.unmanaged)).toBeInTheDocument()
    expect(screen.queryByLabelText(statusDotName.stale)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(statusDotName.current)).not.toBeInTheDocument()
  })

  it('links a compiled legacy built-in Show artifact to its canonical Studio Show source', async () => {
    enableShowtime()
    const profile = seedProfile()
    renderLiveProgramInventory(profile, {
      storageId: 'built-in-show-inventory-test',
      programs: [{ id: 'REMIX1', name: 'Coronal Mass Ejection' }],
      bindings: {
        'show:teaser-cme-01': 'REMIX1',
      },
      pushRecords: {
        'show:teaser-cme-01': {
          transforms: [],
          artifactHash: 'remix-hash',
          stampedAt: '2026-08-07T00:00:00.000Z',
          name: 'Coronal Mass Ejection Remix',
          showOutputContract: {
            version: 1,
            kind: 'portable-2d',
            dimensions: [2],
            mapClasses: ['surface'],
            resolution: 'variable',
          },
        },
      },
    })

    const showLink = await screen.findByRole('button', {
      name: 'Coronal Mass Ejection Remix',
    })
    expect(showLink).toHaveClass('truncate')
    expect(screen.getByText('Show output · Portable 2D')).toBeInTheDocument()
    expect(screen.queryByText('Studio Show missing')).not.toBeInTheDocument()

    fireEvent.click(showLink)

    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'shows', id: 'stock-show-remix-coronal-mass-ejection' },
    })
  })

  it('keeps saved Show facts visible but removes source access without showtime', async () => {
    const profile = seedProfile()
    renderLiveProgramInventory(profile, {
      storageId: 'gated-built-in-show-inventory-test',
      programs: [{ id: 'REMIX1', name: 'Coronal Mass Ejection' }],
      bindings: {
        'show:teaser-cme-01': 'REMIX1',
      },
      pushRecords: {
        'show:teaser-cme-01': {
          transforms: [],
          artifactHash: 'remix-hash',
          stampedAt: '2026-08-07T00:00:00.000Z',
          name: 'Coronal Mass Ejection Remix',
          showOutputContract: {
            version: 1,
            kind: 'portable-2d',
            dimensions: [2],
            mapClasses: ['surface'],
            resolution: 'variable',
          },
        },
      },
    })

    expect(await screen.findByText('Coronal Mass Ejection Remix')).toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: 'Coronal Mass Ejection Remix',
    })).not.toBeInTheDocument()
    expect(screen.getByText('Show output · Portable 2D')).toBeInTheDocument()
  })

  it('prefers an exact personal Show source over a built-in legacy alias', async () => {
    enableShowtime()
    const profile = seedProfile()
    const personalShow = {
      ...stockShowById('stock-show-remix-coronal-mass-ejection')!.show,
      id: 'teaser-cme-01',
      name: 'My original CME Show',
    }
    useShowStore.setState({ shows: [personalShow], showsLoaded: true })
    renderLiveProgramInventory(profile, {
      storageId: 'personal-show-alias-precedence-test',
      programs: [{ id: 'REMIX1', name: 'Coronal Mass Ejection' }],
      bindings: { 'show:teaser-cme-01': 'REMIX1' },
      pushRecords: {
        'show:teaser-cme-01': {
          transforms: [],
          artifactHash: 'personal-remix-hash',
          stampedAt: '2026-08-07T00:00:00.000Z',
          name: personalShow.name,
        },
      },
    })

    const showLink = await screen.findByRole('button', { name: personalShow.name })
    fireEvent.click(showLink)

    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'shows', id: personalShow.id },
    })
  })

  it('resolves an edited built-in Installation Show through the same Show source path', async () => {
    enableShowtime()
    const profile = seedProfile()
    const showId = 'stock-show-showcase-redline-installation'
    const pristine = stockShowById(showId)!.show
    useShowStore.setState({
      stockShowDrafts: {
        [showId]: { ...pristine, name: 'Redline Installation - tuned' },
      },
    })
    renderLiveProgramInventory(profile, {
      storageId: 'built-in-installation-inventory-test',
      programs: [{ id: 'REDLINE1', name: 'Redline Installation' }],
      bindings: { [`show:${showId}`]: 'REDLINE1' },
      pushRecords: {
        [`show:${showId}`]: {
          transforms: [],
          artifactHash: 'redline-hash',
          stampedAt: '2026-08-07T00:00:00.000Z',
          name: 'Redline Installation - tuned',
          showOutputContract: {
            version: 1,
            kind: 'installation',
            pixelCount: 2_000,
            outputMap: {
              kind: 'custom',
              name: 'Redline stage',
              fingerprint: '22222222',
            },
          },
        },
      },
    })

    const showLink = await screen.findByRole('button', { name: 'Redline Installation - tuned' })
    expect(screen.getByText('Show output · Installation · 2000 px')).toBeInTheDocument()

    fireEvent.click(showLink)

    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'shows', id: showId },
    })
  })

  it('imports recovered foreign source as a new Studio pattern', async () => {
    const profile = seedProfile()
    const provider = new ProgramListProvider()
    provider.programs = [{ id: 'FOREIGN1', name: 'sound bar kit' }]
    provider.recoveredPrograms.set('FOREIGN1', {
      programId: 'FOREIGN1',
      deviceName: 'sound bar kit',
      sourceCode: 'export function render(index) { rgb(index, 0, 1) }',
      stamp: null,
    })
    const createPattern = vi.fn(async (_record: PatternRecord) => {})
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      createPattern,
      updateControllerProfile: async () => {},
    })
    setControllerProvider(provider)
    useControllerPanelStore.setState({
      programsByController: { '192.168.8.224': provider.programs },
    })
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })

    render(<ControllerSavedProgramsPane profile={profile} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Import sound bar kit' }))
    expect(await screen.findByRole('heading', { name: 'Import controller pattern?' })).toBeInTheDocument()
    expect(screen.getByText('Name · recovered')).toBeInTheDocument()
    expect(screen.getByText('Studio id · new')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import pattern' }))

    await waitFor(() => expect(createPattern).toHaveBeenCalledTimes(1))
    const record = createPattern.mock.calls[0]![0]
    expect(record).toMatchObject({
      name: 'sound bar kit',
      src: 'export function render(index) { rgb(index, 0, 1) }',
      controls: {},
    })
    expect(record.id).toEqual(expect.any(String))
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: record.id },
    })
  })

  it('shows a clean empty state when a live Controller has no saved programs', async () => {
    const profile = seedProfile()
    setControllerProvider(new ProgramListProvider())
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })

    render(<ControllerSavedProgramsPane profile={profile} />)

    expect(await screen.findByText(/no PXLBLZ Patterns are saved/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Saved PXLBLZ Patterns (0)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other Patterns (0)' })).toBeInTheDocument()
  })

  it('keeps Power field interactions from bubbling to selectable ancestors', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 240,
        electricalProfile: {
          ledPresetId: 'ws2812-5v-individual',
          supplyBudget: { value: 3, unit: 'amps' },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'derived' as const }
            : transform
        )),
      }],
      profilesLoaded: true,
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })
    const onAncestorClick = vi.fn()
    const onAncestorKeyDown = vi.fn()

    render(
      <div onClick={onAncestorClick} onKeyDown={onAncestorKeyDown}>
        <ControllerProfilePage profileId="ctrl-1" />
      </div>,
    )

    const budgetInput = await screen.findByRole('textbox', { name: 'Continuous LED supply budget' })
    expect(budgetInput).toHaveValue('3')
    onAncestorClick.mockClear()
    fireEvent.change(budgetInput, { target: { value: '4.5' } })
    fireEvent.keyDown(budgetInput, { key: 'Enter' })

    await waitFor(() => {
      const profile = useControllerProfileStore.getState().profiles[0]
      expect(profile.electricalProfile).toMatchObject({
        supplyBudget: { value: 4.5, unit: 'amps' },
      })
    })

    fireEvent.click(screen.getByRole('radio', { name: 'Fixed cap' }))
    // The segment is a deliberate button action; the invariant is that *field*
    // interactions never bubble into selectable ancestors.
    onAncestorClick.mockClear()
    const slider = await screen.findByRole('slider', { name: 'Power cap duty percent' })
    fireEvent.click(slider)
    fireEvent.keyDown(slider, { key: 'ArrowUp' })

    expect(onAncestorClick).not.toHaveBeenCalled()
    expect(onAncestorKeyDown).not.toHaveBeenCalled()
  })

  it('keeps an enforced direct duty cap visible and operable with no power model (#772)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'direct' as const, maxDuty: 0.4 }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // The cap already changes every generated Pattern, so it has to be visible
    // and reversible without first configuring an unrelated power model (#772).
    const limitPower = screen.getByRole('checkbox', { name: 'Limit power' })
    expect(limitPower).toBeChecked()
    const slider = screen.getByRole('slider', { name: 'Power cap duty percent' })
    expect(screen.getByText('40%')).toBeInTheDocument()
    // Only the equivalence readout is missing, and it says how to earn it (#786).
    expect(screen.getByText(/Choose the LED construction or enter a measured total/))
      .toBeInTheDocument()
    // Deriving stays unavailable without an address count, with the reason stated.
    const derived = screen.getByRole('radio', { name: 'From load and budget' })
    expect(derived).toBeDisabled()
    expect(derived).toHaveAttribute('title', 'Connect this Controller to supply its address count.')

    fireEvent.change(slider, { target: { value: '0.15' } })

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'power-cap'))
        .toMatchObject({ enabled: true, mode: 'direct', maxDuty: 0.15 })
    })

    fireEvent.click(limitPower)

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'power-cap'))
        .toMatchObject({ enabled: false, maxDuty: 0.15 })
    })
    // Off means off: the section collapses to a summary instead of dimming (#786).
    expect(screen.getByText(/Power is not limited/)).toBeInTheDocument()
    expect(screen.getByText('15% fixed cap')).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Power cap duty percent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Fixed cap' })).not.toBeInTheDocument()
  })

  it('derives the duty cap from a unit-labeled power budget without making pixel count editable', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{ ...profile, lastKnownPixelCount: 240 }],
      profilesLoaded: true,
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Limit power' }))
    // Choosing the derived side configures the default model on the way (#786).
    fireEvent.click(await screen.findByRole('radio', { name: 'From load and budget' }))
    await screen.findByRole('textbox', { name: 'Continuous LED supply budget' })
    fireEvent.click(screen.getAllByRole('button', { name: 'watts' })[0])
    const budget = screen.getByRole('textbox', { name: 'Continuous LED supply budget' })
    fireEvent.change(budget, { target: { value: '36' } })
    fireEvent.keyDown(budget, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText('72.0 W')).toBeInTheDocument()
    })
    await waitFor(() => expect(screen.getAllByText('50%').length).toBeGreaterThan(0))

    expect(screen.queryByRole('spinbutton', { name: 'Pixel count' })).not.toBeInTheDocument()

    await waitFor(() => {
      const savedProfile = useControllerProfileStore.getState().profiles[0]
      const transform = savedProfile.globalTransforms
        .find((candidate) => candidate.type === 'power-cap')
      expect(transform).toMatchObject({
        mode: 'derived',
        maxDuty: 0.5,
      })
      expect(savedProfile.electricalProfile).toMatchObject({
        ledPresetId: 'ws2812-5v-individual',
        supplyBudget: { value: 36, unit: 'watts' },
      })
    })
  })

  it('does not invent an address count for an offline electrical profile', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        electricalProfile: {
          ledPresetId: 'ws2815-12v-individual',
          supplyBudget: { value: 24, unit: 'watts' },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'derived' as const }
            : transform
        )),
      }],
      profilesLoaded: true,
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByText('addresses unknown')).toBeInTheDocument()
    expect(screen.getByText(/PXLBLZ will not invent one/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Measured total' })).toBeDisabled()
    expect(screen.queryByRole('spinbutton', { name: 'Pixel count' })).not.toBeInTheDocument()
  })

  it('renders a legacy custom construction as a measured total and returns to the default preset (#786)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 301,
        electricalProfile: {
          ledPresetId: 'custom',
          supplyBudget: { value: 3, unit: 'amps' },
          voltageOverride: 5,
          loadOverride: {
            fullWhite: { value: 60, unit: 'watts' },
            source: 'measured',
            atPixelCount: 300,
          },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'derived' as const, maxDuty: 0.6 }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)
    // A custom construction has no preset estimate, so it renders as the
    // measured-total side of the segment, keeping the stale-count warning.
    expect(screen.getByRole('radio', { name: 'Measured total' })).toBeChecked()
    expect(screen.getByText(/recorded at 300 addresses/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'LED construction preset' })).not.toBeInTheDocument()

    // Returning to the estimate side picks the default preset: there is no
    // Custom entry in the picker any more (#786).
    fireEvent.click(screen.getByRole('radio', { name: 'Construction estimate' }))

    await waitFor(() => {
      const savedProfile = useControllerProfileStore.getState().profiles[0]
      expect(savedProfile.electricalProfile).toMatchObject({
        ledPresetId: 'ws2812-5v-individual',
        supplyBudget: { value: 3, unit: 'amps' },
      })
      expect(savedProfile.electricalProfile?.loadOverride).toBeUndefined()
    })
  })

  it('shows the effective derived duty after the address count changes', async () => {
    const profile = seedProfile()
    const configuredProfile = {
      ...profile,
      lastKnownPixelCount: 240,
      electricalProfile: {
        ledPresetId: 'ws2812-5v-individual' as const,
        supplyBudget: { value: 36, unit: 'watts' as const },
      },
      globalTransforms: profile.globalTransforms.map((transform) => (
        transform.type === 'power-cap'
          ? { ...transform, enabled: true, mode: 'derived' as const, maxDuty: 0.5 }
          : transform
      )),
    }
    useControllerProfileStore.setState({ profiles: [configuredProfile], profilesLoaded: true })

    render(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0)

    act(() => {
      useControllerProfileStore.setState({
        profiles: [{ ...configuredProfile, lastKnownPixelCount: 120 }],
      })
    })

    await waitFor(() => expect(screen.getAllByText('100%').length).toBeGreaterThan(0))
  })

  it('disables A/W reinterpretation when a custom model has no conversion voltage', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 50,
        electricalProfile: {
          ledPresetId: 'custom',
          supplyBudget: { value: 4, unit: 'amps' },
          loadOverride: {
            fullWhite: { value: 8, unit: 'amps' },
            source: 'measured',
            atPixelCount: 50,
          },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'derived' as const }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // Both watts toggles — supply budget and full-white total — state the reason.
    const wattsButtons = screen.getAllByRole('button', { name: 'watts' })
    expect(wattsButtons).toHaveLength(2)
    for (const button of wattsButtons) {
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute(
        'title',
        'Enter the supply voltage to convert between amps and watts',
      )
    }
  })

  it('commits the displayed conversion voltage for a custom no-voltage model', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 50,
        electricalProfile: {
          ledPresetId: 'custom',
          supplyBudget: { value: 4, unit: 'amps' },
          loadOverride: {
            fullWhite: { value: 8, unit: 'amps' },
            source: 'measured',
            atPixelCount: 50,
          },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'derived' as const }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)
    const voltage = screen.getByRole('textbox', { name: 'Power supply voltage' })
    expect(voltage).toHaveValue('')
    fireEvent.change(voltage, { target: { value: '5' } })
    fireEvent.keyDown(voltage, { key: 'Enter' })

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].electricalProfile?.voltageOverride).toBe(5)
      for (const button of screen.getAllByRole('button', { name: 'watts' })) {
        expect(button).toBeEnabled()
      }
    })
  })

  it('drops a pending slider commit when the user switches to the derived cap (#786)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 240,
        electricalProfile: {
          ledPresetId: 'ws2812-5v-individual',
          supplyBudget: { value: 3, unit: 'amps' },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'direct' as const, maxDuty: 0.25 }
            : transform
        )),
      }],
      profilesLoaded: true,
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // Drag, then switch modes inside the debounce window: the pending
    // set-cap-duty must not fire later and force the mode back to direct.
    fireEvent.change(screen.getByRole('slider', { name: 'Power cap duty percent' }), {
      target: { value: '0.6' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'From load and budget' }))

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'power-cap'))
        .toMatchObject({ mode: 'derived' })
    })
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(useControllerProfileStore.getState().profiles[0].globalTransforms
      .find((transform) => transform.type === 'power-cap'))
      .toMatchObject({ mode: 'derived' })
  })

  it('flushes a pending slider commit on unmount instead of losing it (#786)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'direct' as const, maxDuty: 0.25 }
            : transform
        )),
      }],
      profilesLoaded: true,
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })

    const { unmount } = render(<ControllerProfilePage profileId="ctrl-1" />)

    fireEvent.change(screen.getByRole('slider', { name: 'Power cap duty percent' }), {
      target: { value: '0.15' },
    })
    unmount()

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'power-cap'))
        .toMatchObject({ mode: 'direct', maxDuty: 0.15 })
    })
  })

  it('keeps a pending slider commit on its own profile across rapid navigation (#786)', async () => {
    const profileA = seedProfile()
    const profileB = {
      ...defaultControllerProfile({ id: 'ctrl-2', name: 'Second' }),
      deviceId: 'dev-2',
    }
    const withEnabledDirectCap = (profile: typeof profileA) => ({
      ...profile,
      globalTransforms: profile.globalTransforms.map((transform) => (
        transform.type === 'power-cap'
          ? { ...transform, enabled: true, mode: 'direct' as const, maxDuty: 0.25 }
          : transform
      )),
    })
    useControllerProfileStore.setState({
      profiles: [withEnabledDirectCap(profileA), withEnabledDirectCap(profileB)],
      profilesLoaded: true,
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })

    const { rerender, unmount } = render(<ControllerProfilePage profileId="ctrl-1" />)
    fireEvent.change(screen.getByRole('slider', { name: 'Power cap duty percent' }), {
      target: { value: '0.6' },
    })
    // Switching profiles inside the debounce window flushes the drag to the
    // profile it belonged to, never to the newly selected one.
    rerender(<ControllerProfilePage profileId="ctrl-2" />)
    unmount()

    await waitFor(() => {
      const profiles = useControllerProfileStore.getState().profiles
      expect(profiles.find((profile) => profile.id === 'ctrl-1')?.globalTransforms
        .find((transform) => transform.type === 'power-cap'))
        .toMatchObject({ maxDuty: 0.6 })
      expect(profiles.find((profile) => profile.id === 'ctrl-2')?.globalTransforms
        .find((transform) => transform.type === 'power-cap'))
        .toMatchObject({ maxDuty: 0.25 })
    })
  })

  it('collapses to a summary while power is not limited (#786)', () => {
    seedProfile()

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByRole('checkbox', { name: 'Limit power' })).not.toBeChecked()
    expect(screen.getByText(/Power is not limited/)).toBeInTheDocument()
    expect(screen.getByText('25% fixed cap')).toBeInTheDocument()
    // Off means off: no gates, fields, or dimmed-but-editable controls (#786).
    expect(screen.queryByRole('radio', { name: 'Fixed cap' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Power cap duty percent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'LED construction preset' })).not.toBeInTheDocument()
  })

  it('says what a fixed cap holds the installation to once a load exists (#786)', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 256,
        electricalProfile: {
          ledPresetId: 'ws2812-5v-individual',
          supplyBudget: { value: 3, unit: 'amps' },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'direct' as const, maxDuty: 0.25 }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    // 256 addr × 0.3 W = 76.8 W full white; 25% of that is 19.2 W ≈ 3.8 A at 5V.
    expect(screen.getByText(/25% of/)).toBeInTheDocument()
    expect(screen.getByText('76.8 W')).toBeInTheDocument()
    expect(screen.getByText(/holds the installation to about/)).toBeInTheDocument()
    expect(screen.getByText('19.2 W / 3.8 A')).toBeInTheDocument()
  })

  it('names chipsets on the construction presets and drops the Custom entry (#786)', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 256,
        electricalProfile: {
          ledPresetId: 'ws2812-5v-individual',
          supplyBudget: { value: 3, unit: 'amps' },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'direct' as const }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    const construction = screen.getByRole('combobox', { name: 'LED construction preset' })
    expect(within(construction).getByRole('option', { name: '5V individual RGB (WS2812B / SK6812)' })).toBeInTheDocument()
    expect(within(construction).getByRole('option', { name: '12V 3-LED segments (WS2811)' })).toBeInTheDocument()
    expect(within(construction).getByRole('option', { name: '12V individual RGB, backup data (WS2815)' })).toBeInTheDocument()
    expect(within(construction).queryByRole('option', { name: /Custom/ })).not.toBeInTheDocument()
  })

  it('rounds converted quantities for display instead of surfacing float noise (#786)', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 300,
        electricalProfile: {
          ledPresetId: 'ws2812-5v-individual',
          supplyBudget: { value: 3, unit: 'amps' },
          voltageOverride: 12,
          loadOverride: {
            fullWhite: { value: 8.333333333333334, unit: 'amps' },
            source: 'measured',
            atPixelCount: 300,
          },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, enabled: true, mode: 'derived' as const }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByRole('textbox', { name: 'Full-white installation total' })).toHaveValue('8.33')
  })

  it('imports the live controller pixel map as a named frozen user map from the pane header', async () => {
    const profile = seedProfile()
    const created: MapRecord[] = []
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
      createMap: async (record) => {
        created.push(record)
      },
    })
    setControllerProvider(new MapReadbackProvider())
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })

    render(<ControllerProfileHeaderActions profile={profile} />)

    fireEvent.click(screen.getByRole('button', { name: /import map/i }))
    expect(await screen.findByRole('textbox', { name: 'Imported map name' })).toHaveValue('Burner bag map')
    expect(screen.getByText(/4 px \/ 2D \/ irregular/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^import map$/i }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({
      name: 'Burner bag map',
      dim: 2,
      generator: 'custom',
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 1],
      ],
      importMetadata: {
        kind: 'controller',
        controllerName: 'Burner bag',
        deviceId: 'pixelblaze_pb32_abc',
        ip: '192.168.8.224',
        mapHash: READBACK_HASH,
        pixelCount: 4,
        normalization: 'device-fill-normalized',
      },
    })
    await waitFor(() => {
      expect(useMapStore.getState().userMaps[0].id).toBe(created[0].id)
      expect(useRouterStore.getState().route).toEqual({
        kind: 'studio',
        entity: { kind: 'maps', id: created[0].id },
      })
    })
  })

  it('opens an existing Studio map instead of importing a duplicate when the installed map matches', async () => {
    const profile = seedProfile()
    const created: MapRecord[] = []
    const matchingMap: MapRecord = {
      id: 'map-existing',
      name: 'Existing grid',
      dim: 2,
      generator: 'custom',
      params: {},
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 1],
      ],
      updatedAt: 1,
    }
    useMapStore.setState({ userMaps: [matchingMap], mapsLoaded: true })
    useControllerProfileStore.setState({
      profiles: [
        {
          ...profile,
          mapFingerprints: [
            {
              hash: READBACK_HASH,
              mapId: matchingMap.id,
              mapName: matchingMap.name,
              devicePixelCount: 4,
              pushedAt: 2,
            },
          ],
        },
      ],
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
      createMap: async (record) => {
        created.push(record)
      },
    })
    setControllerProvider(new MapReadbackProvider())
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })

    render(<ControllerProfileHeaderActions profile={useControllerProfileStore.getState().profiles[0]} />)

    fireEvent.click(screen.getByRole('button', { name: /import map/i }))
    expect(await screen.findByText(/matches "Existing grid"/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Imported map name' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^open map$/i }))

    expect(created).toHaveLength(0)
    await waitFor(() => {
      expect(useRouterStore.getState().route).toEqual({
        kind: 'studio',
        entity: { kind: 'maps', id: matchingMap.id },
      })
    })
  })
})

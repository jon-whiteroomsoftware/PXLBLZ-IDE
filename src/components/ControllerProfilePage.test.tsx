import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ControllerProfilePage } from './ControllerProfilePage'
import { ControllerProfileHeaderActions } from './ControllerProfileHeaderActions'
import { ControllerSavedProgramsPane } from './ControllerSavedProgramsPane'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
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
import type { ControllerPushRecord } from '@/engine/controllerPushRecord'
import {
  demoControllerMetadataStorage,
  resetControllerMetadataStorage,
  setControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import {
  controllerPanelInitialState,
  useControllerPanelStore,
} from '@/store/controllerPanelStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { routerInitialState, useRouterStore } from '@/store/routerStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import { stockShowById } from '@/pixelblaze/stock/shows'

const READBACK_POINTS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [0, 1],
]
const READBACK_HASH = '06427689'

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

class ProgramListProvider extends MapReadbackProvider {
  programs: Array<{ id: string; name: string }> = []
  recoveredPrograms = new Map<string, RecoveredSavedProgram>()
  listCalls = 0

  listPrograms() {
    this.listCalls += 1
    return Promise.resolve(this.programs)
  }

  readSavedProgram(programId: string) {
    return Promise.resolve(this.recoveredPrograms.get(programId) ?? null)
  }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  useControllerProfileStore.setState(controllerProfileInitialState)
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
  },
) {
  const provider = new ProgramListProvider()
  provider.programs = fixture.programs
  setControllerMetadataStorage({
    ...demoControllerMetadataStorage,
    id: fixture.storageId,
    getControllerBindings: async () => ({ '192.168.8.224': fixture.bindings }),
    getPushRecords: async () => ({ '192.168.8.224': fixture.pushRecords }),
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
  render(<ControllerSavedProgramsPane profile={profile} />)
}

describe('ControllerProfilePage', () => {
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

  it('no longer presents a separate Pattern bindings or Global transforms section (#772)', () => {
    seedProfile()

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.queryByRole('heading', { name: 'Pattern bindings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Global transforms' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add binding' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Hardware brightness input' })).not.toBeInTheDocument()
  })

  it('removes the Zones editor from the Controller profile page (#772, follow-up #775)', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 256,
        zones: [{ id: 'quad-1', name: 'quad-1', ranges: [{ start: 0, end: 63 }] }],
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.queryByRole('heading', { name: 'Zones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'quad-1 zone ranges' })).not.toBeInTheDocument()
    // The field itself stays persisted for Show compilation.
    expect(useControllerProfileStore.getState().profiles[0].zones).toHaveLength(1)
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

  it('badges the Pattern, not the use, when a live push predates the current profile (#772)', async () => {
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
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'push-staleness',
      getControllerBindings: async () => ({ '192.168.8.224': { 'pat-line': 'DEV_LINE' } }),
      getPushRecords: async () => ({
        '192.168.8.224': {
          'pat-line': {
            transforms: [],
            artifactHash: 'h',
            stampedAt: '2026-08-07T00:00:00.000Z',
            name: 'Line Dancer',
            profileSignature: 'an-older-signature',
          },
        },
      }),
    })

    // Offline the map dimension is unknown, so no badge may be claimed.
    const { rerender } = render(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.queryByText('push again')).not.toBeInTheDocument()

    useControllerPanelStore.setState({
      programsByController: { '192.168.8.224': [{ id: 'DEV_LINE', name: 'Line Dancer' }] },
    })
    act(() => {
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
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)

    expect(await screen.findByText('push again')).toHaveAttribute(
      'title',
      'This Pattern was pushed before the current Controller settings.',
    )
  })

  it('claims no push state while the Controller metadata read is unfinished (#772)', async () => {
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
    const goLive = () => {
      useControllerPanelStore.setState({
        programsByController: { '192.168.8.224': [{ id: 'DEV_LINE', name: 'Line Dancer' }] },
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

    // A read that never settles is not evidence that nothing was pushed.
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'push-records-pending',
      getControllerBindings: async () => ({ '192.168.8.224': { 'pat-line': 'DEV_LINE' } }),
      getPushRecords: () => new Promise(() => {}),
    })
    goLive()
    const pending = render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(await screen.findByText('Line Dancer')).toBeInTheDocument()
    expect(screen.queryByText('not pushed')).not.toBeInTheDocument()
    pending.unmount()

    // Neither is a read that failed outright.
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'push-records-rejected',
      getControllerBindings: async () => ({ '192.168.8.224': { 'pat-line': 'DEV_LINE' } }),
      getPushRecords: async () => {
        throw new Error('metadata storage unavailable')
      },
    })
    goLive()
    const rejected = render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(await screen.findByText('Line Dancer')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('not pushed')).not.toBeInTheDocument()
    })
    rejected.unmount()

    // A completed read that genuinely holds no record for this Pattern does say so.
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'push-records-empty',
      getControllerBindings: async () => ({ '192.168.8.224': { 'pat-line': 'DEV_LINE' } }),
      getPushRecords: async () => ({ '192.168.8.224': {} }),
    })
    goLive()
    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(await screen.findByText('not pushed')).toBeInTheDocument()
  })

  it('retires a completed push read as soon as a later read is in flight or fails (#772)', async () => {
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

    // Each entry is one whole read of the push records, taken in order. The
    // effect re-runs on every program-list change, so the sequence is what a
    // Controller that stops answering looks like from this page.
    const stalePushRecords = {
      '192.168.8.224': {
        'pat-line': {
          transforms: [],
          artifactHash: 'h',
          stampedAt: '2026-08-07T00:00:00.000Z',
          name: 'Line Dancer',
          profileSignature: 'an-older-signature',
        },
      },
    }
    const pushReads: Array<() => Promise<Record<string, Record<string, ControllerPushRecord>>>> = [
      () => Promise.resolve(stalePushRecords),
      () => new Promise(() => {}),
      () => Promise.reject(new Error('metadata storage unavailable')),
      () => Promise.resolve({ '192.168.8.224': {} }),
    ]
    let pushReadIndex = 0
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'push-records-resequenced',
      getControllerBindings: async () => ({ '192.168.8.224': { 'pat-line': 'DEV_LINE' } }),
      getPushRecords: () => pushReads[pushReadIndex++](),
    })

    const retriggerWithPrograms = (count: number) => {
      act(() => {
        useControllerPanelStore.setState({
          programsByController: {
            '192.168.8.224': Array.from({ length: count }, (_unused, index) => (
              index === 0
                ? { id: 'DEV_LINE', name: 'Line Dancer' }
                : { id: `DEV_${index}`, name: `Other ${index}` }
            )),
          },
        })
      })
    }
    retriggerWithPrograms(1)
    act(() => {
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
    })
    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(await screen.findByText('push again')).toBeInTheDocument()

    // A second read is in flight. The first read's records described the same
    // Controller a moment ago, but they are no longer what the page has read.
    retriggerWithPrograms(2)
    await waitFor(() => {
      expect(screen.queryByText('push again')).not.toBeInTheDocument()
    })

    // A read that rejects leaves nothing to claim, and leaves it that way.
    retriggerWithPrograms(3)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.queryByText('push again')).not.toBeInTheDocument()
    expect(screen.queryByText('not pushed')).not.toBeInTheDocument()

    // And a later read that completes is still evidence: no record for this
    // Pattern now means it was never pushed from this profile.
    retriggerWithPrograms(4)
    expect(await screen.findByText('not pushed')).toBeInTheDocument()
    expect(pushReadIndex).toBe(4)
  })

  it('lays the input list out as ragged two-up columns, not a shared-height grid (#772)', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        inputs: [
          { id: 'pot0', name: 'Front pot', pin: 33, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
          { id: 'pot1', name: 'Spare pot', pin: 34, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
        ],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    const card = screen.getByText('IO33').closest('article')
    expect(card).not.toBeNull()
    expect(card).toHaveClass('break-inside-avoid')
    // Two columns only while each still gets 24rem: this pane narrows
    // independently of the viewport, so the breakpoint cannot be viewport-based.
    expect(card!.parentElement).toHaveClass('[columns:24rem_2]')
    expect(card!.parentElement?.className).not.toMatch(/\blg:/)
  })

  it('keeps every input control reachable and operable from the keyboard (#772)', async () => {
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

    // The brightness control is a real checkbox, so Space toggles it without a
    // pointer and it carries its own accessible name.
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
    expect(within(powerSection!).queryByText(/LEDs/)).not.toBeInTheDocument()
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

  it('treats the full-white override as an action on the value it overrides (#772)', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 256,
        electricalProfile: {
          ledPresetId: 'ws2812-5v-individual',
          supplyBudget: { value: 10, unit: 'watts' },
        },
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.queryByRole('checkbox', { name: 'Override the estimated full-white load' }))
      .not.toBeInTheDocument()
    expect(screen.getByText('60 mA/addr @ 5V')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Full-white installation total' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Override load' }))

    expect(await screen.findByRole('textbox', { name: 'Full-white installation total' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Full-white load source' })).toHaveValue('measured')
    // The preset assumption is no longer claimed once a real total replaces it.
    expect(screen.queryByText('60 mA/addr @ 5V')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use estimate' }))

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

    expect(screen.getByText(/connect this controller to inspect its saved Patterns/i)).toBeInTheDocument()
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
    expect(screen.getByRole('checkbox', { name: updateLabel })).toBeChecked()
    expect(screen.getByText(updateLabel)).toBeInTheDocument()
    expect(screen.queryByText(/managed Patterns current/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/unmanaged programs are exempt/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Managed Pattern refresh progress')).toHaveTextContent(
      '1 current, 1 updating, 1 queued, 0 failed',
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
          },
          'show:show-1': {
            transforms: ['show'],
            artifactHash: 'show-hash',
            stampedAt: '2026-07-12T00:00:00.000Z',
            name: 'Measured wall Show',
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
    expect(screen.getByText('DEV1')).toBeInTheDocument()
    expect(screen.getByText('FOREIGN1')).toBeInTheDocument()
    expect(screen.getByText('Installation · 256 px · Measured wall')).toBeInTheDocument()
    expect(screen.queryByLabelText('Saved from a Show')).not.toBeInTheDocument()
    expect(screen.getByText('Source Show unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Source Pattern unavailable')).not.toBeInTheDocument()
    const savedInventory = screen.getByRole('table', { name: 'Saved PXLBLZ Patterns' })
    const otherInventory = screen.getByRole('table', { name: 'Other Patterns' })
    expect(within(savedInventory).getByRole('columnheader', { name: 'Pattern' })).toBeInTheDocument()
    expect(within(savedInventory).getByRole('columnheader', { name: 'Pattern ID' })).toBeInTheDocument()
    expect(within(savedInventory).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(within(savedInventory).getByRole('columnheader', { name: 'Output' })).toBeInTheDocument()
    expect(screen.getByTitle('Map fingerprint 11111111')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getByText('STALE')).toBeInTheDocument()
    expect(screen.getAllByText('UNKNOWN')).toHaveLength(2)
    for (const badge of screen.getAllByText(/^(OK|STALE|UNKNOWN)$/)) {
      expect(badge).toHaveClass('w-[4.75rem]')
    }
    expect(provider.listCalls).toBe(0)

    expect(savedInventory).toHaveClass('table-fixed')
    expect(otherInventory).toHaveClass('table-fixed')
    const columnClasses = (table: HTMLElement) => (
      Array.from(table.querySelectorAll('col')).map((column) => column.className)
    )
    expect(columnClasses(savedInventory)).toEqual(columnClasses(otherInventory))
    const headerWidths = (table: HTMLElement) => (
      within(table).getAllByRole('columnheader').map((header) => header.getBoundingClientRect().width)
    )
    headerWidths(savedInventory).forEach((width, index) => {
      expect(Math.abs(width - headerWidths(otherInventory)[index])).toBeLessThan(1)
    })
    for (const badge of screen.getAllByText(/^(OK|STALE|UNKNOWN)$/)) {
      expect(badge).toHaveClass('max-w-full')
      const badgeBounds = badge.getBoundingClientRect()
      const cellBounds = badge.closest('td')!.getBoundingClientRect()
      expect(badgeBounds.left).toBeGreaterThanOrEqual(cellBounds.left)
      expect(badgeBounds.right).toBeLessThanOrEqual(cellBounds.right)
    }
    const importButton = screen.getByRole('button', { name: 'Import sound bar kit' })
    expect(importButton).toHaveClass('w-full')
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

    const idHeader = within(savedInventory).getByRole('columnheader', { name: 'Pattern ID' })
    fireEvent.click(within(idHeader).getByRole('button', { name: 'Pattern ID' }))
    expect(idHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(savedRows().map((row) => row.match(/DEV1|DEV2|SHOW1/)?.[0])).toEqual(['DEV1', 'DEV2', 'SHOW1'])

    const statusHeader = within(savedInventory).getByRole('columnheader', { name: 'Status' })
    fireEvent.click(within(statusHeader).getByRole('button', { name: 'Status' }))
    expect(statusHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(savedRows().map((row) => row.match(/OK|STALE|UNKNOWN/)?.[0])).toEqual(['OK', 'STALE', 'UNKNOWN'])
    fireEvent.click(within(statusHeader).getByRole('button', { name: 'Status' }))
    expect(statusHeader).toHaveAttribute('aria-sort', 'descending')
    expect(savedRows().map((row) => row.match(/OK|STALE|UNKNOWN/)?.[0])).toEqual(['UNKNOWN', 'STALE', 'OK'])

    const changedProfile = {
      ...profile,
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.type === 'power-cap' ? { ...transform, enabled: true } : transform,
      ),
    }
    rerender(pane(changedProfile))
    expect(within(savedInventory).getAllByText('STALE')).toHaveLength(2)
    expect(provider.listCalls).toBe(0)

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
    for (const label of ['QUEUED', 'SYNCING', 'FAILED']) {
      expect(await screen.findByText(label)).toHaveClass('w-[4.75rem]')
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
    expect(provider.listCalls).toBe(1)
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key')
    consoleError.mockRestore()
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
          name: 'Coronal Mass Ejection PXLBLZ remix',
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
      name: 'Coronal Mass Ejection PXLBLZ remix',
    })
    expect(showLink).not.toHaveClass('truncate')
    expect(screen.getByText('Show output')).toBeInTheDocument()
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
          name: 'Coronal Mass Ejection PXLBLZ remix',
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

    expect(await screen.findByText('Coronal Mass Ejection PXLBLZ remix')).toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: 'Coronal Mass Ejection PXLBLZ remix',
    })).not.toBeInTheDocument()
    expect(screen.getByText('Show output')).toBeInTheDocument()
    expect(screen.getByText('Portable 2D · variable · surface')).toBeInTheDocument()
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
    expect(screen.getByText('Show output')).toBeInTheDocument()
    expect(screen.getByText('Installation · 2000 px · Redline stage')).toBeInTheDocument()

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
    seedProfile()
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

    fireEvent.click(screen.getByRole('button', { name: 'Configure power model' }))
    onAncestorClick.mockClear()
    const budgetInput = await screen.findByRole('textbox', { name: 'Continuous LED supply budget' })
    expect(budgetInput).toHaveValue('3')
    fireEvent.change(budgetInput, { target: { value: '4.5' } })
    fireEvent.keyDown(budgetInput, { key: 'Enter' })

    await waitFor(() => {
      const profile = useControllerProfileStore.getState().profiles[0]
      expect(profile.electricalProfile).toEqual({
        ledPresetId: 'ws2812-5v-individual',
        supplyBudget: { value: 4.5, unit: 'amps' },
      })
    })

    const input = screen.getByRole('textbox', { name: 'Power cap duty percent exact percentage' })
    fireEvent.click(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(onAncestorClick).not.toHaveBeenCalled()
    expect(onAncestorKeyDown).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '35%' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      const profile = useControllerProfileStore.getState().profiles[0]
      expect(profile.globalTransforms.find((transform) => transform.id === 'power-cap')).toMatchObject({
        mode: 'direct',
        maxDuty: 0.35,
      })
    })
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
    const enforce = screen.getByRole('checkbox', { name: 'Enforce the duty cap' })
    expect(enforce).toBeChecked()
    const duty = screen.getByRole('textbox', { name: 'Power cap duty percent exact percentage' })
    expect(duty).toHaveValue('40')
    // Only the estimate is missing, and deriving the cap stays unavailable.
    expect(screen.getByText('No power model yet, so PXLBLZ cannot estimate the installation load.'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configure power model' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculate from load and budget' })).toBeDisabled()

    fireEvent.change(duty, { target: { value: '15%' } })
    fireEvent.keyDown(duty, { key: 'Enter' })

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'power-cap'))
        .toMatchObject({ enabled: true, mode: 'direct', maxDuty: 0.15 })
    })

    fireEvent.click(enforce)

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((transform) => transform.type === 'power-cap'))
        .toMatchObject({ enabled: false, maxDuty: 0.15 })
    })
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
    fireEvent.click(screen.getByRole('button', { name: 'Configure power model' }))
    await screen.findByRole('textbox', { name: 'Continuous LED supply budget' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Continuous LED supply budget unit' }), {
      target: { value: 'watts' },
    })
    const budget = screen.getByRole('textbox', { name: 'Continuous LED supply budget' })
    fireEvent.change(budget, { target: { value: '36' } })
    fireEvent.keyDown(budget, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText('72.0 W')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate from load and budget' }))
    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument())
    expect(screen.getByText('calculated from the load and budget')).toBeInTheDocument()

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
          transform.type === 'power-cap' ? { ...transform, mode: 'derived' as const } : transform
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
    expect(screen.getByRole('button', { name: 'Set a fixed cap' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Override load' })).toBeDisabled()
    expect(screen.queryByRole('spinbutton', { name: 'Pixel count' })).not.toBeInTheDocument()
  })

  it('preserves a stale authored load when switching to a custom construction', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 301,
        electricalProfile: {
          ledPresetId: 'ws2812-5v-individual',
          supplyBudget: { value: 3, unit: 'amps' },
          loadOverride: {
            fullWhite: { value: 60, unit: 'watts' },
            source: 'measured',
            atPixelCount: 300,
          },
        },
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? { ...transform, mode: 'derived' as const, maxDuty: 0.6 }
            : transform
        )),
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText(/recorded at 300 addresses/)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'LED construction preset' }), {
      target: { value: 'custom' },
    })

    await waitFor(() => {
      const savedProfile = useControllerProfileStore.getState().profiles[0]
      expect(savedProfile.electricalProfile).toMatchObject({
        ledPresetId: 'custom',
        voltageOverride: 5,
        supplyBudget: { value: 3, unit: 'amps' },
        loadOverride: {
          fullWhite: { value: 60, unit: 'watts' },
          source: 'measured',
          atPixelCount: 300,
        },
      })
      expect(savedProfile.globalTransforms.find((transform) => transform.type === 'power-cap')).toMatchObject({
        mode: 'derived',
        maxDuty: 0.6,
      })
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
          ? { ...transform, mode: 'derived' as const, maxDuty: 0.5 }
          : transform
      )),
    }
    useControllerProfileStore.setState({ profiles: [configuredProfile], profilesLoaded: true })

    render(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('50%')).toBeInTheDocument()

    act(() => {
      useControllerProfileStore.setState({
        profiles: [{ ...configuredProfile, lastKnownPixelCount: 120 }],
      })
    })

    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument())
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
      }],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    const budgetUnit = screen.getByRole('combobox', { name: 'Continuous LED supply budget unit' })
    expect(within(budgetUnit).getByRole('option', { name: 'watts' })).toBeDisabled()

    const loadUnit = screen.getByRole('combobox', { name: 'Full-white installation total unit' })
    expect(within(loadUnit).getByRole('option', { name: 'watts' })).toBeDisabled()
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
      expect(within(screen.getByRole('combobox', {
        name: 'Continuous LED supply budget unit',
      })).getByRole('option', { name: 'watts' })).toBeEnabled()
    })
  })

  it('shows the latest generated artifact inspection for the controller profile', () => {
    seedProfile()
    useControllerStore.setState({
      lastTransformArtifacts: {
        '192.168.8.224': {
          'pat-1': {
            patternName: 'Twinkle',
            updatedAt: 1,
            generatedSource: 'export function render(index) { hsv(index, 1, 1) }',
            warnings: [],
            summary: {
              passes: [
                {
                  id: 'speed-drive',
                  kind: 'bind',
                  beforeRender: 'wrapped',
                  bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
                  estimatedPixelCost: 0,
                },
              ],
              callSitesWrapped: {},
              beforeRender: 'wrapped',
              globalsAdded: ['__pxlblz_speed_drive_bind'],
              exportsAdded: [],
              bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
              rendererAdaptations: [],
              estimatedPixelCost: 0,
            },
          },
        },
      },
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByText('Last generated artifact')).toBeInTheDocument()
    expect(screen.getByText('Twinkle')).toBeInTheDocument()
    expect(screen.getByText('sliderSpeed (function-call)')).toBeInTheDocument()
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

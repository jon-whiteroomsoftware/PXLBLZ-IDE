import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ControllerBar } from './ControllerBar'
import {
  useControllerStore,
  controllerInitialState,
  __resetControllerProviders,
} from '@/store/controllerStore'
import {
  controllerProfileInitialState,
  __resetControllerProfileAutoCreateGuards,
  useControllerProfileStore,
  type ControllerProfile,
} from '@/store/controllerProfileStore'
import { useRouterStore, routerInitialState } from '@/store/routerStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import {
  controllerPanelInitialState,
  useControllerPanelStore,
} from '@/store/controllerPanelStore'
import type { MapRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  NullControllerProvider,
  type ControllerStatus,
  type ControllerTelemetry,
} from '@/engine/ControllerProvider'
import { controllerProfileArtifactSignature } from '@/engine/controllerProfilePassRecipe'
import { queueControllerDeviceWrite } from '@/engine/controllerDeviceWriteQueue'
import { expectDisabledReason, expectNotGated } from '@/components/ui/disabled-reason.testing'

class ConnectedProvider extends NullControllerProvider {
  constructor(private readonly reportedFps = 36) {
    super()
  }

  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: '10.0.0.5', deviceId: 'pixelblaze_pb32_3cd4ee549434' },
  }

  getStatus(): ControllerStatus {
    return this.status
  }

  getTelemetry(): Promise<ControllerTelemetry> {
    return Promise.resolve({ fps: this.reportedFps })
  }
}

beforeEach(() => {
  __resetControllerProviders()
  resetPersonalContentProvider()
  __resetControllerProfileAutoCreateGuards()
  useControllerStore.setState(controllerInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  useRouterStore.setState(routerInitialState)
  useWorkspaceStore.setState(workspaceInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useControllerPanelStore.getState().stop()
  useControllerPanelStore.setState(controllerPanelInitialState)
  window.history.replaceState(null, '', '/studio')
})

afterEach(() => {
  useControllerPanelStore.getState().stop()
  __resetControllerProviders()
  resetControllerProvider()
  resetPersonalContentProvider()
})

function profile(
  id: string,
  deviceId: string | undefined,
  updatedAt: number,
  name = id,
): ControllerProfile {
  return {
    id,
    name,
    ...(deviceId ? { deviceId } : {}),
    board: { kind: 'pixelblaze-v3-standard' },
    inputs: [],
    globalTransforms: [],
    patternBindings: [],
    updatedAt,
  }
}

function memoryProvider(seed: ControllerProfile[] = []): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const maps = new Map<string, MapRecord>()
  const mixins = new Map()
  const shows = new Map<string, ShowRecord>()
  const controllers = new Map<string, ControllerProfile>(seed.map((record) => [record.id, record]))
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
    createControllerProfile: async (record) => {
      controllers.set(record.id, record)
    },
    updateControllerProfile: async (id, changes) => {
      const existing = controllers.get(id)
      if (existing) controllers.set(id, { ...existing, ...changes })
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

function seedLiveController(deviceId: string | null = 'pixelblaze_pb32_3cd4ee549434') {
  useControllerStore.setState({
    extensionPresent: true,
    activeIp: '10.0.0.5',
    controllers: {
      '10.0.0.5': {
        ip: '10.0.0.5',
        nickname: 'Desk',
        phase: 'live',
        liveEpoch: 1,
        mapDim: 2,
        deviceId,
      },
    },
  })
}

function seedSignedInProfiles(profiles: ControllerProfile[]) {
  useWorkspaceStore.setState({
    personalWorkspaceAuthenticated: true,
    personalWorkspaceResolved: true,
  })
  setPersonalContentProvider(memoryProvider(profiles))
  useControllerProfileStore.setState({ profiles, profilesLoaded: true })
}

describe('ControllerBar', () => {
  it('offers the install pitch when no extension is present', () => {
    render(<ControllerBar />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))
    expect(screen.getByTestId('controller-install-pitch')).toBeInTheDocument()
  })

  it('links the install pitch to the Chrome Web Store helper listing (#270)', () => {
    render(<ControllerBar />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))
    expect(screen.getByRole('link', { name: 'Install extension' })).toHaveAttribute(
      'href',
      'https://chromewebstore.google.com/detail/pxlblz-ide-controller-hel/hjdkmngopeofakdbjfkaomcmgkcidoeg',
    )
  })

  it("reloads the tab from the I've-installed-it button when Chrome has not injected the helper yet", async () => {
    const reloadPage = vi.fn()
    useControllerStore.setState({ detectExtension: async () => false })
    render(<ControllerBar reloadPage={reloadPage} />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))

    fireEvent.click(screen.getByRole('button', { name: "I've installed it" }))

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))
  })

  it('offers the IP form when the extension is present and no Controller is connected', () => {
    useControllerStore.setState({ extensionPresent: true })
    render(<ControllerBar />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))
    expect(screen.getByTestId('controller-ip-input')).toBeInTheDocument()
  })

  it('renders a pill per connected Controller with the nickname and a status dot', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    const pill = screen.getByTestId('controller-pill')
    expect(pill).toHaveTextContent('Desk')
    // The pill carries no IP hover tooltip — the IP shows in the open panel header.
    expect(pill).not.toHaveAttribute('title')
    expect(screen.getByTestId('controller-pill-dot')).toBeInTheDocument()
    // With a pill present, the entry affordance collapses to a compact add button.
    expect(screen.getByTestId('controller-entry-button')).toHaveTextContent('+')
  })

  it('keeps managed Pattern refresh activity visible after leaving the profile page', () => {
    const controllerProfile = profile('profile-1', 'device-1', 1, 'Desk')
    seedSignedInProfiles([controllerProfile])
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5',
          deviceId: 'device-1',
          nickname: 'Desk',
          phase: 'live',
          mapDim: 2,
        },
      },
      controllerReconciliations: {
        'profile-1': {
          phase: 'running',
          managedCount: 2,
          unmanagedCount: 1,
          completedCount: 1,
          programs: [],
        },
      },
    })

    render(<ControllerBar />)

    const activity = screen.getByRole('button', { name: 'Refreshing managed Patterns' })
    expect(activity).toBeInTheDocument()
    fireEvent.click(activity)
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'controllers', id: 'profile-1' },
    })
  })

  it('adds a firmware reminder without replacing the connected status dot', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5',
          nickname: 'Desk',
          phase: 'live',
          mapDim: 2,
          firmwareUpdateState: 'available',
        },
      },
    })

    render(<ControllerBar />)

    expect(screen.getByTestId('controller-pill-dot')).toBeInTheDocument()
    expect(screen.getByLabelText('Firmware update available for Desk')).toBeInTheDocument()
  })

  it('a pending pill keeps a known name (no IP flash on reconnect churn)', () => {
    useControllerStore.setState({
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'pending', mapDim: null } },
    })
    render(<ControllerBar />)
    expect(screen.getByTestId('controller-pill')).toHaveTextContent('Desk')
  })

  it('a pending pill with no known name still labels by IP', () => {
    useControllerStore.setState({
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', phase: 'pending', mapDim: null } },
    })
    render(<ControllerBar />)
    expect(screen.getByTestId('controller-pill')).toHaveTextContent('10.0.0.5')
  })

  it('shows the helper authorization hint for a pending per-IP grant (#235)', () => {
    useControllerStore.setState({
      activeIp: '10.0.0.5',
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5',
          phase: 'pending',
          mapDim: null,
          authorizationNeededIp: '10.0.0.5',
        },
      },
    })
    render(<ControllerBar />)
    expect(screen.getByTestId('controller-authorization-hint')).toHaveTextContent(
      'Authorize this Controller in the PXLBLZ-IDE helper',
    )
  })

  it('activates a Controller on pill click', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.6',
      controllers: {
        '10.0.0.5': { ip: '10.0.0.5', nickname: 'A', phase: 'live', mapDim: 2 },
        '10.0.0.6': { ip: '10.0.0.6', nickname: 'B', phase: 'live', mapDim: 2 },
      },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle A panel' }))
    expect(useControllerStore.getState().activeIp).toBe('10.0.0.5')
  })

  it('opens the panel popover (with a Disconnect, no inline remove) when a pill is clicked', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    // No popover (and so no Disconnect) until the pill is clicked.
    expect(screen.queryByTestId('controller-panel-popover')).not.toBeInTheDocument()
    expect(screen.queryByTestId('controller-pill-remove')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    const popover = screen.getByTestId('controller-panel-popover')
    // The header title now mirrors the editor/preview panes: the running pattern
    // name (— until polled), not the device identity. The device name already
    // labels the pill this popover hangs from, and its IP shows in a labeled box
    // inside the panel, so neither is repeated in the header.
    expect(popover).not.toHaveTextContent('Desk')
    expect(popover).not.toHaveTextContent('10.0.0.5')
    expect(screen.getByTestId('controller-pill-remove')).toHaveAccessibleName('Disconnect Desk')
    expect(screen.getByTestId('controller-panel-wrap')).toHaveClass('pt-0.5', 'pb-2', 'pr-3')
  })

  it('puts a read-only sequencer indicator first in the header controls only while sequencing', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: {
        '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 },
      },
    })
    useControllerPanelStore.setState({
      sequencerMode: 1,
      runSequencer: true,
      configSourceIp: '10.0.0.5',
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const indicator = screen.getByTestId('controller-sequencer-indicator')
    const disconnect = screen.getByRole('button', { name: 'Disconnect Desk' })
    expect(indicator).toHaveAttribute('aria-label', 'Sequencer shuffle is on')
    expect(indicator).toHaveAttribute(
      'title',
      'Sequencer: shuffle. The Controller is choosing Patterns on its own; a manual switch is overridden at the next interval.',
    )
    expect(indicator.querySelector('.lucide-shuffle')).toBeInTheDocument()
    expect(
      indicator.compareDocumentPosition(disconnect) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    act(() => useControllerPanelStore.setState({ sequencerMode: 2, runSequencer: true }))
    expect(indicator).toHaveAttribute('aria-label', 'Sequencer playlist is on')
    expect(indicator.querySelector('.lucide-list-music')).toBeInTheDocument()

    act(() => useControllerPanelStore.setState({ sequencerMode: 0, runSequencer: true }))
    expect(screen.queryByTestId('controller-sequencer-indicator')).not.toBeInTheDocument()
    act(() => useControllerPanelStore.setState({ sequencerMode: 1, runSequencer: false }))
    expect(screen.queryByTestId('controller-sequencer-indicator')).not.toBeInTheDocument()
    act(() => useControllerPanelStore.setState({ sequencerMode: 3, runSequencer: true }))
    expect(screen.queryByTestId('controller-sequencer-indicator')).not.toBeInTheDocument()
  })

  it('never attributes another or non-live Controller sequencer state to the open popover', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.6',
      controllers: {
        '10.0.0.5': { ip: '10.0.0.5', nickname: 'A', phase: 'live', mapDim: 2 },
        '10.0.0.6': { ip: '10.0.0.6', nickname: 'B', phase: 'error', mapDim: 2 },
      },
    })
    useControllerPanelStore.setState({
      sequencerMode: 1,
      runSequencer: true,
      configSourceIp: '10.0.0.5',
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle B panel' }))
    expect(screen.queryByTestId('controller-sequencer-indicator')).not.toBeInTheDocument()

    act(() => useControllerPanelStore.setState({ configSourceIp: '10.0.0.6' }))
    expect(screen.queryByTestId('controller-sequencer-indicator')).not.toBeInTheDocument()
  })

  it('keeps the panel header actions icon-only and fixed-size across renderer states', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: { '10.0.0.5': { acknowledged: 'playing', pending: null } },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const disconnect = screen.getByRole('button', { name: 'Disconnect Desk' })
    const transport = screen.getByRole('button', { name: 'Pause Desk renderer' })
    expect(disconnect).toHaveClass('h-6', 'w-6')
    expect(transport).toHaveClass('h-6', 'w-6')
    expect(disconnect).not.toHaveTextContent('Disconnect')
    expect(transport).not.toHaveTextContent('Pause')
    expect(disconnect.querySelector('[data-glyph="disconnect"]')).toBeInTheDocument()

    act(() => useControllerStore.setState({
      rendererStates: { '10.0.0.5': { acknowledged: 'playing', pending: 'pause' } },
    }))
    const pending = screen.getByRole('button', { name: 'Pausing Desk renderer' })
    expect(pending).toHaveClass('h-6', 'w-6')
    expect(pending).not.toHaveTextContent('Pausing')
    expect(pending.querySelector('.lucide-rotate-cw')).toBeInTheDocument()
  })

  it('keeps the Controller panel open while its pixel-count editor is used', async () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    useControllerStore.setState({
      setActive: (ip) => useControllerStore.setState({ activeIp: ip }),
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Edit controller pixel count' }))
    const input = await screen.findByRole('textbox', { name: 'Controller pixel count' })
    fireEvent.mouseDown(input)

    expect(screen.getByTestId('controller-panel-popover')).toBeInTheDocument()
    expect(input).toBeInTheDocument()
  })

  it('places an explicit Resume recovery immediately right of Disconnect when renderer state is unknown', () => {
    const setRendererPaused = vi.fn(async () => {})
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: {
        '10.0.0.5': { acknowledged: 'unknown', pending: null },
      },
      setRendererPaused,
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const disconnect = screen.getByRole('button', { name: 'Disconnect Desk' })
    const resume = screen.getByRole('button', { name: 'Resume Desk renderer (state unknown)' })
    expect(disconnect.compareDocumentPosition(resume) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(resume.querySelector('.lucide-play')).toBeInTheDocument()

    fireEvent.click(resume)
    expect(setRendererPaused).toHaveBeenCalledWith('10.0.0.5', false)
  })

  it('offers Pause when fresh FPS proves an otherwise-unknown renderer is running (#749)', async () => {
    setControllerProvider(new ConnectedProvider())
    const setRendererPaused = vi.fn(async () => {})
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: {
        '10.0.0.5': { acknowledged: 'unknown', pending: null },
      },
      setRendererPaused,
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const pause = await screen.findByRole('button', { name: 'Pause Desk renderer' })
    expect(pause).toHaveAttribute('title', 'Live render heartbeat: 36 FPS; pause the active renderer')
    fireEvent.click(pause)
    expect(setRendererPaused).toHaveBeenCalledWith('10.0.0.5', true)
  })

  it('keeps Resume and explains a fresh zero-FPS heartbeat (#749)', async () => {
    setControllerProvider(new ConnectedProvider(0))
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: {
        '10.0.0.5': { acknowledged: 'unknown', pending: null },
      },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const resume = await screen.findByRole('button', {
      name: 'Resume Desk renderer (no render heartbeat)',
    })
    expect(resume).toHaveAttribute('title', 'No render heartbeat; send Resume to recover safely')
  })

  it('ignores a stale positive FPS heartbeat after the Controller disconnects (#749)', () => {
    useControllerPanelStore.setState({ fps: 36, fpsSourceIp: '10.0.0.5' })
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'error', mapDim: 2 } },
      rendererStates: {
        '10.0.0.5': { acknowledged: 'unknown', pending: null },
      },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const resume = screen.getByRole('button', {
      name: 'Resume Desk renderer (disconnected; state unknown)',
    })
    expect(resume).toBeDisabled()
    expect(resume.querySelector('.lucide-play')).toBeInTheDocument()
  })

  it('offers Pause for a newly connected Controller without claiming an acknowledgement (#737)', () => {
    const setRendererPaused = vi.fn(async () => {})
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: {
        '10.0.0.5': { acknowledged: 'unknown', assumedPlaying: true, pending: null },
      },
      setRendererPaused,
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const pause = screen.getByRole('button', { name: 'Pause Desk renderer' })
    expect(pause.querySelector('.lucide-pause')).toBeInTheDocument()

    fireEvent.click(pause)
    expect(setRendererPaused).toHaveBeenCalledWith('10.0.0.5', true)
  })

  it('uses honest accessible names, icons, and disablement for acknowledged, pending, and disconnected states', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: {
        '10.0.0.5': { acknowledged: 'playing', pending: null },
      },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const pause = screen.getByRole('button', { name: 'Pause Desk renderer' })
    expect(pause).toBeEnabled()
    expect(pause.querySelector('.lucide-pause')).toBeInTheDocument()

    act(() => useControllerStore.setState({
      rendererStates: { '10.0.0.5': { acknowledged: 'paused', pending: null } },
    }))
    const play = screen.getByRole('button', { name: 'Resume Desk renderer' })
    expect(play.querySelector('.lucide-play')).toBeInTheDocument()

    act(() => useControllerStore.setState({
      rendererStates: { '10.0.0.5': { acknowledged: 'paused', pending: 'resume' } },
    }))
    const resuming = screen.getByRole('button', { name: 'Resuming Desk renderer' })
    expect(resuming).toBeDisabled()
    expect(resuming.querySelector('.lucide-rotate-cw')).toBeInTheDocument()

    act(() => useControllerStore.setState({
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'error', mapDim: 2 } },
      rendererStates: { '10.0.0.5': { acknowledged: 'unknown', pending: null } },
    }))
    expect(screen.getByRole('button', {
      name: 'Resume Desk renderer (disconnected; state unknown)',
    })).toBeDisabled()
  })

  it('disables renderer transport while Send may produce an unrelated firmware acknowledgement', () => {
    useControllerPanelStore.setState({ fps: 48, fpsSourceIp: '10.0.0.5' })
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      pushing: true,
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: { '10.0.0.5': { acknowledged: 'unknown', pending: null } },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    expect(screen.getByRole('button', {
      name: 'Resume Desk renderer (Send in progress; state unknown)',
    })).toBeDisabled()
  })

  it('preserves known renderer semantics in the accessible name during a map-only Send', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      pushing: true,
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: { '10.0.0.5': { acknowledged: 'playing', pending: null } },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const pause = screen.getByRole('button', {
      name: 'Pause Desk renderer (Send in progress)',
    })
    expect(pause).toBeDisabled()
    expect(pause.querySelector('.lucide-pause')).toBeInTheDocument()
  })

  it('renders acknowledged success and surfaces failure without hiding the recovery action', async () => {
    const setRendererPaused = vi.fn(async (ip: string, paused: boolean) => {
      act(() => useControllerStore.setState({
        rendererStates: {
          [ip]: { acknowledged: 'unknown', pending: paused ? 'pause' : 'resume' },
        },
      }))
      await Promise.resolve()
      act(() => useControllerStore.setState({
        rendererStates: {
          [ip]: { acknowledged: paused ? 'paused' : 'playing', pending: null },
        },
      }))
    })
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      rendererStates: { '10.0.0.5': { acknowledged: 'playing', pending: null } },
      setRendererPaused,
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Pause Desk renderer' }))
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Resume Desk renderer' })
        .querySelector('.lucide-play'),
    ).toBeInTheDocument())

    act(() => useControllerStore.setState({
      rendererStates: {
        '10.0.0.5': {
          acknowledged: 'unknown',
          pending: null,
          error: 'renderer acknowledgement lost',
        },
      },
    }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Renderer command failed: renderer acknowledgement lost',
    )
    expect(screen.getByRole('button', {
      name: 'Resume Desk renderer (state unknown)',
    })).toBeEnabled()
    expect(useControllerStore.getState().controllers['10.0.0.5'].phase).toBe('live')
  })

  it('toggles the panel popover closed on a second pill click', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    const pill = screen.getByRole('button', { name: 'Toggle Desk panel' })
    fireEvent.click(pill)
    expect(screen.getByTestId('controller-panel-popover')).toBeInTheDocument()
    fireEvent.click(pill)
    expect(screen.queryByTestId('controller-panel-popover')).not.toBeInTheDocument()
  })

  it('disconnects from the popover header and closes the popover', async () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    fireEvent.click(screen.getByTestId('controller-pill-remove'))
    expect(screen.queryByTestId('controller-panel-popover')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(useControllerStore.getState().controllers['10.0.0.5']).toBeUndefined(),
    )
  })

  it('dismisses the pinned popover on an outside click', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    expect(screen.getByTestId('controller-panel-popover')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('controller-panel-popover')).not.toBeInTheDocument()
  })

  it('keeps profile navigation in the panel header when signed out and retires the join-row copy', () => {
    seedLiveController()
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    expect(screen.getByRole('link', { name: 'Open Desk profile' })).toBeInTheDocument()
    expect(screen.queryByText('Controller profile')).not.toBeInTheDocument()
    expect(screen.queryByText('Create profile for this device')).not.toBeInTheDocument()
  })

  it('renders the action row first and dispatches Run and Save through the shared push flow', () => {
    setControllerProvider(new ConnectedProvider())
    const requestPush = vi.fn()
    seedLiveController()
    seedSignedInProfiles([profile('profile-1', 'pixelblaze_pb32_3cd4ee549434', 1)])
    useRouterStore.setState({
      route: { kind: 'studio', entity: { kind: 'patterns', id: 'pattern-1' } },
    })
    usePatternStore.setState({
      activePatternId: 'pattern-1',
      userPatterns: [{
        id: 'pattern-1',
        name: 'Aurora Drift',
        src: 'export function render() {}',
        controls: {},
        updatedAt: 1,
      }],
    })
    useEditorStore.setState({
      compileStatus: 'good',
      previewSource: 'export function render() {}',
    })
    useControllerStore.setState({
      requestPush,
      setActive: (ip) => useControllerStore.setState({ activeIp: ip }),
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    const actionRow = screen.getByTestId('controller-action-row')
    expect(actionRow).toHaveTextContent('Aurora Drift')
    expect(actionRow).not.toHaveTextContent('Acts on the open pattern')
    const disconnect = screen.getByRole('button', { name: 'Disconnect Desk' })
    const profileLink = screen.getByRole('link', { name: 'Open Desk profile' })
    const transport = screen.getByTestId('controller-renderer-transport')
    expect(
      disconnect.compareDocumentPosition(profileLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      profileLink.compareDocumentPosition(transport) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      actionRow.compareDocumentPosition(screen.getByTestId('controller-panel'))
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(useControllerStore.getState().saveArmed).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useControllerStore.getState().saveArmed).toBe(true)
    expect(requestPush).toHaveBeenCalledTimes(2)
  })

  it('switches among a flat alphabetized saved-Pattern list without changing the open Studio Pattern', async () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    useRouterStore.setState({
      route: { kind: 'studio', entity: { kind: 'patterns', id: 'pattern-1' } },
    })
    usePatternStore.setState({
      activePatternId: 'pattern-1',
      userPatterns: [{
        id: 'pattern-1',
        name: 'Open Draft',
        src: 'export function render() {}',
        controls: {},
        updatedAt: 1,
      }],
    })
    const activateProgram = vi.fn().mockResolvedValue(undefined)
    useControllerPanelStore.setState({
      activeProgramId: 'run-only',
      programLabels: { 'run-only': 'Live Draft' },
      programs: [{ id: 'foreign', name: 'Foreign Controller Pattern' }],
      programsByController: {
        '10.0.0.5': [
          { id: 'z', name: 'Zebra' },
          { id: 'a', name: 'aurora' },
        ],
      },
      activateProgram,
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    const trigger = screen.getByRole('button', { name: 'Switch running Pattern' })
    fireEvent.click(trigger)

    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Live Draftunsaved · running',
      'aurora',
      'Zebra',
    ])
    expect(options[0]).toBeDisabled()
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Switches what the Controller runs; Run and Save still send the open Pattern.')).toBeInTheDocument()

    fireEvent.click(options[1])
    await waitFor(() => expect(activateProgram.mock.calls[0]?.[0]).toBe('a'))
    expect(screen.queryByRole('listbox', { name: 'Switch the running Pattern' })).not.toBeInTheDocument()
    expect(usePatternStore.getState().activePatternId).toBe('pattern-1')
    expect(screen.getByTestId('controller-action-row')).toHaveTextContent('Open Draft')
  })

  it('carries the originating Controller session guard into a queued saved-Pattern switch', async () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    const activateProgram = vi.fn().mockResolvedValue(undefined)
    useControllerPanelStore.setState({
      programsByController: { '10.0.0.5': [{ id: 'a', name: 'Aurora' }] },
      activateProgram,
    })
    let releasePrior!: () => void
    const priorWrite = new Promise<void>((resolve) => { releasePrior = resolve })
    const queuedPrior = queueControllerDeviceWrite('10.0.0.5', () => priorWrite)

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch running Pattern' }))
    fireEvent.click(screen.getByRole('option', { name: 'Aurora' }))
    await Promise.resolve()
    expect(activateProgram).not.toHaveBeenCalled()

    const afterSwitch = queueControllerDeviceWrite('10.0.0.5', async () => {})

    await act(async () => {
      releasePrior()
      await queuedPrior
      await afterSwitch
    })
    expect(activateProgram).toHaveBeenCalledTimes(1)
    const options = activateProgram.mock.calls[0]?.[1]
    expect(options).toMatchObject({ expectedControllerId: '10.0.0.5' })
    act(() => {
      useControllerStore.setState((state) => ({
        controllers: {
          ...state.controllers,
          '10.0.0.5': {
            ...state.controllers['10.0.0.5']!,
            liveEpoch: 2,
          },
        },
      }))
    })
    expect(options?.sessionIsCurrent()).toBe(false)
  })

  it('auto-focuses a large-list filter and supports arrow-key activation', async () => {
    const user = userEvent.setup()
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    const programs = Array.from({ length: 9 }, (_, index) => ({
      id: `program-${index}`,
      name: `Pattern ${index}`,
    }))
    const activateProgram = vi.fn().mockResolvedValue(undefined)
    useControllerPanelStore.setState({
      programs,
      programsByController: { '10.0.0.5': programs },
      activateProgram,
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch running Pattern' }))

    const filter = screen.getByRole('searchbox', { name: 'Filter saved Patterns' })
    await waitFor(() => expect(filter).toHaveFocus())
    fireEvent.keyDown(filter, { key: 'ArrowUp' })
    expect(screen.getByRole('option', { name: 'Pattern 8' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(screen.getByRole('option', { name: 'Pattern 0' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    const second = screen.getByRole('option', { name: 'Pattern 1' })
    expect(second).toHaveFocus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(activateProgram.mock.calls[0]?.[0]).toBe('program-1'))
  })

  it('opens an informational menu for a run-only Pattern over a read-empty inventory', () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    useControllerPanelStore.setState({
      activeProgramId: 'run-only',
      programLabels: { 'run-only': 'Live Draft' },
      programs: [],
      programsByController: { '10.0.0.5': [] },
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    const trigger = screen.getByRole('button', { name: 'Switch running Pattern' })
    expect(trigger).toBeEnabled()
    fireEvent.click(trigger)

    const runOnly = screen.getByRole('option', { name: /Live Draftunsaved · running/ })
    expect(runOnly).toBeDisabled()
    expect(runOnly).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('No saved Patterns match.')).toBeInTheDocument()
  })

  it('marks only the selected row as switching and disables the list in flight', async () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    let resolveActivation: (() => void) | undefined
    const activation = new Promise<void>((resolve) => {
      resolveActivation = resolve
    })
    const activateProgram = vi.fn((programId: string) => {
      useControllerPanelStore.setState({ activatingProgramId: programId })
      return activation.finally(() => {
        useControllerPanelStore.setState({ activatingProgramId: null })
      })
    })
    const programs = [
      { id: 'a', name: 'Aurora' },
      { id: 'z', name: 'Zebra' },
    ]
    useControllerPanelStore.setState({
      programs,
      programsByController: { '10.0.0.5': programs },
      activateProgram,
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch running Pattern' }))
    fireEvent.click(screen.getByRole('option', { name: 'Aurora' }))

    await waitFor(() => expect(screen.getByRole('listbox', { name: 'Switch the running Pattern' }))
      .toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByRole('option', { name: /Auroraswitching/ })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Zebra' })).toBeDisabled()
    expect(activateProgram).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    const trigger = screen.getByRole('button', { name: 'Switch running Pattern' })
    expect(screen.queryByRole('listbox', { name: 'Switch the running Pattern' })).not.toBeInTheDocument()
    expect(trigger).toBeEnabled()
    expect(trigger).toHaveFocus()
    const elsewhere = screen.getByRole('button', { name: 'Add a Controller' })
    elsewhere.focus()

    await act(async () => resolveActivation?.())
    await waitFor(() => expect(screen.queryByRole('listbox', { name: 'Switch the running Pattern' })).not.toBeInTheDocument())
    expect(elsewhere).toHaveFocus()
  })

  it('keeps the switch menu open with the Controller reason after activation fails', async () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    const activateProgram = vi.fn().mockRejectedValue(new Error('device did not confirm the change'))
    useControllerPanelStore.setState({
      programs: [{ id: 'a', name: 'Aurora' }],
      programsByController: { '10.0.0.5': [{ id: 'a', name: 'Aurora' }] },
      activateProgram,
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch running Pattern' }))
    fireEvent.click(screen.getByRole('option', { name: 'Aurora' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'device did not confirm the change',
    ))
    expect(screen.getByRole('listbox', { name: 'Switch the running Pattern' })).toBeVisible()
    expect(screen.getByRole('option', { name: 'Aurora' })).toBeEnabled()
  })

  it('closes the switch menu on Escape and restores focus to its trigger', () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    useControllerPanelStore.setState({
      programs: [{ id: 'a', name: 'Aurora' }],
      programsByController: { '10.0.0.5': [{ id: 'a', name: 'Aurora' }] },
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    const trigger = screen.getByRole('button', { name: 'Switch running Pattern' })
    fireEvent.click(trigger)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('listbox', { name: 'Switch the running Pattern' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes only the switch menu on a click elsewhere in the Controller popover', () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    useControllerPanelStore.setState({
      programs: [{ id: 'a', name: 'Aurora' }],
      programsByController: { '10.0.0.5': [{ id: 'a', name: 'Aurora' }] },
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch running Pattern' }))
    fireEvent.mouseDown(screen.getByTestId('controller-panel'))

    expect(screen.queryByRole('listbox', { name: 'Switch the running Pattern' })).not.toBeInTheDocument()
    expect(screen.getByTestId('controller-panel-popover')).toBeVisible()
  })

  it('re-enables the popover Run action when the Controller switches programs', () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    const activeProfile = profile('profile-1', 'pixelblaze_pb32_3cd4ee549434', 1)
    seedSignedInProfiles([activeProfile])
    useRouterStore.setState({
      route: { kind: 'studio', entity: { kind: 'patterns', id: 'pattern-1' } },
    })
    usePatternStore.setState({
      activePatternId: 'pattern-1',
      userPatterns: [{
        id: 'pattern-1',
        name: 'Aurora Drift',
        src: 'export function render() {}',
        controls: {},
        updatedAt: 1,
      }],
    })
    useEditorStore.setState({
      compileStatus: 'good',
      previewSource: 'export function render() {}',
    })
    useControllerStore.setState({
      setActive: (ip) => useControllerStore.setState({ activeIp: ip }),
      lastPushedSource: { '10.0.0.5': { 'pattern-1': 'export function render() {}' } },
      lastRunProgramId: { '10.0.0.5': { 'pattern-1': 'run-pattern-1' } },
      lastPushedProfileSignature: {
        '10.0.0.5': {
          'pattern-1': controllerProfileArtifactSignature(activeProfile, 'pattern-1', { mapDim: 2 }),
        },
      },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    act(() => useControllerPanelStore.setState({ activeProgramId: 'run-pattern-1' }))
    expectDisabledReason(screen.getByRole('button', { name: 'Run' }), 'No changes since the last send')
    expectNotGated(screen.getByRole('button', { name: 'Save' }))

    act(() => useControllerPanelStore.setState({ activeProgramId: 'doom-fire' }))

    expectNotGated(screen.getByRole('button', { name: 'Run' }))
    expectNotGated(screen.getByRole('button', { name: 'Save' }))
  })

  it('dims Run and Save outside the Studio pattern surface and keeps the reason in tooltips', () => {
    setControllerProvider(new ConnectedProvider())
    seedLiveController()
    useRouterStore.setState({ route: { kind: 'gallery' } })
    usePatternStore.setState({
      activePatternId: 'stale-pattern',
      userPatterns: [{
        id: 'stale-pattern',
        name: 'Stale Pattern',
        src: 'export function render() {}',
        controls: {},
        updatedAt: 1,
      }],
    })
    useControllerStore.setState({
      setActive: (ip) => useControllerStore.setState({ activeIp: ip }),
    })

    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    expectDisabledReason(screen.getByRole('button', { name: 'Run' }), 'Open a pattern to push it to this Controller')
    expectDisabledReason(screen.getByRole('button', { name: 'Save' }), 'Open a pattern to push it to this Controller')
    expect(screen.getByTestId('controller-action-row')).toHaveTextContent('—')
    expect(screen.queryByText('Open a pattern to push it to this Controller.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Desk profile' })).toBeEnabled()
  })

  it('links to the newest matching controller profile by device id when signed in', () => {
    seedLiveController()
    seedSignedInProfiles([
      profile('old', 'pixelblaze_pb32_3cd4ee549434', 1, 'Old Desk'),
      profile('new', 'pixelblaze_pb32_3cd4ee549434', 2, 'New Desk'),
    ])
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    fireEvent.click(screen.getByRole('link', { name: 'Open Desk profile' }))

    expect(window.location.pathname).toBe('/studio/controllers/new')
  })

  it('auto-creates a claimed profile for a connected device with a known id', async () => {
    seedLiveController()
    seedSignedInProfiles([])
    render(<ControllerBar />)

    await waitFor(() => expect(useControllerProfileStore.getState().profiles).toHaveLength(1))
    const created = useControllerProfileStore.getState().profiles[0]
    expect(created).toMatchObject({
      name: 'Desk',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      lastKnownDeviceName: 'Desk',
      lastSeenIp: '10.0.0.5',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    fireEvent.click(screen.getByRole('link', { name: 'Open Desk profile' }))
    expect(window.location.pathname).toBe(`/studio/controllers/${created.id}`)
  })

  it('creates an unclaimed profile when the live controller has no recoverable id', async () => {
    seedLiveController(null)
    seedSignedInProfiles([])
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    fireEvent.click(screen.getByRole('link', { name: 'Open Desk profile' }))

    await waitFor(() => expect(useControllerProfileStore.getState().profiles).toHaveLength(1))
    expect(useControllerProfileStore.getState().profiles[0]).toMatchObject({
      name: 'Desk',
      lastKnownDeviceName: 'Desk',
      lastSeenIp: '10.0.0.5',
    })
    expect(useControllerProfileStore.getState().profiles[0].deviceId).toBeUndefined()
  })

  it('auto-runs discovery when the connection dropdown opens (extension present)', async () => {
    let calls = 0
    useControllerStore.setState({
      extensionPresent: true,
      // Keep presence stable; the real detectExtension would async-flip it.
      detectExtension: async () => true,
      discover: async () => {
        calls++
      },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))
    await waitFor(() => expect(calls).toBeGreaterThan(0))
  })

  it('passes the full discovered controller record into connect', () => {
    const addController = vi.fn()
    const discovered = {
      id: 'pixelblaze_pb32_known',
      address: '10.0.0.5',
      name: 'Desk',
      version: '3.67',
      boardType: 'pb32',
    }
    useControllerStore.setState({
      extensionPresent: true,
      detectExtension: async () => true,
      discover: async () => {},
      discovered: [discovered],
      addController,
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))

    fireEvent.click(screen.getByTestId('controller-discovered-item'))

    expect(addController).toHaveBeenCalledWith(discovered)
  })

  it('renders multiple discovered Controllers with firmware and board metadata', () => {
    useControllerStore.setState({
      extensionPresent: true,
      detectExtension: async () => true,
      discover: async () => {},
      discovered: [
        {
          id: 'pixelblaze_pb32_a',
          address: '10.0.0.5',
          name: 'Desk',
          version: '3.67',
          boardType: 'pb32',
        },
        {
          id: 'pixelblaze_pico_b',
          address: '10.0.0.8',
          name: 'Shelf',
          boardType: 'pico',
        },
      ],
    })
    render(<ControllerBar />)

    fireEvent.click(screen.getByTestId('controller-entry-button'))

    const rows = screen.getAllByTestId('controller-discovered-item')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Desk')
    expect(rows[0]).toHaveTextContent('10.0.0.5')
    expect(rows[0]).toHaveTextContent('pb32')
    expect(rows[0]).toHaveTextContent('3.67')
    expect(rows[1]).toHaveTextContent('Shelf')
    expect(rows[1]).toHaveTextContent('pico')
  })

  it('labels an empty discovery result as no other Controllers when one is already connected', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5',
          nickname: 'Desk',
          phase: 'live',
          mapDim: 2,
        },
      },
      detectExtension: async () => true,
      discover: async () => {},
      discovered: [],
    })
    render(<ControllerBar />)

    fireEvent.click(screen.getByTestId('controller-entry-button'))

    expect(screen.getByTestId('controller-discover-empty')).toHaveTextContent(
      'No other Controllers found',
    )
  })

  it('explains an unreachable discovery service without blaming Controller settings (#815)', () => {
    useControllerStore.setState({
      extensionPresent: true,
      detectExtension: async () => true,
      discover: async () => {},
      discovered: [],
      discoveryUnavailable: true,
    })
    render(<ControllerBar />)

    fireEvent.click(screen.getByTestId('controller-entry-button'))

    const empty = screen.getByTestId('controller-discover-empty')
    expect(empty).toHaveTextContent('Discovery is unreachable')
    expect(empty).toHaveTextContent('network connection')
    expect(empty).not.toHaveTextContent('network discovery enabled')
  })

  it('the refresh affordance triggers a manual rescan', async () => {
    let calls = 0
    useControllerStore.setState({
      extensionPresent: true,
      detectExtension: async () => true,
      discover: async () => {
        calls++
      },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))
    await waitFor(() => expect(calls).toBeGreaterThan(0)) // auto sweep on open
    const afterOpen = calls
    fireEvent.click(screen.getByTestId('controller-discover'))
    expect(calls).toBe(afterOpen + 1)
  })

  it('forces a visible spin on manual rescan even when the sweep returns instantly', () => {
    vi.useFakeTimers()
    try {
      useControllerStore.setState({
        extensionPresent: true,
        detectExtension: async () => true,
        // Instant no-op sweep: without the forced window the spinner never shows.
        discover: async () => {},
      })
      render(<ControllerBar />)
      fireEvent.click(screen.getByTestId('controller-entry-button'))
      const btn = screen.getByTestId('controller-discover')
      expect(btn).toHaveAttribute('aria-busy', 'false')

      fireEvent.click(btn)
      expect(btn).toHaveAttribute('aria-busy', 'true')

      act(() => {
        vi.advanceTimersByTime(700)
      })
      expect(btn).toHaveAttribute('aria-busy', 'false')
    } finally {
      vi.useRealTimers()
    }
  })
})

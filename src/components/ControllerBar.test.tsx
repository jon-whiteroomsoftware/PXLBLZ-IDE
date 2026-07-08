import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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
import type { MapRecord, PatternRecord } from '@/engine/personalContentRecords'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import { resetControllerProvider } from '@/engine/controllerProviderRegistry'

beforeEach(() => {
  __resetControllerProviders()
  resetPersonalContentProvider()
  __resetControllerProfileAutoCreateGuards()
  useControllerStore.setState(controllerInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  useRouterStore.setState(routerInitialState)
  useWorkspaceStore.setState(workspaceInitialState)
  window.history.replaceState(null, '', '/studio')
})

afterEach(() => {
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
    zones: [],
    updatedAt,
  }
}

function memoryProvider(seed: ControllerProfile[] = []): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const maps = new Map<string, MapRecord>()
  const mixins = new Map()
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

  it('omits the durable profile row when signed out', () => {
    seedLiveController()
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    expect(screen.queryByText('Controller profile')).not.toBeInTheDocument()
    expect(screen.queryByText('Create profile for this device')).not.toBeInTheDocument()
  })

  it('links to the newest matching controller profile by device id when signed in', () => {
    seedLiveController()
    seedSignedInProfiles([
      profile('old', 'pixelblaze_pb32_3cd4ee549434', 1, 'Old Desk'),
      profile('new', 'pixelblaze_pb32_3cd4ee549434', 2, 'New Desk'),
    ])
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Controller profile' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Controller profile' }))
    expect(window.location.pathname).toBe(`/studio/controllers/${created.id}`)
  })

  it('creates an unclaimed profile when the live controller has no recoverable id', async () => {
    seedLiveController(null)
    seedSignedInProfiles([])
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Create profile for this device' }))

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

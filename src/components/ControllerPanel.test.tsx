import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ControllerPanel } from './ControllerPanel'
import {
  useControllerPanelStore,
  controllerPanelInitialState,
} from '@/store/controllerPanelStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  NullControllerProvider,
  type ControllerConfig,
  type ControllerStatus,
  type ControllerTelemetry,
} from '@/engine/ControllerProvider'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { encodeMapData } from '@/engine/mapPush'

class ConnectedProvider extends NullControllerProvider {
  config: ControllerConfig = {
    brightness: 0.4,
    activeProgramId: 'def',
    activeControls: { sliderSpeed: 0.3, toggleMirror: 1 },
    pixelCount: 256,
  }
  telemetry: ControllerTelemetry = { fps: 30 }
  programs: ProgramListEntry[] = [{ id: 'def', name: 'Nebula' }]
  vars: Record<string, number> = { phase: 0.5 }
  brightnessWrites: Array<{ value: number; save: boolean }> = []
  pixelCountWrites: Array<{ value: number; save: boolean }> = []
  controlWrites: Array<{ controls: Record<string, number>; save: boolean }> = []
  variableWrites: Array<Record<string, number>> = []
  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: '10.0.0.9', deviceId: 'c1', name: 'Living Room' },
  }
  getStatus(): ControllerStatus {
    return this.status
  }
  getConfig() {
    return Promise.resolve(this.config)
  }
  getTelemetry() {
    return Promise.resolve(this.telemetry)
  }
  listPrograms() {
    return Promise.resolve(this.programs)
  }
  getVars() {
    return Promise.resolve(this.vars)
  }
  getPixelMapData(): Promise<Uint8Array | null> {
    return Promise.resolve(encodeMapData([[0, 0], [1, 1]]))
  }
  setBrightness(value: number, save = false): Promise<void> {
    this.brightnessWrites.push({ value, save })
    return Promise.resolve()
  }
  setPixelCount(value: number, save = true): Promise<void> {
    this.pixelCountWrites.push({ value, save })
    return Promise.resolve()
  }
  setControls(controls: Record<string, number>, save = false): Promise<void> {
    this.controlWrites.push({ controls, save })
    return Promise.resolve()
  }
  setVars(vars: Record<string, number>): Promise<void> {
    this.variableWrites.push(vars)
    return Promise.resolve()
  }
}

beforeEach(() => {
  useControllerStore.setState(controllerInitialState)
  useControllerPanelStore.setState(controllerPanelInitialState)
  useEditorStore.setState(editorInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
})

afterEach(() => {
  useControllerPanelStore.getState().stop()
  resetControllerProvider()
})

describe('ControllerPanel', () => {
  it('renders nothing when no Controller is connected', () => {
    // Default registry provider is the NullControllerProvider (no-helper).
    const { container } = render(<ControllerPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows fps and brightness when connected', async () => {
    setControllerProvider(new ConnectedProvider())
    render(<ControllerPanel />)
    expect(screen.getByTestId('controller-panel')).toBeInTheDocument()
    // The first section is labeled "Pixelblaze" (matching the preview deck); the
    // device's IP shows in its own box, not as the section header. The running
    // pattern name lives in the panel title (ControllerPanelTitle), not here.
    expect(screen.getByText('Pixelblaze')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.9')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('30.0')).toBeInTheDocument())
    expect(screen.getByLabelText('Controller brightness')).toBeInTheDocument()
    expect(screen.queryByLabelText('Live duty cap')).not.toBeInTheDocument()
  })

  it('shows where to install available firmware in the Controller web UI', () => {
    setControllerProvider(new ConnectedProvider())
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: {
        '10.0.0.9': {
          ip: '10.0.0.9',
          phase: 'live',
          mapDim: 2,
          firmwareVersion: '3.67',
          firmwareUpdateState: 'available',
        },
      },
    })

    render(<ControllerPanel />)

    expect(screen.getByText('Firmware update available')).toBeInTheDocument()
    expect(screen.getByText(/v3\.67 installed/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open Pixelblaze' })
    expect(link).toHaveAttribute('href', 'http://10.0.0.9/')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shows the installed map name, map dimension, and point count in order', async () => {
    const bytes = encodeMapData([[0, 0], [1, 1]])
    const profile = {
      ...defaultControllerProfile({ id: 'ctrl-1', deviceId: 'c1', now: 1 }),
      mapFingerprints: [{
        hash: '9a0c9e7f',
        mapId: 'square',
        mapName: 'Square',
        devicePixelCount: 2,
        pushedAt: 1,
      }],
    }
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: {
        '10.0.0.9': {
          ip: '10.0.0.9',
          deviceId: 'c1',
          phase: 'live',
          mapDim: 2,
          installedMap: {
            status: 'present',
            bytes,
            fingerprint: '9a0c9e7f',
            dimension: 2,
            pointCount: 2,
            observedAt: 1,
          },
        },
      },
    })
    setControllerProvider(new ConnectedProvider())

    render(<ControllerPanel />)

    const presentation = await screen.findByTestId('installed-map-presentation')
    expect(presentation).toHaveTextContent('Square')
    expect(screen.getByLabelText('Installed map dimension: 2D')).toBeInTheDocument()
    // The device reports 256 pixels against this map's 2 points — the #204 trap, so the
    // count surfaces as a chip rather than as neutral trailing text (#757).
    await waitFor(() =>
      expect(screen.getByTestId('installed-map-count-mismatch')).toHaveTextContent('2≠256'),
    )
  })

  // #757: the name is the payload. The old row spent its width on a spelled-out point
  // count that merely restated `pixel count` from the same section, and in the 352px
  // popover that left the name nothing at all.
  it('gives the map row no unshrinkable count once the counts agree', async () => {
    const provider = new ConnectedProvider()
    provider.config = { ...provider.config, pixelCount: 2 }
    const profile = {
      ...defaultControllerProfile({ id: 'ctrl-1', deviceId: 'c1', now: 1 }),
      mapFingerprints: [{
        hash: '9a0c9e7f',
        mapId: 'square',
        mapName: 'Square',
        devicePixelCount: 2,
        pushedAt: 1,
      }],
    }
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: {
        '10.0.0.9': {
          ip: '10.0.0.9',
          deviceId: 'c1',
          phase: 'live',
          mapDim: 2,
          installedMap: {
            status: 'present',
            bytes: encodeMapData([[0, 0], [1, 1]]),
            fingerprint: '9a0c9e7f',
            dimension: 2,
            pointCount: 2,
            observedAt: 1,
          },
        },
      },
    })
    setControllerProvider(provider)

    render(<ControllerPanel />)

    await waitFor(() => expect(useControllerPanelStore.getState().pixelCount).toBe(2))
    const presentation = screen.getByTestId('installed-map-presentation')
    expect(presentation).toHaveTextContent('Square')
    expect(presentation).not.toHaveTextContent('points')
    expect(screen.queryByTestId('installed-map-count-mismatch')).not.toBeInTheDocument()
  })

  // The mechanism behind #757: the value collapsed to zero and the overflow then ate the
  // label, rendering the row as "m..". A shrink-0 label makes the name the only child
  // that can give — which is the point of the row.
  it('keeps the map label from shrinking into the name', async () => {
    setControllerProvider(new ConnectedProvider())
    render(<ControllerPanel />)

    const label = await screen.findByText('map')
    expect(label.className).toContain('shrink-0')
  })

  it('renders reading, unknown, absent, and unavailable from the shared live state', async () => {
    const provider = new ConnectedProvider()
    provider.getPixelMapData = () => new Promise<Uint8Array | null>(() => {})
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: {
        '10.0.0.9': {
          ip: '10.0.0.9',
          deviceId: 'c1',
          phase: 'live',
          mapDim: null,
          installedMap: { status: 'loading' },
        },
      },
    })
    setControllerProvider(provider)
    render(<ControllerPanel />)
    expect(screen.getByText('Reading map...')).toBeInTheDocument()

    act(() => useControllerStore.setState((state) => ({
      controllers: {
        ...state.controllers,
        '10.0.0.9': {
          ...state.controllers['10.0.0.9'],
          mapDim: 2,
          installedMap: {
            status: 'present',
            bytes: encodeMapData([[0, 0], [1, 1]]),
            fingerprint: 'unmatched',
            dimension: 2,
            pointCount: 2,
            observedAt: 1,
          },
        },
      },
    })))
    expect(screen.getByTestId('installed-map-presentation')).toHaveTextContent('Unknown map2D')

    act(() => useControllerStore.setState((state) => ({
      controllers: {
        ...state.controllers,
        '10.0.0.9': {
          ...state.controllers['10.0.0.9'],
          mapDim: null,
          installedMap: { status: 'absent', observedAt: 2 },
        },
      },
    })))
    expect(screen.getByText('No installed map')).toBeInTheDocument()

    act(() => useControllerStore.setState((state) => ({
      controllers: {
        ...state.controllers,
        '10.0.0.9': {
          ...state.controllers['10.0.0.9'],
          installedMap: { status: 'error', message: 'timeout' },
        },
      },
    })))
    expect(screen.getByText('Map unavailable')).toBeInTheDocument()
  })

  it('renders the running pattern controls and watched vars when connected', async () => {
    setControllerProvider(new ConnectedProvider())
    render(<ControllerPanel />)
    await waitFor(() => expect(screen.getByLabelText('sliderSpeed')).toBeInTheDocument())
    expect(screen.getByLabelText('toggleMirror')).toBeInTheDocument()
    // Watched var name + formatted value.
    expect(screen.getByText('phase')).toBeInTheDocument()
    expect(screen.getByText('0.50')).toBeInTheDocument()
  })

  it('renders reserved power telemetry separately from watched vars', async () => {
    const provider = new ConnectedProvider()
    provider.vars = {
      phase: 0.5,
      __px_powerDutyRecent: 0.78,
      __px_powerDutySinceStart: 0.41,
      __px_powerLimit: 0.35,
      __px_powerScale: 0.84,
      __px_powerClipping: 1,
    }
    const profile = defaultControllerProfile({ id: 'ctrl-1', deviceId: 'c1', now: 1 })
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap'
            ? {
                ...transform,
                mode: 'derived' as const,
                maxDuty: 0.35,
                milliampsPerPixel: 60,
                provenance: { targetAmps: 3, brightness: 0.5 },
              }
            : transform
        )),
      }],
      profilesLoaded: true,
    })
    setControllerProvider(provider)
    render(<ControllerPanel />)

    await waitFor(() => expect(screen.getByText('power')).toBeInTheDocument())
    expect(screen.getByText('78% / 41%')).toBeInTheDocument()
    expect(screen.getByText('35%')).toBeInTheDocument()
    expect(screen.getByLabelText('Live duty cap')).toHaveValue('0.35')
    expect(screen.getByText('84%')).toBeInTheDocument()
    expect(screen.getByText('yes')).toBeInTheDocument()
    expect(screen.getByText('≈ 4.0 A')).toBeInTheDocument()
    expect(screen.getByText('at 60 mA/px × 256 px × 40% brightness')).toBeInTheDocument()

    act(() => useControllerPanelStore.getState().setBrightness(0.3))
    expect(screen.getByText('≈ 3.0 A')).toBeInTheDocument()
    expect(screen.getByText('at 60 mA/px × 256 px × 30% brightness')).toBeInTheDocument()
    expect(screen.getByText('phase')).toBeInTheDocument()
    expect(screen.queryByText('__px_powerDutyRecent')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('About the power section'))
    expect(screen.getByText(/roughly two-second block/)).toBeInTheDocument()
    expect(screen.getByText(/cap responds from a faster internal signal/)).toBeInTheDocument()
    expect(screen.getByText(/re-push/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Live duty cap'), { target: { value: '0.2' } })
    await waitFor(() =>
      expect(provider.variableWrites[provider.variableWrites.length - 1]).toEqual({
        __px_powerLimit: 0.2,
      }),
    )
  })

  it('keeps the live duty-cap readout compact across the low-value boundary', async () => {
    const provider = new ConnectedProvider()
    provider.vars = {
      __px_powerLimit: 0.109985,
    }
    const profile = defaultControllerProfile({ id: 'ctrl-1', deviceId: 'c1', now: 1 })
    useControllerProfileStore.setState({
      profiles: [profile],
      profilesLoaded: true,
    })
    setControllerProvider(provider)
    const { rerender } = render(<ControllerPanel />)

    const dutyCap = await screen.findByLabelText('Live duty cap')
    expect(dutyCap).toHaveAttribute('aria-valuetext', '11%')
    expect(screen.getByText('11%')).toBeInTheDocument()

    provider.vars.__px_powerLimit = 0.0254
    useControllerPanelStore.setState({ vars: provider.vars })
    rerender(<ControllerPanel />)

    expect(dutyCap).toHaveAttribute('aria-valuetext', '2.5%')
    expect(screen.getByText('2.5%')).toBeInTheDocument()
  })

  it('shows the pattern-controls help only when the loaded pattern has descriptions', async () => {
    setControllerProvider(new ConnectedProvider())
    // No description metadata loaded → no help affordance on the controls section.
    const { rerender } = render(<ControllerPanel />)
    await waitFor(() => expect(screen.getByLabelText('sliderSpeed')).toBeInTheDocument())
    expect(
      screen.queryByLabelText('About the pattern controls section'),
    ).not.toBeInTheDocument()

    // Load the matching pattern metadata with a description → the "?" appears, and
    // its content describes the control.
    useEditorStore.getState().setControls([
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed', description: 'How fast it goes.' },
    ])
    rerender(<ControllerPanel />)
    const help = await screen.findByLabelText('About the pattern controls section')
    fireEvent.click(help)
    expect(screen.getByText(/How fast it goes\./)).toBeInTheDocument()
  })

  it('writes a control through the provider (volatile) when a slider moves', async () => {
    const provider = new ConnectedProvider()
    setControllerProvider(provider)
    render(<ControllerPanel />)
    const slider = await screen.findByLabelText('sliderSpeed')
    fireEvent.change(slider, { target: { value: '0.8' } })
    await waitFor(() =>
      expect(provider.controlWrites[provider.controlWrites.length - 1]).toEqual({
        controls: { sliderSpeed: 0.8 },
        save: false,
      }),
    )
  })

  it('opens a pixel-count drawer and writes the device count back (saved) on apply', async () => {
    const provider = new ConnectedProvider()
    setControllerProvider(provider)
    render(<ControllerPanel />)

    const trigger = await screen.findByRole('button', { name: 'Edit controller pixel count' })
    await waitFor(() => expect(trigger).toHaveTextContent('256'))
    fireEvent.click(trigger)

    const input = screen.getByLabelText('Controller pixel count') as HTMLInputElement
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.queryByRole('slider', { name: 'Preview resolution' })).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: '16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply controller pixel count' }))

    await waitFor(() =>
      expect(provider.pixelCountWrites[provider.pixelCountWrites.length - 1]).toEqual({
        value: 16,
        save: true,
      }),
    )
  })

  it('writes brightness through the provider when the slider moves', async () => {
    const provider = new ConnectedProvider()
    setControllerProvider(provider)
    render(<ControllerPanel />)
    const slider = screen.getByLabelText('Controller brightness')
    // The brightness slider runs on a gamma curve (curve={2}), so the range input's
    // position is in [0,1] and maps non-linearly to the value: 0.7^2 = 0.49. This
    // gives finer travel at the dim end while the value written stays in real units.
    fireEvent.change(slider, { target: { value: '0.7' } })
    await waitFor(() =>
      expect(provider.brightnessWrites[provider.brightnessWrites.length - 1]).toEqual({
        value: 0.49,
        save: false,
      }),
    )
  })
})

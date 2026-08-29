import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
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
import { resetDeckSectionPersistenceForTests } from './Deck'

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
  resetDeckSectionPersistenceForTests()
  useControllerStore.setState(controllerInitialState)
  useControllerPanelStore.setState(controllerPanelInitialState)
  useEditorStore.setState(editorInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
})

afterEach(() => {
  // Unmount first (act-wrapped) so stop() below has no mounted subscribers
  // left to re-render outside act() (#917).
  cleanup()
  useControllerPanelStore.getState().stop()
  resetControllerProvider()
})

// Panel mounts start seed/poll provider promise chains that outlive a
// synchronous test body and then re-render mounted components outside act().
// Tests that trigger them finish with this act-wrapped drain so those updates
// land inside act instead (#917).
async function settlePanelAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

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
    expect(screen.getByRole('button', { name: 'Pixelblaze' }).closest('[data-deck="section"]'))
      .toHaveClass('mt-0', 'pt-0.5')
  })

  it('orders the compact Pixelblaze controls as brightness, map, then fps', async () => {
    setControllerProvider(new ConnectedProvider())
    render(<ControllerPanel />)

    const brightness = screen.getByLabelText('Controller brightness')
    const map = screen.getByTestId('controller-installed-map')
    const fps = await screen.findByText('fps')

    expect(brightness.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(map.compareDocumentPosition(fps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows where to install available firmware in the Controller web UI', async () => {
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
    await settlePanelAsync()
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
  // label, rendering the row as "m..". The compact facts now share one fixed label track,
  // so their values stay left-aligned without putting the map back in a half-width cell.
  it('aligns map, fps, and IP on the same fixed label track', async () => {
    setControllerProvider(new ConnectedProvider())
    render(<ControllerPanel />)

    for (const label of ['map', 'fps', 'IP']) {
      const row = (await screen.findByText(label)).parentElement
      expect(row).toHaveClass('grid-cols-[2.75rem_minmax(0,1fr)]')
      expect(row?.children).toHaveLength(2)
    }
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
    await settlePanelAsync()
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

  it('makes every Controller section collapsible with useful folded defaults', async () => {
    const provider = new ConnectedProvider()
    provider.vars = {
      phase: 0.5,
      __px_powerDutyRecent: 0.29,
      __px_powerDutySinceStart: 0.38,
      __px_powerMilliAmps: 400,
      __px_powerClipping: 0,
    }
    setControllerProvider(provider)
    render(<ControllerPanel />)

    const pixelblaze = await screen.findByRole('button', { name: 'Pixelblaze' })
    const controls = screen.getByRole('button', { name: /^pattern controls$/i })
    const power = screen.getByRole('button', { name: /^power$/i })
    const variables = screen.getByRole('button', { name: /^variables$/i })
    expect(pixelblaze).toHaveAttribute('aria-expanded', 'true')
    expect(controls).toHaveAttribute('aria-expanded', 'true')
    expect(power).toHaveAttribute('aria-expanded', 'false')
    expect(variables).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(controls)
    expect(screen.getByText('2 controls')).toBeInTheDocument()
    fireEvent.click(variables)
    expect(screen.getByText('1')).toBeInTheDocument()
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
    const profile = {
      ...defaultControllerProfile({ id: 'ctrl-1', deviceId: 'c1', now: 1 }),
      electricalProfile: {
        ledPresetId: 'ws2811-12v-grouped' as const,
        supplyBudget: { value: 3, unit: 'amps' as const },
      },
    }
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

    const powerToggle = await screen.findByRole('button', { name: /^power$/i })
    expect(powerToggle).toHaveAttribute('aria-expanded', 'false')
    const summary = screen.getByTestId('controller-power-summary')
    expect(summary).toHaveTextContent('limiting · duty 78% · 4.0 A · 48.3 W')
    expect(summary).toHaveClass('whitespace-nowrap')
    expect(summary).not.toHaveClass('truncate')
    expect(screen.queryByLabelText('Live duty cap')).not.toBeInTheDocument()

    fireEvent.click(powerToggle)
    expect(screen.getByText('78% / 41%')).toBeInTheDocument()
    expect(screen.getByText('35%')).toBeInTheDocument()
    expect(screen.getByLabelText('Live duty cap')).toHaveValue('0.35')
    expect(screen.getByText('84%')).toBeInTheDocument()
    expect(screen.getByText('yes')).toBeInTheDocument()
    expect(screen.getByText('≈ 4.0 A · 48.3 W')).toBeInTheDocument()
    expect(
      screen.getByText('3-LED segments · 60 mA/addr @ 12V full white · 256 addr · 40%'),
    ).toBeInTheDocument()
    const assumptions = screen.getByTitle(
      '3-LED segments · 60 mA/addr @ 12V full white · 256 addr · 40%',
    )
    expect(assumptions).toHaveClass('truncate')

    act(() => useControllerPanelStore.getState().setBrightness(0.3))
    expect(screen.getByText('≈ 3.0 A · 36.2 W')).toBeInTheDocument()
    expect(
      screen.getByText('3-LED segments · 60 mA/addr @ 12V full white · 256 addr · 30%'),
    ).toBeInTheDocument()
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

  it('smooths limiter colour over actual poll samples in folded and expanded Power', async () => {
    const provider = new ConnectedProvider()
    provider.vars = {
      __px_powerDutyRecent: 0.5,
      __px_powerMilliAmps: 500,
      __px_powerClipping: 1,
    }
    setControllerProvider(provider)
    render(<ControllerPanel />)

    const power = await screen.findByRole('button', { name: /^power$/i })
    const folded = await screen.findByTestId('controller-power-limiting-summary')
    await waitFor(() => expect(folded).toHaveClass('text-amber-300'))
    fireEvent.click(power)
    const expanded = screen.getByTestId('controller-power-limiting-value')
    expect(expanded).toHaveClass('text-amber-300')

    provider.vars = { ...provider.vars, __px_powerClipping: 0 }
    await act(async () => useControllerPanelStore.getState().poll())
    await waitFor(() => expect(expanded).toHaveClass('text-amber-300'))
    expect(expanded).toHaveTextContent('yes')

    provider.vars = { ...provider.vars, __px_powerClipping: 0 }
    await act(async () => useControllerPanelStore.getState().poll())
    await waitFor(() => expect(expanded).toHaveClass('text-zinc-400'))
    expect(expanded).toHaveTextContent('no')
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

    fireEvent.click(await screen.findByRole('button', { name: /^power$/i }))
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
    act(() => useEditorStore.getState().setControls([
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed', description: 'How fast it goes.' },
    ]))
    rerender(<ControllerPanel />)
    const help = await screen.findByLabelText('About the pattern controls section')
    fireEvent.click(help)
    expect(screen.getByText(/How fast it goes\./)).toBeInTheDocument()
    await settlePanelAsync()
  })

  it('shows drifted or uninitialized control values as an explicit unset state, never a fabricated 0.50 (#873)', async () => {
    // Measured on the bench pb32 (fw 3.67, 2026-08-17): a saved Pattern with no
    // stored controls reports uninitialized live control values (-1.69e+38 and
    // the like) while its exported variables hold the Pattern's own defaults.
    const provider = new ConnectedProvider()
    provider.config = {
      ...provider.config,
      activeControls: {
        sliderSpeed: -1.694739e38,
        sliderZoom: -1.694739e38,
        sliderThickness: -2.132828e-14,
        sliderBrightness: 0.65,
      },
    }
    provider.vars = { speed: 0.199982, zoom: 0.329987, thickness: 0.439972, brightness: 0.649994 }
    setControllerProvider(provider)
    render(<ControllerPanel />)

    const speed = await screen.findByLabelText('sliderSpeed')
    for (const name of ['sliderSpeed', 'sliderZoom', 'sliderThickness']) {
      const slider = screen.getByLabelText(name)
      // Assistive tech hears "not set", not the range input's midpoint value.
      expect(slider).toHaveAttribute('aria-valuetext', 'not set')
      expect(slider.className).toContain('deck-slider-unset')
    }
    expect(screen.getAllByText('—')).toHaveLength(3)
    expect(screen.getAllByTitle(/reports no usable position/)).toHaveLength(3)
    // A usable in-range value still shows as itself.
    expect(screen.getByLabelText('sliderBrightness')).toHaveAttribute('aria-valuetext', '65%')
    expect(screen.queryByText('0.50')).not.toBeInTheDocument()
    expect(screen.queryByText('50%')).not.toBeInTheDocument()

    // Moving an unset control gives it a real value.
    fireEvent.change(speed, { target: { value: '0.2' } })
    await waitFor(() => expect(provider.controlWrites[provider.controlWrites.length - 1]).toEqual({
      controls: { sliderSpeed: 0.2 },
      save: false,
    }))
    expect(speed).toHaveAttribute('aria-valuetext', '20%')
  })

  it('renders no controls while the Controller reports none (#873)', async () => {
    const provider = new ConnectedProvider()
    provider.config = { ...provider.config, activeControls: undefined }
    setControllerProvider(provider)
    render(<ControllerPanel />)
    await screen.findByLabelText('Controller brightness')
    expect(screen.queryByRole('slider', { name: /^slider/ })).not.toBeInTheDocument()
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

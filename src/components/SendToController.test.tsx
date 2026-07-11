import { act, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SendToController } from './SendToController'
import { useControllerStore, controllerInitialState } from '@/store/controllerStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { controllerProfileArtifactSignature } from '@/engine/controllerProfilePassRecipe'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { trackEvent } from '@/analytics'

vi.mock('@/analytics', () => ({
  trackEvent: vi.fn(),
}))

class ConnectedProvider extends NullControllerProvider {
  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: '10.0.0.9', deviceId: 'c1' },
  }
  getStatus(): ControllerStatus {
    return this.status
  }
}

beforeEach(() => {
  useControllerStore.setState(controllerInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  vi.clearAllMocks()
})

afterEach(() => resetControllerProvider())

describe('SendToController', () => {
  it('is disabled with an explanation when no Controller is connected', () => {
    render(<SendToController />)
    const button = screen.getByTestId('send-to-controller')
    const runToggle = screen.getByRole('radio', { name: /run on controller/i })
    const saveToggle = screen.getByRole('radio', { name: /save to controller/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/connect a controller/i))
    expect(runToggle).toBeDisabled()
    expect(saveToggle).toBeDisabled()
    expect(runToggle).toHaveAttribute('title', expect.stringMatching(/connect a controller/i))
    expect(saveToggle).toHaveAttribute('title', expect.stringMatching(/connect a controller/i))
  })

  it('is enabled when connected and the dimensions match', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
    })
    render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toBeEnabled()
  })

  it('tracks a send intent when the enabled send button is clicked', () => {
    setControllerProvider(new ConnectedProvider())
    const pushActivePattern = vi.fn()
    useEditorStore.setState({ nativeDim: 2, previewSource: 'export function render2D(index, x, y) {}' })
    usePatternStore.setState({ activePatternId: 'p1' })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
      pushActivePattern,
    })
    render(<SendToController />)

    fireEvent.click(screen.getByTestId('send-to-controller'))

    expect(trackEvent).toHaveBeenCalledWith('send_to_controller', {
      mode: 'run',
      pattern_key: 'p1',
      controller_phase: 'live',
    })
    expect(pushActivePattern).toHaveBeenCalledOnce()
  })

  it('stays enabled on a dimensionality mismatch (no longer a hard block)', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 1 } },
    })
    render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toBeEnabled()
  })

  it('opens the preflight popover (warn, do not block) on a dim mismatch, and Send anyway pushes', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2, previewSource: 'export function render2D(index, x, y) {}' })
    usePatternStore.setState({ activePatternId: 'p1' })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 1 } },
    })
    render(<SendToController />)
    // No dialog until the click.
    expect(screen.queryByTestId('pattern-preflight-dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('send-to-controller'))
    const dialog = screen.getByTestId('pattern-preflight-dialog')
    expect(dialog).toHaveTextContent(/2D/)
    expect(dialog).toHaveTextContent(/1D/)

    // "Send anyway" closes the dialog and pushes.
    const pushActivePattern = vi.fn()
    useControllerStore.setState({ pushActivePattern })
    fireEvent.click(screen.getByRole('button', { name: /send anyway/i }))
    expect(pushActivePattern).toHaveBeenCalledOnce()
    expect(useControllerStore.getState().preflight).toBeNull()
  })

  it('makes a known unsupported firmware combination explicit and blocks plain send', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({
      nativeDim: 2,
      previewSource: 'export function render2D(index, x, y) {}',
    })
    usePatternStore.setState({ activePatternId: 'p1' })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: {
        '10.0.0.9': {
          ip: '10.0.0.9',
          phase: 'live',
          mapDim: 3,
          firmwareVersion: '3.65',
        },
      },
    })
    render(<SendToController />)

    fireEvent.click(screen.getByTestId('send-to-controller'))

    const dialog = screen.getByTestId('pattern-preflight-dialog')
    expect(dialog).toHaveTextContent(/requires Pixelblaze firmware 3\.66 or newer/i)
    expect(screen.getByRole('button', { name: /unsupported/i })).toBeDisabled()
  })

  it('offers the recommended-map remedy for a demo with a matching-dim recommendation', () => {
    setControllerProvider(new ConnectedProvider())
    // NebulaSphere is a 3D demo recommending Sphere shell (3D, 2048px); the device map
    // is 2D, so the dim warning fires and the remedy checkbox is offered. The confirm
    // action is mocked up front (it is wired through a prop closure, so a later swap
    // wouldn't take) — requestPush stays real to open the dialog and arm the remedy.
    const confirmPatternPushWithMap = vi.fn()
    useEditorStore.setState({ nativeDim: 3, previewSource: 'export function render3D() {}' })
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'NebulaSphere' })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
      confirmPatternPushWithMap,
    })
    render(<SendToController />)
    fireEvent.click(screen.getByTestId('send-to-controller'))

    const dialog = screen.getByTestId('pattern-preflight-dialog')
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(dialog).toHaveTextContent(/Sphere shell/)

    // With the box checked the action installs the map first.
    fireEvent.click(screen.getByRole('button', { name: /install & send/i }))
    expect(confirmPatternPushWithMap).toHaveBeenCalledOnce()
  })

  it('falls back to a plain push when the remedy checkbox is unchecked', () => {
    setControllerProvider(new ConnectedProvider())
    const confirmPatternPush = vi.fn()
    useEditorStore.setState({ nativeDim: 3, previewSource: 'export function render3D() {}' })
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'NebulaSphere' })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
      confirmPatternPush,
    })
    render(<SendToController />)
    fireEvent.click(screen.getByTestId('send-to-controller'))

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /send anyway/i }))
    expect(confirmPatternPush).toHaveBeenCalledOnce()
  })

  it('pushes straight through (no popover) when the dimensions match', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2, previewSource: 'export function render2D(index, x, y) {}' })
    usePatternStore.setState({ activePatternId: 'p1' })
    const pushActivePattern = vi.fn()
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
      pushActivePattern,
    })
    render(<SendToController />)
    fireEvent.click(screen.getByTestId('send-to-controller'))
    expect(screen.queryByTestId('pattern-preflight-dialog')).not.toBeInTheDocument()
    expect(pushActivePattern).toHaveBeenCalledOnce()
  })

  it('runs the preflight (requestPush) on click when enabled', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    const requestPush = vi.fn()
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
      requestPush,
    })
    render(<SendToController />)
    fireEvent.click(screen.getByTestId('send-to-controller'))
    expect(requestPush).toHaveBeenCalledOnce()
  })

  it('keeps the full label and disables while a push is in flight', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', nickname: 'Burner Bag', phase: 'live', mapDim: 2 } },
      pushing: true,
    })
    render(<SendToController />)
    const button = screen.getByTestId('send-to-controller')
    // The name is held (no collapse); only the leading glyph (spinner) shows.
    expect(button).toHaveTextContent('Burner Bag')
    expect(button.querySelector('svg')).toBeTruthy()
    expect(button).toBeDisabled()
  })

  const connectActive = () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
  }

  it('flips the armed mode when the Save segment is clicked', () => {
    connectActive()
    render(<SendToController />)
    const toggle = screen.getByTestId('save-toggle')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(useControllerStore.getState().saveArmed).toBe(true)
  })

  it('tooltips Play when run-armed and Save when save-armed', () => {
    connectActive()
    const { rerender } = render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toHaveAttribute(
      'title',
      expect.stringMatching(/play on desk/i),
    )
    useControllerStore.setState({ saveArmed: true })
    rerender(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toHaveAttribute(
      'title',
      expect.stringMatching(/save to desk/i),
    )
  })

  it('re-enables Send when the toggle is flipped after a clean push of the other mode', () => {
    connectActive()
    useEditorStore.setState({ previewSource: 'export function render() {}' })
    // A clean run push: the run record matches the current source, so run-mode Send
    // is inert — but save-mode Send must stay enabled (saving is not yet done).
    useControllerStore.setState({
      lastPushedSource: { '10.0.0.9': { p1: 'export function render() {}' } },
      lastPushedProfileSignature: {
        '10.0.0.9': {
          p1: controllerProfileArtifactSignature(null, 'p1', { mapDim: 2 }),
        },
      },
    })
    usePatternStore.setState({ activePatternId: 'p1' })
    render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toBeDisabled()
    fireEvent.click(screen.getByTestId('save-toggle'))
    expect(screen.getByTestId('send-to-controller')).toBeEnabled()
  })

  it('re-enables Send when generated Controller Profile configuration changes', () => {
    setControllerProvider(new ConnectedProvider())
    const source = 'export function render() { hsv(0, 1, 1) }'
    const profile = defaultControllerProfile({ id: 'profile-1', deviceId: 'c1', now: 1 })
    const previousSignature = controllerProfileArtifactSignature(profile, 'p1', { mapDim: 2 })
    useEditorStore.setState({ nativeDim: 2, previewSource: source })
    usePatternStore.setState({ activePatternId: 'p1' })
    useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: {
        '10.0.0.9': { ip: '10.0.0.9', deviceId: 'c1', phase: 'live', mapDim: 2 },
      },
      lastPushedSource: { '10.0.0.9': { p1: source } },
      lastPushedProfileSignature: { '10.0.0.9': { p1: previousSignature } },
    })
    render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toBeDisabled()

    act(() => {
      useControllerProfileStore.setState({
        profiles: [{
          ...profile,
          globalTransforms: profile.globalTransforms.map((transform) =>
            transform.type === 'power-cap' ? { ...transform, enabled: true } : transform,
          ),
        }],
      })
    })

    expect(screen.getByTestId('send-to-controller')).toBeEnabled()
  })

  it('re-enables Send when the Controller map dimension changes the generated artifact', () => {
    setControllerProvider(new ConnectedProvider())
    const source = 'export function render3D(index, x, y, z) {}'
    useEditorStore.setState({ nativeDim: 3, previewSource: source })
    usePatternStore.setState({ activePatternId: 'p1' })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: {
        '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 3 },
      },
      lastPushedSource: { '10.0.0.9': { p1: source } },
      lastPushedProfileSignature: {
        '10.0.0.9': {
          p1: controllerProfileArtifactSignature(null, 'p1', { mapDim: 2 }),
        },
      },
    })

    render(<SendToController />)

    expect(screen.getByTestId('send-to-controller')).toBeEnabled()
  })

  it('names the action after the active Controller', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toHaveTextContent('Desk')
  })
})

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ControllerActionRow } from './ControllerActionRow'
import { useControllerStore } from '@/store/controllerStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useRouterStore } from '@/store/routerStore'
import { useControllerPanelStore, controllerPanelInitialState } from '@/store/controllerPanelStore'
import { useControllerProfileStore, controllerProfileInitialState } from '@/store/controllerProfileStore'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'

class ConnectedProvider extends NullControllerProvider {
  private status: ControllerStatus = { kind: 'connected', controller: { id: 'c1', address: '10.0.0.9', deviceId: 'c1' } }
  getStatus(): ControllerStatus { return this.status }
}
beforeEach(() => {
  useControllerStore.setState(useControllerStore.getInitialState(), true)
  useEditorStore.setState({ ...editorInitialState, nativeDim: 2, previewSource: 'export function render2D(index, x, y) {}' })
  usePatternStore.setState({ ...patternInitialState, activePatternId: 'p1', userPatterns: [{ id: 'p1', name: 'Test Pattern', src: 'export function render2D(index, x, y) {}', controls: {}, updatedAt: 1 }] })
  useRouterStore.setState({ route: { kind: 'studio', entity: { kind: 'patterns', id: 'p1' } } })
  useControllerPanelStore.setState(controllerPanelInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  setControllerProvider(new ConnectedProvider())
  useControllerStore.setState({ activeIp: '10.0.0.9', controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 1 } } })
})
afterEach(() => { cleanup(); resetControllerProvider(); vi.useRealTimers() })

it('owns Pattern warning confirmation in the popover and sends exactly once', () => {
  const pushActivePattern = vi.fn()
  useControllerStore.setState({ pushActivePattern })
  render(<ControllerActionRow />)
  fireEvent.click(screen.getByRole('button', { name: 'Run' }))
  expect(screen.getByTestId('pattern-preflight-dialog')).toHaveTextContent(/2D/)
  expect(pushActivePattern).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /send anyway/i }))
  expect(pushActivePattern).toHaveBeenCalledOnce()
  expect(screen.queryByTestId('pattern-preflight-dialog')).not.toBeInTheDocument()
})

it('cancels Pattern confirmation on close and cannot revive it on reopen', () => {
  const pushActivePattern = vi.fn()
  useControllerStore.setState({ pushActivePattern })
  const view = render(<ControllerActionRow />)
  fireEvent.click(screen.getByRole('button', { name: 'Run' }))
  expect(screen.getByTestId('pattern-preflight-dialog')).toBeInTheDocument()
  view.unmount()
  render(<ControllerActionRow />)
  expect(screen.queryByTestId('pattern-preflight-dialog')).not.toBeInTheDocument()
  expect(pushActivePattern).not.toHaveBeenCalled()
})

it.each(['Cancel', 'Escape', 'outside'] as const)('cancels Pattern confirmation via %s without sending', (action) => {
  const pushActivePattern = vi.fn()
  useControllerStore.setState({ pushActivePattern })
  render(<ControllerActionRow />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  if (action === 'Cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  else if (action === 'Escape') fireEvent.keyDown(window, { key: 'Escape' })
  else fireEvent.mouseDown(document.body)
  expect(screen.queryByTestId('pattern-preflight-dialog')).not.toBeInTheDocument()
  expect(pushActivePattern).not.toHaveBeenCalled()
})

it('preserves unrelated map preflight when closing the Controller popover', () => {
  const view = render(<ControllerActionRow />)
  const warnings = [{ kind: 'map-overwrite' as const, message: 'Replace installed map' }]
  act(() => useControllerStore.setState({ preflight: warnings }))
  view.unmount()
  expect(useControllerStore.getState().preflight).toEqual(warnings)
})

it('blocks unsupported firmware in Pattern preflight', () => {
  useControllerStore.setState({ controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 3, firmwareVersion: '3.65' } } })
  const pushActivePattern = vi.fn()
  useControllerStore.setState({ pushActivePattern })
  render(<ControllerActionRow />)
  fireEvent.click(screen.getByRole('button', { name: 'Run' }))
  expect(screen.getByTestId('pattern-preflight-dialog')).toHaveTextContent(/requires Pixelblaze firmware 3.66 or newer/i)
  expect(screen.getByRole('button', { name: 'Unsupported' })).toBeDisabled()
  expect(pushActivePattern).not.toHaveBeenCalled()
})

it.each([true, false])('preserves recommended map choice: install %s', (install) => {
  const confirmPatternPushWithMap = vi.fn()
  const confirmPatternPush = vi.fn()
  useEditorStore.setState({ nativeDim: 3, previewSource: 'export function render3D() {}' })
  usePatternStore.setState({ activePatternId: null, activeDemoName: 'NebulaSphere' })
  useRouterStore.setState({ route: { kind: 'studio', entity: { kind: 'patterns', id: 'NebulaSphere' } } })
  useControllerStore.setState({ confirmPatternPushWithMap, confirmPatternPush, controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } } })
  render(<ControllerActionRow />)
  fireEvent.click(screen.getByRole('button', { name: 'Run' }))
  expect(screen.getByTestId('pattern-preflight-dialog')).toHaveTextContent('Sphere shell')
  expect(screen.getByRole('checkbox')).toBeChecked()
  if (!install) fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: install ? /install & send/i : /send anyway/i }))
  expect(install ? confirmPatternPushWithMap : confirmPatternPush).toHaveBeenCalledOnce()
  expect(install ? confirmPatternPush : confirmPatternPushWithMap).not.toHaveBeenCalled()
})

it.each(['run', 'save'] as const)('shows and dismisses the owning Pattern %s failure in the popover', (mode) => {
  useControllerStore.setState({ artifactPushResult: { ok: false, artifactId: 'p1', mode, message: 'Map installation failed' } })
  render(<ControllerActionRow />)
  const label = mode === 'run' ? 'Run' : 'Save'
  expect(screen.getByRole('alert')).toHaveTextContent(`${label} failed: Map installation failed`)
  fireEvent.click(screen.getByRole('button', { name: `Dismiss ${label} failure` }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('sends a matching Pattern directly without new confirmation', () => {
  const pushActivePattern = vi.fn()
  useControllerStore.setState({ pushActivePattern, controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } } })
  render(<ControllerActionRow />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.queryByTestId('pattern-preflight-dialog')).not.toBeInTheDocument()
  expect(pushActivePattern).toHaveBeenCalledOnce()
  expect(useControllerStore.getState().saveArmed).toBe(true)
})

it('retires Pattern confirmation on route departure without consuming a later Pattern', () => {
  const pushActivePattern = vi.fn()
  useControllerStore.setState({ pushActivePattern })
  render(<ControllerActionRow />)
  fireEvent.click(screen.getByRole('button', { name: 'Run' }))
  act(() => useRouterStore.setState({ route: { kind: 'studio', entity: { kind: 'patterns', id: 'another' } } }))
  expect(screen.queryByTestId('pattern-preflight-dialog')).not.toBeInTheDocument()
  expect(pushActivePattern).not.toHaveBeenCalled()
})

it('keeps failed Pattern delivery visible across reopen and permits a deliberate retry', () => {
  const pushActivePattern = vi.fn(() => {
    useControllerStore.getState().reportArtifactPushFailure({ ok: false, artifactId: 'p1', mode: 'run', message: 'Controller rejected artifact' })
    return Promise.resolve()
  })
  useControllerStore.setState({ pushActivePattern })
  const view = render(<ControllerActionRow />)
  fireEvent.click(screen.getByRole('button', { name: 'Run' }))
  fireEvent.click(screen.getByRole('button', { name: 'Send anyway' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Run failed: Controller rejected artifact')
  view.unmount()
  render(<ControllerActionRow />)
  expect(screen.getByRole('alert')).toHaveTextContent('Run failed: Controller rejected artifact')
  fireEvent.click(screen.getByRole('button', { name: 'Run' }))
  expect(pushActivePattern).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Send anyway' }))
  expect(pushActivePattern).toHaveBeenCalledTimes(2)
})

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { findLayoutFaults, formatLayoutFaults } from '@whiteroom/software-process/layout-faults'
import { ControllerBar } from './ControllerBar'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { controllerPanelInitialState, useControllerPanelStore } from '@/store/controllerPanelStore'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { defaultControllerProfile, useControllerProfileStore } from '@/store/controllerProfileStore'
import { useRouterStore, routerInitialState } from '@/store/routerStore'

class PanelProvider extends NullControllerProvider {
  private status: ControllerStatus = { kind: 'connected', controller: { id: 'fixture', deviceId: 'fixture', address: '10.0.0.9', name: 'Fixture' } }
  getStatus() { return this.status }
  async getConfig() { return { brightness: 0.38, activeProgramId: 'pattern', pixelCount: 1000, activeControls: { sliderSpeed: 0.4, sliderDensity: 0.62, toggleMirror: 1 } } }
  async getTelemetry() { return { fps: 41.2 } }
  async listPrograms() { return [{ id: 'pattern', name: 'IridescentFibers' }] }
  async getVars() { return { phase: 0.61, t: 8.8, __px_powerDutyRecent: 0.62, __px_powerDutySinceStart: 0.58, __px_powerLimit: 0.5, __px_powerScale: 0.8, __px_powerClipping: 1 } }
}

beforeEach(() => {
  useRouterStore.setState(routerInitialState)
  usePanelPreferencesStore.setState({ expanded: {} })
  useControllerPanelStore.setState(controllerPanelInitialState)
  useControllerProfileStore.setState({ profiles: [defaultControllerProfile({ id: 'fixture', deviceId: 'fixture', now: 1 })], profilesLoaded: true })
  setControllerProvider(new PanelProvider())
  useControllerStore.setState({ extensionPresent: true, activeIp: '10.0.0.9', controllers: { '10.0.0.9': { ip: '10.0.0.9', nickname: 'Fixture', phase: 'live', deviceId: 'fixture', mapDim: 2, installedMap: { status: 'absent', observedAt: 1 } } }, setActive: ip => useControllerStore.setState({ activeIp: ip }) })
})
afterEach(() => {
  cleanup()
  useControllerPanelStore.getState().stop()
  resetControllerProvider()
  useControllerStore.setState(useControllerStore.getInitialState(), true)
})

for (const width of [400, 320]) it(`keeps Controller fields operable at ${width}px with one-line summaries`, async () => {
  render(<ControllerBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Fixture panel' }))
  const popover = screen.getByTestId('controller-panel-popover')
  Object.assign(popover.style, { width: `${width}px`, left: '16px', right: 'auto' })
  await screen.findByRole('button', { name: 'Power' })
  const brightness = screen.getByRole('slider', { name: 'Controller brightness' })
  expect(brightness.closest('[data-deck="section"]')).toBeNull()
  await waitFor(() => expect(Math.round(brightness.getBoundingClientRect().width)).toBe(72))
  for (const header of popover.querySelectorAll('.panel-section-header')) expect(header.getBoundingClientRect().height).toBe(28)
  const controlGrid = popover.querySelector('.controller-section-controls [data-deck="grid"]')!
  expect(getComputedStyle(controlGrid).gridTemplateColumns.split(' ')).toHaveLength(width < 360 ? 2 : 4)
  for (const label of ['Pixelblaze', 'Power', 'Variables']) fireEvent.click(screen.getByRole('button', { name: label }))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)) })
  const bounds = popover.getBoundingClientRect()
  for (const input of popover.querySelectorAll('input')) {
    const rect = input.getBoundingClientRect()
    expect(rect.width).toBeGreaterThanOrEqual(input.type === 'range' ? 24 : 12)
    expect(rect.left).toBeGreaterThanOrEqual(bounds.left)
    expect(rect.right).toBeLessThanOrEqual(bounds.right)
  }
  const faults = findLayoutFaults(popover)
  expect(faults, formatLayoutFaults(faults)).toEqual([])
})

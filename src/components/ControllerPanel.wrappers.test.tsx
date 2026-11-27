// The Controller panel's Wrappers group (#1280). Grouping rules are tested in
// `src/engine/controllerPanelWrappers.test.ts`; this checks placement and wiring.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ControllerPanel } from './ControllerPanel'
import { resetDeckSectionPersistenceForTests } from './Deck'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { routerInitialState, useRouterStore } from '@/store/routerStore'
import { controllerPanelInitialState, useControllerPanelStore } from '@/store/controllerPanelStore'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerConfig, type ControllerStatus } from '@/engine/ControllerProvider'
import {
  resetControllerMetadataStorage,
  setControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import type { BindingStore } from '@/engine/controllerBinding'
import type { ControllerPushRecords } from '@/engine/controllerPushRecord'
import type { ControllerWrapperType } from '@/engine/controllerProfile'

const IP = '10.0.0.9'

class Provider extends NullControllerProvider {
  config: ControllerConfig
  controlWrites: Array<{ controls: Record<string, number>; save: boolean }> = []
  constructor(activeProgramId: string, activeControls: Record<string, number>) {
    super()
    this.config = { brightness: 0.4, activeProgramId, activeControls, pixelCount: 256 }
  }
  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: IP, deviceId: 'c1', name: 'Bench' },
  }
  private programs = [{ id: 'prog-a', name: 'Aurora' }, { id: 'prog-s', name: 'Tide' }]
  getStatus(): ControllerStatus { return this.status }
  getConfig() { return Promise.resolve(this.config) }
  getTelemetry() { return Promise.resolve({ fps: 30 }) }
  listPrograms() { return Promise.resolve(this.programs) }
  getVars() { return Promise.resolve({}) }
  setControls(controls: Record<string, number>, save = false): Promise<void> {
    this.controlWrites.push({ controls, save })
    return Promise.resolve()
  }
}

function useSaved(bindings: BindingStore, pushRecords: ControllerPushRecords) {
  setControllerMetadataStorage({
    id: 'test',
    getControllerBindings: () => Promise.resolve(bindings),
    setControllerBindings: () => Promise.resolve(),
    getProgramLabels: () => Promise.resolve({}),
    setProgramLabels: () => Promise.resolve(),
    getPushRecords: () => Promise.resolve(pushRecords),
    setPushRecords: () => Promise.resolve(),
  })
}

function connect(provider: Provider, enabled: ControllerWrapperType[] = []) {
  // The observed count matches, so polling persists nothing to the profile.
  const profile = { ...defaultControllerProfile({ ip: IP, deviceId: 'c1' }), lastKnownPixelCount: 256 }
  profile.globalTransforms = [
    ...profile.globalTransforms,
    ...enabled.map((type) => ({ id: type, type, enabled: true })),
  ]
  useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
  useControllerStore.setState({
    activeIp: IP,
    controllers: { [IP]: { ip: IP, deviceId: 'c1', phase: 'live' } } as never,
  })
  setControllerProvider(provider)
}

const bindings: BindingStore = { [IP]: { 'pattern-a': 'prog-a', 'show:tide': 'prog-s' } }
const record = (applied: ControllerWrapperType[]): ControllerPushRecords => ({
  [IP]: {
    'pattern-a': {
      transforms: [],
      artifactHash: 'h',
      stampedAt: '2026-11-26T00:00:00.000Z',
      name: 'Aurora',
      wrapperOutcome: { applied, skipped: {} },
      wrapperProgramId: 'prog-a',
    },
  },
})

const sectionHeadings = () =>
  screen.getAllByRole('button', { expanded: true }).map((b) => b.textContent ?? '')

beforeEach(() => {
  resetDeckSectionPersistenceForTests()
  useControllerStore.setState(controllerInitialState)
  useControllerPanelStore.setState(controllerPanelInitialState)
  useEditorStore.setState(editorInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  localStorage.clear()
  usePanelPreferencesStore.setState({ expanded: {} })
  useRouterStore.setState(routerInitialState)
})

afterEach(() => {
  cleanup()
  useControllerPanelStore.getState().stop()
  resetControllerProvider()
  resetControllerMetadataStorage()
})

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

describe('ControllerPanel Wrappers group', () => {
  it('lists the saved Wrappers above the Controls and writes the reserved export (C1)', async () => {
    useSaved(bindings, record(['slow-mo', 'dreamy']))
    const provider = new Provider('prog-a', { sliderSpeed: 0.4, sliderSlowMo: 0.3, sliderDreamy: 0.6 })
    connect(provider, ['slow-mo', 'dreamy'])
    render(<ControllerPanel />)
    const slowMo = await screen.findByRole('slider', { name: 'Slow-mo' })
    const dreamy = screen.getByRole('slider', { name: 'Dreamy' })
    expect(screen.getByRole('slider', { name: 'sliderSpeed' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'sliderSlowMo' })).toBeNull()
    const panel = screen.getByTestId('controller-panel')
    const wrappers = panel.querySelector('.controller-section-wrappers')!
    const controls = panel.querySelector('.controller-section-controls')!
    expect(wrappers.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(wrappers as HTMLElement).getAllByRole('slider')).toEqual([slowMo, dreamy])
    fireEvent.change(slowMo, { target: { value: '0.75' } })
    expect(provider.controlWrites).toEqual([{ controls: { sliderSlowMo: 0.75 }, save: false }])
    await settle()
  })

  it('renders no group for a Pattern without Wrappers (C2)', async () => {
    useSaved(bindings, record([]))
    connect(new Provider('prog-a', { sliderSpeed: 0.4, toggleMirror: 1 }), ['slow-mo'])
    render(<ControllerPanel />)
    await screen.findByRole('slider', { name: 'sliderSpeed' })
    await settle()
    expect(screen.queryByText('Wrappers')).toBeNull()
    expect(sectionHeadings().some((text) => text.includes('Wrappers'))).toBe(false)
  })

  it('reads the Show line for a Show while a Wrapper is on (C3)', async () => {
    useSaved(bindings, {})
    connect(new Provider('prog-s', { sliderSpeed: 0.4 }), ['dreamy'])
    render(<ControllerPanel />)
    expect(await screen.findByTestId('controller-wrappers-show-line')).toHaveTextContent('Dreamy is off for Shows.')
    expect(screen.queryByRole('slider', { name: 'Dreamy' })).toBeNull()
  })

  it('shows a never-set applied Wrapper as indeterminate and still draggable (C4)', async () => {
    useSaved(bindings, record(['slow-mo']))
    const provider = new Provider('prog-a', { sliderSpeed: 0.4 })
    connect(provider, ['slow-mo'])
    render(<ControllerPanel />)
    const slowMo = await screen.findByRole('slider', { name: 'Slow-mo' })
    await waitFor(() => expect(slowMo).toHaveAttribute('aria-valuetext', 'not set'))
    expect(screen.getByTitle(/^Not set: the Controller reports no usable position/)).toHaveTextContent('—')
    fireEvent.change(slowMo, { target: { value: '0.2' } })
    expect(provider.controlWrites).toEqual([{ controls: { sliderSlowMo: 0.2 }, save: false }])
    await settle()
  })
})

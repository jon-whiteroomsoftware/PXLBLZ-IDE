import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import {
  addShowScene,
  addShowRoutingLayout,
  addShowZone,
  createDefaultShow,
  createShowWithOutputContract,
  removeShowScene,
  spanShowCellZones,
  updateShowCellAdaptations,
  updateShowCellPattern,
  updateShowRoutingLayout,
  updateShowRoutingSwitch,
  updateShowScene,
  updateShowTransition,
} from '@/engine/showModel'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { MapRecord, MixinRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from '@/engine/showOutputContract'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'

function memoryProvider(seedShows: ShowRecord[] = []): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const maps = new Map<string, MapRecord>()
  const mixins = new Map<string, MixinRecord>()
  const shows = new Map(seedShows.map((show) => [show.id, show]))
  const controllers = new Map<string, ControllerProfile>()
  return {
    id: 'memory-test',
    listPatterns: async () => [...patterns.values()],
    createPattern: async (record) => { patterns.set(record.id, record) },
    updatePattern: async (id, changes) => { patterns.set(id, { ...patterns.get(id)!, ...changes }) },
    deletePattern: async (id) => { patterns.delete(id) },
    listMaps: async () => [...maps.values()],
    createMap: async (record) => { maps.set(record.id, record) },
    updateMap: async (id, changes) => { maps.set(id, { ...maps.get(id)!, ...changes }) },
    deleteMap: async (id) => { maps.delete(id) },
    listMixins: async () => [...mixins.values()],
    createMixin: async (record) => { mixins.set(record.id, record) },
    updateMixin: async (id, changes) => { mixins.set(id, { ...mixins.get(id)!, ...changes }) },
    deleteMixin: async (id) => { mixins.delete(id) },
    listShows: async () => [...shows.values()],
    createShow: async (record) => { shows.set(record.id, record) },
    updateShow: async (id, changes) => { shows.set(id, { ...shows.get(id)!, ...changes }) },
    deleteShow: async (id) => { shows.delete(id) },
    listControllerProfiles: async () => [...controllers.values()],
    createControllerProfile: async (profile) => { controllers.set(profile.id, profile) },
    updateControllerProfile: async (id, changes) => { controllers.set(id, { ...controllers.get(id)!, ...changes }) },
    deleteControllerProfile: async (id) => { controllers.delete(id) },
    getLastActive: async () => undefined,
    setLastActive: async () => {},
    getDemoOverrides: async () => undefined,
    setDemoOverrides: async () => {},
  }
}

class ConnectedControllerProvider extends NullControllerProvider {
  private readonly connectedStatus: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'ctrl-live', address: '10.0.0.5', deviceId: null, name: 'Bench PB' },
  }

  getStatus(): ControllerStatus {
    return this.connectedStatus
  }

  subscribe(): () => void {
    return () => {}
  }
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  usePreviewStore.setState(previewInitialState)
  useShowTransportStore.setState(showTransportInitialState)
  useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState)
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
  useControllerStore.setState(controllerInitialState)
  resetControllerProvider()
})

afterEach(() => resetControllerProvider())

describe('ShowEditor (#318)', () => {
  it('opens a stock Show in the real editor without creating a personal record (#363)', async () => {
    const stock = STOCK_SHOWS[0]

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly />)

    expect(screen.getByText('Built-in Show')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show preview/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show properties' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Split at playhead' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clone selection' })).toBeDisabled()
    expect(useShowStore.getState().shows).toEqual([])
  })

  it('discloses one stable read-only Scene X-ray and transfers Super Detail between owners (#471)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-scene-xray', 'Scene X-ray', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Scene 1 Scene X-ray, read only' })).toHaveClass('h-[36px]')
    await user.click(screen.getByRole('button', { name: 'Inspect Scene 1 in Super Detail' }))
    expect(screen.getByRole('dialog', { name: 'Scene 1 Super Detail' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Scene' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show Scene 2 Scene X-ray' }))
    expect(screen.queryByRole('group', { name: 'Scene 1 Scene X-ray, read only' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Scene 2 Scene X-ray, read only' })).toHaveClass('h-[36px]')
    expect(screen.queryByRole('dialog', { name: 'Scene 1 Super Detail' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Scene 2 Super Detail' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('slider', { name: 'Timeline zoom' }), { target: { value: '5.1' } })
    expect(screen.getByRole('group', { name: 'Scene 2 Scene X-ray, read only' })).toHaveClass('h-[36px]')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Scene 2 Super Detail' })).not.toBeInTheDocument()
  })

  it('switches from an existing Show to a newly created Show during playback without an update loop', async () => {
    const existing = createDefaultShow('show-existing', 'Existing Show', 1000)
    existing.scenes[0] = { ...existing.scenes[0], durationMs: 12_000 }
    const created = createDefaultShow('show-created', 'Untitled Show', 2000)
    useShowStore.setState({
      shows: [created, existing],
      activeShowId: existing.id,
      showsLoaded: true,
    })

    useShowTransportStore.getState().openShow(existing.id, 43_000)
    const view = render(<ShowEditor showId={existing.id} />)
    view.rerender(<ShowEditor showId={created.id} />)
    useShowTransportStore.getState().openShow(created.id, 62_000)

    for (let frame = 1; frame <= 60; frame += 1) {
      await act(async () => {
        useShowTransportStore.getState().setPosition(created.id, frame * 16)
      })
    }

    await userEvent.setup().click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Untitled Show')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
  })

  it('keeps the Show workspace scrollable without exposing a vertical scrollbar', () => {
    const show = createDefaultShow('show-scroll', 'Long Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByTestId('show-editor-scroll')).toHaveClass('overflow-auto', 'scrollbar-hidden')
  })

  it('leaves Space with toolbar controls that own activation', () => {
    const show = createDefaultShow('show-space', 'Keyboard Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Fit timeline to Show' }), { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('leaves Space available while editing Show text', () => {
    const show = createDefaultShow('show-text-space', 'Text Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Scene 1 scene name' }), { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('toggles playback with Space while the Show playhead has focus', () => {
    const show = createDefaultShow('show-playhead-space', 'Focused playhead', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })

    render(<ShowEditor showId={show.id} />)

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    playhead.focus()
    fireEvent.keyDown(playhead, { code: 'Space', key: ' ' })

    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('toggles playback with Space while the Show navigator thumb has focus', () => {
    const show = createDefaultShow('show-navigator-space', 'Focused navigator', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })

    render(<ShowEditor showId={show.id} />)

    const navigator = screen.getByRole('slider', { name: 'Pan visible timeline range' })
    navigator.focus()
    fireEvent.keyDown(navigator, { code: 'Space', key: ' ' })

    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('does not reactivate Add zone when Space follows a navigator interaction', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-add-zone-focus', 'Add zone focus', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByRole('region', { name: 'Show timeline' })
    await user.click(within(timeline).getByRole('button', { name: 'Add zone' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].zones).toHaveLength(2))

    const navigator = screen.getByRole('slider', { name: 'Pan visible timeline range' })
    fireEvent.pointerDown(navigator, { pointerId: 1, clientX: 10 })
    fireEvent.pointerUp(navigator, { pointerId: 1, clientX: 10 })
    await user.keyboard(' ')

    expect(useShowStore.getState().shows[0].zones).toHaveLength(2)
    expect(usePreviewStore.getState().isRunning).toBe(false)
  })

  it('returns focus to the selected Clip after a discrete inspector commit so Space previews the change (#439)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-focus-return', 'Fast edit loop', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const selectedClip = screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0]
    await user.click(selectedClip)
    await user.clear(screen.getByRole('combobox', { name: 'Source pattern' }))
    await user.type(screen.getByRole('combobox', { name: 'Source pattern' }), 'CometLoom')
    await user.click(screen.getByRole('option', { name: 'CometLoom' }))

    await waitFor(() => expect(document.activeElement).toBe(selectedClip))
    await user.keyboard(' ')
    expect(usePreviewStore.getState().isRunning).toBe(false)
  })

  it('seeks by one second and Home with clamping while preserving playback (#439)', () => {
    const show = createDefaultShow('show-keyboard-seek', 'Keyboard seek', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    const transport = useShowTransportStore.getState()

    usePreviewStore.setState({ isRunning: false })
    transport.setPosition(show.id, 500)
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(false)

    usePreviewStore.setState({ isRunning: true })
    useShowTransportStore.getState().setPosition(show.id, 61_500)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 62_000 })
    expect(usePreviewStore.getState().isRunning).toBe(true)

    fireEvent.keyDown(document, { key: 'Home' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    const goToStart = screen.getByRole('button', { name: 'Go to Show start' })
    expect(goToStart).toHaveAttribute('title', 'Go to Show start (Home)')
    useShowTransportStore.getState().setPosition(show.id, 5_000)
    fireEvent.click(goToStart)
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('accelerates held arrow keys on the Show playhead and commits on release', () => {
    const show = createDefaultShow('show-keyboard-hold', 'Keyboard hold', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    act(() => useShowTransportStore.getState().setPosition(show.id, 10_000))

    const press = (timeStamp: number, repeat: boolean) => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', repeat, bubbles: true })
      Object.defineProperty(event, 'timeStamp', { value: timeStamp })
      fireEvent(playhead, event)
    }

    press(100, false)
    expect(useShowTransportStore.getState().positionMs).toBe(11_000)
    press(700, true)
    expect(useShowTransportStore.getState().positionMs).toBe(13_000)
    press(1_700, true)
    expect(useShowTransportStore.getState().positionMs).toBe(18_000)
    expect(useShowTransportStore.getState().seekRequest).toBeNull()

    fireEvent.keyUp(playhead, { key: 'ArrowRight' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 18_000 })
  })

  it('keeps Arrow keys local to number, range, select, and navigator controls (#439)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-owned-arrows', 'Owned arrows', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    act(() => useShowTransportStore.getState().setPosition(show.id, 5_000))

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Show playhead' }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Scene 1 duration seconds' }), { key: 'ArrowLeft' })
    await user.click(screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0])
    fireEvent.keyDown(screen.getByLabelText('Source pattern'), { key: 'ArrowRight' })

    expect(useShowTransportStore.getState()).toMatchObject({ positionMs: 6_000, seekRequest: null })
  })

  it('removes Show shortcuts when the Show editor closes (#439)', () => {
    const show = createDefaultShow('show-shortcut-scope', 'Shortcut scope', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    const view = render(<ShowEditor showId={show.id} />)
    useShowTransportStore.getState().setPosition(show.id, 5_000)

    view.unmount()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { code: 'Space' })

    expect(useShowTransportStore.getState()).toMatchObject({ positionMs: 5_000, seekRequest: null })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('drives proportional Show transport and requests an accurate seek (#414)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Show playhead' })).toHaveAttribute('max', '62000')
    expect(screen.getByRole('status', { name: 'Show time' })).toHaveTextContent('00:00.0/01:02.0')
    expect(screen.getByRole('button', { name: 'Pause Show preview' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pause Show preview' }))
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(screen.getByRole('button', { name: 'Play Show preview' })).toBeInTheDocument()

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    fireEvent.change(playhead, { target: { value: '31000' } })

    expect(useShowTransportStore.getState().seekRequest).toBeNull()
    expect(screen.getByRole('status', { name: 'Show time' })).toHaveTextContent('00:31.0/01:02.0')

    fireEvent.pointerUp(playhead)

    await waitFor(() => {
      expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 31_000 })
    })
    expect(useShowTransportStore.getState().seekStatus).toBe('rebuilding')

    fireEvent.keyDown(document, { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('snaps pointer scrubbing to Show boundaries and allows snapping to be disabled (#63)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-63-snap', 'Snapping', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const toggle = screen.getByRole('button', { name: 'Snap playhead' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute(
      'title',
      'Snap to scene, clip, transition, and time-grid boundaries. Hold Alt to temporarily reverse.',
    )
    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    fireEvent.pointerDown(playhead)
    fireEvent.change(playhead, { target: { value: '29500' } })
    expect(useShowTransportStore.getState().positionMs).toBe(30_000)
    fireEvent.pointerUp(playhead)

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.pointerDown(playhead)
    fireEvent.change(playhead, { target: { value: '29500' } })
    expect(useShowTransportStore.getState().positionMs).toBe(29_500)
    fireEvent.pointerUp(playhead)
  })

  it('organizes the production Timeline header by transport, zoom, and command priority (#466)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-toolbar-groups', 'Toolbar study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const transport = screen.getByRole('group', { name: 'Show transport controls' })
    expect(within(transport).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Pause Show preview',
      'Go to Show start',
    ])
    const playback = within(transport).getByRole('button', { name: 'Pause Show preview' })
    expect(playback.querySelector('.lucide-pause')).toBeInTheDocument()
    expect(within(transport).getByRole('status', { name: 'Show time' })).toHaveTextContent('00:00.0/01:02.0')

    const zoom = screen.getByRole('group', { name: 'Timeline zoom controls' })
    expect(within(zoom).getByRole('button', { name: 'Zoom timeline out' })).toBeInTheDocument()
    expect(within(zoom).getByRole('slider', { name: 'Timeline zoom' })).toHaveValue('1')
    expect(within(zoom).getByRole('button', { name: 'Zoom timeline in' })).toBeInTheDocument()
    expect(within(zoom).getByText('1.0x')).toBeInTheDocument()

    const commands = screen.getByRole('group', { name: 'Timeline commands' })
    expect(within(commands).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Undo Show edit',
      'Redo Show edit',
      'Snap playhead',
      'Fit timeline to Show',
      'Split at playhead',
      'Clone selection',
    ])
    expect(within(commands).getByRole('button', { name: 'Clone selection' })).toBeDisabled()
    expect(screen.getByTestId('show-timeline-grid').style.gridTemplateRows).toContain('44px')

    await user.click(playback)
    expect(screen.getByRole('button', { name: 'Play Show preview' }).querySelector('.lucide-play')).toBeInTheDocument()

    const split = within(commands).getByRole('button', { name: 'Split at playhead' })
    expect(split).toHaveAttribute(
      'title',
      'Leave at least 1.0 s on both sides of the playhead.',
    )
    expect(split).toHaveAttribute('aria-disabled', 'true')
    await user.click(split)
    expect(within(commands).getByRole('status', { name: 'Split unavailable' })).toHaveTextContent(
      'Split needs 1.0 s on both sides',
    )

    useShowTransportStore.setState({ seekStatus: 'rebuilding' })
    expect(screen.queryByText('rebuilding')).not.toBeInTheDocument()
  })

  it('clones the selected Scene and a supported simple Clip, then undoes and redoes the Scene transaction (#470)', async () => {
    const user = userEvent.setup()
    const sceneShow = createDefaultShow('show-470-scene-clone', 'Scene clone', 1000)
    setPersonalContentProvider(memoryProvider([sceneShow]))
    useShowStore.setState({ shows: [sceneShow], activeShowId: sceneShow.id, showsLoaded: true })

    const view = render(<ShowEditor showId={sceneShow.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Scene 1 properties' }))
    const clone = screen.getByRole('button', { name: 'Clone selection' })
    expect(clone).toBeEnabled()
    expect(clone).toHaveAttribute('title', 'Clone Scene 1 after itself')
    await user.click(clone)
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
    expect(screen.getByRole('textbox', { name: 'Scene name' })).toHaveValue('Scene 1 copy')

    await user.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'Redo Show edit' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))

    const clipShow = createDefaultShow('show-470-clip-clone', 'Clip clone', 2000)
    clipShow.cells = clipShow.cells.filter((cell) => cell.sceneId !== 'scene-2')
    setPersonalContentProvider(memoryProvider([clipShow]))
    useShowStore.setState({ ...showInitialState, shows: [clipShow], activeShowId: clipShow.id, showsLoaded: true })
    view.rerender(<ShowEditor showId={clipShow.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    expect(screen.getByRole('button', { name: 'Clone selection' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Clone selection' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toHaveLength(2))
    expect(useShowStore.getState().shows[0].cells.find((cell) => cell.sceneId === 'scene-2')?.patternName).toBe('TestPattern1D')
  })

  it('enables Clip Clone by rippling an occupied following slot (#470)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-470-ripple-clone', 'Ripple clone', 2000)
    show.cells[0] = { ...show.cells[0], patternName: 'Clone source' }
    show.cells[1] = { ...show.cells[1], patternName: 'Occupied next' }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Clone source' }))

    const clone = screen.getByRole('button', { name: 'Clone selection' })
    expect(clone).toBeEnabled()
    expect(clone).toHaveAttribute('title', 'Clone Clone source immediately after itself')
    await user.click(clone)

    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
    expect(screen.getByRole('heading', { name: 'Clip properties' })).toBeInTheDocument()
  })

  it('explains unsupported Clone owners and previews a legal magnetic Clip destination before drop (#470)', async () => {
    const show = createDefaultShow('show-470-move', 'Magnetic move', 1000)
    show.cells = show.cells.filter((cell) => cell.sceneId !== 'scene-2')
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const clone = screen.getByRole('button', { name: 'Clone selection' })
    expect(clone).toBeDisabled()
    expect(clone).toHaveAttribute('title', 'Select one Scene or simple Clip to Clone')

    const clip = screen.getByRole('button', { name: 'Select TestPattern1D' })
    const destination = screen.getByRole('button', { name: 'Add clip to main in Scene 2' })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    fireEvent.dragStart(clip, { dataTransfer })
    fireEvent.dragEnter(destination, { dataTransfer })
    fireEvent.dragOver(destination, { dataTransfer })
    expect(destination).toHaveAttribute('data-drop-active', 'true')
    expect(destination).toHaveTextContent('Move here')
    fireEvent.drop(destination, { dataTransfer })

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === 'cell-1')?.sceneId).toBe('scene-2')
    })
  })

  it('keeps Snap durable and excludes editable controls from Show undo shortcuts (#470)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-470-shortcuts', 'Shortcuts', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Snap playhead' }))
    expect(useShowEditorSessionStore.getState().snapEnabled).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Open Scene 1 properties' }))
    await user.click(screen.getByRole('button', { name: 'Clone selection' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))

    const name = screen.getByRole('textbox', { name: 'Scene name' })
    name.focus()
    fireEvent.keyDown(name, { key: 'z', metaKey: true })
    expect(useShowStore.getState().shows[0].scenes).toHaveLength(3)
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(2))
  })

  it('selects a scene and exposes compact Scene properties (#424)', async () => {
    const show = createDefaultShow('show-scene-properties', 'Scene properties study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const sceneHeader = screen.getByRole('group', { name: 'Scene Scene 1' })
    expect(sceneHeader).toHaveAttribute('title', 'Open Scene 1 properties')
    fireEvent.click(screen.getByRole('button', { name: 'Open Scene 1 properties' }))

    expect(screen.getByRole('region', { name: 'Scene properties' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scene properties' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Scene name' })).toHaveValue('Scene 1')
    expect(screen.getByRole('spinbutton', { name: 'Scene duration seconds' })).toHaveValue(30)
    expect(screen.getByRole('spinbutton', { name: 'Scene duration seconds' })).toHaveAttribute('step', '0.1')

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scene duration seconds' }), { target: { value: '12.5' } })
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes[0].durationMs).toBe(12_500))

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate scene Scene 1' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
  })

  it('opens 2D Installation spatial zone selection from the center inspector only (#340)', async () => {
    const user = userEvent.setup()
    const show = createShowWithOutputContract(
      'show-spatial-zone',
      'Spatial zone',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 16 }),
      1000,
    )
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select zone main' }))
    const open = screen.getByRole('button', { name: 'Select main LEDs on output map' })
    expect(open).toBeEnabled()
    await user.click(open)

    expect(screen.getByRole('heading', { name: 'Select LEDs for main' })).toBeInTheDocument()
    expect(screen.getByLabelText('Select LEDs for zone main')).toBeInTheDocument()
    expect(screen.getByText(/Square.*Default.*saved 2D output map/i)).toBeInTheDocument()
  })

  it('hides physical selection for Portable and disables unsupported 3D selection (#340)', async () => {
    const user = userEvent.setup()
    const portable = createShowWithOutputContract(
      'show-portable-no-spatial',
      'Portable',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 16 }),
      1000,
    )
    useShowStore.setState({ shows: [portable], activeShowId: portable.id, showsLoaded: true })
    const view = render(<ShowEditor showId={portable.id} />)
    await user.click(screen.getByRole('button', { name: 'Select zone main' }))
    expect(screen.queryByRole('button', { name: /LEDs on output map/i })).not.toBeInTheDocument()

    const spatial3D = createShowWithOutputContract(
      'show-3d-no-spatial',
      '3D Installation',
      createInstallationShowOutputContract({ outputMapId: 'cube', pixelCount: 8 }),
      1000,
    )
    useShowStore.setState({ shows: [spatial3D], activeShowId: spatial3D.id, showsLoaded: true })
    view.rerender(<ShowEditor showId={spatial3D.id} />)
    await user.click(screen.getByRole('button', { name: 'Select zone main' }))
    expect(screen.getByRole('button', { name: 'Select main LEDs on output map' })).toBeDisabled()
    expect(screen.getByText('Spatial selection is unavailable for 3D maps.')).toBeInTheDocument()
  })

  it('uses Delete for the selected timeline entity while protecting editors (#424)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-424-delete', 'Delete study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('group', { name: 'Scene Scene 1' }))
    fireEvent.keyDown(screen.getByLabelText('Scene name'), { key: 'Delete' })
    expect(screen.queryByText('Remove scene?')).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Delete' })
    expect(screen.getByText('Remove scene?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    fireEvent.keyDown(document, { key: 'Delete' })
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.find((transition) => transition.id === 'transition-scene-1')?.kind)
        .toBe('cut')
    })
  })

  it('uses the Mac Delete key from the focused timeline entity (#424)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-424-mac-delete', 'Mac Delete study', 1000)
    const clipId = show.cells[0].id
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0]
    await user.click(clip)
    expect(clip).toHaveFocus()

    await user.keyboard('{Backspace}')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.some((cell) => cell.id === clipId)).toBe(false)
    })
  })

  it('resumes playback after scrubbing a Show that was already playing', () => {
    const show = createDefaultShow('show-resume-scrub', 'Resume after scrub', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    fireEvent.change(playhead, { target: { value: '31000' } })
    expect(usePreviewStore.getState().isRunning).toBe(false)

    fireEvent.pointerUp(playhead)
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(useShowTransportStore.getState()).toMatchObject({
      positionMs: 31_000,
      seekStatus: 'rebuilding',
    })
  })

  it('zooms, pans, resizes, and fits one synchronized timeline viewport (#420)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-420', 'Zoom study', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    fireEvent.change(screen.getByRole('slider', { name: 'Show playhead' }), { target: { value: '10000' } })
    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    const split = screen.getByRole('button', { name: 'Split at playhead' })
    const navigator = screen.getByRole('slider', { name: 'Pan visible timeline range' })
    expect(screen.getByRole('group', { name: 'Show navigator' })).toBeInTheDocument()
    expect(navigator).toHaveStyle({ width: '100%' })

    await user.click(screen.getByRole('button', { name: 'Zoom timeline in' }))
    expect(navigator).toHaveStyle({ width: '80%' })
    expect(playhead).toHaveValue('10000')
    expect(split).toBeEnabled()

    fireEvent.keyDown(navigator, { key: 'ArrowRight' })
    expect(Number(navigator.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize visible range end' }), { key: 'ArrowLeft' })
    await waitFor(() => expect(Number(screen.getByRole('slider', { name: 'Pan visible timeline range' }).getAttribute('aria-valuemax'))).toBeGreaterThan(12400))

    await user.click(screen.getByRole('button', { name: 'Fit timeline to Show' }))
    expect(navigator).toHaveStyle({ width: '100%' })
    expect(navigator).toHaveAttribute('aria-valuenow', '0')
    expect(playhead).toHaveValue('10000')
  })

  it('pans the Show timeline horizontally with an ordinary vertical mouse wheel (#476)', () => {
    const show = createDefaultShow('show-476-wheel', 'Wheel pan study', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByTestId('show-timeline-scroll-region')
    Object.defineProperties(timeline, {
      clientWidth: { configurable: true, value: 600 },
      scrollWidth: { configurable: true, value: 1200 },
      scrollLeft: { configurable: true, writable: true, value: 100 },
    })

    fireEvent.wheel(timeline, { deltaY: 120 })

    expect(timeline.scrollLeft).toBe(220)
  })

  it('uses the dominant trackpad axis without adding diagonal wheel deltas (#476)', () => {
    const show = createDefaultShow('show-476-trackpad', 'Trackpad pan study', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByTestId('show-timeline-scroll-region')
    Object.defineProperties(timeline, {
      clientWidth: { configurable: true, value: 600 },
      scrollWidth: { configurable: true, value: 1200 },
      scrollLeft: { configurable: true, writable: true, value: 300 },
    })

    fireEvent.wheel(timeline, { deltaX: -75, deltaY: 20 })

    expect(timeline.scrollLeft).toBe(225)
  })

  it('keeps Ctrl or Command wheel input assigned to timeline zoom (#476)', () => {
    const show = createDefaultShow('show-476-modifier', 'Modifier zoom study', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByTestId('show-timeline-scroll-region')
    fireEvent.wheel(timeline, { ctrlKey: true, deltaY: -120 })

    expect(screen.getByLabelText('Timeline zoom level')).toHaveTextContent('1.3x')
  })

  it('splits at the playhead and exposes explicit Continue or Restart entry behavior (#415)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Split Show', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const splitButton = screen.getByRole('button', { name: 'Split at playhead' })
    expect(splitButton).toHaveAttribute('aria-disabled', 'true')
    fireEvent.change(screen.getByRole('slider', { name: 'Show playhead' }), { target: { value: '10000' } })
    expect(splitButton).not.toHaveAttribute('aria-disabled')
    await user.click(splitButton)

    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
    expect(screen.getByDisplayValue('Scene 1 part 2')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Select TestPattern1D' })[1])
    const restart = screen.getByLabelText('Restart Pattern on entry')
    expect(restart).not.toBeChecked()
    expect(screen.getByText(/continues the matching Pattern instance/i)).toBeInTheDocument()
    await user.click(restart)

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.find((cell) => cell.sceneId === 'scene-3')?.restartOnEntry).toBe(true)
    })
    expect(screen.getByText(/starts a fresh Pattern instance/i)).toBeInTheDocument()
  })

  it('updates the visible Split refusal at Scene boundaries and valid positions (#473)', () => {
    const show = createDefaultShow('show-473', 'Split guidance', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    const split = screen.getByRole('button', { name: 'Split at playhead' })
    const commands = screen.getByRole('group', { name: 'Timeline commands' })
    const refusal = () => within(commands).queryByRole('status', { name: 'Split unavailable' })

    expect(split).toHaveAttribute('aria-disabled', 'true')
    expect(refusal()).not.toBeInTheDocument()
    fireEvent.focus(split)
    expect(refusal()).toHaveTextContent('Split needs 1.0 s on both sides')

    fireEvent.change(playhead, { target: { value: '500' } })
    expect(split).toHaveAttribute('aria-disabled', 'true')
    expect(refusal()).toHaveTextContent('Split needs 1.0 s on both sides')

    fireEvent.change(playhead, { target: { value: '1000' } })
    expect(split).not.toHaveAttribute('aria-disabled')
    expect(refusal()).not.toBeInTheDocument()

    fireEvent.change(playhead, { target: { value: '30000' } })
    expect(split).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(split)
    expect(refusal()).toHaveTextContent('Split needs 1.0 s on both sides')

    fireEvent.change(playhead, { target: { value: '30500' } })
    expect(refusal()).toHaveTextContent('Split only works inside a Scene')
  })

  it('authors named routing layouts and scene-boundary switch markers (#398)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-1', 'Routing Show', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Routing layouts')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add routing layout' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].routingLayouts).toHaveLength(2))

    const added = useShowStore.getState().shows[0].routingLayouts[1]
    fireEvent.change(screen.getByLabelText(`${added.name} routing layout name`), { target: { value: 'Quadrants' } })
    await waitFor(() => expect(useShowStore.getState().shows[0].routingLayouts[1].name).toBe('Quadrants'))

    await user.click(screen.getByRole('button', { name: 'Set routing layout after Scene 1' }))
    await user.selectOptions(screen.getByLabelText('Destination routing layout'), added.id)
    await waitFor(() => expect(useShowStore.getState().shows[0].routingSwitches).toEqual([
      { afterSceneId: 'scene-1', layoutId: added.id },
    ]))
  })

  it('turns a named routing layout into a two-zone moving split (#405)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-405-layout', 'Moving split setup', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'split-x')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'split',
        zoneIds: ['zone-1', 'zone-2'],
        axis: 'x',
      })
    })
    expect(screen.getByText(/scene targets move the split continuously/i)).toBeInTheDocument()
  })

  it('authors scene-owned moving-split targets from the shared property lane (#405)', async () => {
    const user = userEvent.setup()
    let show = addShowZone(createDefaultShow('show-405-editor', 'Moving split', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: { kind: 'split', zoneIds: [show.zones[0].id, show.zones[1].id], axis: 'x' },
    })
    show = updateShowScene(show, show.scenes[0].id, { routingTargets: { splitPosition: 0.25 } })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Split position lane' })).toBeInTheDocument()
    expect(screen.getByText(/moving split: 1 scalar/i)).toBeInTheDocument()
    await user.click(screen.getByRole('group', { name: 'Scene Scene 1' }))
    expect(screen.getByLabelText('Split position')).toHaveValue(0.25)
    fireEvent.change(screen.getByLabelText('Split position'), { target: { value: '0.4' } })
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes[0].routingTargets?.splitPosition).toBe(0.4)
    })
  })

  it('authors moving-split interpolation on the incoming shared boundary (#405)', async () => {
    const user = userEvent.setup()
    let show = addShowZone(createDefaultShow('show-405-boundary', 'Moving split boundary', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: { kind: 'split', zoneIds: [show.zones[0].id, show.zones[1].id], axis: 'x' },
    })
    show = updateShowScene(show, show.scenes[0].id, { routingTargets: { splitPosition: 0.25 } })
    show = updateShowScene(show, show.scenes[1].id, { routingTargets: { splitPosition: 0.75 } })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    await user.click(screen.getByLabelText('Animate split position'))
    fireEvent.change(screen.getByLabelText('Split position start'), { target: { value: '0.2' } })
    fireEvent.change(screen.getByLabelText('Split position duration seconds'), { target: { value: '1.2' } })
    await user.selectOptions(screen.getByLabelText('Split position easing'), 'ease-in-out')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.[0].propertyTransitions?.routing?.splitPosition).toEqual({
        from: 0.2,
        durationMs: 1200,
        easing: { curve: 'quadratic', direction: 'in-out' },
      })
    })
  })

  it('authors scene-owned synchronized tiling from the shared Sample lane (#406)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-406-editor', 'Synchronized tiling', 1000)
    show = updateShowScene(show, show.scenes[0].id, { sampleTargets: { repeatScale: 2 } })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Sample repeat lane' })).toBeInTheDocument()
    expect(screen.getByText(/sample repeat: 1 scalar/i)).toBeInTheDocument()
    await user.click(screen.getByRole('group', { name: 'Scene Scene 1' }))
    expect(screen.getByLabelText('Repeat scale')).toHaveValue(2)
    fireEvent.change(screen.getByLabelText('Repeat scale'), { target: { value: '3' } })
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes[0].sampleTargets?.repeatScale).toBe(3)
    })
  })

  it('authors repeat-scale interpolation on the incoming shared boundary (#406)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-406-boundary', 'Repeated sample boundary', 1000)
    show = updateShowScene(show, show.scenes[0].id, { sampleTargets: { repeatScale: 1.5 } })
    show = updateShowScene(show, show.scenes[1].id, { sampleTargets: { repeatScale: 3 } })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    await user.click(screen.getByLabelText('Animate repeat scale'))
    fireEvent.change(screen.getByLabelText('Repeat scale start'), { target: { value: '1.25' } })
    fireEvent.change(screen.getByLabelText('Repeat scale duration seconds'), { target: { value: '1.2' } })
    await user.selectOptions(screen.getByLabelText('Repeat scale easing'), 'ease-in-out')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.[0].propertyTransitions?.sample?.repeatScale).toEqual({
        from: 1.25,
        durationMs: 1200,
        easing: { curve: 'quadratic', direction: 'in-out' },
      })
    })
  })

  it('selects visual and routing events from one first-class transition lane and inspector (#416)', async () => {
    const user = userEvent.setup()
    const base = addShowRoutingLayout(createDefaultShow('show-1', 'Boundary lane', 1000), 'Alternate')
    const show = updateShowRoutingSwitch(base, 'scene-1', base.routingLayouts[1].id)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Transition lane' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    expect(screen.getByRole('heading', { name: 'Transition properties' })).toBeInTheDocument()
    expect(screen.getByText(/Scene 1 → Scene 2 · crossfade/i)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Easing'), 'ease-in-out')
    expect(screen.getByLabelText('Duration')).toHaveAttribute('step', '100')
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '1500' } })
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.find((transition) => transition.id === 'transition-scene-1'))
        .toMatchObject({ durationMs: 1500, easing: { curve: 'quadratic', direction: 'in-out' } })
    })

    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (routing)' }))
    expect(screen.getByText(/Scene 1 → Scene 2 · routing/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Destination routing layout')).toHaveValue(base.routingLayouts[1].id)

    fireEvent.change(screen.getByLabelText('Routing transfer duration seconds'), { target: { value: '2' } })
    await user.selectOptions(screen.getByLabelText('Routing transfer easing'), 'ease-in-out')
    await user.selectOptions(screen.getByLabelText('Routing transfer direction'), 'reverse')
    expect(screen.getByLabelText('Routing transfer cost')).toHaveTextContent('Cost tier: cheap')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.find((transition) => transition.kind === 'routing'))
        .toMatchObject({
          durationMs: 2000,
          easing: { curve: 'quadratic', direction: 'in-out' },
          routingDirection: 'reverse',
        })
    })
  })

  it('authors a boundary-owned time-scale ramp from the nested Time lane (#417)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-417', 'Time lane', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Animation speed lane for main' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit animation speed transition from Scene 1 for main' }))
    await user.click(screen.getByLabelText('Animate speed for main'))
    fireEvent.change(screen.getByLabelText('Animation speed start main'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Animation speed target main'), { target: { value: '0' } })

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.transitions?.[0].propertyTransitions).toEqual({
        timeScale: { fromByCellId: { 'cell-2': 1.5 }, durationMs: 2000, easing: { curve: 'linear' } },
      })
      expect(saved.cells[1].adaptations.timeScale).toBe(0)
    })
    expect(screen.getByText('1.5→0')).toBeInTheDocument()
  })

  it('authors independent Time and Brightness curves through one property inspector (#418)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-418', 'Two properties', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Brightness lane for main' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit brightness transition from Scene 1 for main' }))
    await user.click(screen.getByLabelText('Animate speed for main'))
    await user.click(screen.getByLabelText('Animate brightness for main'))
    fireEvent.change(screen.getByLabelText('Animation speed duration seconds'), { target: { value: '1.5' } })
    await user.selectOptions(screen.getByLabelText('Animation speed easing'), 'ease-in')
    fireEvent.change(screen.getByLabelText('Brightness duration seconds'), { target: { value: '0.8' } })
    await user.selectOptions(screen.getByLabelText('Brightness easing'), 'ease-out')
    fireEvent.change(screen.getByLabelText('Brightness target main'), { target: { value: '0.25' } })

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.transitions?.[0].propertyTransitions).toMatchObject({
        timeScale: { durationMs: 1500, easing: { curve: 'quadratic', direction: 'in' } },
        brightness: { durationMs: 800, easing: { curve: 'quadratic', direction: 'out' } },
      })
      expect(saved.cells[1].adaptations.brightness).toBe(0.25)
    })
    expect(screen.getByText('100%→25%')).toBeInTheDocument()
  })

  it('authors a public Pattern slider with the shared target, lane, and boundary vocabulary (#419)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-419', 'Pattern control', 1000)
    for (const cell of show.cells) {
      show = updateShowCellPattern(show, cell.id, {
        pattern: { kind: 'stock', id: 'RibbonLoom' },
        patternName: 'Ribbon Loom',
      })
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getAllByRole('button', { name: 'Select Ribbon Loom' })[0])
    expect(screen.getByText('sliderSpeed · 0–1 · Studio default 0.5')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Set Speed target'))
    fireEvent.change(screen.getByLabelText('Speed target'), { target: { value: '0.2' } })

    await user.click(screen.getAllByRole('button', { name: 'Select Ribbon Loom' })[1])
    await user.click(screen.getByLabelText('Set Speed target'))
    fireEvent.change(screen.getByLabelText('Speed target'), { target: { value: '0.8' } })

    await user.click(screen.getByRole('button', { name: 'Edit Speed transition from Scene 1 for main' }))
    await user.click(screen.getByLabelText('Animate Speed for main'))
    await user.selectOptions(screen.getByLabelText('Speed easing'), 'ease-in-out')

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.cells.map((cell) => cell.controlTargets?.sliderSpeed)).toEqual([0.2, 0.8])
      expect(saved.transitions?.[0].propertyTransitions?.controls?.sliderSpeed).toMatchObject({
        fromByCellId: { 'cell-2': 0.2 },
        easing: { curve: 'quadratic', direction: 'in-out' },
      })
    })
    expect(screen.getByRole('group', { name: 'Speed control lane for main' })).toBeInTheDocument()
    expect(screen.getByText('0.2→0.8')).toBeInTheDocument()
  })

  it('opens Pattern controls by default when the selected Clip has an authored target', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-authored-control-open', 'Authored control', 1000)
    show = updateShowCellPattern(show, show.cells[0].id, {
      pattern: { kind: 'stock', id: 'RibbonLoom' },
      patternName: 'Ribbon Loom',
    })
    show.cells[0] = { ...show.cells[0], controlTargets: { sliderSpeed: 0.5 } }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Ribbon Loom' }))

    expect(screen.getByRole('group', { name: 'Pattern automation targets' })).toHaveAttribute('open')
  })

  it('opens Advanced Clip controls by default when the selected Clip overrides an advanced setting', async () => {
    const user = userEvent.setup()
    const base = createDefaultShow('show-advanced-open', 'Advanced authored setting', 1000)
    const show = updateShowCellAdaptations(base, base.cells[0].id, { timeOffsetMs: 500 })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByRole('group', { name: 'Advanced Clip controls' })).toHaveAttribute('open')
  })

  it('projects Time values across every row covered by a spanning cell (#417)', () => {
    let show = addShowZone(createDefaultShow('show-417-span', 'Spanning time', 1000), {
      name: 'edge',
      nominalPixelCount: 16,
    })
    show = spanShowCellZones(show, show.cells[0].id, 2)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Animation speed lane for main' }).parentElement).toHaveTextContent('1×')
    expect(screen.getByRole('group', { name: 'Animation speed lane for edge' }).parentElement).toHaveTextContent('1×')
  })

  it('keeps zone selection in the clip row instead of covering automation lanes (#466)', () => {
    const show = createDefaultShow('show-466-zone-target', 'Zone target', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('button', { name: 'Select zone main' })).toHaveStyle({ gridRow: '5' })
    expect(screen.getByRole('group', { name: 'Animation speed lane for main' })).toHaveStyle({ gridRow: '6' })
  })

  it('renders a scene strip, selectable clip inspector, and compile bar', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
    expect(screen.getByText('Opening wash')).toBeInTheDocument()
    expect(screen.queryByText(/show - 1 scenes/i)).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Show time' })).toHaveTextContent('00:00.0/01:02.0')
    expect(screen.getByDisplayValue('Scene 1')).toBeInTheDocument()
    expect(screen.getAllByText('main').length).toBeGreaterThan(0)
    expect(screen.getByText(/compiled artifact/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
    expect(screen.getByText(/renderer\/px/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
    expect(screen.getByLabelText('Target controller')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Scene Scene 1' }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select zone main' }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0].querySelector('svg')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByRole('heading', { name: 'Clip properties' })).toBeInTheDocument()
    expect(screen.getByText(/TestPattern1D · main · Scene 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Mirror clip')).toBeInTheDocument()
    expect(screen.getByLabelText('Animation speed')).toHaveAttribute('min', '0')
    expect(screen.getByLabelText('Animation speed')).toHaveAttribute(
      'title',
      'How quickly Pattern animation advances. Does not change Clip duration or frame rate.',
    )

    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))
    expect(screen.getByRole('heading', { name: 'Transition properties' })).toBeInTheDocument()
    expect(screen.getByText(/Scene 1 → Scene 2 · crossfade/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Crossfade · Change/i }))
    expect(screen.getByRole('button', { name: 'Use Linear Transition' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
  })

  it('opens Show properties from the Show header action', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-properties-route', 'Properties route', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    expect(screen.getByRole('heading', { name: 'Clip properties' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
  })

  it('opens one anchored Entity Detail Panel, transfers it, and closes it predictably (#467)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-entity-detail', 'Entity detail', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    const clip = screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0]
    await user.click(clip)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', `clip:${show.cells[0].id}`)
    expect(screen.getByTestId('show-entity-detail-stem')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Clip properties' })).toBeInTheDocument()

    const scene = screen.getByRole('group', { name: 'Scene Scene 1' })
    await user.click(scene)
    expect(screen.getAllByRole('dialog', { name: 'Entity Detail Panel' })).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', `scene:${show.scenes[0].id}`)
    expect(screen.getByRole('heading', { name: 'Scene properties' })).toBeInTheDocument()

    await user.click(scene)
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    await user.click(clip)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'show')
    await user.click(screen.getByText('Show time'))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('adds and edits a registry Effect through the selected Clip panel (#468)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-effects-ui', 'Effect authoring', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    const effectStack = screen.getByRole('region', { name: 'Clip Effects' })
    await user.click(within(effectStack).getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('dialog', { name: 'Add Effect' })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search Effects' }), 'ripple')
    await user.click(screen.getByRole('button', { name: 'Add Ripple Effect' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].cells[0].effects).toEqual([
      expect.objectContaining({ id: 'ripple', kind: 'ripple', amount: 0 }),
    ]))
    expect(screen.queryByRole('dialog', { name: 'Add Effect' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Ripple Effect' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount' }), { target: { value: '0.2' } })
    await waitFor(() => expect(useShowStore.getState().shows[0].cells[0].effects?.[0]).toMatchObject({
      id: 'ripple',
      kind: 'ripple',
      amount: 0.2,
    }))

    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows[0].cells[0].effects?.[0]).toMatchObject({ amount: 0.2 })
  })

  it('anchors every remaining Timeline selection family in the same panel (#467)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-entity-families', 'Entity families', 1000)
    show.cells = show.cells.filter((cell) => !(cell.zoneId === 'zone-1' && cell.sceneId === 'scene-1'))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', `transition:${show.transitions?.[0].id}`)
    expect(screen.getByRole('region', { name: 'Transition properties' })).toHaveAttribute('data-entity-family', 'transition')

    await user.click(screen.getByRole('button', { name: 'Select zone main' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'zone:zone-1')
    expect(screen.getByRole('region', { name: 'Zone properties' })).toHaveAttribute('data-entity-family', 'zone')

    await user.click(screen.getByRole('button', { name: 'Add clip to main in Scene 1' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'empty:zone-1:scene-1')
    expect(screen.getByRole('region', { name: 'Clip properties' })).toHaveAttribute('data-entity-family', 'clip')

    await user.click(screen.getByRole('button', { name: 'Set routing layout after Scene 1' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'routing:scene-1')
    expect(screen.getByRole('region', { name: 'Transition properties' })).toHaveAttribute('data-entity-family', 'transition')
  })

  it('offers first-class Run and Save actions for the canonical generated Show (#429)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-send', 'Opening Night', 1000)
    const pushGeneratedArtifact = vi.fn().mockResolvedValue(undefined)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5',
          nickname: 'Bench PB',
          phase: 'live',
          mapDim: 1,
          firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact,
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Run on Bench PB' }))
    expect(pushGeneratedArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      artifactId: 'show:show-send',
      name: 'Opening Night',
      persist: false,
      artifactStamp: expect.objectContaining({ kind: 'show', id: 'show-send' }),
    }))

    await user.click(screen.getByRole('button', { name: 'Save to Bench PB' }))
    expect(pushGeneratedArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      artifactId: 'show:show-send',
      persist: true,
    }))
  })

  it('confirms a Controller renderer adaptation before sending the adapted Show (#429)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-adapt', 'Spatial Show', 1000)
    show = { ...show, stageMapId: 'plane' }
    show = updateShowTransition(show, show.scenes[0].id, 'portal', 2000, 0.1)
    const pushGeneratedArtifact = vi.fn().mockResolvedValue(undefined)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5', nickname: 'Bench PB', phase: 'live', mapDim: 1, firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact,
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Run on Bench PB' }))

    expect(screen.getByTestId('show-preflight-dialog')).toBeInTheDocument()
    expect(pushGeneratedArtifact).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Send anyway' }))
    await waitFor(() => expect(pushGeneratedArtifact).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.stringContaining('export function render(index, x)'),
      artifactStamp: expect.objectContaining({ transforms: expect.arrayContaining(['renderer-adapter']) }),
    })))
  })

  it('blocks a known-invalid Installation Controller target without changing its map (#437)', async () => {
    const user = userEvent.setup()
    const show = createShowWithOutputContract(
      'show-fixed',
      'Measured wall Show',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      1000,
    )
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [{
        id: 'profile-live',
        name: 'Bench PB',
        lastSeenIp: '10.0.0.5',
        lastKnownPixelCount: 7,
        lastKnownMapDim: 2,
        mapFingerprints: [{
          hash: '22222222',
          mapId: 'wide',
          mapName: 'Wide 2:1',
          devicePixelCount: 7,
          pushedAt: 1,
        }],
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        zones: [],
        updatedAt: 1,
      }],
    })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5', nickname: 'Bench PB', phase: 'live', mapDim: 2, firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact: vi.fn().mockResolvedValue(undefined),
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Run on Bench PB' }))

    expect(screen.getByTestId('show-preflight-dialog')).toHaveTextContent(
      'This Installation Show requires 8 pixels; the Controller reports 7.',
    )
    expect(screen.queryByRole('button', { name: 'Send anyway' })).not.toBeInTheDocument()
    expect(useControllerStore.getState().pushGeneratedArtifact).not.toHaveBeenCalled()
  })

  it('deletes a selected Clip from Properties without confirmation', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-clip-delete', 'Clip deletion', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.click(screen.getByRole('button', { name: 'Delete clip TestPattern1D' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('compiles a library-backed 2D Pattern for generated Show actions', () => {
    const show = createDefaultShow('show-library-pattern', 'Shape study', 1000)
    show.stageMapId = 'plane'
    show.cells = [{
      ...show.cells[0],
      pattern: { kind: 'stock', id: 'ShapeShifter' },
      patternName: 'ShapeShifter',
    }]
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByText(/Unknown library namespace "SDF"/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View code' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
  })

  it('replaces a deleted Clip through its empty timeline slot (#430)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-430-place', 'Clip placement', 1000)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.click(screen.getByRole('button', { name: 'Delete clip TestPattern1D' }))
    await user.click(await screen.findByRole('button', { name: 'Add clip to main in Scene 1' }))
    await user.type(screen.getByRole('combobox', { name: 'Pattern for new clip' }), 'TestPattern2D')
    await user.click(screen.getByRole('option', { name: 'TestPattern2D' }))

    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toContainEqual(expect.objectContaining({
      zoneId: 'zone-1',
      sceneId: 'scene-1',
      patternName: 'TestPattern2D',
    })))
    expect(screen.getByRole('button', { name: 'Select TestPattern2D' })).toBeInTheDocument()
    expect(screen.getByText(/TestPattern2D · main · Scene 1/i)).toBeInTheDocument()
  })

  it('filters Clip Patterns by typing and selects a matching Pattern', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-pattern-typeahead', 'Pattern typeahead', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    const chooser = screen.getByRole('combobox', { name: 'Source pattern' })
    await user.clear(chooser)
    await user.type(chooser, 'shape')

    const results = screen.getByRole('listbox', { name: 'Source pattern matches' })
    expect(within(results).getByRole('option', { name: 'ShapeShifter' })).toBeInTheDocument()
    expect(within(results).queryByRole('option', { name: 'TestPattern2D' })).not.toBeInTheDocument()

    await user.click(within(results).getByRole('option', { name: 'ShapeShifter' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].cells[0].patternName).toBe('ShapeShifter'))
  })

  it('composes source replacement, a hold, and a zone span without overlapping clips (#430)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-430-compose', 'Clip composition', 1000), {
      name: 'edge',
      nominalPixelCount: 16,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.clear(screen.getByRole('combobox', { name: 'Source pattern' }))
    await user.type(screen.getByRole('combobox', { name: 'Source pattern' }), 'TestPattern2D')
    await user.click(screen.getByRole('option', { name: 'TestPattern2D' }))
    await user.click(screen.getByText('Advanced clip controls'))
    await user.selectOptions(screen.getByLabelText('Span zones'), '2')
    await user.selectOptions(screen.getByLabelText('Hold scenes'), '2')

    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toEqual([
      expect.objectContaining({
        id: 'cell-1',
        patternName: 'TestPattern2D',
        sceneSpan: 2,
        zoneSpan: 2,
      }),
    ]))
    expect(screen.queryByRole('button', { name: /^Add clip to/ })).not.toBeInTheDocument()
  })

  it('deletes the selected Clip with the Delete key', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-clip-delete-key', 'Clip keyboard deletion', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.keyboard('{Delete}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('identifies an exact-pause clock ramp without changing renderer policy', async () => {
    const base = createDefaultShow('show-1', 'Opening wash', 1000)
    const repeated = updateShowCellPattern(base, base.cells[1].id, {
      pattern: base.cells[0].pattern,
      patternName: base.cells[0].patternName,
    })
    const paused = updateShowCellAdaptations(repeated, repeated.cells[1].id, { timeScale: 0 })
    useShowStore.setState({ shows: [paused], activeShowId: paused.id, showsLoaded: true })

    render(<ShowEditor showId={paused.id} />)

    expect(screen.getByText('clock: exact pause ramp')).toBeInTheDocument()
    expect(screen.getByText(/steady state/i)).toHaveTextContent('1 renderer/px')
  })

  it('edits and explains a masked-evaluation light shutter', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Shutter study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.click(screen.getByLabelText('Light shutter'))

    expect(screen.getByLabelText('Shutter rate (Hz)')).toHaveValue(8)
    expect(screen.getByLabelText('Light on fraction')).toHaveValue(0.5)
    expect(screen.getByLabelText('Shutter phase')).toHaveValue(0)
    expect(screen.getByLabelText('Clock while dark')).toHaveValue('continue')
    expect(screen.getByText(/closed frames emit black/i)).toHaveTextContent('skip Pattern rendering')
    expect(screen.getByText(/Pattern eval:/i)).toHaveTextContent('50% expected')
    expect(screen.getByText(/Pattern eval:/i)).toHaveTextContent('outer loop + LEDs unchanged')

    fireEvent.change(screen.getByLabelText('Light on fraction'), { target: { value: '0.35' } })
    await user.selectOptions(screen.getByLabelText('Clock while dark'), 'freeze')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.lightShutter).toMatchObject({
        duty: 0.35,
        clockBehavior: 'freeze',
      })
    })
    expect(screen.getAllByText(/shutter 35%/i).length).toBeGreaterThan(0)
  })

  it('edits stepped motion as cadence and keeps it distinct from rendering and light output', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Temporal study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByRole('button', { name: 'Smooth motion' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Stepped motion' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByLabelText('Jumps per second')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stepped motion' }))

    expect(screen.getByLabelText('Jumps per second')).toHaveValue('8')
    expect(screen.getByText('every 125 ms')).toBeInTheDocument()
    expect(screen.getByText(/motion freezes and jumps/i)).toHaveTextContent('pixels do not blink off')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.steppedClock).toEqual({ stepMs: 125 })
    })

    fireEvent.change(screen.getByLabelText('Jumps per second'), { target: { value: '4' } })

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.steppedClock).toEqual({ stepMs: 250 })
    })
    expect(screen.getByText('every 250 ms')).toBeInTheDocument()
    expect(screen.getByText(/Motion cadence:/i)).toHaveTextContent('4/s stepped clip')
    expect(screen.getByText(/Motion cadence:/i)).toHaveTextContent('renderer cost unchanged')
    expect(screen.getAllByText(/step 4\/s/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Smooth motion' }))
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.steppedClock).toBeUndefined()
    })
  })

  it('edits a private Pattern time offset with the settled motion vocabulary', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Rounds', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByLabelText('Start offset (ms)')).toHaveValue(0)
    fireEvent.change(screen.getByLabelText('Start offset (ms)'), { target: { value: '500' } })

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.timeOffsetMs).toBe(500)
    })
    expect(screen.getByText(/shift this clip's private Pattern clock/i)).toHaveTextContent('rounds across zones')
    expect(screen.getAllByText(/offset 500ms/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Clock offset:/i)).toHaveTextContent('500ms')
    expect(screen.getByText(/Clock offset:/i)).toHaveTextContent('renderer cost unchanged')
  })

  it('explains feathered wipe as a stable one-renderer route edge', async () => {
    const user = userEvent.setup()
    const show = updateShowTransition(createDefaultShow('show-1', 'Feathered wipe', 1000), 'scene-1', 'wipe', 2000, 0.2)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))

    expect(screen.getByLabelText('Feather')).toHaveValue(0.2)
    expect(screen.getByText(/Cost tier:/i)).toHaveTextContent('cheap')
    expect(screen.getByText('worst instant: feathered wipe')).toBeInTheDocument()
  })

  it('edits a 2D portal transition and reports bounded blend cost', async () => {
    const user = userEvent.setup()
    const show = updateShowTransition(
      { ...createDefaultShow('show-1', 'Portal', 1000), stageMapId: 'plane' },
      'scene-1',
      'portal',
      2000,
      0.12,
      {
        centerX: 0.5,
        centerY: 0.5,
        invert: false,
        featherPolicy: 'dither',
        shape: 'diamond',
        scale: 1,
        rotation: 0.125,
        spin: 0,
      },
    )
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))

    expect(screen.getByLabelText('Center X')).toHaveValue(0.5)
    expect(screen.getByLabelText('Center Y')).toHaveValue(0.5)
    expect(screen.getByRole('button', { name: /Diamond · Change/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Rotation')).toHaveValue(0.125)
    expect(screen.getByLabelText('Spin')).toHaveValue(0)
    expect(screen.queryByLabelText('Ring width')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Edge')).toHaveValue('dither')
    expect(screen.getByText('worst instant: portal dither')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Diamond · Change/i }))
    await user.click(screen.getByRole('button', { name: 'Use Ring Transition' }))
    fireEvent.change(screen.getByLabelText('Center X'), { target: { value: '0.35' } })
    await user.selectOptions(screen.getByLabelText('Edge'), 'blend')
    await user.selectOptions(screen.getByLabelText('Reveal mode'), 'shrink-outgoing')
    fireEvent.change(screen.getByLabelText('Ring width'), { target: { value: '0.2' } })

    expect(screen.queryByLabelText('Rotation')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Spin')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
        kind: 'portal',
        centerX: 0.35,
        centerY: 0.5,
        invert: true,
        edgePolicy: 'blend',
        shape: 'ring',
        scale: 1,
        ringWidth: 0.2,
      })
    })
    await waitFor(() => expect(screen.getByText(/worst instant:/)).toHaveTextContent('portal'))
  })

  it('discloses the output contract in Show properties without a Stage mutation control (#434)', async () => {
    const user = userEvent.setup()
    const contract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    const show = { ...createDefaultShow('show-1', 'Portable field', 1000), stageMapId: 'plane', outputContract: contract }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Portable · Resolution-independent 2D')).toBeInTheDocument()
    expect(screen.getByText('1024 px reference')).toBeInTheDocument()
    expect(screen.getAllByText('Square')).not.toHaveLength(0)
    expect(screen.queryByLabelText('Stage map')).not.toBeInTheDocument()
  })

  it('edits only Portable reference output and position-based routing (#436)', async () => {
    const user = userEvent.setup()
    let show = createShowWithOutputContract(
      'show-portable',
      'Portable field',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    show = addShowZone(show, { name: 'right' })
    show = addShowZone(show, { name: 'bottom-left' })
    show = addShowZone(show, { name: 'bottom-right' })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Compatible 2D mapped surfaces at variable resolution.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Target controller')).not.toBeInTheDocument()
    expect(screen.queryByText(/pixel ranges/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Portable reference map')).toHaveValue('plane')
    expect(screen.getByLabelText('Portable reference pixels')).toHaveValue(1024)

    await user.selectOptions(screen.getByLabelText('Portable reference map'), 'wide')
    fireEvent.change(screen.getByLabelText('Portable reference pixels'), { target: { value: '1536' } })
    fireEvent.blur(screen.getByLabelText('Portable reference pixels'))
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'grid-2x2')

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.stageMapId).toBe('wide')
      expect(saved.outputContract).toMatchObject({
        kind: 'portable-2d',
        referenceMapId: 'wide',
        referencePixelCount: 1536,
      })
      expect(saved.routingLayouts[0].logical).toEqual({
        kind: 'grid',
        columns: 2,
        rows: 2,
        zoneIds: saved.zones.map((zone) => zone.id),
      })
    })
  })

  it('keeps invalid Installation ranges editable and unblocks artifacts after repair (#435)', async () => {
    const user = userEvent.setup()
    const show = createShowWithOutputContract(
      'show-installation',
      'Lobby wall',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      1000,
    )
    show.routingLayouts[0].zones[0].ranges = [{ start: 0, end: 5 }]
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getAllByText(/assigns 6 of 8 pixels \(2 missing\)/i)).toHaveLength(2)
    expect(screen.getByLabelText('Default main pixel ranges')).toHaveValue('0-5')
    expect(screen.getByRole('button', { name: 'View code' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()

    const ranges = screen.getByLabelText('Default main pixel ranges')
    await user.clear(ranges)
    await user.type(ranges, '0-7')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View code' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
    })
    expect(screen.getByText(/Default assigns 8 of 8 pixels exactly once/i)).toBeInTheDocument()
  })

  it('edits a newly empty freestyle Show Zone', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-1', 'Opening wash', 1000), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [
        {
          id: 'controller-1',
          name: 'North Arch',
          board: { kind: 'pixelblaze-v3-standard' },
          inputs: [],
          globalTransforms: [],
          patternBindings: [],
          zones: [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 119 }] }],
          updatedAt: 1,
        },
      ],
    })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('button', { name: 'Add clip to doorframe in Scene 1' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.selectOptions(screen.getByLabelText('Span zones'), '2')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
        zoneSpan: 2,
      })
    })
    expect(screen.getByLabelText('Zone domain')).toHaveValue('span')
    await user.selectOptions(screen.getByLabelText('Zone domain'), 'repeat')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
        zoneMode: 'repeat',
      })
    })

    await user.click(screen.getByRole('button', { name: /Select zone doorframe/i }))
    const nameInput = screen.getByLabelText('Zone name doorframe')
    await user.clear(nameInput)
    await user.type(nameInput, 'entry')
    fireEvent.change(screen.getByLabelText('Nominal pixels entry'), { target: { value: '24' } })

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].zones[1]).toMatchObject({
        name: 'entry',
        nominalPixelCount: 24,
      })
    })
  })

  it('edits the selected second transition boundary in a three-scene show', async () => {
    const user = userEvent.setup()
    const show = addShowScene(createDefaultShow('show-1', 'Opening wash', 1000))
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: /Select Scene 2 to Scene 3 transition/i }))
    await user.click(screen.getByRole('button', { name: /Crossfade · Change/i }))
    await user.click(screen.getByRole('button', { name: 'Use Pixel Transition' }))

    await waitFor(() => {
      const updated = useShowStore.getState().shows[0]
      expect(updated.scenes[0].transitionOut?.kind).toBe('crossfade')
      expect(updated.scenes[1].transitionOut?.kind).toBe('dither')
    })
  })

  it('adds scenes and zones from strip ghost affordances and confirms scene removal', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Add scene' }))
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes).toHaveLength(3)
    })
    expect(screen.getByRole('group', { name: 'Scene Scene 3' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Add zone' })[0])
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].zones).toHaveLength(2)
    })

    await user.click(screen.getByRole('button', { name: 'Remove scene Scene 3' }))
    expect(screen.getByText('Remove scene?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2'])
    })
  })

  it('hides scene removal when the show has one scene', () => {
    const show = removeShowScene(createDefaultShow('show-1', 'Opening wash', 1000), 'scene-2')
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('button', { name: /Remove scene/i })).not.toBeInTheDocument()
  })
})

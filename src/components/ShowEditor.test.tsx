import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import {
  addShowScene,
  addShowRoutingLayout,
  addShowZone,
  createDefaultShow,
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
  useControllerStore.setState(controllerInitialState)
  resetControllerProvider()
})

afterEach(() => resetControllerProvider())

describe('ShowEditor (#318)', () => {
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

    expect(screen.getByText('Untitled Show')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
  })

  it('keeps the Show workspace scrollable without exposing a vertical scrollbar', () => {
    const show = createDefaultShow('show-scroll', 'Long Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByTestId('show-editor-scroll')).toHaveClass('overflow-auto', 'scrollbar-hidden')
  })

  it('toggles Show playback with Space from focused timeline controls', () => {
    const show = createDefaultShow('show-space', 'Keyboard Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Fit timeline to Show' }), { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(false)
  })

  it('leaves Space available while editing Show text', () => {
    const show = createDefaultShow('show-text-space', 'Text Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Scene 1 scene name' }), { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('drives proportional Show transport and requests an accurate seek (#414)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Show playhead' })).toHaveAttribute('max', '62000')
    expect(screen.getByText('00:00.000 / 01:02.000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause Show preview' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pause Show preview' }))
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(screen.getByRole('button', { name: 'Play Show preview' })).toBeInTheDocument()

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    fireEvent.change(playhead, { target: { value: '31000' } })

    expect(useShowTransportStore.getState().seekRequest).toBeNull()
    expect(screen.getByText('00:31.000 / 01:02.000')).toBeInTheDocument()

    fireEvent.pointerUp(playhead)

    await waitFor(() => {
      expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 31_000 })
    })
    expect(useShowTransportStore.getState().seekStatus).toBe('rebuilding')

    fireEvent.keyDown(document, { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('selects a scene and exposes compact Scene properties (#424)', async () => {
    const show = createDefaultShow('show-scene-properties', 'Scene properties study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    fireEvent.click(screen.getByRole('group', { name: 'Scene Scene 1' }))

    expect(screen.getByRole('region', { name: 'Scene properties' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scene properties' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Scene name' })).toHaveValue('Scene 1')
    expect(screen.getByRole('spinbutton', { name: 'Scene duration seconds' })).toHaveValue(30)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scene duration seconds' }), { target: { value: '12' } })
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes[0].durationMs).toBe(12_000))

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate scene Scene 1' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
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

  it('splits at the playhead and exposes explicit Continue or Restart entry behavior (#415)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Split Show', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const splitButton = screen.getByRole('button', { name: 'Split at playhead' })
    expect(splitButton).toBeDisabled()
    fireEvent.change(screen.getByRole('slider', { name: 'Show playhead' }), { target: { value: '10000' } })
    expect(splitButton).toBeEnabled()
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

  it('authors named routing layouts and scene-boundary switch markers (#398)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-1', 'Routing Show', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

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
        easing: 'ease-in-out',
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
        easing: 'ease-in-out',
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
    await user.selectOptions(screen.getByLabelText('Transition easing'), 'ease-in-out')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.find((transition) => transition.id === 'transition-scene-1')?.easing)
        .toBe('ease-in-out')
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
        .toMatchObject({ durationMs: 2000, easing: 'ease-in-out', routingDirection: 'reverse' })
    })
  })

  it('authors a boundary-owned time-scale ramp from the nested Time lane (#417)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-417', 'Time lane', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Time lane for main' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit time transition from Scene 1 for main' }))
    await user.click(screen.getByLabelText('Animate time for main'))
    fireEvent.change(screen.getByLabelText('Time scale start main'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Time scale target main'), { target: { value: '0' } })

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.transitions?.[0].propertyTransitions).toEqual({
        timeScale: { fromByCellId: { 'cell-2': 1.5 }, durationMs: 2000, easing: 'linear' },
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
    await user.click(screen.getByLabelText('Animate time for main'))
    await user.click(screen.getByLabelText('Animate brightness for main'))
    fireEvent.change(screen.getByLabelText('Time scale duration seconds'), { target: { value: '1.5' } })
    await user.selectOptions(screen.getByLabelText('Time scale easing'), 'ease-in')
    fireEvent.change(screen.getByLabelText('Brightness duration seconds'), { target: { value: '0.8' } })
    await user.selectOptions(screen.getByLabelText('Brightness easing'), 'ease-out')
    fireEvent.change(screen.getByLabelText('Brightness target main'), { target: { value: '0.25' } })

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.transitions?.[0].propertyTransitions).toMatchObject({
        timeScale: { durationMs: 1500, easing: 'ease-in' },
        brightness: { durationMs: 800, easing: 'ease-out' },
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
        easing: 'ease-in-out',
      })
    })
    expect(screen.getByRole('group', { name: 'Speed control lane for main' })).toBeInTheDocument()
    expect(screen.getByText('0.2→0.8')).toBeInTheDocument()
  })

  it('projects Time values across every row covered by a spanning cell (#417)', () => {
    let show = addShowZone(createDefaultShow('show-417-span', 'Spanning time', 1000), {
      name: 'edge',
      nominalPixelCount: 16,
    })
    show = spanShowCellZones(show, show.cells[0].id, 2)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Time lane for main' }).parentElement).toHaveTextContent('1×')
    expect(screen.getByRole('group', { name: 'Time lane for edge' }).parentElement).toHaveTextContent('1×')
  })

  it('renders a scene strip, selectable clip inspector, and compile bar', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
    expect(screen.getByText('Opening wash')).toBeInTheDocument()
    expect(screen.queryByText(/show - 1 scenes/i)).not.toBeInTheDocument()
    expect(screen.getByText('00:00.000 / 01:02.000')).toBeInTheDocument()
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
    expect(screen.getByLabelText('Time x')).toHaveAttribute('min', '0')

    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))
    expect(screen.getByRole('heading', { name: 'Transition properties' })).toBeInTheDocument()
    expect(screen.getByText(/Scene 1 → Scene 2 · crossfade/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'wipe' })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
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
    expect(screen.getAllByRole('button', { name: 'View generated pattern' })
      .every((button) => !button.hasAttribute('disabled'))).toBe(true)
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
    await user.selectOptions(screen.getByLabelText('Pattern for new clip'), 'stock:TestPattern2D')

    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toContainEqual(expect.objectContaining({
      zoneId: 'zone-1',
      sceneId: 'scene-1',
      patternName: 'TestPattern2D',
    })))
    expect(screen.getByRole('button', { name: 'Select TestPattern2D' })).toBeInTheDocument()
    expect(screen.getByText(/TestPattern2D · main · Scene 1/i)).toBeInTheDocument()
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
    await user.selectOptions(screen.getByLabelText('Source pattern'), 'stock:TestPattern2D')
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
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
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

    expect(screen.getByLabelText('Feather width')).toHaveValue(0.2)
    expect(screen.getByText(/stable spatial threshold/i)).toHaveTextContent('one Pattern renderer')
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
    expect(screen.getByLabelText('Spatial shape')).toHaveValue('diamond')
    expect(screen.getByLabelText('Rotation turns')).toHaveValue(0.125)
    expect(screen.getByLabelText('Spin turns')).toHaveValue(0)
    expect(screen.queryByLabelText('Ring width')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Feather behavior')).toHaveValue('dither')
    expect(screen.getByText('worst instant: portal dither')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Center X'), { target: { value: '0.35' } })
    await user.selectOptions(screen.getByLabelText('Feather behavior'), 'blend')
    await user.click(screen.getByLabelText('Outside in'))
    await user.selectOptions(screen.getByLabelText('Spatial shape'), 'ring')
    fireEvent.change(screen.getByLabelText('Ring width'), { target: { value: '0.2' } })

    expect(screen.queryByLabelText('Rotation turns')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Spin turns')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
        kind: 'portal',
        centerX: 0.35,
        centerY: 0.5,
        invert: true,
        featherPolicy: 'blend',
        shape: 'ring',
        scale: 1,
        ringWidth: 0.2,
      })
    })
    expect(screen.getByText(/Two Pattern renderers run only inside/i)).toBeInTheDocument()
    expect(screen.getByText('worst instant: portal blend (feather band only)')).toBeInTheDocument()
  })

  it('offers stock maps in Show setup and reflects the selected stage', () => {
    const show = createDefaultShow('show-1', 'Stock stage', 1000)
    show.stageMapId = 'plane'
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByLabelText('Stage map')).toHaveValue('plane')
    expect(screen.getByRole('option', { name: 'Square (2D)' })).toBeInTheDocument()
  })

  it('edits freestyle show zones and warns when a target controller zone is missing', async () => {
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

    expect(screen.getByText('Clip "cell-3" references missing zone "doorframe".')).toBeInTheDocument()

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
    await user.selectOptions(screen.getByLabelText('Transition kind'), 'dither')

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

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  updateShowRoutingSwitch,
  updateShowTransition,
} from '@/engine/showModel'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
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

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  usePreviewStore.setState(previewInitialState)
  useShowTransportStore.setState(showTransportInitialState)
})

describe('ShowEditor (#318)', () => {
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

    fireEvent.change(screen.getByRole('slider', { name: 'Show playhead' }), { target: { value: '31000' } })

    await waitFor(() => {
      expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 31_000 })
    })
    expect(useShowTransportStore.getState().seekStatus).toBe('rebuilding')
    expect(screen.getByText('00:31.000 / 01:02.000')).toBeInTheDocument()

    fireEvent.keyDown(document, { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
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

  it('selects visual and routing events from one first-class transition lane and inspector (#416)', async () => {
    const user = userEvent.setup()
    const base = addShowRoutingLayout(createDefaultShow('show-1', 'Boundary lane', 1000), 'Alternate')
    const show = updateShowRoutingSwitch(base, 'scene-1', base.routingLayouts[1].id)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Transition lane' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    expect(screen.getByText(/Scene 1 -> Scene 2 - crossfade transition/i)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Transition easing'), 'ease-in-out')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.find((transition) => transition.id === 'transition-scene-1')?.easing)
        .toBe('ease-in-out')
    })

    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (routing)' }))
    expect(screen.getByText(/Scene 1 -> Scene 2 - routing transition/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Destination routing layout')).toHaveValue(base.routingLayouts[1].id)
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

  it('renders a scene strip, selectable cell inspector, and compile bar', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByText('Opening wash')).not.toBeInTheDocument()
    expect(screen.queryByText(/show - 1 scenes/i)).not.toBeInTheDocument()
    expect(screen.getByText('00:00.000 / 01:02.000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Scene 1')).toBeInTheDocument()
    expect(screen.getAllByText('main').length).toBeGreaterThan(0)
    expect(screen.getByText(/compiled artifact/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
    expect(screen.getByText(/renderer\/px/i)).toBeInTheDocument()
    expect(screen.getByText('Show setup')).toBeInTheDocument()
    expect(screen.getByLabelText('Target controller')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByText(/TestPattern1D - cell - main - Scene 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Mirror cell')).toBeInTheDocument()
    expect(screen.getByLabelText('Time x')).toHaveAttribute('min', '0')

    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))
    expect(screen.getByText(/Scene 1 -> Scene 2 - crossfade transition/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'wipe' })).toBeInTheDocument()
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
    expect(screen.getByText(/shift this cell's private Pattern clock/i)).toHaveTextContent('rounds across zones')
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
      { centerX: 0.5, centerY: 0.5, invert: false, featherPolicy: 'dither' },
    )
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))

    expect(screen.getByLabelText('Center X')).toHaveValue(0.5)
    expect(screen.getByLabelText('Center Y')).toHaveValue(0.5)
    expect(screen.getByLabelText('Feather behavior')).toHaveValue('dither')
    expect(screen.getByText('worst instant: portal dither')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Center X'), { target: { value: '0.35' } })
    await user.selectOptions(screen.getByLabelText('Feather behavior'), 'blend')
    await user.click(screen.getByLabelText('Outside in'))

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
        kind: 'portal',
        centerX: 0.35,
        centerY: 0.5,
        invert: true,
        featherPolicy: 'blend',
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
    expect(screen.getByDisplayValue('Scene 3')).toBeInTheDocument()

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

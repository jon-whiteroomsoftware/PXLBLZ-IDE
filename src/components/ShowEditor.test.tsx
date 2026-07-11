import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import {
  addShowScene,
  addShowZone,
  createDefaultShow,
  removeShowScene,
  updateShowCellAdaptations,
  updateShowCellPattern,
} from '@/engine/showModel'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
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
})

describe('ShowEditor (#318)', () => {
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

  it('renders a scene strip, selectable cell inspector, and compile bar', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByText('Opening wash')).not.toBeInTheDocument()
    expect(screen.queryByText(/show - 1 scenes/i)).not.toBeInTheDocument()
    expect(screen.getByText(/1m loop/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Scene 1')).toBeInTheDocument()
    expect(screen.getAllByText('main').length).toBeGreaterThan(0)
    expect(screen.getByText(/compiled artifact/i)).toBeInTheDocument()
    expect(screen.getByText(/renderer\/px/i)).toBeInTheDocument()
    expect(screen.getByText('Show setup')).toBeInTheDocument()
    expect(screen.getByLabelText('Target controller')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByText(/TestPattern1D - cell - main - Scene 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Mirror cell')).toBeInTheDocument()
    expect(screen.getByLabelText('Time x')).toHaveAttribute('min', '0')

    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))
    expect(screen.getByText(/Scene 1 -> Scene 2 - transition/i)).toBeInTheDocument()
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
    const show = createDefaultShow('show-1', 'Feathered wipe', 1000)
    show.scenes[0].transitionOut = { kind: 'wipe', durationMs: 2000, feather: 0.2 }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))

    expect(screen.getByLabelText('Feather width')).toHaveValue(0.2)
    expect(screen.getByText(/stable spatial threshold/i)).toHaveTextContent('one Pattern renderer')
    expect(screen.getByText('worst instant: feathered wipe')).toBeInTheDocument()
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

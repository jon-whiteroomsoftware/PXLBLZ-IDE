import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import { addShowScene, addShowZone, createDefaultShow } from '@/engine/showModel'
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

    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))
    expect(screen.getByText(/Scene 1 -> Scene 2 - transition/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'wipe' })).toBeInTheDocument()
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
})

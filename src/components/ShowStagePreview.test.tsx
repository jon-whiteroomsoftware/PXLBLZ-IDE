import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowStagePreview } from './ShowStagePreview'
import { createDefaultShow } from '@/engine/showModel'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { MapRecord, MixinRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'

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

const importedMap: MapRecord = {
  id: 'map-1',
  name: 'North Arch map',
  dim: 2,
  generator: 'custom',
  params: {},
  points: [[0, 0], [1, 0], [0, 1], [1, 1]],
  updatedAt: 1,
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  usePreviewStore.setState({ ...previewInitialState, isRunning: false })
  useControllerProfileStore.setState(controllerProfileInitialState)
  useShowTransportStore.setState(showTransportInitialState)
})

describe('ShowStagePreview (#339)', () => {
  it('shows an icon-only seek badge only when rebuilding lasts beyond the short delay', () => {
    vi.useFakeTimers()
    try {
      const show = createDefaultShow('show-seek-badge', 'Seek badge', 1000)
      useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

      render(<ShowStagePreview showId={show.id} />)
      act(() => {
        useShowTransportStore.setState({
          seekStatus: 'rebuilding',
          seekRequest: { id: 1, targetMs: 50_000 },
        })
      })

      expect(screen.queryByRole('status', { name: 'Rebuilding Show preview' })).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(149))
      expect(screen.queryByRole('status', { name: 'Rebuilding Show preview' })).not.toBeInTheDocument()

      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByRole('status', { name: 'Rebuilding Show preview' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rebuilds an accurate Fast frame for the current seek request (#414)', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    act(() => {
      const transport = useShowTransportStore.getState()
      transport.openShow(show.id, 62_000)
      transport.requestSeek(show.id, 0)
    })

    await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
    expect(screen.getByText(/show paused · Fast/i)).toBeInTheDocument()
  })

  it('renders stage options and persists the selected map on the show', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useMapStore.setState({ userMaps: [importedMap], mapsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    await user.selectOptions(screen.getByLabelText('Show stage'), 'map-1')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].stageMapId).toBe('map-1')
    })
  })

  it('falls back to strips when the saved stage map is missing', () => {
    const show = { ...createDefaultShow('show-1', 'Opening wash', 1000), stageMapId: 'missing-map' }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    expect(screen.getByText(/saved stage map is gone/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Show stage')).toHaveValue('')
  })
})

import { showInitialState, useShowStore } from './showStore'
import { mapInitialState, useMapStore } from './mapStore'
import { createDefaultShow } from '@/engine/showModel'
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
  useMapStore.setState(mapInitialState)
})

describe('showStore (#318)', () => {
  it('loads shows sorted by recency and opens one as active', async () => {
    const older = createDefaultShow('show-1', 'Older', 1)
    const newer = createDefaultShow('show-2', 'Newer', 2)
    setPersonalContentProvider(memoryProvider([older, newer]))

    await useShowStore.getState().loadShows()
    useShowStore.getState().openShow('show-1')

    expect(useShowStore.getState().shows.map((show) => show.id)).toEqual(['show-2', 'show-1'])
    expect(useShowStore.getState().activeShowId).toBe('show-1')
  })

  it('creates, renames, edits, and deletes shows through the provider', async () => {
    setPersonalContentProvider(memoryProvider())

    const show = await useShowStore.getState().createNewShow()
    await useShowStore.getState().renameShow(show.id, 'Opening wash')
    await useShowStore.getState().updateScene(show.id, show.scenes[0].id, { durationMs: 45000 })
    await useShowStore.getState().updateCellAdaptations(show.id, show.cells[0].id, { mirror: true })

    expect(useShowStore.getState().shows[0]).toMatchObject({
      id: show.id,
      name: 'Opening wash',
      scenes: [expect.objectContaining({ durationMs: 45000 }), expect.any(Object)],
      cells: [expect.objectContaining({ adaptations: expect.objectContaining({ mirror: true }) }), expect.any(Object)],
    })

    await useShowStore.getState().removeShow(show.id)
    expect(useShowStore.getState().shows).toEqual([])
    expect(useShowStore.getState().activeShowId).toBeNull()
  })

  it('persists an exact-zero clip time scale through the provider', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateCellAdaptations(show.id, show.cells[0].id, { timeScale: 0 })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].cells[0].adaptations.timeScale).toBe(0)
  })

  it('persists a wipe feather width through the provider', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateTransition(show.id, 'scene-1', 'wipe', 2000, 0.3)
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'wipe',
      feather: 0.3,
    })
  })

  it('edits show-local zones and creates a show from controller zones', async () => {
    setPersonalContentProvider(memoryProvider())

    const show = await useShowStore.getState().createNewShow()
    await useShowStore.getState().addScene(show.id)
    expect(useShowStore.getState().shows[0].scenes).toHaveLength(3)

    await useShowStore.getState().removeScene(show.id, 'scene-3')
    expect(useShowStore.getState().shows[0].scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2'])

    await useShowStore.getState().addZone(show.id)
    const withZone = useShowStore.getState().shows[0]
    const addedZone = withZone.zones[1]

    await useShowStore.getState().updateZone(show.id, addedZone.id, {
      name: 'doorframe',
      nominalPixelCount: 24,
    })
    await useShowStore.getState().spanCellZones(show.id, show.cells[0].id, 2)

    expect(useShowStore.getState().shows[0].zones[1]).toMatchObject({
      name: 'doorframe',
      nominalPixelCount: 24,
    })
    expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === show.cells[0].id)).toMatchObject({
      zoneSpan: 2,
    })

    const seeded = await useShowStore.getState().createShowFromController({
      id: 'controller-1',
      name: 'North Arch',
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      zones: [
        { id: 'left', name: 'arch-left', ranges: [{ start: 0, end: 119 }] },
        { id: 'right', name: 'arch-right', ranges: [{ start: 120, end: 239 }] },
      ],
      updatedAt: 1,
    })

    expect(seeded.targetControllerProfileId).toBe('controller-1')
    expect(seeded.zones.map((zone) => [zone.name, zone.nominalPixelCount])).toEqual([
      ['arch-left', 120],
      ['arch-right', 120],
    ])
    expect(useShowStore.getState().activeShowId).toBe(seeded.id)
  })

  it('seeds and persists a show stage map from controller imports', async () => {
    setPersonalContentProvider(memoryProvider())
    useMapStore.setState({
      userMaps: [
        {
          id: 'map-old',
          name: 'Old import',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0]],
          importMetadata: {
            kind: 'controller',
            controllerName: 'North Arch',
            deviceId: 'device-1',
            pixelCount: 1,
            importedAt: 100,
            normalization: 'device-fill-normalized',
          },
          updatedAt: 100,
        },
        {
          id: 'map-new',
          name: 'New import',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0], [1, 0]],
          importMetadata: {
            kind: 'controller',
            controllerName: 'North Arch',
            deviceId: 'device-1',
            pixelCount: 2,
            importedAt: 200,
            normalization: 'device-fill-normalized',
          },
          updatedAt: 200,
        },
      ],
    })

    const seeded = await useShowStore.getState().createShowFromController({
      id: 'controller-1',
      name: 'North Arch',
      deviceId: 'device-1',
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      zones: [{ id: 'left', name: 'arch-left', ranges: [{ start: 0, end: 1 }] }],
      updatedAt: 1,
    })

    expect(seeded.stageMapId).toBe('map-new')

    await useShowStore.getState().updateStageMap(seeded.id, null)
    expect(useShowStore.getState().shows[0].stageMapId).toBeNull()
  })
})

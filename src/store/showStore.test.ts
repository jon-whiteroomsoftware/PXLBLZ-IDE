import { showInitialState, useShowStore } from './showStore'
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
})

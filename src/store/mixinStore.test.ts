import { useEditorStore, editorInitialState } from './editorStore'
import { useMixinStore, mixinInitialState, type MixinRecord } from './mixinStore'
import { useMapStore, mapInitialState } from './mapStore'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { MapRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'

function memoryProvider(): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const maps = new Map<string, MapRecord>()
  const mixins = new Map<string, MixinRecord>()
  const shows = new Map<string, ShowRecord>()
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

const CUSTOM_MIXIN: MixinRecord = {
  id: 'mx1',
  name: 'My mixin',
  kind: 'bind',
  src: '// @param PIN input\n// @target CONTROL\n// @wraps beforeRender\nexport var x = 0',
  updatedAt: 1000,
}

beforeEach(() => {
  resetPersonalContentProvider()
  setPersonalContentProvider(memoryProvider())
  useMixinStore.setState(mixinInitialState)
  useEditorStore.setState(editorInitialState)
  useMapStore.setState(mapInitialState)
})

describe('mixinStore (#313)', () => {
  it('loads cloud mixins sorted by recency', async () => {
    await useMixinStore.getState().addMixin({ ...CUSTOM_MIXIN, updatedAt: 1 })
    await useMixinStore.getState().addMixin({ ...CUSTOM_MIXIN, id: 'mx2', name: 'Newer', updatedAt: 2 })
    useMixinStore.setState({ userMixins: [], mixinsLoaded: false })

    await useMixinStore.getState().loadMixins()

    expect(useMixinStore.getState().mixinsLoaded).toBe(true)
    expect(useMixinStore.getState().userMixins.map((m) => m.id)).toEqual(['mx2', 'mx1'])
  })

  it('opens an existing mixin editable in mixin mode', () => {
    useMixinStore.getState().openExistingMixin(CUSTOM_MIXIN)

    expect(useMixinStore.getState().editingMixin).toEqual({ kind: 'existing', id: 'mx1' })
    expect(useEditorStore.getState().editorFlavor).toBe('mixin')
    expect(useEditorStore.getState().isReadOnly).toBe(false)
    expect(useEditorStore.getState().source).toBe(CUSTOM_MIXIN.src)
  })

  it('opens stock mixins read-only', () => {
    useMixinStore.getState().openStockMixin('pot-binding')

    expect(useMixinStore.getState().editingMixin).toEqual({ kind: 'stock', id: 'pot-binding' })
    expect(useEditorStore.getState().editorFlavor).toBe('mixin')
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(useEditorStore.getState().source).toContain('@param PIN')
  })

  it('clones a stock mixin into an editable cloud mixin', async () => {
    const id = await useMixinStore.getState().cloneStockMixin('hw-brightness')
    const { userMixins, editingMixin } = useMixinStore.getState()

    expect(id).toBe(userMixins[0].id)
    expect(userMixins[0]).toMatchObject({ name: 'hw-brightness copy', kind: 'intercept' })
    expect(editingMixin).toEqual({ kind: 'existing', id })
    expect(useEditorStore.getState().isReadOnly).toBe(false)
  })

  it('updates source for an open custom mixin', async () => {
    await useMixinStore.getState().addMixin(CUSTOM_MIXIN)
    useMixinStore.getState().openExistingMixin(CUSTOM_MIXIN)
    await useMixinStore.getState().updateMixinSrc('mx1', `${CUSTOM_MIXIN.src}\n// changed`)

    expect(useMixinStore.getState().userMixins[0].src).toContain('// changed')
  })
})

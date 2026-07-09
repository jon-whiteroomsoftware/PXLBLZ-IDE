import { useEditorStore, editorInitialState } from './editorStore'
import { libraryInitialState, useLibraryStore, type LibraryRecord } from './libraryStore'
import { useMapStore, mapInitialState } from './mapStore'
import { useMixinStore, mixinInitialState } from './mixinStore'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'

function memoryProvider(seed: LibraryRecord[] = []): PersonalContentProvider {
  const libraries = new Map(seed.map((record) => [record.id, record]))
  return {
    id: 'memory-test',
    listPatterns: async () => [],
    createPattern: async () => {},
    updatePattern: async () => {},
    deletePattern: async () => {},
    listMaps: async () => [],
    createMap: async () => {},
    updateMap: async () => {},
    deleteMap: async () => {},
    listMixins: async () => [],
    createMixin: async () => {},
    updateMixin: async () => {},
    deleteMixin: async () => {},
    listShows: async () => [],
    createShow: async () => {},
    updateShow: async () => {},
    deleteShow: async () => {},
    listControllerProfiles: async () => [],
    createControllerProfile: async () => {},
    updateControllerProfile: async () => {},
    deleteControllerProfile: async () => {},
    listLibraries: async () => [...libraries.values()],
    createLibrary: async (record) => { libraries.set(record.id, record) },
    updateLibrary: async (id, changes) => { libraries.set(id, { ...libraries.get(id)!, ...changes }) },
    deleteLibrary: async (id) => { libraries.delete(id) },
    getLastActive: async () => undefined,
    setLastActive: async () => {},
    getDemoOverrides: async () => undefined,
    setDemoOverrides: async () => {},
  }
}

const CUSTOM_LIBRARY: LibraryRecord = {
  id: 'lib-1',
  name: 'MyLib',
  src: 'var gain = 1\nfunction scale(v) { return v * gain }',
  updatedAt: 1000,
}

beforeEach(() => {
  resetPersonalContentProvider()
  setPersonalContentProvider(memoryProvider())
  useLibraryStore.setState(libraryInitialState)
  useEditorStore.setState(editorInitialState)
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
})

describe('libraryStore (#347)', () => {
  it('loads cloud libraries sorted by recency', async () => {
    setPersonalContentProvider(memoryProvider([
      { ...CUSTOM_LIBRARY, updatedAt: 1 },
      { ...CUSTOM_LIBRARY, id: 'lib-2', name: 'NewerLib', updatedAt: 2 },
    ]))

    await useLibraryStore.getState().loadLibraries()

    expect(useLibraryStore.getState().librariesLoaded).toBe(true)
    expect(useLibraryStore.getState().userLibraries.map((library) => library.id)).toEqual(['lib-2', 'lib-1'])
  })

  it('creates Lib-N cloud libraries editable in library mode', async () => {
    await useLibraryStore.getState().addLibrary({ ...CUSTOM_LIBRARY, name: 'Lib1' })

    const record = await useLibraryStore.getState().createNewLibrary()

    expect(record.name).toBe('Lib2')
    expect(useLibraryStore.getState().editingLibrary).toEqual({ kind: 'existing', id: record.id })
    expect(useEditorStore.getState().editorFlavor).toBe('library')
    expect(useEditorStore.getState().isReadOnly).toBe(false)
    expect(useEditorStore.getState().source).toBe(record.src)
  })

  it('opens existing libraries without pushing them into the running preview source', () => {
    useEditorStore.setState({ previewSource: 'export function render() {}' })

    useLibraryStore.getState().openExistingLibrary(CUSTOM_LIBRARY)

    expect(useLibraryStore.getState().editingLibrary).toEqual({ kind: 'existing', id: 'lib-1' })
    expect(useEditorStore.getState().editorFlavor).toBe('library')
    expect(useEditorStore.getState().isReadOnly).toBe(false)
    expect(useEditorStore.getState().previewSource).toBe('export function render() {}')
  })

  it('rejects invalid, stock, builtin, and duplicate namespace renames', async () => {
    await useLibraryStore.getState().addLibrary(CUSTOM_LIBRARY)
    await useLibraryStore.getState().addLibrary({ ...CUSTOM_LIBRARY, id: 'lib-2', name: 'OtherLib' })

    await expect(useLibraryStore.getState().renameLibrary('lib-1', 'bad name')).rejects.toThrow('identifier')
    await expect(useLibraryStore.getState().renameLibrary('lib-1', 'Shader')).rejects.toThrow('already')
    await expect(useLibraryStore.getState().renameLibrary('lib-1', 'hsv')).rejects.toThrow('built-in')
    await expect(useLibraryStore.getState().renameLibrary('lib-1', 'OtherLib')).rejects.toThrow('already')
  })

  it('updates source for an open custom library', async () => {
    await useLibraryStore.getState().addLibrary(CUSTOM_LIBRARY)
    useLibraryStore.getState().openExistingLibrary(CUSTOM_LIBRARY)

    await useLibraryStore.getState().updateLibrarySrc('lib-1', `${CUSTOM_LIBRARY.src}\nfunction plus(v) { return v + 1 }`)

    expect(useLibraryStore.getState().userLibraries[0].src).toContain('plus')
  })
})

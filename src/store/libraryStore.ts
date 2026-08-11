import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import {
  LIBRARY_SKELETON,
  builtinNamespaceNames,
  nextLibraryCloneName,
  nextLibraryName,
  validateLibraryName,
} from '@/engine/libraries'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import type { LibraryRecord } from '@/engine/personalContentRecords'
import { LIBRARIES } from '@/pixelblaze/libs'
import { useDocsStore } from './docsStore'
import { useEditorStore } from './editorStore'
import { flushPendingAutosave } from './autosaveSync'
import { useMapStore } from './mapStore'
import { useMixinStore } from './mixinStore'
import { usePatternStore } from './patternStore'

export type { LibraryRecord }

export type EditingLibrary = { kind: 'existing'; id: string } | { kind: 'stock'; id: string } | null

interface LibraryState {
  userLibraries: LibraryRecord[]
  librariesLoaded: boolean
  editingLibrary: EditingLibrary
  libraryBaseline: string
  loadLibraries: () => Promise<void>
  createNewLibrary: () => Promise<LibraryRecord>
  addLibrary: (record: LibraryRecord) => Promise<void>
  openExistingLibrary: (record: LibraryRecord) => void
  openStockLibrary: (name: string) => void
  cloneStockLibrary: (name: string) => Promise<string | null>
  closeLibraryEditor: () => void
  renameLibrary: (id: string, name: string) => Promise<void>
  removeLibrary: (id: string) => Promise<void>
  updateLibrarySrc: (id: string, src: string) => Promise<void>
  validateLibraryNamespace: (name: string, currentId?: string) => string | null
}

export const libraryInitialState = {
  userLibraries: [] as LibraryRecord[],
  librariesLoaded: false,
  editingLibrary: null as EditingLibrary,
  libraryBaseline: '',
}

function providerMethod<K extends 'listLibraries' | 'createLibrary' | 'updateLibrary' | 'deleteLibrary'>(
  method: K,
): NonNullable<ReturnType<typeof getPersonalContentProvider>[K]> {
  const provider = getPersonalContentProvider()
  const fn = provider[method]
  if (!fn) throw new Error('Current personal content provider does not support libraries')
  return fn
}

function enterLibraryMode(source: string, name: string, readOnly = false): void {
  flushPendingAutosave()
  useMapStore.setState({ editingMap: null, mapBaseline: '', mapEvalError: null })
  useMixinStore.setState({ editingMixin: null, mixinBaseline: '' })
  useDocsStore.getState().closeDocs()
  usePatternStore.getState().setActiveLibrary(name)
  const editor = useEditorStore.getState()
  editor.setEditorFlavor('library')
  editor.setIsReadOnly(readOnly)
  editor.setSource(source)
  editor.setCompileStatus('good')
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  ...libraryInitialState,

  loadLibraries: async () => {
    const listLibraries = providerMethod('listLibraries')
    const libraries = await listLibraries()
    set({ userLibraries: libraries.sort((a, b) => b.updatedAt - a.updatedAt), librariesLoaded: true })
  },

  createNewLibrary: async () => {
    const name = nextLibraryName({
      stockNames: Object.keys(LIBRARIES),
      userNames: get().userLibraries.map((library) => library.name),
      builtinNames: builtinNamespaceNames(),
    })
    const record: LibraryRecord = {
      id: newPersonalContentId(),
      name,
      src: LIBRARY_SKELETON.replace(/Lib1/g, name),
      updatedAt: Date.now(),
    }
    await get().addLibrary(record)
    get().openExistingLibrary(record)
    return record
  },

  addLibrary: async (record) => {
    const error = get().validateLibraryNamespace(record.name)
    if (error) throw new Error(error)
    const createLibrary = providerMethod('createLibrary')
    await createLibrary(record)
    trackEntityCreated('library')
    set((s) => ({ userLibraries: [record, ...s.userLibraries] }))
  },

  openExistingLibrary: (record) => {
    // Enter library mode first: its flush must pair the outgoing buffer with
    // the outgoing selection, so editingLibrary changes only afterwards (#810).
    enterLibraryMode(record.src, record.name)
    set({
      editingLibrary: { kind: 'existing', id: record.id },
      libraryBaseline: record.src,
    })
  },

  openStockLibrary: (name) => {
    const src = LIBRARIES[name]
    if (!src) return
    enterLibraryMode(src, name, true)
    set({
      editingLibrary: { kind: 'stock', id: name },
      libraryBaseline: src,
    })
  },

  cloneStockLibrary: async (stockName) => {
    const src = LIBRARIES[stockName]
    if (!src) return null
    const name = nextLibraryCloneName(stockName, {
      stockNames: Object.keys(LIBRARIES),
      userNames: get().userLibraries.map((library) => library.name),
      builtinNames: builtinNamespaceNames(),
    })
    const record: LibraryRecord = {
      id: newPersonalContentId(),
      name,
      src,
      updatedAt: Date.now(),
    }
    await get().addLibrary(record)
    get().openExistingLibrary(record)
    return record.id
  },

  closeLibraryEditor: () => {
    flushPendingAutosave()
    set({ editingLibrary: null, libraryBaseline: '' })
    if (useEditorStore.getState().editorFlavor === 'library') {
      useEditorStore.getState().setEditorFlavor('pattern')
    }
  },

  renameLibrary: async (id, name) => {
    const error = get().validateLibraryNamespace(name, id)
    if (error) throw new Error(error)
    const updatedAt = Date.now()
    const updateLibrary = providerMethod('updateLibrary')
    await updateLibrary(id, { name, updatedAt })
    set((s) => ({
      userLibraries: s.userLibraries.map((library) =>
        library.id === id ? { ...library, name, updatedAt } : library,
      ),
    }))
    const editingLibrary = get().editingLibrary
    if (editingLibrary?.kind === 'existing' && editingLibrary.id === id) {
      usePatternStore.getState().setActiveLibrary(name)
    }
  },

  removeLibrary: async (id) => {
    const deleteLibrary = providerMethod('deleteLibrary')
    await deleteLibrary(id)
    const { editingLibrary, userLibraries } = get()
    set({ userLibraries: userLibraries.filter((library) => library.id !== id) })
    if (editingLibrary?.kind === 'existing' && editingLibrary.id === id) get().closeLibraryEditor()
  },

  updateLibrarySrc: async (id, src) => {
    const existing = get().userLibraries.find((library) => library.id === id)
    if (existing?.src === src) return
    const updatedAt = Date.now()
    const updateLibrary = providerMethod('updateLibrary')
    await updateLibrary(id, { src, updatedAt })
    set((s) => ({
      userLibraries: s.userLibraries.map((library) =>
        library.id === id ? { ...library, src, updatedAt } : library,
      ),
    }))
  },

  validateLibraryNamespace: (name, currentId) => {
    const current = currentId ? get().userLibraries.find((library) => library.id === currentId) : undefined
    return validateLibraryName(name, {
      stockNames: Object.keys(LIBRARIES),
      userNames: get().userLibraries
        .filter((library) => library.id !== currentId)
        .map((library) => library.name),
      builtinNames: builtinNamespaceNames(),
      currentName: current?.name,
    })
  },
}))

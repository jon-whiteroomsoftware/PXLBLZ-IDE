import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import {
  MIXIN_SKELETON,
  STOCK_MIXIN_ITEMS,
  stockMixinSpec,
  type MixinPassKind,
  type MixinRecord,
} from '@/engine/mixins'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { uniquePatternName } from '@/engine/patternName'
import { useDocsStore } from './docsStore'
import { useEditorStore } from './editorStore'
import { flushPendingAutosave } from './autosaveSync'
import { useMapStore } from './mapStore'
import { usePatternStore } from './patternStore'

export type { MixinPassKind, MixinRecord }
export { STOCK_MIXIN_ITEMS }

export type EditingMixin = { kind: 'existing'; id: string } | { kind: 'stock'; id: string } | null

interface MixinState {
  userMixins: MixinRecord[]
  mixinsLoaded: boolean
  editingMixin: EditingMixin
  mixinBaseline: string
  createNewMixin: () => Promise<void>
  openExistingMixin: (record: MixinRecord) => void
  openStockMixin: (id: string) => void
  cloneStockMixin: (id: string, recordId?: string) => Promise<string | null>
  closeMixinEditor: () => void
  loadMixins: () => Promise<void>
  addMixin: (record: MixinRecord) => Promise<void>
  renameMixin: (id: string, name: string) => Promise<void>
  removeMixin: (id: string) => Promise<void>
  updateMixinSrc: (id: string, src: string) => Promise<void>
}

export const mixinInitialState = {
  userMixins: [] as MixinRecord[],
  mixinsLoaded: false,
  editingMixin: null as EditingMixin,
  mixinBaseline: '',
}

function enterMixinMode(source: string, readOnly = false): void {
  flushPendingAutosave()
  useMapStore.setState({ editingMap: null, mapBaseline: '', mapEvalError: null })
  usePatternStore.getState().setActivePattern(null)
  useDocsStore.getState().closeDocs()
  const ed = useEditorStore.getState()
  ed.setEditorFlavor('mixin')
  ed.setIsReadOnly(readOnly)
  ed.setSource(source)
  ed.setCompileStatus('good')
}

export const useMixinStore = create<MixinState>()((set, get) => ({
  ...mixinInitialState,

  createNewMixin: async () => {
    const id = newPersonalContentId()
    const name = uniquePatternName('Untitled Mixin', get().userMixins.map((m) => m.name))
    const record: MixinRecord = {
      id,
      name,
      kind: 'bind',
      src: MIXIN_SKELETON,
      updatedAt: Date.now(),
    }
    await get().addMixin(record)
    get().openExistingMixin(record)
  },

  openExistingMixin: (record) => {
    enterMixinMode(record.src)
    set({
      editingMixin: { kind: 'existing', id: record.id },
      mixinBaseline: record.src,
    })
  },

  openStockMixin: (id) => {
    const spec = stockMixinSpec(id)
    if (!spec) return
    enterMixinMode(spec.src, true)
    set({
      editingMixin: { kind: 'stock', id: spec.id },
      mixinBaseline: spec.src,
    })
  },

  cloneStockMixin: async (id, requestedRecordId) => {
    const spec = stockMixinSpec(id)
    if (!spec) return null
    const recordId = requestedRecordId ?? newPersonalContentId()
    const record: MixinRecord = {
      id: recordId,
      name: uniquePatternName(`${spec.name} copy`, get().userMixins.map((m) => m.name)),
      kind: spec.kind,
      src: spec.src,
      updatedAt: Date.now(),
    }
    await get().addMixin(record)
    get().openExistingMixin(record)
    return recordId
  },

  closeMixinEditor: () => {
    flushPendingAutosave()
    set({ editingMixin: null, mixinBaseline: '' })
    useEditorStore.getState().setEditorFlavor('pattern')
  },

  loadMixins: async () => {
    const mixins = await getPersonalContentProvider().listMixins()
    set({ userMixins: mixins.sort((a, b) => b.updatedAt - a.updatedAt), mixinsLoaded: true })
  },

  addMixin: async (record) => {
    await getPersonalContentProvider().createMixin(record)
    trackEntityCreated('mixin')
    set((s) => ({ userMixins: [record, ...s.userMixins] }))
  },

  renameMixin: async (id, name) => {
    const updatedAt = Date.now()
    await getPersonalContentProvider().updateMixin(id, { name, updatedAt })
    set((s) => ({
      userMixins: s.userMixins.map((m) => (m.id === id ? { ...m, name, updatedAt } : m)),
    }))
  },

  removeMixin: async (id) => {
    await getPersonalContentProvider().deleteMixin(id)
    const { editingMixin, userMixins } = get()
    set({ userMixins: userMixins.filter((m) => m.id !== id) })
    if (editingMixin?.kind === 'existing' && editingMixin.id === id) get().closeMixinEditor()
  },

  updateMixinSrc: async (id, src) => {
    const existing = get().userMixins.find((m) => m.id === id)
    if (existing?.src === src) return
    const updatedAt = Date.now()
    await getPersonalContentProvider().updateMixin(id, { src, updatedAt })
    set((s) => ({
      userMixins: s.userMixins.map((m) => (m.id === id ? { ...m, src, updatedAt } : m)),
    }))
  },
}))

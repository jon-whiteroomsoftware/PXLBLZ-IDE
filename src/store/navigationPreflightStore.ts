import { create } from 'zustand'
import type { Route } from '@/engine/routes'
import { useEditorStore, type EditorFlavor } from './editorStore'
import { useLibraryStore } from './libraryStore'
import { useMapStore } from './mapStore'
import { useMixinStore } from './mixinStore'
import { usePatternStore } from './patternStore'
import { persistPatternSourceForNavigation } from './autosaveSync'
import { validateSource } from '@/engine/validate'
import {
  __resetRouterNavigationPreflightForTests,
  setRouterNavigationPreflight,
  useRouterStore,
} from './routerStore'

export interface NavigationPreflightDraft {
  flavor: EditorFlavor
  id: string
  name: string
}

interface PendingNavigationPreflight {
  draft: NavigationPreflightDraft
}

interface BrokenDraft {
  draft: NavigationPreflightDraft
}

interface DirtyPatternDraft {
  id: string
  name: string
  source: string
}

interface NavigationPreflightState {
  pending: PendingNavigationPreflight | null
}

export const navigationPreflightInitialState = {
  pending: null as PendingNavigationPreflight | null,
}

export const useNavigationPreflightStore = create<NavigationPreflightState>()(() => ({
  ...navigationPreflightInitialState,
}))

type BufferReplacement = () => unknown

type PendingReplacement =
  | { kind: 'confirm-broken'; replacement: BufferReplacement; broken: BrokenDraft }
  | { kind: 'save-pattern'; replacement: BufferReplacement; draft: DirtyPatternDraft }

let pendingReplacement: PendingReplacement | null = null

function routeOwns(route: Route, flavor: EditorFlavor, id: string): boolean {
  if (route.kind !== 'studio') return false
  const surface = route.entity?.kind ?? 'patterns'
  const expectedSurface: Record<EditorFlavor, string> = {
    pattern: 'patterns',
    map: 'maps',
    mixin: 'mixins',
    library: 'libraries',
  }
  if (surface !== expectedSurface[flavor]) return false
  return route.entity?.id === null || route.entity?.id === undefined || route.entity.id === id
}

function activeBrokenDraft(): BrokenDraft | null {
  const editor = useEditorStore.getState()
  if (editor.isReadOnly || editor.compileStatus !== 'broken') return null
  // Personal Patterns persist exact authored text at the departure seam,
  // including broken source. Maps, Mixins, and Libraries retain the explicit
  // discard confirmation because their persisted forms carry other contracts.
  if (editor.editorFlavor === 'pattern') return null

  const route = useRouterStore.getState().route
  const owned = (
    flavor: EditorFlavor,
    id: string | null,
    record: { name: string; source: string } | undefined,
  ): BrokenDraft | null => {
    if (id === null || !record || record.source === editor.source) return null
    if (!routeOwns(route, flavor, id)) return null
    return {
      draft: { flavor, id, name: record.name },
    }
  }

  if (editor.editorFlavor === 'map') {
    const { editingMap, userMaps } = useMapStore.getState()
    const id = editingMap?.kind === 'existing' ? editingMap.id : null
    const record = userMaps.find((map) => map.id === id)
    return owned('map', id, record ? { name: record.name, source: record.source ?? '' } : undefined)
  }
  if (editor.editorFlavor === 'mixin') {
    const { editingMixin, userMixins } = useMixinStore.getState()
    const id = editingMixin?.kind === 'existing' ? editingMixin.id : null
    const record = userMixins.find((mixin) => mixin.id === id)
    return owned('mixin', id, record ? { name: record.name, source: record.src } : undefined)
  }
  if (editor.editorFlavor === 'library') {
    const { editingLibrary, userLibraries } = useLibraryStore.getState()
    const id = editingLibrary?.kind === 'existing' ? editingLibrary.id : null
    const record = userLibraries.find((library) => library.id === id)
    return owned('library', id, record ? { name: record.name, source: record.src } : undefined)
  }
  return null
}

function activeEditablePatternBuffer(): (DirtyPatternDraft & { persistedSource: string }) | null {
  const editor = useEditorStore.getState()
  if (editor.isReadOnly || editor.editorFlavor !== 'pattern') return null
  const { activePatternId, userPatterns } = usePatternStore.getState()
  if (activePatternId === null || !routeOwns(useRouterStore.getState().route, 'pattern', activePatternId)) {
    return null
  }
  const record = userPatterns.find((pattern) => pattern.id === activePatternId)
  if (!record) return null
  return {
    id: record.id,
    name: record.name,
    source: editor.source,
    persistedSource: record.src,
  }
}

function activeDirtyPatternDraft(): DirtyPatternDraft | null {
  const active = activeEditablePatternBuffer()
  if (active === null || active.source === active.persistedSource) return null
  return { id: active.id, name: active.name, source: active.source }
}

function runReplacement(replacement: BufferReplacement): void {
  const result = replacement()
  if (result instanceof Promise) {
    // The replacement interface is intentionally fire-and-forget. Operation
    // surfaces report their own errors; consume a bare rejection here so the
    // preflight itself never manufactures an unhandled Promise.
    void result.then(undefined, () => {})
  }
}

function savePatternThenReplace(pending: Extract<PendingReplacement, { kind: 'save-pattern' }>): void {
  void persistPatternSourceForNavigation(pending.draft.id, pending.draft.source).then(() => {
    if (pendingReplacement !== pending) return
    pendingReplacement = null
    const editor = useEditorStore.getState()
    const failed = editor.autosaveFailedEntity
    if (failed?.flavor === 'pattern' && failed.id === pending.draft.id) {
      editor.setAutosaveFailedEntity(null)
    }
    const active = activeEditablePatternBuffer()
    // The user authored something newer while this write was in flight, or
    // ownership changed outside the preflight seam. Keep that buffer in place;
    // a fresh navigation request will persist its latest exact source.
    if (
      active === null ||
      active.id !== pending.draft.id ||
      active.source !== pending.draft.source ||
      active.persistedSource !== pending.draft.source
    ) {
      return
    }
    // The captured buffer is now durable. If it cannot run, cover the old
    // pixels before the navigation leaves this Pattern so returning to the
    // same still-active record cannot masquerade as a working preview.
    editor.setSource(pending.draft.source)
    if (pending.draft.source === '') editor.setPreviewUnavailable('empty-source')
    else if (validateSource(pending.draft.source).length > 0) {
      editor.setPreviewUnavailable('broken-source')
    }
    runReplacement(pending.replacement)
  }, () => {
    if (pendingReplacement !== pending) return
    pendingReplacement = null
    const active = activeEditablePatternBuffer()
    if (active?.id === pending.draft.id) {
      useEditorStore.getState().setAutosaveFailedEntity({ flavor: 'pattern', id: pending.draft.id })
    }
  })
}

function currentDurableBuffer(draft: NavigationPreflightDraft): { name: string; source: string } | null {
  if (draft.flavor === 'map') {
    const record = useMapStore.getState().userMaps.find((map) => map.id === draft.id)
    return record ? { name: record.name, source: record.source ?? '' } : null
  }
  if (draft.flavor === 'mixin') {
    const record = useMixinStore.getState().userMixins.find((mixin) => mixin.id === draft.id)
    return record ? { name: record.name, source: record.src } : null
  }
  if (draft.flavor === 'library') {
    const record = useLibraryStore.getState().userLibraries.find((library) => library.id === draft.id)
    return record ? { name: record.name, source: record.src } : null
  }
  const record = usePatternStore.getState().userPatterns.find((pattern) => pattern.id === draft.id)
  return record ? { name: record.name, source: record.src } : null
}

function restoreDurableBuffer(broken: BrokenDraft): void {
  // Resolve at confirmation time: an autosave that finishes while the dialog
  // is open is newer than the snapshot that originally triggered the prompt.
  const durable = currentDurableBuffer(broken.draft)
  const editor = useEditorStore.getState()
  editor.setSource(durable?.source ?? '')
  editor.setCompileStatus('good')
  if (broken.draft.flavor === 'pattern') {
    editor.setPreviewSource(durable?.source ?? '')
    editor.setPreviewPatternName(durable?.name ?? broken.draft.name)
  }
}

/**
 * Runs a buffer-replacing transition immediately when no editable broken draft
 * is at risk. Otherwise it retains the first requested transition until the
 * app-shell confirmation resolves it.
 */
export function requestBufferReplacement(replacement: BufferReplacement): boolean {
  if (pendingReplacement !== null) return false
  const patternDraft = activeDirtyPatternDraft()
  if (patternDraft !== null) {
    const pending: PendingReplacement = {
      kind: 'save-pattern',
      replacement,
      draft: patternDraft,
    }
    pendingReplacement = pending
    savePatternThenReplace(pending)
    return false
  }
  const broken = activeBrokenDraft()
  if (broken === null) {
    runReplacement(replacement)
    return true
  }
  pendingReplacement = { kind: 'confirm-broken', replacement, broken }
  useNavigationPreflightStore.setState({ pending: { draft: broken.draft } })
  return false
}

export function installNavigationPreflight(): () => void {
  return setRouterNavigationPreflight(requestBufferReplacement)
}

export function cancelNavigationPreflight(): void {
  pendingReplacement = null
  useNavigationPreflightStore.setState({ pending: null })
}

export function continueNavigationPreflight(): void {
  const pending = pendingReplacement
  if (pending === null || pending.kind !== 'confirm-broken') return
  pendingReplacement = null
  useNavigationPreflightStore.setState({ pending: null })
  // Confirmation means the broken draft is gone before any synchronous or
  // asynchronous continuation begins. Nested route work is then naturally
  // safe and no global approval leaks across an awaited operation.
  restoreDurableBuffer(pending.broken)
  runReplacement(pending.replacement)
}

export function __resetNavigationPreflightForTests(): void {
  pendingReplacement = null
  __resetRouterNavigationPreflightForTests()
  useNavigationPreflightStore.setState(navigationPreflightInitialState)
}

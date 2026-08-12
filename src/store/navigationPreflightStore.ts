import { create } from 'zustand'
import type { Route } from '@/engine/routes'
import { useEditorStore, type EditorFlavor } from './editorStore'
import { useLibraryStore } from './libraryStore'
import { useMapStore } from './mapStore'
import { useMixinStore } from './mixinStore'
import { usePatternStore } from './patternStore'
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
  durableSource: string
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

let pendingReplacement: { replacement: BufferReplacement; broken: BrokenDraft } | null = null

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
      durableSource: record.source,
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
  const { activePatternId, userPatterns } = usePatternStore.getState()
  const record = userPatterns.find((pattern) => pattern.id === activePatternId)
  return owned(
    'pattern',
    activePatternId,
    record ? { name: record.name, source: record.src } : undefined,
  )
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

function restoreDurableBuffer(broken: BrokenDraft): void {
  const editor = useEditorStore.getState()
  editor.setSource(broken.durableSource)
  editor.setCompileStatus('good')
  if (broken.draft.flavor === 'pattern') {
    editor.setPreviewSource(broken.durableSource)
    editor.setPreviewPatternName(broken.draft.name)
  }
}

/**
 * Runs a buffer-replacing transition immediately when no editable broken draft
 * is at risk. Otherwise it retains the first requested transition until the
 * app-shell confirmation resolves it.
 */
export function requestBufferReplacement(replacement: BufferReplacement): boolean {
  if (pendingReplacement !== null) return false
  const broken = activeBrokenDraft()
  if (broken === null) {
    runReplacement(replacement)
    return true
  }
  pendingReplacement = { replacement, broken }
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
  if (pending === null) return
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

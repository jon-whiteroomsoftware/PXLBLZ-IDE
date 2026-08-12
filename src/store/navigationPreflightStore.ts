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

let pendingReplacement: BufferReplacement | null = null
let approvedDepth = 0

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

function activeBrokenDraft(): NavigationPreflightDraft | null {
  const editor = useEditorStore.getState()
  if (editor.isReadOnly || editor.compileStatus !== 'broken') return null

  const route = useRouterStore.getState().route
  const owned = (
    flavor: EditorFlavor,
    id: string | null,
    record: { name: string; source: string } | undefined,
  ): NavigationPreflightDraft | null => {
    if (id === null || !record || record.source === editor.source) return null
    if (!routeOwns(route, flavor, id)) return null
    return { flavor, id, name: record.name }
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

function runApproved(replacement: BufferReplacement): void {
  approvedDepth += 1
  let result: unknown
  try {
    result = replacement()
  } catch (error) {
    approvedDepth = Math.max(0, approvedDepth - 1)
    throw error
  }
  if (result instanceof Promise) {
    const finish = () => {
      approvedDepth = Math.max(0, approvedDepth - 1)
    }
    // The replacement interface is intentionally fire-and-forget. Attach both
    // branches so a failed operation restores the guard without manufacturing
    // an unhandled rejection from Promise.prototype.finally().
    void result.then(finish, finish)
  } else {
    approvedDepth = Math.max(0, approvedDepth - 1)
  }
}

/**
 * Runs a buffer-replacing transition immediately when no editable broken draft
 * is at risk. Otherwise it retains the first requested transition until the
 * app-shell confirmation resolves it.
 */
export function requestBufferReplacement(replacement: BufferReplacement): void {
  if (approvedDepth > 0) {
    runApproved(replacement)
    return
  }
  if (pendingReplacement !== null) return
  const draft = activeBrokenDraft()
  if (draft === null) {
    runApproved(replacement)
    return
  }
  pendingReplacement = replacement
  useNavigationPreflightStore.setState({ pending: { draft } })
}

export function installNavigationPreflight(): () => void {
  return setRouterNavigationPreflight(requestBufferReplacement)
}

export function cancelNavigationPreflight(): void {
  pendingReplacement = null
  useNavigationPreflightStore.setState({ pending: null })
}

export function continueNavigationPreflight(): void {
  const replacement = pendingReplacement
  if (replacement === null) return
  pendingReplacement = null
  useNavigationPreflightStore.setState({ pending: null })
  runApproved(replacement)
}

export function __resetNavigationPreflightForTests(): void {
  pendingReplacement = null
  approvedDepth = 0
  __resetRouterNavigationPreflightForTests()
  useNavigationPreflightStore.setState(navigationPreflightInitialState)
}

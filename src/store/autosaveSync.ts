// The shared autosave pass behind the code editors (#810).
//
// The Editor's persistence tick calls flushPendingAutosave every SYNC_TICK_MS;
// the buffer-replacing seams (pattern/demo/library activation, entering or
// leaving map/mixin/library mode, Editor unmount) call it directly so up to one
// tick's worth of typing is not dropped on navigation. Every write — tick and
// seam — runs through a per-record chain, so two saves for one record can
// never land out of order and the newest content always wins.
//
// Outcomes: Pattern buffer-replacing navigation first uses the explicit #818
// departure seam below, so broken/empty authored text either lands before the
// transition or remains open on failure. The legacy flush failure paths still
// report a live-buffer failure on the glyph or a post-replacement loss notice;
// they remain relevant to direct store seams and the other editor flavors.

import { useEditorStore, type EditorFlavor } from './editorStore'
import { useRouterStore } from './routerStore'
import { usePatternStore } from './patternStore'
import { useMapStore, DEFAULT_MAP_BAKE_COUNT } from './mapStore'
import { useMixinStore } from './mixinStore'
import { useLibraryStore } from './libraryStore'
import { deriveStuckSaveStatus, type StuckSaveStatus } from '@/engine/saveStatus'

// Identity of the newest scheduled write. Several seams can flush during one
// navigation (close editor, then activate the next record); deduping on
// flavor + record + source skips the identical repeat writes while the first
// is pending, without conflating different records that share source text.
let pendingKey: string | null = null

// One write chain per record: a later save for the same record starts only
// after the earlier one settles, so a slow older write can never land on top
// of a newer one, durably or locally.
const writeChains = new Map<string, Promise<void>>()

// Test-only: clears in-flight bookkeeping so one test's unsettled write
// cannot queue-block another test's chains.
export function __resetAutosaveSyncForTests(): void {
  pendingKey = null
  writeChains.clear()
}

function chainWrite(chainKey: string, run: () => Promise<void>): Promise<void> {
  const previous = writeChains.get(chainKey) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(run)
  writeChains.set(chainKey, next)
  const prune = () => {
    if (writeChains.get(chainKey) === next) writeChains.delete(chainKey)
  }
  next.then(prune, prune)
  return next
}

/**
 * Persists the exact personal Pattern buffer captured by a buffer-replacing
 * navigation. Unlike the periodic autosave pass, this seam deliberately
 * accepts broken and empty authored source. It shares the Pattern's ordinary
 * write chain so an in-flight clean autosave can never land out of order.
 */
export function persistPatternSourceForNavigation(id: string, source: string): Promise<void> {
  return chainWrite(`pattern ${id}`, async () => {
    const pattern = usePatternStore.getState().userPatterns.find((record) => record.id === id)
    if (!pattern) throw new Error('Pattern no longer exists')
    await usePatternStore.getState().updatePatternSrc(id, source)
  })
}

export function flushPendingAutosave(): void {
  const { source, compileStatus, editorFlavor, isReadOnly } = useEditorStore.getState()
  if (isReadOnly || compileStatus !== 'good' || source === '') return
  const attempt = autosaveAttempt(editorFlavor, source)
  if (!attempt) return
  const key = `${editorFlavor} ${attempt.id} ${source}`
  if (pendingKey === key) return
  pendingKey = key
  // The base this write lands on, read when the chained write actually
  // starts: a queued write re-bases on whatever the previous write landed.
  let baseSrcAtRun: string | null = null
  const settle = (failed: boolean) => {
    if (pendingKey === key) pendingKey = null
    const editor = useEditorStore.getState()
    const record = attempt.record()
    const entityActive = activeDurableEntity()?.id === attempt.id
      && editor.editorFlavor === editorFlavor
    const failedEntityMatches = editor.autosaveFailedEntity?.flavor === editorFlavor
      && editor.autosaveFailedEntity.id === attempt.id
    if (!failed) {
      if (failedEntityMatches) editor.setAutosaveFailedEntity(null)
      if (entityActive && baseSrcAtRun !== null && source !== baseSrcAtRun
        && editor.source === baseSrcAtRun && !editor.bufferEdited) {
        // The record was reopened while this save was pending, so the buffer
        // reloaded the stale pre-save content and the user has not touched it:
        // refresh it to the saved draft so the next tick cannot write the
        // stale content back over the successful save. A buffer the user has
        // typed into — including deliberately restoring the old content — is
        // never touched; their visible intent wins.
        editor.setSource(source)
        editor.setPreviewSource(source)
      }
      return
    }
    if (!record || baseSrcAtRun === null || record.src !== baseSrcAtRun) {
      // The record's source advanced while this write was in flight (a newer
      // save landed) or the record was deleted: the newer durable content
      // supersedes this write, so there is nothing to report.
      return
    }
    if (entityActive && editor.source !== record.src) {
      // The editor still holds this draft — or newer edits of the same
      // record that supersede it. Either way the glyph reports the failure
      // and the next tick retries from the live buffer.
      editor.setAutosaveFailedEntity({ flavor: editorFlavor, id: attempt.id })
      return
    }
    // The buffer moved on (or was reopened clean), so this edit is gone:
    // report the loss instead of failing silently (#810).
    editor.setNavigationSaveLosses([
      ...editor.navigationSaveLosses.filter(
        (loss) => !(loss.flavor === editorFlavor && loss.id === attempt.id),
      ),
      { flavor: editorFlavor, id: attempt.id, name: record.name },
    ])
  }
  chainWrite(`${editorFlavor} ${attempt.id}`, () => {
    const recordAtRun = attempt.record()
    // Deleted while queued: nothing to write.
    if (!recordAtRun) return Promise.resolve()
    baseSrcAtRun = recordAtRun.src
    return attempt.run()
  }).then(() => settle(false), () => settle(true))
}

export function dismissNavigationSaveLoss(flavor: EditorFlavor, id: string): void {
  const editor = useEditorStore.getState()
  editor.setNavigationSaveLosses(
    editor.navigationSaveLosses.filter(
      (loss) => !(loss.flavor === flavor && loss.id === id),
    ),
  )
}

// The center surface that would actually show this flavor's editor. Stale
// selection state (an activePatternId survives navigating to a Show,
// Controller, or Docs surface) must not count as ownership: nothing there
// renders the glyph, so a failure has to become a loss notice instead.
const EDITOR_SURFACE_FOR_FLAVOR: Record<EditorFlavor, string> = {
  pattern: 'patterns',
  map: 'maps',
  mixin: 'mixins',
  library: 'libraries',
}

// The durable entity the editor buffer belongs to right now, or null.
function activeDurableEntity(): { id: string } | null {
  const { editorFlavor, isReadOnly } = useEditorStore.getState()
  if (isReadOnly) return null
  const { route } = useRouterStore.getState()
  if (route.kind !== 'studio') return null
  const surface = route.entity?.kind ?? 'patterns'
  if (surface !== EDITOR_SURFACE_FOR_FLAVOR[editorFlavor]) return null
  // A concrete route id must also match the selected record: a missing-id
  // route renders a not-found message on the same surface, where neither the
  // glyph nor the editor exists to own the buffer.
  const routeEntityId = route.entity?.id ?? null
  const owned = (id: string | null): { id: string } | null => {
    if (id === null) return null
    if (routeEntityId !== null && routeEntityId !== id) return null
    return { id }
  }
  if (editorFlavor === 'map') {
    const { editingMap } = useMapStore.getState()
    return owned(editingMap?.kind === 'existing' ? editingMap.id : null)
  }
  if (editorFlavor === 'mixin') {
    const { editingMixin } = useMixinStore.getState()
    return owned(editingMixin?.kind === 'existing' ? editingMixin.id : null)
  }
  if (editorFlavor === 'library') {
    const { editingLibrary } = useLibraryStore.getState()
    return owned(editingLibrary?.kind === 'existing' ? editingLibrary.id : null)
  }
  const { activePatternId } = usePatternStore.getState()
  return owned(activePatternId)
}

interface AutosaveAttempt {
  id: string
  run: () => Promise<void>
  /** Current name/src of the target record, read at run and settle time. */
  record: () => { name: string; src: string } | undefined
}

// The write for the open buffer, or null when nothing durable is open. The
// existence guards matter on the close-editor seams: closing an editor as part
// of deleting its record must not re-create the record through a final flush.
function autosaveAttempt(flavor: EditorFlavor, source: string): AutosaveAttempt | null {
  if (flavor === 'map') {
    const { editingMap, userMaps, activePixelCount } = useMapStore.getState()
    if (editingMap?.kind !== 'existing') return null
    const id = editingMap.id
    if (!userMaps.some((m) => m.id === id)) return null
    const bakeCount = activePixelCount ?? DEFAULT_MAP_BAKE_COUNT
    return {
      id,
      run: () => {
        // bakeEditingMap reads the live editor buffer, so it is only valid
        // while this map still owns the buffer AND the buffer still holds the
        // captured source — a queued write must not persist whatever the user
        // typed since (possibly broken) source. Otherwise persist the
        // captured draft directly at the captured count.
        const { editingMap: current } = useMapStore.getState()
        const editor = useEditorStore.getState()
        const liveMatches = current?.kind === 'existing' && current.id === id
          && editor.editorFlavor === 'map' && editor.source === source
        return liveMatches
          ? useMapStore.getState().bakeEditingMap()
          : useMapStore.getState().persistMapSource(id, source, bakeCount)
      },
      record: () => {
        const record = useMapStore.getState().userMaps.find((m) => m.id === id)
        return record ? { name: record.name, src: record.source ?? '' } : undefined
      },
    }
  }
  if (flavor === 'mixin') {
    const { editingMixin, userMixins, updateMixinSrc } = useMixinStore.getState()
    if (editingMixin?.kind !== 'existing') return null
    const id = editingMixin.id
    if (!userMixins.some((m) => m.id === id)) return null
    return {
      id,
      run: () => updateMixinSrc(id, source),
      record: () => useMixinStore.getState().userMixins.find((m) => m.id === id),
    }
  }
  if (flavor === 'library') {
    const { editingLibrary, userLibraries, updateLibrarySrc } = useLibraryStore.getState()
    if (editingLibrary?.kind !== 'existing') return null
    const id = editingLibrary.id
    if (!userLibraries.some((library) => library.id === id)) return null
    return {
      id,
      run: () => updateLibrarySrc(id, source),
      record: () => useLibraryStore.getState().userLibraries.find((library) => library.id === id),
    }
  }
  const { activePatternId, userPatterns, updatePatternSrc } = usePatternStore.getState()
  if (activePatternId === null) return null
  const id = activePatternId
  if (!userPatterns.some((p) => p.id === id)) return null
  return {
    id,
    run: () => updatePatternSrc(id, source),
    record: () => usePatternStore.getState().userPatterns.find((p) => p.id === id),
  }
}

// The persisted counterpart of the open buffer, or null when the editor holds
// nothing durably saved under the user's account (demo, stock, read-only).
export function activePersistedSource(): { source: string; updatedAt: number } | null {
  const { editorFlavor, isReadOnly } = useEditorStore.getState()
  if (isReadOnly) return null
  if (editorFlavor === 'map') {
    const { editingMap, userMaps } = useMapStore.getState()
    if (editingMap?.kind !== 'existing') return null
    const record = userMaps.find((m) => m.id === editingMap.id)
    return typeof record?.source === 'string'
      ? { source: record.source, updatedAt: record.updatedAt }
      : null
  }
  if (editorFlavor === 'mixin') {
    const { editingMixin, userMixins } = useMixinStore.getState()
    if (editingMixin?.kind !== 'existing') return null
    const record = userMixins.find((m) => m.id === editingMixin.id)
    return record ? { source: record.src, updatedAt: record.updatedAt } : null
  }
  if (editorFlavor === 'library') {
    const { editingLibrary, userLibraries } = useLibraryStore.getState()
    if (editingLibrary?.kind !== 'existing') return null
    const record = userLibraries.find((library) => library.id === editingLibrary.id)
    return record ? { source: record.src, updatedAt: record.updatedAt } : null
  }
  const { activePatternId, userPatterns } = usePatternStore.getState()
  if (activePatternId === null) return null
  const record = userPatterns.find((p) => p.id === activePatternId)
  return record ? { source: record.src, updatedAt: record.updatedAt } : null
}

// Imperative read of the glyph state, shared by the SaveStatusBadge render and
// the beforeunload guard. Null means silent — saved, or a clean dirty buffer
// the next tick will save. A recorded failure counts only while its entity
// still owns the buffer, so it never leaks onto the next record.
export function activeStuckSaveStatus():
  | { status: StuckSaveStatus; lastSavedAt: number | null }
  | null {
  const { source, compileStatus, autosaveFailedEntity, editorFlavor } = useEditorStore.getState()
  const persisted = activePersistedSource()
  const autosaveFailed = autosaveFailedEntity !== null
    && autosaveFailedEntity.flavor === editorFlavor
    && autosaveFailedEntity.id === (activeDurableEntity()?.id ?? null)
  const status = deriveStuckSaveStatus({
    buffer: source,
    persisted: persisted?.source ?? null,
    compileBroken: compileStatus === 'broken',
    autosaveFailed,
  })
  return status === null ? null : { status, lastSavedAt: persisted?.updatedAt ?? null }
}

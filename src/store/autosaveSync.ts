// The shared autosave pass behind the code editors (#810).
//
// The Editor's persistence tick calls flushPendingAutosave every SYNC_TICK_MS;
// the buffer-replacing seams (pattern/demo/library activation, entering or
// leaving map/mixin/library mode, Editor unmount) call it directly so up to one
// tick's worth of typing is not dropped on navigation. Every write — tick,
// seam, and Retry — runs through a per-record chain, so two saves for one
// record can never land out of order and the newest draft always wins.
//
// Outcomes: a failure while the buffer still holds the draft records the
// entity in editorStore.autosaveFailedEntity (the glyph; the next tick
// retries), while a failure after the buffer moved on holds the draft in
// editorStore.navigationSaveFailures for the Studio notice's Retry — that
// held entry is the only remaining copy of the draft. Supersession is judged
// by record *source* captured when the chained write actually starts (queued
// writes re-base on whatever the previous write landed), never by updatedAt:
// metadata writes such as renames must not discard a draft.

import { useEditorStore, type EditorFlavor, type NavigationSaveDraft } from './editorStore'
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
      // Drop a held draft for this record only when this save carried it, or
      // when the record's source moved past the draft's base (a newer edit
      // landed). A no-op save of unchanged source proves nothing about the
      // draft and must not discard it.
      const held = heldDraft(editorFlavor, attempt.id)
      if (held && (!record || held.source === source || record.src !== held.baseSrc)) {
        dropHeldDraft(editorFlavor, attempt.id)
      }
      if (failedEntityMatches) editor.setAutosaveFailedEntity(null)
      if (entityActive && baseSrcAtRun !== null && source !== baseSrcAtRun
        && editor.source === baseSrcAtRun) {
        // The record was reopened while this save was pending: the buffer
        // shows the stale pre-save content this write just replaced. Refresh
        // it to the saved draft so the next tick cannot write the stale
        // buffer back over the successful save.
        editor.setSource(source)
      }
      return
    }
    if (!record || baseSrcAtRun === null || record.src !== baseSrcAtRun) {
      // The record's source advanced while this write was in flight (a newer
      // save landed) or the record was deleted: the newer durable content
      // supersedes this draft.
      return
    }
    if (entityActive && editor.source !== record.src) {
      // The editor still holds this draft — or newer edits of the same
      // record that supersede it. Either way the glyph reports the failure
      // and the next tick retries from the live buffer.
      editor.setAutosaveFailedEntity({ flavor: editorFlavor, id: attempt.id })
      return
    }
    // The draft survives nowhere else: the buffer moved to another record, or
    // the record was reopened clean from its stale persisted source. Hold the
    // draft for the Studio notice's Retry (#810).
    holdDraft({
      flavor: editorFlavor,
      id: attempt.id,
      name: record.name,
      source,
      baseSrc: baseSrcAtRun,
      ...(attempt.mapBakeCount !== undefined ? { mapBakeCount: attempt.mapBakeCount } : {}),
    })
  }
  chainWrite(`${editorFlavor} ${attempt.id}`, () => {
    const recordAtRun = attempt.record()
    // Deleted while queued: nothing to write, and settling as success lets
    // the held-draft bookkeeping clean itself up.
    if (!recordAtRun) return Promise.resolve()
    baseSrcAtRun = recordAtRun.src
    return attempt.run()
  }).then(() => settle(false), () => settle(true))
}

// Re-attempts a held navigation draft against its record, through the same
// per-record chain as the autosave writes. The held draft and its
// supersession are revalidated when the chained write actually executes — a
// newer save already in flight lands first, and a newer failed draft that
// replaced the held entry while this Retry queued is what gets written. The
// record list is refreshed from durable storage before validating, so a
// newer save from another tab supersedes the draft instead of being
// overwritten; cross-client races beyond that read remain #802 territory
// (server-side versioning), matching the Show retry (#792). A still-failing
// write keeps the notice up.
export async function retryNavigationSaveFailure(flavor: EditorFlavor, id: string): Promise<void> {
  if (!heldDraft(flavor, id)) return
  let handled: NavigationSaveDraft | null = null
  try {
    await chainWrite(`${flavor} ${id}`, async () => {
      const current = heldDraft(flavor, id)
      if (!current) return
      // Offline the refresh fails quietly — the write itself fails anyway.
      await refreshRecords(flavor).catch(() => {})
      handled = current
      const write = navigationSaveWrite(current)
      // Superseded (or deleted) by the time this write ran: drop, not write.
      if (!write) return
      await write()
    })
    // Drop only the entry this Retry actually handled; a draft held anew
    // while the write settled stays up.
    if (handled !== null && heldDraft(flavor, id) === handled) dropHeldDraft(flavor, id)
  } catch {
    // Keep the notice; the draft is still held.
  }
}

function refreshRecords(flavor: EditorFlavor): Promise<void> {
  if (flavor === 'map') return useMapStore.getState().loadMaps()
  if (flavor === 'mixin') return useMixinStore.getState().loadMixins()
  if (flavor === 'library') return useLibraryStore.getState().loadLibraries()
  return usePatternStore.getState().loadPatterns()
}

export function dismissNavigationSaveFailure(flavor: EditorFlavor, id: string): void {
  dropHeldDraft(flavor, id)
}

function heldDraft(flavor: EditorFlavor, id: string): NavigationSaveDraft | undefined {
  return useEditorStore.getState().navigationSaveFailures
    .find((draft) => draft.flavor === flavor && draft.id === id)
}

function holdDraft(draft: NavigationSaveDraft): void {
  const editor = useEditorStore.getState()
  editor.setNavigationSaveFailures([
    ...editor.navigationSaveFailures.filter(
      (held) => !(held.flavor === draft.flavor && held.id === draft.id),
    ),
    draft,
  ])
}

function dropHeldDraft(flavor: EditorFlavor, id: string): void {
  const editor = useEditorStore.getState()
  const remaining = editor.navigationSaveFailures.filter(
    (held) => !(held.flavor === flavor && held.id === id),
  )
  if (remaining.length !== editor.navigationSaveFailures.length) {
    editor.setNavigationSaveFailures(remaining)
  }
}

function navigationSaveWrite(failure: NavigationSaveDraft): (() => Promise<void>) | null {
  const { flavor, id, source, baseSrc } = failure
  if (flavor === 'map') {
    const { userMaps, persistMapSource } = useMapStore.getState()
    const record = userMaps.find((m) => m.id === id)
    if (!record || (record.source ?? '') !== baseSrc) return null
    return () => persistMapSource(id, source, failure.mapBakeCount ?? DEFAULT_MAP_BAKE_COUNT)
  }
  if (flavor === 'mixin') {
    const { userMixins, updateMixinSrc } = useMixinStore.getState()
    const record = userMixins.find((m) => m.id === id)
    if (!record || record.src !== baseSrc) return null
    return () => updateMixinSrc(id, source)
  }
  if (flavor === 'library') {
    const { userLibraries, updateLibrarySrc } = useLibraryStore.getState()
    const record = userLibraries.find((library) => library.id === id)
    if (!record || record.src !== baseSrc) return null
    return () => updateLibrarySrc(id, source)
  }
  const { userPatterns, updatePatternSrc } = usePatternStore.getState()
  const record = userPatterns.find((p) => p.id === id)
  if (!record || record.src !== baseSrc) return null
  return () => updatePatternSrc(id, source)
}

// The durable entity the editor buffer belongs to right now, or null.
function activeDurableEntity(): { id: string } | null {
  const { editorFlavor, isReadOnly } = useEditorStore.getState()
  if (isReadOnly) return null
  if (editorFlavor === 'map') {
    const { editingMap } = useMapStore.getState()
    return editingMap?.kind === 'existing' ? { id: editingMap.id } : null
  }
  if (editorFlavor === 'mixin') {
    const { editingMixin } = useMixinStore.getState()
    return editingMixin?.kind === 'existing' ? { id: editingMixin.id } : null
  }
  if (editorFlavor === 'library') {
    const { editingLibrary } = useLibraryStore.getState()
    return editingLibrary?.kind === 'existing' ? { id: editingLibrary.id } : null
  }
  const { activePatternId } = usePatternStore.getState()
  return activePatternId === null ? null : { id: activePatternId }
}

interface AutosaveAttempt {
  id: string
  /** For map attempts: the bake count in effect when the attempt was created,
   * so a late or retried persist bakes the geometry the author saw. */
  mapBakeCount?: number
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
      mapBakeCount: bakeCount,
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

import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import {
  addShowRoutingLayout,
  addShowScene,
  addShowZone,
  createShowWithOutputContract,
  cloneShowCellAfter,
  duplicateShowScene,
  extendShowCell,
  importedStageMapIdForController,
  moveShowCellToSlot,
  normalizeShowEntryState,
  normalizeShowTransitionState,
  placeShowClip,
  removeShowClip,
  removeShowScene,
  removeShowRoutingLayout,
  removeShowZone,
  spanShowCellZones,
  splitShowAtTime,
  removeShowBoundaryTransition,
  updateShowCellZoneMode,
  updateShowBoundaryTransition,
  updateShowZone,
  updateShowCellAdaptations,
  updateShowCellEffects,
  updateShowCellControlTarget,
  updateShowCellPattern,
  updateShowCellRestartOnEntry,
  updateShowScene,
  updateShowRoutingLayout,
  updateShowRoutingSwitch,
  updateShowTransition,
  showCellAtSlot,
  forfeitShowExecutionModelOnCastChange,
  reconcileShowExecutionModelOnCastReturn,
} from '@/engine/showModel'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import type {
  ShowCell,
  ShowCellAdaptations,
  ShowClipEffect,
  ShowBoundaryTransition,
  ShowRecord,
  ShowOutputContract,
  ShowPortalSettings,
  ShowRoutingLayout,
  ShowScene,
  ShowTransitionKind,
  ShowZone,
} from '@/engine/personalContentRecords'
import { type ControllerProfile } from '@/engine/controllerProfile'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { uniquePatternName } from '@/engine/patternName'
import { useMapStore } from '@/store/mapStore'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { normalizeShowComposition } from '@/engine/showCompositionModel'
import { stockShowById } from '@/pixelblaze/stock/shows'

const showPersistenceQueues = new Map<string, Promise<void>>()
// The in-flight loadShows, so record creation can wait for hydration to
// apply instead of racing a stale list snapshot (#794).
let showsHydration: Promise<void> | null = null
// The last record each Show is known to hold durably, paired with the undo
// history that belongs to it (#792): rollback after a failed write restores
// this pair, never an unpersisted optimistic intermediate or a history that
// could replay one.
const lastPersistedShowRecords = new Map<string, { record: ShowRecord; history: ShowHistory }>()

// Advance the durable baseline for a completed write, but never past a newer
// record another client persisted while this response was in flight (#792).
// An equal timestamp means loadShows observed this same write and reset its
// history; the just-persisted record with its richer history wins.
//
// Ordering rests on client-stamped updatedAt because the API has no
// server-side revision (#802): within one client timestamps are monotonic and
// this is exact; across clients with skewed clocks a completed write can be
// mis-ordered. Single-client offline recovery - the #792 scope - is unaffected.
function advanceDurableBaseline(id: string, record: ShowRecord, history: ShowHistory): void {
  const baseline = lastPersistedShowRecords.get(id)
  if (!baseline || baseline.record.updatedAt <= record.updatedAt) {
    lastPersistedShowRecords.set(id, { record, history })
  }
}

interface ShowState {
  shows: ShowRecord[]
  showsLoaded: boolean
  activeShowId: string | null
  showCreation: { previousShowId: string | null } | null
  showHistories: Record<string, ShowHistory>
  stockShowDrafts: Record<string, ShowRecord>
  // The most recent persistence write that failed and rolled back (#792).
  // Holds the rejected record so the notice can offer a retry.
  showSaveFailure: { showId: string; record: ShowRecord } | null
  loadShows: () => Promise<void>
  createNewShow: (input: { name?: string; outputContract: ShowOutputContract }) => Promise<ShowRecord>
  createShowFromController: (profile: ControllerProfile) => Promise<ShowRecord>
  beginShowCreation: () => void
  cancelShowCreation: () => void
  openShow: (id: string | null) => Promise<void>
  addShow: (record: ShowRecord) => Promise<void>
  addImportedShow: (record: ShowRecord) => Promise<void>
  renameShow: (id: string, name: string) => Promise<void>
  removeShow: (id: string) => Promise<void>
  /**
   * Persists a copy of a personal Show or of a built-in's current session
   * draft under a fresh identity (#794). Callers displaying a transient
   * projection (built-in Pattern-slot selections) pass it as sourceRecord so
   * the copy keeps what the user sees. Resolves null when the source is
   * unknown or the create fails.
   */
  duplicateShow: (sourceId: string, sourceRecord?: ShowRecord) => Promise<ShowRecord | null>
  updateShow: (id: string, next: ShowRecord) => Promise<void>
  // Resolves the record an edit operation should start from: a personal
  // record, an in-memory built-in draft, or the pristine built-in fixture.
  resolveEditableShow: (id: string) => ShowRecord | undefined
  resetStockShowDraft: (id: string) => void
  updateStageMap: (showId: string, stageMapId: string | null) => Promise<void>
  addScene: (showId: string) => Promise<void>
  duplicateScene: (showId: string, sceneId: string) => Promise<void>
  cloneClip: (showId: string, cellId: string) => Promise<ShowCell | null>
  moveClip: (showId: string, cellId: string, zoneId: string, sceneId: string) => Promise<boolean>
  removeScene: (showId: string, sceneId: string) => Promise<void>
  updateScene: (showId: string, sceneId: string, changes: Partial<Omit<ShowScene, 'id'>>) => Promise<void>
  updateTransition: (
    showId: string,
    sceneId: string,
    kind: ShowTransitionKind,
    durationMs: number,
    feather?: number,
    portal?: Partial<ShowPortalSettings>,
  ) => Promise<void>
  removeClip: (showId: string, clipId: string) => Promise<void>
  placeClip: (
    showId: string,
    zoneId: string,
    sceneId: string,
    patch: Pick<ShowCell, 'pattern' | 'patternName'>,
  ) => Promise<ShowCell | null>
  updateCellAdaptations: (
    showId: string,
    cellId: string,
    changes: Partial<ShowCellAdaptations>,
  ) => Promise<void>
  updateCellEffects: (showId: string, cellId: string, effects: ShowClipEffect[]) => Promise<void>
  updateCellPattern: (
    showId: string,
    cellId: string,
    patch: Pick<ShowCell, 'pattern' | 'patternName'>,
  ) => Promise<void>
  updateCellControlTarget: (showId: string, cellId: string, exportName: string, value: number | undefined) => Promise<void>
  updateCellRestartOnEntry: (showId: string, cellId: string, restartOnEntry: boolean) => Promise<void>
  updateBoundaryTransition: (
    showId: string,
    transitionId: string,
    changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>,
  ) => Promise<void>
  removeBoundaryTransition: (showId: string, transitionId: string) => Promise<void>
  splitAtTime: (showId: string, atMs: number) => Promise<void>
  extendCell: (showId: string, cellId: string, sceneSpan: number) => Promise<void>
  spanCellZones: (showId: string, cellId: string, zoneSpan: number) => Promise<void>
  updateCellZoneMode: (showId: string, cellId: string, zoneMode: NonNullable<ShowCell['zoneMode']>) => Promise<void>
  addZone: (showId: string) => Promise<void>
  updateZone: (showId: string, zoneId: string, changes: Partial<Omit<ShowZone, 'id'>>) => Promise<void>
  removeZone: (showId: string, zoneId: string) => Promise<void>
  /** Resolves with the new Zone Layout's id so callers can select what they just defined. */
  addRoutingLayout: (showId: string, sourceLayoutId?: string) => Promise<string | null>
  updateRoutingLayout: (showId: string, layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => Promise<void>
  removeRoutingLayout: (showId: string, layoutId: string) => Promise<void>
  updateRoutingSwitch: (showId: string, afterSceneId: string, layoutId: string | null) => Promise<void>
  undoShow: (showId: string) => Promise<boolean>
  redoShow: (showId: string) => Promise<boolean>
  dismissShowSaveFailure: () => void
  /** Re-applies the rolled-back record; a still-failing write keeps the notice without rejecting. */
  retryShowSaveFailure: () => Promise<void>
}

export interface ShowHistory {
  past: ShowRecord[]
  future: ShowRecord[]
}

export type { ShowRecord }

export const showInitialState = {
  shows: [] as ShowRecord[],
  showsLoaded: false,
  activeShowId: null as string | null,
  showCreation: null as { previousShowId: string | null } | null,
  showHistories: {} as Record<string, ShowHistory>,
  // Session-only working copies of built-in Shows. Never persisted: a reload
  // resets every built-in to its pristine catalogue definition.
  stockShowDrafts: {} as Record<string, ShowRecord>,
  showSaveFailure: null as { showId: string; record: ShowRecord } | null,
}

// Convenience mutators resolve quietly when persistence fails (#792): the
// rollback plus showSaveFailure already report the failure, and their UI
// callers discard the promise or gate on a returned value. Only the
// updateShow primitive keeps rejecting, for callers that await it directly.
async function updateShowQuietly(
  updateShow: (id: string, next: ShowRecord) => Promise<void>,
  id: string,
  next: ShowRecord,
): Promise<boolean> {
  try {
    await updateShow(id, next)
    return true
  } catch {
    return false
  }
}

export const useShowStore = create<ShowState>()((set, get) => ({
  ...showInitialState,

  loadShows: async () => {
    const hydration = (async () => {
    const shows = (await getPersonalContentProvider().listShows())
      .map(normalizeShowRecord)
    // Mid-session re-hydration (Gallery -> Studio remount) must not discard
    // history that still matches the durable record; only records the server
    // reports as changed reset their histories (#792).
    const staleHistoryIds = new Set<string>()
    const nextBaselines: Array<[string, { record: ShowRecord; history: ShowHistory }]> = shows.map((show) => {
      const existing = lastPersistedShowRecords.get(show.id)
      if (existing && existing.record.updatedAt === show.updatedAt) {
        return [show.id, { record: show, history: existing.history }]
      }
      staleHistoryIds.add(show.id)
      return [show.id, { record: show, history: { past: [], future: [] } }]
    })
    lastPersistedShowRecords.clear()
    for (const [id, baseline] of nextBaselines) lastPersistedShowRecords.set(id, baseline)
    set((state) => ({
      shows: shows.sort((a, b) => b.updatedAt - a.updatedAt),
      showsLoaded: true,
      showHistories: Object.fromEntries(
        Object.entries(state.showHistories).filter(([id]) => !staleHistoryIds.has(id)),
      ),
    }))
    })()
    showsHydration = hydration
    try {
      await hydration
    } finally {
      if (showsHydration === hydration) showsHydration = null
    }
  },

  createNewShow: async (input) => {
    const id = newPersonalContentId()
    const name = uniquePatternName(input?.name?.trim() || 'Untitled Show', get().shows.map((show) => show.name))
    const show = createShowWithOutputContract(id, name, input.outputContract)
    await get().addShow(show)
    return show
  },

  createShowFromController: async (profile) => {
    const id = newPersonalContentId()
    const name = uniquePatternName(`${profile.name} Show`, get().shows.map((show) => show.name))
    const stageMapId = importedStageMapIdForController(profile, useMapStore.getState().userMaps)
    const pixelCount = profile.lastKnownPixelCount ?? 60
    // The single seeded zone and its Default layout must cover the contract's
    // complete output, so the Show compiles without manual range repair (#775
    // review P2). createShowWithOutputContract sizes both from the contract.
    const show = {
      ...createShowWithOutputContract(
        id,
        name,
        createInstallationShowOutputContract({ outputMapId: stageMapId, pixelCount }),
      ),
      targetControllerProfileId: profile.id,
    }
    await get().addShow(show)
    return show
  },

  beginShowCreation: () => {
    if (get().showCreation) return
    set({ showCreation: { previousShowId: get().activeShowId } })
  },

  cancelShowCreation: () => {
    const creation = get().showCreation
    if (!creation) return
    set({ activeShowId: creation.previousShowId, showCreation: null })
  },

  openShow: async (id) => {
    if (id === null) {
      set({ activeShowId: null, showCreation: null })
      return
    }
    if (get().activeShowId === id) return
    const show = get().shows.find((candidate) => candidate.id === id)
    if (!show) return
    set({ activeShowId: id, showCreation: null })
    getPersonalContentProvider().setLastActive({ type: 'show', id }).catch(() => {})
  },

  addShow: async (record) => {
    // A stale list snapshot resolving after this create would drop the new
    // record from state; wait for the hydration to apply first (#794).
    if (showsHydration) await showsHydration.catch(() => {})
    await getPersonalContentProvider().createShow(record)
    lastPersistedShowRecords.set(record.id, { record: normalizeShowRecord(record), history: { past: [], future: [] } })
    trackEntityCreated('show')
    set((state) => ({ shows: [record, ...state.shows], showsLoaded: true }))
  },

  addImportedShow: async (record) => {
    await get().addShow(record)
  },

  renameShow: async (id, name) => {
    const existing = get().resolveEditableShow(id)
    if (!existing || existing.name === name) return
    const next = { ...existing, name, updatedAt: Date.now() }
    await updateShowQuietly(get().updateShow, id, next)
  },

  removeShow: async (id) => {
    await getPersonalContentProvider().deleteShow(id)
    lastPersistedShowRecords.delete(id)
    const { activeShowId, shows } = get()
    const remaining = shows.filter((show) => show.id !== id)
    set({
      shows: remaining,
      activeShowId: activeShowId === id ? null : activeShowId,
    })
  },

  duplicateShow: async (sourceId, sourceRecord) => {
    if (showsHydration) await showsHydration.catch(() => {})
    const source = sourceRecord ?? get().resolveEditableShow(sourceId)
    if (!source) return null
    const record = {
      ...source,
      id: newPersonalContentId(),
      name: uniquePatternName(`${source.name} copy`, get().shows.map((show) => show.name)),
      updatedAt: Date.now(),
    }
    try {
      await get().addShow(record)
    } catch {
      return null
    }
    return record
  },

  resolveEditableShow: (id) => {
    const state = get()
    return state.shows.find((show) => show.id === id)
      ?? state.stockShowDrafts[id]
      ?? stockShowById(id)?.show
  },

  resetStockShowDraft: (id) => set((state) => {
    if (!(id in state.stockShowDrafts)) return state
    const stockShowDrafts = { ...state.stockShowDrafts }
    delete stockShowDrafts[id]
    const showHistories = { ...state.showHistories }
    delete showHistories[id]
    return { stockShowDrafts, showHistories }
  }),

  updateShow: async (id, next) => {
    if (stockShowById(id)) {
      const previousRecord = get().resolveEditableShow(id)
      if (!previousRecord || next === previousRecord) return
      next = reconcileShowExecutionModelOnCastReturn(previousRecord, forfeitShowExecutionModelOnCastChange(previousRecord, next))
      const previous = normalizeShowRecord(previousRecord)
      const previousHistory = get().showHistories[id] ?? { past: [], future: [] }
      set((state) => ({
        stockShowDrafts: { ...state.stockShowDrafts, [id]: normalizeShowRecord(next) },
        showHistories: {
          ...state.showHistories,
          [id]: { past: [...previousHistory.past, previous], future: [] },
        },
      }))
      return
    }
    const previousRecord = get().shows.find((show) => show.id === id)
    if (!previousRecord || next === previousRecord) return
    next = reconcileShowExecutionModelOnCastReturn(previousRecord, forfeitShowExecutionModelOnCastChange(previousRecord, next))
    const previous = normalizeShowRecord(previousRecord)
    const normalizedNext = normalizeShowRecord(next)
    const previousHistory = get().showHistories[id] ?? { past: [], future: [] }
    const optimisticHistory = { past: [...previousHistory.past, previous], future: [] }
    set((state) => ({
      shows: state.shows
        .map((show) => show.id === id ? normalizedNext : show)
        .sort((a, b) => b.updatedAt - a.updatedAt),
      showHistories: {
        ...state.showHistories,
        [id]: optimisticHistory,
      },
    }))
    try {
      await persistShowRecord(normalizedNext)
      advanceDurableBaseline(id, normalizedNext, optimisticHistory)
      set((state) => ({
        ...(state.showSaveFailure?.showId === id ? { showSaveFailure: null } : {}),
        // A loadShows that raced this write saw the durable record before the
        // promise resolved and cleared its history as stale; restore the pair,
        // but only while this write's record is still the one loaded.
        ...(state.showHistories[id] === undefined
          && state.shows.find((show) => show.id === id)?.updatedAt === normalizedNext.updatedAt
          ? { showHistories: { ...state.showHistories, [id]: optimisticHistory } }
          : {}),
      }))
    } catch (cause) {
      // A newer optimistic record already superseded this write; its own
      // persistence outcome is authoritative, so nothing rolls back and the
      // caller's edit still reads as applied (#792).
      let rolledBack = false
      set((state) => {
        const current = state.shows.find((show) => show.id === id)
        if (current !== normalizedNext) return state
        rolledBack = true
        const durable = lastPersistedShowRecords.get(id)
        return {
          shows: replaceShowRecord(state.shows, durable?.record ?? previous),
          showHistories: { ...state.showHistories, [id]: durable?.history ?? previousHistory },
          showSaveFailure: { showId: id, record: normalizedNext },
        }
      })
      if (rolledBack) throw cause
    }
  },

  dismissShowSaveFailure: () => set({ showSaveFailure: null }),

  retryShowSaveFailure: async () => {
    const failure = get().showSaveFailure
    if (!failure) return
    // A still-failing write re-records showSaveFailure; the notice stays up.
    await updateShowQuietly(get().updateShow, failure.showId, { ...failure.record, updatedAt: Date.now() })
  },

  updateStageMap: async (showId, stageMapId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, { ...show, stageMapId, updatedAt: Date.now() })
  },

  addScene: async (showId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, addShowScene(show))
  },

  duplicateScene: async (showId, sceneId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, duplicateShowScene(show, sceneId))
  },

  cloneClip: async (showId, cellId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return null
    const next = cloneShowCellAfter(show, cellId)
    if (next === show) return null
    if (!(await updateShowQuietly(get().updateShow, showId, next))) return null
    return next.cells.find((cell) => !show.cells.some((previous) => previous.id === cell.id)) ?? null
  },

  moveClip: async (showId, cellId, zoneId, sceneId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return false
    const next = moveShowCellToSlot(show, cellId, zoneId, sceneId)
    if (next === show) return false
    return updateShowQuietly(get().updateShow, showId, next)
  },

  removeScene: async (showId, sceneId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowScene(show, sceneId))
  },

  updateScene: async (showId, sceneId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowScene(show, sceneId, changes))
  },

  updateTransition: async (showId, sceneId, kind, durationMs, feather, portal) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowTransition(show, sceneId, kind, durationMs, feather, portal))
  },

  removeClip: async (showId, clipId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowClip(show, clipId))
  },

  placeClip: async (showId, zoneId, sceneId, patch) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return null
    const next = placeShowClip(show, zoneId, sceneId, patch)
    if (next === show) return null
    if (!(await updateShowQuietly(get().updateShow, showId, next))) return null
    return showCellAtSlot(next, zoneId, sceneId) ?? null
  },

  updateCellAdaptations: async (showId, cellId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellAdaptations(show, cellId, changes))
  },

  updateCellEffects: async (showId, cellId, effects) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellEffects(show, cellId, effects))
  },

  updateCellControlTarget: async (showId, cellId, exportName, value) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellControlTarget(show, cellId, exportName, value))
  },

  updateCellPattern: async (showId, cellId, patch) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellPattern(show, cellId, patch))
  },

  updateCellRestartOnEntry: async (showId, cellId, restartOnEntry) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellRestartOnEntry(show, cellId, restartOnEntry))
  },

  updateBoundaryTransition: async (showId, transitionId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowBoundaryTransition(show, transitionId, changes))
  },

  removeBoundaryTransition: async (showId, transitionId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowBoundaryTransition(show, transitionId))
  },

  splitAtTime: async (showId, atMs) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    const next = splitShowAtTime(show, atMs)
    if (next === show) return
    await updateShowQuietly(get().updateShow, showId, next)
  },

  extendCell: async (showId, cellId, sceneSpan) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, extendShowCell(show, cellId, sceneSpan))
  },

  spanCellZones: async (showId, cellId, zoneSpan) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, spanShowCellZones(show, cellId, zoneSpan))
  },

  updateCellZoneMode: async (showId, cellId, zoneMode) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellZoneMode(show, cellId, zoneMode))
  },

  addZone: async (showId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, addShowZone(show))
  },

  updateZone: async (showId, zoneId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowZone(show, zoneId, changes))
  },

  removeZone: async (showId, zoneId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowZone(show, zoneId))
  },

  addRoutingLayout: async (showId, sourceLayoutId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return null
    const next = addShowRoutingLayout(show, undefined, sourceLayoutId)
    if (!(await updateShowQuietly(get().updateShow, showId, next))) return null
    return next.routingLayouts[next.routingLayouts.length - 1]?.id ?? null
  },

  updateRoutingLayout: async (showId, layoutId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowRoutingLayout(show, layoutId, changes))
  },

  removeRoutingLayout: async (showId, layoutId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowRoutingLayout(show, layoutId))
  },

  updateRoutingSwitch: async (showId, afterSceneId, layoutId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowRoutingSwitch(show, afterSceneId, layoutId))
  },

  undoShow: async (showId) => {
    const show = get().resolveEditableShow(showId)
    const history = get().showHistories[showId]
    const snapshot = history?.past[history.past.length - 1]
    if (!show || !history || !snapshot) return false
    const next = { ...normalizeShowRecord(snapshot), updatedAt: Math.max(Date.now(), show.updatedAt + 1) }
    const nextHistory = {
      past: history.past.slice(0, -1),
      future: [normalizeShowRecord(show), ...history.future],
    }
    if (stockShowById(showId)) {
      set((state) => ({
        stockShowDrafts: { ...state.stockShowDrafts, [showId]: next },
        showHistories: { ...state.showHistories, [showId]: nextHistory },
      }))
      return true
    }
    set((state) => ({
      shows: replaceShowRecord(state.shows, next),
      showHistories: { ...state.showHistories, [showId]: nextHistory },
    }))
    try {
      await persistShowRecord(next)
      advanceDurableBaseline(showId, next, nextHistory)
      set((state) => ({
        ...(state.showSaveFailure?.showId === showId ? { showSaveFailure: null } : {}),
        ...(state.showHistories[showId] === undefined
          && state.shows.find((show) => show.id === showId)?.updatedAt === next.updatedAt
          ? { showHistories: { ...state.showHistories, [showId]: nextHistory } }
          : {}),
      }))
      return true
    } catch {
      set((state) => {
        const durable = lastPersistedShowRecords.get(showId)
        return {
          shows: replaceShowRecord(state.shows, durable?.record ?? show),
          showHistories: { ...state.showHistories, [showId]: durable?.history ?? history },
          showSaveFailure: { showId, record: next },
        }
      })
      return false
    }
  },

  redoShow: async (showId) => {
    const show = get().resolveEditableShow(showId)
    const history = get().showHistories[showId]
    const snapshot = history?.future[0]
    if (!show || !history || !snapshot) return false
    const next = { ...normalizeShowRecord(snapshot), updatedAt: Math.max(Date.now(), show.updatedAt + 1) }
    const nextHistory = {
      past: [...history.past, normalizeShowRecord(show)],
      future: history.future.slice(1),
    }
    if (stockShowById(showId)) {
      set((state) => ({
        stockShowDrafts: { ...state.stockShowDrafts, [showId]: next },
        showHistories: { ...state.showHistories, [showId]: nextHistory },
      }))
      return true
    }
    set((state) => ({
      shows: replaceShowRecord(state.shows, next),
      showHistories: { ...state.showHistories, [showId]: nextHistory },
    }))
    try {
      await persistShowRecord(next)
      advanceDurableBaseline(showId, next, nextHistory)
      set((state) => ({
        ...(state.showSaveFailure?.showId === showId ? { showSaveFailure: null } : {}),
        ...(state.showHistories[showId] === undefined
          && state.shows.find((show) => show.id === showId)?.updatedAt === next.updatedAt
          ? { showHistories: { ...state.showHistories, [showId]: nextHistory } }
          : {}),
      }))
      return true
    } catch {
      set((state) => {
        const durable = lastPersistedShowRecords.get(showId)
        return {
          shows: replaceShowRecord(state.shows, durable?.record ?? show),
          showHistories: { ...state.showHistories, [showId]: durable?.history ?? history },
          showSaveFailure: { showId, record: next },
        }
      })
      return false
    }
  },
}))

function replaceShowRecord(shows: ShowRecord[], next: ShowRecord): ShowRecord[] {
  return shows
    .map((show) => show.id === next.id ? next : show)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function normalizeShowRecord(show: ShowRecord): ShowRecord {
  const normalized = normalizeShowEntryState(normalizeShowTransitionState(show))
  return normalized.composition
    ? { ...normalized, composition: normalizeShowComposition(normalized, normalized.composition) }
    : withoutComposition(normalized)
}

function showPersistenceChanges(next: ShowRecord): Partial<Omit<ShowRecord, 'id'>> {
  return {
    name: next.name,
    scenes: next.scenes,
    zones: next.zones,
    cells: next.cells,
    routingLayouts: next.routingLayouts,
    transitions: next.transitions,
    composition: next.composition ?? null,
    outputEffects: next.outputEffects,
    // An absent profile must persist as an explicit NULL: undefined is
    // dropped by JSON and skipped by the D1 update, leaving a stale id. The
    // record type spells the field string|undefined, but the wire and D1
    // column accept null and the read side maps falsy back to absent.
    targetControllerProfileId: (next.targetControllerProfileId ?? null) as unknown as string | undefined,
    stageMapId: next.stageMapId ?? null,
    outputContract: next.outputContract,
    importMetadata: next.importMetadata,
    updatedAt: next.updatedAt,
  }
}

function withoutComposition(show: ShowRecord): ShowRecord {
  const { composition: _composition, ...flat } = show
  return flat
}

async function persistShowRecord(next: ShowRecord): Promise<void> {
  const previous = showPersistenceQueues.get(next.id) ?? Promise.resolve()
  const persistence = previous
    .catch(() => undefined)
    .then(() => getPersonalContentProvider().updateShow(next.id, showPersistenceChanges(next)))
  showPersistenceQueues.set(next.id, persistence)
  try {
    await persistence
  } finally {
    if (showPersistenceQueues.get(next.id) === persistence) showPersistenceQueues.delete(next.id)
  }
}

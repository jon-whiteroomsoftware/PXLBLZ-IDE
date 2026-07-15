import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import {
  addShowRoutingLayout,
  addShowScene,
  addShowZone,
  createDefaultShowFromController,
  createDefaultShow,
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
  ShowZone,
} from '@/engine/personalContentRecords'
import { controllerZonePixelCount, type ControllerProfile } from '@/engine/controllerProfile'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { uniquePatternName } from '@/engine/patternName'
import { useMapStore } from '@/store/mapStore'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import {
  classifyShowOutputContract,
  legacyShowModeledPixelCount,
} from '@/engine/showLegacyClassification'

const showPersistenceQueues = new Map<string, Promise<void>>()

export interface ShowClassificationState {
  showId: string
  previousShowId: string | null
  modeledPixelCount: number
  reasons: string[]
}

interface ShowState {
  shows: ShowRecord[]
  showsLoaded: boolean
  activeShowId: string | null
  showCreation: { previousShowId: string | null } | null
  showClassification: ShowClassificationState | null
  showHistories: Record<string, ShowHistory>
  loadShows: () => Promise<void>
  createNewShow: (input?: { name?: string; outputContract?: ShowOutputContract }) => Promise<ShowRecord>
  createShowFromController: (profile: ControllerProfile) => Promise<ShowRecord>
  beginShowCreation: () => void
  cancelShowCreation: () => void
  openShow: (id: string | null) => Promise<void>
  confirmShowClassification: (outputContract: ShowOutputContract) => Promise<void>
  cancelShowClassification: () => void
  addShow: (record: ShowRecord) => Promise<void>
  renameShow: (id: string, name: string) => Promise<void>
  removeShow: (id: string) => Promise<void>
  updateShow: (id: string, next: ShowRecord) => Promise<void>
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
    kind: NonNullable<ShowScene['transitionOut']>['kind'],
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
  addRoutingLayout: (showId: string, sourceLayoutId?: string) => Promise<void>
  updateRoutingLayout: (showId: string, layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => Promise<void>
  removeRoutingLayout: (showId: string, layoutId: string) => Promise<void>
  updateRoutingSwitch: (showId: string, afterSceneId: string, layoutId: string | null) => Promise<void>
  undoShow: (showId: string) => Promise<boolean>
  redoShow: (showId: string) => Promise<boolean>
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
  showClassification: null as ShowClassificationState | null,
  showHistories: {} as Record<string, ShowHistory>,
}

export const useShowStore = create<ShowState>()((set, get) => ({
  ...showInitialState,

  loadShows: async () => {
    const shows = (await getPersonalContentProvider().listShows())
      .map(normalizeShowTransitionState)
      .map(normalizeShowEntryState)
    set({ shows: shows.sort((a, b) => b.updatedAt - a.updatedAt), showsLoaded: true })
  },

  createNewShow: async (input) => {
    const id = newPersonalContentId()
    const name = uniquePatternName(input?.name?.trim() || 'Untitled Show', get().shows.map((show) => show.name))
    const show = input?.outputContract
      ? createShowWithOutputContract(id, name, input.outputContract)
      : createDefaultShow(id, name)
    await get().addShow(show)
    return show
  },

  createShowFromController: async (profile) => {
    const id = newPersonalContentId()
    const name = uniquePatternName(`${profile.name} Show`, get().shows.map((show) => show.name))
    const stageMapId = importedStageMapIdForController(profile, useMapStore.getState().userMaps)
    const pixelCount = profile.lastKnownPixelCount
      ?? (profile.zones.reduce((sum, zone) => sum + controllerZonePixelCount(zone), 0) || 60)
    const show = {
      ...createDefaultShowFromController(id, name, profile, stageMapId),
      outputContract: createInstallationShowOutputContract({ outputMapId: stageMapId, pixelCount }),
    }
    await get().addShow(show)
    return show
  },

  beginShowCreation: () => {
    if (get().showCreation) return
    set({ showCreation: { previousShowId: get().activeShowId }, showClassification: null })
  },

  cancelShowCreation: () => {
    const creation = get().showCreation
    if (!creation) return
    set({ activeShowId: creation.previousShowId, showCreation: null })
  },

  openShow: async (id) => {
    if (id === null) {
      set({ activeShowId: null, showCreation: null, showClassification: null })
      return
    }
    if (get().activeShowId === id || get().showClassification?.showId === id) return
    const show = get().shows.find((candidate) => candidate.id === id)
    if (!show) return
    const classification = classifyShowOutputContract(show)
    if (classification.outcome === 'ambiguous') {
      set({
        activeShowId: null,
        showCreation: null,
        showClassification: {
          showId: id,
          previousShowId: get().activeShowId,
          modeledPixelCount: legacyShowModeledPixelCount(show),
          reasons: classification.reasons,
        },
      })
      return
    }
    if (classification.source === 'legacy-evidence') {
      const next = showWithOutputContract(show, classification.contract)
      set((state) => ({
        shows: replaceShowRecord(state.shows, next),
        activeShowId: id,
        showCreation: null,
        showClassification: null,
      }))
      await persistShowOutputContract(next)
    } else {
      set({ activeShowId: id, showCreation: null, showClassification: null })
    }
    getPersonalContentProvider().setLastActive({ type: 'show', id }).catch(() => {})
  },

  confirmShowClassification: async (outputContract) => {
    const pending = get().showClassification
    if (!pending) return
    const show = get().shows.find((candidate) => candidate.id === pending.showId)
    if (!show || show.outputContract) return
    const next = showWithOutputContract(show, outputContract)
    set((state) => ({
      shows: replaceShowRecord(state.shows, next),
      activeShowId: show.id,
      showClassification: null,
      showCreation: null,
    }))
    await persistShowOutputContract(next)
    getPersonalContentProvider().setLastActive({ type: 'show', id: show.id }).catch(() => {})
  },

  cancelShowClassification: () => {
    const pending = get().showClassification
    if (!pending) return
    set({ activeShowId: pending.previousShowId, showClassification: null })
  },

  addShow: async (record) => {
    await getPersonalContentProvider().createShow(record)
    trackEntityCreated('show')
    set((state) => ({ shows: [record, ...state.shows], showsLoaded: true }))
  },

  renameShow: async (id, name) => {
    const existing = get().shows.find((show) => show.id === id)
    if (!existing || existing.name === name) return
    const next = { ...existing, name, updatedAt: Date.now() }
    await get().updateShow(id, next)
  },

  removeShow: async (id) => {
    await getPersonalContentProvider().deleteShow(id)
    const { activeShowId, shows } = get()
    const remaining = shows.filter((show) => show.id !== id)
    set({
      shows: remaining,
      activeShowId: activeShowId === id ? null : activeShowId,
    })
  },

  updateShow: async (id, next) => {
    const previousRecord = get().shows.find((show) => show.id === id)
    if (!previousRecord || next === previousRecord) return
    const previous = normalizeShowRecord(previousRecord)
    const normalizedNext = normalizeShowRecord(next)
    const previousHistory = get().showHistories[id] ?? { past: [], future: [] }
    set((state) => ({
      shows: state.shows
        .map((show) => show.id === id ? normalizedNext : show)
        .sort((a, b) => b.updatedAt - a.updatedAt),
      showHistories: {
        ...state.showHistories,
        [id]: { past: [...previousHistory.past, previous], future: [] },
      },
    }))
    try {
      await persistShowRecord(normalizedNext)
    } catch (cause) {
      set((state) => {
        const current = state.shows.find((show) => show.id === id)
        if (current !== normalizedNext) return state
        return {
          shows: replaceShowRecord(state.shows, previous),
          showHistories: { ...state.showHistories, [id]: previousHistory },
        }
      })
      throw cause
    }
  },

  updateStageMap: async (showId, stageMapId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, { ...show, stageMapId, updatedAt: Date.now() })
  },

  addScene: async (showId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, addShowScene(show))
  },

  duplicateScene: async (showId, sceneId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, duplicateShowScene(show, sceneId))
  },

  cloneClip: async (showId, cellId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return null
    const next = cloneShowCellAfter(show, cellId)
    if (next === show) return null
    await get().updateShow(showId, next)
    return next.cells.find((cell) => !show.cells.some((previous) => previous.id === cell.id)) ?? null
  },

  moveClip: async (showId, cellId, zoneId, sceneId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return false
    const next = moveShowCellToSlot(show, cellId, zoneId, sceneId)
    if (next === show) return false
    await get().updateShow(showId, next)
    return true
  },

  removeScene: async (showId, sceneId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, removeShowScene(show, sceneId))
  },

  updateScene: async (showId, sceneId, changes) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowScene(show, sceneId, changes))
  },

  updateTransition: async (showId, sceneId, kind, durationMs, feather, portal) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowTransition(show, sceneId, kind, durationMs, feather, portal))
  },

  removeClip: async (showId, clipId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, removeShowClip(show, clipId))
  },

  placeClip: async (showId, zoneId, sceneId, patch) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return null
    const next = placeShowClip(show, zoneId, sceneId, patch)
    if (next === show) return null
    await get().updateShow(showId, next)
    return showCellAtSlot(next, zoneId, sceneId) ?? null
  },

  updateCellAdaptations: async (showId, cellId, changes) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowCellAdaptations(show, cellId, changes))
  },

  updateCellEffects: async (showId, cellId, effects) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowCellEffects(show, cellId, effects))
  },

  updateCellControlTarget: async (showId, cellId, exportName, value) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowCellControlTarget(show, cellId, exportName, value))
  },

  updateCellPattern: async (showId, cellId, patch) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowCellPattern(show, cellId, patch))
  },

  updateCellRestartOnEntry: async (showId, cellId, restartOnEntry) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowCellRestartOnEntry(show, cellId, restartOnEntry))
  },

  updateBoundaryTransition: async (showId, transitionId, changes) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowBoundaryTransition(show, transitionId, changes))
  },

  removeBoundaryTransition: async (showId, transitionId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, removeShowBoundaryTransition(show, transitionId))
  },

  splitAtTime: async (showId, atMs) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    const next = splitShowAtTime(show, atMs)
    if (next === show) return
    await get().updateShow(showId, next)
  },

  extendCell: async (showId, cellId, sceneSpan) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, extendShowCell(show, cellId, sceneSpan))
  },

  spanCellZones: async (showId, cellId, zoneSpan) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, spanShowCellZones(show, cellId, zoneSpan))
  },

  updateCellZoneMode: async (showId, cellId, zoneMode) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowCellZoneMode(show, cellId, zoneMode))
  },

  addZone: async (showId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, addShowZone(show))
  },

  updateZone: async (showId, zoneId, changes) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowZone(show, zoneId, changes))
  },

  removeZone: async (showId, zoneId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, removeShowZone(show, zoneId))
  },

  addRoutingLayout: async (showId, sourceLayoutId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, addShowRoutingLayout(show, 'New layout', sourceLayoutId))
  },

  updateRoutingLayout: async (showId, layoutId, changes) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowRoutingLayout(show, layoutId, changes))
  },

  removeRoutingLayout: async (showId, layoutId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, removeShowRoutingLayout(show, layoutId))
  },

  updateRoutingSwitch: async (showId, afterSceneId, layoutId) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowRoutingSwitch(show, afterSceneId, layoutId))
  },

  undoShow: async (showId) => {
    const show = get().shows.find((item) => item.id === showId)
    const history = get().showHistories[showId]
    const snapshot = history?.past[history.past.length - 1]
    if (!show || !history || !snapshot) return false
    const next = { ...normalizeShowRecord(snapshot), updatedAt: Math.max(Date.now(), show.updatedAt + 1) }
    const nextHistory = {
      past: history.past.slice(0, -1),
      future: [normalizeShowRecord(show), ...history.future],
    }
    set((state) => ({
      shows: replaceShowRecord(state.shows, next),
      showHistories: { ...state.showHistories, [showId]: nextHistory },
    }))
    try {
      await persistShowRecord(next)
      return true
    } catch (cause) {
      set((state) => ({
        shows: replaceShowRecord(state.shows, show),
        showHistories: { ...state.showHistories, [showId]: history },
      }))
      throw cause
    }
  },

  redoShow: async (showId) => {
    const show = get().shows.find((item) => item.id === showId)
    const history = get().showHistories[showId]
    const snapshot = history?.future[0]
    if (!show || !history || !snapshot) return false
    const next = { ...normalizeShowRecord(snapshot), updatedAt: Math.max(Date.now(), show.updatedAt + 1) }
    const nextHistory = {
      past: [...history.past, normalizeShowRecord(show)],
      future: history.future.slice(1),
    }
    set((state) => ({
      shows: replaceShowRecord(state.shows, next),
      showHistories: { ...state.showHistories, [showId]: nextHistory },
    }))
    try {
      await persistShowRecord(next)
      return true
    } catch (cause) {
      set((state) => ({
        shows: replaceShowRecord(state.shows, show),
        showHistories: { ...state.showHistories, [showId]: history },
      }))
      throw cause
    }
  },
}))

function showWithOutputContract(show: ShowRecord, outputContract: ShowOutputContract): ShowRecord {
  const stageMapId = outputContract.kind === 'installation'
    ? outputContract.outputMapId
    : outputContract.referenceMapId
  return { ...show, outputContract, stageMapId }
}

function replaceShowRecord(shows: ShowRecord[], next: ShowRecord): ShowRecord[] {
  return shows
    .map((show) => show.id === next.id ? next : show)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function normalizeShowRecord(show: ShowRecord): ShowRecord {
  return normalizeShowEntryState(normalizeShowTransitionState(show))
}

function showPersistenceChanges(next: ShowRecord): Partial<Omit<ShowRecord, 'id'>> {
  return {
    name: next.name,
    scenes: next.scenes,
    zones: next.zones,
    cells: next.cells,
    routingLayouts: next.routingLayouts,
    routingSwitches: next.routingSwitches,
    transitions: next.transitions,
    targetControllerProfileId: next.targetControllerProfileId,
    stageMapId: next.stageMapId ?? null,
    outputContract: next.outputContract,
    updatedAt: next.updatedAt,
  }
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

async function persistShowOutputContract(show: ShowRecord): Promise<void> {
  await getPersonalContentProvider().updateShow(show.id, {
    outputContract: show.outputContract,
    stageMapId: show.stageMapId ?? null,
    updatedAt: show.updatedAt,
  })
}

import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import {
  addShowRoutingLayout,
  addShowScene,
  addShowZone,
  createDefaultShowFromController,
  createDefaultShow,
  duplicateShowScene,
  extendShowCell,
  importedStageMapIdForController,
  normalizeShowEntryState,
  normalizeShowTransitionState,
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
  updateShowCellControlTarget,
  updateShowCellPattern,
  updateShowCellRestartOnEntry,
  updateShowScene,
  updateShowRoutingLayout,
  updateShowRoutingSwitch,
  updateShowTransition,
} from '@/engine/showModel'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import type {
  ShowCell,
  ShowCellAdaptations,
  ShowBoundaryTransition,
  ShowRecord,
  ShowPortalSettings,
  ShowRoutingLayout,
  ShowScene,
  ShowZone,
} from '@/engine/personalContentRecords'
import type { ControllerProfile } from '@/engine/controllerProfile'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { uniquePatternName } from '@/engine/patternName'
import { useMapStore } from '@/store/mapStore'

interface ShowState {
  shows: ShowRecord[]
  showsLoaded: boolean
  activeShowId: string | null
  loadShows: () => Promise<void>
  createNewShow: () => Promise<ShowRecord>
  createShowFromController: (profile: ControllerProfile) => Promise<ShowRecord>
  openShow: (id: string | null) => void
  addShow: (record: ShowRecord) => Promise<void>
  renameShow: (id: string, name: string) => Promise<void>
  removeShow: (id: string) => Promise<void>
  updateShow: (id: string, next: ShowRecord) => Promise<void>
  updateStageMap: (showId: string, stageMapId: string | null) => Promise<void>
  addScene: (showId: string) => Promise<void>
  duplicateScene: (showId: string, sceneId: string) => Promise<void>
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
  updateCellAdaptations: (
    showId: string,
    cellId: string,
    changes: Partial<ShowCellAdaptations>,
  ) => Promise<void>
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
}

export type { ShowRecord }

export const showInitialState = {
  shows: [] as ShowRecord[],
  showsLoaded: false,
  activeShowId: null as string | null,
}

export const useShowStore = create<ShowState>()((set, get) => ({
  ...showInitialState,

  loadShows: async () => {
    const shows = (await getPersonalContentProvider().listShows())
      .map(normalizeShowTransitionState)
      .map(normalizeShowEntryState)
    set({ shows: shows.sort((a, b) => b.updatedAt - a.updatedAt), showsLoaded: true })
  },

  createNewShow: async () => {
    const id = newPersonalContentId()
    const name = uniquePatternName('Untitled Show', get().shows.map((show) => show.name))
    const show = createDefaultShow(id, name)
    await get().addShow(show)
    return show
  },

  createShowFromController: async (profile) => {
    const id = newPersonalContentId()
    const name = uniquePatternName(`${profile.name} Show`, get().shows.map((show) => show.name))
    const stageMapId = importedStageMapIdForController(profile, useMapStore.getState().userMaps)
    const show = createDefaultShowFromController(id, name, profile, stageMapId)
    await get().addShow(show)
    return show
  },

  openShow: (id) => {
    if (get().activeShowId === id) return
    set({ activeShowId: id })
    if (id !== null) getPersonalContentProvider().setLastActive({ type: 'show', id }).catch(() => {})
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
    set((state) => ({
      shows: state.shows
        .map((show) => show.id === id ? next : show)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }))
    await getPersonalContentProvider().updateShow(id, {
      name: next.name,
      scenes: next.scenes,
      zones: next.zones,
      cells: next.cells,
      routingLayouts: next.routingLayouts,
      routingSwitches: next.routingSwitches,
      transitions: next.transitions,
      targetControllerProfileId: next.targetControllerProfileId,
      stageMapId: next.stageMapId ?? null,
      updatedAt: next.updatedAt,
    })
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

  updateCellAdaptations: async (showId, cellId, changes) => {
    const show = get().shows.find((item) => item.id === showId)
    if (!show) return
    await get().updateShow(showId, updateShowCellAdaptations(show, cellId, changes))
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
}))

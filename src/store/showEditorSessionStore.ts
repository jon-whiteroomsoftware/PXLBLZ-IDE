import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ShowPatternRef } from '../engine/personalContentRecords'

export interface ShowEditorSessionState {
  snapEnabled: boolean
  setSnapEnabled: (enabled: boolean) => void
  markersVisible: boolean
  setMarkersVisible: (visible: boolean) => void
  markerSnapEnabled: boolean
  setMarkerSnapEnabled: (enabled: boolean) => void
  showNoteOpenById: Record<string, boolean>
  setShowNoteOpen: (showId: string, open: boolean) => void
  zoneWorkspaceOpenByShowId: Record<string, boolean>
  setZoneWorkspaceOpen: (showId: string, open: boolean) => void
  collapsedZoneIdsByShowId: Record<string, string[]>
  setZoneCollapsed: (showId: string, zoneId: string, collapsed: boolean) => void
  focusedZoneIdByShowId: Record<string, string>
  setFocusedZone: (showId: string, zoneId: string | null) => void
  // Per-slot Try with Pattern selections, keyed by slot index within the
  // Show's declared slot groups. Session-only; never persisted.
  referencePatternsByShowId: Record<string, Record<number, ShowPatternRef>>
  setReferencePattern: (showId: string, slotIndex: number, pattern: ShowPatternRef | null) => void
  clearReferencePatterns: (showId: string) => void
  diagnostics: {
    zoneOutlines: boolean
    clipOutlines: boolean
    otherZoneGuides: boolean
  }
  diagnosticFocus: {
    showId: string
    sceneId: string
    zoneId: string
    placementId: string | null
  } | null
  setDiagnostic: (kind: keyof ShowEditorSessionState['diagnostics'], enabled: boolean) => void
  setDiagnosticFocus: (focus: ShowEditorSessionState['diagnosticFocus']) => void
}

export const showEditorSessionInitialState = {
  snapEnabled: true,
  markersVisible: true,
  markerSnapEnabled: true,
  showNoteOpenById: {} as Record<string, boolean>,
  zoneWorkspaceOpenByShowId: {} as Record<string, boolean>,
  collapsedZoneIdsByShowId: {} as Record<string, string[]>,
  focusedZoneIdByShowId: {} as Record<string, string>,
  referencePatternsByShowId: {} as Record<string, Record<number, ShowPatternRef>>,
  diagnostics: {
    zoneOutlines: false,
    clipOutlines: false,
    otherZoneGuides: false,
  },
  diagnosticFocus: null,
}

export function mergePersistedShowEditorSession(
  persisted: unknown,
  current: ShowEditorSessionState,
): ShowEditorSessionState {
  const raw = persisted as Partial<Pick<ShowEditorSessionState,
    | 'snapEnabled'
    | 'markersVisible'
    | 'markerSnapEnabled'
    | 'showNoteOpenById'
    | 'zoneWorkspaceOpenByShowId'
    | 'collapsedZoneIdsByShowId'
    | 'focusedZoneIdByShowId'
  >> | null
  const persistedShowNotes = raw?.showNoteOpenById && typeof raw.showNoteOpenById === 'object'
    ? Object.fromEntries(Object.entries(raw.showNoteOpenById).filter((entry): entry is [string, boolean] => (
        typeof entry[1] === 'boolean'
      )))
    : current.showNoteOpenById
  const zoneWorkspaceOpenByShowId = filterStringRecord(raw?.zoneWorkspaceOpenByShowId, 'boolean')
  const focusedZoneIdByShowId = filterStringRecord(raw?.focusedZoneIdByShowId, 'string')
  const collapsedZoneIdsByShowId = raw?.collapsedZoneIdsByShowId
    && typeof raw.collapsedZoneIdsByShowId === 'object'
    ? Object.fromEntries(Object.entries(raw.collapsedZoneIdsByShowId).flatMap(([showId, zoneIds]) => {
        if (!Array.isArray(zoneIds)) return []
        const validZoneIds = [...new Set(zoneIds.filter((zoneId): zoneId is string => typeof zoneId === 'string'))]
        return validZoneIds.length > 0 ? [[showId, validZoneIds]] : []
      }))
    : current.collapsedZoneIdsByShowId
  const markersVisible = typeof raw?.markersVisible === 'boolean'
    ? raw.markersVisible
    : current.markersVisible
  return {
    ...current,
    ...showEditorSessionInitialState,
    snapEnabled: typeof raw?.snapEnabled === 'boolean' ? raw.snapEnabled : current.snapEnabled,
    markersVisible,
    // Marker visibility and Marker snapping are one user-facing preference.
    // Normalize historical independently persisted values at hydration.
    markerSnapEnabled: markersVisible,
    showNoteOpenById: persistedShowNotes,
    zoneWorkspaceOpenByShowId: zoneWorkspaceOpenByShowId ?? current.zoneWorkspaceOpenByShowId,
    collapsedZoneIdsByShowId,
    focusedZoneIdByShowId: focusedZoneIdByShowId ?? current.focusedZoneIdByShowId,
  }
}

function filterStringRecord<T extends 'boolean' | 'string'>(
  value: unknown,
  type: T,
): Record<string, T extends 'boolean' ? boolean : string> | null {
  if (!value || typeof value !== 'object') return null
  return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === type)) as Record<string, T extends 'boolean' ? boolean : string>
}

export const useShowEditorSessionStore = create<ShowEditorSessionState>()(
  persist(
    (set) => ({
      ...showEditorSessionInitialState,
      setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
      setMarkersVisible: (markersVisible) => set({ markersVisible }),
      setMarkerSnapEnabled: (markerSnapEnabled) => set({ markerSnapEnabled }),
      setShowNoteOpen: (showId, open) => set((state) => ({
        showNoteOpenById: { ...state.showNoteOpenById, [showId]: open },
      })),
      setZoneWorkspaceOpen: (showId, open) => set((state) => ({
        zoneWorkspaceOpenByShowId: { ...state.zoneWorkspaceOpenByShowId, [showId]: open },
      })),
      setZoneCollapsed: (showId, zoneId, collapsed) => set((state) => {
        const current = state.collapsedZoneIdsByShowId[showId] ?? []
        const next = collapsed
          ? [...new Set([...current, zoneId])]
          : current.filter((candidate) => candidate !== zoneId)
        const collapsedZoneIdsByShowId = { ...state.collapsedZoneIdsByShowId }
        if (next.length > 0) collapsedZoneIdsByShowId[showId] = next
        else delete collapsedZoneIdsByShowId[showId]
        return { collapsedZoneIdsByShowId }
      }),
      setFocusedZone: (showId, zoneId) => set((state) => {
        const focusedZoneIdByShowId = { ...state.focusedZoneIdByShowId }
        if (zoneId) focusedZoneIdByShowId[showId] = zoneId
        else delete focusedZoneIdByShowId[showId]
        return { focusedZoneIdByShowId }
      }),
      setReferencePattern: (showId, slotIndex, pattern) => set((state) => {
        const current = state.referencePatternsByShowId[showId] ?? {}
        const next = { ...current }
        if (pattern) next[slotIndex] = pattern
        else delete next[slotIndex]
        const referencePatternsByShowId = { ...state.referencePatternsByShowId }
        if (Object.keys(next).length > 0) referencePatternsByShowId[showId] = next
        else delete referencePatternsByShowId[showId]
        return { referencePatternsByShowId }
      }),
      clearReferencePatterns: (showId) => set((state) => {
        if (!state.referencePatternsByShowId[showId]) return state
        const referencePatternsByShowId = { ...state.referencePatternsByShowId }
        delete referencePatternsByShowId[showId]
        return { referencePatternsByShowId }
      }),
      setDiagnostic: (kind, enabled) => set((state) => ({
        diagnostics: { ...state.diagnostics, [kind]: enabled },
      })),
      setDiagnosticFocus: (diagnosticFocus) => set((state) => {
        const current = state.diagnosticFocus
        if (current === diagnosticFocus) return state
        if (current && diagnosticFocus
          && current.showId === diagnosticFocus.showId
          && current.sceneId === diagnosticFocus.sceneId
          && current.zoneId === diagnosticFocus.zoneId
          && current.placementId === diagnosticFocus.placementId) return state
        return { diagnosticFocus }
      }),
    }),
    {
      name: 'pxlblz-show-editor',
      partialize: (state) => ({
        snapEnabled: state.snapEnabled,
        markersVisible: state.markersVisible,
        markerSnapEnabled: state.markerSnapEnabled,
        showNoteOpenById: state.showNoteOpenById,
        zoneWorkspaceOpenByShowId: state.zoneWorkspaceOpenByShowId,
        collapsedZoneIdsByShowId: state.collapsedZoneIdsByShowId,
        focusedZoneIdByShowId: state.focusedZoneIdByShowId,
      }),
      merge: mergePersistedShowEditorSession,
    },
  ),
)

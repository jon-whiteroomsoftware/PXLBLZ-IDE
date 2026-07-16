import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ShowEditorSessionState {
  snapEnabled: boolean
  setSnapEnabled: (enabled: boolean) => void
  showNoteOpenById: Record<string, boolean>
  setShowNoteOpen: (showId: string, open: boolean) => void
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
  showNoteOpenById: {} as Record<string, boolean>,
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
  const raw = persisted as Partial<Pick<ShowEditorSessionState, 'snapEnabled' | 'showNoteOpenById'>> | null
  const persistedShowNotes = raw?.showNoteOpenById && typeof raw.showNoteOpenById === 'object'
    ? Object.fromEntries(Object.entries(raw.showNoteOpenById).filter((entry): entry is [string, boolean] => (
        typeof entry[1] === 'boolean'
      )))
    : current.showNoteOpenById
  return {
    ...current,
    ...showEditorSessionInitialState,
    snapEnabled: typeof raw?.snapEnabled === 'boolean' ? raw.snapEnabled : current.snapEnabled,
    showNoteOpenById: persistedShowNotes,
  }
}

export const useShowEditorSessionStore = create<ShowEditorSessionState>()(
  persist(
    (set) => ({
      ...showEditorSessionInitialState,
      setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
      setShowNoteOpen: (showId, open) => set((state) => ({
        showNoteOpenById: { ...state.showNoteOpenById, [showId]: open },
      })),
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
        showNoteOpenById: state.showNoteOpenById,
      }),
      merge: mergePersistedShowEditorSession,
    },
  ),
)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ShowEditorSessionState {
  snapEnabled: boolean
  setSnapEnabled: (enabled: boolean) => void
}

export const showEditorSessionInitialState = {
  snapEnabled: true,
}

export function mergePersistedShowEditorSession(
  persisted: unknown,
  current: ShowEditorSessionState,
): ShowEditorSessionState {
  const raw = persisted as Partial<Pick<ShowEditorSessionState, 'snapEnabled'>> | null
  return {
    ...current,
    snapEnabled: typeof raw?.snapEnabled === 'boolean' ? raw.snapEnabled : current.snapEnabled,
  }
}

export const useShowEditorSessionStore = create<ShowEditorSessionState>()(
  persist(
    (set) => ({
      ...showEditorSessionInitialState,
      setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
    }),
    {
      name: 'pxlblz-show-editor',
      partialize: (state) => ({ snapEnabled: state.snapEnabled }),
      merge: mergePersistedShowEditorSession,
    },
  ),
)

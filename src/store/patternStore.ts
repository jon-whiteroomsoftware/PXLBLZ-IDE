import { create } from 'zustand'

interface PatternState {
  activePatternId: string | null
  activeLibraryName: string | null
  setActivePattern: (id: string | null) => void
  setActiveLibrary: (name: string | null) => void
}

export const SEED_PATTERN_ID = 'seed'

export const patternInitialState = {
  activePatternId: SEED_PATTERN_ID as string | null,
  activeLibraryName: null as string | null,
}

export const usePatternStore = create<PatternState>()((set) => ({
  ...patternInitialState,
  setActivePattern: (id) => set({ activePatternId: id, activeLibraryName: null }),
  setActiveLibrary: (name) => set({ activeLibraryName: name, activePatternId: null }),
}))

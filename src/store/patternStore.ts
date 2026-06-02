import { create } from 'zustand'
import {
  PatternRecord,
  createPattern,
  listPatterns,
  updatePattern,
  deletePattern,
  setSetting,
} from '@/engine/storage'
import type { Settings } from '@/engine/settings'

export type { PatternRecord }

export const LAST_ACTIVE_KEY = 'lastActive'

export type LastActive =
  | { type: 'pattern'; id: string }
  | { type: 'library'; name: string }
  | { type: 'demo'; name: string }

interface PatternState {
  activePatternId: string | null
  activeLibraryName: string | null
  activeDemoName: string | null
  userPatterns: PatternRecord[]
  setActivePattern: (id: string | null) => void
  setActiveLibrary: (name: string | null) => void
  setActiveDemo: (name: string | null) => void
  loadPatterns: () => Promise<void>
  addPattern: (record: PatternRecord) => Promise<void>
  renamePattern: (id: string, name: string) => Promise<void>
  removePattern: (id: string) => Promise<void>
  updatePatternSrc: (id: string, src: string) => Promise<void>
  // Sparse-merge per-pattern settings overrides (cascade layer 1, ADR-0013) onto the
  // record, in both IndexedDB and the in-memory list, so reopening restores them this
  // session. Called from a control's own change handler on genuine manipulation —
  // never inferred by comparing a stored value to a default.
  updatePatternSettings: (id: string, patch: Partial<Settings>) => Promise<void>
  // Clear a pattern's layer-1 overrides ("Reset to defaults", ADR-0013), dropping it
  // back to recommended + global-sticky + dev-default on the next resolve.
  resetPatternSettings: (id: string) => Promise<void>
}

export const patternInitialState = {
  activePatternId: null as string | null,
  activeLibraryName: null as string | null,
  activeDemoName: null as string | null,
  userPatterns: [] as PatternRecord[],
}

export const usePatternStore = create<PatternState>()((set, get) => ({
  ...patternInitialState,

  setActivePattern: (id) => {
    set({ activePatternId: id, activeLibraryName: null, activeDemoName: null })
    if (id !== null) setSetting<LastActive>(LAST_ACTIVE_KEY, { type: 'pattern', id }).catch(() => {})
  },
  setActiveLibrary: (name) => {
    set({ activeLibraryName: name, activePatternId: null, activeDemoName: null })
    if (name !== null) setSetting<LastActive>(LAST_ACTIVE_KEY, { type: 'library', name }).catch(() => {})
  },
  setActiveDemo: (name) => {
    set({ activeDemoName: name, activeLibraryName: null, activePatternId: null })
    if (name !== null) setSetting<LastActive>(LAST_ACTIVE_KEY, { type: 'demo', name }).catch(() => {})
  },

  loadPatterns: async () => {
    const patterns = await listPatterns()
    set({ userPatterns: patterns.sort((a, b) => b.updatedAt - a.updatedAt) })
  },

  addPattern: async (record) => {
    await createPattern(record)
    set((s) => ({
      userPatterns: [record, ...s.userPatterns],
    }))
  },

  renamePattern: async (id, name) => {
    const updatedAt = Date.now()
    await updatePattern(id, { name, updatedAt })
    set((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === id ? { ...p, name, updatedAt } : p,
      ),
    }))
  },

  removePattern: async (id) => {
    await deletePattern(id)
    const { activePatternId, userPatterns } = get()
    const remaining = userPatterns.filter((p) => p.id !== id)
    set({
      userPatterns: remaining,
      activePatternId: activePatternId === id ? (remaining[0]?.id ?? null) : activePatternId,
    })
  },

  updatePatternSrc: async (id, src) => {
    const updatedAt = Date.now()
    await updatePattern(id, { src, updatedAt })
    set((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === id ? { ...p, src, updatedAt } : p,
      ),
    }))
  },

  updatePatternSettings: async (id, patch) => {
    // Sparse merge over any existing overrides; the src/updatedAt bump is
    // intentionally skipped: a settings override is a display-side concern, not an
    // edit to the pattern's code, so it shouldn't reorder the recents list.
    let merged: Partial<Settings> | undefined
    set((s) => ({
      userPatterns: s.userPatterns.map((p) => {
        if (p.id !== id) return p
        merged = { ...p.settings, ...patch }
        return { ...p, settings: merged }
      }),
    }))
    if (merged === undefined) return
    await updatePattern(id, { settings: merged }).catch(() => {})
  },

  resetPatternSettings: async (id) => {
    set((s) => ({
      userPatterns: s.userPatterns.map((p) => (p.id === id ? { ...p, settings: {} } : p)),
    }))
    await updatePattern(id, { settings: {} }).catch(() => {})
  },
}))

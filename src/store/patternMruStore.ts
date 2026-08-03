import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// One master most-recently-used list of Pattern selections (#63). Every
// PatternCombobox records into it and reads it back for the untyped default
// view, so recency follows the user across the Clip chooser, Source pattern,
// and the lesson/Showcase slot pickers. Values are combobox option values
// (`stock:<Name>` or `user:<id>`); entries whose Pattern no longer exists are
// simply skipped at render time. A small device preference, persisted in
// localStorage per the storage invariant.
const PATTERN_MRU_STORED_LIMIT = 30

export interface PatternMruState {
  values: string[]
  recordPatternUse: (value: string) => void
}

export const usePatternMruStore = create<PatternMruState>()(
  persist(
    (set) => ({
      values: [],
      recordPatternUse: (value) => set((state) => ({
        values: [value, ...state.values.filter((candidate) => candidate !== value)]
          .slice(0, PATTERN_MRU_STORED_LIMIT),
      })),
    }),
    {
      name: 'pxlblz-pattern-mru',
      merge: (persisted, current) => ({
        ...current,
        values: Array.isArray((persisted as { values?: unknown } | null)?.values)
          ? (persisted as { values: unknown[] }).values
            .filter((candidate): candidate is string => typeof candidate === 'string')
            .slice(0, PATTERN_MRU_STORED_LIMIT)
          : current.values,
      }),
    },
  ),
)

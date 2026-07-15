import { create } from 'zustand'
import type { ShowRecord } from '@/engine/personalContentRecords'

interface ShowPreviewOverrideState {
  show: ShowRecord | null
  preview: (show: ShowRecord) => void
  clear: (showId?: string) => void
}

export const showPreviewOverrideInitialState = {
  show: null,
} satisfies Pick<ShowPreviewOverrideState, 'show'>

export const useShowPreviewOverrideStore = create<ShowPreviewOverrideState>((set, get) => ({
  ...showPreviewOverrideInitialState,
  preview: (show) => set({ show }),
  clear: (showId) => {
    if (showId && get().show?.id !== showId) return
    set({ show: null })
  },
}))

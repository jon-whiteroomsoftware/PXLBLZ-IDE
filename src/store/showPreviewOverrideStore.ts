import { create } from 'zustand'
import type { ShowRecord } from '@/engine/personalContentRecords'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'

interface ShowPreviewOverrideState {
  show: ShowRecord | null
  showV2: ShowRecordV2 | null
  preview: (show: ShowRecord) => void
  previewV2: (record: ShowRecordV2) => void
  clear: (showId?: string) => void
}

export const showPreviewOverrideInitialState = {
  show: null,
  showV2: null,
} satisfies Pick<ShowPreviewOverrideState, 'show' | 'showV2'>

export function showV2StageRecord(
  pilot: ShowRecordV2 | undefined,
  override: ShowRecordV2 | null,
): ShowRecordV2 | undefined {
  if (pilot && override && override.id === pilot.id) return override
  return pilot
}

export const useShowPreviewOverrideStore = create<ShowPreviewOverrideState>((set, get) => ({
  ...showPreviewOverrideInitialState,
  preview: (show) => set({ show }),
  previewV2: (record) => set({ showV2: record }),
  clear: (showId) => {
    const { show, showV2 } = get()
    const clearsShow = !showId || show?.id === showId
    const clearsV2 = !showId || showV2?.id === showId
    if (!clearsShow && !clearsV2) return
    if (clearsShow && clearsV2) {
      if (show === null && showV2 === null) return
      set({ show: null, showV2: null })
      return
    }
    if (clearsShow) {
      if (show === null) return
      set({ show: null })
      return
    }
    if (showV2 === null) return
    set({ showV2: null })
  },
}))

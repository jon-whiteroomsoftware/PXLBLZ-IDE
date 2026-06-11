import { create } from 'zustand'
import type { DocId } from '@/docs/catalog'

interface DocsState {
  activeDocId: DocId | null
  openDoc: (id: DocId) => void
  closeDocs: () => void
}

export const docsInitialState = {
  activeDocId: null as DocId | null,
}

function clearDocHash(): void {
  if (typeof window === 'undefined') return
  if (!window.location.hash.startsWith('#/docs/')) return
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

export const useDocsStore = create<DocsState>()((set) => ({
  ...docsInitialState,
  openDoc: (activeDocId) => set({ activeDocId }),
  closeDocs: () => {
    clearDocHash()
    set({ activeDocId: null })
  },
}))

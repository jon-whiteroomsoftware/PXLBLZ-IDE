import { create } from 'zustand'
import type { DocId } from '@/docs/catalog'
import type { Route } from '@/engine/routes'
import { useRouterStore } from './routerStore'
import { usePatternStore } from './patternStore'

interface DocsState {
  activeDocId: DocId | null
  openDoc: (id: DocId) => void
  closeDocs: () => void
  // Route→state application only: sets the overlay without touching the URL.
  // App's route effect uses this; user actions go through openDoc/closeDocs.
  syncFromRoute: (id: DocId | null) => void
}

export const docsInitialState = {
  activeDocId: null as DocId | null,
}

// Where closing the docs overlay lands: the studio route for the active
// pattern when there is one, else plain /studio.
function studioRouteAfterDocs(): Route {
  const { activePatternId } = usePatternStore.getState()
  return {
    kind: 'studio',
    entity: activePatternId !== null ? { kind: 'patterns', id: activePatternId } : null,
  }
}

export const useDocsStore = create<DocsState>()((set) => ({
  ...docsInitialState,
  openDoc: (activeDocId) => {
    set({ activeDocId })
    useRouterStore.getState().navigate({ kind: 'docs', docId: activeDocId })
  },
  closeDocs: () => {
    set({ activeDocId: null })
    // Only move the URL when it is actually sitting on a docs route; closeDocs
    // is also called as an ensure-closed guard from flows that navigate next.
    if (useRouterStore.getState().route.kind === 'docs') {
      useRouterStore.getState().navigate(studioRouteAfterDocs(), { replace: true })
    }
  },
  syncFromRoute: (activeDocId) => set({ activeDocId }),
}))

import { create } from 'zustand'
import type { Route } from '@/engine/routes'
import { requestBufferReplacement } from './navigationPreflightStore'
import { useRouterStore } from './routerStore'

interface ReferenceNavigationState {
  returnRoute: Route | null
  studioContext: boolean
  returnToOrigin: () => void
  toggleDocs: () => void
  toggleApi: () => void
}

export const referenceNavigationInitialState = {
  returnRoute: null as Route | null,
  studioContext: false,
}

function isReferenceRoute(route: Route): boolean {
  return route.kind === 'docs' || route.kind === 'api-reference'
}

export const useReferenceNavigationStore = create<ReferenceNavigationState>()((set, get) => {
  function returnToOrigin() {
    const destination = get().returnRoute ?? { kind: 'gallery' as const }
    set(referenceNavigationInitialState)
    useRouterStore.getState().navigate(destination)
  }

  function open(target: Extract<Route, { kind: 'docs' | 'api-reference' }>) {
    requestBufferReplacement(() => {
      const router = useRouterStore.getState()
      const current = router.route
      if (current.kind === target.kind) {
        returnToOrigin()
        return
      }

      if (!isReferenceRoute(current)) {
        set({
          returnRoute: current,
          studioContext: current.kind === 'studio',
        })
      }
      router.navigate(target)
    })
  }

  return {
    ...referenceNavigationInitialState,
    returnToOrigin,
    toggleDocs: () => open({ kind: 'docs', docId: null }),
    toggleApi: () => open({ kind: 'api-reference', libraryId: null }),
  }
})

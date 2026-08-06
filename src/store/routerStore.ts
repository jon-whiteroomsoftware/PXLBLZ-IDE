import { create } from 'zustand'
import {
  legacyDocsHashId,
  parseRoute,
  routePath,
  routesEqual,
  type Route,
} from '@/engine/routes'

// The single owner of history/location wiring (#308). Route parsing/formatting
// lives in the pure codec (src/engine/routes.ts); this store applies it to the
// browser. App.tsx calls syncFromLocation on mount and on popstate; everything
// else navigates through navigate().

interface RouterState {
  route: Route
  navigate: (route: Route, opts?: { replace?: boolean; historyState?: unknown }) => void
  syncFromLocation: () => void
}

export const routerInitialState = {
  route: { kind: 'studio', entity: null } as Route,
}

function base(): string {
  return import.meta.env.BASE_URL
}

export const useRouterStore = create<RouterState>()((set, get) => ({
  ...routerInitialState,

  navigate: (route, opts) => {
    if (typeof window !== 'undefined') {
      const path = routePath(route, base()) + window.location.search
      const current = window.location.pathname + window.location.search
      if (path !== current) {
        if (opts?.replace) window.history.replaceState(opts.historyState ?? null, '', path)
        else window.history.pushState(opts?.historyState ?? null, '', path)
      }
    }
    if (!routesEqual(get().route, route)) set({ route })
  },

  syncFromLocation: () => {
    if (typeof window === 'undefined') return
    // Legacy v1 links (and in-doc cross-links) use the #/docs/<id> hash route;
    // normalize them onto the path route without adding a history entry.
    const legacyDocId = legacyDocsHashId(window.location.hash)
    if (legacyDocId !== null) {
      const route: Route = { kind: 'docs', docId: legacyDocId }
      window.history.replaceState(null, '', routePath(route, base()) + window.location.search)
      set({ route })
      return
    }
    const route = parseRoute(window.location.pathname, base())
    if (!routesEqual(get().route, route)) set({ route })
  },
}))

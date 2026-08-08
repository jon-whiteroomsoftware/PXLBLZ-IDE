import { create } from 'zustand'
import {
  legacyDocsHashId,
  parseRoute,
  routePath,
  routesEqual,
  type Route,
} from '@/engine/routes'
import {
  featureAccessFromSearch,
  gateRouteForFeatureAccess,
  type FeatureAccess,
} from '@/engine/featureAccess'

// The single owner of history/location wiring (#308). Route parsing/formatting
// lives in the pure codec (src/engine/routes.ts); this store applies it to the
// browser. App.tsx calls syncFromLocation on mount and on popstate; everything
// else navigates through navigate().

interface RouterState {
  route: Route
  featureAccess: FeatureAccess
  navigate: (route: Route, opts?: { replace?: boolean; historyState?: unknown }) => void
  syncFromLocation: () => void
}

export const routerInitialState = {
  route: { kind: 'studio', entity: null } as Route,
  featureAccess: { shows: false },
}

function base(): string {
  return import.meta.env.BASE_URL
}

export const useRouterStore = create<RouterState>()((set, get) => ({
  ...routerInitialState,

  navigate: (requestedRoute, opts) => {
    const featureAccess = typeof window !== 'undefined'
      ? featureAccessFromSearch(window.location.search)
      : get().featureAccess
    const route = gateRouteForFeatureAccess(requestedRoute, featureAccess)
    if (typeof window !== 'undefined') {
      const path = routePath(route, base()) + window.location.search
      const current = window.location.pathname + window.location.search
      if (path !== current) {
        if (opts?.replace) window.history.replaceState(opts.historyState ?? null, '', path)
        else window.history.pushState(opts?.historyState ?? null, '', path)
      }
    }
    if (
      !routesEqual(get().route, route) ||
      get().featureAccess.shows !== featureAccess.shows
    ) {
      set({ route, featureAccess })
    }
  },

  syncFromLocation: () => {
    if (typeof window === 'undefined') return
    // Legacy v1 links (and in-doc cross-links) use the #/docs/<id> hash route;
    // normalize them onto the path route without adding a history entry.
    const legacyDocId = legacyDocsHashId(window.location.hash)
    if (legacyDocId !== null) {
      const route: Route = { kind: 'docs', docId: legacyDocId }
      const featureAccess = featureAccessFromSearch(window.location.search)
      window.history.replaceState(null, '', routePath(route, base()) + window.location.search)
      set({ route, featureAccess })
      return
    }
    const parsedRoute = parseRoute(window.location.pathname, base())
    const featureAccess = featureAccessFromSearch(window.location.search)
    const route = gateRouteForFeatureAccess(parsedRoute, featureAccess)
    if (!routesEqual(parsedRoute, route)) {
      window.history.replaceState(null, '', routePath(route, base()) + window.location.search)
    }
    if (
      !routesEqual(get().route, route) ||
      get().featureAccess.shows !== featureAccess.shows
    ) {
      set({ route, featureAccess })
    }
  },
}))

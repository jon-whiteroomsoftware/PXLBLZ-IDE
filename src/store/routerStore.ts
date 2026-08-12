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

type RouterNavigationPreflight = (transition: () => void) => boolean

const immediateNavigation: RouterNavigationPreflight = (transition) => {
  transition()
  return true
}
let navigationPreflight: RouterNavigationPreflight = immediateNavigation
let lastAppliedLocation: string | null = null
let lastAppliedHistoryState: unknown = null
let approvedHistoryLocation: string | null = null

export function setRouterNavigationPreflight(
  next: RouterNavigationPreflight,
): () => void {
  const previous = navigationPreflight
  navigationPreflight = next
  return () => {
    if (navigationPreflight === next) navigationPreflight = previous
  }
}

export function __resetRouterNavigationPreflightForTests(): void {
  navigationPreflight = immediateNavigation
  lastAppliedLocation = null
  lastAppliedHistoryState = null
  approvedHistoryLocation = null
}

export const routerInitialState = {
  route: { kind: 'studio', entity: null } as Route,
  featureAccess: { shows: false },
}

function base(): string {
  return import.meta.env.BASE_URL
}

function browserLocation(): string {
  return window.location.pathname + window.location.search + window.location.hash
}

export const useRouterStore = create<RouterState>()((set, get) => ({
  ...routerInitialState,

  navigate: (requestedRoute, opts) => {
    navigationPreflight(() => {
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
      if (typeof window !== 'undefined') {
        lastAppliedLocation = browserLocation()
        lastAppliedHistoryState = window.history.state
      }
    })
  },

  syncFromLocation: () => {
    if (typeof window === 'undefined') return
    const requestedLocation = browserLocation()
    const legacyDocId = legacyDocsHashId(window.location.hash)
    const parsedRoute: Route = legacyDocId === null
      ? parseRoute(window.location.pathname, base())
      : { kind: 'docs', docId: legacyDocId }
    const featureAccess = featureAccessFromSearch(window.location.search)
    const route = legacyDocId === null
      ? gateRouteForFeatureAccess(parsedRoute, featureAccess)
      : parsedRoute
    const applyRouteState = () => {
      if (
        !routesEqual(get().route, route) ||
        get().featureAccess.shows !== featureAccess.shows
      ) {
        set({ route, featureAccess })
      }
    }
    const applyLocation = () => {
      // Legacy v1 links (and in-doc cross-links) use the #/docs/<id> hash route;
      // normalize them onto the path route without adding a history entry.
      if (legacyDocId !== null) {
        window.history.replaceState(null, '', routePath(route, base()) + window.location.search)
        applyRouteState()
        lastAppliedLocation = browserLocation()
        lastAppliedHistoryState = window.history.state
        return
      }
      if (!routesEqual(parsedRoute, route)) {
        window.history.replaceState(null, '', routePath(route, base()) + window.location.search)
      }
      applyRouteState()
      lastAppliedLocation = browserLocation()
      lastAppliedHistoryState = window.history.state
    }

    if (approvedHistoryLocation === requestedLocation) {
      approvedHistoryLocation = null
      applyLocation()
      return
    }

    let deferred = false
    const applied = navigationPreflight(() => {
      if (!deferred) {
        applyLocation()
        return
      }
      // A popstate has already moved the browser onto the requested history
      // entry. The blocked path pushed the last applied URL back on top; replay
      // the target only after confirmation, then consume that one pop exactly.
      // Apply route state in the confirmation event so a departing Editor
      // unmounts in the same React batch as durable-source restoration instead
      // of beginning Monaco work that the asynchronous pop would cancel.
      applyRouteState()
      approvedHistoryLocation = requestedLocation
      window.history.back()
    })
    if (!applied) {
      deferred = true
      const fallback = routePath(get().route, base()) + window.location.search
      window.history.pushState(
        lastAppliedHistoryState,
        '',
        lastAppliedLocation ?? fallback,
      )
    }
  },
}))

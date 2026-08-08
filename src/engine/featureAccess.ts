import type { Route } from './routes'

export interface FeatureAccess {
  shows: boolean
}

export function featureAccessFromSearch(search: string): FeatureAccess {
  return {
    shows: new URLSearchParams(search).has('showtime'),
  }
}

export function gateRouteForFeatureAccess(route: Route, access: FeatureAccess): Route {
  if (
    !access.shows &&
    route.kind === 'studio' &&
    route.entity?.kind === 'shows'
  ) {
    return { kind: 'studio', entity: { kind: 'patterns', id: null } }
  }
  return route
}

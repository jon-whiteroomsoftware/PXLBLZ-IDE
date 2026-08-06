// Pure route codec for the app's path routing (#308). No React, no window:
// parsing and formatting are plain functions over strings so the routing seam
// is testable in isolation. The router store owns history/location wiring.

export const STUDIO_ENTITY_KINDS = ['patterns', 'maps', 'mixins', 'libraries', 'controllers', 'shows'] as const
export type StudioEntityKind = (typeof STUDIO_ENTITY_KINDS)[number]

export interface StudioEntityRef {
  kind: StudioEntityKind
  id: string
}

export interface StudioEntitySection {
  kind: StudioEntityKind
  id: null
}

export type StudioEntityRoute = StudioEntityRef | StudioEntitySection

export type Route =
  | { kind: 'gallery'; directorySlug?: string }
  | { kind: 'studio-welcome' }
  | { kind: 'studio'; entity: StudioEntityRoute | null }
  | { kind: 'pattern-detail'; slug: string }
  | { kind: 'docs'; docId: string | null }
  | { kind: 'api-reference'; libraryId: string | null }
  | { kind: 'not-found'; path: string }

function isStudioEntityKind(value: string): value is StudioEntityKind {
  return (STUDIO_ENTITY_KINDS as readonly string[]).includes(value)
}

// Split a base-relative path into decoded segments; null when the pathname
// doesn't live under the base at all.
function baseRelativeSegments(pathname: string, base: string): string[] | null {
  const bare = base.replace(/\/$/, '')
  if (pathname !== bare && !pathname.startsWith(base)) return null
  const rest = pathname === bare ? '' : pathname.slice(base.length)
  return rest
    .split('/')
    .filter((s) => s !== '')
    .map(decodeURIComponent)
}

export function parseRoute(pathname: string, base: string): Route {
  const notFound: Route = { kind: 'not-found', path: pathname }
  const segments = baseRelativeSegments(pathname, base)
  if (segments === null) return notFound

  if (segments.length === 0) return { kind: 'gallery' }

  const [head, ...rest] = segments
  switch (head) {
    case 'gallery':
      if (rest.length === 0) return { kind: 'gallery' }
      return rest.length === 1 ? { kind: 'gallery', directorySlug: rest[0] } : notFound
    case 'studio-welcome':
      return rest.length === 0 ? { kind: 'studio-welcome' } : notFound
    case 'studio':
      if (rest.length === 0) return { kind: 'studio', entity: null }
      if (rest.length === 1 && isStudioEntityKind(rest[0])) {
        return { kind: 'studio', entity: { kind: rest[0], id: null } }
      }
      if (rest.length === 2 && isStudioEntityKind(rest[0])) {
        return { kind: 'studio', entity: { kind: rest[0], id: rest[1] } }
      }
      return notFound
    case 'p':
      return rest.length === 1 ? { kind: 'pattern-detail', slug: rest[0] } : notFound
    case 'docs':
      if (rest.length === 0) return { kind: 'docs', docId: null }
      return rest.length === 1 ? { kind: 'docs', docId: rest[0] } : notFound
    case 'reference':
      if (rest.length === 0) return { kind: 'api-reference', libraryId: null }
      return rest.length === 1 ? { kind: 'api-reference', libraryId: rest[0] } : notFound
    default:
      return notFound
  }
}

export function routePath(route: Route, base: string): string {
  const join = (...segments: string[]) => base + segments.map(encodeURIComponent).join('/')
  switch (route.kind) {
    case 'gallery':
      return route.directorySlug === undefined
        ? join('gallery')
        : join('gallery', route.directorySlug)
    case 'studio-welcome':
      return join('studio-welcome')
    case 'studio':
      return route.entity === null
        ? join('studio')
        : route.entity.id === null
          ? join('studio', route.entity.kind)
          : join('studio', route.entity.kind, route.entity.id)
    case 'pattern-detail':
      return join('p', route.slug)
    case 'docs':
      return route.docId === null ? join('docs') : join('docs', route.docId)
    case 'api-reference':
      return route.libraryId === null ? join('reference') : join('reference', route.libraryId)
    case 'not-found':
      return route.path
  }
}

export function routesEqual(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'gallery':
      return a.directorySlug === (b as Extract<Route, { kind: 'gallery' }>).directorySlug
    case 'studio-welcome':
      return true
    case 'studio': {
      const other = (b as Extract<Route, { kind: 'studio' }>).entity
      if (a.entity === null || other === null) return a.entity === other
      return a.entity.kind === other.kind && a.entity.id === other.id
    }
    case 'pattern-detail':
      return a.slug === (b as Extract<Route, { kind: 'pattern-detail' }>).slug
    case 'docs':
      return a.docId === (b as Extract<Route, { kind: 'docs' }>).docId
    case 'api-reference':
      return a.libraryId === (b as Extract<Route, { kind: 'api-reference' }>).libraryId
    case 'not-found':
      return a.path === (b as Extract<Route, { kind: 'not-found' }>).path
  }
}

// v1's only route was the `#/docs/<id>` hash. Old links (and in-doc cross-links,
// which still render as hash hrefs) redirect to the path route.
export function legacyDocsHashId(hash: string): string | null {
  const match = /^#\/docs\/([^/]+)$/.exec(hash)
  return match ? decodeURIComponent(match[1]) : null
}

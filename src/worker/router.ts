// Explicit routing for the Worker that replaces Pages' file-convention
// dispatch (#897). Pure module: no framework imports, no I/O. Paths use the
// same `[param]` segment syntax as the Pages functions directory so the route
// table reads like the directory listing it replaces.

export interface WorkerRouteContext<Env = unknown> {
  request: Request
  env: Env
  params: Record<string, string>
}

export type WorkerRouteHandler<Env = unknown> = (
  context: WorkerRouteContext<Env>,
) => Response | Promise<Response>

export interface WorkerRoute<Env = unknown> {
  path: string
  methods: Readonly<Record<string, WorkerRouteHandler<Env>>>
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

type ParamNames<Path extends string> =
  Path extends `${string}[${infer Name}]${infer Rest}` ? Name | ParamNames<Rest> : never

export type PathParams<Path extends string> = { [Key in ParamNames<Path>]: string }

export type RouteResolution<Env = unknown> =
  | { kind: 'matched'; handler: WorkerRouteHandler<Env>; params: Record<string, string> }
  | { kind: 'method-not-allowed'; allowed: string[] }
  | { kind: 'no-route' }

export function resolveRoute<Env>(
  routes: readonly WorkerRoute<Env>[],
  method: string,
  pathname: string,
): RouteResolution<Env> {
  const requestSegments = pathSegments(pathname)
  for (const route of routes) {
    const params = matchSegments(pathSegments(route.path), requestSegments)
    if (!params) continue
    // Own-property lookup only: an arbitrary client method token such as
    // "constructor" must not resolve through the object prototype.
    const handler = Object.prototype.hasOwnProperty.call(route.methods, method)
      ? route.methods[method]
      : undefined
    if (!handler) return { kind: 'method-not-allowed', allowed: Object.keys(route.methods) }
    return { kind: 'matched', handler, params }
  }
  return { kind: 'no-route' }
}

// One trailing slash is tolerated; interior empty segments are preserved so
// they can fail dynamic matching below.
function pathSegments(pathname: string): string[] {
  const trimmed = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
  return trimmed.split('/')
}

function matchSegments(
  routeSegments: readonly string[],
  requestSegments: readonly string[],
): Record<string, string> | undefined {
  if (routeSegments.length !== requestSegments.length) return undefined
  const params: Record<string, string> = {}
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index]
    const requestSegment = requestSegments[index]
    if (routeSegment.startsWith('[') && routeSegment.endsWith(']')) {
      if (requestSegment.length === 0) return undefined
      params[routeSegment.slice(1, -1)] = decodeSegment(requestSegment)
      continue
    }
    if (routeSegment !== requestSegment) return undefined
  }
  return params
}

// Pages decodes params before handing them to a function; a malformed
// percent sequence stays verbatim rather than failing the whole request.
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

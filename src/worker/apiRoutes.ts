// The Worker's complete API surface, registered explicitly (#897, #902).

import type { D1DatabaseControllerMetadataLike } from '../cloudflare/controllerMetadata'
import type { D1DatabaseControllerProfilesLike } from '../cloudflare/controllerProfiles'
import type { D1DatabaseLike } from '../cloudflare/d1'
import type { D1DatabaseLibrariesLike } from '../cloudflare/libraries'
import type { D1DatabaseMapsLike } from '../cloudflare/maps'
import type { D1DatabaseMixinsLike } from '../cloudflare/mixins'
import type { D1DatabasePatternsLike } from '../cloudflare/patterns'
import type { D1ResourceProtectionDatabaseLike } from '../cloudflare/resourceProtection'
import type { D1DatabaseSettingsLike } from '../cloudflare/settings'
import type { D1DatabaseShowsLike } from '../cloudflare/shows'
import type { D1DatabaseWritableLike } from '../cloudflare/users'
import * as authCallback from './routes/auth/callback'
import * as authDisconnect from './routes/auth/disconnect'
import * as authLogin from './routes/auth/login'
import * as authLogout from './routes/auth/logout'
import * as controllerMetadataItem from './routes/controller-metadata/[key]'
import * as controllersIndex from './routes/controllers/index'
import * as controllersItem from './routes/controllers/[id]'
import * as d1Health from './routes/d1/health'
import * as librariesIndex from './routes/libraries/index'
import * as librariesItem from './routes/libraries/[id]'
import * as mapsIndex from './routes/maps/index'
import * as mapsItem from './routes/maps/[id]'
import * as me from './routes/me'
import * as mixinsIndex from './routes/mixins/index'
import * as mixinsItem from './routes/mixins/[id]'
import * as patternsIndex from './routes/patterns/index'
import * as patternsItem from './routes/patterns/[id]'
import * as settingsItem from './routes/settings/[key]'
import * as showsIndex from './routes/shows/index'
import * as showsItem from './routes/shows/[id]'
import type { HttpMethod, PathParams, WorkerRoute, WorkerRouteHandler } from './router'

// A real D1Database satisfies every handler's narrower requirement, so the
// Worker binds one type that intersects them all.
export type WorkerD1Database =
  & D1DatabaseLike
  & D1DatabaseWritableLike
  & D1DatabasePatternsLike
  & D1DatabaseMapsLike
  & D1DatabaseMixinsLike
  & D1DatabaseLibrariesLike
  & D1DatabaseSettingsLike
  & D1DatabaseShowsLike
  & D1DatabaseControllerProfilesLike
  & D1DatabaseControllerMetadataLike
  & D1ResourceProtectionDatabaseLike

export interface WorkerEnv {
  SESSION_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GITHUB_OAUTH_REDIRECT_URI?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_OAUTH_REDIRECT_URI?: string
  APP_REDIRECT_URL?: string
  PXLBLZ_DB?: WorkerD1Database
  ASSETS: { fetch(request: Request): Promise<Response> }
}

type RouteHandlers<Path extends string> = Partial<Record<HttpMethod, (context: {
  request: Request
  env: WorkerEnv
  params: PathParams<Path>
}) => Response | Promise<Response>>>

// The path's `[param]` segments type the handler's params, so a handler and
// its route cannot disagree. The cast erases that precision into the router's
// string-keyed table; it is sound because resolveRoute only invokes a handler
// with params extracted from this same path.
function route<const Path extends string>(
  path: Path,
  methods: RouteHandlers<Path>,
): WorkerRoute<WorkerEnv> {
  return { path, methods: methods as Record<string, WorkerRouteHandler<WorkerEnv>> }
}

export const apiRoutes: readonly WorkerRoute<WorkerEnv>[] = [
  route('/api/me', { GET: me.onRequestGet }),
  route('/api/d1/health', { GET: d1Health.onRequestGet }),
  route('/api/auth/login', { GET: authLogin.onRequestGet }),
  route('/api/auth/callback', { GET: authCallback.onRequestGet }),
  route('/api/auth/logout', { GET: authLogout.onRequestGet, POST: authLogout.onRequestPost }),
  route('/api/auth/disconnect', { POST: authDisconnect.onRequestPost }),
  route('/api/patterns', { GET: patternsIndex.onRequestGet, POST: patternsIndex.onRequestPost }),
  route('/api/patterns/[id]', { PATCH: patternsItem.onRequestPatch, DELETE: patternsItem.onRequestDelete }),
  route('/api/maps', { GET: mapsIndex.onRequestGet, POST: mapsIndex.onRequestPost }),
  route('/api/maps/[id]', { PATCH: mapsItem.onRequestPatch, DELETE: mapsItem.onRequestDelete }),
  route('/api/mixins', { GET: mixinsIndex.onRequestGet, POST: mixinsIndex.onRequestPost }),
  route('/api/mixins/[id]', { PATCH: mixinsItem.onRequestPatch, DELETE: mixinsItem.onRequestDelete }),
  route('/api/libraries', { GET: librariesIndex.onRequestGet, POST: librariesIndex.onRequestPost }),
  route('/api/libraries/[id]', { PATCH: librariesItem.onRequestPatch, DELETE: librariesItem.onRequestDelete }),
  route('/api/shows', { GET: showsIndex.onRequestGet, POST: showsIndex.onRequestPost }),
  route('/api/shows/[id]', { PATCH: showsItem.onRequestPatch, DELETE: showsItem.onRequestDelete }),
  route('/api/controllers', { GET: controllersIndex.onRequestGet, POST: controllersIndex.onRequestPost }),
  route('/api/controllers/[id]', {
    GET: controllersItem.onRequestGet,
    PATCH: controllersItem.onRequestPatch,
    DELETE: controllersItem.onRequestDelete,
  }),
  route('/api/settings/[key]', { GET: settingsItem.onRequestGet, PUT: settingsItem.onRequestPut }),
  route('/api/controller-metadata/[key]', {
    GET: controllerMetadataItem.onRequestGet,
    PUT: controllerMetadataItem.onRequestPut,
  }),
]

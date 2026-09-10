// Worker entry (#897): `/api/*` dispatches through the explicit route table,
// everything else falls through to the static-assets binding (which supplies
// the SPA fallback). Unknown API paths answer worker-first with JSON.

import { AGENT_OAUTH_PATHS, agentOAuthRoute } from './agent/agentOAuthRoutes'
import { personalStorageGuardResponse } from '../cloudflare/resourceProtection'
import { apiRoutes, type WorkerEnv } from './apiRoutes'
import { resolveRoute, type WorkerRoute } from './router'

export type { WorkerEnv } from './apiRoutes'

export async function handleApiRequest(
  routes: readonly WorkerRoute<WorkerEnv>[],
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const resolution = resolveRoute(routes, request.method, new URL(request.url).pathname)
  if (resolution.kind === 'no-route') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (resolution.kind === 'method-not-allowed') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { Allow: resolution.allowed.join(', ') } },
    )
  }
  try {
    return await resolution.handler({ request, env, params: resolution.params })
  } catch (error) {
    const guarded = personalStorageGuardResponse(error)
    if (guarded) return guarded
    throw error
  }
}

const worker = {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url)
    if ((AGENT_OAUTH_PATHS as readonly string[]).includes(pathname)) return agentOAuthRoute(request, env)
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleApiRequest(apiRoutes, request, env)
    }
    return env.ASSETS.fetch(request)
  },
}

export default worker

export { AgentOAuthAuthority } from './agent/AgentOAuthAuthority'
export { AgentAccount } from './agent/AgentAccount'

import { readSessionFromRequest } from '../../src/cloudflare/auth'
import { authorizeBetaSession } from '../../src/cloudflare/betaAccess'
import {
  createD1BetaAccessStore,
  type D1BetaAccessDatabaseLike,
} from '../../src/cloudflare/d1BetaAccess'
import { personalStorageGuardResponse } from '../../src/cloudflare/resourceProtection'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: unknown
  }
  next(): Promise<Response>
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  try {
    const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
    if (session && context.env.PXLBLZ_DB && !isPublicAuthRoute(context.request)) {
      const allowed = await authorizeBetaSession(
        createD1BetaAccessStore(context.env.PXLBLZ_DB as D1BetaAccessDatabaseLike),
        session.userId,
      )
      if (!allowed) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
    return await context.next()
  } catch (error) {
    const response = personalStorageGuardResponse(error)
    if (response) return response
    throw error
  }
}

function isPublicAuthRoute(request: Request): boolean {
  return new Set([
    '/api/auth/login',
    '/api/auth/callback',
    '/api/auth/logout',
  ]).has(new URL(request.url).pathname)
}

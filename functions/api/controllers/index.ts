import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import {
  createD1ControllerProfile,
  listD1ControllerProfiles,
  type D1DatabaseControllerProfilesLike,
} from '../../../src/cloudflare/controllerProfiles'
import type { ControllerProfile } from '../../../src/engine/controllerProfile'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseControllerProfilesLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const controllers = await listD1ControllerProfiles(context.env.PXLBLZ_DB, session.userId)
  return Response.json({ controllers })
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const profile = await context.request.json() as ControllerProfile
  const error = await tryWrite(() => createD1ControllerProfile(context.env.PXLBLZ_DB!, session.userId, profile))
  if (error) return error
  return Response.json({ controller: profile }, { status: 201 })
}

async function tryWrite(write: () => Promise<void>): Promise<Response | undefined> {
  try {
    await write()
    return undefined
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }
}

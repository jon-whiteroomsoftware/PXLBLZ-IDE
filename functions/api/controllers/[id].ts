import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import {
  assertValidControllerProfile,
  deleteD1ControllerProfile,
  getD1ControllerProfile,
  updateD1ControllerProfile,
  type ControllerProfileChanges,
  type D1DatabaseControllerProfilesLike,
} from '../../../src/cloudflare/controllerProfiles'

interface PagesFunctionContext {
  request: Request
  params: {
    id: string
  }
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseControllerProfilesLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const controller = await getD1ControllerProfile(context.env.PXLBLZ_DB, session.userId, context.params.id)
  if (!controller) return Response.json({ error: 'Controller profile not found' }, { status: 404 })
  return Response.json({ controller })
}

export async function onRequestPatch(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const existing = await getD1ControllerProfile(context.env.PXLBLZ_DB, session.userId, context.params.id)
  if (!existing) return Response.json({ error: 'Controller profile not found' }, { status: 404 })

  const body = await context.request.json() as ControllerProfileChanges & { id?: string }
  const { id: _ignoredId, ...changes } = body
  const next = { ...existing, ...changes, id: existing.id }
  try {
    assertValidControllerProfile(next)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }

  await updateD1ControllerProfile(context.env.PXLBLZ_DB, session.userId, context.params.id, changes)
  return Response.json({ ok: true })
}

export async function onRequestDelete(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  await deleteD1ControllerProfile(context.env.PXLBLZ_DB, session.userId, context.params.id)
  return Response.json({ ok: true })
}

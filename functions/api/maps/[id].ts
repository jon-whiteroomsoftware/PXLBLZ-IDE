import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import { deleteD1Map, updateD1Map, type D1DatabaseMapsLike, type MapChanges } from '../../../src/cloudflare/maps'

interface PagesFunctionContext {
  request: Request
  params: {
    id: string
  }
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseMapsLike
  }
}

export async function onRequestPatch(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const changes = await context.request.json() as MapChanges
  await updateD1Map(context.env.PXLBLZ_DB, session.userId, context.params.id, changes)
  return Response.json({ ok: true })
}

export async function onRequestDelete(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  await deleteD1Map(context.env.PXLBLZ_DB, session.userId, context.params.id)
  return Response.json({ ok: true })
}

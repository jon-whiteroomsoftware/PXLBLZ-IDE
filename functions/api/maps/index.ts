import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import { createD1Map, listD1Maps, type D1DatabaseMapsLike } from '../../../src/cloudflare/maps'
import type { MapRecord } from '../../../src/engine/storage'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseMapsLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const maps = await listD1Maps(context.env.PXLBLZ_DB, session.userId)
  return Response.json({ maps })
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const record = await context.request.json() as MapRecord
  await createD1Map(context.env.PXLBLZ_DB, session.userId, record)
  return Response.json({ map: record }, { status: 201 })
}

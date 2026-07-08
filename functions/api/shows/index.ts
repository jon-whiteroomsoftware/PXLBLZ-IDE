import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import { createD1Show, listD1Shows, type D1DatabaseShowsLike } from '../../../src/cloudflare/shows'
import type { ShowRecord } from '../../../src/engine/personalContentRecords'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseShowsLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const shows = await listD1Shows(context.env.PXLBLZ_DB, session.userId)
  return Response.json({ shows })
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const record = await context.request.json() as ShowRecord
  await createD1Show(context.env.PXLBLZ_DB, session.userId, record)
  return Response.json({ show: record }, { status: 201 })
}

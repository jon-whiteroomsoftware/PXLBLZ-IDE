import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import { readProtectedJson, type D1ResourceProtectionDatabaseLike } from '../../../src/cloudflare/resourceProtection'
import { createD1Show, listD1Shows, type D1DatabaseShowsLike } from '../../../src/cloudflare/shows'
import type { ShowRecord } from '../../../src/engine/personalContentRecords'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseShowsLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  return Response.json(await listD1Shows(context.env.PXLBLZ_DB, session.userId))
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const record = await readProtectedJson<ShowRecord>(
    context.request,
    context.env.PXLBLZ_DB,
    session.userId,
    { createsEntity: true },
  )
  await createD1Show(context.env.PXLBLZ_DB, session.userId, record)
  return Response.json({ show: record }, { status: 201 })
}

import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import { readProtectedJson, type D1ResourceProtectionDatabaseLike } from '../../../src/cloudflare/resourceProtection'
import { deleteD1Show, updateD1Show, type D1DatabaseShowsLike } from '../../../src/cloudflare/shows'
import type { ShowRecord } from '../../../src/engine/personalContentRecords'

interface PagesFunctionContext {
  request: Request
  params: {
    id: string
  }
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseShowsLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestPatch(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const changes = await readProtectedJson<Partial<Omit<ShowRecord, 'id'>>>(
    context.request,
    context.env.PXLBLZ_DB,
    session.userId,
  )
  await updateD1Show(context.env.PXLBLZ_DB, session.userId, context.params.id, changes)
  return Response.json({ ok: true })
}

export async function onRequestDelete(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  await deleteD1Show(context.env.PXLBLZ_DB, session.userId, context.params.id)
  return Response.json({ ok: true })
}

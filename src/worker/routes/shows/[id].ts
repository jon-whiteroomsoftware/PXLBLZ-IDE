import { readSessionFromRequest } from '../../../cloudflare/auth'
import { readProtectedJson, type D1ResourceProtectionDatabaseLike } from '../../../cloudflare/resourceProtection'
import { deleteD1Show, replaceD1ShowV2, updateD1Show, type D1DatabaseShowsLike } from '../../../cloudflare/shows'
import type { ShowRecord } from '../../../engine/personalContentRecords'
import type { ShowRecordV2 } from '../../../engine/showCompositionV2'

interface WorkerRouteContext {
  request: Request
  params: {
    id: string
  }
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseShowsLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestPut(context: WorkerRouteContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })
  if (new URL(context.request.url).searchParams.get('show-version') !== '2') {
    return Response.json({ error: 'Version-2 Shows require the opt-in route.' }, { status: 400 })
  }
  const record = await readProtectedJson<ShowRecordV2>(context.request, context.env.PXLBLZ_DB, session.userId)
  await replaceD1ShowV2(context.env.PXLBLZ_DB, session.userId, context.params.id, record)
  return Response.json({ show: record })
}

export async function onRequestPatch(context: WorkerRouteContext): Promise<Response> {
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

export async function onRequestDelete(context: WorkerRouteContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  await deleteD1Show(context.env.PXLBLZ_DB, session.userId, context.params.id)
  return Response.json({ ok: true })
}

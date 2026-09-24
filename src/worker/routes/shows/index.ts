import { readSessionFromRequest } from '../../../cloudflare/auth'
import { readProtectedJson, type D1ResourceProtectionDatabaseLike } from '../../../cloudflare/resourceProtection'
import { createD1Show, listD1ShowsV2, type D1DatabaseShowsLike } from '../../../cloudflare/shows'
import { isShowRecordV2, type ShowDocument } from '../../../engine/showDocument'
import { isShowV2Request, showV1RetiredResponse } from './showV1Retired'

interface WorkerRouteContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseShowsLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestGet(context: WorkerRouteContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })
  if (!isShowV2Request(context.request)) return showV1RetiredResponse()

  return Response.json(await listD1ShowsV2(context.env.PXLBLZ_DB, session.userId))
}

export async function onRequestPost(context: WorkerRouteContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })
  if (!isShowV2Request(context.request)) return showV1RetiredResponse()

  const record = await readProtectedJson<ShowDocument>(
    context.request,
    context.env.PXLBLZ_DB,
    session.userId,
    { createsEntity: true },
  )
  if (!isShowRecordV2(record)) {
    return Response.json({ error: 'Version-2 Shows require the opt-in route.' }, { status: 400 })
  }
  await createD1Show(context.env.PXLBLZ_DB, session.userId, record)
  return Response.json({ show: record }, { status: 201 })
}

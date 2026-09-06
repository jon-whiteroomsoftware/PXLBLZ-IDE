import { readSessionFromRequest } from '../../../cloudflare/auth'
import { createD1Mixin, listD1Mixins, type D1DatabaseMixinsLike } from '../../../cloudflare/mixins'
import { readProtectedJson, type D1ResourceProtectionDatabaseLike } from '../../../cloudflare/resourceProtection'
import type { MixinRecord } from '../../../engine/personalContentRecords'

interface WorkerRouteContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseMixinsLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestGet(context: WorkerRouteContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const mixins = await listD1Mixins(context.env.PXLBLZ_DB, session.userId)
  return Response.json({ mixins })
}

export async function onRequestPost(context: WorkerRouteContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const record = await readProtectedJson<MixinRecord>(
    context.request,
    context.env.PXLBLZ_DB,
    session.userId,
    { createsEntity: true },
  )
  await createD1Mixin(context.env.PXLBLZ_DB, session.userId, record)
  return Response.json({ mixin: record }, { status: 201 })
}

import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import { createD1Mixin, listD1Mixins, type D1DatabaseMixinsLike } from '../../../src/cloudflare/mixins'
import type { MixinRecord } from '../../../src/engine/personalContentRecords'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseMixinsLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const mixins = await listD1Mixins(context.env.PXLBLZ_DB, session.userId)
  return Response.json({ mixins })
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const record = await context.request.json() as MixinRecord
  await createD1Mixin(context.env.PXLBLZ_DB, session.userId, record)
  return Response.json({ mixin: record }, { status: 201 })
}

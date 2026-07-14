import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import {
  deleteD1Pattern,
  updateD1Pattern,
  type D1DatabasePatternsLike,
} from '../../../src/cloudflare/patterns'
import { readProtectedJson, type D1ResourceProtectionDatabaseLike } from '../../../src/cloudflare/resourceProtection'
import type { PatternRecord } from '../../../src/engine/personalContentRecords'

interface PagesFunctionContext {
  request: Request
  params: {
    id: string
  }
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabasePatternsLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestPatch(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const changes = await readProtectedJson<Partial<Omit<PatternRecord, 'id'>>>(
    context.request,
    context.env.PXLBLZ_DB,
    session.userId,
  )
  await updateD1Pattern(context.env.PXLBLZ_DB, session.userId, context.params.id, changes)
  return Response.json({ ok: true })
}

export async function onRequestDelete(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  await deleteD1Pattern(context.env.PXLBLZ_DB, session.userId, context.params.id)
  return Response.json({ ok: true })
}

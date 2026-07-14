import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import {
  readProtectedJson,
  type D1ResourceProtectionDatabaseLike,
} from '../../../src/cloudflare/resourceProtection'
import {
  createD1Pattern,
  listD1Patterns,
  type D1DatabasePatternsLike,
} from '../../../src/cloudflare/patterns'
import type { PatternRecord } from '../../../src/engine/personalContentRecords'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabasePatternsLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const patterns = await listD1Patterns(context.env.PXLBLZ_DB, session.userId)
  return Response.json({ patterns })
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const record = await readProtectedJson<PatternRecord>(
    context.request,
    context.env.PXLBLZ_DB,
    session.userId,
    { createsEntity: true },
  )
  await createD1Pattern(context.env.PXLBLZ_DB, session.userId, record)
  return Response.json({ pattern: record }, { status: 201 })
}

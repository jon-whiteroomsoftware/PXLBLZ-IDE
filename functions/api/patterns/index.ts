import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import {
  createD1Pattern,
  listD1Patterns,
  type D1DatabasePatternsLike,
} from '../../../src/cloudflare/patterns'
import type { PatternRecord } from '../../../src/engine/storage'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabasePatternsLike
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

  const record = await context.request.json() as PatternRecord
  await createD1Pattern(context.env.PXLBLZ_DB, session.userId, record)
  return Response.json({ pattern: record }, { status: 201 })
}

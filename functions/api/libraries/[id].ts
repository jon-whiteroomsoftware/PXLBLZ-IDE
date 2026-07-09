import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import { deleteD1Library, updateD1Library, type D1DatabaseLibrariesLike } from '../../../src/cloudflare/libraries'
import type { LibraryRecord } from '../../../src/engine/personalContentRecords'

interface PagesFunctionContext {
  request: Request
  params: {
    id: string
  }
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseLibrariesLike
  }
}

export async function onRequestPatch(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  const changes = await context.request.json() as Partial<Omit<LibraryRecord, 'id'>>
  await updateD1Library(context.env.PXLBLZ_DB, session.userId, context.params.id, changes)
  return Response.json({ ok: true })
}

export async function onRequestDelete(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  await deleteD1Library(context.env.PXLBLZ_DB, session.userId, context.params.id)
  return Response.json({ ok: true })
}

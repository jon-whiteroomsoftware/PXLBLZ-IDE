import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import {
  getD1ControllerMetadata,
  setD1ControllerMetadata,
  type D1DatabaseControllerMetadataLike,
} from '../../../src/cloudflare/controllerMetadata'
import {
  assertAllowedPersonalStorageKey,
  readProtectedJson,
  type D1ResourceProtectionDatabaseLike,
} from '../../../src/cloudflare/resourceProtection'

interface PagesFunctionContext {
  request: Request
  params: {
    key: string
  }
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseControllerMetadataLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  assertAllowedPersonalStorageKey('controller-metadata', context.params.key)
  const value = await getD1ControllerMetadata(context.env.PXLBLZ_DB, session.userId, context.params.key)
  return Response.json({ value })
}

export async function onRequestPut(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  assertAllowedPersonalStorageKey('controller-metadata', context.params.key)
  const body = await readProtectedJson<{ value: unknown }>(
    context.request,
    context.env.PXLBLZ_DB,
    session.userId,
  )
  await setD1ControllerMetadata(context.env.PXLBLZ_DB, session.userId, context.params.key, body.value)
  return Response.json({ ok: true })
}

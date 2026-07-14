import { readSessionFromRequest } from '../../../src/cloudflare/auth'
import {
  assertAllowedPersonalStorageKey,
  readProtectedJson,
  type D1ResourceProtectionDatabaseLike,
} from '../../../src/cloudflare/resourceProtection'
import { getD1Setting, setD1Setting, type D1DatabaseSettingsLike } from '../../../src/cloudflare/settings'

interface PagesFunctionContext {
  request: Request
  params: {
    key: string
  }
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseSettingsLike & D1ResourceProtectionDatabaseLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  assertAllowedPersonalStorageKey('settings', context.params.key)
  const value = await getD1Setting(context.env.PXLBLZ_DB, session.userId, context.params.key)
  return Response.json({ value })
}

export async function onRequestPut(context: PagesFunctionContext): Promise<Response> {
  const session = await readSessionFromRequest(context.request, context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'D1 database is not configured' }, { status: 503 })

  assertAllowedPersonalStorageKey('settings', context.params.key)
  const body = await readProtectedJson<{ value: unknown }>(
    context.request,
    context.env.PXLBLZ_DB,
    session.userId,
  )
  await setD1Setting(context.env.PXLBLZ_DB, session.userId, context.params.key, body.value)
  return Response.json({ ok: true })
}

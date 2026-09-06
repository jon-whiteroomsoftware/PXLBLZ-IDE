import { d1HealthResponse, type D1DatabaseLike } from '../../../cloudflare/d1'

interface WorkerRouteContext {
  env: {
    PXLBLZ_DB?: D1DatabaseLike
  }
}

export async function onRequestGet(context: WorkerRouteContext): Promise<Response> {
  if (!context.env.PXLBLZ_DB) {
    return Response.json({ ok: false, schemaVersion: null }, { status: 503 })
  }

  const health = await d1HealthResponse(context.env.PXLBLZ_DB)
  return Response.json(health, { status: health.ok ? 200 : 503 })
}

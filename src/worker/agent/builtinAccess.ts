import { z } from 'zod'
import { readSessionFromRequest } from '../../cloudflare/auth'
import { agentAccessRefusal, agentResponse, type AgentAccessEnvironment } from '../../cloudflare/agentAccess'
import type { D1DatabaseShowsLike } from '../../cloudflare/shows'
import { AGENT_SERVICE_BOUNDS } from '../../engine/agentAllowance'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const windowSchema = z.object({ registrationId: id, sessionId: id, showId: z.string().min(1).max(128) }).strict()
const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), window: windowSchema }).strict(),
  z.object({ action: z.literal('begin'), window: windowSchema }).strict(),
  z.object({ action: z.literal('run'), window: windowSchema, operationId: id, prompt: z.string().min(1) }).strict(),
  z.object({ action: z.literal('outcome'), window: windowSchema, operationId: id }).strict(),
])
export type BuiltinCommand = z.infer<typeof commandSchema>
interface Environment extends AgentAccessEnvironment { SESSION_SECRET?: string; PXLBLZ_DB?: D1DatabaseShowsLike }

/** Public request validation supplies account identity; window capability is
 * subsequently resolved by the account owner, never treated as a binding claim. */
export async function authorizeBuiltinRequest(request: Request, env: Environment): Promise<Response | { accountId: string; command: BuiltinCommand }> {
  const session = await readSessionFromRequest(request, env.SESSION_SECRET).catch(() => null)
  if (!session) return agentResponse({ code: 'unauthorized' }, 401)
  const url = new URL(request.url)
  if (request.method !== 'POST' || request.headers.get('Origin') !== url.origin) return agentResponse({ code: 'invalid_origin' }, 403)
  const refusal = agentAccessRefusal(session.userId, env)
  if (refusal) return agentResponse({ code: refusal }, refusal === 'not_allowed' ? 403 : 503)
  if (url.searchParams.getAll('agent').length !== 1 || url.searchParams.get('agent') !== '1') return agentResponse({ code: 'opt_in_required' }, 403)
  if (!env.PXLBLZ_DB) return agentResponse({ code: 'unavailable' }, 503)
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return agentResponse({ code: 'invalid_request' }, 400)
  const reader = request.body?.getReader()
  if (!reader) return agentResponse({ code: 'invalid_request' }, 400)
  const chunks: Uint8Array[] = []; let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > AGENT_SERVICE_BOUNDS.maxRequestBytes) { await reader.cancel(); return agentResponse({ code: 'request_too_large' }, 413) }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let payload: unknown
  try { payload = JSON.parse(new TextDecoder().decode(bytes)) } catch { return agentResponse({ code: 'invalid_request' }, 400) }
  const parsed = commandSchema.safeParse(payload)
  if (!parsed.success) return agentResponse({ code: 'invalid_request' }, 400)
  const { results } = await env.PXLBLZ_DB.prepare('SELECT id FROM personal_shows WHERE user_id = ? AND id = ?').bind(session.userId, parsed.data.window.showId).all<{ id: string }>()
  if (!results.length) return agentResponse({ code: 'show_unavailable' }, 404)
  return { accountId: session.userId, command: parsed.data }
}

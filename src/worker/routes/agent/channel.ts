import type { D1DatabaseShowsLike } from '../../../cloudflare/shows'
import { readSessionFromRequest } from '../../../cloudflare/auth'
import { agentAccessRefusal, agentResponse } from '../../../cloudflare/agentAccess'
import type { AgentWindowChannelCommand } from '../../agent/AgentAccount'
import { isStockShowId } from '../../../pixelblaze/stock/showIds'
import type { WorkerEnv } from '../../apiRoutes'

export async function onRequestPost({ request, env }: { request: Request; env: WorkerEnv }): Promise<Response> {
  const session = await readSessionFromRequest(request, env.SESSION_SECRET).catch(() => null)
  if (!session) return agentResponse({ code: 'unauthorized' }, 401)
  const url = new URL(request.url)
  if (request.headers.get('Origin') !== url.origin) return agentResponse({ code: 'invalid_origin' }, 403)
  if (!env.AGENT_ACCOUNTS) return agentResponse({ code: 'unavailable' }, 503)
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return agentResponse({ code: 'invalid_request' }, 400)
  // Stream bound; Content-Length alone is attacker-controlled.
  const reader = request.body?.getReader()
  if (!reader) return agentResponse({ code: 'invalid_request' }, 400)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 1_050_624) { await reader.cancel(); return agentResponse({ code: 'request_too_large' }, 413) }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let payload: unknown
  try { payload = JSON.parse(new TextDecoder().decode(bytes)) } catch { return agentResponse({ code: 'invalid_request' }, 400) }
  const command = parseWindowCommand(payload)
  if (!command || (command.type !== 'reply' && size > 2048)) return agentResponse({ code: 'invalid_request' }, 400)
  // Ending requires the original local capability, even after its Show or opt-in
  // is gone. It neither admits work nor exposes another window's state.
  const ending = command.type === 'leave' || command.type === 'disconnect' || command.type === 'disarm'
  if (!ending) {
    const refusal = agentAccessRefusal(session.userId, env)
    if (refusal) return agentResponse({ code: refusal }, refusal === 'not_allowed' ? 403 : 503)
    if (url.searchParams.getAll('agent').length !== 1 || url.searchParams.get('agent') !== '1') return agentResponse({ code: 'opt_in_required' }, 403)
    if (!isStockShowId(command.showId)) {
      if (!env.PXLBLZ_DB) return agentResponse({ code: 'unavailable' }, 503)
      const db: D1DatabaseShowsLike = env.PXLBLZ_DB
      const { results } = await db.prepare('SELECT id FROM personal_shows WHERE user_id = ? AND id = ?').bind(session.userId, command.showId).all<{ id: string }>()
      if (!results.length) return agentResponse({ code: 'show_unavailable' }, 404)
    }
  }
  const accountId = env.AGENT_ACCOUNTS.idFromName(session.userId)
  return env.AGENT_ACCOUNTS.get(accountId).fetch(new Request('https://agent-account.internal/window', { method: 'POST', body: JSON.stringify(command) }))
}

function parseWindowCommand(value: unknown): AgentWindowChannelCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const types = ['register', 'arm', 'poll', 'heartbeat', 'leave', 'answer', 'decline', 'disconnect', 'disarm', 'receive', 'reply']
  if (typeof body.type !== 'string' || !types.includes(body.type)) return null
  const keys = ['type', 'sessionId', 'showId']
  if (body.type !== 'register') keys.push('registrationId')
  if (body.type === 'answer' || body.type === 'decline') keys.push('callId')
  if (body.type === 'disconnect') keys.push('bindingId')
  if (body.type === 'receive' && body.lastSeenConnection !== undefined) {
    if (typeof body.lastSeenConnection !== 'string' || body.lastSeenConnection.length > 1024) return null
    keys.push('lastSeenConnection')
  }
  if (body.type === 'reply') keys.push('bindingId', 'operationId', 'deliveryId', 'result')
  if (Object.keys(body).length !== keys.length || !keys.filter(key => key !== 'result' && key !== 'lastSeenConnection').every((key) => typeof body[key] === 'string' && (body[key] as string).length > 0 && (body[key] as string).length <= 128)) return null
  if (body.type === 'reply' && (!body.result || typeof body.result !== 'object' || Array.isArray(body.result) || typeof (body.result as Record<string, unknown>).code !== 'string' || ((body.result as Record<string, unknown>).code as string).length > 128)) return null
  if (!Object.keys(body).every((key) => keys.includes(key))) return null
  return { ...body, ...(body.type === 'register' ? { registrationId: crypto.randomUUID() } : {}) } as AgentWindowChannelCommand
}

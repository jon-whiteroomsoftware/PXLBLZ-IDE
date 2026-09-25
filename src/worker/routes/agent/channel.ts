import { readSessionFromRequest } from '../../../cloudflare/auth'
import { agentServiceRefusal, agentResponse } from '../../../cloudflare/agentAccess'
import type { AgentWindowChannelCommand } from '../../agent/AgentAccount'
import { agentGrantAction } from '../../agent/agentGrant'
import type { AgentClaim } from '../../../engine/agentRendezvous'
import type { WorkerEnv } from '../../apiRoutes'
import { resolveAgentShowAccess } from '../../agent/agentShowAccess'

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
  // Ending requires the original local capability, even after its Show or service
  // is gone. It neither admits work nor exposes another window's state.
  const ending = command.type === 'leave' || command.type === 'disconnect' || command.type === 'disarm' || command.type === 'retirement-ack' || command.type === 'forget'
  let showName: string | undefined
  if (!ending) {
    const refusal = agentServiceRefusal(env)
    if (refusal) return agentResponse({ code: refusal }, 503)
    const access = await resolveAgentShowAccess(env, session.userId, command.showId)
    if (!access.ok) return agentResponse({ code: access.code }, access.status)
    showName = access.show.name
  }
  const accountId = env.AGENT_ACCOUNTS.idFromName(session.userId)
  const stub = env.AGENT_ACCOUNTS.get(accountId)
  if (command.type === 'move-external') {
    let inspected: { code: string; claim?: AgentClaim }
    try {
      const response = await stub.fetch(new Request('https://agent-account.internal/window', { method: 'POST', body: JSON.stringify({ ...command, type: 'inspect-external-move' }) }))
      inspected = await response.json() as typeof inspected
    } catch { return agentResponse({ code: 'unavailable' }, 503) }
    if (inspected.code === 'bound_here') return agentResponse({ code: 'bound_here' })
    if (inspected.code !== 'move_available' || inspected.claim?.agentKind !== 'external') return agentResponse({ code: inspected.code }, 409)
    const grant = await agentGrantAction(env, session.userId, inspected.claim.agentId, 'inspect')
    if (grant.code !== 'live') return agentResponse({ code: grant.code === 'unavailable' ? 'unavailable' : 'connection_changed' }, grant.code === 'unavailable' ? 503 : 409)
    let replaced: { code: string }
    try {
      const response = await stub.fetch(new Request('https://agent-account.internal/window', { method: 'POST', body: JSON.stringify({
        type: 'replace-external-binding',
        target: { registrationId: command.registrationId, sessionId: command.sessionId, showId: command.showId },
        expected: { agentId: inspected.claim.agentId, bindingId: command.expectedBindingId },
        next: { callId: crypto.randomUUID(), bindingId: crypto.randomUUID() },
      }) }))
      replaced = await response.json() as typeof replaced
    } catch { return agentResponse({ code: 'unavailable' }, 503) }
    return agentResponse({ code: replaced.code }, replaced.code === 'moved' || replaced.code === 'bound_here' ? 200 : 409)
  }
  if (command.type === 'forget') {
    let current: { code: string; claim?: AgentClaim }
    try {
      const owned = await stub.fetch(new Request('https://agent-account.internal/window', { method: 'POST', body: JSON.stringify({ ...command, type: 'disconnect-forget' }) }))
      current = await owned.json() as typeof current
    } catch { return agentResponse({ code: 'retirement_unconfirmed' }, 503) }
    if (current.code !== 'disconnected' || current.claim?.agentKind !== 'external') return agentResponse({ code: 'not_bound_here' }, 409)
    // The exact owner has ended editing. Credential revocation is a separate outcome;
    // its callbacks cannot invalidate that already-committed confirmation.
    const revoked = await agentGrantAction(env, session.userId, current.claim.agentId, 'revoke')
    return agentResponse({ code: revoked.code === 'credentials_revoked' ? 'forgotten' : 'disconnected_not_forgotten' })
  }
  return stub.fetch(new Request('https://agent-account.internal/window', { method: 'POST', body: JSON.stringify(command.type === 'register' ? { ...command, ...(showName ? { showName } : {}) } : command) }))
}

function parseWindowCommand(value: unknown): AgentWindowChannelCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const types = ['register', 'arm', 'poll', 'heartbeat', 'leave', 'answer', 'decline', 'disconnect', 'disarm', 'receive', 'reply', 'retirement-ack', 'forget', 'move-external']
  if (typeof body.type !== 'string' || !types.includes(body.type)) return null
  const keys = ['type', 'sessionId', 'showId']
  // The register command must declare the v2 record version the editor holds;
  // an absent or other version is an invalid request.
  if (body.type === 'register') {
    if (body.showVersion !== 2) return null
    keys.push('showVersion')
  }
  if (body.type !== 'register') keys.push('registrationId')
  if (body.type === 'answer' || body.type === 'decline') keys.push('callId')
  if (body.type === 'disconnect' || body.type === 'retirement-ack' || body.type === 'forget') keys.push('bindingId')
  if (body.type === 'move-external') keys.push('expectedBindingId')
  if (body.type === 'receive' && body.lastSeenConnection !== undefined) {
    if (typeof body.lastSeenConnection !== 'string' || body.lastSeenConnection.length > 1024) return null
    keys.push('lastSeenConnection')
  }
  if (body.type === 'reply') keys.push('bindingId', 'operationId', 'deliveryId', 'result')
  if (Object.keys(body).length !== keys.length || !keys.filter(key => key !== 'result' && key !== 'lastSeenConnection' && key !== 'showVersion').every((key) => typeof body[key] === 'string' && (body[key] as string).length > 0 && (body[key] as string).length <= 128)) return null
  if (body.type === 'reply' && (!body.result || typeof body.result !== 'object' || Array.isArray(body.result) || typeof (body.result as Record<string, unknown>).code !== 'string' || ((body.result as Record<string, unknown>).code as string).length > 128)) return null
  if (!Object.keys(body).every((key) => keys.includes(key))) return null
  return { ...body, ...(body.type === 'register' ? { registrationId: crypto.randomUUID() } : {}) } as AgentWindowChannelCommand
}

/** Shared service access is open to authenticated accounts while enabled. */
export interface AgentAccessEnvironment {
  AGENT_SERVICE_ENABLED?: string
  AGENT_ACCOUNT_ALLOWLIST?: string
}
export function agentServiceRefusal(env: AgentAccessEnvironment): 'service_disabled' | null {
  if (env.AGENT_SERVICE_ENABLED !== '1') return 'service_disabled'
  return null
}
export function agentBuiltinAccessRefusal(accountId: string, env: AgentAccessEnvironment): 'service_disabled' | 'not_allowed' | null {
  const unavailable = agentServiceRefusal(env)
  if (unavailable) return unavailable
  const allowed = (env.AGENT_ACCOUNT_ALLOWLIST ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  return allowed.includes(accountId) ? null : 'not_allowed'
}
export function agentResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

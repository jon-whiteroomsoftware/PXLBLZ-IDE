/** Shared by browser rendezvous and future authenticated inference/MCP transports. */
export interface AgentAccessEnvironment {
  AGENT_SERVICE_ENABLED?: string
  AGENT_ACCOUNT_ALLOWLIST?: string
}
export function agentAccessRefusal(accountId: string, env: AgentAccessEnvironment): 'service_disabled' | 'not_allowed' | null {
  if (env.AGENT_SERVICE_ENABLED !== '1') return 'service_disabled'
  const allowed = (env.AGENT_ACCOUNT_ALLOWLIST ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  return allowed.includes(accountId) ? null : 'not_allowed'
}
export function agentResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

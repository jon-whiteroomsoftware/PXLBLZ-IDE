import { agentResponse } from '../../cloudflare/agentAccess'
import type { AgentClaim } from '../../engine/agentRendezvous'
import type { WorkerEnv } from '../apiRoutes'
import type { AgentAccountNamespace } from './AgentAccount'
import { accountConnection, resolveBuiltinConnection } from './accountConnection'
import { authorizeBuiltinRequest } from './builtinAccess'
import { handleBuiltinCommand } from './builtinService'
import { dispatchBuiltinProvider } from './builtinProvider'
import type { AgentBuiltinResult as Result } from '../../engine/agentBuiltinResult'
export interface BuiltinEnvironment extends WorkerEnv { AGENT_ALLOWANCE?: AgentAccountNamespace; OPENAI_API_KEY?: string }
export interface BuiltinRelay {
  deliver(env: WorkerEnv, accountId: string, identity: AgentClaim, envelope: { operationId: string; deliveryId: string; sequence: number; payload: Record<string, unknown> }): Promise<Result>
  query(env: WorkerEnv, accountId: string, identity: AgentClaim, query: { kind: 'get_outcome'; operationId: string }): Promise<Result>
}
/** The fourth argument is test injection, never an HTTP or environment option. */
export async function handleBuiltinHttp(request: Request, env: BuiltinEnvironment, relay: BuiltinRelay, providerFetch?: typeof fetch): Promise<Response> {
  const authorized = await authorizeBuiltinRequest(request, env)
  if (authorized instanceof Response) return agentResponse({ ...await authorized.json() as Result, dispatch: 'not_attempted' }, authorized.status)
  if (!env.AGENT_ACCOUNTS || !env.AGENT_ALLOWANCE || !env.OPENAI_API_KEY) return agentResponse({ code: 'unavailable', ...(authorized.command.action === 'run' ? { dispatch: 'not_attempted' } : {}) }, 503)
  const { accountId, command } = authorized
  const allowance = env.AGENT_ALLOWANCE
  try {
    const result = await handleBuiltinCommand(accountId, command, {
      resolve: window => resolveBuiltinConnection(env, accountId, window),
      connect: async window => {
        const identity: AgentClaim = { agentKind: 'builtin', agentId: 'pxlblz-builtin-v1', agentName: 'Pixelblaze agent', callId: crypto.randomUUID(), bindingId: crypto.randomUUID() }
        const response = await accountConnection(env, accountId, identity, 'claim', window)
        const result = await response.json() as Result
        return { code: result.code, ...(result.code === 'bound' ? { bindingId: identity.bindingId } : {}) }
      },
      allowance: async body => {
        const response = await allowance.get(allowance.idFromName('builtin-global-v1')).fetch(new Request('https://agent-allowance.internal/', { method: 'POST', body: JSON.stringify(body) }))
        return response.json() as Promise<Result>
      },
      deliver: (identity, envelope) => relay.deliver(env, accountId, identity, envelope),
      query: (identity, operationId) => relay.query(env, accountId, identity, { kind: 'get_outcome', operationId }),
      provider: dispatch => dispatchBuiltinProvider({ allowance, apiKey: env.OPENAI_API_KEY, providerFetch }, dispatch),
    })
    return agentResponse(result)
  } catch { return agentResponse({ code: 'unavailable' }, 503) }
}

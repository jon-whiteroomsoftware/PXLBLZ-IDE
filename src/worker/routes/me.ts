import {
  parseCookieHeader,
  readSessionToken,
  sessionCookieName,
} from '../../cloudflare/auth'
import { listConnectedIdentities, type D1DatabaseWritableLike } from '../../cloudflare/users'
import { agentBuiltinAccessRefusal, agentServiceRefusal, type AgentAccessEnvironment } from '../../cloudflare/agentAccess'
import { agentOAuthConfig, type AgentOAuthSettings } from '../agent/agentOAuthConfig'
import type { AgentAccountNamespace } from '../agent/AgentAccount'
import { readBuiltinMessageAllowance } from '../agent/builtinAllowance'

interface WorkerRouteContext {
  request: Request
  env: AgentAccessEnvironment & AgentOAuthSettings & {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseWritableLike
    AGENT_OAUTH_AUTHORITY?: unknown
    AGENT_ACCOUNTS?: unknown
    AGENT_ALLOWANCE?: AgentAccountNamespace
    OPENAI_API_KEY?: string
  }
}

export async function onRequestGet(context: WorkerRouteContext): Promise<Response> {
  const cookies = parseCookieHeader(context.request.headers.get('Cookie'))
  const session = await readSessionToken(cookies[sessionCookieName], context.env.SESSION_SECRET)

  if (!session) {
    return Response.json({ authenticated: false })
  }
  const identities = context.env.PXLBLZ_DB
    ? await listConnectedIdentities(context.env.PXLBLZ_DB, session.userId)
    : []
  const config = agentOAuthConfig(context.env)
  const external = !agentServiceRefusal(context.env)
    && Boolean(config && context.env.AGENT_OAUTH_AUTHORITY && context.env.AGENT_ACCOUNTS)
  const builtin = !agentBuiltinAccessRefusal(session.userId, context.env)
    && Boolean(context.env.AGENT_ACCOUNTS && context.env.AGENT_ALLOWANCE && context.env.OPENAI_API_KEY)
  const allowance = builtin && context.env.AGENT_ALLOWANCE
    ? await readBuiltinMessageAllowance(context.env.AGENT_ALLOWANCE, session.userId)
    : undefined

  return Response.json({
    authenticated: true,
    agentCapabilities: {
      external,
      builtin,
      ...(allowance ? { allowance } : {}),
      ...(external && config ? { endpoint: config.resource } : {}),
    },
    user: {
      id: session.userId,
      primaryProvider: session.primaryProvider,
      primaryHandle: session.primaryHandle,
      githubUserId: session.githubUserId,
      githubLogin: session.githubLogin,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      identities,
    },
  })
}

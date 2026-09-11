import { OAuthProvider, OAuthError, type OAuthHelpers, type AuthRequest } from '@cloudflare/workers-oauth-provider'
import { agentAccessRefusal, agentResponse, type AgentAccessEnvironment } from '../../cloudflare/agentAccess'
import { agentOAuthConfig, AGENT_CONNECT_SCOPE, providerSubject, type AgentOAuthSettings } from './agentOAuthConfig'
import { agentConsentPage } from './agentOAuthConsent'
import { oauthStorageKV, type OAuthStorage } from './agentOAuthStorage'

interface TransactionStorage extends OAuthStorage {
  setAlarm(time: number): Promise<void>
  getAlarm(): Promise<number | null>
  deleteAlarm(): Promise<void>
}
interface AuthorityStorage extends TransactionStorage { transaction<T>(callback: (storage: TransactionStorage) => Promise<T>): Promise<T> }
type AuthorityEnv = AgentAccessEnvironment & AgentOAuthSettings
interface ProviderEnv { OAUTH_KV: ReturnType<typeof oauthStorageKV>; OAUTH_PROVIDER: OAuthHelpers }
interface Consent { accountId: string; request: AuthRequest; expiresAt: number }
export interface ValidatedAgentGrant { accountId: string; clientId: string; grantId: string; expiresAt: number }

/** Private auth authority. Public routes supply only validated browser identity.
 * Bounded provider mutations run inside one storage transaction, never an MCP
 * request or a held rendezvous. No network-backed client discovery is enabled.
 */
export class AgentOAuthAuthority {
  constructor(private readonly ctx: { storage: AuthorityStorage }, private readonly env: AuthorityEnv) {}
  async fetch(request: Request): Promise<Response> {
    const config = agentOAuthConfig(this.env)
    if (!config) return agentResponse({ error: 'temporarily_unavailable' }, 503)
    return this.ctx.storage.transaction(async (storage) => {
      const now = Date.now()
      const previous = await storage.get<{ start: number; count: number }>('rate')
      const rate = previous && now < previous.start + 60_000 ? previous : { start: now, count: 0 }
      // Revocation remains available after policy changes and throttling.
      const revocation = request.headers.get('X-Agent-Revocation') === '1'
      if (rate.count >= 120 && !revocation) return agentResponse({ error: 'temporarily_unavailable' }, 429)
      if (!revocation) { rate.count += 1; await storage.put('rate', rate) }
      if (await storage.getAlarm() === null) await storage.setAlarm(now + 60_000)
      const kv = oauthStorageKV(storage)
      // Static clients are deployment configuration, not persisted registrations.
      const providerKV = { ...kv, get: async (key: string, options?: { type: 'json' }) => {
        if (key.startsWith('client:')) {
          const client = config.clients.find((value) => key === `client:${value.clientId}`)
          const value = client ? { ...client, tokenEndpointAuthMethod: 'none', authMethodExplicit: true, grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'] } : null
          return options?.type === 'json' ? value : value && JSON.stringify(value)
        }
        return kv.get(key, options)
      } }
      const provider = new OAuthProvider<ProviderEnv>({
        apiRoute: '/mcp', authorizeEndpoint: '/oauth/authorize?agent=1', tokenEndpoint: `${config.origin}/oauth/token`,
        accessTokenTTL: 300, refreshTokenTTL: 86_400, allowImplicitFlow: false, allowPlainPKCE: false, allowTokenExchangeGrant: false,
        clientIdMetadataDocumentEnabled: false, scopesSupported: [AGENT_CONNECT_SCOPE],
        resourceMetadata: { resource: config.resource, scopes_supported: [AGENT_CONNECT_SCOPE], bearer_methods_supported: ['header'] },
        onError: () => {},
        tokenExchangeCallback: ({ props }) => {
          if (!props || typeof props.accountId !== 'string' || agentAccessRefusal(props.accountId, this.env)) throw new OAuthError('invalid_grant', { description: 'Agent access is unavailable' })
        },
        apiHandler: { fetch: async (req: Request, env: ProviderEnv) => {
          const token = req.headers.get('Authorization')?.slice(7) ?? ''
          const grant = await env.OAUTH_PROVIDER.unwrapToken<{ accountId: string }>(token)
          if (!grant || grant.audience !== config.resource || !grant.scope.includes(AGENT_CONNECT_SCOPE)) return agentResponse({ error: 'insufficient_scope' }, 403)
          if (!config.clients.some((client) => client.clientId === grant.grant.clientId)) return agentResponse({ error: 'invalid_token' }, 401)
          const accountId = grant.grant.props.accountId
          if (typeof accountId !== 'string' || grant.userId !== providerSubject(accountId)) return agentResponse({ error: 'invalid_token' }, 401)
          const refusal = agentAccessRefusal(accountId, this.env)
          if (refusal) return agentResponse({ error: refusal }, refusal === 'not_allowed' ? 403 : 503)
          return agentResponse({ accountId, clientId: grant.grant.clientId, grantId: grant.grantId, expiresAt: grant.expiresAt } satisfies ValidatedAgentGrant)
        } },
        defaultHandler: { fetch: async (req: Request, env: ProviderEnv) => {
          const url = new URL(req.url)
          if (url.pathname !== '/oauth/authorize') return agentResponse({ error: 'invalid_request' }, 404)
          const accountId = req.headers.get('X-Agent-Account')
          if (!accountId || agentAccessRefusal(accountId, this.env)) return agentResponse({ error: 'access_denied' }, 403)
          if (req.method === 'GET') {
            let auth: AuthRequest
            try { auth = await env.OAUTH_PROVIDER.parseAuthRequest(req) } catch { return agentResponse({ error: 'invalid_request' }, 400) }
            const client = config.clients.find((value) => value.clientId === auth.clientId)
            if (!client || !client.redirectUris.includes(auth.redirectUri) || auth.responseType !== 'code' || auth.codeChallengeMethod !== 'S256' || !auth.codeChallenge || !/^[\w-]{43}$/.test(auth.codeChallenge) || auth.resource !== config.resource || auth.scope.length !== 1 || auth.scope[0] !== AGENT_CONNECT_SCOPE || !auth.state) return agentResponse({ error: 'invalid_request' }, 400)
            const consentPrefix = `consent:${providerSubject(accountId)}:`
            if ((await kv.list({ prefix: consentPrefix, limit: 4 })).keys.length >= 4) return agentResponse({ error: 'temporarily_unavailable' }, 429)
            const nonce = crypto.randomUUID()
            await kv.put(`${consentPrefix}${nonce}`, JSON.stringify({ accountId, request: auth, expiresAt: now + 300_000 } satisfies Consent), { expirationTtl: 300 })
            return agentConsentPage(client.clientName, nonce, auth.redirectUri, decodeURIComponent(req.headers.get('X-Agent-Account-Label') ?? accountId))
          }
          const form = await req.formData()
          if ([...form.keys()].length !== 2 || !['allow', 'deny'].includes(String(form.get('decision'))) || !/^[-a-f0-9]{36}$/.test(String(form.get('nonce')))) return agentResponse({ error: 'invalid_request' }, 400)
          const key = `consent:${providerSubject(accountId)}:${form.get('nonce')}`
          const consent = await kv.get(key, { type: 'json' }) as Consent | null
          if (!consent || consent.accountId !== accountId || consent.expiresAt <= now || !config.clients.some((client) => client.clientId === consent.request.clientId && client.redirectUris.includes(consent.request.redirectUri))) return agentResponse({ error: 'invalid_request' }, 400)
          if (form.get('decision') === 'allow' && (await kv.list({ prefix: `grant:${providerSubject(accountId)}:`, limit: 8 })).keys.length >= 8) return agentResponse({ error: 'temporarily_unavailable' }, 429)
          await kv.delete(key)
          if (form.get('decision') === 'deny') {
            const redirect = new URL(consent.request.redirectUri)
            redirect.searchParams.set('error', 'access_denied'); redirect.searchParams.set('state', consent.request.state)
            return new Response(null, { status: 303, headers: { Location: redirect.toString() } })
          }
          const result = await env.OAUTH_PROVIDER.completeAuthorization({ request: consent.request, userId: providerSubject(accountId), metadata: {}, scope: [AGENT_CONNECT_SCOPE], props: { accountId }, revokeExistingGrants: false })
          return new Response(null, { status: 303, headers: { Location: result.redirectTo } })
        } },
      })
      // This provider version performs no background mutation. Fail explicitly if
      // a future upgrade starts one, rather than escaping transaction ownership.
      const context = { waitUntil() { throw new Error('Unsupported background OAuth work') }, passThroughOnException() {} } as unknown as Parameters<typeof provider.fetch>[2]
      return provider.fetch(request, { OAUTH_KV: providerKV } as ProviderEnv, context)
    })
  }
  async alarm(): Promise<void> {
    await this.ctx.storage.transaction(async (storage) => {
      const cursor = await storage.get<string>('sweep')
      const rows = await storage.list<{ expiration?: number }>({ prefix: 'oauth:', ...(cursor ? { startAfter: cursor } : {}), limit: 1000 })
      for (const [key, entry] of rows) if (entry.expiration !== undefined && entry.expiration <= Date.now() / 1000) await storage.delete(key)
      await storage.put('sweep', rows.size === 1000 ? [...rows.keys()][rows.size - 1] : '')
      if (rows.size === 0 && !cursor) {
        await storage.delete('rate')
        await storage.delete('sweep')
        await storage.deleteAlarm()
      } else await storage.setAlarm(Date.now() + 60_000)
    })
  }
}

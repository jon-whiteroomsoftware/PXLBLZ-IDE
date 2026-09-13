import type { AgentAccountNamespace } from './AgentAccount'
import { OAuthProvider, OAuthError, type OAuthHelpers, type AuthRequest, type ClientInfo } from '@cloudflare/workers-oauth-provider'
import { agentServiceRefusal, agentResponse, type AgentAccessEnvironment } from '../../cloudflare/agentAccess'
import { agentOAuthConfig, AGENT_CONNECT_SCOPE, isAgentRedirectUri, providerSubject, type AgentOAuthClient, type AgentOAuthSettings } from './agentOAuthConfig'
import { agentConsentPage } from './agentOAuthConsent'
import { oauthStorageKV, type OAuthStorage } from './agentOAuthStorage'

interface TransactionStorage extends OAuthStorage {
  setAlarm(time: number): Promise<void>
  getAlarm(): Promise<number | null>
  deleteAlarm(): Promise<void>
}
interface AuthorityStorage extends TransactionStorage { transaction<T>(callback: (storage: TransactionStorage) => Promise<T>): Promise<T> }
type AuthorityEnv = AgentAccessEnvironment & AgentOAuthSettings & { AGENT_ACCOUNTS?: AgentAccountNamespace }
interface ProviderEnv { OAUTH_KV: ReturnType<typeof oauthStorageKV>; OAUTH_PROVIDER: OAuthHelpers }
interface Consent { accountId: string; request: AuthRequest; expiresAt: number }
interface AuthorizationContinuation { request: AuthRequest; expiresAt: number }
export interface ValidatedAgentGrant { accountId: string; clientId: string; clientName: string; clientOrigins: string[]; grantId: string; expiresAt: number }

const DCR_CLIENT_TTL_SECONDS = 90 * 24 * 60 * 60
const DCR_CLIENT_LIMIT = 1024
const DCR_RATE_LIMIT = 10

function staticProviderClient(client: AgentOAuthClient): ClientInfo {
  return { ...client, tokenEndpointAuthMethod: 'none', authMethodExplicit: true, grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'] } as ClientInfo
}

function isCimdClientId(clientId: string | null | undefined): clientId is string {
  if (!clientId) return false
  try { const url = new URL(clientId); return url.protocol === 'https:' && url.pathname !== '/' }
  catch { return false }
}

function providerContext(_provider: OAuthProvider<ProviderEnv>) {
  return { waitUntil() { throw new Error('Unsupported background OAuth work') }, passThroughOnException() {} } as unknown as Parameters<typeof _provider.fetch>[2]
}

/** Private auth authority. Public routes supply only validated browser identity.
 * Bounded provider mutations run inside one storage transaction, never an MCP
 * request or a held rendezvous. No network-backed client discovery is enabled.
 */
export class AgentOAuthAuthority {
  constructor(private readonly ctx: { storage: AuthorityStorage }, private readonly env: AuthorityEnv) {}
  private async oauthRecord<T>(key: string): Promise<T | null> {
    const entry = await this.ctx.storage.get<{ value: string; expiration?: number }>(`oauth:${key}`)
    if (!entry || (entry.expiration !== undefined && entry.expiration <= Date.now() / 1000)) return null
    try { return JSON.parse(entry.value) as T } catch { return null }
  }
  private async requestClientId(request: Request): Promise<string | null> {
    const url = new URL(request.url)
    if (url.pathname === '/oauth/authorize') {
      if (request.method === 'GET') {
        const continuation = request.headers.get('X-Agent-Continuation')
        return continuation ? (await this.oauthRecord<AuthorizationContinuation>(`continuation:${continuation}`))?.request.clientId ?? null : url.searchParams.get('client_id')
      }
      const accountId = request.headers.get('X-Agent-Account')
      const nonce = new URLSearchParams(await request.clone().text()).get('nonce')
      if (!accountId || !nonce) return null
      return (await this.oauthRecord<Consent>(`consent:${providerSubject(accountId)}:${nonce}`))?.request.clientId ?? null
    }
    if (url.pathname === '/oauth/token') return new URLSearchParams(await request.clone().text()).get('client_id')
    if (url.pathname === '/mcp') {
      const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
      const parts = token?.split(':')
      if (parts?.length !== 3) return null
      return (await this.oauthRecord<{ clientId?: string }>(`grant:${parts[0]}:${parts[1]}`))?.clientId ?? null
    }
    if (url.pathname === '/internal/grant') {
      const accountId = request.headers.get('X-Agent-Account'), grantId = request.headers.get('X-Agent-Grant')
      if (!accountId || !grantId) return null
      return (await this.oauthRecord<{ clientId?: string }>(`grant:${providerSubject(accountId)}:${grantId}`))?.clientId ?? null
    }
    return null
  }
  /** Resolve network-backed metadata before Durable Object serialization. The
   * validated client is request-local and is never persisted as registration. */
  private async resolveCimdClient(request: Request, config: NonNullable<ReturnType<typeof agentOAuthConfig>>): Promise<{ client: ClientInfo | null; failed: boolean }> {
    const clientId = await this.requestClientId(request)
    if (!isCimdClientId(clientId)) return { client: null, failed: false }
    const emptyKV = {
      async get() { return null }, async put() {}, async delete() {},
      async list() { return { keys: [], list_complete: true, cursor: '', cacheStatus: null } },
    } as ReturnType<typeof oauthStorageKV>
    const provider = new OAuthProvider<ProviderEnv>({
      apiRoute: '/internal/cimd-api', authorizeEndpoint: '/oauth/authorize', tokenEndpoint: `${config.origin}/oauth/token`,
      clientIdMetadataDocumentEnabled: true, scopesSupported: [AGENT_CONNECT_SCOPE],
      resourceMetadata: { resource: config.resource, scopes_supported: [AGENT_CONNECT_SCOPE], bearer_methods_supported: ['header'] },
      onError: () => {}, apiHandler: { fetch: async () => agentResponse({ error: 'invalid_request' }, 404) },
      defaultHandler: { fetch: async (_req: Request, env: ProviderEnv) => {
        const client = await env.OAUTH_PROVIDER.lookupClient(clientId)
        return client ? agentResponse(client) : agentResponse({ error: 'invalid_client' }, 400)
      } },
    })
    try {
      const response = await provider.fetch(new Request(`${config.origin}/internal/cimd-client`), { OAUTH_KV: emptyKV } as ProviderEnv, providerContext(provider))
      return response.ok ? { client: await response.json() as ClientInfo, failed: false } : { client: null, failed: true }
    } catch { return { client: null, failed: true } }
  }
  async fetch(request: Request): Promise<Response> {
    const config = agentOAuthConfig(this.env)
    if (!config) return agentResponse({ error: 'temporarily_unavailable' }, 503)
    const url = new URL(request.url)
    const internalRevocation = url.pathname === '/internal/grant'
      && request.headers.get('X-Agent-Grant-Action') === 'revoke'
      && request.headers.get('X-Agent-Revocation') === '1'
    const cimd = internalRevocation
      ? { client: null, failed: false }
      : await this.resolveCimdClient(request, config)
    if (cimd.failed) return agentResponse({ error: url.pathname === '/oauth/token' ? 'invalid_client' : 'invalid_request' }, 400)
    const completed = await this.ctx.storage.transaction(async (storage) => {
      const retired: Array<{ accountId: string; grantId: string }> = []
      const response = await (async () => {
        const now = Date.now()
        const previous = await storage.get<{ start: number; count: number }>('rate')
        const rate = previous && now < previous.start + 60_000 ? previous : { start: now, count: 0 }
        // Revocation remains available after policy changes and throttling.
        const revocation = request.headers.get('X-Agent-Revocation') === '1'
        if (rate.count >= 120 && !revocation) return agentResponse({ error: 'temporarily_unavailable' }, 429)
        if (!revocation) { rate.count += 1; await storage.put('rate', rate) }
        if (await storage.getAlarm() === null) await storage.setAlarm(now + 60_000)
        if (url.pathname === '/oauth/register') {
          const previousDcr = await storage.get<{ start: number; count: number }>('dcr-rate')
          const dcrRate = previousDcr && now < previousDcr.start + 60_000 ? previousDcr : { start: now, count: 0 }
          if (dcrRate.count >= DCR_RATE_LIMIT) return agentResponse({ error: 'temporarily_unavailable' }, 429)
          dcrRate.count += 1
          await storage.put('dcr-rate', dcrRate)
        }
        const kv = oauthStorageKV(storage)
        // Static clients are deployment configuration, not persisted registrations.
        const providerKV = { ...kv, delete: async (key: string) => {
          // Observe only actual provider grant deletion, not caller token parsing.
          const match = /^grant:([^:]+):([^:]+)$/.exec(key)
          const existed = match && await kv.get(key, { type: 'json' })
          await kv.delete(key)
          if (match && existed) {
            const accountId = new TextDecoder().decode(Uint8Array.from(atob(match[1].replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)))
            if (providerSubject(accountId) !== match[1]) throw new Error('Invalid stored OAuth subject')
            retired.push({ accountId, grantId: match[2] })
          }
        }, get: async (key: string, options?: { type: 'json' }) => {
          if (key.startsWith('client:')) {
            const configured = config.clients.find((value) => key === `client:${value.clientId}`)
            const value = configured ? staticProviderClient(configured) : key === `client:${cimd.client?.clientId}` ? cimd.client : null
            if (value) return options?.type === 'json' ? value : JSON.stringify(value)
          }
          return kv.get(key, options)
        } }
        const provider = new OAuthProvider<ProviderEnv>({
          apiRoute: '/mcp', authorizeEndpoint: '/oauth/authorize', tokenEndpoint: `${config.origin}/oauth/token`,
          accessTokenTTL: 300, refreshTokenTTL: 86_400, allowImplicitFlow: false, allowPlainPKCE: false, allowTokenExchangeGrant: false,
          clientIdMetadataDocumentEnabled: false, clientRegistrationEndpoint: '/oauth/register', clientRegistrationTTL: DCR_CLIENT_TTL_SECONDS, scopesSupported: [AGENT_CONNECT_SCOPE],
          resourceMetadata: { resource: config.resource, scopes_supported: [AGENT_CONNECT_SCOPE], bearer_methods_supported: ['header'] },
          onError: () => {},
          clientRegistrationCallback: async ({ clientMetadata }) => {
            if (typeof clientMetadata.client_name !== 'string' || !clientMetadata.client_name.trim() || clientMetadata.client_name.length > 100) return { code: 'invalid_client_metadata', description: 'client_name is required and must be at most 100 characters' }
            const clients = await kv.list({ prefix: 'client:', limit: 1000 })
            const tail = clients.keys.length < 1000 ? null : await kv.list({ prefix: 'client:', cursor: clients.cursor, limit: DCR_CLIENT_LIMIT - 1000 })
            if (clients.keys.length + (tail?.keys.length ?? 0) >= DCR_CLIENT_LIMIT) return { code: 'temporarily_unavailable', description: 'Client registration capacity is full', status: 429 }
          },
          tokenExchangeCallback: ({ props }) => {
            if (!props || typeof props.accountId !== 'string' || agentServiceRefusal(this.env)) throw new OAuthError('invalid_grant', { description: 'Agent access is unavailable' })
          },
          apiHandler: { fetch: async (req: Request, env: ProviderEnv) => {
            const token = req.headers.get('Authorization')?.slice(7) ?? ''
            const grant = await env.OAUTH_PROVIDER.unwrapToken<{ accountId: string }>(token)
            if (!grant || grant.audience !== config.resource || !grant.scope.includes(AGENT_CONNECT_SCOPE)) return agentResponse({ error: 'insufficient_scope' }, 403)
            const client = await env.OAUTH_PROVIDER.lookupClient(grant.grant.clientId)
            if (!client?.clientName) return agentResponse({ error: 'invalid_token' }, 401)
            const storedGrant = await env.OAUTH_KV.get(`grant:${grant.userId}:${grant.grantId}`, { type: 'json' }) as { redirectUri?: string } | null
            if (!storedGrant?.redirectUri || !isAgentRedirectUri(storedGrant.redirectUri, client.redirectUris)) return agentResponse({ error: 'invalid_token' }, 401)
            const accountId = grant.grant.props.accountId
            if (typeof accountId !== 'string' || grant.userId !== providerSubject(accountId)) return agentResponse({ error: 'invalid_token' }, 401)
            const refusal = agentServiceRefusal(this.env)
            if (refusal) return agentResponse({ error: refusal }, 503)
            return agentResponse({ accountId, clientId: grant.grant.clientId, clientName: client.clientName, clientOrigins: [...new Set([...client.redirectUris, storedGrant.redirectUri].map(uri => new URL(uri).origin))], grantId: grant.grantId, expiresAt: grant.expiresAt } satisfies ValidatedAgentGrant)
          } },
          defaultHandler: { fetch: async (req: Request, env: ProviderEnv) => {
            const url = new URL(req.url)
            if (url.pathname === '/internal/grant') {
              const accountId = req.headers.get('X-Agent-Account')
              const grantId = req.headers.get('X-Agent-Grant')
              const action = req.headers.get('X-Agent-Grant-Action')
              if (!accountId || !grantId || !['inspect', 'revoke'].includes(action ?? '')) return agentResponse({ code: 'invalid_request' }, 400)
              const grants = await env.OAUTH_PROVIDER.listUserGrants(providerSubject(accountId), { limit: 8 })
              const grant = grants.items.find(item => item.id === grantId)
              if (action === 'revoke') {
                await env.OAUTH_PROVIDER.revokeGrant(grantId, providerSubject(accountId))
                return agentResponse({ code: 'credentials_revoked' })
              }
              const live = grant && grant.scope.includes(AGENT_CONNECT_SCOPE) && await env.OAUTH_PROVIDER.lookupClient(grant.clientId) && (grant.expiresAt === undefined || grant.expiresAt > now / 1000)
              return agentResponse(live ? { code: 'live', clientId: grant.clientId } : { code: 'revoked' })
            }
            if (url.pathname !== '/oauth/authorize') return agentResponse({ error: 'invalid_request' }, 404)
            const accountId = req.headers.get('X-Agent-Account')
            if (req.method === 'GET') {
              let auth: AuthRequest
              const continuationId = req.headers.get('X-Agent-Continuation')
              const storedContinuation = continuationId && /^[-a-f0-9]{36}$/.test(continuationId) ? await kv.get(`continuation:${continuationId}`, { type: 'json' }) as AuthorizationContinuation | null : null
              const continuation = storedContinuation && storedContinuation.expiresAt > now ? storedContinuation : null
              if (continuationId && !continuation) return agentResponse({ error: 'authorization_expired' }, 400)
              try { auth = continuation ? continuation.request : await env.OAUTH_PROVIDER.parseAuthRequest(req) } catch { return agentResponse({ error: 'invalid_request' }, 400) }
              const client = await env.OAUTH_PROVIDER.lookupClient(auth.clientId)
              if (!client || !client.clientName || !isAgentRedirectUri(auth.redirectUri, client.redirectUris) || auth.responseType !== 'code' || auth.codeChallengeMethod !== 'S256' || !auth.codeChallenge || !/^[\w-]{43}$/.test(auth.codeChallenge) || auth.resource !== config.resource || auth.scope.length !== 1 || auth.scope[0] !== AGENT_CONNECT_SCOPE || !auth.state) return agentResponse({ error: 'invalid_request' }, 400)
              if (agentServiceRefusal(this.env)) return agentResponse({ error: 'access_denied' }, 503)
              if (!accountId) {
                if (req.headers.get('X-Agent-Continuation-Start') !== '1') return agentResponse({ error: 'unauthorized' }, 401)
                const prefix = 'continuation:'
                if ((await kv.list({ prefix, limit: 64 })).keys.length >= 64) return agentResponse({ error: 'temporarily_unavailable' }, 429)
                const id = crypto.randomUUID()
                await kv.put(`${prefix}${id}`, JSON.stringify({ request: auth, expiresAt: now + 300_000 } satisfies AuthorizationContinuation), { expirationTtl: 300 })
                return agentResponse({ code: 'sign_in_required', continuation: id, clientName: client.clientName })
              }
              const consentPrefix = `consent:${providerSubject(accountId)}:`
              if ((await kv.list({ prefix: consentPrefix, limit: 4 })).keys.length >= 4) return agentResponse({ error: 'temporarily_unavailable' }, 429)
              const nonce = crypto.randomUUID()
              await kv.put(`${consentPrefix}${nonce}`, JSON.stringify({ accountId, request: auth, expiresAt: now + 300_000 } satisfies Consent), { expirationTtl: 300 })
              if (continuationId) await kv.delete(`continuation:${continuationId}`)
              return agentConsentPage(client.clientName, nonce, auth.redirectUri, decodeURIComponent(req.headers.get('X-Agent-Account-Label') ?? accountId))
            }
            if (!accountId || agentServiceRefusal(this.env)) return agentResponse({ error: 'access_denied' }, 403)
            const form = await req.formData()
            if ([...form.keys()].length !== 2 || !['allow', 'deny'].includes(String(form.get('decision'))) || !/^[-a-f0-9]{36}$/.test(String(form.get('nonce')))) return agentResponse({ error: 'invalid_request' }, 400)
            const key = `consent:${providerSubject(accountId)}:${form.get('nonce')}`
            const consent = await kv.get(key, { type: 'json' }) as Consent | null
            const consentClient = consent && await env.OAUTH_PROVIDER.lookupClient(consent.request.clientId)
            if (!consent || consent.accountId !== accountId || consent.expiresAt <= now || !consentClient || !isAgentRedirectUri(consent.request.redirectUri, consentClient.redirectUris)) return agentResponse({ error: 'invalid_request' }, 400)
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
        return provider.fetch(request, { OAUTH_KV: providerKV } as ProviderEnv, providerContext(provider))
      })()
      return { response, retired }
    })
    // No network or held editor acknowledgement runs inside auth serialization.
    // Credential revocation succeeds independently; failure to reach the editor
    // cannot be represented as confirmed editing cancellation.
    for (const retired of completed.retired) {
      try {
        await this.env.AGENT_ACCOUNTS?.get(this.env.AGENT_ACCOUNTS.idFromName(retired.accountId)).fetch(new Request('https://agent-account.internal/retire', { method: 'POST', body: JSON.stringify({ type: 'retire-grant', agentId: retired.grantId }) }))
      } catch { /* The browser's local end remains available; no cancellation claim. */ }
    }
    return completed.response
  }
  async alarm(): Promise<void> {
    await this.ctx.storage.transaction(async (storage) => {
      const cursor = await storage.get<string>('sweep')
      const rows = await storage.list<{ expiration?: number }>({ prefix: 'oauth:', ...(cursor ? { startAfter: cursor } : {}), limit: 1000 })
      for (const [key, entry] of rows) if (entry.expiration !== undefined && entry.expiration <= Date.now() / 1000) await storage.delete(key)
      await storage.put('sweep', rows.size === 1000 ? [...rows.keys()][rows.size - 1] : '')
      if (rows.size === 0 && !cursor) {
        await storage.delete('rate')
        await storage.delete('dcr-rate')
        await storage.delete('sweep')
        await storage.deleteAlarm()
      } else await storage.setAlarm(Date.now() + 60_000)
    })
  }
}

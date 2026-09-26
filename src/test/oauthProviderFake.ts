import { vi } from 'vitest'

// The node project runs with isolate: false, so imports cache whichever provider mock loads first.
// Every node test mocking this module uses one fake with the same shape across file orders.
// PXLBLZ-IDE #1147.
const providerProbe = vi.hoisted(() => ({ transactionDepth: 0, lookupDepths: [] as number[], revoked: [] as Array<[string, string]>, client: null as Record<string, unknown> | null }))
export const oauthProviderProbe = providerProbe

class FakeOAuthProvider {
  constructor(private readonly options: { defaultHandler: { fetch(request: Request, env: unknown): Promise<Response> | Response }; clientRegistrationCallback?: (input: { clientMetadata: Record<string, unknown> }) => Promise<{ status?: number } | void> }) {}
  async fetch(request: Request, env: { OAUTH_KV: { get(key: string, options: { type: 'json' }): Promise<unknown> } }) {
    const url = new URL(request.url)
    if (url.pathname === '/internal/cimd-client') return this.options.defaultHandler.fetch(request, { ...env, OAUTH_PROVIDER: { lookupClient: async () => { oauthProviderProbe.lookupDepths.push(oauthProviderProbe.transactionDepth); return oauthProviderProbe.client } } })
    if (url.pathname === '/internal/grant') {
      const grantId = request.headers.get('X-Agent-Grant') ?? ''
      return this.options.defaultHandler.fetch(request, { ...env, OAUTH_PROVIDER: {
        listUserGrants: async () => ({ items: [{ id: grantId, clientId: 'https://client.test/oauth/client.json', scope: ['pxlblz.show.connect'] }] }),
        revokeGrant: async (id: string, userId: string) => { oauthProviderProbe.revoked.push([id, userId]) },
        lookupClient: async () => null,
      } })
    }
    if (url.pathname === '/oauth/authorize' && request.headers.has('X-Agent-Continuation')) return this.options.defaultHandler.fetch(request, { ...env, OAUTH_PROVIDER: { lookupClient: async () => ({ clientId: 'client', clientName: 'Client', redirectUris: ['https://client.test/callback'] }) } })
    if (url.pathname === '/oauth/register') {
      const refusal = await this.options.clientRegistrationCallback?.({ clientMetadata: { client_name: 'Client' } })
      return new Response(null, { status: refusal?.status ?? 201 })
    }
    const clientId = url.searchParams.get('client_id')
    if (url.pathname === '/oauth/authorize' && clientId?.startsWith('https://')) return Response.json(await env.OAUTH_KV.get(`client:${clientId}`, { type: 'json' }))
    return new Response('provider')
  }
}

export function resetOAuthProviderProbe(): void {
  oauthProviderProbe.transactionDepth = 0
  oauthProviderProbe.lookupDepths = []
  oauthProviderProbe.revoked = []
  oauthProviderProbe.client = null
}

export function oauthProviderModule(): { OAuthProvider: typeof FakeOAuthProvider; OAuthError: ErrorConstructor } {
  return { OAuthProvider: FakeOAuthProvider, OAuthError: Error }
}

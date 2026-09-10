import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// This fixture has a trusted test-only consent endpoint. It is not a public route.
const fixture = `
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { oauthStorageKV } from './src/worker/agent/agentOAuthStorage';
export class Authority {
 constructor(ctx) { this.storage = ctx.storage }
 async fetch(request) {
  return this.storage.transaction(async storage => {
   const kv = oauthStorageKV(storage);
   await kv.put('client:local-client', JSON.stringify({clientId:'local-client',redirectUris:['https://client.test/callback'],tokenEndpointAuthMethod:'none',authMethodExplicit:true,grantTypes:['authorization_code','refresh_token'],responseTypes:['code']}));
   const provider = new OAuthProvider({
    apiRoute:'/mcp', apiHandler:{fetch:async(req,env,ctx)=>Response.json(ctx.props)},
    authorizeEndpoint:'/authorize',tokenEndpoint:'/token',allowPlainPKCE:false,allowImplicitFlow:false,
    accessTokenTTL:300,refreshTokenTTL:3600,scopesSupported:['connect'],onError:()=>{},
    resourceMetadata:{resource:'https://app.test/mcp',authorization_servers:['https://app.test']},
    defaultHandler:{fetch:async(req,env)=>{
     const url=new URL(req.url);
     if(url.pathname==='/authorize') {
      const auth=await env.OAUTH_PROVIDER.parseAuthRequest(req);
      const result=await env.OAUTH_PROVIDER.completeAuthorization({request:auth,userId:'opaque-account',metadata:{},scope:['connect'],props:{accountId:'github:123'},revokeExistingGrants:false});
      return Response.json(result);
     }
     if(url.pathname==='/revoke') { await env.OAUTH_PROVIDER.revokeGrant(url.searchParams.get('grant'),'opaque-account'); return new Response(null,{status:204}) }
     return new Response(null,{status:404});
    }}
   });
   return provider.fetch(request,{OAUTH_KV:kv},{waitUntil(){throw new Error('Unexpected background auth mutation')},passThroughOnException(){}});
  });
 }
}
export default {fetch(request,env){return env.AUTH.get(env.AUTH.idFromName('authority')).fetch(request)}};
`
let runtime: Miniflare
let persistence: string
let script: string
async function start() {
  return new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-06-30', durableObjects: { AUTH: { className: 'Authority', useSQLite: true } }, resourcePersistencePath: persistence }))
}
beforeAll(async () => {
  persistence = await mkdtemp(join(tmpdir(), 'pxlblz-oauth-proof-'))
  const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'ts' }, external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  script = bundle.outputFiles[0].text
  runtime = await start()
}, 30_000)
afterAll(async () => { await runtime?.dispose(); if (persistence) await rm(persistence, { recursive: true, force: true }) })
const verifier = 'a'.repeat(43)
async function code() {
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url')
  const query = new URLSearchParams({ client_id: 'local-client', redirect_uri: 'https://client.test/callback', response_type: 'code', scope: 'connect', state: 'test', code_challenge: challenge, code_challenge_method: 'S256', resource: 'https://app.test/mcp' })
  const response = await runtime.dispatchFetch(`https://app.test/authorize?${query}`)
  expect(response.status).toBe(200)
  const body = await response.json() as { redirectTo: string }
  return new URL(body.redirectTo).searchParams.get('code')!
}
async function token(fields: Record<string, string>) {
  return runtime.dispatchFetch('https://app.test/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: 'local-client', resource: 'https://app.test/mcp', ...fields }).toString() })
}
function redeem(value: string) { return token({ grant_type: 'authorization_code', code: value, redirect_uri: 'https://client.test/callback', code_verifier: verifier }) }
function refresh(value: string) { return token({ grant_type: 'refresh_token', refresh_token: value }) }
interface Tokens { access_token: string; refresh_token: string }
async function allowed(access: string) { return (await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${access}` } })).status }

it('serializes actual provider code consumption across awaited crypto and preserves other grants', async () => {
  const independent = await (await redeem(await code())).json() as Tokens
  const value = await code()
  const results = await Promise.all([redeem(value), redeem(value)])
  expect(results.map((response) => response.status).sort()).toEqual([200, 400])
  const success = await results.find((response) => response.status === 200)!.json() as Tokens
  expect(await results.find((response) => response.status === 400)!.json()).toMatchObject({ error: 'invalid_grant' })
  expect(await allowed(success.access_token)).toBe(401)
  expect(await allowed(independent.access_token)).toBe(200)
})
it('persists rotation across runtime restarts, accepts previous recovery token, rejects older tokens and revokes the family', async () => {
  const first = await (await redeem(await code())).json() as Tokens
  const refreshed = await refresh(first.refresh_token)
  const second = await refreshed.json() as Tokens
  expect(second).toHaveProperty('access_token')
  expect(refreshed.status).toBe(200)
  expect(await allowed(second.access_token)).toBe(200)
  await runtime.dispose()
  runtime = await start()
  expect(await allowed(second.access_token)).toBe(200)
  const recoveredResponse = await refresh(first.refresh_token)
  expect(recoveredResponse.status).toBe(200)
  const recovered = await recoveredResponse.json() as Tokens
  const currentResponse = await refresh(recovered.refresh_token)
  expect(currentResponse.status).toBe(200)
  const current = await currentResponse.json() as Tokens
  expect((await refresh(first.refresh_token)).status).toBe(400)
  const grant = current.access_token.split(':')[1]
  expect((await runtime.dispatchFetch(`https://app.test/revoke?grant=${grant}`)).status).toBe(204)
  expect(await allowed(current.access_token)).toBe(401)
  expect((await refresh(current.refresh_token)).status).toBe(400)
  expect((await refresh(recovered.refresh_token)).status).toBe(400)
})
it('serializes concurrent refresh recovery and rejects the supplied token after two newer rotations', async () => {
  const initial = await (await redeem(await code())).json() as Tokens
  const responses = await Promise.all([refresh(initial.refresh_token), refresh(initial.refresh_token)])
  expect(responses.map((response) => response.status)).toEqual([200, 200])
  const pairs = await Promise.all(responses.map((response) => response.json())) as Tokens[]
  // Both responses are valid access tokens. Determine the current refresh token
  // by testing each: the overwritten intermediate generation is refused.
  expect(await allowed(pairs[0].access_token)).toBe(200)
  expect(await allowed(pairs[1].access_token)).toBe(200)
  const attempts = await Promise.all(pairs.map((pair) => refresh(pair.refresh_token)))
  expect(attempts.map((response) => response.status).sort()).toEqual([200, 400])
  expect((await refresh(initial.refresh_token)).status).toBe(400)
})

import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createSessionToken } from '../../cloudflare/auth'
import { createAgentBrowserSession } from '../../agent/browserSession'
import type { createAgentEditorAdmission } from '../../agent/editorAdmission'
import { showCommandFixture } from '../../test/showCommandFixture'

let script: string
const runtimes: Miniflare[] = []
beforeAll(async () => {
  const bundle = await build({ stdin: { contents: `
    import { onRequestPost } from './src/worker/routes/agent/channel';
    export { AgentAccount } from './src/worker/agent/AgentAccount';
    export default { async fetch(request, env) {
      const command = await request.clone().json();
      const authority = { idFromName: x => x, get: () => ({ fetch: async () => {
        if (env.RACE === 'failure') throw Error('fixture authority unavailable');
        const owner = env.AGENT_ACCOUNTS.get(env.AGENT_ACCOUNTS.idFromName('end-account'));
        if (env.RACE === 'ack') await owner.fetch(new Request('https://internal', {method:'POST',body:JSON.stringify({type:'retire-grant',agentId:'grant'})}));
        if (env.RACE === 'ack') await owner.fetch(new Request('https://internal', {method:'POST',body:JSON.stringify({...command,type:'retirement-ack'})}));
        if (env.RACE === 'leave') await owner.fetch(new Request('https://internal', {method:'POST',body:JSON.stringify({...command,type:'leave'})}));
        return Response.json({code:'credentials_revoked'});
      } }) };
      return onRequestPost({request, env:{...env, AGENT_OAUTH_AUTHORITY:authority}});
    } };
  `, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  script = bundle.outputFiles[0].text
})
afterAll(async () => { await Promise.all(runtimes.map(r => r.dispose())) })
interface Namespace { idFromName(name: string): unknown; get(id: unknown): { fetch(url: string, init: RequestInit): Promise<Response> } }
async function fixture(race: 'failure' | 'ack' | 'leave') {
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-06-30', bindings: { RACE: race, SESSION_SECRET: 'end-test', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'end-account', AGENT_OAUTH_ORIGIN: 'https://app.test', AGENT_OAUTH_CLIENTS: JSON.stringify([{clientId:'client',clientName:'Client',redirectUris:['https://client.test/callback']}]) }, durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } } }))
  runtimes.push(runtime)
  const cookie = `pxlblz_session=${await createSessionToken({userId:'end-account',primaryProvider:'github',primaryHandle:null,displayName:null,avatarUrl:null},'end-test')}`
  const ns = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as Namespace
  const internal = async (body: object) => (await ns.get(ns.idFromName('end-account')).fetch('https://internal', {method:'POST',body:JSON.stringify(body)})).json() as Promise<{code:string}>
  const post = (body: object) => runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', {method:'POST',headers:{Cookie:cookie,Origin:'https://app.test','Content-Type':'application/json'},body:JSON.stringify(body)})
  const sessionId='session', showId='stock-show-100-getting-around'
  const registration=await(await post({type:'register',sessionId,showId})).json() as {registrationId:string}
  const window={registrationId:registration.registrationId,sessionId,showId}
  await post({type:'arm',...window})
  const identity={agentKind:'external',agentName:'Client',agentId:'grant',callId:'call',bindingId:'binding'}
  expect(await internal({type:'claim',...identity})).toMatchObject({code:'bound'})
  return {post,internal,window,identity,runtime}
}
it('ends the exact account slot even when authority revocation fails, without claiming Forget', async () => {
  const f=await fixture('failure')
  expect(await(await f.post({type:'forget',...f.window,bindingId:'binding',sessionId:'wrong'})).json()).toEqual({code:'not_bound_here'})
  expect(await f.internal({type:'inspect',...f.identity})).toMatchObject({code:'bound'})
  expect(await(await f.post({type:'forget',...f.window,bindingId:'binding'})).json()).toEqual({code:'disconnected_not_forgotten'})
  expect(await(await f.post({type:'poll',...f.window})).json()).toMatchObject({connection:{kind:'idle'}})
  expect(await(await f.post({type:'arm',...f.window})).json()).toMatchObject({code:'armed'})
})
it.each(['ack','leave'] as const)('keeps exact editing-end confirmation when %s races the revocation callback', async race => {
  const f=await fixture(race)
  expect(await(await f.post({type:'forget',...f.window,bindingId:'binding'})).json()).toEqual({code:'forgotten'})
  expect(await f.internal({type:'inspect',...f.identity})).not.toMatchObject({code:'bound'})
})
it('retains end-control identity after unknown transport without restoring the retired executor', async () => {
  const f=await fixture('failure')
  // Use a distinct real registration for the browser session.
  await f.post({type:'leave',...f.window})
  const request={sessionId:'browser',showId:f.window.showId,operationId:'binding:op',baseRevision:0,payloadKey:'',referenceContext:'{}',targets:[]}
  const admission={sessionId:'browser',available:()=>true,onClose:()=>()=>{},getShow:showCommandFixture,getEditorFocus:()=>({}),captureCommandContext:()=>({commandContext:{source:()=>undefined},retainedBytes:1}),beginRequest:vi.fn(()=>({request,show:showCommandFixture(),context:{}})),readOutcome:()=>({request,status:'pending'}),cancel:vi.fn(()=>({request,status:'cancelled'})),applyShow:vi.fn(),complete:vi.fn()}
  const calls:Record<string,unknown>[]=[]
  const session=createAgentBrowserSession({admission:admission as unknown as ReturnType<typeof createAgentEditorAdmission>,showId:f.window.showId,fetch:async(_url,init)=>{const body=JSON.parse(init?.body as string);calls.push(body);if(body.type==='forget')throw Error('request never reached server');const response = await f.post(body);return new Response(await response.text(), {status:response.status,headers:{'Content-Type':'application/json'}})}})
  try {
    await session.ready;await session.arm();await f.internal({type:'claim',...f.identity})
    await vi.waitFor(()=>expect(session.getConnection()).toMatchObject({kind:'bound'}))
    await f.internal({type:'relay-dispatch',accountId:'end-account',identity:f.identity,delivery:{operationId:'op',deliveryId:'begin',sequence:0,payload:{kind:'begin_edit'}}})
    expect((await session.forget()).code).toBe('unknown')
    expect(admission.cancel).toHaveBeenCalledOnce()
    expect(await f.internal({type:'inspect',...f.identity})).toMatchObject({code:'bound'})
    expect((await session.disconnect()).code).toBe('disconnected')
    expect(calls).toContainEqual(expect.objectContaining({type:'disconnect',bindingId:'binding'}))
    expect(admission.beginRequest).toHaveBeenCalledOnce();expect(admission.applyShow).not.toHaveBeenCalled()
  } finally {session.close()}
})

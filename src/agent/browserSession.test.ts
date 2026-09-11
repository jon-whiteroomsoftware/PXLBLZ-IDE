import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentBrowserSession } from './browserSession'
import type { createAgentEditorAdmission } from './editorAdmission'
import { showCommandFixture } from '@/test/showCommandFixture'

const windowIdentity = { registrationId: 'registration', sessionId: 'session', showId: 'show' }
const bound = { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Assistant' }
function setup() {
  const show = showCommandFixture()
  const request = { sessionId: 'session', showId: 'show', operationId: 'binding:op', baseRevision: 0, payloadKey: '', referenceContext: '{}', targets: ['show'] }
  const admission = {
    sessionId: 'session', available: () => true, onClose: vi.fn(() => () => {}), close: vi.fn(),
    getShow: () => structuredClone(show), getEditorFocus: () => ({}),
    captureCommandContext: () => ({ commandContext: { source: () => undefined }, retainedBytes: 1 }),
    beginRequest: vi.fn(() => ({ request, show: structuredClone(show), context: {} })),
    applyShow: vi.fn(() => ({ status: 'waiting', request })), cancel: vi.fn(() => ({ status: 'cancelled', request })),
    complete: vi.fn(), readOutcome: vi.fn(() => ({ status: 'waiting', request })),
  }
  const receives: Array<(value: Response) => void> = []
  const calls: Record<string, unknown>[] = []
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string); calls.push(body)
    if (body.type === 'register') return Response.json({ code: 'registered', registrationId: 'registration', connection: bound })
    if (body.type === 'receive') return new Promise<Response>(resolve => receives.push(resolve))
    return Response.json({ code: body.type === 'reply' ? 'received' : 'disconnected' })
  })
  const session = createAgentBrowserSession({ admission: admission as unknown as ReturnType<typeof createAgentEditorAdmission>, showId: 'show', fetch: fetcher })
  const deliver = async (payload: unknown, sequence: number, extra = {}) => {
    receives.shift()!(Response.json({ code: 'live', connection: bound, deliveries: [{ ...windowIdentity, bindingId: 'binding', operationId: 'op', deliveryId: `d${sequence}`, sequence, payload, ...extra }] }))
    await vi.waitFor(() => expect(receives.length).toBe(1))
  }
  return { admission, session, calls, receives, deliver }
}
afterEach(() => vi.useRealTimers())
describe('production browser channel session', () => {
  it('registers once and delivers through one owner, publishing the local request and replying once', async () => {
    const { session, calls, admission, deliver } = setup()
    const events: unknown[] = []; session.subscribe(event => events.push(event))
    expect(await session.ready).toEqual(windowIdentity)
    await deliver({ kind: 'begin_edit' }, 0)
    await deliver({ kind: 'commit_edit' }, 1)
    expect(admission.beginRequest).toHaveBeenCalledTimes(1)
    expect(admission.applyShow).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual(expect.objectContaining({ type: 'delivery', request: expect.objectContaining({ operationId: 'binding:op' }) }))
    expect(calls.filter(call => call.type === 'reply')).toHaveLength(2)
    expect(session.getOutcome('op').code).toBe('outcome')
    session.close(); expect(admission.close).not.toHaveBeenCalled()
  })
  it('retires synchronously before disconnect transport and refuses a held late delivery', async () => {
    const { session, admission, deliver, receives, calls } = setup()
    await session.ready
    await deliver({ kind: 'begin_edit' }, 0)
    const pending = session.disconnect()
    expect(admission.cancel).toHaveBeenCalledTimes(1)
    await pending
    receives.shift()!(Response.json({ code: 'live', connection: bound, deliveries: [{ ...windowIdentity, bindingId: 'binding', operationId: 'op', deliveryId: 'd1', sequence: 1, payload: { kind: 'commit_edit' } }] }))
    await vi.waitFor(() => expect(receives.length).toBe(1))
    expect(admission.applyShow).not.toHaveBeenCalled()
    expect(calls.filter(call => call.type === 'register')).toHaveLength(1)
    session.close()
  })
  it('refuses wrong-session deliveries before capture and does not pretend Forget is implemented', async () => {
    const { session, admission, deliver, calls } = setup()
    await session.ready
    await deliver({ kind: 'begin_edit' }, 0, { sessionId: 'old-session' })
    expect(admission.beginRequest).not.toHaveBeenCalled()
    expect(await session.forget()).toEqual({ code: 'unsupported' })
    expect(calls.some(call => call.type === 'forget')).toBe(false)
    session.close()
  })
})
it('preserves the same private operation across contact loss without re-registering or replaying', async () => {
  const { session, receives, deliver, admission, calls } = setup()
  await session.ready
  await deliver({ kind: 'begin_edit' }, 0)
  receives.shift()!(Response.json({ code: 'unavailable' }, { status: 503 }))
  await vi.waitFor(() => expect(session.getConnection().kind).toBe('contact-lost'))
  expect(session.getOutcome('op').code).toBe('outcome')
  expect(admission.cancel).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(receives.length).toBe(1), { timeout: 2000 })
  await deliver({ kind: 'commit_edit' }, 1)
  expect(admission.beginRequest).toHaveBeenCalledTimes(1)
  expect(admission.applyShow).toHaveBeenCalledTimes(1)
  expect(calls.filter(call => call.type === 'register')).toHaveLength(1)
  session.close()
})
it('returns a near-limit context unchanged and explicitly refuses oversized context and Show reads', async () => {
  const { session, admission, deliver, calls } = setup()
  await session.ready
  vi.spyOn(admission, 'getEditorFocus').mockReturnValue({ text: 'x'.repeat(1_048_000) })
  await deliver({ kind: 'get_context' }, 0)
  const first = calls.filter(call => call.type === 'reply').slice(-1)[0]!.result as { code: string; context: { text: string } }
  expect(first.code).toBe('read')
  expect(first.context.text).toHaveLength(1_048_000)
  vi.spyOn(admission, 'getEditorFocus').mockReturnValue({ text: 'x'.repeat(1_048_576) })
  await deliver({ kind: 'get_context' }, 1)
  expect(calls.filter(call => call.type === 'reply').slice(-1)[0]!.result).toEqual({ code: 'result_too_large' })
  vi.spyOn(admission, 'getShow').mockReturnValue({ ...showCommandFixture(), name: 'x'.repeat(1_048_576) })
  await deliver({ kind: 'read_show' }, 2)
  expect(calls.filter(call => call.type === 'reply').slice(-1)[0]!.result).toEqual({ code: 'result_too_large' })
  expect(admission.beginRequest).not.toHaveBeenCalled()
  session.close()
})

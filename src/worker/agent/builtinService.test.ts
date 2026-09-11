import { expect, it, vi } from 'vitest'
import { handleBuiltinCommand } from './builtinService'
import type { AgentClaim } from '../../engine/agentRendezvous'
const identity: AgentClaim = { agentKind: 'builtin', agentId: 'builtin-v1', agentName: 'Built-in', bindingId: 'binding', callId: 'call' }
const window = { registrationId: 'registration', sessionId: 'session', showId: 'show' }
function fixture() {
  const resolve = vi.fn(async () => identity as AgentClaim | undefined)
  const connect = vi.fn(async () => ({ code: 'bound' }))
  const allowance = vi.fn(async (_command: Record<string, unknown>) => ({ code: 'activated', operationId: 'operation' }))
  const deliver = vi.fn(async (_identity: AgentClaim, _envelope: Record<string, unknown>) => ({ code: 'begun', show: {}, context: {} }))
  const query = vi.fn(async () => ({ code: 'outcome', receipt: { status: 'pending' } }))
  const provider = vi.fn(async () => ({ ok: true as const, output: [{ type: 'function_call', call_id: 'done', name: 'finish_turn', arguments: '{"outcome":"apply","message":"Requested edit"}' }] }))
  return { resolve, connect, allowance, deliver, query, provider }
}
it('resolves the trusted account binding before beginning allowance work', async () => {
  const f = fixture(); f.resolve.mockResolvedValue(undefined)
  expect(await handleBuiltinCommand('account', { action: 'begin', window }, f)).toEqual({ code: 'no_live_editor' })
  expect(f.allowance).not.toHaveBeenCalled()
  f.resolve.mockResolvedValue(identity)
  await handleBuiltinCommand('account', { action: 'begin', window }, f)
  expect(f.allowance).toHaveBeenCalledWith({ type: 'begin', accountId: 'account', owner: JSON.stringify(['account', 'binding']) })
})
it('never starts a second loop when activation is duplicate', async () => {
  const f = fixture(); f.allowance.mockResolvedValue({ code: 'duplicate', operationId: 'operation' })
  expect(await handleBuiltinCommand('account', { action: 'run', window, operationId: 'operation', prompt: 'Edit' }, f)).toMatchObject({ code: 'duplicate' })
  expect(f.deliver).not.toHaveBeenCalled(); expect(f.provider).not.toHaveBeenCalled()
})
it('uses trusted binding and ordered delivery identities, then closes accounting admission', async () => {
  const f = fixture()
  await handleBuiltinCommand('account', { action: 'run', window, operationId: 'operation', prompt: 'Edit' }, f)
  expect(f.deliver.mock.calls.map(call => call[1])).toMatchObject([
    { operationId: 'operation', deliveryId: 'builtin-0', sequence: 0, payload: { kind: 'begin_edit' } },
    { operationId: 'operation', deliveryId: 'builtin-1', sequence: 1, payload: { kind: 'commit_edit' } },
  ])
  expect(f.deliver.mock.calls.every(call => call[0] === identity)).toBe(true)
  expect(f.allowance.mock.calls[f.allowance.mock.calls.length - 1][0]).toMatchObject({ type: 'finish', operationId: 'operation' })
})
it('does not dispatch or complete private work when editor contact becomes unknown', async () => {
  const f = fixture(); f.query.mockResolvedValue({ code: 'unknown' } as never)
  expect(await handleBuiltinCommand('account', { action: 'run', window, operationId: 'operation', prompt: 'Edit' }, f)).toEqual({ code: 'unknown' })
  expect(f.provider).not.toHaveBeenCalled()
  expect(f.deliver).toHaveBeenCalledOnce()
})
it('preserves an authoritative cancellation without another provider call or completion', async () => {
  const f = fixture(); f.query.mockResolvedValue({ code: 'outcome', receipt: { status: 'cancelled' } })
  expect(await handleBuiltinCommand('account', { action: 'run', window, operationId: 'operation', prompt: 'Edit' }, f)).toEqual({ code: 'outcome', receipt: { status: 'cancelled' } })
  expect(f.provider).not.toHaveBeenCalled()
  expect(f.deliver).toHaveBeenCalledOnce()
})

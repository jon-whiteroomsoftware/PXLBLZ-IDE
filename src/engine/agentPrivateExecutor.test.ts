import { describe, expect, it, vi } from 'vitest'
import { showCommandFixture } from '../test/showCommandFixture'
import { createAgentPrivateExecutor, type PrivateEditOwner } from './agentPrivateExecutor'
import type { ShowEditRequest } from './showEditAdmission'

describe('browser private edit executor', () => {
  const scope = { bindingId: 'binding', sessionId: 'session' }
  function setup() {
    let current = showCommandFixture()
    const request: ShowEditRequest = { ...scope, showId: current.id, operationId: 'binding:op', payloadKey: 'intent', referenceContext: '{}', targets: [current.id], baseRevision: 0 }
    const owner: PrivateEditOwner = {
      capture: vi.fn(() => ({ request, show: structuredClone(current), context: {}, commandContext: { source: () => undefined }, retainedBytes: 10000 })),
      apply: vi.fn(show => { current = structuredClone(show); return { status: 'applied', settlement: 'saved' } }),
      complete: vi.fn((_request, completion) => ({ status: 'completed', completion })),
      cancel: vi.fn(() => ({ status: 'cancelled' })),
      outcome: vi.fn(() => ({ status: 'applied', settlement: 'saved' })),
    }
    const executor = createAgentPrivateExecutor(scope, owner)
    const send = (sequence: number, payload: unknown) => executor.deliver({ ...scope, operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })
    return { owner, executor, send, current: () => current }
  }
  const begin = { kind: 'begin_edit', intent: 'Shorten the Clip' }
  const resize = { kind: 'command', name: 'resize_clip', arguments: { clip_id: 'clip-a', duration_ms: 9000 } }

  it('keeps commands private and adopts once through the existing owner', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, resize).code).toBe('changed')
    expect(current()).toEqual(before)
    expect(send(2, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(current()).not.toEqual(before)
    expect(send(2, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(owner.apply).toHaveBeenCalledTimes(1)
    expect(owner.capture).toHaveBeenCalledTimes(1)
  })

  it('a refused command discards preceding private changes atomically', () => {
    const { owner, send } = setup()
    send(0, begin); send(1, resize)
    expect(send(2, { ...resize, arguments: { clip_id: 'missing', duration_ms: 9000 } }).code).toBe('refused')
    expect(send(3, { kind: 'commit_edit' }).code).toBe('finished')
    expect(owner.apply).not.toHaveBeenCalled()
    expect(owner.complete).toHaveBeenCalledWith(expect.anything(), 'refused')
  })

  it('queries the surviving owner receipt after reply-cache loss without applying again', () => {
    const { executor, owner, send } = setup()
    send(0, begin); send(1, resize); send(2, { kind: 'commit_edit' })
    executor.forgetResults()
    expect(send(2, { kind: 'commit_edit' }).code).toBe('unknown')
    expect(executor.getOutcome('op')).toEqual({ code: 'outcome', receipt: { status: 'applied', settlement: 'saved' } })
    expect(owner.apply).toHaveBeenCalledTimes(1)
  })

  it('distinguishes asked completion from cancellation and rejects old binding delivery', () => {
    const { executor, owner, send } = setup()
    send(0, begin)
    expect(send(1, { kind: 'complete_edit', completion: 'asked' }).code).toBe('outcome')
    expect(owner.complete).toHaveBeenCalledWith(expect.anything(), 'asked')
    executor.retire()
    expect(send(2, { kind: 'commit_edit' }).code).toBe('retired')
    expect(owner.apply).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { showCommandFixture } from '../test/showCommandFixture'
import { MAX_AGENT_DELIVERY_RESULT_BYTES } from './agentDeliveryJournal'
import { createAgentPrivateExecutor, type PrivateEditOwner } from './agentPrivateExecutor'
import type { ShowEditRequest } from './showEditAdmission'
import { applyShowCommand } from './showCommands/registry'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import type { ShowRecordV2 } from './showCompositionV2'

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

  it('preserves one aggregate bulk change and detailed shared-instance impact through adoption', () => {
    const { owner, send, current } = setup()
    expect(send(0, { kind: 'begin_edit', intent: 'Slow both linked Clips' }).code).toBe('begun')
    const result = send(1, {
      kind: 'command', name: 'update_clips', arguments: {
        schema_version: 1,
        updates: [
          { clip_id: 'clip-a', properties: { time: { time_scale: 0.5 } } },
          { clip_id: 'clip-c', properties: { time: { time_scale: 0.5 } } },
        ],
      },
    })
    expect(result).toMatchObject({
      code: 'changed',
      changes: [{
        description: 'Updated speed on 2 Clips.',
        details: { directClipIds: ['clip-a', 'clip-c'], linkedClipIds: [], changedPaths: ['time.time_scale'] },
      }],
    })
    expect(owner.apply).not.toHaveBeenCalled()
    expect(send(2, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome' })
    expect(current().composition!.patternInstances.find(instance => instance.id === 'instance-a')!.time.timeScale).toBe(0.5)
    expect(owner.apply).toHaveBeenCalledTimes(1)
  })

  it('completes a command-only no-op without adopting or saving', () => {
    const { owner, send } = setup()
    expect(send(0, { kind: 'begin_edit', intent: 'Keep the existing brightness' }).code).toBe('begun')
    expect(send(1, {
      kind: 'command', name: 'update_clips', arguments: {
        schema_version: 1,
        updates: [{ clip_id: 'clip-a', properties: { view: { brightness: 1 } } }],
      },
    })).toEqual({ code: 'noop', changes: [] })
    expect(send(2, { kind: 'commit_edit' })).toMatchObject({
      code: 'outcome',
      receipt: { status: 'completed', completion: 'nothing-applied' },
    })
    expect(owner.complete).toHaveBeenCalledWith(expect.anything(), 'nothing-applied')
    expect(owner.apply).not.toHaveBeenCalled()
  })

  it('keeps accepted changes byte-identical through refusal, correction, and commit', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    const rename = { kind: 'command', name: 'rename_show', arguments: { name: 'Renamed Show' } }
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, rename).code).toBe('changed')
    const refusal = send(2, { ...resize, arguments: { clip_id: 'missing', duration_ms: 9000 } })
    expect(refusal.code).toBe('refused')
    expect(current()).toEqual(before)
    expect(owner.complete).not.toHaveBeenCalled()
    expect(send(3, { ...resize, arguments: { clip_id: 'clip-a', duration_ms: 8000 } }).code).toBe('changed')
    expect(send(4, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome' })
    const expectedRename = applyShowCommand(before, 'rename_show', rename.arguments)
    if (!expectedRename.ok) throw new Error('fixture rename refused')
    const expectedResize = applyShowCommand(expectedRename.record, 'resize_clip', { clip_id: 'clip-a', duration_ms: 8000 })
    if (!expectedResize.ok) throw new Error('fixture resize refused')
    expect({ ...current(), updatedAt: before.updatedAt }).toEqual({ ...expectedResize.record, updatedAt: before.updatedAt })
    expect(owner.apply).toHaveBeenCalledTimes(1)
  })

  it('keeps a refusal-only operation open for empty commit or cancellation', () => {
    const committed = setup()
    committed.send(0, begin)
    expect(committed.send(1, { ...resize, arguments: { clip_id: 'missing', duration_ms: 9000 } }).code).toBe('refused')
    expect(committed.send(2, { kind: 'commit_edit' })).toMatchObject({
      code: 'outcome',
      receipt: { status: 'completed', completion: 'nothing-applied' },
    })
    expect(committed.owner.apply).not.toHaveBeenCalled()

    const cancelled = setup()
    cancelled.send(0, begin)
    expect(cancelled.send(1, { ...resize, arguments: { clip_id: 'missing', duration_ms: 9000 } }).code).toBe('refused')
    expect(cancelled.send(2, { kind: 'cancel_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'cancelled' } })
    expect(cancelled.owner.apply).not.toHaveBeenCalled()
  })

  it('counts a refused mutation attempt against exact-resize Retry qualification', () => {
    const { owner, send } = setup()
    send(0, begin)
    expect(send(1, { ...resize, arguments: { clip_id: 'missing', duration_ms: 9000 } }).code).toBe('refused')
    expect(send(2, resize).code).toBe('changed')
    send(3, { kind: 'commit_edit' })
    expect(owner.apply).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined)
  })

  it.each(['asked', 'refused', 'nothing-applied', 'commit-refused', 'incomplete', 'service-refused', 'service-failed'] as const)('keeps explicit %s whole-turn completion terminal', completion => {
    const { owner, send } = setup()
    send(0, begin)
    expect(send(1, { kind: 'complete_edit', completion })).toMatchObject({ code: 'outcome' })
    expect(owner.complete).toHaveBeenCalledWith(expect.anything(), completion)
    expect(send(2, resize).code).toBe('finished')
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

  it('refuses a begun result whose complete observable envelope exceeds the journal limit', () => {
    const specifiedResultBytes = 1_048_576
    expect(MAX_AGENT_DELIVERY_RESULT_BYTES).toBe(specifiedResultBytes)
    const show = showCommandFixture()
    const emptyView = { show, context: { padding: '' } }
    const emptyViewBytes = new TextEncoder().encode(JSON.stringify(emptyView)).byteLength
    const context = { padding: 'x'.repeat(specifiedResultBytes - 16 - emptyViewBytes) }
    expect(new TextEncoder().encode(JSON.stringify({ show, context })).byteLength).toBe(specifiedResultBytes - 16)
    expect(new TextEncoder().encode(JSON.stringify({ code: 'begun', operationId: 'op', baseRevision: 0, show, context })).byteLength).toBeGreaterThan(specifiedResultBytes)

    let receipt: unknown
    const request: ShowEditRequest = { ...scope, showId: show.id, operationId: 'binding:op', payloadKey: 'intent', referenceContext: '{}', targets: [show.id], baseRevision: 0 }
    const owner: PrivateEditOwner = {
      capture: vi.fn(() => ({ request, show: structuredClone(show), context, commandContext: { source: () => undefined }, retainedBytes: 1000 })),
      apply: vi.fn(),
      complete: vi.fn((_request, completion) => (receipt = { status: 'completed', completion })),
      cancel: vi.fn(() => ({ status: 'cancelled' })),
      outcome: vi.fn(() => receipt),
    }
    const executor = createAgentPrivateExecutor(scope, owner)
    const delivery = { ...scope, operationId: 'op', deliveryId: 'd0', sequence: 0, payload: begin }

    expect(executor.deliver(delivery)).toEqual({ code: 'result_too_large' })
    expect(executor.deliver(delivery)).toEqual({ code: 'result_too_large' })
    expect(owner.capture).toHaveBeenCalledTimes(1)
    expect(owner.complete).toHaveBeenCalledTimes(1)
    expect(owner.complete).toHaveBeenCalledWith(request, 'service-refused')
    expect(executor.getOutcome('op')).toEqual({ code: 'outcome', receipt: { status: 'completed', completion: 'service-refused' } })
    expect(executor.deliver({ ...scope, operationId: 'next', deliveryId: 'next', sequence: 0, payload: begin })).toEqual({ code: 'capacity' })

    executor.retire()
    const freshScope = { bindingId: 'fresh-binding', sessionId: 'fresh-session' }
    const freshRequest: ShowEditRequest = { ...request, ...freshScope, operationId: 'fresh-binding:fresh' }
    const freshOwner: PrivateEditOwner = {
      ...owner,
      capture: vi.fn(() => ({ request: freshRequest, show: structuredClone(show), context: {}, commandContext: { source: () => undefined }, retainedBytes: 1000 })),
    }
    const fresh = createAgentPrivateExecutor(freshScope, freshOwner)
    expect(fresh.deliver({ ...freshScope, operationId: 'fresh', deliveryId: 'fresh', sequence: 0, payload: begin }).code).toBe('begun')
  })
})
it('expires cached results without permitting an old delivery to execute again', () => {
  vi.useFakeTimers()
  try {
    const show = showCommandFixture()
    const request: ShowEditRequest = { operationId: 'binding:op', sessionId: 'session', showId: show.id, baseRevision: 0, payloadKey: '', referenceContext: '{}', targets: [show.id] }
    const owner: PrivateEditOwner = { capture: vi.fn(() => ({ request, show, context: {}, commandContext: { source: () => undefined }, retainedBytes: 1000 })), apply: vi.fn(), cancel: vi.fn(), complete: vi.fn(), outcome: () => ({ status: 'pending' }) }
    const executor = createAgentPrivateExecutor({ bindingId: 'binding', sessionId: 'session' }, owner)
    const delivery = { bindingId: 'binding', sessionId: 'session', operationId: 'op', deliveryId: 'd', sequence: 0, payload: { kind: 'begin_edit' } }
    expect(executor.deliver(delivery).code).toBe('begun')
    vi.advanceTimersByTime(60_000)
    expect(executor.deliver(delivery).code).toBe('unknown')
    expect(owner.capture).toHaveBeenCalledTimes(1)
    expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'pending' } })
  } finally { vi.useRealTimers() }
})

describe('browser private edit executor on a v2 record', () => {
  const scope = { bindingId: 'binding', sessionId: 'session' }
  function setup() {
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    if (converted.status !== 'converted') throw new Error('Conversion')
    let current: ShowRecordV2 = converted.record
    const request: ShowEditRequest = { ...scope, showId: current.id, operationId: 'binding:op', payloadKey: 'intent', referenceContext: '{}', targets: [current.id], baseRevision: 0 }
    const owner: PrivateEditOwner = {
      capture: vi.fn(() => ({ request, show: structuredClone(current), context: {}, commandContext: {}, retainedBytes: 10000 })),
      apply: vi.fn(show => { current = structuredClone(show) as ShowRecordV2; return { status: 'applied', settlement: 'saved' } }),
      complete: vi.fn((_request, completion) => ({ status: 'completed', completion })),
      cancel: vi.fn(() => ({ status: 'cancelled' })),
      outcome: vi.fn(() => ({ status: 'applied', settlement: 'saved' })),
    }
    const executor = createAgentPrivateExecutor(scope, owner)
    const send = (sequence: number, payload: unknown) => executor.deliver({ ...scope, operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })
    return { owner, executor, send, current: () => current }
  }
  const begin = { kind: 'begin_edit', intent: 'Rename the Show' }

  it('folds the v2 catalogue over the private candidate and adopts the v2 record once', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    expect(send(0, begin).code).toBe('begun')
    const changed = send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Renamed by command' } })
    expect(changed).toMatchObject({ code: 'changed', changes: [{ command: 'rename_show' }] })
    expect(current()).toEqual(before)
    expect(send(2, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(current().name).toBe('Renamed by command')
    expect(current().version).toBe(2)
    expect(owner.apply).toHaveBeenCalledTimes(1)
  })

  it('reports a v2 no-op as noop and a v2 domain refusal with its own issues, keeping the candidate open', () => {
    const { owner, send, current } = setup()
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'command', name: 'rename_show', arguments: { name: current().name } })).toMatchObject({ code: 'noop', changes: [] })
    const refused = send(2, { kind: 'command', name: 'remove_clips', arguments: { clip_ids: ['not-a-clip'] } })
    expect(refused.code).toBe('refused')
    expect((refused as unknown as { issues: Array<{ code: string; message: string }> }).issues.length).toBeGreaterThan(0)
    expect(send(3, { kind: 'command', name: 'rename_show', arguments: { name: 'After the refusal' } }).code).toBe('changed')
    expect(send(4, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(current().name).toBe('After the refusal')
    expect(owner.apply).toHaveBeenCalledTimes(1)
  })

  it('completes a v2 operation that changed nothing without adopting', () => {
    const { owner, send } = setup()
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(owner.apply).not.toHaveBeenCalled()
    expect(owner.complete).toHaveBeenCalledWith(expect.anything(), 'nothing-applied')
  })

  it('offers no stable resize retry for a v2 candidate', () => {
    const { executor, send } = setup()
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Retryable?' } }).code).toBe('changed')
    expect(send(2, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(executor.retry('op', 'retry').code).toBe('not_qualified')
  })
})

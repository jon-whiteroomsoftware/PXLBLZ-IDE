import { describe, expect, it, vi } from 'vitest'
import { MAX_AGENT_DELIVERY_RESULT_BYTES } from './agentDeliveryJournal'
import { createAgentPrivateExecutor, type PrivateEditOwner } from './agentPrivateExecutor'
import type { ShowEditRequest } from './showEditAdmission'
import { applyShowCommandV2 } from './showCommandsV2/registry'
import { commandFixtureV2, fixtureContext } from './showCommandsV2/fixtures'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'

describe('browser private edit executor', () => {
  const scope = { bindingId: 'binding', sessionId: 'session' }
  function setup() {
    let current = commandFixtureV2()
    const request: ShowEditRequest = { ...scope, showId: current.id, operationId: 'binding:op', payloadKey: 'intent', referenceContext: '{}', targets: [current.id], baseRevision: 0 }
    const owner: PrivateEditOwner = {
      capture: vi.fn(() => ({ request, show: structuredClone(current), context: {}, commandContext: fixtureContext(), retainedBytes: 10000 })),
      apply: vi.fn(show => { current = structuredClone(show) as ShowRecordV2; return { status: 'applied', settlement: 'saved' } }),
      complete: vi.fn((_request, completion) => ({ status: 'completed', completion })),
      cancel: vi.fn(() => ({ status: 'cancelled' })),
      outcome: vi.fn(() => ({ status: 'applied', settlement: 'saved' })),
    }
    const executor = createAgentPrivateExecutor(scope, owner)
    const send = (sequence: number, payload: unknown) => executor.deliver({ ...scope, operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })
    return { owner, executor, send, current: () => current }
  }
  const begin = { kind: 'begin_edit', intent: 'Shorten the Clip' }
  const resize = { kind: 'command', name: 'resize_clip', arguments: { clip_id: 'clip-c', duration_ms: 1500 } }

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
        updates: [
          { clip_id: 'clip-a', instance_properties: { time_scale: 0.5 } },
          { clip_id: 'clip-b', instance_properties: { time_scale: 0.5 } },
        ],
      },
    })
    // v2 reports its one affected-entity vocabulary (show-command-semantics.md,
    // "One affected-entity vocabulary"): both Clips share the one runtime.
    expect(result).toMatchObject({
      code: 'changed',
      changes: [{ command: 'update_clips', details: { instances: ['inst-a'] } }],
    })
    expect((result as unknown as { changes: unknown[] }).changes).toHaveLength(1)
    expect(owner.apply).not.toHaveBeenCalled()
    expect(send(2, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome' })
    expect(current().composition.patternInstances.find(instance => instance.id === 'inst-a')!.time.timeScale).toBe(0.5)
    expect(owner.apply).toHaveBeenCalledTimes(1)
  })

  it('completes a command-only no-op without adopting or saving', () => {
    const { owner, send } = setup()
    expect(send(0, { kind: 'begin_edit', intent: 'Keep the existing brightness' }).code).toBe('begun')
    expect(send(1, {
      kind: 'command', name: 'update_clips', arguments: {
        updates: [{ clip_id: 'clip-c', appearance: { apply: { scope: 'whole-clip' }, opacity: 1 } }],
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
    const refusal = send(2, { ...resize, arguments: { clip_id: 'missing', duration_ms: 1500 } })
    expect(refusal.code).toBe('refused')
    expect(current()).toEqual(before)
    expect(owner.complete).not.toHaveBeenCalled()
    expect(send(3, { ...resize, arguments: { clip_id: 'clip-c', duration_ms: 1000 } }).code).toBe('changed')
    expect(send(4, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome' })
    const expectedRename = applyShowCommandV2(before, 'rename_show', rename.arguments, fixtureContext())
    if (expectedRename.status !== 'changed') throw new Error('fixture rename refused')
    const expectedResize = applyShowCommandV2(expectedRename.record, 'resize_clip', { clip_id: 'clip-c', duration_ms: 1000 }, fixtureContext())
    if (expectedResize.status !== 'changed') throw new Error('fixture resize refused')
    expect({ ...current(), updatedAt: before.updatedAt }).toEqual({ ...expectedResize.record, updatedAt: before.updatedAt })
    expect(owner.apply).toHaveBeenCalledTimes(1)
  })

  it('keeps a refusal-only operation open for empty commit or cancellation', () => {
    const committed = setup()
    committed.send(0, begin)
    expect(committed.send(1, { ...resize, arguments: { clip_id: 'missing', duration_ms: 1500 } }).code).toBe('refused')
    expect(committed.send(2, { kind: 'commit_edit' })).toMatchObject({
      code: 'outcome',
      receipt: { status: 'completed', completion: 'nothing-applied' },
    })
    expect(committed.owner.apply).not.toHaveBeenCalled()

    const cancelled = setup()
    cancelled.send(0, begin)
    expect(cancelled.send(1, { ...resize, arguments: { clip_id: 'missing', duration_ms: 1500 } }).code).toBe('refused')
    expect(cancelled.send(2, { kind: 'cancel_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'cancelled' } })
    expect(cancelled.owner.apply).not.toHaveBeenCalled()
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
    const show = commandFixtureV2()
    const emptyView = { show, context: { padding: '' } }
    const emptyViewBytes = new TextEncoder().encode(JSON.stringify(emptyView)).byteLength
    const context = { padding: 'x'.repeat(specifiedResultBytes - 16 - emptyViewBytes) }
    expect(new TextEncoder().encode(JSON.stringify({ show, context })).byteLength).toBe(specifiedResultBytes - 16)
    expect(new TextEncoder().encode(JSON.stringify({ code: 'begun', operationId: 'op', baseRevision: 0, show, context })).byteLength).toBeGreaterThan(specifiedResultBytes)

    let receipt: unknown
    const request: ShowEditRequest = { ...scope, showId: show.id, operationId: 'binding:op', payloadKey: 'intent', referenceContext: '{}', targets: [show.id], baseRevision: 0 }
    const owner: PrivateEditOwner = {
      capture: vi.fn(() => ({ request, show: structuredClone(show), context, commandContext: {}, retainedBytes: 1000 })),
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
      capture: vi.fn(() => ({ request: freshRequest, show: structuredClone(show), context: {}, commandContext: {}, retainedBytes: 1000 })),
    }
    const fresh = createAgentPrivateExecutor(freshScope, freshOwner)
    expect(fresh.deliver({ ...freshScope, operationId: 'fresh', deliveryId: 'fresh', sequence: 0, payload: begin }).code).toBe('begun')
  })
})
it('expires cached results without permitting an old delivery to execute again', () => {
  vi.useFakeTimers()
  try {
    const show = commandFixtureV2()
    const request: ShowEditRequest = { operationId: 'binding:op', sessionId: 'session', showId: show.id, baseRevision: 0, payloadKey: '', referenceContext: '{}', targets: [show.id] }
    const owner: PrivateEditOwner = { capture: vi.fn(() => ({ request, show, context: {}, commandContext: {}, retainedBytes: 1000 })), apply: vi.fn(), cancel: vi.fn(), complete: vi.fn(), outcome: () => ({ status: 'pending' }) }
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

  it('round-trips an identical whole Show as unchanged without adopting', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'replace_show', show: before })).toMatchObject({ code: 'unchanged' })
    expect(send(2, { kind: 'commit_edit' })).toMatchObject({
      code: 'outcome', receipt: { status: 'completed', completion: 'nothing-applied' },
    })
    expect(current()).toEqual(before)
    expect(owner.apply).not.toHaveBeenCalled()
  })

  it('replaces the composition while retaining the connected identity and name', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    const replacement = structuredClone(before)
    replacement.name = 'Ignored input name'
    replacement.composition.layers[0].name = 'Replacement Layer'
    expect(validateShowRecordV2(replacement)).toEqual([])
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'replace_show', show: replacement })).toMatchObject({
      code: 'changed', message: expect.stringContaining('name'),
      changes: [{ command: 'replace_show', targetId: before.id }],
    })
    expect(current()).toEqual(before)
    expect(send(2, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(current()).toEqual({ ...replacement, name: before.name })
    expect(owner.apply).toHaveBeenCalledTimes(1)
  })

  it('refuses a different Show id and preserves the private candidate', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'replace_show', show: { ...before, id: 'another-show' } })).toMatchObject({
      code: 'refused', reason: 'show-identity-mismatch', issues: [{ code: 'show-identity-mismatch' }],
    })
    expect(send(2, { kind: 'replace_show', show: before }).code).toBe('unchanged')
    expect(send(3, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(current()).toEqual(before)
    expect(owner.apply).not.toHaveBeenCalled()
  })

  it('refuses a structurally invalid Show with validator issues and preserves the candidate', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    expect(send(0, begin).code).toBe('begun')
    const refused = send(1, { kind: 'replace_show', show: { ...before, version: 1 } })
    expect(refused).toMatchObject({ code: 'refused', reason: 'invalid-show-record', issues: expect.any(Array) })
    expect((refused.issues as unknown[]).length).toBeGreaterThan(0)
    expect(send(2, { kind: 'replace_show', show: before }).code).toBe('unchanged')
    expect(send(3, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(current()).toEqual(before)
    expect(owner.apply).not.toHaveBeenCalled()
  })

  it('refuses an oversized Show and commits the pre-refusal candidate', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    const oversized = structuredClone(before)
    const layer = oversized.composition.layers[0]
    layer.name = ''
    const baseBytes = new TextEncoder().encode(JSON.stringify(oversized)).byteLength
    layer.name = 'x'.repeat(60_001 - baseBytes)
    expect(new TextEncoder().encode(JSON.stringify(oversized)).byteLength).toBe(60_001)

    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Kept candidate' } }).code).toBe('changed')
    expect(send(2, { kind: 'replace_show', show: oversized })).toEqual({
      code: 'refused', reason: 'show-too-large',
      issues: [{
        code: 'show-too-large',
        message: 'The Show record is 60001 bytes; replace_show accepts at most 60000 bytes. Edit this Show with the catalogue commands instead.',
      }],
    })
    expect(current()).toEqual(before)
    expect(owner.apply).not.toHaveBeenCalled()
    expect(send(3, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(current()).toEqual({ ...before, name: 'Kept candidate' })
    expect(owner.apply).toHaveBeenCalledOnce()
  })

  it('applies a later command to the replaced private Show', () => {
    const { send, current } = setup()
    const before = structuredClone(current())
    const replacement = structuredClone(before)
    replacement.composition.layers[0].name = 'Replacement Layer'
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'replace_show', show: replacement }).code).toBe('changed')
    expect(send(2, { kind: 'command', name: 'rename_show', arguments: { name: 'Renamed after replacement' } }).code).toBe('changed')
    expect(send(3, { kind: 'commit_edit' }).code).toBe('outcome')
    expect(current().composition.layers[0].name).toBe('Replacement Layer')
    expect(current().name).toBe('Renamed after replacement')
  })

  it('discards a whole replacement on cancel', () => {
    const { owner, send, current } = setup()
    const before = structuredClone(current())
    const replacement = structuredClone(before)
    replacement.composition.layers[0].name = 'Replacement Layer'
    expect(send(0, begin).code).toBe('begun')
    expect(send(1, { kind: 'replace_show', show: replacement }).code).toBe('changed')
    expect(send(2, { kind: 'cancel_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'cancelled' } })
    expect(current()).toEqual(before)
    expect(owner.apply).not.toHaveBeenCalled()
  })

  it('refuses replacement when no edit is open', () => {
    const { owner, send, current } = setup()
    expect(send(0, { kind: 'replace_show', show: current() })).toEqual({ code: 'unknown' })
    expect(owner.apply).not.toHaveBeenCalled()
  })

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

})

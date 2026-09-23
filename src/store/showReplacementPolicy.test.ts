import { describe, expect, it } from 'vitest'
import { hasAnyQueuedShowPersistence, queueShowPersistence } from './showReplacementPolicy'

function deferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('Show persistence queue', () => {
  it('has no queued persistence before a save starts', () => {
    expect(hasAnyQueuedShowPersistence()).toBe(false)
  })

  it('tracks a pending save until it settles', async () => {
    const gate = deferred()
    const save = queueShowPersistence('pending-show', () => gate.promise)

    expect(hasAnyQueuedShowPersistence()).toBe(true)
    await Promise.resolve()
    expect(hasAnyQueuedShowPersistence()).toBe(true)
    gate.resolve()
    await save
    expect(hasAnyQueuedShowPersistence()).toBe(false)
  })

  it('clears a rejected save', async () => {
    const gate = deferred()
    const save = queueShowPersistence('rejected-show', () => gate.promise)

    expect(hasAnyQueuedShowPersistence()).toBe(true)
    gate.reject(new Error('save failed'))
    await expect(save).rejects.toThrow('save failed')
    expect(hasAnyQueuedShowPersistence()).toBe(false)
  })

  it('stays queued until saves for both Show ids settle', async () => {
    const firstGate = deferred()
    const secondGate = deferred()
    const first = queueShowPersistence('first-show', () => firstGate.promise)
    const second = queueShowPersistence('second-show', () => secondGate.promise)

    expect(hasAnyQueuedShowPersistence()).toBe(true)
    firstGate.resolve()
    await first
    expect(hasAnyQueuedShowPersistence()).toBe(true)
    secondGate.resolve()
    await second
    expect(hasAnyQueuedShowPersistence()).toBe(false)
  })
})

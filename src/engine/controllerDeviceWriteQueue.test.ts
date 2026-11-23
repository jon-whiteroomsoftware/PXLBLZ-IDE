import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetControllerDeviceWriteQueue,
  hasPendingControllerDeviceWrites,
  queueControllerDeviceWrite,
  whenControllerDeviceWritesIdle,
} from './controllerDeviceWriteQueue'

beforeEach(() => __resetControllerDeviceWriteQueue())

describe('Controller device write queue', () => {
  it('serializes writes to one Controller while allowing other Controllers to proceed', async () => {
    const events: string[] = []
    let releaseFirst!: () => void
    const first = queueControllerDeviceWrite('controller-a', async () => {
      events.push('a1:start')
      await new Promise<void>((resolve) => { releaseFirst = resolve })
      events.push('a1:end')
    })
    const second = queueControllerDeviceWrite('controller-a', async () => {
      events.push('a2:start')
    })
    const other = queueControllerDeviceWrite('controller-b', async () => {
      events.push('b1:start')
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['a1:start', 'b1:start'])

    releaseFirst()
    await Promise.all([first, second, other])
    expect(events).toEqual(['a1:start', 'b1:start', 'a1:end', 'a2:start'])
  })

  it('keeps the queue usable after a failed write', async () => {
    await expect(queueControllerDeviceWrite('controller-a', async () => {
      throw new Error('write failed')
    })).rejects.toThrow('write failed')

    await expect(queueControllerDeviceWrite('controller-a', async () => 'next')).resolves.toBe('next')
  })

  function deferredWrite() {
    let settle!: { resolve: () => void; reject: (error: Error) => void }
    const write = () => new Promise<void>((resolve, reject) => { settle = { resolve, reject } })
    return { write, settle: () => settle }
  }

  const flushMicrotasks = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  }

  it.each(['fulfil', 'reject'] as const)(
    'reports pending from enqueue until the last appended write settles (%s) (#1268)',
    async (outcome) => {
      expect(hasPendingControllerDeviceWrites('controller-a')).toBe(false)
      const a = deferredWrite()
      const first = queueControllerDeviceWrite('controller-a', a.write)
      // Pending before the callback has even started.
      expect(hasPendingControllerDeviceWrites('controller-a')).toBe(true)
      expect(hasPendingControllerDeviceWrites('controller-b')).toBe(false)
      let idle = false
      void whenControllerDeviceWritesIdle('controller-a').then(() => { idle = true })
      const b = deferredWrite()
      const second = queueControllerDeviceWrite('controller-a', b.write)
      first.catch(() => {})
      second.catch(() => {})

      await flushMicrotasks()
      a.settle().resolve()
      await flushMicrotasks()
      expect(hasPendingControllerDeviceWrites('controller-a')).toBe(true)
      expect(idle).toBe(false)

      if (outcome === 'fulfil') b.settle().resolve()
      else b.settle().reject(new Error('write failed'))
      await flushMicrotasks()
      expect(hasPendingControllerDeviceWrites('controller-a')).toBe(false)
      expect(idle).toBe(true)
    },
  )

  it('resolves the idle wait at once for a Controller with no writes (#1268)', async () => {
    let idle = false
    void whenControllerDeviceWritesIdle('controller-a').then(() => { idle = true })
    await flushMicrotasks()
    expect(idle).toBe(true)
  })
})

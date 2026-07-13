import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetControllerDeviceWriteQueue,
  queueControllerDeviceWrite,
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
})

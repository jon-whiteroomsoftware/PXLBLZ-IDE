import {
  __resetControllerProfileWriteQueue,
  queueControllerProfileWrite,
  waitForControllerProfileWrites,
} from './controllerProfileWriteQueue'

beforeEach(() => __resetControllerProfileWriteQueue())

describe('Controller Profile write queue', () => {
  it('serializes writes for one profile and exposes a drain barrier for Push', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const first = queueControllerProfileWrite('profile-1', async () => {
      order.push('first:start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      order.push('first:end')
    })
    const second = queueControllerProfileWrite('profile-1', async () => {
      order.push('second')
    })
    let drained = false
    const drain = waitForControllerProfileWrites().then(() => {
      drained = true
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    expect(drained).toBe(false)

    releaseFirst()
    await Promise.all([first, second, drain])
    expect(order).toEqual(['first:start', 'first:end', 'second'])
    expect(drained).toBe(true)
  })
})

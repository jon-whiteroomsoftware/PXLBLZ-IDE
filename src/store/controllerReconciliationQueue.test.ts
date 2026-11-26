import { describe, expect, it } from 'vitest'
import { ControllerReconciliationQueue } from './controllerReconciliationQueue'

describe('Controller reconciliation runs', () => {
  it('folds pending and in-flight edits into one run and retains the Controller lease', async () => {
    const queue = new ControllerReconciliationQueue()
    const target = { ip: '192.168.8.224', deviceId: 'fixture-device' }
    const background = { kind: 'background' } as const
    const profileChange = { kind: 'background', profileChanged: true } as const
    let starts = 0
    let entered!: () => void
    let releaseSave!: () => void
    const saving = new Promise<void>((resolve) => { entered = resolve })
    const saved = new Promise<void>((resolve) => { releaseSave = resolve })

    const first = queue.request('profile', background, async (run) => {
      starts += 1
      expect(run.next()).toEqual({ kind: 'manual' })
      const initial = run.claim(target)
      expect(initial).toHaveProperty('lease')
      entered()
      await saved
      expect(run.next()).toEqual(profileChange)
      expect(run.claim(target)).toEqual(initial)
      expect(run.next()).toBeUndefined()
    })
    const pending = queue.request('profile', { kind: 'manual' }, async () => { starts += 1 })
    expect(pending).toBe(first)
    await saving

    const alias = queue.request('alias', background, async (run) => {
      expect(run.next()).toBe(background)
      const claim = run.claim(target)
      if (!('wait' in claim)) throw new Error('Controller lease was released before the run drained')
      await claim.wait
      expect(run.claim(target)).toHaveProperty('lease')
    })
    const folded = queue.request('profile', profileChange, async () => { starts += 1 })
    expect(folded).toBe(first)
    expect(queue.request('profile', background, async () => { starts += 1 })).toBe(first)
    releaseSave()
    await Promise.all([first, alias])
    expect(starts).toBe(1)
    expect(queue.busy('profile')).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Page } from '@playwright/test'
import {
  v2SaveReachedStorage,
  waitForV2BarrierSave,
} from '../../e2e/support/showBackingRecords'

interface FakeShowRow {
  id: string
  version: 2
  updatedAt: number
}

interface FakeApiResponse {
  ok: () => boolean
  json: () => Promise<{ shows: FakeShowRow[] }>
}

type ShowsScript = FakeShowRow[][] | ((call: number) => FakeShowRow[])

function fakeBarrierPage(script: ShowsScript): { page: Page; getCalls: () => number } {
  let calls = 0
  const resolveShows = (call: number): FakeShowRow[] => (
    typeof script === 'function' ? script(call) : script[Math.min(call, script.length - 1)]!
  )
  const get = async (): Promise<FakeApiResponse> => {
    const shows = resolveShows(calls)
    calls += 1
    return { ok: () => true, json: async () => ({ shows }) }
  }
  const fake = {
    url: () => 'studio/shows/wiring-target',
    isClosed: () => false,
    waitForTimeout: async () => {},
    context: () => ({ request: { get } }),
  }
  return { page: fake as unknown as Page, getCalls: () => calls }
}

let previousBacking: string | undefined

beforeEach(() => {
  previousBacking = process.env.PXLBLZ_SHOW_BACKING
  process.env.PXLBLZ_SHOW_BACKING = 'v2'
})

afterEach(() => {
  if (previousBacking === undefined) delete process.env.PXLBLZ_SHOW_BACKING
  else process.env.PXLBLZ_SHOW_BACKING = previousBacking
})

describe('v2SaveReachedStorage against the barrier-start snapshot', () => {
  it('returns false when the stored revision has not advanced past the snapshot', async () => {
    const { page } = fakeBarrierPage([[{ id: 'wiring-same-revision', version: 2, updatedAt: 10 }]])
    await expect(v2SaveReachedStorage(page, 'wiring-same-revision', 10)).resolves.toBe(false)
  })

  it('returns true once the stored revision advances past the snapshot', async () => {
    const { page } = fakeBarrierPage([[{ id: 'wiring-advanced-revision', version: 2, updatedAt: 20 }]])
    await expect(v2SaveReachedStorage(page, 'wiring-advanced-revision', 10)).resolves.toBe(true)
  })

  it('returns false when no version-2 document exists', async () => {
    const { page } = fakeBarrierPage([[]])
    await expect(v2SaveReachedStorage(page, 'wiring-absent-revision', 10)).resolves.toBe(false)
  })
})

describe('waitForV2BarrierSave', () => {
  it('takes the snapshot at barrier start: mere existence never satisfies it', async () => {
    const { page, getCalls } = fakeBarrierPage([[{ id: 'wiring-exists-is-not-a-save', version: 2, updatedAt: 10 }]])
    await expect(waitForV2BarrierSave(page, 'wiring-exists-is-not-a-save', 250)).rejects.toThrow(/never observed/)
    expect(getCalls()).toBeGreaterThanOrEqual(2)
  })

  it('resolves when a later read advances past the barrier-start revision', async () => {
    const rows = (revision: number): FakeShowRow[] => [{ id: 'wiring-advance-resolves', version: 2, updatedAt: revision }]
    const { page, getCalls } = fakeBarrierPage((call) => rows(call < 2 ? 10 : 12))
    await waitForV2BarrierSave(page, 'wiring-advance-resolves', 5_000)
    expect(getCalls()).toBeGreaterThanOrEqual(2)
  })

  it('treats an appearing document as a save', async () => {
    const { page } = fakeBarrierPage((call) => (
      call < 2 ? [] : [{ id: 'wiring-appearing-document', version: 2, updatedAt: 5 }]
    ))
    await waitForV2BarrierSave(page, 'wiring-appearing-document', 5_000)
  })

  it('keeps waiting while the document stays absent', async () => {
    const { page } = fakeBarrierPage([[]])
    await expect(waitForV2BarrierSave(page, 'wiring-still-absent', 250)).rejects.toThrow(/never observed/)
  })
})

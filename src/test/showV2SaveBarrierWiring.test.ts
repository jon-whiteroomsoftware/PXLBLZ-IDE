import { describe, expect, it } from 'vitest'
import type { Page } from '@playwright/test'
import {
  seedShowV2,
  storedShowV2RevisionMatchesAnchor,
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

function fakeBarrierPage(
  script: ShowsScript,
  pageStamp?: (storedReadCount: number) => number | undefined,
): { page: Page; getCalls: () => number } {
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
    evaluate: async () => pageStamp?.(calls),
    context: () => ({ request: { get } }),
  }
  return { page: fake as unknown as Page, getCalls: () => calls }
}

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

  it('waits for the page pilot after an earlier save advances storage', async () => {
    const id = 'wiring-queued-last-edit'
    const rows = (revision: number): FakeShowRow[] => [{ id, version: 2, updatedAt: revision }]
    const { page, getCalls } = fakeBarrierPage(
      (call) => rows(call < 2 ? 10 : call === 2 ? 12 : 14),
      (storedReadCount) => storedReadCount < 2 ? 12 : 14,
    )
    await waitForV2BarrierSave(page, id, 5_000)
    expect(getCalls()).toBe(4)
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

interface FakeStoredRow {
  id: string
  version: number
  updatedAt: number
}

/**
 * A barrier page whose Show was seeded through the real `seedShowV2` path,
 * so the barrier's anchor is the seeded revision, exactly as in the suite.
 * Seeding converts in the page and creates through POST; every GET serves
 * whatever `v2Script` returns, so a save can already have landed before the
 * barrier runs.
 */
function fakeSeededBarrierPage(
  id: string,
  seededRevision: number,
  v2Script: (call: number) => FakeStoredRow[],
): { page: Page; getCalls: () => number } {
  let calls = 0
  const get = async (): Promise<{ ok: () => boolean; json: () => Promise<{ shows: FakeStoredRow[] }> }> => {
    const shows = v2Script(calls)
    calls += 1
    return { ok: () => true, json: async () => ({ shows }) }
  }
  const post = async () => ({ ok: () => true, status: () => 201, text: async () => '' })
  const fake = {
    url: () => `studio/shows/${id}`,
    isClosed: () => false,
    waitForTimeout: async () => {},
    goto: async () => undefined,
    evaluate: async (_: unknown, argument: unknown) => (
      typeof argument === 'string' ? undefined : {
        status: 'converted',
        record: { id, version: 2, updatedAt: seededRevision },
      }
    ),
    context: () => ({ request: { get, post } }),
  }
  return { page: fake as unknown as Page, getCalls: () => calls }
}

async function seed(page: Page, id: string): Promise<void> {
  await seedShowV2(page, { id }, id)
}

describe('waitForV2BarrierSave against its pre-gesture anchor', () => {
  it('succeeds when the save landed before the barrier was reached', async () => {
    const id = 'wiring-save-before-barrier'
    const v2 = (revision: number): FakeStoredRow[] => [{ id, version: 2, updatedAt: revision }]
    const { page, getCalls } = fakeSeededBarrierPage(id, 10, () => v2(12))
    await seed(page, id)
    // The stored revision already advanced past the seeded anchor before the
    // barrier's first read. Against barrier-start snapshotting this rejects:
    // the snapshot would be 12 and no later read advances past it.
    await waitForV2BarrierSave(page, id, 300)
    expect(getCalls()).toBe(1)
  })

  it('succeeds when the save lands after the barrier starts', async () => {
    const id = 'wiring-save-after-barrier'
    const v2 = (revision: number): FakeStoredRow[] => [{ id, version: 2, updatedAt: revision }]
    const { page } = fakeSeededBarrierPage(id, 10, (call) => v2(call < 2 ? 10 : 12))
    await seed(page, id)
    await waitForV2BarrierSave(page, id, 5_000)
  })

  it('still fails when the stored revision never advances past the anchor', async () => {
    const id = 'wiring-no-save-after-anchor'
    const v2 = (revision: number): FakeStoredRow[] => [{ id, version: 2, updatedAt: revision }]
    const { page } = fakeSeededBarrierPage(id, 10, () => v2(10))
    await seed(page, id)
    await expect(waitForV2BarrierSave(page, id, 250)).rejects.toThrow(/never observed/)
  })

  it('a second barrier sees a save that landed before it was reached', async () => {
    const id = 'wiring-second-barrier-pre-landed'
    const v2 = (revision: number): FakeShowRow[] => [{ id, version: 2, updatedAt: revision }]
    // No seeding: the first barrier anchors at barrier start (the fallback)
    // and consumes revision 12; the second barrier must anchor at that
    // consumed revision, so the pre-landed 14 satisfies it at once. Against
    // barrier-start snapshotting the second barrier snapshots 14 and times
    // out waiting for a revision that never comes.
    const { page } = fakeBarrierPage((call) => v2(call < 2 ? 10 : call === 2 ? 12 : 14))
    await waitForV2BarrierSave(page, id, 5_000)
    await waitForV2BarrierSave(page, id, 300)
  })

  it('without any anchor falls back to requiring an advance past barrier start', async () => {
    const id = 'wiring-anchorless-prefetch-miss'
    const v2 = (revision: number): FakeShowRow[] => [{ id, version: 2, updatedAt: revision }]
    // No seeding and no earlier barrier: there is no sound pre-gesture
    // reading, so even a pre-landed save cannot satisfy the wait. This pins
    // the fallback's contract — loud timeout, never a silent pass — not the
    // fix; every current barrier site is seeded, so the fallback is idle.
    const { page } = fakeBarrierPage([v2(12)])
    await expect(waitForV2BarrierSave(page, id, 250)).rejects.toThrow(/no pre-gesture anchor/)
  })
})

describe('storedShowV2RevisionMatchesAnchor', () => {
  it('reads unchanged when the stored revision still equals the seeded anchor', async () => {
    const id = 'wiring-absence-unchanged'
    const v2 = (revision: number): FakeStoredRow[] => [{ id, version: 2, updatedAt: revision }]
    const { page } = fakeSeededBarrierPage(id, 10, () => v2(10))
    await seed(page, id)
    await expect(storedShowV2RevisionMatchesAnchor(page, id)).resolves.toEqual({
      anchor: 10,
      current: 10,
      unchanged: true,
    })
  })

  it('reads changed when the stored revision advanced past the anchor', async () => {
    const id = 'wiring-absence-advanced'
    const v2 = (revision: number): FakeStoredRow[] => [{ id, version: 2, updatedAt: revision }]
    const { page } = fakeSeededBarrierPage(id, 10, () => v2(12))
    await seed(page, id)
    await expect(storedShowV2RevisionMatchesAnchor(page, id)).resolves.toEqual({
      anchor: 10,
      current: 12,
      unchanged: false,
    })
  })

  it('reads changed for an appearing document with no anchor', async () => {
    const id = 'wiring-absence-appearing'
    const v2 = (revision: number): FakeShowRow[] => [{ id, version: 2, updatedAt: revision }]
    const { page } = fakeBarrierPage([v2(5)])
    await expect(storedShowV2RevisionMatchesAnchor(page, id)).resolves.toEqual({
      anchor: undefined,
      current: 5,
      unchanged: false,
    })
  })

  it('never consumes the anchor: a save past it still satisfies a later barrier', async () => {
    const id = 'wiring-absence-keeps-anchor'
    const v2 = (revision: number): FakeStoredRow[] => [{ id, version: 2, updatedAt: revision }]
    const { page } = fakeSeededBarrierPage(id, 10, () => v2(12))
    await seed(page, id)
    await expect(storedShowV2RevisionMatchesAnchor(page, id)).resolves.toMatchObject({ unchanged: false })
    // Against a stamp-consuming read this rejects: the consumed revision 12
    // would become the new anchor and no later read advances past it.
    await waitForV2BarrierSave(page, id, 300)
  })
})

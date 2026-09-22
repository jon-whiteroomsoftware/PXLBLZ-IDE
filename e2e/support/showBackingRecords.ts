/**
 * Readback for the v2 run of the Show suite (#1066).
 *
 * Separate from `showBacking.ts` because these need the product's own record
 * types, which the Playwright configuration's typecheck project cannot load.
 * Only `e2e/shows.auth.spec.ts` imports this module.
 */
import type { Page } from '@playwright/test'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'
import { SHOW_V2_ROUTE_PREVIEW_PARAM } from '../../src/engine/showV2RouteGate'
import { keepV2StoredRecords, selectV2BarrierAnchor, v2RevisionAdvanced } from '../../src/test/showV2HarnessDecisions'
import { ensureCurrentShowV2Binding, SHOW_V2_EDITOR_PREVIEW_PARAM, seededShowV2Stamp, showBackingIsV2, storeShowAsV2 } from './showBacking'

// The one place the repeated parameter name is checked against the product's
// own constant. A rename would otherwise leave the v2 run silently opening
// every Show on v1 and reporting it as passing.
if (SHOW_V2_EDITOR_PREVIEW_PARAM !== SHOW_V2_ROUTE_PREVIEW_PARAM) {
  throw new Error(
    `The Show backing harness targets "${SHOW_V2_EDITOR_PREVIEW_PARAM}" but the editor reads "${SHOW_V2_ROUTE_PREVIEW_PARAM}".`,
  )
}

export { storeShowAsV2 as storeSeededShowAsV2 }

/**
 * The stored v2 documents for this account.
 *
 * A row the v2 run converts, and any edit the editor saves through the
 * version-2 route, leaves the version-1 listing, so a readback helper that only
 * reads `/api/shows` would report the Show as deleted.
 */
export async function listStoredShowsV2(page: Page): Promise<ShowRecordV2[]> {
  if (!showBackingIsV2()) return []
  // Prove the currently routed Show is on the v2 backing before reading
  // storage for it: an in-app navigation reaches a new Show without the goto
  // or reload wrappers, and the previous Show's proof must not satisfy it.
  await ensureCurrentShowV2Binding(page)
  const response = await page.context().request.get('/api/shows?show-version=2')
  if (!response.ok()) return []
  // `show-version=2` sets includeV2, which returns the union of both versions'
  // rows: the product's own client filters that union with isShowRecordV2
  // (`src/engine/remotePersonalContentProvider.ts`), and so must this helper.
  // Returning it unfiltered double-counts v1 rows in listShows and lets
  // v2SaveReachedStorage mistake a v1 row for a version-2 save. Decide from
  // each record's own version field, never by subtraction.
  return keepV2StoredRecords(((await response.json()) as { shows: ShowRecordV2[] }).shows)
}

/** The stored version-2 document for one Show, if this account holds one. */
export async function findStoredShowV2(page: Page, id: string): Promise<ShowRecordV2 | undefined> {
  return (await listStoredShowsV2(page)).find((record) => record.id === id)
}

/**
 * Whether a version-2 save has reached storage for one Show since the
 * barrier's anchor revision (#1066).
 *
 * The suite's save barriers read the version-1 record shape, and nothing
 * projects a version-2 document back into it, so the v2 run cannot evaluate
 * them. It waits for the save itself instead: the document's `updatedAt`
 * advancing past the anchor, which must predate the gesture the barrier
 * guards. Comparing against a module-level stamp, or against mere existence,
 * lets a pre-existing document satisfy a barrier no save followed. An
 * appearing document still counts as a save. What the save contains is left
 * to the assertions that follow the barrier, and every test that takes this
 * path is annotated so the inventory never reports it as an unqualified pass.
 */
const observedSaveStamp = new Map<string, number>()

/** The pre-gesture anchor for one Show: the previous barrier's consumed revision, else the seeded one. */
function barrierAnchor(id: string): number | undefined {
  return selectV2BarrierAnchor({ observed: observedSaveStamp.get(id), seeded: seededShowV2Stamp(id) })
}

export async function v2SaveReachedStorage(page: Page, id: string, snapshot?: number): Promise<boolean> {
  const stored = await findStoredShowV2(page, id)
  const advanced = v2RevisionAdvanced(stored?.updatedAt, snapshot ?? barrierAnchor(id))
  if (advanced && stored !== undefined) observedSaveStamp.set(id, stored.updatedAt)
  return advanced
}

/**
 * Wait for the version-2 save one barrier guards.
 *
 * The anchor is the revision the harness knew before any gesture on this Show
 * could run — the previous barrier's consumed revision, else the revision
 * this run wrote when it seeded the version-2 document — never a read taken
 * at barrier start. A v2 edit's adoption and persistence are one awaited flow
 * in the store, so the awaited save routinely reaches storage before the
 * barrier runs: a barrier-start snapshot already contains it and waits out
 * its timeout for a second save that never comes (case 888). An unchanged
 * revision still never satisfies the wait, however long the document has
 * existed. Integer-timed like the rest of the harness.
 *
 * A Show with no anchor (never seeded and no barrier yet — no current barrier
 * site, but a refused conversion could produce one) has no sound pre-gesture
 * reading, so the wait falls back to a barrier-start snapshot for it. That
 * fallback keeps the old blindness: a save that landed before the barrier
 * started is already in the snapshot and the wait times out loudly rather
 * than passing silently.
 */
export async function waitForV2BarrierSave(page: Page, id: string, timeoutMs = 15_000): Promise<void> {
  const anchored = barrierAnchor(id)
  const snapshot = anchored ?? (await findStoredShowV2(page, id))?.updatedAt
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await v2SaveReachedStorage(page, id, snapshot)) return
    if (Date.now() >= deadline) {
      throw new Error(
        `The v2 run never observed a version-2 save for Show ${id} within ${timeoutMs}ms`
        + (anchored === undefined
          ? ` (no pre-gesture anchor; barrier-start revision ${String(snapshot)})`
          : ` (anchor revision ${String(snapshot)})`),
      )
    }
    await page.waitForTimeout(100)
  }
}

/**
 * Whether the stored version-2 document still carries its pre-gesture anchor revision (#1066).
 *
 * The absence half of the barrier pair: `waitForV2BarrierSave` waits for the
 * stored revision to advance past the anchor, while this reports whether it
 * stayed put. The comparison is strict equality in both directions — an
 * advanced revision, a deleted document, and an appearing document all read
 * as changed, mirroring `v2RevisionAdvanced`'s reading of an appearing
 * document as a save. Reads only: the observed-save stamp is never updated,
 * so a later save barrier still anchors where this read did.
 */
export async function storedShowV2RevisionMatchesAnchor(
  page: Page,
  id: string,
): Promise<{ anchor: number | undefined; current: number | undefined; unchanged: boolean }> {
  const anchor = barrierAnchor(id)
  const current = (await findStoredShowV2(page, id))?.updatedAt
  return { anchor, current, unchanged: current === anchor }
}

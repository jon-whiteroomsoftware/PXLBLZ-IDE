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
import { SHOW_V2_EDITOR_PREVIEW_PARAM, seededShowV2Stamp, showBackingIsV2, storeShowAsV2 } from './showBacking'

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
  const response = await page.context().request.get('/api/shows?show-version=2')
  if (!response.ok()) return []
  return ((await response.json()) as { shows: ShowRecordV2[] }).shows
}

/**
 * Whether a version-2 save has reached storage for one Show since this run
 * stored it (#1066).
 *
 * The suite's save barriers read the version-1 record shape, and nothing
 * projects a version-2 document back into it, so the v2 run cannot evaluate
 * them. It waits for the save itself instead: the document's `updatedAt`
 * advancing past the stamp this run wrote, or a row that was stored as version
 * 1 becoming a version-2 document at all. What the save contains is left to the
 * assertions that follow the barrier, and every test that takes this path is
 * annotated so the inventory never reports it as an unqualified pass.
 */
const observedSaveStamp = new Map<string, number>()

export async function v2SaveReachedStorage(page: Page, id: string): Promise<boolean> {
  const stored = (await listStoredShowsV2(page)).find(record => record.id === id)
  if (!stored) return false
  const seeded = observedSaveStamp.get(id) ?? seededShowV2Stamp(id)
  if (seeded === undefined) return true
  if (stored.updatedAt <= seeded) return false
  observedSaveStamp.set(id, stored.updatedAt)
  return true
}

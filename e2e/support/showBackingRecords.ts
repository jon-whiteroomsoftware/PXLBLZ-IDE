/**
 * Seeding and readback for the v2 run of the Show suite (#1066).
 *
 * Separate from `showBacking.ts` because these need the product's own record
 * types and converter, which the Playwright configuration's typecheck project
 * cannot load. Only `e2e/shows.auth.spec.ts` imports this module.
 */
import type { Page } from '@playwright/test'
import type { ShowRecord } from '../../src/engine/personalContentRecords'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'
import type { ShowV1ToV2Issue } from '../../src/engine/showRecordV1ToV2'
import { SHOW_V2_ROUTE_PREVIEW_PARAM } from '../../src/engine/showV2RouteGate'
import { markShowStoredAsV2, SHOW_V2_EDITOR_PREVIEW_PARAM, showBackingIsV2 } from './showBacking'

// The one place the repeated parameter name is checked against the product's
// own constant. A rename would otherwise leave the v2 run silently opening
// every Show on v1 and reporting it as passing.
if (SHOW_V2_EDITOR_PREVIEW_PARAM !== SHOW_V2_ROUTE_PREVIEW_PARAM) {
  throw new Error(
    `The Show backing harness targets "${SHOW_V2_EDITOR_PREVIEW_PARAM}" but the editor reads "${SHOW_V2_ROUTE_PREVIEW_PARAM}".`,
  )
}

type ConversionResult =
  | { status: 'converted'; record: ShowRecordV2 }
  | { status: 'refused'; issues: ShowV1ToV2Issue[] }

/**
 * Convert one seeded row and store it as the v2 document under the same
 * identity, the way the operator conversion does. Does nothing on the v1 run.
 *
 * The persisted row is converted rather than the record the test posted:
 * storage supplies authored defaults, and the row the editor opens is the
 * persisted one. The version-2 route replaces a stored row rather than
 * creating one, so the row must already exist.
 */
export async function storeSeededShowAsV2(page: Page, id: string): Promise<void> {
  if (!showBackingIsV2()) return
  if (!page.url().startsWith('http')) await page.goto('studio/shows')
  const listed = await page.context().request.get('/api/shows')
  if (!listed.ok()) throw new Error(`The v2 run could not list Shows: ${listed.status()} ${await listed.text()}`)
  const persisted = ((await listed.json()) as { shows: ShowRecord[] }).shows.find(show => show.id === id)
  if (!persisted) throw new Error(`The v2 run cannot convert ${id}: it is not stored as a version-1 row.`)
  const converted = await convertInPage(page, persisted)
  if (converted.status === 'refused') {
    throw new Error(`The v2 run cannot seed ${id}: conversion refused ${JSON.stringify(converted.issues)}`)
  }
  const stored = await page.context().request.put(
    `/api/shows/${encodeURIComponent(id)}?show-version=2`,
    { data: converted.record },
  )
  if (!stored.ok()) {
    throw new Error(`The v2 run could not store ${id} as a version-2 document: ${stored.status()} ${await stored.text()}`)
  }
  markShowStoredAsV2(id)
  seededSaveStamp.set(id, converted.record.updatedAt)
}

/** The `updatedAt` each seeded v2 document carried when this run stored it. */
const seededSaveStamp = new Map<string, number>()

/**
 * Whether a version-2 save has reached storage for one Show since this run
 * seeded it (#1066).
 *
 * The suite's save barriers read the version-1 record shape, and nothing
 * projects a version-2 document back into it, so the v2 run cannot evaluate
 * them. It waits for the save itself instead: the document's `updatedAt`
 * advancing past the seeded stamp, or a row that was stored as version 1
 * becoming a version-2 document at all. What the save contains is left to the
 * assertions that follow the barrier, and every test that takes this path is
 * annotated so the inventory never reports it as an unqualified pass.
 */
export async function v2SaveReachedStorage(page: Page, id: string): Promise<boolean> {
  const stored = (await listStoredShowsV2(page)).find(record => record.id === id)
  if (!stored) return false
  const seeded = seededSaveStamp.get(id)
  if (seeded === undefined) return true
  if (stored.updatedAt <= seeded) return false
  seededSaveStamp.set(id, stored.updatedAt)
  return true
}

/**
 * The stored v2 documents for this account.
 *
 * A row the v2 run stores, and any edit the editor saves through the version-2
 * route, leaves the version-1 listing, so a readback helper that only reads
 * `/api/shows` would report the Show as deleted.
 */
export async function listStoredShowsV2(page: Page): Promise<ShowRecordV2[]> {
  if (!showBackingIsV2()) return []
  const response = await page.context().request.get('/api/shows?show-version=2')
  if (!response.ok()) return []
  return ((await response.json()) as { shows: ShowRecordV2[] }).shows
}

/** The application's own converter, reached the way the oracle reaches it. */
async function convertInPage(page: Page, record: ShowRecord): Promise<ConversionResult> {
  return page.evaluate(async (source) => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { convertShowRecordV1ToV2 } = await load('/PXLBLZ-IDE/src/engine/showRecordV1ToV2.ts')
    const { DEMOS, resolveStockPatternId } = await load('/PXLBLZ-IDE/src/pixelblaze/stock/patterns.ts')
    const byCellId: Record<string, string> = {}
    for (const cell of source.cells) {
      if (cell.pattern.kind !== 'stock') continue
      const patternSource = DEMOS[resolveStockPatternId(cell.pattern.id)]
      if (patternSource) byCellId[cell.id] = patternSource
    }
    return convertShowRecordV1ToV2(source, { byCellId })
  }, record) as Promise<ConversionResult>
}

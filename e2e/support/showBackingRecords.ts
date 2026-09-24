/**
 * Version-2 seeding and readback for the authenticated Show specs (#1066, #1042).
 *
 * Separate from `showBacking.ts` because these need the product's own record
 * types, which the Playwright configuration's typecheck project cannot load.
 */
import type { Page } from '@playwright/test'
import type { ShowRecordV2 } from '../../src/engine/showCompositionV2'
import { keepV2StoredRecords, selectV2BarrierAnchor, v2BarrierCaughtUp, v2RevisionAdvanced } from '../../src/test/showV2HarnessDecisions'
import { ensureCurrentShowV2Binding, recordSeededShowV2, seededShowV2Stamp } from './showBacking'

export interface SeedShowV2Options {
  /** The Stage dimension the converter validates against; the converter's default when omitted. */
  stageDimension?: 1 | 2 | 3
  /** Adjust the converted record before it is stored. */
  edit?: (converted: ShowRecordV2) => void
}

type ConversionOutcome =
  | { status: 'converted'; record: ShowRecordV2 }
  | { status: 'refused'; issues: unknown[] }

/**
 * Store one version-1 fixture as a personal version-2 Show, without opening it.
 *
 * The record converts through the application's own converter
 * (`convertShowRecordV1ToV2`), with stock Pattern sources for its cells and
 * Pattern instances, inside the page: the converter reaches the v2 schema
 * through `?raw`, which the spec's own module loader cannot resolve. The
 * result is created through the product's own create call
 * (`POST /api/shows?show-version=2`, as `createShowV2` does), and its revision
 * becomes the save barriers' seeded anchor. A refused conversion or a failed
 * create throws with the converter's issues or the response body.
 */
export async function seedShowV2(page: Page, record: object, label: string, options: SeedShowV2Options = {}): Promise<ShowRecordV2> {
  if (!page.url().startsWith('http')) await page.goto('studio/shows')
  const outcome = await page.evaluate(async ({ source, stageDimension }) => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { convertShowRecordV1ToV2 } = await load('/PXLBLZ-IDE/src/engine/showRecordV1ToV2.ts')
    const { DEMOS, resolveStockPatternId } = await load('/PXLBLZ-IDE/src/pixelblaze/stock/patterns.ts')
    const stockSource = (pattern: { kind?: string; id?: string } | undefined): string | undefined => {
      if (pattern?.kind !== 'stock' || pattern.id === undefined) return undefined
      const resolved = resolveStockPatternId(pattern.id)
      return Object.prototype.hasOwnProperty.call(DEMOS, resolved) ? DEMOS[resolved] : undefined
    }
    const sources = (entries: Array<{ id: string; pattern?: { kind?: string; id?: string } }>) => Object.fromEntries(
      entries.flatMap((entry) => {
        const found = stockSource(entry.pattern)
        return found === undefined ? [] : [[entry.id, found]]
      }),
    )
    const input = source as { cells?: []; composition?: { patternInstances?: [] } }
    return convertShowRecordV1ToV2(source, {
      byCellId: sources(input.cells ?? []),
      byPatternInstanceId: sources(input.composition?.patternInstances ?? []),
      ...(stageDimension === undefined ? {} : { stageDimension }),
    })
  }, { source: record, stageDimension: options.stageDimension }) as ConversionOutcome
  if (outcome.status !== 'converted') {
    throw new Error(`${label} did not convert to version 2: ${JSON.stringify(outcome.issues)}`)
  }
  const converted = outcome.record
  options.edit?.(converted)
  const created = await page.context().request.post('/api/shows?show-version=2', { data: converted })
  if (!created.ok()) {
    throw new Error(`${label} could not be stored as a version-2 Show: ${created.status()} ${await created.text()}`)
  }
  recordSeededShowV2(converted.id, Number(converted.updatedAt ?? 0))
  return converted
}

/**
 * The stored v2 documents for this account.
 *
 * A version-2 document, and any edit the editor saves through the version-2
 * route, is absent from the version-1 listing, so a readback helper must read
 * `/api/shows?show-version=2`.
 */
export async function listStoredShowsV2(page: Page): Promise<ShowRecordV2[]> {
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

/** The current page's adopted version-2 pilot revision for one Show, if available. */
async function readPagePilotStamp(page: Page, id: string): Promise<number | undefined> {
  return page.evaluate(async (showId) => {
    const load = (path: string) => import(path)
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .filter(name => /\/src\/store\/showStore\.ts(?:\?|$)/.test(name)).slice(-1)[0]
    if (url === undefined) return undefined
    const { useShowStore } = await load(url)
    return useShowStore.getState().showV2Pilots[showId]?.updatedAt
  }, id)
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
 * Wait for storage to catch up with the page's last adopted version-2 edit.
 *
 * A Show's saves run through a serial queue. An earlier edit can reach storage
 * while the last edit is still queued; reloading then loses that last edit.
 * Each poll reads the page pilot again so a later adoption raises the target.
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
  let lastStoredStamp: number | undefined
  let lastPageStamp: number | undefined
  for (;;) {
    lastStoredStamp = (await findStoredShowV2(page, id))?.updatedAt
    lastPageStamp = await readPagePilotStamp(page, id)
    if (lastStoredStamp !== undefined
      && v2BarrierCaughtUp({ stored: lastStoredStamp, anchor: snapshot, page: lastPageStamp })) {
      observedSaveStamp.set(id, lastStoredStamp)
      return
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `The v2 run never observed a version-2 save for Show ${id} within ${timeoutMs}ms`
        + (anchored === undefined
          ? ` (no pre-gesture anchor; barrier-start revision ${String(snapshot)})`
          : ` (anchor revision ${String(snapshot)})`)
        + `; page revision ${String(lastPageStamp)}, stored revision ${String(lastStoredStamp)}`,
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

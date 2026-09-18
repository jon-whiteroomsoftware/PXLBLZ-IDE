/**
 * Which stored record version backs the Shows the browser suite opens (#1066).
 *
 * `e2e/shows.auth.spec.ts` is the strongest available oracle for putting the
 * existing Show editor on the v2 backend, so it runs twice against one
 * unmodified set of test bodies. The backing is chosen here and reached only
 * through the authenticated fixture and that spec's own seeding and readback
 * helpers; no test body knows which run it is in.
 *
 * `PXLBLZ_SHOW_BACKING=v2` selects the v2 run (`npm run test:e2e:shows:v2`).
 * Anything else, including an unset variable, leaves the v1 run exactly as it
 * was.
 *
 * The v2 run is a diagnostic and is expected to fail until #1066 connects the
 * remaining editor commands. It is deliberately absent from the required
 * runner suites in `wrsp.config.mjs`.
 *
 * This module imports nothing from `src`: `playwright.auth.config.ts` and
 * `e2e/fixtures/authenticated.ts` both load it, and they typecheck in a
 * project without the DOM library or Vite's asset modules. The converter runs
 * in the page instead, which is also where the equivalence oracle runs it
 * (#1065). The parts that need product types live in `showBackingRecords.ts`.
 */
import type { APIRequestContext, Page } from '@playwright/test'

export type ShowBacking = 'v1' | 'v2'

/**
 * `SHOW_V2_ROUTE_PREVIEW_PARAM` in `src/engine/showV2RouteGate.ts`, repeated
 * here because of the import restriction above.
 * `showBackingRecords.ts` fails the run if the two ever diverge, so a rename
 * cannot quietly turn the v2 run back into a second v1 run.
 */
export const SHOW_V2_EDITOR_PREVIEW_PARAM = 'show-v2-editor'

export function showBacking(): ShowBacking {
  return process.env.PXLBLZ_SHOW_BACKING?.trim() === 'v2' ? 'v2' : 'v1'
}

export function showBackingIsV2(): boolean {
  return showBacking() === 'v2'
}

/** The `updatedAt` each stored v2 document carried when this run wrote it. */
const storedAsV2 = new Map<string, number>()

/** The `updatedAt` this run stored for one Show, or undefined for a Show it did not store. */
export function seededShowV2Stamp(id: string): number | undefined {
  return storedAsV2.get(id)
}

/**
 * Remove the version-2 documents this account holds.
 *
 * A row the v2 run converts leaves the version-1 listing, so the boundary's
 * ordinary cleanup would walk straight past it and the next test on a reused
 * account would collide with the row it is trying to create.
 */
export async function removeStoredShowsV2(request: APIRequestContext): Promise<void> {
  if (!showBackingIsV2()) return
  const response = await request.get('/api/shows?show-version=2')
  if (!response.ok()) throw new Error(`GET /api/shows?show-version=2 -> ${response.status()}: ${await response.text()}`)
  for (const record of ((await response.json()) as { shows: Array<{ id: string }> }).shows) {
    const removed = await request.delete(`/api/shows/${encodeURIComponent(record.id)}`)
    if (!removed.ok()) throw new Error(`DELETE /api/shows/${record.id} -> ${removed.status()}`)
  }
  storedAsV2.clear()
}

/**
 * Make one Studio URL open on the v2 backing.
 *
 * A row this run stores as a v2 document already opens there, and adding a
 * query string to its route would break the exact-URL assertions several test
 * bodies make. A built-in Show has no stored document and cannot be given one,
 * so it uses the landed development-only preview parameter, which converts the
 * record in memory for the open session and writes nothing. Both reach the
 * same existing editor on a v2 record.
 */
export function showBackingUrl(url: string): string {
  if (!showBackingIsV2()) return url
  const [beforeHash, hash] = splitOnce(url, '#')
  const [path, search] = splitOnce(beforeHash, '?')
  if (!/(^|\/)studio(\/|$)/.test(path)) return url
  if (storedAsV2.has(routedShowId(path) ?? '')) return url
  const parameters = new URLSearchParams(search)
  if (parameters.get(SHOW_V2_EDITOR_PREVIEW_PARAM) === '1') return url
  parameters.set(SHOW_V2_EDITOR_PREVIEW_PARAM, '1')
  return `${path}?${parameters.toString()}${hash ? `#${hash}` : ''}`
}

/**
 * Route every navigation this page makes through the v2 backing.
 *
 * A test body that seeds its own version-1 row inline cannot be changed, so the
 * run converts and stores that row here, on the way to it. Without that, the
 * editor would fall back to the store's own in-memory conversion, which calls
 * `convertShowRecordV1ToV2` with no Pattern sources and is refused with
 * `missing-source-dependency`, leaving no editor mounted at all.
 *
 * `routerStore` carries `window.location.search` through in-app navigation, so
 * one loaded document keeps the preview parameter across rail clicks and
 * reloads; only `page.goto` needs this.
 */
export function installShowBacking(page: Page): void {
  if (!showBackingIsV2()) return
  const backedVersion = new Map<string, number>()
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().includes('/api/agent/channel')) return
    try {
      const body = JSON.parse(request.postData() ?? '{}') as { type?: string; showId?: string; showVersion?: number }
      if (body.type === 'register' && body.showId && body.showVersion) backedVersion.set(body.showId, body.showVersion)
    } catch { /* a malformed body is not a registration */ }
  })
  const goto = page.goto.bind(page)
  page.goto = (async (url: string, options?: Parameters<Page['goto']>[1]) => {
    const id = routedShowId(url)
    if (id !== null && !storedAsV2.has(id)) {
      if (!page.url().startsWith('http')) await goto(showBackingUrl('studio/shows'))
      await storeShowAsV2(page, id)
    }
    const response = await goto(showBackingUrl(url), options)
    if (id !== null) await waitForV2Backing(page, id, backedVersion)
    return response
  }) as Page['goto']
}

/**
 * Wait until the open editor has really adopted the v2 record for this Show.
 *
 * A Show with no stored v2 document is converted in memory, and that read
 * resolves after the first paint: until it does, the editor is mounted on the
 * v1 record, and a test that asserted in that window would report v1 behavior
 * as a v2 result. The editor's own agent registration carries the record
 * version it bound (`src/agent/browserSession.ts`), so this waits for that
 * evidence rather than for a delay, and fails loudly when it never arrives.
 */
async function waitForV2Backing(page: Page, id: string, backedVersion: Map<string, number>): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (backedVersion.get(id) === 2) return
    if (page.isClosed()) return
    await page.waitForTimeout(100)
  }
  throw new Error(
    `The v2 run opened ${id} but the editor never bound a version-2 record`
    + ` (last bound version: ${backedVersion.get(id) ?? 'none'}).`,
  )
}

/**
 * Convert one personal version-1 row and store it as the version-2 document
 * under the same identity, the way the operator conversion does.
 *
 * Silent when the id is not a stored version-1 row: a built-in Show has no row
 * to replace, and the version-2 route replaces a stored row rather than
 * creating one. A refused conversion is also left alone, so the run reports
 * what the editor really does with that record instead of failing in seeding.
 */
export async function storeShowAsV2(page: Page, id: string): Promise<void> {
  if (!showBackingIsV2() || storedAsV2.has(id)) return
  const listed = await page.context().request.get('/api/shows')
  if (!listed.ok()) return
  const persisted = ((await listed.json()) as { shows: Array<Record<string, unknown>> })
    .shows.find(show => show.id === id)
  if (!persisted) return
  const converted = await convertInPage(page, persisted)
  if (converted.status !== 'converted') return
  const stored = await page.context().request.put(
    `/api/shows/${encodeURIComponent(id)}?show-version=2`,
    { data: converted.record },
  )
  if (!stored.ok()) {
    throw new Error(`The v2 run could not store ${id} as a version-2 document: ${stored.status()} ${await stored.text()}`)
  }
  storedAsV2.set(id, Number(converted.record.updatedAt ?? 0))
}

type ConversionOutcome =
  | { status: 'converted'; record: Record<string, unknown> }
  | { status: 'refused'; issues: unknown[] }

/** The application's own converter, reached the way the equivalence oracle reaches it. */
async function convertInPage(page: Page, record: Record<string, unknown>): Promise<ConversionOutcome> {
  return page.evaluate(async (source) => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const { convertShowRecordV1ToV2 } = await load('/PXLBLZ-IDE/src/engine/showRecordV1ToV2.ts')
    const { DEMOS, resolveStockPatternId } = await load('/PXLBLZ-IDE/src/pixelblaze/stock/patterns.ts')
    const byCellId: Record<string, string> = {}
    for (const cell of (source.cells ?? []) as Array<Record<string, never>>) {
      const pattern = cell.pattern as unknown as { kind: string; id: string } | undefined
      if (pattern?.kind !== 'stock') continue
      const patternSource = DEMOS[resolveStockPatternId(pattern.id)]
      if (patternSource) byCellId[cell.id as unknown as string] = patternSource
    }
    return convertShowRecordV1ToV2(source, { byCellId })
  }, record) as Promise<ConversionOutcome>
}

/** The Show id a Studio route addresses, or null for the list route. */
function routedShowId(url: string): string | null {
  const path = splitOnce(splitOnce(url, '#')[0], '?')[0]
  const match = /(?:^|\/)studio\/shows\/([^/]+)$/.exec(path)
  return match ? match[1] : null
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator)
  return index === -1 ? [value, ''] : [value.slice(0, index), value.slice(index + 1)]
}

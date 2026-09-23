/**
 * Which stored record version backs the Shows the browser suite opens (#1066).
 *
 * `e2e/shows.auth.spec.ts` is the strongest available oracle for putting the
 * existing Show editor on the v2 backend. The required Show suite runs on v2
 * through ordinary Show URLs;
 * the unconverted-row diagnostic runs the same spec on v1. The backing is
 * chosen here and reached only through the authenticated fixture and that
 * spec's own seeding and readback helpers; no test body knows which run it is in.
 *
 * `PXLBLZ_SHOW_BACKING=v2` selects the required v2 run
 * (`npm run test:e2e:shows`). `PXLBLZ_SHOW_BACKING=v1` selects the
 * unconverted-row diagnostic (`npm run test:e2e:shows:v1`). An unset
 * variable remains v1 for other authenticated suites.
 *
 * The v1 diagnostic gates nothing; the required v2 Show suite is named by
 * `wrsp.config.mjs`.
 *
 * This module imports nothing from `src`: `playwright.auth.config.ts` and
 * `e2e/fixtures/authenticated.ts` both load it, and they typecheck in a
 * project without the DOM library or Vite's asset modules. The converter runs
 * in the page instead, which is also where the equivalence oracle runs it
 * (#1065). The parts that need product types live in `showBackingRecords.ts`.
 */
import type { APIRequestContext, Frame, Page } from '@playwright/test'
import { isBindingProofFresh, isInAppProofFresh, routedShowIdFromUrl, type V2BindingProof } from '../../src/test/showV2HarnessDecisions'

export type ShowBacking = 'v1' | 'v2'

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

interface V2BackingPageState {
  proofs: Map<string, V2BindingProof>
  navigationSequence: number
  lastGuardedShowId: string | null
  acceptedSequence: Map<string, number>
}

const backingPageStates = new WeakMap<Page, V2BackingPageState>()

/**
 * Route every navigation this page makes through the v2 backing.
 *
 * A test body that seeds its own version-1 row inline cannot be changed, so the
 * run converts and stores that row here, on the way to it. Without that, the
 * editor would fall back to the store's own in-memory conversion, which calls
 * `convertShowRecordV1ToV2` with no Pattern sources and is refused with
 * `missing-source-dependency`, leaving no editor mounted at all.
 *
 * Built-in Shows open from their native v2 catalogue records on the ordinary
 * route, while personal v1 rows are stored as v2 before navigation. Every
 * navigation still needs its own proof: registrations are keyed
 * by navigation generation, so a repeat visit re-waits for the new document
 * instead of trusting the previous visit's entry, and `page.reload` is wrapped
 * alongside `page.goto`. In-app navigations (rail rows, links, duplicate and
 * clone opens) never pass through either wrapper; the `framenavigated`
 * listener clears the guarded Show id at the main-frame route change, and the
 * next readback helper only accepts a strictly newer registration than the one
 * it last accepted for that Show before evaluating storage for it.
 */
export function installShowBacking(page: Page): void {
  if (!showBackingIsV2()) return
  const state: V2BackingPageState = { proofs: new Map(), navigationSequence: 0, lastGuardedShowId: null, acceptedSequence: new Map() }
  backingPageStates.set(page, state)
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().includes('/api/agent/channel')) return
    try {
      const body = JSON.parse(request.postData() ?? '{}') as { type?: string; showId?: string; showVersion?: number }
      if (body.type === 'register' && body.showId && body.showVersion) {
        state.proofs.set(body.showId, { version: body.showVersion, sequence: state.navigationSequence })
      }
    } catch { /* a malformed body is not a registration */ }
  })
  page.on('framenavigated', (frame: Frame) => {
    // A subframe committing must not retire anything: only the main frame's
    // route decides which Show the readback helpers evaluate storage for.
    if (frame !== page.mainFrame()) return
    // Retire the previous Show's acceptance at the route change without
    // marking the new route proven: the next readback helper re-proves the
    // new document against a strictly newer registration. Full navigations
    // also pass through here, but the goto and reload wrappers below own
    // their own generations and re-accept afterwards, so the extra bump here
    // only moves their requirement forward, never backwards.
    if (routedShowIdFromUrl(page.url()) !== state.lastGuardedShowId) {
      state.navigationSequence += 1
      state.lastGuardedShowId = null
    }
  })
  const goto = page.goto.bind(page)
  page.goto = (async (url: string, options?: Parameters<Page['goto']>[1]) => {
    const id = routedShowIdFromUrl(url)
    state.navigationSequence += 1
    const requiredSequence = state.navigationSequence
    if (id !== null && !storedAsV2.has(id)) {
      if (!page.url().startsWith('http')) await goto('studio/shows')
      await storeShowAsV2(page, id)
    }
    const response = await goto(url, options)
    if (id !== null) {
      await waitForV2Backing(page, id, state.proofs, requiredSequence)
      acceptBindingProof(state, id)
    }
    state.lastGuardedShowId = id
    return response
  }) as Page['goto']
  const reload = page.reload.bind(page)
  page.reload = (async (options?: Parameters<Page['reload']>[0]) => {
    state.navigationSequence += 1
    const requiredSequence = state.navigationSequence
    const response = await reload(options)
    const id = routedShowIdFromUrl(page.url())
    if (id !== null) {
      await waitForV2Backing(page, id, state.proofs, requiredSequence)
      acceptBindingProof(state, id)
    }
    state.lastGuardedShowId = id
    return response
  }) as Page['reload']
}

/**
 * Record the proof the wrappers just waited for as this Show's accepted one.
 *
 * A repeat in-app visit must prove the backing again rather than reuse this
 * entry, so the sequence travels with the acceptance: only a strictly newer
 * registration satisfies the next in-app arrival.
 */
function acceptBindingProof(state: V2BackingPageState, id: string): void {
  const proof = state.proofs.get(id)
  if (proof !== undefined) state.acceptedSequence.set(id, proof.sequence)
}

/**
 * Prove the currently routed Show is on the v2 backing before a readback
 * helper evaluates storage for it.
 *
 * The goto and reload wrappers prove the document they navigate to, but an
 * in-app navigation reaches a new Show without either wrapper. When the route
 * changed underneath the last guarded navigation, the previous Show's proof
 * must not satisfy this one: the framenavigated listener clears the guarded
 * id at the route change, and this helper then requires a strictly newer
 * registration than the one it last accepted for the id. The first acceptance
 * for an id still takes any version-2 registration, because without a
 * navigation boundary the document's single registration may already have
 * arrived. A Show that never binds v2 still fails loudly.
 */
export async function ensureCurrentShowV2Binding(page: Page, timeoutMs = 20_000): Promise<void> {
  if (!showBackingIsV2()) return
  const state = backingPageStates.get(page)
  if (!state) return
  const id = routedShowIdFromUrl(page.url())
  if (id === null || id === state.lastGuardedShowId) return
  const accepted = state.acceptedSequence.get(id)
  const proof = state.proofs.get(id)
  if (isInAppProofFresh(proof, accepted)) {
    state.acceptedSequence.set(id, proof!.sequence)
    state.lastGuardedShowId = id
    return
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const next = state.proofs.get(id)
    if (isInAppProofFresh(next, accepted)) {
      state.acceptedSequence.set(id, next!.sequence)
      state.lastGuardedShowId = id
      return
    }
    if (page.isClosed()) return
    await page.waitForTimeout(100)
  }
  throw new Error(
    `The v2 run navigated to ${id} in-app but the editor never bound a version-2 record`
    + ` (last bound version: ${state.proofs.get(id)?.version ?? 'none'}).`,
  )
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
async function waitForV2Backing(
  page: Page,
  id: string,
  proofs: Map<string, V2BindingProof>,
  requiredSequence: number,
): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (isBindingProofFresh(proofs.get(id), requiredSequence)) return
    if (page.isClosed()) return
    await page.waitForTimeout(100)
  }
  throw new Error(
    `The v2 run opened ${id} but the editor never bound a version-2 record`
    + ` (last bound version: ${proofs.get(id)?.version ?? 'none'}).`,
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

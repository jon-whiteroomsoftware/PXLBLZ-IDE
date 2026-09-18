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
 * project without the DOM library or Vite's asset modules. The parts that need
 * product types live in `showBackingRecords.ts`, which the spec loads.
 */
import type { Page } from '@playwright/test'

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

/**
 * Shows this run has stored as version-2 documents.
 *
 * Such a row opens the v2 backing from storage, so it must not also carry the
 * preview parameter: several test bodies assert the Show route's exact URL,
 * and a row that reaches v2 the way production will should not need a
 * development-only query string to get there.
 */
const storedAsV2 = new Set<string>()

export function markShowStoredAsV2(id: string): void {
  storedAsV2.add(id)
}

/**
 * Make one Studio URL open on the v2 backing.
 *
 * A row this suite stores as a v2 document already opens there. Everything
 * else the spec opens - a built-in Show, and a row a test body seeds inline as
 * v1 - has no stored v2 document, so the run uses the landed development-only
 * preview parameter, which converts the record in memory for the open session
 * and writes nothing. Both reach the same existing editor on a v2 record.
 */
export function showBackingUrl(url: string): string {
  if (!showBackingIsV2()) return url
  const [beforeHash, hash] = splitOnce(url, '#')
  const [path, search] = splitOnce(beforeHash, '?')
  if (!/(^|\/)studio(\/|$)/.test(path)) return url
  if (storedAsV2.has(path.split('/').at(-1) ?? '')) return url
  const parameters = new URLSearchParams(search)
  if (parameters.get(SHOW_V2_EDITOR_PREVIEW_PARAM) === '1') return url
  parameters.set(SHOW_V2_EDITOR_PREVIEW_PARAM, '1')
  return `${path}?${parameters.toString()}${hash ? `#${hash}` : ''}`
}

/**
 * Route every navigation this page makes through {@link showBackingUrl}.
 *
 * `routerStore` carries `window.location.search` through in-app navigation, so
 * one loaded document keeps the parameter across rail clicks and reloads; only
 * the initial `page.goto` needs rewriting.
 */
export function installShowBacking(page: Page): void {
  if (!showBackingIsV2()) return
  const goto = page.goto.bind(page)
  page.goto = ((url: string, options?: Parameters<Page['goto']>[1]) => goto(showBackingUrl(url), options)) as Page['goto']
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator)
  return index === -1 ? [value, ''] : [value.slice(0, index), value.slice(index + 1)]
}

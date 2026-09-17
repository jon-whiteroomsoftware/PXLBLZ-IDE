/**
 * The one gate the whole v2 Show route follows (#1056 slice 6).
 *
 * Every consumer that must move together - the editor route, the Show list,
 * fresh-Show creation and the store's v2 listing - asks this function, so
 * #1039's activation is the single edit below: set `SHOW_V2_ROUTE_DEFAULT` to
 * `true`. Until then the gate is a development-only opt-in, and a production
 * build answers `false` however the URL is written.
 *
 * Specification section 10 forbids a window where the editor holds a v2 record
 * while commands assume v1, which is exactly why this is one predicate rather
 * than a flag each surface reads for itself.
 */

/**
 * Whether a v2 record is the ordinary Show route. #1039 flips this to `true`
 * together with the store mutators, the executor, command admission and MCP.
 */
export const SHOW_V2_ROUTE_DEFAULT = false

/** The development-only opt-in that answers the gate before #1039 flips it. */
export const SHOW_V2_ROUTE_SEARCH_PARAM = 'show-v2-editor'

export interface ShowV2RouteGateInput {
  /** The query string to read, `window.location.search` by default. */
  search?: string
  /** Whether this is a development build; the bundler's own answer by default. */
  dev?: boolean
}

export function isShowV2RouteEnabled(input: ShowV2RouteGateInput = {}): boolean {
  if (SHOW_V2_ROUTE_DEFAULT) return true
  const dev = input.dev ?? developmentBuild()
  if (!dev) return false
  const search = input.search ?? (typeof window === 'undefined' ? '' : window.location.search)
  return new URLSearchParams(search).get(SHOW_V2_ROUTE_SEARCH_PARAM) === '1'
}

/** `import.meta.env` is the bundler's; the Worker and the harness have none. */
function developmentBuild(): boolean {
  return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
}

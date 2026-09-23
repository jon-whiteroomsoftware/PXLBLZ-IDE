/**
 * Which record version backs the open Show editor (#1056 slice 6, flipped by
 * #1039).
 *
 * There is no route gate. Jon decided on 2026-09-18 that a v2-stored Show opens
 * in the existing editor, ungated, and the rejected `ShowEditorV2Route` is no
 * longer mounted: `ShowEditor` renders every routed Show. This module chooses
 * the *record* that editor reads, not the editor. Its name still says "route";
 * #1067 owns renaming it along with the rejected components.
 *
 * Every consumer that must move together - the editor, the Show list,
 * fresh-Show creation, `.pxlshow` import and the store's v2 listing - asks
 * this module, so the activation is the single constant below rather than a
 * flag each surface reads for itself.
 *
 * Specification section 10 forbids a window where the editor holds a v2 record
 * while commands assume v1. Two predicates keep that closed now that the
 * default is on:
 *
 * - `isShowV2RouteEnabled` answers whether v2 is the production Show path at
 *   all. Since #1039 it is, unconditionally: fresh Shows are authored as v2,
 *   the Show list reads stored v2 documents beside v1 rows, and `.pxlshow`
 *   import accepts a version-2 bundle.
 * - `opensOnShowV2Route` answers, per routed Show, which record backs it. A
 *   stored v2 document or a native v2 built-in Show backs the editor with a
 *   v2 pilot record; a row still stored as v1 keeps its v1 record until the
 *   operator conversion (`npm run show:v2-migrate`) rewrites it, because section 10 also forbids
 *   migrating a row on read.
 *
 * The command side follows the same per-record answer: the agent binding the
 * open editor registers declares its record version, and the executor,
 * admission and MCP catalogue dispatch on that. So for one Show the editor and
 * its commands are always the same version, in either state. Until #1066
 * connects the remaining edits, a v2 backing has only the ordinary Clip move
 * connected and every other command is fenced.
 */

/**
 * Whether a v2 record is the ordinary Show path. #1039 flipped this together
 * with the store's v2 collections, the executor, command admission and MCP;
 * #1042 removes the remaining v1 authoring owners behind it.
 */
export const SHOW_V2_ROUTE_DEFAULT = true

/**
 * The development-only preview of an unconverted row on the v2 backing.
 *
 * It converts in memory for the open session and writes nothing, which is what
 * lets a development build exercise the existing editor's v2 backing against a
 * v1 fixture. A production build ignores it however the URL is written, so no
 * user reaches a converted view of a row storage still holds as v1.
 */
export const SHOW_V2_ROUTE_PREVIEW_PARAM = 'show-v2-editor'

export interface ShowV2RouteGateInput {
  /** The query string to read, `window.location.search` by default. */
  search?: string
  /** Whether this is a development build; the bundler's own answer by default. */
  dev?: boolean
}

export interface ShowV2RouteRecordInput extends ShowV2RouteGateInput {
  /** Whether a version-2 document is stored for this Show. */
  storedV2: boolean
  /** Whether this built-in Show has a native version-2 catalogue record. */
  stockV2?: boolean
}

export function isShowV2RouteEnabled(input: ShowV2RouteGateInput = {}): boolean {
  if (SHOW_V2_ROUTE_DEFAULT) return true
  const dev = input.dev ?? developmentBuild()
  if (!dev) return false
  return previewRequested(input, dev)
}

/** Whether this routed Show opens on the v2 editor rather than the v1 one. */
export function opensOnShowV2Route(input: ShowV2RouteRecordInput): boolean {
  if (!isShowV2RouteEnabled(input)) return false
  if (input.storedV2 || input.stockV2) return true
  return previewRequested(input, input.dev ?? developmentBuild())
}

function previewRequested(input: ShowV2RouteGateInput, dev: boolean): boolean {
  if (!dev) return false
  const search = input.search ?? (typeof window === 'undefined' ? '' : window.location.search)
  return new URLSearchParams(search).get(SHOW_V2_ROUTE_PREVIEW_PARAM) === '1'
}

/** `import.meta.env` is the bundler's; the Worker and the harness have none. */
function developmentBuild(): boolean {
  return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
}

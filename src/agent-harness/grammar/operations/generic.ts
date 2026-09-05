// Provenance: pxlblz-v3 src/grammar/operations/generic.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Generic operation family (#22): the completeness backstop. set_field and
// apply_patch reach any editable path of the ShowRecord the specific
// operations miss (the Trails output Effect is the first known such path).
// Both validate their result through tier-0 immediately — even inside a
// transaction — and refuse invalid results with the typed issues. Their use
// is a diagnostic: the session logs it, and the dictation runner reports how
// often an agent had to fall back here; that log is the gap list for
// specific operations still worth adding.
import { z } from 'zod'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { validateShowDocument } from '../../shows/evaluate.js'
import type { GrammarOperationResult, ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import { refuse, replacedShow } from '../support.js'

export const GENERIC_OPERATION_NAMES = ['set_field', 'apply_patch']

/**
 * Pointers the generic operations refuse to touch: element identity and
 * engine bookkeeping. Everything else in the record is reachable.
 */
export const PROTECTED_POINTER_PATTERNS: string[] = ['/id', '/updatedAt']

function isProtected(pointer: string): boolean {
  return PROTECTED_POINTER_PATTERNS.includes(pointer)
}

// Element identity preservation (#945 correction, re-done after the candidate
// review of a4e11cc0, and again after the review of 54f47d5b). The coverage
// allowlist excludes every nested `*/id` as engine-minted identity, but the
// generics only refused the root pointers. The first correction judged the
// complete before/after records by array slot, which was unsound: removing
// marker A and then renaming the surviving B to A left slot 0 holding "A" and
// passed. The rule is enforced at each mutation, against the working record
// as it stands when the operation runs, with a per-patch ledger of removed
// identities:
//   - the `id` of an array-member object (a Scene, Zone, Layout, Transition,
//     instance, placement, layer, Effect, track, keyframe, marker, output
//     Effect) is never the target of add, replace, remove, move or copy;
//   - a write over an existing subtree (replace, or add/set_field on an
//     existing key) keeps a replaced element under its own id, and every
//     nested element it carries must already exist in the subtree being
//     replaced, in the same collection - a write can edit, reorder and drop
//     elements, never introduce one;
//   - an insertion (add at an array position, or a key that did not exist)
//     may carry ids, none of which may already be in the target collection or
//     have been removed earlier in the same patch from the identity domain the
//     insertion lands in (an id is never recycled within one operation);
//   - move carries its subtree's identities with it: the element is detached
//     and inserted as the same element, so nothing is tombstoned and nothing
//     is cleared - a tombstone survives every later operation of the patch,
//     and a move into a domain holding a tombstone of one of its ids is refused
//     like any insertion (the second review found a move implemented as
//     remove + add that deleted every carried id from the ledger, erasing an
//     unrelated element's removal that shared the id string);
//   - copy of anything carrying an identity is refused - the generics cannot
//     mint ids, the duplicate_* operations do.
// A Pattern reference's `pattern.id` names a catalogue entry, not an element,
// and stays editable. Collections are keyed by their owners' identities so a
// reorder above them does not shift the comparison. Every refusal leaves the
// record untouched: the patch applies to a clone and is dropped whole.

/**
 * Identity domains of the ShowRecord: within a domain an id names one element
 * and the engine refuses duplicates; across domains the same string may name
 * different elements (a marker and an Effect, say, or the Effects of two
 * placements). Keyed by collection shape (array owners as `*`). Sources:
 * validateShowComposition and validateShowPropertyTracks, whose duplicate-id
 * checks span main and overlay placements together, overlay layers, instances,
 * markers, layer transitions, tracks and keyframes across every Scene and
 * track; and findEffect, which looks an Effect up within its placement's
 * stack. A collection shape not declared here is fail-closed: a removal from
 * it tombstones the id in every domain, and an insertion into it is refused
 * by a tombstone in any domain.
 */
const PLACEMENT_SHAPES = ['/composition/scenes/*/zones/*/main', '/composition/scenes/*/zones/*/overlays/*/placements']
const EFFECT_SHAPES = PLACEMENT_SHAPES.map((shape) => `${shape}/*/effects`)
const RECORD_WIDE_SHAPES = [
  '/scenes',
  '/zones',
  '/cells',
  '/routingLayouts',
  '/transitions',
  '/outputEffects',
  '/composition/patternInstances',
  '/composition/markers',
  '/composition/transitions',
  '/composition/scenes/*/zones/*/overlays',
  '/composition/scenes/*/propertyTracks',
  '/composition/scenes/*/propertyTracks/*/keyframes',
]
const UNDECLARED_DOMAIN = '*'

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const escapeSegment = (segment: string) => segment.replace(/~/g, '~0').replace(/\//g, '~1')
const unescapeSegment = (segment: string) => segment.replace(/~1/g, '/').replace(/~0/g, '~')

const idOf = (value: unknown): string | undefined =>
  isRecordObject(value) && typeof value.id === 'string' ? value.id : undefined

/** The key an array member is known by: its id, else its composition owner, else its index. */
const ownerKeyOf = (item: unknown, index: number): string =>
  idOf(item) ??
  (isRecordObject(item) && typeof item.sceneId === 'string' ? item.sceneId : undefined) ??
  (isRecordObject(item) && typeof item.zoneId === 'string' ? item.zoneId : undefined) ??
  String(index)

/** The domain an element of the collection at (`shape`, `ownerPointer`) belongs to. */
function identityDomain(shape: string, ownerPointer: string): string {
  if (PLACEMENT_SHAPES.includes(shape)) return 'placement'
  if (EFFECT_SHAPES.includes(shape)) {
    const owners = ownerPointer.split('/')
    return `effect@${unescapeSegment(owners[owners.length - 2] ?? '')}`
  }
  if (RECORD_WIDE_SHAPES.includes(shape)) return shape
  return UNDECLARED_DOMAIN
}

interface IdentityLedger {
  /** Removed id → the domains earlier operations of this patch removed it from. */
  removed: Map<string, Set<string>>
}

function tombstone(ledger: IdentityLedger, domain: string, id: string): void {
  const domains = ledger.removed.get(id) ?? new Set<string>()
  domains.add(domain)
  ledger.removed.set(id, domains)
}

function isTombstoned(ledger: IdentityLedger, domain: string, id: string): boolean {
  const domains = ledger.removed.get(id)
  if (!domains) return false
  return domain === UNDECLARED_DOMAIN || domains.has(UNDECLARED_DOMAIN) || domains.has(domain)
}

interface SubtreeIdentities {
  /** The value's own id when it is an object carrying one. */
  own: string | undefined
  /** Collection (relative, owner-keyed pointer) → element ids in order. */
  collections: Map<string, string[]>
  /** Every element in the subtree, excluding `own`, with its collection's relative owner-keyed pointer and shape. */
  elements: Array<{ id: string; collection: string; shape: string }>
}

/** Element identities inside a value, keyed by the collection they sit in. */
function identitiesOf(value: unknown): SubtreeIdentities {
  const collections = new Map<string, string[]>()
  const elements: SubtreeIdentities['elements'] = []
  const walk = (node: unknown, pointer: string, shape: string): void => {
    if (Array.isArray(node)) {
      const ids: string[] = []
      node.forEach((item, index) => {
        const id = idOf(item)
        if (id !== undefined) {
          ids.push(id)
          elements.push({ id, collection: pointer, shape })
        }
        walk(item, `${pointer}/${escapeSegment(ownerKeyOf(item, index))}`, `${shape}/*`)
      })
      if (ids.length > 0) collections.set(pointer, ids)
      return
    }
    if (isRecordObject(node)) {
      for (const [key, child] of Object.entries(node)) {
        walk(child, `${pointer}/${escapeSegment(key)}`, `${shape}/${escapeSegment(key)}`)
      }
    }
  }
  walk(value, '', '')
  return { own: idOf(value), collections, elements }
}

/** Where a node sits in the record: its owner-keyed pointer and its shape. */
interface Site {
  ownerPointer: string
  shape: string
}

/** The site of the node at `segments`; every step must exist (resolveParent has checked). */
function siteOf(root: unknown, segments: string[]): Site {
  let node: unknown = root
  let ownerPointer = ''
  let shape = ''
  for (const segment of segments) {
    if (Array.isArray(node)) {
      const index = Number(segment)
      const item = node[index]
      ownerPointer += `/${escapeSegment(ownerKeyOf(item, index))}`
      shape += '/*'
      node = item
    } else if (isRecordObject(node)) {
      ownerPointer += `/${escapeSegment(segment)}`
      shape += `/${escapeSegment(segment)}`
      node = node[segment]
    } else {
      break
    }
  }
  return { ownerPointer, shape }
}

/** How a written or removed value attaches to the record. */
type Attachment =
  | { kind: 'element'; collection: Site; ownerKey: string }
  | { kind: 'key'; parent: Site; key: string }

/** Every identity a value carries at its attachment, each with its domain. */
function domainsOf(identities: SubtreeIdentities, attachment: Attachment): Array<{ id: string; domain: string }> {
  const prefix: Site = attachment.kind === 'element'
    ? {
        ownerPointer: `${attachment.collection.ownerPointer}/${escapeSegment(attachment.ownerKey)}`,
        shape: `${attachment.collection.shape}/*`,
      }
    : {
        ownerPointer: `${attachment.parent.ownerPointer}/${escapeSegment(attachment.key)}`,
        shape: `${attachment.parent.shape}/${escapeSegment(attachment.key)}`,
      }
  const out: Array<{ id: string; domain: string }> = []
  if (attachment.kind === 'element' && identities.own !== undefined) {
    out.push({
      id: identities.own,
      domain: identityDomain(attachment.collection.shape, attachment.collection.ownerPointer),
    })
  }
  for (const element of identities.elements) {
    out.push({
      id: element.id,
      domain: identityDomain(`${prefix.shape}${element.shape}`, `${prefix.ownerPointer}${element.collection}`),
    })
  }
  return out
}

function tombstoneAll(ledger: IdentityLedger, value: unknown, attachment: Attachment): void {
  for (const { id, domain } of domainsOf(identitiesOf(value), attachment)) tombstone(ledger, domain, id)
}

const IDENTITY_REMEDY =
  'Edit the element under its existing id; insert a new element with an add at an array position ' +
  '(…/-) carrying a fresh id; remove and add in separate operations rather than reusing an id; ' +
  'prefer the specific operation for the element where one exists.'

const identityIssue = (message: string, path: string): GrammarIssue => ({
  code: 'invalid-argument',
  message,
  remedy: IDENTITY_REMEDY,
  path,
})

/** Duplicate ids inside one collection of a written value, if any. */
function duplicateWithin(identities: SubtreeIdentities, path: string): GrammarIssue | null {
  for (const [collection, ids] of identities.collections) {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) {
        return identityIssue(
          `${path}${collection}: element identity "${id}" would appear twice; ids are unique within their collection.`,
          path,
        )
      }
      seen.add(id)
    }
  }
  return null
}

/** A replace (or overwrite) of `oldValue` by `nextValue` at `path`. */
function subtreeWriteIssue(
  oldValue: unknown,
  nextValue: unknown,
  attachment: Attachment,
  path: string,
  ledger: IdentityLedger,
): GrammarIssue | null {
  const before = identitiesOf(oldValue)
  const after = identitiesOf(nextValue)
  if (attachment.kind === 'element' && before.own !== after.own) {
    return identityIssue(
      before.own === undefined
        ? `${path}: "${after.own}" would introduce an element identity where the element had none; ids are minted by the operations and never rewritten.`
        : `${path}: element identity "${before.own}" would become ` +
          `${after.own === undefined ? 'missing' : `"${after.own}"`}; ids are minted by the operations and never rewritten.`,
      path,
    )
  }
  const duplicated = duplicateWithin(after, path)
  if (duplicated) return duplicated
  for (const [collection, ids] of after.collections) {
    const existing = before.collections.get(collection) ?? []
    const existingSet = new Set(existing)
    for (const id of ids) {
      if (!existingSet.has(id)) {
        const written = new Set(ids)
        const dropped = existing.filter((known) => !written.has(known))
        return identityIssue(
          `${path}${collection}: element identity "${id}" is not in the subtree being replaced` +
            `${dropped.length > 0 ? ` (which would lose ${dropped.map((known) => `"${known}"`).join(', ')})` : ''}; ` +
            'a write over existing elements keeps each under its own id and introduces none.',
          path,
        )
      }
    }
  }
  // Elements the write drops are removed: tombstone them in their domains.
  const keyOf = (element: { collection: string; id: string }) => `${element.collection} ${element.id}`
  const kept = new Set(after.elements.map(keyOf))
  const dropped: SubtreeIdentities = {
    own: undefined,
    collections: new Map(),
    elements: before.elements.filter((element) => !kept.has(keyOf(element))),
  }
  for (const { id, domain } of domainsOf(dropped, attachment)) tombstone(ledger, domain, id)
  return null
}

/** An insertion of `value` into `targetArray` (or under a key that did not exist). */
function insertionIssue(
  value: unknown,
  targetArray: unknown[] | null,
  attachment: Attachment,
  path: string,
  ledger: IdentityLedger,
): GrammarIssue | null {
  const inserted = identitiesOf(value)
  for (const { id, domain } of domainsOf(inserted, attachment)) {
    if (isTombstoned(ledger, domain, id)) {
      return identityIssue(
        `${path}: element identity "${id}" was removed earlier in this patch and cannot be reintroduced here; ids are never recycled.`,
        path,
      )
    }
  }
  const own = targetArray ? inserted.own : undefined
  if (own !== undefined && targetArray!.some((item) => idOf(item) === own)) {
    return identityIssue(
      `${path}: element identity "${own}" would appear twice; ids are unique within their collection.`,
      path,
    )
  }
  return duplicateWithin(inserted, path)
}

function parsePointer(pointer: string): { ok: true; segments: string[] } | { ok: false; issue: GrammarIssue } {
  if (pointer === '' || !pointer.startsWith('/')) {
    return {
      ok: false,
      issue: {
        code: 'invalid-argument',
        message: `"${pointer}" is not a JSON pointer into the document; pointers start with "/".`,
      },
    }
  }
  const segments = pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
  return { ok: true, segments }
}

type Json = Record<string, unknown> | unknown[]

/** The node a segment path reaches, if every step exists. */
function nodeAt(root: unknown, segments: string[]): { found: true; value: unknown } | { found: false } {
  let node: unknown = root
  for (const segment of segments) {
    if (Array.isArray(node)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return { found: false }
      node = node[index]
    } else if (isRecordObject(node)) {
      if (!Object.prototype.hasOwnProperty.call(node, segment)) return { found: false }
      node = node[segment]
    } else {
      return { found: false }
    }
  }
  return { found: true, value: node }
}

/** True when the pointer names the `id` of an array-member object. */
function identityPointerIssue(root: unknown, segments: string[], path: string, verb: string): GrammarIssue | null {
  if (segments.length < 2 || segments[segments.length - 1] !== 'id') return null
  const owner = nodeAt(root, segments.slice(0, -1))
  const collection = nodeAt(root, segments.slice(0, -2))
  if (!owner.found || !collection.found || !Array.isArray(collection.value) || !isRecordObject(owner.value)) return null
  const current = idOf(owner.value)
  return identityIssue(
    `${path}: element identity ${current === undefined ? '' : `"${current}" `}would be ${verb}; ids are minted by the operations and never rewritten.`,
    path,
  )
}

function resolveParent(
  root: Json,
  segments: string[],
  pointer: string,
): { ok: true; parent: Json; key: string } | { ok: false; issue: GrammarIssue } {
  let node: unknown = root
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    if (Array.isArray(node)) {
      const arrayIndex = Number(segment)
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= node.length) {
        return {
          ok: false,
          issue: {
            code: 'invalid-argument',
            message: `Pointer ${pointer}: index "${segment}" is outside the array (length ${node.length}).`,
          },
        }
      }
      node = node[arrayIndex]
    } else if (node !== null && typeof node === 'object') {
      if (!(segment in (node as Record<string, unknown>))) {
        return {
          ok: false,
          issue: {
            code: 'invalid-argument',
            message:
              `Pointer ${pointer}: "${segment}" does not exist. Existing keys here: ${
                Object.keys(node as Record<string, unknown>).join(', ') || 'none'}.`,
          },
        }
      }
      node = (node as Record<string, unknown>)[segment]
    } else {
      return {
        ok: false,
        issue: {
          code: 'invalid-argument',
          message: `Pointer ${pointer}: "${segments[index - 1] ?? ''}" is a primitive; cannot descend into it.`,
        },
      }
    }
  }
  if (node === null || typeof node !== 'object') {
    return {
      ok: false,
      issue: { code: 'invalid-argument', message: `Pointer ${pointer}: the parent is not an object or array.` },
    }
  }
  return { ok: true, parent: node as Json, key: segments[segments.length - 1] }
}

type PatchOperation =
  | { op: 'add' | 'replace' | 'test'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'move' | 'copy'; path: string; from: string }

function getAt(root: Json, pointer: string): { ok: true; value: unknown } | { ok: false; issue: GrammarIssue } {
  const parsed = parsePointer(pointer)
  if (!parsed.ok) return parsed
  const resolved = resolveParent(root, parsed.segments, pointer)
  if (!resolved.ok) return resolved
  const { parent, key } = resolved
  if (Array.isArray(parent)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `Pointer ${pointer}: index "${key}" does not exist.` },
      }
    }
    return { ok: true, value: parent[index] }
  }
  if (!(key in parent)) {
    return {
      ok: false,
      issue: { code: 'invalid-argument', message: `Pointer ${pointer}: "${key}" does not exist.` },
    }
  }
  return { ok: true, value: (parent as Record<string, unknown>)[key] }
}

/** Take the node at `segments` out of the record and return it; the ledger is untouched. */
function detach(
  root: Json,
  segments: string[],
  pointer: string,
): { ok: true; value: unknown } | { ok: false; issue: GrammarIssue } {
  const resolved = resolveParent(root, segments, pointer)
  if (!resolved.ok) return resolved
  const { parent, key } = resolved
  if (Array.isArray(parent)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `${pointer}: index ${key} does not exist.` },
      }
    }
    return { ok: true, value: parent.splice(index, 1)[0] }
  }
  if (!Object.prototype.hasOwnProperty.call(parent, key)) {
    return {
      ok: false,
      issue: { code: 'invalid-argument', message: `${pointer}: "${key}" does not exist.` },
    }
  }
  const value = (parent as Record<string, unknown>)[key]
  delete (parent as Record<string, unknown>)[key]
  return { ok: true, value }
}

function applyOne(
  root: Json,
  operation: PatchOperation,
  ledger: IdentityLedger,
): { ok: true } | { ok: false; issue: GrammarIssue } {
  if (isProtected(operation.path)) {
    return {
      ok: false,
      issue: {
        code: 'invalid-argument',
        message: `${operation.path} is protected (${PROTECTED_POINTER_PATTERNS.join(', ')} are identity/bookkeeping).`,
      },
    }
  }
  const parsed = parsePointer(operation.path)
  if (!parsed.ok) return parsed
  if (operation.op !== 'test') {
    const identity = identityPointerIssue(
      root,
      parsed.segments,
      operation.path,
      operation.op === 'remove' ? 'removed' : 'rewritten',
    )
    if (identity) return { ok: false, issue: identity }
  }

  if (operation.op === 'move' || operation.op === 'copy') {
    const fromParsed = parsePointer(operation.from)
    if (!fromParsed.ok) return fromParsed
    const fromIdentity = identityPointerIssue(root, fromParsed.segments, operation.from, operation.op === 'move' ? 'moved' : 'copied')
    if (fromIdentity) return { ok: false, issue: fromIdentity }
    const source = getAt(root, operation.from)
    if (!source.ok) return source
    const value = structuredClone(source.value)
    if (operation.op === 'copy') {
      const carried = identitiesOf(value)
      const fromParent = nodeAt(root, fromParsed.segments.slice(0, -1))
      const sourceIsElement = fromParent.found && Array.isArray(fromParent.value)
      const carriedIds = [...(sourceIsElement && carried.own !== undefined ? [carried.own] : []), ...carried.elements.map((element) => element.id)]
      if (carriedIds.length > 0) {
        return {
          ok: false,
          issue: identityIssue(
            `Copy of ${operation.from} would duplicate element identity "${carriedIds[0]}"; the generic operations cannot mint ids.`,
            operation.path,
          ),
        }
      }
      return applyOne(root, { op: 'add', path: operation.path, value }, ledger)
    }
    // A move keeps the subtree's identities: detach it (no tombstone) and
    // insert it as the same element, under the ordinary insertion checks.
    const detached = detach(root, fromParsed.segments, operation.from)
    if (!detached.ok) return detached
    return applyOne(root, { op: 'add', path: operation.path, value }, ledger)
  }

  const resolved = resolveParent(root, parsed.segments, operation.path)
  if (!resolved.ok) return resolved
  const { parent, key } = resolved
  // move/copy and test returned above; the rest carry a value except remove.
  const writeValue = (operation as { value?: unknown }).value

  if (operation.op === 'test') {
    const current = getAt(root, operation.path)
    if (!current.ok) return current
    if (JSON.stringify(current.value) !== JSON.stringify(operation.value)) {
      return {
        ok: false,
        issue: {
          code: 'invalid-argument',
          message: `Patch test failed at ${operation.path}: the document holds ${JSON.stringify(current.value)}.`,
        },
      }
    }
    return { ok: true }
  }

  const parentSite = siteOf(root, parsed.segments.slice(0, -1))

  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    if (!Number.isInteger(index) || index < 0 || index > parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `${operation.path}: "${key}" is not a valid array position.` },
      }
    }
    const attachment = (value: unknown): Attachment => ({ kind: 'element', collection: parentSite, ownerKey: ownerKeyOf(value, index) })
    if (operation.op === 'add') {
      const issue = insertionIssue(writeValue, parent, attachment(writeValue), operation.path, ledger)
      if (issue) return { ok: false, issue }
      parent.splice(index, 0, structuredClone(writeValue))
      return { ok: true }
    }
    if (index >= parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `${operation.path}: index ${index} does not exist.` },
      }
    }
    if (operation.op === 'remove') {
      tombstoneAll(ledger, parent[index], attachment(parent[index]))
      parent.splice(index, 1)
      return { ok: true }
    }
    const issue = subtreeWriteIssue(parent[index], writeValue, attachment(parent[index]), operation.path, ledger)
    if (issue) return { ok: false, issue }
    parent[index] = structuredClone(writeValue)
    return { ok: true }
  }

  const record = parent as Record<string, unknown>
  const exists = Object.prototype.hasOwnProperty.call(record, key)
  const attachment: Attachment = { kind: 'key', parent: parentSite, key }
  if (operation.op === 'add') {
    const issue = exists
      ? subtreeWriteIssue(record[key], writeValue, attachment, operation.path, ledger)
      : insertionIssue(writeValue, null, attachment, operation.path, ledger)
    if (issue) return { ok: false, issue }
    record[key] = structuredClone(writeValue)
    return { ok: true }
  }
  if (!exists) {
    return {
      ok: false,
      issue: { code: 'invalid-argument', message: `${operation.path}: "${key}" does not exist.` },
    }
  }
  if (operation.op === 'remove') {
    tombstoneAll(ledger, record[key], attachment)
    delete record[key]
    return { ok: true }
  }
  const issue = subtreeWriteIssue(record[key], writeValue, attachment, operation.path, ledger)
  if (issue) return { ok: false, issue }
  record[key] = structuredClone(writeValue)
  return { ok: true }
}

/** Validate immediately (even mid-transaction) and package the result. */
function concludeGeneric(
  operationName: string,
  document: ShowGrammarDocument,
  next: ShowRecord,
  pointers: string[],
  description: string,
): GrammarOperationResult {
  const validation = validateShowDocument(next, document.inlinePatterns, document.options)
  if (!validation.valid) {
    return refuse(...validation.errors.map((issue) => ({
      code: 'result-invalid' as const,
      message: `[${issue.code}] ${issue.message}`,
      ...(issue.path ? { path: issue.path } : {}),
    })))
  }
  return {
    ok: true,
    document: replacedShow(document, next),
    changes: [{
      op: operationName,
      targetId: pointers[0] ?? '/',
      description,
      details: { pointers },
    }],
  }
}

const setField: ShowGrammarOperation = {
  name: 'set_field',
  description:
    'Completeness backstop: set one field of the ShowRecord by JSON pointer, for the rare paths no ' +
    'specific operation covers (the Trails output Effect, say). The result is schema- and tier-0- ' +
    'validated immediately, even inside a transaction, and refused if invalid. Prefer the specific ' +
    'operations — they carry the engine’s own planning and refusal reasons; every set_field use is ' +
    'logged as a gap signal.',
  mutates: ['/*'],
  inputShape: {
    pointer: z.string().describe('JSON pointer into the ShowRecord (for example /outputEffects/0/retention)'),
    value: z.unknown().describe('The new value; omit to delete the field').optional(),
    delete: z.boolean().optional().describe('Remove the field instead of setting it'),
  },
  apply(document, args) {
    const pointer = args.pointer as string
    if (isProtected(pointer)) {
      return refuse({
        code: 'invalid-argument',
        message: `${pointer} is protected (${PROTECTED_POINTER_PATTERNS.join(', ')} are identity/bookkeeping).`,
      })
    }
    const next = structuredClone(document.show) as unknown as Json
    const ledger: IdentityLedger = { removed: new Map() }
    const outcome = args.delete
      ? applyOne(next, { op: 'remove', path: pointer }, ledger)
      : applyOne(next, { op: 'add', path: pointer, value: args.value }, ledger)
    if (!outcome.ok) return refuse(outcome.issue)
    return concludeGeneric(
      'set_field',
      document,
      next as unknown as ShowRecord,
      [pointer],
      args.delete
        ? `Field ${pointer} removed (generic set_field).`
        : `Field ${pointer} set to ${JSON.stringify(args.value)} (generic set_field).`,
    )
  },
}

const patchOperationArgument = z.object({
  op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
  path: z.string(),
  value: z.unknown().optional(),
  from: z.string().optional(),
})

const applyPatch: ShowGrammarOperation = {
  name: 'apply_patch',
  description:
    'Completeness backstop: apply a JSON Patch (RFC 6902: add, remove, replace, move, copy, test) to the ' +
    'ShowRecord for multi-field edits no specific operation covers. All operations apply atomically; the ' +
    'result is schema- and tier-0-validated immediately, even inside a transaction, and refused if ' +
    'invalid. Prefer the specific operations; every apply_patch use is logged as a gap signal.',
  mutates: ['/*'],
  inputShape: {
    patch: z.array(patchOperationArgument).min(1).describe('RFC 6902 patch operations, applied in order'),
  },
  apply(document, args) {
    const patch = args.patch as PatchOperation[]
    const next = structuredClone(document.show) as unknown as Json
    const ledger: IdentityLedger = { removed: new Map() }
    for (const [index, operation] of patch.entries()) {
      if ((operation.op === 'move' || operation.op === 'copy') && !('from' in operation && operation.from)) {
        return refuse({
          code: 'invalid-argument',
          message: `Patch operation ${index} (${operation.op}) needs a "from" pointer.`,
        })
      }
      const outcome = applyOne(next, operation, ledger)
      if (!outcome.ok) {
        return refuse({
          ...outcome.issue,
          message: `Patch operation ${index} (${operation.op} ${operation.path}): ${outcome.issue.message}`,
        })
      }
    }
    const pointers = patch.map((operation) => operation.path)
    return concludeGeneric(
      'apply_patch',
      document,
      next as unknown as ShowRecord,
      pointers,
      `Applied a ${patch.length}-operation JSON Patch touching ${pointers.join(', ')} (generic apply_patch).`,
    )
  },
}

export const GENERIC_OPERATIONS: ShowGrammarOperation[] = [setField, applyPatch]

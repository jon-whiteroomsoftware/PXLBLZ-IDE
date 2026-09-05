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

// Element identity preservation (#945 correction). The coverage allowlist
// excludes every nested `*/id` as engine-minted identity, but the generics
// only refused the root pointers, so set_field or apply_patch could rename a
// placement, instance, track, keyframe, Effect or marker - directly, or by
// replacing a parent subtree - and still validate. The domain is the `id` of
// every array-member object in the record (Scenes, Zones, Layouts,
// Transitions, instances, placements, layers, Effects, tracks, keyframes,
// markers, output Effects). A Pattern reference's `pattern.id` names a
// catalogue entry, not an element, and stays editable. The rule is judged on
// the complete before and after records, not on the pointer string:
//   - an element that stays in its collection keeps its id (a slot whose id
//     changes to one that did not exist, while the old id vanishes, is a
//     rename; reordering, insertion and removal are not);
//   - no identity appears twice in one collection (a copy needs an id the
//     generics cannot mint; the specific duplicate_* operations do that).
// Collections are keyed by their owners' identities, so a removal earlier in
// a sibling array does not shift the comparison, and retention is judged
// within the collection (a legacy cell and its composition instance may
// share an id). Residual: an id swap between two elements of one collection
// is indistinguishable from a reorder here.

interface ElementSlot {
  id: string | undefined
}

/** Array pointer (owner-identity keyed) → one slot per array item, in order. */
type IdentityLedger = Map<string, ElementSlot[]>

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const escapeSegment = (segment: string) => segment.replace(/~/g, '~0').replace(/\//g, '~1')

function ledgerOf(root: unknown): IdentityLedger {
  const collections: IdentityLedger = new Map()
  const walk = (value: unknown, pointer: string): void => {
    if (Array.isArray(value)) {
      const slots: ElementSlot[] = []
      value.forEach((item, index) => {
        const element = isRecordObject(item) ? item : null
        const id = element && typeof element.id === 'string' ? element.id : undefined
        slots.push({ id })
        const ownerKey =
          id ??
          (element && typeof element.sceneId === 'string' ? element.sceneId : undefined) ??
          (element && typeof element.zoneId === 'string' ? element.zoneId : undefined) ??
          String(index)
        walk(item, `${pointer}/${escapeSegment(ownerKey)}`)
      })
      if (slots.some((slot) => slot.id !== undefined)) collections.set(pointer, slots)
      return
    }
    if (isRecordObject(value)) {
      for (const [key, child] of Object.entries(value)) walk(child, `${pointer}/${escapeSegment(key)}`)
    }
  }
  walk(root, '')
  return collections
}

const IDENTITY_REMEDY =
  'Edit the element under its existing id, or remove it and add a new element in separate operations; ' +
  'prefer the specific operation for the element where one exists.'

const hasId = (slots: ElementSlot[], id: string) => slots.some((slot) => slot.id === id)

/** The typed refusal when `after` does not preserve every element identity of `before`, else null. */
export function identityPreservationIssue(before: ShowRecord, after: ShowRecord): GrammarIssue | null {
  const was = ledgerOf(before)
  const now = ledgerOf(after)
  for (const [collection, beforeSlots] of was) {
    const afterSlots = now.get(collection)
    if (!afterSlots) continue
    const shared = Math.min(beforeSlots.length, afterSlots.length)
    for (let index = 0; index < shared; index += 1) {
      const previous = beforeSlots[index].id
      const current = afterSlots[index].id
      if (previous === undefined || previous === current) continue
      // A reorder, insertion or removal keeps every id in the collection;
      // a rename loses one and gains one that was not there.
      if (hasId(afterSlots, previous) || (current !== undefined && hasId(beforeSlots, current))) continue
      return {
        code: 'invalid-argument',
        message:
          `${collection}/${index}: element identity "${previous}" would become ` +
          `${current === undefined ? 'missing' : `"${current}"`}; ids are minted by the operations and never rewritten.`,
        remedy: IDENTITY_REMEDY,
        path: collection,
      }
    }
  }
  for (const [collection, afterSlots] of now) {
    const duplicatedBefore = new Set<string>()
    const seenBefore = new Set<string>()
    for (const slot of was.get(collection) ?? []) {
      if (slot.id === undefined) continue
      if (seenBefore.has(slot.id)) duplicatedBefore.add(slot.id)
      seenBefore.add(slot.id)
    }
    const seen = new Set<string>()
    for (const slot of afterSlots) {
      if (slot.id === undefined) continue
      if (seen.has(slot.id) && !duplicatedBefore.has(slot.id)) {
        return {
          code: 'invalid-argument',
          message: `${collection}: element identity "${slot.id}" would appear twice; ids are unique within their collection.`,
          remedy: IDENTITY_REMEDY,
          path: collection,
        }
      }
      seen.add(slot.id)
    }
  }
  return null
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

function applyOne(root: Json, operation: PatchOperation): { ok: true } | { ok: false; issue: GrammarIssue } {
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

  if (operation.op === 'move' || operation.op === 'copy') {
    const source = getAt(root, operation.from)
    if (!source.ok) return source
    const value = structuredClone(source.value)
    if (operation.op === 'move') {
      const removed = applyOne(root, { op: 'remove', path: operation.from })
      if (!removed.ok) return removed
    }
    return applyOne(root, { op: 'add', path: operation.path, value })
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

  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    if (!Number.isInteger(index) || index < 0 || index > parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `${operation.path}: "${key}" is not a valid array position.` },
      }
    }
    if (operation.op === 'add') {
      parent.splice(index, 0, structuredClone(writeValue))
      return { ok: true }
    }
    if (index >= parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `${operation.path}: index ${index} does not exist.` },
      }
    }
    if (operation.op === 'remove') parent.splice(index, 1)
    else parent[index] = structuredClone(writeValue)
    return { ok: true }
  }

  const record = parent as Record<string, unknown>
  if (operation.op === 'add') {
    record[key] = structuredClone(writeValue)
    return { ok: true }
  }
  if (!(key in record)) {
    return {
      ok: false,
      issue: { code: 'invalid-argument', message: `${operation.path}: "${key}" does not exist.` },
    }
  }
  if (operation.op === 'remove') delete record[key]
  else record[key] = structuredClone(writeValue)
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
  const identity = identityPreservationIssue(document.show, next)
  if (identity) return refuse(identity)
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
    const outcome = args.delete
      ? applyOne(next, { op: 'remove', path: pointer })
      : applyOne(next, { op: 'add', path: pointer, value: args.value })
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
    for (const [index, operation] of patch.entries()) {
      if ((operation.op === 'move' || operation.op === 'copy') && !('from' in operation && operation.from)) {
        return refuse({
          code: 'invalid-argument',
          message: `Patch operation ${index} (${operation.op}) needs a "from" pointer.`,
        })
      }
      const outcome = applyOne(next, operation)
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

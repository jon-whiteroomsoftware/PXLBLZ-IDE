// Provenance: pxlblz-v3 src/grammar/operations/generic.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Generic operation family (#22): the completeness backstop. set_field and
// apply_patch reach any editable path of the ShowRecord the specific
// operations miss (the Trails output Effect is the first known such path).
// Both validate their result through tier-0 immediately — even inside a
// transaction — and refuse invalid results with the typed issues. Their use
// is a diagnostic: the session logs it, and the dictation runner reports how
// often an agent had to fall back here; that log is the gap list for
// specific operations still worth adding.
//
// Element identity preservation (#945 correction, re-done after each of the
// three candidate reviews). This file is the JSON Patch mechanics only:
// pointer parsing, parent resolution, splice/set/delete on a private clone of
// the record, and the root pointers the generics never touch. Every identity
// question - whether a pointer names an element's id, whether a write keeps
// each element under its own id, whether an insertion recycles a removed id,
// what a move transports, what a copy would duplicate - is asked of the
// IdentityTracker in ../identity.ts, which tags the elements of the clone when
// it is created and follows them wherever the patch moves them. Every refusal
// leaves the record untouched: the patch applies to the clone, which is
// dropped whole with its tracker.
import { z } from 'zod'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { validateShowDocument } from '../../shows/evaluate.js'
import { createIdentityTracker, type IdentityTracker } from '../identity.js'
import type { GrammarOperationResult, ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import { refuse, replacedShow } from '../support.js'

export const GENERIC_OPERATION_NAMES = ['set_field', 'apply_patch']

/**
 * Root pointers the generic operations refuse to touch: the record's own
 * identity and engine bookkeeping. Element identity inside the record is the
 * tracker's concern. Everything else in the record is reachable.
 */
export const PROTECTED_POINTER_PATTERNS: string[] = ['/id', '/updatedAt']

function isProtected(pointer: string): boolean {
  return PROTECTED_POINTER_PATTERNS.includes(pointer)
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

/** Take the node at `segments` out of the record and return it, tags intact; nothing is tombstoned. */
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

/** Put a detached subtree (the same objects) at `segments`: an insertion at an array position or new key, a drop-and-place over an existing key. */
function place(
  root: Json,
  segments: string[],
  value: unknown,
  path: string,
  tracker: IdentityTracker,
): { ok: true } | { ok: false; issue: GrammarIssue } {
  const resolved = resolveParent(root, segments, path)
  if (!resolved.ok) return resolved
  const { parent, key } = resolved
  const site = tracker.childSite(tracker.siteOf(segments.slice(0, -1)), parent, key, value)
  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    if (!Number.isInteger(index) || index < 0 || index > parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `${path}: "${key}" is not a valid array position.` },
      }
    }
    const issue = tracker.placeIssue(value, undefined, site, parent, path)
    if (issue) return { ok: false, issue }
    parent.splice(index, 0, value)
    return { ok: true }
  }
  const record = parent as Record<string, unknown>
  const old = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined
  const issue = tracker.placeIssue(value, old, site, null, path)
  if (issue) return { ok: false, issue }
  record[key] = value
  return { ok: true }
}

function applyOne(
  root: Json,
  operation: PatchOperation,
  tracker: IdentityTracker,
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
    const identity = tracker.pointerIssue(parsed.segments, operation.path, operation.op === 'remove' ? 'removed' : 'rewritten')
    if (identity) return { ok: false, issue: identity }
  }

  if (operation.op === 'move' || operation.op === 'copy') {
    const fromParsed = parsePointer(operation.from)
    if (!fromParsed.ok) return fromParsed
    const fromIdentity = tracker.pointerIssue(fromParsed.segments, operation.from, operation.op === 'move' ? 'moved' : 'copied')
    if (fromIdentity) return { ok: false, issue: fromIdentity }
    const source = getAt(root, operation.from)
    if (!source.ok) return source
    if (operation.op === 'copy') {
      const carried = tracker.copyIssue(source.value, operation.from, operation.path)
      if (carried) return { ok: false, issue: carried }
      return applyOne(root, { op: 'add', path: operation.path, value: source.value }, tracker)
    }
    const detached = detach(root, fromParsed.segments, operation.from)
    if (!detached.ok) return detached
    return place(root, parsed.segments, detached.value, operation.path, tracker)
  }

  const resolved = resolveParent(root, parsed.segments, operation.path)
  if (!resolved.ok) return resolved
  const { parent, key } = resolved

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

  // The value written is a private clone; the tracker tags its elements.
  const value = operation.op === 'remove' ? undefined : structuredClone((operation as { value?: unknown }).value)
  const site = tracker.childSite(tracker.siteOf(parsed.segments.slice(0, -1)), parent, key, value)

  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    if (!Number.isInteger(index) || index < 0 || index > parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `${operation.path}: "${key}" is not a valid array position.` },
      }
    }
    if (operation.op === 'add') {
      const issue = tracker.insertIssue(value, site, parent, operation.path)
      if (issue) return { ok: false, issue }
      parent.splice(index, 0, value)
      return { ok: true }
    }
    if (index >= parent.length) {
      return {
        ok: false,
        issue: { code: 'invalid-argument', message: `${operation.path}: index ${index} does not exist.` },
      }
    }
    if (operation.op === 'remove') {
      tracker.removed(parent[index])
      parent.splice(index, 1)
      return { ok: true }
    }
    const issue = tracker.overwriteIssue(parent[index], value, site, operation.path)
    if (issue) return { ok: false, issue }
    parent[index] = value
    return { ok: true }
  }

  const record = parent as Record<string, unknown>
  const exists = Object.prototype.hasOwnProperty.call(record, key)
  if (operation.op === 'add') {
    const issue = exists
      ? tracker.overwriteIssue(record[key], value, site, operation.path)
      : tracker.insertIssue(value, site, null, operation.path)
    if (issue) return { ok: false, issue }
    record[key] = value
    return { ok: true }
  }
  if (!exists) {
    return {
      ok: false,
      issue: { code: 'invalid-argument', message: `${operation.path}: "${key}" does not exist.` },
    }
  }
  if (operation.op === 'remove') {
    tracker.removed(record[key])
    delete record[key]
    return { ok: true }
  }
  const issue = tracker.overwriteIssue(record[key], value, site, operation.path)
  if (issue) return { ok: false, issue }
  record[key] = value
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

/** The private working copy of the record and the tracker that tags its elements. */
function workingCopy(document: ShowGrammarDocument): { next: Json; tracker: IdentityTracker } {
  const next = structuredClone(document.show) as unknown as Json
  return { next, tracker: createIdentityTracker(next) }
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
    const { next, tracker } = workingCopy(document)
    const outcome = args.delete
      ? applyOne(next, { op: 'remove', path: pointer }, tracker)
      : applyOne(next, { op: 'add', path: pointer, value: args.value }, tracker)
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
    const { next, tracker } = workingCopy(document)
    for (const [index, operation] of patch.entries()) {
      if ((operation.op === 'move' || operation.op === 'copy') && !('from' in operation && operation.from)) {
        return refuse({
          code: 'invalid-argument',
          message: `Patch operation ${index} (${operation.op}) needs a "from" pointer.`,
        })
      }
      const outcome = applyOne(next, operation, tracker)
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

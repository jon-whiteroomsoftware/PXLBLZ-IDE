// Provenance: pxlblz-v3 src/grammar/operations/generic.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Generic operation family (#22): the bounded backstop. set_field and
// apply_patch reach declared editable paths of the ShowRecordV2 that specific
// operations miss (the Trails output Effect was the first known such path).
// Each apply_patch member must leave a structurally valid Show, and the final
// result passes tier 0 even inside a transaction. Arbitrary scratch fields,
// temporary containers, and final-only-valid sequences are outside this
// diagnostic contract. Generic use remains logged as the gap list for
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
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { validateAuthoringShowDocument, validateShowDocument, validateShowStructure } from '../../shows/evaluate.js'
import { createIdentityTracker, type IdentityTracker } from '../identity.js'
import type { GrammarOperationResult, ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import { refuse, replacedShow } from '../support.js'

export const GENERIC_OPERATION_NAMES = ['set_field', 'apply_patch']

/**
 * Pointers the generic operations refuse to touch, with reasons: the record's
 * own identity, engine bookkeeping, and the three converter-only conversion
 * provenance fields (#1065). Element identity inside the declared Show
 * structure is the tracker's concern.
 *
 * A pattern matches a pointer that names it or descends into it, with '*' for
 * an array index. The root pointers keep their exact-match behavior, because a
 * pattern segment must line up with the pointer segment at the same depth:
 * '/id' bars the record identity and not a Clip's own '/composition/clips/0/id'.
 */
export const PROTECTED_POINTERS: Array<{ pattern: string; reason: string }> = [
  { pattern: '/id', reason: 'the record identity' },
  { pattern: '/updatedAt', reason: 'an engine bookkeeping stamp' },
  {
    pattern: '/composition/markers/*/origin',
    reason: 'v1 conversion provenance, written by the converter alone (#1065)',
  },
  {
    pattern: '/composition/transitions/*/origin',
    reason: 'v1 conversion provenance, written by the converter alone (#1065)',
  },
  {
    pattern: '/composition/layoutOccurrences/*/incomingSwitch',
    reason: 'v1 conversion provenance, written by the converter alone (#1065)',
  },
  {
    pattern: '/composition/sampleRemap/origin',
    reason: 'v1 conversion provenance, written by the converter alone (#1066)',
  },
]

export const PROTECTED_POINTER_PATTERNS: string[] = PROTECTED_POINTERS.map(({ pattern }) => pattern)

function protectionOf(pointer: string): { pattern: string; reason: string } | undefined {
  const segments = pointer.split('/').slice(1)
  return PROTECTED_POINTERS.find(({ pattern }) => {
    const patternSegments = pattern.split('/').slice(1)
    if (segments.length < patternSegments.length) return false
    return patternSegments.every((segment, index) => segment === '*' || segment === segments[index])
  })
}

function isProtected(pointer: string): boolean {
  return protectionOf(pointer) !== undefined
}

function protectionRefusal(pointer: string): GrammarIssue {
  const protection = protectionOf(pointer)!
  return {
    code: 'invalid-argument',
    message: `${pointer} is protected: ${protection.pattern} is ${protection.reason}.`,
  }
}

function elementsOf<T>(collection: T[] | undefined): T[] {
  return Array.isArray(collection) ? collection : []
}

/**
 * Every element that can carry conversion provenance, by collection and
 * identity, with the provenance it carries.
 *
 * The pointer guard above bars the direct write. This projection additionally
 * closes the ancestor write - replacing a whole Marker, Transition or Layout
 * occurrence, or appending one - because provenance is written by
 * `convertShowRecordV1ToV2` and nothing else. An element that leaves the record
 * takes its own provenance with it, so removal is not compared.
 */
function conversionProvenanceByElement(record: ShowRecordV2): Map<string, string> {
  const entries = new Map<string, string>()
  const note = (collection: string, id: string, value: unknown) => {
    entries.set(`${collection}/${id}`, value === undefined ? 'absent' : JSON.stringify(value))
  }
  // The edited record reaches this walker only after structural validation, but
  // the record it is compared against is the caller's own, so every collection
  // is read defensively rather than trusted to be an array (#1064).
  const composition = record.composition as Partial<ShowRecordV2['composition']> | undefined
  for (const marker of elementsOf(composition?.markers)) note('markers', marker.id, marker.origin)
  for (const transition of elementsOf(composition?.transitions)) note('transitions', transition.id, transition.origin)
  for (const occurrence of elementsOf(composition?.layoutOccurrences)) {
    note('layoutOccurrences', occurrence.id, occurrence.incomingSwitch)
  }
  note('sampleRemap', 'composition', composition?.sampleRemap?.origin)
  return entries
}

function forgedProvenance(before: ShowRecordV2, next: ShowRecordV2): GrammarIssue | undefined {
  const source = conversionProvenanceByElement(before)
  for (const [key, value] of conversionProvenanceByElement(next)) {
    const previous = source.get(key)
    if (previous === value || (previous === undefined && value === 'absent')) continue
    return {
      code: 'invalid-argument',
      message:
        `${key} would ${previous === undefined || previous === 'absent' ? 'gain' : 'change or clear'} v1 conversion ` +
        'provenance. Conversion provenance is written by convertShowRecordV1ToV2 alone (#1065); the generic ' +
        'operations preserve it and cannot author it.',
    }
  }
  return undefined
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
  // A move source can be before its destination in the same array. Resolve
  // and check the destination only now, after detach has shifted that array,
  // so the checked node is exactly the one the following write will touch.
  const destinationIdentity = tracker.pointerIssue(segments, path, 'rewritten')
  if (destinationIdentity) return { ok: false, issue: destinationIdentity }
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
  if (isProtected(operation.path)) return { ok: false, issue: protectionRefusal(operation.path) }
  const parsed = parsePointer(operation.path)
  if (!parsed.ok) return parsed
  // A move destination is checked by place() after source detachment, against
  // the actual resolved write target. Every other target is stable here.
  if (operation.op !== 'test' && operation.op !== 'move') {
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
  next: ShowRecordV2,
  pointers: string[],
  description: string,
): GrammarOperationResult {
  // Structure first (#1064). The provenance comparison walks the edited
  // record's declared collections, so a malformed result - a deleted
  // `/composition`, a Marker list replaced by an object - has to reach its own
  // typed `result-invalid` refusal rather than throw inside the walker.
  const validate = document.authoringValidation ? validateAuthoringShowDocument : validateShowDocument
  const validation = validate(next, document.inlinePatterns, document.options, document)
  if (!validation.valid) {
    return refuse(...validation.errors.map((issue) => ({
      code: 'result-invalid' as const,
      message: `[${issue.code}] ${issue.message}`,
      ...(issue.path ? { path: issue.path } : {}),
    })))
  }
  const forged = forgedProvenance(document.show, next)
  if (forged) return refuse(forged)
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
  family: 'generic',
  description:
    'Bounded backstop: set one declared field of the Show record by JSON pointer, for the rare paths no ' +
    'specific operation covers (the Trails output Effect, say). The result is schema- and tier-0- ' +
    'validated immediately, even inside a transaction, and refused if invalid. Prefer the specific ' +
    'operations — they carry the engine’s own planning and refusal reasons; every set_field use is ' +
    'logged as a gap signal.',
  mutates: ['/*'],
  inputShape: {
    pointer: z.string().describe('JSON pointer into declared Show record structure (for example /outputEffects/0/retention)'),
    value: z.unknown().describe('The new value; omit to delete the field').optional(),
    delete: z.boolean().optional().describe('Remove the field instead of setting it'),
  },
  apply(document, args) {
    const pointer = args.pointer as string
    if (isProtected(pointer)) return refuse(protectionRefusal(pointer))
    const { next, tracker } = workingCopy(document)
    const outcome = args.delete
      ? applyOne(next, { op: 'remove', path: pointer }, tracker)
      : applyOne(next, { op: 'add', path: pointer, value: args.value }, tracker)
    if (!outcome.ok) return refuse(outcome.issue)
    return concludeGeneric(
      'set_field',
      document,
      next as unknown as ShowRecordV2,
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
  family: 'generic',
  description:
    'Bounded backstop: apply a JSON Patch (RFC 6902: add, remove, replace, move, copy, test) to declared ' +
    'Show record structure for multi-field edits no specific operation covers. Every patch member must ' +
    'leave a structurally valid Show; arbitrary scratch fields, temporary containers, and final-only-valid ' +
    'sequences are refused. The complete patch remains atomic and its final result is tier-0 validated, ' +
    'even inside a transaction. Prefer specific operations; every apply_patch use is logged as a gap signal.',
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
      // This diagnostic patch surface supports operations over declared Show
      // structure only. Validate every member rather than only the final
      // result, so temporary scratch fields and parking containers cannot
      // disappear before validation while still influencing later writes.
      const structuralIssues = validateShowStructure(next)
      if (structuralIssues.length > 0) {
        return refuse({
          code: 'invalid-argument',
          path: operation.path,
          message:
            `Patch operation ${index} (${operation.op} ${operation.path}) does not preserve declared Show structure: ` +
            structuralIssues.map((issue) => `[${issue.code}] ${issue.message}`).join('; '),
        })
      }
    }
    const pointers = patch.map((operation) => operation.path)
    return concludeGeneric(
      'apply_patch',
      document,
      next as unknown as ShowRecordV2,
      pointers,
      `Applied a ${patch.length}-operation JSON Patch touching ${pointers.join(', ')} (generic apply_patch).`,
    )
  },
}

export const GENERIC_OPERATIONS: ShowGrammarOperation[] = [setField, applyPatch]

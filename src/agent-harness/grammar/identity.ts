// V2-authored for #945 (third candidate review of the corrections, P1).
// Element identity of a ShowRecord under the generic operations, modelled as
// provenance carried by the objects of one private working copy rather than
// re-inferred from the path an object currently sits at.
//
// Why: path-only checks lost an element's identity as a move changed its
// location. The tracker instead tags every element in the private working
// copy. Jon's later narrowed completion contract requires every patch member
// to remain declared Show structure, so arbitrary parking wrappers are now
// rejected before a later member can use them.
//
// The model. When a generic operation clones the record into its private
// working copy it creates one IdentityTracker over that clone, which tags
// every array-member object carrying a string `id` - a Scene, Zone, Layout,
// Transition, instance, placement, layer, Effect, track, keyframe, marker or
// output Effect - with its id and its identity domain, keyed by the object
// reference (a WeakMap). Obligations then follow the object:
//   - a tagged object's `id` is never written or removed, wherever it sits;
//   - a write over a tagged object keeps it under its own id and the fresh
//     value inherits the tag; an ancestor write keeps every tagged object the
//     written value holds an object for at its place - under its own id, a
//     missing id being a rewrite - and drops (tombstones) those it holds
//     nothing for; it never renames one and never introduces an element;
//   - removal tombstones every tagged object in the removed subtree in the
//     domain its tag records, and a tombstone survives the whole patch;
//   - copy of anything tagged is refused: the generics cannot mint ids;
//   - a move transports the same object references, tags intact. The root of
//     the moved subtree enters the destination collection when placed at an
//     array position (re-domained and checked against tombstones and
//     duplicates like an insertion; an undeclared collection fails closed).
//     Nested elements stay in their own collections, which move with them,
//     and are re-derived where a declared destination changes their domain
//     (an Effect stack moved between placements). A move onto an existing key
//     drops what was there before checking the incoming identities, so the
//     admission is equivalent to an explicit remove-destination then move;
//   - an inserted fresh value has every array-member object with an id
//     tagged after the insertion checks, so inserted elements acquire the
//     same obligations; an object with an id at a key site that was never a
//     collection member (a Pattern reference, a wrapper) is not an element
//     until it enters one, and an untagged array member never gains an id.
// The identity domains are policy, not inference: within a domain an id
// names one element and the engine refuses duplicates; across domains one
// string may name different elements. Sources: validateShowComposition and
// validateShowPropertyTracks, whose duplicate-id checks span main and
// overlay placements together, overlay layers, instances, markers, layer
// transitions, tracks and keyframes across every Scene and track; and
// findEffect, which looks an Effect up within its placement's stack. A
// collection shape not declared here fails closed: a removal from it
// tombstones the id in every domain and an insertion into it is refused by
// a tombstone in any domain.
//
// Everything here is pure: the tracker owns no record, mutates nothing but
// its own tags and ledger, and is dropped with the working copy on refusal.
import type { GrammarIssue } from './types.js'

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

export const IDENTITY_REMEDY =
  'Edit the element under its existing id; insert a new element with an add at an array position ' +
  '(…/-) carrying a fresh id; remove and add in separate operations rather than reusing an id; ' +
  'prefer the specific operation for the element where one exists.'

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const escapeSegment = (segment: string) => segment.replace(/~/g, '~0').replace(/\//g, '~1')

const idOf = (value: unknown): string | undefined =>
  isRecordObject(value) && typeof value.id === 'string' ? value.id : undefined

/** The key an array member is known by: its id, else its composition owner, else its index. */
const ownerKeyOf = (item: unknown, index: number): string =>
  idOf(item) ??
  (isRecordObject(item) && typeof item.sceneId === 'string' ? item.sceneId : undefined) ??
  (isRecordObject(item) && typeof item.zoneId === 'string' ? item.zoneId : undefined) ??
  String(index)

/** An array of the record: its shape (array steps as `*`) and the owner key of its enclosing element. */
interface Collection {
  shape: string
  ownerKey: string
}

/** Where a node sits in the record; `collection` is set when the node is an array member. */
export interface Site {
  shape: string
  ownerKey: string
  collection: Collection | null
}

/** The identity domain of the members of a collection. */
function identityDomain(collection: Collection): string {
  if (PLACEMENT_SHAPES.includes(collection.shape)) return 'placement'
  if (EFFECT_SHAPES.includes(collection.shape)) return `effect@${collection.ownerKey}`
  if (RECORD_WIDE_SHAPES.includes(collection.shape)) return collection.shape
  return UNDECLARED_DOMAIN
}

interface Tag {
  id: string
  domain: string
}

interface Visit {
  node: Record<string, unknown>
  id: string | undefined
  /** Owner-keyed pointer relative to the walked value. */
  pointer: string
  /** The collection the node is a member of, when it is an array member. */
  collection: Collection | null
}

/** Every object in `value`, with its relative owner-keyed pointer and its membership. */
function forEachObject(value: unknown, site: Site, visit: (found: Visit) => void, pointer = ''): void {
  if (Array.isArray(value)) {
    const collection: Collection = { shape: site.shape, ownerKey: site.ownerKey }
    value.forEach((item, index) => {
      const key = ownerKeyOf(item, index)
      forEachObject(item, { shape: `${site.shape}/*`, ownerKey: key, collection }, visit, `${pointer}/${escapeSegment(key)}`)
    })
    return
  }
  if (!isRecordObject(value)) return
  visit({ node: value, id: idOf(value), pointer, collection: site.collection })
  for (const [key, child] of Object.entries(value)) {
    forEachObject(child, { shape: `${site.shape}/${escapeSegment(key)}`, ownerKey: site.ownerKey, collection: null }, visit, `${pointer}/${escapeSegment(key)}`)
  }
}

const identityIssue = (message: string, path: string): GrammarIssue => ({
  code: 'invalid-argument',
  message,
  remedy: IDENTITY_REMEDY,
  path,
})

/** An element a written value would place in a collection. */
interface Candidate {
  node: Record<string, unknown>
  id: string
  pointer: string
  collection: Collection
}

/** The pointer of the collection a member candidate sits in. */
const collectionPointerOf = (pointer: string) => pointer.slice(0, pointer.lastIndexOf('/'))

/** Two members of one collection sharing an id inside a written value, if any. */
function duplicateWithin(candidates: Candidate[], path: string): GrammarIssue | null {
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate.pointer)) {
      return identityIssue(
        `${path}${collectionPointerOf(candidate.pointer)}: element identity "${candidate.id}" would appear twice; ids are unique within their collection.`,
        path,
      )
    }
    seen.add(candidate.pointer)
  }
  return null
}

export interface IdentityTracker {
  /** The site of the existing node at `segments`. */
  siteOf(segments: string[]): Site
  /** The site a value would take as the child `key` of the node at `parentSite`. */
  childSite(parentSite: Site, parent: unknown[] | Record<string, unknown>, key: string, value: unknown): Site
  /** Refusal when the pointer names an element's id (or would give an array member one). */
  pointerIssue(segments: string[], path: string, verb: string): GrammarIssue | null
  /** A fresh value inserted at a site that holds nothing yet; tags its elements on success. */
  insertIssue(value: unknown, site: Site, targetArray: unknown[] | null, path: string): GrammarIssue | null
  /** A fresh value written over `oldValue` at its site; tags kept elements and tombstones dropped ones on success. */
  overwriteIssue(oldValue: unknown, nextValue: unknown, site: Site, path: string): GrammarIssue | null
  /** A transported subtree placed at a site, first dropping `oldValue` if the site held one; re-domains entering elements on success. */
  placeIssue(value: unknown, oldValue: unknown, site: Site, targetArray: unknown[] | null, path: string): GrammarIssue | null
  /** A value leaving the record: every tagged object in it is tombstoned in its domain. */
  removed(value: unknown): void
  /** Refusal when a value carries identity and so cannot be copied. */
  copyIssue(value: unknown, from: string, path: string): GrammarIssue | null
}

const ROOT_SITE: Site = { shape: '', ownerKey: '', collection: null }

/**
 * Tag every element of a freshly cloned working copy and answer the identity
 * questions the patch applier asks as it mutates that copy.
 */
export function createIdentityTracker(root: unknown): IdentityTracker {
  const tags = new WeakMap<object, Tag>()
  /** Removed id → the domains earlier operations of this patch removed it from. */
  const removedIds = new Map<string, Set<string>>()

  const tagMembers = (value: unknown, site: Site, onMember: (candidate: Candidate) => void) => {
    forEachObject(value, site, (found) => {
      if (found.collection && found.id !== undefined) {
        onMember({ node: found.node, id: found.id, pointer: found.pointer, collection: found.collection })
      }
    })
  }

  forEachObject(root, ROOT_SITE, (found) => {
    if (found.collection && found.id !== undefined) tags.set(found.node, { id: found.id, domain: identityDomain(found.collection) })
  })

  function tombstone(domain: string, id: string): void {
    const domains = removedIds.get(id) ?? new Set<string>()
    domains.add(domain)
    removedIds.set(id, domains)
  }

  function isTombstoned(domain: string, id: string): boolean {
    const domains = removedIds.get(id)
    if (!domains) return false
    return domain === UNDECLARED_DOMAIN || domains.has(UNDECLARED_DOMAIN) || domains.has(domain)
  }

  /** The candidates of `value` that enter a collection, refused when one recycles a tombstoned id or duplicates a sibling. */
  function enteringIssue(
    value: unknown,
    site: Site,
    targetArray: unknown[] | null,
    path: string,
    transported = false,
  ): { ok: true; entering: Candidate[] } | { ok: false; issue: GrammarIssue } {
    const members: Candidate[] = []
    const entering: Candidate[] = []
    tagMembers(value, site, (candidate) => {
      members.push(candidate)
      // A tagged element nested in a transported subtree is still in its own
      // collection; where the destination declares no domain it is in transit
      // and keeps the one it has.
      if (transported && candidate.pointer !== '' && tags.has(candidate.node) && identityDomain(candidate.collection) === UNDECLARED_DOMAIN) return
      entering.push(candidate)
    })
    for (const candidate of entering) {
      if (isTombstoned(identityDomain(candidate.collection), candidate.id)) {
        return {
          ok: false,
          issue: identityIssue(
            `${path}: element identity "${candidate.id}" was removed earlier in this patch and cannot be reintroduced here; ids are never recycled.`,
            path,
          ),
        }
      }
    }
    const own = site.collection ? idOf(value) : undefined
    if (own !== undefined && targetArray?.some((item) => idOf(item) === own)) {
      return {
        ok: false,
        issue: identityIssue(`${path}: element identity "${own}" would appear twice; ids are unique within their collection.`, path),
      }
    }
    const duplicated = duplicateWithin(members, path)
    if (duplicated) return { ok: false, issue: duplicated }
    return { ok: true, entering }
  }

  function taggedIn(value: unknown): Array<{ node: Record<string, unknown>; pointer: string; tag: Tag }> {
    const found: Array<{ node: Record<string, unknown>; pointer: string; tag: Tag }> = []
    forEachObject(value, ROOT_SITE, (visit) => {
      const tag = tags.get(visit.node)
      if (tag) found.push({ node: visit.node, pointer: visit.pointer, tag })
    })
    return found
  }

  function nodeAt(segments: string[]): unknown {
    let node: unknown = root
    for (const segment of segments) {
      if (Array.isArray(node)) node = node[Number(segment)]
      else if (isRecordObject(node)) node = node[segment]
      else return undefined
    }
    return node
  }

  function removed(value: unknown): void {
    for (const { tag } of taggedIn(value)) tombstone(tag.domain, tag.id)
  }

  return {
    siteOf(segments) {
      let node: unknown = root
      let site: Site = ROOT_SITE
      for (const segment of segments) {
        if (Array.isArray(node)) {
          const index = Number(segment)
          const item = node[index]
          site = { shape: `${site.shape}/*`, ownerKey: ownerKeyOf(item, index), collection: { shape: site.shape, ownerKey: site.ownerKey } }
          node = item
        } else if (isRecordObject(node)) {
          site = { shape: `${site.shape}/${escapeSegment(segment)}`, ownerKey: site.ownerKey, collection: null }
          node = node[segment]
        } else {
          break
        }
      }
      return site
    },

    childSite(parentSite, parent, key, value) {
      if (Array.isArray(parent)) {
        const index = key === '-' ? parent.length : Number(key)
        return {
          shape: `${parentSite.shape}/*`,
          ownerKey: ownerKeyOf(value, index),
          collection: { shape: parentSite.shape, ownerKey: parentSite.ownerKey },
        }
      }
      return { shape: `${parentSite.shape}/${escapeSegment(key)}`, ownerKey: parentSite.ownerKey, collection: null }
    },

    pointerIssue(segments, path, verb) {
      if (segments.length < 2 || segments[segments.length - 1] !== 'id') return null
      const owner = nodeAt(segments.slice(0, -1))
      if (!isRecordObject(owner)) return null
      const tag = tags.get(owner)
      if (!tag && !Array.isArray(nodeAt(segments.slice(0, -2)))) return null
      return identityIssue(
        `${path}: element identity ${tag ? `"${tag.id}" ` : ''}would be ${verb}; ids are minted by the operations and never rewritten.`,
        path,
      )
    },

    insertIssue(value, site, targetArray, path) {
      const checked = enteringIssue(value, site, targetArray, path)
      if (!checked.ok) return checked.issue
      for (const candidate of checked.entering) tags.set(candidate.node, { id: candidate.id, domain: identityDomain(candidate.collection) })
      return null
    },

    overwriteIssue(oldValue, nextValue, site, path) {
      const entries = new Map<string, Tag>()
      for (const { pointer, tag } of taggedIn(oldValue)) entries.set(pointer, tag)

      const own = entries.get('')
      if (own && idOf(nextValue) !== own.id) {
        const next = idOf(nextValue)
        return identityIssue(
          `${path}: element identity "${own.id}" would become ${next === undefined ? 'missing' : `"${next}"`}; ids are minted by the operations and never rewritten.`,
          path,
        )
      }
      if (!own && site.collection && idOf(nextValue) !== undefined) {
        return identityIssue(
          `${path}: "${idOf(nextValue)}" would introduce an element identity where the element had none; ids are minted by the operations and never rewritten.`,
          path,
        )
      }

      const members: Candidate[] = []
      const kept = new Map<string, { node: Record<string, unknown>; tag: Tag }>()
      let issue: GrammarIssue | null = null
      forEachObject(nextValue, site, (found) => {
        if (issue) return
        const entry = entries.get(found.pointer)
        if (found.id === undefined) {
          // An object at a tagged element's place is that element, kept; without its id it is a rewrite.
          if (entry) {
            issue = identityIssue(
              `${path}${found.pointer}: element identity "${entry.id}" would become missing; ids are minted by the operations and never rewritten.`,
              path,
            )
          }
          return
        }
        if (found.collection) {
          members.push({ node: found.node, id: found.id, pointer: found.pointer, collection: found.collection })
          if (!entry) {
            const collectionPointer = collectionPointerOf(found.pointer)
            const written = new Set<string>()
            forEachObject(nextValue, site, (sibling) => {
              if (sibling.collection && sibling.id !== undefined && collectionPointerOf(sibling.pointer) === collectionPointer) written.add(sibling.id)
            })
            const dropped = [...entries.entries()]
              .filter(([pointer, tag]) => collectionPointerOf(pointer) === collectionPointer && !written.has(tag.id))
              .map(([, tag]) => tag.id)
            issue = identityIssue(
              `${path}${collectionPointer}: element identity "${found.id}" is not in the subtree being replaced` +
                `${dropped.length > 0 ? ` (which would lose ${dropped.map((id) => `"${id}"`).join(', ')})` : ''}; ` +
                'a write over existing elements keeps each under its own id and introduces none.',
              path,
            )
            return
          }
        } else if (!entry) {
          return
        }
        if (entry.id !== found.id) {
          issue = identityIssue(
            `${path}${found.pointer}: element identity "${entry.id}" would become "${found.id}"; ids are minted by the operations and never rewritten.`,
            path,
          )
          return
        }
        kept.set(found.pointer, { node: found.node, tag: entry })
      })
      if (issue) return issue
      const duplicated = duplicateWithin(members, path)
      if (duplicated) return duplicated

      for (const [pointer, tag] of entries) {
        if (!kept.has(pointer)) tombstone(tag.domain, tag.id)
      }
      for (const { node, tag } of kept.values()) tags.set(node, tag)
      return null
    },

    placeIssue(value, oldValue, site, targetArray, path) {
      // A key placement replaces its old subtree. Account for that removal
      // before admission, exactly as an explicit remove followed by move:
      // otherwise two distinct Effects with the same id in independent source
      // placements can redirect the destination placement's identity.
      // On refusal the generic operation discards this tracker and its private
      // working copy, so these provisional tombstones cannot escape.
      if (oldValue !== undefined) removed(oldValue)
      const checked = enteringIssue(value, site, targetArray, path, true)
      if (!checked.ok) return checked.issue
      for (const candidate of checked.entering) tags.set(candidate.node, { id: candidate.id, domain: identityDomain(candidate.collection) })
      return null
    },

    removed,

    copyIssue(value, from, path) {
      const [carried] = taggedIn(value)
      if (!carried) return null
      return identityIssue(
        `Copy of ${from} would duplicate element identity "${carried.tag.id}"; the generic operations cannot mint ids.`,
        path,
      )
    },
  }
}

import { materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowRecordV2 } from './showCompositionV2'

/**
 * Every authored identity a v2 record already owns, including the identities
 * materialized Group children take. Pure owners use it to reject an identity
 * plan that collides; the command layer uses it to mint a fresh identity before
 * calling an owner, because identity is never allocated inside a pure owner.
 */
export function ownedShowIdsV2(record: ShowRecordV2): Set<string> {
  const ids = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (typeof value === 'object' && value !== null) {
      const object = value as Record<string, unknown>
      // A structured Pattern reference names a dependency, not an authored owner.
      const keys = Object.keys(object)
      if (keys.length === 2 && keys.includes('kind') && keys.includes('id')
        && (object.kind === 'stock' || object.kind === 'user')) return
      if (typeof object.id === 'string') ids.add(object.id)
      Object.values(object).forEach(visit)
    }
  }
  visit(record)
  if (record.composition.groupOccurrences.length > 0) visit(materializeShowGroupsV2(record))
  return ids
}

/**
 * A deterministic fresh identity derived from a readable base. The same record
 * and base always produce the same identity, so command transcripts and their
 * reopened artifacts compare exactly.
 */
export function freshShowIdV2(base: string, used: ReadonlySet<string>): string {
  const cleaned = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'id'
  if (!used.has(cleaned)) return cleaned
  let suffix = 2
  while (used.has(`${cleaned}-${suffix}`)) suffix += 1
  return `${cleaned}-${suffix}`
}

/** Mint several fresh identities at once without letting them collide. */
export function freshShowIdsV2(bases: readonly string[], used: ReadonlySet<string>): string[] {
  const taken = new Set(used)
  return bases.map(base => {
    const id = freshShowIdV2(base, taken)
    taken.add(id)
    return id
  })
}

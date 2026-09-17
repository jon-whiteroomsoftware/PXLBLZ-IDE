import type { ShowRoutingLayout, ShowRoutingLayoutZone } from './personalContentRecords'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { validateShowLogicalRouting, type ShowLogicalRouting } from './showLogicalRouting'

/**
 * The v2 owner for Zone Layout definitions (#1039): add, duplicate, rename,
 * remove, the routing mode with its operator and member Zones, and an
 * Installation Zone's physical LED ranges.
 *
 * A Layout occurrence names a definition; `showLayoutIntervalsV2` owns the
 * occurrences and, before this owner, was the only writer that reached
 * `zoneLayouts` at all - and only by cloning one definition for Make Unique.
 * v1's `addShowRoutingLayout`, `updateShowRoutingLayout` and
 * `removeShowRoutingLayout` are the specification of what these edits mean.
 *
 * Two deliberate differences from v1, both recorded in the editor contract:
 *
 * - v1 silently uniquified a new definition's name. Names reach the compiler
 *   as recipe keys, so this owner refuses a collision and the caller supplies
 *   the name it wants.
 * - v1 removed a definition by dropping the routing switches that named it,
 *   after which the interval at time zero re-pointed at whatever definition was
 *   first in the list. A v2 occurrence names its definition explicitly and the
 *   first occurrence cannot be removed, so that rewrite has no exact v2 form.
 *   This owner refuses while an occurrence still names the definition; the
 *   author selects another definition on those occurrences first, through the
 *   occurrence owner that already does exactly that.
 */
export type ShowZoneLayoutDefinitionIntentV2 =
  | { kind: 'add'; layoutId: string; name: string }
  | { kind: 'duplicate'; layoutId: string; name: string; sourceLayoutId: string }
  | { kind: 'rename'; layoutId: string; name: string }
  | { kind: 'remove'; layoutId: string }
  | { kind: 'set-routing'; layoutId: string; logical: ShowLogicalRouting | null }
  | { kind: 'set-physical-ranges'; layoutId: string; zoneId: string; ranges: ReadonlyArray<{ start: number; end: number }> }

export type ShowZoneLayoutDefinitionRefusalV2 =
  | 'invalid-record'
  | 'invalid-request'
  | 'missing-target'
  | 'missing-zone'
  | 'identity-conflict'
  | 'duplicate-name'
  | 'last-definition'
  | 'definition-in-use'
  | 'unsupported-contract'
  | 'invalid-routing'
  | 'zone-unavailable'
  | 'invalid-result'

export interface ShowZoneLayoutDefinitionAffectedV2 {
  affectedLayoutDefinitionIds: string[]
  affectedLayoutOccurrenceIds: string[]
  affectedZoneIds: string[]
  removedIds: string[]
}

export type ShowZoneLayoutDefinitionResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowZoneLayoutDefinitionAffectedV2)
  | ({ status: 'unchanged'; record: ShowRecordV2 } & ShowZoneLayoutDefinitionAffectedV2)
  | ({
    status: 'refused'
    record: ShowRecordV2
    code: ShowZoneLayoutDefinitionRefusalV2
    message: string
  } & ShowZoneLayoutDefinitionAffectedV2)

function emptyAffected(): ShowZoneLayoutDefinitionAffectedV2 {
  return { affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedZoneIds: [], removedIds: [] }
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Apply one complete, immutable Zone Layout definition edit to a v2 record. */
export function editShowZoneLayoutDefinitionV2(
  record: ShowRecordV2,
  intent: ShowZoneLayoutDefinitionIntentV2,
): ShowZoneLayoutDefinitionResultV2 {
  const refuse = (code: ShowZoneLayoutDefinitionRefusalV2, message: string): ShowZoneLayoutDefinitionResultV2 => ({
    status: 'refused', record, code, message, ...emptyAffected(),
  })
  const unchanged = (): ShowZoneLayoutDefinitionResultV2 => ({ status: 'unchanged', record, ...emptyAffected() })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  if (!text(intent.layoutId)) return refuse('invalid-request', 'Give one nonblank Zone Layout identity.')

  if (intent.kind === 'add' || intent.kind === 'duplicate') {
    const name = text(intent.name) ? intent.name.trim() : ''
    if (!name) return refuse('invalid-request', 'A Zone Layout needs a nonblank name.')
    if (record.zoneLayouts.some(layout => layout.id === intent.layoutId)) {
      return refuse('identity-conflict', `Zone Layout identity "${intent.layoutId}" already exists.`)
    }
    const collision = record.zoneLayouts.find(layout => layout.name.trim().toLowerCase() === name.toLowerCase())
    if (collision) return refuse('duplicate-name', `Zone Layout "${collision.id}" is already named "${collision.name}".`)
    const source = intent.kind === 'duplicate'
      ? record.zoneLayouts.find(layout => layout.id === intent.sourceLayoutId)
      : undefined
    if (intent.kind === 'duplicate' && !source) {
      return refuse('missing-target', `Zone Layout "${intent.sourceLayoutId}" does not exist.`)
    }
    const candidate = structuredClone(record)
    candidate.zoneLayouts.push(source
      ? { ...structuredClone(source), id: intent.layoutId, name }
      : { id: intent.layoutId, name, ...defaultDefinitionBody(record) })
    return commit(candidate, { ...emptyAffected(), affectedLayoutDefinitionIds: [intent.layoutId] }, refuse)
  }

  const layout = record.zoneLayouts.find(candidate => candidate.id === intent.layoutId)
  if (!layout) return refuse('missing-target', `Zone Layout "${intent.layoutId}" does not exist.`)

  if (intent.kind === 'rename') {
    const name = text(intent.name) ? intent.name.trim() : ''
    if (!name) return refuse('invalid-request', 'A Zone Layout needs a nonblank name.')
    if (name === layout.name) return unchanged()
    const collision = record.zoneLayouts.find(candidate => (
      candidate.id !== layout.id && candidate.name.trim().toLowerCase() === name.toLowerCase()
    ))
    if (collision) return refuse('duplicate-name', `Zone Layout "${collision.id}" is already named "${collision.name}".`)
    const candidate = structuredClone(record)
    candidate.zoneLayouts.find(entry => entry.id === layout.id)!.name = name
    return commit(candidate, { ...emptyAffected(), affectedLayoutDefinitionIds: [layout.id] }, refuse)
  }

  if (intent.kind === 'remove') {
    if (record.zoneLayouts.length <= 1) return refuse('last-definition', 'A Show keeps at least one Zone Layout.')
    const uses = record.composition.layoutOccurrences.filter(occurrence => occurrence.layoutId === layout.id)
    if (uses.length > 0) {
      return refuse('definition-in-use', `Layout occurrence${uses.length === 1 ? '' : 's'} ${
        uses.map(occurrence => `"${occurrence.id}"`).join(', ')
      } still use${uses.length === 1 ? 's' : ''} Zone Layout "${layout.id}". Select another Zone Layout there first.`)
    }
    const candidate = structuredClone(record)
    candidate.zoneLayouts = candidate.zoneLayouts.filter(entry => entry.id !== layout.id)
    return commit(candidate, {
      ...emptyAffected(),
      affectedLayoutDefinitionIds: [layout.id],
      removedIds: [layout.id],
    }, refuse)
  }

  if (intent.kind === 'set-routing') {
    if (intent.logical === null) {
      if (record.outputContract.kind === 'portable-2d') {
        return refuse('unsupported-contract', 'A Portable Show routes every Zone by normalized Stage position, so it needs a routing operator.')
      }
      if (!layout.logical) return unchanged()
      const candidate = structuredClone(record)
      delete candidate.zoneLayouts.find(entry => entry.id === layout.id)!.logical
      return commit(candidate, { ...emptyAffected(), affectedLayoutDefinitionIds: [layout.id] }, refuse)
    }
    const logical: unknown = intent.logical
    if (!logical || typeof logical !== 'object' || Array.isArray(logical)
      || !Array.isArray((logical as ShowLogicalRouting).zoneIds)
      || !(logical as ShowLogicalRouting).zoneIds.every(text)) {
      return refuse('invalid-request', 'A routing operator needs its kind and its member Zone identities.')
    }
    const missing = intent.logical.zoneIds.find(zoneId => !record.zones.some(zone => zone.id === zoneId))
    if (missing !== undefined) return refuse('missing-zone', `Zone "${missing}" does not exist.`)
    const issue = validateShowLogicalRouting(intent.logical)[0]
    if (issue) return refuse('invalid-routing', issue)
    if (JSON.stringify(layout.logical ?? null) === JSON.stringify(intent.logical)) return unchanged()
    const candidate = structuredClone(record)
    candidate.zoneLayouts.find(entry => entry.id === layout.id)!.logical = structuredClone(intent.logical)
    return commit(candidate, { ...emptyAffected(), affectedLayoutDefinitionIds: [layout.id] }, refuse)
  }

  if (layout.logical) {
    return refuse('invalid-request', `Zone Layout "${layout.id}" routes by operator; physical LED ranges belong to a physical Zone Layout.`)
  }
  if (!record.zones.some(zone => zone.id === intent.zoneId)) {
    return refuse('missing-zone', `Zone "${intent.zoneId}" does not exist.`)
  }
  const raw: unknown = intent.ranges
  if (!Array.isArray(raw)
    || raw.some(range => (
      !range || typeof range !== 'object' || Array.isArray(range)
      || Object.keys(range).length !== 2
      || !Number.isSafeInteger((range as { start: unknown }).start)
      || !Number.isSafeInteger((range as { end: unknown }).end)
      || (range as { start: number }).start < 0
      || (range as { end: number }).end < 0
    ))) {
    return refuse('invalid-request', 'Physical LED ranges are whole nonnegative start and end pixel indexes.')
  }
  // v1's `parseShowRoutingRanges` orders each range low-to-high and sorts them.
  const ranges = intent.ranges
    .map(range => ({ start: Math.min(range.start, range.end), end: Math.max(range.start, range.end) }))
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const current = layout.zones.find(entry => entry.zoneId === intent.zoneId)
  if (current && JSON.stringify(current.ranges) === JSON.stringify(ranges)) return unchanged()
  const candidate = structuredClone(record)
  const edited = candidate.zoneLayouts.find(entry => entry.id === layout.id)!
  if (current) edited.zones = edited.zones.map(entry => entry.zoneId === intent.zoneId ? { zoneId: entry.zoneId, ranges } : entry)
  else edited.zones.push({ zoneId: intent.zoneId, ranges })
  return commit(candidate, {
    ...emptyAffected(),
    affectedLayoutDefinitionIds: [layout.id],
    affectedZoneIds: [intent.zoneId],
  }, refuse)
}

/**
 * v1's `addShowRoutingLayout` default: nominal contiguous physical ranges from
 * the Show's Zones, plus - for a Portable contract - the first definition's
 * operator, or Full Surface on the first Zone when there is none.
 */
function defaultDefinitionBody(record: ShowRecordV2): Pick<ShowRoutingLayout, 'zones' | 'logical'> {
  let offset = 0
  const zones: ShowRoutingLayoutZone[] = record.zones.map(zone => {
    const pixelCount = Math.max(1, Math.round(zone.nominalPixelCount))
    const start = offset
    offset += pixelCount
    return { zoneId: zone.id, ranges: [{ start, end: start + pixelCount - 1 }] }
  })
  if (record.outputContract.kind !== 'portable-2d') return { zones }
  const source = record.zoneLayouts[0]?.logical
  return {
    zones,
    logical: source
      ? structuredClone(source)
      : { kind: 'single', zoneIds: [record.zones[0].id] },
  }
}

function commit(
  candidate: ShowRecordV2,
  affected: ShowZoneLayoutDefinitionAffectedV2,
  refuse: (code: ShowZoneLayoutDefinitionRefusalV2, message: string) => ShowZoneLayoutDefinitionResultV2,
): ShowZoneLayoutDefinitionResultV2 {
  for (const layout of candidate.zoneLayouts) {
    const issue = layout.logical ? validateShowLogicalRouting(layout.logical)[0] : undefined
    if (issue) return refuse('invalid-routing', `Zone Layout "${layout.id}": ${issue}`)
  }
  const issue = validateShowRecordV2(candidate)[0]
  if (issue) {
    return refuse('invalid-result', `The requested Zone Layout edit would produce an invalid Show at ${issue.path}: ${issue.message}`)
  }
  const availability = validateShowLayoutAvailabilityV2(candidate)[0]
  if (availability) {
    return refuse(
      'zone-unavailable',
      `${availability.entityKind} "${availability.entityId}" uses Zone "${availability.zoneId}" while Layout occurrence "${availability.layoutOccurrenceId}" does not provide it.`,
    )
  }
  return { status: 'changed', record: candidate, ...affected }
}

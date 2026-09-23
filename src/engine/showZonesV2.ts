import type { ShowZone } from './personalContentRecords'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { deleteShowGroupOccurrenceV2 } from './showGroupEditsV2'
import { editShowLayerV2 } from './showLayersV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { validateShowLogicalRouting } from './showLogicalRouting'
import { editShowTransitionV2, type ShowTransitionCarrierRampProjectionPlanV2 } from './showTransitionsV2'

/**
 * The v2 owner for the Show's Zone collection: adding a Zone and removing one
 * with everything it owns (#1039).
 *
 * This is a representation port, not new capability. v1's `addShowZone` and
 * `removeShowZone` in `showModel.ts` are the specification of what each edit
 * means, including the rule that every Layout definition must route a new Zone
 * (`appendZoneToLayout`) and that a definition whose logical operator named a
 * removed Zone falls back to physical ranges.
 *
 * Identity is never allocated here: the caller supplies the complete new Zone.
 * The removal cascade reuses the owners that already know those rules - the
 * Group occurrence owner, the Clip-deletion owner with its Transition and
 * Clip-track cascades, and the Layer owner - rather than reimplementing them.
 */
export interface ShowZoneClipRemovalPlanV2 {
  clipId: string
  /** One complete ramp projection plan per removed carrier Transition. */
  propertyRampProjections: readonly ShowTransitionCarrierRampProjectionPlanV2[]
}

export type ShowZoneEditIntentV2 =
  | { kind: 'add'; zone: ShowZone }
  | { kind: 'remove'; zoneId: string; clipRemovals?: readonly ShowZoneClipRemovalPlanV2[] }

export type ShowZoneEditRefusalV2 =
  | 'invalid-record'
  | 'invalid-request'
  | 'missing-target'
  | 'identity-conflict'
  | 'duplicate-name'
  | 'last-zone'
  | 'unsupported-content'
  | 'unsupported-property-carrier'
  | 'invalid-routing'
  | 'zone-unavailable'
  | 'invalid-result'

export interface ShowZoneEditAffectedV2 {
  affectedZoneIds: string[]
  affectedLayerIds: string[]
  affectedClipIds: string[]
  affectedInstanceIds: string[]
  affectedTransitionIds: string[]
  affectedTrackIds: string[]
  affectedLayoutDefinitionIds: string[]
  affectedGroupOccurrenceIds: string[]
  removedIds: string[]
}

export type ShowZoneEditResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowZoneEditAffectedV2)
  | ({ status: 'unchanged'; record: ShowRecordV2 } & ShowZoneEditAffectedV2)
  | ({ status: 'refused'; record: ShowRecordV2; code: ShowZoneEditRefusalV2; message: string } & ShowZoneEditAffectedV2)

const MAX_NOMINAL_PIXEL_COUNT = 100_000

function emptyAffected(): ShowZoneEditAffectedV2 {
  return {
    affectedZoneIds: [],
    affectedLayerIds: [],
    affectedClipIds: [],
    affectedInstanceIds: [],
    affectedTransitionIds: [],
    affectedTrackIds: [],
    affectedLayoutDefinitionIds: [],
    affectedGroupOccurrenceIds: [],
    removedIds: [],
  }
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Apply one complete, immutable Zone edit to a validated Show v2 record. */
export function editShowZoneV2(record: ShowRecordV2, intent: ShowZoneEditIntentV2): ShowZoneEditResultV2 {
  const refuse = (code: ShowZoneEditRefusalV2, message: string): ShowZoneEditResultV2 => ({
    status: 'refused', record, code, message, ...emptyAffected(),
  })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  return intent.kind === 'add' ? addZone(record, intent.zone, refuse) : removeZone(record, intent, refuse)
}

type Refuse = (code: ShowZoneEditRefusalV2, message: string) => ShowZoneEditResultV2

function addZone(record: ShowRecordV2, zone: ShowZone, refuse: Refuse): ShowZoneEditResultV2 {
  const raw: unknown = zone
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return refuse('invalid-request', 'Give one complete new Zone.')
  const fields = Object.keys(raw)
  if (fields.some(field => !['id', 'name', 'nominalPixelCount', 'color', 'icon'].includes(field))) {
    return refuse('invalid-request', 'A Zone carries only identity, name, nominal pixel count, color and icon.')
  }
  if (!text(zone.id) || !text(zone.name)
    || !Number.isSafeInteger(zone.nominalPixelCount)
    || zone.nominalPixelCount < 1
    || zone.nominalPixelCount > MAX_NOMINAL_PIXEL_COUNT
    || (zone.color !== undefined && !text(zone.color))
    || (zone.icon !== undefined && !text(zone.icon))) {
    return refuse('invalid-request', `A Zone needs a nonblank identity and name plus a whole nominal pixel count from 1 to ${MAX_NOMINAL_PIXEL_COUNT}.`)
  }
  if (record.zones.some(candidate => candidate.id === zone.id)) {
    return refuse('identity-conflict', `Zone identity "${zone.id}" already exists.`)
  }
  const name = zone.name.trim()
  const collision = record.zones.find(candidate => candidate.name.trim().toLowerCase() === name.toLowerCase())
  if (collision) return refuse('duplicate-name', `Zone "${collision.id}" is already named "${collision.name}".`)

  const candidate = structuredClone(record)
  candidate.zones.push({ ...structuredClone(zone), name })
  // v1's appendZoneToLayout: every definition that names its Zones routes the new one, or the
  // whole Show stops preparing with "references missing zone". An entry-less definition already
  // routes every Zone, so it stays entry-less (#1064 item 4; v1 narrows it, a recorded divergence).
  for (const layout of candidate.zoneLayouts) {
    if (layout.zones.length === 0 && !layout.logical) continue
    const largestEnd = layout.zones.reduce(
      (largest, entry) => entry.ranges.reduce((value, range) => Math.max(value, range.end), largest),
      -1,
    )
    const start = largestEnd + 1
    layout.zones.push({ zoneId: zone.id, ranges: [{ start, end: start + zone.nominalPixelCount - 1 }] })
    if (layout.logical) layout.logical = appendZoneToLogicalRouting(layout.logical, zone.id)
  }
  return commit(candidate, {
    ...emptyAffected(),
    affectedZoneIds: [zone.id],
    affectedLayoutDefinitionIds: candidate.zoneLayouts.map(layout => layout.id),
  }, refuse)
}

/**
 * v1's rule, comment included: Single, Split, Soft Split, Checker and Grid have
 * fixed arity, so a horizontal stripe subdivision is the least surprising valid
 * default until the author chooses a more specific Portable topology.
 */
function appendZoneToLogicalRouting(
  logical: NonNullable<ShowRecordV2['zoneLayouts'][number]['logical']>,
  zoneId: string,
): NonNullable<ShowRecordV2['zoneLayouts'][number]['logical']> {
  const zoneIds = [...logical.zoneIds, zoneId]
  if (logical.kind === 'stripes' || logical.kind === 'rings' || logical.kind === 'pinwheel' || logical.kind === 'wave') {
    return { ...logical, zoneIds }
  }
  return { kind: 'stripes', axis: 'x', zoneIds }
}

function removeZone(
  record: ShowRecordV2,
  intent: Extract<ShowZoneEditIntentV2, { kind: 'remove' }>,
  refuse: Refuse,
): ShowZoneEditResultV2 {
  const zone = record.zones.find(candidate => candidate.id === intent.zoneId)
  if (!zone) return refuse('missing-target', `Zone "${intent.zoneId}" does not exist.`)
  if (record.zones.length <= 1) return refuse('last-zone', 'A Show keeps at least one Zone.')
  const plans = intent.clipRemovals ?? []
  const removableClipIds = record.composition.clips.filter(clip => clip.zoneId === zone.id).map(clip => clip.id)
  if (plans.some(plan => !removableClipIds.includes(plan.clipId))
    || new Set(plans.map(plan => plan.clipId)).size !== plans.length) {
    return refuse('invalid-request', 'Every Clip removal plan names one distinct Clip in the removed Zone.')
  }

  const affected = emptyAffected()
  const removedIds = new Set<string>()
  let working = record

  for (const occurrence of record.composition.groupOccurrences.filter(candidate => candidate.zoneId === zone.id)) {
    const outcome = deleteShowGroupOccurrenceV2(working, { kind: 'delete-occurrence', occurrenceId: occurrence.id })
    if (outcome.status !== 'changed') {
      return refuse('unsupported-content', outcome.status === 'refused'
        ? `Group occurrence "${occurrence.id}" cannot be removed with Zone "${zone.id}": ${outcome.message}`
        : `Group occurrence "${occurrence.id}" was not removed with Zone "${zone.id}".`)
    }
    working = outcome.record
    affected.affectedGroupOccurrenceIds.push(occurrence.id)
    affected.affectedClipIds.push(...outcome.affectedClipIds)
    affected.affectedTrackIds.push(...outcome.affectedTrackIds)
    affected.affectedTransitionIds.push(...outcome.affectedTransitionIds)
    affected.affectedInstanceIds.push(...outcome.affectedInstanceIds)
    for (const id of outcome.removedIds) removedIds.add(id)
  }

  for (const clipId of removableClipIds) {
    const plan = plans.find(candidate => candidate.clipId === clipId)
    const outcome = editShowTransitionV2(working, {
      kind: 'delete-clip',
      clipId,
      ...(plan ? { propertyRampProjections: plan.propertyRampProjections } : {}),
    })
    if (outcome.status !== 'changed') {
      const carrier = outcome.status === 'refused' && outcome.code === 'unsupported-property-carrier'
      return refuse(carrier ? 'unsupported-property-carrier' : 'unsupported-content', outcome.status === 'refused'
        ? `Clip "${clipId}" cannot be removed with Zone "${zone.id}": ${outcome.message}`
        : `Clip "${clipId}" was not removed with Zone "${zone.id}".`)
    }
    working = outcome.record
    affected.affectedClipIds.push(...outcome.affectedClipIds)
    affected.affectedTransitionIds.push(...outcome.affectedTransitionIds)
    affected.affectedTrackIds.push(...outcome.affectedTrackIds)
    for (const id of outcome.removedIds) removedIds.add(id)
  }

  for (const layer of record.composition.layers.filter(candidate => candidate.zoneId === zone.id)) {
    const outcome = editShowLayerV2(working, { kind: 'remove', zoneId: zone.id, layerId: layer.id })
    if (outcome.status !== 'changed') {
      return refuse('unsupported-content', outcome.status === 'refused'
        ? `Layer "${layer.id}" cannot be removed with Zone "${zone.id}": ${outcome.message}`
        : `Layer "${layer.id}" was not removed with Zone "${zone.id}".`)
    }
    working = outcome.record
    affected.affectedLayerIds.push(layer.id)
    for (const id of outcome.removedIds) removedIds.add(id)
  }

  const candidate = structuredClone(working)
  candidate.zones = candidate.zones.filter(entry => entry.id !== zone.id)
  for (const layout of candidate.zoneLayouts) {
    const named = layout.zones.some(entry => entry.zoneId === zone.id)
    const member = Boolean(layout.logical?.zoneIds.includes(zone.id))
    if (!named && !member) continue
    layout.zones = layout.zones.filter(entry => entry.zoneId !== zone.id)
    // v1's rule: an operator that named the removed Zone cannot describe the
    // remaining ones, so the definition falls back to physical ranges.
    if (member) delete layout.logical
    affected.affectedLayoutDefinitionIds.push(layout.id)
  }
  removedIds.add(zone.id)
  return commit(candidate, {
    affectedZoneIds: [zone.id],
    affectedLayerIds: [...new Set(affected.affectedLayerIds)].sort(),
    affectedClipIds: [...new Set(affected.affectedClipIds)].sort(),
    affectedInstanceIds: [...new Set(affected.affectedInstanceIds)].sort(),
    affectedTransitionIds: [...new Set(affected.affectedTransitionIds)].sort(),
    affectedTrackIds: [...new Set(affected.affectedTrackIds)].sort(),
    affectedLayoutDefinitionIds: [...new Set(affected.affectedLayoutDefinitionIds)].sort(),
    affectedGroupOccurrenceIds: [...new Set(affected.affectedGroupOccurrenceIds)].sort(),
    removedIds: [...removedIds].sort(),
  }, refuse)
}

function commit(
  candidate: ShowRecordV2,
  affected: ShowZoneEditAffectedV2,
  refuse: Refuse,
): ShowZoneEditResultV2 {
  for (const layout of candidate.zoneLayouts) {
    const issue = layout.logical ? validateShowLogicalRouting(layout.logical)[0] : undefined
    if (issue) return refuse('invalid-routing', `Zone Layout "${layout.id}" cannot route this Zone set: ${issue}`)
  }
  const issue = validateShowRecordV2(candidate)[0]
  if (issue) return refuse('invalid-result', `The requested Zone edit would produce an invalid Show at ${issue.path}: ${issue.message}`)
  const availability = validateShowLayoutAvailabilityV2(candidate)[0]
  if (availability) {
    return refuse(
      'zone-unavailable',
      `${availability.entityKind} "${availability.entityId}" uses Zone "${availability.zoneId}" while Layout occurrence "${availability.layoutOccurrenceId}" does not provide it.`,
    )
  }
  return { status: 'changed', record: candidate, ...affected }
}

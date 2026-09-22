import type { ShowLayoutTransferV2, ShowRecordV2 } from './showCompositionV2'
import { showLayoutDuplicateSourceIdsV2, type ShowLayoutEditIntentV2 } from './showLayoutIntervalsV2'
import { ownedShowIdsV2 } from './showIdentityV2'

export type ShowV2LayoutEditorIntent = Extract<ShowLayoutEditIntentV2,
  { kind: 'select-layout' | 'move' | 'remove' | 'make-unique' | 'duplicate' | 'set-parameters' | 'set-transfer' }>

/**
 * One explicit lane request. Identity is never allocated inside a pure owner,
 * so requests that create an entity name no identity and the planner allocates
 * exactly the identities the owner requires.
 */
export type ShowV2LayoutEditorRequest =
  | Extract<ShowV2LayoutEditorIntent, { kind: 'select-layout' | 'move' | 'remove' | 'set-parameters' }>
  | { kind: 'make-unique'; occurrenceId: string; name: string }
  | { kind: 'duplicate'; occurrenceId: string; content: 'copy' | 'empty' }
  | {
    kind: 'set-transfer'
    occurrenceId: string
    transfer: Omit<ShowLayoutTransferV2, 'id' | 'fromOccurrenceId'> | null
  }

export interface ShowV2LayoutEditorOccurrence {
  id: string
  layoutId: string
  name: string
  startMs: number
  endMs: number
  isInitial: boolean
  /** Several occurrences reference one Layout definition; Make Unique clones only this one. */
  shared: boolean
  /** The occurrence a transfer into this one must name as its source. */
  previousOccurrenceId: string | null
  /** Its Layout definition partitions the Stage, so a split position means something. */
  splitCapable: boolean
  splitPosition?: number
  incomingTransfer?: { id: string; fromOccurrenceId: string; durationMs: number; direction: ShowLayoutTransferV2['direction'] }
}

export function buildShowV2LayoutEditorModel(record: ShowRecordV2): {
  layouts: { id: string; name: string }[]
  occurrences: ShowV2LayoutEditorOccurrence[]
} {
  const ordered = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  const splitKinds = new Set(['split', 'soft-split'])
  return {
    layouts: record.zoneLayouts.map(layout => ({ id: layout.id, name: layout.name })),
    occurrences: ordered.map((occurrence, index) => ({
      id: occurrence.id,
      layoutId: occurrence.layoutId,
      name: record.zoneLayouts.find(layout => layout.id === occurrence.layoutId)!.name,
      splitCapable: splitKinds.has(record.zoneLayouts.find(layout => layout.id === occurrence.layoutId)?.logical?.kind ?? ''),
      startMs: occurrence.startMs,
      endMs: occurrence.startMs + occurrence.durationMs,
      isInitial: index === 0,
      shared: record.composition.layoutOccurrences.filter(value => value.layoutId === occurrence.layoutId).length > 1,
      previousOccurrenceId: index === 0 ? null : ordered[index - 1].id,
      ...(occurrence.parameters.splitPosition === undefined ? {} : { splitPosition: occurrence.parameters.splitPosition }),
      ...(occurrence.incomingTransfer
        ? {
          incomingTransfer: {
            id: occurrence.incomingTransfer.id,
            fromOccurrenceId: occurrence.incomingTransfer.fromOccurrenceId,
            durationMs: occurrence.incomingTransfer.durationMs,
            direction: occurrence.incomingTransfer.direction,
          },
        }
        : {}),
    })),
  }
}

type Plan = { status: 'ready'; intent: ShowV2LayoutEditorIntent } | { status: 'refused'; message: string }

/** Only allocates definition, occurrence and transfer identity; the exact existing owner owns timing and validation. */
export function planShowV2LayoutEdit(
  record: ShowRecordV2,
  request: ShowV2LayoutEditorRequest,
  allocate: () => string,
): Plan {
  if (!record.composition.layoutOccurrences.some(occurrence => occurrence.id === request.occurrenceId)) {
    return { status: 'refused', message: 'Select an existing Layout occurrence.' }
  }
  if (request.kind === 'make-unique') {
    const layoutId = allocate()
    return fresh(record, [layoutId], 'Layout')
      ?? { status: 'ready', intent: { ...request, layoutId } }
  }
  if (request.kind === 'duplicate') {
    const newOccurrenceId = allocate()
    const conflict = fresh(record, [newOccurrenceId], 'Layout occurrence')
    if (conflict) return conflict
    if (request.content === 'empty') {
      return { status: 'ready', intent: { kind: 'duplicate', occurrenceId: request.occurrenceId, newOccurrenceId } }
    }
    // Content duplication needs one fresh identity per copied entity, in the
    // owner's own enumeration; a partial map is refused rather than completed here.
    const sourceIds = showLayoutDuplicateSourceIdsV2(record, request.occurrenceId) ?? []
    const idsBySourceId: Record<string, string> = {}
    const allocated = [newOccurrenceId]
    for (const sourceId of sourceIds) {
      const id = allocate()
      idsBySourceId[sourceId] = id
      allocated.push(id)
    }
    return fresh(record, allocated, 'Layout occurrence')
      ?? { status: 'ready', intent: { kind: 'duplicate', occurrenceId: request.occurrenceId, newOccurrenceId, content: { idsBySourceId } } }
  }
  if (request.kind === 'set-transfer') {
    if (request.transfer === null) {
      return { status: 'ready', intent: { kind: 'set-transfer', occurrenceId: request.occurrenceId, transfer: null } }
    }
    const id = allocate()
    return fresh(record, [id], 'Layout transfer')
      ?? {
        status: 'ready',
        intent: {
          kind: 'set-transfer',
          occurrenceId: request.occurrenceId,
          transfer: { ...structuredClone(request.transfer), id },
        },
      }
  }
  return { status: 'ready', intent: structuredClone(request) }
}

/** The Make Unique definition name: the source definition name plus ' copy', unique against every Layout name. */
export function showV2MakeUniqueLayoutName(record: ShowRecordV2, occurrenceId: string): string | null {
  const occurrence = record.composition.layoutOccurrences.find(candidate => candidate.id === occurrenceId)
  if (!occurrence) return null
  const definition = record.zoneLayouts.find(layout => layout.id === occurrence.layoutId)
  if (!definition) return null
  return uniqueName(`${definition.name} copy`, record.zoneLayouts.map(layout => layout.name))
}

function uniqueName(preferred: string, names: string[]): string {
  if (!names.includes(preferred)) return preferred
  let suffix = 2
  while (names.includes(`${preferred} ${suffix}`)) suffix += 1
  return `${preferred} ${suffix}`
}

/** Refuse a blank, duplicate or already-owned identity before an owner sees it. */
function fresh(record: ShowRecordV2, identities: string[], subject: string): { status: 'refused'; message: string } | null {
  const owned = ownedShowIdsV2(record)
  const usable = identities.every(id => typeof id === 'string' && id.trim().length > 0 && !owned.has(id))
  return usable && new Set(identities).size === identities.length
    ? null
    : { status: 'refused', message: `Fresh ${subject} identity conflicts. Try the edit again.` }
}

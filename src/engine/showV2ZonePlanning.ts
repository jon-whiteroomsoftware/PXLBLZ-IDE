import type { ShowRoutingLayout, ShowZone } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import {
  ZONE_COLORS,
  nextEntityId,
  showRoutingLayoutKindLabel,
  uniqueRoutingLayoutName,
  uniqueZoneName,
} from './showModel'
import { compactSpatialIndexes } from './showSpatialSelection'
import type { ShowZoneEditIntentV2 } from './showZonesV2'
import type { ShowZoneLayoutDefinitionIntentV2 } from './showZoneLayoutDefinitionsV2'
import type { ShowV2ShowMetadataPlan } from './showV2ShowLevelPlanning'

export type ShowV2ZonePlan =
  | { kind: 'zone'; intent: ShowZoneEditIntentV2 }
  | { kind: 'layout'; intent: ShowZoneLayoutDefinitionIntentV2 }
  | { kind: 'metadata'; plan: ShowV2ShowMetadataPlan }
  | { kind: 'no-op' }
  | { kind: 'refuse'; code: string; message: string }

export function planShowV2ZoneAdd(record: ShowRecordV2): ShowV2ZonePlan {
  const n = record.zones.length
  const id = nextEntityId('zone-', record.zones)
  const name = uniqueZoneName(`zone-${n + 1}`, record.zones)
  const color = ZONE_COLORS[n % ZONE_COLORS.length]
  return {
    kind: 'zone',
    intent: { kind: 'add', zone: { id, name, nominalPixelCount: 60, color } },
  }
}

export function planShowV2ZoneUpdate(
  record: ShowRecordV2,
  zoneId: string,
  changes: Partial<Omit<ShowZone, 'id'>>,
): ShowV2ZonePlan {
  const zone = record.zones.find((candidate) => candidate.id === zoneId)
  if (!zone) return { kind: 'refuse', code: 'missing-zone', message: `Zone "${zoneId}" does not exist.` }
  if (changes.icon !== undefined) {
    return { kind: 'refuse', code: 'unsupported-field', message: 'Zone icon is not supported on the v2 backing.' }
  }
  const input: Record<string, unknown> = { zone_id: zoneId }
  if (changes.name !== undefined) input.name = changes.name
  if (changes.nominalPixelCount !== undefined) {
    const value = changes.nominalPixelCount
    input.nominal_pixel_count = Number.isFinite(value) ? Math.max(1, Math.round(value as number)) : 1
  }
  if (changes.color !== undefined) input.color = changes.color
  if (Object.keys(input).length <= 1) return { kind: 'no-op' }
  return {
    kind: 'metadata',
    plan: { kind: 'intent', intent: { command: 'update_zone', input } },
  }
}

export function planShowV2ZoneRemove(record: ShowRecordV2, zoneId: string): ShowV2ZonePlan {
  if (record.zones.length <= 1) return { kind: 'no-op' }
  if (!record.zones.some((zone) => zone.id === zoneId)) return { kind: 'no-op' }
  return { kind: 'zone', intent: { kind: 'remove', zoneId } }
}

export function planShowV2LayoutDuplicate(record: ShowRecordV2, sourceLayoutId: string): ShowV2ZonePlan {
  const source = record.zoneLayouts.find((layout) => layout.id === sourceLayoutId)
  if (!source) return { kind: 'refuse', code: 'missing-layout', message: `Zone Layout "${sourceLayoutId}" does not exist.` }
  const layoutId = nextEntityId('layout-', record.zoneLayouts)
  const name = uniqueRoutingLayoutName(
    showRoutingLayoutKindLabel({ logical: source.logical }),
    record.zoneLayouts,
  )
  return { kind: 'layout', intent: { kind: 'duplicate', layoutId, name, sourceLayoutId } }
}

function normalizeRanges(
  ranges: ReadonlyArray<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  return ranges
    .map((range) => ({
      start: Math.max(0, Math.round(Math.min(range.start, range.end))),
      end: Math.max(0, Math.round(Math.max(range.start, range.end))),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

export function planShowV2LayoutUpdate(
  record: ShowRecordV2,
  layoutId: string,
  changes: Partial<Omit<ShowRoutingLayout, 'id'>>,
): ShowV2ZonePlan {
  const layout = record.zoneLayouts.find((candidate) => candidate.id === layoutId)
  if (!layout) return { kind: 'refuse', code: 'missing-layout', message: `Zone Layout "${layoutId}" does not exist.` }
  const keys = Object.keys(changes)
  if (keys.length !== 1 || (keys[0] !== 'name' && keys[0] !== 'logical' && keys[0] !== 'zones')) {
    return { kind: 'refuse', code: 'unsupported-change', message: 'A Zone Layout edit changes exactly one of name, routing or ranges.' }
  }
  if (keys[0] === 'name') {
    if (typeof changes.name !== 'string') {
      return { kind: 'refuse', code: 'unsupported-change', message: 'A Zone Layout edit changes exactly one of name, routing or ranges.' }
    }
    const name = changes.name.trim() || 'Untitled layout'
    return { kind: 'layout', intent: { kind: 'rename', layoutId, name } }
  }
  if (keys[0] === 'logical') {
    const logical = (changes as { logical?: ShowRoutingLayout['logical'] }).logical ?? null
    return { kind: 'layout', intent: { kind: 'set-routing', layoutId, logical } }
  }
  if (!Array.isArray(changes.zones)) {
    return { kind: 'refuse', code: 'unsupported-change', message: 'A Zone Layout edit changes exactly one of name, routing or ranges.' }
  }
  const incoming = changes.zones
  const normalizedByZone = new Map<string, Array<{ start: number; end: number }>>()
  for (const entry of incoming) {
    normalizedByZone.set(entry.zoneId, normalizeRanges(entry.ranges))
  }
  const currentByZone = new Map<string, Array<{ start: number; end: number }>>()
  for (const entry of layout.zones) {
    currentByZone.set(entry.zoneId, entry.ranges)
  }
  const allZoneIds = new Set<string>([...normalizedByZone.keys(), ...currentByZone.keys()])
  const differing: string[] = []
  for (const zoneId of allZoneIds) {
    const next = normalizedByZone.get(zoneId)
    const current = currentByZone.get(zoneId)
    if (JSON.stringify(next ?? null) !== JSON.stringify(current ?? null)) differing.push(zoneId)
  }
  if (differing.length === 0) return { kind: 'no-op' }
  if (differing.length > 1) {
    return { kind: 'refuse', code: 'multiple-zones', message: 'A Zone Layout ranges edit changes one Zone at a time.' }
  }
  const zoneId = differing[0]
  const ranges = normalizedByZone.get(zoneId) ?? []
  return { kind: 'layout', intent: { kind: 'set-physical-ranges', layoutId, zoneId, ranges } }
}

export function planShowV2LayoutRemove(record: ShowRecordV2, layoutId: string): ShowV2ZonePlan {
  if (record.zoneLayouts.length <= 1) return { kind: 'no-op' }
  if (!record.zoneLayouts.some((layout) => layout.id === layoutId)) return { kind: 'no-op' }
  return { kind: 'layout', intent: { kind: 'remove', layoutId } }
}

export function planShowV2PhysicalZoneSelection(
  record: ShowRecordV2,
  layoutId: string,
  zoneId: string,
  indexes: ReadonlyArray<number>,
): ShowV2ZonePlan {
  if (record.outputContract.kind !== 'installation') return { kind: 'no-op' }
  const layout = record.zoneLayouts.find((candidate) => candidate.id === layoutId)
  if (!layout || layout.logical) return { kind: 'no-op' }
  if (!record.zones.some((zone) => zone.id === zoneId)) return { kind: 'no-op' }
  const ranges = compactSpatialIndexes(indexes)
  const current = layout.zones.find((entry) => entry.zoneId === zoneId)
  if (current && JSON.stringify(current.ranges) === JSON.stringify(ranges)) return { kind: 'no-op' }
  return { kind: 'layout', intent: { kind: 'set-physical-ranges', layoutId, zoneId, ranges } }
}

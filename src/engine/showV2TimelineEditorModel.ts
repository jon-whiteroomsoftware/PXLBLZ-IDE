import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { defaultGroupRuntimeIdV2, materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowClipV2, ShowRecordV2 } from './showCompositionV2'
import type { ShowPatternRef } from './personalContentRecords'
import type { ShowPreparedStageDependenciesV2, ShowPreparedStageResultV2 } from './showPreparedStageV2'

export interface ShowV2TimelineCapture { record: ShowRecordV2; dependencies: ShowPreparedStageDependenciesV2; prepared: ShowPreparedStageResultV2 }
export interface ShowV2TimelineSourceChoice {
  key: string; name: string; label: string; reference: ShowPatternRef; group: 'Personal' | 'Built-in'; runtimeIds: string[]; defaultRuntimeId: string | null
}
export interface ShowV2TimelineItem {
  kind: 'clip' | 'group'; id: string; name: string; startMs: number; endMs: number; occurrenceId?: string
}
export interface ShowV2TimelineRow { layerId: string; zoneId: string; zoneName: string; layerName: string; items: ShowV2TimelineItem[] }
export function selectedShowOrdinaryClipV2(record: ShowRecordV2, id: string): ShowClipV2 | null {
  return record.composition.clips.find(clip => clip.id === id) ?? [...record.composition.clips].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))[0] ?? null
}
/** Source names are presentation. Only captured kind/id resolves shared runtime choices. */
export function buildShowV2TimelineEditorModel(capture: ShowV2TimelineCapture): { sources: ShowV2TimelineSourceChoice[]; rows: ShowV2TimelineRow[] } {
  const record = capture.prepared.status === 'ready' ? capture.prepared.bundle.record : capture.prepared.status === 'empty' ? capture.prepared.record : capture.record
  const patterns = capture.prepared.status === 'ready' ? capture.prepared.bundle.assets.patterns : capture.dependencies.patterns
  let effective: ShowRecordV2
  try { effective = materializeShowGroupsV2(record) } catch { return { sources: [], rows: [] } }
  const stocks = new Set([...Object.keys(DEMOS), ...effective.composition.patternInstances.filter(instance => instance.pattern.kind === 'stock' && Object.prototype.hasOwnProperty.call(DEMOS, resolveStockPatternId(instance.pattern.id))).map(instance => instance.pattern.id)])
  const choices = [...patterns.map(pattern => ({ reference: { kind: 'user' as const, id: pattern.id }, name: pattern.name, group: 'Personal' as const })), ...[...stocks].sort().map(id => ({ reference: { kind: 'stock' as const, id }, name: id, group: 'Built-in' as const }))]
  const sources = choices.map(choice => {
    const runtimeIds = effective.composition.patternInstances.filter(instance => instance.pattern.kind === choice.reference.kind && instance.pattern.id === choice.reference.id).map(instance => instance.id).sort()
    return { ...choice, reference: Object.freeze({ ...choice.reference }), key: `${choice.reference.kind}:${choice.reference.id}`, label: choices.filter(other => other.name === choice.name).length > 1 ? `${choice.name} · ${choice.reference.id}` : choice.name, runtimeIds, defaultRuntimeId: runtimeIds.length === 0 ? 'first' : runtimeIds.length === 1 ? runtimeIds[0] : null }
  })
  const instances = new Map(effective.composition.patternInstances.map(instance => [instance.id, instance]))
  const name = (clip: ShowClipV2) => {
    const instance = instances.get(clip.instanceId)
    return sources.find(source => source.reference.kind === instance?.pattern.kind && source.reference.id === instance?.pattern.id)?.name ?? instance?.patternName ?? clip.id
  }
  const rows = record.zones.flatMap(zone => record.composition.layers.filter(layer => layer.zoneId === zone.id).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)).map(layer => {
    const items: ShowV2TimelineItem[] = record.composition.clips.filter(clip => clip.layerId === layer.id && clip.zoneId === zone.id).map(clip => ({ kind: 'clip', id: clip.id, name: name(clip), startMs: clip.startMs, endMs: clip.startMs + clip.durationMs }))
    const projected = new Map(effective.composition.clips.map(clip => [clip.id, clip]))
    for (const occurrence of record.composition.groupOccurrences) {
      const definition = record.composition.groupDefinitions.find(definition => definition.id === occurrence.definitionId)!
      for (const child of definition.clips) {
        const clip = projected.get(`${occurrence.id}:${child.id}`)
        if (clip && clip.layerId === layer.id && clip.zoneId === zone.id) items.push({ kind: 'group', id: clip.id, name: definition.name, startMs: clip.startMs, endMs: clip.startMs + clip.durationMs, occurrenceId: occurrence.id })
      }
    }
    return { layerId: layer.id, zoneId: zone.id, zoneName: zone.name, layerName: layer.name, items: items.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)) }
  }))
  return { sources, rows }
}
export type ShowClipTimingIdentityPlanV2 = { status: 'ready'; clipId: string; appearanceKeyId?: string; instanceId?: string } | { status: 'refused'; message: string }
/** Adapter allocation: exactly one call per required identity, no retry or hidden runtime allocation. */
export function allocateShowClipTimingIdsV2(record: ShowRecordV2, kind: 'create' | 'split', firstRuntime: boolean, allocate: () => string): ShowClipTimingIdentityPlanV2 {
  const used = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      const raw = value as Record<string, unknown>
      if (Object.keys(raw).length === 2 && (raw.kind === 'user' || raw.kind === 'stock') && typeof raw.id === 'string') return
      if (typeof raw.id === 'string') used.add(raw.id)
      Object.values(raw).forEach(visit)
    }
  }
  visit(record)
  try { visit(materializeShowGroupsV2(record)) } catch { return { status: 'refused', message: 'The Group identity projection is unavailable.' } }
  for (const definition of record.composition.groupDefinitions) for (const slot of definition.patternInstances) used.add(defaultGroupRuntimeIdV2(definition.id, slot.id))
  const identities = Array.from({ length: kind === 'split' ? 1 : firstRuntime ? 3 : 2 }, allocate)
  for (const id of identities) {
    if (typeof id !== 'string' || !id.trim() || used.has(id)) return { status: 'refused', message: 'Fresh Clip identities conflict. Try the edit again.' }
    used.add(id)
  }
  return { status: 'ready', clipId: identities[0], ...(kind === 'create' ? { appearanceKeyId: identities[1], ...(firstRuntime ? { instanceId: identities[2] } : {}) } : {}) }
}

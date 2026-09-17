import type { ShowRecordV2 } from './showCompositionV2'
import { effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowClipPatternInstanceOwnership } from './showTimelineClipAuthoring'
import type { ShowTimelineSelection } from './showTimelineViewModel'

/**
 * One Clip use of the selected Clip's effective Pattern instance.
 *
 * Section 4 counts a use over ordinary Clips and every materialized Group Clip
 * use, including those currently invisible, so the inspector lists the same
 * population the sharing owner counts.
 */
export interface ShowClipInspectorUserV2 {
  clipId: string
  patternName: string
  zoneName: string
  layerName: string
  startMs: number
  endMs: number
  /** Present exactly when this use is a materialized Group Clip use. */
  groupOccurrenceId?: string
}

/**
 * What the Clip inspector shows for one timeline selection on a `ShowRecordV2`.
 *
 * The model is derived, never authored: it allocates no identity, holds no
 * record copy a caller could edit into the store, and names only entities the
 * landed v2 owners already address.
 */
export interface ShowClipInspectorModelV2 {
  clipId: string
  patternName: string
  instanceId: string
  /** `restart` resets the whole Pattern instance at this Clip's first contribution. */
  entryPolicy: 'continue' | 'restart'
  zoneId: string
  layerId: string
  zoneName: string
  layerName: string
  startMs: number
  durationMs: number
  endMs: number
  /** Effective instance ownership, in the v1 inspector leaf's own shape. */
  ownership: ShowClipPatternInstanceOwnership
  /** Every effective use of this Clip's Pattern instance, the selected Clip included. */
  users: ShowClipInspectorUserV2[]
  /**
   * `true` for an authored ordinary Clip the landed owners accept. A
   * materialized Group Clip use is inspected through its occurrence instead.
   */
  editable: boolean
  /** Present exactly when this Clip use belongs to a Group occurrence. */
  groupOccurrenceId?: string
}

/** One selectable ordinary Clip, labelled the way the Group editors label Clips. */
export interface ShowClipInspectorChoiceV2 {
  clipId: string
  label: string
}

/**
 * Build the inspector model for one selection, or `null` when the selection
 * names nothing this inspector owns. A Group occurrence selection resolves to
 * its first materialized child so the panel can describe what is selected
 * without offering an ordinary Clip edit for it.
 */
export function buildShowClipInspectorModelV2(
  record: ShowRecordV2,
  selection: ShowTimelineSelection | null,
): ShowClipInspectorModelV2 | null {
  if (!selection || (selection.kind !== 'clip' && selection.kind !== 'group')) return null
  let effective: ShowRecordV2
  try {
    effective = materializeShowGroupsV2(record)
  } catch {
    return null
  }
  const occurrenceIdByClipId = groupOccurrenceIdsByClipId(record)
  const clip = selection.kind === 'clip'
    ? effective.composition.clips.find((candidate) => candidate.id === selection.clipId)
    : effective.composition.clips
      .filter((candidate) => occurrenceIdByClipId.get(candidate.id) === selection.occurrenceId)
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))[0]
  if (!clip) return null
  const instance = effective.composition.patternInstances.find((candidate) => candidate.id === clip.instanceId)
  if (!instance) return null

  const groupOccurrenceId = occurrenceIdByClipId.get(clip.id)
  const editable = groupOccurrenceId === undefined
    && record.composition.clips.some((candidate) => candidate.id === clip.id)
  const names = zoneAndLayerNames(record)
  return {
    clipId: clip.id,
    patternName: instance.patternName,
    instanceId: instance.id,
    entryPolicy: clip.entryPolicy,
    zoneId: clip.zoneId,
    layerId: clip.layerId,
    zoneName: names.zones.get(clip.zoneId) ?? clip.zoneId,
    layerName: names.layers.get(clip.layerId) ?? clip.layerId,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    endMs: clip.startMs + clip.durationMs,
    ownership: {
      instanceId: instance.id,
      useCount: effectiveShowInstanceUseCountV2(record, instance.id),
      // Rejoin needs an explicit existing target instance, so the source
      // instance is never offered as its own destination.
      compatibleTargets: record.composition.patternInstances.flatMap((candidate) => (
        candidate.id === instance.id
          || candidate.pattern.kind !== instance.pattern.kind
          || candidate.pattern.id !== instance.pattern.id
          ? []
          : [{
              instanceId: candidate.id,
              patternName: candidate.patternName,
              useCount: effectiveShowInstanceUseCountV2(record, candidate.id),
            }]
      )),
    },
    users: effective.composition.clips
      .filter((candidate) => candidate.instanceId === instance.id)
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
      .map((candidate): ShowClipInspectorUserV2 => {
        const occurrenceId = occurrenceIdByClipId.get(candidate.id)
        return {
          clipId: candidate.id,
          patternName: instance.patternName,
          zoneName: names.zones.get(candidate.zoneId) ?? candidate.zoneId,
          layerName: names.layers.get(candidate.layerId) ?? candidate.layerId,
          startMs: candidate.startMs,
          endMs: candidate.startMs + candidate.durationMs,
          ...(occurrenceId === undefined ? {} : { groupOccurrenceId: occurrenceId }),
        }
      }),
    editable,
    ...(groupOccurrenceId === undefined ? {} : { groupOccurrenceId }),
  }
}

/** The ordinary Clips the inspector can select, in timeline order. */
export function showClipInspectorChoicesV2(record: ShowRecordV2): ShowClipInspectorChoiceV2[] {
  const names = zoneAndLayerNames(record)
  const instances = new Map(record.composition.patternInstances.map((instance) => [instance.id, instance]))
  return [...record.composition.clips]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    .map((clip) => ({
      clipId: clip.id,
      label: `${instances.get(clip.instanceId)?.patternName ?? clip.instanceId} · ${
        names.zones.get(clip.zoneId) ?? clip.zoneId} / ${names.layers.get(clip.layerId) ?? clip.layerId} · ${
        clip.startMs}–${clip.startMs + clip.durationMs} ms`,
    }))
}

function groupOccurrenceIdsByClipId(record: ShowRecordV2): Map<string, string> {
  const owners = new Map<string, string>()
  for (const occurrence of record.composition.groupOccurrences) {
    const definition = record.composition.groupDefinitions
      .find((candidate) => candidate.id === occurrence.definitionId)
    for (const child of definition?.clips ?? []) owners.set(`${occurrence.id}:${child.id}`, occurrence.id)
  }
  return owners
}

function zoneAndLayerNames(record: ShowRecordV2): { zones: Map<string, string>; layers: Map<string, string> } {
  return {
    zones: new Map(record.zones.map((zone) => [zone.id, zone.name])),
    layers: new Map(record.composition.layers.map((layer) => [layer.id, layer.name])),
  }
}

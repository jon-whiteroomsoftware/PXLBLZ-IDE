import type { ShowClipV2, ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import { groupOccurrenceDuration, materializeShowGroupsV2 } from './showGroupsV2'
import { resolveShowZonePixelCount } from './showInstallationCoverage'
import type {
  ShowTimelineGroupView,
  ShowTimelineItemView,
  ShowTimelineJunctionView,
  ShowTimelineLayerView,
  ShowTimelineLayoutIntervalView,
  ShowTimelineMarkerView,
  ShowTimelineTransitionView,
  ShowTimelineViewModel,
  ShowTimelineZoneRowView,
} from './showTimelineViewModel'
import { projectShowTransitionJunctionsV2 } from './showTransitionsV2'

/**
 * Build the version-agnostic timeline view from a `ShowRecordV2`.
 *
 * The record is read immutably and no identity is allocated: Group Clip uses
 * come from `materializeShowGroupsV2`, Cut junctions from the derived
 * projection, and Layout occurrences from their own explicit records.
 */
export function projectShowTimelineV2(record: ShowRecordV2): ShowTimelineViewModel {
  const effective = materializeShowGroupsV2(record)
  const instanceById = new Map(effective.composition.patternInstances.map((instance) => [instance.id, instance]))
  const occurrenceIdByClipId = new Map<string, string>()
  for (const occurrence of record.composition.groupOccurrences) {
    const definition = record.composition.groupDefinitions
      .find((candidate) => candidate.id === occurrence.definitionId)
    for (const child of definition?.clips ?? []) {
      occurrenceIdByClipId.set(`${occurrence.id}:${child.id}`, occurrence.id)
    }
  }

  const derivedCuts = projectShowTransitionJunctionsV2(effective)
  const transitionByEndpoints = new Map<string, ShowTransitionV2>()
  for (const transition of effective.composition.transitions) {
    for (const participant of transition.participants) {
      transitionByEndpoints.set(`${participant.fromClipId}->${participant.toClipId}`, transition)
    }
    const whole = transition.wholeOutput
    if (!whole) continue
    for (const fromClipId of whole.fromClipIds) {
      for (const toClipId of whole.toClipIds) {
        transitionByEndpoints.set(`${fromClipId}->${toClipId}`, transition)
      }
    }
  }

  const layerIndexById = new Map<string, number>()
  const rows = record.zones.map((zone): ShowTimelineZoneRowView => {
    const zoneLayers = effective.composition.layers
      .filter((layer) => layer.zoneId === zone.id)
      // Rank zero is the bottom Layer; the row draws top to bottom.
      .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
    zoneLayers.forEach((layer, layerIndex) => layerIndexById.set(layer.id, layerIndex))
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      ...(zone.color === undefined ? {} : { color: zone.color }),
      nominalPixelCount: zone.nominalPixelCount,
      pixelCount: resolveShowZonePixelCount({
        outputContract: record.outputContract,
        zones: record.zones,
        routingLayouts: record.zoneLayouts,
      }, zone.id)?.pixelCount ?? zone.nominalPixelCount,
      composed: true,
      layers: zoneLayers.map((layer, layerIndex): ShowTimelineLayerView => {
        const items = effective.composition.clips
          .filter((clip) => clip.zoneId === zone.id && clip.layerId === layer.id)
          .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
          .map((clip) => itemView(clip, occurrenceIdByClipId.get(clip.id), instanceById.has(clip.instanceId),
            instanceById.get(clip.instanceId)?.patternName))
        return {
          id: layer.id,
          zoneId: zone.id,
          name: layer.name,
          rank: layer.rank,
          layerIndex,
          items,
          junctions: items.slice(0, -1).flatMap((left, index): ShowTimelineJunctionView[] => {
            const right = items[index + 1]
            const transition = transitionByEndpoints.get(`${left.id}->${right.id}`)
            if (transition) {
              const startMs = transition.wholeOutput?.startMs ?? left.endMs
              return [{
                id: transition.id,
                kind: transition.kind,
                scope: transition.wholeOutput ? 'whole-output' : 'layer',
                transitionId: transition.id,
                leftItemId: left.id,
                rightItemId: right.id,
                startMs,
                endMs: startMs + transition.durationMs,
                durationMs: transition.durationMs,
                selection: { kind: 'transition', transitionId: transition.id },
              }]
            }
            const cut = derivedCuts.find((candidate) => (
              candidate.fromClipId === left.id && candidate.toClipId === right.id
            ))
            if (!cut) return []
            return [{
              id: `cut:${left.id}:${right.id}`,
              kind: 'cut',
              scope: 'derived-cut',
              transitionId: null,
              leftItemId: left.id,
              rightItemId: right.id,
              startMs: cut.atMs,
              endMs: cut.atMs,
              durationMs: 0,
              selection: {
                kind: 'cut',
                zoneId: cut.zoneId,
                layerId: cut.layerId,
                fromClipId: cut.fromClipId,
                toClipId: cut.toClipId,
                atMs: cut.atMs,
              },
            }]
          }),
        }
      }),
      groups: record.composition.groupOccurrences
        .filter((occurrence) => occurrence.zoneId === zone.id)
        .flatMap((occurrence): ShowTimelineGroupView[] => {
          const definition = record.composition.groupDefinitions
            .find((candidate) => candidate.id === occurrence.definitionId)
          if (!definition) return []
          const boundLayerIndexes = occurrence.layerBindings
            .flatMap((binding) => {
              const layerIndex = layerIndexById.get(binding.layerId)
              return layerIndex === undefined ? [] : [layerIndex]
            })
          const durationMs = groupOccurrenceDuration(definition, occurrence)
          return [{
            id: occurrence.id,
            definitionId: definition.id,
            name: definition.name,
            zoneId: occurrence.zoneId,
            startMs: occurrence.startMs,
            endMs: occurrence.startMs + durationMs,
            durationMs,
            topLayerIndex: boundLayerIndexes.length > 0 ? Math.min(...boundLayerIndexes) : 0,
            bottomLayerIndex: boundLayerIndexes.length > 0 ? Math.max(...boundLayerIndexes) : 0,
            linkedOccurrenceCount: record.composition.groupOccurrences
              .filter((candidate) => candidate.definitionId === definition.id).length,
            selection: { kind: 'group', occurrenceId: occurrence.id },
          }]
        })
        .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id)),
    }
  })

  const clipById = new Map(effective.composition.clips.map((clip) => [clip.id, clip]))
  const transitions = effective.composition.transitions
    .map((transition): ShowTimelineTransitionView => {
      const whole = transition.wholeOutput
      const startMs = whole?.startMs
        ?? Math.min(...transition.participants.map((participant) => {
          const from = clipById.get(participant.fromClipId)
          return from ? from.startMs + from.durationMs : 0
        }))
      return {
        id: transition.id,
        kind: transition.kind,
        startMs,
        durationMs: transition.durationMs,
        endMs: startMs + transition.durationMs,
        scope: whole
          ? { kind: 'whole-output', fromItemIds: [...whole.fromClipIds], toItemIds: [...whole.toClipIds] }
          : {
              kind: 'participants',
              participants: transition.participants.map((participant) => ({
                zoneId: participant.zoneId,
                layerId: participant.layerId,
                fromItemId: participant.fromClipId,
                toItemId: participant.toClipId,
              })),
            },
      }
    })
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))

  const layoutNameById = new Map(record.zoneLayouts.map((layout) => [layout.id, layout]))
  const layoutIntervals = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    .map((occurrence): ShowTimelineLayoutIntervalView => {
      const layout = layoutNameById.get(occurrence.layoutId)
      return {
        id: occurrence.id,
        definitionId: occurrence.layoutId,
        definitionName: layout?.name ?? occurrence.layoutId,
        zoneIds: layout?.logical?.zoneIds ?? layout?.zones.map((zone) => zone.zoneId) ?? [],
        startMs: occurrence.startMs,
        endMs: occurrence.startMs + occurrence.durationMs,
        durationMs: occurrence.durationMs,
        parameters: occurrence.parameters.splitPosition === undefined
          ? {}
          : { splitPosition: occurrence.parameters.splitPosition },
        ...(occurrence.incomingTransfer
          ? {
              incomingTransfer: {
                id: occurrence.incomingTransfer.id,
                fromOccurrenceId: occurrence.incomingTransfer.fromOccurrenceId,
                durationMs: occurrence.incomingTransfer.durationMs,
              },
            }
          : {}),
        selection: { kind: 'layout-occurrence', occurrenceId: occurrence.id },
      }
    })

  return {
    recordVersion: 2,
    showId: record.id,
    showEndMs: record.composition.showEndMs,
    rows,
    transitions,
    layoutIntervals,
    markers: record.composition.markers.map((marker): ShowTimelineMarkerView => ({
      id: marker.id,
      timeMs: marker.timeMs,
      ...(marker.name === undefined ? {} : { name: marker.name }),
      ...(marker.color === undefined ? {} : { color: marker.color }),
      ...(marker.role === undefined ? {} : { role: marker.role }),
      selection: { kind: 'marker', markerId: marker.id },
    })),
    structuralTimesMs: [...new Set([
      0,
      record.composition.showEndMs,
      ...transitions.flatMap((transition) => [transition.startMs, transition.endMs]),
      ...rows.flatMap((row) => row.layers.flatMap((layer) => (
        layer.items.flatMap((item) => [item.startMs, item.endMs])
      ))),
    ])],
  }
}

function itemView(
  clip: ShowClipV2,
  occurrenceId: string | undefined,
  compiled: boolean,
  patternName: string | undefined,
): ShowTimelineItemView {
  const held = [...clip.appearance.keys]
    .sort((left, right) => left.timeMs - right.timeMs)[0]?.value
  return {
    id: clip.id,
    selection: occurrenceId
      ? { kind: 'group', occurrenceId }
      : { kind: 'clip', clipId: clip.id },
    instanceId: clip.instanceId,
    patternName: patternName ?? 'Missing Pattern',
    compiled,
    zoneId: clip.zoneId,
    layerId: clip.layerId,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    endMs: clip.startMs + clip.durationMs,
    entryPolicy: clip.entryPolicy,
    heldAppearance: {
      opacity: held?.opacity ?? 1,
      effectKinds: (held?.effects ?? []).map((effect) => effect.kind),
    },
    ...(occurrenceId ? { groupOccurrenceId: occurrenceId } : {}),
    diagnostics: compiled ? [] : [`Pattern instance "${clip.instanceId}" is missing.`],
  }
}

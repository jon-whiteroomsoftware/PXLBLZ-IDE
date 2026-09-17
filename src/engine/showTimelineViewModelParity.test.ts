import { describe, expect, it } from 'vitest'
import { showV2ViewModelCorpus } from '../test/showV2ViewModelCorpus'
import { convertShowRecordV1ToV2, type ShowV1ToV2Report } from './showRecordV1ToV2'
import {
  projectShowTimelineViewModel,
  type ShowTimelineItemView,
  type ShowTimelineLayerView,
  type ShowTimelineViewModel,
} from './showTimelineViewModel'
import { projectShowTimelineV2 } from './showTimelineViewModelV2'

/**
 * View-model equivalence over the pinned 47-record corpus.
 *
 * The oracle is the version-agnostic view both surfaces render, correlated by
 * the conversion report's own identity mappings rather than by coincidental
 * equal text. Every difference must carry one of the named causes below; a new
 * difference has no cause and fails.
 */
type DifferenceCause =
  | 'retired-silent-runtime-use'
  | 'scene-label-chapter-marker'
  | 'layout-scalar-carrier-occurrence'
  | 'whole-output-narrowed-to-participant-pair'

interface RecordDifference {
  corpusId: string
  cause: DifferenceCause
  detail: string
}

/**
 * The census this candidate measured. It is a tripwire, not an allowlist:
 * acceptance comes from the conversion report evidence asserted per record, and
 * this table only refuses a silent change in what the corpus exercises.
 */
const EXPECTED_DIFFERENCE_CENSUS: Record<DifferenceCause, number> = {
  'retired-silent-runtime-use': 5,
  'scene-label-chapter-marker': 228,
  'layout-scalar-carrier-occurrence': 2,
  'whole-output-narrowed-to-participant-pair': 80,
}

describe('Show timeline view-model parity across the 47-record corpus', () => {
  const corpus = showV2ViewModelCorpus()
  const differences: RecordDifference[] = []

  it('converts and projects every pinned record', () => {
    expect(corpus).toHaveLength(47)
  })

  for (const entry of corpus) {
    it(`projects an equivalent timeline view for ${entry.corpus}:${entry.corpusId}`, () => {
      const conversion = convertShowRecordV1ToV2(entry.show, entry.lookup)
      expect(conversion.status).toBe('converted')
      if (conversion.status !== 'converted') return
      const { record, report } = conversion
      const v1 = projectShowTimelineViewModel(entry.show, entry.editorComposition)
      const v2 = projectShowTimelineV2(record)

      expect(v2.recordVersion).toBe(2)
      expect(v1.recordVersion).toBe(1)
      expect(v2.showEndMs).toBe(v1.showEndMs)
      expect(v2.showId).toBe(v1.showId)

      assertRows(entry.corpusId, v1, v2, report, differences)
      assertTransitions(entry.corpusId, v1, v2, report, differences)
      assertLayoutIntervals(entry.corpusId, v1, v2, differences)
      assertMarkers(entry.corpusId, v1, v2, report, differences)
    })
  }

  it('accounts for every measured difference with a named cause', () => {
    const census = differences.reduce<Record<string, number>>((totals, difference) => ({
      ...totals,
      [difference.cause]: (totals[difference.cause] ?? 0) + 1,
    }), {})
    expect(census).toEqual(EXPECTED_DIFFERENCE_CENSUS)
  })
})

function assertRows(
  corpusId: string,
  v1: ShowTimelineViewModel,
  v2: ShowTimelineViewModel,
  report: ShowV1ToV2Report,
  differences: RecordDifference[],
): void {
  expect(v2.rows.map((row) => row.zoneId)).toEqual(v1.rows.map((row) => row.zoneId))
  const retiredPlacementIds = new Set(report.retiredSilentRuntimeUses.map((use) => use.sourcePlacementId))
  const v2ClipIdByPlacementId = new Map(report.clipMappings.flatMap((mapping) => (
    mapping.sourcePlacementIds.map((placementId) => [placementId, mapping.clipId] as const)
  )))

  for (const [index, row] of v1.rows.entries()) {
    const other = v2.rows[index]
    expect(other.zoneName).toBe(row.zoneName)
    expect(other.color).toBe(row.color)
    expect(other.nominalPixelCount).toBe(row.nominalPixelCount)
    expect(other.pixelCount).toBe(row.pixelCount)
    expect(other.composed).toBe(row.composed)
    // Layers correspond by Zone and rank; textual identity differs by design.
    expect(other.layers.map((layer) => layer.rank)).toEqual(row.layers.map((layer) => layer.rank))
    expect(other.layers.map((layer) => layer.name)).toEqual(row.layers.map((layer) => layer.name))
    expect(other.layers.map((layer) => layer.layerIndex)).toEqual(row.layers.map((layer) => layer.layerIndex))
    expect(other.groups.map((group) => group.id)).toEqual(row.groups.map((group) => group.id))
    expect(other.groups.map((group) => [group.startMs, group.durationMs]))
      .toEqual(row.groups.map((group) => [group.startMs, group.durationMs]))

    for (const [layerIndex, layer] of row.layers.entries()) {
      const otherLayer = other.layers[layerIndex]
      const retainedItemIds = assertLayerItems(
        corpusId, layer, otherLayer, retiredPlacementIds, v2ClipIdByPlacementId, differences,
      )
      // Junctions survive as drawn boundaries with the same kind and window.
      // Their scope follows the Transition owner, asserted once per Transition.
      // A junction whose endpoint was retired has no boundary left to draw.
      expect(otherLayer.junctions.map((junction) => [junction.kind, junction.startMs, junction.durationMs]))
        .toEqual(layer.junctions
          .filter((junction) => (
            retainedItemIds.has(junction.leftItemId) && retainedItemIds.has(junction.rightItemId)
          ))
          .map((junction) => [junction.kind, junction.startMs, junction.durationMs]))
    }
  }
}

function assertLayerItems(
  corpusId: string,
  layer: ShowTimelineLayerView,
  otherLayer: ShowTimelineLayerView,
  retiredPlacementIds: Set<string>,
  v2ClipIdByPlacementId: Map<string, string>,
  differences: RecordDifference[],
): Set<string> {
  const retained: ShowTimelineItemView[] = []
  for (const item of layer.items) {
    const sourcePlacementIds = legacySourcePlacementIds(item)
    if (sourcePlacementIds.length > 0 && sourcePlacementIds.every((id) => retiredPlacementIds.has(id))) {
      // Section 2: a placement wholly inside an interval where its Zone is
      // absent is retired, and no v2 Clip carries it.
      differences.push({
        corpusId,
        cause: 'retired-silent-runtime-use',
        detail: `${item.id} on ${layer.zoneId}/${layer.rank}`,
      })
      continue
    }
    retained.push(item)
  }

  expect(otherLayer.items).toHaveLength(retained.length)
  for (const [index, item] of retained.entries()) {
    const otherItem = otherLayer.items[index]
    const mapped = legacySourcePlacementIds(item)
      .map((placementId) => v2ClipIdByPlacementId.get(placementId))
      .filter((id): id is string => id !== undefined)
    if (mapped.length > 0) expect(mapped).toContain(otherItem.id)
    expect(otherItem.startMs).toBe(item.startMs)
    expect(otherItem.durationMs).toBe(item.durationMs)
    expect(otherItem.endMs).toBe(item.endMs)
    expect(otherItem.patternName).toBe(item.patternName)
    expect(otherItem.compiled).toBe(item.compiled)
    expect(otherItem.zoneId).toBe(item.zoneId)
    expect(otherItem.entryPolicy).toBe(item.entryPolicy)
    expect(otherItem.heldAppearance).toEqual(item.heldAppearance)
    expect(otherItem.groupOccurrenceId).toBe(item.groupOccurrenceId)
    expect(otherItem.legacy).toBeUndefined()
  }
  return new Set(retained.map((item) => item.id))
}

function legacySourcePlacementIds(item: ShowTimelineItemView): string[] {
  return item.legacy?.segmentIds ?? (item.legacy ? [item.legacy.startPlacementId] : [])
}

function assertTransitions(
  corpusId: string,
  v1: ShowTimelineViewModel,
  v2: ShowTimelineViewModel,
  report: ShowV1ToV2Report,
  differences: RecordDifference[],
): void {
  const v2ClipIdByPlacementId = new Map(report.clipMappings.flatMap((mapping) => (
    mapping.sourcePlacementIds.map((placementId) => [placementId, mapping.clipId] as const)
  )))
  const mapItem = (id: string) => v2ClipIdByPlacementId.get(id) ?? id
  expect(v2.transitions.map((transition) => [transition.kind, transition.startMs, transition.durationMs]))
    .toEqual(v1.transitions.map((transition) => [transition.kind, transition.startMs, transition.durationMs]))
  for (const [index, transition] of v1.transitions.entries()) {
    const other = v2.transitions[index]
    expect(other.endMs).toBe(transition.endMs)
    if (transition.scope.kind === 'participants') {
      // A v1 Layer Transition already pairs one outgoing and one incoming Clip.
      expect(other.scope.kind).toBe('participants')
      if (other.scope.kind !== 'participants') continue
      expect(other.scope.participants.map((participant) => participant.zoneId).sort())
        .toEqual(transition.scope.participants.map((participant) => participant.zoneId).sort())
      expect(other.scope.participants.map((participant) => mapItem(participant.fromItemId)).sort())
        .toEqual(transition.scope.participants.map((participant) => mapItem(participant.fromItemId)).sort())
      continue
    }
    if (other.scope.kind === 'whole-output') {
      expect(other.scope.fromItemIds.sort())
        .toEqual([...new Set(transition.scope.fromItemIds.map(mapItem))].sort())
      expect(other.scope.toItemIds.sort())
        .toEqual([...new Set(transition.scope.toItemIds.map(mapItem))].sort())
      continue
    }
    // Section 5: conversion narrows a Show-wide boundary to an explicit Layer
    // participant pair exactly when it joins one Clip pair with no global
    // carrier. Unequal contributor sets keep whole-output scope.
    expect(transition.scope.fromItemIds).toHaveLength(1)
    expect(transition.scope.toItemIds).toHaveLength(1)
    expect(other.scope.participants).toHaveLength(1)
    expect(other.scope.participants[0].fromItemId).toBe(mapItem(transition.scope.fromItemIds[0]))
    expect(other.scope.participants[0].toItemId).toBe(mapItem(transition.scope.toItemIds[0]))
    differences.push({
      corpusId,
      cause: 'whole-output-narrowed-to-participant-pair',
      detail: transition.id,
    })
  }
}

function assertLayoutIntervals(
  corpusId: string,
  v1: ShowTimelineViewModel,
  v2: ShowTimelineViewModel,
  differences: RecordDifference[],
): void {
  // Coverage is exactly [0, showEndMs) in both views.
  expect(v2.layoutIntervals[0]?.startMs ?? 0).toBe(v1.layoutIntervals[0]?.startMs ?? 0)
  expect(v2.layoutIntervals[v2.layoutIntervals.length - 1]?.endMs ?? v2.showEndMs).toBe(v2.showEndMs)
  expect(v1.layoutIntervals[v1.layoutIntervals.length - 1]?.endMs ?? v1.showEndMs).toBe(v1.showEndMs)

  for (const interval of v1.layoutIntervals) {
    const covering = v2.layoutIntervals.filter((candidate) => (
      candidate.startMs >= interval.startMs && candidate.endMs <= interval.endMs
    ))
    expect(covering.length).toBeGreaterThan(0)
    expect(covering.every((candidate) => candidate.definitionId === interval.definitionId)).toBe(true)
    expect(covering.every((candidate) => candidate.definitionName === interval.definitionName)).toBe(true)
    expect(covering[0].startMs).toBe(interval.startMs)
    expect(covering[covering.length - 1].endMs).toBe(interval.endMs)
    for (const [index, candidate] of covering.slice(1).entries()) {
      expect(candidate.startMs).toBe(covering[index].endMs)
    }
    if (covering.length === 1) continue
    // Section 8: a v1 occurrence carrying per-Scene routing parameters becomes
    // several v2 occurrences of the same definition, each owning its own
    // explicit parameters over the same total interval.
    expect(new Set(covering.map((candidate) => candidate.parameters.splitPosition)).size).toBeGreaterThan(1)
    differences.push({
      corpusId,
      cause: 'layout-scalar-carrier-occurrence',
      detail: `${interval.id} -> ${covering.map((candidate) => candidate.id).join(',')}`,
    })
  }
}

function assertMarkers(
  corpusId: string,
  v1: ShowTimelineViewModel,
  v2: ShowTimelineViewModel,
  report: ShowV1ToV2Report,
  differences: RecordDifference[],
): void {
  const chapterMarkerIds = new Set(report.markerMappings.map((mapping) => mapping.markerId))
  const v1ById = new Map(v1.markers.map((marker) => [marker.id, marker]))
  for (const marker of v2.markers) {
    const source = v1ById.get(marker.id)
    if (source) {
      // An absorbed Scene label keeps the authored Marker identity and colour.
      expect(marker.timeMs).toBe(source.timeMs)
      expect(marker.color).toBe(source.color)
      if (!chapterMarkerIds.has(marker.id)) expect(marker.role).toBeUndefined()
      else {
        expect(marker.role).toBe('chapter')
        differences.push({ corpusId, cause: 'scene-label-chapter-marker', detail: `${marker.id} absorbed` })
      }
      continue
    }
    expect(chapterMarkerIds.has(marker.id)).toBe(true)
    expect(marker.role).toBe('chapter')
    const mapping = report.markerMappings.find((candidate) => candidate.markerId === marker.id)
    expect(marker.timeMs).toBe(mapping?.timeMs)
    differences.push({ corpusId, cause: 'scene-label-chapter-marker', detail: `${marker.id} added` })
  }
  for (const marker of v1.markers) {
    expect(v2.markers.some((candidate) => candidate.id === marker.id)).toBe(true)
  }
}

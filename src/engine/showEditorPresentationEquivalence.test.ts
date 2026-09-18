import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from './personalContentRecords'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import type { ShowRecordV2 } from './showCompositionV2'
import { projectShowTimeline, showLoopDurationMs, showVisualTransitionAfter } from './showModel'
import {
  projectShowTimelineViewModel,
  type ShowTimelineViewModel,
} from './showTimelineViewModel'
import {
  projectShowEditorTimeColumnsV2,
  projectShowEditorTimelineV2,
} from './showEditorTimelinePresentation'
import {
  projectShowClipInspector,
  type ShowClipInspectorOwner,
  type ShowClipInspectorValue,
} from './showClipInspectorModel'
import { projectShowGroupClipInspector } from './showGroupClipInspectorModel'
import {
  buildShowPropertyAnimationOptions,
  projectShowPropertyAnimationEditorContext,
  projectShowPropertyAnimationOverview,
} from './showPropertyAnimationEditorModel'
import { projectShowClipDetailTabs } from './showClipDetailTabs'
import { projectShowEditorInspectorPresentationV2 } from './showEditorInspectorPresentation'
import { projectShowEditorStagePresentationV2 } from './showEditorStagePresentation'
import {
  captureShowStageEditV2,
  type ShowPreparedStageDependenciesV2,
} from './showPreparedStageV2'
import { createShowStageDiagnostics } from './showStageDiagnostics'
import { validateInstallationCoverage } from './showInstallationCoverage'
import { SOURCE_STOCK_MAPS } from '../pixelblaze/stock/maps/stockCatalogue'

/**
 * Paired read equivalence for the #1065 tracer.
 *
 * Each committed oracle case is read twice: the original v1 record through the
 * v1 presentation owners the editor ships today, and the same record converted
 * by `convertShowRecordV1ToV2` through the new v2 editor presentation readers.
 * Only consumer-facing values are compared. Record-shaped identity the
 * conversion deliberately renames - Layer ids, Scene ids, junction ids - is
 * resolved to its visible position first rather than asserted equal.
 */

interface CorpusCase {
  key: string
  fixedTimeMs: number
  source: ShowRecord
  converted: ShowRecordV2
}

const manifest = JSON.parse(readFileSync(
  new URL('../../e2e/fixtures/showEditorEquivalence.json', import.meta.url),
  'utf8',
)) as { version: 1; corpus: CorpusCase[] }

function convert(source: ShowRecord): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(source, {
    byCellId: Object.fromEntries(source.cells.map(cell => {
      if (cell.pattern.kind !== 'stock') throw new Error(`${source.id}: non-stock flat dependency`)
      const patternSource = DEMOS[resolveStockPatternId(cell.pattern.id)]
      if (!patternSource) throw new Error(`${source.id}: missing stock source ${cell.pattern.id}`)
      return [cell.id, patternSource]
    })),
  })
  if (result.status !== 'converted') throw new Error(`${source.id} refused: ${JSON.stringify(result.issues)}`)
  return result.record
}

/** Resolve a record-shaped Layer id to the visible lane position it draws in. */
function layerPositions(view: ShowTimelineViewModel): Map<string, string> {
  return new Map(view.rows.flatMap(row => row.layers.map(layer => (
    [layer.id, `${row.zoneId}#${layer.layerIndex}`] as const
  ))))
}

function visibleSelection(
  selection: { kind: string; layerId?: string },
  positions: Map<string, string>,
): unknown {
  return selection.layerId === undefined
    ? selection
    : { ...selection, layerId: positions.get(selection.layerId) ?? selection.layerId }
}

const composed = manifest.corpus.filter(entry => entry.source.composition)
const flat = manifest.corpus.filter(entry => !entry.source.composition)

describe.each(manifest.corpus)('$key timeline', testCase => {
  const source = testCase.source
  const record = convert(source)

  it('reconverts the committed fixture source to the committed v2 record', () => {
    expect(record).toEqual(testCase.converted)
  })

  it('presents the same Show identity, loop length and Zone rows', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    expect(v2.showId).toBe(v1.showId)
    expect(v2.showEndMs).toBe(v1.showEndMs)
    const rows = (view: ShowTimelineViewModel) => view.rows.map(row => ({
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      color: row.color,
      nominalPixelCount: row.nominalPixelCount,
      pixelCount: row.pixelCount,
    }))
    expect(rows(v2)).toEqual(rows(v1))
  })

  /**
   * The editor lays its time grid out in the Show's top-level section columns
   * and the boundary column between two of them. v1 reads those spans off its
   * Scenes; a v2 row must resolve the same spans, because the grid's `fr`
   * tracks resolve to a different sub-pixel origin when the column set differs
   * and the whole timeline then rasters differently (#1065).
   */
  it('lays the time grid out in the same section and boundary columns v1 draws', () => {
    const expected = source.scenes.flatMap((scene, index) => {
      const startMs = source.scenes.slice(0, index)
        .reduce((cursor, earlier) => (
          cursor + earlier.durationMs + (showVisualTransitionAfter(source, earlier.id)?.durationMs ?? 0)
        ), 0)
      const section = { kind: 'section' as const, startMs, durationMs: scene.durationMs }
      if (index === source.scenes.length - 1) return [section]
      return [section, {
        kind: 'boundary' as const,
        startMs: startMs + scene.durationMs,
        durationMs: showVisualTransitionAfter(source, scene.id)?.durationMs ?? 0,
      }]
    })

    expect(projectShowEditorTimeColumnsV2(record)).toEqual(expected)
    // Not a vacuous one-column pass for the multi-Scene cases: the fresh and
    // Installation Shows each carry more than one section column.
    expect(expected.length).toBe(source.scenes.length * 2 - 1)
  })

  it('presents the same Layout lane windows, Zones and labels', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const intervals = (view: ShowTimelineViewModel) => view.layoutIntervals.map(interval => ({
      definitionId: interval.definitionId,
      definitionName: interval.definitionName,
      zoneIds: interval.zoneIds,
      startMs: interval.startMs,
      endMs: interval.endMs,
      durationMs: interval.durationMs,
    }))
    expect(intervals(v2)).toEqual(intervals(v1))
  })

  /**
   * The approved contract (show-v2-markers, "Conversion provenance and editor
   * visibility") splits these two oracles apart: the chapter set lives on the
   * record, and the editor timeline excludes exactly the Markers whose origin
   * is `converted-scene-label`. The visible set must therefore still be the one
   * the v1 editor drew, which for every committed case is the authored set.
   */
  it('presents the same visible Markers the v1 timeline drew', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const visible = (view: ShowTimelineViewModel) => view.markers.map(marker => ({
      id: marker.id,
      timeMs: marker.timeMs,
      name: marker.name,
      color: marker.color,
      selection: marker.selection,
    }))
    expect(visible(v2)).toEqual(visible(v1))
    // Not a vacuous empty-to-empty pass: the record below carries a chapter per
    // Scene start, so dropping the origin filter turns this red.
    expect(record.composition.markers.length)
      .toBeGreaterThan(v1.markers.length)
  })

  it('keeps one chapter Marker per Scene start on the converted record', () => {
    const chapters = record.composition.markers
      .filter(marker => marker.role === 'chapter')
      .map(marker => ({ timeMs: marker.timeMs, name: marker.name }))
    const scenes = projectShowTimeline(source).scenes
      .map(scene => ({ timeMs: scene.startMs, name: scene.scene.name }))
      .sort((left, right) => left.timeMs - right.timeMs)
    expect(chapters).toEqual(scenes)
  })

  it('carries every authored Marker onto the converted record', () => {
    const authored = (source.composition?.markers ?? [])
      .map(marker => ({ id: marker.id, timeMs: marker.timeMs, name: marker.name, color: marker.color }))
    const carried = record.composition.markers
      .filter(marker => authored.some(candidate => candidate.id === marker.id))
      .map(marker => ({ id: marker.id, timeMs: marker.timeMs, name: marker.name, color: marker.color }))
    expect(carried).toEqual(authored)
  })
})

describe.each(composed)('$key composed timeline', testCase => {
  const source = testCase.source
  const record = convert(source)

  it('presents the same Layer names, ranks and lane order', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const layers = (view: ShowTimelineViewModel) => view.rows.map(row => ({
      zoneId: row.zoneId,
      composed: row.composed,
      layers: row.layers.map(layer => ({ name: layer.name, rank: layer.rank, layerIndex: layer.layerIndex })),
    }))
    expect(layers(v2)).toEqual(layers(v1))
  })

  it('presents the same Clip items, held appearance and lane membership', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const items = (view: ShowTimelineViewModel) => view.rows.flatMap(row => row.layers.flatMap(layer => (
      layer.items.map(item => ({
        lane: `${row.zoneId}#${layer.layerIndex}`,
        id: item.id,
        patternName: item.patternName,
        compiled: item.compiled,
        startMs: item.startMs,
        durationMs: item.durationMs,
        endMs: item.endMs,
        entryPolicy: item.entryPolicy,
        opacity: item.heldAppearance.opacity,
        effectKinds: item.heldAppearance.effectKinds,
        groupOccurrenceId: item.groupOccurrenceId,
        selection: item.selection,
        diagnostics: item.diagnostics,
      }))
    )))
    expect(items(v2)).toEqual(items(v1))
  })

  it('presents the same Layer junctions and Cut targets', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const junctions = (view: ShowTimelineViewModel) => {
      const positions = layerPositions(view)
      return view.rows.flatMap(row => row.layers.flatMap(layer => layer.junctions.map(junction => ({
        lane: `${row.zoneId}#${layer.layerIndex}`,
        kind: junction.kind,
        scope: junction.scope,
        leftItemId: junction.leftItemId,
        rightItemId: junction.rightItemId,
        startMs: junction.startMs,
        endMs: junction.endMs,
        durationMs: junction.durationMs,
        selection: visibleSelection(junction.selection, positions),
      }))))
    }
    expect(junctions(v2)).toEqual(junctions(v1))
  })

  it('presents the same Group bands', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const groups = (view: ShowTimelineViewModel) => view.rows.flatMap(row => row.groups.map(group => ({
      id: group.id,
      definitionId: group.definitionId,
      name: group.name,
      zoneId: group.zoneId,
      startMs: group.startMs,
      endMs: group.endMs,
      durationMs: group.durationMs,
      topLayerIndex: group.topLayerIndex,
      bottomLayerIndex: group.bottomLayerIndex,
      linkedOccurrenceCount: group.linkedOccurrenceCount,
      selection: group.selection,
    })))
    expect(groups(v2)).toEqual(groups(v1))
  })

  it('presents the same Transitions, windows and participants', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const transitions = (view: ShowTimelineViewModel) => {
      const positions = layerPositions(view)
      return view.transitions.map(transition => ({
        kind: transition.kind,
        startMs: transition.startMs,
        durationMs: transition.durationMs,
        endMs: transition.endMs,
        scope: transition.scope.kind === 'participants'
          ? {
              kind: 'participants',
              participants: transition.scope.participants.map(participant => ({
                zoneId: participant.zoneId,
                lane: positions.get(participant.layerId) ?? participant.layerId,
                fromItemId: participant.fromItemId,
                toItemId: participant.toItemId,
              })),
            }
          : transition.scope,
      }))
    }
    expect(transitions(v2)).toEqual(transitions(v1))
  })

  it('keeps every v1 snap candidate except the Scene-only boundaries', () => {
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const retained = new Set<number>([
      0,
      v1.showEndMs,
      ...v1.rows.flatMap(row => row.layers.flatMap(layer => (
        layer.items.flatMap(item => [item.startMs, item.endMs])
      ))),
      ...v1.transitions.flatMap(transition => [transition.startMs, transition.endMs]),
      ...v1.layoutIntervals.flatMap(interval => [interval.startMs, interval.endMs]),
    ])
    expect([...v2.structuralTimesMs].sort((left, right) => left - right))
      .toEqual([...new Set(v1.structuralTimesMs.filter(time => retained.has(time)))]
        .sort((left, right) => left - right))
  })
})

describe.each(flat)('$key flat timeline', testCase => {
  const source = testCase.source
  const record = convert(source)

  // A flat v1 Show has no composition sidecar, so the v1 editor draws the Scene
  // grid instead of Layer lanes. Its cells are the only v1 item oracle.
  it('presents one Clip item per flat cell with the same Pattern and window', () => {
    const v1 = projectShowTimeline(source)
    const v2 = projectShowEditorTimelineV2(record)
    const cells = v1.rows.flatMap(row => row.cells.map(cell => ({
      zoneId: cell.zoneId,
      patternName: cell.patternName,
      startMs: cell.startMs,
      endMs: cell.endMs,
      opacity: 1,
    })))
    const items = v2.rows.flatMap(row => row.layers.flatMap(layer => layer.items.map(item => ({
      zoneId: row.zoneId,
      patternName: item.patternName,
      startMs: item.startMs,
      endMs: item.endMs,
      opacity: item.heldAppearance.opacity,
    }))))
    expect(items).toEqual(cells)
  })

  it('presents the same Scene-boundary Transition windows', () => {
    const v1 = projectShowTimeline(source)
    const v2 = projectShowEditorTimelineV2(record)
    const boundaries = v1.boundaryTransitions
      .filter(transition => transition.kind !== 'routing' && transition.kind !== 'cut')
      .map(transition => ({ kind: transition.kind, startMs: transition.startMs, endMs: transition.endMs }))
    expect(v2.transitions.map(transition => ({
      kind: transition.kind,
      startMs: transition.startMs,
      endMs: transition.endMs,
    }))).toEqual(boundaries)
  })
})

interface OrdinaryOwner {
  owner: Extract<ShowClipInspectorOwner, { kind: 'scene-main' | 'scene-overlay' }>
  clipId: string
  atMs: number
}

function ordinaryOwners(source: ShowRecord): OrdinaryOwner[] {
  const sceneStartById = new Map(projectShowTimeline(source).scenes
    .map(scene => [scene.sceneId, scene.startMs]))
  return (source.composition?.scenes ?? []).flatMap(scene => {
    const sceneStartMs = sceneStartById.get(scene.sceneId) ?? 0
    return scene.zones.flatMap(zone => [
      ...zone.main.map(placement => ({
        owner: {
          kind: 'scene-main' as const,
          sceneId: scene.sceneId,
          zoneId: zone.zoneId,
          placementId: placement.id,
        },
        clipId: placement.logicalClipId ?? placement.id,
        atMs: sceneStartMs + placement.startMs,
      })),
      ...zone.overlays.flatMap(layer => layer.placements.map(placement => ({
        owner: {
          kind: 'scene-overlay' as const,
          sceneId: scene.sceneId,
          zoneId: zone.zoneId,
          layerId: layer.id,
          placementId: placement.id,
        },
        clipId: placement.logicalClipId ?? placement.id,
        atMs: sceneStartMs + placement.startMs,
      }))),
    ])
  })
}

/** The Clip-detail fields the panel renders, without record-shaped owner identity. */
function visibleClipValue(value: Omit<ShowClipInspectorValue, 'owner'>) {
  return {
    scope: value.scope,
    pattern: value.pattern,
    patternName: value.patternName,
    evaluationPolicy: value.evaluationPolicy,
    presentation: value.presentation,
    blink: value.blink,
    simulation: value.simulation,
    view: value.view,
    transform: value.transform,
    viewport: value.viewport,
    effects: value.effects,
    local: value.local,
  }
}

describe.each(composed)('$key Clip inspector', testCase => {
  const source = testCase.source
  const record = convert(source)
  const owners = ordinaryOwners(source)

  it('resolves every v1 composition placement to one authored v2 Clip', () => {
    const presentation = projectShowEditorInspectorPresentationV2(record, testCase.fixedTimeMs)
    expect(owners.length).toBeGreaterThan(0)
    expect(owners.map(entry => entry.clipId).filter(id => presentation.clipsById[id]))
      .toEqual(owners.map(entry => entry.clipId))
  })

  it('presents the same Clip-detail values', () => {
    for (const entry of owners) {
      const v1 = projectShowClipInspector(source, entry.owner)
      const v2 = projectShowEditorInspectorPresentationV2(record, entry.atMs).clipsById[entry.clipId]
      expect(v1, `v1 value for ${entry.owner.placementId}`).not.toBeNull()
      expect(v2, `v2 value for ${entry.clipId}`).toBeDefined()
      expect(visibleClipValue(v2!.value), `${testCase.key}/${entry.clipId}`)
        .toEqual(visibleClipValue(v1!))
    }
  })

  it('offers the same Property-animation targets and current values', () => {
    for (const entry of owners) {
      const v1 = projectShowClipInspector(source, entry.owner)!
      const v2 = projectShowEditorInspectorPresentationV2(record, entry.atMs).clipsById[entry.clipId]!
      expect(buildShowPropertyAnimationOptions(v2.value), `${testCase.key}/${entry.clipId}`)
        .toEqual(buildShowPropertyAnimationOptions(v1))
    }
  })

  it('partitions the same Clip-detail tabs', () => {
    for (const entry of owners) {
      const v1 = projectShowClipInspector(source, entry.owner)!
      const v2 = projectShowEditorInspectorPresentationV2(record, entry.atMs).clipsById[entry.clipId]!
      expect(projectShowClipDetailTabs({ value: v2.value, transformEnabled: true }), `${testCase.key}/${entry.clipId}`)
        .toEqual(projectShowClipDetailTabs({ value: v1, transformEnabled: true }))
    }
  })

  it('summarizes the same Property-animation rows in Show time', () => {
    for (const entry of owners) {
      const v1Value = projectShowClipInspector(source, entry.owner)!
      const v1Context = projectShowPropertyAnimationEditorContext(source, v1Value)
      const v2 = projectShowEditorInspectorPresentationV2(record, entry.atMs).clipsById[entry.clipId]!
      expect(v1Context, `v1 animation context for ${entry.owner.placementId}`).not.toBeNull()
      const v1Rows = projectShowPropertyAnimationOverview(
        v1Context!,
        buildShowPropertyAnimationOptions(v1Value),
      )
      const v2Rows = projectShowPropertyAnimationOverview(
        {
          tracks: v2.animation.tracks.map(track => track.editor),
          trackIssues: {},
          showTimeOffsetMs: v2.animation.showTimeOffsetMs,
          instanceUseCount: v2.animation.instanceUseCount,
        },
        buildShowPropertyAnimationOptions(v2.value),
      )
      expect(v2Rows, `${testCase.key}/${entry.clipId}`).toEqual(v1Rows)
    }
  })

  it('counts the same linked uses for an ordinary Pattern instance', () => {
    for (const entry of owners) {
      const v1Value = projectShowClipInspector(source, entry.owner)!
      const v1Context = projectShowPropertyAnimationEditorContext(source, v1Value)!
      const v2 = projectShowEditorInspectorPresentationV2(record, entry.atMs).clipsById[entry.clipId]!
      expect(v2.animation.instanceUseCount, `${testCase.key}/${entry.clipId}`)
        .toBe(v1Context.instanceUseCount)
    }
  })
})

interface GroupChildOwner {
  occurrenceId: string
  placementId: string
  atMs: number
}

function groupChildOwners(source: ShowRecord): GroupChildOwner[] {
  const sceneStartById = new Map(projectShowTimeline(source).scenes
    .map(scene => [scene.sceneId, scene.startMs]))
  const composition = source.composition
  return (composition?.groupOccurrences ?? []).flatMap(occurrence => {
    const definition = composition?.groupDefinitions
      ?.find(candidate => candidate.id === occurrence.definitionId)
    const sceneStartMs = sceneStartById.get(occurrence.sceneId) ?? 0
    return (definition?.placements ?? []).map(placement => ({
      occurrenceId: occurrence.id,
      placementId: placement.id,
      atMs: sceneStartMs + occurrence.startMs + placement.startMs,
    }))
  })
}

const grouped = composed.filter(entry => (entry.source.composition?.groupOccurrences ?? []).length > 0)

describe.each(grouped)('$key Group Clip inspector', testCase => {
  const source = testCase.source
  const record = convert(source)
  const children = groupChildOwners(source)

  it('presents the same Group-child Clip-detail values', () => {
    expect(children.length).toBeGreaterThan(0)
    for (const child of children) {
      const v1 = projectShowGroupClipInspector(source, child)
      const v2 = projectShowEditorInspectorPresentationV2(record, child.atMs)
        .groupsByOccurrenceId[child.occurrenceId]?.clipsById[child.placementId]
      expect(v1, `v1 value for ${child.occurrenceId}:${child.placementId}`).not.toBeNull()
      expect(v2, `v2 value for ${child.occurrenceId}:${child.placementId}`).toBeDefined()
      expect(visibleClipValue(v2!.value), `${testCase.key}/${child.occurrenceId}:${child.placementId}`)
        .toEqual(visibleClipValue(v1!))
    }
  })

  it('summarizes the same Group Property-animation rows in Show time', () => {
    for (const child of children) {
      const v1Value = projectShowGroupClipInspector(source, child)!
      const v1Context = projectShowPropertyAnimationEditorContext(source, v1Value, child)
      const v2 = projectShowEditorInspectorPresentationV2(record, child.atMs)
        .groupsByOccurrenceId[child.occurrenceId]!.clipsById[child.placementId]!
      expect(v1Context, `v1 context for ${child.occurrenceId}:${child.placementId}`).not.toBeNull()
      const v1Rows = projectShowPropertyAnimationOverview(
        v1Context!,
        buildShowPropertyAnimationOptions(v1Value),
      )
      const v2Rows = projectShowPropertyAnimationOverview(
        {
          tracks: v2.animation.tracks.map(track => track.editor),
          trackIssues: {},
          showTimeOffsetMs: v2.animation.showTimeOffsetMs,
          instanceUseCount: v2.animation.instanceUseCount,
        },
        buildShowPropertyAnimationOptions(v2.value),
      )
      expect(v2Rows, `${testCase.key}/${child.occurrenceId}:${child.placementId}`).toEqual(v1Rows)
    }
  })

  it('places every Group occurrence over the same Show window and lanes', () => {
    const timeline = projectShowTimelineViewModel(source)
    const presentation = projectShowEditorInspectorPresentationV2(record, testCase.fixedTimeMs)
    for (const band of timeline.rows.flatMap(row => row.groups)) {
      const v2 = presentation.groupsByOccurrenceId[band.id]
      expect(v2, `v2 occurrence ${band.id}`).toBeDefined()
      expect({
        definitionId: v2!.definitionId,
        name: v2!.name,
        zoneId: v2!.zoneId,
        startMs: v2!.startMs,
        endMs: v2!.endMs,
        durationMs: v2!.durationMs,
        linkedOccurrenceCount: v2!.linkedOccurrenceCount,
      }).toEqual({
        definitionId: band.definitionId,
        name: band.name,
        zoneId: band.zoneId,
        startMs: band.startMs,
        endMs: band.endMs,
        durationMs: band.durationMs,
        linkedOccurrenceCount: band.linkedOccurrenceCount,
      })
    }
  })
})

/**
 * Marker partition (#1065 coordinator steering).
 *
 * Conversion creates one chapter Marker per Scene label, and absorbs an
 * authored Marker that already sits at the Scene's start with the Scene's name
 * instead of minting a duplicate. The approved contract distinguishes the two:
 * a newly created Scene-label Marker carries `origin: 'converted-scene-label'`,
 * an absorbed authored Marker carries no origin, and a Marker with no origin
 * stays visible exactly as the v1 editor showed it. These read the record, not
 * an id prefix.
 */
function markerOrigin(marker: ShowRecordV2['composition']['markers'][number]): string | undefined {
  // Read the shipped field directly: a widening cast here would keep this file
  // compiling if the contract field were ever dropped from the record type.
  return marker.origin
}

describe.each(manifest.corpus)('$key converted Scene-label Markers', testCase => {
  const source = testCase.source
  const record = convert(source)

  it('marks every newly created Scene-label Marker with its conversion origin', () => {
    const authored = source.composition?.markers ?? []
    const absorbed = new Set(authored
      .filter(marker => projectShowTimeline(source).scenes.some(scene => (
        scene.startMs === marker.timeMs && scene.scene.name === marker.name
      )))
      .map(marker => marker.id))
    const created = record.composition.markers
      .filter(marker => marker.role === 'chapter' && !absorbed.has(marker.id))
    expect(created.length).toBe(projectShowTimeline(source).scenes.length - absorbed.size)
    expect(created.map(marker => markerOrigin(marker)))
      .toEqual(created.map(() => 'converted-scene-label'))
  })

  it('keeps every Marker the v1 editor showed visible after conversion', () => {
    const authored = (source.composition?.markers ?? [])
      .map(marker => ({ id: marker.id, timeMs: marker.timeMs, name: marker.name, color: marker.color }))
    const visible = record.composition.markers
      .filter(marker => markerOrigin(marker) !== 'converted-scene-label')
      .map(marker => ({ id: marker.id, timeMs: marker.timeMs, name: marker.name, color: marker.color }))
    expect(visible).toEqual(authored)
  })
})

describe('absorbed authored Marker', () => {
  // The committed corpus authors no Markers, so the absorption partition is
  // derived from one committed source rather than left untested.
  const base = manifest.corpus.find(entry => entry.key === 'stock-lesson')!
  function sourceWithAuthoredMarkers(): ShowRecord {
    const source = structuredClone(base.source)
    const scene = projectShowTimeline(source).scenes[0]!
    source.composition!.markers = [
      { id: 'authored-scene-label', timeMs: scene.startMs, name: scene.scene.name, color: '#f43f5e' },
      { id: 'authored-cue', timeMs: 8_000, name: 'Cue', color: '#22d3ee' },
    ]
    return source
  }

  it('absorbs the matching authored Marker instead of minting a duplicate', () => {
    const record = convert(sourceWithAuthoredMarkers())
    expect(record.composition.markers).toEqual([
      { id: 'authored-scene-label', timeMs: 0, name: 'Passages', color: '#f43f5e', role: 'chapter' },
      { id: 'authored-cue', timeMs: 8_000, name: 'Cue', color: '#22d3ee' },
    ])
  })

  it('leaves an absorbed authored Marker without a conversion origin', () => {
    const record = convert(sourceWithAuthoredMarkers())
    const absorbed = record.composition.markers.find(marker => marker.id === 'authored-scene-label')
    expect(absorbed?.role).toBe('chapter')
    expect(markerOrigin(absorbed!)).toBeUndefined()
  })

  it('keeps both authored Markers visible under the origin rule', () => {
    const record = convert(sourceWithAuthoredMarkers())
    expect(record.composition.markers
      .filter(marker => markerOrigin(marker) !== 'converted-scene-label')
      .map(marker => marker.id))
      .toEqual(['authored-scene-label', 'authored-cue'])
  })
})

/**
 * The visible-Marker oracle on a source that actually authors Markers.
 *
 * Every committed case authors none, so the corpus test above can only prove
 * that converted labels stay off the timeline. This derives a three-Scene
 * source that authors one Marker absorbing a Scene label and one unrelated cue,
 * so the same test also proves the filter keeps authored Markers - including an
 * absorbed one that is now a chapter - exactly where the v1 editor drew them.
 */
describe('editor timeline Marker visibility with authored Markers', () => {
  const base = manifest.corpus.find(entry => entry.key === 'installation-layouts')!

  function sourceWithAuthoredMarkers(): ShowRecord {
    const source = structuredClone(base.source)
    const scene = projectShowTimeline(source).scenes[1]!
    source.composition!.markers = [
      { id: 'authored-scene-label', timeMs: scene.startMs, name: scene.scene.name, color: '#f43f5e' },
      { id: 'authored-cue', timeMs: scene.startMs + 500, name: 'Cue', color: '#22d3ee' },
    ]
    return source
  }

  it('draws exactly the Markers the v1 timeline drew', () => {
    const source = sourceWithAuthoredMarkers()
    const record = convert(source)
    const v1 = projectShowTimelineViewModel(source)
    const v2 = projectShowEditorTimelineV2(record)
    const visible = (view: ShowTimelineViewModel) => view.markers.map(marker => ({
      id: marker.id,
      timeMs: marker.timeMs,
      name: marker.name,
      color: marker.color,
      selection: marker.selection,
    }))
    expect(visible(v1).map(marker => marker.id)).toEqual(['authored-scene-label', 'authored-cue'])
    expect(visible(v2)).toEqual(visible(v1))
    // Two Scene labels were newly created and both must stay off the timeline.
    expect(record.composition.markers.filter(marker => marker.role === 'chapter')).toHaveLength(3)
  })
})

/**
 * Stage presentation.
 *
 * The v1 Stage shell computes its own layout inside the component, so the
 * paired read here holds the layout fixed - the v2 presentation's own layout -
 * and compares the two diagnostic readers over it. That isolates Stage time
 * ownership and Clip geometry from Stage layout construction.
 */
function stageDependencies(source: ShowRecord): ShowPreparedStageDependenciesV2 {
  const stageMap = SOURCE_STOCK_MAPS.find(map => map.id === source.stageMapId) ?? null
  return { patterns: [], maps: [], libraries: [], profiles: [], stageMap }
}

function stageProbeTimes(source: ShowRecord, fixedTimeMs: number): number[] {
  const timeline = projectShowTimeline(source)
  const boundaries = [
    0,
    fixedTimeMs,
    timeline.durationMs - 1,
    ...timeline.scenes.flatMap(scene => [scene.startMs, scene.endMs]),
    ...timeline.rows.flatMap(row => row.cells.flatMap(cell => [cell.startMs, cell.endMs])),
    ...(source.composition?.scenes ?? []).flatMap(scene => {
      const startMs = timeline.scenes.find(range => range.sceneId === scene.sceneId)?.startMs ?? 0
      return scene.zones.flatMap(zone => [...zone.main, ...zone.overlays.flatMap(layer => layer.placements)]
        .flatMap(placement => [startMs + placement.startMs, startMs + placement.startMs + placement.durationMs]))
    }),
  ]
  return [...new Set(boundaries.flatMap(time => [time - 1, time, time + 1]))]
    .filter(time => time >= 0 && time < timeline.durationMs)
    .sort((left, right) => left - right)
}

describe.each(manifest.corpus)('$key Stage presentation', testCase => {
  const source = testCase.source
  const record = convert(source)
  const presentation = projectShowEditorStagePresentationV2(
    captureShowStageEditV2(record, stageDependencies(source)),
  )

  it('presents the same Show identity, loop length and Stage identity role', () => {
    expect(presentation.showId).toBe(source.id)
    expect(presentation.durationMs).toBe(showLoopDurationMs(source))
    expect(presentation.stageIdentityRole)
      .toBe(source.outputContract.kind === 'installation' ? 'Output map' : 'Reference map')
  })

  it('presents the same Installation coverage diagnostic', () => {
    expect(presentation.installationCoverage).toEqual(validateInstallationCoverage(source))
  })

  it('presents the same unfocused Stage Zone rectangles over Show time', () => {
    const v1 = createShowStageDiagnostics(
      source,
      presentation.layout.draw.kind === '2d' ? presentation.layout.draw.positions : [],
      presentation.layout.mapPoints,
      presentation.layout.projection,
      presentation.layout.kind === 'map',
      null,
    )
    for (const timeMs of stageProbeTimes(source, testCase.fixedTimeMs)) {
      expect(presentation.diagnosticFrameAt(null, timeMs).rects, `${testCase.key}@${timeMs}`)
        .toEqual(v1(timeMs).rects)
    }
  })
})

describe.each(composed)('$key Stage Clip diagnostics', testCase => {
  const source = testCase.source
  const record = convert(source)
  const presentation = projectShowEditorStagePresentationV2(
    captureShowStageEditV2(record, stageDependencies(source)),
  )

  it('shows the same focused Clip geometry for the same instants', () => {
    let drawn = 0
    for (const entry of ordinaryOwners(source)) {
      const v1 = createShowStageDiagnostics(
        source,
        presentation.layout.draw.kind === '2d' ? presentation.layout.draw.positions : [],
        presentation.layout.mapPoints,
        presentation.layout.projection,
        presentation.layout.kind === 'map',
        { sceneId: entry.owner.sceneId, zoneId: entry.owner.zoneId, placementId: entry.owner.placementId },
      )
      const focus = {
        recordVersion: 2 as const,
        showId: record.id,
        zoneId: entry.owner.zoneId,
        clipId: entry.clipId,
        occurrenceId: null,
      }
      for (const timeMs of stageProbeTimes(source, testCase.fixedTimeMs)) {
        const label = `${testCase.key}/${entry.clipId}@${timeMs}`
        const points = presentation.diagnosticFrameAt(focus, timeMs).clipPoints
        expect(points, label).toEqual(v1(timeMs).clipPoints)
        if (points) drawn += 1
      }
    }
    // A focus that never draws would compare null to null forever.
    expect(drawn).toBeGreaterThan(0)
  })
})

describe.each(grouped)('$key Stage Group Clip diagnostics', testCase => {
  const source = testCase.source
  const record = convert(source)
  const presentation = projectShowEditorStagePresentationV2(
    captureShowStageEditV2(record, stageDependencies(source)),
  )

  it('shows the same focused Group-child geometry for the same instants', () => {
    let drawn = 0
    const occurrenceById = new Map((source.composition?.groupOccurrences ?? [])
      .map(occurrence => [occurrence.id, occurrence]))
    for (const child of groupChildOwners(source)) {
      const occurrence = occurrenceById.get(child.occurrenceId)!
      const v1 = createShowStageDiagnostics(
        source,
        presentation.layout.draw.kind === '2d' ? presentation.layout.draw.positions : [],
        presentation.layout.mapPoints,
        presentation.layout.projection,
        presentation.layout.kind === 'map',
        {
          sceneId: occurrence.sceneId,
          zoneId: occurrence.zoneId,
          placementId: `${child.occurrenceId}:${child.placementId}`,
        },
      )
      const focus = {
        recordVersion: 2 as const,
        showId: record.id,
        zoneId: occurrence.zoneId,
        clipId: child.placementId,
        occurrenceId: child.occurrenceId,
      }
      for (const timeMs of stageProbeTimes(source, testCase.fixedTimeMs)) {
        const label = `${testCase.key}/${child.occurrenceId}:${child.placementId}@${timeMs}`
        const points = presentation.diagnosticFrameAt(focus, timeMs).clipPoints
        expect(points, label).toEqual(v1(timeMs).clipPoints)
        if (points) drawn += 1
      }
    }
    expect(drawn).toBeGreaterThan(0)
  })
})

describe.each(composed)('$key held Clip values over time', testCase => {
  const source = testCase.source
  const record = convert(source)

  // A v1 placement owns one set of detail values for its whole window. The v2
  // reader resolves a held appearance key per instant, so it must present the
  // same values at every instant inside that window.
  it('holds the same Clip-detail values at every instant inside the Clip window', () => {
    for (const entry of ordinaryOwners(source)) {
      const v1 = visibleClipValue(projectShowClipInspector(source, entry.owner)!)
      const clip = record.composition.clips.find(candidate => candidate.id === entry.clipId)!
      const instants = [
        clip.startMs,
        clip.startMs + 1,
        clip.startMs + Math.floor(clip.durationMs / 2),
        clip.startMs + clip.durationMs - 1,
      ]
      for (const timeMs of instants) {
        const v2 = projectShowEditorInspectorPresentationV2(record, timeMs).clipsById[entry.clipId]!
        expect(visibleClipValue(v2.value), `${testCase.key}/${entry.clipId}@${timeMs}`).toEqual(v1)
      }
    }
  })
})

describe.each(grouped)('$key Group binding and reuse', testCase => {
  const source = testCase.source
  const record = convert(source)

  it('binds Group Layers to the same visible lanes and base Layer', () => {
    const timeline = projectShowEditorTimelineV2(record)
    const positions = layerPositions(timeline)
    const presentation = projectShowEditorInspectorPresentationV2(record, testCase.fixedTimeMs)
    for (const occurrence of source.composition!.groupOccurrences!) {
      const definition = source.composition!.groupDefinitions!
        .find(candidate => candidate.id === occurrence.definitionId)!
      const v2 = presentation.groupsByOccurrenceId[occurrence.id]!
      expect(v2.baseLayer, `${testCase.key}/${occurrence.id} base Layer`).toBe(occurrence.baseLayer)
      expect(v2.clipCount).toBe(definition.placements.length)
      const band = projectShowTimelineViewModel(source).rows
        .flatMap(row => row.groups).find(candidate => candidate.id === occurrence.id)!
      const lanes = v2.layerBindings
        .map(binding => positions.get(binding.layerId))
        .map(lane => Number(lane?.split('#')[1]))
      expect(Math.min(...lanes), `${testCase.key}/${occurrence.id} top lane`).toBe(band.topLayerIndex)
      expect(Math.max(...lanes), `${testCase.key}/${occurrence.id} bottom lane`).toBe(band.bottomLayerIndex)
    }
  })

  /**
   * `instanceUseCount` is displayed text: the animation editor prints
   * "Affects {n} linked Clips" from it. The tracer's consumer contract is the
   * same displayed value, so this asserts equality against the original v1
   * definition-linked consumer rather than pinning a divergence. The v1 side is
   * additionally anchored to the structure of the source, so the pair cannot
   * pass by two readers making the same mistake.
   */
  it('counts the same linked Group Pattern-instance uses as the v1 editor', () => {
    for (const child of groupChildOwners(source)) {
      const v1Value = projectShowGroupClipInspector(source, child)!
      const v1Context = projectShowPropertyAnimationEditorContext(source, v1Value, child)!
      const v2 = projectShowEditorInspectorPresentationV2(record, child.atMs)
        .groupsByOccurrenceId[child.occurrenceId]!.clipsById[child.placementId]!
      const definition = source.composition!.groupDefinitions!
        .find(candidate => candidate.placements.some(placement => placement.id === child.placementId))!
      // v1 counts distinct logical slots sharing the instance, once per occurrence.
      const slotUses = new Set(definition.placements
        .filter(placement => placement.instanceId === v1Value.instanceId)
        .map(placement => placement.logicalClipId ?? placement.id)).size
      const occurrences = source.composition!.groupOccurrences!
        .filter(candidate => candidate.definitionId === definition.id).length
      const label = `${testCase.key}/${child.occurrenceId}:${child.placementId}`
      expect(v1Context.instanceUseCount, `${label} v1 structure`).toBe(slotUses * occurrences)
      expect(v2.animation.instanceUseCount, `${label} displayed linked uses`)
        .toBe(v1Context.instanceUseCount)
    }
  })
})

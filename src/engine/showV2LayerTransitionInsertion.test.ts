import { appendFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BASELINE_FIXTURES, resolveBaselineFixtureRecord, type BaselineFixture } from '../agent-harness/baseline/fixtures'
import type { ShowPatternRef, ShowRecord } from './personalContentRecords'
import type { ShowCompositionV1 } from './personalContentRecords'
import { projectShowGroupRuntimePatternInstances } from './showGroupModel'
import {
  planShowGroupLayerTransitionInsertion,
  planShowLayerTransitionInsertion,
} from './showLayerTransitionAuthoring'
import { convertShowRecordV1ToV2, type ShowV1ToV2Report } from './showRecordV1ToV2'
import { showV2TransitionJunctionKey } from './showV2TransitionEditorModel'
import {
  planShowV2GroupLayerTransitionInsertion,
  planShowV2LayerTransitionInsertion,
} from './showV2LayerTransitionInsertion'
import type { ShowRecordV2 } from './showCompositionV2'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import { addShowZone, createDefaultShow, type ShowCompileRecipeSourceLookup } from './showModel'
import { stockMapSpec } from './maps'
import { projectFlatShowToCompositionV1 } from './showCompositionModel'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { STOCK_SHOWS, stockShowById } from '../pixelblaze/stock/shows'
import { censusLoweringInputs } from '../../scripts/show-v2-parity'

// Corpus mirror of scripts/show-v2-parity.ts censusInputs()/censusLoweringInputs()
// (stock catalogue + agent-baseline fixtures, converted v1 state): the same
// convertible list scripts/show-v2-parity.test.ts pins, not a new selection.
function corpusShows(): Array<{ corpus: string; corpusId: string; show: ShowRecord; fixture?: BaselineFixture }> {
  return [
    ...STOCK_SHOWS.map(item => ({ corpus: 'stock', corpusId: item.id, show: structuredClone(item.show) })),
    ...BASELINE_FIXTURES.map(fixture => ({
      corpus: 'agent-baseline' as const,
      corpusId: fixture.id as string,
      show: resolveBaselineFixtureRecord(fixture, id => stockShowById(id)?.show),
      fixture,
    })),
  ]
}

function lookupFor(show: ShowRecord, fixture?: BaselineFixture, strict = true): ShowCompileRecipeSourceLookup {
  const patterns = new Map((fixture?.patterns ?? []).map(pattern => [pattern.id, pattern]))
  const source = (ref: ShowPatternRef): string => {
    if (ref.kind === 'stock') {
      const id = resolveStockPatternId(ref.id)
      if (!Object.prototype.hasOwnProperty.call(DEMOS, id)) {
        if (strict) throw new Error(`missing stock source ${ref.id}`)
        return 'export function render() {}'
      }
      return DEMOS[id]
    }
    const found = patterns.get(ref.id)
    if (!found) {
      if (strict) throw new Error(`missing fixture source ${ref.id}`)
      return 'export function render() {}'
    }
    return found.src
  }
  return {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, source(cell.pattern)])),
    byPatternInstanceId: Object.fromEntries([
      ...(show.composition?.patternInstances ?? []),
      ...(show.composition?.groupDefinitions ?? []).flatMap(group => group.patternInstances),
      ...(show.composition ? projectShowGroupRuntimePatternInstances(show.composition) : []),
    ].map(instance => [instance.id, source(instance.pattern)])),
    stageDimension: outputDimension(show),
  }
}

function outputDimension(show: ShowRecord): 1 | 2 | 3 {
  if (show.outputContract.kind === 'portable-2d') return 2
  const map = show.stageMapId ? stockMapSpec(show.stageMapId) : undefined
  return map?.dim ?? 2
}

function clipIdOf(report: ShowV1ToV2Report, placementId: string): string {
  const mapping = report.clipMappings.find(entry => entry.sourcePlacementIds.includes(placementId))
  if (!mapping) throw new Error(`no clip mapping for placement "${placementId}"`)
  return mapping.clipId
}

function junctionKeyFor(record: ShowRecordV2, fromClipId: string, toClipId: string, atMs: number): string {
  const from = record.composition.clips.find(clip => clip.id === fromClipId)!
  const to = record.composition.clips.find(clip => clip.id === toClipId)!
  expect(from, `clip ${fromClipId}`).toBeDefined()
  expect(to, `clip ${toClipId}`).toBeDefined()
  expect(to.startMs, 'exact adjacency').toBe(from.startMs + from.durationMs)
  expect(to.zoneId, 'same zone').toBe(from.zoneId)
  expect(to.layerId, 'same layer').toBe(from.layerId)
  return showV2TransitionJunctionKey({
    atMs,
    zoneId: from.zoneId,
    layerId: from.layerId,
    fromClipId,
    toClipId,
  })
}

describe('v2 Layer Transition insertion plan (#1075 G4b-2a)', () => {
  it('matches v1 on every exact-adjacency Cut of every convertible stock Show', () => {
    const expected = new Set(censusLoweringInputs().map(entry => `${entry.corpus}:${entry.corpusId}`))
    let showsCompared = 0
    let cutsCompared = 0
    const converted: string[] = []
    const skipped: string[] = []
    const unmapped: string[] = []
    const sameClip: string[] = []
    for (const input of corpusShows()) {
      let lookup: ShowCompileRecipeSourceLookup
      try {
        lookup = lookupFor(input.show, input.fixture)
      } catch {
        skipped.push(`${input.corpus}:${input.corpusId}[lookup]`)
        continue
      }
      const conversion = convertShowRecordV1ToV2(input.show, lookup)
      if (conversion.status !== 'converted') {
        skipped.push(`${input.corpus}:${input.corpusId}[refused]`)
        continue
      }
      converted.push(`${input.corpus}:${input.corpusId}`)
      const { show } = input
      const composition = show.composition ?? projectFlatShowToCompositionV1(show, lookup)
      const record = conversion.record
      const projection = projectShowUnifiedTimeline(show, composition)
      for (const zone of projection.zones) {
        for (const layer of zone.layers) {
          for (const junction of layer.junctions) {
            if (junction.kind !== 'cut') continue
            const left = layer.clips.find(clip => clip.id === junction.leftClipId)!
            const right = layer.clips.find(clip => clip.id === junction.rightClipId)!
            if (left.groupOccurrenceId ?? right.groupOccurrenceId) continue
            const v1plan = planShowLayerTransitionInsertion(show, composition, {
              fromPlacementId: junction.fromPlacementId,
              toPlacementId: junction.toPlacementId,
            })
            let fromClipId: string
            let toClipId: string
            try {
              fromClipId = clipIdOf(conversion.report, junction.fromPlacementId)
              toClipId = clipIdOf(conversion.report, junction.toPlacementId)
            } catch {
              unmapped.push(`${input.corpusId} ${junction.fromPlacementId}→${junction.toPlacementId} v1=${JSON.stringify(v1plan)}`)
              continue
            }
            if (toClipId === fromClipId) {
              sameClip.push(`${input.corpusId} ${junction.fromPlacementId}→${junction.toPlacementId}@${junction.startMs} v1=${JSON.stringify(v1plan)}`)
              continue
            }
            const key = junctionKeyFor(record, fromClipId, toClipId, junction.startMs)
            const v2plan = planShowV2LayerTransitionInsertion(record, key)
            expect(
              v2plan,
              `${input.corpusId} ${junction.fromPlacementId}→${junction.toPlacementId} v1=${JSON.stringify(v1plan)}`,
            ).toEqual(v1plan)
            cutsCompared += 1
          }
        }
      }
      showsCompared += 1
    }
    console.log(`UNMAPPED ${JSON.stringify(unmapped)}`)
    console.log(`SAMECLIP ${JSON.stringify(sameClip)}`)
    appendFileSync('/tmp/g4b2a-sweep-counts.txt', `sameClipDetail=${JSON.stringify(sameClip)}
shows=${showsCompared} cuts=${cutsCompared} unmapped=${unmapped.length} sameClip=${sameClip.length} skipped=${JSON.stringify(skipped)}
`)
    // Interior seams: both v1 segments coalesce to one v2 Clip, so no v2
    // junction key exists for the Cut. v1 refuses each as a cross-Scene seam;
    // that characterization is pinned here and reported as BRIEF GAP.
    expect(unmapped, 'placements without a converted Clip').toEqual([])
    for (const entry of sameClip) {
      expect(entry.includes('These two Clips sit in different Zone Layouts'), entry).toBe(true)
    }
    expect(new Set(converted), 'same convertible list as show:v2-parity').toEqual(expected)
    expect(skipped, 'skipped corpus entries').toEqual([])
    console.log(`SWEEP shows=${showsCompared} cuts=${cutsCompared}`)
    expect(cutsCompared).toBeGreaterThan(0)
  })
})

function layerFixture(): { show: ShowRecord; composition: ShowCompositionV1 } {
  const show = createDefaultShow('show-layer-transition', 'Layer transition', 1_000)
  const scene = show.scenes[0]
  const zoneId = show.zones[0].id
  const placement = (id: string, startMs: number, durationMs: number) => ({
    id,
    instanceId: 'instance-a',
    startMs,
    durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
  })
  const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      transitions: [{
        id: 'transition-b-c',
        fromPlacementId: 'clip-b',
        toPlacementId: 'clip-c',
        kind: 'crossfade',
        durationMs: 1_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }],
      scenes: [{
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: [
            placement('clip-a', 0, 2_000),
            placement('clip-b', 2_000, 2_000),
            placement('clip-c', 5_000, 2_000),
            placement('obstruction', 9_000, 1_000),
          ],
          overlays: [],
        }],
      }],
  }
  show.composition = composition
  return { show, composition }
}

function boundaryFixture(): { show: ShowRecord; composition: ShowCompositionV1 } {
  const show = createDefaultShow('show-boundary-move', 'Boundary move', 1_000)
  const zoneId = show.zones[0].id
  const [leftScene, rightScene] = show.scenes
  show.transitions.push({
    id: 'routing-scene-1',
    afterSceneId: leftScene.id,
    kind: 'routing',
    durationMs: 0,
    easing: { curve: 'linear' },
    layoutId: show.routingLayouts[0].id,
  })
  show.composition = {
    version: 1,
    patternInstances: [{
      id: 'instance-a',
      pattern: { kind: 'stock', id: 'Rings' },
      patternName: 'Rings',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    scenes: [leftScene, rightScene].map((scene, index) => ({
      sceneId: scene.id,
      zones: [{
        zoneId,
        main: [{
          id: index === 0 ? 'clip-left' : 'clip-right',
          instanceId: 'instance-a',
          startMs: 0,
          durationMs: scene.durationMs,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [{ id: `layer-${index}`, name: 'Layer 1', placements: [] }],
      }],
    })),
  }
  return { show, composition: show.composition }
}

function groupFixture(overlay: { id: string; startMs: number; durationMs: number }): {
  show: ShowRecord
  composition: ShowCompositionV1
} {
  const { show, composition: base } = layerFixture()
  const composition: ShowCompositionV1 = {
    ...base,
    transitions: [],
    scenes: [{
      sceneId: show.scenes[0].id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [],
        overlays: [{
          id: 'overlay-layer',
          name: 'Overlay',
          placements: [{
            id: overlay.id,
            instanceId: 'instance-a',
            startMs: overlay.startMs,
            durationMs: overlay.durationMs,
            opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
        }],
      }],
    }],
    groupDefinitions: [{
      id: 'group-definition',
      name: 'Phrase',
      patternInstances: [{
        id: 'group-instance',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'left',
        instanceId: 'group-instance',
        layerOffset: 0,
        startMs: 0,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }, {
        id: 'right',
        instanceId: 'group-instance',
        layerOffset: 0,
        startMs: 1_000,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }],
    groupOccurrences: [{
      id: 'group-use-obstructed',
      definitionId: 'group-definition',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      startMs: 0,
      baseLayer: 0,
      translationX: 0,
      translationY: 0,
    }, {
      id: 'group-use-clear',
      definitionId: 'group-definition',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      startMs: 3_000,
      baseLayer: 0,
      translationX: 0,
      translationY: 0,
    }],
  }
  show.composition = composition
  return { show, composition }
}

function convertedRecord(show: ShowRecord): { record: ShowRecordV2; report: ShowV1ToV2Report } {
  const conversion = convertShowRecordV1ToV2(show, lookupFor(show, undefined, false))
  if (conversion.status !== 'converted') {
    throw new Error(`fixture refused conversion: ${JSON.stringify(conversion.issues)}`)
  }
  return { record: conversion.record, report: conversion.report }
}

function reasonCase(
  show: ShowRecord,
  composition: ShowCompositionV1,
  fromPlacementId: string,
  toPlacementId: string,
  atMs: number,
): { v1plan: ReturnType<typeof planShowLayerTransitionInsertion>; key: string; record: ShowRecordV2 } {
  const v1plan = planShowLayerTransitionInsertion(show, composition, { fromPlacementId, toPlacementId })
  const { record, report } = convertedRecord(show)
  const key = showV2TransitionJunctionKey({
    atMs,
    zoneId: record.composition.clips.find(clip => clip.id === clipIdOf(report, fromPlacementId))!.zoneId,
    layerId: record.composition.clips.find(clip => clip.id === clipIdOf(report, fromPlacementId))!.layerId,
    fromClipId: clipIdOf(report, fromPlacementId),
    toClipId: clipIdOf(report, toPlacementId),
  })
  return { v1plan, key, record }
}

describe('v2 Layer Transition insertion reasons (#1075 G4b-2a)', () => {
  it('refuses across Zone Layouts like v1', () => {
    const { show, composition } = boundaryFixture()
    const { v1plan, key, record } = reasonCase(show, composition, 'clip-left', 'clip-right', 30_000)
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.',
    })
    expect(planShowV2LayerTransitionInsertion(record, key)).toEqual(v1plan)
  })

  it('refuses a non-adjacent pair like v1', () => {
    const { show, composition } = layerFixture()
    const { v1plan, key, record } = reasonCase(show, composition, 'clip-a', 'clip-c', 2_000)
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'A Transition joins two Clips that follow each other on the same Layer. Select a Clip and the one directly after it.',
    })
    expect(planShowV2LayerTransitionInsertion(record, key)).toEqual(v1plan)
  })

  it('refuses a junction that already has a Transition like v1', () => {
    const { show, composition } = layerFixture()
    const { v1plan, key, record } = reasonCase(show, composition, 'clip-b', 'clip-c', 4_000)
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'This junction already has a Transition. Edit that one instead of adding another.',
    })
    expect(planShowV2LayerTransitionInsertion(record, key)).toEqual(v1plan)
  })

  it('refuses when another Layer starts here like v1', () => {
    const { show, composition } = layerFixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        id: 'unrelated-overlay',
        instanceId: 'instance-a',
        startMs: 2_000,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    const { v1plan, key, record } = reasonCase(show, composition, 'clip-a', 'clip-b', 2_000)
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.',
    })
    expect(planShowV2LayerTransitionInsertion(record, key)).toEqual(v1plan)
  })

  it('refuses a simultaneous Transition on another Layer like v1', () => {
    // Same-Zone simultaneity cannot convert: the lowering refuses an
    // unrelated Clip starting at or inside a Layer transition, so the
    // convertible shape is a simultaneous Transition in another Zone, which
    // v1 still counts as a fixed window across its unified projection.
    const show = addShowZone(createDefaultShow('show-simultaneous', 'Simultaneous', 1_000), { name: 'right' })
    show.scenes[0].durationMs = 14_000
    const [left, right] = show.zones
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [
        { id: 'instance-a', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'Rings', time: { timeScale: 1, timeOffsetMs: 0 } },
        { id: 'instance-b', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'Rings', time: { timeScale: 1, timeOffsetMs: 0 } },
      ],
      transitions: [{
        id: 'transition-right',
        fromPlacementId: 'clip-right-a',
        toPlacementId: 'clip-right-b',
        kind: 'crossfade',
        durationMs: 1_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }],
      scenes: [{
        sceneId: show.scenes[0].id,
        zones: [
          {
            zoneId: left.id,
            main: [
              { id: 'clip-left-a', instanceId: 'instance-a', startMs: 0, durationMs: 4_000, view: { mirror: false, phase: 0, brightness: 1 } },
              { id: 'clip-left-b', instanceId: 'instance-b', startMs: 4_000, durationMs: 4_000, view: { mirror: false, phase: 0, brightness: 1 } },
            ],
            overlays: [],
          },
          {
            zoneId: right.id,
            main: [
              { id: 'clip-right-a', instanceId: 'instance-a', startMs: 0, durationMs: 4_000, view: { mirror: false, phase: 0, brightness: 1 } },
              { id: 'clip-right-b', instanceId: 'instance-b', startMs: 5_000, durationMs: 4_000, view: { mirror: false, phase: 0, brightness: 1 } },
            ],
            overlays: [],
          },
        ],
      }],
    }
    show.composition = composition
    const { v1plan, key, record } = reasonCase(show, composition, 'clip-left-a', 'clip-left-b', 4_000)
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'Another Layer is already running a Transition across this moment. Only one Layer can transition at a time, so move this junction or shorten that Transition.',
    })
    expect(planShowV2LayerTransitionInsertion(record, key)).toEqual(v1plan)
  })

  it('clamps over a stable unrelated Clip and exhausts like v1', () => {
    const { show, composition } = layerFixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        id: 'overlay-through-cut',
        instanceId: 'instance-a',
        startMs: 1_000,
        durationMs: 1_500,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    const first = reasonCase(show, composition, 'clip-a', 'clip-b', 2_000)
    expect(first.v1plan).toEqual({ enabled: true, maxDurationMs: 499 })
    expect(planShowV2LayerTransitionInsertion(first.record, first.key)).toEqual(first.v1plan)
    composition.scenes[0].zones[0].overlays[0].placements[0].durationMs = 1_000
    const second = reasonCase(show, composition, 'clip-a', 'clip-b', 2_000)
    expect(second.v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.',
    })
    expect(planShowV2LayerTransitionInsertion(second.record, second.key)).toEqual(second.v1plan)
  })

  it('treats a gapped consecutive pair like v1 (already-Transition reason)', () => {
    const { show, composition } = layerFixture()
    composition.transitions = []
    const { v1plan, key, record } = reasonCase(show, composition, 'clip-b', 'clip-c', 4_000)
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'This junction already has a Transition. Edit that one instead of adding another.',
    })
    expect(planShowV2LayerTransitionInsertion(record, key)).toEqual(v1plan)
  })

  it('bounds insertion by the endpoint Scene like v1', () => {
    const { show, composition } = layerFixture()
    show.scenes[0].durationMs = 5_000
    show.scenes.push({ ...show.scenes[0], id: 'later-scene', name: 'Later', durationMs: 30_000 })
    show.transitions = [{
      id: 'scene-boundary-transition',
      afterSceneId: show.scenes[0].id,
      kind: 'crossfade',
      durationMs: 2_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]
    composition.transitions = []
    composition.scenes[0].zones[0].main = composition.scenes[0].zones[0].main.slice(0, 2)
    composition.scenes.push({
      sceneId: 'later-scene',
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          id: 'later-clip', instanceId: 'instance-a', startMs: 0, durationMs: 1_000,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [],
      }],
    })
    const { v1plan, key, record } = reasonCase(show, composition, 'clip-a', 'clip-b', 2_000)
    expect(v1plan).toEqual({ enabled: true, maxDurationMs: 1_000 })
    expect(planShowV2LayerTransitionInsertion(record, key)).toEqual(v1plan)
  })
})

describe('v2 Group Layer Transition insertion plan (#1075 G4b-2a)', () => {
  it('refuses a Group Cut like v1 when another Layer starts here', () => {
    const { show, composition } = groupFixture({ id: 'unrelated-overlay', startMs: 1_000, durationMs: 1_000 })
    const v1plan = planShowGroupLayerTransitionInsertion(show, composition, {
      occurrenceId: 'group-use-clear',
      fromPlacementId: 'group-use-clear:left',
      toPlacementId: 'group-use-clear:right',
    })
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.',
    })
    const { record } = convertedRecord(show)
    expect(planShowV2GroupLayerTransitionInsertion(record, 'group-use-clear', 'left', 'right')).toEqual(v1plan)
  })

  it('takes the minimum across two linked occurrences like v1', () => {
    const { show, composition } = groupFixture({ id: 'unrelated-overlay', startMs: 2_500, durationMs: 1_000 })
    const v1plan = planShowGroupLayerTransitionInsertion(show, composition, {
      occurrenceId: 'group-use-clear',
      fromPlacementId: 'group-use-clear:left',
      toPlacementId: 'group-use-clear:right',
    })
    expect(v1plan).toEqual({ enabled: true, maxDurationMs: 1_000 })
    const { record } = convertedRecord(show)
    expect(planShowV2GroupLayerTransitionInsertion(record, 'group-use-clear', 'left', 'right')).toEqual(v1plan)
  })

  it('reports a missing Group like v1', () => {
    const { show, composition } = groupFixture({ id: 'unrelated-overlay', startMs: 1_000, durationMs: 1_000 })
    const v1plan = planShowGroupLayerTransitionInsertion(show, composition, {
      occurrenceId: 'group-missing',
      fromPlacementId: 'group-missing:left',
      toPlacementId: 'group-missing:right',
    })
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'This Group no longer exists.',
    })
    const { record } = convertedRecord(show)
    expect(planShowV2GroupLayerTransitionInsertion(record, 'group-missing', 'left', 'right')).toEqual(v1plan)
  })
})

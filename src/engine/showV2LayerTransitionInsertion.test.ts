import { describe, expect, it } from 'vitest'
import { BASELINE_FIXTURES, resolveBaselineFixtureRecord, type BaselineFixture } from '../agent-harness/baseline/fixtures'
import type { ShowPatternRef, ShowRecord } from './personalContentRecords'
import type { ShowCompositionV1 } from './personalContentRecords'
import { projectShowGroupRuntimePatternInstances } from './showGroupModel'
import {
  planShowGroupLayerTransitionInsertion,
  planShowLayerTransitionInsertion,
  planShowLayerTransitionInsertionForClip,
  type ShowLayerTransitionClipInsertionPlan,
} from './showLayerTransitionAuthoring'
import { convertShowRecordV1ToV2, type ShowV1ToV2Report } from './showRecordV1ToV2'
import { showV2TransitionJunctionKey } from './showV2TransitionEditorModel'
import {
  planShowV2GroupLayerTransitionInsertion,
  planShowV2LayerTransitionInsertion,
  planShowV2LayerTransitionInsertionForClip,
  type ShowV2LayerTransitionClipInsertionPlan,
} from './showV2LayerTransitionInsertion'
import type { ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import { validateShowRecordV2 } from './showCompositionV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { insertShowGroupDefinitionLayerTransitionV2 } from './showGroupEditsV2'
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
  it('offers room up to the next logical obstruction (#1075 ruling)', () => {
    const expected = new Set(censusLoweringInputs().map(entry => `${entry.corpus}:${entry.corpusId}`))
    let showsCompared = 0
    let cutsCompared = 0
    let enabledCuts = 0
    let disabledCuts = 0
    const diverged: string[] = []
    const sceneEndExceeded: string[] = []
    const violations: string[] = []
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
            cutsCompared += 1
            const label = `${input.corpusId} ${junction.fromPlacementId}→${junction.toPlacementId}@${junction.startMs}`
            const v1SceneBound = !v1plan.enabled && (v1plan as { reason?: string }).reason === DIFFERENT_LAYOUTS
            if (v1SceneBound && !layoutBoundaryChangesAt(record, junction.startMs)) {
              diverged.push(`${label} v1=${JSON.stringify(v1plan)} v2=${JSON.stringify(v2plan)}`)
              if (v2plan.enabled) {
                enabledCuts += 1
                checkOwnerBounds(record, fromClipId, toClipId, v2plan.maxDurationMs, label, violations)
              } else {
                disabledCuts += 1
              }
              continue
            }
            if (v2plan.enabled) {
              enabledCuts += 1
              checkOwnerBounds(record, fromClipId, toClipId, v2plan.maxDurationMs, label, violations)
              if (v1plan.enabled) {
                if (v2plan.maxDurationMs < v1plan.maxDurationMs) {
                  violations.push(`${label}: v2 max ${v2plan.maxDurationMs} < v1 max ${v1plan.maxDurationMs}`)
                }
              } else if (
                !v1plan.enabled
                && (v1plan as { reason?: string }).reason === NO_FREE_TIME
              ) {
                sceneEndExceeded.push(`${label} v1=${JSON.stringify(v1plan)} v2=${JSON.stringify(v2plan)}`)
              } else {
                violations.push(`${label}: v2 enabled while v1 refuses ${JSON.stringify(v1plan)}`)
              }
            } else {
              disabledCuts += 1
              if (JSON.stringify(v2plan) !== JSON.stringify(v1plan)) {
                violations.push(`${label}: v2 disabled ${JSON.stringify(v2plan)} !== v1 ${JSON.stringify(v1plan)}`)
              }
            }
          }
        }
      }
      showsCompared += 1
    }
    console.log(`UNMAPPED ${JSON.stringify(unmapped)}`)
    console.log(`SAMECLIP ${JSON.stringify(sameClip)}`)
    expect(diverged, 'recorded scene-bound divergence').toEqual(RECORDED_DIVERGENCE)
    expect(sceneEndExceeded, 'recorded scene-end-limit divergence').toEqual(RECORDED_SCENE_END_EXCEEDED)
    // Interior seams: both v1 segments coalesce to one v2 Clip, so no v2
    // junction key exists for the Cut. v1 refuses each as a cross-Scene seam.
    expect(unmapped, 'placements without a converted Clip').toEqual([])
    for (const entry of sameClip) {
      expect(entry.includes('These two Clips sit in different Zone Layouts'), entry).toBe(true)
    }
    expect(new Set(converted), 'same convertible list as show:v2-parity').toEqual(expected)
    expect(skipped, 'skipped corpus entries').toEqual([])
    console.log(`SWEEP shows=${showsCompared} cuts=${cutsCompared} enabled=${enabledCuts} disabled=${disabledCuts} diverged=${diverged.length} sceneEndExceeded=${sceneEndExceeded.length}`)
    expect(violations, 'oracle violations').toEqual([])
    expect(cutsCompared).toBeGreaterThan(0)
  })
})

const DIFFERENT_LAYOUTS =
  'These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.'

const NO_FREE_TIME =
  'There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.'

function layoutBoundaryChangesAt(record: ShowRecordV2, cutMs: number): boolean {
  const ordered = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  const before = ordered.find(occurrence => occurrence.startMs + occurrence.durationMs === cutMs)
  const after = ordered.find(occurrence => occurrence.startMs === cutMs)
  return !!before && !!after && before.layoutId !== after.layoutId
}

function layerProbeTransition(
  record: ShowRecordV2,
  fromClipId: string,
  toClipId: string,
  durationMs: number,
  id: string,
): ShowTransitionV2 {
  const from = record.composition.clips.find(clip => clip.id === fromClipId)!
  return {
    kind: 'crossfade',
    id,
    durationMs,
    easing: { curve: 'linear' },
    crossfadePolicy: 'live-live',
    participants: [{
      id: `${id}:participant`,
      zoneId: from.zoneId,
      layerId: from.layerId,
      fromClipId,
      toClipId,
    }],
    propertyRamps: [],
  }
}

function checkOwnerBounds(
  record: ShowRecordV2,
  fromClipId: string,
  toClipId: string,
  maxDurationMs: number,
  label: string,
  violations: string[],
): void {
  const accepted = editShowTransitionV2(record, {
    kind: 'insert',
    transition: layerProbeTransition(record, fromClipId, toClipId, maxDurationMs, '__sweep-probe-accept'),
  })
  if (accepted.status !== 'changed') {
    violations.push(`${label}: owner refuses the offered maximum ${maxDurationMs} (${accepted.status})`)
  }
  const refused = editShowTransitionV2(record, {
    kind: 'insert',
    transition: layerProbeTransition(record, fromClipId, toClipId, maxDurationMs + 1, '__sweep-probe-refuse'),
  })
  if (refused.status !== 'refused') {
    violations.push(`${label}: owner accepts one past the maximum ${maxDurationMs + 1} (${refused.status})`)
  }
}



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
  show.routingLayouts.push({ ...show.routingLayouts[0], id: 'layout-2', name: 'Alternate' })
  show.transitions = []
  show.transitions.push({
    id: 'routing-scene-1',
    afterSceneId: leftScene.id,
    kind: 'routing',
    durationMs: 0,
    easing: { curve: 'linear' },
    layoutId: 'layout-2',
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

  it('offers the owner room past the retired Scene end (#1075 ruling)', () => {
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
    // Chapter Markers are labels only, so the retired Scene end does not bound
    // v2 (#1075, Jon 2026-09-22). The maximum is what the Transition owner
    // accepts: pushing clip-b exactly onto the converted whole-output
    // boundary window start would leave its empty contributor side inexact,
    // so the owner refuses 1_000 and the plan offers 999.
    const v2plan = planShowV2LayerTransitionInsertion(record, key)
    expect(v2plan).toEqual({ enabled: true, maxDurationMs: 999 })
    const fromClipId = record.composition.clips.find(clip => clip.id === 'clip-a')!.id
    const toClipId = record.composition.clips.find(clip => clip.id === 'clip-b')!.id
    const violations: string[] = []
    checkOwnerBounds(record, fromClipId, toClipId, 999, 'endpoint-scene', violations)
    expect(violations).toEqual([])
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
    const v2plan = planShowV2GroupLayerTransitionInsertion(record, 'group-use-clear', 'left', 'right')
    expect(v2plan).toEqual(v1plan)
    if (!v2plan.enabled) throw new Error('expected an enabled Group plan')
    const definition = record.composition.groupDefinitions.find(candidate => candidate.id === 'group-definition')!
    const layerId = definition.clips.find(clip => clip.id === 'left')!.layerId
    const groupProbe = (durationMs: number, id: string): ShowTransitionV2 => ({
      kind: 'crossfade',
      id,
      durationMs,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      participants: [{
        id: `${id}:participant`,
        zoneId: 'definition-zone',
        layerId,
        fromClipId: 'left',
        toClipId: 'right',
      }],
      propertyRamps: [],
    })
    expect(insertShowGroupDefinitionLayerTransitionV2(record, {
      kind: 'insert-definition-layer-transition',
      definitionId: definition.id,
      transition: groupProbe(v2plan.maxDurationMs, '__probe-group-accept'),
    }).status, 'Group owner accepts the maximum').toBe('changed')
    expect(insertShowGroupDefinitionLayerTransitionV2(record, {
      kind: 'insert-definition-layer-transition',
      definitionId: definition.id,
      transition: groupProbe(v2plan.maxDurationMs + 1, '__probe-group-refuse'),
    }).status, 'Group owner refuses one past the maximum').toBe('refused')
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

// Recorded divergence under Jon's #1075 ruling (2026-09-22): every Cut below
// is a cross-Scene seam where v1 refuses with the Scene-based "different Zone
// Layouts" reason while no Layout occurrence changes at the Cut. Chapter
// Markers do not bound the v2 plan, so v2 answers from the Transition owner
// instead. On a converted Show that room can exceed the v1 Scene-end limit.
const RECORDED_DIVERGENCE: string[] = [
  "stock-show-302-installation-composition hero-render→hero-windows@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition hero-windows→hero-answer@14000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition satellite-1-render→satellite-1-window@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition satellite-1-window→satellite-1-answer@14000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition satellite-2-render→satellite-2-window@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition satellite-2-window→satellite-2-answer@14000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition satellite-3-render→satellite-3-window@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition satellite-3-window→satellite-3-answer@14000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition satellite-4-render→satellite-4-window@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-302-installation-composition satellite-4-window→satellite-4-answer@14000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-transform-effects clip-affine-effects--span-effect-5→clip-wrap-effect@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-distortion-effects clip-distortion-effect-1→clip-distortion-effect-2@3000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-distortion-effects clip-distortion-effect-2→clip-distortion-effect-3@7000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-distortion-effects clip-distortion-effect-3→clip-distortion-effect-4@9500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-distortion-effects clip-distortion-effect-4→clip-distortion-effect-5@12000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-distortion-effects clip-distortion-effect-5→clip-distortion-effect-6@14500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-1→clip-color-adjustment-effect-2@4000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-2→clip-color-adjustment-effect-3@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-3→clip-color-adjustment-effect-4@8000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-4→clip-color-adjustment-effect-5@10000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-5→clip-color-adjustment-effect-6@12000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-6→clip-color-adjustment-effect-7@14000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-7→clip-color-adjustment-effect-8@16000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-8→clip-color-adjustment-effect-9@18000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-color-adjustment-effects clip-color-adjustment-effect-9→clip-color-adjustment-effect-10@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-compositing-key-effects subject-1→subject-2@3000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects subject-2→subject-3@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects subject-3→subject-4@9000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects subject-4→subject-5@12500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects subject-5→subject-6@16000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects subject-6→subject-7@19000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects subject-7→subject-8@24000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects bed-1→bed-2@3000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects bed-2→bed-3@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects bed-3→bed-4@9000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects bed-4→bed-5@12500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects bed-5→bed-6@16000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects bed-6→bed-7@19000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-compositing-key-effects bed-7→bed-8@24000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-luma-sources luma-clip-1→luma-clip-2@4000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-luma-sources luma-clip-2→luma-clip-3@8000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-luma-sources luma-clip-3→luma-clip-4@12000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-luma-sources luma-clip-4→luma-clip-5@16000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-luma-sources luma-clip-5→luma-clip-6@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-luma-sources luma-clip-6→luma-clip-7@24000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-luma-sources luma-clip-7→luma-clip-8@28000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-blend-fade-transitions placement-reference-content-1→placement-reference-content-2@3000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-animation-speed-a→placement-pattern-control-a@5000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-pattern-control-a→placement-brightness-a@10000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-brightness-a→placement-clip-transform-a@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-clip-transform-a→placement-clip-viewport-a@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-clip-viewport-a→placement-overlay-opacity-a@25000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-property-animation placement-overlay-opacity-a→placement-effect-parameter-a@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-animation-speed-b→placement-pattern-control-b@5000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-pattern-control-b→placement-brightness-b@10000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-brightness-b→placement-clip-transform-b@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-clip-transform-b→placement-clip-viewport-b@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-clip-viewport-b→placement-overlay-opacity-b@25000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-property-animation placement-overlay-opacity-b→placement-effect-parameter-b@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-reference-aperture-shapes subject-rectangle→subject-ellipse@3000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes subject-ellipse→subject-diamond@8000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes subject-diamond→subject-rounded-box@10000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes subject-rounded-box→subject-rounded-box-wide@12000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes subject-rounded-box-wide→subject-cross@14000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes subject-cross→subject-polygon@16000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes subject-polygon→subject-ring-soft@18000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes subject-ring-soft→subject-ring-hard@22000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes subject-ring-hard→subject-ring-dither@24000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-rectangle→bed-ellipse@3000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-ellipse→bed-diamond@8000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-diamond→bed-rounded-box@10000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-rounded-box→bed-rounded-box-wide@12000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-rounded-box-wide→bed-cross@14000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-cross→bed-polygon@16000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-polygon→bed-ring-soft@18000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-ring-soft→bed-ring-hard@22000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-shapes bed-ring-hard→bed-ring-dither@24000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons subject-heart→subject-star@4000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons subject-star→subject-crescent@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons subject-crescent→subject-cloud@8000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons subject-cloud→subject-cat-head@11000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons subject-cat-head→subject-cat-side-profile@13000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons subject-cat-side-profile→subject-bastet@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons subject-bastet→subject-star-rotated@17000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons subject-star-rotated→subject-cloud-cut-out@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons bed-heart→bed-star@4000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons bed-star→bed-crescent@6000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons bed-crescent→bed-cloud@8000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons bed-cloud→bed-cat-head@11000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons bed-cat-head→bed-cat-side-profile@13000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons bed-cat-side-profile→bed-bastet@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons bed-bastet→bed-star-rotated@17000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-reference-aperture-icons bed-star-rotated→bed-cloud-cut-out@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-showcase-redline-installation ignition-center→first-lift-center@7500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-lift-center→countermotion-center@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation countermotion-center→first-drop-center@22500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-drop-center→vacuum-center@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation vacuum-center→rebuild-center@37500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation rebuild-center→compression-center@45000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation compression-center→peak-release-center@52500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-lift-target-1→countermotion-target-1@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation countermotion-target-1→first-drop-target-1@22500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-drop-target-1→vacuum-target-1@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation vacuum-target-1→rebuild-target-1@37500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation rebuild-target-1→compression-target-1@45000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation compression-target-1→peak-release-target-1@52500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-lift-target-2→countermotion-target-2@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation countermotion-target-2→first-drop-target-2@22500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-drop-target-2→vacuum-target-2@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":true,\"maxDurationMs\":750}",
  "stock-show-showcase-redline-installation rebuild-target-2→compression-target-2@45000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation compression-target-2→peak-release-target-2@52500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-lift-target-3→countermotion-target-3@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation countermotion-target-3→first-drop-target-3@22500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-drop-target-3→vacuum-target-3@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":true,\"maxDurationMs\":1500}",
  "stock-show-showcase-redline-installation rebuild-target-3→compression-target-3@45000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation compression-target-3→peak-release-target-3@52500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-lift-target-4→countermotion-target-4@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation countermotion-target-4→first-drop-target-4@22500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation first-drop-target-4→vacuum-target-4@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":true,\"maxDurationMs\":2250}",
  "stock-show-showcase-redline-installation rebuild-target-4→compression-target-4@45000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-showcase-redline-installation compression-target-4→peak-release-target-4@52500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-remix-coronal-mass-ejection placement-cell-1-scene-1→placement-cell-1-scene-2@8000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-remix-quadrille bands-first-light→bands-four-mirrors-nw@6400 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "stock-show-remix-overture stage-anticipation→stage-velvet@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":true,\"maxDurationMs\":938}",
  "stock-show-remix-overture arch-reversed→arch-steady@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-remix-overture cols-reversed→cols-hold@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "stock-show-remix-overture cols-ember→surge-colA-bolt@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":true,\"maxDurationMs\":937}",
  "personal-base placement-c1-s1→placement-c2-s2@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "personal-library-pattern placement-c1-s1→placement-c2-s2@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-animation-speed-a→placement-pattern-control-a@5000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-pattern-control-a→placement-brightness-a@10000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-brightness-a→placement-clip-transform-a@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-clip-transform-a→placement-clip-viewport-a@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-clip-viewport-a→placement-overlay-opacity-a@25000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.\"}",
  "animation placement-overlay-opacity-a→placement-effect-parameter-a@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-animation-speed-b→placement-pattern-control-b@5000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-pattern-control-b→placement-brightness-b@10000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-brightness-b→placement-clip-transform-b@15000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-clip-transform-b→placement-clip-viewport-b@20000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-clip-viewport-b→placement-overlay-opacity-b@25000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
  "animation placement-overlay-opacity-b→placement-effect-parameter-b@30000 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.\"} v2={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"}",
]

// Recorded scene-end-limit divergence: v1 sees no free time because the
// Scene ends at the last Clip, while the owner finds room up to the next
// logical obstruction in the following Scene (#1075, Jon 2026-09-22).
const RECORDED_SCENE_END_EXCEEDED: string[] = [
  "stock-show-remix-overture arch-blip→arch-redchase@22500 v1={\"enabled\":false,\"maxDurationMs\":0,\"reason\":\"There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.\"} v2={\"enabled\":true,\"maxDurationMs\":1875}",
]

describe('v2 Add-menu Transition command (#1075 G4b-2d)', () => {
  function menuFixture(
    clips: Array<{ id: string; name: string; startMs: number; durationMs: number }>,
    transitions: Array<{ id: string; fromClipId: string; toClipId: string; durationMs: number }> = [],
  ): { show: ShowRecord; composition: ShowCompositionV1 } {
    const show = createDefaultShow('show-add-transition-v2', 'Add Transition v2', 1_000)
    const scene = show.scenes[0]
    const zoneId = show.zones[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: clips.map(clip => ({
        id: `instance-${clip.id}`,
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: clip.name,
        time: { timeScale: 1, timeOffsetMs: 0 },
      })),
      transitions: transitions.map(transition => ({
        id: transition.id,
        fromPlacementId: transition.fromClipId,
        toPlacementId: transition.toClipId,
        kind: 'crossfade',
        durationMs: transition.durationMs,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      })),
      scenes: [{
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: clips.map(clip => ({
            id: clip.id,
            instanceId: `instance-${clip.id}`,
            startMs: clip.startMs,
            durationMs: clip.durationMs,
            view: { mirror: false, phase: 0, brightness: 1 },
          })),
          overlays: [],
        }],
      }],
    }
    show.composition = composition
    return { show, composition }
  }

  // Candidate order, resolution, reasons, side and names match v1. The maximum
  // comes from the rule-B owner instead, so enabled cases assert the owner's
  // invariant (accepts the offered maximum, refuses one millisecond more)
  // rather than equality with v1.
  function expectSameClipResolution(
    v2plan: ShowV2LayerTransitionClipInsertionPlan,
    v1plan: ShowLayerTransitionClipInsertionPlan,
  ): void {
    expect(v2plan.enabled).toBe(v1plan.enabled)
    if (v1plan.enabled) {
      if (!v2plan.enabled) throw new Error('v2 plan disabled while v1 is enabled')
      expect({ side: v2plan.target.side, fromName: v2plan.target.fromName, toName: v2plan.target.toName })
        .toEqual({ side: v1plan.target.side, fromName: v1plan.target.fromName, toName: v1plan.target.toName })
      return
    }
    if (v2plan.enabled) throw new Error('v2 plan enabled while v1 is disabled')
    expect(v2plan.reason).toBe(v1plan.reason)
    if (v1plan.target === null) {
      expect(v2plan.target).toBeNull()
      return
    }
    if (v2plan.target === null) throw new Error('v2 plan lost the target v1 kept')
    expect({ side: v2plan.target.side, fromName: v2plan.target.fromName, toName: v2plan.target.toName })
      .toEqual({ side: v1plan.target.side, fromName: v1plan.target.fromName, toName: v1plan.target.toName })
  }

  function expectOwnerBounds(
    record: ShowRecordV2,
    fromClipId: string,
    toClipId: string,
    maxDurationMs: number,
    label: string,
  ): void {
    const violations: string[] = []
    checkOwnerBounds(record, fromClipId, toClipId, maxDurationMs, label, violations)
    expect(violations).toEqual([])
  }

  function expectGroupOwnerBounds(record: ShowRecordV2, maxDurationMs: number): void {
    const definition = record.composition.groupDefinitions.find(candidate => candidate.id === 'group-definition')!
    const layerId = definition.clips.find(clip => clip.id === 'left')!.layerId
    const groupProbe = (durationMs: number, id: string): ShowTransitionV2 => ({
      kind: 'crossfade',
      id,
      durationMs,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      participants: [{
        id: `${id}:participant`,
        zoneId: 'definition-zone',
        layerId,
        fromClipId: 'left',
        toClipId: 'right',
      }],
      propertyRamps: [],
    })
    expect(insertShowGroupDefinitionLayerTransitionV2(record, {
      kind: 'insert-definition-layer-transition',
      definitionId: definition.id,
      transition: groupProbe(maxDurationMs, '__probe-group-accept'),
    }).status, 'Group owner accepts the maximum').toBe('changed')
    expect(insertShowGroupDefinitionLayerTransitionV2(record, {
      kind: 'insert-definition-layer-transition',
      definitionId: definition.id,
      transition: groupProbe(maxDurationMs + 1, '__probe-group-refuse'),
    }).status, 'Group owner refuses one past the maximum').toBe('refused')
  }

  it('asks for a Clip when nothing is selected, like v1', () => {
    const { show, composition } = menuFixture([{ id: 'clip-solo', name: 'Solo', startMs: 0, durationMs: 400 }])
    const v1plan = planShowLayerTransitionInsertionForClip(show, composition, null)
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'Select a Clip first.',
      target: null,
    })
    const { record } = convertedRecord(show)
    expect(planShowV2LayerTransitionInsertionForClip(record, null)).toEqual(v1plan)
  })

  it('reports a Clip touching nothing, like v1', () => {
    const { show, composition } = menuFixture([{ id: 'clip-solo', name: 'Solo', startMs: 0, durationMs: 400 }])
    const v1plan = planShowLayerTransitionInsertionForClip(show, composition, 'clip-solo')
    expect(v1plan).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'This Clip does not touch another Clip. Move it next to another Clip first.',
      target: null,
    })
    const { record, report } = convertedRecord(show)
    expect(planShowV2LayerTransitionInsertionForClip(record, clipIdOf(report, 'clip-solo'))).toEqual(v1plan)
  })

  it('prefers the trailing Cut, like v1', () => {
    const { show, composition } = menuFixture([
      { id: 'clip-left', name: 'Left', startMs: 0, durationMs: 1_000 },
      { id: 'clip-middle', name: 'Middle', startMs: 1_000, durationMs: 1_000 },
      { id: 'clip-right', name: 'Right', startMs: 2_000, durationMs: 1_000 },
      { id: 'clip-far', name: 'Far', startMs: 4_000, durationMs: 1_000 },
    ])
    const v1plan = planShowLayerTransitionInsertionForClip(show, composition, 'clip-middle')
    if (!v1plan.enabled) throw new Error('expected an enabled v1 trailing plan')
    expect({ side: v1plan.target.side, toName: v1plan.target.toName }).toEqual({ side: 'after', toName: 'Right' })
    const { record, report } = convertedRecord(show)
    const v2plan = planShowV2LayerTransitionInsertionForClip(record, clipIdOf(report, 'clip-middle'))
    expectSameClipResolution(v2plan, v1plan)
    if (!v2plan.enabled || !v2plan.target.v2Cut) throw new Error('expected an ordinary v2 Cut target')
    expect(v2plan.target.v2Cut.junctionKey).toContain(clipIdOf(report, 'clip-middle'))
    expectOwnerBounds(
      record,
      clipIdOf(report, 'clip-middle'),
      clipIdOf(report, 'clip-right'),
      v2plan.maxDurationMs,
      'add-menu trailing Cut',
    )
  })

  it('falls back to a leading-only Cut, like v1', () => {
    const { show, composition } = menuFixture([
      { id: 'clip-left', name: 'Left', startMs: 0, durationMs: 1_000 },
      { id: 'clip-middle', name: 'Middle', startMs: 1_000, durationMs: 1_000 },
      { id: 'clip-far', name: 'Far', startMs: 4_000, durationMs: 1_000 },
    ])
    const v1plan = planShowLayerTransitionInsertionForClip(show, composition, 'clip-middle')
    if (!v1plan.enabled) throw new Error('expected an enabled v1 leading plan')
    expect({ side: v1plan.target.side, fromName: v1plan.target.fromName }).toEqual({ side: 'before', fromName: 'Left' })
    const { record, report } = convertedRecord(show)
    const v2plan = planShowV2LayerTransitionInsertionForClip(record, clipIdOf(report, 'clip-middle'))
    expectSameClipResolution(v2plan, v1plan)
    if (!v2plan.enabled || !v2plan.target.v2Cut) throw new Error('expected an ordinary v2 Cut target')
    expectOwnerBounds(
      record,
      clipIdOf(report, 'clip-left'),
      clipIdOf(report, 'clip-middle'),
      v2plan.maxDurationMs,
      'add-menu leading Cut',
    )
  })

  it('takes an enabled leading Cut over a transitioned trailing junction, like v1', () => {
    const { show, composition } = menuFixture(
      [
        { id: 'clip-left', name: 'Left', startMs: 0, durationMs: 1_000 },
        { id: 'clip-middle', name: 'Middle', startMs: 1_000, durationMs: 1_000 },
        { id: 'clip-right', name: 'Right', startMs: 2_500, durationMs: 1_000 },
        { id: 'clip-far', name: 'Far', startMs: 4_500, durationMs: 1_000 },
      ],
      [{ id: 'transition-middle-right', fromClipId: 'clip-middle', toClipId: 'clip-right', durationMs: 500 }],
    )
    const v1plan = planShowLayerTransitionInsertionForClip(show, composition, 'clip-middle')
    if (!v1plan.enabled) throw new Error('expected an enabled v1 leading plan')
    expect({ side: v1plan.target.side, fromName: v1plan.target.fromName }).toEqual({ side: 'before', fromName: 'Left' })
    const { record, report } = convertedRecord(show)
    const v2plan = planShowV2LayerTransitionInsertionForClip(record, clipIdOf(report, 'clip-middle'))
    expectSameClipResolution(v2plan, v1plan)
    if (!v2plan.enabled || !v2plan.target.v2Cut) throw new Error('expected an ordinary v2 Cut target')
    expectOwnerBounds(
      record,
      clipIdOf(report, 'clip-left'),
      clipIdOf(report, 'clip-middle'),
      v2plan.maxDurationMs,
      'add-menu leading Cut over a transitioned trailing junction',
    )
  })

  it('plans a Group Clip in isolation, like v1', () => {
    const { show, composition } = groupFixture({ id: 'unrelated-overlay', startMs: 2_500, durationMs: 1_000 })
    const v1plan = planShowLayerTransitionInsertionForClip(show, composition, 'group-use-clear:left')
    if (!v1plan.enabled) throw new Error('expected an enabled v1 Group plan')
    expect(v1plan.target.groupOccurrenceId).toBe('group-use-clear')
    const { record } = convertedRecord(show)
    const v2plan = planShowV2LayerTransitionInsertionForClip(record, 'group-use-clear:left')
    expectSameClipResolution(v2plan, v1plan)
    if (!v2plan.enabled || !v2plan.target.v2GroupCut) throw new Error('expected a v2 Group Cut target')
    expect(v2plan.target.v2GroupCut).toEqual({ occurrenceId: 'group-use-clear', fromClipId: 'left', toClipId: 'right' })
    expectGroupOwnerBounds(record, v2plan.maxDurationMs)
  })
})

describe('v2 Layer Transition insert room (#1089)', () => {
  type TestClipSpec = { id: string; instanceId: string; zoneId: string; layerId: string; startMs: number; durationMs: number }
  type TestTransitionSpec = { id: string; zoneId: string; layerId: string; fromClipId: string; toClipId: string; durationMs: number }

  function testInstance(id: string) {
    return {
      id,
      pattern: { kind: 'stock' as const, id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }
  }

  function testClip(spec: TestClipSpec) {
    return {
      id: spec.id,
      instanceId: spec.instanceId,
      zoneId: spec.zoneId,
      layerId: spec.layerId,
      startMs: spec.startMs,
      durationMs: spec.durationMs,
      entryPolicy: 'continue' as const,
      zoneSampleMode: 'span' as const,
      appearance: {
        keys: [{
          id: `${spec.id}:appearance:1`,
          timeMs: spec.startMs,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }],
      },
    }
  }

  function testTransition(spec: TestTransitionSpec) {
    return {
      id: spec.id,
      kind: 'crossfade' as const,
      durationMs: spec.durationMs,
      easing: { curve: 'linear' as const },
      crossfadePolicy: 'live-live' as const,
      participants: [{
        id: `${spec.id}:participant`,
        zoneId: spec.zoneId,
        layerId: spec.layerId,
        fromClipId: spec.fromClipId,
        toClipId: spec.toClipId,
      }],
      propertyRamps: [],
    }
  }

  function testRecord(options: {
    zones: Array<{ id: string; name: string }>;
    layoutId: string;
    logical: { kind: 'single'; zoneIds: [string] } | { kind: 'split'; zoneIds: [string, string]; axis: 'x' };
    layers: Array<{ id: string; zoneId: string; rank: number }>;
    clips: TestClipSpec[];
    transitions: TestTransitionSpec[];
    showEndMs: number;
    propertyTracks?: ShowRecordV2['composition']['propertyTracks'];
    groupDefinitions?: ShowRecordV2['composition']['groupDefinitions'];
    groupOccurrences?: ShowRecordV2['composition']['groupOccurrences'];
  }): ShowRecordV2 {
    const instances: ShowRecordV2['composition']['patternInstances'] = [...new Set(options.clips.map(clip => clip.instanceId))].map(testInstance)
    const definitionInstances = (options.groupDefinitions ?? []).flatMap(definition => definition.patternInstances)
    for (const instance of definitionInstances) {
      if (!instances.some(candidate => candidate.id === instance.id)) instances.push(structuredClone(instance))
    }
    const record: ShowRecordV2 = {
      version: 2,
      id: 'test-1089',
      name: 'Test 1089',
      zones: options.zones.map(zone => ({ id: zone.id, name: zone.name, nominalPixelCount: 16 })),
      zoneLayouts: [{ id: options.layoutId, name: 'Full', zones: [], logical: options.logical }],
      outputContract: {
        version: 1,
        kind: 'portable-2d',
        referenceMapId: 'plane',
        referencePixelCount: 16,
        compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
      },
      composition: {
        version: 2,
        executionModel: 'deterministic-loop',
        showEndMs: options.showEndMs,
        sampleRemap: { repeatScale: 1 },
        patternInstances: instances,
        layers: options.layers.map(layer => ({ id: layer.id, zoneId: layer.zoneId, name: layer.id, rank: layer.rank })),
        clips: options.clips.map(testClip),
        transitions: options.transitions.map(testTransition),
        layoutOccurrences: [{
          id: 'layout-occ', layoutId: options.layoutId, startMs: 0, durationMs: options.showEndMs, parameters: {},
        }],
        propertyTracks: options.propertyTracks ?? [],
        markers: [],
        groupDefinitions: options.groupDefinitions ?? [],
        groupOccurrences: options.groupOccurrences ?? [],
      },
      updatedAt: 1,
    }
    expect(validateShowRecordV2(record), 'test fixture valid').toEqual([])
    return record
  }

  function testDefinitionClip(id: string, instanceId: string, layerId: string, startMs: number, durationMs: number) {
    return {
      id,
      instanceId,
      layerId,
      startMs,
      durationMs,
      entryPolicy: 'continue' as const,
      zoneSampleMode: 'span' as const,
      appearance: {
        keys: [{
          id: `${id}:appearance:1`,
          timeMs: startMs,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }],
      },
    }
  }

  function twoClipDefinition() {
    const layerId = 'def-layer'
    return {
      definition: {
        id: 'def',
        name: 'Phrase',
        patternInstances: [testInstance('def-instance')],
        layers: [{ id: layerId, name: 'Def', rank: 0 }],
        clips: [
          testDefinitionClip('left', 'def-instance', layerId, 0, 500),
          testDefinitionClip('right', 'def-instance', layerId, 500, 500),
        ],
        transitions: [],
        propertyTracks: [],
      },
      layerId,
    }
  }

  function probeTopLevelAccepts(record: ShowRecordV2, fromClipId: string, toClipId: string, durationMs: number): boolean {
    const from = record.composition.clips.find(clip => clip.id === fromClipId)!
    const transition: ShowTransitionV2 = {
      kind: 'crossfade',
      id: `__probe-1089-${durationMs}`,
      durationMs,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      participants: [{
        id: `__probe-1089-${durationMs}:participant`,
        zoneId: from.zoneId,
        layerId: from.layerId,
        fromClipId,
        toClipId,
      }],
      propertyRamps: [],
    }
    return editShowTransitionV2(record, { kind: 'insert', transition }).status === 'changed'
  }

  function probeGroupAccepts(
    record: ShowRecordV2,
    definitionId: string,
    definitionLayerId: string,
    fromClipId: string,
    toClipId: string,
    durationMs: number,
  ): boolean {
    const transition: ShowTransitionV2 = {
      kind: 'crossfade',
      id: `__probe-group-1089-${durationMs}`,
      durationMs,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      participants: [{
        id: `__probe-group-1089-${durationMs}:participant`,
        zoneId: 'definition-zone',
        layerId: definitionLayerId,
        fromClipId,
        toClipId,
      }],
      propertyRamps: [],
    }
    return insertShowGroupDefinitionLayerTransitionV2(record, {
      kind: 'insert-definition-layer-transition',
      definitionId,
      transition,
    }).status === 'changed'
  }

  function junctionKey1089(record: ShowRecordV2, fromClipId: string, toClipId: string): string {
    const from = record.composition.clips.find(clip => clip.id === fromClipId)!
    return showV2TransitionJunctionKey({
      atMs: from.startMs + from.durationMs,
      zoneId: from.zoneId,
      layerId: from.layerId,
      fromClipId,
      toClipId,
    })
  }

  function rl09BandRecord(): ShowRecordV2 {
    return testRecord({
      zones: [{ id: 'z1', name: 'Z1' }, { id: 'z2', name: 'Z2' }],
      layoutId: 'layout',
      logical: { kind: 'split', zoneIds: ['z1', 'z2'], axis: 'x' },
      layers: [{ id: 'z1-main', zoneId: 'z1', rank: 0 }, { id: 'z2-main', zoneId: 'z2', rank: 0 }],
      clips: [
        { id: 'a', instanceId: 'inst-a', zoneId: 'z1', layerId: 'z1-main', startMs: 0, durationMs: 1000 },
        { id: 'b', instanceId: 'inst-b', zoneId: 'z1', layerId: 'z1-main', startMs: 1000, durationMs: 1000 },
        { id: 'c', instanceId: 'inst-c', zoneId: 'z1', layerId: 'z1-main', startMs: 2200, durationMs: 1000 },
        { id: 'e', instanceId: 'inst-e', zoneId: 'z2', layerId: 'z2-main', startMs: 0, durationMs: 2300 },
        { id: 'f', instanceId: 'inst-f', zoneId: 'z2', layerId: 'z2-main', startMs: 2300, durationMs: 7700 },
      ],
      transitions: [{ id: 't-bc', zoneId: 'z1', layerId: 'z1-main', fromClipId: 'b', toClipId: 'c', durationMs: 200 }],
      showEndMs: 10000,
    })
  }

  function groupOuterRecord(withOuterClip: boolean): ShowRecordV2 {
    const { definition, layerId } = twoClipDefinition()
    const clips: TestClipSpec[] = withOuterClip
      ? [{ id: 'outer-clip', instanceId: 'inst-outer', zoneId: 'z', layerId: 'outer-main', startMs: 1300, durationMs: 500 }]
      : []
    return testRecord({
      zones: [{ id: 'z', name: 'Z' }],
      layoutId: 'layout',
      logical: { kind: 'single', zoneIds: ['z'] },
      layers: [{ id: 'outer-main', zoneId: 'z', rank: 0 }],
      clips,
      transitions: [],
      showEndMs: 10000,
      groupDefinitions: [definition],
      groupOccurrences: [{
        id: 'occ1',
        definitionId: 'def',
        layoutOccurrenceId: 'layout-occ',
        zoneId: 'z',
        startMs: 0,
        translationX: 0,
        translationY: 0,
        layerBindings: [{ definitionLayerId: layerId, layerId: 'outer-main' }],
        holds: [],
      }],
    })
  }

  function propertyTrackRecord(): ShowRecordV2 {
    return testRecord({
      zones: [{ id: 'z', name: 'Z' }],
      layoutId: 'layout',
      logical: { kind: 'single', zoneIds: ['z'] },
      layers: [{ id: 'main', zoneId: 'z', rank: 0 }],
      clips: [
        { id: 'a', instanceId: 'inst-a', zoneId: 'z', layerId: 'main', startMs: 0, durationMs: 1000 },
        { id: 'b', instanceId: 'inst-b', zoneId: 'z', layerId: 'main', startMs: 1000, durationMs: 1000 },
      ],
      transitions: [],
      showEndMs: 10000,
      propertyTracks: [{
        id: 'track-b',
        target: { kind: 'clip-opacity', clipId: 'b' },
        activeStartMs: 0,
        activeDurationMs: 1500,
        keyframes: [
          { id: 'track-b:k1', timeMs: 500, value: 1, easing: { curve: 'linear' } },
          { id: 'track-b:k2', timeMs: 1200, value: 0.5, easing: { curve: 'linear' } },
        ],
      }],
    })
  }

  function topLevelVsOccurrenceRecord(): ShowRecordV2 {
    const { definition, layerId } = twoClipDefinition()
    return testRecord({
      zones: [{ id: 'z', name: 'Z' }],
      layoutId: 'layout',
      logical: { kind: 'single', zoneIds: ['z'] },
      layers: [{ id: 'outer-main', zoneId: 'z', rank: 0 }],
      clips: [
        { id: 'a', instanceId: 'inst-a', zoneId: 'z', layerId: 'outer-main', startMs: 0, durationMs: 1000 },
        { id: 'b', instanceId: 'inst-b', zoneId: 'z', layerId: 'outer-main', startMs: 1000, durationMs: 500 },
      ],
      transitions: [],
      showEndMs: 10000,
      groupDefinitions: [definition],
      groupOccurrences: [{
        id: 'occ1',
        definitionId: 'def',
        layoutOccurrenceId: 'layout-occ',
        zoneId: 'z',
        startMs: 2000,
        translationX: 0,
        translationY: 0,
        layerBindings: [{ definitionLayerId: layerId, layerId: 'outer-main' }],
        holds: [],
      }],
    })
  }

  function simpleRoomRecord(): ShowRecordV2 {
    return testRecord({
      zones: [{ id: 'z', name: 'Z' }],
      layoutId: 'layout',
      logical: { kind: 'single', zoneIds: ['z'] },
      layers: [{ id: 'main', zoneId: 'z', rank: 0 }],
      clips: [
        { id: 'a', instanceId: 'inst-a', zoneId: 'z', layerId: 'main', startMs: 0, durationMs: 1000 },
        { id: 'b', instanceId: 'inst-b', zoneId: 'z', layerId: 'main', startMs: 1000, durationMs: 1000 },
      ],
      transitions: [],
      showEndMs: 5000,
    })
  }

  function sameLayerNextRecord(): ShowRecordV2 {
    return testRecord({
      zones: [{ id: 'z', name: 'Z' }],
      layoutId: 'layout',
      logical: { kind: 'single', zoneIds: ['z'] },
      layers: [{ id: 'main', zoneId: 'z', rank: 0 }],
      clips: [
        { id: 'a', instanceId: 'inst-a', zoneId: 'z', layerId: 'main', startMs: 0, durationMs: 1000 },
        { id: 'b', instanceId: 'inst-b', zoneId: 'z', layerId: 'main', startMs: 1000, durationMs: 1000 },
        { id: 'c', instanceId: 'inst-c', zoneId: 'z', layerId: 'main', startMs: 2500, durationMs: 500 },
      ],
      transitions: [],
      showEndMs: 10000,
    })
  }

  it('stops at the RL09 band (maximum 99)', () => {
    const record = rl09BandRecord()
    const plan = planShowV2LayerTransitionInsertion(record, junctionKey1089(record, 'a', 'b'))
    expect(plan).toEqual({ enabled: true, maxDurationMs: 99 })
    for (let durationMs = 1; durationMs <= 99; durationMs += 1) {
      expect(probeTopLevelAccepts(record, 'a', 'b', durationMs), `owner accepts ${durationMs}`).toBe(true)
    }
    expect(probeTopLevelAccepts(record, 'a', 'b', 100), 'owner refuses max + 1').toBe(false)
  })

  it('takes the Group outer room (maximum 9000)', () => {
    const record = groupOuterRecord(false)
    const plan = planShowV2GroupLayerTransitionInsertion(record, 'occ1', 'left', 'right')
    expect(plan).toEqual({ enabled: true, maxDurationMs: 9000 })
    for (let durationMs = 1; durationMs <= 9000; durationMs += 1) {
      expect(probeGroupAccepts(record, 'def', 'def-layer', 'left', 'right', durationMs), `group owner accepts ${durationMs}`).toBe(true)
    }
    expect(probeGroupAccepts(record, 'def', 'def-layer', 'left', 'right', 9001), 'group owner refuses max + 1').toBe(false)
  }, 30000)

  it('takes the Group outer obstruction (maximum 300)', () => {
    const record = groupOuterRecord(true)
    const plan = planShowV2GroupLayerTransitionInsertion(record, 'occ1', 'left', 'right')
    expect(plan).toEqual({ enabled: true, maxDurationMs: 300 })
    for (let durationMs = 1; durationMs <= 300; durationMs += 1) {
      expect(probeGroupAccepts(record, 'def', 'def-layer', 'left', 'right', durationMs), `group owner accepts ${durationMs}`).toBe(true)
    }
    expect(probeGroupAccepts(record, 'def', 'def-layer', 'left', 'right', 301), 'group owner refuses max + 1').toBe(false)
  })

  it('stops at the Property-track key (maximum 300)', () => {
    const record = propertyTrackRecord()
    const plan = planShowV2LayerTransitionInsertion(record, junctionKey1089(record, 'a', 'b'))
    expect(plan).toEqual({ enabled: true, maxDurationMs: 300 })
    for (let durationMs = 1; durationMs <= 300; durationMs += 1) {
      expect(probeTopLevelAccepts(record, 'a', 'b', durationMs), `owner accepts ${durationMs}`).toBe(true)
    }
    expect(probeTopLevelAccepts(record, 'a', 'b', 301), 'owner refuses max + 1').toBe(false)
  })

  it('stops at a Group occurrence on the same Layer (maximum 500)', () => {
    const record = topLevelVsOccurrenceRecord()
    const plan = planShowV2LayerTransitionInsertion(record, junctionKey1089(record, 'a', 'b'))
    expect(plan).toEqual({ enabled: true, maxDurationMs: 500 })
    for (let durationMs = 1; durationMs <= 500; durationMs += 1) {
      expect(probeTopLevelAccepts(record, 'a', 'b', durationMs), `owner accepts ${durationMs}`).toBe(true)
    }
    expect(probeTopLevelAccepts(record, 'a', 'b', 501), 'owner refuses max + 1').toBe(false)
  })

  it('sweeps every offered duration across small fixtures', () => {
    const topLevelFixtures: Array<{ label: string; record: ShowRecordV2; fromClipId: string; toClipId: string }> = [
      { label: 'rl09-band', record: rl09BandRecord(), fromClipId: 'a', toClipId: 'b' },
      { label: 'property-key', record: propertyTrackRecord(), fromClipId: 'a', toClipId: 'b' },
      { label: 'top-level-vs-occurrence', record: topLevelVsOccurrenceRecord(), fromClipId: 'a', toClipId: 'b' },
      { label: 'simple-room', record: simpleRoomRecord(), fromClipId: 'a', toClipId: 'b' },
      { label: 'same-layer-next', record: sameLayerNextRecord(), fromClipId: 'a', toClipId: 'b' },
    ]
    for (const fixture of topLevelFixtures) {
      const plan = planShowV2LayerTransitionInsertion(fixture.record, junctionKey1089(fixture.record, fixture.fromClipId, fixture.toClipId))
      expect(plan.enabled, `${fixture.label} enabled`).toBe(true)
      if (!plan.enabled) continue
      const showEndMs = fixture.record.composition.showEndMs
      for (let durationMs = 1; durationMs <= showEndMs; durationMs += 1) {
        if (durationMs > plan.maxDurationMs) continue
        expect(
          probeTopLevelAccepts(fixture.record, fixture.fromClipId, fixture.toClipId, durationMs),
          `${fixture.label} owner accepts ${durationMs} <= max ${plan.maxDurationMs}`,
        ).toBe(true)
      }
    }
    const groupFixtures: Array<{ label: string; record: ShowRecordV2 }> = [
      { label: 'group-outer-room', record: groupOuterRecord(false) },
      { label: 'group-outer-obstruction', record: groupOuterRecord(true) },
    ]
    for (const fixture of groupFixtures) {
      const plan = planShowV2GroupLayerTransitionInsertion(fixture.record, 'occ1', 'left', 'right')
      expect(plan.enabled, `${fixture.label} enabled`).toBe(true)
      if (!plan.enabled) continue
      const showEndMs = fixture.record.composition.showEndMs
      for (let durationMs = 1; durationMs <= showEndMs; durationMs += 1) {
        if (durationMs > plan.maxDurationMs) continue
        expect(
          probeGroupAccepts(fixture.record, 'def', 'def-layer', 'left', 'right', durationMs),
          `${fixture.label} group owner accepts ${durationMs} <= max ${plan.maxDurationMs}`,
        ).toBe(true)
      }
    }
  }, 60000)
})

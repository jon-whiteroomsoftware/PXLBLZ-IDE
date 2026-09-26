import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import type { ShowRecord } from '../engine/personalContentRecords'
import { personalBaseShow } from '../agent-harness/baseline/fixtures'
import { stockPatternSource } from '../agent-harness/shows/stockCatalogue'
import { projectFlatShowToCompositionV1, replaceShowPatternInstance } from '../engine/showCompositionModel'
import { appendShowLayoutInterval, duplicateShowLayoutInterval, insertShowLayoutInterval, projectShowLayoutIntervals } from '../engine/showLayoutIntervals'
import { buildShowCompositionFreezeCases } from '../engine/showCompositionFreeze'
import { showBoundaryClipIdentity } from '../engine/showClipIdentity'
import { projectShowTimelineViewModel, showTimelineSelectionKey } from '../engine/showTimelineViewModel'
import { projectShowTimelineV2 } from '../engine/showTimelineViewModelV2'
import { showV2LayoutEditorFixture } from './showV2LayoutEditorFixture'
import { buildShowV2LayoutEditorModel } from '../engine/showV2LayoutEditorModel'
import { showV2ViewModelCorpus } from './showV2ViewModelCorpus'
import { V1_STOCK_SHOWS } from './v1StockShowsFixture'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { createDefaultShow, createShowWithOutputContract, addShowRoutingLayout, addShowZone, extendShowCell, projectShowTimeline, splitShowAtTime } from '../engine/showModel'
import { createInstallationShowOutputContract } from '../engine/showOutputContract'
import { frozenV1Output } from './v1AuthoringOracles'
import { convertibleV1Show, transitionV1Show } from './showV2TracerFixture'
import { resizeBoundaryShow } from '../agent-harness/baseline/fixtures'
import { applyShowGroupPropertyAnimationChange, type ShowPropertyAnimationChange } from '../engine/showPropertyAnimationEditorModel'
import { addShowPropertyTrack } from '../engine/showPropertyAnimation'
import { completeShowGroupSelection, createShowGroupFromSelection, duplicateShowGroupOccurrence, insertShowGroupLayerTransition, resizeShowGroupLayerTransition, validateShowGroupSelection } from '../engine/showGroupModel'
import type { ShowCompositionV1 } from '../engine/personalContentRecords'

type LiveThunk = () => unknown
const live = new Map<string, LiveThunk>()
function add(key: string, thunk: LiveThunk): void {
  if (live.has(key)) throw new Error(`Duplicate live v1 oracle key: ${key}`)
  // v1 editors stamp updatedAt; the timestamp is immaterial to these parity cases.
  live.set(key, () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1))
    try {
      return thunk()
    } finally {
      vi.useRealTimers()
    }
  })
}

function stockLookup(show: ShowRecord) {
  return {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
    stageDimension: 1 as const,
  }
}

const boundarySource = () => createDefaultShow('boundary-repair', 'Boundary repair', 1)
const manifest = JSON.parse(readFileSync('e2e/fixtures/showEditorEquivalence.json', 'utf8')) as {
  corpus: Array<{ key: string; source: ShowRecord }>
}
function manifestSource(key: string): ShowRecord {
  const entry = manifest.corpus.find(candidate => candidate.key === key)
  if (!entry) throw new Error(`Missing editor corpus case ${key}`)
  return structuredClone(entry.source)
}

for (const entry of showV2ViewModelCorpus()) {
  add(`showTimelineViewModelParity.test.ts::corpus::${entry.corpus}:${entry.corpusId}`,
    () => projectShowTimelineViewModel(entry.show, entry.editorComposition))
  if (!entry.show.composition) {
    add(`showV2LayerTransitionInsertion.test.ts::flat projection::${entry.corpus}:${entry.corpusId}`,
      () => projectFlatShowToCompositionV1(entry.show, entry.lookup))
  }
}

add('showAuthoringValidation.test.ts::openGrammarFixture::1', () => {
  const show = personalBaseShow('authoring-fixture')
  return projectFlatShowToCompositionV1(show, {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, stockPatternSource(cell.pattern.id)!])),
    stageDimension: 2,
  })
})

add('showConvertedBoundaryRepairV2.test.ts::sceneTrackSource::1', () => {
  const source = boundarySource()
  return projectFlatShowToCompositionV1(source, stockLookup(source))
})
add('showConvertedBoundaryRepairV2.test.ts::track source::1', () => {
  const show = boundarySource()
  show.scenes[0].sampleTargets = { repeatScale: 1 }
  show.scenes[1].sampleTargets = { repeatScale: 2 }
  return projectFlatShowToCompositionV1(show, stockLookup(show))
})
add('showConvertedBoundaryRepairV2.test.ts::outgoingTrackSource::1', () => {
  const source = boundarySource()
  return projectFlatShowToCompositionV1(source, stockLookup(source))
})
add('showConvertedBoundaryRepairV2.test.ts::duplicate empty layout::1', () => {
  const source = boundarySource()
  return duplicateShowLayoutInterval(source, projectShowLayoutIntervals(source)[0].id, { withContent: false })
})

add('showDeterministicLoop.test.ts::permanent reassignment::1', () => {
  const item = V1_STOCK_SHOWS.find(entry => (
    entry.show.composition?.executionModel === 'deterministic-loop'
    && entry.patternSlots?.some(group => group.instanceIds.length > 0)
  ))!
  const instanceId = item.patternSlots!.find(group => group.instanceIds.length > 0)!.instanceIds[0]
  return replaceShowPatternInstance(item.show.composition!, instanceId, {
    pattern: { kind: 'stock', id: 'IceFloes2D' }, patternName: 'IceFloes2D',
  })
})

add('showModel.test.ts::Continue Restart compile::1',
  () => splitShowAtTime(createDefaultShow('show-1', 'Split Show', 1), 10_000))
add('showPreviewArtifact.test.ts::Continue Restart preview::1',
  () => splitShowAtTime(createDefaultShow('show-1', 'Split preview'), 10_000))
add('showCompositionProjection.test.ts::Continue Restart projection::1',
  () => splitShowAtTime(extendShowCell(createDefaultShow('projection-continuity', 'Continuity', 1), 'cell-1', 2), 10_000))
add('showCompositionLoweringV2MultiZoneTransition.test.ts::second Zone split::1',
  () => splitShowAtTime(addShowZone(createShowWithOutputContract('fresh', 'Fresh Show',
    createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 }), 1)), 20_000))

add('showCompositionFreeze.ts::cases::1', () => buildShowCompositionFreezeCases())

for (const entry of manifest.corpus) {
  add(`showEditorPresentationEquivalence.test.ts::timeline::${entry.key}`,
    () => projectShowTimelineViewModel(entry.source))
}
add('showEditorPresentationEquivalence.test.ts::authored Markers::1', () => {
  const source = manifestSource('installation-layouts')
  const scene = projectShowTimeline(source).scenes[1]!
  source.composition!.markers = [
    { id: 'authored-scene-label', timeMs: scene.startMs, name: scene.scene.name, color: '#f43f5e' },
    { id: 'authored-cue', timeMs: scene.startMs + 500, name: 'Cue', color: '#22d3ee' },
  ]
  return projectShowTimelineViewModel(source)
})

add('showV2EditorTransitionLayoutProof.test.ts::lane selections::1', () => {
  const record = showV2LayoutEditorFixture().record
  const lane = buildShowV2LayoutEditorModel(record)
  return lane.occurrences.map(value => showTimelineSelectionKey({ kind: 'layout-occurrence', occurrenceId: value.id }))
})
add('showV2EditorTransitionLayoutProof.test.ts::interval selections::1', () => {
  const record = showV2LayoutEditorFixture().record
  return projectShowTimelineV2(record).layoutIntervals.map(interval => showTimelineSelectionKey(interval.selection))
})

add('showEditorInspectorPresentation.test.ts::routing transfer::1', () => {
  const source = manifestSource('installation-layouts')
  const routing = source.transitions?.find(candidate => candidate.kind === 'routing' && candidate.durationMs > 0)
  if (!routing) throw new Error('Missing Installation routing transfer')
  return showBoundaryClipIdentity(source, routing.afterSceneId)
})
add('showEditorInspectorPresentation.test.ts::boundary::1',
  () => showBoundaryClipIdentity(manifestSource('fresh'), 'scene-1'))
add('ShowEditorV2Tracer.test.tsx::fresh boundary::1',
  () => showBoundaryClipIdentity(manifestSource('fresh'), 'scene-1'))
add('ShowEditorV2Tracer.test.tsx::advanced boundary::1', () => {
  const source = manifestSource('fresh')
  source.scenes[0].sampleTargets = { repeatScale: 1 }
  source.scenes[1].sampleTargets = { repeatScale: 2 }
  source.cells[0] = {
    ...source.cells[0], pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom',
    transform: { positionX: 0.25, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    controlTargets: { sliderSpeed: 0.2 },
  }
  source.cells[1] = {
    ...source.cells[1], adaptations: { ...source.cells[1].adaptations, brightness: 0.5 },
    transform: { positionX: -0.5, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    controlTargets: { sliderSpeed: 0.2 },
  }
  return showBoundaryClipIdentity(source, 'scene-1')
})
add('ShowEditorV2Tracer.test.tsx::whole output boundary::1', () => {
  const source = manifestSource('fresh')
  source.scenes = [
    { id: 'scene-1', name: 'Scene 1', durationMs: 30_000, sampleTargets: { repeatScale: 1 } },
    { id: 'scene-2', name: 'Scene 2', durationMs: 30_000, sampleTargets: { repeatScale: 2 } },
    { id: 'scene-3', name: 'Scene 3', durationMs: 30_000, sampleTargets: { repeatScale: 3 } },
  ]
  source.cells = [
    { ...source.cells[0], sceneId: 'scene-1', sceneSpan: 2 },
    { ...source.cells[1], sceneId: 'scene-3', sceneSpan: 1 },
  ]
  source.transitions = [{
    id: 'transition-scene-2', afterSceneId: 'scene-2', kind: 'crossfade',
    durationMs: 2_000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  return showBoundaryClipIdentity(source, 'scene-2')
})

// Retiring v1 edit owners: construct the same inputs as their v2 parity consumers.
function groupBefore(withTrack = false): ShowRecord {
  const source = convertibleV1Show()
  source.scenes[0].durationMs = 30000
  source.composition!.durationMs = 30000
  source.composition!.scenes[0].zones[0].overlays = [{ id: 'ov1', name: 'ov', placements: [] }]
  const inst = { ...structuredClone(source.composition!.patternInstances[0]), id: 'g-inst' }
  source.composition!.groupDefinitions = [{
    id: 'def-1', name: 'D', patternInstances: [inst],
    placements: [
      { id: 'g-a', instanceId: 'g-inst', layerOffset: 0, startMs: 0, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
      { id: 'g-b', instanceId: 'g-inst', layerOffset: 0, startMs: 4000, durationMs: 3000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
    ],
    ...(withTrack ? { propertyTracks: [{
      id: 'trk', target: { kind: 'placement-opacity', placementId: 'g-b' },
      keyframes: [
        { id: 'k1', timeMs: 4000, value: 0.2, easing: { curve: 'linear' } },
        { id: 'k2', timeMs: 4500, value: 0.8, easing: { curve: 'linear' } },
      ],
    }] } : {}),
  }]
  source.composition!.groupOccurrences = [
    { id: 'occ-1', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 0, baseLayer: 1, translationX: 0, translationY: 0 },
    { id: 'occ-2', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 10000, baseLayer: 1, translationX: 0, translationY: 0 },
  ]
  return source
}

function groupPropertyChange(change: ShowPropertyAnimationChange, withTrack: boolean): ShowCompositionV1 {
  const show = groupBefore(withTrack)
  let count = 0
  return applyShowGroupPropertyAnimationChange(show, show.composition!,
    { kind: 'group', definitionId: 'def-1', occurrenceId: 'occ-1' }, structuredClone(change), () => `new-${++count}`)
}
const groupPropertyCases: Array<[string, ShowPropertyAnimationChange, boolean]> = [
  ['add-track', { kind: 'add-track', target: { kind: 'placement-opacity', placementId: 'g-b' }, initialValue: 1, keyframes: [
    { timeMs: 4000, value: 0.2, easing: { curve: 'linear' } }, { timeMs: 4500, value: 0.8, easing: { curve: 'linear' } },
  ] }, false],
  ['add-keyframe', { kind: 'add-keyframe', trackId: 'trk', keyframe: { timeMs: 4250, value: 0.5, easing: { curve: 'linear' } } }, true],
  ['timeMs', { kind: 'update-keyframe', trackId: 'trk', keyframeId: 'k2', changes: { timeMs: 4600 } }, true],
  ['value', { kind: 'update-keyframe', trackId: 'trk', keyframeId: 'k2', changes: { value: 0.9 } }, true],
  ['easing', { kind: 'update-keyframe', trackId: 'trk', keyframeId: 'k2', changes: { easing: { curve: 'quadratic', direction: 'in-out' } } }, true],
  ['delete-keyframe', { kind: 'delete-keyframe', trackId: 'trk', keyframeId: 'k1' }, true],
  ['delete-track', { kind: 'delete-track', trackId: 'trk' }, true],
]
for (const [caseName, change, withTrack] of groupPropertyCases) {
  add(`showV2GroupPropertyAnimationPlanning.test.ts::checkGroupOracle-${caseName}::1`, () => groupPropertyChange(change, withTrack))
}

const layerTransition = { id: 'lt-1', fromPlacementId: 'g-a', toPlacementId: 'g-b', kind: 'crossfade' as const,
  durationMs: 1000, easing: { curve: 'linear' as const }, crossfadePolicy: 'live-live' as const }
function insertGroupTransition(show: ShowRecord): ShowCompositionV1 {
  return insertShowGroupLayerTransition({ scenes: show.scenes, zones: show.zones }, structuredClone(show.composition!),
    { occurrenceId: 'occ-1', transition: layerTransition })
}
function resizeGroupTransition(show: ShowRecord, durationMs: number): ShowCompositionV1 {
  return resizeShowGroupLayerTransition({ scenes: show.scenes, zones: show.zones },
    structuredClone(insertGroupTransition(show)), { occurrenceId: 'occ-1', transitionId: 'lt-1', durationMs })
}
add('showGroupEditsV2.test.ts::g4a insert track::1', () => insertGroupTransition(groupBefore(true)))
add('showGroupEditsV2.test.ts::g4a resize track 2500::1', () => resizeGroupTransition(groupBefore(true), 2500))
add('showGroupEditsV2.test.ts::g4a resize track 0::1', () => resizeGroupTransition(groupBefore(true), 0))
add('showGroupEditsV2.test.ts::g4a insert no-track::1', () => insertGroupTransition(groupBefore()))
function modifiedTrackGroup(): ShowRecord {
  const show = groupBefore(true)
  const keys = show.composition!.groupDefinitions![0].propertyTracks![0].keyframes
  keys[0].timeMs = 4000
  keys[1].timeMs = 6900
  return show
}
add('showGroupEditsV2.test.ts::g4a insert modified-track::1', () => insertGroupTransition(modifiedTrackGroup()))
add('showGroupEditsV2.test.ts::g4a resize modified-track 0::1', () => resizeGroupTransition(modifiedTrackGroup(), 0))
add('showV2GroupOccurrenceEditorModel.test.ts::g4b2c insert::1', () => insertGroupTransition(groupBefore()))

function groupedFixture(id: string): ShowRecord {
  const show = resizeBoundaryShow(id)
  const view = { mirror: false, phase: 0, brightness: 1 }
  show.composition!.patternInstances.push({ id: 'instance-overlay', pattern: { kind: 'stock', id: 'CometLoom' },
    patternName: 'Overlay pulse', time: { timeScale: 1, timeOffsetMs: 0 } })
  const zone = show.composition!.scenes[0].zones[0]
  zone.main = [{ id: 'clip-main', instanceId: 'resize-instance', startMs: 0, durationMs: 5_000, view }]
  zone.overlays = [{ id: 'overlay-1', name: 'Overlay 1', placements: [
    { id: 'clip-overlay', instanceId: 'instance-overlay', startMs: 0, durationMs: 5_000, opacity: 1, view },
  ] }]
  const selection = completeShowGroupSelection(show.composition!, ['clip-main', 'clip-overlay'])
  const plan = validateShowGroupSelection(show.composition!, selection)
  if (!plan.enabled) throw new Error('selection not enabled')
  const created = createShowGroupFromSelection(show.composition!, { selection, definitionId: 'def-1', occurrenceId: 'occ-1', name: 'Group' })
  const composition = duplicateShowGroupOccurrence(created, { occurrenceId: 'occ-1', newOccurrenceId: 'occ-2', startMs: 5_000 })
  return { ...show, composition }
}
add('showGroupEditsV2.test.ts::q6GroupedBefore::1', () => groupedFixture('g2dur-oracle'))
add('showV2GroupOccurrenceEditorModel.test.ts::g2bGroupedBefore::1', () => groupedFixture('g2b-oracle'))

function singleScenePropertyShow(): ShowRecord {
  const show = convertibleV1Show()
  show.composition!.patternInstances[0].controlTargets = { gain: 0.5 }
  return show
}
function twoScenePropertyShow(): ShowRecord {
  const show = transitionV1Show('crossfade')
  const composition = show.composition!
  const [out, incoming] = composition.scenes[0].zones[0].main
  show.scenes = [
    { id: 'scene-a', name: 'Outgoing', durationMs: 3000 },
    { id: 'scene-b', name: 'Incoming', durationMs: 3000 },
  ]
  composition.scenes = [
    { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: [{ ...out, startMs: 0, durationMs: 3000 }], overlays: [] }] },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [{ ...incoming, startMs: 0, durationMs: 3000 }], overlays: [] }] },
  ]
  const { fromPlacementId: _from, toPlacementId: _to, ...settings } = composition.transitions![0]
  show.transitions = [{ ...settings, afterSceneId: 'scene-a', durationMs: 1000 }]
  composition.durationMs = 7000
  delete composition.transitions
  composition.patternInstances.find(instance => instance.id === 'in-instance')!.controlTargets = { gain: 0.5 }
  return show
}
function propertyTrackOracle(show: ShowRecord, sceneId: string,
  target: Parameters<typeof addShowPropertyTrack>[3]['target'], durationMs: number, value: number): ShowCompositionV1 {
  return addShowPropertyTrack(show, show.composition!, sceneId, { id: 'v1-track', target, keyframes: [
    { id: 'v1-k1', timeMs: 0, value, easing: { curve: 'linear' } },
    { id: 'v1-k2', timeMs: durationMs, value, easing: { curve: 'linear' } },
  ] })
}
add('showV2PropertyAnimationPlanning.test.ts::checkOracle-scene-a-placement-view::1', () =>
  propertyTrackOracle(singleScenePropertyShow(), 'scene-a', { kind: 'placement-view', placementId: 'clip', property: 'brightness' }, 1000, 1))
add('showV2PropertyAnimationPlanning.test.ts::checkOracle-scene-a-instance-control::1', () =>
  propertyTrackOracle(singleScenePropertyShow(), 'scene-a', { kind: 'instance-control', instanceId: 'instance', exportName: 'gain' }, 1000, 0.5))
add('showV2PropertyAnimationPlanning.test.ts::checkOracle-scene-b-placement-view::1', () =>
  propertyTrackOracle(twoScenePropertyShow(), 'scene-b', { kind: 'placement-view', placementId: 'in', property: 'brightness' }, 3000, 1))
add('showV2PropertyAnimationPlanning.test.ts::checkOracle-scene-b-instance-control::1', () =>
  propertyTrackOracle(twoScenePropertyShow(), 'scene-b', { kind: 'instance-control', instanceId: 'in-instance', exportName: 'gain' }, 3000, 0.5))

function duplicateLayoutBase(): ShowRecord {
  const show = createDefaultShow('show-layout-duplicate-timing', 'Layout duplicate timing', 1)
  const sourceCell = show.cells[0]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [{ id: 'instance-1', pattern: { ...sourceCell.pattern }, patternName: sourceCell.patternName,
      time: { timeScale: 1, timeOffsetMs: 0 } }],
    scenes: [{ sceneId: show.scenes[0].id, zones: [{ zoneId: show.zones[0].id, main: [{
      id: 'placement-1', instanceId: 'instance-1', startMs: 0, durationMs: show.scenes[0].durationMs,
      view: { brightness: 1, phase: 0, mirror: false },
    }], overlays: [] }] }],
  }
  return { ...show, scenes: [{ ...show.scenes[0], durationMs: 30_000 }],
    cells: [{ ...sourceCell, sceneId: show.scenes[0].id, sceneSpan: 1 }], transitions: [], composition }
}
add('showV2LayoutEditorModel.test.ts::twoSceneDuplicateV1Show::1', () =>
  appendShowLayoutInterval(duplicateLayoutBase(), { durationMs: 5_000, layoutId: 'layout-1' }))
for (const withContent of [false, true]) {
  add(`showV2LayoutEditorModel.test.ts::duplicate withContent=${withContent}::1`, () => {
    const base = appendShowLayoutInterval(duplicateLayoutBase(), { durationMs: 5_000, layoutId: 'layout-1' })
    return duplicateShowLayoutInterval(base, projectShowLayoutIntervals(base)[0].id, { withContent })
  })
}
for (const sourceLayoutId of [undefined, 'layout-1']) {
  add(`showV2LayoutEditorModel.test.ts::appendOracle-${sourceLayoutId ?? 'default'}::1`, () => {
    vi.setSystemTime(new Date(1_750_000_000_000))
    const base = createDefaultShow('show-append-oracle', 'Append oracle', 1_750_000_000_000)
    const withLayout = addShowRoutingLayout(base, undefined, sourceLayoutId)
    const layoutId = withLayout.routingLayouts[withLayout.routingLayouts.length - 1].id
    return appendShowLayoutInterval(withLayout, { layoutId, durationMs: 5000 })
  })
}

function insertLayoutBase(withSplit: boolean): ShowRecord {
  const show = createDefaultShow('research', 'Research', 1)
  show.scenes = [{ ...show.scenes[0], durationMs: 10000 }, { ...show.scenes[1], durationMs: 10000 }]
  show.composition = {
    version: 1,
    patternInstances: [{ id: 'instance-1', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 } }],
    scenes: [
      { sceneId: 'scene-1', zones: [{ zoneId: 'zone-1', main: [{ id: 'clip-a', instanceId: 'instance-1', startMs: 0,
        durationMs: 10000, view: { brightness: 1, phase: 0, mirror: false } }], overlays: [] }] },
      { sceneId: 'scene-2', zones: [{ zoneId: 'zone-1', main: [{ id: 'clip-b', instanceId: 'instance-1', startMs: 0,
        durationMs: 10000, view: { brightness: 1, phase: 0, mirror: false } }], overlays: [] }] },
    ],
    markers: [{ id: 'm-early', timeMs: 1000, name: 'Early' },
      { id: 'm-late', timeMs: 15000, name: 'Late', color: '#f59e0b' }],
  }
  if (withSplit) show.scenes[0].routingTargets = { splitPosition: 0.3 }
  return show
}
for (const [atMs, withSplit] of [[3000, true], [15000, false]] as const) {
  add(`showLayoutIntervalInsertV2.test.ts::insert-${atMs}::1`, () => {
    const withCopy = addShowRoutingLayout(insertLayoutBase(withSplit), undefined, 'layout-1')
    return insertShowLayoutInterval(withCopy, { layoutId: withCopy.routingLayouts[1].id, durationMs: 5000, atMs })
  })
}
add('ShowEditor.test.tsx::repeated routing interval controls::1', () => {
  const base = addShowRoutingLayout(createDefaultShow('show-routing-interval-identities', 'Routing interval identities', 1000), 'Alternate')
  const once = appendShowLayoutInterval(base, { layoutId: base.routingLayouts[1].id, durationMs: 4_000 })
  return appendShowLayoutInterval(once, { layoutId: base.routingLayouts[1].id, durationMs: 5_000 })
})

const fixturePath = 'src/test/fixtures/v1CompositionOracles.json.gz'
const provenance = {
  source: 'src/engine/showCompositionModel.ts, showLayoutIntervals.ts, showModel.ts, showCompositionFreeze.ts, showTimelineViewModel.ts, showClipIdentity.ts, showGroupModel.ts, showPropertyAnimation.ts, showPropertyAnimationEditorModel.ts',
  commit: 'c0a608ed',
  issue: '#1042',
  note: 'Return values frozen before deletion in #1042 4-5c2.',
}

describe('v1 composition oracle freshness (#1042 4-5c1a)', () => {
  it('keeps every frozen entry equal to its live v1 export', () => {
    const entries = Object.fromEntries([...live].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, thunk]) => [key, thunk()]))
    if (process.env.GENERATE_V1_COMPOSITION_ORACLES === '1') {
      writeFileSync(fixturePath, gzipSync(Buffer.from(`${JSON.stringify({ provenance, entries }, null, 2)}\n`), { level: 9 }))
    }
    const frozen = (JSON.parse(gunzipSync(readFileSync(fixturePath)).toString('utf8')) as { entries: Record<string, unknown> }).entries
    expect(Object.keys(frozen).sort()).toEqual([...live.keys()].sort())
    for (const [key, thunk] of live) {
      expect(frozenV1Output(key), key).toEqual(thunk())
    }
  })
})

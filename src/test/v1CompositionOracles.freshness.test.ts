import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import type { ShowRecord } from '../engine/personalContentRecords'
import { personalBaseShow } from '../agent-harness/baseline/fixtures'
import { stockPatternSource } from '../agent-harness/shows/stockCatalogue'
import { projectFlatShowToCompositionV1, replaceShowPatternInstance } from '../engine/showCompositionModel'
import { duplicateShowLayoutInterval, projectShowLayoutIntervals } from '../engine/showLayoutIntervals'
import { buildShowCompositionFreezeCases } from '../engine/showCompositionFreeze'
import { showBoundaryClipIdentity } from '../engine/showClipIdentity'
import { projectShowTimelineViewModel, showTimelineSelectionKey } from '../engine/showTimelineViewModel'
import { projectShowTimelineV2 } from '../engine/showTimelineViewModelV2'
import { showV2LayoutEditorFixture } from './showV2LayoutEditorFixture'
import { buildShowV2LayoutEditorModel } from '../engine/showV2LayoutEditorModel'
import { showV2ViewModelCorpus } from './showV2ViewModelCorpus'
import { V1_STOCK_SHOWS } from './v1StockShowsFixture'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { createDefaultShow, createShowWithOutputContract, addShowZone, extendShowCell, projectShowTimeline, splitShowAtTime } from '../engine/showModel'
import { createInstallationShowOutputContract } from '../engine/showOutputContract'
import { frozenV1Output } from './v1AuthoringOracles'

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

const fixturePath = 'src/test/fixtures/v1CompositionOracles.json.gz'
const provenance = {
  source: 'src/engine/showCompositionModel.ts, showLayoutIntervals.ts, showModel.ts, showCompositionFreeze.ts, showTimelineViewModel.ts, showClipIdentity.ts',
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

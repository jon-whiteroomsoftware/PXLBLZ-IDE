// Exact scene-lifetime coordinate-field cache regression for issue #528.
// Run with: npm run issue528

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { nativeDimension } from '../../src/engine/loadPattern'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { compileShowForPreview } from '../../src/engine/showPreviewArtifact'
import { SOURCE_STOCK_MAPS } from '../../src/pixelblaze/stock/maps/stockCatalogue'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'

export const ISSUE528_PIXEL_COUNT = 2_000
const redline = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')
if (!redline) throw new Error('Redline Installation fixture is missing.')
const redlineMap = SOURCE_STOCK_MAPS.find((candidate) => candidate.id === 'redline-stage-2d')
if (!redlineMap) throw new Error('Redline Stage map is missing.')

const compileRedline = (coordinateFieldCaching: boolean) => {
  const compiled = compileShowForPreview(
    redline.show,
    [],
    installationPhysicalZones(redline.show),
    {},
    {
      stageDimension: 2,
      coordinateFieldCaching,
    },
  )
  if (!compiled.artifact) throw new Error(compiled.error ?? 'Redline Show did not compile.')
  return compiled.artifact
}

export const selectedArtifact = compileRedline(true)
export const counterfactualArtifact = compileRedline(false)

const genericZones = Array.from({ length: 5 }, (_, index) => ({
  id: `generic-zone-${index}`,
  name: `generic-surface-${index}`,
  ranges: [{ start: index * 400, end: (index + 1) * 400 - 1 }],
}))
const genericPlacements = genericZones.map((zone, index) => ({
  placementId: `generic-placement-${index}`,
  zoneName: zone.name,
  clipId: 'generic-pattern',
  mirror: index % 2 === 1,
  effects: [
    { id: 'rotate', kind: 'rotate' as const, turns: index / 20 },
    { id: 'scale', kind: 'scale' as const, x: 0.82 + index * 0.02, y: 0.9 },
    { id: 'wrap', kind: 'wrap' as const },
  ],
}))
export const genericRecipe: ShowRecipe = {
  masterPixelCount: ISSUE528_PIXEL_COUNT,
  clips: [{
    id: 'generic-pattern',
    source: `
export function render2D(index, x, y) {
  var pulse = wave(time(0.035) + x * 2 - y)
  rgb(pulse * x, pulse * y, 0.1 + pulse * 0.4)
}
`,
    effects: [
      { id: 'rotate', kind: 'rotate', turns: 0 },
      { id: 'scale', kind: 'scale', x: 1, y: 1 },
      { id: 'wrap', kind: 'wrap' },
    ],
  }],
  zones: genericZones,
  routingLayouts: [{ id: 'generic-stage', name: 'Generic five-surface stage', zones: genericZones }],
  routedSceneSequence: {
    scenes: [
      { holdMs: 30_000, placements: genericPlacements, transitionOut: { kind: 'cut', durationMs: 0 } },
      { holdMs: 30_000, placements: genericPlacements },
    ],
  },
  loopDurationMs: 60_000,
}
const genericSelected = compileShow(genericRecipe, {}, { coordinateFieldCaching: true })
const genericCounterfactual = compileShow(genericRecipe, {}, { coordinateFieldCaching: false })
const genericMap = Array.from({ length: ISSUE528_PIXEL_COUNT }, (_, index) => (
  [(index % 50) / 49, Math.floor(index / 50) / 39]
))

const scoreTimesMs = [50, 100, 1_000, 7_499, 7_550, 15_050, 30_050, 59_950]

function runtime(artifact: GeneratedShowArtifact, mapPoints: number[][], fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, {
    mapPoints,
    randomSeed: 528,
    fidelity,
  })
}

function checksums(
  artifact: GeneratedShowArtifact,
  mapPoints: number[][],
  fidelity: 'fast' | 'fidelity',
  times: number[],
) {
  const replay = runtime(artifact, mapPoints, fidelity)
  return times.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

function meanFrameMs(artifact: GeneratedShowArtifact, mapPoints: number[][], fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, mapPoints, fidelity)
  replay.advanceTo(10_000, { stepMs: 50 })
  const samples: number[] = []
  for (let index = 0; index < 24; index += 1) {
    const started = performance.now()
    replay.advanceLive(1000 / 60)
    samples.push(performance.now() - started)
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

function fixtureReport(
  name: string,
  selected: GeneratedShowArtifact,
  counterfactual: GeneratedShowArtifact,
  mapPoints: number[][],
  times: number[],
) {
  const equivalence = (['fast', 'fidelity'] as const).map((fidelity) => {
    const selectedChecksums = checksums(selected, mapPoints, fidelity, times)
    const counterfactualChecksums = checksums(counterfactual, mapPoints, fidelity, times)
    return {
      fidelity,
      selected: selectedChecksums,
      counterfactual: counterfactualChecksums,
      matches: selectedChecksums.every((checksum, index) => checksum === counterfactualChecksums[index]),
    }
  })
  return {
    fixture: name,
    selected: {
      sourceBytes: selected.summary.artifactBytes,
      expandedSourceBytes: selected.summary.expandedArtifactBytes,
      coordinateFields: selected.summary.specializations.coordinateFields,
      renderTargetPlan: selected.summary.renderTargetPlan,
      resources: selected.summary.resources,
      fastMeanFrameMs: meanFrameMs(selected, mapPoints, 'fast'),
      preciseMeanFrameMs: meanFrameMs(selected, mapPoints, 'fidelity'),
    },
    counterfactual: {
      sourceBytes: counterfactual.summary.artifactBytes,
      expandedSourceBytes: counterfactual.summary.expandedArtifactBytes,
      coordinateFields: counterfactual.summary.specializations.coordinateFields,
      resources: counterfactual.summary.resources,
      fastMeanFrameMs: meanFrameMs(counterfactual, mapPoints, 'fast'),
      preciseMeanFrameMs: meanFrameMs(counterfactual, mapPoints, 'fidelity'),
    },
    equivalence,
  }
}

export const report = {
  pixelCount: ISSUE528_PIXEL_COUNT,
  scoreTimesMs,
  redline: fixtureReport(
    'stock-show-showcase-redline-installation',
    selectedArtifact,
    counterfactualArtifact,
    redlineMap.resolve(ISSUE528_PIXEL_COUNT),
    scoreTimesMs,
  ),
  generic: fixtureReport(
    'generic-five-surface-static-transform',
    genericSelected,
    genericCounterfactual,
    genericMap,
    [50, 100, 1_000, 15_000, 30_000, 59_950],
  ),
}

if (process.env.ISSUE528_REPORT || !process.env.VITEST) {
  const compact = (fixture: typeof report.redline) => ({
    fixture: fixture.fixture,
    selected: {
      sourceBytes: fixture.selected.sourceBytes,
      expandedSourceBytes: fixture.selected.expandedSourceBytes,
      selectedFieldCount: fixture.selected.coordinateFields.selectedFieldCount,
      operationsAvoidedPerCachedFrame: fixture.selected.coordinateFields.operationsAvoidedPerCachedFrame,
      cacheRebuildCountPerLoop: fixture.selected.coordinateFields.cacheRebuildCountPerLoop,
      additionalArrayWords: fixture.selected.coordinateFields.additionalArrayWords,
      totalVmWords: fixture.selected.resources.totalWords,
      persistentGlobals: fixture.selected.resources.persistentGlobals,
      fastMeanFrameMs: fixture.selected.fastMeanFrameMs,
      preciseMeanFrameMs: fixture.selected.preciseMeanFrameMs,
    },
    counterfactual: {
      sourceBytes: fixture.counterfactual.sourceBytes,
      expandedSourceBytes: fixture.counterfactual.expandedSourceBytes,
      totalVmWords: fixture.counterfactual.resources.totalWords,
      persistentGlobals: fixture.counterfactual.resources.persistentGlobals,
      fastMeanFrameMs: fixture.counterfactual.fastMeanFrameMs,
      preciseMeanFrameMs: fixture.counterfactual.preciseMeanFrameMs,
    },
    equivalence: fixture.equivalence,
  })
  console.log(JSON.stringify({
    pixelCount: report.pixelCount,
    scoreTimesMs: report.scoreTimesMs,
    redline: compact(report.redline),
    generic: compact(report.generic),
  }, null, 2))
}

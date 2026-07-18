// Five-Pattern acceptance Show qualification for issue #520.
// Run with: npm run issue520

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import {
  compileShow,
  type GeneratedShowArtifact,
  type ShowCompileOptions,
  type ShowRecipe,
  type ShowRoutedScenePlacementRecipe,
} from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import type { ShowClipEffect } from '../../src/engine/personalContentRecords'

export const ISSUE520_PIXEL_COUNT = 2_000
export const ISSUE520_DURATION_MS = 36_000
const zoneCount = 5
const zonePixelCount = ISSUE520_PIXEL_COUNT / zoneCount

const zones = Array.from({ length: zoneCount }, (_, index) => ({
  id: `surface-${index}`,
  name: `surface-${index}`,
  ranges: [{ start: index * zonePixelCount, end: (index + 1) * zonePixelCount - 1 }],
}))

const clipDefinitions = [
  ['compass', 'CompassRose'],
  ['test-grid', 'TestPattern2D'],
  ['heat-shimmer', 'HeatShimmerTiles'],
  ['signal-mandala', 'SignalMandala'],
  ['stained-glass', 'StainedGlassWeather'],
] as const

const effectsByClip: Record<string, ShowClipEffect[]> = {
  compass: [{ id: 'static-scale', kind: 'scale', x: 0.88, y: 0.88 }],
  'test-grid': [{ id: 'hue', kind: 'hue', turns: 0.08 }],
  'heat-shimmer': [{ id: 'contrast', kind: 'contrast', contrast: 1.08 }],
  'signal-mandala': [{ id: 'saturation', kind: 'saturation', saturation: 0.9 }],
  'stained-glass': [{ id: 'brightness', kind: 'brightness', brightness: 0.92 }],
}

const clips = clipDefinitions.map(([id, pattern]) => ({
  id,
  source: DEMOS[pattern],
  effects: effectsByClip[id],
}))

function scenePlacements(rotation: number): ShowRoutedScenePlacementRecipe[] {
  return zones.map((zone, zoneIndex) => {
    const [clipId] = clipDefinitions[(zoneIndex + rotation) % clipDefinitions.length]
    return {
      placementId: `scene-${rotation}-${zone.id}-${clipId}`,
      zoneName: zone.name,
      clipId,
      effects: effectsByClip[clipId],
    }
  })
}

function repeatedPlacements(clipId: string): ShowRoutedScenePlacementRecipe[] {
  return zones.map((zone) => ({
    placementId: `repeated-${zone.id}-${clipId}`,
    zoneName: zone.name,
    clipId,
    effects: effectsByClip[clipId],
  }))
}

function acceptanceRecipe(
  crossfadePolicy: 'live-live' | 'snapshot-live',
  firstHoldMs = 1_000,
): ShowRecipe {
  return {
    masterPixelCount: ISSUE520_PIXEL_COUNT,
    clips,
    zones,
    routingLayouts: [{ id: 'five-surfaces', name: 'Five equal surfaces', zones }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: firstHoldMs,
          placements: scenePlacements(0),
          transitionOut: { kind: 'crossfade', durationMs: 6_000, crossfadePolicy },
        },
        {
          holdMs: 7_000,
          placements: scenePlacements(1),
          transitionOut: {
            kind: 'dither',
            dissolveVariant: 'soft-threshold',
            durationMs: 6_000,
            seed: 520,
            scale: 9,
            softness: 0.14,
            edgePolicy: 'dither',
          },
        },
        {
          holdMs: 7_000,
          placements: repeatedPlacements('compass'),
          transitionOut: { kind: 'cut', durationMs: 0 },
        },
        {
          holdMs: 9_000,
          placements: scenePlacements(3),
        },
      ],
    },
    loopDurationMs: ISSUE520_DURATION_MS + firstHoldMs - 1_000,
  }
}

const baselineOptions: ShowCompileOptions = {
  exactSpecializations: false,
  frameInvariantHoisting: false,
  renderKernelSpecialization: false,
  renderTargetArenaEmission: false,
  motionTransitionSharing: 'none',
  patternOutputReuse: false,
  scalarFieldCaching: false,
}

const layerOptions: Array<{ id: string, options: ShowCompileOptions }> = [
  { id: 'baseline', options: baselineOptions },
  { id: 'exact-routing-capture', options: { ...baselineOptions, exactSpecializations: true } },
  {
    id: 'frame-invariants',
    options: { ...baselineOptions, exactSpecializations: true, frameInvariantHoisting: true },
  },
  {
    id: 'arena',
    options: {
      ...baselineOptions,
      exactSpecializations: true,
      frameInvariantHoisting: true,
      renderTargetArenaEmission: true,
    },
  },
  {
    id: 'shared-motion-kernels',
    options: {
      ...baselineOptions,
      exactSpecializations: true,
      frameInvariantHoisting: true,
      renderTargetArenaEmission: true,
      motionTransitionSharing: 'auto',
    },
  },
  {
    id: 'pattern-output-reuse',
    options: {
      ...baselineOptions,
      exactSpecializations: true,
      frameInvariantHoisting: true,
      renderTargetArenaEmission: true,
      motionTransitionSharing: 'auto',
      patternOutputReuse: true,
    },
  },
  {
    id: 'scalar-fields',
    options: {
      exactSpecializations: true,
      frameInvariantHoisting: true,
      renderKernelSpecialization: false,
      renderTargetArenaEmission: true,
      motionTransitionSharing: 'auto',
      patternOutputReuse: true,
      scalarFieldCaching: true,
    },
  },
]

const compile = (recipe: ShowRecipe, options: ShowCompileOptions): GeneratedShowArtifact => (
  compileShow(recipe, LIBRARIES, options)
)

const liveRecipe = acceptanceRecipe('live-live')
const snapshotRecipe = acceptanceRecipe('snapshot-live')
const layerArtifacts = layerOptions.map((layer) => ({
  ...layer,
  artifact: compile(liveRecipe, layer.options),
}))
const liveArtifact = layerArtifacts[layerArtifacts.length - 1].artifact
const selectedArtifact = compile(snapshotRecipe, layerOptions[layerOptions.length - 1].options)
const snapshotWithoutScalarArtifact = compile(snapshotRecipe, {
  ...layerOptions[layerOptions.length - 1].options,
  scalarFieldCaching: false,
})
const delayedSnapshotArtifact = compile(acceptanceRecipe('snapshot-live', 10_000), layerOptions[layerOptions.length - 1].options)

export const acceptanceArtifacts = {
  baseline: layerArtifacts[0].artifact,
  live: liveArtifact,
  selected: selectedArtifact,
  snapshotWithoutScalar: snapshotWithoutScalarArtifact,
  delayedSnapshot: delayedSnapshotArtifact,
  layers: layerArtifacts,
}

export const issue520MapPoints = Array.from({ length: ISSUE520_PIXEL_COUNT }, (_, index) => {
  const columns = 50
  const rows = ISSUE520_PIXEL_COUNT / columns
  return [(index % columns) / (columns - 1), Math.floor(index / columns) / (rows - 1)]
})

const scoreTimesMs = [250, 1_000, 3_500, 7_100, 14_100, 17_000, 20_100, 27_100, 35_500]

function runtime(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 2,
  }, {
    mapPoints: issue520MapPoints,
    randomSeed: 520,
    fidelity,
  })
}

function checksums(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  return scoreTimesMs.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

function meanFrameMs(artifact: GeneratedShowArtifact) {
  const replay = runtime(artifact, 'fast')
  replay.advanceTo(15_000, { stepMs: 250 })
  const samples: number[] = []
  for (let index = 0; index < 12; index += 1) {
    const started = performance.now()
    replay.advanceLive(1000 / 60)
    samples.push(performance.now() - started)
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

const determinism = (['fast', 'fidelity'] as const).map((fidelity) => {
  const first = checksums(selectedArtifact, fidelity)
  const repeated = checksums(selectedArtifact, fidelity)
  return {
    fidelity,
    checksums: first,
    repeatMatches: repeated.every((checksum, index) => checksum === first[index]),
  }
})

const artifactReport = (artifact: GeneratedShowArtifact) => ({
  sourceBytes: artifact.summary.artifactBytes,
  expandedSourceBytes: artifact.summary.expandedArtifactBytes,
  artifactBudgetRatio: artifact.summary.artifactBudgetRatio,
  renderPolicy: artifact.summary.renderPolicy,
  steadyStateRenderersPerPixel: artifact.summary.steadyStateRenderersPerPixel,
  worstInstantRenderersPerPixel: artifact.summary.worstInstantRenderersPerPixel,
  resources: artifact.summary.resources,
  renderTarget: artifact.summary.renderTarget,
  renderTargetPlan: artifact.summary.renderTargetPlan,
  patternOutputReuse: artifact.summary.specializations.patternOutputReuse,
  scalarFields: artifact.summary.specializations.scalarFields,
})

export const report = {
  fixture: 'five-pattern-acceptance-show',
  pixelCount: ISSUE520_PIXEL_COUNT,
  durationMs: ISSUE520_DURATION_MS,
  patternCount: clipDefinitions.length,
  zoneCount,
  zonePixelCount,
  scoreTimesMs,
  protocol: {
    hardwareAuthority: 'Pixelblaze-reported FPS after reversible activation',
    measurementWindowMs: 6_000,
    visualReview: 'deterministic Fast/Precise boundary checksums plus human preview review',
    semanticRule: 'snapshot/live is compared separately and never described as exact live/live continuation',
  },
  layers: layerArtifacts.map((layer) => ({
    id: layer.id,
    rollbackAvailable: true,
    ...artifactReport(layer.artifact),
    fastMeanFrameMs: meanFrameMs(layer.artifact),
  })),
  selected: artifactReport(selectedArtifact),
  determinism,
  crossfadeReview: {
    live: artifactReport(liveArtifact),
    snapshot: artifactReport(selectedArtifact),
    visualPolicy: 'authored-difference',
    rollbackAvailable: true,
  },
  redline: {
    production: {
      fixture: 'stock-show-showcase-redline-installation',
      pixelCount: 2_000,
      exactReferenceFps: 3.037,
      snapshotLiveReferenceFps: 3.197,
    },
    stress: {
      fixture: 'historical-redline-4000',
      pixelCount: 4_000,
      support: 'unsupported-stress-only',
      historicalBaselineFps: 1.183,
      historicalCombinedFps: 1.502,
      historicalCoordinateCacheFps: 1.551,
    },
  },
}

if (process.env.ISSUE520_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))

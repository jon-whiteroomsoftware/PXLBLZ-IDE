// Scalar-field cache regression for issue #519.
// Run with: npm run issue519

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'

export const ISSUE519_PIXEL_COUNT = 2_000
const zoneCount = 5
const zonePixelCount = ISSUE519_PIXEL_COUNT / zoneCount
const zones = Array.from({ length: zoneCount }, (_, index) => ({
  id: `surface-${index}`,
  name: `surface-${index}`,
  ranges: [{ start: index * zonePixelCount, end: (index + 1) * zonePixelCount - 1 }],
}))

const fromSource = `
export function render2D(index, x, y) {
  var pulse = wave(time(0.04) + x * 2)
  rgb(pulse * (1 - y), 0.03, 0.02)
}
`
const toSource = `
export function render2D(index, x, y) {
  var pulse = wave(time(0.035) - y * 2)
  rgb(0.02, pulse * x, pulse * (1 - x))
}
`
const placements = (clipId: string) => zones.map((zone, index) => ({
  placementId: `${clipId}-${index}`,
  zoneName: zone.name,
  clipId,
}))

export const issue519Recipe: ShowRecipe = {
  masterPixelCount: ISSUE519_PIXEL_COUNT,
  clips: [
    { id: 'redline-a', source: fromSource },
    { id: 'redline-b', source: toSource },
  ],
  zones,
  routingLayouts: [{ id: 'stage', name: 'Five-surface stage', zones }],
  routedSceneSequence: {
    scenes: [
      {
        holdMs: 100,
        placements: placements('redline-a'),
        transitionOut: {
          kind: 'dither',
          dissolveVariant: 'soft-threshold',
          durationMs: 59_800,
          seed: 7,
          scale: 8,
          softness: 0.15,
          edgePolicy: 'blend',
        },
      },
      { holdMs: 100, placements: placements('redline-b') },
    ],
  },
  loopDurationMs: 60_000,
}

export const selectedArtifact = compileShow(issue519Recipe, {})
export const counterfactualArtifact = compileShow(issue519Recipe, {}, { scalarFieldCaching: false })

const columns = 50
const rows = ISSUE519_PIXEL_COUNT / columns
const mapPoints = Array.from({ length: ISSUE519_PIXEL_COUNT }, (_, index) => (
  [(index % columns) / (columns - 1), Math.floor(index / columns) / (rows - 1)]
))
const scoreTimesMs = [150, 500, 2_000, 15_000, 30_000, 45_000, 59_500]

function runtime(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 2,
  }, {
    mapPoints,
    randomSeed: 519,
    fidelity,
  })
}

function checksums(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  return scoreTimesMs.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

function meanFrameMs(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  replay.advanceTo(10_000, { stepMs: 250 })
  const samples: number[] = []
  for (let index = 0; index < 24; index += 1) {
    const started = performance.now()
    replay.advanceLive(1000 / 60)
    samples.push(performance.now() - started)
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

const equivalence = (['fast', 'fidelity'] as const).map((fidelity) => {
  const selected = checksums(selectedArtifact, fidelity)
  const counterfactual = checksums(counterfactualArtifact, fidelity)
  return {
    fidelity,
    selected,
    counterfactual,
    matches: selected.every((checksum, index) => checksum === counterfactual[index]),
  }
})

export const report = {
  fixture: 'redline-derived-five-surface-scalar-field',
  pixelCount: ISSUE519_PIXEL_COUNT,
  zoneCount,
  zonePixelCount,
  scoreTimesMs,
  selected: {
    sourceBytes: selectedArtifact.summary.artifactBytes,
    expandedSourceBytes: selectedArtifact.summary.expandedArtifactBytes,
    renderTarget: selectedArtifact.summary.renderTarget,
    renderTargetPlan: selectedArtifact.summary.renderTargetPlan,
    scalarFields: selectedArtifact.summary.specializations.scalarFields,
    resources: selectedArtifact.summary.resources,
    fastMeanFrameMs: meanFrameMs(selectedArtifact, 'fast'),
    preciseMeanFrameMs: meanFrameMs(selectedArtifact, 'fidelity'),
  },
  counterfactual: {
    sourceBytes: counterfactualArtifact.summary.artifactBytes,
    expandedSourceBytes: counterfactualArtifact.summary.expandedArtifactBytes,
    renderTarget: counterfactualArtifact.summary.renderTarget,
    resources: counterfactualArtifact.summary.resources,
    fastMeanFrameMs: meanFrameMs(counterfactualArtifact, 'fast'),
    preciseMeanFrameMs: meanFrameMs(counterfactualArtifact, 'fidelity'),
  },
  equivalence,
}

if (process.env.ISSUE519_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))

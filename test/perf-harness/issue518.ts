// Compatible Pattern-output reuse regression for issue #518.
// Run with: npm run issue518

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'

export const ISSUE518_PIXEL_COUNT = 2_000
const zoneCount = 5
const zonePixelCount = ISSUE518_PIXEL_COUNT / zoneCount
const zones = Array.from({ length: zoneCount }, (_, index) => ({
  id: `surface-${index}`,
  name: `surface-${index}`,
  ranges: [{ start: index * zonePixelCount, end: (index + 1) * zonePixelCount - 1 }],
}))

const source = `
export function render(index) {
  var x = index / pixelCount
  var t = time(0.03)
  var a = sin((x + t) * 6.28318)
  var b = cos((x * 2 - t) * 6.28318)
  var c = wave(x * 3 + a * 0.15 + t)
  var d = sin((x * 5 + b * 0.1 - t) * 6.28318)
  var e = cos((x * 7 + c * 0.1 + t) * 6.28318)
  rgb(a * a * c, b * b * d * d, c * e * e)
}
`

const repeatedPlacements = zones.map((zone, index) => ({
  placementId: `copy-${index}`,
  zoneName: zone.name,
  clipId: 'shared-field',
}))

export const issue518Recipe: ShowRecipe = {
  masterPixelCount: ISSUE518_PIXEL_COUNT,
  clips: [{ id: 'shared-field', source }],
  zones,
  routingLayouts: [{ id: 'stage', name: 'Five equal surfaces', zones }],
  routedSceneSequence: {
    scenes: [
      {
        holdMs: 30_000,
        placements: repeatedPlacements,
        transitionOut: { kind: 'cut', durationMs: 0 },
      },
      { holdMs: 30_000, placements: repeatedPlacements },
    ],
  },
  loopDurationMs: 60_000,
}

export const selectedArtifact = compileShow(issue518Recipe, {})
export const counterfactualArtifact = compileShow(issue518Recipe, {}, { patternOutputReuse: false })

const mapPoints = Array.from({ length: ISSUE518_PIXEL_COUNT }, (_, index) => (
  [index / (ISSUE518_PIXEL_COUNT - 1)]
))
const scoreTimesMs = [0, 7_500, 15_000, 29_500, 30_500, 45_000, 59_500]

function runtime(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 1,
  }, {
    mapPoints,
    randomSeed: 518,
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
  fixture: 'five-surface-shared-pattern-output',
  pixelCount: ISSUE518_PIXEL_COUNT,
  zoneCount,
  zonePixelCount,
  scoreTimesMs,
  selected: {
    sourceBytes: selectedArtifact.summary.artifactBytes,
    expandedSourceBytes: selectedArtifact.summary.expandedArtifactBytes,
    renderTarget: selectedArtifact.summary.renderTarget,
    renderTargetPlan: selectedArtifact.summary.renderTargetPlan,
    outputReuse: selectedArtifact.summary.specializations.patternOutputReuse,
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

if (process.env.ISSUE518_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))

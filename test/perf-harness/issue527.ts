// Content-key composition regression for issue #527.
// Run with: npm run issue527

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'

export const ISSUE527_PIXEL_COUNT = 2_000
const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: ISSUE527_PIXEL_COUNT - 1 }] }]

const lowerSource = `
export function render(index) {
  var x = index / pixelCount
  var t = time(0.025)
  var a = sin((x * 3 + t) * 6.28318)
  var b = cos((x * 7 - t) * 6.28318)
  var c = wave(x * 11 + a * 0.13 + t)
  rgb(a * a * c, b * b * c, c)
}
`

const keyedSource = `
export function render(index) {
  var x = index / pixelCount
  var t = time(0.02)
  if (frac(x * 20 + t) < 0.1) {
    rgb(0, 0, 0)
  } else {
    var a = sin((x * 5 + t) * 6.28318)
    var b = cos((x * 9 - t) * 6.28318)
    var c = wave(x * 13 + a * 0.1 + t)
    rgb(0.2 + 0.8 * a * a, 0.2 + 0.8 * b * b, 0.2 + 0.8 * c)
  }
}
`

const placements = [
  { placementId: 'lower', zoneName: 'main', clipId: 'lower', stackOrder: 0 },
  { placementId: 'keyed-top', zoneName: 'main', clipId: 'keyed-top', stackOrder: 1 },
]

export const issue527Recipe: ShowRecipe = {
  masterPixelCount: ISSUE527_PIXEL_COUNT,
  clips: [
    { id: 'lower', source: lowerSource },
    {
      id: 'keyed-top',
      source: keyedSource,
      effects: [{ id: 'black-key', kind: 'luma-key', target: 0, tolerance: 0.02, softness: 0 }],
    },
  ],
  zones,
  routingLayouts: [{ id: 'stage', name: 'Keyed stage', zones }],
  routedSceneSequence: {
    scenes: [
      { holdMs: 30_000, placements, transitionOut: { kind: 'cut', durationMs: 0 } },
      { holdMs: 30_000, placements },
    ],
  },
  loopDurationMs: 60_000,
}

export const selectedArtifact = compileShow(issue527Recipe, {})
export const counterfactualArtifact = compileShow(issue527Recipe, {}, {
  contentKeyConditionalEvaluation: false,
})

const mapPoints = Array.from({ length: ISSUE527_PIXEL_COUNT }, (_, index) => (
  [index / (ISSUE527_PIXEL_COUNT - 1)]
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
    randomSeed: 527,
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
  fixture: 'mostly-opaque-black-key-overlay',
  pixelCount: ISSUE527_PIXEL_COUNT,
  expectedOpaqueFraction: 0.9,
  scoreTimesMs,
  selected: {
    sourceBytes: selectedArtifact.summary.artifactBytes,
    contentKeys: selectedArtifact.summary.specializations.contentKeys,
    effects: selectedArtifact.summary.cost.cpu.effects,
    resources: selectedArtifact.summary.resources,
    fastMeanFrameMs: meanFrameMs(selectedArtifact, 'fast'),
    preciseMeanFrameMs: meanFrameMs(selectedArtifact, 'fidelity'),
  },
  counterfactual: {
    sourceBytes: counterfactualArtifact.summary.artifactBytes,
    contentKeys: counterfactualArtifact.summary.specializations.contentKeys,
    resources: counterfactualArtifact.summary.resources,
    fastMeanFrameMs: meanFrameMs(counterfactualArtifact, 'fast'),
    preciseMeanFrameMs: meanFrameMs(counterfactualArtifact, 'fidelity'),
  },
  equivalence,
}

if (process.env.ISSUE527_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))

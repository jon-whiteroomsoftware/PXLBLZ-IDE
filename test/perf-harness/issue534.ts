// Multi-layer coverage-directed composition qualification for issue #534.

import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'

export const ISSUE534_PIXEL_COUNTS = [256, 1_000, 2_000] as const
export const ISSUE534_COVERAGES = [0, 0.25, 0.5, 0.9, 1] as const
export const ISSUE534_LAYER_COUNTS = [3, 5] as const

function patternSource(layer: number, coverage: number, bottom: boolean): string {
  const threshold = bottom ? 1 : coverage
  return `
export function render(index) {
  var x = index / pixelCount
  var t = time(${(0.011 + layer * 0.003).toFixed(3)})
  if (x < ${threshold}) {
    var a = sin((x * ${3 + layer * 2} + t) * 6.28318)
    var b = cos((x * ${7 + layer * 2} - t) * 6.28318)
    var c = wave(x * ${11 + layer * 2} + a * 0.13 + t)
    rgb(0.1 + 0.9 * a * a, 0.1 + 0.9 * b * b, 0.1 + 0.9 * c)
  } else {
    rgb(0, 0, 0)
  }
}
`
}

export function buildIssue534Recipe(
  pixelCount: number,
  layerCount: 3 | 5,
  coverage: number,
): ShowRecipe {
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: pixelCount - 1 }] }]
  const clips: ShowRecipe['clips'] = Array.from({ length: layerCount }, (_, layer) => ({
    id: `layer-${layer}`,
    source: patternSource(layer, coverage, layer === 0),
    ...(layer === 0 ? {} : {
      effects: [{
        id: `black-key-${layer}`,
        kind: 'luma-key' as const,
        target: 0,
        tolerance: 0,
        softness: 0,
      }],
    }),
  }))
  const placements = clips.map((clip, stackOrder) => ({
    placementId: clip.id,
    zoneName: 'main',
    clipId: clip.id,
    stackOrder,
  }))
  return {
    masterPixelCount: pixelCount,
    clips,
    zones,
    routingLayouts: [{ id: 'stage', name: 'Coverage stage', zones }],
    routedSceneSequence: {
      scenes: [
        { holdMs: 30_000, placements, transitionOut: { kind: 'cut', durationMs: 0 } },
        { holdMs: 30_000, placements },
      ],
    },
    loopDurationMs: 60_000,
  }
}

export function buildIssue534Artifacts(
  pixelCount: number,
  layerCount: 3 | 5,
  coverage: number,
) {
  const recipe = buildIssue534Recipe(pixelCount, layerCount, coverage)
  return {
    selected: compileShow(recipe, {}),
    counterfactual: compileShow(recipe, {}, { coverageDirectedComposition: false }),
  }
}

function checksums(
  artifact: GeneratedShowArtifact,
  pixelCount: number,
  fidelity: 'fast' | 'fidelity',
): number[] {
  const replay = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 1,
  }, {
    mapPoints: Array.from({ length: pixelCount }, (_, index) => [index / Math.max(1, pixelCount - 1)]),
    randomSeed: 534,
    fidelity,
  })
  return [0, 10_000, 29_500, 30_500, 59_500].map((timeMs) => (
    replay.advanceTo(timeMs, { stepMs: 500 }).checksum
  ))
}

function artifactResources(artifact: GeneratedShowArtifact) {
  return {
    artifactBytes: artifact.summary.artifactBytes,
    expandedBytes: Buffer.byteLength(artifact.expandedCode),
    persistentGlobals: artifact.summary.resources.persistentGlobals,
    memberPatternWords: artifact.summary.resources.memberPatternWords,
    renderTargetWords: artifact.summary.resources.renderTargetWords,
    contentKeys: artifact.summary.specializations.contentKeys,
  }
}

export const issue534Cases = ISSUE534_LAYER_COUNTS.flatMap((layerCount) => (
  ISSUE534_COVERAGES.map((coverage) => {
    const pixelCount = 2_000
    const { selected, counterfactual } = buildIssue534Artifacts(pixelCount, layerCount, coverage)
    const equivalence = (['fast', 'fidelity'] as const).map((fidelity) => {
      const selectedChecksums = checksums(selected, pixelCount, fidelity)
      const counterfactualChecksums = checksums(counterfactual, pixelCount, fidelity)
      return {
        fidelity,
        matches: selectedChecksums.every((checksum, index) => checksum === counterfactualChecksums[index]),
        selected: selectedChecksums,
        counterfactual: counterfactualChecksums,
      }
    })
    return {
      layerCount,
      coverage,
      expectedRendererEvaluationsPerPixel: layerCount === 3 ? 3 - 2 * coverage : 5,
      selected: artifactResources(selected),
      counterfactual: artifactResources(counterfactual),
      equivalence,
    }
  })
))

export const report = {
  pixelCount: 2_000,
  coverages: ISSUE534_COVERAGES,
  layerCounts: ISSUE534_LAYER_COUNTS,
  cases: issue534Cases,
}

if (process.env.ISSUE534_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))

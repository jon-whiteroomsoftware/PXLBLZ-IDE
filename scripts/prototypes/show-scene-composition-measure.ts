import { fileURLToPath } from 'node:url'
import { compileShow, type ShowRecipe } from '../../src/engine/showCompiler.ts'
import { createPrototypeState } from './show-scene-composition-model.ts'

const PROTECTED_WRITE_LIMIT_BYTES = 1_900_000

export interface NeonOrchardSpikeMeasurement {
  fixture: 'Neon orchard'
  candidateDocumentBytes: number
  protectedWriteLimitBytes: number
  protectedWriteRatio: number
  sceneCount: number
  patternInstanceCount: number
  placementCount: number
  keyframeCount: number
  exactCompositionCompilableByCurrentFlatCompiler: false
  generatedCostProxy: {
    meaning: 'two-active-source lower bound; overlays and local cuts are not yet lowerable'
    clipCount: number
    artifactBytes: number
    sourceBytesBeforeMerge: number
    artifactBudgetRatio: number
    renderPolicy: string
    transitionCost: string
  }
}

export function measureNeonOrchardCompositionSpike(): NeonOrchardSpikeMeasurement {
  const candidate = createPrototypeState()
  const candidateDocumentBytes = new TextEncoder().encode(JSON.stringify(candidate)).byteLength
  const artifact = compileShow(neonOrchardLowerBoundRecipe(), {})
  return {
    fixture: 'Neon orchard',
    candidateDocumentBytes,
    protectedWriteLimitBytes: PROTECTED_WRITE_LIMIT_BYTES,
    protectedWriteRatio: candidateDocumentBytes / PROTECTED_WRITE_LIMIT_BYTES,
    sceneCount: candidate.scenes.length,
    patternInstanceCount: candidate.instances.length,
    placementCount: candidate.scenes.reduce((sum, scene) => sum + scene.placements.length, 0),
    keyframeCount: candidate.scenes.reduce((sum, scene) => (
      sum + scene.animations.reduce((sceneSum, track) => sceneSum + track.keyframes.length, 0)
    ), 0),
    exactCompositionCompilableByCurrentFlatCompiler: false,
    generatedCostProxy: {
      meaning: 'two-active-source lower bound; overlays and local cuts are not yet lowerable',
      clipCount: artifact.summary.clipCount,
      artifactBytes: artifact.summary.artifactBytes,
      sourceBytesBeforeMerge: artifact.summary.sourceBytesBeforeMerge,
      artifactBudgetRatio: artifact.summary.artifactBudgetRatio,
      renderPolicy: artifact.summary.renderPolicy,
      transitionCost: artifact.summary.transitionCost,
    },
  }
}

function neonOrchardLowerBoundRecipe(): ShowRecipe {
  const source = `var t; export function beforeRender(delta) { t = delta / 1000 } export function render(index) { hsv(t + index / 60, 1, 1) }`
  return {
    clips: [
      {
        id: 'instance-orchard',
        source,
        effects: [
          { id: 'base-hue', kind: 'hue', turns: 0.15 },
          { id: 'base-contrast', kind: 'contrast', contrast: 0.8 },
        ],
      },
      {
        id: 'instance-overlay',
        source,
        effects: [
          { id: 'overlay-translate', kind: 'translate', x: 0.1, y: -0.08 },
          { id: 'overlay-opacity', kind: 'opacity', opacity: 0.65 },
        ],
      },
    ],
    crossfade: { startMs: 180, durationMs: 1_220 },
    zones: [{ id: 'all', name: 'all', ranges: [{ start: 0, end: 59 }] }],
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(measureNeonOrchardCompositionSpike(), null, 2))
}

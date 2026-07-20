// Shared routed motion-transition regression for issue #525.
// Run with: npm run issue525

import { performance } from 'node:perf_hooks'
import { compilerVintageOptions } from '../../src/engine/showCompilerVintages'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { nativeDimension } from '../../src/engine/loadPattern'
import { compileShowForPreview } from '../../src/engine/showPreviewArtifact'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'

const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-motion-transitions')
if (!fixture) throw new Error('Motion Transitions reference Show is missing.')

const compile = (motionTransitionSharing: 'none' | 'structure' | 'exact') => {
  const compiled = compileShowForPreview(fixture.show, [], undefined, {}, {
    stageDimension: 2,
    motionTransitionSharing,
    ...compilerVintageOptions('issue-525-motion-census'),
  })
  if (!compiled.artifact) throw new Error(compiled.error ?? 'Motion Transitions did not compile.')
  return compiled.artifact
}

export const baselineArtifact = compile('none')
export const structuralArtifact = compile('structure')
export const selectedArtifact = compile('exact')

const transitionByScene = new Map((fixture.show.transitions ?? []).map((transition) => [transition.afterSceneId, transition]))
let cursorMs = 0
export const scoreTimesMs = fixture.show.scenes.flatMap((scene) => {
  cursorMs += scene.durationMs
  const transition = transitionByScene.get(scene.id)
  if (!transition || transition.durationMs <= 0) return []
  const startMs = cursorMs
  cursorMs += transition.durationMs
  return [startMs + 1, startMs + transition.durationMs / 2, cursorMs - 1]
})
const mapPoints = Array.from({ length: 256 }, (_, index) => ({
  sample: [(index % 16) / 15, Math.floor(index / 16) / 15],
}))

function runtime(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 525, fidelity })
}

function scoreChecksums(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  return scoreTimesMs.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 100 }).checksum)
}

function meanFrameMs(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  replay.advanceTo(scoreTimesMs[Math.floor(scoreTimesMs.length / 2)], { stepMs: 250 })
  const samples: number[] = []
  for (let index = 0; index < 24; index += 1) {
    const started = performance.now()
    replay.advanceLive(1000 / 60)
    samples.push(performance.now() - started)
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

const artifacts = {
  baseline: baselineArtifact,
  structural: structuralArtifact,
  selected: selectedArtifact,
}
const equivalence = (['fast', 'fidelity'] as const).map((fidelity) => {
  const baselineChecksums = scoreChecksums(baselineArtifact, fidelity)
  return {
    fidelity,
    baselineChecksums,
    structuralMatches: scoreChecksums(structuralArtifact, fidelity).every((checksum, index) => checksum === baselineChecksums[index]),
    selectedMatches: scoreChecksums(selectedArtifact, fidelity).every((checksum, index) => checksum === baselineChecksums[index]),
  }
})

export const report = {
  fixture: fixture.id,
  sceneCount: fixture.show.scenes.length,
  boundaryCount: fixture.show.transitions?.length ?? 0,
  scoreTimesMs,
  representations: Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, {
    sourceBytes: artifact.summary.artifactBytes,
    expandedSourceBytes: artifact.summary.expandedArtifactBytes,
    resources: artifact.summary.resources,
    motionTransitions: artifact.summary.specializations.motionTransitions,
    fastMeanFrameMs: meanFrameMs(artifact, 'fast'),
    preciseMeanFrameMs: meanFrameMs(artifact, 'fidelity'),
  }])),
  equivalence,
}

if (process.env.ISSUE525_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))

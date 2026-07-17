// Snapshot/live crossfade regression for issue #516.
// Run with: npm run issue516

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { nativeDimension } from '../../src/engine/loadPattern'
import { compileShow, type GeneratedShowArtifact } from '../../src/engine/showCompiler'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'

const pixelCount = 2_000
const scoreTimesMs = [100, 2_000, 30_000, 59_000]

const compile = (crossfadePolicy: 'live-live' | 'snapshot-live') => compileShow({
  masterPixelCount: pixelCount,
  clips: [
    {
      id: 'redline-outgoing',
      source: DEMOS.RedlineMachine,
      controlTargets: { sliderIntensity: 1, sliderSpeed: 0.5, sliderCyan: 1 },
    },
    {
      id: 'redline-incoming',
      source: DEMOS.RedlineMachine,
      adaptation: { phase: 0.25 },
      controlTargets: { sliderIntensity: 1, sliderSpeed: 0.5, sliderCyan: 1 },
    },
  ],
  crossfade: { startMs: 0, durationMs: 60_000, crossfadePolicy },
}, {})

export const liveArtifact = compile('live-live')
export const snapshotArtifact = compile('snapshot-live')

const mapPoints = Array.from({ length: pixelCount }, (_, index) => ({
  sample: [(index % 50) / 49, Math.floor(index / 50) / 39],
}))

function runtime(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 516, fidelity })
}

function checksums(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  return scoreTimesMs.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 100 }).checksum)
}

function meanTransitionFrameMs(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  replay.advanceTo(2_000, { stepMs: 100 })
  const samples: number[] = []
  for (let index = 0; index < 12; index += 1) {
    const started = performance.now()
    replay.advanceLive(1000 / 60)
    samples.push(performance.now() - started)
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

const artifacts = { live: liveArtifact, snapshot: snapshotArtifact }

export const report = {
  fixture: 'paired-redline-machine-crossfade',
  pixelCount,
  scoreTimesMs,
  candidates: Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, {
    sourceBytes: artifact.summary.artifactBytes,
    expandedSourceBytes: artifact.summary.expandedArtifactBytes,
    renderPolicy: artifact.summary.renderPolicy,
    renderTarget: artifact.summary.renderTarget,
    resources: artifact.summary.resources,
    fastMeanTransitionFrameMs: meanTransitionFrameMs(artifact, 'fast'),
    preciseMeanTransitionFrameMs: meanTransitionFrameMs(artifact, 'fidelity'),
  }])),
  deterministicReplay: (['fast', 'fidelity'] as const).map((fidelity) => {
    const live = checksums(liveArtifact, fidelity)
    const snapshot = checksums(snapshotArtifact, fidelity)
    return {
      fidelity,
      live,
      snapshot,
      liveRepeatMatches: checksums(liveArtifact, fidelity).every((checksum, index) => checksum === live[index]),
      snapshotRepeatMatches: checksums(snapshotArtifact, fidelity).every((checksum, index) => checksum === snapshot[index]),
    }
  }),
}

if (process.env.ISSUE516_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))

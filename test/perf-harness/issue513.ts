// Frame-invariant and render-kernel specialization regression for issue #513.
// Run with: npm run issue513

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { nativeDimension } from '../../src/engine/loadPattern'
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { compileShowForPreview } from '../../src/engine/showPreviewArtifact'
import { compilerVintageOptions } from '../../src/engine/showCompilerVintages'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import { SOURCE_STOCK_MAPS } from '../../src/pixelblaze/stock/maps/stockCatalogue'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'

const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')
if (!fixture) throw new Error('Redline Installation fixture is missing.')
const map = SOURCE_STOCK_MAPS.find((candidate) => candidate.id === 'redline-stage-2d')
if (!map) throw new Error('Redline Stage map is missing.')

const compile = (frameInvariantHoisting: boolean, renderKernelSpecialization: boolean) => {
  const compiled = compileShowForPreview(
    fixture.show,
    [],
    installationPhysicalZones(fixture.show),
    {},
    {
      stageDimension: 2,
      exactSpecializations: true,
      frameInvariantHoisting,
      renderKernelSpecialization,
      ...compilerVintageOptions('issue-513-frame-invariant-plan'),
    },
  )
  if (!compiled.artifact) throw new Error(compiled.error ?? 'Redline Show did not compile.')
  return compiled.artifact
}

export const selectedArtifact = compile(true, false)
export const counterfactualArtifact = compile(false, false)
export const combinedArtifact = compile(true, true)
export const kernelOnlyArtifact = compile(false, true)
const mapPoints = map.resolve(2_000)
const scoreTimesMs = [0, 7_500, 15_000, 22_500, 30_000, 37_500, 45_000, 52_500, 59_500]

function runtime(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, {
    mapPoints,
    randomSeed: 513,
    fidelity,
  })
}

function scoreChecksums(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  return scoreTimesMs.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

function meanFrameMs(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  replay.advanceTo(30_000, { stepMs: 250 })
  const samples: number[] = []
  for (let index = 0; index < 24; index += 1) {
    const started = performance.now()
    replay.advanceLive(1000 / 60)
    samples.push(performance.now() - started)
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

const equivalence = (['fast', 'fidelity'] as const).map((fidelity) => {
  const selectedChecksums = scoreChecksums(selectedArtifact, fidelity)
  const counterfactualChecksums = scoreChecksums(counterfactualArtifact, fidelity)
  return {
    fidelity,
    selectedChecksums,
    counterfactualChecksums,
    matches: selectedChecksums.every((checksum, index) => checksum === counterfactualChecksums[index]),
  }
})

export const report = {
  fixture: fixture.id,
  pixelCount: mapPoints.length,
  scoreTimesMs,
  selected: {
    sourceBytes: selectedArtifact.summary.artifactBytes,
    expandedSourceBytes: selectedArtifact.summary.expandedArtifactBytes,
    frameInvariants: selectedArtifact.summary.specializations.frameInvariants,
    renderKernels: selectedArtifact.summary.specializations.renderKernels,
    kernelCandidate: combinedArtifact.summary.specializations.renderKernels,
    fastMeanFrameMs: meanFrameMs(selectedArtifact, 'fast'),
    preciseMeanFrameMs: meanFrameMs(selectedArtifact, 'fidelity'),
  },
  counterfactual: {
    sourceBytes: counterfactualArtifact.summary.artifactBytes,
    expandedSourceBytes: counterfactualArtifact.summary.expandedArtifactBytes,
    fastMeanFrameMs: meanFrameMs(counterfactualArtifact, 'fast'),
    preciseMeanFrameMs: meanFrameMs(counterfactualArtifact, 'fidelity'),
  },
  equivalence,
}

if (process.env.ISSUE513_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))
